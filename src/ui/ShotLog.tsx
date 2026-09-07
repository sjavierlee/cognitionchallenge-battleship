import { coordLabel } from '../engine/coords';
import { shipSpec } from '../engine/ships';
import type { ShotResult } from '../engine/types';

type Props = { log: ShotResult[] };

function outcomeText(shot: ShotResult): string {
  if (shot.outcome === 'sunk' && shot.sunk) return `Sunk ${shipSpec(shot.sunk).name}`;
  return shot.outcome === 'hit' ? 'Hit' : 'Miss';
}

export function ShotLog({ log }: Props) {
  return (
    <aside className="shot-log" aria-label="Shot history">
      <h2 className="shot-log-title">Shot log</h2>
      {log.length === 0 ? (
        <p className="shot-log-empty">No shots fired yet.</p>
      ) : (
        <ol className="shot-log-list" aria-live="polite">
          {log
            .map((shot, i) => ({ shot, n: i + 1 }))
            .reverse()
            .map(({ shot, n }) => (
              <li
                key={n}
                className={`shot-log-item shot-log-item--${shot.by} shot-log-item--${shot.outcome}`}
              >
                <span className="shot-log-n">#{n}</span>
                <span className="shot-log-by">{shot.by === 'player' ? 'You' : 'AI'}</span>
                <span className="shot-log-at">{coordLabel(shot.at)}</span>
                <span className="shot-log-outcome">{outcomeText(shot)}</span>
              </li>
            ))}
        </ol>
      )}
    </aside>
  );
}
