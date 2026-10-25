# Astra

A complete, deterministic browser strategy game: 20 worlds, 20 shared turns, one rival, and two ancient relays. Built with vanilla JavaScript, CSS, and Vite. The original atlas-inspired interface uses procedural planets and requires no image assets.

## Run

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite. To produce a static deployment, run `npm run build` and serve `dist/`.

## Play

Select a world, choose Expand, Develop, or Attack, inspect the exact cost, and commit. Each action automatically advances the shared turn; Hold position passes. The Field guide explains scoring. The highest prestige after turn 20 wins, or capture the rival's final world for immediate victory. New Galaxy creates a new seed; Replay Seed resets the same map.

All mechanics in TASK.md are implemented, including alternating initiative, capture protection, relay awakening and banked prestige, the turn-11 supernova, and the turns-16–19 blockade. No hidden combat rolls or rival resource bonuses.

## Validation

```sh
npm test
npm run build
```

The Node test suite verifies topology and symmetry, prices and legality, production, initiative, combat and protection, events, scoring, elimination, and complete matches across 100 seeds.

- `src/engine.js`: state, rules, deterministic AI, events, and scoring.
- `src/main.js`: accessible UI, order staging, intro, and results.
- `src/style.css`: desktop and mobile layouts, procedural artwork.

Fonts are loaded from Google Fonts with local fallback stacks. Matches are held in memory; reloading starts a new expedition.
