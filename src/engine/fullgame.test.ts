import { describe, expect, it } from 'vitest';
import { pools } from '../content/cards';
import { starterBoard } from '../content/starters';
import { applyAction, legalActions } from './reducer';
import { mulberry32 } from './rng';
import { createGame } from './setup';
import { newGame } from './test-helpers';
import type { GameState, Rng, SeatColor, WinReason } from './types';

function pooledGame(playerCount: number, rng: Rng): GameState {
  const colors: SeatColor[] = ['red', 'blue', 'red', 'blue'];
  return createGame(
    {
      seats: Array.from({ length: playerCount }, (_, i) => ({
        name: `P${i}`,
        color: colors[i % colors.length] as SeatColor,
      })),
      starterBoard: starterBoard(),
      pools: pools(),
      // Random play needs the failsafe to terminate; the shipping default is
      // uncapped (roundCap 0) since 2026-07-14.
      tunables: { roundCap: 25 },
    },
    rng,
  );
}

/** Plays every action from legalActions until the game ends, choosing
 *  uniformly with the same rng that rolls the dice and shuffles the pools. */
function playOut(playerCount: number, seed: number, pooled = false): GameState {
  const rng = mulberry32(seed);
  let s = pooled ? pooledGame(playerCount, rng) : newGame(playerCount);
  for (let step = 0; step < 20_000; step++) {
    const actions = legalActions(s);
    if (actions.length === 0) return s;
    const pick = actions[Math.floor(rng.next() * actions.length)]!;
    s = applyAction(s, pick, rng);
    assertInvariants(s);
  }
  throw new Error('game did not terminate within 20k actions');
}

function assertInvariants(s: GameState): void {
  for (const p of s.players) {
    expect(p.money).toBeGreaterThanOrEqual(0);
    expect(p.hp).toBeGreaterThanOrEqual(0);
    expect(p.hp).toBeLessThanOrEqual(s.tunables.startingHp);
    expect(p.board).toHaveLength(12);
  }
  if (s.tunables.roundCap > 0) expect(s.round).toBeLessThanOrEqual(s.tunables.roundCap);
  expect(s.players.some((p) => !p.eliminated)).toBe(true);
}

const WIN_REASONS: WinReason[] = ['points', 'ko', 'failsafe'];

describe('full games with starter cards only', () => {
  it('a 2-player game plays to a win through legalActions alone', () => {
    const s = playOut(2, 42);
    expect(s.winner).not.toBeNull();
    expect(s.winReason).toBe('failsafe'); // starters cannot KO and barely score
    expect(s.round).toBe(s.tunables.roundCap);
  });

  it('a 4-player game plays to a win through legalActions alone', () => {
    const s = playOut(4, 1337);
    expect(s.winner).not.toBeNull();
    expect(s.winReason).toBe('failsafe');
  });

  it('is deterministic: same seed, same final state', () => {
    const a = playOut(4, 7);
    const b = playOut(4, 7);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('full games with the exemplar pools (shop, buys, tokens, targeting)', () => {
  it('a 2-player pooled game plays to a win', () => {
    const s = playOut(2, 42, true);
    expect(s.winner).not.toBeNull();
    expect(WIN_REASONS).toContain(s.winReason);
  });

  it('a 4-player pooled game plays to a win', () => {
    const s = playOut(4, 1337, true);
    expect(s.winner).not.toBeNull();
    expect(WIN_REASONS).toContain(s.winReason);
  });

  it('random play actually buys cards and grows echo stacks', () => {
    const s = playOut(4, 99, true);
    const retired = s.players.reduce((sum, p) => sum + p.echoStack.length, 0);
    expect(retired).toBeGreaterThan(0);
  });

  it('is deterministic with pools too', () => {
    const a = playOut(4, 55, true);
    const b = playOut(4, 55, true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('a black/green/yellow/red table plays to a win (new primitives end to end)', () => {
    const rng = mulberry32(2026);
    const seats: SeatColor[] = ['black', 'green', 'yellow', 'red'];
    let s = createGame(
      {
        seats: seats.map((color, i) => ({ name: `P${i}`, color })),
        starterBoard: starterBoard(),
        pools: pools(),
      },
      rng,
    );
    for (let step = 0; step < 20_000; step++) {
      const actions = legalActions(s);
      if (actions.length === 0) break;
      s = applyAction(s, actions[Math.floor(rng.next() * actions.length)]!, rng);
      assertInvariants(s);
    }
    expect(s.winner).not.toBeNull();
  });
});

describe('serializability', () => {
  it('GameState survives a JSON round trip mid-game and plays on identically', () => {
    const seed = 99;
    const steps = 37;

    // Uninterrupted reference run.
    const rngA = mulberry32(seed);
    let a = pooledGame(2, rngA);
    for (let i = 0; i < steps * 2; i++) {
      const actions = legalActions(a);
      if (actions.length === 0) break;
      a = applyAction(a, actions[Math.floor(rngA.next() * actions.length)]!, rngA);
    }

    // Same run, serialized and revived halfway through.
    const rngB: Rng = mulberry32(seed);
    let b: GameState = pooledGame(2, rngB);
    for (let i = 0; i < steps; i++) {
      const actions = legalActions(b);
      if (actions.length === 0) break;
      b = applyAction(b, actions[Math.floor(rngB.next() * actions.length)]!, rngB);
    }
    const revived: GameState = JSON.parse(JSON.stringify(b));
    expect(revived).toEqual(b); // nothing non-serializable in there
    b = revived;
    for (let i = steps; i < steps * 2; i++) {
      const actions = legalActions(b);
      if (actions.length === 0) break;
      b = applyAction(b, actions[Math.floor(rngB.next() * actions.length)]!, rngB);
    }

    expect(b).toEqual(a);
  });
});
