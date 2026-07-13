import type { Effect, GameState } from './types';

export interface EffectContext {
  /** Seat whose card produced the effect; gains (money/points/heal/tokens) land here. */
  owner: number;
  /** The active player this turn; damage with target 'roller' lands here. */
  roller: number;
}

/** Interprets effect lines. Mutates state in place; callers operate on the
 *  cloned state applyAction created. Phase 1 implements what starter-only
 *  games (and their tests) exercise; the remaining primitives throw loudly
 *  so Phase 2 cannot silently no-op them. */
export function applyEffects(state: GameState, effects: Effect[], ctx: EffectContext): void {
  for (const effect of effects) {
    applyEffect(state, effect, ctx);
  }
}

function applyEffect(state: GameState, effect: Effect, ctx: EffectContext): void {
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
    case 'damage': {
      if (effect.target === 'chooseOpponent') {
        throw new Error('damage(chooseOpponent) needs the CHOOSE_TARGET flow: Phase 2');
      }
      const roller = state.players[ctx.roller];
      if (!roller) throw new Error(`no player at seat ${ctx.roller}`);
      if (roller.eliminated) break; // eliminated players are untargetable; late echo damage fizzles
      roller.hp = Math.max(0, roller.hp - effect.amount);
      if (roller.hp === 0) roller.eliminated = true; // elimination is immediate (PLAN section 2)
      break;
    }
    case 'refreshShop':
      throw new Error('refreshShop needs the shop: Phase 2');
    case 'conditional':
      throw new Error('conditional effects land with the full interpreter: Phase 2');
  }
}
