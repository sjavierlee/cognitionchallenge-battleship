import type { Player } from './types';

/** Bullet time control: each side gets this much for the whole game, ticking only on its turn. */
export const BULLET_MS = 60_000;

export type Clock = {
  /** Time left on each side, exact for a stopped side and as of `since` for the running one. */
  player: number;
  opponent: number;
  /** Whose time is ticking, or null while the clock is stopped. */
  running: Player | null;
  /** Timestamp (ms) at which `running` started ticking. */
  since: number;
  /** The side that ran out of time, once the game ended on the clock. */
  flagged: Player | null;
};

export function createClock(ms = BULLET_MS): Clock {
  return { player: ms, opponent: ms, running: null, since: 0, flagged: null };
}

/** Time left for `who` at `now`, never below zero. */
export function remaining(clock: Clock, who: Player, now: number): number {
  const stored = clock[who];
  const left = clock.running === who ? stored - (now - clock.since) : stored;
  return Math.max(0, left);
}

/** Banks the running side's elapsed time and stops the clock. */
export function stopClock(clock: Clock, now: number): Clock {
  if (!clock.running) return clock;
  return { ...clock, [clock.running]: remaining(clock, clock.running, now), running: null };
}

/** Stops whoever is running and starts `who` ticking from `now`. */
export function runClock(clock: Clock, who: Player | null, now: number): Clock {
  if (clock.running === who) return clock;
  const stopped = stopClock(clock, now);
  return who ? { ...stopped, running: who, since: now } : stopped;
}

/** Ends the clock with `who` out of time. */
export function flagClock(clock: Clock, who: Player, now: number): Clock {
  return { ...stopClock(clock, now), [who]: 0, flagged: who };
}

/** `m:ss` above ten seconds, `s.t` with tenths below it — the usual chess-clock display. */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped >= 10_000) {
    const totalSeconds = Math.ceil(clamped / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  return (Math.floor(clamped / 100) / 10).toFixed(1);
}
