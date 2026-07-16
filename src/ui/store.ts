import { create } from 'zustand';
import { applyAction, createGame, mulberry32 } from '../engine';
import type { Action, GameState, Rng, SeatColor } from '../engine';
import { net } from '../net/net';
import type { NetMode } from '../net/net';
import { buildSeats, isLegalIntent } from '../net/protocol';
import { reportMatch, useAccount } from './account';
import { describeTransition } from './describe';
import { publishRoom, unpublishRoom } from './rooms';
import { effectiveStarterBoard, loadPacks, mergedPools } from './packs';
import type { CardPack } from './packs';
import { playForDispatch } from './sfx';

/** Local packs plus the community pack of approved proposals (when loaded). */
function activePacks(): CardPack[] {
  const community = useAccount.getState().community;
  return community && community.cards.length > 0 ? [...loadPacks(), community] : loadPacks();
}

// The game's rng lives beside the store, not inside GameState (it is stateful
// and non-serializable). Seeded once per game. Online, ONLY the host has one.
// Resumed games reseed it; only future rolls differ, which is fine because
// the host is authoritative and clients replicate state wholesale.
let rng: Rng = mulberry32(1);

/** Crash/refresh insurance: the authoritative side (host or offline) writes
 *  its whole session here after every action; clients keep just enough to
 *  offer a one-click rejoin. */
const SAVE_KEY = 'dicemancer_session_v1';

export interface SavedSession {
  v: 1;
  mode: 'offline' | 'host' | 'client';
  roomCode?: string;
  myName?: string;
  game?: GameState;
  seatKinds?: SeatKind[];
  seatProfiles?: (string | null)[];
  /** Host: who sat where, for reattaching reconnections after a resume. */
  roster?: { name: string; profileId: string | null; seat: number }[];
}

/** localStorage that quietly does not exist in node test runs. */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadSavedSession(): SavedSession | null {
  try {
    const raw = storage()?.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedSession;
    if (s.v !== 1) return null;
    if (s.game && s.game.winner !== null) return null; // finished: nothing to resume
    return s;
  } catch {
    return null;
  }
}

function saveSession(s: SavedSession): void {
  try {
    storage()?.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    // storage full/unavailable: play continues, resume just will not work
  }
}

export function clearSavedSession(): void {
  try {
    storage()?.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

const savedName = (): string => {
  try {
    return storage()?.getItem('dicemancer_name') ?? 'Player';
  } catch {
    return 'Player';
  }
};

export type SeatKind = 'human' | 'bot';

/** A transient resource change, driving the floating +N animations. */
export interface StatPulse {
  id: number;
  seat: number;
  stat: 'hp' | 'money' | 'points';
  delta: number;
}
let nextPulseId = 1;

interface GameStore {
  game: GameState | null;
  seatKinds: SeatKind[];
  log: string[];
  pulses: StatPulse[];
  // --- online session ---
  mode: NetMode;
  /** My seat in an online game; null offline (hotseat controls every human). */
  mySeat: number | null;
  roomCode: string | null;
  /** Lobby roster (online, before the game starts). */
  lobby: string[];
  /** Why the last online session ended; shown on the setup screen. */
  netNotice: string | null;
  /** Supabase profile id per seat (online games); null = bot or signed out. */
  seatProfiles: (string | null)[];
  /** Per-seat connection truth in online games (bots/host count as present). */
  connectedSeats: boolean[];
  start: (
    playerCount: number,
    roundCap: number,
    seed?: number,
    kinds?: SeatKind[],
    colors?: SeatColor[],
  ) => void;
  /** The ONLY writer: every state change goes through the engine's applyAction.
   *  Online clients do not apply anything; they forward the intent instead. */
  dispatch: (action: Action) => void;
  reset: () => void;
  // --- online actions ---
  hostRoom: (name: string) => Promise<string>;
  joinRoom: (code: string, name: string) => Promise<void>;
  /** Host only: lobby -> live game. Bots fill the tail seats. */
  startOnline: (botCount: number, roundCap: number, colors: SeatColor[]) => void;
  leaveOnline: (notice?: string | null) => void;
  // --- resilience ---
  /** Restore a saved offline game after a refresh. */
  resumeOffline: () => void;
  /** Host: reopen the room (same code if the broker allows) and restore the
   *  game; players rejoin their seats with the room code. */
  resumeHost: () => Promise<string | null>;
  /** Host: hand a disconnected (or any non-host human) seat to a bot. */
  replaceWithBot: (seat: number) => void;
}

/** Pulses + sfx + log for one transition; shared by local and remote paths. */
function ingest(
  get: () => GameStore,
  prev: GameState,
  action: Action,
  next: GameState,
): Pick<GameStore, 'game' | 'pulses' | 'log'> {
  const fresh: StatPulse[] = [];
  next.players.forEach((p, seat) => {
    const q = prev.players[seat]!;
    if (p.hp !== q.hp) fresh.push({ id: nextPulseId++, seat, stat: 'hp', delta: p.hp - q.hp });
    if (p.money !== q.money) {
      fresh.push({ id: nextPulseId++, seat, stat: 'money', delta: p.money - q.money });
    }
    if (p.points !== q.points) {
      fresh.push({ id: nextPulseId++, seat, stat: 'points', delta: p.points - q.points });
    }
  });
  playForDispatch(action, prev, next, fresh);
  return {
    game: next,
    pulses: [...get().pulses, ...fresh].slice(-24),
    log: [...get().log, ...describeTransition(prev, action, next)].slice(-120),
  };
}

export const useGame = create<GameStore>()((set, get) => {
  /** Persist whatever the authoritative side would need to resume. */
  const persist = () => {
    const s = get();
    if (s.mode === 'client') {
      if (s.game && s.roomCode) {
        saveSession({ v: 1, mode: 'client', roomCode: s.roomCode, myName: savedName() });
      }
      return;
    }
    if (!s.game) return;
    if (s.game.winner !== null) {
      clearSavedSession();
      return;
    }
    saveSession({
      v: 1,
      mode: s.mode,
      roomCode: s.roomCode ?? undefined,
      myName: savedName(),
      game: s.game,
      seatKinds: s.seatKinds,
      seatProfiles: s.seatProfiles,
      roster: s.mode === 'host' ? net.seatRoster() : undefined,
    });
  };

  const pushMeta = () => {
    const s = get();
    if (s.mode !== 'host' || !s.game) return;
    const connected = net.presence(s.game.players.length);
    set({ connectedSeats: connected });
    net.meta(connected, s.seatKinds);
  };

  // The net layer reports in through these; registered once at store creation.
  net.setCallbacks({
    onLobby: (players) => {
      set({ lobby: players });
      // Keep the open-rooms directory's player count fresh while hosting.
      const s = get();
      if (s.mode === 'host' && !s.game && s.roomCode) {
        publishRoom(s.roomCode, players[0] ?? 'Host', players.length);
      }
    },
    onBegin: (state, seat, seatKinds) => {
      set({
        game: state,
        seatKinds,
        mySeat: seat,
        mode: 'client',
        pulses: [],
        connectedSeats: state.players.map(() => true),
        log: [`joined ${state.players.length}-player online game as ${state.players[seat]!.name}`],
      });
      persist();
    },
    onSync: (action, state) => {
      const prev = get().game;
      if (!prev) return;
      set(ingest(get, prev, action, state));
    },
    onIntent: (seat, action) => {
      const g = get().game;
      if (!g || !isLegalIntent(g, seat, action)) return; // stale or forged: drop
      get().dispatch(action);
    },
    onPresence: (seat, connected) => {
      const g = get().game;
      const name = g?.players[seat]?.name ?? `seat ${seat + 1}`;
      set({
        log: [
          ...get().log,
          connected ? `${name} reconnected` : `${name} disconnected (their seat is held)`,
        ].slice(-120),
      });
      pushMeta();
      persist();
    },
    onReattach: (seat) => {
      const s = get();
      if (!s.game) return;
      net.beginSeat(seat, s.game, s.seatKinds);
      pushMeta();
    },
    onMeta: (connected, seatKinds) => set({ connectedSeats: connected, seatKinds }),
    onDrop: (reason) => {
      set({
        game: null,
        mode: 'offline',
        mySeat: null,
        roomCode: null,
        lobby: [],
        pulses: [],
        log: [],
        netNotice: reason,
      });
    },
  });

  return {
    game: null,
    seatKinds: [],
    log: [],
    pulses: [],
    mode: 'offline',
    mySeat: null,
    roomCode: null,
    lobby: [],
    netNotice: null,
    seatProfiles: [],
    connectedSeats: [],
    start: (playerCount, roundCap, seed, kinds, colors) => {
      rng = mulberry32(seed ?? Date.now() >>> 0);
      const seatKinds: SeatKind[] =
        kinds?.slice(0, playerCount) ?? Array<SeatKind>(playerCount).fill('human');
      const seatColors: SeatColor[] =
        colors?.slice(0, playerCount) ?? (['red', 'blue', 'green', 'yellow'] as SeatColor[]);
      const game = createGame(
        {
          seats: Array.from({ length: playerCount }, (_, i) => ({
            name: seatKinds[i] === 'bot' ? `Bot ${i + 1}` : `Player ${i + 1}`,
            color: seatColors[i % seatColors.length] as SeatColor,
          })),
          starterBoard: effectiveStarterBoard(), // with any Card Lab edits applied
          pools: mergedPools(activePacks()), // Lab edits + packs + community cards
          tunables: { roundCap },
        },
        rng,
      );
      set({
        game,
        seatKinds,
        connectedSeats: Array<boolean>(playerCount).fill(true),
        log: [
          `game started: ${playerCount} players${roundCap > 0 ? `, round cap ${roundCap}` : ''}`,
        ],
      });
      persist();
    },
    dispatch: (action) => {
      const { mode } = get();
      if (mode === 'client') {
        net.sendIntent(action); // the host validates, applies, and syncs back
        return;
      }
      const prev = get().game;
      if (!prev) return;
      const next = applyAction(prev, action, rng);
      set(ingest(get, prev, action, next));
      if (mode === 'host') {
        net.sync(action, next);
        // Game just ended: record the result for profile stats.
        if (next.winner !== null && prev.winner === null) {
          reportMatch(next, get().seatProfiles);
        }
      }
      persist();
    },
    reset: () => {
      net.leave();
      clearSavedSession();
      set({
        game: null,
        log: [],
        pulses: [],
        mode: 'offline',
        mySeat: null,
        roomCode: null,
        lobby: [],
        netNotice: null,
        connectedSeats: [],
      });
    },
    hostRoom: async (name) => {
      set({ netNotice: null });
      const code = await net.host(name);
      set({ mode: 'host', roomCode: code, lobby: net.lobbyNames() });
      publishRoom(code, name, 1); // list it in the open-rooms directory
      return code;
    },
    joinRoom: async (code, name) => {
      set({ netNotice: null });
      await net.join(code, name, useAccount.getState().profile?.id ?? null);
      set({ mode: 'client', roomCode: code });
    },
    startOnline: (botCount, roundCap, colors) => {
      const names = net.lobbyNames();
      const seats = buildSeats(names[0] ?? 'Host', names.slice(1), botCount);
      const seatProfiles: (string | null)[] = [
        useAccount.getState().profile?.id ?? null,
        ...net.clientProfiles(),
        ...Array<string | null>(botCount).fill(null),
      ];
      rng = mulberry32(Date.now() >>> 0);
      const game = createGame(
        {
          seats: seats.names.map((n, i) => ({
            name: n,
            color: colors[i % colors.length] as SeatColor,
          })),
          starterBoard: effectiveStarterBoard(),
          pools: mergedPools(activePacks()), // the host's packs + community cards rule the table
          tunables: { roundCap },
        },
        rng,
      );
      set({
        game,
        seatKinds: seats.kinds,
        mySeat: 0,
        seatProfiles,
        connectedSeats: Array<boolean>(seats.names.length).fill(true),
        log: [`online game started: ${seats.names.join(', ')}`],
      });
      net.begin(game, seats.kinds);
      if (get().roomCode) unpublishRoom(get().roomCode!); // game started: delist
      persist();
    },
    leaveOnline: (notice = null) => {
      const s = get();
      if (s.mode === 'host' && s.roomCode) unpublishRoom(s.roomCode);
      net.leave();
      clearSavedSession();
      set({
        game: null,
        mode: 'offline',
        mySeat: null,
        roomCode: null,
        lobby: [],
        netNotice: notice,
        connectedSeats: [],
      });
    },
    resumeOffline: () => {
      const saved = loadSavedSession();
      if (!saved || saved.mode !== 'offline' || !saved.game) return;
      rng = mulberry32(((Date.now() % 0xffffffff) + 1) >>> 0);
      set({
        game: saved.game,
        seatKinds: saved.seatKinds ?? saved.game.players.map(() => 'human' as SeatKind),
        mode: 'offline',
        mySeat: null,
        connectedSeats: saved.game.players.map(() => true),
        log: ['game resumed from the last save'],
      });
    },
    resumeHost: async () => {
      const saved = loadSavedSession();
      if (!saved || saved.mode !== 'host' || !saved.game) return null;
      set({ netNotice: null });
      const code = await net.host(saved.myName ?? 'Host', saved.roomCode);
      net.expectSeats(saved.roster ?? []);
      rng = mulberry32(((Date.now() % 0xffffffff) + 1) >>> 0);
      set({
        game: saved.game,
        seatKinds: saved.seatKinds ?? saved.game.players.map(() => 'human' as SeatKind),
        seatProfiles: saved.seatProfiles ?? saved.game.players.map(() => null),
        mode: 'host',
        mySeat: 0,
        roomCode: code,
        connectedSeats: net.presence(saved.game.players.length),
        log: [
          `game resumed; players rejoin with room code ${code}`
            + (code !== saved.roomCode ? ` (the old code was taken; share the new one)` : ''),
        ],
      });
      persist();
      return code;
    },
    replaceWithBot: (seat) => {
      const s = get();
      if (s.mode !== 'host' || !s.game || seat === 0) return;
      const seatKinds = s.seatKinds.map((k, i) => (i === seat ? ('bot' as SeatKind) : k));
      set({
        seatKinds,
        log: [...s.log, `${s.game.players[seat]?.name ?? 'player'} is now played by a bot`].slice(-120),
      });
      net.meta(net.presence(s.game.players.length), seatKinds);
      persist();
    },
  };
});
