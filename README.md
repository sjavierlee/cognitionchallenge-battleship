# Battleship

A simple, shareable Battleship game for the browser. Place your fleet, pick a
difficulty, and out-shoot an AI that hunts and targets instead of firing
randomly.

## Play

1. **Place your fleet** — click a ship in the tray, hover the board to preview,
   click to place. Press <kbd>R</kbd> (or the Rotate button) to switch between
   horizontal and vertical. Ships may not touch, not even diagonally. Click a
   placed ship to pick it up again, or use **Randomize** / **Reset**.
2. **Pick a difficulty** — Easy, Normal, or Hard (see below).
3. **Start battle** — you fire first. Click any unknown cell on _Enemy waters_.
   Misses, hits, and sinks are shown on both boards and in the shot log.
4. **Win** by sinking all five enemy ships before the AI sinks yours. Your
   win/loss record (overall and per difficulty) is saved in `localStorage`.

Sound effects are off by default; toggle them from the header.

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

Stack: Vite, React 18, TypeScript, Vitest + Testing Library, plain CSS.

```
src/
  engine/   pure game rules (board, placement, shots, turn state)
  ai/       hunt/target AI with Easy/Normal/Hard strategies + simulator
  ui/       React components and the app reducer
  storage/  localStorage record + settings
  audio/    Web Audio synthesized sound effects
```

## Deploy

The build is a static site (`dist/`), so it can be hosted anywhere. Config is
included for:

- **Vercel** — import the repo; `vercel.json` sets the framework, build, and
  output directory.
- **Netlify** — import the repo; `netlify.toml` sets the build command and
  publish directory.

See [PLAN.md](./PLAN.md) for the design notes and decisions.
