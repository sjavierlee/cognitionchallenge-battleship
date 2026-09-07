export const BOARD_SIZE = 10;

export type Coord = { row: number; col: number };

export type Orientation = 'horizontal' | 'vertical';

export type ShipKind = 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer';

export type ShipSpec = { kind: ShipKind; name: string; size: number };

export type Ship = ShipSpec & { cells: Coord[]; hits: number };

/** What actually exists / has happened at a cell on a board. */
export type CellState = 'empty' | 'ship' | 'miss' | 'hit' | 'sunk';

export type Board = { cells: CellState[][]; ships: Ship[] };

export type Player = 'player' | 'ai';

export type Phase = 'placement' | 'player-turn' | 'ai-turn' | 'game-over';

export type Outcome = 'miss' | 'hit' | 'sunk';

export type ShotResult = {
  by: Player;
  at: Coord;
  outcome: Outcome;
  sunk?: ShipKind;
};

export type GameState = {
  phase: Phase;
  player: Board;
  ai: Board;
  winner?: Player;
  log: ShotResult[];
};
