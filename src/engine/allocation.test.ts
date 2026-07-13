import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from './reducer';
import {
  deadRng,
  diceRng,
  moneyEcho,
  newGame,
  rollerDamageEcho,
  testCard,
} from './test-helpers';

describe('rolling', () => {
  it('ROLL produces two dice from the injected rng and opens allocation', () => {
    const s0 = newGame(2);
    const s1 = applyAction(s0, { type: 'ROLL' }, diceRng(3, 5));
    expect(s1.dice).toEqual([3, 5]);
    expect(s1.phase).toBe('allocate');
    expect(legalActions(s1)).toEqual([
      { type: 'ALLOCATE', mode: 'individual' },
      { type: 'ALLOCATE', mode: 'sum' },
    ]);
  });

  it('never mutates the input state', () => {
    const s0 = newGame(2);
    const snapshot = JSON.parse(JSON.stringify(s0));
    applyAction(s0, { type: 'ROLL' }, diceRng(1, 1));
    expect(s0).toEqual(snapshot);
  });
});

describe('allocation math', () => {
  it('individual mode fires both matching slots (starters: +1 money each)', () => {
    let s = newGame(2);
    s = applyAction(s, { type: 'ROLL' }, diceRng(4, 6));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    expect(s.players[0]!.money).toBe(5 + 1 + 1);
    expect(s.lastAllocation).toEqual({ mode: 'individual', numbers: [4, 6] });
    expect(s.phase).toBe('buy');
  });

  it('sum mode fires the one sum slot (4+6 = slot 10: +3 money)', () => {
    let s = newGame(2);
    s = applyAction(s, { type: 'ROLL' }, diceRng(4, 6));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, deadRng());
    expect(s.players[0]!.money).toBe(5 + 3);
    expect(s.lastAllocation).toEqual({ mode: 'sum', numbers: [10] });
  });

  it('slot 12 starter pays 2 money and 1 point (multi-effect active line)', () => {
    let s = newGame(2);
    s = applyAction(s, { type: 'ROLL' }, diceRng(6, 6));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, deadRng());
    expect(s.players[0]!.money).toBe(7);
    expect(s.players[0]!.points).toBe(1);
  });

  it('doubles allocated individually fire the same card twice', () => {
    let s = newGame(2);
    s = applyAction(s, { type: 'ROLL' }, diceRng(4, 4));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    expect(s.players[0]!.money).toBe(5 + 1 + 1); // slot 4 starter, twice
    expect(s.lastAllocation).toEqual({ mode: 'individual', numbers: [4, 4] });
  });

  it('doubles taken as a sum fire the sum slot once', () => {
    let s = newGame(2);
    s = applyAction(s, { type: 'ROLL' }, diceRng(4, 4));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, deadRng());
    expect(s.players[0]!.money).toBe(5 + 2); // slot 8 starter, once
    expect(s.lastAllocation).toEqual({ mode: 'sum', numbers: [8] });
  });

  it('tracks token gains as resources', () => {
    const s0 = newGame(2);
    s0.players[0]!.board[0] = testCard({
      id: 'token-giver',
      legalSlots: [1],
      active: [{ kind: 'gainToken', token: 'reroll', amount: 2 }],
    });
    let s = applyAction(s0, { type: 'ROLL' }, diceRng(1, 2));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    expect(s.players[0]!.tokens.reroll).toBe(2);
    expect(s.players[0]!.tokens.nudge).toBe(0);
  });
});

describe('echo step', () => {
  it('opponent echo cards matching a produced number fire, paying the stack owner', () => {
    const s0 = newGame(2);
    s0.players[1]!.echoStack = [
      { def: testCard({ id: 'echo-4', echo: moneyEcho(1) }), slot: 4 },
    ];
    let s = applyAction(s0, { type: 'ROLL' }, diceRng(4, 6));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    expect(s.players[1]!.money).toBe(5 + 1); // echo paid the opponent
    expect(s.players[0]!.money).toBe(5 + 2); // roller got only the starter money
  });

  it('doubles produce the number twice, so matching echoes fire twice', () => {
    const s0 = newGame(2);
    s0.players[1]!.echoStack = [
      { def: testCard({ id: 'echo-4', echo: moneyEcho(1) }), slot: 4 },
    ];
    let s = applyAction(s0, { type: 'ROLL' }, diceRng(4, 4));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    expect(s.players[1]!.money).toBe(5 + 2);
  });

  it('sum mode produces only the sum, not the die values', () => {
    const s0 = newGame(2);
    s0.players[1]!.echoStack = [
      { def: testCard({ id: 'echo-4', echo: moneyEcho(1) }), slot: 4 },
      { def: testCard({ id: 'echo-8', echo: moneyEcho(1) }), slot: 8 },
    ];
    let s = applyAction(s0, { type: 'ROLL' }, diceRng(4, 4));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, deadRng());
    expect(s.players[1]!.money).toBe(5 + 1); // only the slot-8 entry matched
  });

  it('all matching cards in one stack fire, and echo damage targets the roller', () => {
    const s0 = newGame(2);
    s0.players[1]!.echoStack = [
      { def: testCard({ id: 'echo-3a', echo: moneyEcho(1) }), slot: 3 },
      { def: testCard({ id: 'echo-3b', echo: rollerDamageEcho(2) }), slot: 3 },
    ];
    let s = applyAction(s0, { type: 'ROLL' }, diceRng(3, 5));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    expect(s.players[1]!.money).toBe(6);
    expect(s.players[0]!.hp).toBe(25 - 2);
  });
});

describe('action legality', () => {
  it('rejects out-of-phase actions', () => {
    const s0 = newGame(2);
    expect(() => applyAction(s0, { type: 'ALLOCATE', mode: 'sum' }, deadRng())).toThrow(
      /illegal action/,
    );
    expect(() => applyAction(s0, { type: 'END_TURN' }, deadRng())).toThrow(/illegal action/);
    const s1 = applyAction(s0, { type: 'ROLL' }, diceRng(1, 2));
    expect(() => applyAction(s1, { type: 'ROLL' }, diceRng(1, 2))).toThrow(/illegal action/);
    const s2 = applyAction(s1, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    expect(() => applyAction(s2, { type: 'END_TURN' }, deadRng())).toThrow(/illegal action/);
  });

  it('every advertised legal action applies without throwing', () => {
    let s = newGame(2);
    for (let guard = 0; guard < 8; guard++) {
      const actions = legalActions(s);
      if (actions.length === 0) break;
      for (const action of actions) {
        expect(() => applyAction(s, action, diceRng(2, 5))).not.toThrow();
      }
      s = applyAction(s, actions[0]!, diceRng(2, 5));
    }
  });
});
