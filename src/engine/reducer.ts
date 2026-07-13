import { applyEffect, conditionHolds, damagePlayer } from './effects';
import { rollDie } from './rng';
import { dealRow, refillMarketSlot } from './shop';
import type { Action, AllocationMode, CardDef, GameState, QueuedEffect, Rng } from './types';

/** Everything the UI and bot may do right now. They consume this and
 *  applyAction only; neither ever computes rules on its own. */
export function legalActions(state: GameState): Action[] {
  if (state.winner !== null) return [];
  const me = state.players[state.current];
  if (!me) return [];
  switch (state.phase) {
    case 'roll':
      return [{ type: 'ROLL' }];
    case 'allocate': {
      const actions: Action[] = [
        { type: 'ALLOCATE', mode: 'individual' },
        { type: 'ALLOCATE', mode: 'sum' },
      ];
      const dice = state.dice;
      if (dice) {
        if (me.tokens.reroll > 0) {
          actions.push({ type: 'SPEND_TOKEN', kind: 'reroll', dieIndex: 0 });
          actions.push({ type: 'SPEND_TOKEN', kind: 'reroll', dieIndex: 1 });
        }
        if (me.tokens.nudge > 0) {
          for (const dieIndex of [0, 1] as const) {
            for (const delta of [-1, 1] as const) {
              const v = dice[dieIndex] + delta;
              if (v >= 1 && v <= 6) {
                actions.push({ type: 'SPEND_TOKEN', kind: 'nudge', dieIndex, delta });
              }
            }
          }
        }
      }
      return actions;
    }
    case 'chooseTarget':
      return legalTargets(state, state.current).map((seat) => ({
        type: 'CHOOSE_TARGET',
        playerId: seat,
      }));
    case 'echoChoice':
      return [
        { type: 'ECHO_CHOICE', mode: 'individual' },
        { type: 'ECHO_CHOICE', mode: 'sum' },
      ];
    case 'buy': {
      const actions: Action[] = [{ type: 'SKIP_BUY' }];
      me.shop.forEach((card, shopIndex) => {
        if (!card) return;
        const cost = Math.max(0, card.cost - me.buyDiscount);
        if (cost <= me.money) {
          for (const targetSlot of card.legalSlots) {
            actions.push({ type: 'BUY', shopIndex, targetSlot });
          }
        } else if (me.frozenShopIndex === null) {
          // Too pricey today: it can be frozen to survive the next rotation.
          actions.push({ type: 'FREEZE_SHOP', shopIndex });
        }
      });
      state.market.forEach((card, marketIndex) => {
        if (!card || Math.max(0, card.cost - me.buyDiscount) > me.money) return;
        for (const targetSlot of card.legalSlots) {
          actions.push({ type: 'BUY_MARKET', marketIndex, targetSlot });
        }
      });
      return actions;
    }
    case 'end':
      return [{ type: 'END_TURN' }];
  }
}

/** Numbers an allocation mode would produce from these dice. The UI preview
 *  uses this so the rule lives here, not in React. */
export function previewNumbers(dice: [number, number], mode: AllocationMode): number[] {
  return mode === 'individual' ? [dice[0], dice[1]] : [dice[0] + dice[1]];
}

/** Whose decision the game is waiting on: the roller, except during
 *  echoChoice, where it is the head of the echo queue. UI and bots key on this. */
export function actingSeat(state: GameState): number {
  return state.phase === 'echoChoice' ? (state.echoPending[0] ?? state.current) : state.current;
}

/** Seats a chooseOpponent effect may target: living opponents of the roller. */
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
  perform(next, action, rng);
  return next;
}

/** Same rules path as applyAction, but mutates in place and returns the same
 *  object. For the headless sim's hot loop ONLY (it owns its states); UI and
 *  bot go through applyAction. */
export function applyActionInPlace(state: GameState, action: Action, rng: Rng): GameState {
  assertLegal(state, action);
  perform(state, action, rng);
  return state;
}

function perform(next: GameState, action: Action, rng: Rng): void {
  switch (action.type) {
    case 'ROLL':
      next.dice = [rollDie(rng), rollDie(rng)];
      next.phase = 'allocate';
      break;
    case 'SPEND_TOKEN': {
      const me = next.players[next.current]!;
      const dice = next.dice!;
      me.tokens[action.kind] -= 1;
      if (action.kind === 'reroll') dice[action.dieIndex] = rollDie(rng);
      else dice[action.dieIndex] += action.delta!;
      break;
    }
    case 'ALLOCATE':
      allocate(next, action.mode, rng);
      break;
    case 'CHOOSE_TARGET':
      chooseTarget(next, action.playerId, rng);
      break;
    case 'ECHO_CHOICE': {
      const seat = next.echoPending[0]!;
      fireEchoesFor(next, seat, previewNumbers(next.dice!, action.mode), rng);
      next.echoPending.shift();
      processEchoQueue(next, rng);
      break;
    }
    case 'BUY': {
      const me = next.players[next.current]!;
      const card = me.shop[action.shopIndex]!;
      me.shop[action.shopIndex] = null;
      if (me.frozenShopIndex === action.shopIndex) me.frozenShopIndex = null;
      installCard(next, card, action.targetSlot);
      break;
    }
    case 'BUY_MARKET': {
      const card = next.market[action.marketIndex]!;
      refillMarketSlot(next, action.marketIndex); // first come, first served
      installCard(next, card, action.targetSlot);
      break;
    }
    case 'FREEZE_SHOP': {
      next.players[next.current]!.frozenShopIndex = action.shopIndex;
      break; // phase stays 'buy': freezing is not the turn's purchase
    }
    case 'SKIP_BUY':
      next.phase = 'end';
      break;
    case 'END_TURN':
      endTurn(next, rng);
      break;
  }
}

/** Pays for and installs a purchased card; the displaced card retires. */
function installCard(state: GameState, card: CardDef, targetSlot: number): void {
  const me = state.players[state.current]!;
  me.money -= Math.max(0, card.cost - me.buyDiscount);
  me.buyDiscount = 0; // the discount rode this buy
  const displaced = me.board[targetSlot - 1]!;
  me.echoStack.push({ def: displaced, slot: targetSlot });
  me.board[targetSlot - 1] = card;
  state.phase = 'end'; // max 1 buy per turn, shop and market combined
}

function assertLegal(state: GameState, action: Action): void {
  if (state.winner !== null) {
    throw new Error(`game is over (winner: seat ${state.winner}); no further actions`);
  }
  const fail = (): never => {
    throw new Error(`illegal action ${action.type} during ${state.phase} phase`);
  };
  switch (action.type) {
    case 'ROLL':
      if (state.phase !== 'roll') fail();
      return;
    case 'SPEND_TOKEN': {
      if (state.phase !== 'allocate' || !state.dice) return fail();
      const me = state.players[state.current]!;
      if (me.tokens[action.kind] <= 0) throw new Error(`no ${action.kind} token to spend`);
      if (action.dieIndex !== 0 && action.dieIndex !== 1) return fail();
      if (action.kind === 'nudge') {
        if (action.delta !== 1 && action.delta !== -1) {
          throw new Error('nudge needs delta 1 or -1');
        }
        const v = state.dice[action.dieIndex] + action.delta;
        if (v < 1 || v > 6) throw new Error(`nudge would push die to ${v}`);
      }
      return;
    }
    case 'ALLOCATE':
      if (state.phase !== 'allocate') fail();
      return;
    case 'CHOOSE_TARGET':
      if (state.phase !== 'chooseTarget') return fail();
      if (!legalTargets(state, state.current).includes(action.playerId)) {
        throw new Error(`seat ${action.playerId} is not a legal target`);
      }
      return;
    case 'ECHO_CHOICE':
      if (state.phase !== 'echoChoice') fail();
      return;
    case 'BUY': {
      if (state.phase !== 'buy') return fail();
      const me = state.players[state.current]!;
      const card = me.shop[action.shopIndex];
      if (!card) throw new Error(`nothing at shop index ${action.shopIndex}`);
      if (Math.max(0, card.cost - me.buyDiscount) > me.money) {
        throw new Error(`cannot afford ${card.id}`);
      }
      if (!card.legalSlots.includes(action.targetSlot)) {
        throw new Error(`slot ${action.targetSlot} is not legal for ${card.id}`);
      }
      return;
    }
    case 'BUY_MARKET': {
      if (state.phase !== 'buy') return fail();
      const me = state.players[state.current]!;
      const card = state.market[action.marketIndex];
      if (!card) throw new Error(`nothing at market index ${action.marketIndex}`);
      if (Math.max(0, card.cost - me.buyDiscount) > me.money) {
        throw new Error(`cannot afford ${card.id}`);
      }
      if (!card.legalSlots.includes(action.targetSlot)) {
        throw new Error(`slot ${action.targetSlot} is not legal for ${card.id}`);
      }
      return;
    }
    case 'FREEZE_SHOP': {
      if (state.phase !== 'buy') return fail();
      const me = state.players[state.current]!;
      const card = me.shop[action.shopIndex];
      if (!card) throw new Error(`nothing at shop index ${action.shopIndex}`);
      if (me.frozenShopIndex !== null) throw new Error('limit one frozen card');
      if (Math.max(0, card.cost - me.buyDiscount) <= me.money) {
        throw new Error(`you can afford ${card.id}; buy it instead of freezing`);
      }
      return;
    }
    case 'SKIP_BUY':
      if (state.phase !== 'buy') fail();
      return;
    case 'END_TURN':
      if (state.phase !== 'end') fail();
      return;
  }
}

/** Turn steps 3-4: allocate and drain the roller's actives. Draining pauses
 *  at an active chooseOpponent with several legal targets; the echo phase
 *  follows once actives finish. */
function allocate(state: GameState, mode: AllocationMode, rng: Rng): void {
  const dice = state.dice;
  if (!dice) throw new Error('no dice on the table');
  const roller = state.current;
  const rollerState = state.players[roller]!;
  const numbers = previewNumbers(dice, mode);
  state.lastAllocation = { mode, numbers };

  // Resolve the roller's actives only. Echoes come AFTER, in the echoChoice
  // phase, because every opponent decides for themselves how their stack
  // hears the roll (split dice or the sum) - the Space Base rule.
  const queue: QueuedEffect[] = [];
  for (const slot of numbers) {
    const card = rollerState.board[slot - 1];
    if (!card) throw new Error(`slot ${slot} has no card`);
    for (const effect of card.active) queue.push({ effect, owner: roller, echo: false });
  }
  state.pendingEffects = queue;
  if (drainQueue(state, rng)) finishResolution(state, rng);
}

function chooseTarget(state: GameState, playerId: number, rng: Rng): void {
  const queue = state.pendingEffects;
  const head = queue?.shift();
  if (!head || head.effect.kind !== 'damage') {
    throw new Error('no pending target choice'); // unreachable via assertLegal
  }
  damagePlayer(state, playerId, head.effect.amount);
  if (drainQueue(state, rng)) finishResolution(state, rng);
}

/** Applies queued effects until empty (true) or paused for a target (false). */
function drainQueue(state: GameState, rng: Rng): boolean {
  const queue = state.pendingEffects;
  if (!queue) return true;
  while (queue.length > 0) {
    if (state.winner !== null) break; // KO mid-queue ends everything
    const item = queue[0]!;
    if (state.players[item.owner]!.eliminated) {
      queue.shift(); // dead owners' remaining lines fizzle
      continue;
    }
    const eff = item.effect;
    if (eff.kind === 'conditional') {
      queue.shift();
      if (conditionHolds(state, eff.when, item.owner)) {
        queue.unshift(
          ...eff.then.map((effect) => ({ effect, owner: item.owner, echo: item.echo })),
        );
      }
      continue;
    }
    if (eff.kind === 'trade') {
      queue.shift();
      const owner = state.players[item.owner]!;
      if (owner.money >= eff.pay) {
        owner.money -= eff.pay;
        queue.unshift(
          ...eff.then.map((effect) => ({ effect, owner: item.owner, echo: item.echo })),
        );
      }
      continue;
    }
    if (eff.kind === 'damage' && eff.target === 'chooseOpponent' && !item.echo) {
      const targets = legalTargets(state, state.current);
      if (targets.length === 0) {
        queue.shift(); // nobody to hit
        continue;
      }
      if (targets.length > 1) {
        state.phase = 'chooseTarget'; // pause; head stays queued for CHOOSE_TARGET
        return false;
      }
      queue.shift();
      damagePlayer(state, targets[0]!, eff.amount); // single target: no pointless choice
      continue;
    }
    queue.shift();
    applyEffect(state, eff, { owner: item.owner, roller: state.current, echo: item.echo }, rng);
  }
  state.pendingEffects = null;
  return true;
}

/** Actives are done; hand the roll to the opponents' echo stacks. */
function finishResolution(state: GameState, rng: Rng): void {
  if (state.winner !== null) return;
  const roller = state.current;
  const seats: number[] = [];
  for (let offset = 1; offset < state.players.length; offset++) {
    const seat = (roller + offset) % state.players.length;
    if (!state.players[seat]!.eliminated) seats.push(seat);
  }
  state.echoPending = seats;
  processEchoQueue(state, rng);
}

/** Entry indices (with multiplicity) of a seat's echoes matched by `numbers`. */
function matchedEntries(state: GameState, seat: number, numbers: number[]): number[] {
  const out: number[] = [];
  const stack = state.players[seat]!.echoStack;
  for (const n of numbers) {
    stack.forEach((entry, idx) => {
      if (entry.slot === n) out.push(idx);
    });
  }
  return out;
}

/** Walks the echo queue: seats where the split/sum choice changes nothing are
 *  auto-resolved; the first seat with a real decision pauses in echoChoice. */
function processEchoQueue(state: GameState, rng: Rng): void {
  while (state.echoPending.length > 0) {
    if (state.winner !== null) {
      state.echoPending = [];
      return;
    }
    const dice = state.dice;
    if (!dice) throw new Error('echo phase with no dice');
    const seat = state.echoPending[0]!;
    const p = state.players[seat]!;
    if (p.eliminated || p.echoStack.length === 0) {
      state.echoPending.shift();
      continue;
    }
    const split = matchedEntries(state, seat, [dice[0], dice[1]]);
    const sum = matchedEntries(state, seat, [dice[0] + dice[1]]);
    if (split.length === 0 && sum.length === 0) {
      state.echoPending.shift();
      continue;
    }
    if (JSON.stringify(split) === JSON.stringify(sum)) {
      fireEchoesFor(state, seat, [dice[0], dice[1]], rng);
      state.echoPending.shift();
      continue;
    }
    state.phase = 'echoChoice'; // await ECHO_CHOICE from this seat
    return;
  }
  enterBuy(state, rng);
}

function fireEchoesFor(state: GameState, seat: number, numbers: number[], rng: Rng): void {
  state.echoNumbers[seat] = numbers;
  const queue: QueuedEffect[] = [];
  const stack = state.players[seat]!.echoStack;
  for (const n of numbers) {
    for (const entry of stack) {
      if (entry.slot !== n) continue;
      for (const effect of entry.def.echo) queue.push({ effect, owner: seat, echo: true });
    }
  }
  state.pendingEffects = queue;
  drainQueue(state, rng); // echo lines never pause (targets coerce to the roller)
}

function enterBuy(state: GameState, rng: Rng): void {
  if (state.winner !== null) return;
  state.phase = 'buy';
  // Echo damage (or self-damage) can eliminate the roller mid-turn.
  if (state.players[state.current]!.eliminated) endTurn(state, rng);
}

/** Turn step 7: win checks, then pass to the next living seat, whose shop
 *  row refreshes at their turn start. */
function endTurn(state: GameState, rng: Rng): void {
  // Points win is checked at end of turn (PLAN section 2). Echoes can push
  // several players over at once; highest points wins, HP then seat break ties.
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
    // Failsafe: highest points among the living, HP then seat break ties.
    const ranked = state.players
      .map((p, seat) => ({ p, seat }))
      .filter((x) => !x.p.eliminated)
      .sort((a, b) => b.p.points - a.p.points || b.p.hp - a.p.hp || a.seat - b.seat);
    const survivor = ranked[0];
    if (!survivor) throw new Error('no living players at failsafe');
    state.winner = survivor.seat;
    state.winReason = 'failsafe';
    return;
  }

  state.players[state.current]!.buyDiscount = 0; // discounts are turn-scoped
  if (wrapped) state.round += 1;
  state.current = nextSeat;
  state.phase = 'roll';
  state.dice = null;
  state.lastAllocation = null;
  state.echoPending = [];
  state.echoNumbers = state.players.map(() => null);
  dealRow(state, nextSeat, rng); // "entire row refreshes at the start of that player's turn"
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
