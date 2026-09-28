import React from 'react';
import Link from 'next/link';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface flex flex-col font-body">
      {/* Header */}
      <header className="p-6 flex justify-center lg:justify-start w-full max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="material-symbols-outlined text-primary text-3xl group-hover:scale-110 transition-transform">
            menu_book
          </span>
          <span className="font-headline text-3xl text-primary font-semibold tracking-tight">
            Knack
          </span>
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/30 p-8 md:p-12 w-full max-w-md">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="p-8 text-center text-on-surface-variant/70 text-sm">
        <p>© 2026 Knack</p>
      </footer>
    </div>
  );
}
