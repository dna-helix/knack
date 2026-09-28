'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [isCoach, setIsCoach] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    
    // 1. Sign up user
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          role: isCoach ? 'coach' : 'player',
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (!authData.user) {
      setError('An unknown error occurred during signup');
      setLoading(false);
      return;
    }

    // 2. Handle team logic if applicable
    if (isCoach && teamName) {
      // Create team
      const { data: teamData, error: teamError } = await (supabase.from('teams') as any)
        .insert({ name: teamName, coach_id: authData.user.id })
        .select('id')
        .single();
        
      if (teamError) {
        console.error('Error creating team:', teamError);
        // We'll continue anyway as the user is created
      } else if (teamData) {
        // Update user profile with team_id
        await (supabase.from('profiles') as any)
          .update({ team_id: teamData.id })
          .eq('id', authData.user.id);
      }
    } else if (!isCoach && inviteCode) {
      // Join existing team via RPC
      const { error: joinError } = await (supabase as any).rpc('join_team', {
        p_invite_code: inviteCode,
      });
      
      if (joinError) {
        console.error('Error joining team:', joinError);
        // Continue anyway
      }
    }

    router.push('/');
    router.refresh();
  };

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="font-headline text-3xl text-primary font-medium tracking-tight">
          Join Your Team
        </h1>
        <p className="text-on-surface-variant">
          Create an account and join your quiz bowl team
        </p>
      </div>

      <form onSubmit={handleSignup} className="space-y-5">
        <div className="space-y-4">
          <input
            type="text"
            required
            placeholder="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full p-4 border-2 border-outline-variant rounded-xl focus:border-primary focus:outline-none bg-surface-container/30 transition-colors"
          />
          <input
            type="email"
            required
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-4 border-2 border-outline-variant rounded-xl focus:border-primary focus:outline-none bg-surface-container/30 transition-colors"
          />
          <input
            type="password"
            required
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-4 border-2 border-outline-variant rounded-xl focus:border-primary focus:outline-none bg-surface-container/30 transition-colors"
          />

          <div className="flex items-center gap-2 pt-2 pb-1 px-1">
            <input
              type="checkbox"
              id="isCoach"
              checked={isCoach}
              onChange={(e) => setIsCoach(e.target.checked)}
              className="w-5 h-5 rounded border-2 border-outline-variant text-primary focus:ring-primary"
            />
            <label htmlFor="isCoach" className="text-sm font-medium text-primary cursor-pointer select-none">
              I'm signing up as a Coach (create a new team)
            </label>
          </div>

          {isCoach ? (
            <div className="animate-in fade-in slide-in-from-top-2 duration-200">
              <input
                type="text"
                required={isCoach}
                placeholder="Team Name"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="w-full p-4 border-2 border-outline-variant rounded-xl focus:border-primary focus:outline-none bg-surface-container/30 transition-colors"
              />
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-top-2 duration-200 space-y-1">
              <input
                type="text"
                placeholder="Team Invite Code (Optional)"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="w-full p-4 border-2 border-outline-variant rounded-xl focus:border-primary focus:outline-none bg-surface-container/30 transition-colors"
              />
              <p className="text-xs text-on-surface-variant/70 px-1">
                Ask your coach for the invite code. You can also join a team later.
              </p>
            </div>
          )}
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
          {loading ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>

      <div className="text-center text-sm text-on-surface-variant">
        Already have an account?{' '}
        <Link href="/login" className="text-primary font-semibold hover:underline">
          Sign in
        </Link>
      </div>
    </div>
  );
}
