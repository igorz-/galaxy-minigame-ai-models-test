# Void Empires — Blitz

A complete, single-player browser strategy game built from the game brief. One human empire, one deterministic AI rival, twenty shared turns, and a contested pair of ancient relays.

No build step and no runtime dependencies. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## The match

- **20 worlds** in a fixed 4 × 5 chart, joined by **23 lanes**.
- You begin with **Nadir (world 06)**; the rival holds **Vulcan (world 15)**.
- **Meridian I (08)** and **Meridian II (13)** are neutral relays worth **+2 prestige per owned relay at the end of every turn from turn 5 through turn 20**.
- Income is paid at the start of each turn: **2 × total Economy Credits** and **total Industry Military**.
- Initiative alternates: you move first on odd turns, the rival first on even turns. Each empire gets one order or a pass.
- Orders: **Colonize** (`12 + 4 × owned worlds` Credits), **Develop** (`8` Credits), **Assault** (`8` Credits + `4 + 6 × Defense` Military, plus `8` during the turn 16–19 blockade).
- Captures protect the world on the capture turn and the following turn. It becomes attackable on the second turn after capture.
- Turn 11 pays zero Military income. Turns 16–19 add +8 Military to every assault.
- Win by eliminating the rival, or by leading on final prestige after turn 20:
  `3 × worlds + sum(E + I + D on owned worlds) + banked relay prestige`.

The full rules are implemented in `game.js`, independent of the interface.

## Controls

- Select any world to open its dossier.
- Choose **Colonize**, **Develop** (with E / I / D), or **Assault**, then **Commit**. Selecting another world retargets a staged order without spending anything.
- **Pass** is always available during your command phase.
- Keyboard: `1` Colonize, `2` Develop, `3` Assault, `E` / `I` / `D` choose a development attribute while Develop is staged, `Enter` commit, `P` pass, `Esc` clear the staged order or close a dialog.
- On narrow screens, the fixed action bar keeps Commit and Pass reachable; tap its summary to jump to the world dossier.

The **New Galaxy** action draws a fresh seeded map. **Replay Seed** resets the same chart and all mutable state to turn 1.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Interface structure, briefing and result panels |
| `styles.css` | Visual system, responsive layout, motion |
| `game.js` | Deterministic rules engine, scoring, events, AI |
| `app.js` | Rendering, interaction, turn pacing, canvas starfield |
| `test.js` | Node rule and AI regression tests |

Run the tests with:

```bash
node test.js
```

The engine uses no DOM APIs and is shared byte-for-byte between the browser and the test harness.
