import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearRecord,
  commitResult,
  controlRecord,
  emptyRecord,
  loadRecord,
  loadSoundEnabled,
  loadThemePreference,
  RECORD_KEY,
  saveRecord,
  saveSoundEnabled,
  saveThemePreference,
  THEME_KEY,
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
      friend: { wins: 0, losses: 0 },
      bullet: emptyRecord().bullet,
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

describe('Bullet record', () => {
  it('keeps Bullet and Standard results in separate ledgers', () => {
    commitResult('normal', true);
    commitResult('normal', false, 'bullet');
    commitResult('friend', true, 'bullet');
    const rec = loadRecord();

    expect(rec.wins).toBe(1);
    expect(rec.losses).toBe(0);
    expect(rec.perDifficulty.normal).toEqual({ wins: 1, losses: 0 });
    expect(rec.friend).toEqual({ wins: 0, losses: 0 });

    expect(rec.bullet.wins).toBe(1);
    expect(rec.bullet.losses).toBe(1);
    expect(rec.bullet.perDifficulty.normal).toEqual({ wins: 0, losses: 1 });
    expect(rec.bullet.friend).toEqual({ wins: 1, losses: 0 });

    expect(controlRecord(rec, 'standard')).toBe(rec);
    expect(controlRecord(rec, 'bullet')).toBe(rec.bullet);
  });

  it('loads records saved before Bullet existed and repairs a malformed Bullet ledger', () => {
    localStorage.setItem(RECORD_KEY, JSON.stringify({ wins: 3, losses: 2 }));
    expect(loadRecord().bullet).toEqual(emptyRecord().bullet);

    localStorage.setItem(
      RECORD_KEY,
      JSON.stringify({ wins: 3, losses: 2, bullet: { wins: 'lots', friend: { wins: 2 } } }),
    );
    const rec = loadRecord();
    expect(rec.wins).toBe(3);
    expect(rec.bullet.wins).toBe(0);
    expect(rec.bullet.friend).toEqual({ wins: 2, losses: 0 });
  });

  it('clears one time control without touching the other', () => {
    commitResult('easy', true);
    commitResult('easy', true, 'bullet');

    clearRecord('bullet');
    let rec = loadRecord();
    expect(rec.wins).toBe(1);
    expect(rec.bullet).toEqual(emptyRecord().bullet);

    commitResult('easy', false, 'bullet');
    clearRecord('standard');
    rec = loadRecord();
    expect(rec.wins).toBe(0);
    expect(rec.perDifficulty.easy).toEqual({ wins: 0, losses: 0 });
    expect(rec.bullet.losses).toBe(1);

    clearRecord();
    expect(loadRecord()).toEqual(emptyRecord());
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

describe('theme preference', () => {
  it('defaults to system and only stores explicit choices', () => {
    expect(loadThemePreference()).toBe('system');
    saveThemePreference('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(loadThemePreference()).toBe('dark');
    saveThemePreference('system');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('ignores unknown stored values', () => {
    localStorage.setItem(THEME_KEY, 'sepia');
    expect(loadThemePreference()).toBe('system');
  });
});
