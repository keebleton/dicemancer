// The open-rooms directory + match history reads. Everything here is
// fire-and-forget and fails silently: until supabase/schema2.sql is run (or
// when offline) the features are simply inert.
import { supa } from '../supa/client';
import type { MatchPlayer, Profile } from '../supa/client';

export interface OpenRoom {
  code: string;
  host_name: string;
  players: number;
  created_at: string;
  status?: 'open' | 'playing';
}

/** status 'open' = joinable lobby; 'playing' = a live game (spectate). The
 *  host re-upserts periodically while playing so the row stays fresh. */
export function publishRoom(
  code: string,
  hostName: string,
  players: number,
  status: 'open' | 'playing' = 'open',
): void {
  void supa
    .from('open_rooms')
    .upsert({ code, host_name: hostName, players, status, created_at: new Date().toISOString() })
    .then(() => {});
}

export function unpublishRoom(code: string): void {
  void supa.from('open_rooms').delete().eq('code', code).then(() => {});
}

async function listByStatus(status: string, maxAgeMin: number): Promise<OpenRoom[]> {
  const cutoff = new Date(Date.now() - maxAgeMin * 60 * 1000).toISOString();
  const { data, error } = await supa
    .from('open_rooms')
    .select('*')
    .gt('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) return [];
  // Filtered client-side: a pre-status directory row has no status column
  // and should behave as 'open'.
  return ((data ?? []) as OpenRoom[]).filter((r) => (r.status ?? 'open') === status);
}

/** Joinable lobbies, freshest first; stale rows are filtered out. */
export const listRooms = () => listByStatus('open', 30);

/** Live games to spectate; hosts refresh the row every couple of minutes,
 *  so a short window keeps crashed hosts from ghosting the list. */
export const listLiveGames = () => listByStatus('playing', 10);

export interface MatchRow {
  id: string;
  players: MatchPlayer[];
  win_reason: string | null;
  rounds: number | null;
  created_at: string;
}

/** Ranked players: most wins first, win rate breaking ties. */
export async function listLeaders(limit = 20): Promise<Profile[]> {
  const { data, error } = await supa
    .from('profiles')
    .select('*')
    .gt('games_played', 0)
    .order('games_won', { ascending: false })
    .limit(limit);
  if (error) return [];
  return ((data ?? []) as Profile[]).sort(
    (a, b) =>
      b.games_won - a.games_won ||
      b.games_won / Math.max(1, b.games_played) - a.games_won / Math.max(1, a.games_played),
  );
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
