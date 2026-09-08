import {
  allSunk,
  createBoard,
  isFleetComplete,
  markTracking,
  randomizeFleet,
  receiveShot,
  type SunkReport,
} from './board';
import { defaultRng, type Rng } from './rng';
import type { Board, Coord, GameState, Outcome, Player, ShotResult } from './types';

export function createGame(): GameState {
  return { phase: 'placement', player: createBoard(), opponent: createBoard(), log: [] };
}

/** Moves from placement to battle against the AI: its fleet is randomized here, player shoots first. */
export function startGame(state: GameState, rng: Rng = defaultRng): GameState {
  if (state.phase !== 'placement') throw new Error('Game already started');
  if (!isFleetComplete(state.player)) throw new Error('Place all ships before starting');
  return { ...state, opponent: randomizeFleet(createBoard(), rng), phase: 'player-turn', log: [] };
}

/**
 * Moves from placement to battle against a remote player. The opponent board stays empty and
 * acts as a tracking grid: it only ever learns what the opponent reports back per shot.
 */
export function startVersus(state: GameState, first: Player): GameState {
  if (state.phase !== 'placement') throw new Error('Game already started');
  if (!isFleetComplete(state.player)) throw new Error('Place all ships before starting');
  const phase = first === 'player' ? 'player-turn' : 'opponent-turn';
  return { ...state, opponent: createBoard(), phase, log: [] };
}

export function setPlayerBoard(state: GameState, board: Board): GameState {
  if (state.phase !== 'placement') throw new Error('Cannot edit fleet after start');
  return { ...state, player: board };
}

function opponentOf(p: Player): Player {
  return p === 'player' ? 'opponent' : 'player';
}

/** Fires a shot for `by` at the other side's board (whose ships are known) and advances the turn. */
export function fire(state: GameState, by: Player, at: Coord): GameState {
  const expected = by === 'player' ? 'player-turn' : 'opponent-turn';
  if (state.phase !== expected) throw new Error(`Not ${by}'s turn`);

  const targetKey = opponentOf(by);
  const { board, outcome, sunk } = receiveShot(state[targetKey], at);
  const result: ShotResult = { by, at, outcome, sunk: sunk?.kind };
  const log = [...state.log, result];

  if (allSunk(board)) {
    return { ...state, [targetKey]: board, log, phase: 'game-over', winner: by };
  }
  return {
    ...state,
    [targetKey]: board,
    log,
    phase: by === 'player' ? 'opponent-turn' : 'player-turn',
  };
}

/**
 * Records the opponent's answer to the player's shot at `at` on the tracking grid and passes the
 * turn. Used when the opponent's ships are not known locally (remote player).
 */
export function applyShotResult(
  state: GameState,
  at: Coord,
  outcome: Outcome,
  sunk?: SunkReport,
  gameOver = false,
): GameState {
  if (state.phase !== 'player-turn') throw new Error("Not player's turn");
  const opponent = markTracking(state.opponent, at, outcome, sunk);
  const result: ShotResult = { by: 'player', at, outcome, sunk: sunk?.kind };
  const log = [...state.log, result];
  // The tracking grid only lists ships once sunk, so "all sunk" also needs the whole fleet listed.
  if (gameOver || (isFleetComplete(opponent) && allSunk(opponent))) {
    return { ...state, opponent, log, phase: 'game-over', winner: 'player' };
  }
  return { ...state, opponent, log, phase: 'opponent-turn' };
}

export function shotsBy(state: GameState, by: Player): ShotResult[] {
  return state.log.filter((s) => s.by === by);
}
