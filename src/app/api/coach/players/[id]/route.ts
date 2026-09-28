import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: coachProfile, error: profileError } = await (supabase as any)
      .from('profiles')
      .select('role, team_id')
      .eq('id', user.id)
      .single();

    if (profileError || !coachProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (coachProfile.role !== 'coach' && coachProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const playerId = params.id;

    // Verify player is on same team
    const { data: playerProfile, error: playerError } = await (supabase as any)
      .from('profiles')
      .select('*')
      .eq('id', playerId)
      .single();

    if (playerError || !playerProfile) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    if (playerProfile.team_id !== coachProfile.team_id) {
      return NextResponse.json({ error: 'Player not on your team' }, { status: 403 });
    }

    // Category Stats
    const { data: questions } = await (supabase as any)
      .from('question_results')
      .select('category, result')
      .eq('user_id', playerId);

    const categoryMap: Record<string, { seen: number; correct: number }> = {};
    questions?.forEach((q: any) => {
      if (!categoryMap[q.category]) {
        categoryMap[q.category] = { seen: 0, correct: 0 };
      }
      categoryMap[q.category].seen += 1;
      if (q.result === 'power' || q.result === 'ten') {
        categoryMap[q.category].correct += 1;
      }
    });

    const categoryStats = Object.keys(categoryMap).map(cat => ({
      category: cat,
      seen: categoryMap[cat].seen,
      correct: categoryMap[cat].correct,
      accuracy: Math.round((categoryMap[cat].correct / categoryMap[cat].seen) * 100)
    }));

    const weakCategories = categoryStats.filter(c => c.seen >= 5 && c.accuracy < 50);

    // Recent Sessions
    const { data: recentSessions } = await (supabase as any)
      .from('practice_sessions')
      .select('*')
      .eq('user_id', playerId)
      .order('started_at', { ascending: false })
      .limit(10);

    // Performance Trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: trendQuestions } = await (supabase as any)
      .from('question_results')
      .select('result, points, created_at')
      .eq('user_id', playerId)
      .gte('created_at', thirtyDaysAgo.toISOString());

    const trendByDate: Record<string, { total: number; correct: number; points: number }> = {};
    trendQuestions?.forEach((q: any) => {
      const date = q.created_at.split('T')[0];
      if (!trendByDate[date]) {
        trendByDate[date] = { total: 0, correct: 0, points: 0 };
      }
      trendByDate[date].total += 1;
      if (q.result === 'power' || q.result === 'ten') {
        trendByDate[date].correct += 1;
      }
      trendByDate[date].points += q.points;
    });

    const performanceTrend = Object.keys(trendByDate).sort().map(date => ({
      date,
      accuracy: Math.round((trendByDate[date].correct / trendByDate[date].total) * 100),
      points: trendByDate[date].points
    }));

    return NextResponse.json({
      profile: playerProfile,
      categoryStats,
      recentSessions: recentSessions || [],
      performanceTrend,
      weakCategories
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
