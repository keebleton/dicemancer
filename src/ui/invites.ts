// Friend invites over Supabase Realtime broadcast: no tables, no schema.
// Delivery is live-only; a friend who is not on the home screen at that
// moment simply never sees it, which is the right shape for a "come play
// now" ping.
import { supa } from '../supa/client';

export interface Invite {
  from: string;
  code: string;
}

const chanName = (profileId: string) => `invite-${profileId}`;

/** Fire-and-forget: join the friend's channel, send, leave. If this client
 *  already sits on that topic, send there instead: a duplicate channel on
 *  one client tears the first one down. */
export function sendInvite(toProfileId: string, fromName: string, code: string): void {
  const payload = { from: fromName, code };
  const topic = chanName(toProfileId);
  const existing = supa.getChannels().find((c) => c.topic === `realtime:${topic}`);
  if (existing) {
    void existing.send({ type: 'broadcast', event: 'invite', payload });
    return;
  }
  const ch = supa.channel(topic);
  ch.subscribe((status) => {
    if (status !== 'SUBSCRIBED') return;
    void ch.send({ type: 'broadcast', event: 'invite', payload }).finally(() => {
      setTimeout(() => void supa.removeChannel(ch), 1500);
    });
  });
}

/** Listen for invites addressed to me; returns the unsubscribe. */
export function watchInvites(myProfileId: string, cb: (inv: Invite) => void): () => void {
  const ch = supa.channel(chanName(myProfileId));
  ch.on('broadcast', { event: 'invite' }, ({ payload }) => {
    const p = payload as Partial<Invite>;
    if (typeof p.code === 'string' && p.code.length === 4) {
      cb({ from: String(p.from ?? 'a friend'), code: p.code });
    }
  }).subscribe();
  return () => void supa.removeChannel(ch);
}
