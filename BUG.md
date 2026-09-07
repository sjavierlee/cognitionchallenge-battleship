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

## Review phase (Devin Review on PR #1)

### 12. Hard AI could skip past the hit instead of firing adjacent — Fixed

- **Description:** After a single unresolved hit, Hard mode's `targetHard`
  occasionally fired two or more cells away from the hit when several cells
  tied on placement density. That breaks the promised hunt → target contract
  (Normal never did this).
- **Root cause:** `targetHard` built its candidate set from _every_ unknown cell
  in _every_ legal placement covering the hit cluster, then ranked by density.
  Cells far along a possible carrier placement can have the same count as the
  immediate neighbours, and `bestByDensity` breaks ties randomly.
- **Fix (`src/ai/huntTarget.ts`):** shared `clusterCandidates()` — orthogonal
  neighbours after one hit, line extensions after 2+ collinear hits — is now the
  candidate set for both Normal and Hard; Hard only uses the density map to
  rank _within_ that set. Test added: 200 seeds after one mid-board hit, every
  shot at Manhattan distance 1.

### 13. Picking up a ship from the tray lost its orientation — Fixed

- **Description:** Randomize, then click a vertical ship in the tray: the
  preview came back horizontal. Clicking the ship on the board behaved
  correctly.
- **Root cause:** Two code paths pick up a ship — `place-at` on an occupied
  cell (which derived orientation from the ship's cells) and `pick-up` from the
  tray (which didn't touch `orientation`, so the previous selection's value
  leaked through).
- **Fix (`src/ui/appState.ts`):** extracted `shipOrientation(ship)` and used it
  in both paths. Reducer test added.

### 14. Any `localStorage` failure could crash the app — Fixed

- **Description:** In private mode / with storage blocked or full, `getItem` /
  `setItem` can throw even though `window.localStorage` exists. `loadRecord`
  (called during first render), `saveRecord` (game over) and the sound toggle
  would have propagated the exception and blanked the app.
- **Root cause:** Only the _acquisition_ of `window.localStorage` was wrapped in
  `try/catch`; the individual operations were not.
- **Fix (`src/storage/record.ts`):** every access goes through best-effort
  `read()` / `write()` helpers that swallow storage errors. Test mocks
  `Storage.prototype.*` to throw and asserts nothing propagates.

### 15. Malformed saved record could crash the result screen — Fixed

- **Description:** A hand-edited or older-schema `battleship.record` (e.g.
  `perDifficulty.easy = null`, string counts) loaded without validation, and
  `recordResult` then dereferenced `record.perDifficulty[difficulty].wins`.
- **Root cause:** `loadRecord` shallow-merged `parsed.perDifficulty` over the
  defaults, so any present-but-invalid key replaced the valid default.
- **Fix:** `loadRecord` rebuilds a fresh `GameRecord` from validated
  finite/non-negative integers per field and per difficulty; unknown or invalid
  values fall back to 0. Table-driven test over six malformed payloads.

### 16. Two tabs finishing games overwrote each other's record — Fixed

- **Description:** Each tab incremented the record it loaded at startup and
  wrote that back, so the last tab to finish erased results saved by the other.
- **Root cause:** The game-over effect derived the new record from React state
  (`setRecord(prev => ...)`) rather than from storage.
- **Fix:** new `commitResult(difficulty, won)` re-reads the persisted record,
  applies the result and saves; `App` also listens to the `storage` event so
  the displayed totals refresh when another tab writes. Test simulates the
  other-tab write before commit.

## Visual pass (nautical theme, ship art, light/dark)

### 17. Placement ghost was half-hidden under the hovered cell — Fixed

- **Description:** While hovering to place a ship, only the far half of the
  ghost silhouette was visible; the cell under the cursor drew over it and its
  valid/invalid tint was lost behind the generic hover colour.
- **Root cause:** The footprint tint classes shared the shot markers'
  `z-index: 2`, which stacks above the sprite overlay (`z-index: 1`), and the
  later `.cell:hover` rule out-specified the tint background.
- **Fix (`src/index.css`):** footprint tints stay at the cells' base z-index so
  the ghost draws on top, and `.cell--preview-*:hover` selectors keep the
  green/red tint over the hover colour.

### 18. "Opponent" legend floated outside its panel — Fixed

- **Description:** After restyling `DifficultyPicker` as a panel, its
  `<legend>` rendered straddling the panel's top border with a gap beneath it.
- **Root cause:** Browsers position a `<legend>` on the fieldset border by
  default; the panel padding/border no longer matched that layout.
- **Fix:** `legend { float: left; width: 100% }` plus `clear: both` on the
  options keeps the semantic fieldset/legend while laying it out like the other
  panel titles.

### 19. Battle boards stacked vertically at laptop widths — Fixed

- **Description:** At 1280px the two boards wrapped onto separate rows beside
  the shot log, leaving most of the viewport empty.
- **Root cause:** Cell size is viewport-derived (`--cell`); with the larger
  placement-screen cells, two boards plus the 300px log exceeded the container.
- **Fix:** `.layout--battle` sets a slightly smaller `--cell` clamp so both
  boards fit side by side down to ~900px, and the sub-900px breakpoint restores
  the larger mobile cells (boards stack there anyway).

### Coverage notes

- The first recorded run ended in Defeat, so the Victory overlay was only
  covered by unit tests. A follow-up recorded run played Easy to a win (55
  shots, 31% accuracy) and confirmed the Victory overlay, per-difficulty and
  overall record increment, Play Again, and persistence across reload. A
  deterministic RTL test (`App.test.tsx`, seeded rng + `aiDelayMs={0}`) now
  also drives a full win.
- Audible sound output was not assessed, only the toggle's persistence.
