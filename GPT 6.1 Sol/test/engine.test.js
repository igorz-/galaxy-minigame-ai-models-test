import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  LINKS,
  RELAYS,
  owned,
  income,
  score,
  legality,
  resolveOrder,
  humanOrder,
  attackCost,
  protectedAt,
  chooseAIAction,
  resolveEvent,
  awardRelayPrestige,
  startTurn,
  finishTurn,
  endGame,
} from "../src/engine.js";

const expand = (target) => ({ type: "expand", target });
const develop = (target, attribute = "economy") => ({
  type: "develop",
  target,
  attribute,
});
const attack = (target) => ({ type: "attack", target });
const pass = { type: "pass" };
const rich = (s) => {
  for (const a of ["human", "ai"])
    Object.assign(s.empires[a], { credits: 1000, military: 1000 });
  return s;
};

test("exact topology, homes, relays, forced profiles and symmetric seeded attributes", () => {
  for (const seed of [0, 1, 42, 4294967295]) {
    const s = createGame(seed);
    assert.equal(s.worlds.length, 20);
    assert.equal(LINKS.length, 23);
    assert.equal(new Set(LINKS.map((l) => l.join(","))).size, 23);
    assert.deepEqual(
      owned(s, "human").map((w) => w.id),
      [5],
    );
    assert.deepEqual(
      owned(s, "ai").map((w) => w.id),
      [14],
    );
    assert.deepEqual(
      s.worlds.filter((w) => w.relay).map((w) => w.id),
      [7, 12],
    );
    assert.equal(s.worlds[0].profile, "Forge");
    assert.equal(s.worlds[19].profile, "Forge");
    assert.equal(s.worlds[6].profile, "Trade");
    assert.equal(s.worlds[13].profile, "Trade");
    for (let id = 0; id < 10; id++)
      for (const a of ["economy", "industry", "defense"])
        assert.equal(s.worlds[id][a], s.worlds[19 - id][a]);
    assert.deepEqual(createGame(seed), s);
  }
  assert.notDeepEqual(createGame(1).worlds, createGame(2).worlds);
});
test("turn 1 income precedes commands; income pays once on subsequent turns", () => {
  const s = createGame(1);
  for (const a of ["human", "ai"])
    assert.deepEqual(s.empires[a], { credits: 20, military: 2, prestige: 0 });
  humanOrder(s, pass);
  assert.equal(s.turn, 2);
  assert.equal(s.empires.human.credits, 26);
  assert.equal(s.empires.human.military, 4);
  humanOrder(s, pass);
  assert.equal(s.turn, 3);
  assert.equal(s.empires.human.credits, 32);
  assert.equal(s.empires.human.military, 6);
});
test("initiative alternates and each side issues exactly one order per shared turn", () => {
  const s = createGame(42);
  humanOrder(s, pass);
  assert.deepEqual(
    s.log.filter((l) => l.kind !== "event").map((l) => [l.turn, l.actor]),
    [
      [1, "human"],
      [1, "ai"],
      [2, "ai"],
    ],
  );
  humanOrder(s, pass);
  humanOrder(s, pass);
  const entries = s.log.filter((l) => l.kind !== "event");
  assert.deepEqual(
    entries.filter((l) => l.turn === 2).map((l) => l.actor),
    ["ai", "human"],
  );
  assert.deepEqual(
    entries.filter((l) => l.turn === 3).map((l) => l.actor),
    ["human", "ai"],
  );
});
test("expansion costs 16, 20, 24; direct adjacency required; attributes preserved", () => {
  const s = rich(createGame(1));
  assert.equal(legality(s, "human", expand(6)).credits, 16);
  assert.equal(legality(s, "human", expand(7)).legal, false);
  const old = { ...s.worlds[6] };
  resolveOrder(s, "human", expand(6));
  assert.equal(s.worlds[6].economy, old.economy);
  assert.equal(s.worlds[6].capturedTurn, null);
  assert.equal(legality(s, "human", expand(7)).credits, 20);
  resolveOrder(s, "human", expand(7));
  assert.equal(legality(s, "human", expand(8)).credits, 24);
  assert.equal(s.empires.human.military, 1000);
});
test("exact affordability works; illegal orders spend nothing and preserve human phase", () => {
  const s = createGame(1),
    snapshot = structuredClone(s);
  assert.equal(humanOrder(s, expand(7)).legal, false);
  assert.deepEqual(s, snapshot);
  s.empires.human.credits = 16;
  assert.equal(resolveOrder(s, "human", expand(6)).legal, true);
  assert.equal(s.empires.human.credits, 0);
  assert.equal(resolveOrder(s, "human", expand(7)).legal, false);
  assert.equal(s.empires.human.credits, 0);
});
test("develop costs 8, changes one attribute, caps at 5; new income only next turn", () => {
  const s = createGame(1);
  assert.equal(legality(s, "human", develop(5)).credits, 8);
  resolveOrder(s, "human", develop(5));
  assert.equal(s.worlds[5].economy, 4);
  assert.equal(s.worlds[5].industry, 2);
  assert.equal(s.empires.human.credits, 12);
  resolveOrder(s, "human", develop(5));
  assert.equal(s.worlds[5].economy, 5);
  assert.equal(s.empires.human.credits, 4);
  assert.equal(legality(s, "human", develop(5)).legal, false);
  const before = s.empires.human.credits;
  finishTurn(s);
  assert.equal(s.empires.human.credits, before + 10);
});
test("attack uses target Defense and active blockade; no attributes or defender reserves lost", () => {
  const s = createGame(1);
  s.worlds[6].owner = "ai";
  s.worlds[6].defense = 2;
  Object.assign(s.empires.human, { credits: 8, military: 16 });
  const before = { ...s.empires.ai },
    world = { ...s.worlds[6] };
  assert.equal(resolveOrder(s, "human", attack(6)).legal, true);
  assert.equal(s.empires.human.credits, 0);
  assert.equal(s.empires.human.military, 0);
  assert.deepEqual(s.empires.ai, before);
  for (const a of ["economy", "industry", "defense"])
    assert.equal(s.worlds[6][a], world[a]);
  for (const t of [1, 15, 20]) assert.equal(attackCost(world, t), 16);
  for (const t of [16, 17, 18, 19]) assert.equal(attackCost(world, t), 24);
  world.defense++;
  assert.equal(attackCost(world, 1), 22);
});
test("turn-8 capture is protected through turn 9 and attackable turn 10", () => {
  const s = rich(createGame(1));
  s.turn = 8;
  s.worlds[6].owner = "ai";
  s.worlds[7].owner = "ai";
  resolveOrder(s, "human", attack(6));
  assert.equal(s.worlds[6].capturedTurn, 8);
  assert.equal(protectedAt(s.worlds[6], 8), true);
  assert.equal(legality(s, "ai", attack(6)).legal, false);
  s.turn = 9;
  assert.equal(legality(s, "ai", attack(6)).legal, false);
  assert.equal(legality(s, "human", develop(6)).legal, true);
  s.turn = 10;
  assert.equal(legality(s, "ai", attack(6)).legal, true);
});
test("relay awakening upgrades even neutral relays and awards from end of turn 5", () => {
  const s = createGame(1);
  s.worlds[7].owner = "human";
  s.worlds[12].economy = 5;
  s.turn = 4;
  resolveEvent(s);
  awardRelayPrestige(s);
  assert.equal(s.empires.human.prestige, 0);
  s.turn = 5;
  resolveEvent(s);
  awardRelayPrestige(s);
  assert.equal(s.worlds[7].economy, 3);
  assert.equal(s.worlds[7].industry, 3);
  assert.equal(s.worlds[12].economy, 5);
  assert.equal(s.worlds[12].industry, 3);
  assert.equal(s.empires.human.prestige, 2);
  for (s.turn = 6; s.turn <= 20; s.turn++) awardRelayPrestige(s);
  assert.equal(s.empires.human.prestige, 32);
  s.worlds[7].owner = "ai";
  assert.equal(s.empires.human.prestige, 32);
});
test("supernova suppresses only turn 11 Military income, not reserves or Credits", () => {
  const s = createGame(1);
  s.turn = 11;
  assert.deepEqual(income(s, "human"), { credits: 6, military: 0 });
  const before = { ...s.empires.human };
  startTurn(s);
  assert.equal(s.empires.human.credits, before.credits + 6);
  assert.equal(s.empires.human.military, before.military);
  s.turn = 12;
  assert.equal(income(s, "human").military, 2);
});
test("turn 20 final relay award precedes final scoring and ties draw", () => {
  const s = createGame(1);
  s.turn = 20;
  s.worlds[7].owner = "human";
  const before = score(s, "human");
  finishTurn(s);
  assert.equal(s.result.human.relay, 2);
  assert.equal(s.result.human.total, before.total + 2);
  assert.equal(s.turn, 20);
  const tie = createGame(1);
  tie.turn = 20;
  finishTurn(tie);
  assert.equal(tie.result.winner, "draw");
  assert.equal(tie.result.human.planet, 10);
  assert.equal(tie.result.human.worlds, 1);
});
test("losing the home alone is survivable; final-world elimination interrupts orders and awards", () => {
  const s = rich(createGame(1));
  s.turn = 8;
  s.worlds[6].owner = "ai";
  s.worlds[0].owner = "human";
  resolveOrder(s, "ai", attack(5));
  assert.equal(s.result, null);
  assert.equal(owned(s, "human").length, 1);
});
test("elimination immediately ends before AI second action, event, or relay award", () => {
  const s = rich(createGame(1));
  s.turn = 5;
  s.worlds[13].owner = "human";
  s.worlds[7].owner = "human";
  const count = s.log.length;
  humanOrder(s, attack(14));
  assert.equal(s.result.winner, "human");
  assert.equal(s.result.reason, "elimination");
  assert.equal(s.log.slice(count).filter((l) => l.actor === "ai").length, 0);
  assert.equal(s.empires.human.prestige, 0);
  assert.equal(s.worlds[7].economy, 2);
  const snapshot = structuredClone(s);
  assert.equal(humanOrder(s, pass).legal, false);
  assert.deepEqual(s, snapshot);
});
test("planet value includes developed attributes, not resource reserves", () => {
  const s = rich(createGame(1));
  assert.equal(score(s, "human").total, 10);
  resolveOrder(s, "human", develop(5, "defense"));
  assert.equal(score(s, "human").total, 11);
  s.empires.human.prestige = 6;
  assert.equal(score(s, "human").total, 17);
});
test("AI prioritizes final-world elimination over a relay", () => {
  const s = rich(createGame(1));
  s.worlds[6].owner = "ai";
  s.worlds[8].owner = "ai";
  s.worlds[7].owner = "human";
  s.worlds[5].owner = null;
  assert.deepEqual(chooseAIAction(s), attack(7));
});
test("AI captures relays before expanding; lower relay ID wins a tie", () => {
  const s = rich(createGame(1));
  s.worlds[0].owner = "human";
  s.worlds[6].owner = "ai";
  s.worlds[11].owner = "ai";
  s.worlds[7].owner = "human";
  s.worlds[12].owner = "human";
  assert.deepEqual(chooseAIAction(s), attack(7));
  s.worlds[7].owner = null;
  assert.deepEqual(chooseAIAction(s), attack(12));
  s.worlds[12].owner = null;
  assert.deepEqual(chooseAIAction(s), expand(7));
});
test("AI defensive relay upgrade follows exact next-turn affordability and protection", () => {
  const s = createGame(1);
  s.worlds[7].owner = "ai";
  s.worlds[6].owner = "human";
  s.worlds[12].owner = "ai";
  s.empires.ai.credits = 8;
  s.empires.human.credits = 8;
  s.empires.human.military = 16;
  assert.deepEqual(chooseAIAction(s), develop(7, "defense"));
  s.worlds[7].capturedTurn = s.turn;
  assert.notDeepEqual(chooseAIAction(s), develop(7, "defense"));
});
test("AI passes with no resources and no legal orders", () => {
  const s = createGame(1);
  s.empires.ai.credits = 0;
  s.empires.ai.military = 0;
  assert.deepEqual(chooseAIAction(s), pass);
});
test("same seed and human orders produce identical complete matches", () => {
  const a = createGame(994),
    b = createGame(994);
  for (let i = 0; i < 20 && !a.result; i++) {
    humanOrder(a, pass);
    humanOrder(b, pass);
    assert.deepEqual(a, b);
  }
  assert.ok(a.result);
  assert.ok(a.turn <= 20);
  assert.deepEqual(createGame(994), createGame(a.seed));
});
test("200 seeded complete matches preserve resource, attribute, topology and order invariants", () => {
  for (let seed = 0; seed < 200; seed++) {
    const s = createGame(seed);
    let moves = 0;
    while (!s.result && moves < 20) {
      const options = s.worlds.flatMap((w) => [
        expand(w.id),
        attack(w.id),
        ...["economy", "industry", "defense"].map((a) => develop(w.id, a)),
      ]);
      const legal = options.filter((o) => legality(s, "human", o).legal);
      humanOrder(
        s,
        legal.length ? legal[(seed + moves * 7) % legal.length] : pass,
      );
      moves++;
      for (const a of ["human", "ai"]) {
        assert.ok(s.empires[a].credits >= 0);
        assert.ok(s.empires[a].military >= 0);
      }
      for (const w of s.worlds)
        for (const a of ["economy", "industry", "defense"])
          assert.ok(w[a] >= 1 && w[a] <= 5);
    }
    assert.ok(s.result);
    assert.equal(s.worlds.length, 20);
    assert.equal(LINKS.length, 23);
    for (let turn = 1; turn <= 20; turn++)
      for (const actor of ["human", "ai"])
        assert.ok(
          s.log.filter((l) => l.turn === turn && l.actor === actor).length <= 1,
        );
  }
});
