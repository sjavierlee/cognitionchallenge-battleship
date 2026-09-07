# Battleship — Implementation Plan

A simple, shareable Battleship web game playable in the browser against an AI opponent.

## 1. Goals

- Playable end-to-end in a browser with no install: open a link, play.
- Classic rules: 10x10 grid, 5 ships per side, alternate single shots, first to sink all enemy ships wins.
- Player places ships manually (click/drag + rotate) or hits **Randomize**.
- AI opponent uses a **Hunt / Target** strategy, not random firing.
- Easy to share: static build deployable to Vercel / Netlify with zero backend.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Stack | Vite + React 18 + TypeScript |
| Placement | Click ship in tray → hover preview → click to place; `R` rotates |
| AI | Easy / Normal / Hard selector |
| Adjacency | Ships may **not** touch — at least one empty cell (incl. diagonals) between ships |
| Deploy | Vercel / Netlify (config files included; repo connected by owner) |
| Extras | Shot history log panel, win/loss record in `localStorage`, shot/hit animations + sound toggle (off by default) |

## 2. Non-goals (v1)

- Multiplayer / networking / accounts.
- Persistence beyond the win/loss record (no saved games).
- Salvo or other rule variants.

## 3. Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript | Type safety for grid/ship/state logic; catches off-by-one and orientation bugs early |
| UI | React 18 | Small component tree (two boards, controls, status); familiar, well-supported |
| Build | Vite | Fast dev server, one-command static build, zero-config on Vercel/Netlify |
| Styling | Plain CSS | Grid is easy with CSS Grid; keeps bundle small |
| Tests | Vitest | Same toolchain as Vite; unit-test the pure game engine and AI |
| Lint/format | ESLint + Prettier | Standard |

## 4. Architecture

Keep the **game engine and AI as pure, framework-free TypeScript** so they are unit-testable and could be reused (e.g. in a future multiplayer server).

```
src/
  engine/
    types.ts        # Coordinate, Orientation, Ship, Board, Cell state, GamePhase
    board.ts        # createBoard, canPlace (bounds, overlap, no-touch), placeShip, randomizeFleet, receiveShot
    ships.ts        # FLEET definition: Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2
    game.ts         # Game state machine: setup -> playing -> gameover; turn handling
    rng.ts          # Seedable RNG (deterministic tests, optional shareable seeds)
  ai/
    huntTarget.ts   # Hunt/Target AI, parameterised by difficulty (see section 6)
    density.ts      # Probability-density map for Hard hunting
  storage/
    record.ts       # localStorage win/loss record
  audio/
    sounds.ts       # Web Audio beeps for fire/hit/miss/sunk; muted by default
  ui/
    App.tsx
    Board.tsx       # Renders a 10x10 grid; props: cells, onCellClick, showShips, disabled
    ShipTray.tsx    # Ships awaiting placement; select, rotate, randomize, reset
    StatusBar.tsx   # Turn indicator, messages ("Hit!", "You sank their Cruiser!")
    ShotLog.tsx     # Scrollable history of every shot, both sides
    DifficultyPicker.tsx
    GameOver.tsx    # Result, stats, updated win/loss record, Play Again
  main.tsx
tests/
  board.test.ts, game.test.ts, ai.test.ts
```

### State model (engine)

```ts
type Coord = { row: number; col: number };          // 0..9
type Orientation = 'horizontal' | 'vertical';
type ShipKind = 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer';
type Ship = { kind: ShipKind; size: number; cells: Coord[]; hits: number };
type CellState = 'empty' | 'ship' | 'miss' | 'hit' | 'sunk';
type Board = { cells: CellState[][]; ships: Ship[] };
type Phase = 'placement' | 'player-turn' | 'ai-turn' | 'game-over';
type GameState = {
  phase: Phase;
  player: Board;
  ai: Board;
  winner?: 'player' | 'ai';
  log: ShotResult[];
};
type ShotResult = { by: 'player' | 'ai'; at: Coord; outcome: 'miss' | 'hit' | 'sunk'; sunk?: ShipKind };
```

All engine functions are pure: `(state, action) => newState`. UI holds state via `useReducer`.

## 5. Gameplay Loop

1. **Placement phase**
   - Player sees own empty board + ship tray.
   - Click a ship in the tray, hover over board to preview (green = valid, red = invalid), click to place. `R` key or button rotates.
   - Click a placed ship to pick it up again.
   - Placement is invalid if any cell is out of bounds, overlaps a ship, or is orthogonally/diagonally adjacent to another ship.
   - **Randomize** places all 5 ships randomly (valid, non-touching). **Reset** clears.
   - Pick AI difficulty (Easy / Normal / Hard) before starting.
   - **Start Game** enabled once all 5 placed. AI fleet is randomized at start under the same no-touch rule.
2. **Battle phase**
   - Two boards side by side: *Your Fleet* (ships visible, incoming shots shown) and *Enemy Waters* (ships hidden, your shots shown).
   - Player clicks a cell on Enemy Waters → engine resolves → status message → if game not over, AI takes its turn (short delay ~500ms for readability) → back to player.
   - Cannot fire at an already-targeted cell.
   - Sunk ships are revealed/highlighted on the enemy board.
3. **Game over**
   - Banner with winner, shot count / accuracy, **Play Again**.

## 6. AI: Hunt / Target Strategy

The AI keeps its own view of the player's board: `unknown | miss | hit | sunk`, plus a **target queue**.

### Hunt mode (no active hits)
- Fire at `unknown` cells using **parity**: because the smallest ship is 2 long, every ship covers at least one cell where `(row + col) % 2 === 0`. Restrict hunting to that checkerboard (halves the search space).
- Prefer cells with higher **probability density**: for each unknown cell, count how many ways each remaining (unsunk) ship could legally overlap it given known misses/sunk cells. Pick the max (random tie-break). This is a big upgrade over pure random parity and still cheap on a 10x10 board.
- Once all remaining ships are ≥3 long, parity can be widened (skip every 3rd cell), but the density map already handles this implicitly — parity is a fast filter, density is the ranking.

### Target mode (at least one hit that is not part of a sunk ship)
- On first hit: push the 4 orthogonal neighbors (that are `unknown`) onto the target stack.
- On second adjacent hit: infer orientation; drop perpendicular candidates and extend along the line in both directions until a miss/edge/sunk.
- When a ship is reported sunk: mark those cells `sunk` and — because ships cannot touch — mark every cell in the surrounding ring as `miss` (impossible). Return to Hunt.
- Because of the no-touch rule a contiguous line of hits always belongs to exactly one ship, which simplifies targeting: extend along the line until the ship is reported sunk.

### Difficulty levels
- **Easy**: uniformly random hunt over unknown cells; on a hit, fires at random unknown neighbours (no orientation inference). Beatable by most players.
- **Normal**: parity (checkerboard) hunt; target mode with orientation inference; excludes ring around sunk ships.
- **Hard**: probability-density hunt (respects parity, misses, sunk rings, and remaining ship sizes); orientation-aware targeting that also ranks candidate cells by density. Typically finishes in ~40–50 shots.

## 7. UI / UX Details

- Responsive: boards stack vertically on narrow screens.
- Cell legend: water, ship, hit (red), miss (white dot), sunk (dark red).
- Keyboard: `R` rotate during placement.
- Accessibility: buttons for every action, `aria-label` on cells ("B7, miss"), focus styles.
- Shot/hit animations: brief splash for miss, flash/pulse for hit, shake + reveal for sunk (CSS keyframes, honours `prefers-reduced-motion`).
- Sound: Web Audio synthesized tones (no asset files) for fire/hit/miss/sunk; toggle in header, **off by default**, preference stored in `localStorage`.
- Shot log panel: every shot listed as `#12 You → B7: Hit` / `#13 AI → F2: Sunk Destroyer`, newest at top, auto-scroll.
- Win/loss record: `battleship.record` in `localStorage` = `{ wins, losses, perDifficulty }`; shown in header and on Game Over; reset button.

## 8. Shareability / Deployment

- `npm run build` → static `dist/`.
- `vercel.json` and `netlify.toml` included (build command `npm run build`, publish `dist`). Owner connects the GitHub repo in the Vercel/Netlify dashboard; every push to `main` auto-deploys and PRs get preview URLs.
- GitHub Actions CI runs lint + typecheck + tests on every PR.

## 9. Testing Strategy

- **Engine**: placement validation (bounds, overlap), randomize always yields a valid fleet, shot resolution (miss/hit/sunk), win detection.
- **AI**: never fires at the same cell twice; always sinks a random fleet in ≤100 shots; average shots-to-win over 1,000 seeded games is well under random baseline (~95) — target ≈ 45–55 for Hard.
- **Engine (no-touch)**: adjacent and diagonal placements rejected; randomize never produces touching ships.
- **UI**: a few React Testing Library smoke tests (place ships, start, fire a shot).
- CI: lint + typecheck + tests on every PR.

## 10. Milestones

1. **Scaffold** — Vite + React + TS, ESLint/Prettier, Vitest, CI, Vercel/Netlify config.
2. **Engine** — types, board ops, no-touch placement, randomize, shot resolution, win detection + tests.
3. **AI** — Easy/Normal/Hard hunt-target; simulation tests.
4. **Placement UI** — tray, hover preview, rotate, randomize, reset, difficulty picker, start.
5. **Battle UI** — two boards, turn loop, status bar, shot log, game over.
6. **Polish** — animations, sound toggle, win/loss record, responsive layout, a11y.
7. **Ship** — README; owner connects repo to Vercel/Netlify.
