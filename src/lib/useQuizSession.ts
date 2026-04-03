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

  const currentQuestion = questions[currentQuestionIndex];

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

  const stopActiveSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
  }, []);

  useEffect(() => {
    return () => { stopActiveSpeech(); }
  }, [stopActiveSpeech]);

  // Heartbeat for browsers that don't support onboundary (Mobile Brave/Chrome)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    if (status === 'reading') {
      const startTime = Date.now();
      const initialCharIndex = charIndex;
      
      interval = setInterval(() => {
        const now = Date.now();
        const elapsed = now - startTime;
        
        // Mobile fix: Lower delay from 1200ms to 400ms for faster "Estimated Reveal" takeover
        if (charIndex === initialCharIndex && elapsed > 400 && !isEstimatedReading) {
          setIsEstimatedReading(true);
        }
        
        if (isEstimatedReading) {
          // Average NAQT reading speed: ~18 chars per second
          // Using slightly adjusted multiplier to feel continuous across chunks
          const charsToReveal = initialCharIndex + Math.floor(elapsed / 55); 
          if (charsToReveal > charIndex) {
            setCharIndex(Math.min(charsToReveal, currentQuestion.question.length));
          }
        }
      }, 150);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status, isEstimatedReading, charIndex, currentQuestion?.question.length]);

  const startReading = useCallback(() => {
    if (!currentQuestion || !questionChunks.length) return;
    if (status === 'finished') return;
    
    stopActiveSpeech();
    setIsEstimatedReading(false);
    
    // Find the first chunk that hasn't been fully read yet
    const currentChunkIndex = questionChunks.findIndex(c => c.end > charIndex);
    if (currentChunkIndex === -1) {
      if (!hasRecordedSeenRef.current) {
        recordQuestion('none', 0, currentQuestion.category, true);
        hasRecordedSeenRef.current = true;
      }
      setStatus('finished');
      return;
    }

    const chunk = questionChunks[currentChunkIndex];
    const offsetInChunk = Math.max(0, charIndex - chunk.start);
    const textToSpeak = chunk.text.substring(offsetInChunk);

    if (!textToSpeak.trim()) {
       // Move to next chunk if this one is empty/done
       setCharIndex(chunk.end);
       setTimeout(startReading, 0); // Recurse to next chunk
       return;
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utteranceRef.current = utterance;
    const baseCharIndex = charIndex;
    
    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        setIsEstimatedReading(false);
        setCharIndex(baseCharIndex + event.charIndex);
      }
    };
    
    // @ts-expect-error: Garbage collection prevention
    window._activeUtterances = window._activeUtterances || [];
    // @ts-expect-error: Garbage collection prevention
    window._activeUtterances.push(utterance);
    
    let keepAliveTimer: ReturnType<typeof setInterval>;
    utterance.onstart = () => {
      keepAliveTimer = setInterval(() => {
        if (typeof window !== 'undefined' && window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10000); // More aggressive keep-alive
    };
    
    utterance.onend = () => {
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      if (utteranceRef.current === utterance) {
        setCharIndex(chunk.end);
        // If there are more chunks, start the next one. Otherwise, finish.
        if (currentChunkIndex < questionChunks.length - 1) {
            startReading();
        } else {
            setStatus('answering');
        }
      }
    };
    
    utterance.onerror = (e) => {
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      if (e.error !== 'canceled') {
        console.warn("Speech synthesis error:", e);
        // On error, try to skip to next chunk if it wasn't a manual cancel
        setCharIndex(chunk.end);
        startReading();
      }
    };

    setStatus('reading');
    if (typeof window !== 'undefined') {
        window.speechSynthesis.resume();
        window.speechSynthesis.speak(utterance);
    }
  }, [currentQuestion, questionChunks, charIndex, status, stopActiveSpeech, recordQuestion]);

  const pauseReading = useCallback(() => {
    stopActiveSpeech();
    setStatus('paused');
  }, [stopActiveSpeech]);

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
      setCharIndex(currentQuestion.question.length);
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
        setCharIndex(currentQuestion.question.length);
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
  }, [currentQuestion, charIndex, status, recordQuestion]);

  const nextQuestion = useCallback(() => {
    if (currentQuestionIndex < questions.length - 1) {
      const nextIdx = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIdx);
      setCharIndex(0);
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
  }, [currentQuestionIndex, questions.length, stopActiveSpeech, onIndexChange]);

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
