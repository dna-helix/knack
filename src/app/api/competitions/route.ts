import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
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
      return NextResponse.json({ error: 'Forbidden. Coach or admin role required.' }, { status: 403 });
    }

    if (!profile.team_id) {
      return NextResponse.json({ error: 'User not associated with a team' }, { status: 400 });
    }

    const body = await req.json();
    const { name, description, pack_id, question_count, start_time, end_time } = body;

    if (!name || !pack_id || !start_time || !end_time) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data: competition, error } = await (supabase as any)
      .from('competitions')
      .insert({
        team_id: profile.team_id,
        created_by: user.id,
        name,
        description,
        pack_id,
        question_count: question_count || 50,
        start_time,
        end_time
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(competition, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await (supabase as any)
      .from('profiles')
      .select('team_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || !profile.team_id) {
      return NextResponse.json({ error: 'User not associated with a team' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    let query = (supabase as any)
      .from('competitions')
      .select('*')
      .eq('team_id', profile.team_id)
      .order('start_time', { ascending: true });

    const now = new Date().toISOString();

    if (status === 'active') {
      query = query.lte('start_time', now).gte('end_time', now);
    } else if (status === 'upcoming') {
      query = query.gt('start_time', now);
    } else if (status === 'completed') {
      query = query.lt('end_time', now);
    }

    const { data: competitions, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ competitions: competitions || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
