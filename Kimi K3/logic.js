/* Void Empires — Blitz: pure game logic (no DOM). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VE = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const N_WORLDS = 20;
  const RELAYS = [7, 12];
  const HOMES = { H: 5, A: 14 };
  const MAX_TURNS = 20;
  const PROFILES = {
    Trade:   { E: 3, I: 1, D: 1 },
    Forge:   { E: 1, I: 3, D: 1 },
    Bastion: { E: 1, I: 1, D: 3 },
  };
  const PROFILE_NAMES = ['Trade', 'Forge', 'Bastion'];
  const NAMES = [
    'Cygnus', 'Vesper', 'Orison', 'Paleron', 'Rime',
    'Halcyon', 'Lumen', 'Meridian I', 'Tarn', 'Solace',
    'Brine', 'Caldera', 'Meridian II', 'Wisp', 'Kharon',
    'Ember', 'Drift', 'Sable', 'Threnode', 'Ulterior',
  ];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildLinks() {
    const links = [];
    const add = (a, b) => links.push(a < b ? [a, b] : [b, a]);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) add(r * 5 + c, r * 5 + c + 1); // 16 horizontal
    for (let r = 0; r < 3; r++) { add(r * 5, (r + 1) * 5); add(r * 5 + 4, (r + 1) * 5 + 4); } // 6 vertical edges
    add(7, 12); // relay spine
    return links;
  }
  const LINKS = buildLinks();
  const ADJ = Array.from({ length: N_WORLDS }, () => []);
  for (const [a, b] of LINKS) { ADJ[a].push(b); ADJ[b].push(a); }

  function createGame(seed) {
    seed = (seed === undefined ? Math.floor(Math.random() * 0x100000000) : seed) >>> 0;
    const rng = mulberry32(seed);
    const profileOf = new Array(N_WORLDS);
    for (let i = 0; i < 10; i++) {
      const p = PROFILE_NAMES[Math.floor(rng() * 3)];
      profileOf[i] = p; profileOf[19 - i] = p;
    }
    profileOf[0] = profileOf[19] = 'Forge';
    profileOf[6] = profileOf[13] = 'Trade';
    const worlds = [];
    for (let id = 0; id < N_WORLDS; id++) {
      const a = Object.assign({}, PROFILES[profileOf[id]]);
      let owner = null, home = null;
      const relay = RELAYS.indexOf(id) !== -1;
      if (id === HOMES.H) { owner = 'H'; home = 'H'; Object.assign(a, { E: 3, I: 2, D: 2 }); }
      if (id === HOMES.A) { owner = 'A'; home = 'A'; Object.assign(a, { E: 3, I: 2, D: 2 }); }
      if (relay) Object.assign(a, { E: 2, I: 2, D: 2 });
      worlds.push({ id, name: NAMES[id], num: String(id + 1).padStart(2, '0'), profile: profileOf[id], owner, home, relay, E: a.E, I: a.I, D: a.D, capturedTurn: 0 });
    }
    const state = {
      seed, turn: 1, over: false, winner: null, draw: false, phase: 'human',
      worlds,
      empires: { H: { credits: 14, military: 0, prestige: 0 }, A: { credits: 14, military: 0, prestige: 0 } },
      log: [], acted: { H: false, A: false }, first: 'H', awakened: false, scores: null,
    };
    startTurn(state);
    return state;
  }

  /* ---------- queries ---------- */
  function ownedWorlds(state, side) { return state.worlds.filter(w => w.owner === side); }
  function income(state, side) {
    const ws = ownedWorlds(state, side);
    return { credits: 2 * ws.reduce((s, w) => s + w.E, 0), military: ws.reduce((s, w) => s + w.I, 0) };
  }
  function blockadeActive(turn) { return turn >= 16 && turn <= 19; }
  function attackMilitaryCost(state, world, turn) {
    const t = turn === undefined ? state.turn : turn;
    return 4 + 6 * world.D + (blockadeActive(t) ? 8 : 0);
  }
  function expandCost(state, side) { return 12 + 4 * ownedWorlds(state, side).length; }
  function isAdjacentTo(state, side, wid) { return ADJ[wid].some(n => state.worlds[n].owner === side); }
  function isProtected(state, world, turn) {
    const t = turn === undefined ? state.turn : turn;
    return world.capturedTurn > 0 && t <= world.capturedTurn + 1;
  }
  function firstAttackableTurn(world) { return world.capturedTurn + 2; }

  /* ---------- legality ---------- */
  const ok = () => ({ ok: true, reason: '' });
  const no = reason => ({ ok: false, reason });

  function canExpand(state, side, wid) {
    const w = state.worlds[wid];
    if (!w) return no('Select a world first.');
    if (w.owner) return no('Already colonised.');
    if (!isAdjacentTo(state, side, wid)) return no('No direct lane from your territory.');
    const c = expandCost(state, side);
    if (state.empires[side].credits < c) return no('Needs ' + c + ' Credits.');
    return ok();
  }
  function canDevelop(state, side, wid, attr) {
    const w = state.worlds[wid];
    if (!w) return no('Select a world first.');
    if (w.owner !== side) return no('You do not hold this world.');
    if (w[attr] >= 5) return no('Attribute already at maximum (5).');
    if (state.empires[side].credits < 8) return no('Needs 8 Credits.');
    return ok();
  }
  function canAttack(state, side, wid) {
    const w = state.worlds[wid];
    const foe = side === 'H' ? 'A' : 'H';
    if (!w) return no('Select a world first.');
    if (w.owner !== foe) return no('Not an enemy world.');
    if (!isAdjacentTo(state, side, wid)) return no('No direct lane from your territory.');
    if (isProtected(state, w)) return no('Capture-protected through turn ' + (w.capturedTurn + 1) + '.');
    if (state.empires[side].credits < 8) return no('Needs 8 Credits.');
    const mil = attackMilitaryCost(state, w);
    if (state.empires[side].military < mil) return no('Needs ' + mil + ' Military.');
    return ok();
  }

  /* ---------- orders ---------- */
  function addLog(state, side, text) { state.log.push({ turn: state.turn, side, text }); }

  function applyExpand(state, side, wid) {
    if (!canExpand(state, side, wid).ok) return false;
    const cost = expandCost(state, side);
    state.empires[side].credits -= cost;
    state.worlds[wid].owner = side;
    addLog(state, side, 'Expanded to ' + label(state.worlds[wid]) + ' (−' + cost + ' Cr).');
    return true;
  }
  function applyDevelop(state, side, wid, attr) {
    if (!canDevelop(state, side, wid, attr).ok) return false;
    state.empires[side].credits -= 8;
    state.worlds[wid][attr] += 1;
    addLog(state, side, 'Developed ' + label(state.worlds[wid]) + ' — ' + attrName(attr) + ' → ' + state.worlds[wid][attr] + ' (−8 Cr).');
    return true;
  }
  function applyAttack(state, side, wid) {
    if (!canAttack(state, side, wid).ok) return false;
    const foe = side === 'H' ? 'A' : 'H';
    const mil = attackMilitaryCost(state, state.worlds[wid]);
    state.empires[side].credits -= 8;
    state.empires[side].military -= mil;
    state.worlds[wid].owner = side;
    state.worlds[wid].capturedTurn = state.turn;
    addLog(state, side, 'Conquered ' + label(state.worlds[wid]) + ' (−8 Cr, −' + mil + ' Mil). Protected through turn ' + (state.turn + 1) + '.');
    if (ownedWorlds(state, foe).length === 0) {
      state.over = true; state.winner = side; state.draw = false;
      state.scores = { H: getScore(state, 'H'), A: getScore(state, 'A') };
      addLog(state, null, (side === 'H' ? 'Rival' : 'Your') + ' empire eliminated.');
    }
    return true;
  }
  function label(w) { return w.name + ' ' + w.num; }
  function attrName(a) { return a === 'E' ? 'Economy' : a === 'I' ? 'Industry' : 'Defense'; }

  /* ---------- turn engine ---------- */
  function startTurn(state) {
    const supernova = state.turn === 11;
    for (const side of ['H', 'A']) {
      const inc = income(state, side);
      state.empires[side].credits += inc.credits;
      state.empires[side].military += supernova ? 0 : inc.military;
    }
    state.first = state.turn % 2 === 1 ? 'H' : 'A';
    state.acted = { H: false, A: false };
    addLog(state, null, '— Turn ' + state.turn + ' —');
    if (supernova) addLog(state, null, 'Supernova: no Military income this turn.');
    if (state.first === 'A') aiAct(state);
    if (!state.over) state.phase = 'human';
    else state.phase = 'over';
  }

  function humanCommit(state, order) {
    if (state.over || state.phase !== 'human') return false;
    let done = false;
    if (order.type === 'expand') done = applyExpand(state, 'H', order.world);
    else if (order.type === 'develop') done = applyDevelop(state, 'H', order.world, order.attr);
    else if (order.type === 'attack') done = applyAttack(state, 'H', order.world);
    if (!done) return false; // illegal orders spend nothing and never consume the opportunity
    finishSide(state, 'H');
    return true;
  }
  function humanPass(state) {
    if (state.over || state.phase !== 'human') return false;
    addLog(state, 'H', 'Passed.');
    finishSide(state, 'H');
    return true;
  }
  function finishSide(state, side) {
    state.acted[side] = true;
    if (state.over) { state.phase = 'over'; return; }
    if (!state.acted.A) aiAct(state);
    if (state.over) { state.phase = 'over'; return; }
    if (state.acted.H && state.acted.A) endTurn(state);
  }
  function endTurn(state) {
    resolveEvent(state);
    awardRelayPrestige(state);
    if (state.turn >= MAX_TURNS) { conclude(state); return; }
    state.turn += 1;
    startTurn(state);
  }

  function resolveEvent(state) {
    if (state.turn === 5) {
      state.awakened = true;
      for (const id of RELAYS) {
        const w = state.worlds[id];
        w.E = Math.min(5, w.E + 1);
        w.I = Math.min(5, w.I + 1);
      }
      addLog(state, null, 'The ancient relays awaken: +1 Economy, +1 Industry each.');
    }
    if (state.turn === 10) addLog(state, null, 'Supernova warning: turn 11 pays no Military income.');
    if (state.turn === 15) addLog(state, null, 'Blockade warning: attacks cost +8 Military on turns 16–19.');
  }
  function awardRelayPrestige(state) {
    if (state.turn < 5) return;
    for (const id of RELAYS) {
      const w = state.worlds[id];
      if (w.owner) {
        state.empires[w.owner].prestige += 2;
        addLog(state, w.owner, w.name + ' banks 2 prestige.');
      }
    }
  }
  function getScore(state, side) {
    const ws = ownedWorlds(state, side);
    const planetValue = 3 * ws.length + ws.reduce((s, w) => s + w.E + w.I + w.D, 0);
    return { worlds: ws.length, planetValue, relay: state.empires[side].prestige, total: planetValue + state.empires[side].prestige };
  }
  function conclude(state) {
    state.over = true; state.phase = 'over';
    state.scores = { H: getScore(state, 'H'), A: getScore(state, 'A') };
    const h = state.scores.H.total, a = state.scores.A.total;
    if (h > a) { state.winner = 'H'; state.draw = false; }
    else if (a > h) { state.winner = 'A'; state.draw = false; }
    else { state.winner = null; state.draw = true; }
    addLog(state, null, 'The galaxy collapses. Final prestige decides the victor.');
  }

  /* ---------- rival AI ---------- */
  function chooseAIAction(state) {
    const me = 'A', foe = 'H';
    const myWs = ownedWorlds(state, me);
    const foeWs = ownedWorlds(state, foe);
    const legalAttack = id => canAttack(state, me, id).ok;
    const legalExpand = id => canExpand(state, me, id).ok;
    const legalDevelop = (id, a) => canDevelop(state, me, id, a).ok;

    // 1. Capture the human's final world.
    if (foeWs.length === 1 && legalAttack(foeWs[0].id)) return { type: 'attack', world: foeWs[0].id };

    // 2. Capture a human relay, else expand onto a neutral relay (lower ID first).
    for (const id of RELAYS) if (state.worlds[id].owner === foe && legalAttack(id)) return { type: 'attack', world: id };
    for (const id of RELAYS) if (!state.worlds[id].owner && legalExpand(id)) return { type: 'expand', world: id };

    // 3. Fortify a threatened owned relay just out of the human's reach.
    for (const id of RELAYS) {
      const w = state.worlds[id];
      if (w.owner !== me) continue;
      if (!ADJ[id].some(n => state.worlds[n].owner === foe)) continue;
      if (isProtected(state, w, state.turn + 1)) continue; // still protected next turn
      if (w.D >= 5 || state.empires[me].credits < 8) continue;
      const foeRes = state.empires[foe];
      const sur = blockadeActive(state.turn + 1) ? 8 : 0;
      const before = foeRes.credits >= 8 && foeRes.military >= 4 + 6 * w.D + sur;
      const after = foeRes.credits >= 8 && foeRes.military >= 4 + 6 * (w.D + 1) + sur;
      if (before && !after) return { type: 'develop', world: id, attr: 'D' };
    }

    // 4. Capture the highest-value legal non-relay enemy world.
    let best = null, bestKey = null;
    for (const w of foeWs) {
      if (w.relay || !legalAttack(w.id)) continue;
      const key = [-(3 + w.E + w.I + w.D), attackMilitaryCost(state, w), w.id];
      if (!bestKey || cmpKey(key, bestKey) < 0) { best = w; bestKey = key; }
    }
    if (best) return { type: 'attack', world: best.id };

    // 5. Expand toward an unreached neutral relay, else richest neutral world.
    const cmpNeut = (a, b) => (b.E + b.I) - (a.E + a.I) || b.E - a.E || a.id - b.id;
    const unreachedRelays = RELAYS.filter(id =>
      !state.worlds[id].owner && !ADJ[id].some(n => state.worlds[n].owner === me));
    const neutralLegal = state.worlds.filter(w => !w.owner && legalExpand(w.id));
    const toward = neutralLegal.filter(w => ADJ[w.id].some(r => unreachedRelays.indexOf(r) !== -1)).sort(cmpNeut);
    if (toward.length) return { type: 'expand', world: toward[0].id };
    const all = neutralLegal.slice().sort(cmpNeut);
    if (all.length) return { type: 'expand', world: all[0].id };

    // 6. Develop.
    if (state.turn <= 16) {
      const pref = income(state, me).credits < 12 ? 'E' : 'I';
      for (const attr of [pref, pref === 'E' ? 'I' : 'E']) {
        for (const w of myWs) if (legalDevelop(w.id, attr)) return { type: 'develop', world: w.id, attr };
      }
    } else {
      for (const id of RELAYS) {
        const w = state.worlds[id];
        if (w.owner === me && ADJ[id].some(n => state.worlds[n].owner === foe) && legalDevelop(id, 'D')) {
          return { type: 'develop', world: id, attr: 'D' };
        }
      }
      for (const w of myWs) for (const attr of ['E', 'I', 'D']) {
        if (legalDevelop(w.id, attr)) return { type: 'develop', world: w.id, attr };
      }
    }

    // 7. Pass.
    return { type: 'pass' };
  }
  function cmpKey(a, b) { for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] - b[i]; } return 0; }

  function aiAct(state) {
    if (state.over) return;
    const action = chooseAIAction(state);
    if (action.type === 'expand') applyExpand(state, 'A', action.world);
    else if (action.type === 'attack') applyAttack(state, 'A', action.world);
    else if (action.type === 'develop') applyDevelop(state, 'A', action.world, action.attr);
    else addLog(state, 'A', 'Rival passed.');
    state.acted.A = true;
  }

  /* ---------- event forecast ---------- */
  function forecast(state) {
    const t = state.turn;
    const items = [];
    if (t >= 5) items.push({ kind: 'active', text: 'Relays awake — each held relay banks 2 prestige at the end of every turn.' });
    if (blockadeActive(t)) items.push({ kind: 'active', text: 'Blockade ACTIVE — every attack costs +8 Military (lifts before turn 20).' });
    if (t < 5) items.push({ kind: 'next', text: 'End of turn 5 — Relay Awakening: both relays gain +1 Economy and +1 Industry (max 5); held relays bank their first 2 prestige.' });
    else if (t < 10) items.push({ kind: 'next', text: 'End of turn 10 — Supernova warning: turn 11 pays zero Military income (Credits unaffected).' });
    else if (t === 10) items.push({ kind: 'next', text: 'Turn 11 — Supernova: zero Military income for both empires; existing Military is kept.' });
    else if (t < 15) items.push({ kind: 'next', text: 'End of turn 15 — Blockade warning: attacks cost +8 Military during turns 16–19.' });
    else if (t === 15) items.push({ kind: 'next', text: 'Turns 16–19 — Blockade: every attack costs +8 Military. It lifts before turn-20 orders.' });
    else if (t < 20) items.push({ kind: 'next', text: 'Turn 20 — final relay prestige is banked, then the galaxy is scored: planet value + banked prestige.' });
    else items.push({ kind: 'next', text: 'End of turn 20 — final prestige award, then scoring. Make this order count.' });
    return items;
  }

  return {
    N_WORLDS, RELAYS, HOMES, MAX_TURNS, LINKS, ADJ, PROFILES,
    mulberry32, createGame,
    ownedWorlds, income, blockadeActive, attackMilitaryCost, expandCost,
    isAdjacentTo, isProtected, firstAttackableTurn,
    canExpand, canDevelop, canAttack,
    humanCommit, humanPass, chooseAIAction, getScore, forecast,
    _test: { startTurn, endTurn, resolveEvent, awardRelayPrestige, applyExpand, applyDevelop, applyAttack, aiAct, conclude },
  };
});
