import { MARKET_SIZE, SHOP_COLOR_CARDS } from './tunables';
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

/** Discard the row's remnants and deal a fresh own-color row.
 *  Runs at the owner's turn start and on the refreshShop effect.
 *  No-op for games created without pools (shop === []). */
export function dealRow(state: GameState, seat: number, rng: Rng): void {
  const p = state.players[seat];
  if (!p || p.shop.length === 0) return;
  for (const card of p.shop) {
    if (card) p.colorDiscard.push(card);
  }
  // A pending freeze penalty thins this deal, then it is spent.
  const count = Math.max(1, SHOP_COLOR_CARDS - p.shopPenalty);
  p.shopPenalty = 0;
  const row: (CardDef | null)[] = [];
  for (let i = 0; i < count; i++) row.push(draw(p.colorDeck, p.colorDiscard, rng));
  p.shop = row;
}

/** Deal the shared market's initial display from its (already shuffled) deck. */
export function dealMarket(state: GameState): void {
  const row: (CardDef | null)[] = [];
  for (let i = 0; i < MARKET_SIZE; i++) row.push(state.marketDeck.pop() ?? null);
  state.market = row;
}

/** A bought market slot refills immediately; the market itself never rotates. */
export function refillMarketSlot(state: GameState, index: number): void {
  state.market[index] = state.marketDeck.pop() ?? null;
}
