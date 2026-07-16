import { hasRelic, pointLeaderPoints } from './relics';
import { dealRow } from './shop';
import type { ConditionalWhen, Effect, GameState, Rng } from './types';

export interface EffectContext {
  /** Seat whose card produced the effect; gains land here. */
  owner: number;
  /** The active player this turn. */
  roller: number;
  /** True when the effect comes from an Echo Stack: damage is coerced onto the roller. */
  echo: boolean;
}

/** Damage + immediate elimination + last-player-standing check, shared by
 *  every damage path (roller-targeted, chosen, auto-chosen). The attacker
 *  seat feeds the combat relics (Assassin's Mark, Vampiric Chalice); the
 *  victim's Iron Aegis blunts the first hit each round. */
export function damagePlayer(
  state: GameState,
  seat: number,
  amount: number,
  attacker?: number,
): void {
  const victim = state.players[seat];
  if (!victim) throw new Error(`no player at seat ${seat}`);
  if (victim.eliminated) return; // untargetable; late damage fizzles

  let dealt = amount;
  const striker = attacker !== undefined ? state.players[attacker] : undefined;
  if (striker && attacker !== seat && hasRelic(striker, 'assassins-mark')) {
    const leader = pointLeaderPoints(state);
    if (victim.points >= leader && leader > 0) dealt += 1;
  }
  if (hasRelic(victim, 'iron-aegis') && !victim.relicUsed['iron-aegis']) {
    victim.relicUsed['iron-aegis'] = 1;
    dealt = Math.max(0, dealt - 2);
  }
  if (striker && attacker !== seat && dealt > 0 && hasRelic(striker, 'vampiric-chalice')) {
    striker.hp = Math.min(state.tunables.startingHp, striker.hp + 1);
  }

  victim.hp = Math.max(0, victim.hp - dealt);
  if (victim.hp === 0) {
    victim.eliminated = true; // elimination is immediate (PLAN section 2)
    checkKo(state);
  }
}

/** Money moves from victim to thief, capped by the victim's purse. */
export function stealMoney(state: GameState, victim: number, thief: number, amount: number): void {
  const from = state.players[victim];
  const to = state.players[thief];
  if (!from || !to || from.eliminated) return;
  const moved = Math.min(from.money, amount);
  from.money -= moved;
  to.money += moved;
}

/** Last player standing wins the moment everyone else is eliminated. */
export function checkKo(state: GameState): void {
  if (state.winner !== null) return;
  const living = state.players.map((p, seat) => ({ p, seat })).filter((x) => !x.p.eliminated);
  if (living.length === 1 && living[0]) {
    state.winner = living[0].seat;
    state.winReason = 'ko';
  }
}

export function conditionHolds(state: GameState, when: ConditionalWhen, owner: number): boolean {
  const dice = state.dice;
  if (when.sumAtLeast !== undefined) {
    if (!dice || dice[0] + dice[1] < when.sumAtLeast) return false;
  }
  if (when.allocatedIndividually !== undefined) {
    if ((state.lastAllocation?.mode === 'individual') !== when.allocatedIndividually) return false;
  }
  if (when.hpAtOrBelow !== undefined) {
    const p = state.players[owner];
    if (!p || p.hp > when.hpAtOrBelow) return false;
  }
  if (when.rolledDoubles !== undefined) {
    if (!dice || (dice[0] === dice[1]) !== when.rolledDoubles) return false;
  }
  if (when.bothDiceOdd !== undefined) {
    if (!dice || (dice[0] % 2 === 1 && dice[1] % 2 === 1) !== when.bothDiceOdd) return false;
  }
  if (when.bothDiceEven !== undefined) {
    if (!dice || (dice[0] % 2 === 0 && dice[1] % 2 === 0) !== when.bothDiceEven) return false;
  }
  if (when.echoStackAtLeast !== undefined) {
    const p = state.players[owner];
    if (!p || p.echoStack.length < when.echoStackAtLeast) return false;
  }
  return true;
}

/** Applies one non-pausing effect. chooseOpponent damage in an ACTIVE line is
 *  intercepted by the resolution queue before reaching here (it may pause);
 *  in an echo line it always hits the roller. Conditionals are unwrapped by
 *  the queue too (their branches may themselves pause). */
export function applyEffect(
  state: GameState,
  effect: Effect,
  ctx: EffectContext,
  rng: Rng,
): void {
  const owner = state.players[ctx.owner];
  if (!owner) throw new Error(`no player at seat ${ctx.owner}`);
  switch (effect.kind) {
    case 'gainMoney':
      owner.money += effect.amount;
      break;
    case 'gainPoints':
      owner.points += effect.amount;
      break;
    case 'heal':
      // Max HP is starting HP; the spec defines no overheal.
      owner.hp = Math.min(state.tunables.startingHp, owner.hp + effect.amount);
      break;
    case 'gainToken':
      owner.tokens[effect.token] += effect.amount;
      break;
    case 'damage':
      if (effect.target === 'chooseOpponent' && !ctx.echo) {
        throw new Error('active chooseOpponent damage must resolve through the queue');
      }
      // target 'roller', or echo-coerced chooseOpponent: both hit the roller.
      damagePlayer(state, ctx.roller, effect.amount, ctx.owner);
      break;
    case 'refreshShop':
      dealRow(state, ctx.owner, rng);
      break;
    case 'discount':
      owner.buyDiscount += effect.amount;
      break;
    case 'steal':
      if (effect.target === 'chooseOpponent' && !ctx.echo) {
        throw new Error('active chooseOpponent steal must resolve through the queue');
      }
      // target 'roller', or echo-coerced chooseOpponent: rob the roller.
      stealMoney(state, ctx.roller, ctx.owner, effect.amount);
      break;
    case 'swapBoard': {
      const i = effect.a - 1;
      const j = effect.b - 1;
      const cardA = owner.board[i];
      const cardB = owner.board[j];
      if (!cardA || !cardB) break; // malformed slots: fizzle
      owner.board[i] = cardB;
      owner.board[j] = cardA;
      const chargeA = owner.charges[i] ?? 0;
      owner.charges[i] = owner.charges[j] ?? 0;
      owner.charges[j] = chargeA;
      break;
    }
    case 'winGame':
      if (state.winner === null) {
        state.winner = ctx.owner;
        state.winReason = 'card';
      }
      break;
    case 'trade':
      throw new Error('trades must be unwrapped by the resolution queue');
    case 'conditional':
      throw new Error('conditionals must be unwrapped by the resolution queue');
    case 'charge':
      throw new Error('charges must be unwrapped by the resolution queue');
  }
}
