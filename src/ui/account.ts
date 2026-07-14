// Account state: who is signed in, their profile, and the community pack of
// approved proposed cards. Lives beside the game store; the game store reads
// it for community cards, seat profile ids, and match reporting.
import { create } from 'zustand';
import type { GameState } from '../engine';
import { supa } from '../supa/client';
import type { MatchPlayer, Profile } from '../supa/client';
import { toCommunityPack } from './packs';
import type { CardPack } from './packs';

/** Friends sign in with a USERNAME; Supabase auth wants an email, so plain
 *  usernames map to a synthetic address nobody ever sees. Anything typed with
 *  an @ is treated as a real email (Jake's original account). */
export function loginEmail(nameOrEmail: string): string {
  const raw = nameOrEmail.trim();
  if (raw.includes('@')) return raw.toLowerCase();
  return `${raw.toLowerCase().replace(/[^a-z0-9_-]/g, '')}@players.dicemancer`;
}

/** 2-24 chars, letters/digits/dash/underscore, or a real email. */
export function validLogin(nameOrEmail: string): boolean {
  const raw = nameOrEmail.trim();
  if (raw.includes('@')) return /^\S+@\S+\.\S+$/.test(raw);
  return /^[A-Za-z0-9_-]{2,24}$/.test(raw);
}

interface AccountStore {
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  /** The username typed at sign-up; prefills the profile form. */
  pendingName: string | null;
  /** Signed in but no profiles row yet: show the username+avatar form. */
  needsProfile: boolean;
  community: CardPack | null;
  busy: boolean;
  error: string | null;
  notice: string | null;
  init: () => void;
  signIn: (nameOrEmail: string, password: string) => Promise<void>;
  signUp: (nameOrEmail: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  saveProfile: (username: string, avatarIcon: string) => Promise<void>;
  refreshCommunity: () => Promise<void>;
}

let initialized = false;

export const useAccount = create<AccountStore>()((set, get) => ({
  userId: null,
  email: null,
  profile: null,
  pendingName: null,
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
      // Deferred on purpose: supabase-js deadlocks on client calls made
      // synchronously inside this callback.
      if (user) setTimeout(() => void loadProfile(user.id), 0);
      else set({ profile: null, needsProfile: false });
    });
    void get().refreshCommunity();
  },

  signIn: async (nameOrEmail, password) => {
    set({ busy: true, error: null, notice: null });
    const { error } = await supa.auth.signInWithPassword({
      email: loginEmail(nameOrEmail),
      password,
    });
    set({ busy: false, error: error ? friendly(error.message) : null });
  },

  signUp: async (nameOrEmail, password) => {
    set({ busy: true, error: null, notice: null });
    const { data, error } = await supa.auth.signUp({
      email: loginEmail(nameOrEmail),
      password,
    });
    if (error) {
      set({ busy: false, error: friendly(error.message) });
      return;
    }
    set({
      busy: false,
      pendingName: nameOrEmail.includes('@') ? null : nameOrEmail.trim(),
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
  if (msg.toLowerCase().includes('invalid login credentials')) {
    return 'wrong username or password';
  }
  if (msg.toLowerCase().includes('already registered')) return 'that username is taken';
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
