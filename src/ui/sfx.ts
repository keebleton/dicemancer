// Tiny synthesized sound kit. No audio assets, everything is WebAudio math.
// Guarded so it no-ops headless (tests) and respects a persisted mute flag.
import type { Action, GameState } from '../engine';
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
    rattle(0.05, 0.1);
    rattle(0.05, 0.08, 0.07);
    rattle(0.04, 0.05, 0.13);
  },
  coin() {
    tone(880, 0.09, { gain: 0.04 });
    tone(1320, 0.12, { gain: 0.035, delay: 0.06 });
  },
  points() {
    tone(1047, 0.1, { gain: 0.045 });
    tone(1568, 0.14, { gain: 0.04, delay: 0.08 });
  },
  hurt() {
    tone(140, 0.16, { type: 'triangle', gain: 0.09, slide: 75 });
  },
  heal() {
    tone(523, 0.14, { gain: 0.035, slide: 700 });
  },
  buy() {
    tone(660, 0.07, { type: 'square', gain: 0.025 });
    tone(440, 0.1, { type: 'square', gain: 0.025, delay: 0.07 });
  },
  click() {
    tone(520, 0.04, { type: 'square', gain: 0.018 });
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { gain: 0.05, delay: i * 0.11 }));
  },
};

/** One place decides what a dispatch sounds like; the store calls this. */
export function playForDispatch(
  action: Action,
  prev: GameState,
  next: GameState,
  pulses: StatPulse[],
): void {
  if (action.type === 'ROLL') sfx.roll();
  else if (action.type === 'BUY' || action.type === 'BUY_MARKET') sfx.buy();
  else if (action.type === 'SPEND_TOKEN' || action.type === 'SKIP_BUY') sfx.click();
  else if (
    action.type === 'ALLOCATE' ||
    action.type === 'CHOOSE_TARGET' ||
    action.type === 'ECHO_CHOICE'
  ) {
    if (pulses.some((p) => p.stat === 'hp' && p.delta < 0)) sfx.hurt();
    if (pulses.some((p) => p.stat === 'money' && p.delta > 0)) sfx.coin();
    if (pulses.some((p) => p.stat === 'points' && p.delta > 0)) sfx.points();
    if (pulses.some((p) => p.stat === 'hp' && p.delta > 0)) sfx.heal();
  }
  if (next.winner !== null && prev.winner === null) sfx.win();
}
