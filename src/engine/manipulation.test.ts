import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from './reducer';
import { deadRng, diceRng, newGame } from './test-helpers';

describe('manipulation window', () => {
  it('reroll token rerolls one die through the injected rng', () => {
    const s0 = newGame(2);
    s0.players[0]!.tokens.reroll = 1;
    let s = applyAction(s0, { type: 'ROLL' }, diceRng(2, 5));
    s = applyAction(s, { type: 'SPEND_TOKEN', kind: 'reroll', dieIndex: 0 }, diceRng(6));
    expect(s.dice).toEqual([6, 5]);
    expect(s.players[0]!.tokens.reroll).toBe(0);
    expect(legalActions(s).some((a) => a.type === 'SPEND_TOKEN')).toBe(false); // spent out
    expect(() =>
      applyAction(s, { type: 'SPEND_TOKEN', kind: 'reroll', dieIndex: 1 }, diceRng(1)),
    ).toThrow(/no reroll token/);
  });

  it('nudge shifts a die by +-1 within 1..6, and legality knows the edges', () => {
    const s0 = newGame(2);
    s0.players[0]!.tokens.nudge = 2;
    let s = applyAction(s0, { type: 'ROLL' }, diceRng(6, 5));
    const nudges = legalActions(s).filter((a) => a.type === 'SPEND_TOKEN');
    // Die 0 shows 6: only -1 offered. Die 1 shows 5: both directions.
    expect(nudges).toEqual([
      { type: 'SPEND_TOKEN', kind: 'nudge', dieIndex: 0, delta: -1 },
      { type: 'SPEND_TOKEN', kind: 'nudge', dieIndex: 1, delta: -1 },
      { type: 'SPEND_TOKEN', kind: 'nudge', dieIndex: 1, delta: 1 },
    ]);
    expect(() =>
      applyAction(s, { type: 'SPEND_TOKEN', kind: 'nudge', dieIndex: 0, delta: 1 }, deadRng()),
    ).toThrow(/push die to 7/);
    s = applyAction(s, { type: 'SPEND_TOKEN', kind: 'nudge', dieIndex: 0, delta: -1 }, deadRng());
    s = applyAction(s, { type: 'SPEND_TOKEN', kind: 'nudge', dieIndex: 1, delta: 1 }, deadRng());
    expect(s.dice).toEqual([5, 6]);
    expect(s.players[0]!.tokens.nudge).toBe(0);
  });

  it('the window closes once dice are allocated', () => {
    const s0 = newGame(2);
    s0.players[0]!.tokens.reroll = 1;
    let s = applyAction(s0, { type: 'ROLL' }, diceRng(2, 5));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, deadRng());
    expect(() =>
      applyAction(s, { type: 'SPEND_TOKEN', kind: 'reroll', dieIndex: 0 }, diceRng(1)),
    ).toThrow(/illegal action/);
  });
});
