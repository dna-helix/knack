"use client";

import Link from 'next/link';
import { RecentMiss, useUserStats } from "@/lib/useUserStats";
import { useState } from 'react';
import { getPackDifficultyLevel, packCatalog } from "@/lib/packs";
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  CategoryScale,
  LinearScale,
  BarElement,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';

ChartJS.register(
  RadialLinearScale, PointElement, LineElement, Filler, Tooltip,
  CategoryScale, LinearScale, BarElement,
);

function getDayPartLabel() {
  const hour = new Date().getHours();

  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function formatCategoryList(categories: string[]) {
  if (categories.length === 0) return "";
  if (categories.length === 1) return categories[0];
  return `${categories[0]} and ${categories[1]}`;
}

function toPlainText(text: string) {
  return text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function truncate(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function renderDifficultyFires(level: number) {
  return (
    <div className="flex items-center gap-0.5" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <span
          key={index}
          className={`material-symbols-outlined text-sm ${index < level ? 'text-orange-500' : 'text-slate-300/60'}`}
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          local_fire_department
        </span>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { stats } = useUserStats();
  const [packFilter, setPackFilter] = useState("All");
  const [chartMode, setChartMode] = useState<'bars' | 'radar'>('bars');
  const [shuffleEnabled, setShuffleEnabled] = useState(true);
  const [selectedMiss, setSelectedMiss] = useState<RecentMiss | null>(null);
  
  const questionsFaced = stats?.tossupsSeen || 0;
  const rightAnswers = (stats?.powersBuzzed || 0) + (stats?.tensBuzzed || 0);
  const wrongAnswers = stats?.wrongAnswers || 0;
  const unansweredQuestions = stats?.unanswered || 0;
  const powerRate = questionsFaced ? ((stats!.powersBuzzed / questionsFaced) * 100).toFixed(1) : "0.0";
  const avgPoints = questionsFaced ? ((stats!.totalPoints) / questionsFaced).toFixed(2) : "0.00";
  const totalPoints = stats?.totalPoints || 0;
  const overallAccuracy = questionsFaced ? Math.round((rightAnswers / questionsFaced) * 100) : 0;
  const lightningAverageReaction = stats?.lightningSuccessfulBuzzes
    ? Math.round(stats.lightningTotalReactionMs / stats.lightningSuccessfulBuzzes)
    : null;
  const strongestCategories = stats
    ? Object.entries(stats.categories)
        .filter(([, data]) => data.seen > 0 && data.correct > 0)
        .sort((a, b) => {
          const accuracyDiff = (b[1].correct / b[1].seen) - (a[1].correct / a[1].seen);
          if (accuracyDiff !== 0) return accuracyDiff;
          return b[1].seen - a[1].seen;
        })
        .slice(0, 2)
        .map(([category]) => category)
    : [];
  const dayPart = getDayPartLabel();
  const heroMessage = questionsFaced
    ? `Your ${dayPart} accuracy is ${overallAccuracy}% across ${questionsFaced} questions faced${strongestCategories.length ? `, led by ${formatCategoryList(strongestCategories)}` : ''}. Select a module to begin.`
    : `Your ${dayPart} session stats will appear here as you practice. Select a module to begin.`;
  const recentMisses = stats?.recentMisses || [];
  const recentMissSubjects = Object.entries(
    recentMisses.reduce<Record<string, number>>((acc, miss) => {
      acc[miss.category] = (acc[miss.category] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  
  const allCategories = stats ? Object.entries(stats.categories).sort((a,b) => b[1].seen - a[1].seen) : [];
  const categories = chartMode === 'radar' ? allCategories : allCategories.slice(0, 6);
  const buildPracticeHref = (packId?: string, start?: number) => {
    const params = new URLSearchParams();
    if (packId) params.set('pack', packId);
    if (typeof start === 'number') params.set('start', String(start));
    params.set('shuffle', shuffleEnabled ? '1' : '0');
    return `/practice?${params.toString()}`;
  };

  return (
    <>
      <header className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-40 w-full border-b border-slate-100 dark:border-slate-800">
        <div className="flex justify-between items-center px-6 py-4 w-full">
          <div className="flex items-center gap-4">
            <span className="material-symbols-outlined text-blue-950 dark:text-blue-100">menu_book</span>
            <h1 className="font-headline font-medium text-2xl tracking-tight text-blue-950 dark:text-blue-100">Knack</h1>
          </div>
          <div className="flex items-center gap-6">
            <nav className="hidden md:flex gap-8 items-center">
              <Link href="/" className="font-headline italic font-bold text-blue-900 transition-colors">Home</Link>
              <Link href="/practice" className="font-headline italic font-bold text-slate-500 hover:bg-slate-200/50 transition-colors px-2 py-1">Practice</Link>
              <Link href="#" className="font-headline italic font-bold text-slate-500 hover:bg-slate-200/50 transition-colors px-2 py-1">History</Link>
            </nav>
            <span className="material-symbols-outlined text-blue-950 dark:text-blue-100">account_circle</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 pb-32">
        <div className="mb-12">
          <h2 className="font-headline text-5xl text-primary mb-2 leading-tight">Welcome back, Scholar.</h2>
          <p className="font-body text-on-surface-variant max-w-2xl">{heroMessage}</p>
        </div>

        {/* Knowledge Map */}
        <section className="mb-12 bg-white rounded-xl p-8 shadow-sm border border-outline-variant/10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h3 className="font-headline text-2xl text-primary">Knowledge Map</h3>
              <p className="font-body text-sm text-on-surface-variant">Subject-specific proficiency based on recent tossups</p>
            </div>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => setChartMode('bars')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-colors ${chartMode === 'bars' ? 'bg-primary text-white' : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'}`}
              >
                <span className="material-symbols-outlined text-sm align-middle mr-1">bar_chart</span>
                Bars
              </button>
              <button
                onClick={() => setChartMode('radar')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-colors ${chartMode === 'radar' ? 'bg-primary text-white' : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'}`}
              >
                <span className="material-symbols-outlined text-sm align-middle mr-1">radar</span>
                Radar
              </button>
              <span className="bg-primary-container/10 text-primary-container px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide hidden md:inline">NAQT Curriculum</span>
            </div>
          </div>

          {chartMode === 'bars' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-8">
            {categories.map(([category, data]) => {
                const percentage = data.seen > 0 ? Math.round((data.correct / data.seen) * 100) : 0;
                return (
                  <div key={category} className="space-y-2">
                    <div className="flex justify-between items-baseline">
                      <span className="font-headline italic text-lg text-primary">{category}</span>
                      <span className="text-sm font-bold text-secondary">{percentage}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${percentage}%` }}></div>
                    </div>
                  </div>
                );
            })}
            {categories.length === 0 && (
                <div className="col-span-3 text-center text-on-surface-variant italic p-8">Complete some practice sessions to populate your knowledge map!</div>
            )}
          </div>
          ) : (
          <div className="flex justify-center" style={{ maxHeight: '380px' }}>
            {categories.length > 0 ? (
              <Radar
                data={{
                  labels: categories.map(([cat]) => cat),
                  datasets: [{
                    label: 'Proficiency %',
                    data: categories.map(([, d]) => d.seen > 0 ? Math.round((d.correct / d.seen) * 100) : 0),
                    backgroundColor: 'rgba(0, 10, 30, 0.15)',
                    borderColor: '#002147',
                    borderWidth: 2,
                    pointBackgroundColor: '#000a1e',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                  }]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: true,
                  scales: {
                    r: {
                      beginAtZero: true,
                      max: 100,
                      ticks: { stepSize: 25, font: { family: 'Manrope', size: 10 }, backdropColor: 'transparent' },
                      grid: { color: 'rgba(0,0,0,0.06)' },
                      pointLabels: { font: { family: 'Newsreader', size: 13, style: 'italic' as const }, color: '#000a1e' },
                    }
                  },
                  plugins: { tooltip: { bodyFont: { family: 'Manrope' } } }
                }}
              />
            ) : (
              <div className="text-center text-on-surface-variant italic p-8">Complete some practice sessions to populate your radar!</div>
            )}
          </div>
          )}
        </section>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-8 space-y-8">
            <section className="bg-surface-container-low rounded-xl p-8 border border-outline-variant/10">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-headline text-2xl text-primary">New Practice Session</h3>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setShuffleEnabled(s => !s)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold tracking-wide transition-colors ${shuffleEnabled ? 'bg-secondary text-white' : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'}`}
                  >
                    <span className="material-symbols-outlined text-sm">shuffle</span>
                    Shuffle
                  </button>
                  <span className="text-xs font-bold uppercase tracking-widest text-secondary">{packCatalog.length} Packs</span>
                </div>
              </div>
              <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                {['All', 'History', 'Science', 'Literature', 'Mixed'].map(f => (
                   <button 
                      key={f}
                      onClick={() => setPackFilter(f)}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-colors ${packFilter === f ? 'bg-primary text-white' : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'}`}
                   >
                     {f}
                   </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {packCatalog.filter(p => packFilter === 'All' || p.focus === packFilter).map(pack => {
                  const progress = stats?.packProgress?.[pack.id] || 0;
                  const difficultyLevel = getPackDifficultyLevel(pack);
                  return (
                  <div key={pack.id} className="group flex flex-col items-start p-6 bg-surface-container-lowest rounded-lg text-left transition-all duration-150 border border-outline-variant/10 hover:border-outline-variant/30 hover:shadow-xl hover:shadow-primary-container/5 relative">
                    {progress > 0 && (
                       <div className="absolute top-4 right-4 bg-tertiary-fixed text-on-tertiary-container text-[10px] font-bold px-2 py-1 rounded-full">
                          ON Q{progress + 1}
                       </div>
                    )}
                    <div className={`text-white p-3 rounded-lg mb-4 ${pack.focus.toLowerCase() === 'history' ? 'bg-blue-800' : pack.focus.toLowerCase() === 'science' ? 'bg-emerald-800' : pack.focus.toLowerCase() === 'literature' ? 'bg-purple-800' : 'bg-secondary'}`}>
                      <span className="material-symbols-outlined">
                         {pack.focus.toLowerCase() === 'mixed' ? 'dashboard_customize' : 'auto_stories'}
                      </span>
                    </div>
                    <span className="font-headline text-xl text-primary mb-1">{pack.title}</span>
                    <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                      <span className="font-body">{pack.questionCount} Tossups</span>
                      <span aria-hidden="true">•</span>
                      <span className="font-body">{pack.audience || 'General'}</span>
                      <span aria-hidden="true">•</span>
                      <div title={`${pack.difficulty} difficulty`} aria-label={`${pack.difficulty} difficulty`}>
                        {renderDifficultyFires(difficultyLevel)}
                      </div>
                    </div>
                    
                    {progress > 0 ? (
                       <div className="mt-auto pt-4 w-full flex gap-3 border-t border-outline-variant/10">
                         <Link href={buildPracticeHref(pack.id, progress)} className="flex-1 bg-primary text-white py-2 px-4 rounded font-bold text-xs text-center hover:bg-primary/90 transition-colors active:scale-95">
                            Resume
                         </Link>
                         <Link href={buildPracticeHref(pack.id, 0)} className="flex-1 bg-surface-container hover:bg-surface-container-highest text-primary py-2 px-4 rounded font-bold text-xs text-center transition-colors active:scale-95">
                            Restart
                         </Link>
                       </div>
                    ) : (
                       <Link href={buildPracticeHref(pack.id, 0)} className="mt-auto w-full pt-4 border-t border-outline-variant/10 font-bold text-xs text-primary group-hover:text-tertiary transition-colors flex items-center justify-between">
                          Start Practice <span className="material-symbols-outlined text-sm transition-transform group-hover:translate-x-1">arrow_forward</span>
                       </Link>
                    )}
                  </div>
                );})}
                {packCatalog.filter(p => packFilter === 'All' || p.focus === packFilter).length === 0 && (
                    <div className="col-span-1 sm:col-span-2 text-center p-8 text-on-surface-variant italic">
                      End of archive for this category.
                    </div>
                )}
              </div>
              <div className="mt-8 pt-8 border-t border-outline-variant/20 flex flex-wrap gap-4">
                <Link href={buildPracticeHref(undefined, 0)} className="bg-primary hover:bg-primary-container text-white px-8 py-4 rounded-lg font-body font-bold flex items-center gap-3 transition-all active:scale-95">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
                  START RAPID FIRE
                </Link>
                <Link href="/en-lightning" className="bg-secondary hover:bg-secondary/90 text-white px-8 py-4 rounded-lg font-body font-bold flex items-center gap-3 transition-all active:scale-95">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>flash_on</span>
                  START EN-LIGHTNING ROUND
                </Link>
              </div>
            </section>
          </div>

          <div className="md:col-span-4 space-y-8">
            <section className="bg-primary text-white rounded-xl p-8 relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="font-headline text-xl mb-8 opacity-80 italic">Personal Performance</h3>
                <div className="space-y-10">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-widest text-primary-fixed-dim mb-2">Power Rate</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-headline font-bold italic">{powerRate}%</span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-widest text-primary-fixed-dim mb-2">Avg 10 (Points)</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-headline font-bold italic">{avgPoints}</span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-widest text-primary-fixed-dim mb-2">Total Points</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-headline font-bold italic">{totalPoints}</span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-widest text-primary-fixed-dim mb-2">Days Practiced</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-headline font-bold italic">{stats?.streak || 0}</span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-widest text-primary-fixed-dim mb-2">Questions Faced</span>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-headline font-bold italic">
                      <span
                        className="text-white"
                        title="Total questions faced across your practice sessions."
                      >
                        {questionsFaced}
                      </span>
                      <span className="text-primary-fixed-dim">/</span>
                      <span
                        className="text-emerald-300"
                        title="Questions answered correctly for points."
                      >
                        {rightAnswers}
                      </span>
                      <span className="text-primary-fixed-dim">/</span>
                      <span
                        className="text-red-300"
                        title="Questions answered incorrectly."
                      >
                        {wrongAnswers}
                      </span>
                      <span className="text-primary-fixed-dim">/</span>
                      <span
                        className="text-amber-300"
                        title="Questions that timed out without a valid answer."
                      >
                        {unansweredQuestions}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-primary text-white rounded-xl p-8 relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="font-headline text-xl mb-3 opacity-80 italic">en-lightning round</h3>
                <p className="font-body text-primary-fixed-dim mb-8">
                  Reaction training with a spoken BUZZ cue hidden inside random questions.
                </p>
                <div className="space-y-10">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-widest text-primary-fixed-dim mb-2">Average Reaction</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-headline font-bold italic">
                        {lightningAverageReaction !== null ? `${lightningAverageReaction} ms` : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-widest text-primary-fixed-dim mb-2">Best Reaction</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-headline font-bold italic">
                        {stats?.lightningBestReactionMs !== null && stats?.lightningBestReactionMs !== undefined
                          ? `${stats.lightningBestReactionMs} ms`
                          : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-widest text-primary-fixed-dim mb-2">Successful Buzzes</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-headline font-bold italic">{stats?.lightningSuccessfulBuzzes || 0}</span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-widest text-primary-fixed-dim mb-2">False Starts</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-headline font-bold italic">{stats?.lightningFalseStarts || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-surface-container-low rounded-xl p-8 border border-outline-variant/10">
              <h3 className="font-headline text-2xl text-primary mb-6">Recent Misses</h3>
              {recentMisses.length > 0 ? (
                <div className="space-y-6">
                  <div className="flex flex-wrap gap-2">
                    {recentMissSubjects.slice(0, 4).map(([subject, count]) => (
                      <span
                        key={subject}
                        className="rounded-full bg-error-container/60 px-3 py-1 text-xs font-bold uppercase tracking-wide text-on-error-container"
                      >
                        {subject} x{count}
                      </span>
                    ))}
                  </div>
                  <div className="space-y-4">
                    {recentMisses.slice(0, 5).map(miss => (
                      <button
                        key={`${miss.questionId}:${miss.recordedAt}`}
                        onClick={() => setSelectedMiss(miss)}
                        className="w-full rounded-lg border border-outline-variant/10 bg-surface-container-lowest p-4 text-left transition-colors hover:bg-surface-container hover:border-outline-variant/30"
                        type="button"
                      >
                        <div className="mb-2 flex items-center justify-between gap-4">
                          <span className="text-xs font-bold uppercase tracking-widest text-error">
                            {miss.result === 'neg' ? 'Neg' : miss.result === 'unanswered' ? 'Unanswered' : 'Dead Tossup'}
                          </span>
                          <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                            {miss.category}
                          </span>
                        </div>
                        <p className="font-body text-sm leading-relaxed text-on-surface-variant">
                          {truncate(miss.question, 150)}
                        </p>
                        <p className="mt-2 font-body text-xs uppercase tracking-wide text-slate-500">
                          Answer: {truncate(toPlainText(miss.answer), 80)}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="font-body italic text-on-surface-variant">
                  Your recent misses will appear here once you start practicing.
                </p>
              )}
            </section>
          </div>
        </div>
      </main>
      {selectedMiss && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-surface shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between bg-primary px-6 py-4 text-white">
              <div>
                <h3 className="font-headline text-xl">Recent Miss</h3>
                <p className="text-xs uppercase tracking-widest text-primary-fixed-dim">{selectedMiss.category}</p>
              </div>
              <button
                onClick={() => setSelectedMiss(null)}
                className="h-10 w-10 rounded-full border border-white/20 text-2xl leading-none transition-colors hover:bg-white/10"
                type="button"
              >
                x
              </button>
            </div>
            <div className="space-y-6 p-6 md:p-8">
              <div>
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Full Question</span>
                <p className="font-headline text-xl leading-relaxed text-primary-container italic whitespace-pre-wrap">
                  {selectedMiss.question}
                </p>
              </div>
              <div>
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Answer</span>
                <div className="font-headline text-2xl font-bold italic text-primary" dangerouslySetInnerHTML={{ __html: selectedMiss.answer }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
