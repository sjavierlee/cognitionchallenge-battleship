import type { CSSProperties } from 'react';
import { FLEET } from '../engine/ships';
import type { Board, Orientation, ShipKind } from '../engine/types';
import { RotateIcon, ShuffleIcon } from './icons';
import { ShipSprite } from './ShipSprite';

type Props = {
  board: Board;
  selected: ShipKind | null;
  orientation: Orientation;
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
  onSelect,
  onPickUp,
  onRotate,
  onRandomize,
  onReset,
}: Props) {
  const placedCount = board.ships.length;
  return (
    <div className="panel tray">
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
                aria-pressed={isSelected}
                aria-label={`${spec.name}, ${spec.size} cells, ${placed ? 'placed (click to move)' : isSelected ? 'selected' : 'not placed'}`}
              >
                <span className="tray-ship-text">
                  <span className="tray-ship-name">{spec.name}</span>
                  <span className="tray-ship-status">
                    {placed ? 'Placed · click to move' : `${spec.size} cells`}
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
          aria-label={`Rotate ship, currently ${orientation}`}
        >
          <RotateIcon />
          {orientation === 'horizontal' ? 'Horizontal' : 'Vertical'}
          <kbd aria-hidden="true">R</kbd>
        </button>
        <button type="button" className="btn btn--icon" onClick={onRandomize}>
          <ShuffleIcon />
          Randomize
        </button>
        <button type="button" className="btn btn--ghost" onClick={onReset}>
          Reset
        </button>
      </div>
    </div>
  );
}
