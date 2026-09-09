import { inBounds, sameCoord, shipCells, surroundingCells } from './coords';
import { FLEET, shipSpec } from './ships';
import { defaultRng, pick, randomInt, type Rng } from './rng';
import {
  BOARD_SIZE,
  type Board,
  type CellState,
  type Coord,
  type Orientation,
  type Outcome,
  type Ship,
  type ShipKind,
  type ShipSpec,
} from './types';

export function createBoard(): Board {
  const cells: CellState[][] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    cells.push(new Array<CellState>(BOARD_SIZE).fill('empty'));
  }
  return { cells, ships: [] };
}

export function cellAt(board: Board, { row, col }: Coord): CellState {
  return board.cells[row][col];
}

function cloneCells(cells: CellState[][]): CellState[][] {
  return cells.map((row) => [...row]);
}

/** True if every cell is in bounds, unoccupied, and not touching any other ship (incl. diagonally). */
export function canPlace(
  board: Board,
  spec: ShipSpec,
  origin: Coord,
  orientation: Orientation,
): boolean {
  const cells = shipCells(origin, spec.size, orientation);
  for (const c of cells) {
    if (!inBounds(c)) return false;
    if (board.cells[c.row][c.col] !== 'empty') return false;
    for (const n of surroundingCells(c)) {
      if (board.cells[n.row][n.col] !== 'empty') return false;
    }
  }
  return true;
}

export function placeShip(
  board: Board,
  spec: ShipSpec,
  origin: Coord,
  orientation: Orientation,
): Board {
  if (board.ships.some((s) => s.kind === spec.kind)) {
    throw new Error(`${spec.name} is already placed`);
  }
  if (!canPlace(board, spec, origin, orientation)) {
    throw new Error(`Cannot place ${spec.name} at ${origin.row},${origin.col} ${orientation}`);
  }
  const cells = shipCells(origin, spec.size, orientation);
  const next = cloneCells(board.cells);
  for (const c of cells) next[c.row][c.col] = 'ship';
  return { cells: next, ships: [...board.ships, { ...spec, cells, hits: 0 }] };
}

export function removeShip(board: Board, kind: ShipKind): Board {
  const ship = board.ships.find((s) => s.kind === kind);
  if (!ship) return board;
  const next = cloneCells(board.cells);
  for (const c of ship.cells) next[c.row][c.col] = 'empty';
  return { cells: next, ships: board.ships.filter((s) => s.kind !== kind) };
}

export function shipAt(board: Board, coord: Coord): Ship | undefined {
  return board.ships.find((s) => s.cells.some((c) => c.row === coord.row && c.col === coord.col));
}

/** Places every ship in `specs` that is not already on the board, at random valid positions. */
export function randomizeFleet(
  board: Board = createBoard(),
  rng: Rng = defaultRng,
  specs: readonly ShipSpec[] = FLEET,
): Board {
  const remaining = specs.filter((spec) => !board.ships.some((s) => s.kind === spec.kind));
  // Retry whole layout on the rare occasion the greedy placement dead-ends.
  for (let attempt = 0; attempt < 100; attempt++) {
    let next = board;
    let ok = true;
    for (const spec of remaining) {
      const options: { origin: Coord; orientation: Orientation }[] = [];
      for (const orientation of ['horizontal', 'vertical'] as const) {
        for (let row = 0; row < BOARD_SIZE; row++) {
          for (let col = 0; col < BOARD_SIZE; col++) {
            const origin = { row, col };
            if (canPlace(next, spec, origin, orientation)) options.push({ origin, orientation });
          }
        }
      }
      if (options.length === 0) {
        ok = false;
        break;
      }
      const choice = options[randomInt(rng, options.length)];
      next = placeShip(next, spec, choice.origin, choice.orientation);
    }
    if (ok) return next;
  }
  throw new Error('Failed to randomize fleet');
}

export function isFleetComplete(board: Board, specs: readonly ShipSpec[] = FLEET): boolean {
  return specs.every((spec) => board.ships.some((s) => s.kind === spec.kind));
}

export function isShotAlready(board: Board, coord: Coord): boolean {
  const state = cellAt(board, coord);
  return state === 'miss' || state === 'hit' || state === 'sunk';
}

export type ShotOutcome = { board: Board; outcome: Outcome; sunk?: Ship };

/** Resolves a shot at `coord`. Throws if the cell was already targeted. */
export function receiveShot(board: Board, coord: Coord): ShotOutcome {
  if (!inBounds(coord)) throw new Error('Shot out of bounds');
  if (isShotAlready(board, coord)) throw new Error('Cell already targeted');

  const next = cloneCells(board.cells);
  const target = shipAt(board, coord);
  if (!target) {
    next[coord.row][coord.col] = 'miss';
    return { board: { cells: next, ships: board.ships }, outcome: 'miss' };
  }

  const updated: Ship = { ...target, hits: target.hits + 1 };
  const ships = board.ships.map((s) => (s.kind === target.kind ? updated : s));
  if (updated.hits === updated.size) {
    for (const c of updated.cells) next[c.row][c.col] = 'sunk';
    return { board: { cells: next, ships }, outcome: 'sunk', sunk: updated };
  }
  next[coord.row][coord.col] = 'hit';
  return { board: { cells: next, ships }, outcome: 'hit' };
}

/** What an opponent reports when a shot sinks one of their ships: which one and where it lay. */
export type SunkReport = { kind: ShipKind; cells: Coord[] };

/**
 * Records a reported shot outcome on a tracking grid whose ships are unknown. A sunk report adds
 * the ship (fully hit) so it can be drawn; malformed reports throw.
 */
export function markTracking(
  board: Board,
  coord: Coord,
  outcome: Outcome,
  sunk?: SunkReport,
): Board {
  if (!inBounds(coord)) throw new Error('Shot out of bounds');
  if (isShotAlready(board, coord)) throw new Error('Cell already targeted');
  const next = cloneCells(board.cells);
  if (outcome !== 'sunk') {
    next[coord.row][coord.col] = outcome;
    return { cells: next, ships: board.ships };
  }
  if (!sunk) throw new Error('Sunk report missing ship');
  const spec = shipSpec(sunk.kind);
  if (board.ships.some((s) => s.kind === spec.kind)) throw new Error('Ship already sunk');
  const valid =
    sunk.cells.length === spec.size &&
    sunk.cells.every(inBounds) &&
    sunk.cells.some((c) => sameCoord(c, coord)) &&
    sunk.cells.every((c) => sameCoord(c, coord) || next[c.row][c.col] === 'hit');
  if (!valid) throw new Error('Sunk report does not match earlier hits');
  for (const c of sunk.cells) next[c.row][c.col] = 'sunk';
  return { cells: next, ships: [...board.ships, { ...spec, cells: sunk.cells, hits: spec.size }] };
}

/**
 * Adds the opponent's full fleet, as they reported it at game over, to a tracking grid so the
 * unsunk ships can be shown. The report must be a legal layout of the whole fleet that agrees
 * with every shot already on the grid; anything else throws and the grid is left as it was.
 */
export function revealFleet(board: Board, fleet: readonly SunkReport[]): Board {
  let layout = createBoard();
  for (const report of fleet) {
    const spec = shipSpec(report.kind);
    const { origin, orientation } = lineOf(report.cells);
    layout = placeShip(layout, spec, origin, orientation);
    const known = board.ships.find((s) => s.kind === spec.kind);
    if (known && !known.cells.every((c) => report.cells.some((r) => sameCoord(c, r)))) {
      throw new Error(`Revealed ${spec.name} does not match where it was sunk`);
    }
  }
  if (!isFleetComplete(layout)) throw new Error('Revealed fleet is incomplete');

  const next = cloneCells(board.cells);
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const shot = board.cells[row][col];
      const ship = layout.cells[row][col] === 'ship';
      const struck = shot === 'hit' || shot === 'sunk';
      if ((shot === 'miss' && ship) || (struck && !ship)) {
        throw new Error('Revealed fleet contradicts earlier shots');
      }
      if (shot === 'empty' && ship) next[row][col] = 'ship';
    }
  }
  const ships = layout.ships.map((ship) => ({
    ...ship,
    hits: ship.cells.filter((c) => board.cells[c.row][c.col] !== 'empty').length,
  }));
  return { cells: next, ships };
}

/** Origin and orientation of a straight, contiguous run of cells; throws for anything else. */
function lineOf(cells: readonly Coord[]): { origin: Coord; orientation: Orientation } {
  if (cells.length === 0) throw new Error('Ship has no cells');
  const rows = cells.map((c) => c.row);
  const cols = cells.map((c) => c.col);
  const origin = { row: Math.min(...rows), col: Math.min(...cols) };
  const orientation: Orientation = rows.every((r) => r === origin.row) ? 'horizontal' : 'vertical';
  const expected = shipCells(origin, cells.length, orientation);
  const matches = expected.every((e) => cells.some((c) => sameCoord(c, e)));
  if (!matches) throw new Error('Ship cells are not a straight line');
  return { origin, orientation };
}

export function allSunk(board: Board): boolean {
  return board.ships.length > 0 && board.ships.every((s) => s.hits === s.size);
}

export function randomCoord(rng: Rng = defaultRng): Coord {
  return { row: randomInt(rng, BOARD_SIZE), col: randomInt(rng, BOARD_SIZE) };
}

export function randomOrientation(rng: Rng = defaultRng): Orientation {
  return pick(rng, ['horizontal', 'vertical'] as const);
}
