import { create } from 'zustand';
import { pools } from '../content/cards';
import { starterBoard } from '../content/starters';
import { applyAction, createGame, mulberry32 } from '../engine';
import type { Action, GameState, Rng, SeatColor } from '../engine';
import { describeTransition } from './describe';

// The game's rng lives beside the store, not inside GameState (it is stateful
// and non-serializable). Seeded once per game.
let rng: Rng = mulberry32(1);

interface GameStore {
  game: GameState | null;
  log: string[];
  start: (playerCount: number, roundCap: number, seed?: number) => void;
  /** The ONLY writer: every state change goes through the engine's applyAction. */
  dispatch: (action: Action) => void;
  reset: () => void;
}

export const useGame = create<GameStore>()((set, get) => ({
  game: null,
  log: [],
  start: (playerCount, roundCap, seed) => {
    rng = mulberry32(seed ?? Date.now() >>> 0);
    const colors: SeatColor[] = ['red', 'blue', 'red', 'blue'];
    const game = createGame(
      {
        seats: Array.from({ length: playerCount }, (_, i) => ({
          name: `Player ${i + 1}`,
          color: colors[i % colors.length] as SeatColor,
        })),
        starterBoard: starterBoard(),
        pools: pools(),
        tunables: { roundCap },
      },
      rng,
    );
    set({ game, log: [`game started: ${playerCount} players, round cap ${roundCap}`] });
  },
  dispatch: (action) => {
    const prev = get().game;
    if (!prev) return;
    const next = applyAction(prev, action, rng);
    set({ game: next, log: [...get().log, ...describeTransition(prev, action, next)].slice(-120) });
  },
  reset: () => set({ game: null, log: [] }),
}));
