-- Dicemancer database schema v1: profiles + the proposed-cards pipeline.
-- Paste this whole file into the Supabase dashboard SQL Editor and click Run.
-- Safe to re-run: everything is create-if-missing.

-- ---------------------------------------------------------------------------
-- PROFILES: one row per signed-in user. Avatar is a WoW icon filename from
-- the same catalog the card builder uses.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (char_length(username) between 2 and 24),
  avatar_icon text not null default 'INV_Misc_Dice_01.PNG',
  is_admin boolean not null default false,
  games_played int not null default 0,
  games_won int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all" on public.profiles
  for select using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- Users edit their own profile but can never grant themselves admin.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id and is_admin = (select p.is_admin from public.profiles p where p.id = auth.uid()));

-- ---------------------------------------------------------------------------
-- PROPOSED CARDS: friends design cards in the builder and submit them here.
-- Jake (is_admin) reviews: edits the card json, sets status, leaves notes.
-- Approved cards become the community pack every game loads.
create table if not exists public.proposed_cards (
  id uuid primary key default gen_random_uuid(),
  author uuid references public.profiles (id) on delete set null,
  author_name text not null default 'unknown',
  card jsonb not null,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected')),
  reviewer_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.proposed_cards enable row level security;

drop policy if exists "proposals_read_all" on public.proposed_cards;
create policy "proposals_read_all" on public.proposed_cards
  for select using (true);

drop policy if exists "proposals_insert_own" on public.proposed_cards;
create policy "proposals_insert_own" on public.proposed_cards
  for insert with check (auth.uid() = author and status = 'proposed');

-- Authors may edit their own proposal while it is still pending; admins may
-- edit anything (that is the review flow).
drop policy if exists "proposals_update" on public.proposed_cards;
create policy "proposals_update" on public.proposed_cards
  for update using (
    (auth.uid() = author and status = 'proposed')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "proposals_delete" on public.proposed_cards;
create policy "proposals_delete" on public.proposed_cards
  for delete using (
    auth.uid() = author
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- ---------------------------------------------------------------------------
-- MATCH RESULTS: the host reports the outcome of each online game; profile
-- stat columns are bumped by a trigger so clients never write them directly.
create table if not exists public.match_results (
  id uuid primary key default gen_random_uuid(),
  reported_by uuid references public.profiles (id) on delete set null,
  players jsonb not null, -- [{profile: uuid|null, name, color, seat, points, won}]
  win_reason text,
  rounds int,
  created_at timestamptz not null default now()
);

alter table public.match_results enable row level security;

drop policy if exists "results_read_all" on public.match_results;
create policy "results_read_all" on public.match_results
  for select using (true);

drop policy if exists "results_insert_signed_in" on public.match_results;
create policy "results_insert_signed_in" on public.match_results
  for insert with check (auth.uid() = reported_by);

create or replace function public.apply_match_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
begin
  for entry in select * from jsonb_array_elements(new.players) loop
    if (entry ->> 'profile') is not null then
      update public.profiles
        set games_played = games_played + 1,
            games_won = games_won + case when (entry ->> 'won')::boolean then 1 else 0 end
        where id = (entry ->> 'profile')::uuid;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists match_result_applies on public.match_results;
create trigger match_result_applies
  after insert on public.match_results
  for each row execute function public.apply_match_result();
