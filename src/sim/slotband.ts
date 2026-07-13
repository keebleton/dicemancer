// Slot-band analysis: are boards built on slots 1-6 beating boards built on
// 7-12? Tracks how often each slot actually fires under bot play, where bots
// choose to install cards, and whether buying into the high band correlates
// with losing. Run: npx tsx src/sim/slotband.ts [players] [games] [variant]
// Variants: base (default) | cheap | power | both  (candidate high-band buffs)
import { chooseAction } from '../bot';
import { pools } from '../content/cards';
import { starterBoard } from '../content/starters';
import {
  applyActionInPlace,
  createGame,
  legalActions,
  mulberry32,
  previewNumbers,
} from '../engine';
import type { CardDef, Effect, GameState, SeatColor } from '../engine';

const ALL_COLORS: SeatColor[] = ['red', 'blue', 'black', 'green', 'yellow'];

type Band = 'low' | 'high' | 'mixed' | 'any';
const cardBand = (c: CardDef): Band =>
  c.legalSlots.length >= 12
    ? 'any'
    : c.legalSlots.every((s) => s <= 6)
      ? 'low'
      : c.legalSlots.every((s) => s >= 7)
        ? 'high'
        : 'mixed';

interface Tally {
  games: number;
  turns: number;
  allocSplit: number;
  allocSum: number;
  echoSplit: number;
  echoSum: number;
  activeFires: number[];
  echoFires: number[];
  buysBySlotBand: Record<'low' | 'high', number>;
  winsBySlotBand: Record<'low' | 'high', number>;
  buysByCardBand: Record<Band, number>;
  winsByCardBand: Record<Band, number>;
  perCard: Map<string, { band: Band; color: string; bought: number; won: number }>;
  colorWins: Record<SeatColor, number>;
  colorGames: Record<SeatColor, number>;
  /** color -> band -> [bought, buyerWon]; controls the color confound. */
  colorBand: Record<string, Record<'low' | 'high', [number, number]>>;
  /** color -> [allBuys, buyerWon]: the per-color baseline for card deltas. */
  colorAll: Record<string, [number, number]>;
}

function run(
  players: number,
  games: number,
  seed: number,
  activePools: ReturnType<typeof pools>,
  tunables?: { highEchoHearsSum?: boolean; startingHp?: number },
): Tally {
  const t: Tally = {
    games,
    turns: 0,
    allocSplit: 0,
    allocSum: 0,
    echoSplit: 0,
    echoSum: 0,
    activeFires: Array(13).fill(0),
    echoFires: Array(13).fill(0),
    buysBySlotBand: { low: 0, high: 0 },
    winsBySlotBand: { low: 0, high: 0 },
    buysByCardBand: { low: 0, high: 0, mixed: 0, any: 0 },
    winsByCardBand: { low: 0, high: 0, mixed: 0, any: 0 },
    perCard: new Map(),
    colorWins: { red: 0, blue: 0, black: 0, green: 0, yellow: 0 },
    colorGames: { red: 0, blue: 0, black: 0, green: 0, yellow: 0 },
    colorBand: {},
    colorAll: {},
  };

  for (let g = 0; g < games; g++) {
    const rng = mulberry32((seed * 0x9e3779b9 + g) >>> 0);
    const colors = Array.from(
      { length: players },
      (_, i) => ALL_COLORS[(g + i) % ALL_COLORS.length]!,
    );
    let s: GameState = createGame(
      {
        seats: colors.map((color, i) => ({ name: `S${i}`, color })),
        starterBoard: starterBoard(),
        pools: activePools,
        tunables,
      },
      rng,
    );
    const purchases: {
      slotBand: 'low' | 'high';
      id: string;
      band: Band;
      seat: number;
      color: string;
    }[] = [];

    for (let step = 0; step < 50_000; step++) {
      if (legalActions(s).length === 0) break;
      const a = chooseAction(s);
      if (a.type === 'ROLL') t.turns += 1;
      else if (a.type === 'ALLOCATE') {
        if (a.mode === 'individual') t.allocSplit += 1;
        else t.allocSum += 1;
        for (const n of previewNumbers(s.dice!, a.mode)) t.activeFires[n]! += 1;
      } else if (a.type === 'ECHO_CHOICE') {
        if (a.mode === 'individual') t.echoSplit += 1;
        else t.echoSum += 1;
      } else if (a.type === 'BUY' || a.type === 'BUY_MARKET') {
        const card =
          a.type === 'BUY' ? s.players[s.current]!.shop[a.shopIndex]! : s.market[a.marketIndex]!;
        purchases.push({
          slotBand: a.targetSlot <= 6 ? 'low' : 'high',
          id: card.id,
          band: cardBand(card),
          seat: s.current,
          color: card.color,
        });
      }
      // Echo fires are read off the engine's own record (echoNumbers) so
      // auto-resolved seats and the high-hears-sum rule are counted exactly.
      const before = s.echoNumbers.map((n) => n !== null);
      s = applyActionInPlace(s, a, rng);
      s.echoNumbers.forEach((heard, seat) => {
        if (!heard || before[seat]) return;
        for (const n of heard) {
          for (const e of s.players[seat]!.echoStack) {
            if (e.slot === n) t.echoFires[e.slot]! += 1;
          }
        }
      });
    }

    if (s.winner === null) throw new Error(`game ${g} did not finish`);
    for (const c of colors) t.colorGames[c] += 1;
    t.colorWins[s.players[s.winner]!.color] += 1;
    for (const p of purchases) {
      if (p.band === 'low' || p.band === 'high') {
        const cb = (t.colorBand[p.color] ??= { low: [0, 0], high: [0, 0] });
        cb[p.band][0] += 1;
        if (p.seat === s.winner) cb[p.band][1] += 1;
      }
      const ca = (t.colorAll[p.color] ??= [0, 0]);
      ca[0] += 1;
      if (p.seat === s.winner) ca[1] += 1;
    }
    for (const p of purchases) {
      t.buysBySlotBand[p.slotBand] += 1;
      t.buysByCardBand[p.band] += 1;
      let row = t.perCard.get(p.id);
      if (!row) {
        row = { band: p.band, color: p.color, bought: 0, won: 0 };
        t.perCard.set(p.id, row);
      }
      row.bought += 1;
      if (p.seat === s.winner) {
        t.winsBySlotBand[p.slotBand] += 1;
        t.winsByCardBand[p.band] += 1;
        row.won += 1;
      }
    }
  }
  return t;
}

const pct = (n: number, of: number) => `${((100 * n) / Math.max(1, of)).toFixed(1)}%`;

function report(label: string, players: number, t: Tally) {
  const fair = 1 / players;
  const lines: string[] = [];
  lines.push(`=== ${label}: ${players}p, ${t.games} games (fair buyer win = ${(100 * fair).toFixed(0)}%) ===`);
  lines.push(
    `roller allocation: split ${pct(t.allocSplit, t.allocSplit + t.allocSum)}  sum ${pct(t.allocSum, t.allocSplit + t.allocSum)}`
      + `   echo choices: split ${pct(t.echoSplit, t.echoSplit + t.echoSum)}  sum ${pct(t.echoSum, t.echoSplit + t.echoSum)}`,
  );
  const perGame = (arr: number[], slot: number) => (arr[slot]! / t.games).toFixed(2);
  lines.push('fires per game by slot (active / echo):');
  lines.push(
    '  ' + [1, 2, 3, 4, 5, 6].map((v) => `${v}: ${perGame(t.activeFires, v)}/${perGame(t.echoFires, v)}`).join('  '),
  );
  lines.push(
    '  ' + [7, 8, 9, 10, 11, 12].map((v) => `${v}: ${perGame(t.activeFires, v)}/${perGame(t.echoFires, v)}`).join('  '),
  );
  const lowA = t.activeFires.slice(1, 7).reduce((a, b) => a + b, 0);
  const highA = t.activeFires.slice(7).reduce((a, b) => a + b, 0);
  lines.push(`active fires landing in 1-6: ${pct(lowA, lowA + highA)}   in 7-12: ${pct(highA, lowA + highA)}`);
  lines.push(
    `buys INTO slots 1-6: ${t.buysBySlotBand.low} (buyer wins ${pct(t.winsBySlotBand.low, t.buysBySlotBand.low)})`
      + `   INTO 7-12: ${t.buysBySlotBand.high} (buyer wins ${pct(t.winsBySlotBand.high, t.buysBySlotBand.high)})`,
  );
  lines.push('by printed card band (bought / buyer win rate):');
  for (const band of ['low', 'high', 'mixed', 'any'] as Band[]) {
    lines.push(
      `  ${band.padEnd(6)} ${String(t.buysByCardBand[band]).padStart(6)}  ${pct(t.winsByCardBand[band], t.buysByCardBand[band])}`,
    );
  }
  lines.push(
    'color win rate: '
      + ALL_COLORS.map((c) => `${c} ${pct(t.colorWins[c], t.colorGames[c])}`).join('  '),
  );
  lines.push('within-color low vs high buyer win (controls color strength):');
  for (const c of ALL_COLORS) {
    const cb = t.colorBand[c];
    if (!cb) continue;
    lines.push(
      `  ${c.padEnd(7)} low ${pct(cb.low[1], cb.low[0])} (${cb.low[0]})   high ${pct(cb.high[1], cb.high[0])} (${cb.high[0]})`
        + `   delta ${((100 * cb.high[1]) / Math.max(1, cb.high[0]) - (100 * cb.low[1]) / Math.max(1, cb.low[0])).toFixed(1)}`,
    );
  }
  const high = [...t.perCard.entries()]
    .filter(([, r]) => r.band === 'high' && r.bought >= 25)
    .sort((a, b) => a[1].won / a[1].bought - b[1].won / b[1].bought);
  lines.push('high-band cards (bought >= 25), worst first:');
  for (const [id, r] of high) {
    lines.push(`  ${id.padEnd(22)} bought ${String(r.bought).padStart(5)}  win ${pct(r.won, r.bought)}`);
  }
  // Worst cards overall, measured against their own color's buyer baseline so
  // a bad card in a strong color still surfaces (and vice versa).
  const delta = (r: { color: string; bought: number; won: number }) => {
    const base = t.colorAll[r.color];
    const colorRate = base ? base[1] / Math.max(1, base[0]) : fair;
    return (100 * r.won) / r.bought - 100 * colorRate;
  };
  const ranked = [...t.perCard.entries()]
    .filter(([, r]) => r.bought >= 100)
    .sort((a, b) => delta(a[1]) - delta(b[1]));
  lines.push('worst cards vs their color baseline (bought >= 100):');
  for (const [id, r] of ranked.slice(0, 15)) {
    lines.push(
      `  ${id.padEnd(22)} ${r.color.padEnd(10)} ${r.band.padEnd(6)} bought ${String(r.bought).padStart(5)}`
        + `  win ${pct(r.won, r.bought)}  delta ${delta(r).toFixed(1)}`,
    );
  }
  lines.push('best cards vs their color baseline:');
  for (const [id, r] of ranked.slice(-8).reverse()) {
    lines.push(
      `  ${id.padEnd(22)} ${r.color.padEnd(10)} ${r.band.padEnd(6)} bought ${String(r.bought).padStart(5)}`
        + `  win ${pct(r.won, r.bought)}  delta ${delta(r).toFixed(1)}`,
    );
  }
  console.log(lines.join('\n') + '\n');
}

/** Candidate buffs, applied only to cards whose slots are all 7-12. */
function buffEffects(effects: Effect[], mul: number): Effect[] {
  return effects.map((e) => {
    switch (e.kind) {
      case 'gainMoney':
      case 'gainPoints':
      case 'heal':
      case 'gainToken':
        return { ...e, amount: Math.round(e.amount * mul) };
      case 'damage':
        return e.target === 'roller' ? e : { ...e, amount: Math.round(e.amount * mul) };
      case 'trade':
        return { ...e, then: buffEffects(e.then, mul) };
      case 'conditional':
        return { ...e, then: buffEffects(e.then, mul) };
      default:
        return e;
    }
  });
}

/** Does an effect tree contain damage aimed at an opponent? */
function dealsOpponentDamage(effects: Effect[]): boolean {
  return effects.some(
    (e) =>
      (e.kind === 'damage' && e.target === 'chooseOpponent')
      || (e.kind === 'trade' && dealsOpponentDamage(e.then))
      || (e.kind === 'conditional' && dealsOpponentDamage(e.then)),
  );
}

function variantPools(variant: string): ReturnType<typeof pools> {
  const base = pools();
  if (variant === 'base') return base;
  const tweak = (c: CardDef): CardDef => {
    if (cardBand(c) !== 'high') return c;
    // 'targeted': buff only the utility high cards; leave the damage package
    // (red's already-strong high cards) untouched.
    if (variant === 'targeted' && dealsOpponentDamage(c.active)) return c;
    const out = { ...c };
    if (variant === 'cheap' || variant === 'both' || variant === 'targeted') {
      out.cost = Math.max(3, c.cost - 2);
    }
    if (variant === 'power' || variant === 'both' || variant === 'targeted') {
      out.active = buffEffects(c.active, 1.5);
      out.echo = buffEffects(c.echo, 1.5);
    }
    return out;
  };
  const out = { ...base };
  for (const k of Object.keys(out) as (keyof typeof out)[]) {
    out[k] = out[k].map(tweak);
  }
  return out;
}

const players = Number(process.argv[2] ?? 2);
const games = Number(process.argv[3] ?? 2000);
const variant = process.argv[4] ?? 'base';
// The rule defaults ON in the engine now; 'nohiecho' turns it off for A/B.
// Optional 4th arg: a startingHp override (e.g. `... 2 4000 base 26`).
const hpArg = Number(process.argv[5]);
const echoRule = variant.includes('nohiecho')
  ? { highEchoHearsSum: false }
  : variant.includes('hiecho')
    ? { highEchoHearsSum: true }
    : undefined;
const tun = {
  ...(echoRule ?? {}),
  ...(Number.isFinite(hpArg) && hpArg > 0 ? { startingHp: hpArg } : {}),
};
const statVariant = variant.replace(/(no)?hiecho\+?/, '') || 'base';
const t0 = Date.now();
report(
  `variant=${variant}${Number.isFinite(hpArg) && hpArg > 0 ? ` hp=${hpArg}` : ''}`,
  players,
  run(players, games, 12345, variantPools(statVariant), Object.keys(tun).length ? tun : undefined),
);
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
