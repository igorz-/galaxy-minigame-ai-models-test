export const NAMES = [
  "Cinder",
  "Orison",
  "Vesper",
  "Solace",
  "Haven",
  "Nadir",
  "Ionia",
  "Meridian I",
  "Kepler",
  "Oberon",
  "Atlas",
  "Lyra",
  "Meridian II",
  "Eos",
  "Vulcan",
  "Umbra",
  "Talos",
  "Elara",
  "Aster",
  "Pyre",
];
export const LINKS = [];
for (let r = 0; r < 4; r++)
  for (let c = 0; c < 4; c++) LINKS.push([r * 5 + c, r * 5 + c + 1]);
for (let r = 0; r < 3; r++)
  for (const c of [0, 4]) LINKS.push([r * 5 + c, (r + 1) * 5 + c]);
LINKS.push([7, 12]);
export function rng(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function newGame(seed) {
  const random = rng(seed),
    worlds = [];
  for (let i = 0; i < 10; i++) {
    let p = Math.floor(random() * 3);
    if (i === 0) p = 1;
    if (i === 6) p = 0;
    for (const id of [i, 19 - i]) {
      const attrs = [
        [3, 1, 1],
        [1, 3, 1],
        [1, 1, 3],
      ][p];
      worlds[id] = {
        id,
        name: NAMES[id],
        owner: null,
        e: attrs[0],
        i: attrs[1],
        d: attrs[2],
        profile: ["Trade", "Forge", "Bastion"][p],
        captured: null,
        relay: id === 7 || id === 12,
        home: id === 5 || id === 14,
      };
    }
  }
  for (const id of [5, 14])
    Object.assign(worlds[id], {
      owner: id === 5 ? "human" : "ai",
      e: 3,
      i: 2,
      d: 2,
      profile: "Capital",
    });
  for (const id of [7, 12])
    Object.assign(worlds[id], { e: 2, i: 2, d: 2, profile: "Ancient relay" });
  const s = {
    seed,
    turn: 1,
    worlds,
    empires: {
      human: { credits: 14, military: 0, bank: 0 },
      ai: { credits: 14, military: 0, bank: 0 },
    },
    log: [],
    over: false,
    winner: null,
  };
  startTurn(s);
  return s;
}
export const owned = (s, a) => s.worlds.filter((w) => w.owner === a);
export const adjacent = (s, a, id) =>
  LINKS.some(
    ([x, y]) =>
      (x === id && s.worlds[y].owner === a) ||
      (y === id && s.worlds[x].owner === a),
  );
export const income = (s, a) => ({
  credits: owned(s, a).reduce((n, w) => n + 2 * w.e, 0),
  military: s.turn === 11 ? 0 : owned(s, a).reduce((n, w) => n + w.i, 0),
});
export const attackCost = (s, w, turn = s.turn) =>
  4 + 6 * w.d + (turn >= 16 && turn <= 19 ? 8 : 0);
export const protectedAt = (w, t) => w.captured !== null && t <= w.captured + 1;
export function score(s, a) {
  const worlds = owned(s, a),
    planet = worlds.reduce((n, w) => n + 3 + w.e + w.i + w.d, 0),
    bank = s.empires[a].bank;
  return { total: planet + bank, planet, bank, count: worlds.length };
}
export function check(s, a, order) {
  if (!order)
    return {
      ok: false,
      reason: "Choose an order to continue.",
      credits: 0,
      military: 0,
    };
  const w = s.worlds[order.id],
    emp = s.empires[a];
  let credits = order.type === "expand" ? 12 + 4 * owned(s, a).length : 8,
    military = order.type === "attack" && w ? attackCost(s, w) : 0;
  const fail = (reason) => ({ ok: false, reason, credits, military });
  if (s.over) return fail("This expedition has ended.");
  if (!w) return fail("Select a world.");
  if (order.type === "expand") {
    if (w.owner !== null) return fail("Only unclaimed worlds can be settled.");
    if (!adjacent(s, a, w.id))
      return fail("Requires a direct lane to your territory.");
  } else if (order.type === "develop") {
    if (w.owner !== a) return fail("Develop a world under your command.");
    if (!["e", "i", "d"].includes(order.attr))
      return fail("Choose an attribute.");
    if (w[order.attr] >= 5)
      return fail("This attribute is at its maximum level.");
  } else if (order.type === "attack") {
    if (w.owner === null || w.owner === a)
      return fail("Choose a rival-controlled world.");
    if (!adjacent(s, a, w.id))
      return fail("Requires a direct lane to your territory.");
    if (protectedAt(w, s.turn))
      return fail(
        `Protected through turn ${w.captured + 1}. Attackable turn ${w.captured + 2}.`,
      );
  } else return fail("Unknown order.");
  if (emp.credits < credits)
    return fail(`Need ${credits - emp.credits} more Credits.`);
  if (emp.military < military)
    return fail(`Need ${military - emp.military} more Military.`);
  return { ok: true, reason: "Order ready to execute.", credits, military };
}
function log(s, text, actor = "event") {
  s.log.unshift({ turn: s.turn, text, actor });
}
export function resolve(s, a, o) {
  const legal = check(s, a, o);
  if (!legal.ok) return false;
  const w = s.worlds[o.id],
    emp = s.empires[a],
    label = a === "human" ? "You" : "The Directorate";
  emp.credits -= legal.credits;
  emp.military -= legal.military;
  if (o.type === "develop") {
    w[o.attr]++;
    log(
      s,
      `${label} developed ${w.name} · ${{ e: "Economy", i: "Industry", d: "Defense" }[o.attr]} ${w[o.attr]}`,
      a,
    );
  } else {
    w.owner = a;
    if (o.type === "attack") w.captured = s.turn;
    log(
      s,
      `${label} ${o.type === "attack" ? "captured" : "settled"} ${w.name}`,
      a,
    );
    if (
      o.type === "attack" &&
      owned(s, a === "human" ? "ai" : "human").length === 0
    ) {
      s.over = true;
      s.winner = a;
      s.elimination = true;
    }
  }
  return true;
}
function distance(from, to) {
  const queue = [[from, 0]],
    seen = new Set([from]);
  for (const [id, d] of queue) {
    if (id === to) return d;
    for (const [a, b] of LINKS) {
      const next = a === id ? b : b === id ? a : null;
      if (next !== null && !seen.has(next)) {
        seen.add(next);
        queue.push([next, d + 1]);
      }
    }
  }
  return Infinity;
}
export function chooseAI(s) {
  const actions = [];
  for (const w of s.worlds)
    for (const type of ["attack", "expand", "develop"])
      for (const attr of type === "develop" ? ["e", "i", "d"] : [null]) {
        const o = { id: w.id, type, attr };
        if (check(s, "ai", o).ok) actions.push(o);
      }
  const attacks = actions.filter((o) => o.type === "attack"),
    expands = actions.filter((o) => o.type === "expand"),
    devs = actions.filter((o) => o.type === "develop");
  if (owned(s, "human").length === 1 && attacks.length) return attacks[0];
  let pick =
    attacks.find((o) => s.worlds[o.id].relay) ||
    expands.find((o) => s.worlds[o.id].relay);
  if (pick) return pick;
  pick = devs.find((o) => {
    const w = s.worlds[o.id],
      cost = attackCost(s, w, s.turn + 1),
      h = s.empires.human;
    return (
      o.attr === "d" &&
      w.relay &&
      adjacent(s, "human", w.id) &&
      !protectedAt(w, s.turn + 1) &&
      h.credits >= 8 &&
      h.military >= cost &&
      h.military < cost + 6
    );
  });
  if (pick) return pick;
  attacks.sort((a, b) => {
    const x = s.worlds[a.id],
      y = s.worlds[b.id];
    return (
      y.e + y.i + y.d - (x.e + x.i + x.d) ||
      attackCost(s, x) - attackCost(s, y) ||
      a.id - b.id
    );
  });
  if (attacks.length) return attacks[0];
  const relays = s.worlds.filter(
    (w) => w.relay && w.owner === null && !adjacent(s, "ai", w.id),
  );
  if (expands.length) {
    expands.sort((a, b) => {
      const x = s.worlds[a.id],
        y = s.worlds[b.id];
      const dx = relays.length
          ? Math.min(...relays.map((r) => distance(x.id, r.id)))
          : 0,
        dy = relays.length
          ? Math.min(...relays.map((r) => distance(y.id, r.id)))
          : 0;
      return dx - dy || y.e + y.i - (x.e + x.i) || y.e - x.e || x.id - y.id;
    });
    return expands[0];
  }
  if (s.turn <= 16) {
    const preferred = income(s, "ai").credits < 12 ? "e" : "i";
    return (
      devs.find((o) => o.attr === preferred) ||
      devs.find((o) => o.attr === (preferred === "e" ? "i" : "e")) ||
      null
    );
  }
  return (
    devs.find(
      (o) =>
        o.attr === "d" && s.worlds[o.id].relay && adjacent(s, "human", o.id),
    ) ||
    devs[0] ||
    null
  );
}
function aiTurn(s) {
  const o = chooseAI(s);
  if (o) resolve(s, "ai", o);
  else log(s, "The Directorate held position.", "ai");
}
export function startTurn(s) {
  for (const a of ["human", "ai"]) {
    const inc = income(s, a);
    s.empires[a].credits += inc.credits;
    s.empires[a].military += inc.military;
  }
  if (s.turn % 2 === 0) aiTurn(s);
}
export function finishTurn(s) {
  if (s.over) return;
  if (s.turn === 5) {
    for (const w of s.worlds.filter((w) => w.relay)) {
      w.e = Math.min(5, w.e + 1);
      w.i = Math.min(5, w.i + 1);
    }
    log(s, "The relays awaken. +1 Economy and Industry; prestige flows.");
  }
  if (s.turn === 10)
    log(s, "Supernova incoming. No Military income on turn 11.");
  if (s.turn === 15)
    log(s, "Blockade incoming. Attacks cost +8 Military on turns 16–19.");
  if (s.turn >= 5)
    for (const w of s.worlds.filter((w) => w.relay && w.owner))
      s.empires[w.owner].bank += 2;
  if (s.turn === 20) {
    s.over = true;
    const h = score(s, "human").total,
      a = score(s, "ai").total;
    s.winner = h === a ? "draw" : h > a ? "human" : "ai";
  } else {
    s.turn++;
    startTurn(s);
  }
}
export function humanOrder(s, o) {
  if (s.over) return false;
  if (o && !resolve(s, "human", o)) return false;
  if (!o) log(s, "You held position.", "human");
  if (s.over) return true;
  if (s.turn % 2) aiTurn(s);
  finishTurn(s);
  return true;
}
