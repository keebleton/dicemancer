import { describe, expect, it } from 'vitest';
import { RED_CARDS } from '../content/cards';
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

  it('refreshShop redeals the owner row without losing cards or touching the market', () => {
    const s0 = newPoolGame(2, 5);
    const before = s0.players[0]!.shop.map((c) => c?.id);
    const marketBefore = s0.market.map((c) => c?.id);
    const s = fireSlot1(s0, [{ kind: 'refreshShop' }]);
    const p = s.players[0]!;
    expect(p.shop.every((c) => c !== null)).toBe(true); // pools easily cover a redeal
    // Conservation: every pool card stays in circulation, wherever it sits.
    const colorCount =
      p.colorDeck.length + p.colorDiscard.length + p.shop.filter((c) => c !== null).length;
    expect(colorCount).toBe(RED_CARDS.length);
    expect(s.market.map((c) => c?.id)).toEqual(marketBefore); // the market is static
    expect(before).toHaveLength(4); // sanity: there was a row to replace
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
    s = applyAction(s, { type: 'ECHO_CHOICE', mode: 'individual' }, deadRng());
    expect(s.phase).toBe('buy'); // an echo never pauses for a target
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

describe('trade (yellow)', () => {
  it('pays the cost and applies the payoff', () => {
    const s = fireSlot1(newGame(2), [
      { kind: 'trade', pay: 3, then: [{ kind: 'gainPoints', amount: 2 }] },
    ]);
    expect(s.players[0]!.money).toBe(5 - 3 + 1); // paid 3, slot 2 starter paid 1
    expect(s.players[0]!.points).toBe(2);
  });

  it('fizzles untouched when the owner cannot pay', () => {
    const s0 = newGame(2);
    s0.players[0]!.money = 2;
    const s = fireSlot1(s0, [
      { kind: 'trade', pay: 3, then: [{ kind: 'gainPoints', amount: 2 }] },
    ]);
    expect(s.players[0]!.money).toBe(2 + 1); // nothing spent
    expect(s.players[0]!.points).toBe(0);
  });

  it('can pause for a target inside the payoff', () => {
    const s0 = newGame(3);
    let s = fireSlot1(s0, [
      { kind: 'trade', pay: 2, then: [{ kind: 'damage', amount: 2, target: 'chooseOpponent' }] },
    ]);
    expect(s.phase).toBe('chooseTarget');
    s = applyAction(s, { type: 'CHOOSE_TARGET', playerId: 1 }, deadRng());
    expect(s.players[1]!.hp).toBe(23);
    expect(s.players[0]!.money).toBe(5 - 2 + 1);
  });
});

describe('discount (green)', () => {
  it('cheapens the next buy, floors at zero, and is consumed by buying', () => {
    const s0 = newGame(2);
    s0.players[0]!.money = 1;
    let s = fireSlot1(s0, [{ kind: 'discount', amount: 5 }]);
    expect(s.players[0]!.buyDiscount).toBe(5);
    s.players[0]!.shop = [
      testCard({ id: 'pricey', cost: 3, active: [{ kind: 'gainMoney', amount: 2 }] }),
      null,
      null,
      null,
      null,
    ];
    expect(legalActions(s).some((a) => a.type === 'BUY')).toBe(true); // effective cost 0
    s = applyAction(s, { type: 'BUY', shopIndex: 0, targetSlot: 1 }, deadRng());
    expect(s.players[0]!.money).toBe(2); // paid nothing
    expect(s.players[0]!.buyDiscount).toBe(0); // consumed
  });

  it('expires when the turn ends', () => {
    const s0 = newGame(2);
    let s = fireSlot1(s0, [{ kind: 'discount', amount: 2 }]);
    s = applyAction(s, { type: 'SKIP_BUY' }, deadRng());
    s = applyAction(s, { type: 'END_TURN' }, mulberry32(4));
    expect(s.players[0]!.buyDiscount).toBe(0);
  });
});

describe('black and green conditionals', () => {
  it('rolledDoubles reads the dice', () => {
    const card = (s0: ReturnType<typeof newGame>) => {
      s0.players[0]!.board[3] = testCard({
        id: 'dbl',
        legalSlots: [4],
        active: [
          { kind: 'conditional', when: { rolledDoubles: true }, then: [{ kind: 'gainPoints', amount: 2 }] },
        ],
      });
      return s0;
    };
    let s = applyAction(card(newGame(2)), { type: 'ROLL' }, diceRng(4, 4));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    expect(s.players[0]!.points).toBe(4); // fired twice on doubles, 2 each

    let t = applyAction(card(newGame(2)), { type: 'ROLL' }, diceRng(4, 5));
    t = applyAction(t, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    expect(t.players[0]!.points).toBe(0);
  });

  it('bothDiceOdd reads parity', () => {
    const bonus: Effect[] = [
      { kind: 'gainMoney', amount: 1 },
      { kind: 'conditional', when: { bothDiceOdd: true }, then: [{ kind: 'gainMoney', amount: 2 }] },
    ];
    const odd = newGame(2);
    odd.players[0]!.board[2] = testCard({ id: 'odd', legalSlots: [3], active: bonus });
    let s = applyAction(odd, { type: 'ROLL' }, diceRng(3, 5));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    expect(s.players[0]!.money).toBe(5 + 1 + 2 + 1); // bonus hit (+ slot 5 starter)

    const mixed = newGame(2);
    mixed.players[0]!.board[2] = testCard({ id: 'odd', legalSlots: [3], active: bonus });
    let t = applyAction(mixed, { type: 'ROLL' }, diceRng(3, 4));
    t = applyAction(t, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    expect(t.players[0]!.money).toBe(5 + 1 + 1); // no bonus
  });

  it('echoStackAtLeast reads the owner graveyard', () => {
    const grave: Effect[] = [
      { kind: 'conditional', when: { echoStackAtLeast: 2 }, then: [{ kind: 'gainPoints', amount: 3 }] },
    ];
    const rich = newGame(2);
    rich.players[0]!.echoStack = [
      { def: testCard({ id: 'g1' }), slot: 1 },
      { def: testCard({ id: 'g2' }), slot: 2 },
    ];
    expect(fireSlot1(rich, grave).players[0]!.points).toBe(3);

    const bare = newGame(2);
    bare.players[0]!.echoStack = [{ def: testCard({ id: 'g1' }), slot: 1 }];
    expect(fireSlot1(bare, grave).players[0]!.points).toBe(0);
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
