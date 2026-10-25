# Perihelion

A complete, single-player interpretation of **Void Empires — Blitz**. Twenty connected worlds, a deterministic rival, and twenty shared turns. All game logic runs in your browser; there is no backend.

## Play

**Open `index.html` directly in Firefox (or another modern browser).** No server, installation, build step, or internet connection is needed. Keep the `src/` and `assets/` folders alongside `index.html`; the scripts, styles, fonts, and generated planet art are all local.

You can also use the optional development server:

```sh
npm start
```

Open http://localhost:3000. Select a world, choose Expand / Develop / Attack, inspect the exact cost, and commit. Pass preserves your reserves. The field manual explains scoring, relay timing, and scheduled events.

## Test

```sh
npm test
```

The rules are isolated in `src/engine.js`; the interface is `src/main.js`, the procedural planet renderer is `src/art.js`, and responsive styling lives in `src/style.css`. DM Sans and Space Grotesk are bundled in `assets/fonts/` with their SIL Open Font Licenses. There are no remote runtime dependencies.

### Editing the JavaScript

`index.html` loads the checked-in classic script `src/game.bundle.js`, because Firefox blocks ES module imports from `file://` URLs. After editing the source modules, regenerate it with:

```sh
npm run build
```

The dependency-free build combines the three source modules without changing their logic. `npm test` also checks that the shipped bundle is up to date. Players do not need Node.js or npm.

## Controls

- Mouse or touch: select any world, stage an order, then Commit or Pass.
- Keyboard: Tab to controls, Enter/Space to activate; arrow keys navigate from a focused world.
- Escape: clear a staged order or close a dialog.
- `?`: open the field manual.

New Expedition lets you create a fresh seed or replay the current seed. Both fully reset the match. All resource reserves, income, costs, protections, score components, and event effects are public.
