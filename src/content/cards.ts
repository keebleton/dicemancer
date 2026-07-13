import type { CardDef } from '../engine/types';

// The PLAN.md section 4 exemplar cards, verbatim. Placeholders, NOT balanced;
// the pool grows to targets (~15/color + ~10 colorless) in Phase 5 and gets
// tuned by the sim harness, never by intuition.

const ALL_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const RED_CARDS: CardDef[] = [
  {
    id: 'cinder-bolt',
    name: 'Cinder Bolt',
    color: 'red',
    rarity: 'common',
    cost: 4,
    legalSlots: [4, 5],
    active: [{ kind: 'damage', amount: 2, target: 'chooseOpponent' }],
    echo: [{ kind: 'damage', amount: 1, target: 'roller' }],
  },
  {
    id: 'stoke-the-forge',
    name: 'Stoke the Forge',
    color: 'red',
    rarity: 'common',
    cost: 3,
    legalSlots: [4, 6],
    active: [{ kind: 'gainMoney', amount: 2 }],
    echo: [{ kind: 'gainMoney', amount: 1 }],
  },
  {
    id: 'blood-for-power',
    name: 'Blood for Power',
    color: 'red',
    rarity: 'rare',
    cost: 7,
    legalSlots: [5, 6],
    active: [
      { kind: 'damage', amount: 2, target: 'roller' }, // self-risk: your own turn, you are the roller
      { kind: 'gainPoints', amount: 3 },
    ],
    echo: [{ kind: 'gainPoints', amount: 1 }],
  },
  {
    id: 'meteor-call',
    name: 'Meteor Call',
    color: 'red',
    rarity: 'rare',
    cost: 8,
    legalSlots: [10, 11, 12],
    active: [
      { kind: 'damage', amount: 4, target: 'chooseOpponent' },
      { kind: 'gainPoints', amount: 2 },
    ],
    echo: [{ kind: 'damage', amount: 1, target: 'roller' }],
  },
];

export const BLUE_CARDS: CardDef[] = [
  {
    id: 'ripple',
    name: 'Ripple',
    color: 'blue',
    rarity: 'common',
    cost: 3,
    legalSlots: [2, 3],
    active: [{ kind: 'gainMoney', amount: 2 }],
    echo: [{ kind: 'gainMoney', amount: 1 }],
  },
  {
    id: 'second-glance',
    name: 'Second Glance',
    color: 'blue',
    rarity: 'common',
    cost: 4,
    legalSlots: [1, 2],
    active: [
      { kind: 'gainMoney', amount: 1 },
      { kind: 'gainToken', token: 'reroll', amount: 1 },
    ],
    echo: [{ kind: 'gainMoney', amount: 1 }],
  },
  {
    id: 'chronoloop',
    name: 'Chronoloop',
    color: 'blue',
    rarity: 'rare',
    cost: 7,
    legalSlots: [1, 3],
    active: [
      { kind: 'gainPoints', amount: 2 },
      { kind: 'conditional', when: { allocatedIndividually: true }, then: [{ kind: 'gainPoints', amount: 1 }] },
    ],
    echo: [{ kind: 'gainPoints', amount: 1 }],
  },
  {
    id: 'tide-engine',
    name: 'Tide Engine',
    color: 'blue',
    rarity: 'rare',
    cost: 8,
    legalSlots: [1, 2, 3],
    active: [
      { kind: 'gainMoney', amount: 2 },
      { kind: 'gainPoints', amount: 1 },
      { kind: 'gainToken', token: 'nudge', amount: 1 },
    ],
    echo: [{ kind: 'gainMoney', amount: 1 }],
  },
];

export const COLORLESS_CARDS: CardDef[] = [
  {
    id: 'coin-sprite',
    name: 'Coin Sprite',
    color: 'colorless',
    rarity: 'common',
    cost: 3,
    legalSlots: ALL_SLOTS,
    active: [{ kind: 'gainMoney', amount: 2 }],
    echo: [{ kind: 'gainMoney', amount: 1 }],
  },
  {
    id: 'lucky-charm',
    name: 'Lucky Charm',
    color: 'colorless',
    rarity: 'common',
    cost: 5,
    legalSlots: ALL_SLOTS,
    active: [
      { kind: 'gainMoney', amount: 1 },
      { kind: 'gainPoints', amount: 1 },
    ],
    echo: [{ kind: 'gainMoney', amount: 1 }],
  },
  {
    id: 'prism-core',
    name: 'Prism Core',
    color: 'colorless',
    rarity: 'rare',
    cost: 8,
    legalSlots: ALL_SLOTS,
    active: [{ kind: 'gainPoints', amount: 2 }],
    echo: [{ kind: 'gainPoints', amount: 1 }],
  },
];

export function pools() {
  return { red: RED_CARDS, blue: BLUE_CARDS, colorless: COLORLESS_CARDS };
}
