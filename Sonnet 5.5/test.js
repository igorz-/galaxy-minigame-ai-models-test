const E = require('./engine.js');
const assert = require('assert');

assert.strictEqual(E.LINKS.length, 23);
const s = E.newGame(12345);
assert.strictEqual(s.owner.filter(Boolean).length, 2);
for (let i = 0; i < 10; i++) if (![5, 14, 7, 12].includes(i) && ![5, 14, 7, 12].includes(19 - i)) assert.strictEqual(s.profile[i], s.profile[19 - i]);
E.startTurn(s);
assert.strictEqual(s.cred.H, 20); assert.strictEqual(s.mil.H, 2);
assert.strictEqual(s.cred.A, 20); assert.strictEqual(s.mil.A, 2);
assert.strictEqual(E.check(s, 'H', { type: 'expand', target: 6 }).c, 16);
assert.ok(!E.check(s, 'H', { type: 'expand', target: 3 }).ok);

// full simulated games with a passive-ish human (human uses the AI policy too)
let stats = { H: 0, A: 0, D: 0 };
for (let seed = 1; seed <= 300; seed++) {
  const g = E.newGame(seed);
  while (!g.over) {
    E.startTurn(g);
    const order = ['H', 'A'];
    if (g.first === 'A') order.reverse();
    for (const p of order) {
      if (g.over) break;
      if (p === 'A') E.aiAct(g);
      else {
        // mirror the AI by temporarily swapping roles is complex; use random legal order
        const opts = [];
        for (let t = 0; t < 20; t++) for (const type of ['expand', 'attack']) if (E.check(g, 'H', { type, target: t }).ok) opts.push({ type, target: t });
        for (let t = 0; t < 20; t++) for (const a of E.ATTRS) if (E.check(g, 'H', { type: 'develop', target: t, attr: a }).ok) opts.push({ type: 'develop', target: t, attr: a });
        if (opts.length) E.apply(g, 'H', opts[(seed * 7 + g.turn) % opts.length]); else E.pass(g, 'H');
      }
    }
    if (!g.over) E.endTurn(g);
    assert.ok(g.turn <= 20);
  }
  stats[g.result.winner || 'D']++;
}
console.log('ok', stats);

// protection: capture on turn 8 protects through 9
const g = E.newGame(5);
g.turn = 8; g.owner[6] = 'A'; g.owner[5] = 'H'; g.cap[6] = 8;
g.cred.H = 99; g.mil.H = 99;
assert.ok(!E.check(g, 'H', { type: 'attack', target: 6 }).ok);
g.turn = 9; assert.ok(!E.check(g, 'H', { type: 'attack', target: 6 }).ok);
g.turn = 10; assert.ok(E.check(g, 'H', { type: 'attack', target: 6 }).ok);
g.turn = 16; assert.strictEqual(E.check(g, 'H', { type: 'attack', target: 6 }).m, 4 + 6 * g.attrs[6].d + 8);
console.log('rules ok');
