import { describe, expect, it } from 'vitest';
import { simulate } from './sim';

describe('sim harness', () => {
  it('runs bot-vs-bot games and accounts for every one of them', () => {
    const r = simulate({ games: 15, players: 2, seed: 3 });
    expect(r.seatWins.reduce((a, b) => a + b, 0)).toBe(15);
    expect(r.reasons.points + r.reasons.ko + r.reasons.failsafe + r.reasons.card).toBe(15);
    const colorWinTotal = Object.values(r.colorWins).reduce((a, b) => a + b, 0);
    expect(colorWinTotal).toBe(15);
    const seatedTotal = Object.values(r.colorGames).reduce((a, b) => a + b, 0);
    expect(seatedTotal).toBe(15 * 2); // every seat in every game belongs to a color
    expect(r.avgRounds).toBeGreaterThan(0);
    // Uncapped since 2026-07-14: games run to points/KO/card, no round limit.
    expect(r.unfinished).toBe(0);
    expect(r.cards.length).toBeGreaterThan(0);
  });

  it('handles 4 players and is deterministic per seed', () => {
    const a = simulate({ games: 6, players: 4, seed: 9 });
    const b = simulate({ games: 6, players: 4, seed: 9 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.seatWins).toHaveLength(4);
    expect(a.seatWins.reduce((x, y) => x + y, 0)).toBe(6);
  });
});
