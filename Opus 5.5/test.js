// Engine checks: `node test.js`
const VE = require('./engine.js');
const assert = require('assert');
let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('✓', name); };
const clone = s => JSON.parse(JSON.stringify(s));

t('galaxy shape', () => {
  const s = VE.newGame(1234);
  assert.strictEqual(s.worlds.length, 20);
  assert.strictEqual(VE.LINKS.length, 23);
  assert.strictEqual(s.worlds.filter(w => w.home).length, 2);
  assert.strictEqual(s.worlds.filter(w => w.relay).length, 2);
  for (let seed = 0; seed < 50; seed++) {
    const p = VE.profileSet(seed);
    for (let i = 0; i < 20; i++) assert.strictEqual(p[i], p[19 - i]);
    assert.strictEqual(p[0], 'forge'); assert.strictEqual(p[6], 'trade');
  }
});

t('turn 1 income', () => {
  const s = VE.newGame(7);
  assert.strictEqual(s.turn, 1);
  for (const who of ['human', 'ai']) { assert.strictEqual(s.empires[who].credits, 20); assert.strictEqual(s.empires[who].military, 2); }
  assert.strictEqual(s.actor, 'human');
});

t('expand costs and adjacency', () => {
  const s = VE.newGame(7);
  assert.strictEqual(VE.checkOrder(s, 'human', { type: 'expand', target: 6 }).cost.credits, 16);
  assert.strictEqual(VE.checkOrder(s, 'human', { type: 'expand', target: 8 }).code, 'lane');
  s.worlds[6].owner = 'human';
  assert.strictEqual(VE.expandCost(s, 'human'), 20);
  s.worlds[0].owner = 'human';
  assert.strictEqual(VE.expandCost(s, 'human'), 24);
});

t('initiative alternates; invalid orders spend nothing', () => {
  const s = VE.newGame(7);
  const before = clone(s.empires.human);
  const r = VE.act(s, 'human', { type: 'expand', target: 8 });
  assert.ok(!r.ok); assert.deepStrictEqual(s.empires.human, before); assert.strictEqual(s.actor, 'human');
  VE.act(s, 'human', { type: 'pass' });
  assert.strictEqual(s.actor, 'ai');
  VE.runAI(s);
  assert.strictEqual(s.turn, 2); assert.strictEqual(s.actor, 'ai');
  VE.runAI(s);
  assert.strictEqual(s.actor, 'human');
});

t('develop cap and cost', () => {
  const s = VE.newGame(7);
  s.worlds[5].e = 5;
  assert.strictEqual(VE.checkOrder(s, 'human', { type: 'develop', target: 5, attr: 'e' }).code, 'cap');
  const r = VE.act(s, 'human', { type: 'develop', target: 5, attr: 'i' });
  assert.ok(r.ok); assert.strictEqual(s.empires.human.credits, 12); assert.strictEqual(s.worlds[5].i, 3);
});

t('attack cost, blockade, protection', () => {
  const s = VE.newGame(7);
  s.worlds[6].owner = 'ai'; s.worlds[6].d = 2;
  s.turn = 8; s.actor = 'human'; s.initiative = 'human';
  s.empires.human.credits = 8; s.empires.human.military = 16;
  const r = VE.act(s, 'human', { type: 'attack', target: 6 });
  assert.ok(r.ok, r.reason); assert.strictEqual(s.empires.human.military, 0); assert.strictEqual(s.worlds[6].d, 2);
  s.worlds[6].owner = 'ai'; s.worlds[5].owner = 'human';
  s.turn = 9; assert.strictEqual(VE.checkOrder(s, 'human', { type: 'attack', target: 6 }).code, 'protected');
  s.turn = 10; s.empires.human.credits = 99; s.empires.human.military = 99;
  assert.ok(VE.checkOrder(s, 'human', { type: 'attack', target: 6 }).ok);
  s.turn = 16; assert.strictEqual(VE.checkOrder(s, 'human', { type: 'attack', target: 6 }).cost.military, 24);
  s.turn = 20; assert.strictEqual(VE.checkOrder(s, 'human', { type: 'attack', target: 6 }).cost.military, 16);
});

t('events, supernova, relay prestige, full match', () => {
  const s = VE.newGame(99);
  while (!s.over) {
    if (s.actor === 'human') {
      if (s.turn === 11) {
        const m = s.empires.human.military;
      }
      VE.act(s, 'human', { type: 'pass' });
    } else VE.runAI(s);
    if (s.turn === 6 && s.actor) assert.ok(s.worlds[7].e >= 3);
  }
  assert.ok(s.result);
  // A passive human is eventually eliminated by the AI or outscored at turn 20
  assert.ok(s.result.reason === 'elimination' ? s.result.winner === 'ai' : s.result.turn === 20);
  assert.ok(s.result.ai.relayPrestige > 0);
});

t('supernova suppresses military only', () => {
  const s = VE.newGame(5);
  while (s.turn < 11) { if (s.actor === 'human') VE.act(s, 'human', { type: 'pass' }); else VE.runAI(s); }
  assert.strictEqual(s.empires.human.lastIncome.military, 0);
  assert.strictEqual(s.empires.human.lastIncome.credits, 6);
});

t('elimination ends immediately', () => {
  const s = VE.newGame(7);
  s.worlds[6].owner = 'ai'; s.worlds[14].owner = null;
  s.empires.human.military = 30;
  VE.act(s, 'human', { type: 'attack', target: 6 });
  assert.ok(s.over); assert.strictEqual(s.result.winner, 'human'); assert.strictEqual(s.result.reason, 'elimination');
});

t('determinism', () => {
  const run = () => { const s = VE.newGame(42); while (!s.over) { if (s.actor === 'human') VE.act(s, 'human', { type: 'pass' }); else VE.runAI(s); } return JSON.stringify(s); };
  assert.strictEqual(run(), run());
});

console.log(`\n${passed} checks passed`);
