import { describe, expect, it } from 'vitest';
import { pools } from '../content/cards';
import { starterBoard } from '../content/starters';
import { actingSeat, applyAction, createGame, legalActions, mulberry32 } from '../engine';
import { deadRng, diceRng, newGame, testCard } from '../engine/test-helpers';
import type { GameState, Rng, SeatColor } from '../engine';
import { chooseAction } from './index';

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
    },
    rng,
  );
}

/** Seat 0 plays random-legal (the "human"); every other seat is the bot.
 *  applyAction throws on any illegal action, so finishing IS the proof. */
function runHumanPlusBots(playerCount: number, seed: number): GameState {
  const rng = mulberry32(seed);
  const humanPolicy = mulberry32(seed ^ 0x5eed);
  let s = pooledGame(playerCount, rng);
  for (let step = 0; step < 20_000; step++) {
    const actions = legalActions(s);
    if (actions.length === 0) return s;
    const action =
      actingSeat(s) === 0
        ? actions[Math.floor(humanPolicy.next() * actions.length)]!
        : chooseAction(s);
    s = applyAction(s, action, rng);
  }
  throw new Error('game did not finish within 20k actions');
}

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

describe('bot acceptance: seeded human + bot games', () => {
  it.each(SEEDS)('2p game completes without illegal actions (seed %i)', (seed) => {
    const s = runHumanPlusBots(2, seed);
    expect(s.winner).not.toBeNull();
  });

  it.each(SEEDS)('4p game completes without illegal actions (seed %i)', (seed) => {
    const s = runHumanPlusBots(4, seed);
    expect(s.winner).not.toBeNull();
  });

  // Regression: easy's derp hash reads only round/seat/dice, so a derp pick of
  // FREEZE_SHOP (which changes none of those) repeated forever -- ~70% of
  // easy-vs-normal sims hung at the step guard before the pool exclusion.
  it.each(SEEDS)('easy vs normal 2p game reaches a winner (seed %i)', (seed) => {
    const rng = mulberry32(seed ^ 0xea5e);
    let s = pooledGame(2, rng);
    for (let step = 0; step < 20_000; step++) {
      const actions = legalActions(s);
      if (actions.length === 0) break;
      s = applyAction(s, chooseAction(s, actingSeat(s) === 0 ? 'easy' : 'normal'), rng);
    }
    expect(s.winner).not.toBeNull();
  });

  it.each(SEEDS)('hard vs normal 2p game reaches a winner (seed %i)', (seed) => {
    const rng = mulberry32(seed ^ 0x4a4d);
    let s = pooledGame(2, rng);
    for (let step = 0; step < 20_000; step++) {
      const actions = legalActions(s);
      if (actions.length === 0) break;
      s = applyAction(s, chooseAction(s, actingSeat(s) === 0 ? 'hard' : 'normal'), rng);
    }
    expect(s.winner).not.toBeNull();
  });
});

describe('bot heuristics', () => {
  it('targets the point leader', () => {
    const s0 = newGame(4);
    s0.players[0]!.board[0] = testCard({
      id: 'bolt',
      active: [{ kind: 'damage', amount: 2, target: 'chooseOpponent' }],
    });
    s0.players[1]!.points = 5;
    s0.players[2]!.points = 9; // the leader
    s0.players[3]!.points = 5;
    let s = applyAction(s0, { type: 'ROLL' }, diceRng(1, 2));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    expect(s.phase).toBe('chooseTarget');
    expect(chooseAction(s)).toEqual({ type: 'CHOOSE_TARGET', playerId: 2 });
  });

  it('prefers the sum when it is worth more (double 6s: slot 12 beats slot 6 twice)', () => {
    const s0 = newGame(2);
    let s = applyAction(s0, { type: 'ROLL' }, diceRng(6, 6));
    expect(chooseAction(s)).toEqual({ type: 'ALLOCATE', mode: 'sum' });
  });

  it('hard spends a nudge when it flips a weak roll into a jackpot', () => {
    let s = newGame(2);
    s.players[0]!.tokens.nudge = 1;
    s.players[0]!.board[3] = testCard({
      id: 'jackpot',
      legalSlots: [4],
      active: [{ kind: 'gainMoney', amount: 10 }],
    });
    s = applyAction(s, { type: 'ROLL' }, diceRng(3, 6));
    const hard = chooseAction(s, 'hard');
    expect(hard.type).toBe('SPEND_TOKEN');
    if (hard.type === 'SPEND_TOKEN') {
      expect(hard.kind).toBe('nudge');
      expect(hard.dieIndex).toBe(0);
      expect(hard.delta).toBe(1); // 3 -> 4: the jackpot slot fires
    }
    // The baseline bot ignores tokens by design.
    expect(chooseAction(s, 'normal').type).toBe('ALLOCATE');
  });

  it('hard takes lethal over the point leader; normal does not', () => {
    let s = newGame(3);
    s.players[0]!.board[3] = testCard({
      id: 'bolt2',
      legalSlots: [4],
      active: [{ kind: 'damage', amount: 2, target: 'chooseOpponent' }],
    });
    s.players[1]!.points = 10; // the leader
    s.players[2]!.hp = 2; // the kill
    s = applyAction(s, { type: 'ROLL' }, diceRng(1, 3));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, deadRng());
    expect(s.phase).toBe('chooseTarget');
    expect(chooseAction(s, 'hard')).toEqual({ type: 'CHOOSE_TARGET', playerId: 2 });
    expect(chooseAction(s, 'normal')).toEqual({ type: 'CHOOSE_TARGET', playerId: 1 });
  });

  it('easy always returns a legal action, derp rolls included', () => {
    let s = newGame(2);
    const rng = mulberry32(0xea5e);
    for (let step = 0; step < 120 && s.winner === null; step++) {
      const a = chooseAction(s, 'easy');
      expect(legalActions(s).map((x) => JSON.stringify(x))).toContain(JSON.stringify(a));
      s = applyAction(s, a, rng);
    }
  });

  it('buys a clear upgrade and skips overpriced junk', () => {
    const upgrade = newGame(2);
    let s = applyAction(upgrade, { type: 'ROLL' }, diceRng(1, 2));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    s.players[0]!.shop = [
      testCard({ id: 'good-deal', cost: 3, active: [{ kind: 'gainMoney', amount: 3 }] }),
      null,
      null,
      null,
      null,
    ];
    const pick = chooseAction(s);
    expect(pick.type).toBe('BUY');

    s.players[0]!.shop = [
      testCard({ id: 'junk', cost: 5, active: [{ kind: 'gainMoney', amount: 1 }] }),
      null,
      null,
      null,
      null,
    ];
    expect(chooseAction(s)).toEqual({ type: 'SKIP_BUY' });
  });
});
