"use client";

import { useState } from "react";

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

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  type: "overall" | "power_rate" | "activity";
  currentUserId?: string;
  isLoading?: boolean;
}

const rankBadge = (rank: number) => {
  if (rank === 1) return <span className="text-2xl">🥇</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return (
    <span className="font-headline text-lg font-bold text-on-surface-variant">
      {rank}
    </span>
  );
};

export default function LeaderboardTable({
  entries,
  type,
  currentUserId,
  isLoading,
}: LeaderboardTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-surface-container rounded-lg p-6 animate-pulse flex items-center gap-6"
          >
            <div className="w-10 h-10 bg-surface-container-highest rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-surface-container-highest rounded w-1/3" />
              <div className="h-3 bg-surface-container-highest rounded w-1/4" />
            </div>
            <div className="h-8 w-20 bg-surface-container-highest rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center p-12 text-on-surface-variant italic font-body">
        No data yet. Complete some practice sessions to appear on the
        leaderboard!
      </div>
    );
  }

  const getMetricValue = (entry: LeaderboardEntry) => {
    switch (type) {
      case "power_rate":
        return `${entry.power_rate}%`;
      case "activity":
        return `${entry.total_questions}`;
      default:
        return `${entry.total_points > 0 ? "+" : ""}${entry.total_points}`;
    }
  };

  const getMetricLabel = () => {
    switch (type) {
      case "power_rate":
        return "Power Rate";
      case "activity":
        return "Questions";
      default:
        return "Points";
    }
  };

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="hidden md:flex items-center px-6 py-2 text-[10px] uppercase tracking-widest font-bold text-slate-400">
        <span className="w-12">Rank</span>
        <span className="flex-1">Player</span>
        <span className="w-24 text-right">{getMetricLabel()}</span>
        <span className="w-24 text-right">Accuracy</span>
        <span className="w-20 text-right">Powers</span>
        <span className="w-20 text-right">Negs</span>
      </div>

      {entries.map((entry, index) => {
        const rank = index + 1;
        const isCurrentUser = entry.user_id === currentUserId;
        const isExpanded = expandedRow === entry.user_id;

        return (
          <div key={entry.user_id}>
            <button
              onClick={() =>
                setExpandedRow(isExpanded ? null : entry.user_id)
              }
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-lg transition-all duration-150 text-left
                ${
                  isCurrentUser
                    ? "bg-primary/5 border border-primary/20"
                    : "bg-surface-container-lowest hover:bg-surface-container border border-transparent"
                }
                ${rank <= 3 ? "shadow-sm" : ""}
              `}
            >
              {/* Rank */}
              <div className="w-10 flex items-center justify-center shrink-0">
                {rankBadge(rank)}
              </div>

              {/* Player info */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0
                    ${rank === 1 ? "bg-secondary" : rank <= 3 ? "bg-primary-container" : "bg-surface-container-highest text-on-surface-variant"}
                  `}
                >
                  {entry.display_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <span
                    className={`font-headline text-base block truncate ${
                      isCurrentUser
                        ? "text-primary font-bold"
                        : "text-primary"
                    }`}
                  >
                    {entry.display_name}
                    {isCurrentUser && (
                      <span className="text-xs font-body text-secondary ml-2">
                        (You)
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-on-surface-variant font-body md:hidden">
                    {entry.accuracy}% accuracy · {entry.powers} powers
                  </span>
                </div>
              </div>

              {/* Desktop stats */}
              <span className="hidden md:block w-24 text-right font-headline font-bold text-lg text-primary">
                {getMetricValue(entry)}
              </span>
              <span className="hidden md:block w-24 text-right font-body text-sm text-on-surface-variant">
                {entry.accuracy}%
              </span>
              <span className="hidden md:block w-20 text-right font-body text-sm text-secondary font-bold">
                {entry.powers}
              </span>
              <span className="hidden md:block w-20 text-right font-body text-sm text-error font-bold">
                {entry.negs}
              </span>

              {/* Mobile primary metric */}
              <span className="md:hidden font-headline font-bold text-xl text-primary">
                {getMetricValue(entry)}
              </span>
            </button>

            {/* Expanded detail (mobile-friendly) */}
            {isExpanded && (
              <div className="mx-6 mb-2 p-4 bg-surface-container rounded-b-lg border-t border-outline-variant/20 grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
                    Questions
                  </span>
                  <span className="font-headline text-xl font-bold">
                    {entry.total_questions}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
                    Points
                  </span>
                  <span className="font-headline text-xl font-bold text-on-tertiary-container">
                    {entry.total_points > 0 ? "+" : ""}
                    {entry.total_points}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
                    Tens
                  </span>
                  <span className="font-headline text-xl font-bold">
                    {entry.tens}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
                    Power Rate
                  </span>
                  <span className="font-headline text-xl font-bold text-secondary">
                    {entry.power_rate}%
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
