import { describe, expect, it } from 'vitest';
import { BLUE_CARDS, COLORLESS_CARDS, RED_CARDS } from './cards';
import { starterBoard } from './starters';
import type { CardDef } from '../engine/types';

// DESIGN_RULES.md constraints, locked in as tests.
const RED_SLOTS = new Set([4, 5, 6, 9, 10, 11, 12]);
const BLUE_SLOTS = new Set([1, 2, 3, 4, 5, 7]);

const touches712 = (c: CardDef) => c.legalSlots.some((s) => s >= 7);

describe('card pools', () => {
  it('unique ids across every pool and the starters', () => {
    const all = [...RED_CARDS, ...BLUE_CARDS, ...COLORLESS_CARDS, ...starterBoard()];
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
  });

  it('meets the Phase 5 pool targets', () => {
    expect(RED_CARDS.length).toBeGreaterThanOrEqual(15);
    expect(BLUE_CARDS.length).toBeGreaterThanOrEqual(15);
    expect(COLORLESS_CARDS.length).toBeGreaterThanOrEqual(10);
    for (const pool of [RED_CARDS, BLUE_CARDS]) {
      expect(pool.filter((c) => c.rarity === 'common').length).toBeGreaterThanOrEqual(9);
      expect(pool.filter((c) => c.rarity === 'rare').length).toBeGreaterThanOrEqual(4);
      expect(pool.filter(touches712).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('respects color slot patterns', () => {
    for (const c of RED_CARDS) {
      expect(c.color).toBe('red');
      for (const s of c.legalSlots) expect(RED_SLOTS.has(s), `${c.id} slot ${s}`).toBe(true);
    }
    for (const c of BLUE_CARDS) {
      expect(c.color).toBe('blue');
      for (const s of c.legalSlots) expect(BLUE_SLOTS.has(s), `${c.id} slot ${s}`).toBe(true);
    }
    for (const c of COLORLESS_CARDS) {
      expect(c.color).toBe('colorless');
      expect(c.legalSlots).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    }
  });

  it('respects the cost bands per rarity', () => {
    for (const c of [...RED_CARDS, ...BLUE_CARDS, ...COLORLESS_CARDS]) {
      if (c.rarity === 'common') {
        expect(c.cost, c.id).toBeGreaterThanOrEqual(3);
        expect(c.cost, c.id).toBeLessThanOrEqual(5);
      } else {
        expect(c.cost, c.id).toBeGreaterThanOrEqual(7);
        expect(c.cost, c.id).toBeLessThanOrEqual(10);
      }
    }
  });

  it('colorless stays money/utility only: no damage, no tokens', () => {
    const flat = (effects: CardDef['active']): string[] =>
      effects.flatMap((e) => (e.kind === 'conditional' ? flat(e.then) : [e.kind]));
    for (const c of COLORLESS_CARDS) {
      const kinds = [...flat(c.active), ...flat(c.echo)];
      expect(kinds, c.id).not.toContain('damage');
      expect(kinds, c.id).not.toContain('gainToken');
    }
  });
});
