"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Line, Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Filler,
  Legend
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Filler,
  Legend
);

export default function PlayerDetail({ params }: { params: { id: string } }) {
  const [playerData, setPlayerData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPlayer() {
      try {
        const res = await fetch(`/api/coach/players/${params.id}`);
        const data = await res.json();
        setPlayerData(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchPlayer();
  }, [params.id]);

  if (loading) {
    return <div className="p-10 flex justify-center min-h-[50vh] items-center"><span className="material-symbols-outlined animate-spin text-4xl text-primary">sync</span></div>;
  }

  if (!playerData) {
    return <div className="p-10 text-on-surface font-body">Player not found.</div>;
  }

  const lineData = {
    labels: (playerData.accuracyOverTime || []).map((d: any) => d.date),
    datasets: [
      {
        label: 'Accuracy %',
        data: (playerData.accuracyOverTime || []).map((d: any) => d.accuracy),
        borderColor: '#000a1e',
        backgroundColor: 'rgba(0, 10, 30, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };

  const radarData = {
    labels: (playerData.categoryBreakdown || []).map((c: any) => c.category),
    datasets: [
      {
        label: 'Accuracy',
        data: (playerData.categoryBreakdown || []).map((c: any) => c.accuracy),
        backgroundColor: 'rgba(115, 92, 0, 0.2)',
        borderColor: '#735c00',
        borderWidth: 2,
      }
    ]
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <Link href="/coach/players" className="inline-flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors font-body text-sm">
        <span className="material-symbols-outlined text-sm">arrow_back</span>
        Back to Roster
      </Link>

      <header className="flex items-center gap-6">
        <div className="w-20 h-20 rounded-full bg-primary text-white flex items-center justify-center font-headline text-4xl shadow-md">
          {playerData.display_name?.charAt(0) || '?'}
        </div>
        <div>
          <h1 className="font-headline text-4xl text-on-surface flex items-center gap-3">
            {playerData.display_name}
            {playerData.role === 'admin' && (
              <span className="bg-secondary/10 text-secondary text-sm px-3 py-1 rounded-full font-body font-bold">Admin</span>
            )}
          </h1>
          <p className="font-body text-on-surface-variant mt-1">Joined {playerData.joined_date || 'Unknown'}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Performance Line Chart */}
        <div className="bg-surface-container-lowest p-6 rounded-3xl">
          <h3 className="font-headline text-2xl text-on-surface mb-4">Performance (30 Days)</h3>
          <div className="h-64">
            <Line data={lineData} options={{ maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } } }} />
          </div>
        </div>

        {/* Category Radar */}
        <div className="bg-surface-container p-6 rounded-3xl flex flex-col items-center">
          <h3 className="font-headline text-2xl text-on-surface mb-4 self-start">Knowledge Map</h3>
          <div className="h-64 w-full max-w-sm">
            <Radar data={radarData} options={{ maintainAspectRatio: false, scales: { r: { min: 0, max: 100 } } }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="font-headline text-2xl text-on-surface">Recent Sessions</h2>
          <div className="bg-surface-container-lowest rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body min-w-[500px]">
                <thead className="bg-surface-container">
                  <tr>
                    <th className="p-4 font-medium text-on-surface-variant text-sm">Pack</th>
                    <th className="p-4 font-medium text-on-surface-variant text-sm">Date</th>
                    <th className="p-4 font-medium text-on-surface-variant text-sm">Score</th>
                    <th className="p-4 font-medium text-on-surface-variant text-sm text-center">15 / 10 / -5</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {(playerData.recentSessions || []).map((s: any, i: number) => (
                    <tr key={i}>
                      <td className="p-4 text-on-surface font-medium">{s.pack}</td>
                      <td className="p-4 text-on-surface-variant text-sm">{s.date}</td>
                      <td className="p-4 text-primary font-bold">{s.score}</td>
                      <td className="p-4 text-center text-sm text-on-surface-variant">
                        <span className="text-green-600">{s.powers}</span> / {s.tens} / <span className="text-red-600">{s.negs}</span>
                      </td>
                    </tr>
                  ))}
                  {(!playerData.recentSessions || playerData.recentSessions.length === 0) && (
                    <tr><td colSpan={4} className="p-4 text-center text-on-surface-variant">No recent sessions</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-error-container/20 p-6 rounded-3xl border border-error-container/30">
            <h3 className="font-headline text-xl text-on-error-container flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined">warning</span> Weak Spots
            </h3>
            <ul className="space-y-3">
              {(playerData.weakSpots || []).map((spot: any, i: number) => (
                <li key={i} className="flex justify-between items-center font-body text-sm">
                  <span className="text-on-surface">{spot.category}</span>
                  <span className="font-bold text-on-error-container">{spot.accuracy}%</span>
                </li>
              ))}
              {(!playerData.weakSpots || playerData.weakSpots.length === 0) && (
                <li className="text-on-surface-variant font-body text-sm">No weak spots found!</li>
              )}
            </ul>
          </div>

          <div className="bg-secondary/10 p-6 rounded-3xl border border-secondary/20">
            <h3 className="font-headline text-xl text-secondary flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined">auto_awesome</span> Suggested Packs
            </h3>
            <ul className="space-y-3">
              {(playerData.recommendedPacks || []).map((pack: any, i: number) => (
                <li key={i} className="font-body text-sm">
                  <div className="font-medium text-on-surface">{pack.name}</div>
                  <div className="text-xs text-on-surface-variant">Matches: {pack.focus}</div>
                </li>
              ))}
              {(!playerData.recommendedPacks || playerData.recommendedPacks.length === 0) && (
                <li className="text-on-surface-variant font-body text-sm">No suggestions right now.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
