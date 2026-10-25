# RELIC WARS — a blitz duel for twenty worlds

A single-player browser strategy game: lead the **Lucent Accord** against the
deterministic **Umbral Synod** across 20 worlds and 23 lanes. Claim the two
ancient **Vigil relays**, bank their prestige, and win by elimination or by
final score when the galaxy collapses on turn 20.

Built to the brief in `TASK.md` (a *Void Empires — Blitz*–style match) with an
original visual identity: deep-plum space, glass command panels, emerald vs
violet territory, amber relics, an animated starfield, and CSS-sculpted planets.

## Run it

No build step, no dependencies. Either open `index.html` directly, or serve it:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Verify the rules

```bash
node tests/run.js
```

344 assertions cover the whole completion checklist: galaxy topology and seeded
symmetry, turn-1 income (20 cr / 2 mil), initiative alternation, order prices
(16/20/24 cr expands, 8 cr develops, 8 cr + 4+6×D (+8 blockade) attacks),
capture protection windows, relay awakening/tribute, the supernova and
blockade calendars, turn-20 scoring and draws, elimination, illegal-order
safety, every AI priority rule, deterministic replays, and full simulated
matches (including a 20-turn loopback through every scheduled event).

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup: HUD, rails, galaxy stage, intro/result/rules overlays |
| `css/styles.css` | All art direction and responsive layout |
| `js/engine.js` | Pure rules: seeded galaxy, income, legality, orders, events, scoring |
| `js/ai.js` | The deterministic rival policy (same legality/cost functions as the player) |
| `js/sky.js` | Starfield/nebula canvas, WebAudio sound effects, floating labels |
| `js/ui.js` | Turn flow, rendering, interaction, screens, autoplay test hook |
| `tests/run.js`, `tests/tests.js` | Headless rule verification |

## How a match plays

1. **Select a world** — everything is public; selecting spends nothing.
2. **Stage an order** — Expand (12 + 4×worlds cr), Develop (8 cr), or Attack
   (8 cr + 4 + 6×Defense mil, +8 during the turn 16–19 blockade). Exact prices
   and reasons appear before you commit.
3. **Commit or Pass** — one order per empire per shared turn. You act first on
   odd turns, the rival on even turns.

Income pays at the start of every turn: `+2×Σ Economy` credits and `+Σ Industry`
military (turn 11 pays zero military). Relays awaken at the end of turn 5 and
pay their owner **+2 prestige per turn** through turn 20. A captured world is
shielded through the next turn. Lose all worlds and you are eliminated
immediately; otherwise the higher `3×worlds + Σ(E+I+D) + relic prestige` wins.

Same seed + same orders = same match. **New Galaxy** rolls a fresh seed;
**Replay Seed** restarts the same map with all mutable state reset.

## Controls

Mouse/touch everywhere, plus: `1` `2` `3` stage Expand/Develop/Attack ·
`Enter` commit (when no button is focused) · `P` pass · arrow keys roam the
4×5 chart · `Esc` deselect · `?` rules · `M` mute.
