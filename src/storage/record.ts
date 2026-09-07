import { DIFFICULTIES, type Difficulty } from '../ai/huntTarget';

export type Tally = { wins: number; losses: number };

export type GameRecord = Tally & { perDifficulty: Record<Difficulty, Tally> };

export const RECORD_KEY = 'battleship.record';
export const SOUND_KEY = 'battleship.sound';
export const THEME_KEY = 'battleship.theme';

export type ThemePreference = 'light' | 'dark' | 'system';

export function emptyRecord(): GameRecord {
  return {
    wins: 0,
    losses: 0,
    perDifficulty: {
      easy: { wins: 0, losses: 0 },
      normal: { wins: 0, losses: 0 },
      hard: { wins: 0, losses: 0 },
    },
  };
}

/** Storage access is best-effort: blocked/full/private-mode storage must never break the game. */
function read(key: string): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function tally(value: unknown): Tally {
  const obj = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return { wins: count(obj.wins), losses: count(obj.losses) };
}

export function loadRecord(): GameRecord {
  const raw = read(RECORD_KEY);
  if (!raw) return emptyRecord();
  try {
    const parsed: unknown = JSON.parse(raw);
    const obj =
      typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    const per =
      typeof obj.perDifficulty === 'object' && obj.perDifficulty !== null
        ? (obj.perDifficulty as Record<string, unknown>)
        : {};
    const perDifficulty = emptyRecord().perDifficulty;
    for (const { id } of DIFFICULTIES) perDifficulty[id] = tally(per[id]);
    return { ...tally(obj), perDifficulty };
  } catch {
    return emptyRecord();
  }
}

export function saveRecord(record: GameRecord): void {
  write(RECORD_KEY, JSON.stringify(record));
}

export function recordResult(record: GameRecord, difficulty: Difficulty, won: boolean): GameRecord {
  const key = won ? 'wins' : 'losses';
  return {
    ...record,
    [key]: record[key] + 1,
    perDifficulty: {
      ...record.perDifficulty,
      [difficulty]: {
        ...record.perDifficulty[difficulty],
        [key]: record.perDifficulty[difficulty][key] + 1,
      },
    },
  };
}

/**
 * Applies a result on top of the latest persisted record (not a possibly stale in-memory copy),
 * so games finished in other tabs are not overwritten. Returns the saved record.
 */
export function commitResult(difficulty: Difficulty, won: boolean): GameRecord {
  const next = recordResult(loadRecord(), difficulty, won);
  saveRecord(next);
  return next;
}

export function clearRecord(): void {
  write(RECORD_KEY, null);
}

export function loadSoundEnabled(): boolean {
  return read(SOUND_KEY) === 'on';
}

export function saveSoundEnabled(on: boolean): void {
  write(SOUND_KEY, on ? 'on' : 'off');
}

export function loadThemePreference(): ThemePreference {
  const raw = read(THEME_KEY);
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

export function saveThemePreference(pref: ThemePreference): void {
  write(THEME_KEY, pref === 'system' ? null : pref);
}
