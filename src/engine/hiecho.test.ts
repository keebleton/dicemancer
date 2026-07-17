// The highEchoHearsSum rule: echoes sitting in slots 7-12 hear the SUM of
// every roll regardless of the owner's split/sum choice. Default OFF.
import { describe, expect, it } from 'vitest';
import { applyAction } from './reducer';
import { mulberry32 } from './rng';
import { diceRng, moneyEcho, newGame, testCard } from './test-helpers';

const rng = () => mulberry32(0xd1ce);

function withHighEcho(on: boolean) {
  const s = newGame(2, { highEchoHearsSum: on });
  // Opponent (seat 1) has a retired card echoing in slot 9: +2 money.
  s.players[1]!.echoStack.push({
    slot: 9,
    def: testCard({ id: 'echo-9', legalSlots: [9], echo: moneyEcho(2) }),
  });
  return s;
}

describe('highEchoHearsSum', () => {
  it('off (default): a split roll never reaches a high echo', () => {
    let s = withHighEcho(false);
    s = applyAction(s, { type: 'ROLL' }, diceRng(4, 5));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, rng());
    // Real decision for seat 1: split hits nothing, sum hits slot 9. The
    // hearing waits concurrently while the roller's buy phase opens.
    expect(s.phase).toBe('buy');
    expect(s.echoPending).toContain(1);
    s = applyAction(s, { type: 'ECHO_CHOICE', mode: 'individual', seat: 1 }, rng());
    expect(s.players[1]!.money).toBe(5); // heard the dice, echo missed
    expect(s.echoPending).toEqual([]);
  });

  it('on: the high echo hears the sum even when the roll is split', () => {
    let s = withHighEcho(true);
    s = applyAction(s, { type: 'ROLL' }, diceRng(4, 5));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, rng());
    // Both interpretations now include slot 9, so there is no decision left:
    // the seat auto-resolves without pausing in echoChoice.
    expect(s.phase).toBe('buy');
    expect(s.players[1]!.money).toBe(7);
    expect(s.echoNumbers[1]).toContain(9);
  });

  it('on: hearing the sum on purpose does not double-fire the high echo', () => {
    let s = withHighEcho(true);
    s = applyAction(s, { type: 'ROLL' }, diceRng(4, 5));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, rng());
    expect(s.phase).toBe('buy');
    expect(s.players[1]!.money).toBe(7); // +2 once, not twice
  });

  it('on: low-slot echoes still obey the owner choice', () => {
    const s0 = newGame(2, { highEchoHearsSum: true });
    s0.players[1]!.echoStack.push({
      slot: 4,
      def: testCard({ id: 'echo-4', legalSlots: [4], echo: moneyEcho(2) }),
    });
    let s = applyAction(s0, { type: 'ROLL' }, diceRng(4, 5));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, rng());
    // Split hits slot 4, sum (9) hits nothing: still a real decision.
    expect(s.phase).toBe('buy');
    expect(s.echoPending).toContain(1);
    s = applyAction(s, { type: 'ECHO_CHOICE', mode: 'sum', seat: 1 }, rng());
    expect(s.players[1]!.money).toBe(5); // chose the sum, low echo missed
  });
});
