// Pure engine types. Everything inside GameState must stay JSON-serializable:
// plain objects, arrays, numbers, strings, booleans, null. No functions, no
// class instances, no Maps/Sets. That invariant is what makes replays,
// persistence, and future server-authoritative play possible.

export type CardColor = 'red' | 'blue' | 'colorless' | 'starter';
// v2 colors (black/green/white) extend this union when they land; do not build them.

export type SeatColor = 'red' | 'blue';

export type TokenKind = 'reroll' | 'nudge';

export type EffectTarget = 'chooseOpponent' | 'roller';

export interface ConditionalWhen {
  sumAtLeast?: number;
  allocatedIndividually?: boolean;
  hpAtOrBelow?: number;
}

/** The full primitive set from PLAN.md section 4. Phase 1 interprets the subset
 *  starter-only games exercise; the rest throw until the Phase 2 interpreter. */
export type Effect =
  | { kind: 'gainMoney'; amount: number }
  | { kind: 'gainPoints'; amount: number }
  | { kind: 'damage'; amount: number; target: EffectTarget }
  | { kind: 'heal'; amount: number }
  | { kind: 'gainToken'; token: TokenKind; amount: number }
  | { kind: 'refreshShop' }
  | { kind: 'conditional'; when: ConditionalWhen; then: Effect[] };

export interface CardDef {
  id: string;
  name: string;
  color: CardColor;
  rarity: 'common' | 'rare' | 'starter';
  cost: number;
  legalSlots: number[];
  active: Effect[];
  echo: Effect[];
  flavor?: string;
}

export interface EchoEntry {
  def: CardDef;
  /** The board slot (1-12) the card retired from; echoes match against this. */
  slot: number;
}

export interface PlayerState {
  name: string;
  color: SeatColor;
  hp: number;
  money: number;
  points: number;
  tokens: { reroll: number; nudge: number };
  /** Always 12 entries; index i holds the card installed in slot i+1. */
  board: CardDef[];
  echoStack: EchoEntry[];
  eliminated: boolean;
}

export type TurnPhase = 'roll' | 'allocate' | 'buy' | 'end';

export type AllocationMode = 'individual' | 'sum';

export interface Allocation {
  mode: AllocationMode;
  /** Numbers produced this turn: both die values (individual) or the one sum.
   *  Drives the echo step and, in Phase 2, allocatedIndividually conditionals. */
  numbers: number[];
}

export type WinReason = 'points' | 'ko' | 'failsafe';

/** PLAN.md section 8: the single tunables surface. Balance edits land here. */
export interface Tunables {
  startingHp: number;
  pointsToWin: number;
  startingMoney: number;
  roundCap: number;
  playerMin: number;
  playerMax: number;
}

export interface GameState {
  tunables: Tunables;
  players: PlayerState[];
  /** Seat index of the active player (the roller). */
  current: number;
  /** 1-based; a round is one full pass of the living seats. */
  round: number;
  phase: TurnPhase;
  dice: [number, number] | null;
  lastAllocation: Allocation | null;
  winner: number | null;
  winReason: WinReason | null;
}

/** Phase 1 actions. Phase 2 extends this union with
 *  SPEND_TOKEN, RESOLVE_ORDER, CHOOSE_TARGET, and BUY. */
export type Action =
  | { type: 'ROLL' }
  | { type: 'ALLOCATE'; mode: AllocationMode }
  | { type: 'SKIP_BUY' }
  | { type: 'END_TURN' };

/** Injected randomness source. The engine itself never calls Math.random. */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
}
