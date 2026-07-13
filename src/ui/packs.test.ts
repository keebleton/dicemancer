import { describe, expect, it } from 'vitest';
import { COLORLESS_CARDS, RED_CARDS } from '../content/cards';
import type { CardDef } from '../engine';
import {
  effectivePools,
  effectiveStarterBoard,
  loadOverrides,
  loadPacks,
  mergedPools,
  saveOverrides,
  savePacks,
  slugify,
  uniqueId,
  validateCard,
} from './packs';
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

describe('built-in card overrides', () => {
  it('round-trips through storage', () => {
    const data = new Map<string, string>();
    const fake: KV = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
    };
    const edited = { ...COLORLESS_CARDS[0]!, icon: 'INV_Misc_Coin_01.PNG' };
    saveOverrides({ 'coin-sprite': edited }, fake);
    expect(loadOverrides(fake)['coin-sprite']).toEqual(edited);
    expect(loadOverrides(null)).toEqual({});
  });

  it('replaces the base card in the effective pools', () => {
    const edited = { ...COLORLESS_CARDS[0]!, icon: 'INV_Misc_Coin_01.PNG', cost: 9 };
    const pools = effectivePools({ 'coin-sprite': edited });
    const found = pools.colorless.find((c) => c.id === 'coin-sprite')!;
    expect(found.icon).toBe('INV_Misc_Coin_01.PNG');
    expect(found.cost).toBe(9);
    expect(pools.colorless).toHaveLength(COLORLESS_CARDS.length); // replaced, not added
  });

  it('re-buckets a card whose color was edited', () => {
    const recolored: CardDef = { ...COLORLESS_CARDS[0]!, color: 'red', legalSlots: [4] };
    const pools = effectivePools({ 'coin-sprite': recolored });
    expect(pools.colorless.some((c) => c.id === 'coin-sprite')).toBe(false);
    expect(pools.red.some((c) => c.id === 'coin-sprite')).toBe(true);
  });

  it('applies overrides beneath enabled packs and to starters', () => {
    const edited = { ...RED_CARDS[0]!, cost: 5 };
    const merged = mergedPools([], { [RED_CARDS[0]!.id]: edited });
    expect(merged.red.find((c) => c.id === RED_CARDS[0]!.id)!.cost).toBe(5);

    const board = effectiveStarterBoard({
      'starter-4': { ...effectiveStarterBoard({})[3]!, icon: 'Spell_Nature_Lightning.PNG' },
    });
    expect(board[3]!.icon).toBe('Spell_Nature_Lightning.PNG');
    expect(board[0]!.icon).toBeUndefined();
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
