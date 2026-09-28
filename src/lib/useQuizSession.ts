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
  const charIndexRef = useRef(0); // Synchronous tracker to prevent loops
  
  const [score, setScore] = useState(0);
  const [lastResult, setLastResult] = useState<'power' | 'ten' | 'neg' | 'none' | null>(null);
  const [promptMessage, setPromptMessage] = useState('');
  const [sessionMetrics, setSessionMetrics] = useState<SessionMetrics>({
    questionsAnswered: 0, powers: 0, tens: 0, negs: 0, missedNoAnswer: 0,
  });
  
  const hasRecordedSeenRef = useRef(false);
  const [isEstimatedReading, setIsEstimatedReading] = useState(false);

  const { recordQuestion, startServerSession, endServerSession } = useUserStats();
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const currentQuestion = questions[currentQuestionIndex];

  // ── Sync internal ref with state ──
  const updateCharIndex = useCallback((newVal: number) => {
    charIndexRef.current = newVal;
    setCharIndex(newVal);
  }, []);

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

  const stopActiveSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
  }, []);

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
        recordQuestion('none', 0, currentQuestion.category, true);
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
      const wordsSpoken = currentQuestion.question.substring(0, charIndexRef.current).trim().split(/\s+/).length;
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
      const isEarly = charIndexRef.current < currentQuestion.question.length - 15;
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
  }, [currentQuestion, status, recordQuestion, updateCharIndex]);

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
