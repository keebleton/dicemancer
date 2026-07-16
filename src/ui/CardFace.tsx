// The one true card face: art on top (slots top-left, cost top-right), a
// color stripe, then name + effects below. Used by boards, shops, the market,
// and the Card Lab. Presentation only.
import type { CardDef } from '../engine';
import { EffectIcons, ZoneEcho } from './icons';
import { iconError, iconLoaded, iconUrl } from './packs';

export const TINT: Record<string, string> = {
  red: '#8a3b34',
  blue: '#2f5e9e',
  black: '#453a63',
  green: '#3f7a40',
  yellow: '#b08a1e',
  colorless: '#6b6f7c',
  starter: '#4a4f5e',
};

/** "any" for all 12, "7-12" for contiguous runs of 3+, else "4,6". */
function slotLabel(slots: number[]): string {
  if (slots.length >= 12) return 'any';
  const s = [...slots].sort((a, b) => a - b);
  const contiguous = s.every((v, i) => i === 0 || v === s[i - 1]! + 1);
  if (contiguous && s.length >= 3) return `${s[0]}-${s[s.length - 1]}`;
  return s.join(',');
}

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
      <div className={'cart r-' + card.rarity} style={{ background: tint }}>
        {card.icon && (
          <img src={iconUrl(card.icon)} alt="" onError={iconError} onLoad={iconLoaded} />
        )}
        <span className="cbadge cslots">{slotBadge ?? slotLabel(card.legalSlots)}</span>
        {showCost && <span className="cbadge ccost">{card.cost}</span>}
      </div>
      <div className="cstripe" style={{ background: tint }} />
      <div className="cbody">
        <div className="cname">{card.name}</div>
        {/* The top effects are simply what happens when the slot is rolled
            (no marker needed); the wave-tagged strip pinned to the bottom is
            the echo the card leaves once retired. */}
        <div className="czone" title="fires when its slot is rolled">
          <EffectIcons effects={card.active} context="active" />
        </div>
        {card.flavor && <div className="cflavor">{card.flavor}</div>}
        <div className="czone echo" title="echoes this once the card is retired">
          <ZoneEcho />
          <EffectIcons effects={card.echo} context="echo" />
        </div>
      </div>
    </div>
  );
}
