import { create } from 'zustand';
import { applyAction, createGame, mulberry32 } from '../engine';
import type { Action, GameState, Rng, SeatColor } from '../engine';
import { net } from '../net/net';
import type { NetMode } from '../net/net';
import { buildSeats, isLegalIntent } from '../net/protocol';
import { reportMatch, useAccount } from './account';
import { describeTransition } from './describe';
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
let rng: Rng = mulberry32(1);

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
  // The net layer reports in through these; registered once at store creation.
  net.setCallbacks({
    onLobby: (players) => set({ lobby: players }),
    onBegin: (state, seat, seatKinds) =>
      set({
        game: state,
        seatKinds,
        mySeat: seat,
        mode: 'client',
        pulses: [],
        log: [`joined ${state.players.length}-player online game as ${state.players[seat]!.name}`],
      }),
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
        log: [`game started: ${playerCount} players, round cap ${roundCap}`],
      });
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
    },
    reset: () => {
      net.leave();
      set({
        game: null,
        log: [],
        pulses: [],
        mode: 'offline',
        mySeat: null,
        roomCode: null,
        lobby: [],
        netNotice: null,
      });
    },
    hostRoom: async (name) => {
      set({ netNotice: null });
      const code = await net.host(name);
      set({ mode: 'host', roomCode: code, lobby: net.lobbyNames() });
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
        log: [`online game started: ${seats.names.join(', ')}`],
      });
      net.begin(game, seats.kinds);
    },
    leaveOnline: (notice = null) => {
      net.leave();
      set({
        game: null,
        mode: 'offline',
        mySeat: null,
        roomCode: null,
        lobby: [],
        netNotice: notice,
      });
    },
  };
});
