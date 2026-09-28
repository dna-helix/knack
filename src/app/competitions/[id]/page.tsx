"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function CompetitionDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [competition, setCompetition] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [myEntry, setMyEntry] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/competitions?id=${params.id}`).then(res => res.ok ? res.json() : null), 
      fetch(`/api/competitions/${params.id}/entries`).then(res => res.ok ? res.json() : [])
    ]).then(([compData, entriesData]) => {
      const comp = Array.isArray(compData) ? compData.find((c: any) => c.id === params.id) : (compData?.data || compData);
      setCompetition(comp);
      
      const ents = Array.isArray(entriesData) ? entriesData : entriesData.data || [];
      ents.sort((a: any, b: any) => b.score - a.score);
      ents.forEach((e: any, idx: number) => {
        e.rank = idx + 1;
      });
      setEntries(ents);
      
      const me = ents.find((e: any) => e.is_current_user);
      setMyEntry(me || null);

      setLoading(false);
    }).catch(e => {
      console.error(e);
      setLoading(false);
    });
  }, [params.id]);

  if (loading) {
    return <div className="p-20 text-center font-headline text-2xl animate-pulse text-on-surface-variant">Loading competition...</div>;
  }

  if (!competition) {
    return <div className="p-20 text-center font-headline text-2xl text-error">Competition not found.</div>;
  }

  const isCompleted = competition.status === 'completed';
  const isActive = competition.status === 'active';
  const isUpcoming = competition.status === 'upcoming';

  return (
    <>
      <header className="bg-slate-50 dark:bg-slate-900 px-4 md:px-6 py-4 w-full fixed top-0 z-50 flex items-center justify-between">
         <Link href="/competitions" className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity font-bold">
            <span className="material-symbols-outlined">arrow_back</span>
            Back to Competitions
         </Link>
      </header>

      <main className="flex-1 mt-20 mb-32 px-4 md:px-6 max-w-5xl mx-auto w-full flex flex-col gap-12">
        <section className="bg-surface-container-lowest p-8 md:p-12 rounded-3xl shadow-sm text-center">
          <div className={`inline-block mb-4 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${
            isActive ? 'bg-tertiary-fixed text-on-tertiary-container' : 
            isUpcoming ? 'bg-secondary/10 text-secondary' : 
            'bg-surface-container text-on-surface-variant'
          }`}>
            {competition.status}
          </div>
          <h1 className="font-headline text-5xl font-medium text-primary mb-6">{competition.name}</h1>
          <p className="font-body text-on-surface-variant text-lg max-w-2xl mx-auto mb-8">{competition.description}</p>
          
          <div className="flex justify-center items-center gap-8 text-on-surface-variant mb-12">
            <div className="flex flex-col items-center">
              <span className="material-symbols-outlined text-3xl mb-2 opacity-80">schedule</span>
              <span className="font-bold">{new Date(competition.start_time).toLocaleDateString()}</span>
            </div>
            <div className="w-px h-12 bg-outline-variant/30"></div>
            <div className="flex flex-col items-center">
              <span className="material-symbols-outlined text-3xl mb-2 opacity-80">library_books</span>
              <span className="font-bold">{competition.question_count} Questions</span>
            </div>
          </div>

          {isActive && !myEntry && (
            <div className="max-w-xl mx-auto bg-primary/5 p-8 rounded-2xl border border-primary/20">
              <p className="font-body text-on-surface-variant mb-6 text-sm">
                <strong>Warning:</strong> Once you start, you cannot pause. You'll answer {competition.question_count} tossups.
              </p>
              <Link 
                href={`/competitions/${competition.id}/play`}
                className="block w-full bg-primary text-white py-6 rounded-xl font-bold text-3xl hover:bg-primary/90 transition-transform active:scale-95 shadow-xl shadow-primary/20"
              >
                Begin Competition
              </Link>
            </div>
          )}

          {myEntry && (
            <div className="max-w-3xl mx-auto bg-surface-container rounded-2xl p-8 border border-outline-variant/30">
              <h2 className="font-headline text-3xl text-primary mb-6">Your Results</h2>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                <div className="flex flex-col items-center p-4 bg-surface-container-lowest rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-slate-500 mb-1">Rank</span>
                  <span className="font-headline text-2xl font-bold">#{myEntry.rank}</span>
                </div>
                <div className="flex flex-col items-center p-4 bg-surface-container-lowest rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-slate-500 mb-1">Score</span>
                  <span className="font-headline text-2xl font-bold text-primary">{myEntry.score}</span>
                </div>
                <div className="flex flex-col items-center p-4 bg-surface-container-lowest rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-slate-500 mb-1">Powers</span>
                  <span className="font-headline text-2xl font-bold text-secondary">{myEntry.powers}</span>
                </div>
                <div className="flex flex-col items-center p-4 bg-surface-container-lowest rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-slate-500 mb-1">Tens</span>
                  <span className="font-headline text-2xl font-bold">{myEntry.tens}</span>
                </div>
                <div className="flex flex-col items-center p-4 bg-surface-container-lowest rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-slate-500 mb-1">Negs</span>
                  <span className="font-headline text-2xl font-bold text-error">{myEntry.negs}</span>
                </div>
                <div className="flex flex-col items-center p-4 bg-surface-container-lowest rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-slate-500 mb-1">Acc</span>
                  <span className="font-headline text-2xl font-bold">
                    {competition.question_count > 0 ? Math.round(((myEntry.powers + myEntry.tens) / competition.question_count) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>

        <section>
          <h2 className="font-headline text-3xl font-medium text-primary mb-6 flex items-center gap-3">
            <span className="material-symbols-outlined text-3xl">leaderboard</span>
            Leaderboard
          </h2>
          
          {entries.length === 0 ? (
            <div className="bg-surface-container p-8 rounded-2xl text-center text-on-surface-variant italic">
              No entries yet. Be the first!
            </div>
          ) : (
            <div className="bg-surface-container-lowest rounded-2xl shadow-sm overflow-hidden border border-outline-variant/20">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container text-[10px] uppercase tracking-widest text-slate-500 font-bold border-b border-outline-variant/30">
                    <th className="p-4">Rank</th>
                    <th className="p-4">Player</th>
                    <th className="p-4 text-right">Score</th>
                    <th className="p-4 text-right">Powers</th>
                    <th className="p-4 text-right">Tens</th>
                    <th className="p-4 text-right">Negs</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr 
                      key={entry.id || Math.random()} 
                      className={`border-b border-outline-variant/10 last:border-0 hover:bg-surface-container/50 transition-colors ${entry.is_current_user ? 'bg-primary/5' : ''}`}
                    >
                      <td className="p-4 font-headline text-xl font-bold">
                        {entry.rank === 1 && <span className="text-yellow-500">🥇 </span>}
                        {entry.rank === 2 && <span className="text-gray-400">🥈 </span>}
                        {entry.rank === 3 && <span className="text-amber-600">🥉 </span>}
                        {entry.rank > 3 && `#${entry.rank}`}
                      </td>
                      <td className="p-4 font-bold">{entry.player_name || 'Anonymous'} {entry.is_current_user && '(You)'}</td>
                      <td className="p-4 text-right font-headline text-xl text-primary font-bold">{entry.score}</td>
                      <td className="p-4 text-right text-secondary font-bold">{entry.powers}</td>
                      <td className="p-4 text-right font-bold">{entry.tens}</td>
                      <td className="p-4 text-right text-error font-bold">{entry.negs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
