import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from './reducer';
import { mulberry32 } from './rng';
import { newGame } from './test-helpers';
import type { GameState, Rng } from './types';

/** Plays every action from legalActions until the game ends, choosing
 *  uniformly with the same rng that rolls the dice. */
function playOut(playerCount: number, seed: number): GameState {
  let s = newGame(playerCount);
  const rng = mulberry32(seed);
  for (let step = 0; step < 10_000; step++) {
    const actions = legalActions(s);
    if (actions.length === 0) return s;
    const pick = actions[Math.floor(rng.next() * actions.length)]!;
    s = applyAction(s, pick, rng);
    assertInvariants(s);
  }
  throw new Error('game did not terminate within 10k actions');
}

function assertInvariants(s: GameState): void {
  for (const p of s.players) {
    expect(p.money).toBeGreaterThanOrEqual(0);
    expect(p.hp).toBeGreaterThanOrEqual(0);
    expect(p.hp).toBeLessThanOrEqual(s.tunables.startingHp);
    expect(p.board).toHaveLength(12);
  }
  expect(s.round).toBeLessThanOrEqual(s.tunables.roundCap);
  expect(s.players.some((p) => !p.eliminated)).toBe(true);
}

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

describe('serializability', () => {
  it('GameState survives a JSON round trip mid-game and plays on identically', () => {
    const seed = 99;
    const steps = 37;

    // Uninterrupted reference run.
    let a = newGame(2);
    const rngA = mulberry32(seed);
    for (let i = 0; i < steps * 2; i++) {
      const actions = legalActions(a);
      if (actions.length === 0) break;
      a = applyAction(a, actions[Math.floor(rngA.next() * actions.length)]!, rngA);
    }

    // Same run, serialized and revived halfway through.
    let b: GameState = newGame(2);
    const rngB: Rng = mulberry32(seed);
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
