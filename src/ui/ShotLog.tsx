import { coordLabel } from '../engine/coords';
import { shipSpec } from '../engine/ships';
import type { ShotResult } from '../engine/types';

type Props = { log: ShotResult[]; opponentLabel?: string };

function outcomeText(shot: ShotResult): string {
  if (shot.outcome === 'sunk' && shot.sunk) return `Sunk ${shipSpec(shot.sunk).name}`;
  return shot.outcome === 'hit' ? 'Hit' : 'Miss';
}

export function ShotLog({ log, opponentLabel = 'AI' }: Props) {
  return (
    <aside className="panel shot-log" aria-label="Shot history">
      <div className="panel-head">
        <h2 className="panel-title">Shot log</h2>
        <span className="panel-meta tabular">{log.length} shots</span>
      </div>
      {log.length === 0 ? (
        <p className="shot-log-empty">No shots fired yet. Pick a square in enemy waters.</p>
      ) : (
        <ol className="shot-log-list" aria-live="polite" aria-label="Shots fired">
          {log
            .map((shot, i) => ({ shot, n: i + 1 }))
            .reverse()
            .map(({ shot, n }) => (
              <li
                key={n}
                className={`shot-log-item shot-log-item--${shot.by} shot-log-item--${shot.outcome}`}
              >
                <span className="shot-log-n">{n}</span>
                <span className="shot-log-by">{shot.by === 'player' ? 'You' : opponentLabel}</span>
                <span className="shot-log-at">{coordLabel(shot.at)}</span>
                <span className="shot-log-outcome">
                  <span className="shot-log-dot" aria-hidden="true" />
                  {outcomeText(shot)}
                </span>
              </li>
            ))}
        </ol>
      )}
    </aside>
  );
}
