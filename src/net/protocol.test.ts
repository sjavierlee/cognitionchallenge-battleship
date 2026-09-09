import { describe, expect, it } from 'vitest';
import { decode, encode, sanitizeName, type NetMessage } from './protocol';

const valid: NetMessage[] = [
  { t: 'hello', v: 1, name: 'Ada', session: 'abc' },
  { t: 'ready' },
  { t: 'fire', seq: 0, at: { row: 3, col: 4 } },
  { t: 'result', seq: 0, at: { row: 3, col: 4 }, outcome: 'miss', gameOver: false },
  {
    t: 'result',
    seq: 7,
    at: { row: 0, col: 1 },
    outcome: 'sunk',
    sunk: {
      kind: 'destroyer',
      cells: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
    },
    gameOver: true,
  },
  { t: 'rematch' },
  { t: 'forfeit' },
  { t: 'leave' },
];

describe('protocol', () => {
  it('round-trips every message through encode/decode', () => {
    for (const msg of valid) {
      expect(decode(encode(msg))).toEqual(msg);
      expect(decode(JSON.parse(encode(msg)))).toEqual(msg);
    }
  });

  it('rejects garbage, unknown types and malformed payloads', () => {
    const bad: unknown[] = [
      'not json',
      42,
      null,
      [],
      { t: 'nuke' },
      { t: 'fire', seq: -1, at: { row: 0, col: 0 } },
      { t: 'fire', seq: 1.5, at: { row: 0, col: 0 } },
      { t: 'fire', seq: 1, at: { row: 10, col: 0 } },
      { t: 'fire', seq: 1, at: { row: '1', col: 0 } },
      { t: 'result', seq: 1, at: { row: 0, col: 0 }, outcome: 'boom', gameOver: false },
      { t: 'result', seq: 1, at: { row: 0, col: 0 }, outcome: 'miss' },
      // outcome/sunk mismatch
      { t: 'result', seq: 1, at: { row: 0, col: 0 }, outcome: 'sunk', gameOver: false },
      {
        t: 'result',
        seq: 1,
        at: { row: 0, col: 0 },
        outcome: 'hit',
        gameOver: false,
        sunk: {
          kind: 'destroyer',
          cells: [
            { row: 0, col: 0 },
            { row: 0, col: 1 },
          ],
        },
      },
      // wrong number of cells for the ship class
      {
        t: 'result',
        seq: 1,
        at: { row: 0, col: 0 },
        outcome: 'sunk',
        gameOver: false,
        sunk: { kind: 'carrier', cells: [{ row: 0, col: 0 }] },
      },
      { t: 'hello', v: '1', name: 'x', session: 's' },
      { t: 'hello', v: 1, name: 'x', session: '' },
    ];
    for (const msg of bad) expect(decode(msg), JSON.stringify(msg)).toBeNull();
  });

  it('strips unknown fields and sanitizes names', () => {
    expect(decode({ t: 'ready', extra: 1 })).toEqual({ t: 'ready' });
    expect(decode({ t: 'hello', v: 1, name: '   ', session: 's' })).toEqual({
      t: 'hello',
      v: 1,
      name: 'Captain',
      session: 's',
    });
    expect(sanitizeName('  Long   Name  ')).toBe('Long Name');
    expect(sanitizeName('x'.repeat(50))).toHaveLength(24);
    expect(sanitizeName('')).toBe('Captain');
  });
});
