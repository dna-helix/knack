import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const competitionId = params.id;
    const body = await req.json();
    const { total_score, powers, tens, negs, category_breakdown, completed_at } = body;

    // Upsert entry
    const { data: entry, error: upsertError } = await (supabase as any)
      .from('competition_entries')
      .upsert({
        competition_id: competitionId,
        user_id: user.id,
        total_score,
        powers,
        tens,
        negs,
        category_breakdown,
        completed_at: completed_at || new Date().toISOString(),
      }, { onConflict: 'competition_id,user_id' })
      .select()
      .single();

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    // Recalculate ranks
    const { data: allEntries, error: fetchError } = await (supabase as any)
      .from('competition_entries')
      .select('id, total_score')
      .eq('competition_id', competitionId)
      .order('total_score', { ascending: false });

    if (!fetchError && allEntries) {
      let currentRank = 1;
      for (let i = 0; i < allEntries.length; i++) {
        if (i > 0 && allEntries[i].total_score < allEntries[i - 1].total_score) {
          currentRank = i + 1;
        }
        await (supabase as any)
          .from('competition_entries')
          .update({ rank: currentRank })
          .eq('id', allEntries[i].id);
      }
    }

    // Fetch updated entry
    const { data: updatedEntry } = await (supabase as any)
      .from('competition_entries')
      .select('*')
      .eq('id', entry.id)
      .single();

    return NextResponse.json(updatedEntry || entry, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

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

    const competitionId = params.id;

    const { data: entries, error } = await (supabase as any)
      .from('competition_entries')
      .select(`
        *,
        profiles:user_id (
          display_name,
          avatar_url
        )
      `)
      .eq('competition_id', competitionId)
      .order('total_score', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ entries: entries || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
