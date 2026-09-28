"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  
  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/');
        return;
      }
      // Assuming authorization check happens effectively here or in API
      setAuthorized(true);
    };
    checkAuth();
  }, [router]);

  if (authorized === null) {
    return <div className="min-h-screen bg-surface flex justify-center items-center"><span className="material-symbols-outlined animate-spin text-4xl text-primary">sync</span></div>;
  }

  const navItems = [
    { label: 'Overview', path: '/coach', icon: 'dashboard' },
    { label: 'Players', path: '/coach/players', icon: 'group' },
    { label: 'Competitions', path: '/coach/competitions', icon: 'emoji_events' },
  ];

  return (
    <div className="min-h-screen bg-surface flex flex-col md:flex-row">
      {/* Mobile Top Nav */}
      <div className="md:hidden bg-surface-container-lowest border-b border-surface-container flex overflow-x-auto p-4 gap-2 sticky top-0 z-50">
        {navItems.map(item => {
          const isActive = pathname === item.path || (pathname.startsWith('/coach/players') && item.path === '/coach/players');
          return (
            <Link 
              key={item.path} 
              href={item.path}
              className={`flex items-center gap-2 px-4 py-2 rounded-full font-body text-sm whitespace-nowrap transition-colors ${
                isActive ? 'bg-primary text-white' : 'text-on-surface hover:bg-surface-container'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Desktop Side Nav */}
      <div className="hidden md:flex flex-col w-64 bg-surface-container-lowest border-r border-surface-container p-6 sticky top-0 h-screen overflow-y-auto shrink-0">
        <div className="mb-10 px-2">
          <Link href="/" className="font-headline text-2xl text-primary italic">Knack Coach</Link>
        </div>
        <nav className="flex flex-col gap-2 flex-1">
          {navItems.map(item => {
            const isActive = pathname === item.path || (pathname.startsWith('/coach/players') && item.path === '/coach/players');
            return (
              <Link 
                key={item.path} 
                href={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-body font-medium transition-colors ${
                  isActive ? 'bg-primary text-white shadow-md' : 'text-on-surface hover:bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 w-full bg-surface pb-20 md:pb-0 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
