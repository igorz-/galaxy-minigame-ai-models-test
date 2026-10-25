/* =====================================================================
   RELIC WARS — engine.js
   Pure game rules. No DOM access. Everything is deterministic given a
   seed and the sequence of human orders.

   Exposes (as globals in the browser, or shared scope in tests):
     CFG, EMPIRES, NAMES, ATTRS, ATTR_NAME, ADJ, LANES
     mulberry32, generateGalaxy, layoutFor, createMatch
     ownedWorlds, worldCount, getIncome, expandCost, attackMilCost
     blockadeActive, isProtected, isAdjacentToEmpire, orderStatus
     resolveOrder, payIncome, endTurnEvent, awardRelayPrestige
     getScore, finalStandings, num
   ===================================================================== */
'use strict';

const CFG = {
  ROWS: 4,
  COLS: 5,
  WORLD_COUNT: 20,
  MAX_TURN: 20,

  START_CREDITS: 14,
  START_MIL: 0,

  HOME: { human: 5, ai: 14 },
  RELAYS: [7, 12],

  HOME_ATTRS: { e: 3, i: 2, d: 2 },
  RELAY_ATTRS: { e: 2, i: 2, d: 2 },

  PROFILES: {
    Trade:   { e: 3, i: 1, d: 1 },
    Forge:   { e: 1, i: 3, d: 1 },
    Bastion: { e: 1, i: 1, d: 3 },
  },
  PROFILE_KEYS: ['Trade', 'Forge', 'Bastion'],

  EXPAND_BASE: 12,
  EXPAND_PER_WORLD: 4,

  DEVELOP_COST: 8,

  ATTACK_CREDITS: 8,
  ATTACK_MIL_BASE: 4,
  ATTACK_MIL_PER_DEF: 6,

  BLOCKADE_FROM: 16,
  BLOCKADE_TO: 19,
  BLOCKADE_SURCHARGE: 8,

  SUPERNOVA_TURN: 11,          // zero Military income this turn
  RELAY_WAKE_TURN: 5,          // relays awaken at end of this turn
  RELAY_PRESTIGE: 2,           // per relay, per turn, from turn 5 on
  PROTECT_THROUGH_OFFSET: 1,   // captured on T -> protected through T+1
};

const EMPIRES = {
  human: { name: 'Lucent Accord', short: 'You', home: 'Hearth' },
  ai:    { name: 'Umbral Synod',  short: 'Rival', home: 'Dominion' },
};

const NAMES = [
  'Cinder', 'Aurelia', 'Kelvaris', 'Ostreon', 'Vela',
  'Hearth', 'Talos', 'Vigil I', 'Nyx', 'Halden',
  'Ferros', 'Myrrh', 'Vigil II', 'Rhiannon', 'Dominion',
  'Lysandar', 'Corvid', 'Solaria', 'Obsidra', 'Zephyrine',
];

const ATTRS = ['e', 'i', 'd'];
const ATTR_NAME = { e: 'Economy', i: 'Industry', d: 'Defense' };

/** Display number for engine id (0-19 -> "01"-"20"). */
function num(id) { return String(id + 1).padStart(2, '0'); }
function worldLabel(id) { return `${num(id)} · ${NAMES[id]}`; }

/* ---------------------------------------------------------------- RNG */

/** Reference 32-bit generator: mulberry32. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------ TOPOLOGY */

/**
 * Fixed lane chart:
 *  - every horizontal neighbor in each row (16)
 *  - vertical neighbors along leftmost + rightmost columns (6)
 *  - the two central relays, ids 7 and 12 (1)
 * Total: 23 undirected lanes. Never changes during a match.
 */
function buildLanes() {
  const set = new Set();
  const key = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
  for (let r = 0; r < CFG.ROWS; r++) {
    for (let c = 0; c < CFG.COLS - 1; c++) {
      const a = r * CFG.COLS + c;
      set.add(key(a, a + 1));
    }
  }
  for (let r = 0; r < CFG.ROWS - 1; r++) {
    set.add(key(r * CFG.COLS, (r + 1) * CFG.COLS));                 // left column
    set.add(key(r * CFG.COLS + CFG.COLS - 1, (r + 1) * CFG.COLS + CFG.COLS - 1)); // right column
  }
  set.add(key(CFG.RELAYS[0], CFG.RELAYS[1]));                      // relay link
  const lanes = [...set].map(k => k.split('-').map(Number)).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const adj = Array.from({ length: CFG.WORLD_COUNT }, () => []);
  for (const [a, b] of lanes) { adj[a].push(b); adj[b].push(a); }
  for (const list of adj) list.sort((x, y) => x - y);
  return { lanes, adj };
}

const { lanes: LANES, adj: ADJ } = buildLanes();

/* ------------------------------------------------------- GALAXY (seed) */

/**
 * Seeded map. Each rotational pair (id, 19-id) shares one profile:
 * Trade / Forge / Bastion, equally likely. Force ids 0+19 -> Forge and
 * 6+13 -> Trade. Then override homeworlds (E3/I2/D2) and relays
 * (E2/I2/D2). The seed changes profiles only — never positions, links,
 * homes, or relays.
 */
function generateGalaxy(seed) {
  const rng = mulberry32(seed >>> 0);
  const worlds = [];
  for (let id = 0; id < CFG.WORLD_COUNT; id++) {
    worlds.push({ id, name: NAMES[id], profile: 'Trade', e: 1, i: 1, d: 1 });
  }
  for (let id = 0; id < CFG.WORLD_COUNT / 2; id++) {
    const p = CFG.PROFILE_KEYS[Math.floor(rng() * CFG.PROFILE_KEYS.length)];
    worlds[id].profile = p;
    worlds[CFG.WORLD_COUNT - 1 - id].profile = p;
  }
  // Forced pairs
  worlds[0].profile = 'Forge';  worlds[19].profile = 'Forge';
  worlds[6].profile = 'Trade';  worlds[13].profile = 'Trade';
  // Attributes from profile
  for (const w of worlds) Object.assign(w, CFG.PROFILES[w.profile]);
  // Overrides
  for (const id of [CFG.HOME.human, CFG.HOME.ai]) Object.assign(worlds[id], CFG.HOME_ATTRS);
  for (const id of CFG.RELAYS) Object.assign(worlds[id], CFG.RELAY_ATTRS);
  return worlds;
}

/**
 * Deterministic cosmetic layout (jitter/rotation/scale per node) for a
 * 1000 x 640 chart. Positions never affect rules.
 */
function layoutFor(seed) {
  const rng = mulberry32((seed ^ 0x5F3759DF) >>> 0);
  const pts = [];
  for (let id = 0; id < CFG.WORLD_COUNT; id++) {
    const r = Math.floor(id / CFG.COLS);
    const c = id % CFG.COLS;
    pts.push({
      x: Math.round((110 + c * 195 + (rng() * 2 - 1) * 10) * 10) / 10,
      y: Math.round((95 + r * 150 + (rng() * 2 - 1) * 10) * 10) / 10,
      rot: Math.round(rng() * 360),
      scale: Math.round((0.9 + rng() * 0.18) * 100) / 100,
    });
  }
  return pts;
}

/* --------------------------------------------------------------- STATE */

function createMatch(seed) {
  seed = seed >>> 0;
  const base = generateGalaxy(seed);
  const worlds = base.map(w => ({
    ...w,
    owner: w.id === CFG.HOME.human ? 'human' : w.id === CFG.HOME.ai ? 'ai' : null,
    protectedUntil: 0, // no capture protection at match start
  }));
  return {
    seed,
    worlds,
    empires: {
      human: { credits: CFG.START_CREDITS, mil: CFG.START_MIL, prestige: 0 },
      ai:    { credits: CFG.START_CREDITS, mil: CFG.START_MIL, prestige: 0 },
    },
    turn: 0,
    awakened: false,
    log: [],          // {turn, side:'you'|'rival'|'event'|'system', text}
    over: false,
    winner: null,     // 'human' | 'ai' | 'draw'
    endReason: null,  // 'elimination' | 'prestige'
  };
}

function pushLog(state, side, text) {
  state.log.push({ turn: state.turn, side, text });
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}

const foeOf = who => (who === 'human' ? 'ai' : 'human');
const actorName = who => EMPIRES[who].short;

function ownedWorlds(state, who) {
  return state.worlds.filter(w => w.owner === who);
}
function worldCount(state, who) {
  let n = 0;
  for (const w of state.worlds) if (w.owner === who) n++;
  return n;
}
function isRelay(id) { return CFG.RELAYS.includes(id); }

/* -------------------------------------------------------------- INCOME */

function blockadeActive(turn) {
  return turn >= CFG.BLOCKADE_FROM && turn <= CFG.BLOCKADE_TO;
}

/**
 * Income paid at the START of every shared turn (including turn 1):
 *   Credits  += 2 x sum(Economy on owned worlds)
 *   Military += sum(Industry on owned worlds)
 * Turn 11 exception: zero new Military for both empires.
 */
function getIncome(state, who, turn) {
  const ws = ownedWorlds(state, who);
  let econ = 0, indus = 0;
  for (const w of ws) { econ += w.e; indus += w.i; }
  const credits = 2 * econ;
  const mil = turn === CFG.SUPERNOVA_TURN ? 0 : indus;
  return { credits, mil, econ, indus, suppressed: turn === CFG.SUPERNOVA_TURN };
}

function payIncome(state) {
  const turn = state.turn;
  const paid = {};
  for (const who of ['human', 'ai']) {
    const inc = getIncome(state, who, turn);
    state.empires[who].credits += inc.credits;
    state.empires[who].mil += inc.mil;
    paid[who] = { credits: inc.credits, mil: inc.mil, suppressed: inc.suppressed };
  }
  const fmt = p => `+${p.credits} cr${p.suppressed ? ', +0 mil (supernova)' : `, +${p.mil} mil`}`;
  pushLog(state, 'system', `Turn ${turn} income — You: ${fmt(paid.human)} · Rival: ${fmt(paid.ai)}`);
  return paid;
}

/* --------------------------------------------------------------- COSTS */

function expandCost(state, who) {
  return CFG.EXPAND_BASE + CFG.EXPAND_PER_WORLD * worldCount(state, who);
}

function attackMilCost(state, targetId, turn) {
  const w = state.worlds[targetId];
  return CFG.ATTACK_MIL_BASE + CFG.ATTACK_MIL_PER_DEF * w.d +
    (blockadeActive(turn) ? CFG.BLOCKADE_SURCHARGE : 0);
}

function isProtected(state, id, turn) {
  return state.worlds[id].protectedUntil >= turn;
}

function isAdjacentToEmpire(state, id, who) {
  return ADJ[id].some(n => state.worlds[n].owner === who);
}

/* --------------------------------------------------- ORDERS & LEGALITY */

/**
 * Shared legality + cost function for both empires.
 * order: { type:'expand'|'develop'|'attack', target:id, attr?:'e'|'i'|'d' }
 * Returns { legal, cost:{cr,mil}, reasons:[...], status:orderStatus }
 */
function orderStatus(state, who, order) {
  const emp = state.empires[who];
  const w = state.worlds[order.target];
  const foe = foeOf(who);
  const reasons = [];
  const cost = { cr: 0, mil: 0 };
  let status = order.type;

  if (order.type === 'expand') {
    cost.cr = expandCost(state, who);
    if (w.owner === who) { reasons.push('Already yours'); status = 'own'; }
    else if (w.owner === foe) { reasons.push('Rival world — attacks only'); status = 'enemy'; }
    else if (!isAdjacentToEmpire(state, w.id, who)) { reasons.push('No direct lane from your worlds'); status = 'unlinked'; }
    if (reasons.length === 0 && emp.credits < cost.cr) reasons.push(`Needs ${cost.cr - emp.credits} more credits`);
  } else if (order.type === 'develop') {
    cost.cr = CFG.DEVELOP_COST;
    const attr = order.attr || 'e';
    if (w.owner !== who) {
      reasons.push(w.owner === null ? 'Neutral world — expand first' : 'Rival world');
      status = w.owner === null ? 'unlinked' : 'enemy';
    } else if (w[attr] >= 5) {
      reasons.push(`${ATTR_NAME[attr]} already at max (5)`);
      status = 'capped';
    }
    if (reasons.length === 0 && emp.credits < cost.cr) reasons.push(`Needs ${cost.cr - emp.credits} more credits`);
  } else if (order.type === 'attack') {
    cost.cr = CFG.ATTACK_CREDITS;
    cost.mil = attackMilCost(state, w.id, state.turn);
    if (w.owner === who) { reasons.push('Already yours'); status = 'own'; }
    else if (w.owner === null) { reasons.push('Neutral world — expand instead'); status = 'unlinked'; }
    else if (!isAdjacentToEmpire(state, w.id, who)) { reasons.push('No direct lane from your worlds'); status = 'unlinked'; }
    else if (isProtected(state, w.id, state.turn)) {
      reasons.push(`Capture protection through turn ${w.protectedUntil} — attackable turn ${w.protectedUntil + 1}`);
      status = 'protected';
    }
    if (reasons.length === 0) {
      if (emp.credits < cost.cr) reasons.push(`Needs ${cost.cr - emp.credits} more credits`);
      if (emp.mil < cost.mil) reasons.push(`Needs ${cost.mil - emp.mil} more military`);
    }
  }

  return { legal: reasons.length === 0, cost, reasons, status };
}

/** All targets for which `type` (with attr for develop) is currently legal. */
function legalTargets(state, who, type, attr) {
  const out = [];
  for (let id = 0; id < CFG.WORLD_COUNT; id++) {
    const st = orderStatus(state, who, { type, target: id, attr });
    if (st.legal) out.push(id);
  }
  return out;
}

/**
 * Resolve a committed order. Re-validates legality: an illegal order
 * spends nothing and returns { ok:false } (never consumes the turn).
 */
function resolveOrder(state, who, order) {
  if (state.over) return { ok: false, reason: 'match over' };
  const st = orderStatus(state, who, order);
  if (!st.legal) return { ok: false, reason: st.reasons.join('; ') };

  const emp = state.empires[who];
  const w = state.worlds[order.target];
  const name = worldLabel(order.target);
  emp.credits -= st.cost.cr;
  emp.mil -= st.cost.mil;

  const result = { ok: true, type: order.type, target: order.target, who, cost: st.cost };

  if (order.type === 'expand') {
    w.owner = who;
    pushLog(state, who === 'human' ? 'you' : 'rival',
      `${actorName(who)} expanded to ${name} — ${st.cost.cr} cr`);
  } else if (order.type === 'develop') {
    const attr = order.attr;
    w[attr] += 1;
    result.attr = attr;
    result.newLevel = w[attr];
    pushLog(state, who === 'human' ? 'you' : 'rival',
      `${actorName(who)} developed ${ATTR_NAME[attr]} on ${name} → ${w[attr]} — ${st.cost.cr} cr`);
  } else if (order.type === 'attack') {
    const prev = w.owner;
    w.owner = who;
    w.protectedUntil = state.turn + CFG.PROTECT_THROUGH_OFFSET;
    result.from = prev;
    result.protectedUntil = w.protectedUntil;
    const sur = blockadeActive(state.turn) ? ` (incl. +${CFG.BLOCKADE_SURCHARGE} blockade)` : '';
    pushLog(state, who === 'human' ? 'you' : 'rival',
      `${actorName(who)} captured ${name} — ${st.cost.cr} cr, ${st.cost.mil} mil${sur}. Shielded through turn ${w.protectedUntil}.`);
    if (worldCount(state, prev) === 0) {
      state.over = true;
      state.winner = who;
      state.endReason = 'elimination';
      pushLog(state, 'event', `${EMPIRES[prev].name} holds no worlds — ${EMPIRES[who].name} wins by elimination!`);
    }
  }
  return result;
}

/** Record a pass in the log (free, consumes the empire's opportunity). */
function logPass(state, who) {
  pushLog(state, who === 'human' ? 'you' : 'rival', `${actorName(who)} passed.`);
}

/* ------------------------------------------------------ EVENTS / RELAYS */

/**
 * Scheduled end-of-turn event. Returns descriptors for UI effects:
 *   turn 5 : relays awaken (+1E +1I, cap 5)
 *   turn 10: supernova warning (turn 11 pays zero Military)
 *   turn 15: blockade warning (attacks +8 mil on turns 16–19)
 *   turn 20: final scoring marker
 */
function endTurnEvent(state) {
  const t = state.turn;
  const out = [];
  if (t === CFG.RELAY_WAKE_TURN) {
    const changed = [];
    for (const id of CFG.RELAYS) {
      const w = state.worlds[id];
      const before = { e: w.e, i: w.i };
      w.e = Math.min(5, w.e + 1);
      w.i = Math.min(5, w.i + 1);
      changed.push({ id, before, after: { e: w.e, i: w.i } });
    }
    state.awakened = true;
    pushLog(state, 'event', `The ancient relays awaken — ${CFG.RELAYS.map(id => worldLabel(id)).join(' and ')} gain +1 Economy, +1 Industry (cap 5). Their power pays from turn ${t + 1}.`);
    out.push({ kind: 'wake', changed });
  } else if (t === CFG.SUPERNOVA_TURN - 1) {
    pushLog(state, 'event', `Supernova warning — a dying star goes dark. Turn ${CFG.SUPERNOVA_TURN} pays ZERO Military income to both empires (Credits unaffected).`);
    out.push({ kind: 'warn-supernova' });
  } else if (t === CFG.BLOCKADE_FROM - 1) {
    pushLog(state, 'event', `Blockade warning — rival corsairs mass at the lanes. Attacks cost +${CFG.BLOCKADE_SURCHARGE} Military on turns ${CFG.BLOCKADE_FROM}–${CFG.BLOCKADE_TO}.`);
    out.push({ kind: 'warn-blockade' });
  } else if (t === CFG.MAX_TURN) {
    pushLog(state, 'event', 'The galactic collapse begins — final tribute is banked, then the galaxy is scored.');
    out.push({ kind: 'final' });
  }
  return out;
}

/**
 * End-of-turn relay prestige: from turn 5 through turn 20 inclusive,
 * each owned relay awards its owner 2 banked prestige. Unowned relays
 * award nothing. Banked prestige stays with the earner after a flip.
 */
function awardRelayPrestige(state) {
  const awards = [];
  if (state.turn < CFG.RELAY_WAKE_TURN) return awards;
  for (const id of CFG.RELAYS) {
    const w = state.worlds[id];
    if (w.owner) {
      state.empires[w.owner].prestige += CFG.RELAY_PRESTIGE;
      awards.push({ id, who: w.owner, amount: CFG.RELAY_PRESTIGE });
      pushLog(state, 'event', `Relic tribute — ${actorName(w.owner)} +${CFG.RELAY_PRESTIGE} prestige from ${worldLabel(id)}.`);
    }
  }
  return awards;
}

/* -------------------------------------------------------------- SCORING */

/**
 * Planet value = 3 x owned-world count + sum(E+I+D on owned worlds)
 * Total prestige = planet value + banked relay prestige
 * Reserves do not score.
 */
function getScore(state, who) {
  const ws = ownedWorlds(state, who);
  let attrSum = 0;
  for (const w of ws) attrSum += w.e + w.i + w.d;
  const planetValue = 3 * ws.length + attrSum;
  const relicPrestige = state.empires[who].prestige;
  return { worlds: ws.length, planetValue, relicPrestige, total: planetValue + relicPrestige };
}

function finalStandings(state) {
  const human = getScore(state, 'human');
  const ai = getScore(state, 'ai');
  const winner = human.total > ai.total ? 'human' : ai.total > human.total ? 'ai' : 'draw';
  return { human, ai, winner };
}

/** Full turn start for the shared sequence (used by UI flow and tests). */
function beginTurn(state) {
  state.turn += 1;
  return payIncome(state);
}
