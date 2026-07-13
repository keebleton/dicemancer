import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from './reducer';
import { deadRng, diceRng, newGame, playTurn, rollerDamageEcho, testCard } from './test-helpers';

describe('points win', () => {
  it('is checked at end of turn, not the moment the threshold is crossed', () => {
    const s0 = newGame(2);
    s0.players[0]!.points = 29;
    let s = applyAction(s0, { type: 'ROLL' }, diceRng(6, 6));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, deadRng()); // slot 12: +1 point = 30
    expect(s.players[0]!.points).toBe(30);
    expect(s.winner).toBeNull(); // mid-turn: not yet
    s = applyAction(s, { type: 'SKIP_BUY' }, deadRng());
    expect(s.winner).toBeNull();
    s = applyAction(s, { type: 'END_TURN' }, deadRng());
    expect(s.winner).toBe(0);
    expect(s.winReason).toBe('points');
  });

  it('game over means no further actions', () => {
    const s0 = newGame(2);
    s0.players[0]!.points = 30;
    const s = playTurn(s0, [1, 2], 'individual');
    expect(s.winner).toBe(0);
    expect(legalActions(s)).toEqual([]);
    expect(() => applyAction(s, { type: 'ROLL' }, diceRng(1, 1))).toThrow(/game is over/);
  });
});

describe('ko win', () => {
  it('last player standing wins immediately when the other is eliminated', () => {
    const s0 = newGame(2);
    s0.current = 1; // p1 rolls into p0's echo damage
    s0.players[1]!.hp = 1;
    s0.players[0]!.echoStack = [
      { def: testCard({ id: 'chip', echo: rollerDamageEcho(1) }), slot: 3 },
    ];
    let s = applyAction(s0, { type: 'ROLL' }, diceRng(3, 5));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    s = applyAction(s, { type: 'ECHO_CHOICE', mode: 'individual' }, deadRng()); // p0's chip lands
    expect(s.players[1]!.hp).toBe(0);
    expect(s.players[1]!.eliminated).toBe(true);
    expect(s.winner).toBe(0);
    expect(s.winReason).toBe('ko');
    expect(legalActions(s)).toEqual([]);
  });
});

describe('failsafe win', () => {
  it('ends the game when the round cap is done, highest points winning', () => {
    const s0 = newGame(2, { roundCap: 2 });
    s0.players[0]!.points = 3;
    s0.players[1]!.points = 1;
    let s = s0;
    // Round 1: both turns; round 2: both turns; wrapping out of round 2 = cap hit.
    for (let turn = 0; turn < 4; turn++) {
      s = playTurn(s, [1, 2], 'individual'); // money only, no points, no round-12 noise
    }
    expect(s.round).toBe(2); // frozen at the cap, round 3 never starts
    expect(s.winner).toBe(0);
    expect(s.winReason).toBe('failsafe');
  });

  it('breaks point ties by HP', () => {
    const s0 = newGame(2, { roundCap: 1 });
    s0.players[0]!.hp = 20;
    s0.players[1]!.hp = 25;
    let s = playTurn(s0, [1, 2], 'individual');
    s = playTurn(s, [1, 2], 'individual');
    expect(s.winner).toBe(1); // equal points, p1 has more HP
    expect(s.winReason).toBe('failsafe');
  });

  it('never hands the failsafe win to an eliminated player', () => {
    const s0 = newGame(3, { roundCap: 1 });
    s0.players[1]!.points = 99;
    s0.players[1]!.eliminated = true;
    let s = playTurn(s0, [1, 2], 'individual'); // p0
    s = playTurn(s, [1, 2], 'individual'); // p2 (p1 skipped), wraps out of round 1
    expect(s.winner).not.toBe(1);
    expect(s.winReason).toBe('failsafe');
  });
});
