"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export interface CategoryStat {
  seen: number;
  correct: number;
}

export interface UserStats {
  tossupsSeen: number;
  powersBuzzed: number;
  tensBuzzed: number;
  negsBuzzed: number;
  totalPoints: number;
  categories: Record<string, CategoryStat>;
  streak: number;
  packProgress: Record<string, number>;
}

const defaultStats: UserStats = {
  tossupsSeen: 0,
  powersBuzzed: 0,
  tensBuzzed: 0,
  negsBuzzed: 0,
  totalPoints: 0,
  categories: {},
  streak: 0,
  packProgress: {},
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
    result: 'power' | 'ten' | 'neg' | 'none',
    points: number,
    category: string,
    isNew: boolean = true,
    extraData?: {
      question_id?: string;
      subcategory?: string;
      buzz_word_index?: number;
      time_to_answer_sec?: number;
    }
  ) => {
    // 1. Write to localStorage (instant, same as before)
    setStats(currentStats => {
        const s = currentStats ? { ...currentStats } : { ...defaultStats };
        
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
        
        localStorage.setItem("knack_user_stats", JSON.stringify(s));
        return s;
    });

    // 2. Queue for server (batched, non-blocking)
    const session = serverSessionRef.current;
    if (session) {
      pendingResultsRef.current.push({
        session_id: session.id,
        question_id: extraData?.question_id,
        category,
        subcategory: extraData?.subcategory,
        result,
        points,
        buzz_word_index: extraData?.buzz_word_index,
        time_to_answer_sec: extraData?.time_to_answer_sec,
      });
      scheduleFlush();
    }
  };

  const updatePackProgress = (packId: string, questionIndex: number) => {
    setStats(currentStats => {
        const s = currentStats ? { ...currentStats } : { ...defaultStats };
        if (!s.packProgress) {
            s.packProgress = {};
        }
        s.packProgress[packId] = questionIndex;
        localStorage.setItem("knack_user_stats", JSON.stringify(s));
        return s;
    });
  };

  return {
    stats,
    recordQuestion,
    updatePackProgress,
    startServerSession,
    endServerSession,
    flushResultsToServer,
  };
}
