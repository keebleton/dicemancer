import type { CardDef, Effect } from '../engine/types';

// PLAN.md section 4 starter table. Identical for every seat in MVP;
// color-flavored starters are v2 polish.
function starterActive(slot: number): Effect[] {
  if (slot <= 6) return [{ kind: 'gainMoney', amount: 1 }];
  if (slot <= 9) return [{ kind: 'gainMoney', amount: 2 }];
  if (slot <= 11) return [{ kind: 'gainMoney', amount: 3 }];
  return [
    { kind: 'gainMoney', amount: 2 },
    { kind: 'gainPoints', amount: 1 },
  ];
}

function starterDef(slot: number): CardDef {
  return {
    id: `starter-${slot}`,
    name: `Starter ${slot}`,
    color: 'starter',
    rarity: 'starter',
    cost: 0,
    legalSlots: [slot],
    active: starterActive(slot),
    echo: [{ kind: 'gainMoney', amount: 1 }],
  };
}

/** Fresh copies each call; index i is the card for slot i+1. */
export function starterBoard(): CardDef[] {
  return Array.from({ length: 12 }, (_, i) => starterDef(i + 1));
}
