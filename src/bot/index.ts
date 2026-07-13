// Heuristic bot: dumb on purpose, replaceable. Consumes the same public
// engine API as the UI (legalActions + action payloads); no rules live here.
// Known dumbness, accepted for MVP: never spends tokens, ignores echo value
// and opponent echo stacks, scores only immediate effects.
import { actingSeat, legalActions, previewNumbers } from '../engine';
import type { Action, AllocationMode, ConditionalWhen, Effect, GameState } from '../engine';

export function chooseAction(state: GameState): Action {
  const actions = legalActions(state);
  const first = actions[0];
  if (!first) throw new Error('bot asked to act with no legal actions');
  if (actions.length === 1) return first;
  switch (state.phase) {
    case 'allocate':
      return bestAllocation(state, actions);
    case 'chooseTarget':
      return bestTarget(state, actions);
    case 'echoChoice':
      return bestEchoChoice(state);
    case 'buy':
      return bestBuy(state, actions);
    default:
      return first;
  }
}

/** How should MY echo stack hear this roll? Pick the interpretation whose
 *  matched echo lines are worth more to me (echo damage chips the roller,
 *  so it counts as a gain here). */
function bestEchoChoice(state: GameState): Action {
  const dice = state.dice!;
  const seat = actingSeat(state);
  const stack = state.players[seat]!.echoStack;
  const roll: RollContext = {
    mode: state.lastAllocation?.mode ?? 'individual',
    sum: dice[0] + dice[1],
    dice,
  };
  const valueFor = (numbers: number[]) => {
    let v = 0;
    for (const n of numbers) {
      for (const entry of stack) {
        if (entry.slot === n) v += scoreEchoLine(state, entry.def.echo, seat, roll);
      }
    }
    return v;
  };
  const mode: AllocationMode =
    valueFor([dice[0], dice[1]]) >= valueFor([dice[0] + dice[1]]) ? 'individual' : 'sum';
  return { type: 'ECHO_CHOICE', mode };
}

/** Value of one of MY echo lines when it fires on someone else's turn. */
function scoreEchoLine(
  state: GameState,
  effects: Effect[],
  seat: number,
  roll: RollContext,
): number {
  const me = state.players[seat]!;
  let v = 0;
  for (const e of effects) {
    switch (e.kind) {
      case 'gainMoney':
        v += e.amount;
        break;
      case 'gainPoints':
        v += e.amount * 2;
        break;
      case 'damage':
        v += e.amount * 1.2; // echo damage always chips the roller
        break;
      case 'heal':
        v += Math.min(e.amount, state.tunables.startingHp - me.hp) * 0.5;
        break;
      case 'gainToken':
        v += e.amount * 0.5;
        break;
      case 'refreshShop':
        v += 0.25;
        break;
      case 'discount':
        v += Math.min(e.amount, 3) * 0.7;
        break;
      case 'trade': {
        const net = scoreEchoLine(state, e.then, seat, roll) - e.pay;
        if (net > 0) v += me.money >= e.pay ? net : net * 0.5;
        break;
      }
      case 'conditional':
        v += conditionOdds(state, e.when, seat, roll) * scoreEchoLine(state, e.then, seat, roll);
        break;
    }
  }
  return v;
}

/** Rough chance a slot's number comes up in a turn: slots 1-6 via a single die
 *  (1 - (5/6)^2 = 11/36), otherwise the 2d6 sum distribution. */
const SUM_WAYS = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]; // index = sum
function triggerProb(slot: number): number {
  const sumP = (SUM_WAYS[slot] ?? 0) / 36;
  return slot <= 6 ? Math.max(11 / 36, sumP) : sumP;
}

interface RollContext {
  mode: AllocationMode;
  sum: number;
  dice: [number, number];
}

/** Immediate expected value of an effect line for `seat`.
 *  money = 1, point = 2 (PLAN section 6). */
function scoreEffects(
  state: GameState,
  effects: Effect[],
  seat: number,
  roll?: RollContext,
): number {
  const me = state.players[seat]!;
  let v = 0;
  for (const e of effects) {
    switch (e.kind) {
      case 'gainMoney':
        v += e.amount;
        break;
      case 'gainPoints':
        v += e.amount * 2;
        break;
      case 'damage':
        if (e.target === 'roller') {
          // Scoring happens on the bot's own turn, so 'roller' = self-risk.
          v -= me.hp <= e.amount ? 100 : e.amount;
        } else {
          const anyLow = state.players.some(
            (p, i) => i !== seat && !p.eliminated && p.hp <= 8,
          );
          v += e.amount * (anyLow ? 3 : 1.2);
        }
        break;
      case 'heal':
        v += Math.min(e.amount, state.tunables.startingHp - me.hp) * 0.5;
        break;
      case 'gainToken':
        v += e.amount * 0.5;
        break;
      case 'refreshShop':
        v += 0.25;
        break;
      case 'discount':
        v += Math.min(e.amount, 3) * 0.7;
        break;
      case 'trade': {
        const net = scoreEffects(state, e.then, seat, roll) - e.pay;
        if (net > 0) v += me.money >= e.pay ? net : net * 0.5;
        break;
      }
      case 'conditional':
        v += conditionOdds(state, e.when, seat, roll) * scoreEffects(state, e.then, seat, roll);
        break;
    }
  }
  return v;
}

/** 1/0 when decidable now, 0.5 when it depends on a future roll. */
function conditionOdds(
  state: GameState,
  when: ConditionalWhen,
  seat: number,
  roll?: RollContext,
): number {
  let odds = 1;
  if (when.hpAtOrBelow !== undefined) {
    odds *= state.players[seat]!.hp <= when.hpAtOrBelow ? 1 : 0;
  }
  if (when.sumAtLeast !== undefined) {
    odds *= roll ? (roll.sum >= when.sumAtLeast ? 1 : 0) : 0.5;
  }
  if (when.allocatedIndividually !== undefined) {
    odds *= roll ? ((roll.mode === 'individual') === when.allocatedIndividually ? 1 : 0) : 0.5;
  }
  if (when.rolledDoubles !== undefined) {
    odds *= roll ? ((roll.dice[0] === roll.dice[1]) === when.rolledDoubles ? 1 : 0) : 1 / 6;
  }
  if (when.bothDiceOdd !== undefined) {
    odds *= roll
      ? ((roll.dice[0] % 2 === 1 && roll.dice[1] % 2 === 1) === when.bothDiceOdd ? 1 : 0)
      : 0.25;
  }
  if (when.bothDiceEven !== undefined) {
    odds *= roll
      ? ((roll.dice[0] % 2 === 0 && roll.dice[1] % 2 === 0) === when.bothDiceEven ? 1 : 0)
      : 0.25;
  }
  if (when.echoStackAtLeast !== undefined) {
    odds *= state.players[seat]!.echoStack.length >= when.echoStackAtLeast ? 1 : 0;
  }
  return odds;
}

function bestAllocation(state: GameState, actions: Action[]): Action {
  // SPEND_TOKEN actions are ignored on purpose; pick the better mode.
  const dice = state.dice!;
  const seat = state.current;
  const board = state.players[seat]!.board;
  let best: Action | null = null;
  let bestScore = -Infinity;
  for (const a of actions) {
    if (a.type !== 'ALLOCATE') continue;
    const roll: RollContext = { mode: a.mode, sum: dice[0] + dice[1], dice };
    let s = 0;
    for (const n of previewNumbers(dice, a.mode)) {
      s += scoreEffects(state, board[n - 1]!.active, seat, roll);
    }
    if (s > bestScore) {
      bestScore = s;
      best = a;
    }
  }
  return best!;
}

function bestTarget(state: GameState, actions: Action[]): Action {
  // Always the point leader; HP breaks ties.
  let best: Action | null = null;
  let bestKey = -Infinity;
  for (const a of actions) {
    if (a.type !== 'CHOOSE_TARGET') continue;
    const p = state.players[a.playerId]!;
    const key = p.points * 1000 + p.hp;
    if (key > bestKey) {
      bestKey = key;
      best = a;
    }
  }
  return best!;
}

function bestBuy(state: GameState, actions: Action[]): Action {
  const seat = state.current;
  const me = state.players[seat]!;
  let best: Action | null = null;
  let bestScore = 0; // a buy must beat "keep the money"
  for (const a of actions) {
    if (a.type !== 'BUY') continue;
    const card = me.shop[a.shopIndex]!;
    const prob = triggerProb(a.targetSlot);
    const gain =
      (scoreEffects(state, card.active, seat)
        - scoreEffects(state, me.board[a.targetSlot - 1]!.active, seat))
      * prob;
    let s = gain / Math.max(1, card.cost - me.buyDiscount);
    if (card.color === me.color) s += 0.05; // prefer own color
    if (s > bestScore) {
      bestScore = s;
      best = a;
    }
  }
  return best ?? { type: 'SKIP_BUY' };
}
