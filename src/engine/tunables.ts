import type { Tunables } from './types';

/** Defaults from the PLAN.md section 8 table. */
export const DEFAULT_TUNABLES: Tunables = {
  startingHp: 25,
  pointsToWin: 30,
  startingMoney: 5,
  roundCap: 25,
  playerMin: 2,
  playerMax: 4,
  // ON since 2026-07-13 (Jake): slots 7-12 fire so rarely on the active side
  // (94% of fires land 1-6) that high cards need a life on other turns.
  highEchoHearsSum: true,
};

/** P5 first tuning pass (2026-07-12, 1000-game sims, seeds 1+2): at HP 25
 *  points wins drowned KO (77%/96% at 2p/4p) and blue ran 57%/75%. HP is the
 *  lever, but no single value fits both counts: 2p balances near 22
 *  (red 52/51%, ko ~34%), 4p near 16 (red 45%, ko 37%) - the per-player-count
 *  scaling PLAN section 8 anticipated. Explicit startingHp overrides win. */
export const HP_BY_PLAYER_COUNT: Record<number, number> = { 2: 22, 3: 18, 4: 16 };

/** Personal shop row: own-color cards only (colorless moved to the shared
 *  market, 2026-07-13). Buys per turn is 1 across shop AND market, hardcoded
 *  in the phase machine (any buy -> end). */
export const SHOP_COLOR_CARDS = 4;
/** The shared colorless market: static display, refills from its deck on purchase. */
export const MARKET_SIZE = 4;
