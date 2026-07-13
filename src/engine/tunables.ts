import type { Tunables } from './types';

/** Defaults from the PLAN.md section 8 table. */
export const DEFAULT_TUNABLES: Tunables = {
  startingHp: 25,
  pointsToWin: 30,
  // 5 -> 2 (Jake 2026-07-13): colorless artifacts came online too fast.
  startingMoney: 2,
  roundCap: 25,
  playerMin: 2,
  playerMax: 4,
  // ON since 2026-07-13 (Jake): slots 7-12 fire so rarely on the active side
  // (94% of fires land 1-6) that high cards need a life on other turns.
  highEchoHearsSum: true,
};

/** HP by player count is THE damage-race lever; retuned whenever the economy
 *  moves. 2026-07-13 (starting money 5 -> 2, colorless high-band move, 25 new
 *  high cards): slower economies strengthened the 2p KO race (red hit 72% at
 *  HP 22) and weakened it at 4p (red 16% at HP 16). Re-simmed: 2p flattens at
 *  28 (red 49.8%), 3p stays fine at 18, 4p needs 14 (red exactly 25%).
 *  Explicit startingHp overrides win. */
export const HP_BY_PLAYER_COUNT: Record<number, number> = { 2: 28, 3: 18, 4: 14 };

/** Personal shop row: own-color cards only (colorless moved to the shared
 *  market, 2026-07-13). Buys per turn is 1 across shop AND market, hardcoded
 *  in the phase machine (any buy -> end). */
export const SHOP_COLOR_CARDS = 4;
/** The shared colorless market: static display, refills from its deck on purchase. */
export const MARKET_SIZE = 4;
