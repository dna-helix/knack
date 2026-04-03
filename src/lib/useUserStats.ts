"use client";
import { useState, useEffect } from "react";

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

const STORAGE_KEY = "knack_user_stats";
const STATS_UPDATED_EVENT = "knack:user-stats-updated";

function cloneDefaultStats(): UserStats {
  return {
    ...defaultStats,
    categories: {},
    packProgress: {},
  };
}

function normalizeStats(input: Partial<UserStats> | null | undefined): UserStats {
  if (!input) return cloneDefaultStats();

  return {
    tossupsSeen: input.tossupsSeen ?? 0,
    powersBuzzed: input.powersBuzzed ?? 0,
    tensBuzzed: input.tensBuzzed ?? 0,
    negsBuzzed: input.negsBuzzed ?? 0,
    totalPoints: input.totalPoints ?? 0,
    categories: input.categories ?? {},
    streak: input.streak ?? 0,
    packProgress: input.packProgress ?? {},
  };
}

function readStoredStats(): UserStats {
  if (typeof window === "undefined") {
    return cloneDefaultStats();
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return cloneDefaultStats();

  try {
    return normalizeStats(JSON.parse(stored));
  } catch {
    return cloneDefaultStats();
  }
}

function persistStats(nextStats: UserStats) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextStats));
  window.dispatchEvent(new CustomEvent(STATS_UPDATED_EVENT, { detail: nextStats }));
}

function cloneStats(stats: UserStats): UserStats {
  return {
    ...stats,
    categories: Object.fromEntries(
      Object.entries(stats.categories).map(([category, value]) => [
        category,
        { ...value },
      ]),
    ),
    packProgress: { ...stats.packProgress },
  };
}

export function useUserStats() {
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    const syncStats = () => {
      setStats(readStoredStats());
    };

    syncStats();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STORAGE_KEY) {
        syncStats();
      }
    };

    const handleStatsUpdated = () => {
      syncStats();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(STATS_UPDATED_EVENT, handleStatsUpdated);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(STATS_UPDATED_EVENT, handleStatsUpdated);
    };
  }, []);


  /**
   * Records a question result.
   * @param result - The outcome of the buzz/question
   * @param points - Points awarded (can be negative)
   * @param category - Question category
   * @param isNew - True if this is the first interaction with this unique question
   */
  const recordQuestion = (result: 'power' | 'ten' | 'neg' | 'none', points: number, category: string, isNew: boolean = true) => {
    setStats(currentStats => {
        const s = cloneStats(normalizeStats(currentStats));
        
        // 1. Update Global and Category "Seen" counters ONLY if this is a new interaction
        if (isNew) {
            s.tossupsSeen += 1;
            if (!s.categories[category]) {
                s.categories[category] = { seen: 0, correct: 0 };
            }
            s.categories[category].seen += 1;
        }
        
        // 2. Update category "Correct" count
        if (result === 'power' || result === 'ten') {
            if (!s.categories[category]) {
                s.categories[category] = { seen: 1, correct: 0 };
            }
            s.categories[category].correct += 1;
        }
        
        // 3. Update global point and result counters
        s.totalPoints += points;
        if (result === 'power') s.powersBuzzed += 1;
        if (result === 'ten') s.tensBuzzed += 1;
        if (result === 'neg') s.negsBuzzed += 1;
        
        persistStats(s);
        return s;
    });
  };

  const updatePackProgress = (packId: string, questionIndex: number) => {
    setStats(currentStats => {
        const s = cloneStats(normalizeStats(currentStats));
        s.packProgress[packId] = questionIndex;
        persistStats(s);
        return s;
    });
  };

  return { stats, recordQuestion, updatePackProgress };
}
