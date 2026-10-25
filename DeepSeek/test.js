'use strict';
const assert = require('assert');
const VE = require('./game.js');

let tests = 0;
function test(name, fn) {
  tests += 1;
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function fresh(seed = 123456789) {
  return VE.createGame(seed);
}

test('map: 20 worlds, 23 lanes, homes and relays', () => {
  const g = fresh();
  assert.strictEqual(g.worlds.length, 20);
  assert.strictEqual(VE.LINKS.length, 23);
  assert.strictEqual(g.worlds[5].owner, VE.HUMAN);
  assert.strictEqual(g.worlds[14].owner, VE.AI);
  assert.strictEqual(g.worlds[5].kind, 'home');
  assert.strictEqual(g.worlds[14].kind, 'home');
  assert.deepStrictEqual(g.worlds[7].levels, { economy: 2, industry: 2, defense: 2 });
  assert.deepStrictEqual(g.worlds[12].levels, { economy: 2, industry: 2, defense: 2 });
  assert.strictEqual(g.worlds[7].owner, VE.NEUTRAL);
  assert.strictEqual(g.worlds[12].owner, VE.NEUTRAL);
  assert.strictEqual(g.worlds[5].name, 'Nadir');
  assert.strictEqual(g.worlds[14].name, 'Vulcan');
});

test('profiles: rotational symmetry, forced pairs, overrides', () => {
  for (const seed of [0, 1, 998, 999999]) {
    const g = fresh(seed);
    for (let id = 0; id < 10; id += 1) {
      if ([5, 7, 12, 14].includes(id) || [5, 7, 12, 14].includes(19 - id)) continue;
      assert.deepStrictEqual(g.worlds[id].levels, g.worlds[19 - id].levels);
    }
    assert.deepStrictEqual(g.worlds[0].levels, { economy: 1, industry: 3, defense: 1 });
    assert.deepStrictEqual(g.worlds[19].levels, { economy: 1, industry: 3, defense: 1 });
    assert.deepStrictEqual(g.worlds[6].levels, { economy: 3, industry: 1, defense: 1 });
    assert.deepStrictEqual(g.worlds[13].levels, { economy: 3, industry: 1, defense: 1 });
  }
});

test('determinism: same seed -> same galaxy', () => {
  const a = fresh(42);
  const b = fresh(42);
  const c = fresh(43);
  const profile = (g) => g.worlds.map((w) => `${w.levels.economy}${w.levels.industry}${w.levels.defense}`).join('|');
  assert.strictEqual(profile(a), profile(b));
  assert.notStrictEqual(profile(a), profile(c));
});

test('turn 1: income is paid first, both start orders with 20 C / 2 M', () => {
  const g = fresh();
  assert.strictEqual(g.credits[0], 14);
  const report = VE.beginTurn(g);
  assert.strictEqual(report.turn, 1);
  assert.strictEqual(g.credits[0], 20);
  assert.strictEqual(g.credits[1], 20);
  assert.strictEqual(g.military[0], 2);
  assert.strictEqual(g.military[1], 2);
  assert.strictEqual(g.phase, 'human');
  assert.deepStrictEqual(g.lastIncome[0], { credits: 6, military: 2, blackout: false });
});

test('expansion cost and adjacency from 1, 2, 3 worlds', () => {
  const g = fresh();
  VE.beginTurn(g);
  // Human home 5 (row 1 col 0) is adjacent to 0, 10, 6.
  assert.strictEqual(VE.expansionCost(g, VE.HUMAN), 16);
  assert.strictEqual(VE.legalOrder(g, VE.HUMAN, 'expand', 0).legal, true);
  assert.strictEqual(VE.legalOrder(g, VE.HUMAN, 'expand', 0).cost.credits, 16);
  assert.strictEqual(VE.legalOrder(g, VE.HUMAN, 'expand', 19).legal, false);
  assert.strictEqual(VE.legalOrder(g, VE.HUMAN, 'expand', 19).code, 'NOT_CONNECTED');
  g.worlds[0].owner = VE.HUMAN;
  assert.strictEqual(VE.expansionCost(g, VE.HUMAN), 20);
  g.worlds[10].owner = VE.HUMAN;
  assert.strictEqual(VE.expansionCost(g, VE.HUMAN), 24);
});

test('develop: 8 C, one level, cap 5, exact affordability', () => {
  const g = fresh();
  VE.beginTurn(g);
  g.credits[0] = 8;
  const check = VE.legalOrder(g, VE.HUMAN, 'develop', 5, 'economy');
  assert.strictEqual(check.legal, true);
  VE.resolveOrder(g, VE.HUMAN, { type: 'develop', targetId: 5, attribute: 'economy' });
  assert.strictEqual(g.credits[0], 0);
  assert.strictEqual(g.worlds[5].levels.economy, 4);
  g.credits[0] = 8;
  VE.resolveOrder(g, VE.HUMAN, { type: 'develop', targetId: 5, attribute: 'economy' });
  assert.strictEqual(g.worlds[5].levels.economy, 5);
  g.credits[0] = 100;
  const capped = VE.legalOrder(g, VE.HUMAN, 'develop', 5, 'economy');
  assert.strictEqual(capped.legal, false);
  assert.strictEqual(capped.code, 'MAX_LEVEL');
});

test('attack cost, blockade, exact affordability, attributes intact', () => {
  const g = fresh();
  g.turn = 8;
  VE.beginTurn; // noop
  g.worlds[0].owner = VE.HUMAN; // adjacent to AI-owned? make 0 enemy for test
  g.worlds[0].owner = VE.AI;
  g.worlds[0].levels = { economy: 2, industry: 4, defense: 2 };
  g.turn = 8;
  g.credits[0] = 8;
  g.military[0] = 16;
  assert.strictEqual(VE.legalOrder(g, VE.HUMAN, 'attack', 0).legal, true);
  g.military[0] = 15;
  assert.strictEqual(VE.legalOrder(g, VE.HUMAN, 'attack', 0).code, 'INSUFFICIENT_MILITARY');
  g.military[0] = 16;
  const res = VE.resolveOrder(g, VE.HUMAN, { type: 'attack', targetId: 0 });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(g.worlds[0].levels, { economy: 2, industry: 4, defense: 2 });
  assert.strictEqual(g.credits[0], 0);
  assert.strictEqual(g.military[0], 0);
  g.turn = 16;
  g.credits[0] = 8;
  g.military[0] = 24;
  assert.strictEqual(VE.attackCost(g, 5).military, 24);
  g.turn = 20;
  assert.strictEqual(VE.attackCost(g, 5).military, 16);
});

test('capture protection: captured turn 8 -> protected 8/9, attackable 10', () => {
  const g = fresh();
  g.turn = 8;
  g.credits[0] = 200;
  g.military[0] = 200;
  g.worlds[0].owner = VE.AI;
  VE.resolveOrder(g, VE.HUMAN, { type: 'attack', targetId: 0 });
  assert.strictEqual(VE.isProtected(g, 0, 8), true);
  assert.strictEqual(VE.isProtected(g, 0, 9), true);
  assert.strictEqual(VE.isProtected(g, 0, 10), false);
  assert.deepStrictEqual(VE.protectionInfo(g, 0), { protectedThrough: 9, firstAttackable: 10, protectedNow: true });
  g.turn = 9;
  g.credits[1] = 200;
  g.military[1] = 200;
  g.worlds[0].owner = VE.HUMAN;
  g.worlds[1].owner = VE.AI; // direct lane 0–1 gives the rival adjacency
  assert.strictEqual(VE.legalOrder(g, VE.AI, 'attack', 0).code, 'PROTECTED');
  g.turn = 10;
  assert.strictEqual(VE.legalOrder(g, VE.AI, 'attack', 0).legal, true);
});

test('invalid orders spend nothing; pass costs nothing', () => {
  const g = fresh();
  VE.beginTurn(g);
  const c = g.credits[0];
  const m = g.military[0];
  const res = VE.resolveOrder(g, VE.HUMAN, { type: 'attack', targetId: 0 });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(g.credits[0], c);
  assert.strictEqual(g.military[0], m);
  VE.recordPass(g, VE.HUMAN);
  assert.strictEqual(g.log.at(-1).kind, 'pass');
});

test('relays awaken end of turn 5 and pay first dividend', () => {
  const g = fresh();
  g.turn = 5;
  g.worlds[7].owner = VE.HUMAN;
  const report = VE.finishTurn(g);
  assert.strictEqual(g.worlds[7].levels.economy, 3);
  assert.strictEqual(g.worlds[7].levels.industry, 3);
  assert.strictEqual(g.worlds[12].levels.economy, 3);
  assert.strictEqual(g.relayPrestige[0], 2);
  assert.strictEqual(g.relaysAwakened, true);
  assert.strictEqual(VE.nextScheduledEvent(g).title, 'Supernova warning');
  assert.strictEqual(report.result, null);
  assert.ok(report.events.some((e) => e.kind === 'relay-awakening'));
});

test('relay awakening forecast is not fooled by early relay development', () => {
  const g = fresh();
  g.turn = 4;
  g.worlds[7].owner = VE.HUMAN;
  g.worlds[7].levels.economy = 3;
  g.worlds[7].levels.industry = 3;
  const next = VE.nextScheduledEvent(g);
  assert.strictEqual(next.title, 'Relay awakening');
  assert.strictEqual(g.relaysAwakened, false);
});

test('turn 11 suppresses only Military income', () => {
  const g = fresh();
  g.turn = 10;
  const c = g.credits[0];
  const m = g.military[0];
  VE.beginTurn(g);
  assert.strictEqual(g.turn, 11);
  assert.strictEqual(g.credits[0], c + 6);
  assert.strictEqual(g.military[0], m);
  assert.deepStrictEqual(g.lastIncome[0], { credits: 6, military: 0, blackout: true });
});

test('turn 20: final relay dividend then scoring; ties draw', () => {
  const g = fresh();
  g.turn = 19;
  g.worlds[7].owner = VE.HUMAN;
  g.worlds[12].owner = VE.HUMAN;
  g.relayPrestige[0] = 10;
  VE.beginTurn(g);
  g.turn = 20;
  const report = VE.finishTurn(g);
  assert.strictEqual(g.relayPrestige[0], 14);
  assert.ok(report.result);
  assert.strictEqual(report.result.reason, 'score');
  assert.strictEqual(report.result.scores[0].relayPrestige, 14);
  assert.ok(['draw', 0, 1].includes(report.result.winner));

  const tieGame = fresh(4321);
  const tie = VE.buildResult(tieGame, {});
  assert.strictEqual(tie.scores[0].total, tie.scores[1].total);
  assert.strictEqual(tie.winner, 'draw');
});

test('elimination ends immediately', () => {
  const g = fresh();
  g.turn = 4;
  g.credits[0] = 200;
  g.military[0] = 200;
  // Human home 5 adjacent to 6; make everything AI except 5, then capture 5.
  for (const w of g.worlds) w.owner = VE.AI;
  g.worlds[5].owner = VE.HUMAN;
  g.credits[1] = 200;
  g.military[1] = 200;
  // 5 is adjacent to AI-owned 0, 6, 10.
  const res = VE.resolveOrder(g, VE.AI, { type: 'attack', targetId: 5 });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(g.ended, true);
  assert.strictEqual(g.winner, VE.AI);
  assert.strictEqual(g.endReason, 'elimination');
});

test('AI is deterministic and always chooses legal orders', () => {
  for (const seed of [1, 77, 987654321]) {
    const g = fresh(seed);
    const actions = [];
    for (let t = 0; t < 20 && !g.ended; t += 1) {
      VE.beginTurn(g);
      const a = VE.chooseAIAction(g);
      if (a.order) {
        const legal = VE.legalOrder(g, VE.AI, a.order.type, a.order.targetId, a.order.attribute);
        assert.strictEqual(legal.legal, true, `AI chose illegal ${JSON.stringify(a.order)} (${legal.reason}) on turn ${g.turn}`);
        VE.resolveOrder(g, VE.AI, a.order);
        actions.push(`${t}:${a.order.type}:${a.order.targetId}`);
      } else {
        actions.push(`${t}:pass`);
      }
      if (!g.ended) VE.finishTurn(g);
    }
    const g2 = fresh(seed);
    const actions2 = [];
    for (let t = 0; t < 20 && !g2.ended; t += 1) {
      VE.beginTurn(g2);
      const a = VE.chooseAIAction(g2);
      if (a.order) {
        VE.resolveOrder(g2, VE.AI, a.order);
        actions2.push(`${t}:${a.order.type}:${a.order.targetId}`);
      } else {
        actions2.push(`${t}:pass`);
      }
      if (!g2.ended) VE.finishTurn(g2);
    }
    assert.deepStrictEqual(actions, actions2);
  }
});

test('full AI-vs-AI style match tends to contest relays', () => {
  const g = fresh(2024);
  let relayTouched = false;
  for (let t = 0; t < 20 && !g.ended; t += 1) {
    VE.beginTurn(g);
    // human stands in as a second AI using the same policy (alternate seat semantics kept simple)
    const a = VE.chooseAIAction(g);
    if (a.order) VE.resolveOrder(g, VE.AI, a.order);
    if (g.worlds[7].owner !== VE.NEUTRAL || g.worlds[12].owner !== VE.NEUTRAL) relayTouched = true;
    if (!g.ended) VE.finishTurn(g);
  }
  assert.strictEqual(g.ended, true);
  assert.ok(g.result);
  assert.ok(relayTouched);
});

test('AI priority: eliminate final human world first', () => {
  const g = fresh();
  g.turn = 10;
  for (const w of g.worlds) w.owner = VE.AI;
  g.worlds[5].owner = VE.HUMAN; // adjacent to AI worlds 0, 6, 10
  g.credits[VE.AI] = 100;
  g.military[VE.AI] = 100;
  const a = VE.chooseAIAction(g);
  assert.strictEqual(a.order.type, 'attack');
  assert.strictEqual(a.order.targetId, 5);
});

test('AI priority: human relay before neutral relay', () => {
  const g = fresh();
  g.turn = 10;
  g.credits[VE.AI] = 100;
  g.military[VE.AI] = 100;
  g.worlds[12].owner = VE.HUMAN;
  g.worlds[13].owner = VE.AI; // lane to relay 12
  g.worlds[7].owner = VE.NEUTRAL;
  // Ensure relay 7 is reachable too, so priority order is what selects 12.
  g.worlds[6].owner = VE.AI;
  const a = VE.chooseAIAction(g);
  assert.strictEqual(a.order.type, 'attack');
  assert.strictEqual(a.order.targetId, 12);
});

test('AI priority: fortify relay when upgrade pushes attack out of reach', () => {
  const g = fresh();
  g.turn = 9;
  g.worlds[7].owner = VE.AI;
  g.worlds[12].owner = VE.AI;
  g.worlds[6].owner = VE.HUMAN; // adjacent to relay 7
  g.worlds[5].owner = VE.HUMAN; // ensure human has more than one world
  g.credits[VE.HUMAN] = 8;
  g.military[VE.HUMAN] = 16; // defense 2 costs 16 on turn 10, defense 3 costs 22
  g.credits[VE.AI] = 8;
  g.military[VE.AI] = 50;
  const a = VE.chooseAIAction(g);
  assert.strictEqual(a.order.type, 'develop');
  assert.strictEqual(a.order.targetId, 7);
  assert.strictEqual(a.order.attribute, 'defense');
});

test('AI priority: do not fortify a relay protected next turn', () => {
  const g = fresh();
  g.turn = 9;
  g.worlds[7].owner = VE.AI;
  g.worlds[12].owner = VE.AI;
  g.worlds[6].owner = VE.HUMAN;
  g.worlds[5].owner = VE.HUMAN;
  g.credits[VE.HUMAN] = 8;
  g.military[VE.HUMAN] = 16;
  g.credits[VE.AI] = 8;
  g.military[VE.AI] = 50;
  g.protectedThrough[7] = 10;
  const a = VE.chooseAIAction(g);
  const isFortifyRelay = a.order && a.order.type === 'develop' && a.order.targetId === 7 && a.order.attribute === 'defense';
  assert.strictEqual(isFortifyRelay, false);
});

test('AI priority: high-value non-relay target and cost tie-break', () => {
  const g = fresh();
  g.turn = 10;
  g.credits[VE.AI] = 100;
  g.military[VE.AI] = 100;
  // Put the AI on the human home so both targets are adjacent.
  g.worlds[5].owner = VE.AI;
  g.worlds[0].owner = VE.HUMAN;
  g.worlds[6].owner = VE.HUMAN;
  g.worlds[0].levels = { economy: 1, industry: 1, defense: 1 }; // value 6
  g.worlds[6].levels = { economy: 3, industry: 1, defense: 1 }; // value 8
  const a = VE.chooseAIAction(g);
  assert.strictEqual(a.order.type, 'attack');
  assert.strictEqual(a.order.targetId, 6);
});

test('AI priority: economy development when credit income is below 12', () => {
  const g = fresh();
  g.turn = 3;
  for (const w of g.worlds) w.owner = VE.HUMAN;
  g.worlds[14].owner = VE.AI; // isolated AI home; no neutrals, no affordable assaults
  g.credits[VE.AI] = 8;
  g.military[VE.AI] = 0;
  g.credits[VE.HUMAN] = 0;
  g.military[VE.HUMAN] = 0;
  const a = VE.chooseAIAction(g);
  assert.strictEqual(a.order.type, 'develop');
  assert.strictEqual(a.order.attribute, 'economy');
  assert.strictEqual(a.order.targetId, 14);
});

test('long matches stay legal, solvent, and terminate', () => {
  for (const seed of [3, 88, 5150, 90210, 4294967295]) {
    const g = fresh(seed);
    for (let guard = 0; guard < 40 && !g.ended; guard += 1) {
      VE.beginTurn(g);
      // A deterministic "greedy frontier" human: take the cheapest legal action.
      const humanActions = [];
      for (let id = 0; id < 20; id += 1) {
        if (VE.legalOrder(g, VE.HUMAN, 'expand', id).legal) humanActions.push({ type: 'expand', targetId: id, cost: VE.expansionCost(g, VE.HUMAN) });
      }
      if (humanActions.length === 0) {
        for (let id = 0; id < 20; id += 1) {
          for (const attr of ['economy', 'industry', 'defense']) {
            const check = VE.legalOrder(g, VE.HUMAN, 'develop', id, attr);
            if (check.legal) humanActions.push({ type: 'develop', targetId: id, attribute: attr, cost: 8 });
          }
        }
      }
      if (humanActions.length) {
        humanActions.sort((a, b) => a.cost - b.cost || a.targetId - b.targetId);
        VE.resolveOrder(g, VE.HUMAN, humanActions[0]);
      } else {
        VE.recordPass(g, VE.HUMAN);
      }
      if (g.ended) break;
      const ai = VE.chooseAIAction(g);
      if (ai.order) VE.resolveOrder(g, VE.AI, ai.order);
      if (g.ended) break;
      VE.finishTurn(g);
      assert.ok(g.credits[VE.HUMAN] >= 0 && g.credits[VE.AI] >= 0);
      assert.ok(g.military[VE.HUMAN] >= 0 && g.military[VE.AI] >= 0);
    }
    assert.strictEqual(g.ended, true);
    assert.ok(g.turn <= 20);
    assert.ok(g.result);
    const totalWorlds = g.worlds.reduce((n, w) => n + (w.owner === VE.HUMAN || w.owner === VE.AI ? 1 : 0), 0);
    assert.ok(totalWorlds >= 1);
    for (const score of g.result.scores) {
      assert.strictEqual(score.total, score.planetValue + score.relayPrestige);
    }
  }
});

console.log(`\n${tests} tests complete.`);
