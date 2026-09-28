import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await (supabase as any)
      .from('profiles')
      .select('role, team_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (profile.role !== 'coach' && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!profile.team_id) {
      return NextResponse.json({ error: 'No team associated' }, { status: 400 });
    }

    const teamId = profile.team_id;

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const { data: teamMembers } = await (supabase as any)
      .from('profiles')
      .select('id, display_name')
      .eq('team_id', teamId);
      
    const memberIds = teamMembers?.map((m: any) => m.id) || [];
    
    const { data: recentQuestions } = await (supabase as any)
      .from('question_results')
      .select('result, category')
      .in('user_id', memberIds)
      .gte('created_at', oneWeekAgo.toISOString());
      
    const questionsCount = recentQuestions?.length || 0;
    const correctCount = recentQuestions?.filter((q: any) => q.result === 'power' || q.result === 'ten').length || 0;
    const teamAvgAccuracy = questionsCount > 0 ? (correctCount / questionsCount) * 100 : 0;
    
    const { count: totalPracticeSessions } = await (supabase as any)
      .from('practice_sessions')
      .select('id', { count: 'exact', head: true })
      .in('user_id', memberIds)
      .gte('started_at', oneWeekAgo.toISOString());

    // Category Breakdown
    const { data: allQuestions } = await (supabase as any)
      .from('question_results')
      .select('category, result')
      .in('user_id', memberIds);

    const categoryMap: Record<string, { total: number; correct: number }> = {};
    allQuestions?.forEach((q: any) => {
      if (!categoryMap[q.category]) {
        categoryMap[q.category] = { total: 0, correct: 0 };
      }
      categoryMap[q.category].total += 1;
      if (q.result === 'power' || q.result === 'ten') {
        categoryMap[q.category].correct += 1;
      }
    });

    const categoryBreakdown = Object.keys(categoryMap).map(cat => ({
      category: cat,
      accuracy: (categoryMap[cat].correct / categoryMap[cat].total) * 100
    }));

    // Player Summaries
    const { data: playerStatsData } = await (supabase as any)
      .from('question_results')
      .select('user_id, result, created_at')
      .in('user_id', memberIds);
      
    const playerSummariesMap: Record<string, any> = {};
    memberIds.forEach((id: string) => {
      const member = teamMembers?.find((m: any) => m.id === id);
      playerSummariesMap[id] = {
        user_id: id,
        display_name: member?.display_name || 'Unknown',
        total_questions: 0,
        correct_questions: 0,
        power_questions: 0,
        last_active: null
      };
    });
    
    playerStatsData?.forEach((q: any) => {
      const p = playerSummariesMap[q.user_id];
      if (p) {
        p.total_questions += 1;
        if (q.result === 'power' || q.result === 'ten') {
          p.correct_questions += 1;
        }
        if (q.result === 'power') {
          p.power_questions += 1;
        }
        if (!p.last_active || new Date(q.created_at) > new Date(p.last_active)) {
          p.last_active = q.created_at;
        }
      }
    });

    const playerSummaries = Object.values(playerSummariesMap).map((p: any) => ({
      user_id: p.user_id,
      display_name: p.display_name,
      total_questions: p.total_questions,
      accuracy: p.total_questions > 0 ? (p.correct_questions / p.total_questions) * 100 : 0,
      power_rate: p.total_questions > 0 ? (p.power_questions / p.total_questions) * 100 : 0,
      last_active: p.last_active
    }));

    // Activity Data (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    const { data: activityRaw } = await (supabase as any)
      .from('question_results')
      .select('created_at')
      .in('user_id', memberIds)
      .gte('created_at', ninetyDaysAgo.toISOString());
      
    const activityCountByDate: Record<string, number> = {};
    activityRaw?.forEach((a: any) => {
      const date = a.created_at.split('T')[0];
      activityCountByDate[date] = (activityCountByDate[date] || 0) + 1;
    });
    
    const activityData = Object.keys(activityCountByDate).sort().map(date => ({
      date,
      question_count: activityCountByDate[date]
    }));

    return NextResponse.json({
      teamStats: {
        total_questions_this_week: questionsCount,
        team_avg_accuracy: teamAvgAccuracy,
        total_practice_sessions: totalPracticeSessions || 0
      },
      categoryBreakdown,
      playerSummaries,
      activityData
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
