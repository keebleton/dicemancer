import type { Tunables } from './types';

/** Defaults from the PLAN.md section 8 table. */
export const DEFAULT_TUNABLES: Tunables = {
  startingHp: 25,
  pointsToWin: 30,
  // 5 -> 2 (Jake 2026-07-13): colorless artifacts came online too fast.
  startingMoney: 2,
  roundCap: 0, // uncapped by default since 2026-07-14; 0 = no round limit
  playerMin: 2,
  playerMax: 4,
  // ON since 2026-07-13 (Jake): slots 7-12 fire so rarely on the active side
  // (94% of fires land 1-6) that high cards need a life on other turns.
  highEchoHearsSum: true,
};

/** HP by player count is THE damage-race lever; retuned whenever the economy
 *  moves. 2026-07-14 second pass (mechanics batch spread damage into every
 *  color): more total damage supply reheated the races; 4p moves 14 -> 16
 *  (red lands 26 percent, three colors within a point of fair) and 2p 31 ->
 *  32. Standing 2p watch list: black runs ~58 and blue ~39 at every HP level
 *  tried - that seesaw is card-level, next balance pass owns it. Explicit
 *  startingHp overrides win. */
export const HP_BY_PLAYER_COUNT: Record<number, number> = { 2: 32, 3: 18, 4: 16 };

/** Personal shop row: own-color cards only (colorless moved to the shared
 *  market, 2026-07-13). Buys per turn is 1 across shop AND market, hardcoded
 *  in the phase machine (any buy -> end). */
export const SHOP_COLOR_CARDS = 4;
/** The shared colorless market: static display, refills from its deck on purchase. */
export const MARKET_SIZE = 4;
