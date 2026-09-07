import { allSunk, createBoard, randomizeFleet, receiveShot } from '../engine/board';
import { seededRng, type Rng } from '../engine/rng';
import type { Board, Coord } from '../engine/types';
import { chooseShot, createAi, observe, type AiState, type Difficulty } from './huntTarget';

export type SimulationResult = { shots: number; repeated: boolean };

/** Plays the AI alone against a fleet until everything is sunk. */
export function simulateGame(
  difficulty: Difficulty,
  fleet: Board,
  rng: Rng,
  maxShots = 100,
): SimulationResult {
  let board = fleet;
  let ai: AiState = createAi(difficulty);
  const fired = new Set<string>();
  let shots = 0;
  let repeated = false;
  while (!allSunk(board) && shots < maxShots) {
    const at: Coord = chooseShot(ai, rng);
    const key = `${at.row},${at.col}`;
    if (fired.has(key)) {
      repeated = true;
      break;
    }
    fired.add(key);
    const res = receiveShot(board, at);
    board = res.board;
    ai = observe(ai, { at, outcome: res.outcome, sunk: res.sunk?.kind });
    shots++;
  }
  return { shots, repeated };
}

export function averageShots(difficulty: Difficulty, games: number, seedBase = 1000): number {
  let total = 0;
  for (let i = 0; i < games; i++) {
    const rng = seededRng(seedBase + i);
    const fleet = randomizeFleet(createBoard(), rng);
    total += simulateGame(difficulty, fleet, rng).shots;
  }
  return total / games;
}
