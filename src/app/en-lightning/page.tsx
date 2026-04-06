"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Question } from "@/lib/types";
import { useUserStats } from "@/lib/useUserStats";

type LightningStatus = "idle" | "reading" | "finished";
type LightningOutcome = "success" | "missed" | "false_start" | null;

interface PreparedRound {
  question: Question;
  spokenText: string;
  buzzCharIndex: number;
}

const PACK_LOADERS = [
  () => import("@/data/sets/science_core.json"),
  () => import("@/data/sets/history_essentials.json"),
  () => import("@/data/sets/literature_classics.json"),
  () => import("@/data/sets/mixed_general.json"),
  () => import("@/data/sets/mixed_advanced.json"),
];

function prepareLightningPrompt(question: Question): PreparedRound {
  const tokens = question.question.replace(/\s+/g, " ").trim().match(/\S+/g) || [];
  if (tokens.length === 0) {
    return { question, spokenText: "BUZZ", buzzCharIndex: 0 };
  }

  const minInsertIndex = Math.min(5, tokens.length);
  const maxInsertIndex = Math.max(minInsertIndex, tokens.length - 1);
  const insertIndex =
    minInsertIndex >= maxInsertIndex
      ? minInsertIndex
      : minInsertIndex + Math.floor(Math.random() * ((maxInsertIndex - minInsertIndex) + 1));

  const spokenTokens = [...tokens];
  spokenTokens.splice(insertIndex, 0, "BUZZ");
  const spokenText = spokenTokens.join(" ");
  const buzzCharIndex = spokenTokens.slice(0, insertIndex).join(" ").length + (insertIndex > 0 ? 1 : 0);

  return { question, spokenText, buzzCharIndex };
}

function LightningPageContent() {
  const router = useRouter();
  const { stats, recordLightningRound } = useUserStats();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [status, setStatus] = useState<LightningStatus>("idle");
  const [round, setRound] = useState<PreparedRound | null>(null);
  const [sessionRounds, setSessionRounds] = useState(0);
  const [sessionBestReactionMs, setSessionBestReactionMs] = useState<number | null>(null);
  const [sessionReactionTotalMs, setSessionReactionTotalMs] = useState(0);
  const [sessionSuccessfulBuzzes, setSessionSuccessfulBuzzes] = useState(0);
  const [sessionMissedBuzzes, setSessionMissedBuzzes] = useState(0);
  const [sessionFalseStarts, setSessionFalseStarts] = useState(0);
  const [lastReactionMs, setLastReactionMs] = useState<number | null>(null);
  const [instruction, setInstruction] = useState("Press start and listen for BUZZ.");
  const [speechRate, setSpeechRate] = useState(1);
  const [speechVolume, setSpeechVolume] = useState(1);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const buzzStartTimeRef = useRef<number | null>(null);
  const hasBuzzStartedRef = useRef(false);
  const hasBuzzedRef = useRef(false);
  const previousQuestionIndexRef = useRef<number | null>(null);
  const statusRef = useRef<LightningStatus>("idle");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    let isMounted = true;

    Promise.allSettled(PACK_LOADERS.map(loader => loader()))
      .then(results => {
        if (!isMounted) return;
        const loadedQuestions = results.flatMap(result => (
          result.status === "fulfilled" ? result.value.default : []
        ));
        setQuestions(loadedQuestions);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const stopSpeech = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, [stopSpeech]);

  const lifetimeAverageReactionMs = useMemo(() => {
    if (!stats?.lightningSuccessfulBuzzes) return null;
    return Math.round(stats.lightningTotalReactionMs / stats.lightningSuccessfulBuzzes);
  }, [stats]);

  const sessionAverageReactionMs = sessionSuccessfulBuzzes > 0
    ? Math.round(sessionReactionTotalMs / sessionSuccessfulBuzzes)
    : null;

  const finalizeRound = useCallback((outcome: LightningOutcome, reactionMs?: number) => {
    stopSpeech();
    setStatus("finished");

    if (outcome) {
      setSessionRounds(current => current + 1);
    }

    if (outcome === "success" && typeof reactionMs === "number") {
      const roundedReaction = Math.max(0, Math.round(reactionMs));
      setLastReactionMs(roundedReaction);
      setSessionSuccessfulBuzzes(current => current + 1);
      setSessionReactionTotalMs(current => current + roundedReaction);
      setSessionBestReactionMs(current => current === null ? roundedReaction : Math.min(current, roundedReaction));
      setInstruction(`Reaction time: ${roundedReaction} ms.`);
      recordLightningRound("success", roundedReaction);
      return;
    }

    setLastReactionMs(null);

    if (outcome === "missed") {
      setSessionMissedBuzzes(current => current + 1);
      setInstruction("Missed the BUZZ cue. Start the next round.");
      recordLightningRound("missed");
      return;
    }

    if (outcome === "false_start") {
      setSessionFalseStarts(current => current + 1);
      setInstruction("False start. Wait until you hear BUZZ.");
      recordLightningRound("false_start");
      return;
    }

    setInstruction("Press start and listen for BUZZ.");
  }, [recordLightningRound, stopSpeech]);

  const startRound = useCallback(() => {
    if (!questions?.length) return;

    let nextQuestionIndex = Math.floor(Math.random() * questions.length);
    if (questions.length > 1 && previousQuestionIndexRef.current === nextQuestionIndex) {
      nextQuestionIndex = (nextQuestionIndex + 1) % questions.length;
    }
    previousQuestionIndexRef.current = nextQuestionIndex;

    const preparedRound = prepareLightningPrompt(questions[nextQuestionIndex]);
    setRound(preparedRound);
    setStatus("reading");
    setLastReactionMs(null);
    setInstruction("Listen carefully. Buzz as soon as you hear BUZZ.");

    buzzStartTimeRef.current = null;
    hasBuzzStartedRef.current = false;
    hasBuzzedRef.current = false;

    stopSpeech();

    const utterance = new SpeechSynthesisUtterance(preparedRound.spokenText);
    utterance.rate = speechRate;
    utterance.volume = speechVolume;
    utteranceRef.current = utterance;

    utterance.onboundary = (event) => {
      if (hasBuzzStartedRef.current) return;
      if (event.charIndex < preparedRound.buzzCharIndex) return;

      hasBuzzStartedRef.current = true;
      buzzStartTimeRef.current = performance.now();
    };

    utterance.onend = () => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null;

      if (!hasBuzzedRef.current) {
        finalizeRound("missed");
      }
    };

    utterance.onerror = () => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null;

      if (!hasBuzzedRef.current) {
        setStatus("finished");
        setInstruction("Speech playback failed. Start the next round.");
      }
    };

    if (typeof window !== "undefined") {
      window.speechSynthesis.speak(utterance);
    }
  }, [finalizeRound, questions, speechRate, speechVolume, stopSpeech]);

  const triggerBuzz = useCallback(() => {
    if (statusRef.current === "idle" || statusRef.current === "finished") {
      startRound();
      return;
    }

    if (statusRef.current !== "reading" || hasBuzzedRef.current) return;

    hasBuzzedRef.current = true;

    if (buzzStartTimeRef.current === null) {
      finalizeRound("false_start");
      return;
    }

    const reactionMs = performance.now() - buzzStartTimeRef.current;
    finalizeRound("success", reactionMs);
  }, [finalizeRound, startRound]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isEditable =
        target?.isContentEditable ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        target?.getAttribute("role") === "textbox";

      if (isEditable) return;

      event.preventDefault();
      triggerBuzz();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [triggerBuzz]);

  if (!questions) {
    return <div className="p-12 mt-20 text-center font-headline text-xl animate-pulse text-on-surface-variant">Loading en-lightning round...</div>;
  }

  return (
    <>
      <header className="bg-slate-50 dark:bg-slate-900 flex justify-between items-center px-4 md:px-6 py-4 w-full fixed top-0 z-50">
        <button onClick={() => router.push("/")} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <span className="material-symbols-outlined text-blue-950 dark:text-blue-100">menu_book</span>
          <h1 className="font-headline font-medium text-2xl tracking-tight text-blue-950 dark:text-blue-100">Knack</h1>
        </button>
        <div className="flex items-center gap-4 md:gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Mode</span>
            <span className="font-headline font-bold text-xl text-primary leading-none">en-lightning round</span>
          </div>
        </div>
      </header>

      <main className="flex-1 mt-20 mb-24 px-4 md:px-6 max-w-6xl mx-auto w-full">
        <section className="mt-8 bg-surface-container-lowest rounded-xl p-6 md:p-10 shadow-sm border border-outline-variant/10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div>
              <span className="inline-block px-3 py-1 bg-tertiary-fixed text-on-tertiary-container rounded-full text-[10px] font-bold uppercase tracking-widest mb-3">
                Reaction Training
              </span>
              <h2 className="font-headline text-3xl md:text-5xl text-primary tracking-tight">en-lightning round</h2>
              <p className="mt-3 max-w-2xl font-body text-on-surface-variant">
                Listen for a random spoken question. Somewhere after the fifth word you will hear <strong>BUZZ</strong>. React with the buzz button or space bar as quickly as possible.
              </p>
            </div>
            <div className="flex flex-col gap-3 items-end">
              <div className="flex items-center gap-2 rounded-full bg-surface-container px-3 py-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Speed</span>
                <button
                  onClick={() => setSpeechRate(current => Math.max(0.7, Number((current - 0.1).toFixed(1))))}
                  className="h-7 w-7 rounded-full bg-surface-container-high text-primary font-bold transition-colors hover:bg-surface-dim"
                  type="button"
                >
                  -
                </button>
                <span className="min-w-10 text-center font-headline text-sm font-bold text-primary">{speechRate.toFixed(1)}x</span>
                <button
                  onClick={() => setSpeechRate(current => Math.min(1.3, Number((current + 0.1).toFixed(1))))}
                  className="h-7 w-7 rounded-full bg-surface-container-high text-primary font-bold transition-colors hover:bg-surface-dim"
                  type="button"
                >
                  +
                </button>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-surface-container px-3 py-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Volume</span>
                <button
                  onClick={() => setSpeechVolume(current => Math.max(0.2, Number((current - 0.1).toFixed(1))))}
                  className="h-7 w-7 rounded-full bg-surface-container-high text-primary font-bold transition-colors hover:bg-surface-dim"
                  type="button"
                >
                  -
                </button>
                <span className="min-w-10 text-center font-headline text-sm font-bold text-primary">{Math.round(speechVolume * 100)}%</span>
                <button
                  onClick={() => setSpeechVolume(current => Math.min(1, Number((current + 0.1).toFixed(1))))}
                  className="h-7 w-7 rounded-full bg-surface-container-high text-primary font-bold transition-colors hover:bg-surface-dim"
                  type="button"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="lg:col-span-2 bg-surface-container rounded-xl p-6 md:p-8">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Round Status</span>
                  <p className="mt-2 font-headline text-2xl text-primary">
                    {status === "reading" ? "Listening for BUZZ" : status === "finished" ? "Round Complete" : "Ready"}
                  </p>
                </div>
                <div className="rounded-full bg-primary/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary">
                  Session Round {sessionRounds + (status === "reading" ? 1 : 0)}
                </div>
              </div>

              <p className="font-body text-base md:text-lg text-on-surface-variant min-h-16">{instruction}</p>

              <div className="mt-8">
                <button
                  onClick={triggerBuzz}
                  className={`w-full py-6 md:py-8 rounded-lg flex items-center justify-center gap-4 shadow-xl transition-all duration-150 active:scale-95 ${
                    status === "reading" ? "buzz-gradient shadow-primary/20 text-white" : "bg-primary text-white hover:bg-primary/90"
                  }`}
                  type="button"
                >
                  <span className="font-headline font-extrabold text-3xl md:text-5xl tracking-tighter">
                    {status === "reading" ? "BUZZ" : "START"}
                  </span>
                  <span className="material-symbols-outlined text-3xl md:text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {status === "reading" ? "bolt" : "play_arrow"}
                  </span>
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={startRound}
                  className="rounded-lg border-2 border-primary px-5 py-3 font-bold text-primary transition-colors hover:bg-primary/5"
                  type="button"
                >
                  New Round
                </button>
                <Link
                  href="/"
                  className="rounded-lg border-2 border-outline-variant px-5 py-3 font-bold text-on-surface-variant transition-colors hover:bg-surface-dim"
                >
                  Return To Dashboard
                </Link>
              </div>

              {round && status === "finished" && (
                <div className="mt-10 rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <span className="rounded-full bg-tertiary-fixed px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-on-tertiary-container">
                      {round.question.category}
                    </span>
                    {lastReactionMs !== null && (
                      <span className="font-headline text-2xl font-bold text-secondary">{lastReactionMs} ms</span>
                    )}
                  </div>
                  <p className="font-headline text-xl leading-relaxed text-primary-container italic whitespace-pre-wrap">
                    {round.question.question}
                  </p>
                  <div className="mt-6 border-t border-outline-variant/20 pt-6">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Correct Answer</span>
                    <div className="mt-2 font-headline text-2xl font-bold italic text-primary" dangerouslySetInnerHTML={{ __html: round.question.answer }} />
                  </div>
                </div>
              )}
            </section>

            <aside className="space-y-6">
              <section className="bg-primary text-white rounded-xl p-6">
                <h3 className="font-headline text-xl italic opacity-80 mb-6">Session Metrics</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-primary-fixed-dim">Avg</span>
                    <p className="font-headline text-3xl font-bold italic">{sessionAverageReactionMs ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-primary-fixed-dim">Best</span>
                    <p className="font-headline text-3xl font-bold italic">{sessionBestReactionMs ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-primary-fixed-dim">Hits</span>
                    <p className="font-headline text-3xl font-bold italic">{sessionSuccessfulBuzzes}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-primary-fixed-dim">Missed</span>
                    <p className="font-headline text-3xl font-bold italic">{sessionMissedBuzzes}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-primary-fixed-dim">False Starts</span>
                    <p className="font-headline text-3xl font-bold italic">{sessionFalseStarts}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-primary-fixed-dim">Rounds</span>
                    <p className="font-headline text-3xl font-bold italic">{sessionRounds}</p>
                  </div>
                </div>
              </section>

              <section className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10">
                <h3 className="font-headline text-xl text-primary mb-6">Lifetime Metrics</h3>
                <div className="space-y-5">
                  <div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Average Reaction</span>
                    <p className="font-headline text-3xl font-bold italic text-primary">{lifetimeAverageReactionMs ?? "—"}{lifetimeAverageReactionMs !== null ? " ms" : ""}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Best Reaction</span>
                    <p className="font-headline text-3xl font-bold italic text-primary">{stats?.lightningBestReactionMs ?? "—"}{stats?.lightningBestReactionMs !== null ? " ms" : ""}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Successful Buzzes</span>
                    <p className="font-headline text-3xl font-bold italic text-primary">{stats?.lightningSuccessfulBuzzes || 0}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Missed Buzzes</span>
                    <p className="font-headline text-3xl font-bold italic text-primary">{stats?.lightningMissedBuzzes || 0}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">False Starts</span>
                    <p className="font-headline text-3xl font-bold italic text-primary">{stats?.lightningFalseStarts || 0}</p>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </section>
      </main>
    </>
  );
}

export default function EnLightningPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center font-headline text-2xl">Loading en-lightning round...</div>}>
      <LightningPageContent />
    </Suspense>
  );
}
