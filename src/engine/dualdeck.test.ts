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
