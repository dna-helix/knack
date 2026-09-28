"use client";

import React, { useEffect, useState } from 'react';
import { CategoryHealthMatrix } from '@/components/coach/CategoryHealthMatrix';
import { ActivityHeatmap } from '@/components/coach/ActivityHeatmap';
import { useRouter } from 'next/navigation';

export default function CoachDashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/coach/overview');
        if (res.status === 401 || res.status === 403) {
          router.push('/');
          return;
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [router]);

  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center h-full min-h-[50vh]">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">sync</span>
      </div>
    );
  }

  if (!data) return <div className="p-8 text-on-surface">Failed to load data.</div>;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-10">
      <header className="space-y-2">
        <h1 className="font-headline text-4xl md:text-5xl text-on-surface">Team Overview</h1>
        <p className="font-body text-lg text-on-surface-variant">Knack Quiz Bowl Team</p>
      </header>

      {/* Quick Stats */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Questions This Week', value: data.questionsThisWeek, icon: 'edit_document' },
          { label: 'Team Avg Accuracy', value: `${data.teamAvgAccuracy}%`, icon: 'analytics' },
          { label: 'Active Players', value: data.activePlayers, icon: 'group' },
          { label: 'Most Improved', value: data.mostImprovedPlayer, icon: 'trending_up' },
        ].map((stat, i) => (
          <div key={i} className="bg-surface-container rounded-2xl p-6 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-xl">{stat.icon}</span>
              <span className="font-body text-sm font-medium">{stat.label}</span>
            </div>
            <div className="font-headline text-3xl text-on-surface">{stat.value}</div>
          </div>
        ))}
      </section>

      {/* Activity Heatmap */}
      <section className="bg-surface-container-lowest rounded-3xl p-6 md:p-8">
        <h2 className="font-headline text-2xl text-on-surface mb-6">Team Activity</h2>
        <ActivityHeatmap data={data.heatmapData || []} />
      </section>

      {/* Category Health */}
      <section className="space-y-6">
        <h2 className="font-headline text-2xl text-on-surface">Category Health</h2>
        <CategoryHealthMatrix players={data.playerCategories || []} />
      </section>

      {/* Recent Activity */}
      <section className="bg-surface-container rounded-3xl p-6 md:p-8 space-y-6">
        <h2 className="font-headline text-2xl text-on-surface">Recent Sessions</h2>
        <div className="space-y-4">
          {(data.recentSessions || []).map((session: any, i: number) => (
            <div key={i} className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-xl">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-headline">
                  {session.playerName.charAt(0)}
                </div>
                <div>
                  <div className="font-headline text-lg text-on-surface">{session.playerName}</div>
                  <div className="font-body text-sm text-on-surface-variant">{session.packName} • {session.time}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-headline text-xl text-primary">{session.score} pts</div>
              </div>
            </div>
          ))}
          {(!data.recentSessions || data.recentSessions.length === 0) && (
            <div className="text-on-surface-variant font-body">No recent sessions found.</div>
          )}
        </div>
      </section>
    </div>
  );
}
