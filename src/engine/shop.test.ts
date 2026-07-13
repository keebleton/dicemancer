import { describe, expect, it } from 'vitest';
import { BLUE_CARDS, COLORLESS_CARDS } from '../content/cards';
import { starterBoard } from '../content/starters';
import { applyAction, legalActions } from './reducer';
import { mulberry32 } from './rng';
import { createGame } from './setup';
import { deadRng, diceRng, newPoolGame, playTurn } from './test-helpers';
import type { Action, CardDef, GameState } from './types';

function toBuyPhase(state: GameState, faces: [number, number] = [1, 2]): GameState {
  let s = applyAction(state, { type: 'ROLL' }, diceRng(...faces));
  return applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
}

describe('shop deal', () => {
  it('deals every seat 3 own-color cards + 2 colorless at setup', () => {
    const s = newPoolGame(4, 11);
    for (const p of s.players) {
      expect(p.shop).toHaveLength(5);
      for (const card of p.shop.slice(0, 3)) expect(card?.color).toBe(p.color);
      for (const card of p.shop.slice(3)) expect(card?.color).toBe('colorless');
    }
  });

  it('refreshes the incoming player row at their turn start, not the leaver', () => {
    const s0 = newPoolGame(2, 11);
    const p0Row = s0.players[0]!.shop.map((c) => c!.id);
    const p1DiscardsBefore =
      s0.players[1]!.colorDiscard.length + s0.players[1]!.colorlessDiscard.length;
    const s = playTurn(s0, [1, 2], 'individual'); // p0 skips buy; now p1's turn
    expect(s.players[0]!.shop.map((c) => c!.id)).toEqual(p0Row); // untouched until p0's next turn
    const p1 = s.players[1]!;
    expect(p1.shop.every((c) => c !== null)).toBe(true);
    // The old row went through the discards (some may already be reshuffled back).
    expect(
      p1.colorDiscard.length + p1.colorlessDiscard.length + p1.colorDeck.length
        + p1.colorlessDeck.length,
    ).toBeGreaterThanOrEqual(p1DiscardsBefore);
    // Conservation across the refresh: every pool card stays in circulation.
    const colorCount = p1.colorDeck.length + p1.colorDiscard.length
      + p1.shop.filter((c) => c && c.color !== 'colorless').length;
    expect(colorCount).toBe(BLUE_CARDS.length); // p1 is the blue seat
  });

  it('reshuffles an exhausted pool from its unbought discards', () => {
    // Pools smaller than one row force a reshuffle on the very first refresh.
    const tiny = (ids: string[], color: CardDef['color']): CardDef[] =>
      ids.map((id) => ({
        id,
        name: id,
        color,
        rarity: 'common',
        cost: 3,
        legalSlots: color === 'colorless' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [1, 2],
        active: [{ kind: 'gainMoney', amount: 1 }],
        echo: [],
      }));
    const s0 = createGame(
      {
        seats: [
          { name: 'P0', color: 'red' },
          { name: 'P1', color: 'blue' },
        ],
        starterBoard: starterBoard(),
        pools: {
          red: tiny(['r1', 'r2', 'r3'], 'red'),
          blue: tiny(['b1', 'b2', 'b3'], 'blue'),
          colorless: tiny(['c1', 'c2'], 'colorless'),
        },
      },
      mulberry32(3),
    );
    // Setup drained both decks completely into the rows.
    expect(s0.players[0]!.colorDeck).toHaveLength(0);
    expect(s0.players[0]!.colorlessDeck).toHaveLength(0);
    let s = playTurn(s0, [1, 2], 'individual'); // p0
    s = playTurn(s, [1, 2], 'individual'); // p1; wrap refreshes p0 from reshuffled discards
    const p0 = s.players[0]!;
    expect(p0.shop.every((c) => c !== null)).toBe(true);
    expect(new Set(p0.shop.map((c) => c!.id))).toEqual(new Set(['r1', 'r2', 'r3', 'c1', 'c2']));
  });

  it('deals null holes when a pool is truly short (cards bought out of circulation)', () => {
    const s0 = newPoolGame(2, 11);
    // Empty p0's colorless circulation except one card.
    const p0 = s0.players[0]!;
    p0.colorlessDeck = [];
    p0.colorlessDiscard = [];
    p0.shop[3] = structuredClone(COLORLESS_CARDS[0]!);
    p0.shop[4] = null;
    let s = playTurn(s0, [1, 2], 'individual');
    s = playTurn(s, [1, 2], 'individual'); // back to p0: refresh with 1 colorless in circulation
    expect(s.players[0]!.shop[3]).not.toBeNull();
    expect(s.players[0]!.shop[4]).toBeNull();
  });
});

describe('buy, install, retire', () => {
  it('a BUY pays, installs, retires the displaced card with its slot, and ends buying', () => {
    const s0 = toBuyPhase(newPoolGame(2, 11));
    const buys = legalActions(s0).filter((a): a is Action & { type: 'BUY' } => a.type === 'BUY');
    expect(buys.length).toBeGreaterThan(0);
    const buy = buys[0]!;
    const card = s0.players[0]!.shop[buy.shopIndex]!;
    const displaced = s0.players[0]!.board[buy.targetSlot - 1]!;
    const s = applyAction(s0, buy, deadRng());
    const p = s.players[0]!;
    expect(p.money).toBe(s0.players[0]!.money - card.cost);
    expect(p.board[buy.targetSlot - 1]!.id).toBe(card.id);
    expect(p.echoStack).toContainEqual({ def: displaced, slot: buy.targetSlot });
    expect(p.shop[buy.shopIndex]).toBeNull();
    expect(s.phase).toBe('end'); // max 1 buy per turn
    expect(() => applyAction(s, buy, deadRng())).toThrow(/illegal action/);
  });

  it('colorless cards install into any chosen slot, and that choice sticks on retire', () => {
    const s0 = toBuyPhase(newPoolGame(2, 11));
    const sprite = structuredClone(COLORLESS_CARDS[0]!); // coin-sprite, cost 3
    s0.players[0]!.shop = [sprite, null, null, null, null];
    const slots = legalActions(s0)
      .filter((a) => a.type === 'BUY')
      .map((a) => (a.type === 'BUY' ? a.targetSlot : 0));
    expect(slots).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]); // player picks the slot
    let s = applyAction(s0, { type: 'BUY', shopIndex: 0, targetSlot: 9 }, deadRng());
    expect(s.players[0]!.board[8]!.id).toBe('coin-sprite');

    // Displace it later: it retires keeping slot 9.
    s = applyAction(s, { type: 'END_TURN' }, mulberry32(1));
    s = playTurn(s, [1, 2], 'individual'); // p1's turn passes
    s = toBuyPhase(s);
    s.players[0]!.shop = [structuredClone(COLORLESS_CARDS[1]!), null, null, null, null];
    s = applyAction(s, { type: 'BUY', shopIndex: 0, targetSlot: 9 }, deadRng());
    expect(s.players[0]!.echoStack).toContainEqual(
      expect.objectContaining({ slot: 9, def: expect.objectContaining({ id: 'coin-sprite' }) }),
    );
  });

  it('rejects unaffordable and off-slot buys', () => {
    const s0 = toBuyPhase(newPoolGame(2, 11));
    s0.players[0]!.money = 0;
    expect(legalActions(s0)).toEqual([{ type: 'SKIP_BUY' }]);
    expect(() => applyAction(s0, { type: 'BUY', shopIndex: 0, targetSlot: 1 }, deadRng())).toThrow(
      /afford/,
    );
    const s1 = toBuyPhase(newPoolGame(2, 11));
    const redIndex = s1.players[0]!.shop.findIndex((c) => c?.color === 'red');
    const redCard = s1.players[0]!.shop[redIndex]!;
    const badSlot = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find(
      (slot) => !redCard.legalSlots.includes(slot),
    )!;
    s1.players[0]!.money = 99;
    expect(() =>
      applyAction(s1, { type: 'BUY', shopIndex: redIndex, targetSlot: badSlot }, deadRng()),
    ).toThrow(/not legal/);
  });

  it('a retired purchase echoes on opponent turns', () => {
    // p0 buys coin-sprite into slot 3, displacing starter-3 (echo: 1 money, slot 3).
    let s = toBuyPhase(newPoolGame(2, 11));
    s.players[0]!.shop = [structuredClone(COLORLESS_CARDS[0]!), null, null, null, null];
    s = applyAction(s, { type: 'BUY', shopIndex: 0, targetSlot: 3 }, deadRng());
    s = applyAction(s, { type: 'END_TURN' }, mulberry32(2));
    const moneyBefore = s.players[0]!.money;
    // p1 rolls a 3: p0's retired starter echoes 1 money to p0.
    s = applyAction(s, { type: 'ROLL' }, diceRng(3, 5));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    expect(s.players[0]!.money).toBe(moneyBefore + 1);
  });
});
