import type { Difficulty } from '../ai/huntTarget';

export type Tally = { wins: number; losses: number };

export type GameRecord = Tally & { perDifficulty: Record<Difficulty, Tally> };

export const RECORD_KEY = 'battleship.record';
export const SOUND_KEY = 'battleship.sound';

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

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadRecord(): GameRecord {
  const raw = storage()?.getItem(RECORD_KEY);
  if (!raw) return emptyRecord();
  try {
    const parsed = JSON.parse(raw) as Partial<GameRecord>;
    const base = emptyRecord();
    return {
      wins: parsed.wins ?? 0,
      losses: parsed.losses ?? 0,
      perDifficulty: { ...base.perDifficulty, ...(parsed.perDifficulty ?? {}) },
    };
  } catch {
    return emptyRecord();
  }
}

export function saveRecord(record: GameRecord): void {
  storage()?.setItem(RECORD_KEY, JSON.stringify(record));
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

export function clearRecord(): void {
  storage()?.removeItem(RECORD_KEY);
}

export function loadSoundEnabled(): boolean {
  return storage()?.getItem(SOUND_KEY) === 'on';
}

export function saveSoundEnabled(on: boolean): void {
  storage()?.setItem(SOUND_KEY, on ? 'on' : 'off');
}
