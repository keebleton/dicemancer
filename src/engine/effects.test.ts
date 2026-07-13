import { describe, expect, it } from 'vitest';
import { COLORLESS_CARDS, RED_CARDS } from '../content/cards';
import { applyAction, legalActions } from './reducer';
import { mulberry32 } from './rng';
import { deadRng, diceRng, newGame, newPoolGame, testCard } from './test-helpers';
import type { Effect, GameState } from './types';

/** Puts a card with the given active line in the roller's slot 1 and fires it
 *  individually with dice [1, 2] (slot 2 stays a +1 money starter). The
 *  allocate step gets a real rng: refreshShop effects may shuffle. */
function fireSlot1(state: GameState, active: Effect[]): GameState {
  state.players[state.current]!.board[0] = testCard({ id: 'under-test', active });
  let s = applyAction(state, { type: 'ROLL' }, diceRng(1, 2));
  return applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, mulberry32(1));
}

describe('remaining primitives', () => {
  it('heal restores HP and caps at starting HP', () => {
    const s0 = newGame(2);
    s0.players[0]!.hp = 20;
    const s = fireSlot1(s0, [{ kind: 'heal', amount: 99 }]);
    expect(s.players[0]!.hp).toBe(25);
  });

  it('refreshShop redeals the owner row without losing cards', () => {
    const s0 = newPoolGame(2, 5);
    const before = s0.players[0]!.shop.map((c) => c?.id);
    const s = fireSlot1(s0, [{ kind: 'refreshShop' }]);
    const p = s.players[0]!;
    expect(p.shop.every((c) => c !== null)).toBe(true); // pools easily cover a redeal
    // Conservation: every pool card stays in circulation, wherever it sits.
    const colorCount = p.colorDeck.length + p.colorDiscard.length
      + p.shop.filter((c) => c && c.color !== 'colorless').length;
    const colorlessCount = p.colorlessDeck.length + p.colorlessDiscard.length
      + p.shop.filter((c) => c && c.color === 'colorless').length;
    expect(colorCount).toBe(RED_CARDS.length);
    expect(colorlessCount).toBe(COLORLESS_CARDS.length);
    expect(before).toHaveLength(5); // sanity: there was a row to replace
  });
});

describe('targeted damage', () => {
  const bolt: Effect[] = [
    { kind: 'damage', amount: 2, target: 'chooseOpponent' },
    { kind: 'gainMoney', amount: 3 },
  ];

  it('auto-targets when only one opponent lives (2p never pauses)', () => {
    const s = fireSlot1(newGame(2), bolt);
    expect(s.players[1]!.hp).toBe(23);
    expect(s.players[0]!.money).toBe(5 + 3 + 1); // rest of the line + slot 2 starter
    expect(s.phase).toBe('buy');
  });

  it('pauses for CHOOSE_TARGET with several targets, then resumes the line', () => {
    let s = fireSlot1(newGame(3), bolt);
    expect(s.phase).toBe('chooseTarget');
    expect(s.players[0]!.money).toBe(5); // gainMoney still queued behind the choice
    expect(legalActions(s)).toEqual([
      { type: 'CHOOSE_TARGET', playerId: 1 },
      { type: 'CHOOSE_TARGET', playerId: 2 },
    ]);
    expect(() => applyAction(s, { type: 'CHOOSE_TARGET', playerId: 0 }, deadRng())).toThrow(
      /not a legal target/,
    );
    s = applyAction(s, { type: 'CHOOSE_TARGET', playerId: 2 }, deadRng());
    expect(s.players[2]!.hp).toBe(23);
    expect(s.players[1]!.hp).toBe(25);
    expect(s.players[0]!.money).toBe(5 + 3 + 1); // line resumed after the choice
    expect(s.phase).toBe('buy');
    expect(s.pendingEffects).toBeNull();
  });

  it('echo damage always targets the roller, even chooseOpponent lines', () => {
    const s0 = newGame(3);
    s0.players[1]!.echoStack = [
      {
        def: testCard({ id: 'spite', echo: [{ kind: 'damage', amount: 2, target: 'chooseOpponent' }] }),
        slot: 4,
      },
    ];
    let s = applyAction(s0, { type: 'ROLL' }, diceRng(4, 5));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    expect(s.phase).toBe('buy'); // never paused
    expect(s.players[0]!.hp).toBe(23); // roller took it
    expect(s.players[2]!.hp).toBe(25);
  });

  it('a KO mid-line ends the game and drops the rest of the queue', () => {
    const s0 = newGame(2);
    s0.players[1]!.hp = 2;
    const s = fireSlot1(s0, bolt);
    expect(s.winner).toBe(0);
    expect(s.winReason).toBe('ko');
    expect(s.players[0]!.money).toBe(5); // trailing gainMoney never applied
    expect(s.pendingEffects).toBeNull();
  });
});

describe('conditional effects', () => {
  it('sumAtLeast reads the roll total regardless of mode', () => {
    const bonus: Effect[] = [
      { kind: 'conditional', when: { sumAtLeast: 8 }, then: [{ kind: 'gainPoints', amount: 5 }] },
    ];
    const low = fireSlot1(newGame(2), bonus); // fireSlot1 rolls [1, 2]: total 3, no bonus
    expect(low.players[0]!.points).toBe(0);

    const s0 = newGame(2);
    s0.players[0]!.board[0] = testCard({ id: 'under-test', active: bonus });
    let s = applyAction(s0, { type: 'ROLL' }, diceRng(1, 6)); // total 7: one short
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    expect(s.players[0]!.points).toBe(0);

    const s1 = newGame(2);
    s1.players[0]!.board[1] = testCard({ id: 'under-test-2', legalSlots: [2], active: bonus });
    let t = applyAction(s1, { type: 'ROLL' }, diceRng(2, 6)); // total 8
    t = applyAction(t, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    expect(t.players[0]!.points).toBe(5);
  });

  it('allocatedIndividually pays only in individual mode', () => {
    const chrono: Effect[] = [
      { kind: 'gainPoints', amount: 2 },
      {
        kind: 'conditional',
        when: { allocatedIndividually: true },
        then: [{ kind: 'gainPoints', amount: 1 }],
      },
    ];
    const ind = fireSlot1(newGame(2), chrono);
    expect(ind.players[0]!.points).toBe(3);

    const s0 = newGame(2);
    s0.players[0]!.board[2] = testCard({ id: 'chrono-3', legalSlots: [3], active: chrono });
    let s = applyAction(s0, { type: 'ROLL' }, diceRng(1, 2));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, deadRng()); // sum 3 fires it
    expect(s.players[0]!.points).toBe(2);
  });

  it('hpAtOrBelow reads the card owner', () => {
    const desperate: Effect[] = [
      { kind: 'conditional', when: { hpAtOrBelow: 10 }, then: [{ kind: 'gainMoney', amount: 5 }] },
    ];
    const rich = newGame(2);
    rich.players[0]!.hp = 10;
    expect(fireSlot1(rich, desperate).players[0]!.money).toBe(5 + 5 + 1);

    const healthy = newGame(2);
    healthy.players[0]!.hp = 11;
    expect(fireSlot1(healthy, desperate).players[0]!.money).toBe(5 + 1);
  });
});
