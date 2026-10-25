/* Void Empires — Blitz · rules engine (pure, deterministic, DOM-free) */
(function (root) {
  'use strict';

  const ROWS = 4, COLS = 5, N = ROWS * COLS;
  const HUMAN = 'human', AI = 'ai';
  const HOMES = { human: 5, ai: 14 };
  const RELAYS = [7, 12];
  const MAX_TURNS = 20;
  const ATTRS = ['e', 'i', 'd'];
  const ATTR_NAME = { e: 'Economy', i: 'Industry', d: 'Defense' };

  const PROFILES = {
    trade:   { key: 'trade',   name: 'Trade',   e: 3, i: 1, d: 1 },
    forge:   { key: 'forge',   name: 'Forge',   e: 1, i: 3, d: 1 },
    bastion: { key: 'bastion', name: 'Bastion', e: 1, i: 1, d: 3 },
  };
  const PROFILE_ORDER = ['trade', 'forge', 'bastion'];

  const NAMES = [
    'Ashfall', 'Corvid', 'Lumen', 'Tessera', 'Halcyon',
    'Nadir', 'Brine', 'Meridian I', 'Orrery', 'Kestrel',
    'Solace', 'Thule', 'Meridian II', 'Mirage', 'Vulcan',
    'Cinder', 'Pallas', 'Vesper', 'Zenith', 'Obsidian',
  ];

  function buildLinks() {
    const links = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS - 1; c++) links.push([r * COLS + c, r * COLS + c + 1]);
    for (let r = 0; r < ROWS - 1; r++) links.push([r * COLS, (r + 1) * COLS]);
    for (let r = 0; r < ROWS - 1; r++) links.push([r * COLS + COLS - 1, (r + 1) * COLS + COLS - 1]);
    links.push([7, 12]);
    return links;
  }
  const LINKS = buildLinks();
  const ADJ = Array.from({ length: N }, () => []);
  LINKS.forEach(([a, b]) => { ADJ[a].push(b); ADJ[b].push(a); });
  ADJ.forEach(list => list.sort((x, y) => x - y));

  // BFS hop distances between all worlds (static topology)
  const DIST = Array.from({ length: N }, (_, s) => {
    const d = new Array(N).fill(Infinity); d[s] = 0;
    const q = [s];
    while (q.length) { const u = q.shift(); for (const v of ADJ[u]) if (d[v] === Infinity) { d[v] = d[u] + 1; q.push(v); } }
    return d;
  });

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomSeed() { return (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0); }

  function profileSet(seed) {
    const rng = mulberry32(seed >>> 0);
    const out = new Array(N);
    for (let id = 0; id < N / 2; id++) {
      const p = PROFILE_ORDER[Math.floor(rng() * 3)];
      out[id] = p; out[N - 1 - id] = p;
    }
    out[0] = out[19] = 'forge';
    out[6] = out[13] = 'trade';
    return out;
  }

  const opponent = who => (who === HUMAN ? AI : HUMAN);

  function newGame(seed) {
    seed = seed >>> 0;
    const profiles = profileSet(seed);
    const worlds = [];
    for (let id = 0; id < N; id++) {
      const p = PROFILES[profiles[id]];
      const w = {
        id, name: NAMES[id], row: Math.floor(id / COLS), col: id % COLS,
        profile: p.key, e: p.e, i: p.i, d: p.d,
        owner: null, home: null, relay: RELAYS.includes(id), capturedTurn: null,
      };
      if (id === HOMES.human || id === HOMES.ai) {
        w.profile = 'home'; w.e = 3; w.i = 2; w.d = 2;
        w.home = id === HOMES.human ? HUMAN : AI; w.owner = w.home;
      }
      if (w.relay) { w.profile = 'relay'; w.e = 2; w.i = 2; w.d = 2; }
      worlds.push(w);
    }
    const s = {
      seed, turn: 0, worlds,
      empires: {
        human: { credits: 14, military: 0, prestige: 0, lastIncome: { credits: 0, military: 0 } },
        ai:    { credits: 14, military: 0, prestige: 0, lastIncome: { credits: 0, military: 0 } },
      },
      actor: null, initiative: null, acted: { human: false, ai: false },
      relaysAwake: false, over: false, result: null, log: [], seq: 0,
    };
    startTurn(s);
    return s;
  }

  function log(s, who, kind, text, extra) {
    s.log.push(Object.assign({ n: ++s.seq, turn: s.turn, who, kind, text }, extra || {}));
  }

  const owned = (s, who) => s.worlds.filter(w => w.owner === who);
  const worldCount = (s, who) => s.worlds.reduce((n, w) => n + (w.owner === who ? 1 : 0), 0);

  function baseIncome(s, who) {
    let e = 0, i = 0;
    for (const w of s.worlds) if (w.owner === who) { e += w.e; i += w.i; }
    return { credits: 2 * e, military: i };
  }
  function incomeForTurn(s, who, turn) {
    const b = baseIncome(s, who);
    return { credits: b.credits, military: turn === 11 ? 0 : b.military };
  }

  const blockadeSurcharge = turn => (turn >= 16 && turn <= 19 ? 8 : 0);
  const expandCost = (s, who) => 12 + 4 * worldCount(s, who);
  const DEVELOP_COST = 8;
  const ATTACK_CREDITS = 8;
  const attackMilitary = (d, turn) => 4 + 6 * d + blockadeSurcharge(turn);
  const isProtected = (w, turn) => w.capturedTurn !== null && turn <= w.capturedTurn + 1;
  const adjacentTo = (s, id, who) => ADJ[id].some(n => s.worlds[n].owner === who);

  function planetValue(s, who) {
    let v = 0;
    for (const w of s.worlds) if (w.owner === who) v += 3 + w.e + w.i + w.d;
    return v;
  }
  function score(s, who) {
    const pv = planetValue(s, who), rp = s.empires[who].prestige;
    return { planetValue: pv, relayPrestige: rp, total: pv + rp, worlds: worldCount(s, who) };
  }

  /**
   * Evaluate an order for `who` without mutating state.
   * order: { type: 'expand'|'develop'|'attack', target, attr? }
   * Returns { ok, reason, code, cost: {credits, military}, effect }
   */
  function checkOrder(s, who, order) {
    const res = { ok: false, reason: '', code: '', cost: { credits: 0, military: 0 }, effect: '' };
    if (!order || order.target === undefined || order.target === null) { res.reason = 'Select a world to target.'; res.code = 'target'; return res; }
    const w = s.worlds[order.target];
    if (!w) { res.reason = 'Unknown world.'; res.code = 'target'; return res; }
    const emp = s.empires[who];
    const foe = opponent(who);
    const fail = (code, reason) => Object.assign(res, { ok: false, code, reason });

    if (order.type === 'expand') {
      res.cost.credits = expandCost(s, who);
      res.effect = `Claim ${w.name} with E${w.e} · I${w.i} · D${w.d}. Future income +${2 * w.e} Credits, +${w.i} Military.`;
      if (w.owner === who) return fail('owner', 'You already own this world.');
      if (w.owner === foe) return fail('owner', 'Held by the rival — only Attack can take it.');
      if (!adjacentTo(s, w.id, who)) return fail('lane', 'No direct lane from any world you own.');
      if (emp.credits < res.cost.credits) return fail('funds', `Needs ${res.cost.credits} Credits — you have ${emp.credits}.`);
      res.ok = true; return res;
    }
    if (order.type === 'develop') {
      const attr = order.attr;
      res.cost.credits = DEVELOP_COST;
      if (!ATTRS.includes(attr)) return fail('attr', 'Choose an attribute to develop.');
      const lvl = w[attr];
      const gain = attr === 'e' ? '+2 Credits per turn' : attr === 'i' ? '+1 Military per turn' : `attack cost +6 Military (to ${attackMilitary(Math.min(5, lvl + 1), s.turn)})`;
      res.effect = `${ATTR_NAME[attr]} ${lvl} → ${Math.min(5, lvl + 1)} on ${w.name}: ${gain}, +1 planet value.`;
      if (w.owner !== who) return fail('owner', w.owner ? 'You can only develop your own worlds.' : 'Neutral world — Expand to claim it first.');
      if (lvl >= 5) return fail('cap', `${ATTR_NAME[attr]} is already at the maximum level 5.`);
      if (emp.credits < DEVELOP_COST) return fail('funds', `Needs ${DEVELOP_COST} Credits — you have ${emp.credits}.`);
      res.ok = true; return res;
    }
    if (order.type === 'attack') {
      res.cost.credits = ATTACK_CREDITS;
      res.cost.military = attackMilitary(w.d, s.turn);
      res.effect = `Seize ${w.name} with E${w.e} · I${w.i} · D${w.d} intact. Protected from recapture through turn ${s.turn + 1}.`;
      if (w.owner === who) return fail('owner', 'You already own this world.');
      if (w.owner === null) return fail('owner', 'Neutral world — use Expand instead.');
      if (!adjacentTo(s, w.id, who)) return fail('lane', 'No direct lane from any world you own.');
      if (isProtected(w, s.turn)) return fail('protected', `Capture-protected through turn ${w.capturedTurn + 1}; attackable on turn ${w.capturedTurn + 2}.`);
      const short = [];
      if (emp.credits < res.cost.credits) short.push(`${res.cost.credits} Credits (have ${emp.credits})`);
      if (emp.military < res.cost.military) short.push(`${res.cost.military} Military (have ${emp.military})`);
      if (short.length) return fail('funds', `Needs ${short.join(' and ')}.`);
      res.ok = true; return res;
    }
    return fail('type', 'Choose an order.');
  }

  function applyOrder(s, who, order) {
    const chk = checkOrder(s, who, order);
    if (!chk.ok) return chk;
    const emp = s.empires[who];
    const w = s.worlds[order.target];
    emp.credits -= chk.cost.credits;
    emp.military -= chk.cost.military;
    const label = `${String(w.id + 1).padStart(2, '0')} ${w.name}`;
    if (order.type === 'expand') {
      w.owner = who;
      log(s, who, 'expand', `colonized ${label} for ${chk.cost.credits} Credits.`, { target: w.id });
    } else if (order.type === 'develop') {
      w[order.attr] += 1;
      log(s, who, 'develop', `raised ${ATTR_NAME[order.attr]} on ${label} to ${w[order.attr]} (8 Credits).`, { target: w.id });
    } else if (order.type === 'attack') {
      const prev = w.owner;
      w.owner = who;
      w.capturedTurn = s.turn;
      log(s, who, 'attack', `captured ${label} for ${chk.cost.credits} Credits + ${chk.cost.military} Military.`, { target: w.id });
      if (worldCount(s, prev) === 0) {
        endMatch(s, who, 'elimination');
      }
    }
    return chk;
  }

  /** Main entry: the current actor performs an order or a pass. */
  function act(s, who, order) {
    if (s.over) return { ok: false, reason: 'The match is over.', code: 'over' };
    if (s.actor !== who) return { ok: false, reason: 'It is not your phase.', code: 'phase' };
    let res;
    if (!order || order.type === 'pass') {
      log(s, who, 'pass', 'passed.');
      res = { ok: true, pass: true, cost: { credits: 0, military: 0 } };
    } else {
      res = applyOrder(s, who, order);
      if (!res.ok) return res; // nothing spent, opportunity retained
    }
    s.acted[who] = true;
    if (s.over) { s.actor = null; return res; }
    const second = opponent(s.initiative);
    if (who === s.initiative) s.actor = second;
    else finishTurn(s);
    return res;
  }

  function startTurn(s) {
    s.turn += 1;
    for (const who of [HUMAN, AI]) {
      const inc = incomeForTurn(s, who, s.turn);
      s.empires[who].credits += inc.credits;
      s.empires[who].military += inc.military;
      s.empires[who].lastIncome = inc;
    }
    s.initiative = s.turn % 2 === 1 ? HUMAN : AI;
    s.actor = s.initiative;
    s.acted = { human: false, ai: false };
    if (s.turn === 11) log(s, null, 'event', 'Supernova shockwave: no Military income this turn.');
    if (s.turn === 16) log(s, null, 'event', 'Blockade in force: every Attack costs +8 Military through turn 19.');
    if (s.turn === 20) log(s, null, 'event', 'Blockade lifted. Final turn — the galaxy collapses after these orders.');
  }

  function resolveEvent(s) {
    if (s.turn === 5) {
      s.relaysAwake = true;
      for (const id of RELAYS) { const w = s.worlds[id]; w.e = Math.min(5, w.e + 1); w.i = Math.min(5, w.i + 1); }
      log(s, null, 'event', 'The Meridian relays awaken: +1 Economy and +1 Industry each. Relay prestige begins.');
    } else if (s.turn === 10) {
      log(s, null, 'event', 'Supernova warning: on turn 11 both empires receive zero Military income.');
    } else if (s.turn === 15) {
      log(s, null, 'event', 'Blockade warning: Attacks on turns 16–19 cost 8 extra Military.');
    } else if (s.turn === 20) {
      log(s, null, 'event', 'The void collapses. Final prestige is tallied.');
    }
  }

  function awardRelayPrestige(s) {
    if (s.turn < 5) return;
    for (const id of RELAYS) {
      const w = s.worlds[id];
      if (w.owner) {
        s.empires[w.owner].prestige += 2;
        log(s, w.owner, 'prestige', `banked 2 prestige from ${w.name}.`, { target: id });
      }
    }
  }

  function finishTurn(s) {
    s.actor = null;
    resolveEvent(s);
    awardRelayPrestige(s);
    if (s.turn >= MAX_TURNS) {
      const h = score(s, HUMAN).total, a = score(s, AI).total;
      endMatch(s, h > a ? HUMAN : a > h ? AI : 'draw', 'score');
      return;
    }
    startTurn(s);
  }

  function endMatch(s, winner, reason) {
    s.over = true; s.actor = null;
    s.result = { winner, reason, turn: s.turn, human: score(s, HUMAN), ai: score(s, AI) };
    log(s, null, 'end', reason === 'elimination'
      ? `${winner === HUMAN ? 'The rival' : 'Your empire'} has no worlds left. Match over.`
      : winner === 'draw' ? 'Final prestige is tied — a draw.' : `${winner === HUMAN ? 'You win' : 'The rival wins'} on final prestige.`);
  }

  /* ------------------------------ Rival AI ------------------------------ */

  function chooseAIAction(s) {
    const me = AI, foe = HUMAN;
    const legal = o => checkOrder(s, me, o).ok;
    const enemy = owned(s, foe);
    const mine = owned(s, me);

    // 1. Finish the human off
    if (enemy.length === 1 && legal({ type: 'attack', target: enemy[0].id })) return { type: 'attack', target: enemy[0].id, why: 'Eliminate the last enemy world' };

    // 2. Relays: capture a human-owned relay, else expand onto a neutral relay
    for (const id of RELAYS) if (s.worlds[id].owner === foe && legal({ type: 'attack', target: id })) return { type: 'attack', target: id, why: 'Seize a relay' };
    for (const id of RELAYS) if (s.worlds[id].owner === null && legal({ type: 'expand', target: id })) return { type: 'expand', target: id, why: 'Claim a relay' };

    // 3. Defend a threatened owned relay
    const hum = s.empires[foe];
    const nextTurn = s.turn + 1;
    for (const id of RELAYS) {
      const w = s.worlds[id];
      if (w.owner !== me || !adjacentTo(s, id, foe) || w.d >= 5) continue;
      if (isProtected(w, nextTurn)) continue;
      const before = attackMilitary(w.d, nextTurn), after = attackMilitary(w.d + 1, nextTurn);
      const canNow = hum.credits >= ATTACK_CREDITS && hum.military >= before;
      const canAfter = hum.credits >= ATTACK_CREDITS && hum.military >= after;
      if (canNow && !canAfter && legal({ type: 'develop', target: id, attr: 'd' })) return { type: 'develop', target: id, attr: 'd', why: 'Fortify a threatened relay' };
    }

    // 4. Best non-relay enemy capture
    let best = null;
    for (const w of enemy) {
      if (w.relay) continue;
      const o = { type: 'attack', target: w.id };
      const c = checkOrder(s, me, o);
      if (!c.ok) continue;
      const val = 3 + w.e + w.i + w.d;
      if (!best || val > best.val || (val === best.val && (c.cost.military < best.mil || (c.cost.military === best.mil && w.id < best.id))))
        best = { val, mil: c.cost.military, id: w.id };
    }
    if (best) return { type: 'attack', target: best.id, why: 'Capture a valuable enemy world' };

    // 5. Expansion
    const expandable = s.worlds.filter(w => w.owner === null && legal({ type: 'expand', target: w.id }));
    if (expandable.length) {
      for (const rid of RELAYS) {
        const r = s.worlds[rid];
        if (r.owner !== null || adjacentTo(s, rid, me)) continue;
        let pick = null;
        for (const w of expandable) {
          const d = DIST[w.id][rid];
          if (!pick || d < pick.d || (d === pick.d && w.id < pick.id)) pick = { d, id: w.id };
        }
        if (pick) return { type: 'expand', target: pick.id, why: 'Push toward a relay' };
      }
      let pick = null;
      for (const w of expandable) {
        const v = w.e + w.i;
        if (!pick || v > pick.v || (v === pick.v && (w.e > pick.e || (w.e === pick.e && w.id < pick.id)))) pick = { v, e: w.e, id: w.id };
      }
      return { type: 'expand', target: pick.id, why: 'Claim a productive world' };
    }

    // 6. Development
    const devFirst = attr => {
      for (const w of mine) if (legal({ type: 'develop', target: w.id, attr })) return { type: 'develop', target: w.id, attr };
      return null;
    };
    if (s.turn <= 16) {
      const pref = baseIncome(s, me).credits < 12 ? 'e' : 'i';
      const o = devFirst(pref) || devFirst(pref === 'e' ? 'i' : 'e');
      if (o) return Object.assign(o, { why: 'Grow the economy' });
    } else {
      for (const id of RELAYS) {
        const w = s.worlds[id];
        if (w.owner === me && adjacentTo(s, id, foe) && legal({ type: 'develop', target: id, attr: 'd' })) return { type: 'develop', target: id, attr: 'd', why: 'Fortify a frontier relay' };
      }
      for (const w of mine) for (const attr of ATTRS) if (legal({ type: 'develop', target: w.id, attr })) return { type: 'develop', target: w.id, attr, why: 'Final development' };
    }

    // 7. Pass
    return { type: 'pass', why: 'No legal order' };
  }

  function runAI(s) {
    if (s.over || s.actor !== AI) return null;
    const o = chooseAIAction(s);
    const res = act(s, AI, o);
    if (!res.ok) act(s, AI, { type: 'pass' });
    return o;
  }

  function nextEvent(turn) {
    const ev = [
      { turn: 5, key: 'awaken', title: 'Relay Awakening', when: 'End of turn 5', text: 'Both relays gain +1 Economy and +1 Industry. Relay holders bank 2 prestige every turn-end from now through turn 20.' },
      { turn: 10, key: 'supernova', title: 'Supernova', when: 'Turn 11', text: 'Both empires receive zero Military income on turn 11. Credits and stored Military are unaffected.' },
      { turn: 15, key: 'blockade', title: 'Blockade', when: 'Turns 16–19', text: 'Every Attack costs +8 Military on turns 16–19. Lifts before turn-20 orders.' },
      { turn: 20, key: 'collapse', title: 'Collapse', when: 'End of turn 20', text: 'Final relay prestige is awarded, then the galaxy is scored.' },
    ];
    return ev.find(e => e.turn >= turn) || null;
  }

  function activeEffects(turn) {
    const out = [];
    if (turn === 11) out.push({ key: 'supernova', title: 'Supernova', text: 'No Military income this turn.' });
    if (blockadeSurcharge(turn)) out.push({ key: 'blockade', title: 'Blockade', text: `Attacks cost +8 Military (through turn 19).` });
    if (turn >= 5) out.push({ key: 'relay', title: turn === 5 ? 'Relays awaken tonight' : 'Relays awake', text: 'Each held relay banks 2 prestige at turn end.' });
    return out;
  }

  const api = {
    ROWS, COLS, N, HUMAN, AI, HOMES, RELAYS, MAX_TURNS, LINKS, ADJ, DIST, ATTRS, ATTR_NAME, PROFILES, NAMES,
    mulberry32, randomSeed, profileSet, newGame, opponent, owned, worldCount, baseIncome, incomeForTurn,
    blockadeSurcharge, expandCost, attackMilitary, isProtected, adjacentTo, planetValue, score,
    checkOrder, act, chooseAIAction, runAI, nextEvent, activeEffects, DEVELOP_COST, ATTACK_CREDITS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VE = api;
})(typeof window !== 'undefined' ? window : globalThis);
