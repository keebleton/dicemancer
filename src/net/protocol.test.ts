import { describe, expect, it } from 'vitest';
import { applyAction, mulberry32 } from '../engine';
import { diceRng, newGame } from '../engine/test-helpers';
import { buildSeats, isLegalIntent, makeRoomCode, normalizeRoomCode } from './protocol';

describe('room codes', () => {
  it('are 4 chars from the unambiguous alphabet', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      const code = makeRoomCode(() => rand.next());
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    }
  });

  it('normalize trims and uppercases', () => {
    expect(normalizeRoomCode(' abcd ')).toBe('ABCD');
  });
});

describe('isLegalIntent (the host gate)', () => {
  it('rejects actions from the wrong seat and off-menu actions', () => {
    const s = newGame(2); // roll phase, seat 0 to act
    expect(isLegalIntent(s, 1, { type: 'ROLL' })).toBe(false); // not your turn
    expect(isLegalIntent(s, 0, { type: 'END_TURN' })).toBe(false); // not legal now
    expect(isLegalIntent(s, 0, { type: 'ROLL' })).toBe(true);
  });

  it('routes echo decisions to the opponent, not the roller', () => {
    let s = newGame(2);
    s.players[1]!.echoStack.push({
      slot: 4,
      def: {
        id: 'e4',
        name: 'e4',
        color: 'colorless',
        rarity: 'common',
        cost: 3,
        legalSlots: [4],
        active: [],
        echo: [{ kind: 'gainMoney', amount: 1 }],
      },
    });
    s = applyAction(s, { type: 'ROLL' }, diceRng(4, 5));
    s = applyAction(s, { type: 'ALLOCATE', mode: 'individual' }, mulberry32(1));
    expect(s.phase).toBe('echoChoice');
    expect(isLegalIntent(s, 0, { type: 'ECHO_CHOICE', mode: 'sum' })).toBe(false);
    expect(isLegalIntent(s, 1, { type: 'ECHO_CHOICE', mode: 'sum' })).toBe(true);
  });
});

describe('buildSeats', () => {
  it('host first, clients in join order, bots fill the tail', () => {
    const { names, kinds } = buildSeats('Jake', ['Sam'], 2);
    expect(names).toEqual(['Jake', 'Sam', 'Bot 1', 'Bot 2']);
    expect(kinds).toEqual(['human', 'human', 'bot', 'bot']);
  });

  it('dedupes twin names and defaults empties', () => {
    const { names } = buildSeats('Jake', ['Jake', '  '], 0);
    expect(names).toEqual(['Jake', 'Jake 2', 'Player']);
  });
});
