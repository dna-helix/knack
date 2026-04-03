"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Question } from './types';
import { checkAnswer } from './answerChecker';
import { useUserStats } from './useUserStats';

export type SessionStatus = 'idle' | 'reading' | 'paused' | 'answering' | 'prompting' | 'finished';

export interface SessionMetrics {
  questionsAnswered: number;
  powers: number;
  tens: number;
  negs: number;
  missedNoAnswer: number;
}

export function useQuizSession(questions: Question[], initialIndex: number = 0, onIndexChange?: (idx: number) => void) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(initialIndex);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [charIndex, setCharIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [lastResult, setLastResult] = useState<'power' | 'ten' | 'neg' | 'none' | null>(null);
  const [promptMessage, setPromptMessage] = useState('');
  const [sessionMetrics, setSessionMetrics] = useState<SessionMetrics>({
    questionsAnswered: 0, powers: 0, tens: 0, negs: 0, missedNoAnswer: 0,
  });
  
  // Track if we've already counted this question as "seen" in global stats
  const hasRecordedSeenRef = useRef(false);
  const [isEstimatedReading, setIsEstimatedReading] = useState(false);

  const { recordQuestion } = useUserStats();
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const keepAliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const charIndexRef = useRef(0);
  const statusRef = useRef<SessionStatus>('idle');
  const isEstimatedReadingRef = useRef(false);
  const progressRef = useRef<{
    chunkIndex: number;
    baseCharIndex: number;
    chunkEnd: number;
    startedAt: number;
    estimatedDurationMs: number;
    lastBoundaryAt: number | null;
  } | null>(null);

  const currentQuestion = questions[currentQuestionIndex];

  useEffect(() => {
    charIndexRef.current = charIndex;
  }, [charIndex]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    isEstimatedReadingRef.current = isEstimatedReading;
  }, [isEstimatedReading]);

  // ── Chunking Logic for Mobile Reliability ──
  const questionChunks = useMemo(() => {
    if (!currentQuestion) return [];
    // Split by sentence boundaries (periods, question marks, exclamation points followed by whitespace)
    const sentenceRegex = /[^.?!]+[.?!]+(?:\s+|$)|[^.?!]+(?:\s+|$)/g;
    const matches = Array.from(currentQuestion.question.matchAll(sentenceRegex));
    
    return matches.map(match => ({
      text: match[0],
      start: match.index!,
      end: match.index! + match[0].length
    }));
  }, [currentQuestion]);

  const clearSpeechTimers = useCallback(() => {
    if (keepAliveTimerRef.current) {
      clearInterval(keepAliveTimerRef.current);
      keepAliveTimerRef.current = null;
    }
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    progressRef.current = null;
  }, []);

  const updateCharIndex = useCallback((nextIndex: number) => {
    if (!currentQuestion) return;
    const clamped = Math.max(0, Math.min(nextIndex, currentQuestion.question.length));
    charIndexRef.current = clamped;
    setCharIndex(prev => (prev === clamped ? prev : clamped));
  }, [currentQuestion]);

  const estimateUtteranceDurationMs = useCallback((text: string, rate: number) => {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const punctuationPauses = (text.match(/[,:;()]/g) || []).length * 120;
    const sentencePauses = (text.match(/[.?!]/g) || []).length * 220;
    const normalizedRate = Math.max(rate || 1, 0.6);

    return Math.max(500, ((words * 340) + punctuationPauses + sentencePauses) / normalizedRate);
  }, []);

  const startProgressTracking = useCallback((chunkIndex: number, baseCharIndex: number, chunkEnd: number, estimatedDurationMs: number) => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
    }

    progressRef.current = {
      chunkIndex,
      baseCharIndex,
      chunkEnd,
      startedAt: Date.now(),
      estimatedDurationMs,
      lastBoundaryAt: null,
    };

    progressTimerRef.current = setInterval(() => {
      const progress = progressRef.current;
      if (!progress || statusRef.current !== 'reading') return;

      const now = Date.now();
      const elapsed = now - progress.startedAt;
      const timeSinceBoundary = progress.lastBoundaryAt === null ? Infinity : now - progress.lastBoundaryAt;
      const shouldEstimate = elapsed > 250 && timeSinceBoundary > 450;

      if (!shouldEstimate) {
        if (isEstimatedReadingRef.current) {
          isEstimatedReadingRef.current = false;
          setIsEstimatedReading(false);
        }
        return;
      }

      if (!isEstimatedReadingRef.current) {
        isEstimatedReadingRef.current = true;
        setIsEstimatedReading(true);
      }

      const progressRatio = Math.min(1, elapsed / progress.estimatedDurationMs);
      const estimatedIndex = progress.baseCharIndex + Math.floor((progress.chunkEnd - progress.baseCharIndex) * progressRatio);

      if (estimatedIndex > charIndexRef.current) {
        updateCharIndex(estimatedIndex);
      }
    }, 50);
  }, [updateCharIndex]);

  const stopActiveSpeech = useCallback(() => {
    clearSpeechTimers();
    isEstimatedReadingRef.current = false;
    setIsEstimatedReading(false);
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
  }, [clearSpeechTimers]);

  useEffect(() => {
    return () => { stopActiveSpeech(); }
  }, [stopActiveSpeech]);

  const beginSpeakingFrom = useCallback((startingCharIndex: number) => {
    if (!currentQuestion || !questionChunks.length) return;

    const currentChunkIndex = questionChunks.findIndex(c => c.end > startingCharIndex);
    if (currentChunkIndex === -1) {
      if (!hasRecordedSeenRef.current) {
        recordQuestion('none', 0, currentQuestion.category, true);
        hasRecordedSeenRef.current = true;
      }
      setStatus('finished');
      return;
    }

    const speakChunk = (chunkIndex: number, startIndex: number) => {
      const chunk = questionChunks[chunkIndex];
      if (!chunk) {
        setStatus('answering');
        return;
      }

      const offsetInChunk = Math.max(0, startIndex - chunk.start);
      const textToSpeak = chunk.text.substring(offsetInChunk);

      if (!textToSpeak.trim()) {
        updateCharIndex(chunk.end);
        speakChunk(chunkIndex + 1, chunk.end);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utteranceRef.current = utterance;
      const baseCharIndex = Math.max(startIndex, chunk.start);
      const estimatedDurationMs = estimateUtteranceDurationMs(textToSpeak, utterance.rate);

      utterance.onboundary = (event) => {
        progressRef.current = progressRef.current
          ? { ...progressRef.current, lastBoundaryAt: Date.now() }
          : progressRef.current;

        isEstimatedReadingRef.current = false;
        setIsEstimatedReading(false);

        if (event.name === 'word') {
          updateCharIndex(baseCharIndex + event.charIndex + 1);
        }
      };

      // @ts-expect-error: Garbage collection prevention
      window._activeUtterances = window._activeUtterances || [];
      // @ts-expect-error: Garbage collection prevention
      window._activeUtterances.push(utterance);

      utterance.onstart = () => {
        startProgressTracking(chunkIndex, baseCharIndex, chunk.end, estimatedDurationMs);

        keepAliveTimerRef.current = setInterval(() => {
          if (typeof window !== 'undefined' && window.speechSynthesis.speaking) {
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
          }
        }, 10000);
      };

      utterance.onend = () => {
        if (utteranceRef.current !== utterance) return;

        clearSpeechTimers();
        updateCharIndex(chunk.end);

        if (chunkIndex < questionChunks.length - 1) {
          speakChunk(chunkIndex + 1, chunk.end);
          return;
        }

        utteranceRef.current = null;
        setStatus('answering');
      };

      utterance.onerror = (e) => {
        if (utteranceRef.current !== utterance) return;

        clearSpeechTimers();

        if (e.error !== 'canceled') {
          console.warn("Speech synthesis error:", e);
          updateCharIndex(chunk.end);

          if (chunkIndex < questionChunks.length - 1) {
            speakChunk(chunkIndex + 1, chunk.end);
          } else {
            utteranceRef.current = null;
            setStatus('answering');
          }
        }
      };

      setStatus('reading');
      if (typeof window !== 'undefined') {
        window.speechSynthesis.resume();
        window.speechSynthesis.speak(utterance);
      }
    };

    speakChunk(currentChunkIndex, startingCharIndex);
  }, [currentQuestion, questionChunks, recordQuestion, updateCharIndex, estimateUtteranceDurationMs, startProgressTracking, clearSpeechTimers]);

  const startReading = useCallback(() => {
    if (!currentQuestion || !questionChunks.length) return;
    if (status === 'finished') return;

    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

    if (status === 'paused' && synth && utteranceRef.current) {
      const activeProgress = progressRef.current;

      if (activeProgress) {
        const remainingText = currentQuestion.question.slice(charIndexRef.current, activeProgress.chunkEnd);
        startProgressTracking(
          activeProgress.chunkIndex,
          charIndexRef.current,
          activeProgress.chunkEnd,
          estimateUtteranceDurationMs(remainingText, utteranceRef.current.rate),
        );
      }

      setStatus('reading');
      synth.resume();

      window.setTimeout(() => {
        if (statusRef.current !== 'reading') return;
        if (synth.speaking || synth.pending) return;

        stopActiveSpeech();
        beginSpeakingFrom(charIndexRef.current);
      }, 150);

      return;
    }

    stopActiveSpeech();
    beginSpeakingFrom(charIndexRef.current);
  }, [currentQuestion, questionChunks, status, stopActiveSpeech, beginSpeakingFrom, startProgressTracking, estimateUtteranceDurationMs]);

  const pauseReading = useCallback(() => {
    clearSpeechTimers();
    isEstimatedReadingRef.current = false;
    setIsEstimatedReading(false);

    if (typeof window !== 'undefined' && window.speechSynthesis && utteranceRef.current) {
      window.speechSynthesis.pause();
    }

    setStatus('paused');
  }, [clearSpeechTimers]);

  const buzz = useCallback(() => {
    stopActiveSpeech();
    setStatus('answering');
  }, [stopActiveSpeech]);

  const submitAnswer = useCallback((userAnswer: string) => {
    const result = checkAnswer(userAnswer, currentQuestion.answer);
    
    if (result.needsPrompt) {
      setPromptMessage(result.promptMessage);
      setStatus('prompting');
      return 'prompt' as const;
    }
    
    const isNewForGlobal = !hasRecordedSeenRef.current;
    if (isNewForGlobal) hasRecordedSeenRef.current = true;

    if (result.isCorrect) {
      const wordsSpoken = currentQuestion.question.substring(0, charIndex).trim().split(/\s+/).length;
      const isPower = wordsSpoken <= currentQuestion.power_index;
      const points = isPower ? 15 : 10;
      setScore(s => s + points);
      setStatus('finished');
      updateCharIndex(currentQuestion.question.length);
      setLastResult(isPower ? 'power' : 'ten');
      
      recordQuestion(isPower ? 'power' : 'ten', points, currentQuestion.category, isNewForGlobal);
      
      setSessionMetrics(m => ({
        ...m,
        questionsAnswered: m.questionsAnswered + 1,
        powers: m.powers + (isPower ? 1 : 0),
        tens: m.tens + (isPower ? 0 : 1),
      }));
      return 'correct' as const;
    } else {
      const isEarly = charIndex < currentQuestion.question.length - 15;
      if (isEarly && status !== 'finished' && status !== 'prompting') {
        setScore(s => s - 5);
        setLastResult('neg');
        recordQuestion('neg', -5, currentQuestion.category, isNewForGlobal);
        setStatus('idle');
        setSessionMetrics(m => ({ ...m, negs: m.negs + 1 }));
      } else {
        setStatus('finished');
        updateCharIndex(currentQuestion.question.length);
        setLastResult('none');
        recordQuestion('none', 0, currentQuestion.category, isNewForGlobal);
        setSessionMetrics(m => ({
          ...m,
          questionsAnswered: m.questionsAnswered + 1,
          missedNoAnswer: m.missedNoAnswer + 1,
        }));
      }
      return 'incorrect' as const;
    }
  }, [currentQuestion, charIndex, status, recordQuestion, updateCharIndex]);

  const nextQuestion = useCallback(() => {
    if (currentQuestionIndex < questions.length - 1) {
      const nextIdx = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIdx);
      updateCharIndex(0);
      setStatus('idle');
      setLastResult(null);
      setPromptMessage('');
      hasRecordedSeenRef.current = false;
      setIsEstimatedReading(false);
      stopActiveSpeech();
      if (onIndexChange) onIndexChange(nextIdx);
    } else {
      if (onIndexChange) onIndexChange(0);
    }
  }, [currentQuestionIndex, questions.length, stopActiveSpeech, onIndexChange, updateCharIndex]);

  return {
    currentQuestion,
    charIndex,
    status,
    score,
    lastResult,
    promptMessage,
    sessionMetrics,
    currentQuestionIndex,
    totalQuestions: questions.length,
    startReading,
    pauseReading,
    buzz,
    submitAnswer,
    nextQuestion,
    stopActiveSpeech,
  };
}
