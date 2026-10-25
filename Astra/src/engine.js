export const HUMAN = 'human';
export const AI = 'ai';
export const RELAYS = [7, 12];
export const ATTRIBUTES = ['economy', 'industry', 'defense'];
export const NAMES = ['Altair', 'Vesper', 'Caldera', 'Oberon', 'Lyra', 'Nadir', 'Solis', 'Meridian I', 'Eos', 'Orion', 'Cinder', 'Astraea', 'Meridian II', 'Aurelia', 'Vulcan', 'Talos', 'Nyx', 'Elara', 'Hesper', 'Zenith'];
export const LINKS = [];
for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) LINKS.push([row * 5 + col, row * 5 + col + 1]);
for (let row = 0; row < 3; row++) for (const col of [0, 4]) LINKS.push([row * 5 + col, (row + 1) * 5 + col]);
LINKS.push([7, 12]);

export function mulberry32(seed) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function freshSeed(previous) {
  let seed;
  do { seed = globalThis.crypto.getRandomValues(new Uint32Array(1))[0]; } while (seed === previous);
  return seed;
}

export function createGame(seed = 740218) {
  const random = mulberry32(seed);
  const profiles = [
    { profile: 'Trade', economy: 3, industry: 1, defense: 1 },
    { profile: 'Forge', economy: 1, industry: 3, defense: 1 },
    { profile: 'Bastion', economy: 1, industry: 1, defense: 3 },
  ];
  const worlds = Array.from({ length: 20 }, (_, id) => ({ id, name: NAMES[id], owner: null, relay: RELAYS.includes(id), home: id === 5 ? HUMAN : id === 14 ? AI : null, capturedTurn: null }));
  for (let id = 0; id < 10; id++) {
    const profile = profiles[Math.floor(random() * 3)];
    Object.assign(worlds[id], profile);
    Object.assign(worlds[19 - id], profile);
  }
  for (const id of [0, 19]) Object.assign(worlds[id], profiles[1]);
  for (const id of [6, 13]) Object.assign(worlds[id], profiles[0]);
  for (const id of [5, 14]) Object.assign(worlds[id], { profile: 'Homeworld', economy: 3, industry: 2, defense: 2, owner: id === 5 ? HUMAN : AI });
  for (const id of RELAYS) Object.assign(worlds[id], { profile: 'Ancient relay', economy: 2, industry: 2, defense: 2 });
  const empire = () => ({ credits: 14, military: 0, relayPrestige: 0 });
  const game = { seed: seed >>> 0, turn: 1, phase: HUMAN, worlds, empires: { human: empire(), ai: empire() }, log: [], result: null, orders: [], logID: 0 };
  record(game, 'The chart is open. Your story begins at Nadir.', 'event');
  startTurn(game);
  return game;
}

export function owned(game, actor) { return game.worlds.filter(w => w.owner === actor); }
export function neighbors(id) { return LINKS.flatMap(([a, b]) => a === id ? [b] : b === id ? [a] : []); }
export function adjacent(game, actor, id) { return neighbors(id).some(n => game.worlds[n].owner === actor); }
export function income(game, actor, turn = game.turn) {
  const worlds = owned(game, actor);
  return { credits: worlds.reduce((n, w) => n + w.economy * 2, 0), military: turn === 11 ? 0 : worlds.reduce((n, w) => n + w.industry, 0) };
}
export function score(game, actor) {
  const worlds = owned(game, actor);
  const planet = worlds.reduce((n, w) => n + 3 + w.economy + w.industry + w.defense, 0);
  const relay = game.empires[actor].relayPrestige;
  return { total: planet + relay, planet, relay, worlds: worlds.length };
}
export function surcharge(turn) { return turn >= 16 && turn <= 19 ? 8 : 0; }
export function attackCost(world, turn) { return 4 + 6 * world.defense + surcharge(turn); }
export function protectedWorld(world, turn) { return world.capturedTurn !== null && turn <= world.capturedTurn + 1; }
export function orderCost(game, actor, order) {
  if (order.type === 'expand') return { credits: 12 + 4 * owned(game, actor).length, military: 0 };
  if (order.type === 'attack') return { credits: 8, military: game.worlds[order.target] ? attackCost(game.worlds[order.target], game.turn) : 0 };
  if (order.type === 'develop') return { credits: 8, military: 0 };
  return { credits: 0, military: 0 };
}
export function legality(game, actor, order) {
  if (game.result) return { ok: false, reason: 'This expedition has ended.' };
  if (order?.type === 'pass') return { ok: true, reason: 'Save your reserves for the next turn.' };
  if (!order || !['expand', 'develop', 'attack'].includes(order.type)) return { ok: false, reason: 'Choose an order to prepare it.' };
  const w = game.worlds[order.target];
  if (!w) return { ok: false, reason: 'Select a world on the chart.' };
  if (order.type === 'expand') {
    if (w.owner) return { ok: false, reason: 'Only unclaimed worlds can be colonized.' };
    if (!adjacent(game, actor, w.id)) return { ok: false, reason: 'No direct lane from your territory.' };
  }
  if (order.type === 'develop') {
    if (w.owner !== actor) return { ok: false, reason: 'You can only develop your own worlds.' };
    if (!ATTRIBUTES.includes(order.attribute)) return { ok: false, reason: 'Choose an attribute to develop.' };
    if (w[order.attribute] >= 5) return { ok: false, reason: 'This attribute is already at level 5.' };
  }
  if (order.type === 'attack') {
    if (!w.owner || w.owner === actor) return { ok: false, reason: 'Choose a rival-owned world to attack.' };
    if (!adjacent(game, actor, w.id)) return { ok: false, reason: 'No direct lane from your territory.' };
    if (protectedWorld(w, game.turn)) return { ok: false, reason: `Capture protection through turn ${w.capturedTurn + 1}. Attackable on turn ${w.capturedTurn + 2}.` };
  }
  const cost = orderCost(game, actor, order);
  const reserve = game.empires[actor];
  const shortages = [];
  if (reserve.credits < cost.credits) shortages.push(`${cost.credits - reserve.credits} more Credits`);
  if (reserve.military < cost.military) shortages.push(`${cost.military - reserve.military} more Military`);
  if (shortages.length) return { ok: false, reason: `Requires ${shortages.join(' and ')}.` };
  return { ok: true, reason: 'Ready to commit. Outcome is guaranteed.' };
}

function record(game, text, kind, actor = null) {
  game.log.unshift({ id: ++game.logID, turn: game.turn, text, kind, actor });
}

export function resolveOrder(game, actor, order) {
  const check = legality(game, actor, order);
  if (!check.ok) return check;
  const cost = orderCost(game, actor, order);
  const empire = game.empires[actor];
  empire.credits -= cost.credits;
  empire.military -= cost.military;
  const name = actor === HUMAN ? 'You' : 'The Vesper Union';
  const w = game.worlds[order.target];
  if (order.type === 'expand') {
    w.owner = actor;
    w.capturedTurn = null;
    record(game, `${name} claimed ${w.name}.`, 'expand', actor);
  } else if (order.type === 'develop') {
    w[order.attribute]++;
    record(game, `${name} developed ${w.name} · ${order.attribute} ${w[order.attribute]}.`, 'develop', actor);
  } else if (order.type === 'attack') {
    w.owner = actor;
    w.capturedTurn = game.turn;
    record(game, `${name} captured ${w.name} · ${cost.military} Military.`, 'attack', actor);
  } else record(game, `${name} passed, preserving reserves.`, 'pass', actor);
  game.orders.push({ turn: game.turn, actor, ...order });
  if (order.type === 'attack' && owned(game, actor === HUMAN ? AI : HUMAN).length === 0) endGame(game, 'elimination', actor);
  return { ok: true };
}

function distance(from, target) {
  const queue = [[from, 0]];
  const seen = new Set([from]);
  for (let i = 0; i < queue.length; i++) {
    const [id, d] = queue[i];
    if (id === target) return d;
    for (const next of neighbors(id)) if (!seen.has(next)) { seen.add(next); queue.push([next, d + 1]); }
  }
  return Infinity;
}

export function chooseAIAction(game) {
  const options = [];
  for (const w of game.worlds) {
    for (const type of ['attack', 'expand']) {
      const order = { type, target: w.id };
      if (legality(game, AI, order).ok) options.push(order);
    }
    for (const attribute of ATTRIBUTES) {
      const order = { type: 'develop', target: w.id, attribute };
      if (legality(game, AI, order).ok) options.push(order);
    }
  }
  const attacks = options.filter(o => o.type === 'attack');
  const expands = options.filter(o => o.type === 'expand');
  const develops = options.filter(o => o.type === 'develop');
  if (owned(game, HUMAN).length === 1 && attacks.length) return attacks[0];
  const relayAttack = attacks.find(o => RELAYS.includes(o.target));
  if (relayAttack) return relayAttack;
  const relayExpand = expands.find(o => RELAYS.includes(o.target));
  if (relayExpand) return relayExpand;
  const defend = develops.find(o => {
    const w = game.worlds[o.target];
    if (o.attribute !== 'defense' || !w.relay || !adjacent(game, HUMAN, w.id) || protectedWorld(w, game.turn + 1)) return false;
    const cost = attackCost(w, game.turn + 1);
    return game.empires.human.credits >= 8 && game.empires.human.military >= cost && game.empires.human.military < cost + 6;
  });
  if (defend) return defend;
  if (attacks.length) return attacks.sort((a, b) => {
    const wa = game.worlds[a.target], wb = game.worlds[b.target];
    return (wb.economy + wb.industry + wb.defense) - (wa.economy + wa.industry + wa.defense) || attackCost(wa, game.turn) - attackCost(wb, game.turn) || a.target - b.target;
  })[0];
  if (expands.length) {
    const distantRelays = game.worlds.filter(w => w.relay && w.owner === null && !adjacent(game, AI, w.id));
    const rank = o => Math.min(...distantRelays.map(w => distance(o.target, w.id)));
    return expands.sort((a, b) => {
      const wa = game.worlds[a.target], wb = game.worlds[b.target];
      return (distantRelays.length ? rank(a) - rank(b) : 0) || (wb.economy + wb.industry) - (wa.economy + wa.industry) || wb.economy - wa.economy || a.target - b.target;
    })[0];
  }
  if (game.turn <= 16) {
    const preferred = income(game, AI).credits < 12 ? 'economy' : 'industry';
    return develops.find(o => o.attribute === preferred) || develops.find(o => o.attribute === (preferred === 'economy' ? 'industry' : 'economy')) || { type: 'pass' };
  }
  return develops.find(o => o.attribute === 'defense' && game.worlds[o.target].relay && adjacent(game, HUMAN, o.target)) || develops[0] || { type: 'pass' };
}

function startTurn(game) {
  for (const actor of [HUMAN, AI]) {
    const gains = income(game, actor);
    game.empires[actor].credits += gains.credits;
    game.empires[actor].military += gains.military;
  }
  if (game.turn === 11) record(game, 'Supernova active · no Military income this turn. Credits and reserves are intact.', 'event');
  if (game.turn === 16) record(game, 'Blockade active · attacks cost +8 Military through turn 19.', 'event');
  if (game.turn === 20) record(game, 'The blockade lifts. One final order before the collapse.', 'event');
  if (game.turn % 2 === 0) resolveOrder(game, AI, chooseAIAction(game));
  if (!game.result) game.phase = HUMAN;
}

export function finishTurn(game) {
  if (game.result) return;
  if (game.turn === 5) {
    for (const id of RELAYS) {
      const w = game.worlds[id];
      w.economy = Math.min(5, w.economy + 1);
      w.industry = Math.min(5, w.industry + 1);
    }
    record(game, 'The relays awaken · +1 Economy, +1 Industry. Held relays now bank 2 prestige each turn.', 'event');
  }
  if (game.turn === 10) record(game, 'Supernova forecast · turn 11 pays no Military income.', 'event');
  if (game.turn === 15) record(game, 'Blockade forecast · attacks cost +8 Military on turns 16–19.', 'event');
  if (game.turn >= 5) for (const id of RELAYS) {
    const w = game.worlds[id];
    if (w.owner) game.empires[w.owner].relayPrestige += 2;
  }
  if (game.turn === 20) endGame(game, 'prestige');
  else { game.turn++; startTurn(game); }
}

export function submitHumanOrder(game, order) {
  if (game.phase !== HUMAN || game.result) return { ok: false, reason: 'The match has ended.' };
  const result = resolveOrder(game, HUMAN, order);
  if (!result.ok || game.result) return result;
  game.phase = 'resolving';
  if (game.turn % 2 === 1) resolveOrder(game, AI, chooseAIAction(game));
  if (!game.result) finishTurn(game);
  return result;
}

function endGame(game, reason, winner) {
  const human = score(game, HUMAN), ai = score(game, AI);
  game.result = { reason, winner: winner || (human.total > ai.total ? HUMAN : ai.total > human.total ? AI : 'draw'), human, ai };
  game.phase = 'ended';
  record(game, reason === 'elimination' ? 'An empire falls. The galaxy has a single sovereign.' : 'The final light fades. The twenty worlds are scored.', 'event');
}

export function forecast(game) {
  if (game.turn <= 5) return { turn: 5, title: 'The awakening', description: 'End of turn 5: both relays gain +1 Economy & Industry. Each held relay banks +2 prestige every turn, through turn 20.' };
  if (game.turn <= 10) return { turn: 11, title: 'A star goes silent', description: 'Turn 11: no new Military for either empire. Credits and existing reserves are unaffected.' };
  if (game.turn <= 15) return { turn: 16, title: 'The great blockade', description: 'Turns 16–19: every attack costs +8 Military. Normal attack costs return on turn 20.' };
  return { turn: 20, title: 'The last light', description: 'Turn 20: the blockade lifts. After both orders and the final relay award, total prestige decides the victor.' };
}
