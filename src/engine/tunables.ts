import type { Tunables } from './types';

/** Defaults from the PLAN.md section 8 table.
 *  Balance values are placeholders until the Phase 5 sim. */
export const DEFAULT_TUNABLES: Tunables = {
  startingHp: 25,
  pointsToWin: 30,
  startingMoney: 5,
  roundCap: 25,
  playerMin: 2,
  playerMax: 4,
};

/** Shop row: 3 from the seat's color pool + 2 colorless.
 *  Buys per turn is 1, hardcoded in the phase machine (BUY -> end). */
export const SHOP_COLOR_CARDS = 3;
export const SHOP_COLORLESS_CARDS = 2;
