// The 2026-07-14 mechanics batch: steal, swapBoard, charge, winGame.
import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from './reducer';
import { mulberry32 } from './rng';
import { diceRng, newGame, newPoolGame, testCard } from './test-helpers';
import type { Action, Effect } from './types';

const rng = () => mulberry32(0xd1ce);

/** Puts a card with the given actives into seat 0's slot 4 and fires it by
 *  rolling 2+2 split (slot 4 fires once... actually 2+2 split fires slot 2
 *  twice; roll 1+3 and take the sum for a single slot-4 fire). */
function fireSlot4(active: Effect[], times = 1) {
  let s = newGame(2);
  s.players[0]!.board[3] = testCard({ id: 'rig', legalSlots: [4], active });
  for (let i = 0; i < times; i++) {
    s = applyAction(s, { type: 'ROLL' }, diceRng(1, 3));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, rng());
    if (s.winner !== null || i === times - 1) return s;
    // Complete the round so seat 0 can fire again. The opponent's starter
    // income lands on THEIR ledger; assertions only read seat interactions
    // that happened on seat 0's turns.
    s = applyAction(s, { type: 'SKIP_BUY' }, rng());
    s = applyAction(s, { type: 'END_TURN' }, rng());
    s = applyAction(s, { type: 'ROLL' }, diceRng(1, 3));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, rng());
    s = applyAction(s, { type: 'SKIP_BUY' }, rng());
    s = applyAction(s, { type: 'END_TURN' }, rng());
  }
  return s;
}

describe('steal', () => {
  it('moves money from the victim, capped by their purse', () => {
    const s = fireSlot4([{ kind: 'steal', amount: 3, target: 'chooseOpponent' }]);
    // 2p: single target auto-resolves. Both started at 5 (helpers pin money).
    expect(s.players[1]!.money).toBe(2);
    expect(s.players[0]!.money).toBe(8);
  });

  it('cannot steal more than the victim has', () => {
    let s = newGame(2);
    s.players[1]!.money = 1;
    s.players[0]!.board[3] = testCard({
      id: 'rig',
      legalSlots: [4],
      active: [{ kind: 'steal', amount: 5, target: 'chooseOpponent' }],
    });
    s = applyAction(s, { type: 'ROLL' }, diceRng(1, 3));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, rng());
    expect(s.players[1]!.money).toBe(0);
    expect(s.players[0]!.money).toBe(6);
  });

  it('pauses for a target in 3p and resolves via CHOOSE_TARGET', () => {
    let s = newGame(3);
    s.players[0]!.board[3] = testCard({
      id: 'rig',
      legalSlots: [4],
      active: [{ kind: 'steal', amount: 2, target: 'chooseOpponent' }],
    });
    s = applyAction(s, { type: 'ROLL' }, diceRng(1, 3));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, rng());
    expect(s.phase).toBe('chooseTarget');
    s = applyAction(s, { type: 'CHOOSE_TARGET', playerId: 2 }, rng());
    expect(s.players[2]!.money).toBe(3);
    expect(s.players[0]!.money).toBe(7);
  });
});

describe('swapBoard', () => {
  it('swaps the two board cards and their charge counters', () => {
    let s = newGame(2);
    const two = s.players[0]!.board[1]!;
    const twelve = s.players[0]!.board[11]!;
    s.players[0]!.charges[11] = 3;
    s.players[0]!.board[3] = testCard({
      id: 'rig',
      legalSlots: [4],
      active: [{ kind: 'swapBoard', a: 2, b: 12 }],
    });
    s = applyAction(s, { type: 'ROLL' }, diceRng(1, 3));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, rng());
    expect(s.players[0]!.board[1]!.id).toBe(twelve.id);
    expect(s.players[0]!.board[11]!.id).toBe(two.id);
    expect(s.players[0]!.charges[1]).toBe(3); // the charge rode along
    expect(s.players[0]!.charges[11]).toBe(0);
  });
});

describe('charge', () => {
  it('accumulates per fire, pays out at need, and resets', () => {
    const active: Effect[] = [
      { kind: 'charge', need: 3, then: [{ kind: 'gainPoints', amount: 5 }] },
    ];
    const after2 = fireSlot4(active, 2);
    expect(after2.players[0]!.charges[3]).toBe(2);
    expect(after2.players[0]!.points).toBe(0);
    const after3 = fireSlot4(active, 3);
    expect(after3.players[0]!.points).toBe(5);
    expect(after3.players[0]!.charges[3]).toBe(0); // reset after the payoff
  });

  it('winGame inside a charge ends the game with reason card', () => {
    const s = fireSlot4([{ kind: 'charge', need: 2, then: [{ kind: 'winGame' }] }], 2);
    expect(s.winner).toBe(0);
    expect(s.winReason).toBe('card');
  });

  it('a new purchase resets the slot counter', () => {
    let s = newPoolGame(2, 7);
    s = applyAction(s, { type: 'ROLL' }, diceRng(1, 3));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, rng());
    expect(s.phase).toBe('buy');
    s.players[0]!.money = 30;
    const buy = legalActions(s).find(
      (a): a is Action & { type: 'BUY' } => a.type === 'BUY',
    );
    expect(buy).toBeDefined();
    s.players[0]!.charges[buy!.targetSlot - 1] = 4;
    s = applyAction(s, buy!, rng());
    expect(s.players[0]!.charges[buy!.targetSlot - 1]).toBe(0);
  });
});
