"use client";

import React from 'react';

interface CategoryStats {
  seen: number;
  correct: number;
}

interface Player {
  id: string;
  display_name: string;
  categories: Record<string, CategoryStats>;
}

export function CategoryHealthMatrix({ players }: { players: Player[] }) {
  // Extract all unique categories
  const allCategories = Array.from(
    new Set(players.flatMap(p => Object.keys(p.categories)))
  ).sort();

  return (
    <div className="w-full overflow-x-auto rounded-xl bg-surface-container pb-4">
      <table className="w-full text-left border-collapse min-w-max">
        <thead>
          <tr>
            <th className="p-4 font-headline text-lg text-on-surface sticky left-0 bg-surface-container z-10">
              Player
            </th>
            {allCategories.map(cat => (
              <th key={cat} className="p-4 font-body text-sm font-medium text-on-surface-variant min-w-[100px]">
                {cat}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player, idx) => (
            <tr key={player.id} className={idx % 2 === 0 ? 'bg-surface-container-lowest' : 'bg-surface-container'}>
              <td className="p-4 font-headline text-base text-on-surface sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                {player.display_name}
              </td>
              {allCategories.map(cat => {
                const stats = player.categories[cat];
                if (!stats || stats.seen === 0) {
                  return (
                    <td key={cat} className="p-4">
                      <div className="w-full h-full rounded-md bg-surface p-2 text-center text-on-surface-variant text-xs font-body">
                        No data
                      </div>
                    </td>
                  );
                }

                const accuracy = (stats.correct / stats.seen) * 100;
                let bgClass = "bg-surface-container";
                let textClass = "text-on-surface-variant";

                if (accuracy < 40) {
                  bgClass = "bg-error-container/50";
                  textClass = "text-on-error-container";
                } else if (accuracy <= 70) {
                  bgClass = "bg-secondary/10";
                  textClass = "text-secondary";
                } else {
                  bgClass = "bg-tertiary-fixed"; // Assumes a green-like shade from Material 3
                  textClass = "text-on-tertiary-container";
                }

                return (
                  <td key={cat} className="p-2">
                    <div className={`w-full rounded-md p-2 text-center flex flex-col items-center justify-center ${bgClass} ${textClass}`}>
                      <span className="font-body font-bold text-sm">{accuracy.toFixed(0)}%</span>
                      <span className="font-body text-[10px] opacity-80">{stats.seen} seen</span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
