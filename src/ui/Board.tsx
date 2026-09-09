import type { CSSProperties } from 'react';
import { coordKey, coordLabel, shipOrientation } from '../engine/coords';
import type {
  Board as BoardModel,
  CellState,
  Coord,
  Orientation,
  Outcome,
  Ship,
  ShipKind,
} from '../engine/types';
import { FleetStatus } from './FleetStatus';
import { ShipSprite } from './ShipSprite';

export type Preview = {
  cells: Coord[];
  valid: boolean;
  /** The ship being placed, when its footprint is fully on the board (drawn as a ghost sprite). */
  ghost: { kind: ShipKind; origin: Coord; orientation: Orientation } | null;
} | null;

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
  /** Show the fleet roster (afloat / sunk) under the grid. */
  showFleet?: boolean;
  /** Short status shown beside the title, e.g. whose turn it is. */
  badge?: string;
  /** Enemy ships exposed after the game: afloat ones are drawn with a reveal animation. */
  revealed?: boolean;
};

const COLS = 'ABCDEFGHIJ'.split('');
const ROWS = Array.from({ length: 10 }, (_, i) => i + 1);

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

/** Grid placement for a sprite overlay spanning `size` cells from `origin` (1-based grid lines). */
function spriteArea(origin: Coord, size: number, orientation: Orientation): CSSProperties {
  const horizontal = orientation === 'horizontal';
  return {
    gridRow: `${origin.row + 1} / span ${horizontal ? 1 : size}`,
    gridColumn: `${origin.col + 1} / span ${horizontal ? size : 1}`,
  };
}

function isSunk(ship: Ship): boolean {
  return ship.hits >= ship.size;
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
  showFleet = false,
  badge,
  revealed = false,
}: Props) {
  const previewKeys = new Map<string, boolean>();
  if (preview) for (const c of preview.cells) previewKeys.set(coordKey(c), preview.valid);

  const drawnShips = showShips ? board.ships : board.ships.filter(isSunk);

  return (
    <section className={`board-wrap${active ? ' board-wrap--active' : ''}`} aria-label={ariaLabel}>
      <div className="board-head">
        <h2 className="board-title">{title}</h2>
        {badge && <span className="board-badge">{badge}</span>}
      </div>
      <div
        className={`board${disabled ? ' board--disabled' : ''}`}
        onMouseLeave={() => onCellHover?.(null)}
      >
        <div className="board-cols" aria-hidden="true">
          {COLS.map((c) => (
            <span key={c} className="board-label">
              {c}
            </span>
          ))}
        </div>
        <div className="board-rows" aria-hidden="true">
          {ROWS.map((r) => (
            <span key={r} className="board-label">
              {r}
            </span>
          ))}
        </div>
        <div className="board-sea">
          {board.cells.map((row, r) =>
            row.map((state, c) => {
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
                  style={{ gridArea: `${r + 1} / ${c + 1}` }}
                  aria-label={label}
                  disabled={disabled}
                  onClick={() => onCellClick?.(at)}
                  onMouseEnter={() => onCellHover?.(at)}
                  onFocus={() => onCellHover?.(at)}
                />
              );
            }),
          )}
          {drawnShips.map((ship) => {
            const orientation = shipOrientation(ship);
            const sunk = isSunk(ship);
            return (
              <div
                key={ship.kind}
                className={`board-ship${sunk ? ' board-ship--sunk' : ''}${revealed && !sunk ? ' board-ship--revealed' : ''}`}
                style={spriteArea(ship.cells[0], ship.size, orientation)}
              >
                <ShipSprite kind={ship.kind} orientation={orientation} />
              </div>
            );
          })}
          {preview?.ghost && (
            <div
              className={`board-ship board-ship--ghost${preview.valid ? '' : ' board-ship--invalid'}`}
              style={spriteArea(
                preview.ghost.origin,
                preview.cells.length,
                preview.ghost.orientation,
              )}
            >
              <ShipSprite kind={preview.ghost.kind} orientation={preview.ghost.orientation} />
            </div>
          )}
        </div>
      </div>
      {showFleet && <FleetStatus ships={board.ships} />}
    </section>
  );
}
