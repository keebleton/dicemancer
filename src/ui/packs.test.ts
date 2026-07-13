import { describe, expect, it } from 'vitest';
import { COLORLESS_CARDS, RED_CARDS } from '../content/cards';
import type { CardDef } from '../engine';
import { loadPacks, mergedPools, savePacks, slugify, uniqueId, validateCard } from './packs';
import type { CardPack, KV } from './packs';

const card = (over: Partial<CardDef>): CardDef => ({
  id: 'test-card',
  name: 'Test Card',
  color: 'colorless',
  rarity: 'common',
  cost: 3,
  legalSlots: [1],
  active: [{ kind: 'gainMoney', amount: 1 }],
  echo: [],
  ...over,
});

describe('pack storage', () => {
  it('round-trips through a storage backend', () => {
    const data = new Map<string, string>();
    const fake: KV = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
    };
    const packs: CardPack[] = [{ id: 'p1', name: 'My Pack', enabled: true, cards: [card({})] }];
    savePacks(packs, fake);
    expect(loadPacks(fake)).toEqual(packs);
    expect(loadPacks(null)).toEqual([]); // no storage = no packs, no crash
  });
});

describe('pool merging', () => {
  it('routes enabled pack cards into their color pool and skips disabled packs', () => {
    const packs: CardPack[] = [
      {
        id: 'p1',
        name: 'On',
        enabled: true,
        cards: [card({ id: 'my-red', color: 'red' }), card({ id: 'my-any', color: 'colorless' })],
      },
      { id: 'p2', name: 'Off', enabled: false, cards: [card({ id: 'hidden', color: 'red' })] },
    ];
    const merged = mergedPools(packs);
    expect(merged.red).toHaveLength(RED_CARDS.length + 1);
    expect(merged.red.some((c) => c.id === 'my-red')).toBe(true);
    expect(merged.colorless).toHaveLength(COLORLESS_CARDS.length + 1);
    expect(merged.red.some((c) => c.id === 'hidden')).toBe(false);
  });
});

describe('ids', () => {
  it('slugifies and de-duplicates', () => {
    expect(slugify("Martyr's Flame!!")).toBe('martyr-s-flame');
    expect(slugify('   ')).toBe('card');
    expect(uniqueId('Coin Sprite', new Set(['coin-sprite']))).toBe('coin-sprite-2');
  });
});

describe('validation', () => {
  it('blocks the truly broken', () => {
    const bad = validateCard(card({ name: ' ', legalSlots: [], active: [], echo: [] }));
    expect(bad.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('warns on design-rule deviations without blocking', () => {
    const spicy = validateCard(
      card({
        color: 'red',
        rarity: 'common',
        cost: 9,
        legalSlots: [1],
        active: [{ kind: 'damage', amount: 2, target: 'chooseOpponent' }],
      }),
    );
    expect(spicy.errors).toEqual([]);
    expect(spicy.warnings.length).toBeGreaterThanOrEqual(2); // cost band + slot pattern
  });
});
