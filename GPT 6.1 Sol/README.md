# Void Empires — Blitz

A complete, deterministic, single-player galaxy strategy game. Built with vanilla JavaScript, CSS, SVG star lanes, and locally generated spherical planet textures. No runtime dependencies, build step, or external artwork.

## Play

Requires Node.js 20 or later.

```sh
cd "GPT 6.1 Sol"
npm start
```

Open **http://localhost:5186**. Use `PORT=8080 npm start` to choose another port. The game can also be hosted on any static web server. Google Fonts enhance the typography; system fallbacks work offline.

## Controls

1. Select a world on the chart.
2. Choose **Expand**, **Develop**, or **Attack**. For development, choose an attribute.
3. Review the exact cost and effect, then **Commit order**. Or **Pass** to preserve resources.

Selection never spends resources. Changing worlds retains and retargets your staged order, even when the new target is illegal. Invalid orders explain the problem and cannot be committed.

Use Tab and Enter/Space with visible keyboard focus. Arrow keys move selection between worlds on the chart. All orders are also touch-accessible. Optional interface audio is off by default.

The Field Manual explains production, combat, events, relay awards, and scoring. New Galaxy creates a fresh seed; Replay Seed resets the same map. A result includes both empires’ world counts, planet value, banked relay prestige, and totals.

## Rules and tests

The engine implements `TASK.md`: 20 symmetric seeded worlds, 23 fixed lanes, alternating shared-turn initiative, deterministic AI, protection after captures, scheduled events, and a maximum of 20 turns. No hidden resources, random combat, fleets, or fog of war.

```sh
npm test
```

The Node test suite covers setup, prices, legality, income timing, initiative, protection, relay awakening and awards, supernova and blockade rules, elimination, final scoring and draws, AI priorities, replay determinism, and invariants across 200 complete seeded matches.

### Files

- `src/engine.js` — pure deterministic rules and AI
- `src/main.js` — interaction, selection, order staging, dialogs, and rendering
- `src/art.js` — procedural planet textures and starfield
- `src/style.css` — responsive interface and reduced-motion support
- `test/engine.test.js` — engine regression suite
- `server.js` — dependency-free local development server

The AI’s “expand toward a relay” choice uses shortest-path distance on the fixed lane graph, with lower world IDs breaking equal-distance ties.
