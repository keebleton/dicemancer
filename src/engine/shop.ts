import { SHOP_COLOR_CARDS, SHOP_COLORLESS_CARDS } from './tunables';
import type { CardDef, GameState, Rng } from './types';

export function shuffle<T>(arr: T[], rng: Rng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

/** Draw one card; empty deck reshuffles the discard first. Null when the whole pool is gone. */
function draw(deck: CardDef[], discard: CardDef[], rng: Rng): CardDef | null {
  if (deck.length === 0) {
    if (discard.length === 0) return null;
    deck.push(...discard.splice(0));
    shuffle(deck, rng);
  }
  return deck.pop() ?? null;
}

/** Discard the row's remnants and deal a fresh 3 color + 2 colorless.
 *  Runs at the owner's turn start and on the refreshShop effect.
 *  No-op for games created without pools (shop === []). */
export function dealRow(state: GameState, seat: number, rng: Rng): void {
  const p = state.players[seat];
  if (!p || p.shop.length === 0) return;
  for (const card of p.shop) {
    if (!card) continue;
    (card.color === 'colorless' ? p.colorlessDiscard : p.colorDiscard).push(card);
  }
  const row: (CardDef | null)[] = [];
  for (let i = 0; i < SHOP_COLOR_CARDS; i++) row.push(draw(p.colorDeck, p.colorDiscard, rng));
  for (let i = 0; i < SHOP_COLORLESS_CARDS; i++) {
    row.push(draw(p.colorlessDeck, p.colorlessDiscard, rng));
  }
  p.shop = row;
}
