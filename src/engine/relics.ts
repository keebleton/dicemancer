// Relics: expensive personal rule-benders, the late-game coin sink
// (docs/RELICS.md). Defs live in the ENGINE because each relic IS a rule;
// behavior hangs off hook points in the reducer/effects keyed by id. State
// carries only ids + slot picks, so everything stays JSON-serializable.
import type { GameState, PlayerState } from './types';

export interface RelicDef {
  id: string;
  name: string;
  cost: number;
  /** Player-facing rules text (shown as the tooltip). */
  text: string;
  /** Buying this relic requires choosing one of your board slots. */
  needsSlotPick?: boolean;
  /** Card-art filename; presentation only. */
  icon?: string;
}

export const RELICS: RelicDef[] = [
  { id: 'echo-prism', name: 'Echo Prism', cost: 16, needsSlotPick: true, icon: 'INV_Enchant_PrismaticSphere.PNG', text: 'Pick a slot: its card fires twice whenever it fires.' },
  { id: 'merchant-crown', name: 'Merchant Crown', cost: 14, icon: 'INV_Crown_02.PNG', text: 'No buy limit: purchase any number of cards per turn.' },
  { id: 'golden-scales', name: 'Golden Scales', cost: 12, icon: 'Ability_Druid_BalanceofPower.PNG', text: 'At the end of your turn, coins above 15 convert to points, 3 coins each.' },
  { id: 'interest-ledger', name: 'Interest Ledger', cost: 12, icon: 'INV_Misc_Book_09.PNG', text: 'At the start of your turn, gain 1 coin per 5 coins you hold.' },
  { id: 'bottomless-purse', name: 'Bottomless Purse', cost: 10, icon: 'INV_Misc_Bag_10_Blue.PNG', text: 'Your trade costs are 1 lower (minimum 1).' },
  { id: 'auctioneers-gavel', name: "Auctioneer's Gavel", cost: 14, icon: 'INV_Hammer_01.PNG', text: 'Your shop shows 5 cards instead of 4.' },
  { id: 'collectors-case', name: "Collector's Case", cost: 15, icon: 'inv_misc_treasurechest01a.PNG', text: 'Your card purchases cost 1 less.' },
  { id: 'loaded-die', name: 'Loaded Die', cost: 18, icon: 'INV_Misc_Dice_02.PNG', text: 'Once per turn, set one of your dice to any face after rolling.' },
  { id: 'fates-hourglass', name: "Fate's Hourglass", cost: 14, icon: 'INV_Misc_PocketWatch_02.PNG', text: 'Start each of your turns with a reroll token.' },
  { id: 'weighted-dice', name: 'Weighted Dice', cost: 16, icon: 'INV_Stone_WeightStone_05.PNG', text: 'When you roll doubles, each slot you fire fires one extra time.' },
  { id: 'destiny-stone', name: 'Destiny Stone', cost: 22, icon: 'Ability_Mount_OnyxPanther.PNG', text: 'Once per turn, reroll both dice.' },
  { id: 'resonant-bell', name: 'Resonant Bell', cost: 15, icon: 'INV_Misc_Bell_01.PNG', text: 'Your echoes also hear YOUR OWN rolls.' },
  { id: 'grave-lantern', name: 'Grave Lantern', cost: 13, icon: 'INV_Misc_Archaeology_MantidLampPost_01.PNG', text: 'Whenever one of your cards retires to the echo stack, gain 2 points.' },
  { id: 'chorus-amplifier', name: 'Chorus Amplifier', cost: 16, icon: 'INV_Misc_Horn_03.PNG', text: 'Whenever your echoes hear a roll, gain an extra 1 coin and 1 point.' },
  { id: 'iron-aegis', name: 'Iron Aegis', cost: 14, icon: 'INV_Shield_06.PNG', text: 'The first damage you take each round is reduced by 2.' },
  { id: 'vampiric-chalice', name: 'Vampiric Chalice', cost: 16, icon: 'INV_Drink_11.PNG', text: 'Whenever you deal damage, heal 1.' },
  { id: 'assassins-mark', name: "Assassin's Mark", cost: 15, icon: 'Ability_Rogue_Deadliness.PNG', text: 'Your damage against the point leader is increased by 1.' },
  { id: 'chrono-anchor', name: 'Chrono Anchor', cost: 20, icon: 'INV_Misc_PocketWatch_01.PNG', text: 'One use: at the end of this turn, take another full turn (then the anchor is spent).' },
  { id: 'magnet-stone', name: 'Magnet Stone', cost: 13, icon: 'Spell_Nature_EarthElemental_Totem.PNG', text: 'When an opponent buys from the Market, you gain 2 coins.' },
  { id: 'wildcard-sleeve', name: 'Wildcard Sleeve', cost: 12, needsSlotPick: true, icon: 'INV_Gauntlets_04.PNG', text: 'Pick a slot: it also fires when the OTHER interpretation of your roll matches it.' },
];

export const RELIC_BY_ID: Record<string, RelicDef> = Object.fromEntries(
  RELICS.map((r) => [r.id, r]),
);

export const RELIQUARY_SIZE = 3;
export const MAX_RELICS = 3;

export const hasRelic = (p: PlayerState, id: string): boolean => p.relics.includes(id);

/** Highest points among LIVING players; Assassin's Mark keys off this. */
export function pointLeaderPoints(state: GameState): number {
  return Math.max(0, ...state.players.filter((p) => !p.eliminated).map((p) => p.points));
}
