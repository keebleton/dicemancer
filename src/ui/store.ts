import { create } from 'zustand';
import { applyAction, createGame, mulberry32 } from '../engine';
import type { Action, GameState, Rng, SeatColor } from '../engine';
import { net } from '../net/net';
import type { NetMode } from '../net/net';
import { buildSeats, isLegalIntent } from '../net/protocol';
import type { BotLevel } from '../bot';
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
  botLevels?: BotLevel[];
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

/** A table event for the travel/impact fx layer: coins arc from the dice
 *  stage to the earning seat, damage numbers slam into the victim's mat,
 *  a knockout shakes the room. Derived from state deltas exactly like
 *  pulses, so it fires identically offline, online, and on bot turns. */
export interface FxEvent {
  id: number;
  kind: 'damage' | 'heal' | 'coins' | 'points' | 'ko';
  seat: number;
  amount: number;
}
let nextFxId = 1;

interface GameStore {
  game: GameState | null;
  seatKinds: SeatKind[];
  log: string[];
  pulses: StatPulse[];
  fx: FxEvent[];
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
  /** Bot strength per seat (only meaningful where seatKinds is 'bot'). */
  botLevels: BotLevel[];
  /** Latest chat bubble per seat; a new id restarts the fade animation. */
  bubbles: Record<number, { id: number; text: string; big: boolean }>;
  /** Say something at the table (online games only). */
  sendChat: (text: string, big?: boolean) => void;
  start: (
    playerCount: number,
    roundCap: number,
    seed?: number,
    kinds?: SeatKind[],
    colors?: SeatColor[],
    levels?: BotLevel[],
  ) => void;
  /** The ONLY writer: every state change goes through the engine's applyAction.
   *  Online clients do not apply anything; they forward the intent instead. */
  dispatch: (action: Action) => void;
  reset: () => void;
  // --- online actions ---
  hostRoom: (name: string) => Promise<string>;
  joinRoom: (code: string, name: string) => Promise<void>;
  /** Watch a live game (seat -1, read-only). */
  spectateRoom: (code: string, name: string) => Promise<void>;
  /** Host only: lobby -> live game. Bots fill the tail seats. */
  startOnline: (
    botCount: number,
    roundCap: number,
    colors: SeatColor[],
    botLevel?: BotLevel,
  ) => void;
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

/** Pulses + fx + sfx + log for one transition; shared by local and remote paths. */
function ingest(
  get: () => GameStore,
  prev: GameState,
  action: Action,
  next: GameState,
): Pick<GameStore, 'game' | 'pulses' | 'fx' | 'log'> {
  const fresh: StatPulse[] = [];
  const freshFx: FxEvent[] = [];
  next.players.forEach((p, seat) => {
    const q = prev.players[seat]!;
    if (p.hp !== q.hp) {
      fresh.push({ id: nextPulseId++, seat, stat: 'hp', delta: p.hp - q.hp });
      freshFx.push({
        id: nextFxId++,
        kind: p.hp < q.hp ? 'damage' : 'heal',
        seat,
        amount: Math.abs(p.hp - q.hp),
      });
    }
    if (p.money !== q.money) {
      fresh.push({ id: nextPulseId++, seat, stat: 'money', delta: p.money - q.money });
      // Only gains travel; losses just float red at the mat.
      if (p.money > q.money) {
        freshFx.push({ id: nextFxId++, kind: 'coins', seat, amount: p.money - q.money });
      }
    }
    if (p.points !== q.points) {
      fresh.push({ id: nextPulseId++, seat, stat: 'points', delta: p.points - q.points });
      if (p.points > q.points) {
        freshFx.push({ id: nextFxId++, kind: 'points', seat, amount: p.points - q.points });
      }
    }
    if (p.eliminated && !q.eliminated) {
      freshFx.push({ id: nextFxId++, kind: 'ko', seat, amount: 0 });
    }
  });
  playForDispatch(action, prev, next, fresh);
  return {
    game: next,
    pulses: [...get().pulses, ...fresh].slice(-24),
    fx: [...get().fx, ...freshFx].slice(-14),
    log: [...get().log, ...describeTransition(prev, action, next)].slice(-120),
  };
}

export const useGame = create<GameStore>()((set, get) => {
  /** Persist whatever the authoritative side would need to resume. */
  const persist = () => {
    const s = get();
    if (s.mode === 'client') {
      // Spectators (seat -1) have nothing to resume into.
      if (s.game && s.roomCode && (s.mySeat ?? 0) >= 0) {
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
      botLevels: s.botLevels,
      roster: s.mode === 'host' ? net.seatRoster() : undefined,
    });
  };

  // Live-game directory row refresh throttle (host side).
  let lastRoomRefresh = 0;

  // Table talk. The host is the hub: it validates (rate limit + length),
  // stamps the seat from the connection, relays to everyone, and shows it
  // locally. Sanitized here so a modified client cannot spoof or flood.
  let nextBubbleId = 1;
  const lastChatAt: Record<number, number> = {};
  const deliverChat = (seat: number, text: string, big: boolean) => {
    const s = get();
    const name = s.game?.players[seat]?.name ?? `seat ${seat + 1}`;
    set({
      bubbles: { ...s.bubbles, [seat]: { id: nextBubbleId++, text, big } },
      log: [...s.log, `${name}: ${text}`].slice(-120),
    });
  };
  const hostRelayChat = (seat: number, rawText: string, big: boolean) => {
    const now = Date.now();
    if (now - (lastChatAt[seat] ?? 0) < 600) return; // flood gate
    const text = rawText.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 140);
    if (!text) return;
    lastChatAt[seat] = now;
    net.chat(seat, text, big);
    deliverChat(seat, text, big);
  };

  // Bots talk a little: rare, event-driven emotes through the same relay
  // real players use. Deterministic gate (no Math.random) keeps sims stable
  // and the table from turning into a chat room.
  const botTableTalk = (prev: GameState, next: GameState) => {
    const kinds = get().seatKinds;
    next.players.forEach((p, seat) => {
      if (kinds[seat] !== 'bot') return;
      const q = prev.players[seat]!;
      const gate = (next.round * 31 + seat * 7 + p.hp + p.money) % 4;
      if (next.winner === seat && prev.winner === null) hostRelayChat(seat, 'GG', true);
      else if (p.eliminated && !q.eliminated) hostRelayChat(seat, 'GG', true);
      else if (q.hp - p.hp >= 4 && gate === 0) hostRelayChat(seat, 'Ouch!', true);
      else if (p.money - q.money >= 5 && gate === 1) hostRelayChat(seat, 'Nice!', true);
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
        fx: [],
        connectedSeats: state.players.map(() => true),
        log: [
          seat < 0
            ? `watching a ${state.players.length}-player game`
            : `joined ${state.players.length}-player online game as ${state.players[seat]!.name}`,
        ],
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
    onSpectate: (id) => {
      const s = get();
      if (!s.game) return;
      net.beginSpectator(id, s.game, s.seatKinds);
    },
    onMeta: (connected, seatKinds) => set({ connectedSeats: connected, seatKinds }),
    onChatSend: (seat, text, big) => hostRelayChat(seat, text, big),
    onChat: (seat, text, big) => deliverChat(seat, text, big),
    onDrop: (reason) => {
      set({
        game: null,
        mode: 'offline',
        mySeat: null,
        roomCode: null,
        lobby: [],
        pulses: [],
        fx: [],
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
        fx: [],
    mode: 'offline',
    mySeat: null,
    roomCode: null,
    lobby: [],
    netNotice: null,
    seatProfiles: [],
    connectedSeats: [],
    botLevels: [],
    bubbles: {},
    sendChat: (text, big = false) => {
      const s = get();
      if (!s.game || s.mode === 'offline') return;
      if (s.mode === 'client') {
        net.sendChat(text, big);
        return;
      }
      hostRelayChat(s.mySeat ?? 0, text, big); // the host talks through the same gate
    },
    start: (playerCount, roundCap, seed, kinds, colors, levels) => {
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
        botLevels: levels?.slice(0, playerCount) ?? Array<BotLevel>(playerCount).fill('normal'),
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
      botTableTalk(prev, next);
      if (mode === 'host') {
        net.sync(action, next);
        // Game just ended: record the result and leave the live-games list.
        if (next.winner !== null && prev.winner === null) {
          reportMatch(next, get().seatProfiles);
          if (get().roomCode) unpublishRoom(get().roomCode!);
        } else if (get().roomCode && Date.now() - lastRoomRefresh > 120_000) {
          // Keep the spectate row fresh so crashed hosts age out fast.
          lastRoomRefresh = Date.now();
          publishRoom(get().roomCode!, next.players[0]?.name ?? 'Host', next.players.length, 'playing');
        }
      }
      persist();
    },
    reset: () => {
      const s = get();
      if (s.mode === 'host' && s.roomCode) unpublishRoom(s.roomCode);
      net.leave();
      clearSavedSession();
      set({
        game: null,
        log: [],
        pulses: [],
        fx: [],
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
    spectateRoom: async (code, name) => {
      set({ netNotice: null });
      await net.join(code, name, null, true);
      set({ mode: 'client', roomCode: code });
      // The host answers with begin(seat -1); until then the lobby screen
      // shows the connecting state.
    },
    startOnline: (botCount, roundCap, colors, botLevel = 'normal') => {
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
        botLevels: Array<BotLevel>(seats.names.length).fill(botLevel),
        log: [`online game started: ${seats.names.join(', ')}`],
      });
      net.begin(game, seats.kinds);
      // The lobby leaves the open list and becomes a spectatable live game.
      if (get().roomCode) {
        publishRoom(get().roomCode!, seats.names[0] ?? 'Host', seats.names.length, 'playing');
      }
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
        botLevels: saved.botLevels ?? saved.game.players.map(() => 'normal' as BotLevel),
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
      publishRoom(code, saved.myName ?? 'Host', saved.game.players.length, 'playing');
      rng = mulberry32(((Date.now() % 0xffffffff) + 1) >>> 0);
      set({
        game: saved.game,
        seatKinds: saved.seatKinds ?? saved.game.players.map(() => 'human' as SeatKind),
        seatProfiles: saved.seatProfiles ?? saved.game.players.map(() => null),
        botLevels: saved.botLevels ?? saved.game.players.map(() => 'normal' as BotLevel),
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

// Dev-only console handle so fx/animation paths can be poked in a harness.
if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
  (globalThis as { __game?: typeof useGame }).__game = useGame;
}
