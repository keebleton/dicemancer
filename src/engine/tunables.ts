import type { Tunables } from './types';

/** Defaults from the PLAN.md section 8 table. Shop/token params join in Phase 2.
 *  Balance values are placeholders until the Phase 5 sim. */
export const DEFAULT_TUNABLES: Tunables = {
  startingHp: 25,
  pointsToWin: 30,
  startingMoney: 5,
  roundCap: 25,
  playerMin: 2,
  playerMax: 4,
};
