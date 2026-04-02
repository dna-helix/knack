"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
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

  const { recordQuestion } = useUserStats();
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const currentQuestion = questions[currentQuestionIndex];

  const stopActiveSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  useEffect(() => {
    return () => { stopActiveSpeech(); }
  }, [stopActiveSpeech]);

  const startReading = useCallback(() => {
    if (!currentQuestion) return;
    if (status === 'finished') return;
    
    stopActiveSpeech();
    
    const textToSpeak = currentQuestion.question.substring(charIndex);
    if (!textToSpeak.trim()) {
      // If reading finishes naturally, mark as seen if not already
      if (!hasRecordedSeenRef.current) {
        recordQuestion('none', 0, currentQuestion.category, true);
        hasRecordedSeenRef.current = true;
      }
      setStatus('finished');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utteranceRef.current = utterance;
    const baseCharIndex = charIndex;
    
    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        setCharIndex(baseCharIndex + event.charIndex);
      }
    };
    
    if (typeof window !== 'undefined') {
      // @ts-ignore
      window._activeUtterances = window._activeUtterances || [];
      // @ts-ignore
      window._activeUtterances.push(utterance);
    }
    
    let keepAliveTimer: any;
    utterance.onstart = () => {
      keepAliveTimer = setInterval(() => {
        if (typeof window !== 'undefined' && window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 14000);
    };
    
    utterance.onend = () => {
      clearInterval(keepAliveTimer);
      if (utteranceRef.current === utterance) {
        setCharIndex(currentQuestion.question.length);
        setStatus('answering');
      }
    };
    
    utterance.onerror = (e) => {
      clearInterval(keepAliveTimer);
      if (e.error !== 'canceled') {
        console.warn("Speech synthesis error:", e);
      }
    };

    setStatus('reading');
    window.speechSynthesis.speak(utterance);
  }, [currentQuestion, charIndex, status, stopActiveSpeech, recordQuestion]);

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
    
    // Handle prompts: if the answer needs a prompt, switch to prompting status
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
        // If they missed at the end, or missed a prompt
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
      hasRecordedSeenRef.current = false; // Reset for next question
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
  };
}
