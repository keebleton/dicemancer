// The reliquary + all relic rule hooks (docs/RELICS.md).
import { describe, expect, it } from 'vitest';
import { buyCost, legalActions } from './reducer';
import { applyAction } from './reducer';
import { mulberry32 } from './rng';
import { diceRng, moneyEcho, newGame, newPoolGame, testCard } from './test-helpers';
import type { Action, Effect } from './types';

const rng = () => mulberry32(0xd1ce);

/** Seat 0 fires slot 4 once (roll 1+3, take the sum). */
function fire4(s: ReturnType<typeof newGame>, active: Effect[]) {
  s.players[0]!.board[3] = testCard({ id: 'rig', legalSlots: [4], active });
  let n = applyAction(s, { type: 'ROLL' }, diceRng(1, 3));
  n = applyAction(n, { type: 'ALLOCATE', mode: 'sum' }, rng());
  return n;
}

describe('the reliquary', () => {
  it('buying a relic pays, refills the display, and keeps the buy phase open', () => {
    let s = newPoolGame(2, 7);
    s = applyAction(s, { type: 'ROLL' }, diceRng(1, 3));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, rng());
    expect(s.phase).toBe('buy');
    s.players[0]!.money = 20;
    s.reliquary[0] = 'merchant-crown'; // cost 14, no slot pick
    const deckBefore = s.relicDeck.length;
    const next = s.relicDeck[0] ?? null;
    s = applyAction(s, { type: 'BUY_RELIC', index: 0 }, rng());
    expect(s.players[0]!.relics).toContain('merchant-crown');
    expect(s.players[0]!.money).toBe(6);
    expect(s.phase).toBe('buy'); // relics never consume the card purchase
    expect(s.reliquary[0]).toBe(next);
    expect(s.relicDeck.length).toBe(Math.max(0, deckBefore - 1));
  });

  it('slot-pick relics record the pick and demand one', () => {
    let s = newPoolGame(2, 7);
    s = applyAction(s, { type: 'ROLL' }, diceRng(1, 3));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, rng());
    s.players[0]!.money = 20;
    s.reliquary[0] = 'echo-prism';
    expect(() => applyAction(s, { type: 'BUY_RELIC', index: 0 }, rng())).toThrow(/slot pick/);
    s = applyAction(s, { type: 'BUY_RELIC', index: 0, slotPick: 4 }, rng());
    expect(s.players[0]!.relicPicks['echo-prism']).toBe(4);
  });

  it('caps owned relics at three', () => {
    let s = newPoolGame(2, 7);
    s = applyAction(s, { type: 'ROLL' }, diceRng(1, 3));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, rng());
    s.players[0]!.money = 99;
    s.players[0]!.relics = ['iron-aegis', 'magnet-stone', 'grave-lantern'];
    expect(legalActions(s).some((a) => a.type === 'BUY_RELIC')).toBe(false);
  });
});

describe('relic hooks', () => {
  it('Echo Prism fires the picked slot twice', () => {
    const s = newGame(2);
    s.players[0]!.relics = ['echo-prism'];
    s.players[0]!.relicPicks['echo-prism'] = 4;
    const n = fire4(s, [{ kind: 'gainMoney', amount: 2 }]);
    expect(n.players[0]!.money).toBe(9); // 5 + 2 + 2
  });

  it('Merchant Crown keeps buying open after a purchase', () => {
    let s = newPoolGame(2, 7);
    s = applyAction(s, { type: 'ROLL' }, diceRng(1, 3));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, rng());
    s.players[0]!.money = 40;
    s.players[0]!.relics = ['merchant-crown'];
    const buy = legalActions(s).find((a): a is Action & { type: 'BUY' } => a.type === 'BUY');
    expect(buy).toBeDefined();
    s = applyAction(s, buy!, rng());
    expect(s.phase).toBe('buy');
    expect(legalActions(s).some((a) => a.type === 'BUY' || a.type === 'BUY_MARKET')).toBe(true);
  });

  it('Golden Scales converts overflow coins to points at end of turn', () => {
    let s = newGame(2);
    s.players[0]!.relics = ['golden-scales'];
    s = fire4(s, []);
    s.players[0]!.money = 24; // 9 over the 15 threshold -> 3 points
    s = applyAction(s, { type: 'SKIP_BUY' }, rng());
    s = applyAction(s, { type: 'END_TURN' }, rng());
    expect(s.players[0]!.points).toBe(3);
    expect(s.players[0]!.money).toBe(15);
  });

  it('Interest Ledger and Hourglass pay at turn start', () => {
    let s = newGame(2);
    s.players[1]!.relics = ['interest-ledger', 'fates-hourglass'];
    s.players[1]!.money = 12;
    s = fire4(s, []);
    s = applyAction(s, { type: 'SKIP_BUY' }, rng());
    s = applyAction(s, { type: 'END_TURN' }, rng());
    expect(s.current).toBe(1);
    expect(s.players[1]!.money).toBe(14); // +floor(12/5)
    expect(s.players[1]!.tokens.reroll).toBe(1);
  });

  it('Weighted Dice: split doubles fire the slot a third time', () => {
    const s = newGame(2);
    s.players[0]!.relics = ['weighted-dice'];
    s.players[0]!.board[1] = testCard({
      id: 'rig2',
      legalSlots: [2],
      active: [{ kind: 'gainMoney', amount: 1 }],
    });
    let n = applyAction(s, { type: 'ROLL' }, diceRng(2, 2));
    n = applyAction(n, { type: 'ALLOCATE', mode: 'individual' }, rng());
    expect(n.players[0]!.money).toBe(8); // 5 + 3 fires
  });

  it('Wildcard Sleeve: the picked slot hears the other interpretation', () => {
    const s = newGame(2);
    s.players[0]!.relics = ['wildcard-sleeve'];
    s.players[0]!.relicPicks['wildcard-sleeve'] = 7;
    s.players[0]!.board[2] = testCard({ id: 'b3', legalSlots: [3], active: [] });
    s.players[0]!.board[3] = testCard({ id: 'b4', legalSlots: [4], active: [] });
    s.players[0]!.board[6] = testCard({
      id: 'lucky',
      legalSlots: [7],
      active: [{ kind: 'gainMoney', amount: 2 }],
    });
    let n = applyAction(s, { type: 'ROLL' }, diceRng(3, 4));
    n = applyAction(n, { type: 'ALLOCATE', mode: 'individual' }, rng());
    expect(n.players[0]!.money).toBe(7); // split 3+4, and the 7 fired anyway
  });

  it('Resonant Bell: your echoes hear your own roll', () => {
    const s = newGame(2);
    s.players[0]!.relics = ['resonant-bell'];
    s.players[0]!.board[3] = testCard({ id: 'quiet', legalSlots: [4], active: [] });
    s.players[0]!.echoStack.push({
      slot: 4,
      def: testCard({ id: 'e4', legalSlots: [4], echo: moneyEcho(2) }),
    });
    let n = applyAction(s, { type: 'ROLL' }, diceRng(1, 3));
    n = applyAction(n, { type: 'ALLOCATE', mode: 'sum' }, rng());
    // The roller's own echo choice: split [1,3] vs sum [4] differ.
    expect(n.phase).toBe('echoChoice');
    n = applyAction(n, { type: 'ECHO_CHOICE', mode: 'sum' }, rng());
    expect(n.players[0]!.money).toBe(7);
  });

  it('Iron Aegis blunts the first hit each round, then resets', () => {
    const s = newGame(2);
    s.players[1]!.relics = ['iron-aegis'];
    const n = fire4(s, [
      { kind: 'damage', amount: 2, target: 'chooseOpponent' },
      { kind: 'damage', amount: 2, target: 'chooseOpponent' },
    ]);
    expect(n.players[1]!.hp).toBe(23); // first hit 0, second full
    let m = applyAction(n, { type: 'SKIP_BUY' }, rng());
    m = applyAction(m, { type: 'END_TURN' }, rng());
    expect(m.players[1]!.relicUsed['iron-aegis']).toBeUndefined(); // fresh round
  });

  it('Vampiric Chalice heals the attacker; Assassin points at the leader', () => {
    const s = newGame(2);
    s.players[0]!.relics = ['vampiric-chalice', 'assassins-mark'];
    s.players[0]!.hp = 20;
    s.players[1]!.points = 5; // the point leader
    const n = fire4(s, [{ kind: 'damage', amount: 2, target: 'chooseOpponent' }]);
    expect(n.players[1]!.hp).toBe(22); // 25 - (2 + 1 mark)
    expect(n.players[0]!.hp).toBe(21); // chalice
  });

  it('Chrono Anchor grants an extra turn and is spent', () => {
    let s = newGame(2);
    s.players[0]!.relics = ['chrono-anchor'];
    s = fire4(s, []);
    s = applyAction(s, { type: 'SKIP_BUY' }, rng());
    s = applyAction(s, { type: 'END_TURN' }, rng());
    expect(s.current).toBe(0); // same seat again
    expect(s.phase).toBe('roll');
    expect(s.players[0]!.relics).not.toContain('chrono-anchor');
  });

  it('Magnet Stone taxes opponent market buys', () => {
    let s = newPoolGame(2, 7);
    s.players[1]!.relics = ['magnet-stone'];
    s = applyAction(s, { type: 'ROLL' }, diceRng(1, 3));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, rng());
    s.players[0]!.money = 40;
    const buy = legalActions(s).find(
      (a): a is Action & { type: 'BUY_MARKET' } => a.type === 'BUY_MARKET',
    );
    expect(buy).toBeDefined();
    const before = s.players[1]!.money;
    s = applyAction(s, buy!, rng());
    expect(s.players[1]!.money).toBe(before + 2);
  });

  it('Bottomless Purse shaves trade costs', () => {
    const s = newGame(2);
    s.players[0]!.relics = ['bottomless-purse'];
    const n = fire4(s, [{ kind: 'trade', pay: 3, then: [{ kind: 'gainMoney', amount: 5 }] }]);
    expect(n.players[0]!.money).toBe(8); // 5 - 2 + 5
  });

  it('Collectors Case shaves buy costs', () => {
    const s = newGame(2);
    s.players[0]!.relics = ['collectors-case'];
    expect(buyCost(s.players[0]!, testCard({ id: 'x', cost: 5 }))).toBe(4);
  });

  it('Auctioneers Gavel deals a 5-card shop', () => {
    let s = newPoolGame(2, 7);
    s.players[1]!.relics = ['auctioneers-gavel'];
    s = applyAction(s, { type: 'ROLL' }, diceRng(1, 3));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'sum' }, rng());
    s = applyAction(s, { type: 'SKIP_BUY' }, rng());
    s = applyAction(s, { type: 'END_TURN' }, rng());
    expect(s.players[1]!.shop.length).toBe(5);
  });
});
