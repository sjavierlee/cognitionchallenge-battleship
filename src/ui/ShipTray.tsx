import type { CSSProperties } from 'react';
import { FLEET } from '../engine/ships';
import type { Board, Orientation, ShipKind } from '../engine/types';
import { RotateIcon, ShuffleIcon } from './icons';
import { ShipSprite } from './ShipSprite';

type Props = {
  board: Board;
  selected: ShipKind | null;
  orientation: Orientation;
  /** Locks every control, e.g. after pressing Ready in a friend game. */
  disabled?: boolean;
  onSelect: (kind: ShipKind) => void;
  onPickUp: (kind: ShipKind) => void;
  onRotate: () => void;
  onRandomize: () => void;
  onReset: () => void;
};

export function ShipTray({
  board,
  selected,
  orientation,
  disabled = false,
  onSelect,
  onPickUp,
  onRotate,
  onRandomize,
  onReset,
}: Props) {
  const placedCount = board.ships.length;
  return (
    <div className={`panel tray${disabled ? ' tray--locked' : ''}`}>
      <div className="panel-head">
        <h2 className="panel-title">Your ships</h2>
        <span className="panel-meta tabular">
          {placedCount}/{FLEET.length} placed
        </span>
      </div>
      <ul className="tray-list">
        {FLEET.map((spec) => {
          const placed = board.ships.some((s) => s.kind === spec.kind);
          const isSelected = selected === spec.kind;
          return (
            <li key={spec.kind}>
              <button
                type="button"
                className={`tray-ship${isSelected ? ' tray-ship--selected' : ''}${placed ? ' tray-ship--placed' : ''}`}
                onClick={() => (placed ? onPickUp(spec.kind) : onSelect(spec.kind))}
                disabled={disabled}
                aria-pressed={isSelected}
                aria-label={`${spec.name}, ${spec.size} cells, ${placed ? 'placed (click to move)' : isSelected ? 'selected' : 'not placed'}`}
              >
                <span className="tray-ship-text">
                  <span className="tray-ship-name">{spec.name}</span>
                  <span className="tray-ship-status">
                    {placed
                      ? disabled
                        ? 'Placed'
                        : 'Placed · click to move'
                      : `${spec.size} cells`}
                  </span>
                </span>
                <span className="tray-ship-art" style={{ '--len': spec.size } as CSSProperties}>
                  <ShipSprite kind={spec.kind} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="tray-actions">
        <button
          type="button"
          className="btn btn--icon"
          onClick={onRotate}
          disabled={disabled}
          aria-label={`Rotate ship, currently ${orientation}`}
        >
          <RotateIcon />
          {orientation === 'horizontal' ? 'Horizontal' : 'Vertical'}
          <kbd aria-hidden="true">R</kbd>
        </button>
        <button type="button" className="btn btn--icon" onClick={onRandomize} disabled={disabled}>
          <ShuffleIcon />
          Randomize
        </button>
        <button type="button" className="btn btn--ghost" onClick={onReset} disabled={disabled}>
          Reset
        </button>
      </div>
    </div>
  );
}
