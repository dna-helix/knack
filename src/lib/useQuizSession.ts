"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Question } from './types';
import { checkAnswer } from './answerChecker';
import { useUserStats } from './useUserStats';
import { countWordsRevealed, getEffectivePowerWordIndex } from './powerIndex';

export type SessionStatus = 'idle' | 'reading' | 'paused' | 'answering' | 'prompting' | 'finished';

export interface SessionMetrics {
  questionsAnswered: number;
  correctAnswers: number;
  wrongAnswers: number;
  unanswered: number;
  powers: number;
  tens: number;
  negs: number;
  missedNoAnswer: number;
  currentStreak: number;
  bestStreak: number;
}

const MIN_SPEECH_RATE = 0.7;
const MAX_SPEECH_RATE = 1.3;
const SPEECH_RATE_STEP = 0.1;
const MIN_SPEECH_VOLUME = 0.2;
const MAX_SPEECH_VOLUME = 1;
const SPEECH_VOLUME_STEP = 0.1;

export function useQuizSession(questions: Question[], initialIndex: number = 0, onIndexChange?: (idx: number) => void) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(initialIndex);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [charIndex, setCharIndex] = useState(0);
  const charIndexRef = useRef(0); // Synchronous tracker to prevent loops

  const [score, setScore] = useState(0);
  const [lastResult, setLastResult] = useState<'power' | 'ten' | 'neg' | 'none' | 'unanswered' | null>(null);
  const [promptMessage, setPromptMessage] = useState('');
  const [speechRate, setSpeechRate] = useState(1);
  const [speechVolume, setSpeechVolume] = useState(1);
  const [sessionMetrics, setSessionMetrics] = useState<SessionMetrics>({
    questionsAnswered: 0, correctAnswers: 0, wrongAnswers: 0, unanswered: 0,
    powers: 0, tens: 0, negs: 0, missedNoAnswer: 0, currentStreak: 0, bestStreak: 0,
  });

  const hasRecordedSeenRef = useRef(false);
  const [isEstimatedReading, setIsEstimatedReading] = useState(false);

  const { recordQuestion, startServerSession, endServerSession } = useUserStats();
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const keepAliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<SessionStatus>('idle');
  const isEstimatedReadingRef = useRef(false);
  const promptedScoringRef = useRef<{ result: 'power' | 'ten'; points: 10 | 15 } | null>(null);
  const speechRateRef = useRef(1);
  const speechVolumeRef = useRef(1);
  const progressRef = useRef<{
    chunkIndex: number;
    baseCharIndex: number;
    chunkEnd: number;
    startedAt: number;
    estimatedDurationMs: number;
    lastBoundaryAt: number | null;
  } | null>(null);

  const currentQuestion = questions[currentQuestionIndex];



  const questionChunks = useMemo(() => {
    if (!currentQuestion) return [];
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

  // Heartbeat for browsers that don't support onboundary
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (status === 'reading') {
      const startTime = Date.now();
      const initialCharIndex = charIndexRef.current;

      interval = setInterval(() => {
        const now = Date.now();
        const elapsed = now - startTime;

        if (charIndexRef.current === initialCharIndex && elapsed > 400 && !isEstimatedReading) {
          setIsEstimatedReading(true);
        }

        if (isEstimatedReading) {
          const charsToReveal = initialCharIndex + Math.floor(elapsed / 55);
          if (charsToReveal > charIndexRef.current) {
            updateCharIndex(Math.min(charsToReveal, currentQuestion.question.length));
          }
        }
      }, 150);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status, isEstimatedReading, updateCharIndex, currentQuestion?.question.length]);

  const startReading = useCallback(() => {
    if (!currentQuestion || !questionChunks.length) return;
    if (status === 'finished') return;

    // If we're already reading, don't start another loop
    // But if we're resuming from idle/paused, we proceed
    stopActiveSpeech();
    setIsEstimatedReading(false);

    const currentIndex = charIndexRef.current;
    const currentChunkIndex = questionChunks.findIndex(c => c.end > currentIndex);

    if (currentChunkIndex === -1) {
      if (!hasRecordedSeenRef.current) {
        recordQuestion('none', 0, currentQuestion.category, true, currentQuestion);
        hasRecordedSeenRef.current = true;
      }
      setStatus('finished');
      return;
    }

    const chunk = questionChunks[currentChunkIndex];
    const offsetInChunk = Math.max(0, currentIndex - chunk.start);
    const textToSpeak = chunk.text.substring(offsetInChunk);

    if (!textToSpeak.trim()) {
      updateCharIndex(chunk.end);
      setTimeout(startReading, 0);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utteranceRef.current = utterance;
    const baseCharIndexSnapshot = currentIndex;

    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        setIsEstimatedReading(false);
        updateCharIndex(baseCharIndexSnapshot + event.charIndex);
      }
    };

    // @ts-expect-error collection prevention
    window._activeUtterances = window._activeUtterances || [];
    // @ts-expect-error collection prevention
    window._activeUtterances.push(utterance);

    let keepAliveTimer: ReturnType<typeof setInterval>;
    utterance.onstart = () => {
      setStatus('reading');
      keepAliveTimer = setInterval(() => {
        if (typeof window !== 'undefined' && window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10000);
    };

    utterance.onend = () => {
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      // ONLY trigger the next chunk if we're still in 'reading' mode.
      // If the user clicked Pause or Buzz, utteranceRef.current will be null/different.
      if (utteranceRef.current === utterance) {
        updateCharIndex(chunk.end);
        if (currentChunkIndex < questionChunks.length - 1) {
          startReading();
        } else {
          setStatus('answering');
        }
      }
    };

    utterance.onerror = (e) => {
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      if (e.error !== 'canceled' && utteranceRef.current === utterance) {
        console.warn("Speech synthesis error:", e.error);
        updateCharIndex(chunk.end);
        startReading();
      }
    };

    if (typeof window !== 'undefined') {
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
    }
  }, [currentQuestion, questionChunks, status, stopActiveSpeech, recordQuestion, updateCharIndex]);

  const pauseReading = useCallback(() => {
    setStatus('paused');
    stopActiveSpeech(); // This will trigger onend/onerror, but status is now 'paused'
  }, [stopActiveSpeech]);

  const buzz = useCallback(() => {
    setStatus('answering');
    stopActiveSpeech();
  }, [stopActiveSpeech]);

// End the current question without an answer (mark as unanswered)
const endQuestion = useCallback(() => {
  if (!currentQuestion) return;
  // Stop any ongoing speech
  stopActiveSpeech();
  // Mark as finished and reveal full question
  setStatus('finished');
  updateCharIndex(currentQuestion.question.length);
  // Record as unanswered
  setLastResult('none');
  promptedScoringRef.current = null;
  if (!hasRecordedSeenRef.current) {
    recordQuestion('none', 0, currentQuestion.category, true, currentQuestion);
    hasRecordedSeenRef.current = true;
  } else {
    recordQuestion('none', 0, currentQuestion.category, false, currentQuestion);
  }
  // Update session metrics for an unanswered question
  setSessionMetrics(m => ({
    ...m,
    questionsAnswered: m.questionsAnswered + 1,
    wrongAnswers: m.wrongAnswers + 1,
    missedNoAnswer: m.missedNoAnswer + 1,
    currentStreak: 0,
  }));
}, [currentQuestion, recordQuestion, updateCharIndex, stopActiveSpeech]);

  const submitAnswer = useCallback((userAnswer: string) => {
    const result = checkAnswer(userAnswer, currentQuestion.answer);
    const wordsSpoken = countWordsRevealed(currentQuestion.question, charIndex);
    const effectivePowerWordIndex = getEffectivePowerWordIndex(currentQuestion.question, currentQuestion.power_index);
    const currentBuzzResult =
      effectivePowerWordIndex > 0 && wordsSpoken <= effectivePowerWordIndex ? 'power' : 'ten';
    const currentBuzzPoints: 10 | 15 = currentBuzzResult === 'power' ? 15 : 10;

    if (result.needsPrompt) {
      promptedScoringRef.current = {
        result: currentBuzzResult,
        points: currentBuzzPoints,
      };
      setPromptMessage(result.promptMessage);
      setStatus('prompting');
      return 'prompt' as const;
    }

    const isNewForGlobal = !hasRecordedSeenRef.current;
    if (isNewForGlobal) hasRecordedSeenRef.current = true;

    if (result.isCorrect) {
      const wordsSpoken = currentQuestion.question.substring(0, charIndexRef.current).trim().split(/\s+/).length;
      const isPower = wordsSpoken <= currentQuestion.power_index;
      const points = isPower ? 15 : 10;
      setScore(s => s + points);
      setStatus('finished');
      updateCharIndex(currentQuestion.question.length);
      setLastResult(isPower ? 'power' : 'ten');

      recordQuestion(isPower ? 'power' : 'ten', points, currentQuestion.category, isNewForGlobal, currentQuestion);

      setSessionMetrics(m => ({
        ...m,
        questionsAnswered: m.questionsAnswered + 1,
        correctAnswers: m.correctAnswers + 1,
        powers: m.powers + (isPower ? 1 : 0),
        tens: m.tens + (isPower ? 0 : 1),
        currentStreak: m.currentStreak + 1,
        bestStreak: Math.max(m.bestStreak, m.currentStreak + 1),
      }));
      return 'correct' as const;
    } else {
      const isEarly = charIndexRef.current < currentQuestion.question.length - 15;
      if (isEarly && status !== 'finished' && status !== 'prompting') {
        setScore(s => s - 5);
        setLastResult('neg');
        recordQuestion('neg', -5, currentQuestion.category, isNewForGlobal, currentQuestion);
        setStatus('idle');
        setSessionMetrics(m => ({
          ...m,
          wrongAnswers: m.wrongAnswers + 1,
          negs: m.negs + 1,
          currentStreak: 0,
        }));
      } else {
        setStatus('finished');
        updateCharIndex(currentQuestion.question.length);
        setLastResult('none');
        promptedScoringRef.current = null;
        recordQuestion('none', 0, currentQuestion.category, isNewForGlobal, currentQuestion);
        setSessionMetrics(m => ({
          ...m,
          questionsAnswered: m.questionsAnswered + 1,
          wrongAnswers: m.wrongAnswers + 1,
          missedNoAnswer: m.missedNoAnswer + 1,
          currentStreak: 0,
        }));
      }
      return 'incorrect' as const;
    }
  }, [currentQuestion, status, recordQuestion, updateCharIndex]);

  const retryQuestion = useCallback(() => {
    updateCharIndex(0);
    setStatus('idle');
    setLastResult(null);
    setPromptMessage('');
    promptedScoringRef.current = null;
    hasRecordedSeenRef.current = false;
    setIsEstimatedReading(false);
    stopActiveSpeech();
  }, [updateCharIndex, stopActiveSpeech]);

  const nextQuestion = useCallback(() => {
    if (currentQuestionIndex < questions.length - 1) {
      const nextIdx = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIdx);
      updateCharIndex(0);
      setStatus('idle');
      setLastResult(null);
      setPromptMessage('');
      promptedScoringRef.current = null;
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
    speechRate,
    speechVolume,
    sessionMetrics,
    currentQuestionIndex,
    totalQuestions: questions.length,
    startReading,
    pauseReading,
    buzz,
    endQuestion,
    retryQuestion,
    submitAnswer,
    nextQuestion,
    stopActiveSpeech,
  };
}
