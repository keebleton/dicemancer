import { describe, expect, it } from 'vitest';
import { takeBounds } from './sfx';

const SR = 44100;

/** Synth helper: silence and bursts laid out in seconds. */
function clip(parts: { at: number; dur: number; level: number }[], total: number): Float32Array {
  const data = new Float32Array(Math.floor(total * SR));
  for (const p of parts) {
    const s = Math.floor(p.at * SR);
    const e = Math.min(data.length, Math.floor((p.at + p.dur) * SR));
    for (let i = s; i < e; i++) data[i] = p.level * (i % 2 === 0 ? 1 : -1);
  }
  return data;
}

describe('sfx first-take slicing', () => {
  it('cuts a multi-take clip at the first quiet gap', () => {
    // Two 0.3s whooshes separated by 0.5s of silence ("Whoosh x2").
    const data = clip(
      [
        { at: 0.1, dur: 0.3, level: 0.8 },
        { at: 0.9, dur: 0.3, level: 0.8 },
      ],
      1.4,
    );
    const bounds = takeBounds(data, SR);
    expect(bounds).not.toBeNull();
    const [s0, s1] = bounds!;
    expect(s0).toBeLessThanOrEqual(0.1 * SR); // keeps the first take's front
    expect(s1).toBeGreaterThanOrEqual(0.4 * SR); // covers the whole first take
    expect(s1).toBeLessThan(0.9 * SR); // never reaches the second take
  });

  it('leaves a single continuous take alone', () => {
    const data = clip([{ at: 0, dur: 1, level: 0.7 }], 1);
    expect(takeBounds(data, SR)).toBeNull();
  });

  it('trims leading silence even with one take', () => {
    const data = clip([{ at: 0.6, dur: 0.3, level: 0.7 }], 1.2);
    const bounds = takeBounds(data, SR);
    expect(bounds).not.toBeNull();
    expect(bounds![0]).toBeGreaterThan(0.5 * SR);
  });

  it('returns null on pure silence', () => {
    expect(takeBounds(new Float32Array(SR), SR)).toBeNull();
  });
});
