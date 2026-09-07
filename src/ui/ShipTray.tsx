import { FLEET } from '../engine/ships';
import type { Board, Orientation, ShipKind } from '../engine/types';

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
  return (
    <div className="tray">
      <h2 className="tray-title">Your ships</h2>
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
                <span className="tray-ship-name">{spec.name}</span>
                <span className="tray-ship-cells" aria-hidden="true">
                  {Array.from({ length: spec.size }, (_, i) => (
                    <span key={i} className="tray-ship-cell" />
                  ))}
                </span>
                <span className="tray-ship-status">{placed ? 'placed' : `${spec.size}`}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="tray-actions">
        <button type="button" className="btn" onClick={onRotate}>
          Rotate ({orientation === 'horizontal' ? '↔' : '↕'}) <kbd>R</kbd>
        </button>
        <button type="button" className="btn" onClick={onRandomize}>
          Randomize
        </button>
        <button type="button" className="btn btn--ghost" onClick={onReset}>
          Reset
        </button>
      </div>
    </div>
  );
}
