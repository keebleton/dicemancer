// Tiny inline effect icons so a card parses at a glance. Presentation only.
import type { ConditionalWhen, Effect } from '../engine';
import { fxText } from './describe';

function condShort(when: ConditionalWhen): string {
  const parts: string[] = [];
  if (when.sumAtLeast !== undefined) parts.push(`sum≥${when.sumAtLeast}`);
  if (when.allocatedIndividually !== undefined) {
    parts.push(when.allocatedIndividually ? 'split' : 'sum');
  }
  if (when.hpAtOrBelow !== undefined) parts.push(`hp≤${when.hpAtOrBelow}`);
  return parts.join(' ');
}

const STAR = 'M6 .8 7.5 4.1l3.6.4-2.7 2.5.8 3.6L6 8.8l-3.2 1.8.8-3.6L.9 4.5l3.6-.4z';
const BURST = 'M6 0l1.4 4.6L12 6 7.4 7.4 6 12 4.6 7.4 0 6l4.6-1.4z';
const CROSS = 'M4.6 1h2.8v3.6H11v2.8H7.4V11H4.6V7.4H1V4.6h3.6z';

function Coin() {
  return (
    <svg className="fxi" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="5" fill="#f0b429" stroke="#a16207" />
      <circle cx="6" cy="6" r="2.3" fill="none" stroke="#a16207" />
    </svg>
  );
}
function Star() {
  return (
    <svg className="fxi" viewBox="0 0 12 12" aria-hidden="true">
      <path d={STAR} fill="#7c3aed" />
    </svg>
  );
}
function Burst({ hollow }: { hollow?: boolean }) {
  return (
    <svg className="fxi" viewBox="0 0 12 12" aria-hidden="true">
      <path d={BURST} fill={hollow ? 'none' : '#dc2626'} stroke="#dc2626" />
    </svg>
  );
}
function Cross() {
  return (
    <svg className="fxi" viewBox="0 0 12 12" aria-hidden="true">
      <path d={CROSS} fill="#15803d" />
    </svg>
  );
}

/** One icon row for an effect list. context tells damage how to read:
 *  in an active line, target 'roller' means you hit yourself. */
export function EffectIcons({ effects, context }: { effects: Effect[]; context: 'active' | 'echo' }) {
  return (
    <span className="fxrow">
      {effects.map((e, i) => (
        <EffectChip key={i} e={e} context={context} />
      ))}
    </span>
  );
}

function EffectChip({ e, context }: { e: Effect; context: 'active' | 'echo' }) {
  const tip = fxText(e);
  switch (e.kind) {
    case 'gainMoney':
      return (
        <span className="fxchip" title={tip}>
          <Coin />
          {e.amount}
        </span>
      );
    case 'gainPoints':
      return (
        <span className="fxchip" title={tip}>
          <Star />
          {e.amount}
        </span>
      );
    case 'damage': {
      const self = context === 'active' && e.target === 'roller';
      return (
        <span className="fxchip" title={self ? `${e.amount} damage to yourself` : tip}>
          <Burst hollow={self} />
          {e.amount}
        </span>
      );
    }
    case 'heal':
      return (
        <span className="fxchip" title={tip}>
          <Cross />
          {e.amount}
        </span>
      );
    case 'gainToken':
      return (
        <span className="fxchip glyph" title={tip}>
          {e.token === 'reroll' ? '↻' : '±'}
          {e.amount}
        </span>
      );
    case 'refreshShop':
      return (
        <span className="fxchip glyph" title={tip}>
          {'⟳'}
        </span>
      );
    case 'conditional':
      return (
        <span className="fxif" title={tip}>
          if {condShort(e.when)}: <EffectIcons effects={e.then} context={context} />
        </span>
      );
  }
}

export function IconLegend() {
  return (
    <div className="legend">
      <span className="fxchip">
        <Coin /> money
      </span>
      <span className="fxchip">
        <Star /> points
      </span>
      <span className="fxchip">
        <Burst /> damage
      </span>
      <span className="fxchip">
        <Burst hollow /> hits you
      </span>
      <span className="fxchip">
        <Cross /> heal
      </span>
      <span className="fxchip glyph">{'↻'} reroll</span>
      <span className="fxchip glyph">{'±'} nudge</span>
      <span className="fxchip glyph">{'⟳'} new shop</span>
      <span className="dimtext">
        e = that card's echo once retired | purple strip = cards echoing in that slot now
      </span>
    </div>
  );
}
