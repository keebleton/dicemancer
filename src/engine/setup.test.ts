import { describe, expect, it } from 'vitest';
import { starterBoard } from '../content/starters';
import { createGame } from './setup';
import { HP_BY_PLAYER_COUNT } from './tunables';
import type { SeatColor } from './types';

const seats = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    name: `P${i}`,
    color: (i % 2 === 0 ? 'red' : 'blue') as SeatColor,
  }));

describe('per-player-count HP scaling (P5 tuning pass)', () => {
  it.each([2, 3, 4])('%i players start at the scaled HP', (n) => {
    const s = createGame({ seats: seats(n), starterBoard: starterBoard() });
    expect(s.tunables.startingHp).toBe(HP_BY_PLAYER_COUNT[n]);
    for (const p of s.players) expect(p.hp).toBe(HP_BY_PLAYER_COUNT[n]);
  });

  it('an explicit startingHp override still wins', () => {
    const s = createGame({
      seats: seats(4),
      starterBoard: starterBoard(),
      tunables: { startingHp: 40 },
    });
    expect(s.tunables.startingHp).toBe(40);
  });
});
