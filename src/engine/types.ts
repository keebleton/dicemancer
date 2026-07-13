// Pure engine types. Everything inside GameState must stay JSON-serializable:
// plain objects, arrays, numbers, strings, booleans, null. No functions, no
// class instances, no Maps/Sets. That invariant is what makes replays,
// persistence, and future server-authoritative play possible.

export type CardColor =
  | 'red'
  | 'blue'
  | 'black'
  | 'green'
  | 'yellow'
  | 'colorless'
  | 'starter';

export type SeatColor = 'red' | 'blue' | 'black' | 'green' | 'yellow';

export type TokenKind = 'reroll' | 'nudge';

export type EffectTarget = 'chooseOpponent' | 'roller';

export interface ConditionalWhen {
  /** Roll total (both dice), regardless of allocation mode. */
  sumAtLeast?: number;
  allocatedIndividually?: boolean;
  /** Checked against the card owner's HP. */
  hpAtOrBelow?: number;
  /** Black: both dice show the same face. */
  rolledDoubles?: boolean;
  /** Green: dice parity. */
  bothDiceOdd?: boolean;
  bothDiceEven?: boolean;
  /** Black: the card owner's echo stack size. */
  echoStackAtLeast?: number;
}

export type Effect =
  | { kind: 'gainMoney'; amount: number }
  | { kind: 'gainPoints'; amount: number }
  | { kind: 'damage'; amount: number; target: EffectTarget }
  | { kind: 'heal'; amount: number }
  | { kind: 'gainToken'; token: TokenKind; amount: number }
  | { kind: 'refreshShop' }
  /** Green: the owner's next buy this turn costs this much less (stacks, floors at 0). */
  | { kind: 'discount'; amount: number }
  /** Yellow: if the owner can pay, spend the money and apply `then`; otherwise nothing. */
  | { kind: 'trade'; pay: number; then: Effect[] }
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
  /** Card-art filename (Card Lab custom cards). Presentation only; the engine ignores it. */
  icon?: string;
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
  /** Green discounts bank here; consumed by the next BUY, reset when their turn ends. */
  buyDiscount: number;
  /** Always 12 entries; index i holds the card installed in slot i+1. */
  board: CardDef[];
  echoStack: EchoEntry[];
  eliminated: boolean;
  /** Own-color row in pooled games (null = bought this rotation); [] when the game has no pools. */
  shop: (CardDef | null)[];
  colorDeck: CardDef[];
  colorDiscard: CardDef[];
}

export type TurnPhase = 'roll' | 'allocate' | 'chooseTarget' | 'echoChoice' | 'buy' | 'end';

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
  /** The shared colorless MARKET: static (never rotates), visible to all,
   *  first buyer takes a card and the slot refills from the shared deck. */
  market: (CardDef | null)[];
  marketDeck: CardDef[];
  /** Seats (in order after the roller) still to hear this roll for their echoes.
   *  The head of the list is the seat an ECHO_CHOICE is awaited from. */
  echoPending: number[];
  /** Per seat: the numbers their echoes heard this turn (null = none yet). */
  echoNumbers: (number[] | null)[];
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
  /** An opponent of the roller decides how THEIR echo stack hears the roll:
   *  the two dice individually, or the one sum (the Space Base rule). */
  | { type: 'ECHO_CHOICE'; mode: AllocationMode }
  | { type: 'BUY'; shopIndex: number; targetSlot: number }
  /** Buy from the shared colorless market (counts as the turn's one purchase). */
  | { type: 'BUY_MARKET'; marketIndex: number; targetSlot: number }
  | { type: 'SKIP_BUY' }
  | { type: 'END_TURN' };
// Deferred: RESOLVE_ORDER (cards resolve in die order; revisit if ordering ever matters).

/** Injected randomness source. The engine itself never calls Math.random. */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
}
