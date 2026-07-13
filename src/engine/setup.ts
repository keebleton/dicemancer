import { DEFAULT_TUNABLES } from './tunables';
import type { CardDef, GameState, PlayerState, SeatColor, Tunables } from './types';

export interface SeatConfig {
  name: string;
  color: SeatColor;
}

export interface GameConfig {
  seats: SeatConfig[];
  /** 12 cards, index i installs into slot i+1. Passed in by the caller so the
   *  engine never imports /src/content (content depends on engine, not the reverse). */
  starterBoard: CardDef[];
  tunables?: Partial<Tunables>;
}

export function createGame(config: GameConfig): GameState {
  const tunables: Tunables = { ...DEFAULT_TUNABLES, ...config.tunables };
  const seatCount = config.seats.length;
  if (seatCount < tunables.playerMin || seatCount > tunables.playerMax) {
    throw new Error(
      `player count ${seatCount} outside ${tunables.playerMin}-${tunables.playerMax}`,
    );
  }
  if (config.starterBoard.length !== 12) {
    throw new Error(`starter board must hold 12 cards, got ${config.starterBoard.length}`);
  }
  const players: PlayerState[] = config.seats.map((seat) => ({
    name: seat.name,
    color: seat.color,
    hp: tunables.startingHp,
    money: tunables.startingMoney,
    points: 0,
    tokens: { reroll: 0, nudge: 0 },
    // Each seat gets its own copies so later install/retire never aliases boards.
    board: structuredClone(config.starterBoard),
    echoStack: [],
    eliminated: false,
  }));
  return {
    tunables,
    players,
    current: 0,
    round: 1,
    phase: 'roll',
    dice: null,
    lastAllocation: null,
    winner: null,
    winReason: null,
  };
}
