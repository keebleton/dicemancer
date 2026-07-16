-- Dicemancer schema v2: the OPEN ROOMS directory. Paste into the Supabase
-- SQL Editor and Run (safe to re-run). Hosts publish their room code while
-- the lobby is open; the setup screen lists joinable rooms so nobody has to
-- text codes around. Rows are transient (clients ignore anything older than
-- 30 minutes) and the policies are deliberately permissive: this is a
-- friends-scale party directory, not a secure resource.

create table if not exists public.open_rooms (
  code text primary key,
  host_name text not null default 'Host',
  players int not null default 1,
  created_at timestamptz not null default now()
);

alter table public.open_rooms enable row level security;

drop policy if exists "rooms_read_all" on public.open_rooms;
create policy "rooms_read_all" on public.open_rooms
  for select using (true);

drop policy if exists "rooms_insert_all" on public.open_rooms;
create policy "rooms_insert_all" on public.open_rooms
  for insert with check (true);

drop policy if exists "rooms_update_all" on public.open_rooms;
create policy "rooms_update_all" on public.open_rooms
  for update using (true);

drop policy if exists "rooms_delete_all" on public.open_rooms;
create policy "rooms_delete_all" on public.open_rooms
  for delete using (true);

-- v2b additions (2026-07-16): live-game status on the rooms directory, and
-- the friends list. Safe to re-run; safe to run whether or not the original
-- v2 block was ever applied.

alter table public.open_rooms add column if not exists status text not null default 'open';

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester, addressee),
  check (requester <> addressee)
);

alter table public.friendships enable row level security;

drop policy if exists "friends_read_all" on public.friendships;
create policy "friends_read_all" on public.friendships
  for select using (true);

drop policy if exists "friends_request_own" on public.friendships;
create policy "friends_request_own" on public.friendships
  for insert with check (auth.uid() = requester);

drop policy if exists "friends_accept_addressee" on public.friendships;
create policy "friends_accept_addressee" on public.friendships
  for update using (auth.uid() = addressee);

drop policy if exists "friends_remove_either" on public.friendships;
create policy "friends_remove_either" on public.friendships
  for delete using (auth.uid() in (requester, addressee));
