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

export function useUserStats() {
  const [stats, setStats] = useState<UserStats | null>(null);

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


  /**
   * Records a question result.
   * @param result - The outcome of the buzz/question
   * @param points - Points awarded (can be negative)
   * @param category - Question category
   * @param isNew - True if this is the first interaction with this unique question
   */
  const recordQuestion = (result: 'power' | 'ten' | 'neg' | 'none', points: number, category: string, isNew: boolean = true) => {
    setStats(currentStats => {
        const s = currentStats ? { ...currentStats } : { ...defaultStats };
        
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
        
        localStorage.setItem("knack_user_stats", JSON.stringify(s));
        return s;
    });
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

  return { stats, recordQuestion, updatePackProgress };
}
