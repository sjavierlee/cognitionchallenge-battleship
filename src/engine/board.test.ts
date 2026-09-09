import { describe, expect, it } from 'vitest';
import {
  allSunk,
  canPlace,
  createBoard,
  isFleetComplete,
  markTracking,
  placeShip,
  randomizeFleet,
  receiveShot,
  removeShip,
  revealFleet,
} from './board';
import { surroundingCells } from './coords';
import { seededRng } from './rng';
import { FLEET, shipSpec } from './ships';
import { BOARD_SIZE } from './types';

const destroyer = shipSpec('destroyer');
const cruiser = shipSpec('cruiser');
const carrier = shipSpec('carrier');

describe('canPlace', () => {
  it('accepts an in-bounds placement on an empty board', () => {
    expect(canPlace(createBoard(), carrier, { row: 0, col: 0 }, 'horizontal')).toBe(true);
    expect(canPlace(createBoard(), carrier, { row: 5, col: 9 }, 'vertical')).toBe(true);
  });

  it('rejects out-of-bounds placements', () => {
    expect(canPlace(createBoard(), carrier, { row: 0, col: 6 }, 'horizontal')).toBe(false);
    expect(canPlace(createBoard(), carrier, { row: 6, col: 0 }, 'vertical')).toBe(false);
    expect(canPlace(createBoard(), destroyer, { row: -1, col: 0 }, 'vertical')).toBe(false);
  });

  it('rejects overlapping placements', () => {
    const board = placeShip(createBoard(), cruiser, { row: 4, col: 4 }, 'horizontal');
    expect(canPlace(board, destroyer, { row: 4, col: 5 }, 'vertical')).toBe(false);
    expect(canPlace(board, destroyer, { row: 3, col: 6 }, 'vertical')).toBe(false);
  });

  it('rejects orthogonally and diagonally adjacent placements (no-touch rule)', () => {
    const board = placeShip(createBoard(), cruiser, { row: 4, col: 4 }, 'horizontal'); // (4,4)-(4,6)
    // directly below
    expect(canPlace(board, destroyer, { row: 5, col: 4 }, 'horizontal')).toBe(false);
    // directly to the right end
    expect(canPlace(board, destroyer, { row: 4, col: 7 }, 'horizontal')).toBe(false);
    // diagonal corner
    expect(canPlace(board, destroyer, { row: 5, col: 7 }, 'vertical')).toBe(false);
    expect(canPlace(board, destroyer, { row: 2, col: 3 }, 'vertical')).toBe(false); // ends at (3,3)
    // one gap away is fine
    expect(canPlace(board, destroyer, { row: 6, col: 4 }, 'horizontal')).toBe(true);
    expect(canPlace(board, destroyer, { row: 4, col: 8 }, 'vertical')).toBe(true);
  });
});

describe('placeShip / removeShip', () => {
  it('marks cells and records the ship', () => {
    const board = placeShip(createBoard(), destroyer, { row: 2, col: 3 }, 'vertical');
    expect(board.cells[2][3]).toBe('ship');
    expect(board.cells[3][3]).toBe('ship');
    expect(board.ships).toHaveLength(1);
    expect(board.ships[0].cells).toEqual([
      { row: 2, col: 3 },
      { row: 3, col: 3 },
    ]);
  });

  it('does not mutate the original board', () => {
    const original = createBoard();
    placeShip(original, destroyer, { row: 0, col: 0 }, 'horizontal');
    expect(original.ships).toHaveLength(0);
    expect(original.cells[0][0]).toBe('empty');
  });

  it('refuses to place the same ship twice', () => {
    const board = placeShip(createBoard(), destroyer, { row: 0, col: 0 }, 'horizontal');
    expect(() => placeShip(board, destroyer, { row: 5, col: 5 }, 'horizontal')).toThrow();
  });

  it('removeShip clears cells', () => {
    const board = placeShip(createBoard(), destroyer, { row: 0, col: 0 }, 'horizontal');
    const cleared = removeShip(board, 'destroyer');
    expect(cleared.ships).toHaveLength(0);
    expect(cleared.cells[0][0]).toBe('empty');
    expect(cleared.cells[0][1]).toBe('empty');
  });
});

describe('randomizeFleet', () => {
  it('produces a complete, valid, non-touching fleet for many seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const board = randomizeFleet(createBoard(), seededRng(seed));
      expect(isFleetComplete(board)).toBe(true);
      expect(board.ships).toHaveLength(FLEET.length);

      const occupied = new Set<string>();
      for (const ship of board.ships) {
        expect(ship.cells).toHaveLength(ship.size);
        for (const c of ship.cells) {
          expect(c.row).toBeGreaterThanOrEqual(0);
          expect(c.row).toBeLessThan(BOARD_SIZE);
          expect(c.col).toBeGreaterThanOrEqual(0);
          expect(c.col).toBeLessThan(BOARD_SIZE);
          const key = `${c.row},${c.col}`;
          expect(occupied.has(key)).toBe(false);
          occupied.add(key);
        }
      }
      // no-touch: no cell surrounding a ship belongs to a different ship
      for (const ship of board.ships) {
        const own = new Set(ship.cells.map((c) => `${c.row},${c.col}`));
        for (const c of ship.cells) {
          for (const n of surroundingCells(c)) {
            const key = `${n.row},${n.col}`;
            if (!own.has(key)) expect(occupied.has(key)).toBe(false);
          }
        }
      }
    }
  });

  it('is deterministic for a given seed', () => {
    const a = randomizeFleet(createBoard(), seededRng(42));
    const b = randomizeFleet(createBoard(), seededRng(42));
    expect(a).toEqual(b);
  });

  it('keeps already-placed ships and fills in the rest', () => {
    const partial = placeShip(createBoard(), carrier, { row: 0, col: 0 }, 'horizontal');
    const full = randomizeFleet(partial, seededRng(7));
    expect(full.ships.find((s) => s.kind === 'carrier')?.cells).toEqual(partial.ships[0].cells);
    expect(isFleetComplete(full)).toBe(true);
  });
});

describe('receiveShot', () => {
  const board = placeShip(createBoard(), destroyer, { row: 0, col: 0 }, 'horizontal');

  it('records a miss', () => {
    const { board: next, outcome } = receiveShot(board, { row: 5, col: 5 });
    expect(outcome).toBe('miss');
    expect(next.cells[5][5]).toBe('miss');
  });

  it('records a hit and then a sink', () => {
    const first = receiveShot(board, { row: 0, col: 0 });
    expect(first.outcome).toBe('hit');
    expect(first.board.cells[0][0]).toBe('hit');
    expect(first.board.ships[0].hits).toBe(1);

    const second = receiveShot(first.board, { row: 0, col: 1 });
    expect(second.outcome).toBe('sunk');
    expect(second.sunk?.kind).toBe('destroyer');
    expect(second.board.cells[0][0]).toBe('sunk');
    expect(second.board.cells[0][1]).toBe('sunk');
    expect(allSunk(second.board)).toBe(true);
  });

  it('rejects repeat shots', () => {
    const { board: next } = receiveShot(board, { row: 5, col: 5 });
    expect(() => receiveShot(next, { row: 5, col: 5 })).toThrow();
  });

  it('allSunk is false with unsunk ships or no ships', () => {
    expect(allSunk(board)).toBe(false);
    expect(allSunk(createBoard())).toBe(false);
  });
});

describe('revealFleet', () => {
  const row = (r: number, from: number, size: number) =>
    Array.from({ length: size }, (_, i) => ({ row: r, col: from + i }));
  const report = [
    { kind: 'carrier' as const, cells: row(0, 0, 5) },
    { kind: 'battleship' as const, cells: row(2, 0, 4) },
    { kind: 'cruiser' as const, cells: row(4, 0, 3) },
    { kind: 'submarine' as const, cells: row(6, 0, 3) },
    { kind: 'destroyer' as const, cells: row(8, 0, 2) },
  ];
  const swap = (kind: string, cells: { row: number; col: number }[]) =>
    report.map((s) => (s.kind === kind ? { ...s, cells } : s));

  // Tracking grid after a miss, one hit on the carrier and sinking the destroyer.
  let tracking = markTracking(createBoard(), { row: 9, col: 9 }, 'miss');
  tracking = markTracking(tracking, { row: 0, col: 0 }, 'hit');
  tracking = markTracking(tracking, { row: 8, col: 0 }, 'hit');
  tracking = markTracking(tracking, { row: 8, col: 1 }, 'sunk', {
    kind: 'destroyer',
    cells: row(8, 0, 2),
  });

  it('adds the unsunk ships with their hit counts and keeps shot markers', () => {
    const revealed = revealFleet(tracking, report);
    expect(revealed.ships).toHaveLength(5);
    expect(revealed.ships.find((s) => s.kind === 'carrier')?.hits).toBe(1);
    expect(revealed.ships.find((s) => s.kind === 'destroyer')?.hits).toBe(2);
    expect(revealed.ships.find((s) => s.kind === 'cruiser')?.hits).toBe(0);
    expect(revealed.cells[9][9]).toBe('miss');
    expect(revealed.cells[0][0]).toBe('hit');
    expect(revealed.cells[0][1]).toBe('ship');
    expect(revealed.cells[8][0]).toBe('sunk');
    expect(revealed.cells[5][5]).toBe('empty');
    expect(allSunk(revealed)).toBe(false);
    expect(tracking.ships).toHaveLength(1);
  });

  it('accepts cells listed in any order and vertical ships', () => {
    const vertical = swap('cruiser', [
      { row: 6, col: 9 },
      { row: 4, col: 9 },
      { row: 5, col: 9 },
    ]);
    const revealed = revealFleet(tracking, vertical);
    expect(revealed.ships.find((s) => s.kind === 'cruiser')?.cells[0]).toEqual({ row: 4, col: 9 });
  });

  it('rejects incomplete, duplicated, crooked or touching fleets', () => {
    expect(() => revealFleet(tracking, report.slice(1))).toThrow();
    expect(() => revealFleet(tracking, [...report.slice(1), report[1]])).toThrow();
    const crooked = swap('cruiser', [
      { row: 4, col: 0 },
      { row: 4, col: 1 },
      { row: 5, col: 1 },
    ]);
    expect(() => revealFleet(tracking, crooked)).toThrow();
    const gapped = swap('cruiser', [
      { row: 4, col: 0 },
      { row: 4, col: 1 },
      { row: 4, col: 3 },
    ]);
    expect(() => revealFleet(tracking, gapped)).toThrow();
    expect(() => revealFleet(createBoard(), swap('destroyer', row(7, 0, 2)))).toThrow();
  });

  it('rejects a fleet that contradicts earlier shots', () => {
    expect(() => revealFleet(tracking, swap('cruiser', row(9, 7, 3)))).toThrow();
    expect(() => revealFleet(tracking, swap('destroyer', row(8, 5, 2)))).toThrow();
    const carrierElsewhere = swap('carrier', row(0, 5, 5));
    expect(() => revealFleet(tracking, carrierElsewhere)).toThrow();
  });
});
