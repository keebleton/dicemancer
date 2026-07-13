import { dealRow, shuffle } from './shop';
import { DEFAULT_TUNABLES } from './tunables';
import type { CardDef, GameState, PlayerState, Rng, SeatColor, Tunables } from './types';

export interface SeatConfig {
  name: string;
  color: SeatColor;
}

export interface GameConfig {
  seats: SeatConfig[];
  /** 12 cards, index i installs into slot i+1. Passed in by the caller so the
   *  engine never imports /src/content (content depends on engine, not the reverse). */
  starterBoard: CardDef[];
  /** Optional card pools; each seat gets its own shuffled copies (PLAN section 2).
   *  Omit for starter-only games (no shop, BUY never legal). */
  pools?: { red: CardDef[]; blue: CardDef[]; colorless: CardDef[] };
  tunables?: Partial<Tunables>;
}

export function createGame(config: GameConfig, rng?: Rng): GameState {
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
  if (config.pools && !rng) throw new Error('pools need an rng to shuffle');

  const players: PlayerState[] = config.seats.map((seat) => {
    const colorDeck = config.pools ? structuredClone(config.pools[seat.color]) : [];
    const colorlessDeck = config.pools ? structuredClone(config.pools.colorless) : [];
    if (rng) {
      shuffle(colorDeck, rng);
      shuffle(colorlessDeck, rng);
    }
    return {
      name: seat.name,
      color: seat.color,
      hp: tunables.startingHp,
      money: tunables.startingMoney,
      points: 0,
      tokens: { reroll: 0, nudge: 0 },
      board: structuredClone(config.starterBoard),
      echoStack: [],
      eliminated: false,
      shop: config.pools ? Array<CardDef | null>(5).fill(null) : [],
      colorDeck,
      colorDiscard: [],
      colorlessDeck,
      colorlessDiscard: [],
    };
  });

  const state: GameState = {
    tunables,
    players,
    current: 0,
    round: 1,
    phase: 'roll',
    dice: null,
    lastAllocation: null,
    pendingEffects: null,
    winner: null,
    winReason: null,
  };
  if (config.pools && rng) {
    for (let seat = 0; seat < players.length; seat++) dealRow(state, seat, rng);
  }
  return state;
}
