// Generated from src/ by npm run bundle. Commit this file for no-build hosting.
(() => {
  // src/engine.js
  var HUMAN = "human";
  var AI = "ai";
  var RELAYS = [7, 12];
  var ATTRIBUTES = ["economy", "industry", "defense"];
  var NAMES = ["Altair", "Vesper", "Caldera", "Oberon", "Lyra", "Nadir", "Solis", "Meridian I", "Eos", "Orion", "Cinder", "Astraea", "Meridian II", "Aurelia", "Vulcan", "Talos", "Nyx", "Elara", "Hesper", "Zenith"];
  var LINKS = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) LINKS.push([row * 5 + col, row * 5 + col + 1]);
  for (let row = 0; row < 3; row++) for (const col of [0, 4]) LINKS.push([row * 5 + col, (row + 1) * 5 + col]);
  LINKS.push([7, 12]);
  function mulberry32(seed) {
    return () => {
      let t = seed += 1831565813;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function freshSeed(previous) {
    let seed;
    do {
      seed = globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    } while (seed === previous);
    return seed;
  }
  function createGame(seed = 740218) {
    const random = mulberry32(seed);
    const profiles = [
      { profile: "Trade", economy: 3, industry: 1, defense: 1 },
      { profile: "Forge", economy: 1, industry: 3, defense: 1 },
      { profile: "Bastion", economy: 1, industry: 1, defense: 3 }
    ];
    const worlds = Array.from({ length: 20 }, (_, id) => ({ id, name: NAMES[id], owner: null, relay: RELAYS.includes(id), home: id === 5 ? HUMAN : id === 14 ? AI : null, capturedTurn: null }));
    for (let id = 0; id < 10; id++) {
      const profile = profiles[Math.floor(random() * 3)];
      Object.assign(worlds[id], profile);
      Object.assign(worlds[19 - id], profile);
    }
    for (const id of [0, 19]) Object.assign(worlds[id], profiles[1]);
    for (const id of [6, 13]) Object.assign(worlds[id], profiles[0]);
    for (const id of [5, 14]) Object.assign(worlds[id], { profile: "Homeworld", economy: 3, industry: 2, defense: 2, owner: id === 5 ? HUMAN : AI });
    for (const id of RELAYS) Object.assign(worlds[id], { profile: "Ancient relay", economy: 2, industry: 2, defense: 2 });
    const empire = () => ({ credits: 14, military: 0, relayPrestige: 0 });
    const game2 = { seed: seed >>> 0, turn: 1, phase: HUMAN, worlds, empires: { human: empire(), ai: empire() }, log: [], result: null, orders: [], logID: 0 };
    record(game2, "The chart is open. Your story begins at Nadir.", "event");
    startTurn(game2);
    return game2;
  }
  function owned(game2, actor) {
    return game2.worlds.filter((w) => w.owner === actor);
  }
  function neighbors(id) {
    return LINKS.flatMap(([a, b]) => a === id ? [b] : b === id ? [a] : []);
  }
  function adjacent(game2, actor, id) {
    return neighbors(id).some((n) => game2.worlds[n].owner === actor);
  }
  function income(game2, actor, turn = game2.turn) {
    const worlds = owned(game2, actor);
    return { credits: worlds.reduce((n, w) => n + w.economy * 2, 0), military: turn === 11 ? 0 : worlds.reduce((n, w) => n + w.industry, 0) };
  }
  function score(game2, actor) {
    const worlds = owned(game2, actor);
    const planet = worlds.reduce((n, w) => n + 3 + w.economy + w.industry + w.defense, 0);
    const relay = game2.empires[actor].relayPrestige;
    return { total: planet + relay, planet, relay, worlds: worlds.length };
  }
  function surcharge(turn) {
    return turn >= 16 && turn <= 19 ? 8 : 0;
  }
  function attackCost(world, turn) {
    return 4 + 6 * world.defense + surcharge(turn);
  }
  function protectedWorld(world, turn) {
    return world.capturedTurn !== null && turn <= world.capturedTurn + 1;
  }
  function orderCost(game2, actor, order) {
    if (order.type === "expand") return { credits: 12 + 4 * owned(game2, actor).length, military: 0 };
    if (order.type === "attack") return { credits: 8, military: game2.worlds[order.target] ? attackCost(game2.worlds[order.target], game2.turn) : 0 };
    if (order.type === "develop") return { credits: 8, military: 0 };
    return { credits: 0, military: 0 };
  }
  function legality(game2, actor, order) {
    if (game2.result) return { ok: false, reason: "This expedition has ended." };
    if (order?.type === "pass") return { ok: true, reason: "Save your reserves for the next turn." };
    if (!order || !["expand", "develop", "attack"].includes(order.type)) return { ok: false, reason: "Choose an order to prepare it." };
    const w = game2.worlds[order.target];
    if (!w) return { ok: false, reason: "Select a world on the chart." };
    if (order.type === "expand") {
      if (w.owner) return { ok: false, reason: "Only unclaimed worlds can be colonized." };
      if (!adjacent(game2, actor, w.id)) return { ok: false, reason: "No direct lane from your territory." };
    }
    if (order.type === "develop") {
      if (w.owner !== actor) return { ok: false, reason: "You can only develop your own worlds." };
      if (!ATTRIBUTES.includes(order.attribute)) return { ok: false, reason: "Choose an attribute to develop." };
      if (w[order.attribute] >= 5) return { ok: false, reason: "This attribute is already at level 5." };
    }
    if (order.type === "attack") {
      if (!w.owner || w.owner === actor) return { ok: false, reason: "Choose a rival-owned world to attack." };
      if (!adjacent(game2, actor, w.id)) return { ok: false, reason: "No direct lane from your territory." };
      if (protectedWorld(w, game2.turn)) return { ok: false, reason: `Capture protection through turn ${w.capturedTurn + 1}. Attackable on turn ${w.capturedTurn + 2}.` };
    }
    const cost = orderCost(game2, actor, order);
    const reserve = game2.empires[actor];
    const shortages = [];
    if (reserve.credits < cost.credits) shortages.push(`${cost.credits - reserve.credits} more Credits`);
    if (reserve.military < cost.military) shortages.push(`${cost.military - reserve.military} more Military`);
    if (shortages.length) return { ok: false, reason: `Requires ${shortages.join(" and ")}.` };
    return { ok: true, reason: "Ready to commit. Outcome is guaranteed." };
  }
  function record(game2, text, kind, actor = null) {
    game2.log.unshift({ id: ++game2.logID, turn: game2.turn, text, kind, actor });
  }
  function resolveOrder(game2, actor, order) {
    const check = legality(game2, actor, order);
    if (!check.ok) return check;
    const cost = orderCost(game2, actor, order);
    const empire = game2.empires[actor];
    empire.credits -= cost.credits;
    empire.military -= cost.military;
    const name = actor === HUMAN ? "You" : "The Vesper Union";
    const w = game2.worlds[order.target];
    if (order.type === "expand") {
      w.owner = actor;
      w.capturedTurn = null;
      record(game2, `${name} claimed ${w.name}.`, "expand", actor);
    } else if (order.type === "develop") {
      w[order.attribute]++;
      record(game2, `${name} developed ${w.name} \xB7 ${order.attribute} ${w[order.attribute]}.`, "develop", actor);
    } else if (order.type === "attack") {
      w.owner = actor;
      w.capturedTurn = game2.turn;
      record(game2, `${name} captured ${w.name} \xB7 ${cost.military} Military.`, "attack", actor);
    } else record(game2, `${name} passed, preserving reserves.`, "pass", actor);
    game2.orders.push({ turn: game2.turn, actor, ...order });
    if (order.type === "attack" && owned(game2, actor === HUMAN ? AI : HUMAN).length === 0) endGame(game2, "elimination", actor);
    return { ok: true };
  }
  function distance(from, target) {
    const queue = [[from, 0]];
    const seen = /* @__PURE__ */ new Set([from]);
    for (let i = 0; i < queue.length; i++) {
      const [id, d] = queue[i];
      if (id === target) return d;
      for (const next of neighbors(id)) if (!seen.has(next)) {
        seen.add(next);
        queue.push([next, d + 1]);
      }
    }
    return Infinity;
  }
  function chooseAIAction(game2) {
    const options = [];
    for (const w of game2.worlds) {
      for (const type of ["attack", "expand"]) {
        const order = { type, target: w.id };
        if (legality(game2, AI, order).ok) options.push(order);
      }
      for (const attribute2 of ATTRIBUTES) {
        const order = { type: "develop", target: w.id, attribute: attribute2 };
        if (legality(game2, AI, order).ok) options.push(order);
      }
    }
    const attacks = options.filter((o) => o.type === "attack");
    const expands = options.filter((o) => o.type === "expand");
    const develops = options.filter((o) => o.type === "develop");
    if (owned(game2, HUMAN).length === 1 && attacks.length) return attacks[0];
    const relayAttack = attacks.find((o) => RELAYS.includes(o.target));
    if (relayAttack) return relayAttack;
    const relayExpand = expands.find((o) => RELAYS.includes(o.target));
    if (relayExpand) return relayExpand;
    const defend = develops.find((o) => {
      const w = game2.worlds[o.target];
      if (o.attribute !== "defense" || !w.relay || !adjacent(game2, HUMAN, w.id) || protectedWorld(w, game2.turn + 1)) return false;
      const cost = attackCost(w, game2.turn + 1);
      return game2.empires.human.credits >= 8 && game2.empires.human.military >= cost && game2.empires.human.military < cost + 6;
    });
    if (defend) return defend;
    if (attacks.length) return attacks.sort((a, b) => {
      const wa = game2.worlds[a.target], wb = game2.worlds[b.target];
      return wb.economy + wb.industry + wb.defense - (wa.economy + wa.industry + wa.defense) || attackCost(wa, game2.turn) - attackCost(wb, game2.turn) || a.target - b.target;
    })[0];
    if (expands.length) {
      const distantRelays = game2.worlds.filter((w) => w.relay && w.owner === null && !adjacent(game2, AI, w.id));
      const rank = (o) => Math.min(...distantRelays.map((w) => distance(o.target, w.id)));
      return expands.sort((a, b) => {
        const wa = game2.worlds[a.target], wb = game2.worlds[b.target];
        return (distantRelays.length ? rank(a) - rank(b) : 0) || wb.economy + wb.industry - (wa.economy + wa.industry) || wb.economy - wa.economy || a.target - b.target;
      })[0];
    }
    if (game2.turn <= 16) {
      const preferred = income(game2, AI).credits < 12 ? "economy" : "industry";
      return develops.find((o) => o.attribute === preferred) || develops.find((o) => o.attribute === (preferred === "economy" ? "industry" : "economy")) || { type: "pass" };
    }
    return develops.find((o) => o.attribute === "defense" && game2.worlds[o.target].relay && adjacent(game2, HUMAN, o.target)) || develops[0] || { type: "pass" };
  }
  function startTurn(game2) {
    for (const actor of [HUMAN, AI]) {
      const gains = income(game2, actor);
      game2.empires[actor].credits += gains.credits;
      game2.empires[actor].military += gains.military;
    }
    if (game2.turn === 11) record(game2, "Supernova active \xB7 no Military income this turn. Credits and reserves are intact.", "event");
    if (game2.turn === 16) record(game2, "Blockade active \xB7 attacks cost +8 Military through turn 19.", "event");
    if (game2.turn === 20) record(game2, "The blockade lifts. One final order before the collapse.", "event");
    if (game2.turn % 2 === 0) resolveOrder(game2, AI, chooseAIAction(game2));
    if (!game2.result) game2.phase = HUMAN;
  }
  function finishTurn(game2) {
    if (game2.result) return;
    if (game2.turn === 5) {
      for (const id of RELAYS) {
        const w = game2.worlds[id];
        w.economy = Math.min(5, w.economy + 1);
        w.industry = Math.min(5, w.industry + 1);
      }
      record(game2, "The relays awaken \xB7 +1 Economy, +1 Industry. Held relays now bank 2 prestige each turn.", "event");
    }
    if (game2.turn === 10) record(game2, "Supernova forecast \xB7 turn 11 pays no Military income.", "event");
    if (game2.turn === 15) record(game2, "Blockade forecast \xB7 attacks cost +8 Military on turns 16\u201319.", "event");
    if (game2.turn >= 5) for (const id of RELAYS) {
      const w = game2.worlds[id];
      if (w.owner) game2.empires[w.owner].relayPrestige += 2;
    }
    if (game2.turn === 20) endGame(game2, "prestige");
    else {
      game2.turn++;
      startTurn(game2);
    }
  }
  function submitHumanOrder(game2, order) {
    if (game2.phase !== HUMAN || game2.result) return { ok: false, reason: "The match has ended." };
    const result = resolveOrder(game2, HUMAN, order);
    if (!result.ok || game2.result) return result;
    game2.phase = "resolving";
    if (game2.turn % 2 === 1) resolveOrder(game2, AI, chooseAIAction(game2));
    if (!game2.result) finishTurn(game2);
    return result;
  }
  function endGame(game2, reason, winner) {
    const human = score(game2, HUMAN), ai = score(game2, AI);
    game2.result = { reason, winner: winner || (human.total > ai.total ? HUMAN : ai.total > human.total ? AI : "draw"), human, ai };
    game2.phase = "ended";
    record(game2, reason === "elimination" ? "An empire falls. The galaxy has a single sovereign." : "The final light fades. The twenty worlds are scored.", "event");
  }
  function forecast(game2) {
    if (game2.turn <= 5) return { turn: 5, title: "The awakening", description: "End of turn 5: both relays gain +1 Economy & Industry. Each held relay banks +2 prestige every turn, through turn 20." };
    if (game2.turn <= 10) return { turn: 11, title: "A star goes silent", description: "Turn 11: no new Military for either empire. Credits and existing reserves are unaffected." };
    if (game2.turn <= 15) return { turn: 16, title: "The great blockade", description: "Turns 16\u201319: every attack costs +8 Military. Normal attack costs return on turn 20." };
    return { turn: 20, title: "The last light", description: "Turn 20: the blockade lifts. After both orders and the final relay award, total prestige decides the victor." };
  }

  // src/art.js
  var cache = /* @__PURE__ */ new Map();
  function planetArt(id, profile, seed, size = 192) {
    const key = `${id}-${profile}-${seed}-${size}`;
    if (cache.has(key)) return cache.get(key);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(size, size);
    const random = mulberry32(seed + id * 137);
    const table = Array.from({ length: 32 * 32 * 32 }, random);
    const smooth = (t) => t * t * (3 - 2 * t);
    const lerp = (a, b, t) => a + (b - a) * t;
    function noise(x, y, z) {
      const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
      const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
      const at = (a, b, c) => table[((a & 31) * 32 + (b & 31)) * 32 + (c & 31)];
      return lerp(lerp(lerp(at(ix, iy, iz), at(ix + 1, iy, iz), fx), lerp(at(ix, iy + 1, iz), at(ix + 1, iy + 1, iz), fx), fy), lerp(lerp(at(ix, iy, iz + 1), at(ix + 1, iy, iz + 1), fx), lerp(at(ix, iy + 1, iz + 1), at(ix + 1, iy + 1, iz + 1), fx), fy), fz);
    }
    const palettes = {
      Trade: [[35, 72, 83], [86, 143, 135], [190, 205, 165]],
      Forge: [[91, 47, 32], [185, 105, 61], [232, 189, 134]],
      Bastion: [[61, 57, 91], [121, 116, 155], [186, 184, 201]],
      Homeworld: id === 5 ? [[29, 60, 68], [67, 118, 125], [165, 187, 167]] : [[71, 46, 76], [132, 83, 111], [205, 169, 157]],
      "Ancient relay": [[85, 65, 34], [179, 145, 77], [244, 223, 160]]
    };
    const palette = palettes[profile];
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const x = (px + 0.5 - size / 2) / (size / 2 - 2), y = (py + 0.5 - size / 2) / (size / 2 - 2);
      const r = x * x + y * y;
      if (r > 1) continue;
      const z = Math.sqrt(1 - r);
      let n = noise(x * 3 + 8, y * 3 + 8, z * 3 + 8) * 0.55 + noise(x * 9 + 8, y * 9 + 8, z * 9 + 8) * 0.28 + noise(x * 28 + 8, y * 28 + 8, z * 28 + 8) * 0.17;
      if (profile === "Forge" || profile === "Ancient relay") n = n * 0.55 + (0.5 + 0.5 * Math.sin(y * 35 + x * 4 + n * 15)) * 0.45;
      n = Math.max(0, Math.min(0.999, (n - 0.27) * 2.2));
      const a = palette[n < 0.5 ? 0 : 1], b = palette[n < 0.5 ? 1 : 2], t = n % 0.5 * 2;
      const light = Math.max(0.075, -x * 0.48 - y * 0.42 + z * 0.68) * 0.96;
      const atmosphere = Math.pow(1 - z, 4) * 0.24;
      const i = (py * size + px) * 4;
      for (let c = 0; c < 3; c++) image.data[i + c] = lerp(a[c], b[c], t) * light + atmosphere * palette[2][c];
      image.data[i + 3] = Math.min(255, (1 - r) * size * 180);
    }
    ctx.putImageData(image, 0, 0);
    const url = canvas.toDataURL();
    cache.set(key, url);
    return url;
  }
  function starArt(seed) {
    const random = mulberry32(seed);
    let svg = "";
    for (let i = 0; i < 440; i++) {
      const x = random() * 920, y = random() * 660, radius = random() * 0.85 + 0.2;
      svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" fill="${i % 5 ? "#c5d4d7" : "#e8ba84"}" opacity="${(random() * 0.55 + 0.1).toFixed(2)}"/>`;
      if (i % 75 === 0) svg += `<path d="M${x - 3},${y}h6 M${x},${y - 3}v6" stroke="#c5d4d7" stroke-width=".5" opacity=".5"/>`;
    }
    return svg;
  }

  // src/main.js
  var icons = {
    star: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',
    expand: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
    develop: '<path d="m4 16 5-5 4 3 7-9M14 5h6v6M4 21h16"/>',
    attack: '<path d="m5 3 14 14-2 2L3 5V3Zm9 15 6-6M16 20l4-4m-2 2 3 3M16 8l5-5v3l-4 4M3 21l7-7"/>',
    credits: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10m-3-8h4a2 2 0 0 1 0 4h-2a2 2 0 0 0 0 4"/>',
    military: '<path d="m12 3 8 4v6c0 4-8 8-8 8s-8-4-8-8V7Z"/><path d="m9 12 2 2 4-4"/>',
    worlds: '<circle cx="12" cy="12" r="7"/><ellipse cx="12" cy="12" rx="12" ry="4" transform="rotate(-30 12 12)"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    refresh: '<path d="M20 10a8 8 0 1 0-2 8M20 4v6h-6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 5m0 3v.1"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    log: '<path d="M5 5h14M5 12h14M5 19h9"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>'
  };
  var icon = (name, cls = "") => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.star}</svg>`;
  var $ = (selector) => document.querySelector(selector);
  var num = (n) => String(n).padStart(2, "0");
  var titleCase = (s) => s[0].toUpperCase() + s.slice(1);
  var positions = Array.from({ length: 20 }, (_, id) => ({ x: 108 + id % 5 * 175, y: 112 + Math.floor(id / 5) * 139 + [5, -8, 0, 8, -5][id % 5] }));
  var game = createGame(freshSeed());
  var selected = 5;
  var staged = null;
  var attribute = "economy";
  var modal = null;
  var previousFocus = null;
  var showAllLog = false;
  var toastTimer;
  $("#app").innerHTML = `
  <div class="app-shell">
    <header class="masthead">
      <a class="brand" href="./" aria-label="Aster home">${icon("star")}<span>aster<span class="brand-period">.</span></span></a>
      <div class="brand-caption">THE TWENTY WORLDS<span>A short odyssey of empire & ambition</span></div>
      <div class="header-actions"><span class="edition">A GALACTIC STRATEGY GAME <b>VOL. 01</b></span><button class="icon-button" data-action="help" aria-label="How to play" title="How to play">${icon("help")}</button><button class="icon-button" data-action="new" aria-label="New galaxy" title="New galaxy">${icon("refresh")}</button></div>
    </header>
    <section class="empire-strip" aria-label="Empire overview"><div id="human-status" class="empire-status"></div><div id="turn-status" class="turn-status"></div><div id="ai-status" class="empire-status rival-status"></div></section>
    <main class="game-layout">
      <section class="atlas" aria-label="Galaxy chart">
        <div class="atlas-top"><div><div class="eyebrow"><span class="live-dot"></span> EXPEDITION ATLAS <span class="muted-slash">/</span> SECTOR 01</div><h1>The Pelagic Reach<span>.</span></h1><p>Twenty worlds. One lasting legacy.</p></div><div class="chart-meta">CHART <span id="seed-label"></span><br><span>20 SYSTEMS \xB7 23 LANES</span></div></div>
        <div class="galaxy" id="galaxy"><svg id="star-chart" viewBox="0 0 920 660" preserveAspectRatio="none" aria-hidden="true"></svg><div id="world-buttons" class="world-buttons" role="group" aria-label="Select a world"></div><span class="map-axis axis-north">N</span><span class="map-axis axis-south">S</span></div>
        <div class="atlas-bottom"><div class="legend"><span><i class="legend-dot human"></i> YOUR WORLDS</span><span><i class="legend-dot rival"></i> VESPER UNION</span><span><i class="legend-relay">\u25C7</i> ANCIENT RELAY</span></div><span class="map-hint">SELECT A WORLD TO BEGIN ${icon("expand")}</span></div>
      </section>
      <aside class="command-panel" aria-label="World inspector and orders"><div id="inspector"></div><div id="composer"></div></aside>
      <section class="chronicle" aria-label="Events and activity"><div id="forecast" class="forecast"></div><div class="activity"><div class="section-label"><span>${icon("log")} DISPATCHES</span><button data-action="log" class="text-button" id="log-toggle">View all ${icon("arrow")}</button></div><div id="activity-log" aria-live="polite"></div></div></section>
    </main>
    <footer class="page-footer"><span>NO CHANCE. ONLY CHOICES.</span><span id="footer-status"></span><button class="text-button" data-action="help">Field guide ${icon("arrow")}</button></footer>
  </div>
  <div id="toast" role="status"></div><div id="modal-root"></div><div class="sr-only" id="announcement" role="status" aria-live="polite"></div>
`;
  function renderEmpire(actor) {
    const e = game.empires[actor], s = score(game, actor), inc = income(game, actor);
    const human = actor === HUMAN;
    $(`#${human ? "human" : "ai"}-status`).innerHTML = `
    <div class="empire-identity"><div class="empire-sigil ${human ? "human-sigil" : "rival-sigil"}">${icon(human ? "star" : "sun")}</div><div><span class="eyebrow">${human ? "YOUR EMPIRE" : "DETERMINISTIC RIVAL"}</span><h2>${human ? "The Sol Accord" : "Vesper Union"}</h2><span class="empire-worlds">${s.worlds} ${s.worlds === 1 ? "world" : "worlds"} <span>\xB7</span> ${s.planet} planet + ${s.relay} relay prestige</span></div></div>
    <div class="resources"><div class="resource" title="Credits \xB7 income at the start of each turn"><span class="resource-label">${icon("credits")} CREDITS</span><div>${e.credits}<small>+${inc.credits}<span>/t</span></small></div></div><div class="resource" title="Military reserve \xB7 spend on attacks"><span class="resource-label">${icon("military")} MILITARY</span><div>${e.military}<small>+${inc.military}<span>/t</span></small></div></div><div class="resource prestige" title="${s.planet} planet value + ${s.relay} banked relay prestige"><span class="resource-label">${icon("star")} PRESTIGE</span><div>${s.total}</div></div></div>`;
  }
  function drawChart() {
    const lanes = LINKS.map(([a, b]) => {
      const wa = game.worlds[a], wb = game.worlds[b], p = positions[a], q = positions[b];
      const same = wa.owner && wa.owner === wb.owner;
      return `<line class="lane ${same ? wa.owner : ""} ${a === selected || b === selected ? "selected-lane" : ""}" x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>`;
    }).join("");
    const relayBridge = `<text x="473" y="322" class="bridge-label" transform="rotate(90 473 322)">THE MERIDIAN GATE</text>`;
    $("#star-chart").innerHTML = `<defs><radialGradient id="nebula"><stop stop-color="#76665f" stop-opacity=".14"/><stop offset="1" stop-color="#76665f" stop-opacity="0"/></radialGradient></defs><ellipse cx="460" cy="340" rx="420" ry="290" fill="url(#nebula)"/><g class="chart-grid"><path d="M20 40H900V620H20ZM20 330H900M460 40V620"/><circle cx="460" cy="330" r="215"/><circle cx="460" cy="330" r="295"/></g>${starArt(game.seed)}<g>${lanes}</g>${relayBridge}<text x="42" y="50" class="chart-coordinate">+ 004.92</text><text x="804" y="607" class="chart-coordinate">\u2212 018.76 +</text>`;
    $("#world-buttons").innerHTML = game.worlds.map((w) => {
      const p = positions[w.id];
      const order = staged ? { type: staged, target: w.id, attribute } : null;
      const legal = order ? legality(game, HUMAN, order).ok : ["expand", "develop", "attack"].some((type) => legality(game, HUMAN, { type, target: w.id, attribute }).ok);
      const protect = protectedWorld(w, game.turn);
      const marker = w.relay ? "\u25C7" : w.home ? "\u2726" : w.owner === HUMAN ? "+" : w.owner === AI ? "\xD7" : "\xB7";
      return `<button class="world ${w.owner || "neutral"} ${w.id === selected ? "selected" : ""} ${w.relay ? "relay" : ""} ${legal ? "legal-target" : ""} ${protect ? "protected" : ""} ${w.id === selected && staged ? "pending" : ""}" style="--x:${p.x / 9.2}%;--y:${p.y / 6.6}%" data-world="${w.id}" data-focus="world-${w.id}" aria-label="${num(w.id + 1)} ${w.name}, ${w.owner === HUMAN ? "your world" : w.owner === AI ? "rival world" : "unclaimed"}, ${w.profile}, Economy ${w.economy}, Industry ${w.industry}, Defense ${w.defense}${protect ? ", capture protected" : ""}${legal ? ", legal target" : ""}" aria-pressed="${w.id === selected}">
      <span class="planet-wrap"><span class="selection-orbit"></span>${w.relay ? '<span class="relay-orbit"></span>' : ""}<img class="planet" src="${planetArt(w.id, w.profile, game.seed)}" alt="" draggable="false"/><span class="world-marker">${protect ? icon("military") : marker}</span></span><span class="world-label"><span class="world-number">${num(w.id + 1)}</span> ${w.name}</span><span class="world-type">${w.relay ? game.turn > 5 ? "AWAKENED RELAY" : "DORMANT RELAY" : w.home ? "HOMEWORLD" : w.owner === HUMAN ? "SOL ACCORD" : w.owner === AI ? "VESPER UNION" : "UNCLAIMED"}</span>
    </button>`;
    }).join("");
  }
  function renderInspector() {
    const w = game.worlds[selected], protect = protectedWorld(w, game.turn);
    $("#inspector").innerHTML = `
    <div class="inspector-heading"><span class="eyebrow">SYSTEM ${num(w.id + 1)} <span class="muted-slash">/</span> ${w.relay ? "ANCIENT RELAY" : w.profile.toUpperCase()}</span><span class="owner-badge ${w.owner || "neutral"}">${w.owner === HUMAN ? "+ YOUR WORLD" : w.owner === AI ? "\xD7 RIVAL WORLD" : "\u25CB UNCLAIMED"}</span></div>
    <div class="world-portrait ${w.profile.toLowerCase().replace(" ", "-")}" style="--planet-art:url('${planetArt(w.id, w.profile, game.seed, 256)}')"><div class="portrait-orbit"></div><div class="portrait-orbit second"></div><div class="portrait-copy"><span>THE PELAGIC REACH</span><h2>${w.name}</h2><div>${w.home ? `${icon("star")} ${w.home === HUMAN ? "Accord" : "Vesper"} homeworld` : w.relay ? `${icon("star")} +2 prestige / turn from T05` : `${icon("worlds")} ${w.profile} world`}</div></div><div class="portrait-planet"></div></div>
    <div class="world-attributes">${ATTRIBUTES.map((attr, i) => `<div class="attribute-row"><span>${icon(["credits", "develop", "military"][i])}${titleCase(attr)}</span><div class="level-bars" aria-label="${w[attr]} of 5">${Array.from({ length: 5 }, (_, n) => `<i class="${n < w[attr] ? "filled" : ""}"></i>`).join("")}</div><b>${w[attr]}<small>/5</small></b></div>`).join("")}</div>
    <div class="production-line"><span>${w.owner ? "PER TURN" : "IF CLAIMED"}</span><b>+${w.economy * 2} <span>Credits</span></b><b>+${game.turn === 11 ? 0 : w.industry} <span>Military</span></b></div>
    ${protect ? `<div class="protection-note">${icon("military")} Protected through T${num(w.capturedTurn + 1)} \xB7 attackable T${num(w.capturedTurn + 2)}</div>` : ""}`;
  }
  function renderComposer() {
    const w = game.worlds[selected];
    const order = staged ? { type: staged, target: selected, attribute } : null;
    const check = legality(game, HUMAN, order), cost = order ? orderCost(game, HUMAN, order) : null;
    const effects = {
      expand: `Claim ${w.name}. Production begins next turn.`,
      develop: w[attribute] >= 5 ? `${titleCase(attribute)} is fully developed at level 5.` : `${titleCase(attribute)} ${w[attribute]} \u2192 ${w[attribute] + 1}. ${attribute === "economy" ? "+2 Credits per future turn." : attribute === "industry" ? "+1 Military per future turn." : "+6 Military to enemy attack cost."}`,
      attack: `Capture ${w.name}. Protected through turn ${game.turn + 1}.`
    };
    $("#composer").innerHTML = `
    <div class="composer-heading"><h3>Your next move</h3><span class="eyebrow">ONE ORDER / TURN</span></div>
    <div class="order-tabs" role="group" aria-label="Choose order">${["expand", "develop", "attack"].map((type) => `<button data-order="${type}" data-focus="order-${type}" class="${staged === type ? "active" : ""}" aria-pressed="${staged === type}">${icon(type)}<span>${titleCase(type)}</span></button>`).join("")}</div>
    <div class="order-detail">
      ${staged === "develop" ? `<div class="attribute-options" role="group" aria-label="Development attribute">${ATTRIBUTES.map((attr) => `<button data-attribute="${attr}" data-focus="attr-${attr}" class="${attribute === attr ? "active" : ""}" aria-pressed="${attribute === attr}">${titleCase(attr)}</button>`).join("")}</div>` : ""}
      <div class="order-preview ${staged && !check.ok ? "unavailable" : ""}"><div class="preview-label">${staged ? `${icon(staged)} ${titleCase(staged)} <span>${w.name}</span>` : `${icon("expand")} A world of possibilities`}${staged ? `<span class="cost">${cost.credits} ${icon("credits")}${cost.military ? ` + ${cost.military} ${icon("military")}` : ""}</span>` : ""}</div><p>${staged ? effects[staged] : "Select a world, prepare an order, and make your mark on the chart."}</p><div class="legality">${icon(staged && check.ok ? "check" : "help")} ${staged ? check.reason : "Selection never spends resources."}</div>${staged === "attack" && game.turn >= 16 && game.turn <= 19 ? '<div class="surcharge-note">Includes +8 Military blockade surcharge.</div>' : ""}</div>
    </div>
    <div class="commit-controls"><div class="mobile-order-summary"><span>${staged ? `${titleCase(staged)} \xB7 ${w.name}` : `${w.name} \xB7 choose an order`}</span><b>${cost ? `${cost.credits} Credits${cost.military ? ` + ${cost.military} Military` : ""}` : `TURN ${num(game.turn)} / 20`}</b></div><button class="commit-button" data-action="commit" data-focus="commit" ${!staged || !check.ok || game.result ? "disabled" : ""}><span>${game.result ? "Expedition complete" : "Commit order"}</span>${icon("arrow")}</button><button class="pass-button" data-action="pass" data-focus="pass" ${game.result ? "disabled" : ""} title="Pass your order and preserve reserves">Pass</button></div>
    <p class="composer-footnote">${game.result ? '<button class="text-button" data-action="result">View expedition results \u2192</button>' : `${game.turn % 2 ? "You act first. Vesper responds after your order." : "Vesper has acted. Your order completes the turn."}`}</p>`;
  }
  function renderChronicle() {
    const f = forecast(game);
    const active = game.turn === 11 ? "ACTIVE \xB7 Military income suspended this turn" : game.turn >= 16 && game.turn <= 19 ? "ACTIVE \xB7 Attacks cost +8 Military" : game.turn >= 6 ? "ACTIVE \xB7 Held relays bank +2 prestige / turn" : "FORECAST \xB7 Relays are dormant";
    $("#forecast").innerHTML = `<div class="forecast-icon">${icon(game.turn <= 5 ? "star" : game.turn <= 10 ? "sun" : game.turn <= 15 ? "military" : "worlds")}</div><div class="forecast-content"><div class="section-label"><span>ON THE HORIZON</span><span>TURN ${num(f.turn)}</span></div><h3>${f.title}</h3><p>${f.description}</p><span class="active-event">${game.result ? "COMPLETE \xB7 The galaxy has been scored" : active}</span></div><div class="event-timeline" aria-label="Match timeline">${Array.from({ length: 20 }, (_, i) => `<span class="${i + 1 < game.turn ? "past" : ""} ${i + 1 === game.turn ? "current" : ""} ${[5, 11, 16, 20].includes(i + 1) ? "milestone" : ""}" title="Turn ${i + 1}">${[1, 5, 11, 16, 20].includes(i + 1) ? `<small>${num(i + 1)}</small>` : ""}</span>`).join("")}</div>`;
    $("#activity-log").innerHTML = game.log.slice(0, showAllLog ? 100 : 3).map((entry) => `<div class="log-entry ${entry.actor || "event"}"><span class="log-turn">T${num(entry.turn)}</span><span class="log-dot"></span><p>${entry.text}</p></div>`).join("");
    $("#log-toggle").innerHTML = `${showAllLog ? "Show less" : "View all"} ${icon("arrow")}`;
    $(".activity").classList.toggle("expanded", showAllLog);
  }
  function render() {
    const focusKey = document.activeElement?.dataset.focus;
    renderEmpire(HUMAN);
    renderEmpire(AI);
    $("#turn-status").innerHTML = `<span class="eyebrow">${game.result ? "COMPLETED" : "SHARED TURN"}</span><div>${num(game.turn)}<span>/ 20</span></div><span class="turn-phase">${game.result ? "FINAL CHART" : "YOUR ORDER"} <i></i></span>`;
    $("#seed-label").textContent = game.seed.toString(16).toUpperCase().padStart(8, "0");
    $("#footer-status").textContent = `SEED ${game.seed} \xB7 ${game.turn % 2 ? "ACCORD" : "VESPER"} INITIATIVE`;
    drawChart();
    renderInspector();
    renderComposer();
    renderChronicle();
    if (focusKey) document.querySelector(`[data-focus="${focusKey}"]`)?.focus({ preventScroll: true });
  }
  function announce(message) {
    $("#announcement").textContent = message;
  }
  function toast(message) {
    clearTimeout(toastTimer);
    $("#toast").textContent = message;
    $("#toast").classList.add("visible");
    toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3500);
  }
  function commit(pass = false) {
    if (!pass && !staged) return;
    const oldTurn = game.turn;
    const result = submitHumanOrder(game, pass ? { type: "pass" } : { type: staged, target: selected, attribute });
    if (!result.ok) {
      toast(result.reason);
      return;
    }
    staged = null;
    render();
    announce(game.result ? "Expedition complete. View your results." : `Turn ${game.turn}. ${game.turn % 2 ? "You act first." : "Vesper has acted."} Choose your next order.`);
    if (game.result) openModal("result");
    else {
      toast(`Turn ${num(oldTurn)} complete. ${game.turn % 2 ? "Your initiative." : "Vesper has made its move."}`);
      if (!pass) document.querySelector(`[data-world="${selected}"]`)?.focus({ preventScroll: true });
    }
  }
  function restart(seed) {
    game = createGame(seed);
    selected = 5;
    staged = null;
    attribute = "economy";
    showAllLog = false;
    closeModal();
    render();
    toast("A fresh beginning. Your first order awaits.");
  }
  function guideContent(intro) {
    return `<div class="guide-art"><div class="guide-stars"></div><span class="eyebrow">ASTER FIELD NOTES <span>001\u2014020</span></span><div class="guide-orbit one"></div><div class="guide-orbit two"></div><img src="${planetArt(5, "Homeworld", game.seed, 320)}" alt="An illuminated ocean world"/><div class="guide-art-caption">A SMALL GALAXY.<br>AN EXTRAORDINARY POSSIBILITY.</div><span class="guide-coordinate">004.92 N / 018.76 E</span></div><div class="guide-copy"><div class="eyebrow">WELCOME, EXPLORER</div><h2>Every world<br>is a <em>possibility.</em></h2><p class="guide-lead">Twenty worlds. Twenty turns. Build an empire worth remembering.</p><div class="guide-steps"><div><span>01</span><p><b>Find your next world.</b> Follow a lane from your territory. Every world and every rival move is visible.</p></div><div><span>02</span><p><b>Make one meaningful choice.</b> Expand your reach, develop a world, or capture a rival. Preview the cost, then commit.</p></div><div><span>03</span><p><b>Leave a lasting legacy.</b> The two ancient relays awaken at the end of turn 5, banking +2 prestige per held relay, per turn.</p></div></div><div class="guide-score">${icon("star")}<p><b>The highest prestige wins after turn 20.</b><br>Score 3 per world + all attribute levels + banked relay prestige. Eliminate your rival to win early.</p></div><button class="primary-button" data-action="close-modal">${intro ? "Enter the galaxy" : "Back to the galaxy"} ${icon("arrow")}</button><span class="guide-note">NO TIMERS \xB7 NO DICE \xB7 JUST YOUR NEXT MOVE</span>${intro ? "" : '<button class="text-button detailed-rules" data-action="rules">Read the complete rules \u2192</button>'}</div>`;
  }
  function resultContent() {
    const r = game.result;
    const victory = r.winner === HUMAN, draw = r.winner === "draw";
    return `<div class="result-top"><span class="eyebrow">EXPEDITION COMPLETE <span> / </span> TURN ${num(game.turn)}</span><div class="result-medallion">${icon(victory ? "star" : draw ? "worlds" : "sun")}</div><h2>${victory ? "A legacy among<br>the <em>stars.</em>" : draw ? "Two empires.<br>One <em>legacy.</em>" : "Every ending,<br>a new <em>beginning.</em>"}</h2><p>${r.reason === "elimination" ? victory ? "The Vesper Union has fallen. The galaxy is yours." : "Your last world has fallen to the Vesper Union." : draw ? "The final light fades on two equally remarkable empires." : victory ? "The Sol Accord has the highest prestige. The Reach remembers." : "The Vesper Union has the highest prestige. A new galaxy awaits."}</p></div><div class="result-scores">${[HUMAN, AI].map((actor) => `<div class="result-score ${actor}"><span class="eyebrow">${actor === HUMAN ? "THE SOL ACCORD \xB7 YOU" : "THE VESPER UNION"}</span><strong>${r[actor].total}</strong><span class="score-unit">TOTAL PRESTIGE</span><dl><div><dt>Planet value</dt><dd>${r[actor].planet}</dd></div><div><dt>Banked relay prestige</dt><dd>${r[actor].relay}</dd></div><div><dt>Worlds held</dt><dd>${r[actor].worlds}</dd></div></dl></div>`).join("")}</div><div class="result-actions"><button class="primary-button" data-action="fresh">New galaxy ${icon("arrow")}</button><button class="secondary-button" data-action="replay">${icon("refresh")} Replay seed</button></div><button class="text-button result-chart-link" data-action="close-modal">Return to the final chart</button>`;
  }
  function openModal(type) {
    previousFocus = document.activeElement;
    modal = type;
    const content = type === "intro" || type === "help" ? guideContent(type === "intro") : type === "result" ? resultContent() : type === "new" ? `<div class="confirm-content"><span class="eyebrow">A NEW EXPEDITION</span><h2>Another sky<br>is <em>calling.</em></h2><p>Start with a fresh galaxy, or replay this seed from turn one. Your current expedition will be replaced.</p><button class="primary-button" data-action="fresh">New galaxy ${icon("arrow")}</button><button class="secondary-button" data-action="replay">${icon("refresh")} Replay seed ${game.seed}</button><button class="text-button" data-action="close-modal">Continue this expedition</button></div>` : `<div class="rules-content"><span class="eyebrow">THE COMPLETE FIELD GUIDE</span><h2>The art of <em>empire.</em></h2><h3>One shared turn, two orders.</h3><p>Income pays once at the start: 2 \xD7 Economy in Credits and 1 \xD7 Industry in Military. You act first on odd turns; Vesper acts first on even turns. Commit or Pass automatically advances play.</p><h3>Three ways to shape the galaxy.</h3><p><b>Expand:</b> claim a directly connected neutral world for 12 + 4 \xD7 your world count Credits. <b>Develop:</b> spend 8 Credits to raise an owned world's Economy, Industry, or Defense by one, up to 5. <b>Attack:</b> capture a connected enemy world for 8 Credits and 4 + 6 \xD7 its Defense in Military. Combat is guaranteed. Defense adds 6 to the attack price per level.</p><p>Income improvements apply next turn. Captured worlds keep all attributes and are protected on the capture turn and the next. They can be attacked again two turns after capture. Neutral colonies get no protection. A world need not stay connected to produce or score.</p><h3>The galaxy keeps its own time.</h3><p><b>End of turn 5:</b> relays gain +1 Economy and Industry (maximum 5). Held relays bank 2 prestige at the end of every turn 5\u201320; banked prestige stays yours if the relay is lost. <b>Turn 11:</b> no Military income; existing reserves and Credits are unaffected. <b>Turns 16\u201319:</b> all attacks cost 8 extra Military. <b>Turn 20:</b> the blockade lifts; final orders and relay awards resolve before scoring.</p><h3>Build something that lasts.</h3><p>Planet value = 3 \xD7 worlds + total Economy, Industry, and Defense. Add banked relay prestige for your final score. Resources do not score. Tied scores draw. Losing every world ends the game immediately; losing only your homeworld does not.</p><h3>A predictable rival.</h3><p>Vesper prioritizes elimination, relays, timely relay defense, valuable captures, expansion toward neutral relays, then development. It follows exactly the same prices and restrictions, with no hidden bonuses.</p><button class="primary-button" data-action="close-modal">Back to the galaxy ${icon("arrow")}</button></div>`;
    $("#modal-root").innerHTML = `<div class="modal-backdrop"><section class="modal ${type === "intro" || type === "help" ? "guide-modal" : type === "result" ? "result-modal" : type === "rules" ? "rules-modal" : "confirm-modal"}" role="dialog" aria-modal="true" aria-label="${type === "result" ? "Expedition results" : type === "new" ? "Start a new galaxy" : "How to play Aster"}"><button class="modal-close icon-button" data-action="close-modal" aria-label="Close dialog">${icon("close")}</button>${content}</section></div>`;
    $(".app-shell").inert = true;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => $(".modal .primary-button")?.focus());
  }
  function closeModal() {
    modal = null;
    $("#modal-root").innerHTML = "";
    $(".app-shell").inert = false;
    document.body.classList.remove("modal-open");
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    else document.querySelector('[data-action="help"]')?.focus({ preventScroll: true });
  }
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    if (button.dataset.world !== void 0) {
      selected = Number(button.dataset.world);
      drawChart();
      renderInspector();
      renderComposer();
      document.querySelector(`[data-world="${selected}"]`)?.focus({ preventScroll: true });
      announce(`${game.worlds[selected].name} selected. ${staged ? legality(game, HUMAN, { type: staged, target: selected, attribute }).reason : "Choose an order."}`);
    } else if (button.dataset.order) {
      staged = button.dataset.order;
      render();
    } else if (button.dataset.attribute) {
      attribute = button.dataset.attribute;
      render();
    } else {
      const action = button.dataset.action;
      if (action === "commit") commit();
      if (action === "pass") commit(true);
      if (action === "help") openModal("help");
      if (action === "rules") openModal("rules");
      if (action === "new") openModal("new");
      if (action === "result" && game.result) openModal("result");
      if (action === "close-modal") closeModal();
      if (action === "fresh") restart(freshSeed(game.seed));
      if (action === "replay") restart(game.seed);
      if (action === "log") {
        showAllLog = !showAllLog;
        renderChronicle();
      }
    }
  });
  document.addEventListener("keydown", (event) => {
    if (modal) {
      if (event.key === "Escape") closeModal();
      if (event.key === "Tab") {
        const focusable = [...document.querySelectorAll(".modal button:not(:disabled), .modal a[href]")];
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      return;
    }
    if (document.activeElement?.dataset.world !== void 0 && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const delta = { ArrowUp: -5, ArrowDown: 5, ArrowLeft: -1, ArrowRight: 1 }[event.key];
      document.querySelector(`[data-world="${Math.max(0, Math.min(19, selected + delta))}"]`)?.click();
    }
  });
  render();
  openModal("intro");
})();
