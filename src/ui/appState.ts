import { chooseShot, createAi, observe, type AiState, type Difficulty } from '../ai/huntTarget';
import {
  canPlace,
  createBoard,
  isShotAlready,
  placeShip,
  randomizeFleet,
  removeShip,
  shipAt,
} from '../engine/board';
import { coordLabel } from '../engine/coords';
import { createGame, fire, setPlayerBoard, startGame } from '../engine/game';
import { defaultRng, type Rng } from '../engine/rng';
import { FLEET, shipSpec } from '../engine/ships';
import type { Coord, GameState, Orientation, ShipKind, ShotResult } from '../engine/types';

export type AppState = {
  game: GameState;
  difficulty: Difficulty;
  ai: AiState;
  selectedShip: ShipKind | null;
  orientation: Orientation;
  message: string;
  /** Increments on every shot so the UI can re-trigger animations. */
  shotSeq: number;
  /** Increments on every new game so per-game side effects run exactly once. */
  gameId: number;
};

export type AppAction =
  | { type: 'select-ship'; kind: ShipKind | null }
  | { type: 'rotate' }
  | { type: 'place-at'; at: Coord }
  | { type: 'pick-up'; kind: ShipKind }
  | { type: 'randomize' }
  | { type: 'reset-fleet' }
  | { type: 'set-difficulty'; difficulty: Difficulty }
  | { type: 'start' }
  | { type: 'player-fire'; at: Coord }
  | { type: 'ai-fire' }
  | { type: 'play-again' };

export function initialAppState(difficulty: Difficulty = 'normal', gameId = 0): AppState {
  return {
    game: createGame(),
    difficulty,
    ai: createAi(difficulty),
    selectedShip: 'carrier',
    orientation: 'horizontal',
    message: 'Place your fleet. Click a ship, then click the board. Press R to rotate.',
    shotSeq: 0,
    gameId,
  };
}

function nextUnplaced(game: GameState): ShipKind | null {
  const spec = FLEET.find((s) => !game.player.ships.some((p) => p.kind === s.kind));
  return spec?.kind ?? null;
}

export function describeShot(shot: ShotResult): string {
  const who = shot.by === 'player' ? 'You' : 'The enemy';
  const whose = shot.by === 'player' ? 'their' : 'your';
  const where = coordLabel(shot.at);
  switch (shot.outcome) {
    case 'miss':
      return `${who} fired at ${where} — miss.`;
    case 'hit':
      return `${who} fired at ${where} — hit!`;
    case 'sunk':
      return `${who} sank ${whose} ${shipSpec(shot.sunk!).name} at ${where}!`;
  }
}

export function appReducer(state: AppState, action: AppAction, rng: Rng = defaultRng): AppState {
  const { game } = state;
  switch (action.type) {
    case 'select-ship':
      return { ...state, selectedShip: action.kind };

    case 'rotate':
      return {
        ...state,
        orientation: state.orientation === 'horizontal' ? 'vertical' : 'horizontal',
      };

    case 'place-at': {
      if (game.phase !== 'placement') return state;
      const existing = shipAt(game.player, action.at);
      if (existing) {
        return {
          ...state,
          game: setPlayerBoard(game, removeShip(game.player, existing.kind)),
          selectedShip: existing.kind,
          orientation:
            existing.cells.length > 1 && existing.cells[0].row === existing.cells[1].row
              ? 'horizontal'
              : 'vertical',
          message: `Picked up ${existing.name}. Click to place it again.`,
        };
      }
      if (!state.selectedShip) return { ...state, message: 'Select a ship from the tray first.' };
      const spec = shipSpec(state.selectedShip);
      if (!canPlace(game.player, spec, action.at, state.orientation)) {
        return { ...state, message: `${spec.name} can't go there — ships must not touch.` };
      }
      const board = placeShip(game.player, spec, action.at, state.orientation);
      const next = setPlayerBoard(game, board);
      const remaining = nextUnplaced(next);
      return {
        ...state,
        game: next,
        selectedShip: remaining,
        message: remaining
          ? `${spec.name} placed. Now place your ${shipSpec(remaining).name}.`
          : 'Fleet ready! Pick a difficulty and start the battle.',
      };
    }

    case 'pick-up': {
      if (game.phase !== 'placement') return state;
      const ship = game.player.ships.find((s) => s.kind === action.kind);
      if (!ship) return state;
      return {
        ...state,
        game: setPlayerBoard(game, removeShip(game.player, action.kind)),
        selectedShip: action.kind,
        message: `Picked up ${ship.name}. Click to place it again.`,
      };
    }

    case 'randomize': {
      if (game.phase !== 'placement') return state;
      const board = randomizeFleet(createBoard(), rng);
      return {
        ...state,
        game: setPlayerBoard(game, board),
        selectedShip: null,
        message: 'Fleet randomized. Click a ship to move it, or start the battle.',
      };
    }

    case 'reset-fleet':
      if (game.phase !== 'placement') return state;
      return {
        ...state,
        game: setPlayerBoard(game, createBoard()),
        selectedShip: 'carrier',
        message: 'Fleet cleared. Place your Carrier.',
      };

    case 'set-difficulty':
      if (game.phase !== 'placement') return state;
      return { ...state, difficulty: action.difficulty, ai: createAi(action.difficulty) };

    case 'start': {
      if (game.phase !== 'placement') return state;
      try {
        return {
          ...state,
          game: startGame(game, rng),
          ai: createAi(state.difficulty),
          selectedShip: null,
          message: 'Battle stations! Fire at the enemy waters.',
        };
      } catch {
        return { ...state, message: 'Place all five ships before starting.' };
      }
    }

    case 'player-fire': {
      if (game.phase !== 'player-turn') return state;
      if (isShotAlready(game.ai, action.at)) {
        return { ...state, message: `You already fired at ${coordLabel(action.at)}.` };
      }
      const next = fire(game, 'player', action.at);
      const shot = next.log[next.log.length - 1];
      return {
        ...state,
        game: next,
        shotSeq: state.shotSeq + 1,
        message:
          next.phase === 'game-over'
            ? 'Victory! You sank the entire enemy fleet.'
            : describeShot(shot),
      };
    }

    case 'ai-fire': {
      if (game.phase !== 'ai-turn') return state;
      const at = chooseShot(state.ai, rng);
      const next = fire(game, 'ai', at);
      const shot = next.log[next.log.length - 1];
      const ai = observe(state.ai, { at, outcome: shot.outcome, sunk: shot.sunk });
      return {
        ...state,
        game: next,
        ai,
        shotSeq: state.shotSeq + 1,
        message:
          next.phase === 'game-over' ? 'Defeat. Your fleet has been sunk.' : describeShot(shot),
      };
    }

    case 'play-again':
      return initialAppState(state.difficulty, state.gameId + 1);
  }
}
