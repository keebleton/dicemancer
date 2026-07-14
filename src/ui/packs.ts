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
const OVERRIDES_KEY = 'dicemancer_card_overrides_v1';

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

/** Edited versions of BUILT-IN cards (icons, tweaked numbers...), keyed by the
 *  original card id. Applied to every new game and to the Lab's catalog/sim. */
export type CardOverrides = Record<string, CardDef>;

export function loadOverrides(store: KV | null = browserStorage()): CardOverrides {
  if (!store) return {};
  try {
    const raw = store.getItem(OVERRIDES_KEY);
    return raw ? (JSON.parse(raw) as CardOverrides) : {};
  } catch {
    return {};
  }
}

export function saveOverrides(overrides: CardOverrides, store: KV | null = browserStorage()): void {
  try {
    store?.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // storage full or unavailable; edits live for the session only
  }
}

/** Base pools with overrides applied. Cards re-bucket by their EFFECTIVE
 *  color, so recoloring an edit moves it to the right pool. */
export function effectivePools(overrides: CardOverrides = loadOverrides()): Pools {
  const base = pools();
  const result: Pools = { red: [], blue: [], black: [], green: [], yellow: [], colorless: [] };
  for (const bucket of Object.values(base)) {
    for (const card of bucket) {
      const eff = overrides[card.id] ?? card;
      if (eff.color === 'starter') continue;
      result[eff.color].push(eff);
    }
  }
  return result;
}

/** Overridden base pools plus every card from every enabled pack. */
export function mergedPools(
  packs: CardPack[],
  overrides: CardOverrides = loadOverrides(),
): Pools {
  const merged = effectivePools(overrides);
  for (const pack of packs) {
    if (!pack.enabled) continue;
    for (const card of pack.cards) {
      if (card.color === 'starter') continue;
      merged[card.color].push(card);
    }
  }
  return merged;
}

/** The starter board with any starter edits applied. */
export function effectiveStarterBoard(overrides: CardOverrides = loadOverrides()): CardDef[] {
  return starterBoard().map((c) => overrides[c.id] ?? c);
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

/** Approved community proposals become a pack every game loads. Invalid rows
 *  are dropped (a proposal approved before a rules change may no longer
 *  validate); ids get a community- prefix so they can never collide with
 *  builtins or local pack cards. */
export function toCommunityPack(raw: unknown[]): CardPack {
  const cards: CardDef[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const c = r as CardDef;
    if (!c || typeof c !== 'object' || typeof c.id !== 'string' || typeof c.name !== 'string') {
      continue;
    }
    if (validateCard(c).errors.length > 0) continue;
    const id = c.id.startsWith('community-') ? c.id : `community-${c.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    cards.push({ ...c, id });
  }
  return { id: 'community', name: 'Community', enabled: true, cards };
}

/** URL for a WoW icon. Icons referenced by shipped cards live in public/icons
 *  (synced by scripts/sync-icons.mjs, deployed with the site); in dev the
 *  server additionally serves the full local dump at the same path (see
 *  vite.config.ts). Anything not shipped falls back to the icon repo's free
 *  CDN via iconError, so the deployed card builder and avatar picker can use
 *  the whole 23k catalog without us hosting it. */
export const iconUrl = (name: string): string =>
  `${import.meta.env.BASE_URL}icons/${encodeURIComponent(name)}`;

export const iconCdnUrl = (name: string): string =>
  `https://cdn.jsdelivr.net/gh/Gethe/wow-ui-textures/ICONS/${encodeURIComponent(name)}`;

/** onError for icon imgs: retry once from the CDN, then hide. */
export function iconError(e: { currentTarget: HTMLImageElement }): void {
  const img = e.currentTarget;
  if (!img.src.includes('cdn.jsdelivr.net')) {
    img.src = iconCdnUrl(decodeURIComponent(img.src.split('/').pop() ?? ''));
  } else {
    img.style.display = 'none';
  }
}

/** onLoad partner: un-hides an img a previous card's failure hid (React can
 *  reuse the DOM node when the board re-renders with different cards). */
export function iconLoaded(e: { currentTarget: HTMLImageElement }): void {
  e.currentTarget.style.display = '';
}
