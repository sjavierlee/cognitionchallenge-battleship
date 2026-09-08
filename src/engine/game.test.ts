import { describe, expect, it } from 'vitest';
import { createBoard, randomizeFleet } from './board';
import { applyShotResult, createGame, fire, setPlayerBoard, startGame, startVersus } from './game';
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
    expect(g.opponent.ships).toHaveLength(0);
  });

  it('refuses to start with an incomplete fleet', () => {
    expect(() => startGame(createGame())).toThrow();
  });

  it('starting randomizes the AI fleet and gives the player the first turn', () => {
    const g = readyGame();
    expect(g.phase).toBe('player-turn');
    expect(g.opponent.ships).toHaveLength(5);
  });

  it('alternates turns and appends to the log', () => {
    let g = readyGame();
    g = fire(g, 'player', { row: 0, col: 0 });
    expect(g.phase).toBe('opponent-turn');
    expect(g.log).toHaveLength(1);
    expect(g.log[0].by).toBe('player');
    g = fire(g, 'opponent', { row: 0, col: 0 });
    expect(g.phase).toBe('player-turn');
    expect(g.log).toHaveLength(2);
  });

  it('rejects firing out of turn', () => {
    const g = readyGame();
    expect(() => fire(g, 'opponent', { row: 0, col: 0 })).toThrow();
  });

  it('declares the player the winner once every AI ship is sunk', () => {
    let g = readyGame();
    const cells = g.opponent.ships.flatMap((s) => s.cells);
    let aiShotIdx = 0;
    for (const c of cells) {
      g = fire(g, 'player', c);
      if (g.phase === 'game-over') break;
      // AI shoots somewhere harmless-ish (sequential scan); it cannot win first with only 17 shots
      const row = Math.floor(aiShotIdx / BOARD_SIZE);
      const col = aiShotIdx % BOARD_SIZE;
      aiShotIdx++;
      g = fire(g, 'opponent', { row, col });
    }
    expect(g.phase).toBe('game-over');
    expect(g.winner).toBe('player');
    expect(g.log.at(-1)?.outcome).toBe('sunk');
  });
});

describe('versus a remote player (tracking grid)', () => {
  function versus(first: 'player' | 'opponent' = 'player'): GameState {
    const rng = seededRng(7);
    const game = setPlayerBoard(createGame(), randomizeFleet(createBoard(), rng));
    return startVersus(game, first);
  }

  it('starts with an empty tracking grid and the chosen side to move', () => {
    expect(versus('player').phase).toBe('player-turn');
    expect(versus('opponent').phase).toBe('opponent-turn');
    expect(versus().opponent.ships).toHaveLength(0);
  });

  it('records reported outcomes and passes the turn', () => {
    let g = versus();
    g = applyShotResult(g, { row: 0, col: 0 }, 'miss');
    expect(g.opponent.cells[0][0]).toBe('miss');
    expect(g.phase).toBe('opponent-turn');
    expect(g.log).toEqual([{ by: 'player', at: { row: 0, col: 0 }, outcome: 'miss' }]);
    expect(() => applyShotResult(g, { row: 0, col: 1 }, 'miss')).toThrow(/turn/);
  });

  it('adds a reported sunk ship to the grid so it can be drawn', () => {
    let g = versus();
    g = applyShotResult(g, { row: 2, col: 3 }, 'hit');
    g = fire(g, 'opponent', { row: 9, col: 9 });
    const cells = [
      { row: 2, col: 3 },
      { row: 2, col: 4 },
    ];
    g = applyShotResult(g, { row: 2, col: 4 }, 'sunk', { kind: 'destroyer', cells });
    expect(g.opponent.ships).toEqual([
      { kind: 'destroyer', name: 'Destroyer', size: 2, cells, hits: 2 },
    ]);
    expect(g.opponent.cells[2][3]).toBe('sunk');
    expect(g.phase).toBe('opponent-turn');
  });

  it('rejects sunk reports that contradict earlier results', () => {
    const g = versus();
    const bad = [
      { row: 2, col: 3 },
      { row: 2, col: 4 },
    ];
    // Second cell was never reported as a hit.
    expect(() =>
      applyShotResult(g, { row: 2, col: 3 }, 'sunk', { kind: 'destroyer', cells: bad }),
    ).toThrow(/earlier hits/);
    // Wrong length for the class.
    expect(() =>
      applyShotResult(g, { row: 2, col: 3 }, 'sunk', { kind: 'carrier', cells: bad }),
    ).toThrow();
    expect(() => applyShotResult(g, { row: 2, col: 3 }, 'sunk')).toThrow(/missing/);
  });

  it('ends the game when the opponent says so or when all five ships are tracked as sunk', () => {
    let g = versus();
    g = applyShotResult(g, { row: 0, col: 0 }, 'miss', undefined, true);
    expect(g.phase).toBe('game-over');
    expect(g.winner).toBe('player');

    let h = versus();
    const fleet = randomizeFleet(createBoard(), seededRng(3));
    for (const ship of fleet.ships) {
      for (const [i, c] of ship.cells.entries()) {
        const last = i === ship.cells.length - 1;
        h = applyShotResult(h, c, last ? 'sunk' : 'hit', last ? ship : undefined);
        if (h.phase === 'game-over') break;
        const n = h.log.filter((s) => s.by === 'opponent').length;
        h = fire(h, 'opponent', { row: Math.floor(n / BOARD_SIZE), col: n % BOARD_SIZE });
      }
    }
    expect(h.phase).toBe('game-over');
    expect(h.winner).toBe('player');
  });
});
