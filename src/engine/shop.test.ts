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

describe('shop deal', () => {
  it('deals every seat an own-color row and one shared market at setup', () => {
    const s = newPoolGame(4, 11);
    for (const p of s.players) {
      expect(p.shop).toHaveLength(4);
      for (const card of p.shop) expect(card?.color).toBe(p.color);
    }
    expect(s.market).toHaveLength(4);
    for (const card of s.market) expect(card?.color).toBe('colorless');
    expect(s.marketDeck.length).toBe(COLORLESS_CARDS.length - 4);
  });

  it('refreshes the incoming player row at their turn start, not the leaver', () => {
    const s0 = newPoolGame(2, 11);
    const p0Row = s0.players[0]!.shop.map((c) => c!.id);
    const s = playTurn(s0, [1, 2], 'individual'); // p0 skips buy; now p1's turn
    expect(s.players[0]!.shop.map((c) => c!.id)).toEqual(p0Row); // untouched until p0's next turn
    const p1 = s.players[1]!;
    expect(p1.shop.every((c) => c !== null)).toBe(true);
    // Conservation across the refresh: every pool card stays in circulation.
    const colorCount =
      p1.colorDeck.length + p1.colorDiscard.length + p1.shop.filter((c) => c !== null).length;
    expect(colorCount).toBe(BLUE_CARDS.length); // p1 is the blue seat
  });

  it('reshuffles an exhausted color pool from its unbought discards', () => {
    // Pools smaller than one row force a reshuffle on the very first refresh.
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
          black: tiny(['k1'], 'black'),
          green: tiny(['g1'], 'green'),
          yellow: tiny(['y1'], 'yellow'),
          colorless: tiny(['c1', 'c2'], 'colorless'),
        },
      },
      mulberry32(3),
    );
    // Setup drained the 3-card red deck into the 4-slot row (one hole).
    expect(s0.players[0]!.colorDeck).toHaveLength(0);
    let s = playTurn(s0, [1, 2], 'individual'); // p0
    s = playTurn(s, [1, 2], 'individual'); // p1; wrap refreshes p0 from reshuffled discards
    const p0 = s.players[0]!;
    expect(p0.shop.filter((c) => c !== null)).toHaveLength(3);
    expect(new Set(p0.shop.filter((c) => c !== null).map((c) => c!.id))).toEqual(
      new Set(['r1', 'r2', 'r3']),
    );
  });
});

describe('the shared market', () => {
  it('is static: identical across turns while nobody buys', () => {
    const s0 = newPoolGame(2, 11);
    const before = s0.market.map((c) => c!.id);
    let s = playTurn(s0, [1, 2], 'individual');
    s = playTurn(s, [1, 2], 'individual');
    s = playTurn(s, [1, 2], 'individual');
    expect(s.market.map((c) => c!.id)).toEqual(before);
  });

  it('BUY_MARKET pays, installs, retires, and refills the slot for everyone else', () => {
    const s0 = toBuyPhase(newPoolGame(2, 11));
    s0.players[0]!.money = 20;
    const card = s0.market[1]!;
    const deckBefore = s0.marketDeck.length;
    const s = applyAction(s0, { type: 'BUY_MARKET', marketIndex: 1, targetSlot: 7 }, deadRng());
    const p = s.players[0]!;
    expect(p.money).toBe(20 - card.cost);
    expect(p.board[6]!.id).toBe(card.id);
    expect(p.echoStack.some((e) => e.slot === 7 && e.def.id === 'starter-7')).toBe(true);
    expect(s.market[1]?.id).not.toBe(card.id); // gone for everyone, slot refilled
    expect(s.marketDeck.length).toBe(deckBefore - 1);
    expect(s.phase).toBe('end'); // the market buy was the turn's one purchase
  });

  it('sells out to null once the shared deck is empty', () => {
    const s0 = toBuyPhase(newPoolGame(2, 11));
    s0.players[0]!.money = 99;
    s0.marketDeck = [];
    const s = applyAction(s0, { type: 'BUY_MARKET', marketIndex: 0, targetSlot: 1 }, deadRng());
    expect(s.market[0]).toBeNull();
  });

  it('shop freeze is a buy-phase toggle that keeps the phase open', () => {
    const s0 = toBuyPhase(newPoolGame(2, 11));
    expect(legalActions(s0).some((a) => a.type === 'FREEZE_SHOP')).toBe(true);
    let s = applyAction(s0, { type: 'FREEZE_SHOP' }, deadRng());
    expect(s.players[0]!.shopFrozen).toBe(true);
    expect(s.phase).toBe('buy'); // freezing is not the purchase
    s = applyAction(s, { type: 'FREEZE_SHOP' }, deadRng());
    expect(s.players[0]!.shopFrozen).toBe(false); // toggled back
    expect(() =>
      applyAction(newPoolGame(2, 11), { type: 'FREEZE_SHOP' }, deadRng()),
    ).toThrow(/illegal action/); // roll phase
  });

  it('a frozen shop skips every refresh, holes included, until unfrozen', () => {
    const s0 = toBuyPhase(newPoolGame(2, 11));
    s0.players[0]!.money = 40;
    let s = applyAction(s0, { type: 'FREEZE_SHOP' }, deadRng());
    const targetSlot = s.players[0]!.shop[1]!.legalSlots[0]!;
    s = applyAction(s, { type: 'BUY', shopIndex: 1, targetSlot }, deadRng()); // leaves a hole
    const rowAfterBuy = s.players[0]!.shop.map((c) => c?.id ?? null);
    expect(rowAfterBuy[1]).toBeNull();
    s = applyAction(s, { type: 'END_TURN' }, mulberry32(5));
    s = playTurn(s, [1, 2], 'individual'); // p1 passes; p0's refresh is SKIPPED
    s = applyAction(s, { type: 'ROLL' }, diceRng(1, 2));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, mulberry32(6));
    expect(s.players[0]!.shop.map((c) => c?.id ?? null)).toEqual(rowAfterBuy);

    // Unfreeze: the next turn-start refresh rotates again.
    s = applyAction(s, { type: 'FREEZE_SHOP' }, deadRng());
    s = applyAction(s, { type: 'SKIP_BUY' }, deadRng());
    s = applyAction(s, { type: 'END_TURN' }, mulberry32(7));
    s = playTurn(s, [1, 2], 'individual'); // p1 passes; p0 refreshes normally
    const fresh = s.players[0]!.shop;
    expect(fresh).toHaveLength(4);
    expect(fresh.every((c) => c !== null)).toBe(true); // holes gone
  });

  it('refreshShop effects cannot thaw or rotate a frozen shop', () => {
    const s0 = toBuyPhase(newPoolGame(2, 11));
    let s = applyAction(s0, { type: 'FREEZE_SHOP' }, deadRng());
    const row = s.players[0]!.shop.map((c) => c?.id ?? null);
    s = applyAction(s, { type: 'SKIP_BUY' }, deadRng());
    s = applyAction(s, { type: 'END_TURN' }, mulberry32(8));
    // p1 turn: give p1 a refreshShop... the effect targets its OWNER, so craft
    // p0's own echo instead: a refreshShop echo firing while frozen changes nothing.
    s.players[0]!.echoStack = [
      {
        def: {
          id: 'x-refresh',
          name: 'x',
          color: 'colorless',
          rarity: 'common',
          cost: 3,
          legalSlots: [3],
          active: [],
          echo: [{ kind: 'refreshShop' }],
        },
        slot: 3,
      },
    ];
    s = applyAction(s, { type: 'ROLL' }, diceRng(3, 5));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, mulberry32(9));
    if (s.phase === 'echoChoice') {
      s = applyAction(s, { type: 'ECHO_CHOICE', mode: 'individual' }, mulberry32(10));
    }
    expect(s.players[0]!.shop.map((c) => c?.id ?? null)).toEqual(row);
  });

  it('green discounts apply to market buys too', () => {
    const s0 = toBuyPhase(newPoolGame(2, 11));
    const card = s0.market[0]!;
    s0.players[0]!.money = card.cost - 3;
    s0.players[0]!.buyDiscount = 3;
    expect(legalActions(s0).some((a) => a.type === 'BUY_MARKET')).toBe(true);
    const s = applyAction(s0, { type: 'BUY_MARKET', marketIndex: 0, targetSlot: 1 }, deadRng());
    expect(s.players[0]!.money).toBe(0);
    expect(s.players[0]!.buyDiscount).toBe(0);
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

  it('market artifacts install into any chosen slot, and that choice sticks on retire', () => {
    const s0 = toBuyPhase(newPoolGame(2, 11));
    s0.players[0]!.money = 40;
    const first = s0.market[0]!;
    const slots = legalActions(s0)
      .filter((a) => a.type === 'BUY_MARKET' && a.marketIndex === 0)
      .map((a) => (a.type === 'BUY_MARKET' ? a.targetSlot : 0));
    expect(slots).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]); // buyer picks the slot
    let s = applyAction(s0, { type: 'BUY_MARKET', marketIndex: 0, targetSlot: 9 }, deadRng());
    expect(s.players[0]!.board[8]!.id).toBe(first.id);

    // Displace it later: it retires keeping slot 9.
    s = applyAction(s, { type: 'END_TURN' }, mulberry32(1));
    s = playTurn(s, [1, 2], 'individual'); // p1's turn passes
    s = toBuyPhase(s);
    s.players[0]!.money = 40;
    s = applyAction(s, { type: 'BUY_MARKET', marketIndex: 0, targetSlot: 9 }, deadRng());
    expect(s.players[0]!.echoStack).toContainEqual(
      expect.objectContaining({ slot: 9, def: expect.objectContaining({ id: first.id }) }),
    );
  });

  it('rejects unaffordable and off-slot buys', () => {
    const s0 = toBuyPhase(newPoolGame(2, 11));
    s0.players[0]!.money = 0;
    const broke = legalActions(s0);
    expect(broke.some((a) => a.type === 'BUY' || a.type === 'BUY_MARKET')).toBe(false);
    expect(broke.some((a) => a.type === 'SKIP_BUY')).toBe(true); // freezes remain available
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
    // p0 buys a market artifact into slot 3, displacing starter-3 (echo: 1 money, slot 3).
    let s = toBuyPhase(newPoolGame(2, 11));
    s.players[0]!.money = 40;
    s = applyAction(s, { type: 'BUY_MARKET', marketIndex: 0, targetSlot: 3 }, deadRng());
    s = applyAction(s, { type: 'END_TURN' }, mulberry32(2));
    const moneyBefore = s.players[0]!.money;
    // p1 rolls a 3: p0 chooses to hear the split, so the retired starter echoes.
    s = applyAction(s, { type: 'ROLL' }, diceRng(3, 5));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, deadRng());
    s = applyAction(s, { type: 'ECHO_CHOICE', mode: 'individual' }, deadRng());
    expect(s.players[0]!.money).toBe(moneyBefore + 1);
  });
});
