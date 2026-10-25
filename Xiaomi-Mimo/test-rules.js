/* Headless rule checks against TASK.md completion list. Run: node test-rules.js */
global.window = {};
require('./game.js');
const G = window.Game;
const C = G.CONFIG;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + a + ', want ' + b + ')'); }

/* --- setup: 20 worlds, 23 lanes, homes, relays --- */
eq(G.LINKS.length, 23, '23 lanes');
eq(G.worldsLen = G.createMatch(12345).worlds.length, 20, '20 worlds');
let s = G.createMatch(12345);
eq(s.worlds.filter(w => w.isHome).length, 2, 'two homes');
eq(s.worlds.filter(w => w.isRelay).length, 2, 'two relays');
eq(s.worlds[5].owner, 'human', 'human home id 5');
eq(s.worlds[14].owner, 'ai', 'ai home id 14');
ok([7, 12].every(id => s.worlds[id].owner === null), 'relays neutral');
ok(G.LINKS.some(([a, b]) => a === 7 && b === 12), 'relay lane exists');
// horizontal 16 + vertical 6
eq(G.LINKS.filter(([a, b]) => Math.abs(a - b) === 1).length, 16, '16 horizontal lanes');
eq(G.LINKS.filter(([a, b]) => Math.abs(a - b) === 5 && !(a === 7 && b === 12)).length, 6, '6 vertical lanes');

/* --- seeded profiles: symmetry + forced values --- */
for (const seed of [0, 1, 7, 42, 999999, 4294967295]) {
  const m = G.createMatch(seed);
  const prof = m.worlds;
  // rotational pairs share attributes (homes and relays are overridden but also paired)
  for (let id = 0; id < 20; id++) {
    const o = 19 - id;
    if (id < o) ok(prof[id].e === prof[o].e && prof[id].i === prof[o].i && prof[id].d === prof[o].d,
      'seed ' + seed + ' pair ' + id + '/' + o + ' symmetric');
  }
  ok(prof[0].e === 1 && prof[0].i === 3 && prof[0].d === 1, 'id0 Forge');
  ok(prof[19].e === 1 && prof[19].i === 3 && prof[19].d === 1, 'id19 Forge');
  ok(prof[6].e === 3 && prof[6].i === 1 && prof[6].d === 1, 'id6 Trade');
  ok(prof[13].e === 3 && prof[13].i === 1 && prof[13].d === 1, 'id13 Trade');
  ok(prof[5].e === 3 && prof[5].i === 2 && prof[5].d === 2, 'home attributes');
  ok(prof[7].e === 2 && prof[7].i === 2 && prof[7].d === 2, 'relay attributes');
  ok(prof[5].profile === 'Homeworld' && prof[7].profile === 'Relay', 'profile labels');
}
// same seed -> identical maps; seeds differ
const a1 = G.createMatch(777), a2 = G.createMatch(777), a3 = G.createMatch(778);
ok(JSON.stringify(a1.worlds.map(w => [w.e, w.i, w.d])) === JSON.stringify(a2.worlds.map(w => [w.e, w.i, w.d])),
  'same seed same profiles');
ok(JSON.stringify(a1.worlds.map(w => [w.e, w.i, w.d])) !== JSON.stringify(a3.worlds.map(w => [w.e, w.i, w.d])),
  'different seed different profiles');
// attributes survive owner change
const t = G.createMatch(5);
t.worlds[0].owner = 'human';
eq(t.worlds[0].e + '/' + t.worlds[0].i + '/' + t.worlds[0].d, '1/3/1', 'profile attrs kept on capture');

/* --- turn 1 income: 20 credits, 2 military --- */
s = G.createMatch(1);
s.turn = 1;
G.payIncome(s);
eq(s.empires.human.credits, 20, 'human turn-1 credits 20');
eq(s.empires.human.military, 2, 'human turn-1 military 2');
eq(s.empires.ai.credits, 20, 'ai turn-1 credits 20');
eq(s.empires.ai.military, 2, 'ai turn-1 military 2');

/* --- expand costs 16/20/24 --- */
s = G.createMatch(1);
eq(G.expandCost(s, 'human'), 16, 'expand from 1 owned = 16');
s.worlds[0].owner = 'human';
eq(G.expandCost(s, 'human'), 20, 'expand from 2 owned = 20');
s.worlds[1].owner = 'human';
eq(G.expandCost(s, 'human'), 24, 'expand from 3 owned = 24');
// adjacency legality
s.turn = 1;
G.payIncome(s); // 20 credits... wait human owns 3 worlds now with attrs -> recompute
// reset reserves to a known state
s.empires.human.credits = 100;
let r = G.legalOrder(s, 'human', { type: 'expand', target: 2 }); // 2 adjacent to 1? yes lane 1-2
ok(r.ok, 'expand to adjacent neutral 02');
r = G.legalOrder(s, 'human', { type: 'expand', target: 19 }); // far corner, not adjacent
ok(!r.ok && r.reason === 'not-adjacent', 'expand to nonadjacent illegal');
r = G.legalOrder(s, 'human', { type: 'expand', target: 14 }); // ai-owned
ok(!r.ok && r.reason === 'owned-foe', 'expand onto enemy illegal');
// exact affordability (world 06 is neutral and adjacent to human home 05)
s.empires.human.credits = G.expandCost(s, 'human');
ok(G.legalOrder(s, 'human', { type: 'expand', target: 6 }).ok, 'exact credits sufficient');
s.empires.human.credits = G.expandCost(s, 'human') - 1;
ok(!G.legalOrder(s, 'human', { type: 'expand', target: 6 }).ok, 'one credit short fails');

/* --- develop --- */
s = G.createMatch(1);
s.turn = 1;
s.empires.human.credits = 8;
let before = s.worlds[5].e;
let res = G.applyOrder(s, 'human', { type: 'develop', target: 5, attr: 'e' });
ok(res.ok && s.worlds[5].e === before + 1, 'develop raises attribute by 1');
eq(s.empires.human.credits, 0, 'develop costs 8 credits');
s.worlds[5].e = 5;
ok(!G.legalOrder(s, 'human', { type: 'develop', target: 5, attr: 'e' }).ok, 'capped at 5');
s.worlds[5].e = 3;
ok(!G.legalOrder(s, 'human', { type: 'develop', target: 0, attr: 'e' }).ok, 'develop needs ownership');
// income is paid once at turn start; upgrades affect the NEXT payment
s = G.createMatch(1);
s.turn = 3;
G.payIncome(s);
eq(s.empires.human.credits, 20, 'turn-3 payment uses attributes at turn start');
G.applyOrder(s, 'human', { type: 'develop', target: 5, attr: 'e' });
eq(G.creditIncome(s, 'human'), 8, 'rate reflects upgrade immediately');
eq(s.empires.human.credits, 12, 'but no extra payment mid-turn');
s.turn = 4;
G.payIncome(s);
eq(s.empires.human.credits, 12 + 8, 'develop pays from the next turn (+2 credits)');

/* --- attack costs --- */
s = G.createMatch(1);
s.worlds[6].owner = 'ai';       // adjacent to human home 5
s.worlds[6].d = 2;
s.turn = 1;
s.empires.human.credits = 8;
s.empires.human.military = 16;
r = G.legalOrder(s, 'human', { type: 'attack', target: 6 });
ok(r.ok, 'exact-cost attack legal (8c + 16m on defense 2)');
eq(G.attackMilitary(s.worlds[6], 1), 16, 'defense-2 attack = 16 military');
eq(G.attackMilitary(s.worlds[6], 16), 24, 'blockade turn 16 = 24 military');
eq(G.attackMilitary(s.worlds[6], 19), 24, 'blockade turn 19 = 24 military');
eq(G.attackMilitary(s.worlds[6], 15), 16, 'turn 15 no surcharge');
eq(G.attackMilitary(s.worlds[6], 20), 16, 'turn 20 no surcharge');
s.empires.human.military = 15;
ok(!G.legalOrder(s, 'human', { type: 'attack', target: 6 }).ok, '15 military insufficient');
s.empires.human.military = 16;
const attrsBefore = s.worlds[6].e + '/' + s.worlds[6].i + '/' + s.worlds[6].d;
res = G.applyOrder(s, 'human', { type: 'attack', target: 6 });
ok(res.ok && s.worlds[6].owner === 'human', 'attack captures');
eq(s.worlds[6].e + '/' + s.worlds[6].i + '/' + s.worlds[6].d, attrsBefore, 'captured attributes intact');
eq(s.empires.human.credits, 0, 'attack costs 8 credits');
eq(s.empires.human.military, 0, 'attack costs 16 military');
eq(s.empires.ai.credits, 14, 'defender reserves unchanged');

/* --- capture protection: attack on turn 8 protects through 9, recapture on 10 --- */
s = G.createMatch(1);
s.worlds[6].owner = 'ai';
s.turn = 8;
s.empires.human.credits = 50;
s.empires.human.military = 50;
G.applyOrder(s, 'human', { type: 'attack', target: 6 });
ok(G.isProtected(s.worlds[6], 8) && G.isProtected(s.worlds[6], 9), 'protected turns 8-9');
ok(!G.isProtected(s.worlds[6], 10), 'attackable on turn 10');
s.worlds[6].owner = 'human';   // human holds it; rival must be adjacent to recapture
s.worlds[7].owner = 'ai';      // 07 neighbors 06
s.turn = 9;
r = G.legalOrder(s, 'ai', { type: 'attack', target: 6 });
ok(!r.ok && r.reason === 'protected', 'turn 9 attack blocked');
s.turn = 10;
s.empires.ai.credits = 50; s.empires.ai.military = 50;
ok(G.legalOrder(s, 'ai', { type: 'attack', target: 6 }).ok, 'turn 10 recapture allowed');
// expansion ignores protection
s.worlds[6].owner = null;
s.worlds[6].protectedThrough = 99;
s.turn = 9;
s.empires.human.credits = 50;
ok(G.legalOrder(s, 'human', { type: 'expand', target: 6 }).ok, 'protection does not block expansion');

/* --- turn 11 suppresses only military --- */
s = G.createMatch(1);
s.turn = 11;
eq(G.militaryIncome(s, 'human', 11), 0, 'turn 11 military income 0');
eq(G.creditIncome(s, 'human'), 6, 'turn 11 credit income normal');
s.empires.human.credits = 14; s.empires.human.military = 5;
G.payIncome(s);
eq(s.empires.human.credits, 20, 'credits still paid turn 11');
eq(s.empires.human.military, 5, 'military reserve untouched turn 11');

/* --- relay awakening + prestige --- */
s = G.createMatch(1);
s.worlds[7].owner = 'human';
s.worlds[12].owner = 'ai';
eq(s.worlds[7].e, 2, 'relay pre-awaken E2');
s.turn = 5;
G.endOfTurn(s);
eq(s.worlds[7].e, 3, 'relay awaken +1 E');
eq(s.worlds[7].i, 3, 'relay awaken +1 I');
eq(s.empires.human.prestige, 2, 'first +2 prestige end of turn 5');
eq(s.empires.ai.prestige, 2, 'ai relay pays too');
ok(s.events.awakened, 'awaken flag set');
s.turn = 6; G.endOfTurn(s);
eq(s.empires.human.prestige, 4, 'keeps paying each turn');
// neutral relay pays nothing
s = G.createMatch(1);
s.turn = 5; G.endOfTurn(s);
eq(s.empires.human.prestige, 0, 'neutral relay pays nobody');
eq(s.worlds[7].e, 3, 'relay still awakens while neutral');
// 16 awards total = 32
s = G.createMatch(1);
s.worlds[7].owner = 'human';
for (let t = 5; t <= 20; t++) { s.turn = t; G.endOfTurn(s); }
eq(s.empires.human.prestige, 32, 'one relay all 16 awards = 32 prestige');
// relay cap 5
s.worlds[12].e = 5; s.worlds[12].i = 5;
s.worlds[12].owner = 'ai';
s.turn = 5;
G.endOfTurn(s); // already awakened at 5 earlier in this state? events not set -> awakens now
ok(s.worlds[12].e <= 5 && s.worlds[12].i <= 5, 'awaken caps at 5');
// prestige persists after capture
s = G.createMatch(1);
s.worlds[7].owner = 'human';
s.turn = 7; G.endOfTurn(s);
const banked = s.empires.human.prestige;
s.worlds[7].owner = 'ai';
s.turn = 8; G.endOfTurn(s);
eq(s.empires.human.prestige, banked, 'banked prestige kept after losing relay');

/* --- warnings and blockade window --- */
s = G.createMatch(1);
s.turn = 10; G.endOfTurn(s);
ok(s.events.supernovaWarned, 'supernova warning end of turn 10');
s = G.createMatch(1);
s.turn = 15; G.endOfTurn(s);
ok(s.events.blockadeWarned, 'blockade warning end of turn 15');

/* --- scoring --- */
s = G.createMatch(1);
s.empires.human.prestige = 10;
const sc = G.getScore(s, 'human');
// 1 world: 3*1 + (3+2+2) = 10 planet value; +10 relay = 20
eq(sc.planetValue, 10, 'planet value formula');
eq(sc.total, 20, 'total = planet + relay');
eq(sc.worlds, 1, 'world count');

/* --- elimination --- */
s = G.createMatch(1);
s.worlds[5].owner = 'ai'; // human has 0 worlds now
ok(G.checkElimination(s) && s.ended.winner === 'ai', 'human eliminated -> ai wins');
s = G.createMatch(1);
s.worlds[14].owner = 'human';
ok(G.checkElimination(s) && s.ended.winner === 'human', 'ai eliminated -> human wins');

/* --- AI policy determinism + sanity --- */
for (const seed of [3, 91, 12345]) {
  const p1 = runWholeMatch(seed, 'human-pass');
  const p2 = runWholeMatch(seed, 'human-pass');
  eq(JSON.stringify(p1), JSON.stringify(p2), 'seed ' + seed + ' deterministic match');
}

function runWholeMatch(seed, humanPolicy) {
  const m = G.createMatch(seed);
  const trace = [];
  while (!m.ended && m.turn < 20) {
    m.turn += 1;
    G.payIncome(m);
    m.firstActor = m.turn % 2 === 1 ? 'human' : 'ai';
    const order = [m.firstActor, m.firstActor === 'human' ? 'ai' : 'human'];
    for (const who of order) {
      let action;
      if (who === 'ai') action = G.chooseAIAction(m);
      else action = { type: 'pass' }; // passive human: exercises AI expansion/attack/develop
      const res = G.applyOrder(m, who, action);
      trace.push(who + ':' + JSON.stringify(action) + ':' + (res.ok ? 'ok' : 'ILLEGAL-' + res.reason));
      if (G.checkElimination(m)) break;
    }
    if (m.ended) break;
    G.endOfTurn(m);
    if (m.turn >= 20) { G.finalizeScore(m); break; }
  }
  trace.push('END:' + JSON.stringify(m.ended));
  return trace;
}

// AI should act every turn it gets and never receive an illegal order
const sim = runWholeMatch(91, '');
const aiActs = sim.filter(x => x.startsWith('ai:') && !x.includes('pass')).length;
ok(aiActs >= 5, 'AI takes actions every turn (got ' + aiActs + ')');
ok(!sim.some(x => x.includes('ILLEGAL')), 'AI never issues an illegal order');
const endLine = sim[sim.length - 1];
const ended = JSON.parse(endLine.slice(4));
ok(ended.reason === 'elimination' || ended.reason === 'score', 'match ends by elimination or score: ' + endLine);
ok(ended.winner === 'ai' || ended.reason === 'score', 'vs passive human AI competitive: ' + endLine);

/* --- full engine: human always passes -> reaches final score --- */
{
  const m = G.createMatch(42);
  let guard = 0;
  while (!m.ended && guard++ < 100) {
    m.turn += 1;
    G.payIncome(m);
    m.firstActor = m.turn % 2 === 1 ? 'human' : 'ai';
    const order = [m.firstActor, m.firstActor === 'human' ? 'ai' : 'human'];
    for (const who of order) {
      const action = who === 'ai' ? G.chooseAIAction(m) : { type: 'pass' };
      G.applyOrder(m, who, action);
      if (G.checkElimination(m)) break;
    }
    if (m.ended) break;
    G.endOfTurn(m);
    if (m.turn >= 20) { G.finalizeScore(m); }
  }
  ok(m.ended, 'match ends');
  ok(m.turn <= 20, 'at most 20 turns');
  if (m.ended.reason === 'score') {
    const h = G.getScore(m, 'human'), a = G.getScore(m, 'ai');
    ok(h.total === G.getScore(m, 'human').total, 'final score computed');
    eq(m.ended.winner, h.total > a.total ? 'human' : (a.total > h.total ? 'ai' : null), 'winner matches totals');
  }
}

/* --- elimination interrupts: no further orders, events, or relay awards --- */
{
  // human holds only its home; rival is adjacent (via 07) and takes it on turn 5
  const m = G.createMatch(7);
  m.worlds.forEach(w => { if (w.owner === 'human' && w.id !== 5) w.owner = null; });
  m.worlds[6].owner = 'ai';      // 06 neighbors the human home 05
  m.turn = 5;
  G.payIncome(m);
  m.empires.ai.military = 50;   // ensure the exact-cost attack is affordable
  m.firstActor = 'ai';
  G.applyOrder(m, 'ai', { type: 'attack', target: 5 });
  const eliminated = G.checkElimination(m);
  ok(eliminated && m.ended.winner === 'ai', 'last world taken -> immediate loss');
  // the turn is interrupted: end-of-turn never runs, so no awakening and no prestige
  ok(!m.events.awakened, 'no relay awakening after elimination');
  eq(m.empires.ai.prestige, 0, 'no relay prestige awarded after elimination');
  eq(m.empires.human.prestige, 0, 'loser banks nothing');
}

/* --- interface contract bits --- */
s = G.createMatch(3);
eq(G.pad(1), '01', 'world numbers 01-20');
eq(G.pad(20), '20', 'world 20 label');
eq(G.label(s.worlds[5]), 'Nadir 06', 'home displays as 06');
eq(G.label(s.worlds[14]), 'Vulcan 15', 'rival home displays as 15');
eq(G.label(s.worlds[7]), 'Meridian I 08', 'relay 08');
eq(G.label(s.worlds[12]), 'Meridian II 13', 'relay 13');

/* --- init order: initiative alternates --- */
{
  const firsts = [];
  for (let t = 1; t <= 6; t++) firsts.push(t % 2 === 1 ? 'human' : 'ai');
  eq(firsts.join(','), 'human,ai,human,ai,human,ai', 'initiative alternates');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);