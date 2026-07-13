// The one true card face: art on top (slots top-left, cost top-right), a
// color stripe, then name + effects below. Used by boards, shops, the market,
// and the Card Lab. Presentation only.
import type { CardDef } from '../engine';
import { EffectIcons } from './icons';
import { iconUrl } from './packs';

export const TINT: Record<string, string> = {
  red: '#8a3b34',
  blue: '#2f5e9e',
  black: '#453a63',
  green: '#3f7a40',
  yellow: '#b08a1e',
  colorless: '#6b6f7c',
  starter: '#4a4f5e',
};

export function CardFace(props: {
  card: CardDef;
  /** Board cells show the slot they occupy instead of the card's legal slots. */
  slotBadge?: number;
  /** Shops and the Lab show the price; boards do not (already bought). */
  showCost?: boolean;
}) {
  const { card, slotBadge, showCost } = props;
  const tint = TINT[card.color] ?? '#555';
  return (
    <div className="cface">
      <div className="cart" style={{ background: tint }}>
        {card.icon && (
          <img
            src={iconUrl(card.icon)}
            alt=""
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        )}
        <span className="cbadge cslots">
          {slotBadge ?? (card.legalSlots.length === 12 ? 'any' : card.legalSlots.join(','))}
        </span>
        {showCost && <span className="cbadge ccost">{card.cost}</span>}
      </div>
      <div className="cstripe" style={{ background: tint }} />
      <div className="cbody">
        <div className="cname">{card.name}</div>
        <div className="fxline">
          <span className="rowlab">roll</span>
          <EffectIcons effects={card.active} context="active" />
        </div>
        <div className="fxline dim">
          <span className="rowlab">echo</span>
          <EffectIcons effects={card.echo} context="echo" />
        </div>
      </div>
    </div>
  );
}
