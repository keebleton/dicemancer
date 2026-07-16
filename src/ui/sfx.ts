// Sound kit: real recordings dropped in public/sfx override the synthesized
// fallbacks automatically (same-name lookup, .mp3 then .ogg then .wav; a
// missing file means the synth keeps playing). Expected names:
//   dice, coin, points, heal, buy, win,
//   damage (generic) and damage_red / _blue / _black / _green / _yellow
//   (the color of the CARD that dealt the hit picks the voice).
// Guarded so it no-ops headless (tests) and respects a persisted mute flag.
import type { Action, CardColor, Effect, GameState } from '../engine';
import type { StatPulse } from './store';

let ctx: AudioContext | null = null;
let mutedFlag = (() => {
  try {
    return globalThis.localStorage?.getItem('dicemancer_muted') === '1';
  } catch {
    return false;
  }
})();

export const isMuted = () => mutedFlag;
export function setMuted(m: boolean) {
  mutedFlag = m;
  try {
    globalThis.localStorage?.setItem('dicemancer_muted', m ? '1' : '0');
  } catch {
    // session-only mute
  }
}

function ac(): AudioContext | null {
  if (mutedFlag) return null;
  try {
    if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// ---- Sample lookup (public/sfx). A name is fetched once; 'missing' is
// remembered so absent files cost one failed request, not one per play.
const SAMPLE_EXTS = ['mp3', 'ogg', 'wav'];
const sampleBase = (() => {
  try {
    return (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  } catch {
    return '/';
  }
})();
const samples = new Map<string, AudioBuffer | 'loading' | 'missing'>();

function ensureSample(name: string): void {
  if (samples.has(name)) return;
  const c = ac();
  if (!c || typeof fetch === 'undefined') return;
  samples.set(name, 'loading');
  void (async () => {
    for (const ext of SAMPLE_EXTS) {
      try {
        const res = await fetch(`${sampleBase}sfx/${name}.${ext}`);
        if (!res.ok) continue;
        // Dev servers answer unknown paths with index.html (a 200); decode
        // rejects that, which correctly falls through to the next candidate.
        const buf = await c.decodeAudioData(await res.arrayBuffer());
        samples.set(name, buf);
        return;
      } catch {
        // try the next extension
      }
    }
    samples.set(name, 'missing');
  })();
}

/** True = a real recording played; false = caller should run the synth. */
function playSample(name: string, gain = 0.5): boolean {
  const c = ac();
  if (!c) return false;
  const b = samples.get(name);
  if (b === undefined) {
    ensureSample(name);
    return false; // very first call: the synth covers while the file loads
  }
  if (b === 'loading' || b === 'missing') return false;
  const src = c.createBufferSource();
  src.buffer = b;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(c.destination);
  src.start();
  return true;
}

const ALL_SAMPLES = [
  'dice',
  'coin',
  'points',
  'heal',
  'buy',
  'win',
  'damage',
  'damage_red',
  'damage_blue',
  'damage_black',
  'damage_green',
  'damage_yellow',
];
// Warm the cache on the first interaction so even the first roll plays real.
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => ALL_SAMPLES.forEach(ensureSample), { once: true });
}

function tone(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number } = {},
) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.05, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function rattle(dur: number, gain: number, delay = 0) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2200;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(filter);
  filter.connect(g);
  g.connect(c.destination);
  src.start(t0);
}

export const sfx = {
  roll() {
    if (playSample('dice', 0.5)) return;
    rattle(0.05, 0.1);
    rattle(0.05, 0.08, 0.07);
    rattle(0.04, 0.05, 0.13);
  },
  coin() {
    if (playSample('coin', 0.4)) return;
    tone(880, 0.09, { gain: 0.04 });
    tone(1320, 0.12, { gain: 0.035, delay: 0.06 });
  },
  points() {
    if (playSample('points', 0.45)) return;
    tone(1047, 0.1, { gain: 0.045 });
    tone(1568, 0.14, { gain: 0.04, delay: 0.08 });
  },
  /** color = the card that dealt the hit; picks its damage voice. */
  hurt(color?: CardColor) {
    if (color && playSample(`damage_${color}`, 0.55)) return;
    if (playSample('damage', 0.55)) return;
    tone(140, 0.16, { type: 'triangle', gain: 0.09, slide: 75 });
  },
  heal() {
    if (playSample('heal', 0.4)) return;
    tone(523, 0.14, { gain: 0.035, slide: 700 });
  },
  buy() {
    if (playSample('buy', 0.35)) return;
    tone(660, 0.07, { type: 'square', gain: 0.025 });
    tone(440, 0.1, { type: 'square', gain: 0.025, delay: 0.07 });
  },
  click() {
    tone(520, 0.04, { type: 'square', gain: 0.018 });
  },
  freeze() {
    tone(1400, 0.22, { gain: 0.035, slide: 500 });
  },
  win() {
    if (playSample('win', 0.5)) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { gain: 0.05, delay: i * 0.11 }));
  },
};

/** Does this effect tree contain a damage line anywhere? */
function dealsDamage(list: Effect[]): boolean {
  return list.some(
    (e) =>
      e.kind === 'damage' ||
      ((e.kind === 'conditional' || e.kind === 'trade' || e.kind === 'charge') &&
        dealsDamage(e.then)),
  );
}

/** Best guess at which card's color dealt the hit, for the damage voice.
 *  Sound-only, so a wrong guess is harmless; null falls back to generic. */
function damageColor(action: Action, prev: GameState, next: GameState): CardColor | null {
  // A targeted hit paused at the queue head: its slot names the card.
  if (action.type === 'CHOOSE_TARGET') {
    const q = prev.pendingEffects?.[0];
    if (q && q.slot !== undefined) {
      return prev.players[q.owner]?.board[q.slot - 1]?.color ?? null;
    }
    return null;
  }
  const roller = next.players[next.current];
  const numbers = next.lastAllocation?.numbers ?? [];
  if (!roller || numbers.length === 0) return null;
  // The roller's own fired cards first...
  for (const n of numbers) {
    const card = roller.board[n - 1];
    if (card && dealsDamage(card.active)) return card.color;
  }
  // ...then opponents' echoes that heard the roll (echo damage bites the
  // roller). High echoes also hear the sum.
  const heard = [...numbers];
  const dice = next.dice;
  if (dice && next.tunables.highEchoHearsSum) heard.push(dice[0] + dice[1]);
  for (const p of next.players) {
    if (p === roller) continue;
    for (const e of p.echoStack) {
      if (heard.includes(e.slot) && dealsDamage(e.def.echo)) return e.def.color;
    }
  }
  return null;
}

/** One place decides what a dispatch sounds like; the store calls this. */
export function playForDispatch(
  action: Action,
  prev: GameState,
  next: GameState,
  pulses: StatPulse[],
): void {
  if (action.type === 'ROLL') sfx.roll();
  else if (action.type === 'BUY' || action.type === 'BUY_MARKET') sfx.buy();
  else if (action.type === 'FREEZE_SHOP') sfx.freeze();
  else if (action.type === 'SPEND_TOKEN' || action.type === 'SKIP_BUY') sfx.click();
  else if (
    action.type === 'ALLOCATE' ||
    action.type === 'CHOOSE_TARGET' ||
    action.type === 'ECHO_CHOICE'
  ) {
    if (pulses.some((p) => p.stat === 'hp' && p.delta < 0)) {
      sfx.hurt(damageColor(action, prev, next) ?? undefined);
    }
    if (pulses.some((p) => p.stat === 'money' && p.delta > 0)) sfx.coin();
    if (pulses.some((p) => p.stat === 'points' && p.delta > 0)) sfx.points();
    if (pulses.some((p) => p.stat === 'hp' && p.delta > 0)) sfx.heal();
  }
  if (next.winner !== null && prev.winner === null) sfx.win();
}
