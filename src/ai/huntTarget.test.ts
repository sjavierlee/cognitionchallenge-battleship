import { describe, expect, it } from 'vitest';
import { createBoard, placeShip, randomizeFleet } from '../engine/board';
import { seededRng } from '../engine/rng';
import { shipSpec } from '../engine/ships';
import { aiMode, chooseShot, createAi, observe, type Difficulty } from './huntTarget';
import { averageShots, simulateGame } from './simulate';

const ALL: Difficulty[] = ['easy', 'normal', 'hard'];

describe('observe', () => {
  it('tracks hits as active and enters target mode', () => {
    let ai = createAi('normal');
    expect(aiMode(ai)).toBe('hunt');
    ai = observe(ai, { at: { row: 3, col: 3 }, outcome: 'hit' });
    expect(aiMode(ai)).toBe('target');
    expect(ai.view[3][3]).toBe('hit');
  });

  it('on sunk: clears active hits, removes the ship, and (normal/hard) excludes the ring', () => {
    let ai = createAi('normal');
    ai = observe(ai, { at: { row: 3, col: 3 }, outcome: 'hit' });
    ai = observe(ai, { at: { row: 3, col: 4 }, outcome: 'sunk', sunk: 'destroyer' });
    expect(aiMode(ai)).toBe('hunt');
    expect(ai.remaining.map((s) => s.kind)).not.toContain('destroyer');
    expect(ai.view[3][3]).toBe('sunk');
    expect(ai.view[3][4]).toBe('sunk');
    expect(ai.view[2][2]).toBe('miss');
    expect(ai.view[4][5]).toBe('miss');
    expect(ai.view[3][5]).toBe('miss');
    expect(ai.view[3][6]).toBe('unknown');
  });

  it('easy does not exclude the ring', () => {
    let ai = createAi('easy');
    ai = observe(ai, { at: { row: 3, col: 3 }, outcome: 'hit' });
    ai = observe(ai, { at: { row: 3, col: 4 }, outcome: 'sunk', sunk: 'destroyer' });
    expect(ai.view[2][2]).toBe('unknown');
  });
});

describe('targeting', () => {
  it.each(ALL)('%s: after one hit, fires at an orthogonal neighbour', (difficulty) => {
    const ai = observe(createAi(difficulty), { at: { row: 5, col: 5 }, outcome: 'hit' });
    for (let i = 0; i < 20; i++) {
      const shot = chooseShot(ai, seededRng(i));
      const dist = Math.abs(shot.row - 5) + Math.abs(shot.col - 5);
      expect(dist).toBe(1);
    }
  });

  it.each(['normal', 'hard'] as Difficulty[])(
    '%s: after two collinear hits, extends the line',
    (difficulty) => {
      let ai = createAi(difficulty);
      ai = observe(ai, { at: { row: 5, col: 4 }, outcome: 'hit' });
      ai = observe(ai, { at: { row: 5, col: 5 }, outcome: 'hit' });
      for (let i = 0; i < 20; i++) {
        const shot = chooseShot(ai, seededRng(i));
        expect(shot.row).toBe(5);
        expect([3, 6]).toContain(shot.col);
      }
    },
  );

  it('normal/hard: keeps extending past a miss on one end', () => {
    let ai = createAi('normal');
    ai = observe(ai, { at: { row: 5, col: 4 }, outcome: 'hit' });
    ai = observe(ai, { at: { row: 5, col: 5 }, outcome: 'hit' });
    ai = observe(ai, { at: { row: 5, col: 3 }, outcome: 'miss' });
    expect(chooseShot(ai, seededRng(1))).toEqual({ row: 5, col: 6 });
  });

  it('hard: never targets a cell no remaining ship could occupy', () => {
    // Only the destroyer (2) remains; a hit at (0,0) with (0,1) a miss forces (1,0).
    let ai = createAi('hard', [shipSpec('destroyer')]);
    ai = observe(ai, { at: { row: 0, col: 1 }, outcome: 'miss' });
    ai = observe(ai, { at: { row: 0, col: 0 }, outcome: 'hit' });
    expect(chooseShot(ai, seededRng(1))).toEqual({ row: 1, col: 0 });
  });
});

describe('hunting', () => {
  it('normal hunts on the checkerboard while parity cells remain', () => {
    const ai = createAi('normal');
    for (let i = 0; i < 30; i++) {
      const shot = chooseShot(ai, seededRng(i));
      expect((shot.row + shot.col) % 2).toBe(0);
    }
  });

  it('hard prefers cells with higher placement density', () => {
    // Corners can be covered by fewer placements than the centre.
    let ai = createAi('hard');
    const shot = chooseShot(ai, seededRng(1));
    expect(shot.row).toBeGreaterThan(0);
    expect(shot.row).toBeLessThan(9);
    expect(shot.col).toBeGreaterThan(0);
    expect(shot.col).toBeLessThan(9);
    // With most cells excluded, density should pin down the last remaining spot for a 2-ship
    ai = createAi('hard', [shipSpec('destroyer')]);
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if (r === 9 && (c === 8 || c === 9)) continue;
        ai = observe(ai, { at: { row: r, col: c }, outcome: 'miss' });
      }
    }
    const forced = chooseShot(ai, seededRng(1));
    expect(forced.row).toBe(9);
    expect([8, 9]).toContain(forced.col);
  });
});

describe('full-game simulations', () => {
  it.each(ALL)('%s never repeats a shot and always finishes within 100 shots', (difficulty) => {
    for (let seed = 1; seed <= 150; seed++) {
      const rng = seededRng(seed);
      const fleet = randomizeFleet(createBoard(), rng);
      const result = simulateGame(difficulty, fleet, rng);
      expect(result.repeated).toBe(false);
      expect(result.shots).toBeLessThanOrEqual(100);
      expect(result.shots).toBeGreaterThanOrEqual(17);
    }
  });

  it('harder difficulties win in fewer shots on average', () => {
    const games = 200;
    const easy = averageShots('easy', games);
    const normal = averageShots('normal', games);
    const hard = averageShots('hard', games);
    expect(hard).toBeLessThan(normal);
    expect(normal).toBeLessThan(easy);
    expect(hard).toBeLessThan(55);
    expect(easy).toBeLessThan(95);
  });

  it('sinks a hand-built fleet', () => {
    let board = createBoard();
    board = placeShip(board, shipSpec('carrier'), { row: 0, col: 0 }, 'horizontal');
    board = placeShip(board, shipSpec('battleship'), { row: 2, col: 0 }, 'horizontal');
    board = placeShip(board, shipSpec('cruiser'), { row: 4, col: 0 }, 'horizontal');
    board = placeShip(board, shipSpec('submarine'), { row: 6, col: 0 }, 'horizontal');
    board = placeShip(board, shipSpec('destroyer'), { row: 8, col: 0 }, 'horizontal');
    const result = simulateGame('hard', board, seededRng(3));
    expect(result.repeated).toBe(false);
    expect(result.shots).toBeLessThanOrEqual(100);
  });
});
