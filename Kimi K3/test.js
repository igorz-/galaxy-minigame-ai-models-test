/* Rule verification for Void Empires — Blitz. Run: node test.js */
'use strict';
const assert = require('assert');
const VE = require('./logic.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok — ' + name); }
  catch (e) { console.error('FAIL — ' + name + '\n  ' + e.message); process.exitCode = 1; }
}

/* 1. Galaxy structure */
test('20 worlds, 23 lanes, homes, relays, symmetric seeded profiles', () => {
  assert.strictEqual(VE.LINKS.length, 23);
  for (const seed of [1, 42, 777, 123456789]) {
    const s = VE.createGame(seed);
    assert.strictEqual(s.worlds.length, 20);
    assert.strictEqual(s.worlds[5].owner, 'H');
    assert.strictEqual(s.worlds[14].owner, 'A');
    for (const id of [5, 14]) assert.deepStrictEqual([s.worlds[id].E, s.worlds[id].I, s.worlds[id].D], [3, 2, 2]);
    for (const id of [7, 12]) {
      assert.strictEqual(s.worlds[id].relay, true);
      assert.deepStrictEqual([s.worlds[id].E, s.worlds[id].I, s.worlds[id].D], [2, 2, 2]);
      assert.strictEqual(s.worlds[id].owner, null);
    }
    for (let i = 0; i < 10; i++) assert.strictEqual(s.worlds[i].profile, s.worlds[19 - i].profile, 'pair ' + i);
    assert.strictEqual(s.worlds[0].profile, 'Forge');
    assert.strictEqual(s.worlds[19].profile, 'Forge');
    assert.strictEqual(s.worlds[6].profile, 'Trade');
    assert.strictEqual(s.worlds[13].profile, 'Trade');
  }
  // seeded determinism
  const a = VE.createGame(99), b = VE.createGame(99);
  assert.deepStrictEqual(a.worlds.map(w => [w.profile, w.E, w.I, w.D]), b.worlds.map(w => [w.profile, w.E, w.I, w.D]));
});

/* 2. Turn-1 income */
test('turn 1 pays income before orders: 20 Credits, 2 Military each', () => {
  const s = VE.createGame(7);
  assert.strictEqual(s.empires.H.credits, 20);
  assert.strictEqual(s.empires.H.military, 2);
  assert.strictEqual(s.empires.A.credits, 20);
  assert.strictEqual(s.empires.A.military, 2);
  assert.strictEqual(s.turn, 1);
});

/* 3. Initiative alternation */
test('odd turns human first, even turns AI first', () => {
  const s = VE.createGame(7);
  assert.strictEqual(s.first, 'H');
  assert.strictEqual(s.acted.A, false); // AI has not acted on turn 1 before human
  VE.humanPass(s); // ends turn 1 -> turn 2 (even): AI acts first
  assert.strictEqual(s.turn, 2);
  assert.strictEqual(s.acted.A, true, 'AI should already have acted on turn 2');
  VE.humanPass(s); // -> turn 3 (odd)
  assert.strictEqual(s.turn, 3);
  assert.strictEqual(s.acted.A, false, 'AI waits for the human on odd turns');
});

/* 4. Expansion pricing and adjacency */
test('expand costs 16/20/24 with 1/2/3 worlds; nonadjacent illegal', () => {
  const s = VE.createGame(7);
  assert.strictEqual(VE.expandCost(s, 'H'), 16);
  s.worlds[6].owner = 'H';
  assert.strictEqual(VE.expandCost(s, 'H'), 20);
  s.worlds[10].owner = 'H';
  assert.strictEqual(VE.expandCost(s, 'H'), 24);
  s.empires.H.credits = 100; // fund the empire so legality reflects adjacency only
  // world 1: no lane to {5,6,10}? 6-1 is not a lane (only 5-6,6-7). 1 adjacent to 0,2,6? links: 1-2,0-1... row0: 0-1,1-2,2-3,3-4. so 1 adjacent to 0,2 only.
  assert.strictEqual(VE.canExpand(s, 'H', 1).ok, false);
  assert.strictEqual(VE.canExpand(s, 'H', 0).ok, true); // 0-5 lane exists
  assert.strictEqual(VE.canExpand(s, 'H', 5).ok, false); // already owned
});

/* 5. Develop */
test('develop costs 8, raises one attr, caps at 5, affects next income', () => {
  const s = VE.createGame(7);
  const before = VE.income(s, 'H').credits;
  assert.strictEqual(VE.canDevelop(s, 'H', 5, 'E').ok, true);
  assert.strictEqual(VE._test.applyDevelop(s, 'H', 5, 'E'), true);
  assert.strictEqual(s.empires.H.credits, 12);
  assert.strictEqual(s.worlds[5].E, 4);
  assert.strictEqual(VE.income(s, 'H').credits, before + 2);
  s.worlds[5].D = 5;
  assert.strictEqual(VE.canDevelop(s, 'H', 5, 'D').ok, false);
  assert.strictEqual(VE.canDevelop(s, 'H', 6, 'E').ok, false); // not owned
  s.empires.H.credits = 7;
  assert.strictEqual(VE.canDevelop(s, 'H', 5, 'I').ok, false); // unaffordable
});

/* 6. Attack pricing, exact cost, blockade, intact attributes */
test('attack uses current Defense and blockade; exact-cost attack captures intact', () => {
  const s = VE.createGame(7);
  // H owns 5 and 6; A owns 7 (a relay, E2 I2 D2)
  s.worlds[6].owner = 'H';
  s.worlds[7].owner = 'A';
  const target = s.worlds[7];
  assert.strictEqual(VE.attackMilitaryCost(s, target), 4 + 6 * 2);
  s.empires.H.credits = 8;
  s.empires.H.military = 16; // exact
  assert.strictEqual(VE.canAttack(s, 'H', 7).ok, true);
  assert.strictEqual(VE._test.applyAttack(s, 'H', 7), true);
  assert.strictEqual(s.empires.H.credits, 0);
  assert.strictEqual(s.empires.H.military, 0);
  assert.strictEqual(target.owner, 'H');
  assert.deepStrictEqual([target.E, target.I, target.D], [2, 2, 2]); // intact
  // blockade surcharge only on turns 16-19
  s.turn = 16;
  assert.strictEqual(VE.attackMilitaryCost(s, target), 24);
  s.turn = 19;
  assert.strictEqual(VE.attackMilitaryCost(s, target), 24);
  s.turn = 20;
  assert.strictEqual(VE.attackMilitaryCost(s, target), 16);
  s.turn = 15;
  assert.strictEqual(VE.attackMilitaryCost(s, target), 16);
  // non-adjacent enemy world illegal
  const s2 = VE.createGame(7);
  assert.strictEqual(VE.canAttack(s2, 'H', 14).ok, false);
});

/* 7. Capture protection window */
test('turn-8 capture protects through turn 9, attackable on turn 10', () => {
  const s = VE.createGame(7);
  s.turn = 8;
  s.worlds[6].owner = 'H';
  s.worlds[7].owner = 'A';
  s.empires.H.credits = 100;
  s.empires.H.military = 100;
  assert.strictEqual(VE._test.applyAttack(s, 'H', 7), true);
  assert.strictEqual(s.worlds[7].capturedTurn, 8);
  // now A tries to retake: A owns 14, not adjacent. Give A world 12 (relay lane 7-12).
  s.worlds[12].owner = 'A';
  s.empires.A.credits = 100; s.empires.A.military = 100;
  assert.strictEqual(VE.canAttack(s, 'A', 7).ok, false, 'protected on turn 8');
  s.turn = 9;
  assert.strictEqual(VE.isProtected(s, s.worlds[7]), true);
  assert.strictEqual(VE.canAttack(s, 'A', 7).ok, false, 'protected through turn 9');
  s.turn = 10;
  assert.strictEqual(VE.isProtected(s, s.worlds[7]), false);
  assert.strictEqual(VE.canAttack(s, 'A', 7).ok, true, 'attackable on turn 10');
  assert.strictEqual(VE.firstAttackableTurn(s.worlds[7]), 10);
});

/* 8. Scheduled events */
test('relay awakening at end of turn 5; turn-11 military suppression; surcharge window', () => {
  const s = VE.createGame(7);
  s.worlds[7].owner = 'H';
  s.turn = 5;
  VE._test.resolveEvent(s);
  assert.strictEqual(s.worlds[7].E, 3);
  assert.strictEqual(s.worlds[7].I, 3);
  assert.strictEqual(s.worlds[12].E, 3);
  VE._test.awardRelayPrestige(s);
  assert.strictEqual(s.empires.H.prestige, 2, 'first 2 prestige at end of turn 5');
  // turn 11: zero military income
  const s2 = VE.createGame(7);
  s2.turn = 11;
  const before = s2.empires.H.military;
  const credBefore = s2.empires.H.credits;
  VE._test.startTurn(s2);
  assert.strictEqual(s2.empires.H.military, before, 'no military income on turn 11');
  assert.strictEqual(s2.empires.H.credits, credBefore + 6, 'credits normal on turn 11');
  // turn 4 award: nothing before turn 5
  const s3 = VE.createGame(7);
  s3.worlds[7].owner = 'H';
  s3.turn = 4;
  VE._test.awardRelayPrestige(s3);
  assert.strictEqual(s3.empires.H.prestige, 0);
});

/* 9. Turn-20 finale, ties, elimination */
test('turn-20 final award before scoring; ties draw; elimination ends immediately', () => {
  // full-match simulation: a passing human is eliminated by the AI before turn 20
  const s = VE.createGame(7);
  let guard = 0;
  while (!s.over && guard++ < 100) VE.humanPass(s);
  assert.strictEqual(s.over, true);
  assert.ok(s.turn <= 20);
  assert.ok(s.scores.H.total === s.scores.H.planetValue + s.scores.H.relay);
  assert.ok(s.scores.A.total === s.scores.A.planetValue + s.scores.A.relay);

  // turn-20 relay award happens before scoring
  const f = VE.createGame(7);
  f.turn = 20;
  f.worlds[7].owner = 'H'; // held relay banks its final 2 prestige at end of turn 20
  f.worlds[5].E = 3; f.worlds[5].I = 2; f.worlds[5].D = 2;
  f.worlds[14].E = 3; f.worlds[14].I = 2; f.worlds[14].D = 2;
  VE._test.endTurn(f);
  assert.strictEqual(f.over, true);
  assert.strictEqual(f.scores.H.relay, 2);
  assert.strictEqual(f.scores.H.planetValue, 6 + 7 + 6); // 3*2 worlds + attrs (7 + 6)
  assert.strictEqual(f.scores.H.total, 21, 'planet value 19 + final relay award 2');

  // crafted draw: equal holdings and no prestige
  const d = VE.createGame(7);
  d.turn = 20;
  d.worlds[5].E = 3; d.worlds[5].I = 2; d.worlds[5].D = 2; // 3+7 = 10
  d.worlds[14].E = 3; d.worlds[14].I = 2; d.worlds[14].D = 2; // 10
  VE._test.endTurn(d);
  assert.strictEqual(d.over, true);
  assert.strictEqual(d.draw, true, JSON.stringify(d.scores));

  // elimination interrupts immediately (no events/prestige after)
  const e = VE.createGame(7);
  e.turn = 16; // would otherwise matter; also make it turn 5-like check
  e.worlds[6].owner = 'H';
  e.worlds[7].owner = 'A';
  // strip A to a single world
  e.worlds[14].owner = 'H';
  e.empires.H.credits = 100; e.empires.H.military = 100;
  e.empires.A.prestige = 0;
  assert.strictEqual(VE.ownedWorlds(e, 'A').length, 1);
  VE.humanCommit(e, { type: 'attack', world: 7 });
  assert.strictEqual(e.over, true);
  assert.strictEqual(e.winner, 'H');
  assert.strictEqual(e.turn, 16, 'turn did not advance after elimination');
  assert.strictEqual(e.empires.A.prestige, 0, 'no relay awards after elimination');
});

/* 10. Invalid orders spend nothing */
test('illegal commit spends nothing and keeps the human phase open', () => {
  const s = VE.createGame(7);
  const snapshot = JSON.stringify([s.empires, s.worlds.map(w => w.owner)]);
  assert.strictEqual(VE.humanCommit(s, { type: 'expand', world: 3 }), false); // not adjacent
  assert.strictEqual(VE.humanCommit(s, { type: 'attack', world: 14 }), false); // not adjacent
  assert.strictEqual(VE.humanCommit(s, { type: 'develop', world: 6, attr: 'E' }), false); // not owned
  assert.strictEqual(JSON.stringify([s.empires, s.worlds.map(w => w.owner)]), snapshot);
  assert.strictEqual(s.phase, 'human');
  assert.strictEqual(s.turn, 1);
  // pass works without a staged order
  assert.strictEqual(VE.humanPass(s), true);
  assert.strictEqual(s.turn, 2);
});

/* 11. Replay seed restores identical map with zeroed mutable state */
test('replay seed: identical map, fresh reserves', () => {
  const a = VE.createGame(2024);
  VE.humanPass(a); VE.humanPass(a); // mutate
  const b = VE.createGame(2024);
  assert.strictEqual(a.seed, b.seed);
  assert.deepStrictEqual(b.worlds.map(w => [w.profile, w.E, w.I, w.D, w.owner]),
    VE.createGame(2024).worlds.map(w => [w.profile, w.E, w.I, w.D, w.owner]));
  assert.strictEqual(b.turn, 1);
  assert.strictEqual(b.empires.H.credits, 20);
  assert.strictEqual(b.empires.H.prestige, 0);
});

/* 12. Full AI-vs-pass match sanity: deterministic, finishes, legal AI */
test('deterministic full match; same seed + same human orders = same result', () => {
  const run = () => {
    const s = VE.createGame(31337);
    let guard = 0;
    while (!s.over && guard++ < 100) VE.humanPass(s);
    return s;
  };
  const a = run(), b = run();
  assert.strictEqual(a.over, true);
  assert.strictEqual(a.scores.H.total, b.scores.H.total);
  assert.strictEqual(a.scores.A.total, b.scores.A.total);
  assert.strictEqual(a.winner, b.winner);
  assert.ok(a.turn <= 20);
});

console.log('\n' + passed + ' tests passed' + (process.exitCode ? ' (with failures)' : ''));
