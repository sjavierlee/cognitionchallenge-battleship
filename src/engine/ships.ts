import type { ShipKind, ShipSpec } from './types';

export const FLEET: readonly ShipSpec[] = [
  { kind: 'carrier', name: 'Carrier', size: 5 },
  { kind: 'battleship', name: 'Battleship', size: 4 },
  { kind: 'cruiser', name: 'Cruiser', size: 3 },
  { kind: 'submarine', name: 'Submarine', size: 3 },
  { kind: 'destroyer', name: 'Destroyer', size: 2 },
];

export function shipSpec(kind: ShipKind): ShipSpec {
  const spec = FLEET.find((s) => s.kind === kind);
  if (!spec) throw new Error(`Unknown ship kind: ${kind}`);
  return spec;
}
