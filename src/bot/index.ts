// Heuristic bot at three strengths. 'normal' is the original MVP bot (all
// balance sims are calibrated against it): never spends tokens, ignores the
// echo value of buys, scores only immediate effects. 'easy' plays a random
// legal action a quarter of the time and never buys relics. 'hard' spends
// nudge and reroll tokens when the math says so, values the echo a purchase
// sends to the graveyard, leans into charge slots about to pay off, and
// takes lethal when it sees it. Everything stays deterministic (sims replay
// per seed): easy's randomness derives from a state hash, not Math.random.
import { RELIC_BY_ID, actingSeat, legalActions, previewNumbers } from '../engine';
import type { Action, AllocationMode, ConditionalWhen, Effect, GameState } from '../engine';

export type BotLevel = 'easy' | 'normal' | 'hard';

/** Deterministic pseudo-randomness for the easy bot's derp factor. */
function stateHash(state: GameState): number {
  const d = state.dice;
  let h = state.round * 2654435761 + state.current * 40503 + (d ? d[0] * 97 + d[1] * 31 : 7);
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

export function chooseAction(state: GameState, level: BotLevel = 'normal'): Action {
  const actions = legalActions(state);
  const first = actions[0];
  if (!first) throw new Error('bot asked to act with no legal actions');
  if (actions.length === 1) return first;
  if (level === 'easy') {
    const h = stateHash(state);
    if (h % 4 === 0) {
      // A random legal action... but never a relic, and never an action that
      // fails to advance the game: SPEND_TOKEN re-enters allocate forever, and
      // FREEZE_SHOP toggles in place -- since the derp hash reads only
      // round/seat/dice, none of which a toggle changes, picking it once
      // meant picking it every time (a live-game hang, found by sim).
      const pool = actions.filter(
        (a) => a.type !== 'BUY_RELIC' && a.type !== 'SPEND_TOKEN' && a.type !== 'FREEZE_SHOP',
      );
      return pool[(h >>> 3) % pool.length] ?? first;
    }
  }
  switch (state.phase) {
    case 'allocate':
      return level === 'hard' ? hardAllocate(state, actions) : bestAllocation(state, actions);
    case 'chooseTarget':
      return bestTarget(state, actions, level);
    case 'echoChoice':
      return bestEchoChoice(state);
    case 'buy': {
      if (level === 'easy') {
        return bestBuy(
          state,
          actions.filter((a) => a.type !== 'BUY_RELIC'),
          level,
        );
      }
      return bestBuy(state, actions, level);
    }
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
    // Under highEchoHearsSum, sum-matched high echoes fire either way; count
    // them in both options so they cancel instead of skewing toward 'sum'.
    if (state.tunables.highEchoHearsSum && roll.sum >= 7 && !numbers.includes(roll.sum)) {
      for (const entry of stack) {
        if (entry.slot === roll.sum) v += scoreEchoLine(state, entry.def.echo, seat, roll);
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
      case 'steal':
        v += e.amount * 1.6; // my gain plus their loss
        break;
      case 'swapBoard':
        v += 0.4; // board shuffling: hard to value, mildly interesting
        break;
      case 'charge':
        v += scoreEchoLine(state, e.then, seat, roll) / Math.max(1, e.need);
        break;
      case 'winGame':
        v += 40;
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
      case 'steal':
        v += e.amount * 1.6;
        break;
      case 'swapBoard':
        v += 0.4;
        break;
      case 'charge':
        // Amortized: the payoff lands once per `need` fires.
        v += scoreEffects(state, e.then, seat, roll) / Math.max(1, e.need);
        break;
      case 'winGame':
        v += 40;
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
  let best: Action | null = null;
  let bestScore = -Infinity;
  for (const a of actions) {
    if (a.type !== 'ALLOCATE') continue;
    const s = allocationValue(state, dice, a.mode);
    if (s > bestScore) {
      bestScore = s;
      best = a;
    }
  }
  return best!;
}

/** EV of firing these dice under this mode, charge progress included. */
function allocationValue(state: GameState, dice: [number, number], mode: AllocationMode): number {
  const seat = state.current;
  const me = state.players[seat]!;
  const roll: RollContext = { mode, sum: dice[0] + dice[1], dice };
  let s = 0;
  for (const n of previewNumbers(dice, mode)) {
    s += scoreEffects(state, me.board[n - 1]!.active, seat, roll);
    // A charge one fire from paying out is nearly its payoff.
    for (const e of me.board[n - 1]!.active) {
      if (e.kind === 'charge' && (me.charges[n - 1] ?? 0) >= e.need - 1) {
        s += scoreEffects(state, e.then, seat, roll) * 0.9;
      }
    }
  }
  return s;
}

/** Hard bot: consider nudges (deterministic) and rerolls (in expectation)
 *  before settling for the best plain allocation. */
function hardAllocate(state: GameState, actions: Action[]): Action {
  const dice = state.dice!;
  const evOf = (d: [number, number]) =>
    Math.max(allocationValue(state, d, 'individual'), allocationValue(state, d, 'sum'));
  const current = evOf(dice);

  let bestToken: Action | null = null;
  let bestGain = 0;
  for (const a of actions) {
    if (a.type !== 'SPEND_TOKEN') continue;
    if (a.kind === 'nudge') {
      const d: [number, number] = [...dice];
      d[a.dieIndex] += a.delta!;
      const gain = evOf(d) - current;
      if (gain > Math.max(1.2, bestGain)) {
        bestGain = gain;
        bestToken = a;
      }
    } else {
      // Reroll in expectation over the six faces.
      let sum = 0;
      for (let face = 1; face <= 6; face++) {
        const d: [number, number] = [...dice];
        d[a.dieIndex] = face;
        sum += evOf(d);
      }
      const gain = sum / 6 - current;
      if (gain > Math.max(1.5, bestGain)) {
        bestGain = gain;
        bestToken = a;
      }
    }
  }
  if (bestToken) return bestToken;
  return bestAllocation(state, actions);
}

function bestTarget(state: GameState, actions: Action[], level: BotLevel = 'normal'): Action {
  // Lethal first (hard); otherwise the point leader, HP breaking ties.
  const pending = state.pendingEffects?.[0]?.effect;
  const incoming = pending && pending.kind === 'damage' ? pending.amount : 0;
  let best: Action | null = null;
  let bestKey = -Infinity;
  for (const a of actions) {
    if (a.type !== 'CHOOSE_TARGET') continue;
    const p = state.players[a.playerId]!;
    let key = p.points * 1000 + p.hp;
    if (level === 'hard' && incoming > 0 && p.hp <= incoming) key += 1_000_000; // take the kill
    if (key > bestKey) {
      bestKey = key;
      best = a;
    }
  }
  return best!;
}

/** Rough lifetime value per relic for the buy heuristic. Resonant Bell stays
 *  at 0: bots cannot tell money echoes from self-harm echoes, so they skip it. */
const RELIC_VALUE: Record<string, number> = {
  'echo-prism': 8,
  'merchant-crown': 6,
  'golden-scales': 7,
  'interest-ledger': 7,
  'bottomless-purse': 4,
  'auctioneers-gavel': 5,
  'collectors-case': 6,
  'loaded-die': 5,
  'fates-hourglass': 5,
  'weighted-dice': 6,
  'destiny-stone': 6,
  'resonant-bell': 0,
  'grave-lantern': 7,
  'chorus-amplifier': 8,
  'iron-aegis': 4,
  'vampiric-chalice': 4,
  'assassins-mark': 4,
  'chrono-anchor': 6,
  'magnet-stone': 4,
  'wildcard-sleeve': 5,
};

function bestBuy(state: GameState, actions: Action[], level: BotLevel = 'normal'): Action {
  const seat = state.current;
  const me = state.players[seat]!;
  const opponents = state.players.filter((p, i) => i !== seat && !p.eliminated).length;
  let best: Action | null = null;
  let bestScore = 0; // a buy must beat "keep the money"
  for (const a of actions) {
    if (a.type !== 'BUY' && a.type !== 'BUY_MARKET') continue;
    const card = a.type === 'BUY' ? me.shop[a.shopIndex]! : state.market[a.marketIndex]!;
    const prob = triggerProb(a.targetSlot);
    const displaced = me.board[a.targetSlot - 1]!;
    let gain =
      (scoreEffects(state, card.active, seat) - scoreEffects(state, displaced.active, seat))
      * prob;
    if (level === 'hard') {
      // The buy also sends the displaced card to the graveyard, where its
      // echo earns on every opponent turn for the rest of the game.
      const echoValue = scoreEchoLine(state, displaced.echo, seat, {
        mode: 'individual',
        sum: 7,
        dice: [3, 4],
      });
      gain += echoValue * triggerProb(a.targetSlot) * opponents * 3; // ~3-turn horizon
    }
    let s = gain / Math.max(1, card.cost - me.buyDiscount);
    if (card.color === me.color) s += 0.05; // prefer own color
    if (s > bestScore) {
      bestScore = s;
      best = a;
    }
  }
  // Relics: only with real surplus (the sink working as intended), best
  // value-for-money first. Slot picks land on the strongest own-active slot
  // (prism) or the best sum slot (sleeve).
  let bestRelic: Action | null = null;
  let bestRelicScore = 0;
  for (const a of actions) {
    if (a.type !== 'BUY_RELIC') continue;
    const id = state.reliquary[a.index];
    if (!id) continue;
    const def = RELIC_BY_ID[id]!;
    if (me.money - def.cost < 6) continue; // keep a working purse
    let s = (RELIC_VALUE[id] ?? 3) / def.cost;
    if (a.slotPick !== undefined) {
      const slotValue =
        scoreEffects(state, me.board[a.slotPick - 1]!.active, seat) * triggerProb(a.slotPick);
      s += slotValue / def.cost;
    }
    if (s > bestRelicScore) {
      bestRelicScore = s;
      bestRelic = a;
    }
  }
  // A relic with surplus cash beats a marginal card buy.
  if (bestRelic && bestRelicScore > bestScore * 0.6) return bestRelic;
  if (best) return best;
  // Nothing affordable is worth buying. Freeze the shop when it holds a card
  // clearly worth saving up for; unfreeze once nothing in it qualifies.
  // (One-directional per evaluation, so a bot never toggle-loops.)
  let keepWorthy = 0;
  for (const card of me.shop) {
    if (!card) continue;
    if (Math.max(0, card.cost - me.buyDiscount) <= me.money) continue;
    const prob = Math.max(...card.legalSlots.map(triggerProb));
    keepWorthy = Math.max(keepWorthy, scoreEffects(state, card.active, seat) * prob);
  }
  const canToggle = actions.some((a) => a.type === 'FREEZE_SHOP');
  if (canToggle && !me.shopFrozen && keepWorthy > 1.8) return { type: 'FREEZE_SHOP' };
  if (canToggle && me.shopFrozen && keepWorthy <= 1.8) return { type: 'FREEZE_SHOP' }; // unfreeze
  return { type: 'SKIP_BUY' };
}
