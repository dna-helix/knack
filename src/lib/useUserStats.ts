"use client";
import { useState, useEffect } from "react";

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

const STORAGE_KEY = "knack_user_stats";
const STATS_UPDATED_EVENT = "knack:user-stats-updated";

function cloneDefaultStats(): UserStats {
  return {
    ...defaultStats,
    categories: {},
    practiceDates: [],
    packProgress: {},
    recentMisses: [],
  };
}

function normalizeStats(input: Partial<UserStats> | null | undefined): UserStats {
  if (!input) return cloneDefaultStats();

  return {
    tossupsSeen: input.tossupsSeen ?? 0,
    powersBuzzed: input.powersBuzzed ?? 0,
    tensBuzzed: input.tensBuzzed ?? 0,
    negsBuzzed: input.negsBuzzed ?? 0,
    wrongAnswers: input.wrongAnswers ?? 0,
    unanswered: input.unanswered ?? 0,
    totalPoints: input.totalPoints ?? 0,
    lightningRoundsPlayed: input.lightningRoundsPlayed ?? 0,
    lightningSuccessfulBuzzes: input.lightningSuccessfulBuzzes ?? 0,
    lightningMissedBuzzes: input.lightningMissedBuzzes ?? 0,
    lightningFalseStarts: input.lightningFalseStarts ?? 0,
    lightningTotalReactionMs: input.lightningTotalReactionMs ?? 0,
    lightningBestReactionMs: input.lightningBestReactionMs ?? null,
    lightningRecentReactionMs: input.lightningRecentReactionMs ?? [],
    categories: input.categories ?? {},
    streak: input.streak ?? 0,
    practiceDates: input.practiceDates ?? [],
    packProgress: input.packProgress ?? {},
    recentMisses: input.recentMisses ?? [],
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
    lightningRecentReactionMs: [...stats.lightningRecentReactionMs],
    practiceDates: [...stats.practiceDates],
    packProgress: { ...stats.packProgress },
    recentMisses: stats.recentMisses.map(miss => ({ ...miss })),
  };
}

interface RecordQuestionDetails {
  questionId?: string;
  question: string;
  answer: string;
  subcategory?: string;
}

const MAX_RECENT_MISSES = 8;
const MAX_LIGHTNING_REACTIONS = 12;

function getLocalDateKey(date: Date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function computePracticeStreak(practiceDates: string[]) {
  if (practiceDates.length === 0) return 0;

  const uniqueSorted = Array.from(new Set(practiceDates)).sort((a, b) => b.localeCompare(a));
  let streak = 1;
  let cursor = new Date(`${uniqueSorted[0]}T12:00:00`);

  for (let index = 1; index < uniqueSorted.length; index += 1) {
    const previous = new Date(cursor);
    previous.setDate(previous.getDate() - 1);

    if (getLocalDateKey(previous) !== uniqueSorted[index]) {
      break;
    }

    streak += 1;
    cursor = previous;
  }

  return streak;
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
   * @param details - The question details used for recent miss tracking
   */
  const recordQuestion = (
    result: 'power' | 'ten' | 'neg' | 'none' | 'unanswered',
    points: number,
    category: string,
    isNew: boolean = true,
    details?: RecordQuestionDetails,
  ) => {
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
        if (result === 'none' || result === 'neg') s.wrongAnswers += 1;
        if (result === 'unanswered') s.unanswered += 1;
        s.practiceDates = Array.from(new Set([getLocalDateKey(), ...s.practiceDates])).sort((a, b) => b.localeCompare(a));
        s.streak = computePracticeStreak(s.practiceDates);

        if ((result === 'neg' || result === 'none' || result === 'unanswered') && details) {
            const questionId = details.questionId || `${category}:${details.question}`;
            s.recentMisses = [
                {
                    questionId,
                    question: details.question,
                    answer: details.answer,
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
  };

  const updatePackProgress = (packId: string, questionIndex: number) => {
    setStats(currentStats => {
        const s = cloneStats(normalizeStats(currentStats));
        s.packProgress[packId] = questionIndex;
        persistStats(s);
        return s;
    });
  };

  const recordLightningRound = (
    outcome: 'success' | 'missed' | 'false_start',
    reactionMs?: number,
  ) => {
    setStats(currentStats => {
      const s = cloneStats(normalizeStats(currentStats));
      s.lightningRoundsPlayed += 1;

      if (outcome === 'success' && typeof reactionMs === 'number') {
        const roundedReactionMs = Math.max(0, Math.round(reactionMs));
        s.lightningSuccessfulBuzzes += 1;
        s.lightningTotalReactionMs += roundedReactionMs;
        s.lightningBestReactionMs =
          s.lightningBestReactionMs === null
            ? roundedReactionMs
            : Math.min(s.lightningBestReactionMs, roundedReactionMs);
        s.lightningRecentReactionMs = [
          roundedReactionMs,
          ...s.lightningRecentReactionMs,
        ].slice(0, MAX_LIGHTNING_REACTIONS);
      }

      if (outcome === 'missed') {
        s.lightningMissedBuzzes += 1;
      }

      if (outcome === 'false_start') {
        s.lightningFalseStarts += 1;
      }

      persistStats(s);
      return s;
    });
  };

  return { stats, recordQuestion, updatePackProgress, recordLightningRound };
}
