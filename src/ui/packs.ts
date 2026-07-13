// Card Lab packs: custom cards, stored in the browser, merged into the shop
// pools at game start. Pure data + pure helpers; the Lab UI sits on top.
import { pools } from '../content/cards';
import { starterBoard } from '../content/starters';
import type { CardDef, Effect } from '../engine';

export interface CardPack {
  id: string;
  name: string;
  enabled: boolean;
  cards: CardDef[];
}

export type Pools = ReturnType<typeof pools>;

/** Minimal storage surface so tests can pass a fake. */
export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'dicemancer_packs_v1';

function browserStorage(): KV | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadPacks(store: KV | null = browserStorage()): CardPack[] {
  if (!store) return [];
  try {
    const raw = store.getItem(KEY);
    return raw ? (JSON.parse(raw) as CardPack[]) : [];
  } catch {
    return [];
  }
}

export function savePacks(packs: CardPack[], store: KV | null = browserStorage()): void {
  try {
    store?.setItem(KEY, JSON.stringify(packs));
  } catch {
    // storage full or unavailable; packs live for the session only
  }
}

/** Base pools plus every card from every enabled pack, routed by card color. */
export function mergedPools(packs: CardPack[]): Pools {
  const base = pools();
  const merged: Pools = {
    red: [...base.red],
    blue: [...base.blue],
    black: [...base.black],
    green: [...base.green],
    yellow: [...base.yellow],
    colorless: [...base.colorless],
  };
  for (const pack of packs) {
    if (!pack.enabled) continue;
    for (const card of pack.cards) {
      if (card.color === 'starter') continue;
      merged[card.color].push(card);
    }
  }
  return merged;
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'card'
  );
}

export function uniqueId(name: string, taken: Set<string>): string {
  const base = slugify(name);
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

/** Every id already used by shipping content. */
export function builtinIds(): Set<string> {
  const p = pools();
  return new Set(
    [...p.red, ...p.blue, ...p.black, ...p.green, ...p.yellow, ...p.colorless, ...starterBoard()]
      .map((c) => c.id),
  );
}

const COLOR_SLOTS: Record<string, Set<number>> = {
  red: new Set([4, 5, 6, 9, 10, 11, 12]),
  blue: new Set([1, 2, 3, 4, 5, 7]),
  black: new Set([1, 2, 6, 12]),
  green: new Set([1, 3, 5, 9]),
  yellow: new Set([2, 4, 6, 8]),
};

const flatKinds = (effects: Effect[]): string[] =>
  effects.flatMap((e) =>
    e.kind === 'conditional' || e.kind === 'trade' ? [e.kind, ...flatKinds(e.then)] : [e.kind],
  );

export interface CardCheck {
  /** Blocks saving. */
  errors: string[];
  /** DESIGN_RULES deviations: allowed in a sandbox, but called out. */
  warnings: string[];
}

export function validateCard(card: CardDef): CardCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!card.name.trim()) errors.push('the card needs a name');
  if (card.legalSlots.length === 0) errors.push('pick at least one slot');
  if (card.legalSlots.some((s) => s < 1 || s > 12)) errors.push('slots must be 1-12');
  if (!Number.isFinite(card.cost) || card.cost < 0) errors.push('cost must be 0 or more');
  if (card.active.length === 0 && card.echo.length === 0) {
    errors.push('give it at least one effect (active or echo)');
  }

  if (card.rarity === 'common' && (card.cost < 3 || card.cost > 5)) {
    warnings.push('design rules put commons at 3-5 cost');
  }
  if (card.rarity === 'rare' && (card.cost < 7 || card.cost > 10)) {
    warnings.push('design rules put rares at 7-10 cost');
  }
  const pattern = COLOR_SLOTS[card.color];
  if (pattern && card.legalSlots.some((s) => !pattern.has(s))) {
    warnings.push(`${card.color} normally stays on slots ${[...pattern].join(',')}`);
  }
  if (card.color === 'colorless') {
    const kinds = [...flatKinds(card.active), ...flatKinds(card.echo)];
    if (kinds.includes('damage') || kinds.includes('gainToken')) {
      warnings.push('colorless is normally money/utility only (no damage, no tokens)');
    }
  }
  return { errors, warnings };
}

/** Dev-server URL for a WoW icon file (see vite.config.ts). Missing folder or
 *  a production build just means the img 404s; callers hide it onError. */
export const iconUrl = (name: string): string =>
  '/@fs/C:/DicemancerAssets/wow-ui-textures/ICONS/' + name;
