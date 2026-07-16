// Who is on the site right now, via Supabase Realtime presence on one shared
// channel (key = profile id). No tables; signed-out players simply are not
// tracked. The friends overlay reads presentIds() to draw its online dots.
import { supa } from '../supa/client';

let tracking: ReturnType<typeof supa.channel> | null = null;

/** Start announcing this profile as online; returns the stop function. */
export function trackPresence(profileId: string): () => void {
  if (tracking) void supa.removeChannel(tracking);
  const ch = supa.channel('presence-online', { config: { presence: { key: profileId } } });
  tracking = ch;
  // A presence binding must exist BEFORE subscribe or newer supabase-js
  // joins with presence disabled and track() silently does nothing.
  ch.on('presence', { event: 'sync' }, () => {});
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') void ch.track({ at: Date.now() });
  });
  return () => {
    if (tracking === ch) {
      void supa.removeChannel(ch);
      tracking = null;
    }
  };
}

/** Profile ids currently on the site (empty when not tracking yet). */
export function presentIds(): Set<string> {
  return new Set(Object.keys(tracking?.presenceState() ?? {}));
}
