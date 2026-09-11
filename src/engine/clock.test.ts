import { describe, expect, it } from 'vitest';
import {
  BULLET_MS,
  createClock,
  flagClock,
  formatClock,
  remaining,
  runClock,
  stopClock,
} from './clock';

describe('clock', () => {
  it('starts both sides at the full Bullet allowance, stopped', () => {
    const c = createClock();
    expect(c).toEqual({
      player: BULLET_MS,
      opponent: BULLET_MS,
      running: null,
      since: 0,
      flagged: null,
    });
    expect(remaining(c, 'player', 123_456)).toBe(BULLET_MS);
    expect(remaining(c, 'opponent', 123_456)).toBe(BULLET_MS);
  });

  it('only charges the running side, from wall-clock time rather than ticks', () => {
    let c = runClock(createClock(), 'player', 1_000);
    expect(remaining(c, 'player', 1_000)).toBe(BULLET_MS);
    expect(remaining(c, 'player', 13_500)).toBe(BULLET_MS - 12_500);
    expect(remaining(c, 'opponent', 13_500)).toBe(BULLET_MS);

    // Switching sides banks the elapsed time and starts the other side from that moment.
    c = runClock(c, 'opponent', 13_500);
    expect(c.player).toBe(BULLET_MS - 12_500);
    expect(c.running).toBe('opponent');
    expect(c.since).toBe(13_500);
    expect(remaining(c, 'player', 20_000)).toBe(BULLET_MS - 12_500);
    expect(remaining(c, 'opponent', 20_000)).toBe(BULLET_MS - 6_500);

    // Running the same side again is a no-op (no double-charging on repeated syncs).
    expect(runClock(c, 'opponent', 25_000)).toBe(c);
  });

  it('stopping banks time; stopping a stopped clock changes nothing', () => {
    const c = runClock(createClock(), 'player', 0);
    const stopped = stopClock(c, 4_000);
    expect(stopped.running).toBeNull();
    expect(stopped.player).toBe(BULLET_MS - 4_000);
    expect(remaining(stopped, 'player', 999_999)).toBe(BULLET_MS - 4_000);
    expect(stopClock(stopped, 5_000)).toBe(stopped);
    expect(runClock(stopped, null, 5_000)).toBe(stopped);
  });

  it('never reports negative time', () => {
    const c = runClock(createClock(), 'player', 0);
    expect(remaining(c, 'player', BULLET_MS + 5_000)).toBe(0);
    expect(stopClock(c, BULLET_MS + 5_000).player).toBe(0);
  });

  it('flagging zeroes the loser, stops the clock and records who fell', () => {
    const c = runClock(createClock(), 'opponent', 0);
    const f = flagClock(c, 'opponent', BULLET_MS + 10);
    expect(f.running).toBeNull();
    expect(f.opponent).toBe(0);
    expect(f.player).toBe(BULLET_MS);
    expect(f.flagged).toBe('opponent');
  });

  it('formats like a chess clock: m:ss above ten seconds, tenths below', () => {
    expect(formatClock(60_000)).toBe('1:00');
    expect(formatClock(59_999)).toBe('1:00');
    expect(formatClock(59_000)).toBe('0:59');
    expect(formatClock(10_000)).toBe('0:10');
    expect(formatClock(9_999)).toBe('9.9');
    expect(formatClock(9_950)).toBe('9.9');
    expect(formatClock(1_000)).toBe('1.0');
    expect(formatClock(50)).toBe('0.0');
    expect(formatClock(0)).toBe('0.0');
    expect(formatClock(-500)).toBe('0.0');
  });
});
