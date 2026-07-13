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

// Jake's icon picks (2026-07-13), rescued from his Card Lab session.
const STARTER_ICONS: Record<number, string> = {
  1: 'INV_Inscription_DarkmoonCard_Indomitable_Grey.PNG',
  2: 'INV_Inscription_DarkmoonCard_Putrescence_Grey.PNG',
  3: 'INV_Inscription_DarkmoonCard_Repose_Grey.PNG',
  4: 'INV_Inscription_DarkmoonCard_Voracity_Grey.PNG',
  5: 'INV_Inscription_Tarot_6oHealerCard.PNG',
  6: 'INV_Inscription_Tarot_6oMageCard.PNG',
  7: 'INV_Inscription_Tarot_6oMeleeCard.PNG',
  8: 'INV_Inscription_Tarot_6oTankCard.PNG',
  9: 'INV_Inscription_Tarot_EarthquakeCard.PNG',
  10: 'INV_Inscription_Tarot_HurricaneCard.PNG',
  11: 'INV_Inscription_Tarot_VolcanoCard.PNG',
  12: 'INV_Inscription_Tooltip_DarkmoonCard_MOP.PNG',
};

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
    icon: STARTER_ICONS[slot],
  };
}

/** Fresh copies each call; index i is the card for slot i+1. */
export function starterBoard(): CardDef[] {
  return Array.from({ length: 12 }, (_, i) => starterDef(i + 1));
}
