import { coordKey, coordLabel } from '../engine/coords';
import type { Board as BoardModel, CellState, Coord, Outcome } from '../engine/types';

export type Preview = { cells: Coord[]; valid: boolean } | null;

export type LastShot = { at: Coord; outcome: Outcome; seq: number } | null;

type Props = {
  title: string;
  board: BoardModel;
  /** Show unhit ship cells (own board) or hide them (enemy board). */
  showShips: boolean;
  disabled?: boolean;
  active?: boolean;
  preview?: Preview;
  lastShot?: LastShot;
  onCellClick?: (at: Coord) => void;
  onCellHover?: (at: Coord | null) => void;
  ariaLabel: string;
};

const COLS = 'ABCDEFGHIJ'.split('');

function describeCell(state: CellState, showShips: boolean): string {
  switch (state) {
    case 'empty':
      return showShips ? 'empty' : 'unknown';
    case 'ship':
      return showShips ? 'ship' : 'unknown';
    case 'miss':
      return 'miss';
    case 'hit':
      return 'hit';
    case 'sunk':
      return 'sunk';
  }
}

export function Board({
  title,
  board,
  showShips,
  disabled = false,
  active = false,
  preview = null,
  lastShot = null,
  onCellClick,
  onCellHover,
  ariaLabel,
}: Props) {
  const previewKeys = new Map<string, boolean>();
  if (preview) for (const c of preview.cells) previewKeys.set(coordKey(c), preview.valid);

  return (
    <section className={`board-wrap${active ? ' board-wrap--active' : ''}`} aria-label={ariaLabel}>
      <h2 className="board-title">{title}</h2>
      <div
        className={`board${disabled ? ' board--disabled' : ''}`}
        onMouseLeave={() => onCellHover?.(null)}
      >
        <div className="board-corner" aria-hidden="true" />
        {COLS.map((c) => (
          <div key={c} className="board-label" aria-hidden="true">
            {c}
          </div>
        ))}
        {board.cells.map((row, r) => (
          <div key={r} className="board-row">
            <div className="board-label" aria-hidden="true">
              {r + 1}
            </div>
            {row.map((state, c) => {
              const at: Coord = { row: r, col: c };
              const key = coordKey(at);
              const visible: CellState = state === 'ship' && !showShips ? 'empty' : state;
              const inPreview = previewKeys.has(key);
              const isLast = lastShot != null && lastShot.at.row === r && lastShot.at.col === c;
              const classes = ['cell', `cell--${visible}`];
              if (inPreview)
                classes.push(previewKeys.get(key) ? 'cell--preview-ok' : 'cell--preview-bad');
              if (isLast) classes.push(`cell--anim-${lastShot.outcome}`);
              const label = `${coordLabel(at)}, ${describeCell(state, showShips)}`;
              return (
                <button
                  key={isLast ? `${key}-${lastShot.seq}` : key}
                  type="button"
                  className={classes.join(' ')}
                  aria-label={label}
                  disabled={disabled}
                  onClick={() => onCellClick?.(at)}
                  onMouseEnter={() => onCellHover?.(at)}
                  onFocus={() => onCellHover?.(at)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
