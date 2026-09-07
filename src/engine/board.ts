import { inBounds, shipCells, surroundingCells } from './coords';
import { FLEET } from './ships';
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

export function allSunk(board: Board): boolean {
  return board.ships.length > 0 && board.ships.every((s) => s.hits === s.size);
}

export function randomCoord(rng: Rng = defaultRng): Coord {
  return { row: randomInt(rng, BOARD_SIZE), col: randomInt(rng, BOARD_SIZE) };
}

export function randomOrientation(rng: Rng = defaultRng): Orientation {
  return pick(rng, ['horizontal', 'vertical'] as const);
}
