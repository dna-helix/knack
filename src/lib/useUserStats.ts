"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export interface CategoryStat {
  seen: number;
  correct: number;
}

export interface RecentMiss {
  questionId: string;
  question: string;
  answer: string;
  category: string;
  subcategory?: string;
  result: 'neg' | 'none' | 'unanswered';
  recordedAt: string;
}

export interface UserStats {
  tossupsSeen: number;
  powersBuzzed: number;
  tensBuzzed: number;
  negsBuzzed: number;
  wrongAnswers: number;
  unanswered: number;
  totalPoints: number;
  lightningRoundsPlayed: number;
  lightningSuccessfulBuzzes: number;
  lightningMissedBuzzes: number;
  lightningFalseStarts: number;
  lightningTotalReactionMs: number;
  lightningBestReactionMs: number | null;
  lightningRecentReactionMs: number[];
  categories: Record<string, CategoryStat>;
  streak: number;
  practiceDates: string[];
  packProgress: Record<string, number>;
  recentMisses: RecentMiss[];
}

const defaultStats: UserStats = {
  tossupsSeen: 0,
  powersBuzzed: 0,
  tensBuzzed: 0,
  negsBuzzed: 0,
  wrongAnswers: 0,
  unanswered: 0,
  totalPoints: 0,
  lightningRoundsPlayed: 0,
  lightningSuccessfulBuzzes: 0,
  lightningMissedBuzzes: 0,
  lightningFalseStarts: 0,
  lightningTotalReactionMs: 0,
  lightningBestReactionMs: null,
  lightningRecentReactionMs: [],
  categories: {},
  streak: 0,
  practiceDates: [],
  packProgress: {},
  recentMisses: [],
};

/**
 * Server-side session tracking state.
 * Holds the current active server session ID so question results
 * can be associated with the correct practice session.
 */
interface ServerSession {
  id: string;
  packId: string;
}

const persistStats = (s: UserStats) => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('knack_user_stats', JSON.stringify(s));
    } catch (err) {
      console.warn('Failed to persist user stats:', err);
    }
  }
};

const MAX_RECENT_MISSES = 50;

function cloneStats(s: UserStats): UserStats {
  return JSON.parse(JSON.stringify(s));
}

function normalizeStats(s: UserStats | null): UserStats {
  if (!s) return { ...defaultStats };
  return {
    ...defaultStats,
    ...s,
    categories: s.categories || {},
    practiceDates: s.practiceDates || [],
    packProgress: s.packProgress || {},
    recentMisses: s.recentMisses || [],
    lightningRecentReactionMs: s.lightningRecentReactionMs || []
  };
}

function getLocalDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function computePracticeStreak(dates: string[]): number {
  if (!dates || dates.length === 0) return 0;
  let streak = 0;
  const today = getLocalDateKey();
  
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const year = yesterdayDate.getFullYear();
  const month = String(yesterdayDate.getMonth() + 1).padStart(2, '0');
  const day = String(yesterdayDate.getDate()).padStart(2, '0');
  const yesterday = `${year}-${month}-${day}`;

  if (!dates.includes(today) && !dates.includes(yesterday)) {
    return 0;
  }

  let currentDate = dates.includes(today) ? new Date() : yesterdayDate;
  
  for (let i = 0; i < dates.length; i++) {
    const dStr = dates[i];
    const expectedYear = currentDate.getFullYear();
    const expectedMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
    const expectedDay = String(currentDate.getDate()).padStart(2, '0');
    const expected = `${expectedYear}-${expectedMonth}-${expectedDay}`;
    
    if (dStr === expected) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else if (dStr < expected) {
      break;
    }
  }
  return streak;
}

export function useUserStats() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const serverSessionRef = useRef<ServerSession | null>(null);
  const pendingResultsRef = useRef<Array<{
    session_id: string;
    question_id?: string;
    category: string;
    subcategory?: string;
    result: 'power' | 'ten' | 'neg' | 'none';
    points: number;
    buzz_word_index?: number;
    time_to_answer_sec?: number;
  }>>([]);
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("knack_user_stats");
    if (stored) {
      try {
        setStats(JSON.parse(stored));
      } catch {
        setStats(defaultStats);
      }
    } else {
      setStats(defaultStats);
    }
  }, []);

  // ── Server session management ──────────────────────────────

  /**
   * Start a new server-side practice session.
   * Call this when the user begins a new practice pack.
   */
  const startServerSession = useCallback(async (packId: string): Promise<string | null> => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null; // Not authenticated, skip server tracking

      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack_id: packId }),
      });

      if (!response.ok) return null;

      const { id } = await response.json();
      serverSessionRef.current = { id, packId };
      return id;
    } catch (err) {
      console.warn("Failed to start server session:", err);
      return null;
    }
  }, []);

  /**
   * End the current server-side practice session with final metrics.
   */
  const endServerSession = useCallback(async (metrics: {
    total_score: number;
    questions_answered: number;
    powers: number;
    tens: number;
    negs: number;
    missed: number;
  }) => {
    // Flush any pending results first
    await flushResultsToServer();

    const session = serverSessionRef.current;
    if (!session) return;

    try {
      await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...metrics,
          ended_at: new Date().toISOString(),
        }),
      });
    } catch (err) {
      console.warn("Failed to end server session:", err);
    }

    serverSessionRef.current = null;
  }, []);

  // ── Batched result flushing ────────────────────────────────

  const flushResultsToServer = useCallback(async () => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }

    const results = pendingResultsRef.current;
    if (results.length === 0) return;

    pendingResultsRef.current = [];

    try {
      await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results }),
      });
    } catch (err) {
      console.warn("Failed to flush results to server:", err);
      // Re-queue failed results for next flush
      pendingResultsRef.current = [...results, ...pendingResultsRef.current];
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimeoutRef.current) return;
    // Batch results and flush every 3 seconds to reduce API calls
    flushTimeoutRef.current = setTimeout(() => {
      flushTimeoutRef.current = null;
      flushResultsToServer();
    }, 3000);
  }, [flushResultsToServer]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }
      // Best-effort flush on unmount
      if (pendingResultsRef.current.length > 0) {
        const results = pendingResultsRef.current;
        pendingResultsRef.current = [];
        // Use sendBeacon for reliable delivery on page unload
        if (navigator.sendBeacon) {
          navigator.sendBeacon(
            "/api/results",
            new Blob([JSON.stringify({ results })], { type: "application/json" })
          );
        }
      }
    };
  }, []);

  // ── Record question (dual-write: localStorage + server) ────

  /**
   * Records a question result.
   * @param result - The outcome of the buzz/question
   * @param points - Points awarded (can be negative)
   * @param category - Question category
   * @param isNew - True if this is the first interaction with this unique question
   * @param extraData - Additional data for server tracking
   */
  const recordQuestion = (
    result: 'power' | 'ten' | 'neg' | 'none' | 'unanswered',
    points: number,
    category: string,
    isNew: boolean = true,
    details?: {
      questionId?: string;
      question?: string;
      answer?: string;
      subcategory?: string;
      buzz_word_index?: number;
      time_to_answer_sec?: number;
    }
  ) => {
    // 1. Write to localStorage (instant, same as before)
    setStats(currentStats => {
      const s = cloneStats(normalizeStats(currentStats));

      if (isNew) {
        s.tossupsSeen += 1;
        if (!s.categories[category]) {
          s.categories[category] = { seen: 0, correct: 0 };
        }
        s.categories[category].seen += 1;
      }

      if (result === 'power' || result === 'ten') {
        if (!s.categories[category]) {
          s.categories[category] = { seen: 1, correct: 0 };
        }
        s.categories[category].correct += 1;
      }

      s.totalPoints += points;
      if (result === 'power') s.powersBuzzed += 1;
      if (result === 'ten') s.tensBuzzed += 1;
      if (result === 'neg') s.negsBuzzed += 1;
      if (result === 'none' || result === 'neg') s.wrongAnswers += 1;
      if (result === 'unanswered') s.unanswered += 1;
      s.practiceDates = Array.from(new Set([getLocalDateKey(), ...s.practiceDates])).sort((a, b) => b.localeCompare(a));
      s.streak = computePracticeStreak(s.practiceDates);

      if ((result === 'neg' || result === 'none' || result === 'unanswered') && details) {
        const questionId = details.questionId || `${category}:${details.question}`;
        s.recentMisses = [
          {
            questionId,
            question: details.question || '',
            answer: details.answer || '',
            category,
            subcategory: details.subcategory,
            result,
            recordedAt: new Date().toISOString(),
          },
          ...s.recentMisses.filter(miss => miss.questionId !== questionId),
        ].slice(0, MAX_RECENT_MISSES);
      }

      persistStats(s);
      return s;
    });

    // 2. Queue for server (batched, non-blocking)
    const session = serverSessionRef.current;
    if (session) {
      pendingResultsRef.current.push({
        session_id: session.id,
        question_id: details?.questionId,
        category,
        subcategory: details?.subcategory,
        result: result === 'unanswered' ? 'none' : result,
        points,
        buzz_word_index: details?.buzz_word_index,
        time_to_answer_sec: details?.time_to_answer_sec,
      });
      scheduleFlush();
    }
  };

  const recordLightningRound = useCallback((outcome: 'success' | 'missed' | 'false_start', reactionMs?: number) => {
    setStats(currentStats => {
      const s = cloneStats(normalizeStats(currentStats));
      s.lightningRoundsPlayed += 1;
      
      if (outcome === 'success') {
        s.lightningSuccessfulBuzzes += 1;
        if (reactionMs !== undefined) {
          s.lightningTotalReactionMs += reactionMs;
          s.lightningBestReactionMs = s.lightningBestReactionMs === null ? reactionMs : Math.min(s.lightningBestReactionMs, reactionMs);
          s.lightningRecentReactionMs = [reactionMs, ...s.lightningRecentReactionMs].slice(0, 50);
        }
      } else if (outcome === 'missed') {
        s.lightningMissedBuzzes += 1;
      } else if (outcome === 'false_start') {
        s.lightningFalseStarts += 1;
      }
      
      persistStats(s);
      return s;
    });
  }, []);

  const updatePackProgress = (packId: string, questionIndex: number) => {
    setStats(currentStats => {
      const s = cloneStats(normalizeStats(currentStats));
      s.packProgress[packId] = questionIndex;
      persistStats(s);
      return s;
    });
  };

  return {
    stats,
    recordQuestion,
    recordLightningRound,
    updatePackProgress,
    startServerSession,
    endServerSession,
    flushResultsToServer,
  };
}
