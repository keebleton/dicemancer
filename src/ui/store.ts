import { create } from 'zustand';
import { pools } from '../content/cards';
import { starterBoard } from '../content/starters';
import { applyAction, createGame, mulberry32 } from '../engine';
import type { Action, GameState, Rng, SeatColor } from '../engine';
import { describeTransition } from './describe';

// The game's rng lives beside the store, not inside GameState (it is stateful
// and non-serializable). Seeded once per game.
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
  start: (
    playerCount: number,
    roundCap: number,
    seed?: number,
    kinds?: SeatKind[],
    colors?: SeatColor[],
  ) => void;
  /** The ONLY writer: every state change goes through the engine's applyAction. */
  dispatch: (action: Action) => void;
  reset: () => void;
}

export const useGame = create<GameStore>()((set, get) => ({
  game: null,
  seatKinds: [],
  log: [],
  pulses: [],
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
        starterBoard: starterBoard(),
        pools: pools(),
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
    const prev = get().game;
    if (!prev) return;
    const next = applyAction(prev, action, rng);
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
    set({
      game: next,
      pulses: [...get().pulses, ...fresh].slice(-24),
      log: [...get().log, ...describeTransition(prev, action, next)].slice(-120),
    });
  },
  reset: () => set({ game: null, log: [], pulses: [] }),
}));
