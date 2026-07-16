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
