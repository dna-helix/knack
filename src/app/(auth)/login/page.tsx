'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    const redirectPath = searchParams.get('redirect') || '/';
    router.push(redirectPath);
    router.refresh();
  };

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="font-headline text-3xl text-primary font-medium tracking-tight">
          Welcome Back
        </h1>
        <p className="text-on-surface-variant">
          Sign in to continue your practice sessions
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-5">
        <div className="space-y-4">
          <div>
            <label className="sr-only" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-4 border-2 border-outline-variant rounded-xl focus:border-primary focus:outline-none bg-surface-container/30 transition-colors"
            />
          </div>
          <div>
            <label className="sr-only" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-4 border-2 border-outline-variant rounded-xl focus:border-primary focus:outline-none bg-surface-container/30 transition-colors"
            />
          </div>
        </div>

        {error && (
          <div className="text-error text-sm font-medium px-1 text-red-600">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-white p-4 rounded-xl font-bold hover:bg-primary/90 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div className="text-center text-sm text-on-surface-variant">
        Don't have an account?{' '}
        <Link href="/signup" className="text-primary font-semibold hover:underline">
          Sign up
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-center text-on-surface-variant p-8">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
