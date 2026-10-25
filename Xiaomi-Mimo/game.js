/* Void Empires — Blitz: rules engine, seeded galaxy, and rival AI.
   Pure logic: no DOM access. Exposed as window.Game. */
(function () {
  'use strict';

  const CONFIG = {
    ROWS: 4,
    COLS: 5,
    MAX_TURN: 20,
    START_CREDITS: 14,
    START_MILITARY: 0,
    EXPAND_BASE: 12,
    EXPAND_PER_OWNED: 4,
    DEVELOP_COST: 8,
    ATTACK_CREDITS: 8,
    ATTACK_BASE_MIL: 4,
    ATTACK_PER_DEFENSE: 6,
    BLOCKADE_FROM: 16,
    BLOCKADE_TO: 19,
    BLOCKADE_SURCHARGE: 8,
    RELAY_AWAKEN_TURN: 5,
    RELAY_PRESTIGE: 2,
    RELAY_PRESTIGE_FROM: 5,
    SUPPRESS_MIL_TURN: 11,
    HUMAN_HOME: 5,
    AI_HOME: 14,
    RELAYS: [7, 12],
    MAX_ATTR: 5
  };

  const PROFILES = {
    trade: { key: 'trade', name: 'Trade', e: 3, i: 1, d: 1 },
    forge: { key: 'forge', name: 'Forge', e: 1, i: 3, d: 1 },
    bastion: { key: 'bastion', name: 'Bastion', e: 1, i: 1, d: 3 }
  };

  const WORLD_NAMES = [
    'Cinder', 'Halcyon', 'Vesper', 'Thule', 'Kestrel',
    'Nadir', 'Ardent', 'Meridian I', 'Ferro', 'Ashfall',
    'Bramble', 'Sable', 'Meridian II', 'Tern', 'Vulcan',
    'Helion', 'Drift', 'Aventine', 'Kharo', 'Obsidian'
  ];

  const EMPIRES = {
    human: { key: 'human', name: 'Azure Combine', short: 'You' },
    ai: { key: 'ai', name: 'Ember Court', short: 'Rival' }
  };

  /* ---- galaxy topology: 4x5 grid, 16 horizontal + 6 vertical + 1 relay lane ---- */
  function buildLinks() {
    const links = [];
    const id = (r, c) => r * CONFIG.COLS + c;
    for (let r = 0; r < CONFIG.ROWS; r++) {
      for (let c = 0; c < CONFIG.COLS - 1; c++) links.push([id(r, c), id(r, c + 1)]);
    }
    for (const c of [0, CONFIG.COLS - 1]) {
      for (let r = 0; r < CONFIG.ROWS - 1; r++) links.push([id(r, c), id(r + 1, c)]);
    }
    links.push([7, 12]);
    return links;
  }

  const LINKS = buildLinks();
  const NEIGHBORS = Array.from({ length: 20 }, () => []);
  LINKS.forEach(([a, b]) => { NEIGHBORS[a].push(b); NEIGHBORS[b].push(a); });

  /* ---- deterministic RNG: 32-bit mulberry32 ---- */
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Rotational pairs (id, 19-id) share one profile. Forced: 0/19 Forge, 6/13 Trade. */
  function profileSet(seed) {
    const rng = mulberry32(seed);
    const forced = { 0: 'forge', 6: 'trade' };
    const keys = ['trade', 'forge', 'bastion'];
    const out = new Array(20).fill(null);
    for (let id = 0; id < 20; id++) {
      if (out[id] !== null) continue;
      const mirror = 19 - id;
      const p = forced[id] || keys[Math.floor(rng() * 3)];
      out[id] = p;
      out[mirror] = p;
    }
    return out;
  }

  /* ---- match construction ---- */
  function createMatch(seed) {
    seed = seed >>> 0;
    const profiles = profileSet(seed);
    const worlds = [];
    for (let id = 0; id < 20; id++) {
      const prof = PROFILES[profiles[id]];
      worlds.push({
        id: id,
        name: WORLD_NAMES[id],
        row: Math.floor(id / CONFIG.COLS),
        col: id % CONFIG.COLS,
        profile: prof.name,
        owner: null,
        e: prof.e, i: prof.i, d: prof.d,
        isHome: false, isRelay: CONFIG.RELAYS.indexOf(id) >= 0,
        protectedThrough: null, capturedOn: null
      });
    }
    // forced pair values are already in profiles; override homes and relays
    const home = worlds[CONFIG.HUMAN_HOME];
    home.owner = 'human'; home.isHome = true; home.profile = 'Homeworld';
    home.e = 3; home.i = 2; home.d = 2;
    const aiHome = worlds[CONFIG.AI_HOME];
    aiHome.owner = 'ai'; aiHome.isHome = true; aiHome.profile = 'Homeworld';
    aiHome.e = 3; aiHome.i = 2; aiHome.d = 2;
    for (const rid of CONFIG.RELAYS) {
      const w = worlds[rid];
      w.owner = null; w.profile = 'Relay';
      w.e = 2; w.i = 2; w.d = 2;
    }
    return {
      seed: seed,
      worlds: worlds,
      empires: {
        human: { credits: CONFIG.START_CREDITS, military: CONFIG.START_MILITARY, prestige: 0 },
        ai: { credits: CONFIG.START_CREDITS, military: CONFIG.START_MILITARY, prestige: 0 }
      },
      turn: 0,
      phase: 'intro',           // intro | human | locked | over
      firstActor: null,
      acted: { human: false, ai: false },
      staged: null,             // {type,target,attr}
      selected: CONFIG.HUMAN_HOME,
      log: [],
      events: { awakened: false, supernovaWarned: false, blockadeWarned: false, collapse: false },
      ended: null               // {winner, reason}
    };
  }

  /* ---- economy helpers ---- */
  function ownedBy(state, who) { return state.worlds.filter(w => w.owner === who); }
  function countOwned(state, who) { return ownedBy(state, who).length; }
  function sumAttr(state, who, attr) {
    return ownedBy(state, who).reduce((s, w) => s + w[attr], 0);
  }
  function creditIncome(state, who) { return 2 * sumAttr(state, who, 'e'); }
  function militaryIncome(state, who, turn) {
    if ((turn === undefined ? state.turn : turn) === CONFIG.SUPPRESS_MIL_TURN) return 0;
    return sumAttr(state, who, 'i');
  }
  function expandCost(state, who) {
    return CONFIG.EXPAND_BASE + CONFIG.EXPAND_PER_OWNED * countOwned(state, who);
  }
  function blockadeActive(turn) {
    return turn >= CONFIG.BLOCKADE_FROM && turn <= CONFIG.BLOCKADE_TO;
  }
  function attackMilitary(world, turn) {
    const base = CONFIG.ATTACK_BASE_MIL + CONFIG.ATTACK_PER_DEFENSE * world.d;
    return base + (blockadeActive(turn) ? CONFIG.BLOCKADE_SURCHARGE : 0);
  }
  function isProtected(world, turn) {
    return world.protectedThrough !== null && turn <= world.protectedThrough;
  }
  function adjacentToEmpire(state, worldId, who) {
    return NEIGHBORS[worldId].some(n => state.worlds[n].owner === who);
  }
  function isRelay(id) { return CONFIG.RELAYS.indexOf(id) >= 0; }

  /* ---- legality: shared by human and AI ----
     order = {type:'expand'|'develop'|'attack', target:id, attr:'e'|'i'|'d'} */
  function legalOrder(state, who, order) {
    const foe = who === 'human' ? 'ai' : 'human';
    const res = { ok: false, reason: null, cost: { credits: 0, military: 0 }, detail: '' };
    if (!order || order.type === 'pass') { res.ok = true; res.reason = 'pass'; return res; }
    const w = state.worlds[order.target];
    const emp = state.empires[who];
    if (!w) { res.reason = 'invalid'; return res; }

    if (order.type === 'expand') {
      const cost = expandCost(state, who);
      res.cost.credits = cost;
      if (w.owner !== null) { res.reason = w.owner === foe ? 'owned-foe' : 'owned-self'; return res; }
      if (!adjacentToEmpire(state, w.id, who)) { res.reason = 'not-adjacent'; return res; }
      if (emp.credits < cost) { res.reason = 'credits'; return res; }
      res.ok = true; return res;
    }

    if (order.type === 'develop') {
      const attr = order.attr;
      res.cost.credits = CONFIG.DEVELOP_COST;
      if (w.owner !== who) { res.reason = w.owner === null ? 'not-owned' : 'owned-foe'; return res; }
      if (['e', 'i', 'd'].indexOf(attr) < 0) { res.reason = 'invalid'; return res; }
      if (w[attr] >= CONFIG.MAX_ATTR) { res.reason = 'capped'; return res; }
      if (emp.credits < CONFIG.DEVELOP_COST) { res.reason = 'credits'; return res; }
      res.ok = true; return res;
    }

    if (order.type === 'attack') {
      const mil = attackMilitary(w, state.turn);
      res.cost.credits = CONFIG.ATTACK_CREDITS;
      res.cost.military = mil;
      if (w.owner !== foe) { res.reason = w.owner === null ? 'not-enemy' : 'owned-self'; return res; }
      if (!adjacentToEmpire(state, w.id, who)) { res.reason = 'not-adjacent'; return res; }
      if (isProtected(w, state.turn)) { res.reason = 'protected'; res.protectedThrough = w.protectedThrough; return res; }
      if (emp.credits < CONFIG.ATTACK_CREDITS) { res.reason = 'credits'; return res; }
      if (emp.military < mil) { res.reason = 'military'; return res; }
      res.ok = true; return res;
    }
    res.reason = 'invalid';
    return res;
  }

  /* ---- order resolution (assumes legality was checked) ---- */
  function pushLog(state, kind, text) {
    state.log.unshift({ turn: state.turn, kind: kind, text: text, n: state.log.length });
    if (state.log.length > 120) state.log.pop();
  }

  function applyOrder(state, who, order) {
    const L = legalOrder(state, who, order);
    if (!L.ok) return { ok: false, reason: L.reason };
    const emp = state.empires[who];
    const w = state.worlds[order.target];
    const name = EMPIRES[who].name;

    if (order.type === 'pass') {
      pushLog(state, 'pass', 'Turn ' + state.turn + ' · ' + name + ' passes.');
      state.acted[who] = true;
      return { ok: true, pass: true };
    }

    emp.credits -= L.cost.credits;
    emp.military -= L.cost.military;

    if (order.type === 'expand') {
      w.owner = who;
      w.protectedThrough = null;
      pushLog(state, 'expand', 'Turn ' + state.turn + ' · ' + name + ' expands onto ' +
        label(w) + ' (' + L.cost.credits + '¢).');
    } else if (order.type === 'develop') {
      w[order.attr] += 1;
      const an = { e: 'Economy', i: 'Industry', d: 'Defense' }[order.attr];
      pushLog(state, 'develop', 'Turn ' + state.turn + ' · ' + name + ' develops ' + an +
        ' on ' + label(w) + ' → ' + w[order.attr] + ' (8¢).');
    } else if (order.type === 'attack') {
      const from = w.owner;
      w.owner = who;
      w.capturedOn = state.turn;
      w.protectedThrough = state.turn + 1;
      pushLog(state, 'attack', 'Turn ' + state.turn + ' · ' + name + ' captures ' + label(w) +
        ' from ' + EMPIRES[from].name + ' (8¢, ' + L.cost.military + '⚔).');
    }
    state.acted[who] = true;
    state.staged = null;
    return { ok: true, order: order, cost: L.cost };
  }

  function label(w) { return w.name + ' ' + pad(w.id + 1); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* ---- income at the start of each shared turn ---- */
  function payIncome(state) {
    const t = state.turn;
    const out = {};
    for (const who of ['human', 'ai']) {
      const c = creditIncome(state, who);
      const m = militaryIncome(state, who, t);
      state.empires[who].credits += c;
      state.empires[who].military += m;
      out[who] = { credits: c, military: m };
    }
    return out;
  }

  /* ---- scheduled events, end of shared turn ---- */
  function endOfTurn(state) {
    const t = state.turn;
    if (t === CONFIG.RELAY_AWAKEN_TURN) {
      for (const rid of CONFIG.RELAYS) {
        const w = state.worlds[rid];
        w.e = Math.min(CONFIG.MAX_ATTR, w.e + 1);
        w.i = Math.min(CONFIG.MAX_ATTR, w.i + 1);
      }
      state.events.awakened = true;
      pushLog(state, 'event', 'Turn ' + t + ' · RELAY AWAKENING — both relays gain +1 Economy and +1 Industry.');
    }
    if (t === 10 && !state.events.supernovaWarned) {
      state.events.supernovaWarned = true;
      pushLog(state, 'warning', 'Turn 10 · SUPERNOVA WARNING — turn 11 grants zero Military income.');
    }
    if (t === 15 && !state.events.blockadeWarned) {
      state.events.blockadeWarned = true;
      pushLog(state, 'warning', 'Turn 15 · BLOCKADE WARNING — attacks cost +8⚔ on turns 16–19.');
    }
    if (t === 20 && !state.events.collapse) {
      state.events.collapse = true;
      pushLog(state, 'warning', 'Turn 20 · VOID COLLAPSE — final relay award, then the galaxy is scored.');
    }
    if (t >= CONFIG.RELAY_PRESTIGE_FROM) {
      for (const rid of CONFIG.RELAYS) {
        const w = state.worlds[rid];
        if (w.owner) {
          state.empires[w.owner].prestige += CONFIG.RELAY_PRESTIGE;
          pushLog(state, 'prestige', 'Turn ' + t + ' · ' + label(w) + ' banks +2 prestige for ' +
            EMPIRES[w.owner].name + '.');
        }
      }
    }
  }

  /* ---- scoring ---- */
  function getScore(state, who) {
    const worlds = ownedBy(state, who);
    const attrs = worlds.reduce((s, w) => s + w.e + w.i + w.d, 0);
    const planetValue = 3 * worlds.length + attrs;
    const relay = state.empires[who].prestige;
    return { worlds: worlds.length, attrs: attrs, planetValue: planetValue, relayPrestige: relay, total: planetValue + relay };
  }

  function checkElimination(state) {
    const h = countOwned(state, 'human');
    const a = countOwned(state, 'ai');
    if (h === 0 && a === 0) { state.ended = { winner: null, reason: 'elimination' }; return true; }
    if (a === 0) { state.ended = { winner: 'human', reason: 'elimination' }; return true; }
    if (h === 0) { state.ended = { winner: 'ai', reason: 'elimination' }; return true; }
    return false;
  }

  function finalizeScore(state) {
    const hs = getScore(state, 'human');
    const as = getScore(state, 'ai');
    let winner = null;
    if (hs.total > as.total) winner = 'human';
    else if (as.total > hs.total) winner = 'ai';
    state.ended = { winner: winner, reason: 'score', human: hs, ai: as };
  }

  /* ---- BFS distance used by the AI's relay push ---- */
  function distanceMap(fromId) {
    const dist = new Array(20).fill(Infinity);
    dist[fromId] = 0;
    const q = [fromId];
    while (q.length) {
      const cur = q.shift();
      for (const n of NEIGHBORS[cur]) {
        if (dist[n] === Infinity) { dist[n] = dist[cur] + 1; q.push(n); }
      }
    }
    return dist;
  }

  /* ---- rival AI: deterministic priority policy ---- */
  function chooseAIAction(state) {
    const t = state.turn;
    const who = 'ai';
    const emp = state.empires.ai;
    const humanWorlds = ownedBy(state, 'human');
    const relays = CONFIG.RELAYS.slice().sort((a, b) => a - b);
    const legal = (o) => legalOrder(state, who, o);
    const canPay = (r) => r.ok;

    // 1. Capture the human's final world if legal.
    if (humanWorlds.length === 1) {
      const o = { type: 'attack', target: humanWorlds[0].id };
      if (canPay(legal(o))) return o;
    }

    // 2. Capture a human-owned relay; otherwise expand onto a neutral relay.
    const relayAttacks = relays
      .map(id => ({ type: 'attack', target: id }))
      .filter(o => state.worlds[o.target].owner === 'human' && canPay(legal(o)));
    if (relayAttacks.length) return relayAttacks[0];
    const relayExpands = relays
      .map(id => ({ type: 'expand', target: id }))
      .filter(o => state.worlds[o.target].owner === null && canPay(legal(o)));
    if (relayExpands.length) return relayExpands[0];

    // 3. Defend an owned relay adjacent to the human.
    const nextTurnBlockade = blockadeActive(t + 1) ? CONFIG.BLOCKADE_SURCHARGE : 0;
    for (const rid of relays) {
      const w = state.worlds[rid];
      if (w.owner !== 'ai') continue;
      if (!NEIGHBORS[rid].some(n => state.worlds[n].owner === 'human')) continue;
      if (isProtected(w, t + 1)) continue;              // still capture-protected next turn
      if (w.d >= CONFIG.MAX_ATTR) continue;
      if (emp.credits < CONFIG.DEVELOP_COST) break;
      const before = CONFIG.ATTACK_BASE_MIL + CONFIG.ATTACK_PER_DEFENSE * w.d + nextTurnBlockade;
      const after = CONFIG.ATTACK_BASE_MIL + CONFIG.ATTACK_PER_DEFENSE * (w.d + 1) + nextTurnBlockade;
      const humanCan = (m) => state.empires.human.credits >= CONFIG.ATTACK_CREDITS &&
        state.empires.human.military >= m;
      if (humanCan(before) && !humanCan(after)) {
        return { type: 'develop', target: rid, attr: 'd' };
      }
    }

    // 4. Capture the highest-value legal non-relay enemy world.
    const attacks = state.worlds
      .filter(w => w.owner === 'human' && !w.isRelay)
      .map(w => ({ type: 'attack', target: w.id }))
      .filter(o => canPay(legal(o)))
      .map(o => {
        const w = state.worlds[o.target];
        return { o: o, value: 3 + w.e + w.i + w.d, mil: attackMilitary(w, t), id: w.id };
      })
      .sort((a, b) => b.value - a.value || a.mil - b.mil || a.id - b.id);
    if (attacks.length) return attacks[0].o;

    // 5. Expand toward a neutral relay that is not already adjacent to the AI.
    //    Candidates must be legal expansions (adjacent + affordable) for THIS actor.
    const expandTargets = state.worlds
      .filter(w => w.owner === null && adjacentToEmpire(state, w.id, who))
      .map(w => ({ type: 'expand', target: w.id }))
      .filter(o => canPay(legal(o)));
    if (expandTargets.length) {
      const wanted = relays.filter(id =>
        state.worlds[id].owner === null && !adjacentToEmpire(state, id, 'ai'));
      if (wanted.length) {
        const dists = wanted.map(distanceMap);
        const scored = expandTargets.map(o => {
          const w = state.worlds[o.target];
          const dist = Math.min.apply(null, dists.map(d => d[w.id]));
          return { o: o, dist: dist, ei: w.e + w.i, e: w.e, id: w.id };
        }).sort((a, b) => a.dist - b.dist || b.ei - a.ei || b.e - a.e || a.id - b.id);
        return scored[0].o;
      }
      const generic = expandTargets.map(o => {
        const w = state.worlds[o.target];
        return { o: o, ei: w.e + w.i, e: w.e, id: w.id };
      }).sort((a, b) => b.ei - a.ei || b.e - a.e || a.id - b.id);
      return generic[0].o;
    }

    // 6. Development.
    const developLegal = (target, attr) => legal({ type: 'develop', target: target, attr: attr });
    const firstLegalDev = (attr) => {
      const worlds = ownedBy(state, 'ai').slice().sort((a, b) => a.id - b.id);
      for (const w of worlds) {
        if (w[attr] < CONFIG.MAX_ATTR && developLegal(w.id, attr).ok) return { type: 'develop', target: w.id, attr: attr };
      }
      return null;
    };
    if (t >= 17) {
      // fortify a relay bordering the human first
      for (const rid of relays) {
        const w = state.worlds[rid];
        if (w.owner === 'ai' && NEIGHBORS[rid].some(n => state.worlds[n].owner === 'human') &&
          w.d < CONFIG.MAX_ATTR && developLegal(rid, 'd').ok) {
          return { type: 'develop', target: rid, attr: 'd' };
        }
      }
      for (const attr of ['e', 'i', 'd']) {
        const o = firstLegalDev(attr);
        if (o) return o;
      }
      return { type: 'pass' };
    }
    const preferred = creditIncome(state, 'ai') < 12 ? 'e' : 'i';
    const secondary = preferred === 'e' ? 'i' : 'e';
    return firstLegalDev(preferred) || firstLegalDev(secondary) || { type: 'pass' };
  }

  /* ---- event forecast shown to the player ---- */
  function eventTimeline(state) {
    const t = state.turn;
    const items = [
      {
        id: 'awaken', turn: 5, title: 'Relay Awakening',
        effect: 'End of turn 5: each relay gains +1 Economy and +1 Industry, then pays +2 prestige to its owner.',
        status: state.events.awakened ? 'done' : 'soon'
      },
      {
        id: 'supernova', turn: 11, title: 'Supernova',
        effect: 'Turn 11 grants zero Military income (Credits unaffected). Warning posted at end of turn 10.',
        status: t > 11 ? 'done' : (t === 11 ? 'now' : (t >= 10 ? 'warn' : 'soon'))
      },
      {
        id: 'blockade', turn: 16, title: 'Blockade Surge',
        effect: 'Turns 16–19: every Attack costs +8 Military. Lifts before turn-20 orders.',
        status: t > 19 ? 'done' : (blockadeActive(t) ? 'now' : (t >= 15 ? 'warn' : 'soon'))
      },
      {
        id: 'collapse', turn: 20, title: 'Void Collapse',
        effect: 'End of turn 20: final relay prestige, then planet value + banked prestige decides the match.',
        status: t >= 20 ? 'now' : 'soon'
      }
    ];
    return items;
  }

  function nextEvent(state) {
    const items = eventTimeline(state);
    return items.find(i => i.status === 'now') || items.find(i => i.status === 'warn') ||
      items.find(i => i.status === 'soon') || items[items.length - 1];
  }

  function forecastEvent(state) {
    const items = eventTimeline(state);
    return items.find(i => i.status === 'warn') || items.find(i => i.status === 'soon') ||
      items.find(i => i.status === 'now') || items[items.length - 1];
  }

  window.Game = {
    CONFIG: CONFIG,
    PROFILES: PROFILES,
    EMPIRES: EMPIRES,
    LINKS: LINKS,
    NEIGHBORS: NEIGHBORS,
    WORLD_NAMES: WORLD_NAMES,
    mulberry32: mulberry32,
    profileSet: profileSet,
    createMatch: createMatch,
    ownedBy: ownedBy,
    countOwned: countOwned,
    creditIncome: creditIncome,
    militaryIncome: militaryIncome,
    expandCost: expandCost,
    blockadeActive: blockadeActive,
    attackMilitary: attackMilitary,
    isProtected: isProtected,
    adjacentToEmpire: adjacentToEmpire,
    isRelay: isRelay,
    legalOrder: legalOrder,
    applyOrder: applyOrder,
    payIncome: payIncome,
    endOfTurn: endOfTurn,
    getScore: getScore,
    checkElimination: checkElimination,
    finalizeScore: finalizeScore,
    chooseAIAction: chooseAIAction,
    eventTimeline: eventTimeline,
    nextEvent: nextEvent,
    forecastEvent: forecastEvent,
    label: label,
    pad: pad
  };
})();