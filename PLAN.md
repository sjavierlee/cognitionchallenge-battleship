# Battleship — Implementation Plan

A simple, shareable Battleship web game playable in the browser against an AI opponent.

## 1. Goals

- Playable end-to-end in a browser with no install: open a link, play.
- Classic rules: 10x10 grid, 5 ships per side, alternate single shots, first to sink all enemy ships wins.
- Player places ships manually (click/drag + rotate) or hits **Randomize**.
- AI opponent uses a **Hunt / Target** strategy, not random firing.
- Easy to share: static build deployable to Vercel / Netlify with zero backend.

## Decisions (locked)

| Topic     | Decision                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| Stack     | Vite + React 18 + TypeScript                                                                                   |
| Placement | Click ship in tray → hover preview → click to place; `R` rotates                                               |
| AI        | Easy / Normal / Hard selector                                                                                  |
| Adjacency | Ships may **not** touch — at least one empty cell (incl. diagonals) between ships                              |
| Deploy    | Vercel / Netlify (config files included; repo connected by owner)                                              |
| Extras    | Shot history log panel, win/loss record in `localStorage`, shot/hit animations + sound toggle (off by default) |

## 2. Non-goals (v1)

- ~~Multiplayer / networking~~ — see section 11 (v2: peer-to-peer "Play a friend"). Still no accounts.
- Persistence beyond the win/loss record (no saved games).
- Salvo or other rule variants.

## 3. Tech Stack

| Concern     | Choice            | Why                                                                                  |
| ----------- | ----------------- | ------------------------------------------------------------------------------------ |
| Language    | TypeScript        | Type safety for grid/ship/state logic; catches off-by-one and orientation bugs early |
| UI          | React 18          | Small component tree (two boards, controls, status); familiar, well-supported        |
| Build       | Vite              | Fast dev server, one-command static build, zero-config on Vercel/Netlify             |
| Styling     | Plain CSS         | Grid is easy with CSS Grid; keeps bundle small                                       |
| Tests       | Vitest            | Same toolchain as Vite; unit-test the pure game engine and AI                        |
| Lint/format | ESLint + Prettier | Standard                                                                             |

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
type Coord = { row: number; col: number }; // 0..9
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
type ShotResult = {
  by: 'player' | 'ai';
  at: Coord;
  outcome: 'miss' | 'hit' | 'sunk';
  sunk?: ShipKind;
};
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
   - Two boards side by side: _Your Fleet_ (ships visible, incoming shots shown) and _Enemy Waters_ (ships hidden, your shots shown).
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

---

## 11. v2 — Multiplayer: "Play a friend" (peer-to-peer)

### Constraints and approach

- Hosting stays a static site on Vercel/Netlify: **no database, no accounts, no game
  server**. Vercel functions are stateless and cannot hold WebSockets, so the live
  link between the two players is a direct browser-to-browser **WebRTC data channel**
  via [PeerJS](https://peerjs.com) (`peerjs@1.5.5`, ~2 MB unpacked / ~50 kB gzipped
  in the bundle, published 2025-06 — stable).
- The only third party involved is a **signaling broker** that introduces the two
  browsers to each other; after the handshake it carries no game traffic. Default:
  PeerJS's free public cloud broker (`0.peerjs.com`, no key/account). Its URL is a
  single config value so it can be pointed at a self-hosted `peer` server later if
  the public one proves flaky.
- STUN via Google's public servers (PeerJS default). **No TURN relay**: a small share
  of pairs behind symmetric/corporate NATs will fail to connect; the UI must say so
  clearly ("Couldn't connect — try another network or play the AI") rather than hang.
- Game state lives in the two browsers. Each player is **authoritative for their own
  board**: they never send their ship positions, only the result of each incoming shot.
  This reuses the pure engine as-is (`receiveShot` on my board; the opponent's board on
  my screen is just a tracking grid built from the results they send back).

### Flow

```
Home ──► [Play vs AI]        (existing flow, unchanged)
     └─► [Play a friend] ──► Host: generates room code (6 chars, e.g. K7Q2ZD),
                                    shows share link /#/room/K7Q2ZD + copy button,
                                    places ships while waiting
                             Guest: opens link (or types code) ──► connects ──► places ships
                             Both:  "Ready" when fleet placed ──► battle starts when both ready
                                    Host fires first (coin flip is a later option)
                             Turns alternate exactly as vs AI; opponent's move arrives
                                    over the data channel; UI shows "Waiting for <name>…"
                             Game over ──► both boards revealed for verification ──►
                                    [Rematch] (same room, sides swap who fires first)
                                    [Back to home]
```

- Room code **is** the PeerJS peer id for the host (prefixed, e.g. `bship-K7Q2ZD`), so
  no lookup service is needed: the guest simply `connect()`s to that id.
- Optional display name (localStorage `battleship.name`, default "Captain").
- URL routing is hash-based (`/#/room/CODE`) so it works on any static host with no
  rewrite rules.

### Protocol (JSON messages over one reliable, ordered data channel)

```ts
type NetMessage =
  | { t: 'hello'; v: 1; name: string; fleetHash: string } // sent by both on connect / on ready
  | { t: 'ready'; fleetHash: string } // fleet placed and locked
  | { t: 'fire'; seq: number; at: Coord } // my shot at your board
  | {
      t: 'result';
      seq: number;
      at: Coord;
      outcome: 'miss' | 'hit' | 'sunk';
      sunk?: ShipKind;
      gameOver: boolean;
    }
  | { t: 'reveal'; ships: Ship[]; salt: string } // at game over: prove fleetHash
  | { t: 'rematch' } // request / accept
  | { t: 'leave' };
```

- `seq` numbers every shot; a `result` must echo the `seq` of the `fire` it answers.
  Out-of-order or duplicate messages are ignored (defensive, the channel is ordered).
- Turn enforcement is local: I only accept a `fire` when it's your turn, and only send
  one when it's mine; anything else is dropped and logged.
- Both peers also run the same **protocol version** check in `hello`; mismatch shows
  "Your friend is on an older version — ask them to refresh".

### Anti-cheat (light-touch, no server)

Since each side reports results for its own board, a modified client could lie.
Mitigation that costs nothing extra:

1. On **Ready**, each side sends `fleetHash = SHA-256(canonical(ships) + salt)`
   (Web Crypto, built in).
2. At **game over**, each side sends `reveal` with its ships and salt. The receiver
   re-hashes, checks it matches the commitment, and replays every shot it fired
   against the revealed fleet to confirm each reported `result` was truthful.
3. Mismatch ⇒ result screen shows "Opponent's board didn't match their commitment"
   and the game is not counted in the record.

This prevents moving ships mid-game and lying about hits; it does not stop a player
from quitting when losing (handled as a forfeit: "Your opponent left" + win credited).

### Engine changes (all pure, unit-tested)

- `engine/types.ts`: `Player` becomes `'player' | 'opponent'` semantics for the local
  view (`ai` renamed/aliased to `opponent` in `GameState`; AI mode keeps working since
  the AI is just one kind of opponent).
- `engine/game.ts`: add `applyOpponentResult(state, at, outcome, sunk)` — records a
  shot I fired on my tracking grid without needing the opponent's ships; the existing
  `fire()` path is used for shots _received_ against my own board.
- `engine/tracking.ts`: `markCell(board, at, outcome, sunkShipCells?)` for the enemy
  tracking grid (currently the enemy board is a full `Board`; in P2P we only know
  results, so sunk ships are drawn from the cells the opponent reports as sunk).
- `engine/hash.ts`: `canonicalFleet(ships)` + `fleetCommitment(ships, salt)`.

### New modules

```
src/net/
  peer.ts         # thin wrapper over PeerJS: createHost(code) / joinRoom(code); emits typed
                  # events; handles open/close/error, reconnect-with-same-id for the host
  protocol.ts     # NetMessage types, encode/decode + runtime validation (zod-free hand
                  # validation to keep bundle small)
  roomCode.ts     # generate/validate codes (crockford-ish alphabet, no 0/O/1/I)
src/ui/
  Home.tsx        # mode picker: Play vs AI / Play a friend (host) / Join with code
  Lobby.tsx       # share link + copy, connection status, opponent name, Ready state
  OpponentBadge.tsx  # "Connected · Captain Ada" / "Reconnecting…" / "Left"
src/ui/appState.ts  # gains 'mode: ai | p2p-host | p2p-guest' and net actions:
                    # 'peer-connected', 'peer-ready', 'peer-fire', 'peer-result', 'peer-left'
src/ui/useP2P.ts    # hooks the peer wrapper into the reducer (like the current AI timer effect)
```

### UI / UX

- Home screen replaces the direct jump into placement (one extra click for AI players;
  last mode remembered in localStorage so returning players land where they were).
- Lobby: big room code, "Copy link" (Clipboard API, falls back to selecting the text),
  Web Share on mobile, QR code **not** included (keeps deps minimal — can add later).
- Placement screen unchanged, plus a **Ready** button (replaces "Start battle") and an
  opponent status line ("Waiting for Ada to place ships…").
- Battle screen unchanged; badges become "Your turn" / "Ada's turn"; shot log names
  the opponent; optional turn timer **not** included in v2.
- Disconnect handling: 15 s "Reconnecting…" banner (PeerJS auto-reconnect to broker;
  guest re-dials host id), then "Your opponent left" with **Claim win** / **Back home**.
- Record: P2P wins/losses stored under `record.p2p` alongside per-difficulty AI stats.

### Testing

- **Unit**: protocol encode/decode/validation, room code alphabet, commitment hash and
  reveal verification (including a tampered fleet), reducer transitions for every net
  action including out-of-turn `fire`, duplicate `seq`, and `leave` mid-game.
- **Integration (no network)**: two reducers wired to each other through an in-memory
  fake `PeerLink` play a full scripted game; asserts both sides agree on every result,
  turn order, winner and reveal verification.
- **Browser (recorded)**: two browser tabs/windows on the deployed preview: host creates
  room, guest joins via link, both place, full game, rematch, and a mid-game tab close
  showing the forfeit path. Also one run on mobile width.
- PeerJS itself is mocked in unit tests; only the browser run touches the real broker.

### Risks

| Risk                                       | Mitigation                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| Public PeerJS broker down / rate-limited   | Broker URL is config; document self-hosting `peer` on Fly/Render (free tier)         |
| NAT traversal fails (no TURN)              | Clear error + fallback to AI; TURN can be added later via a free Metered/Twilio tier |
| Bundle growth (~50 kB gz)                  | `import()` the `src/net` chunk only when "Play a friend" is chosen                   |
| Both players must be online simultaneously | Stated on the lobby screen; async play is out of scope                               |
| Host closes tab → room gone                | Guest sees "Host left"; rematch requires a new code                                  |

### Milestones (v2)

1. **Engine** — opponent-tracking grid, `applyOpponentResult`, fleet commitment + verify; tests.
2. **Net layer** — protocol types/validation, room codes, PeerJS wrapper, in-memory fake link; tests.
3. **Reducer + hook** — modes and net actions in `appState`, `useP2P`; two-reducer integration test.
4. **UI** — Home, Lobby, Ready/opponent status, badges, disconnect/forfeit, rematch, record.
5. **Verify** — recorded two-browser run on a preview deploy; BUG.md entries; README section.
