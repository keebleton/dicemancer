// Pure engine package: no React, no DOM, no Math.random (RNG is injected and seeded).
// Everything outside /src/engine talks to the game through createGame,
// legalActions, and applyAction only.
export * from './types';
export { mulberry32, rollDie } from './rng';
export { DEFAULT_TUNABLES } from './tunables';
export { createGame } from './setup';
export type { GameConfig, SeatConfig } from './setup';
export {
  actingSeat,
  applyAction,
  applyActionInPlace,
  buyCost,
  legalActions,
  legalTargets,
  previewNumbers,
} from './reducer';
export { MAX_RELICS, RELICS, RELIC_BY_ID, RELIQUARY_SIZE, hasRelic } from './relics';
export type { RelicDef } from './relics';
