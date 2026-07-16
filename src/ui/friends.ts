// Friends list over the friendships table (supabase/schema2.sql). All reads
// and writes fail soft: until the table exists these functions return empty
// lists or an error string the UI can show inline.
import { supa } from '../supa/client';
import type { Profile } from '../supa/client';

export interface FriendEntry {
  /** friendships row id (accept and remove key on it). */
  id: string;
  status: 'pending' | 'accepted';
  /** 'in' = they asked me, 'out' = I asked them. */
  direction: 'in' | 'out';
  profile: Profile;
}

interface FriendRow {
  id: string;
  requester: string;
  addressee: string;
  status: 'pending' | 'accepted';
}

/** Everything involving me, with the other side's profile attached. */
export async function fetchFriends(myId: string): Promise<FriendEntry[]> {
  const { data, error } = await supa
    .from('friendships')
    .select('*')
    .or(`requester.eq.${myId},addressee.eq.${myId}`);
  if (error || !data) return [];
  const rows = data as FriendRow[];
  const otherIds = [...new Set(rows.map((r) => (r.requester === myId ? r.addressee : r.requester)))];
  if (otherIds.length === 0) return [];
  const { data: profs } = await supa.from('profiles').select('*').in('id', otherIds);
  const byId = new Map((profs ?? []).map((p) => [(p as Profile).id, p as Profile]));
  return rows.flatMap((r) => {
    const otherId = r.requester === myId ? r.addressee : r.requester;
    const profile = byId.get(otherId);
    if (!profile) return [];
    return [
      {
        id: r.id,
        status: r.status,
        direction: r.requester === myId ? ('out' as const) : ('in' as const),
        profile,
      },
    ];
  });
}

/** Send a request by username. Returns an error string or null on success. */
export async function addFriend(myId: string, username: string): Promise<string | null> {
  const name = username.trim();
  if (!name) return 'enter a username';
  const { data: prof, error: findErr } = await supa
    .from('profiles')
    .select('*')
    .ilike('username', name)
    .limit(1)
    .maybeSingle();
  if (findErr) return 'friends are not set up yet (run schema2.sql)';
  if (!prof) return `no player named "${name}"`;
  const other = prof as Profile;
  if (other.id === myId) return 'that is you';
  const { error } = await supa
    .from('friendships')
    .insert({ requester: myId, addressee: other.id });
  if (error) {
    // Unique violation = already requested (either direction shows in the list).
    return error.code === '23505' ? 'already requested' : error.message;
  }
  return null;
}

export async function acceptFriend(rowId: string): Promise<void> {
  await supa.from('friendships').update({ status: 'accepted' }).eq('id', rowId);
}

export async function removeFriend(rowId: string): Promise<void> {
  await supa.from('friendships').delete().eq('id', rowId);
}
