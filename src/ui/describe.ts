// Presentation-only text helpers. No rules here: everything is read off data.
import type { Action, ConditionalWhen, Effect, GameState } from '../engine';

function condText(when: ConditionalWhen): string {
  const parts: string[] = [];
  if (when.sumAtLeast !== undefined) parts.push(`sum >= ${when.sumAtLeast}`);
  if (when.allocatedIndividually !== undefined) {
    parts.push(when.allocatedIndividually ? 'split dice' : 'took sum');
  }
  if (when.hpAtOrBelow !== undefined) parts.push(`hp <= ${when.hpAtOrBelow}`);
  if (when.rolledDoubles !== undefined) parts.push(when.rolledDoubles ? 'doubles' : 'no doubles');
  if (when.bothDiceOdd !== undefined) parts.push('both dice odd');
  if (when.bothDiceEven !== undefined) parts.push('both dice even');
  if (when.echoStackAtLeast !== undefined) parts.push(`${when.echoStackAtLeast}+ echoes`);
  return parts.join(' & ') || 'always';
}

export function fxText(e: Effect): string {
  switch (e.kind) {
    case 'gainMoney':
      return `+${e.amount} money`;
    case 'gainPoints':
      return `+${e.amount} pt`;
    case 'damage':
      return `${e.amount} dmg (${e.target === 'roller' ? 'roller' : 'choose foe'})`;
    case 'heal':
      return `heal ${e.amount}`;
    case 'gainToken':
      return `+${e.amount} ${e.token} token`;
    case 'refreshShop':
      return 'refresh shop';
    case 'discount':
      return `next buy costs ${e.amount} less`;
    case 'trade':
      return `pay ${e.pay} money: ${e.then.map(fxText).join(', ')}`;
    case 'conditional':
      return `if ${condText(e.when)}: ${e.then.map(fxText).join(', ')}`;
  }
}

export function fxList(list: Effect[]): string {
  return list.map(fxText).join(', ') || '-';
}

/** Log lines for one dispatched action: what happened + resource diffs. */
export function describeTransition(prev: GameState, action: Action, next: GameState): string[] {
  const who = prev.players[prev.current]!.name;
  const lines: string[] = [];
  switch (action.type) {
    case 'ROLL':
      lines.push(`${who} rolls ${next.dice![0]} + ${next.dice![1]}`);
      break;
    case 'SPEND_TOKEN':
      lines.push(`${who} spends a ${action.kind} token: dice now ${next.dice![0]} + ${next.dice![1]}`);
      break;
    case 'ALLOCATE':
      lines.push(
        action.mode === 'sum'
          ? `${who} takes the sum (slot ${next.lastAllocation?.numbers[0]})`
          : `${who} splits the dice (slots ${next.lastAllocation?.numbers.join(' + ')})`,
      );
      break;
    case 'CHOOSE_TARGET':
      lines.push(`${who} targets ${prev.players[action.playerId]!.name}`);
      break;
    case 'ECHO_CHOICE': {
      const seat = prev.echoPending[0];
      if (seat !== undefined) {
        const numbers = next.echoNumbers[seat] ?? [];
        lines.push(`${prev.players[seat]!.name} hears ${numbers.join(' + ')} for echoes`);
      }
      break;
    }
    case 'BUY': {
      const card = prev.players[prev.current]!.shop[action.shopIndex];
      lines.push(`${who} buys ${card?.name ?? '?'} into slot ${action.targetSlot}`);
      break;
    }
    case 'BUY_MARKET': {
      const card = prev.market[action.marketIndex];
      lines.push(`${who} buys ${card?.name ?? '?'} from the MARKET into slot ${action.targetSlot}`);
      break;
    }
    case 'FREEZE_SHOP': {
      const frozeNow = next.players[prev.current]!.shopFrozen;
      lines.push(
        frozeNow
          ? `${who} freezes their shop (no new cards until unfrozen)`
          : `${who} unfreezes their shop`,
      );
      break;
    }
    case 'SKIP_BUY':
      lines.push(`${who} skips the shop`);
      break;
    case 'END_TURN':
      break;
  }
  next.players.forEach((p, i) => {
    const q = prev.players[i]!;
    const d: string[] = [];
    if (p.hp !== q.hp) d.push(`hp ${q.hp}->${p.hp}`);
    if (p.money !== q.money) d.push(`money ${q.money}->${p.money}`);
    if (p.points !== q.points) d.push(`points ${q.points}->${p.points}`);
    if (p.eliminated && !q.eliminated) d.push('ELIMINATED');
    if (d.length > 0) lines.push(`   ${p.name}: ${d.join(', ')}`);
  });
  if (next.winner !== null && prev.winner === null) {
    lines.push(`*** ${next.players[next.winner]!.name} wins (${next.winReason}) ***`);
  }
  return lines;
}
