// Account state: who is signed in, their profile, and the community pack of
// approved proposed cards. Lives beside the game store; the game store reads
// it for community cards, seat profile ids, and match reporting.
import { create } from 'zustand';
import type { GameState } from '../engine';
import { supa } from '../supa/client';
import type { MatchPlayer, Profile } from '../supa/client';
import { toCommunityPack } from './packs';
import type { CardPack } from './packs';

interface AccountStore {
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  /** Signed in but no profiles row yet: show the username+avatar form. */
  needsProfile: boolean;
  community: CardPack | null;
  busy: boolean;
  error: string | null;
  notice: string | null;
  init: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  saveProfile: (username: string, avatarIcon: string) => Promise<void>;
  refreshCommunity: () => Promise<void>;
}

let initialized = false;

export const useAccount = create<AccountStore>()((set, get) => ({
  userId: null,
  email: null,
  profile: null,
  needsProfile: false,
  community: null,
  busy: false,
  error: null,
  notice: null,

  init: () => {
    if (initialized) return;
    initialized = true;
    supa.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      set({ userId: user?.id ?? null, email: user?.email ?? null });
      if (user) void loadProfile(user.id);
      else set({ profile: null, needsProfile: false });
    });
    void get().refreshCommunity();
  },

  signIn: async (email, password) => {
    set({ busy: true, error: null, notice: null });
    const { error } = await supa.auth.signInWithPassword({ email, password });
    set({ busy: false, error: error ? friendly(error.message) : null });
  },

  signUp: async (email, password) => {
    set({ busy: true, error: null, notice: null });
    const { data, error } = await supa.auth.signUp({ email, password });
    if (error) {
      set({ busy: false, error: friendly(error.message) });
      return;
    }
    set({
      busy: false,
      // With email confirmation enabled there is no session yet.
      notice: data.session ? null : 'check your email for a confirmation link, then sign in',
    });
  },

  signOut: async () => {
    await supa.auth.signOut();
    set({ profile: null, needsProfile: false, error: null, notice: null });
  },

  saveProfile: async (username, avatarIcon) => {
    const id = get().userId;
    if (!id) return;
    set({ busy: true, error: null });
    const { error } = await supa
      .from('profiles')
      .upsert({ id, username: username.trim(), avatar_icon: avatarIcon });
    if (error) {
      set({ busy: false, error: friendly(error.message) });
      return;
    }
    set({ busy: false, needsProfile: false });
    await loadProfile(id);
  },

  refreshCommunity: async () => {
    const { data, error } = await supa
      .from('proposed_cards')
      .select('card')
      .eq('status', 'approved');
    if (error || !data) return; // schema not run yet, or offline: no pack
    set({ community: toCommunityPack(data.map((r) => r.card)) });
  },
}));

async function loadProfile(id: string) {
  const { data, error } = await supa.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) {
    // Table missing (schema not run) reads as an error; leave profile null.
    useAccount.setState({ error: friendly(error.message) });
    return;
  }
  useAccount.setState({ profile: (data as Profile | null) ?? null, needsProfile: data === null });
}

function friendly(msg: string): string {
  if (msg.includes('relation') && msg.includes('does not exist')) {
    return 'database not set up yet (run supabase/schema.sql in the SQL Editor)';
  }
  if (msg.toLowerCase().includes('invalid login credentials')) return 'wrong email or password';
  return msg;
}

/** Host-side: record a finished online game. Fire-and-forget; stats are
 *  bumped by a database trigger, never by clients. */
export function reportMatch(state: GameState, seatProfiles: (string | null)[]): void {
  const me = useAccount.getState().userId;
  if (!me || state.winner === null) return;
  const players: MatchPlayer[] = state.players.map((p, seat) => ({
    profile: seatProfiles[seat] ?? null,
    name: p.name,
    color: p.color,
    seat,
    points: p.points,
    won: seat === state.winner,
  }));
  void supa
    .from('match_results')
    .insert({ reported_by: me, players, win_reason: state.winReason, rounds: state.round })
    .then(({ error }) => {
      if (error) console.warn('match report failed:', error.message);
    });
}
