"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import LeaderboardTable from "@/components/LeaderboardTable";
import { useAuth } from "@/lib/useAuth";

type LeaderboardType = "overall" | "power_rate" | "activity";
type Period = "week" | "month" | "all";

interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_points: number;
  total_questions: number;
  powers: number;
  tens: number;
  negs: number;
  accuracy: number;
  power_rate: number;
}

const TYPE_OPTIONS: { value: LeaderboardType; label: string; icon: string }[] = [
  { value: "overall", label: "Total Points", icon: "emoji_events" },
  { value: "power_rate", label: "Power Rate", icon: "bolt" },
  { value: "activity", label: "Activity", icon: "local_fire_department" },
];

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "all", label: "All Time" },
];

export default function LeaderboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [type, setType] = useState<LeaderboardType>("overall");
  const [period, setPeriod] = useState<Period>("week");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/leaderboard?type=${type}&period=${period}`
      );
      if (res.ok) {
        const data = await res.json();
        setEntries(data.leaderboard || []);
      }
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
    }
    setIsLoading(false);
  }, [type, period]);

  useEffect(() => {
    if (!authLoading) {
      fetchLeaderboard();
    }
  }, [fetchLeaderboard, authLoading]);

  return (
    <>
      <header className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-40 w-full border-b border-slate-100 dark:border-slate-800">
        <div className="flex justify-between items-center px-6 py-4 w-full">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
              <span className="material-symbols-outlined text-blue-950 dark:text-blue-100">
                menu_book
              </span>
              <h1 className="font-headline font-medium text-2xl tracking-tight text-blue-950 dark:text-blue-100">
                Knack
              </h1>
            </Link>
          </div>
          <nav className="hidden md:flex gap-8 items-center">
            <Link
              href="/"
              className="font-headline italic font-bold text-slate-500 hover:bg-slate-200/50 transition-colors px-2 py-1"
            >
              Home
            </Link>
            <Link
              href="/practice"
              className="font-headline italic font-bold text-slate-500 hover:bg-slate-200/50 transition-colors px-2 py-1"
            >
              Practice
            </Link>
            <Link
              href="/leaderboard"
              className="font-headline italic font-bold text-blue-900 transition-colors"
            >
              Leaderboard
            </Link>
            <Link
              href="/competitions"
              className="font-headline italic font-bold text-slate-500 hover:bg-slate-200/50 transition-colors px-2 py-1"
            >
              Competitions
            </Link>
          </nav>
          <span className="material-symbols-outlined text-blue-950 dark:text-blue-100">
            account_circle
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 pb-32">
        {/* Page Title */}
        <div className="mb-10">
          <h2 className="font-headline text-5xl text-primary mb-2 leading-tight">
            Leaderboard
          </h2>
          <p className="font-body text-on-surface-variant max-w-2xl">
            See how you stack up against your teammates across different metrics
            and time periods.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          {/* Type selector */}
          <div className="flex gap-2">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setType(opt.value)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold tracking-wide transition-colors
                  ${
                    type === opt.value
                      ? "bg-primary text-white"
                      : "bg-surface-container hover:bg-surface-container-high text-on-surface-variant"
                  }`}
              >
                <span className="material-symbols-outlined text-sm">
                  {opt.icon}
                </span>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Period selector */}
          <div className="flex gap-2 md:ml-auto">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-4 py-2 rounded-full text-xs font-bold tracking-wide transition-colors
                  ${
                    period === opt.value
                      ? "bg-secondary text-white"
                      : "bg-surface-container hover:bg-surface-container-high text-on-surface-variant"
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Leaderboard */}
        <section className="bg-white rounded-xl p-6 md:p-8 shadow-sm border border-outline-variant/10">
          <LeaderboardTable
            entries={entries}
            type={type}
            currentUserId={user?.id}
            isLoading={isLoading}
          />
        </section>
      </main>
    </>
  );
}
