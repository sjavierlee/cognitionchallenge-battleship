import { describe, expect, it } from 'vitest';
import { createBoard, randomizeFleet } from './board';
import { createGame, fire, setPlayerBoard, startGame } from './game';
import { seededRng } from './rng';
import { BOARD_SIZE, type GameState } from './types';

function readyGame(seed = 1): GameState {
  const rng = seededRng(seed);
  const game = setPlayerBoard(createGame(), randomizeFleet(createBoard(), rng));
  return startGame(game, rng);
}

describe('game state machine', () => {
  it('starts in placement with empty boards', () => {
    const g = createGame();
    expect(g.phase).toBe('placement');
    expect(g.player.ships).toHaveLength(0);
    expect(g.ai.ships).toHaveLength(0);
  });

  it('refuses to start with an incomplete fleet', () => {
    expect(() => startGame(createGame())).toThrow();
  });

  it('starting randomizes the AI fleet and gives the player the first turn', () => {
    const g = readyGame();
    expect(g.phase).toBe('player-turn');
    expect(g.ai.ships).toHaveLength(5);
  });

  it('alternates turns and appends to the log', () => {
    let g = readyGame();
    g = fire(g, 'player', { row: 0, col: 0 });
    expect(g.phase).toBe('ai-turn');
    expect(g.log).toHaveLength(1);
    expect(g.log[0].by).toBe('player');
    g = fire(g, 'ai', { row: 0, col: 0 });
    expect(g.phase).toBe('player-turn');
    expect(g.log).toHaveLength(2);
  });

  it('rejects firing out of turn', () => {
    const g = readyGame();
    expect(() => fire(g, 'ai', { row: 0, col: 0 })).toThrow();
  });

  it('declares the player the winner once every AI ship is sunk', () => {
    let g = readyGame();
    const cells = g.ai.ships.flatMap((s) => s.cells);
    let aiShotIdx = 0;
    for (const c of cells) {
      g = fire(g, 'player', c);
      if (g.phase === 'game-over') break;
      // AI shoots somewhere harmless-ish (sequential scan); it cannot win first with only 17 shots
      const row = Math.floor(aiShotIdx / BOARD_SIZE);
      const col = aiShotIdx % BOARD_SIZE;
      aiShotIdx++;
      g = fire(g, 'ai', { row, col });
    }
    expect(g.phase).toBe('game-over');
    expect(g.winner).toBe('player');
    expect(g.log.at(-1)?.outcome).toBe('sunk');
  });
});
