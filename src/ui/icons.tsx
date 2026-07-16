// Tiny inline effect icons so a card parses at a glance. Presentation only.
import type { ConditionalWhen, Effect, TokenKind } from '../engine';
import { fxText } from './describe';
import type { StatPulse } from './store';

function condShort(when: ConditionalWhen): string {
  const parts: string[] = [];
  if (when.sumAtLeast !== undefined) parts.push(`sum≥${when.sumAtLeast}`);
  if (when.allocatedIndividually !== undefined) {
    parts.push(when.allocatedIndividually ? 'split' : 'sum');
  }
  if (when.hpAtOrBelow !== undefined) parts.push(`hp≤${when.hpAtOrBelow}`);
  if (when.rolledDoubles !== undefined) parts.push(when.rolledDoubles ? 'doubles' : 'no dbls');
  if (when.bothDiceOdd !== undefined) parts.push('odd dice');
  if (when.bothDiceEven !== undefined) parts.push('even dice');
  if (when.echoStackAtLeast !== undefined) parts.push(`${when.echoStackAtLeast}+ echoes`);
  return parts.join(' ');
}

const STAR = 'M6 .8 7.5 4.1l3.6.4-2.7 2.5.8 3.6L6 8.8l-3.2 1.8.8-3.6L.9 4.5l3.6-.4z';
const CROSS = 'M4.6 1h2.8v3.6H11v2.8H7.4V11H4.6V7.4H1V4.6h3.6z';
const DROP = 'M6 .8C6 .8 2.2 5.2 2.2 7.7a3.8 3.8 0 0 0 7.6 0C9.8 5.2 6 .8 6 .8Z';
const HEART =
  'M6 10.6C3.2 8.5 1.2 6.7 1.2 4.6c0-1.5 1.1-2.7 2.6-2.7 1 0 1.7.5 2.2 1.2.5-.7 1.2-1.2 2.2-1.2 1.5 0 2.6 1.2 2.6 2.7 0 2.1-2 3.9-4.8 6Z';

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
/** A sword pointing top-right: reads "damage" (the old red burst did not). */
function Sword() {
  return (
    <svg className="fxi" viewBox="0 0 12 12" aria-hidden="true">
      <g transform="rotate(45 6 6)">
        <path d="M6 0.2 L7.1 1.7 V6.9 H4.9 V1.7 Z" fill="#dc2626" />
        <rect x="3.5" y="6.9" width="5" height="1.25" rx="0.5" fill="#7c2d12" />
        <rect x="5.3" y="8.15" width="1.4" height="2.3" rx="0.6" fill="#7c2d12" />
      </g>
    </svg>
  );
}

/** Card-zone markers (Yu-Gi-Oh style: the symbol carries the meaning, no
 *  "roll"/"echo" words). Die = fires when its slot is rolled; sound waves =
 *  the echo it leaves once retired. */
export function ZoneDie() {
  return (
    <svg className="zglyph" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" rx="2.8" fill="#2b2a26" />
      <circle cx="6" cy="6" r="1.7" fill="#f7f4ec" />
    </svg>
  );
}
export function ZoneEcho() {
  return (
    <svg className="zglyph" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="2.7" cy="6" r="1.3" fill="#7c5cc4" />
      <path
        d="M5 3.4a4 4 0 0 1 0 5.2"
        fill="none"
        stroke="#7c5cc4"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M7.6 2a6.4 6.4 0 0 1 0 8"
        fill="none"
        stroke="#7c5cc4"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.65"
      />
    </svg>
  );
}
function Drop() {
  return (
    <svg className="fxi" viewBox="0 0 12 12" aria-hidden="true">
      <path d={DROP} fill="#b91c1c" />
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
function Heart() {
  return (
    <svg className="fxi" viewBox="0 0 12 12" aria-hidden="true">
      <path d={HEART} fill="#e05e5e" />
    </svg>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[18, 18]],
  2: [
    [11, 11],
    [25, 25],
  ],
  3: [
    [10, 10],
    [18, 18],
    [26, 26],
  ],
  4: [
    [11, 11],
    [25, 11],
    [11, 25],
    [25, 25],
  ],
  5: [
    [11, 11],
    [25, 11],
    [18, 18],
    [11, 25],
    [25, 25],
  ],
  6: [
    [11, 10],
    [25, 10],
    [11, 18],
    [25, 18],
    [11, 26],
    [25, 26],
  ],
};

/** A real die face; null renders an empty dashed socket. */
export function Die({ value }: { value: number | null }) {
  return (
    <svg
      className="die"
      viewBox="0 0 36 36"
      role="img"
      aria-label={value ? `die showing ${value}` : 'empty die socket'}
    >
      <rect
        x="1"
        y="1"
        width="34"
        height="34"
        rx="8"
        fill={value ? '#f7f4ec' : 'none'}
        stroke={value ? '#c9c2b2' : '#4a5470'}
        strokeDasharray={value ? undefined : '4 3'}
      />
      {value !== null &&
        PIPS[value]?.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.4" fill="#2b2a26" />)}
    </svg>
  );
}

function Floats({ pulses, stat }: { pulses: StatPulse[]; stat: StatPulse['stat'] }) {
  return (
    <>
      {pulses
        .filter((p) => p.stat === stat)
        .map((p) => (
          <span key={p.id} className={'float ' + (p.delta > 0 ? 'gain' : 'loss')}>
            {p.delta > 0 ? '+' : ''}
            {p.delta}
          </span>
        ))}
    </>
  );
}

/** HP / money / points / token pills for a player row, with floating +N deltas. */
export function StatChips(props: {
  hp: number;
  money: number;
  points: number;
  reroll: number;
  nudge: number;
  pulses?: StatPulse[];
}) {
  const pulses = props.pulses ?? [];
  return (
    <div className="stats">
      <span className="stat" title="health">
        <Heart />
        {props.hp}
        <Floats pulses={pulses} stat="hp" />
      </span>
      <span className="stat" title="money">
        <Coin />
        {props.money}
        <Floats pulses={pulses} stat="money" />
      </span>
      <span className="stat" title="points">
        <Star />
        {props.points}
        <Floats pulses={pulses} stat="points" />
      </span>
      {props.reroll > 0 && (
        <span className="stat glyph" title="reroll tokens">
          {'↻'}
          {props.reroll}
        </span>
      )}
      {props.nudge > 0 && (
        <span className="stat glyph" title="nudge tokens">
          {'±'}
          {props.nudge}
        </span>
      )}
    </div>
  );
}

/** One icon row for an effect list. context tells damage how to read:
 *  in an active line, target 'roller' means you bleed yourself. */
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
        <span className="fxchip" title={self ? `costs ${e.amount} of your own HP` : tip}>
          {self ? <Drop /> : <Sword />}
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
    case 'discount':
      return (
        <span className="fxchip glyph" title={tip}>
          -{e.amount} cost
        </span>
      );
    case 'trade':
      return (
        <span className="fxif" title={tip}>
          <span className="condtag">pay {e.pay}</span>
          <EffectIcons effects={e.then} context={context} />
        </span>
      );
    case 'conditional':
      return (
        <span className="fxif" title={tip}>
          <span className="condtag">{condShort(e.when)}</span>
          <EffectIcons effects={e.then} context={context} />
        </span>
      );
    case 'steal':
      return (
        <span className="fxchip fxsteal" title={tip}>
          <Coin />
          {'←'}
          {e.amount}
        </span>
      );
    case 'swapBoard':
      return (
        <span className="fxchip glyph" title={tip}>
          {e.a}
          {'⇄'}
          {e.b}
        </span>
      );
    case 'charge':
      return (
        <span className="fxif" title={tip}>
          <span className="condtag charge">{e.need}{'×'}</span>
          <EffectIcons effects={e.then} context={context} />
        </span>
      );
    case 'winGame':
      return (
        <span className="fxchip fxwin" title={tip}>
          {'★ WIN'}
        </span>
      );
  }
}

/** Sums a slot's echo lines into one readable row: two "+1 money" echoes
 *  render as a single coin 2. Conditionals cannot merge; they trail as-is. */
export function aggregateEchoEffects(lines: Effect[][]): Effect[] {
  let money = 0;
  let points = 0;
  let damage = 0;
  let heal = 0;
  const tokens: Record<TokenKind, number> = { reroll: 0, nudge: 0 };
  let refresh = 0;
  let discount = 0;
  let steal = 0;
  const rest: Effect[] = [];
  for (const line of lines) {
    for (const e of line) {
      switch (e.kind) {
        case 'steal':
          steal += e.amount; // echo steals always rob the roller
          break;
        case 'swapBoard':
        case 'charge':
        case 'winGame':
          rest.push(e);
          break;
        case 'gainMoney':
          money += e.amount;
          break;
        case 'gainPoints':
          points += e.amount;
          break;
        case 'damage':
          damage += e.amount; // echo damage always hits the roller
          break;
        case 'heal':
          heal += e.amount;
          break;
        case 'gainToken':
          tokens[e.token] += e.amount;
          break;
        case 'refreshShop':
          refresh += 1;
          break;
        case 'discount':
          discount += e.amount;
          break;
        case 'trade':
        case 'conditional':
          rest.push(e);
          break;
      }
    }
  }
  const out: Effect[] = [];
  if (money > 0) out.push({ kind: 'gainMoney', amount: money });
  if (points > 0) out.push({ kind: 'gainPoints', amount: points });
  if (damage > 0) out.push({ kind: 'damage', amount: damage, target: 'roller' });
  if (heal > 0) out.push({ kind: 'heal', amount: heal });
  if (tokens.reroll > 0) out.push({ kind: 'gainToken', token: 'reroll', amount: tokens.reroll });
  if (tokens.nudge > 0) out.push({ kind: 'gainToken', token: 'nudge', amount: tokens.nudge });
  if (discount > 0) out.push({ kind: 'discount', amount: discount });
  if (steal > 0) out.push({ kind: 'steal', amount: steal, target: 'roller' });
  for (let i = 0; i < refresh; i++) out.push({ kind: 'refreshShop' });
  return [...out, ...rest];
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
        <Sword /> damage
      </span>
      <span className="fxchip">
        <Drop /> your own HP
      </span>
      <span className="fxchip">
        <Cross /> heal
      </span>
      <span className="fxchip">
        <ZoneDie /> when rolled
      </span>
      <span className="fxchip">
        <ZoneEcho /> echo once retired
      </span>
      <span className="fxchip glyph">{'↻'} reroll</span>
      <span className="fxchip glyph">{'±'} nudge</span>
      <span className="fxchip glyph">{'⟳'} new shop</span>
      <span className="dimtext">
        die row = fires when its number lands | wave row = what the card echoes once retired |
        purple tab = retired cards echoing there now, paying on other players' turns
      </span>
    </div>
  );
}
