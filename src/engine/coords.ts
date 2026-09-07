import { BOARD_SIZE, type Coord, type Orientation } from './types';

export function inBounds({ row, col }: Coord): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function coordKey({ row, col }: Coord): string {
  return `${row},${col}`;
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

/** Cells a ship of `size` would occupy starting at `origin` in `orientation`. May be out of bounds. */
export function shipCells(origin: Coord, size: number, orientation: Orientation): Coord[] {
  const cells: Coord[] = [];
  for (let i = 0; i < size; i++) {
    cells.push(
      orientation === 'horizontal'
        ? { row: origin.row, col: origin.col + i }
        : { row: origin.row + i, col: origin.col },
    );
  }
  return cells;
}

export function orthogonalNeighbors(c: Coord): Coord[] {
  return [
    { row: c.row - 1, col: c.col },
    { row: c.row + 1, col: c.col },
    { row: c.row, col: c.col - 1 },
    { row: c.row, col: c.col + 1 },
  ].filter(inBounds);
}

/** All 8 surrounding cells that are in bounds. */
export function surroundingCells(c: Coord): Coord[] {
  const out: Coord[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const n = { row: c.row + dr, col: c.col + dc };
      if (inBounds(n)) out.push(n);
    }
  }
  return out;
}

const COLUMN_LETTERS = 'ABCDEFGHIJ';

/** Human-readable label, e.g. {row:1,col:0} -> "A2". */
export function coordLabel({ row, col }: Coord): string {
  return `${COLUMN_LETTERS[col]}${row + 1}`;
}
