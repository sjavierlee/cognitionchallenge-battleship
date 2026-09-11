import { useEffect, useState } from 'react';
import { formatClock, remaining, type Clock } from '../engine/clock';
import type { Player } from '../engine/types';

type Props = {
  clock: Clock;
  side: Player;
  /** Whose clock this is, for assistive tech. */
  label: string;
};

const LOW_MS = 10_000;
const TICK_MS = 100;

/** One side's Bullet clock; re-renders itself while ticking so the boards do not have to. */
export function ClockFace({ clock, side, label }: Props) {
  const running = clock.running === side;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [running]);

  // `now` may predate the moment this side started ticking; never show more than it has banked.
  const left = remaining(clock, side, Math.max(now, clock.since));
  const flagged = clock.flagged === side;
  const low = left < LOW_MS && !flagged;
  const text = formatClock(left);
  const className = `clock${running ? ' clock--running' : ''}${low ? ' clock--low' : ''}${
    flagged ? ' clock--flagged' : ''
  }`;

  return (
    <span className={className} role="timer" aria-live="off" aria-label={`${label}: ${text} left`}>
      {text}
    </span>
  );
}
