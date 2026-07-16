// The open-rooms directory + match history reads. Everything here is
// fire-and-forget and fails silently: until supabase/schema2.sql is run (or
// when offline) the features are simply inert.
import { supa } from '../supa/client';
import type { MatchPlayer } from '../supa/client';

export interface OpenRoom {
  code: string;
  host_name: string;
  players: number;
  created_at: string;
}

export function publishRoom(code: string, hostName: string, players: number): void {
  void supa
    .from('open_rooms')
    .upsert({ code, host_name: hostName, players, created_at: new Date().toISOString() })
    .then(() => {});
}

export function unpublishRoom(code: string): void {
  void supa.from('open_rooms').delete().eq('code', code).then(() => {});
}

/** Joinable rooms, freshest first; stale rows (>30 min) are filtered out. */
export async function listRooms(): Promise<OpenRoom[]> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data, error } = await supa
    .from('open_rooms')
    .select('*')
    .gt('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) return [];
  return (data ?? []) as OpenRoom[];
}

export interface MatchRow {
  id: string;
  players: MatchPlayer[];
  win_reason: string | null;
  rounds: number | null;
  created_at: string;
}

export async function listMatches(limit = 15): Promise<MatchRow[]> {
  const { data, error } = await supa
    .from('match_results')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as MatchRow[];
}
