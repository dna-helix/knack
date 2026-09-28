"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Competition {
  id: string;
  name: string;
  description: string;
  pack_name: string;
  question_count: number;
  start_time: string;
  end_time: string;
  participant_count: number;
  status: 'active' | 'upcoming' | 'completed';
}

export default function CompetitionsPage() {
  const [active, setActive] = useState<Competition[]>([]);
  const [upcoming, setUpcoming] = useState<Competition[]>([]);
  const [completed, setCompleted] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('player'); 

  useEffect(() => {
    fetch('/api/user/profile').then(res => res.json()).then(data => {
      if (data.role) setUserRole(data.role);
    }).catch(() => {});

    Promise.all([
      fetch('/api/competitions?status=active').then(res => res.ok ? res.json() : []),
      fetch('/api/competitions?status=upcoming').then(res => res.ok ? res.json() : []),
      fetch('/api/competitions?status=completed').then(res => res.ok ? res.json() : []),
    ]).then(([activeData, upcomingData, completedData]) => {
      setActive(Array.isArray(activeData) ? activeData : activeData.data || []);
      setUpcoming(Array.isArray(upcomingData) ? upcomingData : upcomingData.data || []);
      setCompleted(Array.isArray(completedData) ? completedData : completedData.data || []);
      setLoading(false);
    }).catch(e => {
      console.error(e);
      setLoading(false);
    });
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

  const renderCard = (comp: Competition) => {
    let badgeClass = "";
    let badgeText = "";
    if (comp.status === 'active') {
      badgeClass = "bg-tertiary-fixed text-on-tertiary-container";
      badgeText = "Active";
    } else if (comp.status === 'upcoming') {
      badgeClass = "bg-secondary/10 text-secondary";
      badgeText = "Upcoming";
    } else {
      badgeClass = "bg-surface-container text-on-surface-variant";
      badgeText = "Completed";
    }

    return (
      <Link href={`/competitions/${comp.id}`} key={comp.id} className="block group">
        <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm transition-transform group-hover:-translate-y-1 group-hover:shadow-md h-full flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-headline text-2xl text-primary font-medium">{comp.name}</h3>
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${badgeClass}`}>
              {badgeText}
            </span>
          </div>
          {comp.description && (
            <p className="font-body text-on-surface-variant mb-6 flex-1">{comp.description}</p>
          )}
          <div className="flex flex-col gap-2 text-sm text-on-surface-variant mt-auto">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">library_books</span>
              <span className="font-bold">{comp.pack_name}</span> ({comp.question_count} questions)
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">schedule</span>
              <span>{formatDate(comp.start_time)} – {formatDate(comp.end_time)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">group</span>
              <span>{comp.participant_count ?? 0} participants</span>
            </div>
          </div>
        </div>
      </Link>
    );
  };

  return (
    <>
      <header className="bg-slate-50 dark:bg-slate-900 flex justify-between items-center px-4 md:px-6 py-4 w-full fixed top-0 z-50">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <span className="material-symbols-outlined text-blue-950 dark:text-blue-100">menu_book</span>
            <h1 className="font-headline font-medium text-2xl tracking-tight text-blue-950 dark:text-blue-100">Knack</h1>
          </Link>
          <nav className="hidden md:flex items-center gap-4 text-sm font-bold text-slate-500 uppercase tracking-wider">
            <Link href="/" className="hover:text-primary transition-colors">Home</Link>
            <Link href="/practice" className="hover:text-primary transition-colors">Practice</Link>
            <Link href="/leaderboard" className="hover:text-primary transition-colors">Leaderboard</Link>
            <span className="text-primary border-b-2 border-primary pb-1">Competitions</span>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {(userRole === 'coach' || userRole === 'admin') && (
            <button className="bg-primary text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-primary/90 transition-colors">
              Create Competition
            </button>
          )}
          <span className="material-symbols-outlined text-blue-950 dark:text-blue-100 text-3xl">account_circle</span>
        </div>
      </header>

      <main className="flex-1 mt-20 mb-32 px-4 md:px-6 max-w-5xl mx-auto w-full flex flex-col gap-12">
        {loading ? (
          <div className="py-20 text-center font-headline text-2xl text-on-surface-variant animate-pulse">Loading competitions...</div>
        ) : (
          <>
            <section>
              <h2 className="font-headline text-3xl font-medium text-primary mb-6">Active Now</h2>
              {active.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {active.map(renderCard)}
                </div>
              ) : (
                <div className="bg-surface-container rounded-2xl p-12 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-4xl mb-4 opacity-50">event_busy</span>
                  <p className="font-headline text-xl">No active competitions right now.</p>
                </div>
              )}
            </section>

            <section>
              <h2 className="font-headline text-3xl font-medium text-primary mb-6">Upcoming</h2>
              {upcoming.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {upcoming.map(renderCard)}
                </div>
              ) : (
                <div className="bg-surface-container rounded-2xl p-12 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-4xl mb-4 opacity-50">calendar_month</span>
                  <p className="font-headline text-xl">No upcoming competitions scheduled.</p>
                </div>
              )}
            </section>

            <section>
              <h2 className="font-headline text-3xl font-medium text-primary mb-6">Past Competitions</h2>
              {completed.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {completed.map(renderCard)}
                </div>
              ) : (
                <div className="bg-surface-container rounded-2xl p-12 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-4xl mb-4 opacity-50">history</span>
                  <p className="font-headline text-xl">No past competitions to show.</p>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
