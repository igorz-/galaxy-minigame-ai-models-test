/* =====================================================================
   RELIC WARS — ai.js
   Deterministic rival policy. Uses the SAME legality + cost functions
   as the human (engine.orderStatus). First applicable priority wins:

   1. Capture the human's final world if legal (ends the match).
   2. Capture a human-owned relay; else expand onto a neutral relay
      (lower id first).
   3. Defend an owned relay adjacent to the human by raising Defense if
      the human's CURRENT credits+military could pay the next-turn
      attack before the upgrade but not after. Skip relays still
      capture-protected next turn.
   4. Capture the highest-value legal non-relay human world
      (value = 3+E+I+D; ties: lower Military cost, then lower id).
   5. Expand toward a neutral relay not already adjacent to the AI;
      else the legal neutral world with highest E+I, then higher E,
      then lower id.
   6. Through turn 16: develop Economy if current Credit income < 12,
      else Industry; if the preferred attribute can't be developed,
      try the other. Turns 17–20: fortify (Defense) a relay bordering
      the human; else the first legal development (lower world id,
      then E before I before D).
   7. Pass.
   ===================================================================== */
'use strict';

function chooseAIAction(state) {
  const me = 'ai', foe = 'human';
  const my = state.empires[me];
  const hu = state.empires[foe];
  const legal = order => orderStatus(state, me, order).legal;
  const costOf = order => orderStatus(state, me, order).cost;

  const humanWorlds = ownedWorlds(state, foe).map(w => w.id);

  /* --- 1. Lethal blow: capture the human's final world --------------- */
  if (humanWorlds.length === 1) {
    const o = { type: 'attack', target: humanWorlds[0] };
    if (legal(o)) return o;
  }

  /* --- 2. Relays: capture human-held, else claim neutral (lower id) --- */
  for (const rid of [...CFG.RELAYS].sort((a, b) => a - b)) {
    if (state.worlds[rid].owner === foe) {
      const o = { type: 'attack', target: rid };
      if (legal(o)) return o;
    }
  }
  for (const rid of [...CFG.RELAYS].sort((a, b) => a - b)) {
    if (state.worlds[rid].owner === null) {
      const o = { type: 'expand', target: rid };
      if (legal(o)) return o;
    }
  }

  /* --- 3. Defend an owned relay the human threatens next turn -------- */
  const nextTurn = state.turn + 1;
  for (const rid of [...CFG.RELAYS].sort((a, b) => a - b)) {
    const w = state.worlds[rid];
    if (w.owner !== me) continue;
    if (w.protectedUntil >= nextTurn) continue;             // still shielded next turn
    if (!isAdjacentToEmpire(state, rid, foe)) continue;     // human can't reach it
    if (w.d >= 5) continue;
    const sur = blockadeActive(nextTurn) ? CFG.BLOCKADE_SURCHARGE : 0;
    const before = CFG.ATTACK_MIL_BASE + CFG.ATTACK_MIL_PER_DEF * w.d + sur;
    const after = CFG.ATTACK_MIL_BASE + CFG.ATTACK_MIL_PER_DEF * (w.d + 1) + sur;
    if (hu.credits >= CFG.ATTACK_CREDITS && hu.mil >= before && hu.mil < after) {
      const o = { type: 'develop', target: rid, attr: 'd' };
      if (legal(o)) return o;
    }
  }

  /* --- 4. Capture the best non-relay human world --------------------- */
  let best = null;
  for (const id of humanWorlds) {
    if (isRelay(id)) continue;
    const o = { type: 'attack', target: id };
    if (!legal(o)) continue;
    const w = state.worlds[id];
    const key = { val: 3 + w.e + w.i + w.d, mil: costOf(o).mil, id };
    if (!best ||
        key.val > best.val ||
        (key.val === best.val && key.mil < best.mil) ||
        (key.val === best.val && key.mil === best.mil && key.id < best.id)) {
      best = key; best.order = o;
    }
  }
  if (best) return best.order;

  /* --- 5. Expand: toward an unlinked neutral relay, else best value --- */
  const targets = [];
  for (let id = 0; id < CFG.WORLD_COUNT; id++) {
    const o = { type: 'expand', target: id };
    if (legal(o)) targets.push(id);
  }
  if (targets.length) {
    const unreachableRelays = CFG.RELAYS.filter(rid =>
      state.worlds[rid].owner === null && !isAdjacentToEmpire(state, rid, me));
    const toward = targets.filter(id => ADJ[id].some(rid => unreachableRelays.includes(rid)));
    if (toward.length) return { type: 'expand', target: Math.min(...toward) };
    const scored = [...targets].sort((a, b) => {
      const wa = state.worlds[a], wb = state.worlds[b];
      return (wb.e + wb.i) - (wa.e + wa.i) || wb.e - wa.e || a - b;
    });
    return { type: 'expand', target: scored[0] };
  }

  /* --- 6. Develop ----------------------------------------------------- */
  if (my.credits >= CFG.DEVELOP_COST) {
    const pickDev = attr => {
      const cands = ownedWorlds(state, me)
        .filter(w => w[attr] < 5)
        .sort((a, b) => a.id - b.id);
      return cands.length ? { type: 'develop', target: cands[0].id, attr } : null;
    };
    if (state.turn <= 16) {
      const creditIncome = 2 * ownedWorlds(state, me).reduce((s, w) => s + w.e, 0);
      const pref = creditIncome < 12 ? 'e' : 'i';
      const o = pickDev(pref) || pickDev(pref === 'e' ? 'i' : 'e');
      if (o) return o;
    } else {
      // Fortify a relay bordering the human (lower id first)
      for (const rid of [...CFG.RELAYS].sort((a, b) => a - b)) {
        const w = state.worlds[rid];
        if (w.owner === me && w.d < 5 && isAdjacentToEmpire(state, rid, foe)) {
          const o = { type: 'develop', target: rid, attr: 'd' };
          if (legal(o)) return o;
        }
      }
      // Otherwise the first legal development: lower world id, E<I<D
      for (const w of ownedWorlds(state, me).sort((a, b) => a.id - b.id)) {
        for (const attr of ATTRS) {
          if (w[attr] < 5) return { type: 'develop', target: w.id, attr };
        }
      }
    }
  }

  /* --- 7. Pass --------------------------------------------------------- */
  return null;
}
