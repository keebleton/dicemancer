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
 *  every damage path (roller-targeted, chosen, auto-chosen). */
export function damagePlayer(state: GameState, seat: number, amount: number): void {
  const victim = state.players[seat];
  if (!victim) throw new Error(`no player at seat ${seat}`);
  if (victim.eliminated) return; // untargetable; late damage fizzles
  victim.hp = Math.max(0, victim.hp - amount);
  if (victim.hp === 0) {
    victim.eliminated = true; // elimination is immediate (PLAN section 2)
    checkKo(state);
  }
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
  if (when.sumAtLeast !== undefined) {
    const dice = state.dice;
    if (!dice || dice[0] + dice[1] < when.sumAtLeast) return false;
  }
  if (when.allocatedIndividually !== undefined) {
    if ((state.lastAllocation?.mode === 'individual') !== when.allocatedIndividually) return false;
  }
  if (when.hpAtOrBelow !== undefined) {
    const p = state.players[owner];
    if (!p || p.hp > when.hpAtOrBelow) return false;
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
      damagePlayer(state, ctx.roller, effect.amount);
      break;
    case 'refreshShop':
      dealRow(state, ctx.owner, rng);
      break;
    case 'conditional':
      throw new Error('conditionals must be unwrapped by the resolution queue');
  }
}
