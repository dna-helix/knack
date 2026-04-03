"use client";

import { useQuizSession, SessionStatus } from "@/lib/useQuizSession";
import { useState, useEffect, useRef, Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from 'next/navigation';
import { Question } from "@/lib/types";
import { useUserStats } from "@/lib/useUserStats";

export default function QuizPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center font-headline text-2xl">Loading practice session layout...</div>}>
      <QuizLoader />
    </Suspense>
  );
}

function QuizLoader() {
  const searchParams = useSearchParams();
  const packId = searchParams.get('pack') || 'qbreader_set';
  const startParam = parseInt(searchParams.get('start') || '0', 10);
  const shouldShuffle = searchParams.get('shuffle') === '1';
  const [questions, setQuestions] = useState<Question[] | null>(null);

  useEffect(() => {
    import(`@/data/sets/${packId}.json`)
      .then(module => {
        const qs = [...module.default];
        if (shouldShuffle) {
          for (let i = qs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [qs[i], qs[j]] = [qs[j], qs[i]];
          }
        }
        setQuestions(qs);
      })
      .catch(e => {
         console.error(e);
         import(`@/data/sets/qbreader_set.json`).then(m => setQuestions(m.default));
      });
  }, [packId, shouldShuffle]);

  if (!questions) {
      return <div className="p-12 mt-20 text-center font-headline text-xl animate-pulse text-on-surface-variant">Loading packet: {packId}...</div>;
  }

  return <QuizPageContent questions={questions} packId={packId} initialIndex={startParam} />;
}

// ── Optimized Question Display Component ──
interface QuestionDisplayProps {
  question: string;
  charIndex: number;
  status: SessionStatus;
  powerIndex: number;
}

function QuestionDisplay({ question, charIndex, status, powerIndex }: QuestionDisplayProps) {
  const words = useMemo(() => {
    const results = [];
    const wordRegex = /\S+/g;
    let match;
    let index = 0;
    while ((match = wordRegex.exec(question)) !== null) {
      results.push({
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
        isPower: index < powerIndex,
      });
      index++;
    }
    return results;
  }, [question, powerIndex]);

  return (
    <p className="font-headline text-xl md:text-4xl leading-relaxed text-primary-container italic opacity-90 mb-8 whitespace-pre-wrap">
      &quot;
      {words.map((word, i) => {
        const isVisible = status === 'finished' || charIndex > word.start;
        
        // In 'finished' state, we show power words in bold/underline
        const showBold = word.isPower && status === 'finished';
        
        return (
          <span 
            key={i} 
            className={`transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
          >
            {showBold ? (
              <strong className="font-extrabold underline decoration-primary/30 underline-offset-4">{word.text}</strong>
            ) : (
              word.text
            )}
            {" "}
          </span>
        );
      })}
      &quot;
    </p>
  );
}

function QuizPageContent({ questions, packId, initialIndex }: { questions: Question[], packId: string, initialIndex: number }) {
  const { updatePackProgress } = useUserStats();
  const router = useRouter();
  const {
    currentQuestion,
    charIndex,
    status,
    score,
    lastResult,
    promptMessage,
    sessionMetrics,
    currentQuestionIndex,
    totalQuestions,
    startReading,
    pauseReading,
    buzz,
    submitAnswer,
    nextQuestion,
    stopActiveSpeech,
  } = useQuizSession(questions, initialIndex, (idx) => updatePackProgress(packId, idx));

  const [answerInput, setAnswerInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [feedback, setFeedback] = useState<{type: 'incorrect' | 'prompt', message: string} | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);
  const answerInputRef = useRef(answerInput);
  answerInputRef.current = answerInput;
  const submitAnswerRef = useRef(submitAnswer);
  submitAnswerRef.current = submitAnswer;

  // ── 10-second answer timer ──
  const ANSWER_TIME_LIMIT = 10;
  const [timeLeft, setTimeLeft] = useState(ANSWER_TIME_LIMIT);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status === 'answering' || status === 'prompting') {
      setTimeLeft(ANSWER_TIME_LIMIT);
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = null;
            const currentVal = answerInputRef.current;
            if (currentVal.trim()) {
              const result = submitAnswerRef.current(currentVal);
              if (result !== 'correct') {
                setFeedback({ type: 'incorrect', message: `Time's up! "${currentVal}" is incorrect.` });
              } else {
                setFeedback(null);
              }
            } else {
              setFeedback({ type: 'incorrect', message: "Time's up! No answer submitted." });
              submitAnswerRef.current('');
            }
            setAnswerInput('');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  // Focus input when answering or prompting
  useEffect(() => {
    if (status === 'answering' && inputRef.current) {
      inputRef.current.focus();
    }
    if (status === 'prompting' && promptInputRef.current) {
      promptInputRef.current.focus();
    }
    if (status === 'reading') {
      setFeedback(null);
    }
  }, [status]);

  useEffect(() => {
    setFeedback(null);
  }, [currentQuestionIndex]);

  if (!currentQuestion) return <div className="p-8">Loading...</div>;

  const handleAnswerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!answerInput.trim()) return;
    const result = submitAnswer(answerInput);
    if (result === 'incorrect') {
       setFeedback({ type: 'incorrect', message: `"${answerInput}" is incorrect.` });
    } else if (result === 'prompt') {
       setFeedback({ type: 'prompt', message: promptMessage });
    } else {
       setFeedback(null);
    }
    setAnswerInput("");
  };

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!answerInput.trim()) return;
    const result = submitAnswer(answerInput);
    if (result === 'incorrect') {
       setFeedback({ type: 'incorrect', message: `"${answerInput}" is incorrect.` });
    } else if (result === 'prompt') {
       setFeedback({ type: 'prompt', message: promptMessage });
    } else {
       setFeedback(null);
    }
    setAnswerInput("");
  };

  const handleExit = () => {
    stopActiveSpeech();
    router.push('/');
  };

  const startListening = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onstart = () => setIsListening(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setAnswerInput(transcript);
        const result = submitAnswer(transcript);
        if (result === 'incorrect') {
           setFeedback({ type: 'incorrect', message: `"${transcript}" is incorrect.` });
        } else if (result === 'prompt') {
           setFeedback({ type: 'prompt', message: promptMessage });
        } else {
           setFeedback(null);
        }
        setAnswerInput("");
        setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    
    recognition.start();
  };

  const getScoringMessage = () => {
    if (feedback?.type === 'incorrect') return feedback.message;
    if (lastResult === 'power') return 'POWER! ⚡ You buzzed in early and nailed it! +15 points.';
    if (lastResult === 'ten') return 'Excellent timing! You buzzed successfully. +10 points.';
    if (lastResult === 'none') return 'No correct answer was given.';
    return '';
  };

  const getScoringTitle = () => {
    if (feedback?.type === 'incorrect') return 'Incorrect';
    if (lastResult === 'power') return 'POWER!';
    if (lastResult === 'ten') return 'Correct';
    if (lastResult === 'none') return 'Missed';
    return 'Correct';
  };

  const isCorrectResult = lastResult === 'power' || lastResult === 'ten';

  const sessionAccuracy = sessionMetrics.questionsAnswered > 0
    ? Math.round(((sessionMetrics.powers + sessionMetrics.tens) / sessionMetrics.questionsAnswered) * 100)
    : 0;

  return (
    <>
      <header className="bg-slate-50 dark:bg-slate-900 flex justify-between items-center px-4 md:px-6 py-4 w-full fixed top-0 z-50">
        <button onClick={handleExit} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <span className="material-symbols-outlined text-blue-950 dark:text-blue-100">menu_book</span>
          <h1 className="font-headline font-medium text-2xl tracking-tight text-blue-950 dark:text-blue-100">Knack</h1>
        </button>
        <div className="flex items-center gap-4 md:gap-6">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Session Score</span>
            <span className="font-headline font-bold text-xl text-primary leading-none">{score}</span>
          </div>
          <div className="hidden md:block h-8 w-px bg-outline-variant/30"></div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Progress</span>
            <span className="font-headline font-bold text-xl text-primary leading-none">
              Q{currentQuestionIndex + 1} <span className="text-sm font-normal text-slate-400">/ {totalQuestions}</span>
            </span>
          </div>
          <span className="material-symbols-outlined text-blue-950 dark:text-blue-100 text-3xl">account_circle</span>
        </div>
      </header>

      <main className="flex-1 mt-20 mb-32 px-4 md:px-6 max-w-5xl mx-auto w-full flex flex-col relative">
        <div className="mt-8 mb-4 flex justify-between items-end">
          <div>
            <span className="inline-block px-3 py-1 bg-tertiary-fixed text-on-tertiary-container rounded-full text-[10px] font-bold uppercase tracking-widest mb-2">
              {currentQuestion.category}
            </span>
            <h2 className="font-headline text-2xl md:text-3xl font-medium tracking-tight text-primary">
              Question {currentQuestionIndex + 1}
            </h2>
          </div>
        </div>

        <section className="bg-surface-container-lowest rounded-xl p-6 md:p-12 shadow-sm flex-1 flex flex-col relative overflow-hidden transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/5 rounded-bl-full -mr-16 -mt-16 pointer-events-none"></div>
          
          <div className="flex-1">
            <QuestionDisplay 
              question={currentQuestion.question}
              charIndex={charIndex}
              status={status}
              powerIndex={currentQuestion.power_index}
            />
            
            {status === 'reading' && (
              <div className="flex items-center gap-4">
                <div className="h-1 w-8 md:w-12 bg-secondary rounded-full animate-pulse"></div>
                <span className="text-secondary font-bold text-xs md:text-sm uppercase tracking-widest animate-pulse">Reading in progress...</span>
              </div>
            )}
            {status === 'finished' && (
              <div className="mt-12 bg-surface-container-lowest rounded-xl p-8 mb-4 shadow-xl border border-outline-variant/20 animate-fade-in-up">
                <div className="flex flex-col md:flex-row gap-8 items-start mb-8">
                  <div className="flex-1">
                    <div className={`inline-flex items-center px-4 py-1.5 rounded-full font-bold text-xs mb-4 uppercase tracking-wide
                        ${!isCorrectResult && feedback?.type === 'incorrect' ? 'bg-error-container text-on-error-container' : lastResult === 'power' ? 'bg-secondary/20 text-secondary' : 'bg-tertiary-fixed text-on-tertiary-container'}`}>
                      <span className="material-symbols-outlined mr-2 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {!isCorrectResult && feedback?.type === 'incorrect' ? 'cancel' : lastResult === 'power' ? 'electric_bolt' : 'bolt'}
                      </span>
                      {lastResult === 'power' ? 'POWER BUZZ' : 'SCORING UPDATE'}
                    </div>
                    <h2 className={`font-headline text-3xl md:text-5xl font-medium tracking-tight mb-2 ${lastResult === 'power' ? 'text-secondary' : 'text-primary'}`}>
                      {getScoringTitle()}
                    </h2>
                    <p className="font-body text-on-surface-variant text-base md:text-lg max-w-md leading-relaxed">
                      {getScoringMessage()}
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-200/50 pt-8 flex flex-col md:flex-row md:items-center gap-8">
                  <div className="flex-grow">
                    <span className="font-body text-[10px] uppercase tracking-widest font-extrabold text-slate-400 block mb-2">The Correct Answer</span>
                    <div className="font-headline text-2xl font-bold italic text-primary" dangerouslySetInnerHTML={{ __html: currentQuestion.answer }} />
                  </div>
                </div>
              </div>
            )}
            
            {status === 'paused' && (
              <div className="flex items-center gap-4">
                <div className="h-1 w-8 md:w-12 bg-outline rounded-full"></div>
                <span className="text-outline font-bold text-xs md:text-sm uppercase tracking-widest">Paused</span>
              </div>
            )}
            {status !== 'finished' && status !== 'prompting' && feedback?.type === 'incorrect' && (
              <div className="mt-8 bg-error-container/30 rounded-xl p-8 mb-4 border border-error/30 animate-fade-in-up">
                <div className="flex flex-col md:flex-row gap-8 items-start">
                  <div className="flex-1">
                    <div className="inline-flex items-center px-4 py-1.5 rounded-full font-bold text-xs mb-4 uppercase tracking-wide bg-error-container text-on-error-container">
                      <span className="material-symbols-outlined mr-2 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>cancel</span>
                      SCORING UPDATE
                    </div>
                    <h2 className="font-headline text-3xl font-medium tracking-tight text-error mb-2">
                      Incorrect Miss (-5 pts)
                    </h2>
                    <p className="font-body text-on-surface-variant text-base">
                      {feedback.message} Since there is still question text remaining, you can resume reading or skip to the next question.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-12 flex flex-col md:flex-row items-center gap-4 md:gap-8">
            <div className="relative w-full md:w-2/3 group">
              <button 
                onClick={status === 'reading' ? buzz : startReading}
                disabled={status === 'finished' || status === 'prompting'}
                className={`w-full py-6 md:py-8 rounded-lg flex items-center justify-center gap-4 shadow-xl transition-all duration-150 transform active:scale-95 disabled:opacity-50 disabled:active:scale-100
                  ${status === 'reading' ? 'buzz-gradient shadow-primary/20 text-white' : 'bg-primary text-white hover:bg-primary/90'}`}
              >
                <span className="font-headline font-extrabold text-3xl md:text-5xl tracking-tighter">
                  {status === 'reading' ? 'BUZZ' : status === 'finished' ? 'DONE' : 'START'}
                </span>
                <span className="material-symbols-outlined text-3xl md:text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {status === 'reading' ? 'bolt' : status === 'finished' ? 'check_circle' : 'play_arrow'}
                </span>
              </button>
            </div>
            
            <div className="flex flex-row md:flex-col gap-4 w-full md:w-1/3">
              {(status === 'idle' || status === 'paused') && charIndex > 0 && (
                <button 
                  onClick={startReading}
                  className="flex-1 bg-surface-container-high hover:bg-surface-dim text-primary py-4 px-6 rounded-lg flex items-center justify-center gap-2 font-bold transition-colors"
                >
                  <span className="material-symbols-outlined">play_circle</span>
                  Resume Reading
                </button>
              )}
              {status === 'reading' && (
                  <button 
                      onClick={pauseReading}
                      className="flex-1 bg-surface-container-high hover:bg-surface-dim text-primary py-4 px-6 rounded-lg flex items-center justify-center gap-2 font-bold transition-colors"
                  >
                      <span className="material-symbols-outlined">pause_circle</span>
                      Pause
                  </button>
              )}
              {status !== 'answering' && status !== 'prompting' && (
                <button 
                  onClick={nextQuestion}
                  className="flex-1 border-2 border-primary text-primary hover:bg-primary/5 py-4 px-6 rounded-lg flex items-center justify-center gap-2 font-bold transition-all"
                >
                  <span className="material-symbols-outlined">arrow_forward</span>
                  Next Question
                </button>
              )}
              <button onClick={handleExit} className="flex-1 mt-auto border-2 border-outline-variant text-on-surface-variant hover:bg-surface-dim py-4 px-6 rounded-lg flex items-center justify-center gap-2 font-bold transition-all">
                <span className="material-symbols-outlined">exit_to_app</span>
                Save &amp; Exit
              </button>
            </div>
          </div>
        </section>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-surface-container rounded-lg p-4 flex flex-col items-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Points</span>
            <span className="font-headline text-2xl font-bold text-on-tertiary-container">{score > 0 ? `+${score}` : score}</span>
          </div>
          <div className="bg-surface-container rounded-lg p-4 flex flex-col items-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Answered</span>
            <span className="font-headline text-2xl font-bold">{sessionMetrics.questionsAnswered}</span>
          </div>
          <div className="bg-surface-container rounded-lg p-4 flex flex-col items-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Powers</span>
            <span className="font-headline text-2xl font-bold text-secondary">{sessionMetrics.powers}</span>
          </div>
          <div className="bg-surface-container rounded-lg p-4 flex flex-col items-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Negs</span>
            <span className="font-headline text-2xl font-bold text-error">{sessionMetrics.negs}</span>
          </div>
          <div className="bg-surface-container rounded-lg p-4 flex flex-col items-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Accuracy</span>
            <span className="font-headline text-2xl font-bold">{sessionAccuracy}%</span>
          </div>
        </div>
      </main>

      {status === 'answering' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface scale-up-center rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-primary px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-lg">Enter Answer</h3>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-headline font-bold text-lg ${timeLeft <= 3 ? 'border-red-400 text-red-300 animate-pulse' : 'border-white/50 text-white/80'}`}>
                  {timeLeft}
                </div>
                <span className="material-symbols-outlined w-6 h-6 flex justify-center items-center" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
              </div>
            </div>
            <div className="p-6 md:p-8 flex flex-col items-center gap-6">
               <form onSubmit={handleAnswerSubmit} className="w-full flex gap-2">
                 <input 
                   ref={inputRef}
                   type="text" 
                   value={answerInput}
                   onChange={e => setAnswerInput(e.target.value)}
                   placeholder="Type your answer..."
                   className="flex-1 p-4 border-2 border-outline-variant rounded-xl focus:border-primary focus:outline-none text-lg"
                 />
                 <button 
                    type="submit"
                    className="bg-primary text-white px-6 py-4 rounded-xl font-bold hover:bg-primary/90 transition-colors"
                 >
                   Submit
                 </button>
               </form>

               <div className="flex items-center w-full gap-4">
                 <div className="h-px bg-outline-variant flex-1"></div>
                 <span className="text-sm font-bold text-outline-variant uppercase tracking-widest">OR</span>
                 <div className="h-px bg-outline-variant flex-1"></div>
               </div>

               <button 
                  onClick={startListening}
                  className={`w-full flex items-center justify-center gap-3 px-6 py-5 rounded-xl font-bold transition-colors ${
                    isListening ? 'bg-red-600 text-white animate-pulse' : 'bg-red-100 text-red-900 border-2 border-red-200 hover:bg-red-200'
                  }`}
               >
                  <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
                  {isListening ? 'Listening...' : 'Speak Answer'}
               </button>
            </div>
          </div>
        </div>
      )}

      {status === 'prompting' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface scale-up-center rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-secondary px-6 py-4 flex justify-between items-center text-white">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>help</span>
                <h3 className="font-bold text-lg">Prompt</h3>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-headline font-bold text-lg ${timeLeft <= 3 ? 'border-red-400 text-red-300 animate-pulse' : 'border-white/50 text-white/80'}`}>
                  {timeLeft}
                </div>
              </div>
            </div>
            <div className="p-6 md:p-8 flex flex-col items-center gap-6">
              <div className="w-full bg-secondary/10 rounded-xl p-4 text-center">
                <p className="font-headline text-lg italic text-secondary">{promptMessage}</p>
              </div>
               <form onSubmit={handlePromptSubmit} className="w-full flex gap-2">
                 <input 
                   ref={promptInputRef}
                   type="text" 
                   value={answerInput}
                   onChange={e => setAnswerInput(e.target.value)}
                   placeholder="Be more specific..."
                   className="flex-1 p-4 border-2 border-secondary/30 rounded-xl focus:border-secondary focus:outline-none text-lg"
                 />
                 <button 
                    type="submit"
                    className="bg-secondary text-white px-6 py-4 rounded-xl font-bold hover:bg-secondary/90 transition-colors"
                 >
                   Submit
                 </button>
               </form>
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-0 -z-50 pointer-events-none opacity-40">
        <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-surface-container-low to-transparent"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/5 blur-[100px] rounded-full"></div>
      </div>
    </>
  );
}
