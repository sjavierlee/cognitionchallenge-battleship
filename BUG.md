# Bug Log

Bugs found while building and testing the game, with root cause and the fix
that was (or would be) applied. Newest entries at the bottom of each section.

Status legend: **Fixed** (in this branch) · **Open** (not yet fixed) ·
**Won't fix** (documented, intentionally left).

---

## Build phase

### 1. Dev server crashed on start: "Cannot find native binding" — Fixed

- **Description:** Right after scaffolding, `npm run dev` / `vite build` died
  with `Error: Cannot find native binding. npm has a bug related to optional
dependencies…` and Node engine warnings.
- **Root cause:** `npm create vite` (Sept 2026) scaffolds the Rolldown-based
  Vite 7 line, whose native binary is an optional dependency that requires
  Node `^20.19 || >=22.12`. The box runs Node 20.18.1, so npm skipped the
  optional package and the JS entrypoint had no binding to load.
- **Fix:** Pinned a compatible, well-aged toolchain in `package.json`
  (Vite 6, Vitest 3, TypeScript 5.7, ESLint 9, React 18), deleted
  `node_modules` + `package-lock.json`, reinstalled. Documented Node 20 in the
  environment blueprint so future sessions match.

### 2. `tsc` rejected the generated tsconfig — Fixed

- **Description:** `npm run typecheck` failed with unknown compiler option
  `erasableSyntaxOnly`.
- **Root cause:** Same scaffold mismatch as #1 — the generated
  `tsconfig.app.json` targets TS ≥ 5.8 options, but we pinned TS 5.7.
- **Fix:** Rewrote `tsconfig.app.json` / `tsconfig.node.json` for TS 5.7 with
  the strictness flags we want (`strict`, `noUnusedLocals`,
  `noUnusedParameters`, `noFallthroughCasesInSwitch`,
  `noUncheckedSideEffectImports`, `moduleResolution: bundler`).

### 3. Own-board water cells announced as "unknown" — Fixed

- **Description:** Every empty cell on _Your fleet_ had
  `aria-label="C5, unknown"` (and the same text as a hover tooltip). "Unknown"
  only makes sense for the enemy board; the player knows their own water.
- **Root cause:** `describeCell(state, showShips)` in `src/ui/Board.tsx`
  returned `'unknown'` for `'empty'` unconditionally, ignoring `showShips`.
- **Fix:** `case 'empty': return showShips ? 'empty' : 'unknown'`. Also dropped
  the `title` attribute on cells — the tooltip was popping over the board
  during play and the axis labels already give the coordinate.

### 4. Battle layout wrapped: boards stacked instead of side by side — Fixed

- **Description:** On a 1500px-wide desktop viewport the battle screen showed
  _Your fleet_ above _Enemy waters_ with a huge empty column on the right,
  forcing scrolling to see the enemy board.
- **Root cause:** `.app` capped at 1200px, cells at `clamp(22px, 3.6vw, 40px)`.
  Two boards at 40px cells (≈ 462px each incl. labels/padding) plus the 260px
  shot-log column plus gaps exceeded the 1136px content width, so
  `.boards { flex-wrap: wrap }` wrapped the second board.
- **Fix:** `--cell: clamp(22px, 3.4vw, 36px)` and `.app { max-width: 1280px }`
  so two boards + log fit; added a `max-width: 1100px` breakpoint that moves
  the shot log below the boards before the boards themselves have to stack
  (`max-width: 900px`).

### 5. Win/loss record could be counted twice — Fixed (pre-emptively)

- **Description:** The game-over effect in `App.tsx` writes the result to
  `localStorage`. Any re-render while `phase === 'game-over'` (sound toggle,
  record state update itself) would re-run it and record a second win/loss.
- **Root cause:** Effect keyed only on `over`; nothing distinguished "this game
  has already been recorded" from "still on the same finished game".
- **Fix:** Added `gameId` to `AppState` (incremented by `play-again`) and a
  `recordedFor` ref; the effect returns early when `recordedFor.current ===
gameId`.

### 6. Sound effect skipped on the first shot of a new game — Fixed

- **Description:** After _Play again_, the first shot of the new game sometimes
  played no sound, or the last sound of the previous game replayed.
- **Root cause:** The sound effect de-duplicated on `shotSeq` alone.
  `play-again` resets `shotSeq` to 0, so the sequence values of the new game
  collided with those already "played" in the previous game.
- **Fix:** De-dupe on a combined key `gameId * 1000 + shotSeq` in the
  `playedSeq` ref.

### 7. UI test hung with fake timers — Fixed (test-only)

- **Description:** The battle-turn RTL test timed out at 5s when using
  `vi.useFakeTimers()` + `userEvent.setup({ advanceTimers })`.
- **Root cause:** `@testing-library/user-event` awaits internal
  `setTimeout(0)` delays between pointer events; with all timers faked and only
  advanced manually, the click promise never resolved.
- **Fix:** Use real timers and `waitFor(..., { timeout: 3000 })` for the 700ms
  AI reply instead of faking time.

### 8. AI benchmark exceeded Vitest's default timeout — Won't fix

- **Description:** A temporary test that ran 200 full games per difficulty to
  print average shots-to-win (Easy ≈ 66, Normal ≈ 44, Hard ≈ 39) failed with
  "Test timed out in 5000ms".
- **Root cause:** Hard's probability-density hunt evaluates every legal
  placement of every remaining ship per shot; 200 games is seconds of CPU.
- **Fix:** Not a product bug. Removed the benchmark; the committed suite keeps
  the assertion `mean(hard) < mean(normal) < mean(easy)` over a small sample
  (`src/ai/huntTarget.test.ts`) which runs in well under the limit.

---

## Test phase (end-to-end browser run)

Findings from the recorded end-to-end run of PR #1 (placement validation, all
three difficulties, a full Normal game to Defeat, persistence, 400px layout).

### 9. Shot log clipped "Sunk Submarine" and grew a horizontal scrollbar — Fixed

- **Description:** On desktop, a sunk entry in the shot log rendered as
  `Sunk` / `Submarine` cut off at the right edge, and the whole list gained a
  horizontal scrollbar. Repro: play Normal/Hard until the AI sinks a ship and
  the log is long enough to scroll; look at the sunk row.
- **Root cause:** `.shot-log-item` used `grid-template-columns: 2.6em 2.6em
2.6em 1fr`. Grid items default to `min-width: auto`, so the bold
  "Sunk Submarine" text set a minimum width larger than the 260px column and
  the row overflowed. `.shot-log-list { overflow-y: auto }` implicitly makes
  `overflow-x` auto as well, hence the scrollbar.
- **Fix (`src/index.css`):** last column `minmax(0, 1fr)`,
  `.shot-log-outcome { min-width: 0; overflow-wrap: anywhere }` so the text
  wraps inside the row, `overflow-x: hidden` on the list, slightly narrower
  fixed columns (2.4em) to give the result more room.

### 10. Stale Vite HMR errors in the console — Won't fix

- **Description:** The tester saw Vite hot-reload errors in the browser console
  at the start of the run.
- **Root cause:** Left over from live-editing `index.css`/`Board.tsx` in the
  same tab during development; they were emitted before the test started and
  did not recur during gameplay. No React warnings or runtime errors appeared.
- **Fix:** None needed — dev-server artefact, not present in the production
  build.

### 11. `npm run lint` failed on Vite's dependency cache — Fixed

- **Description:** After the browser test run, `eslint .` reported an error in
  `.vite/deps/chunk-*.js` (`Definition for rule
'react-internal/safe-string-coercion' was not found`) plus ten warnings in
  `.vite/deps/react-dom_client.js`, so lint went red without any source change.
- **Root cause:** Vite writes its pre-bundled dependency cache to
  `node_modules/.vite` by default, but when the dev server is started with a
  different cwd/cache setting it lands in a repo-root `.vite/` directory. That
  directory was not in `.gitignore`, the ESLint `ignores` list, or
  `.prettierignore`, so the flat config's `**/*.js` matching picked up
  third-party bundles.
- **Fix:** Added `.vite` (and `coverage`) to `.gitignore`, `.vite` to
  `eslint.config.js` `ignores`, and `.prettierignore`.

### Not covered by the run

- The Victory overlay and win-count increment were not exercised in the browser
  (the recorded game ended in Defeat). They are covered by the reducer/engine
  tests (`game.test.ts` "player wins", `App.test.tsx`), and the code path is
  the same `game-over` effect as Defeat with `winner === 'player'`.
- Audible sound output was not assessed, only the toggle's persistence.
