export const RELAYS = [7, 12];
export const ATTRS = ["economy", "industry", "defense"];
export const NAMES = [
  "Kepler",
  "Icarus",
  "Osiris",
  "Vesper",
  "Acheron",
  "Nadir",
  "Elysium",
  "Meridian I",
  "Solace",
  "Obsidian",
  "Talos",
  "Arcadia",
  "Meridian II",
  "Helios",
  "Vulcan",
  "Nyx",
  "Caldera",
  "Aurelia",
  "Erebus",
  "Zenith",
];
export const LINKS = [];
for (let r = 0; r < 4; r++)
  for (let c = 0; c < 4; c++) LINKS.push([r * 5 + c, r * 5 + c + 1]);
for (let r = 0; r < 3; r++)
  for (const c of [0, 4]) LINKS.push([r * 5 + c, (r + 1) * 5 + c]);
LINKS.push([7, 12]);

export function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const owned = (s, actor) => s.worlds.filter((w) => w.owner === actor);
export const neighbors = (id) =>
  LINKS.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : []));
export const adjacent = (s, actor, id) =>
  neighbors(id).some((n) => s.worlds[n].owner === actor);
export const protectedAt = (w, turn) =>
  w.capturedTurn !== null && turn <= w.capturedTurn + 1;
export const blockade = (turn) => turn >= 16 && turn <= 19;
export const attackCost = (w, turn) =>
  4 + 6 * w.defense + (blockade(turn) ? 8 : 0);
export function income(s, actor) {
  return owned(s, actor).reduce(
    (v, w) => ({
      credits: v.credits + w.economy * 2,
      military: v.military + (s.turn === 11 ? 0 : w.industry),
    }),
    { credits: 0, military: 0 },
  );
}
export function score(s, actor) {
  const worlds = owned(s, actor);
  const planet = worlds.reduce(
    (sum, w) => sum + 3 + w.economy + w.industry + w.defense,
    0,
  );
  return {
    worlds: worlds.length,
    planet,
    relay: s.empires[actor].prestige,
    total: planet + s.empires[actor].prestige,
  };
}
export function log(s, actor, text, kind = "order") {
  s.log.push({ turn: s.turn, actor, text, kind });
}
export function createGame(seed = 240815) {
  seed = Number(seed) >>> 0;
  const random = mulberry32(seed);
  const profiles = [
    ["Trade", 3, 1, 1],
    ["Forge", 1, 3, 1],
    ["Bastion", 1, 1, 3],
  ];
  const worlds = Array(20);
  for (let i = 0; i < 10; i++) {
    const p = profiles[Math.floor(random() * 3)];
    for (const id of [i, 19 - i]) {
      const [profile, economy, industry, defense] =
        id === 0 || id === 19
          ? profiles[1]
          : id === 6 || id === 13
            ? profiles[0]
            : p;
      worlds[id] = {
        id,
        name: NAMES[id],
        profile,
        economy,
        industry,
        defense,
        owner: null,
        home: null,
        relay: RELAYS.includes(id),
        capturedTurn: null,
      };
    }
  }
  for (const [id, actor] of [
    [5, "human"],
    [14, "ai"],
  ])
    Object.assign(worlds[id], {
      owner: actor,
      home: actor,
      profile: "Homeworld",
      economy: 3,
      industry: 2,
      defense: 2,
    });
  for (const id of RELAYS)
    Object.assign(worlds[id], {
      profile: "Ancient relay",
      economy: 2,
      industry: 2,
      defense: 2,
    });
  const s = {
    seed,
    turn: 1,
    phase: "human",
    worlds,
    empires: {
      human: { credits: 14, military: 0, prestige: 0 },
      ai: { credits: 14, military: 0, prestige: 0 },
    },
    log: [],
    result: null,
  };
  log(s, "system", "Expedition online. The galaxy is yours to shape.", "event");
  startTurn(s);
  return s;
}
export function legality(s, actor, order) {
  const fail = (reason) => ({ legal: false, reason, credits: 0, military: 0 });
  if (s.result) return fail("The expedition has ended.");
  if (!order) return fail("Select an order to continue.");
  if (order.type === "pass")
    return {
      legal: true,
      reason: "Keep your reserves. Take no action this turn.",
      credits: 0,
      military: 0,
    };
  const w = s.worlds[order.target];
  if (!w) return fail("Select a world on the star chart.");
  let credits = 0,
    military = 0,
    effect = "";
  if (order.type === "expand") {
    credits = 12 + 4 * owned(s, actor).length;
    if (w.owner !== null) return fail("Expansion requires a neutral world.");
    if (!adjacent(s, actor, w.id))
      return fail("No direct lane to an owned world.");
    effect = `Claim ${w.name}. Production begins next turn.`;
  } else if (order.type === "develop") {
    credits = 8;
    if (w.owner !== actor) return fail("You can only develop a world you own.");
    if (!ATTRS.includes(order.attribute))
      return fail("Choose an attribute to develop.");
    if (w[order.attribute] >= 5)
      return fail("This attribute is already at the maximum level of 5.");
    effect = `${capitalize(order.attribute)} ${w[order.attribute]} → ${w[order.attribute] + 1}. ${order.attribute === "economy" ? "+2 Credits per future turn." : order.attribute === "industry" ? "+1 Military per future turn." : "+6 Military required to capture this world."}`;
  } else if (order.type === "attack") {
    credits = 8;
    military = attackCost(w, s.turn);
    if (w.owner === null || w.owner === actor)
      return fail("Attack requires a rival-owned world.");
    if (!adjacent(s, actor, w.id))
      return fail("No direct lane to an owned world.");
    if (protectedAt(w, s.turn))
      return fail(
        `Capture-protected through turn ${w.capturedTurn + 1}. Attackable on turn ${w.capturedTurn + 2}.`,
      );
    effect = `Capture ${w.name}. Protected through turn ${s.turn + 1}; attackable turn ${s.turn + 2}.`;
  } else return fail("Unknown order.");
  const reserve = s.empires[actor];
  const reason =
    reserve.credits < credits
      ? `Requires ${credits} Credits; you have ${reserve.credits}.`
      : reserve.military < military
        ? `Requires ${military} Military; you have ${reserve.military}.`
        : effect;
  return {
    legal: reserve.credits >= credits && reserve.military >= military,
    reason,
    credits,
    military,
    effect,
  };
}
export const capitalize = (s) => s[0].toUpperCase() + s.slice(1);
export function resolveOrder(s, actor, order) {
  const check = legality(s, actor, order);
  if (!check.legal) return check;
  s.empires[actor].credits -= check.credits;
  s.empires[actor].military -= check.military;
  const w = s.worlds[order.target];
  if (order.type === "expand") {
    w.owner = actor;
    log(s, actor, `Colonized ${w.name}.`, "expand");
  }
  if (order.type === "develop") {
    w[order.attribute]++;
    log(
      s,
      actor,
      `${w.name}: ${capitalize(order.attribute)} raised to ${w[order.attribute]}.`,
      "develop",
    );
  }
  if (order.type === "attack") {
    w.owner = actor;
    w.capturedTurn = s.turn;
    log(s, actor, `Captured ${w.name} · ${check.military} Military.`, "attack");
    const enemy = actor === "human" ? "ai" : "human";
    if (!owned(s, enemy).length) endGame(s, actor, "elimination");
  }
  if (order.type === "pass")
    log(s, actor, "Held position. Reserves preserved.", "pass");
  return check;
}
const distance = (from, to) => {
  const queue = [[from, 0]],
    visited = new Set([from]);
  for (let i = 0; i < queue.length; i++) {
    const [id, d] = queue[i];
    if (id === to) return d;
    for (const n of neighbors(id))
      if (!visited.has(n)) {
        visited.add(n);
        queue.push([n, d + 1]);
      }
  }
  return Infinity;
};
export function chooseAIAction(s) {
  const legal = (o) => legality(s, "ai", o).legal;
  const attack = s.worlds
    .map((w) => ({ type: "attack", target: w.id }))
    .filter(legal);
  const expand = s.worlds
    .map((w) => ({ type: "expand", target: w.id }))
    .filter(legal);
  const development = owned(s, "ai")
    .flatMap((w) =>
      ATTRS.map((attribute) => ({ type: "develop", target: w.id, attribute })),
    )
    .filter(legal);
  if (owned(s, "human").length === 1 && attack.length) return attack[0];
  for (const list of [attack, expand]) {
    const relay = list.find((o) => RELAYS.includes(o.target));
    if (relay) return relay;
  }
  for (const w of owned(s, "ai").filter(
    (w) => w.relay && adjacent(s, "human", w.id),
  )) {
    const o = { type: "develop", target: w.id, attribute: "defense" };
    const cost = attackCost(w, s.turn + 1);
    const human = s.empires.human;
    if (
      !protectedAt(w, s.turn + 1) &&
      human.credits >= 8 &&
      human.military >= cost &&
      human.military < cost + 6 &&
      legal(o)
    )
      return o;
  }
  if (attack.length)
    return attack.sort((a, b) => {
      const x = s.worlds[a.target],
        y = s.worlds[b.target];
      return (
        y.economy +
          y.industry +
          y.defense -
          (x.economy + x.industry + x.defense) ||
        attackCost(x, s.turn) - attackCost(y, s.turn) ||
        x.id - y.id
      );
    })[0];
  if (expand.length) {
    const distant = s.worlds.filter(
      (w) => w.relay && w.owner === null && !adjacent(s, "ai", w.id),
    );
    const toward = expand
      .map((o) => ({
        o,
        d: Math.min(
          ...distant
            .filter(
              (r) =>
                distance(o.target, r.id) <
                Math.min(...owned(s, "ai").map((w) => distance(w.id, r.id))),
            )
            .map((r) => distance(o.target, r.id)),
        ),
      }))
      .filter((x) => Number.isFinite(x.d));
    if (toward.length)
      return toward.sort((a, b) => a.d - b.d || a.o.target - b.o.target)[0].o;
    return expand.sort((a, b) => {
      const x = s.worlds[a.target],
        y = s.worlds[b.target];
      return (
        y.economy + y.industry - (x.economy + x.industry) ||
        y.economy - x.economy ||
        x.id - y.id
      );
    })[0];
  }
  if (s.turn <= 16) {
    const preferred = income(s, "ai").credits < 12 ? "economy" : "industry";
    for (const attribute of [
      preferred,
      preferred === "economy" ? "industry" : "economy",
    ]) {
      const o = development.find((o) => o.attribute === attribute);
      if (o) return o;
    }
  } else {
    const fortify = development.find(
      (o) =>
        o.attribute === "defense" &&
        s.worlds[o.target].relay &&
        adjacent(s, "human", o.target),
    );
    if (fortify) return fortify;
    if (development.length) return development[0];
  }
  return { type: "pass" };
}
export function resolveEvent(s) {
  if (s.turn === 5) {
    for (const id of RELAYS) {
      const w = s.worlds[id];
      w.economy = Math.min(5, w.economy + 1);
      w.industry = Math.min(5, w.industry + 1);
    }
    log(
      s,
      "system",
      "Relays awakened. +1 Economy and Industry; held relays now bank 2 prestige each turn.",
      "event",
    );
  }
  if (s.turn === 10)
    log(
      s,
      "system",
      "Supernova incoming. No new Military on turn 11; Credit income is unaffected.",
      "event",
    );
  if (s.turn === 15)
    log(
      s,
      "system",
      "Blockade incoming. Attacks cost +8 Military on turns 16–19. Lifts on turn 20.",
      "event",
    );
}
export function awardRelayPrestige(s) {
  if (s.turn >= 5)
    for (const id of RELAYS) {
      const owner = s.worlds[id].owner;
      if (owner) s.empires[owner].prestige += 2;
    }
}
export function endGame(s, winner, reason) {
  const human = score(s, "human"),
    ai = score(s, "ai");
  s.result = {
    winner:
      reason === "elimination"
        ? winner
        : human.total === ai.total
          ? "draw"
          : human.total > ai.total
            ? "human"
            : "ai",
    reason,
    human,
    ai,
  };
  s.phase = "ended";
  log(
    s,
    "system",
    reason === "elimination"
      ? "An empire has fallen. The expedition is over."
      : "The final signal. All worlds have been scored.",
    "event",
  );
}
export function startTurn(s) {
  if (s.result) return;
  for (const actor of ["human", "ai"]) {
    const gain = income(s, actor);
    s.empires[actor].credits += gain.credits;
    s.empires[actor].military += gain.military;
  }
  if (s.turn % 2 === 0) resolveOrder(s, "ai", chooseAIAction(s));
  if (!s.result) s.phase = "human";
}
export function finishTurn(s) {
  if (s.result) return;
  resolveEvent(s);
  awardRelayPrestige(s);
  if (s.turn === 20) {
    endGame(s, null, "prestige");
    return;
  }
  s.turn++;
  startTurn(s);
}
export function humanOrder(s, order) {
  if (s.phase !== "human" || s.result)
    return { legal: false, reason: "It is not your command phase." };
  const check = resolveOrder(s, "human", order);
  if (!check.legal || s.result) return check;
  s.phase = "resolving";
  if (s.turn % 2 === 1) resolveOrder(s, "ai", chooseAIAction(s));
  finishTurn(s);
  return check;
}
export function forecast(s) {
  if (s.turn <= 5)
    return {
      turn: 5,
      title: "The awakening",
      text: "At end of turn 5, both relays gain +1 Economy & Industry. Each held relay banks 2 prestige every turn, starting then.",
    };
  if (s.turn <= 10)
    return {
      turn: 11,
      title: "Supernova",
      text: "On turn 11, both empires gain zero new Military. Credits and existing Military reserves are unaffected.",
    };
  if (s.turn === 11)
    return {
      turn: 11,
      title: "Supernova active",
      text: "No Military income this turn. Normal production resumes on turn 12. Credits and reserves are unaffected.",
      active: true,
    };
  if (s.turn <= 15)
    return {
      turn: 16,
      title: "The blockade",
      text: "On turns 16–19, every attack costs 8 extra Military. The blockade lifts before turn-20 orders.",
    };
  if (s.turn <= 19)
    return {
      turn: 20,
      title: "Blockade active",
      text: "Attacks cost +8 Military now, through turn 19. Normal attack costs return on turn 20.",
      active: true,
    };
  return {
    turn: 20,
    title: "The final signal",
    text: "The blockade has lifted. After these orders and the final relay award, total prestige decides the winner.",
  };
}
