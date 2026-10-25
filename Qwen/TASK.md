# Game brief: Void Empires — Blitz

## Assignment

Build a playable, single-player browser strategy game inspired by **Void Empires — Blitz**. The player leads one empire across a small connected galaxy against a deterministic AI rival. A match takes at most 20 shared turns. The player expands, improves worlds, and conquers enemy territory while competing for two ancient relays that pay prestige over time. The winner is decided by elimination or final prestige.

This document is a self-contained description of the **currently playable game**. Preserve the core rules below so a complete match has the same strategic choices. The visual style, rendering technology, copy, component structure, and implementation language may differ. **3D graphics are welcome, as are polished 2D, illustrated, vector, or hybrid graphics.** Aim for a short, readable match rather than a full grand-strategy simulation. The original design targeted roughly five minutes, without a turn timer.

## Player experience and strategic tension

- **Expansion versus investment:** claiming a neutral world opens routes and adds its existing attributes, but each new colony costs more Credits. Improving a world always costs the same amount.
- **Economy versus military readiness:** Economy generates Credits to fund orders. Industry generates spendable Military for attacks. Defense raises the cost of conquering one world.
- **Territory versus relay control:** ordinary worlds contribute production and final planet value; the central relays also bank prestige every completed turn after awakening.
- **Visible, deterministic decisions:** all worlds, lanes, ownership, attributes, empire reserves, event effects, order prices, and outcomes are public. There are no dice rolls in combat.

The game has no fleets to move, research tree, buildings, population, diplomacy, fog of war, supply-line rule, or multiplayer mode. Historic branches experimented with some of these presentation and information features; they are outside the current playable game described here.

## Match setup and galaxy

| Item | Rule |
| --- | --- |
| Players | One human empire and one AI rival. |
| Length | Up to 20 **shared** turns; each empire gets at most one order per turn. |
| Galaxy | 20 worlds in a fixed 4-row × 5-column arrangement, with 23 undirected lanes. The full chart is visible. |
| Starting holdings | Human owns engine world ID 5; AI owns ID 14. The other 18 worlds start neutral. |
| Starting reserves | Each empire has 14 Credits and 0 Military before turn 1 income. |
| Homeworld attributes | Economy 3, Industry 2, Defense 2. |
| Relays | IDs 7 and 12; each starts neutral with Economy 2, Industry 2, Defense 2. |
| UI numbering | Engine IDs are 0–19; display world numbers 01–20 (`ID + 1`). Thus the homes appear as 06 and 15, and relays as 08 and 13. |

Generate lanes as follows: link every horizontal neighbor in each row (16 lanes); link vertical neighbors along the leftmost and rightmost columns (6 lanes); link the two central relays, IDs 7 and 12 (1 lane). Do not change topology during a match. A target is **adjacent to an empire** when it has a direct lane to *any* world that empire owns. Disconnected holdings still produce resources and score normally.

For a faithful seeded map, assign each rotational pair `(id, 19 - id)` the same one of three equally likely profiles: **Trade** E3/I1/D1, **Forge** E1/I3/D1, or **Bastion** E1/I1/D3. Force IDs 0 and 19 to Forge and IDs 6 and 13 to Trade; then override homeworlds and relays with their attributes above. Keep the profile attributes when a world changes owner. A seed changes profiles, not positions, links, homes, or relays. The reference uses a 32-bit `mulberry32` generator, and the same seed plus the same human orders produces the same match. World names are flavor; the reference uses names such as Nadir for the human home, Vulcan for the rival home, and Meridian I/II for the relays.

## Resources, attributes, and income

Each world has Economy, Industry, and Defense integer levels from 1 to 5. Empires hold nonnegative integer reserves of Credits and Military; reserves persist without a cap or upkeep. Neutral worlds pay no income.

At the **start of every shared turn**, including turn 1, pay each empire:

```text
Credits gained = 2 × sum(Economy on owned worlds)
Military gained = sum(Industry on owned worlds)
```

The only exception is turn 11: both empires gain **zero new Military**, while Credit income and existing Military reserves remain normal. Ownership changes and upgrades first affect income on the next turn. Consequently, both sides begin their first order on turn 1 with **20 Credits and 2 Military**. Industry is a production attribute; Military is the spendable reserve. Defense does not produce a resource.

## Shared-turn sequence

1. Start the turn and pay income to both empires once.
2. Set initiative: **human first on odd turns**, **AI first on even turns**.
3. Resolve the first empire's one legal order or pass. An attack that removes the opponent's last world ends the match immediately.
4. Resolve the second empire's one legal order or pass, unless the match ended.
5. Apply the scheduled end-of-turn event, if any.
6. From turn 5 onward, award relay prestige to the current owner of each relay.
7. After turn 20, compare final prestige. Otherwise start the next shared turn.

On even turns, the AI acts after income and before the human chooses. On odd turns, it acts after the human commits or passes. Passing uses that empire's opportunity but costs no resources. A committed legal order resolves immediately. An illegal or newly invalid order must spend nothing and leave the human able to choose again; never consume their opportunity. There is no separate End Turn action after Commit or Pass.

## Orders and legality

Both empires use the same rules and prices. An order must be affordable at the moment it resolves. Exact affordability is sufficient.

| Order | Legal target and price | Immediate effect |
| --- | --- | --- |
| **Expand** | A neutral world directly adjacent to any owned world. Cost: `12 + 4 × current owned-world count` Credits; no Military. | Transfer that world to the actor with its attributes intact. A new colony receives no capture protection. |
| **Develop** | Any owned world with the chosen attribute below level 5. Cost: 8 Credits; no Military. | Raise exactly one of Economy, Industry, or Defense by 1. |
| **Attack** | A directly adjacent enemy world that is not capture-protected. Cost: 8 Credits and `4 + 6 × target Defense + blockade surcharge` Military. | Capture the world with all attributes intact. The defender's reserves do not change. |

The blockade surcharge is **8 Military on turns 16–19** and zero on all other turns, including turn 20. A Defense-2 target therefore costs 8 Credits and 16 Military normally, or 8 Credits and 24 Military during the blockade. Every Defense upgrade raises that world's normal attack cost by 6 Military immediately. An Economy upgrade adds 2 Credits to each future income payment; an Industry upgrade adds 1 Military.

**Capture protection:** Record the turn `T` when an Attack succeeds. That world cannot be attacked during turns `T` or `T + 1`; it becomes attackable on `T + 2`. Show its protected-through and first-attackable turns. It can still produce income, be developed, provide adjacency, and score while protected. This protection does not apply to neutral-world expansion.

## Ancient relays and scheduled events

Relays behave like ordinary worlds for ownership, development, production, adjacency, and attack. Their extra value is banked prestige.

| Timing | Event and mechanical effect |
| --- | --- |
| **End of turn 5** | Both relays awaken: each gains +1 Economy and +1 Industry, capped at level 5. Award the first 2 prestige to the owner of each held relay. Their higher production first pays on turn 6. |
| **End of turn 10 / turn 11** | A supernova warning is logged at the end of turn 10. On turn 11 only, both empires receive zero Military income. Credits and existing Military are unaffected. |
| **End of turn 15 / turns 16–19** | A blockade warning is logged at the end of turn 15. Every Attack during turns 16–19 costs 8 extra Military. It lifts before turn-20 orders. |
| **End of turn 20** | Award the last relay prestige, then score the galaxy and end the match. The collapse is narrative; no world or lane is deleted before scoring. |

At the end of **every** shared turn from 5 through 20, each currently owned relay awards its owner 2 banked prestige. Unowned relays award nothing. Previously banked prestige stays with the empire that earned it after the relay changes hands. Holding one relay for all 16 eligible awards yields 32 prestige.

Show the next scheduled event and its exact effect before players commit; distinguish forecasts from currently active effects. Events are public and have no player choice modal.

## Victory and scoring

An empire loses **immediately** when it has no worlds, even if its homeworld was lost earlier. Losing a homeworld alone does not end the match. Elimination interrupts the current turn before further orders, events, or relay awards.

If both empires survive turn 20, calculate:

```text
Planet value = 3 × owned-world count
             + sum(Economy + Industry + Defense on owned worlds)
Total prestige = planet value + banked relay prestige
```

The higher total wins; equal totals are a draw. Credits and Military reserves do not score. Show each empire's total, planet value, banked relay prestige, and world count in the result. A late Develop order still adds 1 planet-value point.

## Rival AI policy

Use shared legality and cost functions. The AI sees the same public state and has the same one-order allowance. It makes a deterministic choice using the first applicable priority:

1. Capture the human's final world if legal, ending the match.
2. Capture a human-owned relay; otherwise expand onto a neutral relay. For multiple relays, choose the lower ID.
3. Defend an owned relay adjacent to the human by raising Defense if the human's **current** Credits and Military could pay its next-turn attack cost before the upgrade but not after it. Skip a relay that will still be capture-protected next turn.
4. Capture the highest-value legal non-relay enemy world, valuing it at `3 + Economy + Industry + Defense`; break ties by lower Military cost, then lower world ID.
5. Expand toward a neutral relay that is not already adjacent to the AI; otherwise choose the legal neutral world with highest `Economy + Industry`, then higher Economy, then lower ID.
6. Through turn 16, develop Economy if current Credit income is below 12; otherwise develop Industry. If the preferred attribute cannot be developed, try the other. On turns 17–20, first fortify a relay bordering the human; otherwise perform the first legal development.
7. Pass when no applicable legal order remains.

For development ties, choose lower world ID, then Economy before Industry before Defense. This policy is intentionally simple and predictable; it should contest relays and finish games without hidden bonuses or random combat.

## Interface and interaction contract

Present a clear, attractive galaxy interface: all 20 worlds and their lanes; human and rival status; a selected-world inspector; an order composer; event forecast and recent actions; an intro; and a result screen. A 3D star map with modeled planets, lighting, camera movement, or depth effects is acceptable. So are strong 2D, illustrated, vector, canvas, CSS, or hybrid approaches. Choose the rendering style that produces the best usable result. Keep every world selectable and the fixed connections, ownership, relay identity, selected target, and legal actions easy to understand on desktop and mobile.

The current game uses a dark, chart-first “command deck” with ink-blue surfaces, cyan human ownership, coral rival ownership, and gold relay and pending-order cues. This is one visual reference, not a required palette or rendering method. The concept image in `assets/redesign2-concept.png` shows a possible composition, but its displayed factions, state, costs, and event copy are fictional placeholders. Use this brief for actual game data.

The player flow is **select a world → choose a legal order → inspect its exact price and effect → Commit order or Pass**. Selection alone spends nothing. The inspector should show world name/number, owner, profile, E/I/D, per-turn production, home/relay markers, and capture protection. Display both empires' Credits, Military, per-turn income, world count, total prestige, and planet-value/relay-prestige split. Order controls should explain why an option is unavailable: wrong owner, no direct connection, insufficient resources, capped attribute, or capture protection. Commit is enabled only while a legal human order is staged; Pass is available throughout the human phase.

If the player selects a different world while an order is staged, keep the selected order type and development attribute, retarget it to the new world, and recalculate its legality and preview. An invalid retarget disables Commit without spending anything. Mark ownership, selected world, pending target, legal targets, relay status, and protection distinctly; color alone should not carry these meanings. Keep keyboard focus visible and stable, with accessible world buttons and order controls. On narrow screens, the order composer can become a sheet, while Commit and Pass remain available.

The intro should explain the three-step interaction and relay timing. The result should support **New Galaxy** (fresh seed) and **Replay Seed** (restart the same map from turn 1 with all mutable state reset). The map is fully visible in the current game; do not infer fog-of-war behavior from older release notes.

## Completion checks for the implementing agent

- [ ] A new match has exactly 20 worlds, 23 lanes, two homes, two relays, and symmetric seeded planet profiles.
- [ ] Turn 1 pays income before either order, yielding 20 Credits and 2 Military for each side; later income happens once per shared turn.
- [ ] Odd and even initiative alternates, and each empire performs at most one order or pass per turn.
- [ ] Expansion from one, two, and three owned worlds costs 16, 20, and 24 Credits respectively; nonadjacent targets are illegal.
- [ ] Develop costs 8 Credits, raises one attribute by 1, stops at level 5, and affects production from the next turn.
- [ ] Attack uses the target's current Defense and current blockade state; exact-cost attacks work, and captured attributes stay intact.
- [ ] A turn-8 attack protects its target through turn 9 and permits recapture on turn 10.
- [ ] Relays upgrade and first award prestige at the end of turn 5; turn 11 suppresses only Military income; the attack surcharge appears only on turns 16–19.
- [ ] Turn 20 includes its final relay award before scoring; ties draw; elimination ends immediately.
- [ ] Invalid orders spend nothing, Pass works without a staged order, and selecting a new world recalculates a staged order without silently committing it.
- [ ] New Galaxy generates a fresh random seed; Replay Seed restores the same initial map and zeroes all mutable match state.
- [ ] A complete match is playable with mouse, touch, and keyboard at desktop and phone widths, with readable costs, order reasons, event status, and final score breakdown.

## Source notes

This brief was checked against the present `README.md` and the rule, AI, and interaction functions in the present `index.html` (`CONFIG`, `LINKS`, `profileSet`, `getIncome`, `isLegal`, `chooseAIAction`, `startTurn`, `finishTurn`, `resolveEvent`, `awardRelayPrestige`, `getScore`, and the order handlers). The older `VOID_EMPIRES_BLITZ.md` design brief at commit `98ddfba` explains the intended strategic tradeoffs and test cases; the `REDESIGN2.md` interface brief at commit `e04e848` explains the command-deck direction. Earlier Stage 6 release notes at commit `0849268` describe optional Frontier Fog and a 3D renderer from a different version. Either 3D or another polished renderer is suitable for this new build; the current `index.html` remains authoritative for mechanics.
