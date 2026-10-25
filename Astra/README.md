# Aster — The Twenty Worlds

A complete single-player strategy game implementing `TASK.md`. Lead the Sol Accord against the deterministic Vesper Union across a seeded, fully visible galaxy. A match lasts at most 20 shared turns.

## Run

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite. For a deployable static build:

```sh
npm run build
npm run preview
```

The `dist/` directory can be served by any static web host, including a subdirectory. The unbuilt source also runs from a normal HTTP static server. Fonts use Google Fonts, with local system fallbacks; all planet artwork and starfields are generated locally.

## Play

1. Select a world on the atlas.
2. Choose **Expand**, **Develop**, or **Attack**. Development also requires an attribute.
3. Review the exact cost and effect, then **Commit order**. Or **Pass** to save resources.

Selecting another world preserves the staged order and development attribute, and recalculates legality without spending anything. The inspector explains unavailable orders. The field guide contains the complete rules. On phones, Commit and Pass stay pinned to the bottom of the screen.

**Keyboard:** Tab between controls; Enter or Space activates them. When a world has focus, arrow keys select neighboring positions on the chart. Escape closes a dialog. Dialogs contain keyboard focus.

Relays awaken at the end of turn 5. Each held relay banks two prestige at the end of every turn 5–20. Turn 11 suppresses Military income. Attacks cost eight extra Military on turns 16–19. The final score is planet value plus banked relay prestige; eliminating every rival holding wins immediately.

**Replay seed** resets every mutable part of the same map. **New galaxy** generates a different seed. Both are available from the restart control and result screen.

## Structure

- `src/engine.js` — pure rules, seeded map generation, shared legality/pricing, deterministic AI, events, and scoring.
- `src/main.js` — accessible interactive atlas, inspector, order composer, dispatches, intro, and results.
- `src/art.js` — seeded spherical planet textures and vector starfield generation.
- `src/style.css` — responsive ivory-and-ink atlas design, reduced-motion support, and mobile action bar.
- `test/engine.test.js` — rule-boundary tests and complete deterministic match simulations.

## Verify

```sh
npm test
npm run build
```

The test suite covers topology, seed symmetry, income and initiative, exact affordability, atomic rejection, development caps, capture protection, blockade boundaries, relay awakening and all 16 awards, supernova income, elimination, final scoring, AI priorities, and replay determinism across 30 seeds.
