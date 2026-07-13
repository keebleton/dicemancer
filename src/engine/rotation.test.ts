import { describe, expect, it } from 'vitest';
import { applyAction, legalTargets } from './reducer';
import { mulberry32 } from './rng';
import {
  deadRng,
  diceRng,
  moneyEcho,
  newGame,
  playTurn,
  rollerDamageEcho,
  testCard,
} from './test-helpers';

describe('4-player turn rotation', () => {
  it('passes seat by seat and increments the round on wrap', () => {
    let s = newGame(4);
    expect(s.current).toBe(0);
    expect(s.round).toBe(1);
    for (const expected of [1, 2, 3]) {
      s = playTurn(s, [2, 3], 'individual');
      expect(s.current).toBe(expected);
      expect(s.round).toBe(1);
    }
    s = playTurn(s, [2, 3], 'individual');
    expect(s.current).toBe(0);
    expect(s.round).toBe(2);
  });
});

describe('elimination', () => {
  it('skips eliminated seats, including across the wrap', () => {
    let s = newGame(4);
    s.players[1]!.eliminated = true;
    s = playTurn(s, [2, 3], 'individual'); // p0 ends
    expect(s.current).toBe(2); // p1 skipped
    s = playTurn(s, [2, 3], 'individual'); // p2 ends
    expect(s.current).toBe(3);
    s = playTurn(s, [2, 3], 'individual'); // p3 ends, wraps
    expect(s.current).toBe(0);
    expect(s.round).toBe(2);
  });

  it('handles an eliminated seat 0 in the wrap math', () => {
    let s = newGame(4);
    s.players[0]!.eliminated = true;
    s.current = 1;
    s = playTurn(s, [2, 3], 'individual'); // p1
    expect(s.current).toBe(2);
    s = playTurn(s, [2, 3], 'individual'); // p2
    expect(s.current).toBe(3);
    s = playTurn(s, [2, 3], 'individual'); // p3 wraps past dead p0
    expect(s.current).toBe(1);
    expect(s.round).toBe(2);
  });

  it('leaves eliminated echo stacks inert while living ones still fire', () => {
    const s0 = newGame(4);
    const entry = { def: testCard({ id: 'echo-4', echo: moneyEcho(1) }), slot: 4 };
    s0.players[1]!.echoStack = [structuredClone(entry)];
    s0.players[2]!.echoStack = [structuredClone(entry)];
    s0.players[2]!.eliminated = true;
    s0.players[3]!.echoStack = [structuredClone(entry)];
    let s = applyAction(s0, { type: 'ROLL' }, diceRng(4, 4));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    s = applyAction(s, { type: 'ECHO_CHOICE', mode: 'individual' }, deadRng()); // p1 (p2 skipped)
    s = applyAction(s, { type: 'ECHO_CHOICE', mode: 'individual' }, deadRng()); // p3
    expect(s.players[1]!.money).toBe(5 + 2); // fired twice (doubles)
    expect(s.players[2]!.money).toBe(5); // inert: never even offered the choice
    expect(s.players[3]!.money).toBe(5 + 2);
    expect(s.phase).toBe('buy');
  });

  it('makes eliminated players untargetable', () => {
    const s = newGame(4);
    s.players[2]!.eliminated = true;
    expect(legalTargets(s, 0)).toEqual([1, 3]); // no self, no eliminated
    expect(legalTargets(s, 3)).toEqual([0, 1]);
  });

  it('ends the turn on the spot when echo damage eliminates the roller mid-turn', () => {
    const s0 = newGame(4);
    s0.players[0]!.hp = 1;
    s0.players[1]!.echoStack = [
      { def: testCard({ id: 'chip', echo: rollerDamageEcho(1) }), slot: 3 },
    ];
    let s = applyAction(s0, { type: 'ROLL' }, diceRng(3, 5));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    s = applyAction(s, { type: 'ECHO_CHOICE', mode: 'individual' }, mulberry32(1)); // p1's chip kills p0
    expect(s.players[0]!.eliminated).toBe(true);
    expect(s.winner).toBeNull(); // three players still standing
    expect(s.current).toBe(1); // turn passed automatically
    expect(s.phase).toBe('roll');
  });

  it('echo damage against an already-eliminated roller fizzles', () => {
    const s0 = newGame(4);
    s0.players[0]!.hp = 1;
    // Two chip echoes on the same produced number: the first kills, the second must fizzle.
    s0.players[1]!.echoStack = [
      { def: testCard({ id: 'chip-a', echo: rollerDamageEcho(1) }), slot: 3 },
    ];
    s0.players[2]!.echoStack = [
      { def: testCard({ id: 'chip-b', echo: rollerDamageEcho(5) }), slot: 3 },
    ];
    let s = applyAction(s0, { type: 'ROLL' }, diceRng(3, 5));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    s = applyAction(s, { type: 'ECHO_CHOICE', mode: 'individual' }, deadRng()); // p1 kills p0
    s = applyAction(s, { type: 'ECHO_CHOICE', mode: 'individual' }, mulberry32(2)); // p2 fizzles
    expect(s.players[0]!.hp).toBe(0); // not driven negative, no double elimination
    expect(s.players[0]!.eliminated).toBe(true);
  });
});
