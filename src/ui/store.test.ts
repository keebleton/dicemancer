import { describe, expect, it } from 'vitest';
import { legalActions, mulberry32 } from '../engine';
import { useGame } from './store';

describe('ui store', () => {
  it('plays a complete game start-to-win through dispatch alone', () => {
    useGame.getState().start(2, 25, 12345);
    const policy = mulberry32(777);
    for (let i = 0; i < 20_000; i++) {
      const game = useGame.getState().game!;
      const actions = legalActions(game);
      if (actions.length === 0) break;
      useGame.getState().dispatch(actions[Math.floor(policy.next() * actions.length)]!);
    }
    const final = useGame.getState().game!;
    expect(final.winner).not.toBeNull();
    expect(useGame.getState().log.length).toBeGreaterThan(0);
  });

  it('never mutates a previous state object (all changes go through applyAction)', () => {
    useGame.getState().start(2, 25, 42);
    const before = useGame.getState().game!;
    const snapshot = JSON.parse(JSON.stringify(before));
    useGame.getState().dispatch({ type: 'ROLL' });
    expect(before).toEqual(snapshot); // old state untouched
    expect(useGame.getState().game).not.toBe(before); // new object swapped in
  });
});
