import { describe, expect, it } from 'vitest';
import { seededRng } from '../engine/rng';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  peerIdForRoom,
  roomFromHash,
  roomHash,
} from './roomCode';

describe('room codes', () => {
  it('generates codes of the right length from the unambiguous alphabet', () => {
    const rng = seededRng(42);
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode(rng);
      expect(code).toHaveLength(CODE_LENGTH);
      expect(isValidRoomCode(code)).toBe(true);
    }
    for (const bad of '0O1Il') expect(CODE_ALPHABET).not.toContain(bad);
  });

  it('normalizes typed input and pasted links', () => {
    expect(normalizeRoomCode(' k7q-2zd ')).toBe('K7Q2ZD');
    expect(normalizeRoomCode('https://example.com/#/room/K7Q2ZD')).toBe('K7Q2ZD');
    expect(normalizeRoomCode('example.com/#/room/k7q2zd/')).toBe('K7Q2ZD');
  });

  it('rejects codes with the wrong length or characters', () => {
    expect(isValidRoomCode('K7Q2Z')).toBe(false);
    expect(isValidRoomCode('K7Q2ZDD')).toBe(false);
    expect(isValidRoomCode('K7Q2Z0')).toBe(false);
    expect(isValidRoomCode('k7q2zd')).toBe(false);
  });

  it('round-trips through the URL hash', () => {
    expect(roomFromHash(roomHash('K7Q2ZD'))).toBe('K7Q2ZD');
    expect(roomFromHash('#/room/k7q2zd/')).toBe('K7Q2ZD');
    expect(roomFromHash('#/room/nope')).toBeNull();
    expect(roomFromHash('#/other/K7Q2ZD')).toBeNull();
    expect(roomFromHash('')).toBeNull();
  });

  it('namespaces the peer id', () => {
    expect(peerIdForRoom('K7Q2ZD')).toMatch(/^bship-v1-K7Q2ZD$/);
  });
});
