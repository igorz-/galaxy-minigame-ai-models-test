export const HUMAN = 'human';
export const AI = 'ai';
export const RELAYS = [7, 12];
export const ATTRS = ['economy', 'industry', 'defense'];
export const NAMES = ['Aster', 'Caldera', 'Vesper', 'Hollow', 'Solace', 'Nadir', 'Aurelia', 'Meridian I', 'Kestrel', 'Obsidian', 'Eos', 'Cinder', 'Meridian II', 'Arcadia', 'Vulcan', 'Halcyon', 'Borealis', 'Echo', 'Sable', 'Terminus'];
export const LINKS = [];
for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) LINKS.push([r * 5 + c, r * 5 + c + 1]);
for (let r = 0; r < 3; r++) for (const c of [0, 4]) LINKS.push([r * 5 + c, (r + 1) * 5 + c]);
LINKS.push([7, 12]);

export function mulberry32(seed) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export const neighbors = id => LINKS.flatMap(([a, b]) => a === id ? [b] : b === id ? [a] : []);
export const owned = (s, actor) => s.worlds.filter(w => w.owner === actor);
export const adjacent = (s, actor, id) => neighbors(id).some(n => s.worlds[n].owner === actor);
export const blockade = turn => turn >= 16 && turn <= 19;
export const attackCost = (world, turn) => 4 + 6 * world.defense + (blockade(turn) ? 8 : 0);
export const protectedAt = (world, turn) => world.captured !== null && turn <= world.captured + 1;
export const income = (s, actor, turn = s.turn) => owned(s, actor).reduce((a, w) => ({ credits: a.credits + 2 * w.economy, military: a.military + (turn === 11 ? 0 : w.industry) }), { credits: 0, military: 0 });
export function score(s, actor) {
  const worlds = owned(s, actor);
  const planet = worlds.reduce((sum, w) => sum + 3 + w.economy + w.industry + w.defense, 0);
  return { count: worlds.length, planet, relay: s.empires[actor].prestige, total: planet + s.empires[actor].prestige };
}
export function createGame(seed = Math.floor(Math.random() * 4294967296)) {
  const random = mulberry32(seed >>> 0);
  const profiles = [{ profile: 'Trade', economy: 3, industry: 1, defense: 1 }, { profile: 'Forge', economy: 1, industry: 3, defense: 1 }, { profile: 'Bastion', economy: 1, industry: 1, defense: 3 }];
  const worlds = Array(20);
  for (let id = 0; id < 10; id++) {
    const profile = profiles[Math.floor(random() * 3)];
    for (const n of [id, 19 - id]) worlds[n] = { id: n, name: NAMES[n], ...profile, owner: null, relay: RELAYS.includes(n), home: n === 5 || n === 14, captured: null };
  }
  for (const id of [0, 19]) Object.assign(worlds[id], profiles[1]);
  for (const id of [6, 13]) Object.assign(worlds[id], profiles[0]);
  for (const id of [5, 14]) Object.assign(worlds[id], { profile: 'Homeworld', economy: 3, industry: 2, defense: 2, owner: id === 5 ? HUMAN : AI });
  for (const id of RELAYS) Object.assign(worlds[id], { profile: 'Ancient relay', economy: 2, industry: 2, defense: 2 });
  const s = { seed: seed >>> 0, turn: 1, worlds, empires: { human: { credits: 14, military: 0, prestige: 0 }, ai: { credits: 14, military: 0, prestige: 0 } }, logs: [], over: false, winner: null, phase: 'human' };
  log(s, 'event', 'Expedition established. The Orpheus Reach awaits.');
  startTurn(s);
  return s;
}
export function log(s, actor, text) { s.logs.push({ turn: s.turn, actor, text }); }
export function legality(s, actor, order) {
  const fail = reason => ({ ok: false, credits: 0, military: 0, reason });
  if (s.over) return fail('This expedition has ended. Start a new galaxy to play again.');
  if (!order) return fail('Choose an order to see its price and effect.');
  if (order.type === 'pass') return { ok: true, credits: 0, military: 0, reason: 'Save your reserves. The rival still takes its order.' };
  const w = s.worlds[order.target];
  if (!w) return fail('Select a world on the chart.');
  let credits = 0, military = 0, reason = '';
  if (order.type === 'expand') {
    credits = 12 + 4 * owned(s, actor).length;
    if (w.owner) reason = 'Expansion requires a neutral world.';
    else if (!adjacent(s, actor, w.id)) reason = 'No direct lane from your territory.';
  } else if (order.type === 'develop') {
    credits = 8;
    if (w.owner !== actor) reason = 'You can only develop your own worlds.';
    else if (!ATTRS.includes(order.attr)) reason = 'Choose an attribute to develop.';
    else if (w[order.attr] >= 5) reason = 'This attribute is already at the maximum level of 5.';
  } else if (order.type === 'attack') {
    credits = 8; military = attackCost(w, s.turn);
    if (!w.owner || w.owner === actor) reason = 'An attack requires a rival-owned world.';
    else if (!adjacent(s, actor, w.id)) reason = 'No direct lane from your territory.';
    else if (protectedAt(w, s.turn)) reason = `Capture-protected through turn ${w.captured + 1}. Attackable on turn ${w.captured + 2}.`;
  } else return fail('Unknown order.');
  if (!reason && s.empires[actor].credits < credits) reason = `Insufficient Credits. You need ${credits}; you have ${s.empires[actor].credits}.`;
  if (!reason && s.empires[actor].military < military) reason = `Insufficient Military. You need ${military}; you have ${s.empires[actor].military}.`;
  return { ok: !reason, credits, military, reason };
}
export function executeOrder(s, actor, order) {
  const check = legality(s, actor, order);
  if (!check.ok) return check;
  const empire = s.empires[actor];
  empire.credits -= check.credits; empire.military -= check.military;
  const w = s.worlds[order.target];
  const who = actor === HUMAN ? 'You' : 'The Vesper Union';
  if (order.type === 'pass') log(s, actor, `${who} held position and saved reserves.`);
  if (order.type === 'expand') { w.owner = actor; log(s, actor, `${who} colonized ${w.name} for ${check.credits} Credits.`); }
  if (order.type === 'develop') { w[order.attr]++; log(s, actor, `${who} developed ${w.name}: ${order.attr} → ${w[order.attr]}.`); }
  if (order.type === 'attack') {
    w.owner = actor; w.captured = s.turn;
    log(s, actor, `${who} captured ${w.name} for 8 Credits / ${check.military} Military. Protected through T${s.turn + 1}.`);
    const other = actor === HUMAN ? AI : HUMAN;
    if (!owned(s, other).length) { s.over = true; s.winner = actor; s.phase = 'ended'; s.ending = 'elimination'; log(s, 'event', 'The final opposing world has fallen. The expedition is over.'); }
  }
  return check;
}
function distance(a, b) {
  const seen = new Set([a]), queue = [[a, 0]];
  for (const [id, d] of queue) { if (id === b) return d; for (const n of neighbors(id)) if (!seen.has(n)) { seen.add(n); queue.push([n, d + 1]); } }
  return Infinity;
}
export function chooseAIAction(s) {
  const legal = o => legality(s, AI, o).ok;
  const attack = s.worlds.filter(w => legal({ type: 'attack', target: w.id }));
  const expansion = s.worlds.filter(w => legal({ type: 'expand', target: w.id }));
  const action = (type, w, attr) => ({ type, target: w.id, ...(attr ? { attr } : {}) });
  if (owned(s, HUMAN).length === 1 && attack.length) return action('attack', attack[0]);
  const enemyRelay = attack.find(w => w.relay);
  if (enemyRelay) return action('attack', enemyRelay);
  const neutralRelay = expansion.find(w => w.relay);
  if (neutralRelay) return action('expand', neutralRelay);
  for (const w of owned(s, AI).filter(w => w.relay && adjacent(s, HUMAN, w.id))) {
    if (protectedAt(w, s.turn + 1)) continue;
    const cost = attackCost(w, s.turn + 1), human = s.empires.human;
    const o = action('develop', w, 'defense');
    if (human.credits >= 8 && human.military >= cost && human.military < cost + 6 && legal(o)) return o;
  }
  attack.sort((a, b) => (3 + b.economy + b.industry + b.defense) - (3 + a.economy + a.industry + a.defense) || attackCost(a, s.turn) - attackCost(b, s.turn) || a.id - b.id);
  if (attack.length) return action('attack', attack[0]);
  const goals = s.worlds.filter(w => w.relay && !w.owner && !adjacent(s, AI, w.id));
  expansion.sort((a, b) => {
    if (goals.length) {
      const d = Math.min(...goals.map(w => distance(a.id, w.id))) - Math.min(...goals.map(w => distance(b.id, w.id)));
      if (d) return d;
    }
    return b.economy + b.industry - a.economy - a.industry || b.economy - a.economy || a.id - b.id;
  });
  if (expansion.length) return action('expand', expansion[0]);
  const worlds = owned(s, AI);
  if (s.turn <= 16) {
    const preferred = income(s, AI).credits < 12 ? ['economy', 'industry'] : ['industry', 'economy'];
    for (const attr of preferred) for (const w of worlds) { const o = action('develop', w, attr); if (legal(o)) return o; }
  } else {
    for (const w of worlds.filter(w => w.relay && adjacent(s, HUMAN, w.id))) { const o = action('develop', w, 'defense'); if (legal(o)) return o; }
    for (const w of worlds) for (const attr of ATTRS) { const o = action('develop', w, attr); if (legal(o)) return o; }
  }
  return { type: 'pass' };
}
export function startTurn(s) {
  if (s.over) return;
  for (const actor of [HUMAN, AI]) {
    const gain = income(s, actor);
    s.empires[actor].credits += gain.credits; s.empires[actor].military += gain.military;
  }
  s.phase = HUMAN;
  if (s.turn === 11) log(s, 'event', 'Supernova active: no Military income this turn. Credits and reserves are unaffected.');
  if (s.turn === 16) log(s, 'event', 'Blockade active: all attacks cost +8 Military through turn 19.');
  if (s.turn === 20) log(s, 'event', 'The blockade has lifted. This is the final turn.');
  if (s.turn % 2 === 0) executeOrder(s, AI, chooseAIAction(s));
}
export function finishTurn(s) {
  if (s.over) return;
  if (s.turn === 5) {
    for (const id of RELAYS) { const w = s.worlds[id]; w.economy = Math.min(5, w.economy + 1); w.industry = Math.min(5, w.industry + 1); }
    log(s, 'event', 'The relays awaken. Both gain +1 Economy and +1 Industry; held relays now bank 2 prestige each turn.');
  }
  if (s.turn === 10) log(s, 'event', 'Supernova forecast: turn 11 generates no new Military for either empire.');
  if (s.turn === 15) log(s, 'event', 'Blockade forecast: attacks cost +8 Military on turns 16–19.');
  awardRelayPrestige(s);
  if (s.turn === 20) {
    const h = score(s, HUMAN).total, a = score(s, AI).total;
    s.over = true; s.phase = 'ended'; s.ending = 'prestige'; s.winner = h === a ? 'draw' : h > a ? HUMAN : AI;
    log(s, 'event', `The Reach falls silent. Final prestige: ${h} to ${a}.`);
  } else { s.turn++; startTurn(s); }
}
export function awardRelayPrestige(s) {
  if (s.turn < 5 || s.turn > 20 || s.over) return;
  for (const id of RELAYS) {
    const w = s.worlds[id]; if (w.owner) s.empires[w.owner].prestige += 2;
  }
}
export function commitHuman(s, order) {
  if (s.phase !== HUMAN || s.over) return { ok: false, reason: 'It is not your phase.' };
  const result = executeOrder(s, HUMAN, order);
  if (!result.ok || s.over) return result;
  if (s.turn % 2 === 1) executeOrder(s, AI, chooseAIAction(s));
  if (!s.over) finishTurn(s);
  return result;
}
export function forecast(s) {
  if (s.turn <= 5) return { turn: 5, title: 'The awakening', text: 'Both relays gain +1 Economy & Industry. Held relays begin earning 2 prestige per turn.', active: false };
  if (s.turn <= 10) return { turn: 11, title: 'A star goes silent', text: 'Supernova: neither empire receives Military income on turn 11. Existing reserves remain.', active: false };
  if (s.turn === 11) return { turn: 11, title: 'Supernova', text: 'No new Military this turn. Your Credits and existing Military reserves are unaffected.', active: true };
  if (s.turn <= 15) return { turn: 16, title: 'The long blockade', text: 'Every attack costs 8 extra Military during turns 16–19. Normal costs return on turn 20.', active: false };
  if (s.turn <= 19) return { turn: 20, title: 'The final horizon', text: 'Blockade active: attacks cost +8 Military. It lifts on turn 20, before your final orders and scoring.', active: true };
  return { turn: 20, title: 'The final horizon', text: 'Normal attack costs restored. After this turn: final relay awards, then total prestige decides the winner.', active: true };
}
