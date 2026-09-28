import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's team_id
    const { data: profile, error: profileError } = await (supabase as any)
      .from('profiles')
      .select('team_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || !profile.team_id) {
      return NextResponse.json({ error: 'User not associated with a team' }, { status: 400 });
    }

    const teamId = profile.team_id;
    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') || 'week'; // week, month, all
    const type = searchParams.get('type') || 'overall'; // overall, power_rate, activity

    let leaderboard: any[] = [];

    if (type === 'overall' || type === 'power_rate') {
      const { data, error } = await (supabase as any).rpc('get_team_leaderboard', {
        p_team_id: teamId,
        p_period: period
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      leaderboard = data || [];

      if (type === 'power_rate') {
        leaderboard.sort((a: any, b: any) => b.power_rate - a.power_rate);
      }
    } else if (type === 'activity') {
      let fromDate = new Date();
      if (period === 'week') {
        fromDate.setDate(fromDate.getDate() - 7);
      } else if (period === 'month') {
        fromDate.setMonth(fromDate.getMonth() - 1);
      } else {
        fromDate = new Date(0); // all time
      }

      const { data: activityData, error: activityError } = await (supabase as any)
        .from('question_results')
        .select(`
          user_id,
          profiles!inner(display_name, team_id)
        `)
        .eq('profiles.team_id', teamId)
        .gte('created_at', fromDate.toISOString());

      if (activityError) {
        return NextResponse.json({ error: activityError.message }, { status: 500 });
      }

      const userCounts = (activityData || []).reduce((acc: any, curr: any) => {
        const uid = curr.user_id;
        if (!acc[uid]) {
          acc[uid] = {
            user_id: uid,
            display_name: curr.profiles.display_name,
            question_count: 0
          };
        }
        acc[uid].question_count++;
        return acc;
      }, {});

      leaderboard = Object.values(userCounts).sort((a: any, b: any) => b.question_count - a.question_count);
    }

    return NextResponse.json({ leaderboard, period, type });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
