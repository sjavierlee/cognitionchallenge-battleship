import { allSunk, createBoard, isFleetComplete, randomizeFleet, receiveShot } from './board';
import { defaultRng, type Rng } from './rng';
import type { Board, Coord, GameState, Player, ShotResult } from './types';

export function createGame(): GameState {
  return { phase: 'placement', player: createBoard(), ai: createBoard(), log: [] };
}

/** Moves from placement to battle. The AI fleet is randomized here. Player always shoots first. */
export function startGame(state: GameState, rng: Rng = defaultRng): GameState {
  if (state.phase !== 'placement') throw new Error('Game already started');
  if (!isFleetComplete(state.player)) throw new Error('Place all ships before starting');
  return { ...state, ai: randomizeFleet(createBoard(), rng), phase: 'player-turn', log: [] };
}

export function setPlayerBoard(state: GameState, board: Board): GameState {
  if (state.phase !== 'placement') throw new Error('Cannot edit fleet after start');
  return { ...state, player: board };
}

function opponentOf(p: Player): Player {
  return p === 'player' ? 'ai' : 'player';
}

/** Fires a shot for `by` at the opponent's board and advances the turn. */
export function fire(state: GameState, by: Player, at: Coord): GameState {
  const expected = by === 'player' ? 'player-turn' : 'ai-turn';
  if (state.phase !== expected) throw new Error(`Not ${by}'s turn`);

  const targetKey = opponentOf(by);
  const { board, outcome, sunk } = receiveShot(state[targetKey], at);
  const result: ShotResult = { by, at, outcome, sunk: sunk?.kind };
  const log = [...state.log, result];

  if (allSunk(board)) {
    return { ...state, [targetKey]: board, log, phase: 'game-over', winner: by };
  }
  return { ...state, [targetKey]: board, log, phase: by === 'player' ? 'ai-turn' : 'player-turn' };
}

export function shotsBy(state: GameState, by: Player): ShotResult[] {
  return state.log.filter((s) => s.by === by);
}
