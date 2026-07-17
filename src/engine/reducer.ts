import { applyEffect, conditionHolds, damagePlayer, stealMoney } from './effects';
import { MAX_RELICS, RELIC_BY_ID, hasRelic } from './relics';
import { rollDie } from './rng';
import { dealRow, refillMarketSlot } from './shop';
import type { Action, AllocationMode, CardDef, GameState, PlayerState, QueuedEffect, Rng } from './types';

/** What a card costs THIS buyer right now (discount effects + relics). */
export function buyCost(me: PlayerState, card: CardDef): number {
  const relicOff = me.relics.includes('collectors-case') ? 1 : 0;
  return Math.max(0, card.cost - me.buyDiscount - relicOff);
}

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
        if (hasRelic(me, 'loaded-die') && !me.relicUsed['loaded-die']) {
          for (const dieIndex of [0, 1] as const) {
            for (let face = 1; face <= 6; face++) {
              if (face !== dice[dieIndex]) actions.push({ type: 'SET_DIE', dieIndex, face });
            }
          }
        }
        if (hasRelic(me, 'destiny-stone') && !me.relicUsed['destiny-stone']) {
          actions.push({ type: 'REROLL_BOTH' });
        }
      }
      return actions;
    }
    case 'chooseTarget':
      return legalTargets(state, state.current).map((seat) => ({
        type: 'CHOOSE_TARGET',
        playerId: seat,
      }));
    case 'tradeChoice':
      return [
        { type: 'TRADE_CHOICE', accept: true },
        { type: 'TRADE_CHOICE', accept: false },
      ];
    case 'echoChoice':
      // Legacy sequential phase (stale saves only): the head seat chooses.
      return [
        { type: 'ECHO_CHOICE', mode: 'individual', seat: state.echoPending[0] },
        { type: 'ECHO_CHOICE', mode: 'sum', seat: state.echoPending[0] },
      ];
    case 'buy': {
      const actions: Action[] = [{ type: 'SKIP_BUY' }, ...echoChoiceActions(state)];
      if (me.shop.length > 0) actions.push({ type: 'FREEZE_SHOP' }); // toggle
      me.shop.forEach((card, shopIndex) => {
        if (!card || buyCost(me, card) > me.money) return;
        for (const targetSlot of card.legalSlots) {
          actions.push({ type: 'BUY', shopIndex, targetSlot });
        }
      });
      state.market.forEach((card, marketIndex) => {
        if (!card || buyCost(me, card) > me.money) return;
        for (const targetSlot of card.legalSlots) {
          actions.push({ type: 'BUY_MARKET', marketIndex, targetSlot });
        }
      });
      if (me.relics.length < MAX_RELICS) {
        state.reliquary.forEach((id, index) => {
          const def = id ? RELIC_BY_ID[id] : undefined;
          if (!def || def.cost > me.money || hasRelic(me, def.id)) return;
          if (def.needsSlotPick) {
            for (let slotPick = 1; slotPick <= 12; slotPick++) {
              actions.push({ type: 'BUY_RELIC', index, slotPick });
            }
          } else {
            actions.push({ type: 'BUY_RELIC', index });
          }
        });
      }
      return actions;
    }
    case 'end': {
      // Every echo hearing must land before the turn can close.
      const actions: Action[] = echoChoiceActions(state);
      if (state.echoPending.length === 0) actions.push({ type: 'END_TURN' });
      return actions;
    }
  }
}

/** Pending echo hearings: any owed seat may answer at any time during the
 *  roller's buy/end phases (concurrent, unordered). */
function echoChoiceActions(state: GameState): Action[] {
  const out: Action[] = [];
  for (const seat of state.echoPending) {
    out.push({ type: 'ECHO_CHOICE', mode: 'individual', seat });
    out.push({ type: 'ECHO_CHOICE', mode: 'sum', seat });
  }
  return out;
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
      const seat = action.seat ?? next.echoPending[0]!;
      const legacy = next.phase === 'echoChoice';
      fireEchoesFor(next, seat, previewNumbers(next.dice!, action.mode), rng);
      next.echoPending = next.echoPending.filter((s) => s !== seat);
      if (legacy) {
        // Stale save from the sequential era: walk the rest concurrently.
        processEchoQueue(next, rng);
      } else if (next.winner === null && next.players[next.current]!.eliminated) {
        endTurn(next, rng); // echo damage KO'd the roller mid-buy
      }
      break;
    }
    case 'TRADE_CHOICE':
      tradeChoice(next, action.accept, rng);
      break;
    case 'BUY': {
      const me = next.players[next.current]!;
      const card = me.shop[action.shopIndex]!;
      me.shop[action.shopIndex] = null; // a frozen shop keeps this hole
      installCard(next, card, action.targetSlot);
      break;
    }
    case 'BUY_MARKET': {
      const card = next.market[action.marketIndex]!;
      refillMarketSlot(next, action.marketIndex); // first come, first served
      installCard(next, card, action.targetSlot);
      // Magnet Stone: everyone else with the relic taxes the transaction.
      next.players.forEach((p, seat) => {
        if (seat !== next.current && !p.eliminated && hasRelic(p, 'magnet-stone')) p.money += 2;
      });
      break;
    }
    case 'FREEZE_SHOP': {
      const me = next.players[next.current]!;
      me.shopFrozen = !me.shopFrozen;
      break; // phase stays 'buy': freezing is not the turn's purchase
    }
    case 'BUY_RELIC': {
      const me = next.players[next.current]!;
      const id = next.reliquary[action.index]!;
      me.money -= RELIC_BY_ID[id]!.cost;
      me.relics.push(id);
      if (action.slotPick !== undefined) me.relicPicks[id] = action.slotPick;
      next.reliquary[action.index] = next.relicDeck.shift() ?? null;
      break; // phase stays 'buy': relics never consume the card purchase
    }
    case 'SET_DIE': {
      const me = next.players[next.current]!;
      next.dice![action.dieIndex] = action.face;
      me.relicUsed['loaded-die'] = 1;
      break;
    }
    case 'REROLL_BOTH': {
      const me = next.players[next.current]!;
      next.dice = [rollDie(rng), rollDie(rng)];
      me.relicUsed['destiny-stone'] = 1;
      break;
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
  me.money -= buyCost(me, card);
  me.buyDiscount = 0; // the discount rode this buy
  const displaced = me.board[targetSlot - 1]!;
  me.echoStack.push({ def: displaced, slot: targetSlot });
  if (hasRelic(me, 'grave-lantern')) me.points += 2; // honored retirement
  me.board[targetSlot - 1] = card;
  me.charges[targetSlot - 1] = 0; // a fresh card starts uncharged
  // Merchant Crown: no buy limit, the phase stays open.
  state.phase = hasRelic(me, 'merchant-crown') ? 'buy' : 'end';
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
    case 'ECHO_CHOICE': {
      if (state.phase === 'echoChoice') return; // legacy sequential path
      if (state.phase !== 'buy' && state.phase !== 'end') return fail();
      const seat = action.seat;
      if (seat === undefined || !state.echoPending.includes(seat)) {
        throw new Error('no echo choice pending for that seat');
      }
      return;
    }
    case 'TRADE_CHOICE': {
      if (state.phase !== 'tradeChoice') return fail();
      const head = state.pendingEffects?.[0];
      if (!head || head.effect.kind !== 'trade') throw new Error('no pending trade');
      return;
    }
    case 'BUY': {
      if (state.phase !== 'buy') return fail();
      const me = state.players[state.current]!;
      const card = me.shop[action.shopIndex];
      if (!card) throw new Error(`nothing at shop index ${action.shopIndex}`);
      if (buyCost(me, card) > me.money) {
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
      if (buyCost(me, card) > me.money) {
        throw new Error(`cannot afford ${card.id}`);
      }
      if (!card.legalSlots.includes(action.targetSlot)) {
        throw new Error(`slot ${action.targetSlot} is not legal for ${card.id}`);
      }
      return;
    }
    case 'BUY_RELIC': {
      if (state.phase !== 'buy') return fail();
      const me = state.players[state.current]!;
      const id = state.reliquary[action.index];
      const def = id ? RELIC_BY_ID[id] : undefined;
      if (!def) throw new Error(`nothing at reliquary index ${action.index}`);
      if (def.cost > me.money) throw new Error(`cannot afford ${def.id}`);
      if (me.relics.length >= MAX_RELICS) throw new Error('relic slots are full');
      if (hasRelic(me, def.id)) throw new Error(`already own ${def.id}`);
      if (def.needsSlotPick) {
        if (
          action.slotPick === undefined
          || action.slotPick < 1
          || action.slotPick > 12
        ) {
          throw new Error(`${def.id} needs a slot pick 1-12`);
        }
      }
      return;
    }
    case 'SET_DIE': {
      if (state.phase !== 'allocate' || !state.dice) return fail();
      const me = state.players[state.current]!;
      if (!hasRelic(me, 'loaded-die')) throw new Error('no Loaded Die relic');
      if (me.relicUsed['loaded-die']) throw new Error('Loaded Die already used this turn');
      if (action.face < 1 || action.face > 6) throw new Error(`bad die face ${action.face}`);
      return;
    }
    case 'REROLL_BOTH': {
      if (state.phase !== 'allocate' || !state.dice) return fail();
      const me = state.players[state.current]!;
      if (!hasRelic(me, 'destiny-stone')) throw new Error('no Destiny Stone relic');
      if (me.relicUsed['destiny-stone']) throw new Error('Destiny Stone already used this turn');
      return;
    }
    case 'FREEZE_SHOP': {
      if (state.phase !== 'buy') return fail();
      if (state.players[state.current]!.shop.length === 0) {
        throw new Error('no shop to freeze in this game');
      }
      return;
    }
    case 'SKIP_BUY':
      if (state.phase !== 'buy') fail();
      return;
    case 'END_TURN':
      if (state.phase !== 'end') return fail();
      if (state.echoPending.length > 0) {
        throw new Error('waiting for echo choices before the turn can end');
      }
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

  // Relic hooks widen the fire list. Weighted Dice: doubles fire each hit
  // slot one extra time. Wildcard Sleeve: the picked slot also fires when
  // the OTHER interpretation of the roll would have hit it.
  const fireList = [...numbers];
  if (hasRelic(rollerState, 'weighted-dice') && dice[0] === dice[1]) {
    fireList.push(...new Set(numbers));
  }
  const sleevePick = hasRelic(rollerState, 'wildcard-sleeve')
    ? rollerState.relicPicks['wildcard-sleeve']
    : undefined;
  if (sleevePick !== undefined && !fireList.includes(sleevePick)) {
    const other = previewNumbers(dice, mode === 'individual' ? 'sum' : 'individual');
    if (other.includes(sleevePick)) fireList.push(sleevePick);
  }
  state.lastAllocation = { mode, numbers: fireList };

  // Resolve the roller's actives only. Echoes come AFTER, in the echoChoice
  // phase, because every opponent decides for themselves how their stack
  // hears the roll (split dice or the sum) - the Space Base rule.
  const prismPick = hasRelic(rollerState, 'echo-prism')
    ? rollerState.relicPicks['echo-prism']
    : undefined;
  const queue: QueuedEffect[] = [];
  for (const slot of fireList) {
    const card = rollerState.board[slot - 1];
    if (!card) throw new Error(`slot ${slot} has no card`);
    const repeats = slot === prismPick ? 2 : 1; // Echo Prism doubles its slot
    for (let r = 0; r < repeats; r++) {
      for (const effect of card.active) queue.push({ effect, owner: roller, echo: false, slot });
    }
  }
  state.pendingEffects = queue;
  if (drainQueue(state, rng)) finishResolution(state, rng);
}

/** Resolve a paused trade: pay and unshift the payoff, or walk away. */
function tradeChoice(state: GameState, accept: boolean, rng: Rng): void {
  const queue = state.pendingEffects;
  const head = queue?.shift();
  if (!head || head.effect.kind !== 'trade') {
    throw new Error('no pending trade choice'); // unreachable via assertLegal
  }
  if (accept) {
    const owner = state.players[head.owner]!;
    const pay = hasRelic(owner, 'bottomless-purse')
      ? Math.max(1, head.effect.pay - 1)
      : head.effect.pay;
    owner.money -= pay;
    queue!.unshift(
      ...head.effect.then.map((effect) => ({
        effect,
        owner: head.owner,
        echo: head.echo,
        slot: head.slot,
      })),
    );
  }
  if (drainQueue(state, rng)) finishResolution(state, rng);
}

function chooseTarget(state: GameState, playerId: number, rng: Rng): void {
  const queue = state.pendingEffects;
  const head = queue?.shift();
  if (!head || (head.effect.kind !== 'damage' && head.effect.kind !== 'steal')) {
    throw new Error('no pending target choice'); // unreachable via assertLegal
  }
  if (head.effect.kind === 'damage') damagePlayer(state, playerId, head.effect.amount, head.owner);
  else stealMoney(state, playerId, head.owner, head.effect.amount);
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
          ...eff.then.map((effect) => ({ effect, owner: item.owner, echo: item.echo, slot: item.slot })),
        );
      }
      continue;
    }
    if (eff.kind === 'trade') {
      const owner = state.players[item.owner]!;
      // Bottomless Purse relic: trades cost 1 less (minimum 1).
      const pay = hasRelic(owner, 'bottomless-purse') ? Math.max(1, eff.pay - 1) : eff.pay;
      if (!item.echo && owner.money >= pay) {
        // Your own fired trade asks for consent: pay or keep the money
        // (Jake: yellow was getting its funds drained without a choice).
        state.phase = 'tradeChoice'; // pause; head stays queued for TRADE_CHOICE
        return false;
      }
      queue.shift();
      // Echo-line trades stay automatic: they fire on other players' turns
      // and pausing every opponent roll would grind the table.
      if (item.echo && owner.money >= pay) {
        owner.money -= pay;
        queue.unshift(
          ...eff.then.map((effect) => ({ effect, owner: item.owner, echo: item.echo, slot: item.slot })),
        );
      }
      continue;
    }
    if (eff.kind === 'charge') {
      queue.shift();
      const idx = (item.slot ?? 0) - 1;
      const owner = state.players[item.owner]!;
      if (idx >= 0 && idx < 12) {
        owner.charges[idx] = (owner.charges[idx] ?? 0) + 1;
        if (owner.charges[idx]! >= eff.need) {
          owner.charges[idx] = 0; // the counter resets and the payoff fires
          queue.unshift(
            ...eff.then.map((effect) => ({ effect, owner: item.owner, echo: item.echo, slot: item.slot })),
          );
        }
      }
      continue;
    }
    if (
      (eff.kind === 'damage' || eff.kind === 'steal')
      && eff.target === 'chooseOpponent'
      && !item.echo
    ) {
      const targets = legalTargets(state, state.current);
      if (targets.length === 0) {
        queue.shift(); // nobody to hit
        continue;
      }
      if (targets.length > 1) {
        state.phase = 'chooseTarget'; // pause; head stays queued for CHOOSE_TARGET
        return false;
      }
      queue.shift(); // single target: no pointless choice
      if (eff.kind === 'damage') damagePlayer(state, targets[0]!, eff.amount, item.owner);
      else stealMoney(state, targets[0]!, item.owner, eff.amount);
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
  // Resonant Bell: the roller's own echoes hear their roll too (they choose
  // last, after the opponents).
  if (hasRelic(state.players[roller]!, 'resonant-bell')) seats.push(roller);
  state.echoPending = seats;
  processEchoQueue(state, rng);
}

/** Entry indices (with multiplicity) of a seat's echoes matched by `numbers`.
 *  With the highEchoHearsSum rule, echoes in slots 7-12 also match the roll's
 *  sum even when it is not among the chosen numbers. */
function matchedEntries(state: GameState, seat: number, numbers: number[]): number[] {
  const out: number[] = [];
  const stack = state.players[seat]!.echoStack;
  for (const n of numbers) {
    stack.forEach((entry, idx) => {
      if (entry.slot === n) out.push(idx);
    });
  }
  const dice = state.dice;
  if (state.tunables.highEchoHearsSum && dice) {
    const sum = dice[0] + dice[1];
    if (sum >= 7 && !numbers.includes(sum)) {
      stack.forEach((entry, idx) => {
        if (entry.slot === sum) out.push(idx);
      });
    }
  }
  return out;
}

/** Walks the echo queue: seats where the split/sum choice changes nothing
 *  auto-resolve NOW; seats with a real decision STAY in echoPending and
 *  answer concurrently with the roller's buy phase. The roller never waits
 *  to shop, but END_TURN holds until every hearing lands. */
function processEchoQueue(state: GameState, rng: Rng): void {
  const keep: number[] = [];
  for (const seat of [...state.echoPending]) {
    if (state.winner !== null) {
      state.echoPending = [];
      return;
    }
    const dice = state.dice;
    if (!dice) throw new Error('echo phase with no dice');
    const p = state.players[seat]!;
    if (p.eliminated || p.echoStack.length === 0) continue;
    const split = matchedEntries(state, seat, [dice[0], dice[1]]);
    const sum = matchedEntries(state, seat, [dice[0] + dice[1]]);
    if (split.length === 0 && sum.length === 0) continue;
    if (JSON.stringify(split) === JSON.stringify(sum)) {
      fireEchoesFor(state, seat, [dice[0], dice[1]], rng);
      continue;
    }
    keep.push(seat);
  }
  state.echoPending = keep;
  enterBuy(state, rng);
}

function fireEchoesFor(state: GameState, seat: number, numbers: number[], rng: Rng): void {
  const queue: QueuedEffect[] = [];
  const stack = state.players[seat]!.echoStack;
  for (const n of numbers) {
    for (const entry of stack) {
      if (entry.slot !== n) continue;
      for (const effect of entry.def.echo) {
        queue.push({ effect, owner: seat, echo: true, slot: entry.slot });
      }
    }
  }
  const heard = [...numbers];
  const dice = state.dice;
  if (state.tunables.highEchoHearsSum && dice) {
    const sum = dice[0] + dice[1];
    if (sum >= 7 && !numbers.includes(sum)) {
      let matched = false;
      for (const entry of stack) {
        if (entry.slot !== sum) continue;
        matched = true;
        for (const effect of entry.def.echo) queue.push({ effect, owner: seat, echo: true });
      }
      if (matched) heard.push(sum);
    }
  }
  // Chorus Amplifier relic: every heard roll pays a bonus on top.
  if (queue.length > 0 && hasRelic(state.players[seat]!, 'chorus-amplifier')) {
    queue.push({ effect: { kind: 'gainMoney', amount: 1 }, owner: seat, echo: true });
    queue.push({ effect: { kind: 'gainPoints', amount: 1 }, owner: seat, echo: true });
  }
  state.echoNumbers[seat] = heard;
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
  // Golden Scales relic: overflow coins convert BEFORE the points-win check,
  // so a big enough hoard can close the game right here.
  const leaver = state.players[state.current]!;
  if (hasRelic(leaver, 'golden-scales') && leaver.money > 15) {
    const converted = Math.floor((leaver.money - 15) / 3);
    leaver.money -= converted * 3;
    leaver.points += converted;
  }

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

  // Chrono Anchor relic: instead of passing the turn, the anchor is spent
  // and the same player goes again (a fresh turn: shop refresh, turn-start
  // relics, the works).
  if (hasRelic(leaver, 'chrono-anchor') && !leaver.eliminated) {
    leaver.relics = leaver.relics.filter((id) => id !== 'chrono-anchor');
    leaver.buyDiscount = 0;
    startTurnFor(state, state.current, rng);
    return;
  }

  const nextSeat = nextLiving(state, state.current);
  const wrapped = nextSeat <= state.current;

  if (wrapped && state.tunables.roundCap > 0 && state.round >= state.tunables.roundCap) {
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
  startTurnFor(state, nextSeat, rng);
}

/** Everything that happens when a seat's turn begins: board reset, shop
 *  refresh, and turn-start relics (usage flags, hourglass, ledger). */
function startTurnFor(state: GameState, seat: number, rng: Rng): void {
  state.current = seat;
  state.phase = 'roll';
  state.dice = null;
  state.lastAllocation = null;
  state.echoPending = [];
  state.echoNumbers = state.players.map(() => null);
  const p = state.players[seat]!;
  p.relicUsed = {}; // loaded die, destiny stone, iron aegis reset here
  if (hasRelic(p, 'fates-hourglass')) p.tokens.reroll += 1;
  if (hasRelic(p, 'interest-ledger')) p.money += Math.floor(p.money / 5);
  dealRow(state, seat, rng); // "entire row refreshes at the start of that player's turn"
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
