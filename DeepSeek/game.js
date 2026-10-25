/* Void Empires: Blitz — deterministic game engine
 * Pure logic, no DOM. Shared by the UI and the Node test harness.
 */
(function (root) {
  'use strict';

  const HUMAN = 0;
  const AI = 1;
  const NEUTRAL = -1;

  const CONFIG = Object.freeze({
    totalTurns: 20,
    humanHome: 5,
    aiHome: 14,
    relays: Object.freeze([7, 12]),
    startingCredits: 14,
    startingMilitary: 0,
    expandBase: 12,
    expandPerWorld: 4,
    developCost: 8,
    attackCredits: 8,
    attackBaseMilitary: 4,
    attackPerDefense: 6,
    blockadeExtra: 8,
    blockadeFrom: 16,
    blockadeTo: 19,
    militaryBlackoutTurn: 11,
    relayPrestige: 2,
    relayPrestigeFrom: 5,
    maxLevel: 5,
  });

  const PROFILES = Object.freeze({
    trade: { name: 'Trade', levels: { economy: 3, industry: 1, defense: 1 } },
    forge: { name: 'Forge', levels: { economy: 1, industry: 3, defense: 1 } },
    bastion: { name: 'Bastion', levels: { economy: 1, industry: 1, defense: 3 } },
  });
  const PROFILE_KEYS = ['trade', 'forge', 'bastion'];

  const ACTOR = Object.freeze({
    [HUMAN]: { name: 'Nadir Concord', short: 'NADIR', color: 'human' },
    [AI]: { name: 'Vulcan Ascendancy', short: 'VULCAN', color: 'rival' },
  });

  const WORLD_NAMES = [
    'Cinder', 'Vesper', 'Halcyon', 'Kestrel', 'Orpheus',
    'Nadir', 'Talos', 'Meridian I', 'Lyra', 'Erebus',
    'Sable', 'Aurora', 'Meridian II', 'Nimbus', 'Vulcan',
    'Vantage', 'Ember', 'Cassia', 'Helios', 'Drift',
  ];

  const HOME_NAMES = Object.freeze({
    [HUMAN]: 'Nadir',
    [AI]: 'Vulcan',
  });

  /* Fixed chart topology: 16 horizontal, 6 vertical (outer columns), 1 relay bridge. */
  const LINKS = (function buildLinks() {
    const links = [];
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        links.push([r * 5 + c, r * 5 + c + 1]);
      }
    }
    for (let r = 0; r < 3; r += 1) {
      links.push([r * 5, (r + 1) * 5]);
      links.push([r * 5 + 4, (r + 1) * 5 + 4]);
    }
    links.push([7, 12]);
    return Object.freeze(links.map((pair) => Object.freeze(pair)));
  })();

  const ADJACENCY = (function buildAdjacency() {
    const adj = Array.from({ length: 20 }, () => []);
    for (const [a, b] of LINKS) {
      adj[a].push(b);
      adj[b].push(a);
    }
    for (const list of adj) list.sort((x, y) => x - y);
    return adj.map((list) => Object.freeze(list));
  })();

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function displayNumber(id) {
    return pad2(id + 1);
  }

  function createWorld(id, profileKey, levels, owner, kind) {
    return {
      id,
      name: WORLD_NAMES[id],
      profile: profileKey,
      profileName: kind === 'relay' ? 'Ancient Relay' : kind === 'home' ? 'Capital World' : PROFILES[profileKey].name,
      kind,
      owner,
      levels: {
        economy: levels.economy,
        industry: levels.industry,
        defense: levels.defense,
      },
      baseLevels: { ...levels },
    };
  }

  function createGame(seedInput) {
    const seed = (Number(seedInput) >>> 0);
    const rng = mulberry32(seed);

    // One profile per rotational pair, then apply the brief's forced pairs.
    const pairProfiles = [];
    for (let pair = 0; pair < 10; pair += 1) {
      pairProfiles.push(PROFILE_KEYS[Math.floor(rng() * PROFILE_KEYS.length)]);
    }
    pairProfiles[0] = 'forge';   // IDs 0 and 19
    pairProfiles[6] = 'trade';   // IDs 6 and 13

    const worlds = [];
    for (let id = 0; id < 20; id += 1) {
      const profileKey = pairProfiles[Math.min(id, 19 - id)];
      let kind = 'standard';
      let owner = NEUTRAL;
      let levels = PROFILES[profileKey].levels;
      let actualProfile = profileKey;

      if (id === CONFIG.humanHome || id === CONFIG.aiHome) {
        kind = 'home';
        owner = id === CONFIG.humanHome ? HUMAN : AI;
        levels = { economy: 3, industry: 2, defense: 2 };
      } else if (CONFIG.relays.includes(id)) {
        kind = 'relay';
        owner = NEUTRAL;
        levels = { economy: 2, industry: 2, defense: 2 };
        actualProfile = 'bastion';
      }
      worlds.push(createWorld(id, actualProfile, levels, owner, kind));
    }

    const state = {
      seed,
      turn: 0,
      phase: 'setup', // setup | human | ai | ended
      initiative: HUMAN,
      worlds,
      credits: [CONFIG.startingCredits, CONFIG.startingCredits],
      military: [CONFIG.startingMilitary, CONFIG.startingMilitary],
      relayPrestige: [0, 0],
      protectedThrough: Array(20).fill(null),
      capturedOnTurn: Array(20).fill(null),
      relaysAwakened: false,
      selected: CONFIG.humanHome,
      staged: null,
      ended: false,
      winner: null,
      endReason: null,
      result: null,
      log: [],
      lastIncome: [null, null],
      events: [],
    };
    return state;
  }

  function actorName(player) {
    return ACTOR[player] ? ACTOR[player].name : 'Sector Command';
  }

  function addLog(state, actor, kind, text, worldId) {
    state.log.push({
      turn: state.turn,
      actor,
      kind,
      text,
      worldId: worldId === undefined ? null : worldId,
    });
    if (state.log.length > 80) state.log.shift();
  }

  function ownedWorlds(state, player) {
    return state.worlds.filter((w) => w.owner === player);
  }

  function ownedCount(state, player) {
    let n = 0;
    for (const w of state.worlds) if (w.owner === player) n += 1;
    return n;
  }

  function sumAttribute(state, player, attribute) {
    let total = 0;
    for (const w of state.worlds) {
      if (w.owner === player) total += w.levels[attribute];
    }
    return total;
  }

  function getIncome(state, player, turn) {
    const atTurn = turn === undefined ? state.turn : turn;
    return {
      credits: 2 * sumAttribute(state, player, 'economy'),
      military: atTurn === CONFIG.militaryBlackoutTurn ? 0 : sumAttribute(state, player, 'industry'),
      blackout: atTurn === CONFIG.militaryBlackoutTurn,
    };
  }

  function beginTurn(state) {
    if (state.ended) return { turn: state.turn, incomes: [] };
    state.turn += 1;
    state.initiative = state.turn % 2 === 1 ? HUMAN : AI;
    state.phase = state.initiative === HUMAN ? 'human' : 'ai';
    state.staged = null;
    state.events = [];

    const incomes = [];
    for (const player of [HUMAN, AI]) {
      const inc = getIncome(state, player, state.turn);
      state.credits[player] += inc.credits;
      state.military[player] += inc.military;
      state.lastIncome[player] = inc;
      incomes.push({ player, ...inc });
    }

    const incH = incomes[0];
    const incA = incomes[1];
    addLog(
      state,
      -1,
      'turn',
      `Turn ${pad2(state.turn)} · Income paid — ${ACTOR[HUMAN].short} +${incH.credits} C, +${incH.military} M · ${ACTOR[AI].short} +${incA.credits} C, +${incA.military} M${state.turn === CONFIG.militaryBlackoutTurn ? ' · military blackout' : ''}.`,
    );
    addLog(
      state,
      -1,
      'initiative',
      `${ACTOR[state.initiative].name} has initiative this turn.`,
    );
    return { turn: state.turn, incomes };
  }

  function adjacentWorlds(id) {
    return ADJACENCY[id];
  }

  function isAdjacentToPlayer(state, worldId, player) {
    return ADJACENCY[worldId].some((id) => state.worlds[id].owner === player);
  }

  function expansionCost(state, player) {
    return CONFIG.expandBase + CONFIG.expandPerWorld * ownedCount(state, player);
  }

  function blockadeActive(turn) {
    return turn >= CONFIG.blockadeFrom && turn <= CONFIG.blockadeTo;
  }

  function attackCost(state, targetId, turn) {
    const atTurn = turn === undefined ? state.turn : turn;
    const target = state.worlds[targetId];
    const base = CONFIG.attackBaseMilitary + CONFIG.attackPerDefense * target.levels.defense;
    return {
      credits: CONFIG.attackCredits,
      military: base + (blockadeActive(atTurn) ? CONFIG.blockadeExtra : 0),
      baseMilitary: base,
      blockade: blockadeActive(atTurn) ? CONFIG.blockadeExtra : 0,
    };
  }

  function isProtected(state, worldId, turn) {
    const atTurn = turn === undefined ? state.turn : turn;
    const through = state.protectedThrough[worldId];
    return through !== null && atTurn <= through;
  }

  function protectionInfo(state, worldId) {
    const through = state.protectedThrough[worldId];
    if (through === null) return null;
    return {
      protectedThrough: through,
      firstAttackable: through + 1,
      protectedNow: state.turn <= through,
    };
  }

  function getOrderCost(state, player, type, targetId, attribute) {
    if (type === 'expand') return { credits: expansionCost(state, player), military: 0 };
    if (type === 'develop') return { credits: CONFIG.developCost, military: 0 };
    if (type === 'attack') return attackCost(state, targetId);
    return { credits: 0, military: 0 };
  }

  /**
   * Shared legality function. Returns a stable reason code, a human-readable
   * reason, and the exact price so the UI and AI never diverge.
   */
  function legalOrder(state, player, type, targetId, attribute) {
    const enemy = player === HUMAN ? AI : HUMAN;
    const cost = getOrderCost(state, player, type, targetId, attribute);
    const fail = (code, reason, extra) => ({ legal: false, code, reason, cost, ...extra });
    const ok = (extra) => ({ legal: true, code: 'OK', reason: '', cost, ...extra });

    if (state.ended) return fail('ENDED', 'The campaign has ended.');
    if (!Number.isInteger(targetId) || targetId < 0 || targetId > 19) {
      return fail('NO_TARGET', 'Select a world first.');
    }
    const target = state.worlds[targetId];

    if (type === 'expand') {
      if (target.owner !== NEUTRAL) {
        return fail('NOT_NEUTRAL', target.owner === player ? 'You already hold this world.' : 'This world is held by the rival.');
      }
      if (!isAdjacentToPlayer(state, targetId, player)) {
        return fail('NOT_CONNECTED', 'No direct lane from your territory.');
      }
      if (state.credits[player] < cost.credits) {
        return fail('INSUFFICIENT_CREDITS', `Need ${cost.credits} C — you have ${state.credits[player]} C.`);
      }
      return ok();
    }

    if (type === 'develop') {
      if (target.owner !== player) {
        return fail('NOT_OWNED', 'You must own this world to develop it.');
      }
      if (!['economy', 'industry', 'defense'].includes(attribute)) {
        return fail('NO_ATTRIBUTE', 'Choose Economy, Industry, or Defense.');
      }
      if (target.levels[attribute] >= CONFIG.maxLevel) {
        return fail('MAX_LEVEL', `${attribute[0].toUpperCase() + attribute.slice(1)} is already level 5.`);
      }
      if (state.credits[player] < cost.credits) {
        return fail('INSUFFICIENT_CREDITS', `Need ${cost.credits} C — you have ${state.credits[player]} C.`);
      }
      return ok({ attribute, fromLevel: target.levels[attribute], toLevel: target.levels[attribute] + 1 });
    }

    if (type === 'attack') {
      if (target.owner !== enemy) {
        return fail('NOT_ENEMY', target.owner === NEUTRAL ? 'Neutral worlds must be colonized, not attacked.' : 'You already hold this world.');
      }
      if (!isAdjacentToPlayer(state, targetId, player)) {
        return fail('NOT_CONNECTED', 'No direct lane from your territory.');
      }
      if (isProtected(state, targetId)) {
        const info = protectionInfo(state, targetId);
        return fail('PROTECTED', `Capture-protected through turn ${pad2(info.protectedThrough)}. First attackable turn ${pad2(info.firstAttackable)}.`);
      }
      if (state.credits[player] < cost.credits) {
        return fail('INSUFFICIENT_CREDITS', `Need ${cost.credits} C — you have ${state.credits[player]} C.`);
      }
      if (state.military[player] < cost.military) {
        return fail('INSUFFICIENT_MILITARY', `Need ${cost.military} M — you have ${state.military[player]} M.`);
      }
      return ok();
    }

    return fail('UNKNOWN_ORDER', 'Unknown order.');
  }

  function applyCaptureProtection(state, worldId) {
    state.capturedOnTurn[worldId] = state.turn;
    state.protectedThrough[worldId] = state.turn + 1;
  }

  function checkElimination(state) {
    if (state.ended) return;
    for (const player of [HUMAN, AI]) {
      if (ownedCount(state, player) === 0) {
        state.ended = true;
        state.phase = 'ended';
        state.winner = player === HUMAN ? AI : HUMAN;
        state.endReason = 'elimination';
        state.result = buildResult(state, { reason: 'elimination', winner: state.winner });
        addLog(
          state,
          state.winner,
          'elimination',
          `${ACTOR[state.winner].name} eliminates ${ACTOR[player].name}. The campaign ends immediately.`,
        );
        return;
      }
    }
  }

  function resolveOrder(state, player, order) {
    const type = order && order.type;
    const targetId = order && order.targetId;
    const attribute = order && order.attribute;
    const check = legalOrder(state, player, type, targetId, attribute);
    if (!check.legal) {
      return { ok: false, code: check.code, reason: check.reason, check };
    }

    const target = state.worlds[targetId];
    const before = {
      owner: target.owner,
      levels: { ...target.levels },
    };

    if (type === 'expand') {
      state.credits[player] -= check.cost.credits;
      target.owner = player;
      state.protectedThrough[targetId] = null;
      state.capturedOnTurn[targetId] = null;
      addLog(
        state,
        player,
        'expand',
        `${ACTOR[player].short} colonized ${target.name} (${displayNumber(target.id)}) for ${check.cost.credits} C.`,
        targetId,
      );
    } else if (type === 'develop') {
      state.credits[player] -= check.cost.credits;
      target.levels[attribute] += 1;
      addLog(
        state,
        player,
        'develop',
        `${ACTOR[player].short} developed ${attribute} on ${target.name} (${displayNumber(target.id)}) to Lv ${target.levels[attribute]} for ${check.cost.credits} C.`,
        targetId,
      );
    } else if (type === 'attack') {
      state.credits[player] -= check.cost.credits;
      state.military[player] -= check.cost.military;
      const defender = target.owner;
      target.owner = player;
      applyCaptureProtection(state, targetId);
      addLog(
        state,
        player,
        'attack',
        `${ACTOR[player].short} captured ${target.name} (${displayNumber(target.id)}) from ${ACTOR[defender].short} for ${check.cost.credits} C and ${check.cost.military} M. Protected through T${pad2(state.turn + 1)}.`,
        targetId,
      );
      checkElimination(state);
    }

    return {
      ok: true,
      order: { type, targetId, attribute, player },
      cost: check.cost,
      before,
      after: { owner: target.owner, levels: { ...target.levels } },
      ended: state.ended,
    };
  }

  function recordPass(state, player) {
    addLog(state, player, 'pass', `${ACTOR[player].short} passed.`, null);
    return { ok: true };
  }

  function relayAward(state) {
    let total = 0;
    const awards = [];
    for (const id of CONFIG.relays) {
      const relay = state.worlds[id];
      if (relay.owner === HUMAN || relay.owner === AI) {
        state.relayPrestige[relay.owner] += CONFIG.relayPrestige;
        total += CONFIG.relayPrestige;
        awards.push({ id, player: relay.owner, amount: CONFIG.relayPrestige });
      }
    }
    if (awards.length > 0) {
      const text = awards
        .map((a) => `${ACTOR[a.player].short} +${a.amount} prestige at ${state.worlds[a.id].name}`)
        .join(' · ');
      addLog(state, -1, 'prestige', `Relay dividend — ${text}.`, null);
    }
    return { total, awards };
  }

  function awakenRelays(state) {
    const awakened = [];
    for (const id of CONFIG.relays) {
      const relay = state.worlds[id];
      relay.levels.economy = Math.min(CONFIG.maxLevel, relay.levels.economy + 1);
      relay.levels.industry = Math.min(CONFIG.maxLevel, relay.levels.industry + 1);
      awakened.push(id);
    }
    state.relaysAwakened = true;
    addLog(
      state,
      -1,
      'event',
      'Relay awakening — Meridian I and Meridian II each gain +1 Economy and +1 Industry. Their first dividend is paid now.',
    );
    addLog(state, -1, 'event', 'Relay grid online. Higher relay production first pays on turn 06.');
    return awakened;
  }

  /**
   * Resolve everything scheduled for the end of the current shared turn.
   * Does not start the next turn (the UI paces that).
   */
  function finishTurn(state) {
    if (state.ended) return { events: [], result: state.result };
    const events = [];

    if (state.turn === 5) {
      const ids = awakenRelays(state);
      events.push({
        kind: 'relay-awakening',
        title: 'Relays awaken',
        text: 'Meridian I and Meridian II gain +1 Economy and +1 Industry. First relay dividend paid.',
        ids,
      });
    }

    if (state.turn === 10) {
      addLog(
        state,
        -1,
        'warning',
        'Supernova warning — turn 11 Military income will be suppressed for both empires. Credits and existing reserves are unaffected.',
      );
      events.push({
        kind: 'warning',
        title: 'Supernova warning',
        text: 'Turn 11: both empires receive zero Military income. Credit income continues.',
      });
    }

    if (state.turn === 15) {
      addLog(
        state,
        -1,
        'warning',
        'Blockade warning — attacks during turns 16–19 cost 8 additional Military. The surcharge lifts on turn 20.',
      );
      events.push({
        kind: 'warning',
        title: 'Blockade forecast',
        text: 'Turns 16–19: every assault costs +8 Military. The blockade lifts before turn-20 orders.',
      });
    }

    let prestige = null;
    if (state.turn >= CONFIG.relayPrestigeFrom) {
      prestige = relayAward(state);
      if (prestige.total > 0) {
        events.push({
          kind: 'prestige',
          title: 'Relay dividend',
          text: prestige.awards
            .map((a) => `${ACTOR[a.player].short} +${a.amount} prestige · ${state.worlds[a.id].name}`)
            .join(' · '),
          awards: prestige.awards,
        });
      }
    }

    if (state.turn >= CONFIG.totalTurns) {
      state.ended = true;
      state.phase = 'ended';
      const result = buildResult(state, { reason: 'score', winner: null });
      state.result = result;
      state.winner = result.winner;
      state.endReason = 'score';
      addLog(state, -1, 'end', 'The sector collapses. Final prestige is tallied.');
      return { events, result, prestige };
    }

    state.phase = 'between';
    return { events, result: null, prestige };
  }

  function getScore(state, player) {
    const worlds = ownedWorlds(state, player);
    const count = worlds.length;
    let attributes = 0;
    for (const w of worlds) attributes += w.levels.economy + w.levels.industry + w.levels.defense;
    const planetValue = 3 * count + attributes;
    const relayPrestige = state.relayPrestige[player];
    return {
      player,
      worldCount: count,
      attributeSum: attributes,
      planetValue,
      relayPrestige,
      total: planetValue + relayPrestige,
      credits: state.credits[player],
      military: state.military[player],
    };
  }

  function buildResult(state, options) {
    const opts = options || {};
    const scores = [getScore(state, HUMAN), getScore(state, AI)];
    let winner = opts.winner;
    if (winner === undefined || winner === null) {
      if (scores[0].total > scores[1].total) winner = HUMAN;
      else if (scores[1].total > scores[0].total) winner = AI;
      else winner = 'draw';
    }
    return {
      scores,
      winner,
      reason: opts.reason || 'score',
      turn: state.turn,
      seed: state.seed,
    };
  }

  function graphDistances(source) {
    const dist = Array(20).fill(Infinity);
    dist[source] = 0;
    const queue = [source];
    while (queue.length) {
      const cur = queue.shift();
      for (const next of ADJACENCY[cur]) {
        if (dist[next] === Infinity) {
          dist[next] = dist[cur] + 1;
          queue.push(next);
        }
      }
    }
    return dist;
  }

  function legalDevelopActions(state, player, attribute) {
    const orders = [];
    for (let id = 0; id < 20; id += 1) {
      const check = legalOrder(state, player, 'develop', id, attribute);
      if (check.legal) orders.push({ type: 'develop', targetId: id, attribute });
    }
    return orders;
  }

  function legalAttacks(state, player) {
    const actions = [];
    for (let id = 0; id < 20; id += 1) {
      const target = state.worlds[id];
      if (target.owner === (player === HUMAN ? AI : HUMAN)) {
        const check = legalOrder(state, player, 'attack', id);
        if (check.legal) {
          actions.push({
            type: 'attack',
            targetId: id,
            cost: check.cost,
            value: 3 + target.levels.economy + target.levels.industry + target.levels.defense,
          });
        }
      }
    }
    return actions;
  }

  function legalExpands(state, player) {
    const actions = [];
    for (let id = 0; id < 20; id += 1) {
      if (state.worlds[id].owner !== NEUTRAL) continue;
      const check = legalOrder(state, player, 'expand', id);
      if (check.legal) actions.push({ type: 'expand', targetId: id, cost: check.cost });
    }
    return actions;
  }

  /**
   * Deterministic rival policy, exactly following the public priority list.
   * Returns { order, rationale } or { order: null, rationale } for a pass.
   */
  function chooseAIAction(state) {
    const me = AI;
    const you = HUMAN;
    const turn = state.turn;
    const order = (o, rationale) => ({ order: o, rationale });
    const pass = (rationale) => ({ order: null, rationale });

    // 1. Capture the human's final world if legal.
    const playerWorlds = ownedWorlds(state, you);
    if (playerWorlds.length === 1) {
      const finalWorld = playerWorlds[0];
      if (legalOrder(state, me, 'attack', finalWorld.id).legal) {
        return order({ type: 'attack', targetId: finalWorld.id }, 'Eliminate the rival\u2019s final world.');
      }
    }

    // 2. Relay priority: capture a human relay, else colonize a neutral one.
    for (const relayId of CONFIG.relays) {
      if (state.worlds[relayId].owner === you && legalOrder(state, me, 'attack', relayId).legal) {
        return order({ type: 'attack', targetId: relayId }, 'Seize the rival-held relay.');
      }
    }
    for (const relayId of CONFIG.relays) {
      if (state.worlds[relayId].owner === NEUTRAL && legalOrder(state, me, 'expand', relayId).legal) {
        return order({ type: 'expand', targetId: relayId }, 'Claim the neutral relay.');
      }
    }

    // 3. Fortify an owned relay when the human can pay this turn but not after the upgrade.
    for (const relayId of CONFIG.relays) {
      const relay = state.worlds[relayId];
      if (relay.owner !== me) continue;
      if (!isAdjacentToPlayer(state, relayId, you)) continue;
      const nextTurn = turn + 1;
      if (isProtected(state, relayId, nextTurn)) continue;
      if (relay.levels.defense >= CONFIG.maxLevel) continue;
      const before = attackCost(state, relayId, nextTurn);
      const afterMilitary = before.baseMilitary + CONFIG.attackPerDefense;
      const humanCanPayBefore = state.credits[you] >= before.credits && state.military[you] >= before.military;
      const humanCanPayAfter = state.credits[you] >= before.credits && state.military[you] >= afterMilitary;
      if (humanCanPayBefore && !humanCanPayAfter) {
        if (legalOrder(state, me, 'develop', relayId, 'defense').legal) {
          return order({ type: 'develop', targetId: relayId, attribute: 'defense' }, 'Fortify the relay outside the rival\u2019s reach.');
        }
      }
    }

    // 4. Capture the highest-value legal non-relay enemy world.
    const attacks = legalAttacks(state, me).filter((a) => !CONFIG.relays.includes(a.targetId));
    if (attacks.length > 0) {
      attacks.sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        if (a.cost.military !== b.cost.military) return a.cost.military - b.cost.military;
        return a.targetId - b.targetId;
      });
      return order({ type: 'attack', targetId: attacks[0].targetId }, 'Take the highest-value rival world within reach.');
    }

    // 5. Expand toward a neutral relay that is not already adjacent; otherwise best neutral world.
    const expands = legalExpands(state, me);
    if (expands.length > 0) {
      const neutralRelays = CONFIG.relays.filter((id) => state.worlds[id].owner === NEUTRAL);
      const distantRelays = neutralRelays.filter((id) => !isAdjacentToPlayer(state, id, me));
      if (distantRelays.length > 0) {
        const relayTarget = distantRelays[0];
        const dist = graphDistances(relayTarget);
        expands.sort((a, b) => {
          if (dist[a.targetId] !== dist[b.targetId]) return dist[a.targetId] - dist[b.targetId];
          const wa = state.worlds[a.targetId];
          const wb = state.worlds[b.targetId];
          const sa = wa.levels.economy + wa.levels.industry;
          const sb = wb.levels.economy + wb.levels.industry;
          if (sb !== sa) return sb - sa;
          if (wb.levels.economy !== wa.levels.economy) return wb.levels.economy - wa.levels.economy;
          return a.targetId - b.targetId;
        });
        return order({ type: 'expand', targetId: expands[0].targetId }, 'Push toward the neutral relay.');
      }
      expands.sort((a, b) => {
        const wa = state.worlds[a.targetId];
        const wb = state.worlds[b.targetId];
        const sa = wa.levels.economy + wa.levels.industry;
        const sb = wb.levels.economy + wb.levels.industry;
        if (sb !== sa) return sb - sa;
        if (wb.levels.economy !== wa.levels.economy) return wb.levels.economy - wa.levels.economy;
        return a.targetId - b.targetId;
      });
      return order({ type: 'expand', targetId: expands[0].targetId }, 'Claim the strongest available neutral world.');
    }

    // 6. Development policy.
    if (turn <= 16) {
      const creditIncome = 2 * sumAttribute(state, me, 'economy');
      const preferred = creditIncome < 12 ? 'economy' : 'industry';
      const other = preferred === 'economy' ? 'industry' : 'economy';
      let options = legalDevelopActions(state, me, preferred);
      if (options.length === 0) options = legalDevelopActions(state, me, other);
      if (options.length > 0) {
        options.sort((a, b) => a.targetId - b.targetId);
        return order(
          { type: 'develop', targetId: options[0].targetId, attribute: options[0].attribute },
          preferred === 'economy' ? 'Raise Credit income.' : 'Raise Military production.',
        );
      }
    } else {
      // 17–20: fortify a relay bordering the human, else the first legal development.
      for (const relayId of CONFIG.relays) {
        if (state.worlds[relayId].owner !== me) continue;
        if (!isAdjacentToPlayer(state, relayId, you)) continue;
        if (legalOrder(state, me, 'develop', relayId, 'defense').legal) {
          return order({ type: 'develop', targetId: relayId, attribute: 'defense' }, 'Fortify the relay for the final tally.');
        }
      }
      for (let id = 0; id < 20; id += 1) {
        for (const attribute of ['economy', 'industry', 'defense']) {
          if (legalOrder(state, me, 'develop', id, attribute).legal) {
            return order({ type: 'develop', targetId: id, attribute }, 'Improve a final world for the collapse tally.');
          }
        }
      }
    }

    // 7. Pass.
    return pass('No legal or affordable order remains.');
  }

  function nextScheduledEvent(state) {
    const t = state.turn;
    if (t < 5 || (t === 5 && !state.relaysAwakened)) {
      return {
        turn: 5,
        title: 'Relay awakening',
        detail: 'Both relays gain +1 Economy and +1 Industry. The first 2 prestige per held relay is awarded.',
        tag: 'END OF TURN 05',
      };
    }
    if (t >= 5 && t < 10) {
      return {
        turn: 10,
        title: 'Supernova warning',
        detail: 'A warning is issued. On turn 11 both empires receive zero Military income; Credits are unaffected.',
        tag: 'END OF TURN 10',
      };
    }
    if (t === 10) {
      return {
        turn: 11,
        title: 'Military blackout',
        detail: 'Turn 11 pays zero Military income to both empires. Existing Military and all Credit income remain.',
        tag: 'TURN 11',
      };
    }
    if (t === 11) {
      return {
        turn: 15,
        title: 'Blockade warning',
        detail: 'A warning is issued. Attacks on turns 16–19 cost 8 extra Military; the blockade lifts on turn 20.',
        tag: 'END OF TURN 15',
      };
    }
    if (t >= 12 && t < 15) {
      return {
        turn: 15,
        title: 'Blockade warning',
        detail: 'A warning is issued. Attacks on turns 16–19 cost 8 extra Military; the blockade lifts on turn 20.',
        tag: 'END OF TURN 15',
      };
    }
    if (t === 15) {
      return {
        turn: 16,
        title: 'Blockade begins',
        detail: 'Turns 16–19: every Attack costs +8 Military. The surcharge lifts before turn-20 orders.',
        tag: 'TURN 16',
      };
    }
    if (t >= 16 && t <= 19) {
      return {
        turn: 20,
        title: 'Sector collapse',
        detail: 'Final relay dividends are paid, then planet value and banked relay prestige decide the match.',
        tag: 'END OF TURN 20',
      };
    }
    return {
      turn: 20,
      title: 'Sector collapse',
      detail: 'The final relay dividend is paid before scoring. Highest total prestige claims the sector.',
      tag: 'FINAL TURN',
    };
  }

  const api = {
    HUMAN,
    AI,
    NEUTRAL,
    CONFIG,
    LINKS,
    ADJACENCY,
    PROFILES,
    ACTOR,
    WORLD_NAMES,
    createGame,
    mulberry32,
    displayNumber,
    pad2,
    actorName,
    addLog,
    ownedWorlds,
    ownedCount,
    sumAttribute,
    getIncome,
    beginTurn,
    adjacentWorlds,
    isAdjacentToPlayer,
    expansionCost,
    attackCost,
    blockadeActive,
    isProtected,
    protectionInfo,
    getOrderCost,
    legalOrder,
    resolveOrder,
    recordPass,
    finishTurn,
    relayAward,
    getScore,
    buildResult,
    checkElimination,
    chooseAIAction,
    graphDistances,
    nextScheduledEvent,
  };

  root.VoidEmpires = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
