-- ============================================================
-- Knack Backend — Initial Schema Migration
-- ============================================================
-- Run with: supabase db push  (or via Supabase Dashboard SQL Editor)
-- ============================================================

-- ── Enable required extensions ──────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Teams ───────────────────────────────────────────────────
create table public.teams (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  invite_code text not null unique default substr(md5(random()::text), 1, 8),
  coach_id    uuid,  -- references profiles.id, added after profiles table
  created_at  timestamptz not null default now()
);

-- ── Profiles (extends auth.users) ───────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text not null,
  avatar_url   text,
  role         text not null default 'player' check (role in ('player', 'coach', 'admin')),
  team_id      uuid references public.teams(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Now add the coach FK on teams
alter table public.teams
  add constraint teams_coach_id_fkey
  foreign key (coach_id) references public.profiles(id) on delete set null;

-- ── Practice Sessions ───────────────────────────────────────
create table public.practice_sessions (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  pack_id            text not null,
  total_score        int not null default 0,
  questions_answered int not null default 0,
  powers             int not null default 0,
  tens               int not null default 0,
  negs               int not null default 0,
  missed             int not null default 0,
  started_at         timestamptz not null default now(),
  ended_at           timestamptz
);

-- ── Question Results ────────────────────────────────────────
create table public.question_results (
  id                  uuid primary key default uuid_generate_v4(),
  session_id          uuid not null references public.practice_sessions(id) on delete cascade,
  user_id             uuid not null references public.profiles(id) on delete cascade,
  question_id         text,
  category            text not null,
  subcategory         text,
  result              text not null check (result in ('power', 'ten', 'neg', 'none')),
  points              int not null default 0,
  buzz_word_index     int,
  time_to_answer_sec  real,
  created_at          timestamptz not null default now()
);

-- ── Competitions ────────────────────────────────────────────
create table public.competitions (
  id             uuid primary key default uuid_generate_v4(),
  name           text not null,
  description    text,
  created_by     uuid not null references public.profiles(id) on delete cascade,
  team_id        uuid not null references public.teams(id) on delete cascade,
  pack_id        text not null,
  question_count int not null default 50,
  status         text not null default 'upcoming' check (status in ('upcoming', 'active', 'completed', 'cancelled')),
  start_time     timestamptz not null,
  end_time       timestamptz not null,
  created_at     timestamptz not null default now()
);

-- ── Competition Entries ─────────────────────────────────────
create table public.competition_entries (
  id                  uuid primary key default uuid_generate_v4(),
  competition_id      uuid not null references public.competitions(id) on delete cascade,
  user_id             uuid not null references public.profiles(id) on delete cascade,
  total_score         int not null default 0,
  powers              int not null default 0,
  tens                int not null default 0,
  negs                int not null default 0,
  rank                int,
  category_breakdown  jsonb default '{}',
  started_at          timestamptz not null default now(),
  completed_at        timestamptz,

  -- Each user can only enter a competition once
  unique (competition_id, user_id)
);

-- ============================================================
-- Indexes
-- ============================================================

create index idx_profiles_team_id on public.profiles(team_id);
create index idx_practice_sessions_user_id on public.practice_sessions(user_id);
create index idx_practice_sessions_started_at on public.practice_sessions(started_at);
create index idx_question_results_user_id on public.question_results(user_id);
create index idx_question_results_session_id on public.question_results(session_id);
create index idx_question_results_category on public.question_results(category);
create index idx_question_results_created_at on public.question_results(created_at);
create index idx_competitions_team_id on public.competitions(team_id);
create index idx_competitions_status on public.competitions(status);
create index idx_competition_entries_competition_id on public.competition_entries(competition_id);
create index idx_competition_entries_user_id on public.competition_entries(user_id);

-- ============================================================
-- Row-Level Security (RLS)
-- ============================================================

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.question_results enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_entries enable row level security;

-- ── Profiles policies ───────────────────────────────────────

-- Users can read their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can view teammates' profiles (for leaderboards)
create policy "Users can view teammate profiles"
  on public.profiles for select
  using (
    team_id in (
      select team_id from public.profiles where id = auth.uid()
    )
  );

-- Users can update their own profile
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Users can insert their own profile (on signup)
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ── Teams policies ──────────────────────────────────────────

-- Members can view their own team
create policy "Members can view own team"
  on public.teams for select
  using (
    id in (select team_id from public.profiles where id = auth.uid())
  );

-- Anyone authenticated can view a team by invite code (for joining)
create policy "Authenticated users can view teams by invite code"
  on public.teams for select
  using (auth.uid() is not null);

-- Coaches can update their own team
create policy "Coaches can update own team"
  on public.teams for update
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- Authenticated users can create teams (become coach)
create policy "Authenticated users can create teams"
  on public.teams for insert
  with check (auth.uid() is not null);

-- ── Practice Sessions policies ──────────────────────────────

-- Users can view their own sessions
create policy "Users can view own sessions"
  on public.practice_sessions for select
  using (auth.uid() = user_id);

-- Coaches can view their team's sessions
create policy "Coaches can view team sessions"
  on public.practice_sessions for select
  using (
    user_id in (
      select p.id from public.profiles p
      where p.team_id in (
        select team_id from public.profiles where id = auth.uid()
      )
    )
    and exists (
      select 1 from public.profiles where id = auth.uid() and role in ('coach', 'admin')
    )
  );

-- Users can insert their own sessions
create policy "Users can insert own sessions"
  on public.practice_sessions for insert
  with check (auth.uid() = user_id);

-- Users can update their own sessions (end session, update metrics)
create policy "Users can update own sessions"
  on public.practice_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Question Results policies ───────────────────────────────

-- Users can view their own results
create policy "Users can view own results"
  on public.question_results for select
  using (auth.uid() = user_id);

-- Coaches can view their team's results
create policy "Coaches can view team results"
  on public.question_results for select
  using (
    user_id in (
      select p.id from public.profiles p
      where p.team_id in (
        select team_id from public.profiles where id = auth.uid()
      )
    )
    and exists (
      select 1 from public.profiles where id = auth.uid() and role in ('coach', 'admin')
    )
  );

-- Teammates can view each other's results (for leaderboards)
create policy "Teammates can view each other results"
  on public.question_results for select
  using (
    user_id in (
      select p.id from public.profiles p
      where p.team_id in (
        select team_id from public.profiles where id = auth.uid()
      )
    )
  );

-- Users can insert their own results
create policy "Users can insert own results"
  on public.question_results for insert
  with check (auth.uid() = user_id);

-- ── Competitions policies ───────────────────────────────────

-- Team members can view their team's competitions
create policy "Members can view team competitions"
  on public.competitions for select
  using (
    team_id in (select team_id from public.profiles where id = auth.uid())
  );

-- Coaches can create competitions for their team
create policy "Coaches can create competitions"
  on public.competitions for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('coach', 'admin')
    )
    and team_id in (select team_id from public.profiles where id = auth.uid())
  );

-- Coaches can update their team's competitions
create policy "Coaches can update team competitions"
  on public.competitions for update
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('coach', 'admin')
      and team_id = competitions.team_id
    )
  );

-- Coaches can delete draft competitions
create policy "Coaches can delete competitions"
  on public.competitions for delete
  using (
    created_by = auth.uid()
    and status = 'upcoming'
  );

-- ── Competition Entries policies ────────────────────────────

-- Team members can view entries for their team's competitions
create policy "Members can view competition entries"
  on public.competition_entries for select
  using (
    competition_id in (
      select c.id from public.competitions c
      where c.team_id in (select team_id from public.profiles where id = auth.uid())
    )
  );

-- Users can insert their own entries
create policy "Users can insert own entries"
  on public.competition_entries for insert
  with check (auth.uid() = user_id);

-- Users can update their own entries (submit results)
create policy "Users can update own entries"
  on public.competition_entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- Functions
-- ============================================================

-- Auto-create profile on signup (triggered by auth.users insert)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'player')
  );
  return new;
end;
$$;

-- Trigger: create profile after auth signup
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Function: join a team by invite code
create or replace function public.join_team(p_invite_code text)
returns uuid
language plpgsql
security definer
as $$
declare
  v_team_id uuid;
begin
  select id into v_team_id
  from public.teams
  where invite_code = p_invite_code;

  if v_team_id is null then
    raise exception 'Invalid invite code';
  end if;

  update public.profiles
  set team_id = v_team_id
  where id = auth.uid();

  return v_team_id;
end;
$$;

-- Function: compute leaderboard rankings
create or replace function public.get_team_leaderboard(
  p_team_id uuid,
  p_period text default 'all',  -- 'week', 'month', 'all'
  p_limit int default 20
)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  total_points bigint,
  total_questions bigint,
  powers bigint,
  tens bigint,
  negs bigint,
  accuracy numeric,
  power_rate numeric
)
language plpgsql
security definer
as $$
declare
  v_since timestamptz;
begin
  v_since := case p_period
    when 'week' then now() - interval '7 days'
    when 'month' then now() - interval '30 days'
    else '1970-01-01'::timestamptz
  end;

  return query
  select
    qr.user_id,
    p.display_name,
    p.avatar_url,
    coalesce(sum(qr.points), 0)::bigint as total_points,
    count(qr.id)::bigint as total_questions,
    count(qr.id) filter (where qr.result = 'power')::bigint as powers,
    count(qr.id) filter (where qr.result = 'ten')::bigint as tens,
    count(qr.id) filter (where qr.result = 'neg')::bigint as negs,
    case
      when count(qr.id) > 0
      then round(
        count(qr.id) filter (where qr.result in ('power', 'ten'))::numeric
        / count(qr.id)::numeric * 100, 1
      )
      else 0
    end as accuracy,
    case
      when count(qr.id) > 0
      then round(
        count(qr.id) filter (where qr.result = 'power')::numeric
        / count(qr.id)::numeric * 100, 1
      )
      else 0
    end as power_rate
  from public.question_results qr
  join public.profiles p on p.id = qr.user_id
  where p.team_id = p_team_id
    and qr.created_at >= v_since
  group by qr.user_id, p.display_name, p.avatar_url
  order by total_points desc
  limit p_limit;
end;
$$;
