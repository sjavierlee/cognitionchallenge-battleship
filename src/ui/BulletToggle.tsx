import { BULLET_MS } from '../engine/clock';
import { BoltIcon } from './icons';

type Props = {
  on: boolean;
  onChange: (on: boolean) => void;
  /** Shown as a read-only badge, e.g. for a guest whose host owns the setting. */
  locked?: boolean;
  /** Who controls the setting when locked. */
  lockedBy?: string;
};

const MINUTES = Math.round(BULLET_MS / 60_000);

/** Lobby switch for Bullet Battleship: one minute per side for the whole game. */
export function BulletToggle({ on, onChange, locked = false, lockedBy }: Props) {
  if (locked) {
    return (
      <div className={`panel bullet bullet--locked${on ? ' bullet--on' : ''}`} role="status">
        <span className="bullet-mark" aria-hidden="true">
          <BoltIcon />
        </span>
        <span className="bullet-text">
          <span className="bullet-label">Bullet {on ? 'on' : 'off'}</span>
          <span className="bullet-blurb">
            {on
              ? `${MINUTES} minute each for the whole game — run out and you lose.`
              : `No clocks this game. ${lockedBy ?? 'The host'} chooses.`}
          </span>
        </span>
      </div>
    );
  }
  return (
    <label className={`panel bullet${on ? ' bullet--on' : ''}`}>
      <span className="bullet-mark" aria-hidden="true">
        <BoltIcon />
      </span>
      <span className="bullet-text">
        <span className="bullet-label">Bullet Battleship</span>
        <span className="bullet-blurb">
          {MINUTES} minute each for the whole game — run out and you lose. Separate record.
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="bullet-input"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        aria-label="Bullet mode: one minute per player"
      />
      <span className="switch" aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </label>
  );
}
