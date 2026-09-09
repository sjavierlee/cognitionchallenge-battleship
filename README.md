# Battleship

A simple, shareable Battleship game for the browser. Place your fleet, then
out-shoot an AI that hunts and targets instead of firing randomly — or send a
friend a link and play them directly, browser to browser.

## Play

The home screen offers three ways in (your last choice is remembered):
**Play vs AI**, **Play a friend** (host a room), or **Join with a code**. You
can enter an optional display name; otherwise you're _Captain_.

### Versus the AI

1. **Place your fleet** — click a ship in the tray, hover the board to preview,
   click to place. Press <kbd>R</kbd> (or the Rotate button) to switch between
   horizontal and vertical. Ships may not touch, not even diagonally. Click a
   placed ship to pick it up again, or use **Randomize** / **Reset**.
2. **Pick a difficulty** — Easy, Normal, or Hard (see below).
3. **Start battle** — you fire first. Click any unknown cell on _Enemy waters_.
   Misses, hits, and sinks are shown on both boards and in the shot log.
4. **Win** by sinking all five enemy ships before the AI sinks yours. Your
   win/loss record (overall, per difficulty, and vs friends) is saved in
   `localStorage`.
5. **Review** — close the game-over summary (× or <kbd>Esc</kbd>) to see
   where the enemy ships were; _Play again_ and _Back to home_ stay in a bar
   above the boards, and _Summary_ brings the overlay back.

### Versus a friend

1. **Host** — click _Play a friend_. You get a six-character room code and an
   invite link (`…/#/room/K7Q2ZD`); copy either and send it to your friend.
2. **Join** — your friend pastes the code (or opens the link) and clicks
   _Join game_. Both of you place fleets and click **Ready**; placement locks
   once you're ready.
3. **Battle** — the host fires first; turns alternate. Only shots and their
   results travel over the wire, so neither side ever sees the other's board
   until a ship is sunk.
4. **Rematch** from the game-over screen keeps the room open and swaps who
   fires first. The winner's fleet is sent to the loser at game over, so
   closing the summary reveals it on _Enemy waters_ just like versus the AI.

If the connection drops mid-game you'll see _Reconnecting…_ for 15 seconds
while the guest redials. After that (or if your opponent leaves) you can
**Claim win**, which counts as a forfeit in your friend record.

#### How it works, and its limits

- Purely peer-to-peer: the site is static, and the two browsers talk over a
  WebRTC data channel via [PeerJS](https://peerjs.com). There are no accounts,
  API keys, servers, or databases. The free public PeerJS broker
  (`0.peerjs.com`) is used only to find each other; set
  `VITE_PEER_HOST` / `VITE_PEER_PORT` / `VITE_PEER_PATH` /
  `VITE_PEER_SECURE` to point at your own PeerServer instead.
- Both players must be online at the same time; there's no lobby persistence.
- Casual trust: each browser is authoritative for its own board and reports
  hit/miss/sunk honestly. There is no anti-cheat verification — this is for
  playing friends, not strangers.
- Direct WebRTC connections need at least one side to be reachable through
  its NAT. Symmetric NATs (most mobile carriers, many home routers, VPNs and
  corporate networks) block that, and the pair then needs a **TURN relay**.
  None is bundled — PeerJS's built-in `*.turn.peerjs.com` relays are gone —
  so such pairs fail with "Could not open a direct connection". To fix that,
  set `VITE_TURN_URLS` (comma-separated, e.g.
  `turn:relay.example.com:80,turns:relay.example.com:443?transport=tcp`),
  `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL` at build time (Vercel /
  Netlify environment variables, or `.env.local`) from any TURN provider —
  free tiers exist (e.g. [Metered](https://www.metered.ca/), Cloudflare
  Realtime TURN) and a Battleship game moves only a few kilobytes. The
  production deployment uses a Metered static credential with
  `VITE_TURN_URLS=turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:80?transport=tcp,turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp`.
  Public STUN (Google, Cloudflare) is always included. Note that the
  credentials are baked into the client bundle, so use a provider that
  supports rotating them (Metered: dashboard → TURN Server → Credentials).

Sound effects are off by default; toggle them from the header. The theme
follows your system light/dark preference until you flip the header toggle,
which is then remembered.

Your ships are drawn as top-down silhouettes on your grid and in the tray;
enemy ships stay hidden until you sink them.

## AI

Every difficulty runs a **hunt → target** loop:

| Difficulty | Hunt (no open hits)                                                 | Target (after a hit)                                              |
| ---------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Easy       | Uniform random over unknown cells                                   | Random orthogonal neighbour of the hit                            |
| Normal     | Checkerboard parity (only every other cell can hide a ship)         | Infers orientation from two hits, extends the line in both ways   |
| Hard       | Probability density: counts legal placements of the remaining ships | Same line inference, ranked by density; excludes impossible cells |

Normal and Hard also exploit the no-touch rule: once a ship is sunk, its
surrounding ring is marked as water.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine, AI, and UI tests (vitest)
npm run lint
npm run typecheck
npm run build      # outputs dist/
```

Stack: Vite, React 18, TypeScript, Vitest + Testing Library, plain CSS, PeerJS
(loaded lazily, only when you host or join a friend game).

```
src/
  engine/   pure game rules (board, placement, shots, turn state)
  ai/       hunt/target AI with Easy/Normal/Hard strategies + simulator
  net/      room codes, wire protocol + validation, PeerJS link wrapper
  ui/       React components, the app reducer (AI + friend modes), useP2P hook
  storage/  localStorage record + settings (sound, theme, name, last mode)
  audio/    Web Audio synthesized sound effects
```

The friend mode is tested without a network: `appState.p2p.test.ts` wires two
reducers together through an in-memory link, and `App.p2p.test.tsx` drives the
UI against a headless reducer opponent via an injected link factory.

## Deploy

The build is a static site (`dist/`), so it can be hosted anywhere. Config is
included for:

- **Vercel** — import the repo; `vercel.json` sets the framework, build, and
  output directory.
- **Netlify** — import the repo; `netlify.toml` sets the build command and
  publish directory.

See [PLAN.md](./PLAN.md) for the design notes and decisions.
