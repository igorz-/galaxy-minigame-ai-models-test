# Aster — The Twenty Worlds

A complete single-player strategy game implementing `TASK.md`. Lead the Sol Accord against the deterministic Vesper Union across a seeded, fully visible galaxy. A match lasts at most 20 shared turns.

## Static hosting — no npm required

The game is plain static HTML, CSS, and JavaScript. All rules, AI, artwork generation, and scoring run in the browser. There is no backend, API, database, or server-side game logic, and no build step is required to play or publish it. You can also open `index.html` directly from disk in Firefox and other modern browsers.

The only files needed to host the game are:

```text
Astra/
├── index.html
├── game.js
└── src/
    ├── style.css
    └── favicon.svg
```

All game asset paths are relative, so these files work at a domain root, under a repository subdirectory, or through `file://`. The checked-in `game.js` is a self-contained classic script with no runtime module imports or requests for game data.

### GitHub Pages

To publish this repository, including its gallery:

1. Push the repository to GitHub.
2. Open **Settings → Pages**.
3. Choose **Deploy from a branch**, select your branch, and select **/(root)**.
4. Save. Once deployment finishes, open `https://<username>.github.io/<repository>/Astra/`.

The repository-root `.nojekyll` file tells GitHub Pages to serve the files directly without Jekyll processing. The root gallery already links to `Astra/index.html`.

To publish just this game in a separate repository, copy the files listed above to that repository's root and use the same Pages settings. You do not need `node_modules/`, `dist/`, package files, or the tests.

### Preview locally without npm

Double-click `Astra/index.html` to play. Keep `game.js` and the `src/` assets alongside it as shown above. No local server or browser security changes are needed.

Alternatively, from the repository root, use any static HTTP server. For example, with Python installed:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/Astra/`. This server only serves files; it does not run game logic.

Fonts use Google Fonts, with local system fallbacks; all planet artwork and starfields are generated locally.

## Optional npm development tools

Vite is a development convenience, not a hosting requirement. The following commands run from `Astra/` and require Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite. The development command watches the source modules and rebuilds `game.js` automatically. After editing source files without the dev server, run `npm run bundle` and commit the updated `game.js` alongside your source changes.

For a minified static release:

```sh
npm run build
npm run preview
```

The generated `dist/` directory can be served by any static web host, including a subdirectory, or opened directly through `dist/index.html`. Publishing the checked-in files directly is equally supported.

## Play

1. Select a world on the atlas.
2. Choose **Expand**, **Develop**, or **Attack**. Development also requires an attribute.
3. Review the exact cost and effect, then **Commit order**. Or **Pass** to save resources.

Selecting another world preserves the staged order and development attribute, and recalculates legality without spending anything. The inspector explains unavailable orders. The field guide contains the complete rules. On phones, Commit and Pass stay pinned to the bottom of the screen.

**Keyboard:** Tab between controls; Enter or Space activates them. When a world has focus, arrow keys select neighboring positions on the chart. Escape closes a dialog. Dialogs contain keyboard focus.

Relays awaken at the end of turn 5. Each held relay banks two prestige at the end of every turn 5–20. Turn 11 suppresses Military income. Attacks cost eight extra Military on turns 16–19. The final score is planet value plus banked relay prestige; eliminating every rival holding wins immediately.

**Replay seed** resets every mutable part of the same map. **New galaxy** generates a different seed. Both are available from the restart control and result screen.

## Structure

- `game.js` — generated, checked-in browser bundle; supports direct file opening and no-build hosting.
- `scripts/build.mjs` — optional bundling, development watching, and static release packaging.
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
