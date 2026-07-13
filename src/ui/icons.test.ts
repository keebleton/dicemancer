import { describe, expect, it } from 'vitest';
import type { Effect } from '../engine';
import { aggregateEchoEffects } from './icons';

const money = (amount: number): Effect => ({ kind: 'gainMoney', amount });

describe('echo aggregation', () => {
  it('sums same-kind echoes into one entry (two +1 money = coin 2)', () => {
    expect(aggregateEchoEffects([[money(1)], [money(1)]])).toEqual([money(2)]);
  });

  it('sums across kinds and keeps conditionals un-merged', () => {
    const cond: Effect = { kind: 'conditional', when: { sumAtLeast: 9 }, then: [money(1)] };
    const lines: Effect[][] = [
      [money(1), { kind: 'damage', amount: 1, target: 'roller' }],
      [{ kind: 'damage', amount: 2, target: 'roller' }, { kind: 'gainPoints', amount: 1 }],
      [cond],
    ];
    expect(aggregateEchoEffects(lines)).toEqual([
      money(1),
      { kind: 'gainPoints', amount: 1 },
      { kind: 'damage', amount: 3, target: 'roller' },
      cond,
    ]);
  });

  it('returns empty for no echoes', () => {
    expect(aggregateEchoEffects([])).toEqual([]);
  });
});
