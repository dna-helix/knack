import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { total_score, questions_answered, powers, tens, negs, missed, ended_at } = body;

    // Verify ownership
    const { data: existingSession, error: fetchError } = await (supabase as any)
      .from('practice_sessions')
      .select('user_id')
      .eq('id', params.id)
      .single();

    if (fetchError || !existingSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (existingSession.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: updatedSession, error: updateError } = await (supabase as any)
      .from('practice_sessions')
      .update({
        total_score,
        questions_answered,
        powers,
        tens,
        negs,
        missed,
        ended_at: ended_at || new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json(updatedSession);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
