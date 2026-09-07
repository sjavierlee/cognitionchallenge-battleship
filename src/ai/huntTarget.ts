import {
  coordKey,
  inBounds,
  orthogonalNeighbors,
  shipCells,
  surroundingCells,
} from '../engine/coords';
import { defaultRng, pick, type Rng } from '../engine/rng';
import { FLEET } from '../engine/ships';
import {
  BOARD_SIZE,
  type Coord,
  type Orientation,
  type Outcome,
  type ShipKind,
  type ShipSpec,
} from '../engine/types';

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: readonly { id: Difficulty; label: string; blurb: string }[] = [
  { id: 'easy', label: 'Easy', blurb: 'Random search, follows up on hits' },
  { id: 'normal', label: 'Normal', blurb: 'Checkerboard search, infers ship direction' },
  { id: 'hard', label: 'Hard', blurb: 'Probability-density search, ruthless targeting' },
];

/** What the AI knows about a cell on the opponent's board. */
export type Knowledge = 'unknown' | 'miss' | 'hit' | 'sunk';

export type AiState = {
  difficulty: Difficulty;
  view: Knowledge[][];
  /** Ships not yet sunk. */
  remaining: ShipSpec[];
  /** Hits that do not yet belong to a sunk ship. */
  activeHits: Coord[];
};

export type AiObservation = { at: Coord; outcome: Outcome; sunk?: ShipKind };

export function createAi(difficulty: Difficulty, fleet: readonly ShipSpec[] = FLEET): AiState {
  const view: Knowledge[][] = [];
  for (let r = 0; r < BOARD_SIZE; r++) view.push(new Array<Knowledge>(BOARD_SIZE).fill('unknown'));
  return { difficulty, view, remaining: [...fleet], activeHits: [] };
}

export function aiMode(state: AiState): 'hunt' | 'target' {
  return state.activeHits.length > 0 ? 'target' : 'hunt';
}

function knowledgeAt(state: AiState, c: Coord): Knowledge {
  return state.view[c.row][c.col];
}

function unknownCells(state: AiState): Coord[] {
  const out: Coord[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (state.view[row][col] === 'unknown') out.push({ row, col });
    }
  }
  return out;
}

/** Hits connected (orthogonally) to `start` through other active hits. */
function hitCluster(state: AiState, start: Coord): Coord[] {
  const active = new Set(state.activeHits.map(coordKey));
  const seen = new Set<string>([coordKey(start)]);
  const queue = [start];
  const cluster: Coord[] = [];
  while (queue.length) {
    const c = queue.pop()!;
    cluster.push(c);
    for (const n of orthogonalNeighbors(c)) {
      const k = coordKey(n);
      if (active.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push(n);
      }
    }
  }
  return cluster;
}

/**
 * Every legal placement of a remaining ship, given current knowledge: all cells must be
 * `unknown` or `hit`. If `mustCover` is given, the placement must include all of those cells.
 */
function candidatePlacements(state: AiState, mustCover: Coord[] = []): Coord[][] {
  const placements: Coord[][] = [];
  const coverKeys = mustCover.map(coordKey);
  for (const spec of state.remaining) {
    for (const orientation of ['horizontal', 'vertical'] as const) {
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          const cells = shipCells({ row, col }, spec.size, orientation as Orientation);
          if (!cells.every((c) => inBounds(c))) continue;
          if (!cells.every((c) => ['unknown', 'hit'].includes(knowledgeAt(state, c)))) continue;
          if (coverKeys.length) {
            const keys = new Set(cells.map(coordKey));
            if (!coverKeys.every((k) => keys.has(k))) continue;
          }
          placements.push(cells);
        }
      }
    }
  }
  return placements;
}

/** Counts, for every unknown cell, how many candidate placements cover it. */
function densityMap(state: AiState, mustCover: Coord[] = []): Map<string, number> {
  const density = new Map<string, number>();
  for (const cells of candidatePlacements(state, mustCover)) {
    for (const c of cells) {
      if (knowledgeAt(state, c) !== 'unknown') continue;
      const k = coordKey(c);
      density.set(k, (density.get(k) ?? 0) + 1);
    }
  }
  return density;
}

function bestByDensity(density: Map<string, number>, candidates: Coord[], rng: Rng): Coord | null {
  let best: Coord[] = [];
  let bestScore = -1;
  for (const c of candidates) {
    const score = density.get(coordKey(c)) ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = [c];
    } else if (score === bestScore) {
      best.push(c);
    }
  }
  return best.length ? pick(rng, best) : null;
}

function huntEasy(state: AiState, rng: Rng): Coord {
  return pick(rng, unknownCells(state));
}

function huntNormal(state: AiState, rng: Rng): Coord {
  const unknown = unknownCells(state);
  const parity = unknown.filter((c) => (c.row + c.col) % 2 === 0);
  return pick(rng, parity.length ? parity : unknown);
}

function huntHard(state: AiState, rng: Rng): Coord {
  const unknown = unknownCells(state);
  const density = densityMap(state);
  return bestByDensity(density, unknown, rng) ?? pick(rng, unknown);
}

/** Unknown cells at either end of a collinear run of hits. */
function lineExtensions(state: AiState, cluster: Coord[]): Coord[] {
  const rows = new Set(cluster.map((c) => c.row));
  const horizontal = rows.size === 1;
  const sorted = [...cluster].sort((a, b) => (horizontal ? a.col - b.col : a.row - b.row));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const ends = horizontal
    ? [
        { row: first.row, col: first.col - 1 },
        { row: last.row, col: last.col + 1 },
      ]
    : [
        { row: first.row - 1, col: first.col },
        { row: last.row + 1, col: last.col },
      ];
  return ends.filter((c) => inBounds(c) && knowledgeAt(state, c) === 'unknown');
}

function targetEasy(state: AiState, rng: Rng): Coord {
  const candidates = state.activeHits
    .flatMap((h) => orthogonalNeighbors(h))
    .filter((c) => knowledgeAt(state, c) === 'unknown');
  return candidates.length ? pick(rng, candidates) : huntEasy(state, rng);
}

function targetNormal(state: AiState, rng: Rng): Coord {
  const cluster = hitCluster(state, state.activeHits[0]);
  const candidates =
    cluster.length >= 2
      ? lineExtensions(state, cluster)
      : orthogonalNeighbors(cluster[0]).filter((c) => knowledgeAt(state, c) === 'unknown');
  if (candidates.length) return pick(rng, candidates);
  // Should not happen under the no-touch rule; fall back to any neighbour of any active hit.
  const fallback = state.activeHits
    .flatMap((h) => orthogonalNeighbors(h))
    .filter((c) => knowledgeAt(state, c) === 'unknown');
  return fallback.length ? pick(rng, fallback) : huntNormal(state, rng);
}

function targetHard(state: AiState, rng: Rng): Coord {
  const cluster = hitCluster(state, state.activeHits[0]);
  const density = densityMap(state, cluster);
  const candidates = [...density.keys()].map((k) => {
    const [row, col] = k.split(',').map(Number);
    return { row, col };
  });
  return bestByDensity(density, candidates, rng) ?? targetNormal(state, rng);
}

/** Picks the AI's next shot. Never returns a cell it has already fired at. */
export function chooseShot(state: AiState, rng: Rng = defaultRng): Coord {
  const mode = aiMode(state);
  switch (state.difficulty) {
    case 'easy':
      return mode === 'target' ? targetEasy(state, rng) : huntEasy(state, rng);
    case 'normal':
      return mode === 'target' ? targetNormal(state, rng) : huntNormal(state, rng);
    case 'hard':
      return mode === 'target' ? targetHard(state, rng) : huntHard(state, rng);
  }
}

/** Updates the AI's knowledge with the result of its shot. */
export function observe(state: AiState, obs: AiObservation): AiState {
  const view = state.view.map((row) => [...row]);
  const { at } = obs;

  if (obs.outcome === 'miss') {
    view[at.row][at.col] = 'miss';
    return { ...state, view };
  }

  if (obs.outcome === 'hit') {
    view[at.row][at.col] = 'hit';
    return { ...state, view, activeHits: [...state.activeHits, at] };
  }

  // sunk
  view[at.row][at.col] = 'hit';
  const withHit: AiState = { ...state, view, activeHits: [...state.activeHits, at] };
  const sunkCells = hitCluster(withHit, at);
  const sunkKeys = new Set(sunkCells.map(coordKey));
  for (const c of sunkCells) view[c.row][c.col] = 'sunk';

  if (state.difficulty !== 'easy') {
    // Ships never touch, so the ring around a sunk ship is guaranteed empty.
    for (const c of sunkCells) {
      for (const n of surroundingCells(c)) {
        if (view[n.row][n.col] === 'unknown') view[n.row][n.col] = 'miss';
      }
    }
  }

  return {
    ...state,
    view,
    remaining: state.remaining.filter((s) => s.kind !== obs.sunk),
    activeHits: withHit.activeHits.filter((h) => !sunkKeys.has(coordKey(h))),
  };
}
