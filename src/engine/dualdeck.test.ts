import { describe, expect, it } from 'vitest';
import { pools } from '../content/cards';
import { starterBoard } from '../content/starters';
import { createGame, mulberry32 } from './index';

describe('dual-color decks (the deck builder)', () => {
  it('merges both pools into the personal deck', () => {
    const g = createGame(
      {
        seats: [
          { name: 'Dual', color: 'red', color2: 'black' },
          { name: 'Mono', color: 'blue' },
        ],
        starterBoard: starterBoard(),
        pools: pools(),
      },
      mulberry32(7),
    );
    const dual = g.players[0]!;
    const mono = g.players[1]!;
    expect(dual.colors).toEqual(['red', 'black']);
    expect(mono.colors).toEqual(['blue']);
    const p = pools();
    // Deck size counts both pools minus whatever the opening row dealt.
    const dealt = (seat: typeof dual) => seat.shop.filter(Boolean).length;
    expect(dual.colorDeck.length + dealt(dual)).toBe(p.red.length + p.black.length);
    expect(mono.colorDeck.length + dealt(mono)).toBe(p.blue.length);
    const dualColors = new Set([...dual.colorDeck, ...dual.shop.flatMap((c) => (c ? [c] : []))].map((c) => c.color));
    expect(dualColors).toEqual(new Set(['red', 'black']));
  });

  it('same color twice collapses to a mono deck', () => {
    const g = createGame(
      {
        seats: [
          { name: 'A', color: 'green', color2: 'green' },
          { name: 'B', color: 'yellow' },
        ],
        starterBoard: starterBoard(),
        pools: pools(),
      },
      mulberry32(9),
    );
    expect(g.players[0]!.colors).toEqual(['green']);
    expect(g.players[0]!.colorDeck.length + g.players[0]!.shop.filter(Boolean).length).toBe(
      pools().green.length,
    );
  });
});

describe('curated decks', () => {
  it('keeps only the picked cards, and ignores stale ids', () => {
    const p = pools();
    const picked = p.red.slice(0, 20).map((c) => c.id);
    const g = createGame(
      {
        seats: [
          { name: 'Curated', color: 'red', cardIds: [...picked, 'no-such-card'] },
          { name: 'Full', color: 'red' },
        ],
        starterBoard: starterBoard(),
        pools: p,
      },
      mulberry32(11),
    );
    const cur = g.players[0]!;
    const ids = new Set([...cur.colorDeck, ...cur.shop.flatMap((c) => (c ? [c] : []))].map((c) => c.id));
    expect(ids.size).toBe(20);
    for (const id of ids) expect(picked).toContain(id);
  });

  it('falls back to the full pool when too few picks survive', () => {
    const p = pools();
    const g = createGame(
      {
        seats: [
          { name: 'Tiny', color: 'red', cardIds: p.red.slice(0, 5).map((c) => c.id) },
          { name: 'Full', color: 'red' },
        ],
        starterBoard: starterBoard(),
        pools: p,
      },
      mulberry32(12),
    );
    const tiny = g.players[0]!;
    expect(tiny.colorDeck.length + tiny.shop.filter(Boolean).length).toBe(p.red.length);
  });
});
