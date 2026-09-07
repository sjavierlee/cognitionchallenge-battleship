import type { ReactElement } from 'react';
import { shipSpec } from '../engine/ships';
import type { Orientation, ShipKind } from '../engine/types';

/** Units per board cell in the sprite coordinate system. Art is drawn horizontally, bow to the right. */
const U = 24;

type Props = {
  kind: ShipKind;
  orientation?: Orientation;
  className?: string;
};

/** Hull outline for a ship `w` units long: rounded stern on the left, pointed bow on the right. */
function hull(w: number, top: number, bottom: number, bowLen: number, sternR: number): string {
  const mid = (top + bottom) / 2;
  const bowStart = w - bowLen;
  return [
    `M${sternR + 1},${top}`,
    `H${bowStart}`,
    `L${w - 1.5},${mid}`,
    `L${bowStart},${bottom}`,
    `H${sternR + 1}`,
    `A${sternR},${sternR} 0 0 1 ${sternR + 1},${top}`,
    'Z',
  ].join(' ');
}

function Turret({ x, y, r, aft = false }: { x: number; y: number; r: number; aft?: boolean }) {
  const len = r * 2.2;
  const bx = aft ? x - len : x;
  return (
    <g className="ship-detail">
      <rect x={bx} y={y - 0.9} width={len} height={1.8} rx={0.9} />
      <rect x={bx} y={y + 1.4} width={len * 0.8} height={1.4} rx={0.7} />
      <circle cx={x} cy={y} r={r} />
    </g>
  );
}

function Carrier() {
  const w = 5 * U;
  return (
    <>
      <path className="ship-hull" d="M7,6 H100 L116,12 L100,18 H7 A5,6 0 0 1 7,6 Z" />
      <path className="ship-deck" d="M14,12 H98" strokeDasharray="5 4" />
      <rect className="ship-detail" x={56} y={14.5} width={20} height={3.6} rx={1} />
      <rect className="ship-detail" x={64} y={13} width={7} height={2} rx={0.6} />
      <path className="ship-line" d={`M4,9.5 H${w - 22}`} />
    </>
  );
}

function Battleship() {
  return (
    <>
      <path className="ship-hull" d={hull(4 * U, 6, 18, 20, 5)} />
      <Turret x={22} y={12} r={3.6} />
      <rect className="ship-super" x={36} y={8} width={22} height={8} rx={1.5} />
      <rect className="ship-detail" x={44} y={10} width={7} height={4} rx={0.8} />
      <Turret x={68} y={12} r={3.4} aft />
    </>
  );
}

function Cruiser() {
  return (
    <>
      <path className="ship-hull" d={hull(3 * U, 7, 17, 15, 4)} />
      <Turret x={17} y={12} r={3} />
      <rect className="ship-super" x={27} y={8.6} width={17} height={6.8} rx={1.4} />
      <rect className="ship-detail" x={33} y={10.4} width={5} height={3.2} rx={0.6} />
      <Turret x={52} y={12} r={2.7} aft />
    </>
  );
}

function Submarine() {
  return (
    <>
      <path
        className="ship-hull"
        d="M10,8 H56 Q68,9 70,12 Q68,15 56,16 H10 Q3,15 3,12 Q3,9 10,8 Z"
      />
      <rect className="ship-super" x={30} y={9.4} width={13} height={5.2} rx={2.6} />
      <circle className="ship-detail" cx={17} cy={12} r={1.4} />
      <circle className="ship-detail" cx={52} cy={12} r={1.2} />
    </>
  );
}

function Destroyer() {
  return (
    <>
      <path className="ship-hull" d={hull(2 * U, 7.5, 16.5, 12, 4)} />
      <Turret x={12} y={12} r={2.6} />
      <rect className="ship-super" x={19} y={9} width={11} height={6} rx={1.2} />
      <rect className="ship-detail" x={23} y={10.6} width={3.5} height={2.8} rx={0.5} />
    </>
  );
}

const ART: Record<ShipKind, () => ReactElement> = {
  carrier: Carrier,
  battleship: Battleship,
  cruiser: Cruiser,
  submarine: Submarine,
  destroyer: Destroyer,
};

/**
 * Top-down silhouette of a ship, sized to span `size` board cells. Purely decorative: colours come
 * from CSS (`.ship-hull`, `.ship-super`, `.ship-detail`, `.ship-deck`, `.ship-line`).
 */
export function ShipSprite({ kind, orientation = 'horizontal', className }: Props) {
  const { size } = shipSpec(kind);
  const w = size * U;
  const Art = ART[kind];
  const vertical = orientation === 'vertical';
  return (
    <svg
      className={`ship-sprite${className ? ` ${className}` : ''}`}
      viewBox={vertical ? `0 0 ${U} ${w}` : `0 0 ${w} ${U}`}
      aria-hidden="true"
      focusable="false"
      data-testid="ship-sprite"
      data-kind={kind}
    >
      <g transform={vertical ? `rotate(90) translate(0 -${U})` : undefined}>
        <Art />
      </g>
    </svg>
  );
}
