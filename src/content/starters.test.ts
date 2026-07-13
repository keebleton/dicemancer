import { describe, expect, it } from 'vitest';
import { starterBoard } from './starters';

describe('starter board', () => {
  it('holds 12 unique starter cards, one per slot', () => {
    const board = starterBoard();
    expect(board).toHaveLength(12);
    expect(new Set(board.map((c) => c.id)).size).toBe(12);
    board.forEach((card, i) => {
      expect(card.legalSlots).toEqual([i + 1]);
      expect(card.color).toBe('starter');
      expect(card.rarity).toBe('starter');
    });
  });

  it('matches the PLAN.md payout table', () => {
    const board = starterBoard();
    const moneyOf = (slot: number) =>
      board[slot - 1]!.active
        .filter((e) => e.kind === 'gainMoney')
        .reduce((sum, e) => sum + (e.kind === 'gainMoney' ? e.amount : 0), 0);
    for (const slot of [1, 2, 3, 4, 5, 6]) expect(moneyOf(slot)).toBe(1);
    for (const slot of [7, 8, 9]) expect(moneyOf(slot)).toBe(2);
    for (const slot of [10, 11]) expect(moneyOf(slot)).toBe(3);
    expect(moneyOf(12)).toBe(2);
    expect(board[11]!.active).toContainEqual({ kind: 'gainPoints', amount: 1 });
    for (const card of board) {
      expect(card.echo).toEqual([{ kind: 'gainMoney', amount: 1 }]);
    }
  });

  it('returns fresh copies so one seat cannot alias another', () => {
    const a = starterBoard();
    const b = starterBoard();
    expect(a[0]).not.toBe(b[0]);
    expect(a).toEqual(b);
  });
});
