import { applyEffects } from './effects';
import { rollDie } from './rng';
import type { Action, AllocationMode, GameState, Rng, TurnPhase } from './types';

/** Everything the UI and bot may do right now. They consume this and
 *  applyAction only; neither ever computes rules on its own. */
export function legalActions(state: GameState): Action[] {
  if (state.winner !== null) return [];
  switch (state.phase) {
    case 'roll':
      return [{ type: 'ROLL' }];
    case 'allocate':
      // Boards are always full (starters get replaced, never removed), so both
      // modes are always legal: dice 1-6 hit slots 1-6, sums 2-12 hit slots 2-12.
      return [
        { type: 'ALLOCATE', mode: 'individual' },
        { type: 'ALLOCATE', mode: 'sum' },
      ];
    case 'buy':
      return [{ type: 'SKIP_BUY' }]; // BUY joins in Phase 2 with the shop
    case 'end':
      return [{ type: 'END_TURN' }];
  }
}

/** Seats a chooseOpponent effect may target: living opponents of the roller.
 *  Eliminated players are untargetable. CHOOSE_TARGET consumes this in Phase 2. */
export function legalTargets(state: GameState, roller: number): number[] {
  return state.players
    .map((p, seat) => ({ p, seat }))
    .filter((x) => x.seat !== roller && !x.p.eliminated)
    .map((x) => x.seat);
}

/** The only door into the game. Never mutates its input; returns a new state. */
export function applyAction(state: GameState, action: Action, rng: Rng): GameState {
  assertLegal(state, action);
  const next = structuredClone(state);
  switch (action.type) {
    case 'ROLL':
      next.dice = [rollDie(rng), rollDie(rng)];
      next.phase = 'allocate';
      break;
    case 'ALLOCATE':
      allocate(next, action.mode);
      break;
    case 'SKIP_BUY':
      next.phase = 'end';
      break;
    case 'END_TURN':
      endTurn(next);
      break;
  }
  return next;
}

const EXPECTED: Record<TurnPhase, Action['type']> = {
  roll: 'ROLL',
  allocate: 'ALLOCATE',
  buy: 'SKIP_BUY',
  end: 'END_TURN',
};

function assertLegal(state: GameState, action: Action): void {
  if (state.winner !== null) {
    throw new Error(`game is over (winner: seat ${state.winner}); no further actions`);
  }
  if (action.type !== EXPECTED[state.phase]) {
    throw new Error(`illegal action ${action.type} during ${state.phase} phase`);
  }
}

/** Turn steps 3-5: allocate, resolve actives, fire opponents' echoes. */
function allocate(state: GameState, mode: AllocationMode): void {
  const dice = state.dice;
  if (!dice) throw new Error('no dice on the table'); // unreachable via legalActions
  const roller = state.current;
  const rollerState = state.players[roller];
  if (!rollerState) throw new Error(`no player at seat ${roller}`);

  // Mode A produces both die values (doubles produce the number twice, which is
  // the double-fire); Mode B produces the one sum.
  const numbers: number[] = mode === 'individual' ? [dice[0], dice[1]] : [dice[0] + dice[1]];
  state.lastAllocation = { mode, numbers };

  // Resolve: the roller's card in each produced slot fires its active lines.
  for (const slot of numbers) {
    const card = rollerState.board[slot - 1];
    if (!card) throw new Error(`slot ${slot} has no card`); // boards are always full
    applyEffects(state, card.active, { owner: roller, roller });
  }

  // Echo: for each produced number, every living opponent fires the echo lines
  // of every matching card in their Echo Stack. Eliminated stacks are inert.
  for (const slot of numbers) {
    for (let offset = 1; offset < state.players.length; offset++) {
      const seat = (roller + offset) % state.players.length;
      const opponent = state.players[seat];
      if (!opponent || opponent.eliminated) continue;
      for (const entry of opponent.echoStack) {
        if (entry.slot !== slot) continue;
        applyEffects(state, entry.def.echo, { owner: seat, roller });
      }
    }
  }

  state.phase = 'buy';
  checkKo(state);

  // Echo damage can eliminate the roller mid-turn; their turn ends on the spot.
  if (state.winner === null && state.players[roller]?.eliminated) {
    endTurn(state);
  }
}

/** Turn step 7: win checks, then pass to the next living seat. */
function endTurn(state: GameState): void {
  // Points win is checked at end of turn (PLAN section 2): a mid-turn crossing
  // of the threshold waits until here. Echoes can push several players over at
  // once (Phase 2+); highest points wins, HP then seat order break ties.
  const contenders = state.players
    .map((p, seat) => ({ p, seat }))
    .filter((x) => !x.p.eliminated && x.p.points >= state.tunables.pointsToWin)
    .sort((a, b) => b.p.points - a.p.points || b.p.hp - a.p.hp || a.seat - b.seat);
  const pointsWinner = contenders[0];
  if (pointsWinner) {
    state.winner = pointsWinner.seat;
    state.winReason = 'points';
    return;
  }

  const nextSeat = nextLiving(state, state.current);
  const wrapped = nextSeat <= state.current;

  if (wrapped && state.round >= state.tunables.roundCap) {
    // Failsafe: the round cap is done; highest points among the living wins,
    // HP then seat order break ties.
    const ranked = state.players
      .map((p, seat) => ({ p, seat }))
      .filter((x) => !x.p.eliminated)
      .sort((a, b) => b.p.points - a.p.points || b.p.hp - a.p.hp || a.seat - b.seat);
    const survivor = ranked[0];
    if (!survivor) throw new Error('no living players at failsafe'); // unreachable: KO wins earlier
    state.winner = survivor.seat;
    state.winReason = 'failsafe';
    return;
  }

  if (wrapped) state.round += 1;
  state.current = nextSeat;
  state.phase = 'roll';
  state.dice = null;
  state.lastAllocation = null;
}

/** Last player standing wins the moment everyone else is eliminated. */
function checkKo(state: GameState): void {
  if (state.winner !== null) return;
  const living = state.players
    .map((p, seat) => ({ p, seat }))
    .filter((x) => !x.p.eliminated);
  if (living.length === 1 && living[0]) {
    state.winner = living[0].seat;
    state.winReason = 'ko';
  }
}

/** Next non-eliminated seat after `from`, in seat order. */
function nextLiving(state: GameState, from: number): number {
  const n = state.players.length;
  for (let step = 1; step <= n; step++) {
    const seat = (from + step) % n;
    const player = state.players[seat];
    if (player && !player.eliminated) return seat;
  }
  throw new Error('no living players'); // unreachable: KO win fires first
}
