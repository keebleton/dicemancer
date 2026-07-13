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
  /** Roll total (both dice), regardless of allocation mode. */
  sumAtLeast?: number;
  allocatedIndividually?: boolean;
  /** Checked against the card owner's HP. */
  hpAtOrBelow?: number;
}

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
  /** 5 entries in pooled games (null = bought this rotation); [] when the game has no pools. */
  shop: (CardDef | null)[];
  colorDeck: CardDef[];
  colorDiscard: CardDef[];
  colorlessDeck: CardDef[];
  colorlessDiscard: CardDef[];
}

export type TurnPhase = 'roll' | 'allocate' | 'chooseTarget' | 'buy' | 'end';

export type AllocationMode = 'individual' | 'sum';

export interface Allocation {
  mode: AllocationMode;
  /** Numbers produced this turn: both die values (individual) or the one sum. */
  numbers: number[];
}

/** One effect line waiting to resolve. echo=true means it came from an Echo
 *  Stack, where damage always targets the roller and nothing ever pauses. */
export interface QueuedEffect {
  effect: Effect;
  owner: number;
  echo: boolean;
}

export type WinReason = 'points' | 'ko' | 'failsafe';

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
  /** Effects still resolving this allocation; non-null only mid-resolution. */
  pendingEffects: QueuedEffect[] | null;
  winner: number | null;
  winReason: WinReason | null;
}

export type Action =
  | { type: 'ROLL' }
  /** Manipulation window: legal after ROLL, before ALLOCATE. delta is nudge-only
   *  (PLAN's action shape had no direction; +-1 needs one). */
  | { type: 'SPEND_TOKEN'; kind: TokenKind; dieIndex: 0 | 1; delta?: -1 | 1 }
  | { type: 'ALLOCATE'; mode: AllocationMode }
  | { type: 'CHOOSE_TARGET'; playerId: number }
  | { type: 'BUY'; shopIndex: number; targetSlot: number }
  | { type: 'SKIP_BUY' }
  | { type: 'END_TURN' };
// Deferred: RESOLVE_ORDER (cards resolve in die order; revisit if ordering ever matters).

/** Injected randomness source. The engine itself never calls Math.random. */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
}
