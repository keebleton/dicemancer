import { describe, expect, it } from 'vitest';
import { toCommunityPack } from './packs';

const good = {
  id: 'friend-card',
  name: 'Friend Card',
  color: 'red',
  rarity: 'common',
  cost: 4,
  legalSlots: [4],
  active: [{ kind: 'gainMoney', amount: 1 }],
  echo: [{ kind: 'gainMoney', amount: 1 }],
};

describe('toCommunityPack', () => {
  it('keeps valid cards and prefixes their ids', () => {
    const pack = toCommunityPack([good]);
    expect(pack.id).toBe('community');
    expect(pack.enabled).toBe(true);
    expect(pack.cards).toHaveLength(1);
    expect(pack.cards[0]!.id).toBe('community-friend-card');
  });

  it('drops garbage, invalid cards, and duplicate ids', () => {
    const invalid = { ...good, id: 'bad-slots', legalSlots: [13] };
    const noEffects = { ...good, id: 'no-effects', active: [], echo: [] };
    const pack = toCommunityPack([
      null,
      42,
      'nope',
      {},
      invalid,
      noEffects,
      good,
      { ...good }, // duplicate id
    ]);
    expect(pack.cards.map((c) => c.id)).toEqual(['community-friend-card']);
  });

  it('does not double-prefix already prefixed ids', () => {
    const pack = toCommunityPack([{ ...good, id: 'community-friend-card' }]);
    expect(pack.cards[0]!.id).toBe('community-friend-card');
  });
});
