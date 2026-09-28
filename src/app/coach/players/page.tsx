"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

export default function PlayersRoster() {
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');

  useEffect(() => {
    async function fetchPlayers() {
      try {
        const res = await fetch('/api/coach/overview');
        const data = await res.json();
        setPlayers(data.playerSummaries || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchPlayers();
  }, []);

  const filtered = players.filter(p => p.display_name.toLowerCase().includes(search.toLowerCase()));
  
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'name') return a.display_name.localeCompare(b.display_name);
    if (sortBy === 'accuracy') return (b.accuracy || 0) - (a.accuracy || 0);
    if (sortBy === 'activity') return (b.total_questions || 0) - (a.total_questions || 0);
    return 0;
  });

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="font-headline text-4xl text-on-surface">Player Roster</h1>
        
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
          <div className="relative w-full sm:flex-1 md:w-64">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
            <input 
              type="text"
              placeholder="Search players..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface-container py-2 pl-10 pr-4 rounded-full font-body text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select 
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="w-full sm:w-auto bg-surface-container py-2 px-4 rounded-full font-body text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
          >
            <option value="name">Sort by Name</option>
            <option value="accuracy">Sort by Accuracy</option>
            <option value="activity">Sort by Activity</option>
          </select>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center p-10"><span className="material-symbols-outlined animate-spin text-4xl text-primary">sync</span></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sorted.map(player => (
            <Link href={`/coach/players/${player.id}`} key={player.id}>
              <div className="bg-surface-container-lowest hover:bg-surface-container transition-colors rounded-3xl p-6 flex flex-col gap-6 group cursor-pointer border border-transparent">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="font-headline text-2xl text-on-surface group-hover:text-primary transition-colors">{player.display_name}</h2>
                    <div className="text-xs text-on-surface-variant mt-1 font-body">Last active: {player.last_active || 'Never'}</div>
                  </div>
                  {player.role === 'admin' && (
                    <span className="bg-secondary/10 text-secondary text-xs px-2 py-1 rounded-full font-body font-bold">Admin</span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-on-surface-variant font-body">Questions</div>
                    <div className="font-headline text-xl text-on-surface">{player.total_questions || 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-on-surface-variant font-body">Accuracy</div>
                    <div className="font-headline text-xl text-on-surface">{player.accuracy || 0}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-on-surface-variant font-body">Power Rate</div>
                    <div className="font-headline text-xl text-on-surface">{player.power_rate || 0}%</div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {sorted.length === 0 && (
            <div className="col-span-full text-center text-on-surface-variant p-10 font-body">No players found.</div>
          )}
        </div>
      )}
    </div>
  );
}
