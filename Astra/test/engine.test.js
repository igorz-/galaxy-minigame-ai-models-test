import test from "node:test";
import assert from "node:assert/strict";
import {
  newGame,
  LINKS,
  owned,
  income,
  score,
  check,
  resolve,
  humanOrder,
  finishTurn,
  startTurn,
  chooseAI,
  attackCost,
  protectedAt,
} from "../src/engine.js";
test("seeded symmetric galaxy, topology and first income", () => {
  const s = newGame(42);
  assert.equal(s.worlds.length, 20);
  assert.equal(LINKS.length, 23);
  assert.equal(new Set(LINKS.flat()).size, 20);
  assert.equal(s.worlds.filter((w) => w.relay).length, 2);
  assert.equal(s.worlds.filter((w) => w.home).length, 2);
  for (const w of s.worlds) {
    const other = s.worlds[19 - w.id];
    assert.deepEqual([w.e, w.i, w.d], [other.e, other.i, other.d]);
  }
  assert.equal(s.empires.human.credits, 20);
  assert.equal(s.empires.ai.military, 2);
  assert.deepEqual(s, newGame(42));
});
test("expansion prices, adjacency, invalid orders and exact payment", () => {
  const s = newGame(2);
  assert.equal(check(s, "human", { id: 6, type: "expand" }).credits, 16);
  assert.equal(check(s, "human", { id: 19, type: "expand" }).ok, false);
  const before = structuredClone(s);
  assert.equal(humanOrder(s, { id: 19, type: "expand" }), false);
  assert.deepEqual(s, before);
  s.empires.human.credits = 16;
  assert.ok(resolve(s, "human", { id: 6, type: "expand" }));
  assert.equal(s.empires.human.credits, 0);
  assert.equal(check(s, "human", { id: 7, type: "expand" }).credits, 20);
  s.empires.human.credits = 20;
  assert.ok(resolve(s, "human", { id: 7, type: "expand" }));
  assert.equal(check(s, "human", { id: 8, type: "expand" }).credits, 24);
});
test("development costs, cap and subsequent income", () => {
  const s = newGame(2),
    before = s.empires.human.credits;
  assert.ok(resolve(s, "human", { id: 5, type: "develop", attr: "e" }));
  assert.equal(s.empires.human.credits, before - 8);
  assert.equal(income(s, "human").credits, 8);
  assert.ok(resolve(s, "human", { id: 5, type: "develop", attr: "e" }));
  assert.equal(s.worlds[5].e, 5);
  s.empires.human.credits = 100;
  assert.equal(
    resolve(s, "human", { id: 5, type: "develop", attr: "e" }),
    false,
  );
});
test("attack exact costs, preserved attributes and protection window", () => {
  const s = newGame(1);
  s.turn = 8;
  s.worlds[6].owner = "ai";
  s.empires.human = { credits: 8, military: 10, bank: 0 };
  const w = s.worlds[6],
    attrs = [w.e, w.i, w.d];
  assert.ok(resolve(s, "human", { id: 6, type: "attack" }));
  assert.deepEqual([w.e, w.i, w.d], attrs);
  assert.equal(s.empires.human.military, 0);
  assert.ok(protectedAt(w, 8));
  assert.ok(protectedAt(w, 9));
  assert.equal(protectedAt(w, 10), false);
  assert.equal(attackCost(s, w, 16), 18);
  assert.equal(attackCost(s, w, 19), 18);
  assert.equal(attackCost(s, w, 20), 10);
});
test("initiative and one order per actor per turn", () => {
  const s = newGame(2);
  assert.equal(s.log.length, 0);
  humanOrder(s, null);
  assert.equal(s.turn, 2);
  assert.equal(s.log.filter((l) => l.turn === 1 && l.actor === "ai").length, 1);
  assert.equal(s.log.filter((l) => l.turn === 2 && l.actor === "ai").length, 1);
  humanOrder(s, null);
  assert.equal(s.turn, 3);
  assert.equal(s.log.filter((l) => l.turn === 2 && l.actor === "ai").length, 1);
  assert.equal(s.log.filter((l) => l.turn === 3 && l.actor === "ai").length, 0);
});
test("relay awakening, prestige and supernova income", () => {
  const s = newGame(3);
  s.worlds[7].owner = "human";
  s.turn = 5;
  finishTurn(s);
  assert.equal(s.worlds[7].e, 3);
  assert.equal(s.worlds[7].i, 3);
  assert.equal(s.empires.human.bank, 2);
  s.turn = 10;
  const mil = s.empires.human.military,
    credits = s.empires.human.credits;
  finishTurn(s);
  assert.equal(s.turn, 11);
  assert.equal(s.empires.human.military, mil);
  assert.equal(s.empires.human.credits, credits + 12);
  assert.equal(income(s, "human").military, 0);
});
test("final relay award included, draw and elimination interruption", () => {
  const s = newGame(1);
  s.turn = 20;
  s.worlds[7].owner = "human";
  finishTurn(s);
  assert.ok(s.over);
  assert.equal(s.empires.human.bank, 2);
  assert.equal(s.winner, "human");
  assert.equal(score(s, "human").total, score(s, "human").planet + 2);
  const tie = newGame(1);
  tie.turn = 20;
  finishTurn(tie);
  assert.equal(tie.winner, "draw");
  const e = newGame(1);
  e.worlds[14].owner = null;
  e.worlds[6].owner = "ai";
  e.turn = 5;
  e.empires.human.military = 100;
  humanOrder(e, { id: 6, type: "attack" });
  assert.ok(e.over);
  assert.equal(e.winner, "human");
  assert.equal(e.worlds[7].e, 2);
  assert.equal(e.log.length, 1);
});
test("deterministic legal AI and complete matches across 100 seeds", () => {
  for (let seed = 0; seed < 100; seed++) {
    const s = newGame(seed);
    let turns = 0;
    while (!s.over && turns++ < 21) {
      const action = chooseAI(s);
      if (action) assert.ok(check(s, "ai", action).ok);
      const candidates = s.worlds
        .map((w) => ({ id: w.id, type: "expand" }))
        .filter((o) => check(s, "human", o).ok);
      humanOrder(s, candidates[0] || null);
      for (const a of ["human", "ai"]) {
        assert.ok(s.empires[a].credits >= 0);
        assert.ok(s.empires[a].military >= 0);
      }
    }
    assert.ok(s.over);
    assert.ok(s.turn <= 20);
  }
});
