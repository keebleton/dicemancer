// Headless bot-vs-bot balance harness (PLAN section 7, P5).
import { chooseAction } from '../bot';
import { pools } from '../content/cards';
import { starterBoard } from '../content/starters';
import { applyActionInPlace, createGame, legalActions, mulberry32 } from '../engine';
import type { SeatColor, WinReason } from '../engine';

export interface SimOptions {
  games: number;
  players: number;
  seed: number;
}

export interface CardRow {
  id: string;
  offered: number;
  bought: number;
  /** bought / offered */
  pickRate: number;
  /** purchases made by the eventual winner / all purchases */
  winRate: number;
}

export interface SimReport {
  options: SimOptions;
  seatWins: number[];
  colorWins: Record<SeatColor, number>;
  /** Games in which the color was seated (a color appears at most once per game). */
  colorGames: Record<SeatColor, number>;
  reasons: Record<WinReason, number>;
  avgRounds: number;
  cards: CardRow[];
}

const ALL_COLORS: SeatColor[] = ['red', 'blue', 'black', 'green', 'yellow'];

/** Seat colors rotate through all five per game so every color meets every
 *  seat position and matchup over the run. */
function seatColors(players: number, gameIndex: number): SeatColor[] {
  return Array.from(
    { length: players },
    (_, i) => ALL_COLORS[(gameIndex + i) % ALL_COLORS.length] as SeatColor,
  );
}

export function simulate(options: SimOptions): SimReport {
  const seatWins = Array<number>(options.players).fill(0);
  const colorWins: Record<SeatColor, number> = { red: 0, blue: 0, black: 0, green: 0, yellow: 0 };
  const colorGames: Record<SeatColor, number> = { red: 0, blue: 0, black: 0, green: 0, yellow: 0 };
  const reasons: Record<WinReason, number> = { points: 0, ko: 0, failsafe: 0 };
  let totalRounds = 0;
  const stats = new Map<string, { offered: number; bought: number; wonWith: number }>();
  const stat = (id: string) => {
    let s = stats.get(id);
    if (!s) {
      s = { offered: 0, bought: 0, wonWith: 0 };
      stats.set(id, s);
    }
    return s;
  };

  for (let g = 0; g < options.games; g++) {
    const rng = mulberry32((options.seed * 0x9e3779b9 + g) >>> 0);
    const colors = seatColors(options.players, g);
    let s = createGame(
      {
        seats: colors.map((color, i) => ({ name: `S${i}`, color })),
        starterBoard: starterBoard(),
        pools: pools(),
      },
      rng,
    );
    const purchases: { id: string; seat: number }[] = [];

    for (let step = 0; step < 50_000; step++) {
      if (legalActions(s).length === 0) break;
      const action = chooseAction(s);
      if (action.type === 'ROLL') {
        // One row per turn: count the roller's current offers.
        for (const card of s.players[s.current]!.shop) {
          if (card) stat(card.id).offered += 1;
        }
      } else if (action.type === 'BUY') {
        const card = s.players[s.current]!.shop[action.shopIndex];
        if (card) purchases.push({ id: card.id, seat: s.current });
      }
      s = applyActionInPlace(s, action, rng);
    }

    if (s.winner === null) throw new Error(`game ${g} did not finish`);
    seatWins[s.winner] = (seatWins[s.winner] ?? 0) + 1;
    for (const color of colors) colorGames[color] += 1;
    colorWins[s.players[s.winner]!.color] += 1;
    reasons[s.winReason!] += 1;
    totalRounds += s.round;
    for (const p of purchases) {
      const row = stat(p.id);
      row.bought += 1;
      if (p.seat === s.winner) row.wonWith += 1;
    }
  }

  const cards: CardRow[] = [...stats.entries()]
    .map(([id, s]) => ({
      id,
      offered: s.offered,
      bought: s.bought,
      pickRate: s.offered > 0 ? s.bought / s.offered : 0,
      winRate: s.bought > 0 ? s.wonWith / s.bought : 0,
    }))
    .sort((a, b) => b.bought - a.bought || a.id.localeCompare(b.id));

  return {
    options,
    seatWins,
    colorWins,
    colorGames,
    reasons,
    avgRounds: totalRounds / options.games,
    cards,
  };
}

const pct = (n: number, of: number) => `${((100 * n) / Math.max(1, of)).toFixed(1)}%`;

export function formatReport(r: SimReport): string {
  const { games, players, seed } = r.options;
  const lines: string[] = [];
  lines.push(`=== ${players} players | ${games} games | seed ${seed} ===`);
  lines.push(
    'wins by seat:   ' + r.seatWins.map((w, i) => `seat${i} ${pct(w, games)}`).join('  '),
  );
  lines.push(
    'color win rate: '
      + ALL_COLORS.map(
        (c) => `${c} ${pct(r.colorWins[c], r.colorGames[c])}`,
      ).join('  ')
      + `  (fair = ${pct(1, players)})`,
  );
  lines.push(
    `win reasons:    points ${pct(r.reasons.points, games)}  ko ${pct(r.reasons.ko, games)}  failsafe ${pct(r.reasons.failsafe, games)}`,
  );
  lines.push(`avg length:     ${r.avgRounds.toFixed(1)} rounds`);
  lines.push('');
  lines.push(
    'card'.padEnd(22) + 'offered'.padStart(8) + 'bought'.padStart(8) + 'pick%'.padStart(8)
      + 'win%'.padStart(8),
  );
  for (const c of r.cards) {
    lines.push(
      c.id.padEnd(22)
        + String(c.offered).padStart(8)
        + String(c.bought).padStart(8)
        + (100 * c.pickRate).toFixed(1).padStart(8)
        + (100 * c.winRate).toFixed(1).padStart(8),
    );
  }
  return lines.join('\n');
}
