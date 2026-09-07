import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearRecord,
  commitResult,
  emptyRecord,
  loadRecord,
  loadSoundEnabled,
  RECORD_KEY,
  saveRecord,
  saveSoundEnabled,
} from './record';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('loadRecord', () => {
  it('round-trips a saved record', () => {
    const rec = emptyRecord();
    rec.wins = 3;
    rec.perDifficulty.hard.wins = 3;
    saveRecord(rec);
    expect(loadRecord()).toEqual(rec);
  });

  it.each([
    'not json',
    '42',
    'null',
    '{"wins":"3","losses":-1}',
    '{"wins":1,"perDifficulty":null}',
    '{"wins":1,"perDifficulty":{"easy":null,"normal":"x","hard":{"wins":2}}}',
  ])('normalizes malformed storage %s', (raw) => {
    localStorage.setItem(RECORD_KEY, raw);
    const rec = loadRecord();
    expect(rec.perDifficulty.easy).toEqual({ wins: 0, losses: 0 });
    expect(rec.perDifficulty.normal).toEqual({ wins: 0, losses: 0 });
    expect(Number.isFinite(rec.wins) && rec.wins >= 0).toBe(true);
    expect(Number.isFinite(rec.losses) && rec.losses >= 0).toBe(true);
    // Recording a result on the normalized record must not throw.
    expect(() => commitResult('easy', true)).not.toThrow();
  });

  it('keeps valid tallies while dropping invalid ones', () => {
    localStorage.setItem(
      RECORD_KEY,
      JSON.stringify({ wins: 2, losses: 1, perDifficulty: { hard: { wins: 2, losses: 1.7 } } }),
    );
    expect(loadRecord()).toEqual({
      wins: 2,
      losses: 1,
      perDifficulty: {
        easy: { wins: 0, losses: 0 },
        normal: { wins: 0, losses: 0 },
        hard: { wins: 2, losses: 1 },
      },
    });
  });
});

describe('commitResult', () => {
  it('applies the result on top of the latest persisted record', () => {
    // Simulate another tab having recorded a win since this tab loaded.
    const other = emptyRecord();
    other.wins = 1;
    other.perDifficulty.normal.wins = 1;
    saveRecord(other);

    const next = commitResult('normal', false);
    expect(next.wins).toBe(1);
    expect(next.losses).toBe(1);
    expect(next.perDifficulty.normal).toEqual({ wins: 1, losses: 1 });
    expect(loadRecord()).toEqual(next);
  });
});

describe('storage failures', () => {
  it('never throws when localStorage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(loadRecord()).toEqual(emptyRecord());
    expect(loadSoundEnabled()).toBe(false);
    expect(() => saveSoundEnabled(true)).not.toThrow();
    expect(() => clearRecord()).not.toThrow();
    expect(commitResult('hard', true).wins).toBe(1);
  });
});
