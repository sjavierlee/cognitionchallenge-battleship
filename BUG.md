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

### 20. Horizontal ship silhouettes sat at the bottom of their cells — Fixed

- **Description (user-reported):** Horizontally placed ships on the player grid
  (and the placement ghost) rendered flush with the bottom edge of their row,
  spilling over the row boundary, instead of being vertically centred like the
  vertical ships were horizontally.
- **Root cause:** The sprite `<svg>` used `height: 100%` inside a grid-item
  wrapper with percentage padding. Chrome did not resolve the percentage
  height against the wrapper, so the SVG fell back to its intrinsic aspect
  ratio (5:1 for the carrier): it became taller than the row, was anchored at
  the wrapper's top padding edge and overflowed downward, dragging the artwork
  (centred inside the SVG) below the cell's midline. Vertical ships were only
  1 cell wide, so the same fallback happened to yield the right size.
- **Fix:** Make `.board-ship` a positioning context and absolutely position the
  sprite with explicit `top/left` and `width/height: calc(100% - 2 * inset)`
  (inset derived from `--cell`), which always resolves against the grid area.
  Verified with a DOM measurement script: hull top/bottom margins are now equal
  for horizontal ships (e.g. 12px/12px) and unchanged for vertical ones.

### 21. Sunk ships in the fleet roster looked like a red line cut through them — Fixed

- **Description (user-reported):** A sunk ship in the roster under each battle
  board was recoloured red and struck through with a thin horizontal line,
  which at 12px tall read as a red slash rather than a destroyed ship.
- **Root cause:** The sunk state was expressed by re-tinting the silhouette to
  the hit colour and drawing a `::after` line across its full width; at roster
  size the red tint and the line merge into one stroke.
- **Fix:** Keep the silhouette grey but dimmed/desaturated, and draw a red X
  over it (two centred 18px strokes rotated ±45°, `::before`/`::after`), which
  is the familiar "destroyed" glyph and stays readable in both themes.

## Multiplayer (v2, P2P friend mode)

### 22. Handshake never completed when both `hello`s arrived before the channel-open status — Fixed

- **Description:** In the two-reducer integration test 13 of 17 cases failed
  with `expected 'handshake' to be 'connected'`: neither side could click
  Ready and the battle never started.
- **Root cause:** The reducer's `link-status: channel-open` branch always set
  `net.status = 'handshake'`. If the peer's `hello` had already been processed
  (which upgrades the status to `connected`), the later `channel-open` event
  demoted it back to `handshake`, and no further event could re-promote it.
  Event ordering between the transport status callback and the first message
  is not guaranteed in PeerJS either, so this would have hit real users
  intermittently.
- **Fix:** `channel-open` preserves an existing `connected` status and only
  moves `waiting`/`connecting` to `handshake`; the outgoing `hello` is still
  queued so a reconnecting peer re-learns our session.

### 23. Rematch announced the wrong first player — Fixed

- **Description:** After a rematch the status line could say "Bob fires first"
  while the host's board was actually enabled (or vice versa).
- **Root cause:** `rematchHint()` was computed from the pre-rematch `NetState`
  and only afterwards was `gameNumber` incremented, so the text described the
  previous game's opening player while `startVersus` used the new one.
- **Fix:** Increment `gameNumber` first and derive both the game's first mover
  and the hint text from the same updated `NetState` (`firstMover(net)`).

### 24. Generalising `Player` from `'ai'` to `'opponent'` left stale references — Fixed

- **Description:** After renaming the second player so the engine could serve
  both the AI and a remote friend, the typecheck failed
  (`'Player' and '"ai"' have no overlap`) and, once fixed, the opponent's shot
  log rows lost their styling.
- **Root cause:** `App.tsx` still compared `lastLogged.by === 'ai'`, and the
  CSS selector `.shot-log-item--ai` no longer matched the class emitted by
  `ShotLog` (`shot-log-item--${entry.by}`), which the compiler cannot see.
- **Fix:** Rename the comparison and the selector to `opponent`; the `App`
  tests (shot-log row assertions) and the p2p UI test cover both modes.

### 25. Engine test generated out-of-bounds shots — Fixed

- **Description:** A new `game.test.ts` case that walks the opponent through a
  losing game threw `out of bounds` after ten iterations.
- **Root cause:** The helper derived the column from `9 - log.length`, where
  the log counts both players' shots, so it went negative.
- **Fix:** Count only the opponent's shots and map that ordinal to
  `row = floor(n / 10)`, `col = n % 10`.

### 26. Closing the opponent's tab was never detected (no reconnect countdown, shots stuck on "Firing…") — Fixed

- **Description (found in the two-browser run):** Closing the guest's browser
  window mid-game left the host on "Your turn" for over 60 s with no
  _Reconnecting…_ banner or **Claim win**; the host's next shot hung on
  "Firing at A1…".
- **Root cause:** Disconnect detection relied entirely on the PeerJS
  `DataConnection` `close` event, which only fires when the remote closes the
  channel gracefully or ICE reports failure. A tab that simply vanishes does
  neither promptly — on the same machine/LAN Chrome can keep the ICE state
  "connected" for a long time — so the reducer never saw `channel-closed` and
  the pending `fire` waited for a `result` that would never come.
- **Fix:** Two layers. (1) `useP2P` sends `leave` on `pagehide`, so a closed or
  reloaded tab tells the peer it's going while the channel is still up. (2) The
  transport (`peer.ts`) runs a heartbeat: each side pings every 2 s, tracks the
  time of the last message received (pings included), and declares the channel
  dropped after 7 s of silence, emitting `channel-closed` itself. Pings are
  consumed by the transport and never reach the protocol decoder. Together the
  15 s grace countdown and **Claim win** now appear within seconds.

### 27. Rematch lobby still said the host fires first — Fixed

- **Description (found in the two-browser run):** After both players accepted a
  rematch, the status line correctly announced that the guest fires first, but
  the room panel header still read "You fire first" on the host and "Host fires
  first" on the guest.
- **Root cause:** `RoomPanel` derived its hint from `net.role` alone, ignoring
  `gameNumber`, which is what actually decides the opener (even → host, odd →
  guest).
- **Fix:** Use the shared `firstMover(net)` helper and name the opponent
  ("Devin B fires first"). Also fixed "1 shots" pluralisation in the shot log
  and game-over copy spotted in the same run.

### 28. Host room went dead if the guest left during placement — Fixed

- **Description (found in the post-merge audit):** If the guest closed their tab,
  reloaded, or lost their connection for 15 s while both players were still
  placing ships, the host was stuck on "Bob left the game" / "Bob did not come
  back" with **Leave** as the only way out. A guest who reloaded after
  pressing Ready was even reported as having "left (their page was reloaded)"
  while the host could still see them connected. Nothing had actually been
  played yet, so there was no reason to end the room.
- **Root cause:** The `leave` message and `grace-expired` action always moved
  the room to `left`/`lost`, and a `hello` from a new session was treated as a
  mid-game reload whenever the previous guest had been ready. Those rules were
  written for the battle, where losing the opponent really does end the game,
  and never distinguished the lobby.
- **Fix:** Added `reopenRoom`: before the battle, a departed opponent (explicit
  leave, or grace expiry after a drop) returns the host to `waiting` with the
  opponent cleared and both ready flags reset, keeping the placed fleet and the
  same room code; the guest is told the room closed. A `hello` from a new
  session during placement is now always a fresh join (both sides ready up
  again), and only mid-battle does it mean a forfeit. Regression tests cover a
  ready host getting a new guest, a guest reload after Ready, leave during
  placement, and grace expiry during placement.

### 29. A brief connection drop on the results screen killed the rematch — Fixed

- **Description (found in the post-merge audit):** After a game ended, any
  `channel-closed` — including the heartbeat timing out during a 7 s network
  hiccup — was treated as the opponent leaving. Rematch was hidden, the note
  said "has left", and the guest stopped redialing, so the room was
  unrecoverable even though both players were still sitting on the overlay.
  The hidden `ConnectionBanner` also rendered a **Claim win** button behind
  the overlay that did nothing, because `claim-win` is only valid mid-battle.
- **Root cause:** `channel-closed` special-cased `game-over` to jump straight
  to `left`, bypassing the 15 s grace that mid-game drops get; and the banner
  was rendered for every non-placement phase.
- **Fix:** A drop at game over now enters `reconnecting` like any other drop
  (the guest keeps redialing, the resumed `hello` re-sends a pending rematch
  request), and `grace-expired` at game over settles to `left` rather than
  `lost` so no forfeit is offered. The banner is only rendered during the
  battle; the game-over note shows "Reconnecting to …" while the grace timer
  runs. Tests cover the reconnect-with-pending-rematch and grace-expiry paths.

### 30. A peer returning after a claimed forfeit stayed in the battle — Fixed

- **Description (found by the recorded two-browser run of #28–29):** Guest's
  tab froze for ~30 s; the host waited out the grace, pressed **Claim win** and
  got the forfeit Victory overlay (record 5W–5L). When the guest's tab woke
  up it redialed, the host greeted it with "Devin A is back. Carry on!", and
  the guest was left on **Your turn** with a live board while the host was
  already on the results screen — the two clients disagreed on whether the
  game existed.
- **Root cause:** The same-session `hello` path only replayed a pending shot
  and rematch request; nothing in the protocol could tell a returning peer
  that its absence had already been claimed as a win, so its local battle
  never ended.
- **Fix:** New `forfeit` protocol message. On a resumed `hello`, a host whose
  game is over with `forfeit: true` queues `{ t: 'forfeit' }`; the receiver,
  if still in battle, moves to `game-over` as the loser, clears its pending
  shot and shows "… claimed the win by forfeit while you were disconnected."
  A `forfeit` received outside the battle is ignored. Both sides then sit on
  the results screen and Rematch works as usual. Tests cover the resume and
  the ignore paths.

### Coverage notes

- The first recorded run ended in Defeat, so the Victory overlay was only
  covered by unit tests. A follow-up recorded run played Easy to a win (55
  shots, 31% accuracy) and confirmed the Victory overlay, per-difficulty and
  overall record increment, Play Again, and persistence across reload. A
  deterministic RTL test (`App.test.tsx`, seeded rng + `aiDelayMs={0}`) now
  also drives a full win.
- Audible sound output was not assessed, only the toggle's persistence.
