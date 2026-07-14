import { describe, expect, it } from 'vitest';
import {
  BLACK_CARDS,
  BLUE_CARDS,
  COLORLESS_CARDS,
  GREEN_CARDS,
  RED_CARDS,
  YELLOW_CARDS,
} from './cards';
import { starterBoard } from './starters';
import type { CardDef } from '../engine/types';

// DESIGN_RULES.md constraints, locked in as tests. The per-color slot sets
// became LEANS on 2026-07-14 (Jake: full 1-12 coverage per color): identity
// lives in the effects; a healthy share of each pool stays on its home slots.
const SLOT_PATTERNS: [string, CardDef[], Set<number>][] = [
  ['red', RED_CARDS, new Set([4, 5, 6, 9, 10, 11, 12])],
  ['blue', BLUE_CARDS, new Set([1, 2, 3, 4, 5, 7])],
  ['black', BLACK_CARDS, new Set([1, 2, 6, 12])],
  ['green', GREEN_CARDS, new Set([1, 3, 5, 9])],
  ['yellow', YELLOW_CARDS, new Set([2, 4, 6, 8])],
];

const touches712 = (c: CardDef) => c.legalSlots.some((s) => s >= 7);

describe('card pools', () => {
  it('unique ids across every pool and the starters', () => {
    const all = [
      ...RED_CARDS,
      ...BLUE_CARDS,
      ...BLACK_CARDS,
      ...GREEN_CARDS,
      ...YELLOW_CARDS,
      ...COLORLESS_CARDS,
      ...starterBoard(),
    ];
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
  });

  it('meets the pool targets per color', () => {
    expect(COLORLESS_CARDS.length).toBeGreaterThanOrEqual(10);
    for (const [, pool] of SLOT_PATTERNS) {
      expect(pool.length).toBeGreaterThanOrEqual(15);
      expect(pool.filter((c) => c.rarity === 'common').length).toBeGreaterThanOrEqual(9);
      expect(pool.filter((c) => c.rarity === 'rare').length).toBeGreaterThanOrEqual(4);
      expect(pool.filter(touches712).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('every color covers every slot and keeps a real lean on its home slots', () => {
    for (const [color, pool, lean] of SLOT_PATTERNS) {
      for (const c of pool) {
        expect(c.color).toBe(color);
        for (const s of c.legalSlots) {
          expect(s, `${c.id} slot ${s}`).toBeGreaterThanOrEqual(1);
          expect(s, `${c.id} slot ${s}`).toBeLessThanOrEqual(12);
        }
      }
      const covered = new Set(pool.flatMap((c) => c.legalSlots));
      for (let s = 1; s <= 12; s++) {
        expect(covered.has(s), `${color} has no card for slot ${s}`).toBe(true);
      }
      const onLean = pool.filter((c) => c.legalSlots.some((s) => lean.has(s)));
      expect(onLean.length, `${color} lean share`).toBeGreaterThanOrEqual(
        Math.floor(pool.length / 3),
      );
    }
    // Colorless artifacts are either fully flexible or premium high-band only
    // (2026-07-13: the strongest pieces moved to 7-12).
    for (const c of COLORLESS_CARDS) {
      expect(c.color).toBe('colorless');
      expect(
        [JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), JSON.stringify([7, 8, 9, 10, 11, 12])],
        c.id,
      ).toContain(JSON.stringify(c.legalSlots));
    }
  });

  it('respects the cost bands per rarity', () => {
    const colored = [...RED_CARDS, ...BLUE_CARDS, ...BLACK_CARDS, ...GREEN_CARDS, ...YELLOW_CARDS];
    for (const c of colored) {
      if (c.rarity === 'common') {
        expect(c.cost, c.id).toBeGreaterThanOrEqual(3);
        expect(c.cost, c.id).toBeLessThanOrEqual(5);
      } else {
        expect(c.cost, c.id).toBeGreaterThanOrEqual(7);
        expect(c.cost, c.id).toBeLessThanOrEqual(10);
      }
    }
    // Colorless are shared-market artifacts: premium band regardless of rarity.
    for (const c of COLORLESS_CARDS) {
      expect(c.cost, c.id).toBeGreaterThanOrEqual(7);
      expect(c.cost, c.id).toBeLessThanOrEqual(14);
    }
  });

  it('colorless stays money/utility only: no damage, no tokens', () => {
    const flat = (effects: CardDef['active']): string[] =>
      effects.flatMap((e) =>
        e.kind === 'conditional' || e.kind === 'trade' ? flat(e.then) : [e.kind],
      );
    for (const c of COLORLESS_CARDS) {
      const kinds = [...flat(c.active), ...flat(c.echo)];
      expect(kinds, c.id).not.toContain('damage');
      expect(kinds, c.id).not.toContain('gainToken');
    }
  });
});
