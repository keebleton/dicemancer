import type { Rng } from './types';

/** mulberry32: tiny deterministic 32-bit seeded PRNG. Same seed, same stream,
 *  on every platform, which is what makes replays and the sim harness work. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function rollDie(rng: Rng): number {
  return 1 + Math.floor(rng.next() * 6);
}
