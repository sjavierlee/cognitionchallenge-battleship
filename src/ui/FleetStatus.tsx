import type { CSSProperties } from 'react';
import { FLEET } from '../engine/ships';
import type { Ship } from '../engine/types';
import { ShipSprite } from './ShipSprite';

type Props = { ships: Ship[] };

/** One-line fleet roster under a board: each class as a mini silhouette, struck through once sunk. */
export function FleetStatus({ ships }: Props) {
  const afloat = ships.filter((s) => s.hits < s.size).length;
  return (
    <ul className="fleet-status" aria-label={`${afloat} of ${FLEET.length} ships afloat`}>
      {FLEET.map((spec) => {
        const ship = ships.find((s) => s.kind === spec.kind);
        const sunk = ship != null && ship.hits >= ship.size;
        return (
          <li
            key={spec.kind}
            className={`fleet-status-ship${sunk ? ' fleet-status-ship--sunk' : ''}`}
            style={{ '--len': spec.size } as CSSProperties}
            title={`${spec.name}${sunk ? ' — sunk' : ''}`}
          >
            <ShipSprite kind={spec.kind} />
            <span className="sr-only">
              {spec.name}
              {sunk ? ', sunk' : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
