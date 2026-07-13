import { dealMarket, dealRow, shuffle } from './shop';
import { DEFAULT_TUNABLES, HP_BY_PLAYER_COUNT } from './tunables';
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
  pools?: Record<SeatColor, CardDef[]> & { colorless: CardDef[] };
  tunables?: Partial<Tunables>;
}

export function createGame(config: GameConfig, rng?: Rng): GameState {
  const seatCount = config.seats.length;
  const tunables: Tunables = {
    ...DEFAULT_TUNABLES,
    startingHp: HP_BY_PLAYER_COUNT[seatCount] ?? DEFAULT_TUNABLES.startingHp,
    ...config.tunables,
  };
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
    if (rng) shuffle(colorDeck, rng);
    return {
      name: seat.name,
      color: seat.color,
      hp: tunables.startingHp,
      money: tunables.startingMoney,
      points: 0,
      tokens: { reroll: 0, nudge: 0 },
      buyDiscount: 0,
      board: structuredClone(config.starterBoard),
      echoStack: [],
      eliminated: false,
      shop: config.pools ? Array<CardDef | null>(1).fill(null) : [],
      colorDeck,
      colorDiscard: [],
    };
  });

  // ONE shared colorless market deck for the whole table.
  const marketDeck = config.pools ? structuredClone(config.pools.colorless) : [];
  if (rng) shuffle(marketDeck, rng);

  const state: GameState = {
    tunables,
    players,
    current: 0,
    round: 1,
    phase: 'roll',
    dice: null,
    lastAllocation: null,
    pendingEffects: null,
    market: [],
    marketDeck,
    echoPending: [],
    echoNumbers: players.map(() => null),
    winner: null,
    winReason: null,
  };
  if (config.pools && rng) {
    for (let seat = 0; seat < players.length; seat++) dealRow(state, seat, rng);
    dealMarket(state);
  }
  return state;
}
