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
 *  moves. 2026-07-14 (full-coverage expansion, 110 new cards): red's deeper
 *  damage pool pushed the 2p race again; re-simmed with the Legion of Echoes
 *  nerf and black threshold re-anchor, 2p lands at 31 (colors 47-53), 3p
 *  stays 18, 4p stays 14. Explicit startingHp overrides win. */
export const HP_BY_PLAYER_COUNT: Record<number, number> = { 2: 31, 3: 18, 4: 14 };

/** Personal shop row: own-color cards only (colorless moved to the shared
 *  market, 2026-07-13). Buys per turn is 1 across shop AND market, hardcoded
 *  in the phase machine (any buy -> end). */
export const SHOP_COLOR_CARDS = 4;
/** The shared colorless market: static display, refills from its deck on purchase. */
export const MARKET_SIZE = 4;
