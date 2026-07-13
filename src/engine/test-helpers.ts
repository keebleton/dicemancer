// Test-only helpers (imported by *.test.ts, never by shipping code).
import { pools } from '../content/cards';
import { starterBoard } from '../content/starters';
import { applyAction } from './reducer';
import { mulberry32 } from './rng';
import { createGame } from './setup';
import type {
  AllocationMode,
  CardDef,
  Effect,
  GameState,
  Rng,
  SeatColor,
  Tunables,
} from './types';

/** An Rng that yields the given die faces in order, then throws.
 *  (d - 1) / 6 + epsilon makes rollDie return exactly d. */
export function diceRng(...faces: number[]): Rng {
  const queue = [...faces];
  return {
    next() {
      const face = queue.shift();
      if (face === undefined) throw new Error('diceRng exhausted');
      if (face < 1 || face > 6) throw new Error(`bad die face ${face}`);
      return (face - 1) / 6 + 1e-9;
    },
  };
}

/** Rng no action under test should touch. */
export function deadRng(): Rng {
  return {
    next() {
      throw new Error('rng consulted unexpectedly');
    },
  };
}

function seats(playerCount: number) {
  const colors: SeatColor[] = ['red', 'blue', 'red', 'blue'];
  return Array.from({ length: playerCount }, (_, i) => ({
    name: `P${i}`,
    color: colors[i % colors.length] as SeatColor,
  }));
}

export function newGame(playerCount: number, tunables?: Partial<Tunables>): GameState {
  return createGame({ seats: seats(playerCount), starterBoard: starterBoard(), tunables });
}

/** Game with the exemplar card pools and shops dealt from the given seed. */
export function newPoolGame(
  playerCount: number,
  seed: number,
  tunables?: Partial<Tunables>,
): GameState {
  return createGame(
    { seats: seats(playerCount), starterBoard: starterBoard(), pools: pools(), tunables },
    mulberry32(seed),
  );
}

/** One full scripted turn: roll the given faces, allocate, skip buy, end turn.
 *  Stops early if a win (or a mid-turn roller death) already ended the turn.
 *  Non-roll steps get a fixed-seed rng: shop refreshes may shuffle. */
export function playTurn(
  state: GameState,
  faces: [number, number],
  mode: AllocationMode,
): GameState {
  const rng = mulberry32(0xd1ce);
  let s = applyAction(state, { type: 'ROLL' }, diceRng(...faces));
  s = applyAction(s, { type: 'ALLOCATE', mode }, rng);
  if (s.winner !== null || s.phase !== 'buy') return s;
  s = applyAction(s, { type: 'SKIP_BUY' }, rng);
  if (s.winner !== null) return s;
  return applyAction(s, { type: 'END_TURN' }, rng);
}

/** Minimal card for crafting boards and echo stacks in tests. */
export function testCard(overrides: Partial<CardDef> & { id: string }): CardDef {
  return {
    name: overrides.id,
    color: 'colorless',
    rarity: 'common',
    cost: 3,
    legalSlots: [1],
    active: [],
    echo: [],
    ...overrides,
  };
}

export function moneyEcho(amount: number): Effect[] {
  return [{ kind: 'gainMoney', amount }];
}

export function rollerDamageEcho(amount: number): Effect[] {
  return [{ kind: 'damage', amount, target: 'roller' }];
}
