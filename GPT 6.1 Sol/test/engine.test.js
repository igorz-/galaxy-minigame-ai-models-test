import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, HUMAN, AI, LINKS, RELAYS, ATTRS, owned, adjacent, income, score, legality, executeOrder, attackCost, protectedAt, chooseAIAction, startTurn, finishTurn, awardRelayPrestige, commitHuman, forecast } from '../src/engine.js';

const game = () => createGame(871923);
const funded = () => { const s = game(); for (const e of Object.values(s.empires)) { e.credits = 10000; e.military = 10000; } return s; };
const expand = target => ({ type: 'expand', target });
const attack = target => ({ type: 'attack', target });
const develop = (target, attr = 'economy') => ({ type: 'develop', target, attr });

test('20 worlds, 23 unique lanes, fixed homes and relays, symmetric seeded attributes', () => {
  const s = game();
  assert.equal(s.worlds.length, 20); assert.equal(LINKS.length, 23);
  assert.equal(new Set(LINKS.map(p => p.join('-'))).size, 23);
  assert.deepEqual(owned(s, HUMAN).map(w => w.id), [5]);
  assert.deepEqual(owned(s, AI).map(w => w.id), [14]);
  assert.deepEqual(s.worlds.filter(w => w.relay).map(w => w.id), [7, 12]);
  for (let i = 0; i < 20; i++) for (const a of ATTRS) assert.equal(s.worlds[i][a], s.worlds[19 - i][a]);
  assert.equal(s.worlds[0].industry, 3); assert.equal(s.worlds[19].industry, 3);
  assert.equal(s.worlds[6].economy, 3); assert.equal(s.worlds[13].economy, 3);
  assert.equal(s.worlds[5].economy, 3); assert.equal(s.worlds[5].defense, 2);
  assert.equal(s.worlds[7].economy, 2);
});
test('seed changes profiles, never topology; replay resets all state', () => {
  const s = game(), pristine = structuredClone(s);
  commitHuman(s, develop(5));
  assert.deepEqual(createGame(871923), pristine);
  assert.notDeepEqual(createGame(77).worlds, pristine.worlds);
});
test('first-turn income paid once before human orders', () => {
  const s = game();
  for (const actor of [HUMAN, AI]) assert.deepEqual(s.empires[actor], { credits: 20, military: 2, prestige: 0 });
  const n = s.logs.length;
  commitHuman(s, { type: 'pass' });
  assert.equal(s.turn, 2); assert.equal(s.empires.human.credits, 26); assert.equal(s.empires.human.military, 4);
  assert.equal(s.logs.slice(n).filter(l => l.actor === HUMAN).length, 1);
  assert.equal(s.logs.slice(n).filter(l => l.actor === AI).length, 2, 'odd-turn response, then even-turn initiative');
});
test('initiative alternates and AI gets exactly one action per shared turn', () => {
  const s = game();
  for (let i = 0; i < 20 && !s.over; i++) commitHuman(s, { type: 'pass' });
  assert.equal(s.over, true);
  for (let turn = 1; turn <= s.turn; turn++) {
    const actions = s.logs.filter(l => l.turn === turn && [HUMAN, AI].includes(l.actor));
    assert.ok(actions.filter(l => l.actor === HUMAN).length <= 1);
    assert.ok(actions.filter(l => l.actor === AI).length <= 1);
    if (actions.length === 2) assert.equal(actions[0].actor, turn % 2 ? HUMAN : AI);
  }
});
test('expansion prices scale 16, 20, 24 and exact affordability works', () => {
  const s = funded();
  for (const [target, price] of [[6, 16], [7, 20], [8, 24]]) {
    s.empires.human.credits = price;
    assert.equal(legality(s, HUMAN, expand(target)).credits, price);
    assert.equal(executeOrder(s, HUMAN, expand(target)).ok, true);
    assert.equal(s.empires.human.credits, 0);
    assert.equal(s.worlds[target].captured, null);
  }
});
test('expansion requires neutral ownership and a direct lane', () => {
  const s = funded();
  assert.equal(legality(s, HUMAN, expand(7)).ok, false);
  assert.equal(legality(s, HUMAN, expand(14)).ok, false);
  assert.equal(legality(s, HUMAN, expand(5)).ok, false);
  for (const id of [0, 6, 10]) assert.equal(legality(s, HUMAN, expand(id)).ok, true);
});
test('invalid orders do not spend resources or consume the human turn', () => {
  const s = game(), snapshot = structuredClone(s);
  assert.equal(commitHuman(s, expand(19)).ok, false);
  assert.deepEqual(s, snapshot);
  assert.equal(commitHuman(s, develop(5)).ok, true); assert.equal(s.turn, 2);
});
test('development costs 8, modifies one attribute, caps at 5, income is delayed', () => {
  const s = game();
  assert.equal(executeOrder(s, HUMAN, develop(5)).ok, true);
  assert.equal(s.empires.human.credits, 12); assert.equal(s.worlds[5].economy, 4);
  assert.equal(s.worlds[5].industry, 2); assert.equal(income(s, HUMAN).credits, 8);
  executeOrder(s, HUMAN, develop(5)); assert.equal(s.worlds[5].economy, 5);
  assert.equal(executeOrder(s, HUMAN, develop(5)).ok, false);
  assert.equal(s.empires.human.credits, 4);
  assert.equal(legality(s, HUMAN, develop(14)).ok, false);
});
test('attack costs current Defense, permits exact reserve payment, preserves attributes and enemy reserves', () => {
  const s = funded(); s.worlds[6].owner = AI; s.worlds[6].defense = 2;
  s.empires.human.credits = 8; s.empires.human.military = 16;
  const enemy = structuredClone(s.empires.ai), attrs = ATTRS.map(a => s.worlds[6][a]);
  assert.equal(executeOrder(s, HUMAN, attack(6)).ok, true);
  assert.deepEqual(ATTRS.map(a => s.worlds[6][a]), attrs);
  assert.deepEqual(s.empires.ai, enemy);
  assert.equal(s.empires.human.credits, 0); assert.equal(s.empires.human.military, 0);
});
test('attack protection on T8 lasts through T9 and ends T10; expansion gives none', () => {
  const s = funded(); s.turn = 8; s.worlds[6].owner = AI;
  executeOrder(s, HUMAN, attack(6));
  assert.equal(protectedAt(s.worlds[6], 8), true);
  assert.equal(protectedAt(s.worlds[6], 9), true);
  assert.equal(protectedAt(s.worlds[6], 10), false);
  s.worlds[7].owner = AI;
  s.turn = 9; assert.match(legality(s, AI, attack(6)).reason, /turn 10/);
  s.turn = 10; assert.equal(legality(s, AI, attack(6)).ok, true);
  executeOrder(s, HUMAN, expand(0)); assert.equal(s.worlds[0].captured, null);
});
test('defense upgrades instantly add 6 Military to conquest cost', () => {
  const s = funded(), before = attackCost(s.worlds[5], 3);
  executeOrder(s, HUMAN, develop(5, 'defense'));
  assert.equal(attackCost(s.worlds[5], 3), before + 6);
});
test('blockade surcharge only on turns 16–19, including exact affordability', () => {
  const s = funded(); s.worlds[6].owner = AI; s.worlds[6].defense = 2;
  for (const turn of [1, 15, 20]) assert.equal(attackCost(s.worlds[6], turn), 16);
  for (const turn of [16, 17, 18, 19]) assert.equal(attackCost(s.worlds[6], turn), 24);
  s.turn = 16; s.empires.human.military = 23; assert.equal(legality(s, HUMAN, attack(6)).ok, false);
  s.empires.human.military = 24; assert.equal(legality(s, HUMAN, attack(6)).ok, true);
});
test('relay awakening precedes first prestige award and next-turn production', () => {
  const s = funded(); s.turn = 5; s.worlds[7].owner = HUMAN; s.worlds[7].economy = 5;
  const before = s.empires.human.credits;
  finishTurn(s);
  assert.equal(s.turn, 6); assert.equal(s.worlds[7].economy, 5); assert.equal(s.worlds[7].industry, 3);
  assert.equal(s.worlds[12].economy, 3); assert.equal(s.worlds[12].industry, 3);
  assert.equal(s.empires.human.prestige, 2);
  assert.equal(s.empires.human.credits - before, 16);
});
test('turn 11 suppresses only new Military for both empires', () => {
  const s = funded(); s.turn = 11;
  const before = structuredClone(s.empires);
  startTurn(s);
  for (const actor of [HUMAN, AI]) {
    assert.equal(s.empires[actor].military, before[actor].military);
    assert.equal(s.empires[actor].credits, before[actor].credits + 6);
  }
  assert.equal(income(s, HUMAN, 12).military, 2);
});
test('banked prestige stays with previous owner; 16 awards give 32 each', () => {
  const s = funded(); s.worlds[7].owner = HUMAN; s.worlds[12].owner = AI;
  for (let turn = 5; turn <= 20; turn++) { s.turn = turn; awardRelayPrestige(s); }
  assert.equal(s.empires.human.prestige, 32); assert.equal(s.empires.ai.prestige, 32);
  s.worlds[7].owner = AI;
  assert.equal(s.empires.human.prestige, 32);
});
test('turn 20 awards prestige before scoring and symmetric scores draw', () => {
  const s = game(); s.turn = 20; s.worlds[7].owner = HUMAN; s.worlds[12].owner = AI;
  finishTurn(s);
  assert.equal(s.over, true); assert.equal(s.winner, 'draw');
  assert.equal(score(s, HUMAN).relay, 2);
  assert.equal(score(s, HUMAN).planet, 19);
  assert.equal(score(s, HUMAN).total, 21);
});
test('credits and Military do not score; late development adds one point', () => {
  const s = funded(), before = score(s, HUMAN).total;
  executeOrder(s, HUMAN, develop(5, 'industry'));
  assert.equal(score(s, HUMAN).total, before + 1);
  s.empires.human.military = 999999; s.empires.human.credits = 999999;
  assert.equal(score(s, HUMAN).total, before + 1);
});
test('homeworld loss alone does not end a match; last-world capture ends immediately', () => {
  const s = funded(); s.worlds[6].owner = HUMAN; s.worlds[0].owner = AI;
  executeOrder(s, AI, attack(5)); assert.equal(s.over, false);
  s.worlds[6].captured = null;
  executeOrder(s, AI, attack(6)); assert.equal(s.over, true); assert.equal(s.winner, AI);
});
test('elimination interrupts turn before relay awards, events or income', () => {
  const s = funded(); s.turn = 5; s.worlds[13].owner = HUMAN; s.worlds[7].owner = HUMAN;
  const credits = s.empires.ai.credits;
  commitHuman(s, attack(14));
  assert.equal(s.over, true); assert.equal(s.turn, 5); assert.equal(s.winner, HUMAN);
  assert.equal(s.empires.ai.credits, credits); assert.equal(s.empires.human.prestige, 0);
  assert.equal(s.worlds[7].industry, 2);
});
test('disconnected worlds still produce and score, and provide their own adjacency', () => {
  const s = game(); s.worlds[17].owner = HUMAN;
  assert.equal(adjacent(s, HUMAN, 18), true);
  assert.equal(income(s, HUMAN).credits, 6 + s.worlds[17].economy * 2);
  assert.equal(score(s, HUMAN).count, 2);
});
test('AI prioritizes a legal elimination over a relay', () => {
  const s = funded(); s.worlds[0].owner = AI; s.worlds[6].owner = AI;
  assert.deepEqual(chooseAIAction(s), attack(5));
});
test('AI chooses lower-ID relay attack, then lower-ID relay expansion', () => {
  const s = funded(); s.worlds[8].owner = AI; s.worlds[13].owner = AI;
  s.worlds[7].owner = HUMAN; s.worlds[12].owner = HUMAN;
  assert.deepEqual(chooseAIAction(s), attack(7));
  s.worlds[7].owner = null; s.worlds[12].owner = null;
  assert.deepEqual(chooseAIAction(s), expand(7));
});
test('AI defends threatened relay only when the upgrade prices out next-turn attack', () => {
  const s = funded(); s.turn = 12;
  for (const w of s.worlds) w.owner = AI;
  s.worlds[6].owner = HUMAN; s.worlds[5].owner = HUMAN;
  s.worlds[7].defense = 2; s.worlds[7].captured = null;
  s.empires.human.military = 16; s.empires.ai.military = 0;
  assert.deepEqual(chooseAIAction(s), develop(7, 'defense'));
  s.empires.human.military = 22;
  assert.notDeepEqual(chooseAIAction(s), develop(7, 'defense'));
  s.worlds[7].captured = 12; s.empires.human.military = 16;
  assert.notDeepEqual(chooseAIAction(s), develop(7, 'defense'));
});
test('forecasts distinguish future and active event effects', () => {
  const s = game(); assert.equal(forecast(s).turn, 5); assert.equal(forecast(s).active, false);
  s.turn = 11; assert.equal(forecast(s).active, true);
  s.turn = 15; assert.equal(forecast(s).active, false);
  s.turn = 16; assert.equal(forecast(s).active, true);
  s.turn = 20; assert.match(forecast(s).text, /restored/);
});
test('same seed and same human policy produce the exact same match', () => {
  const play = seed => {
    const s = createGame(seed);
    while (!s.over) {
      let order;
      for (const w of s.worlds) if (legality(s, HUMAN, expand(w.id)).ok) { order = expand(w.id); break; }
      if (!order) for (const w of owned(s, HUMAN)) if (legality(s, HUMAN, develop(w.id, 'industry')).ok) { order = develop(w.id, 'industry'); break; }
      commitHuman(s, order || { type: 'pass' });
    }
    return s;
  };
  for (const seed of [0, 1, 100, 871923, 0xFFFFFFFF]) assert.deepEqual(play(seed), play(seed));
});
test('200 complete matches preserve resources, legal AI orders and attribute bounds', () => {
  for (let seed = 0; seed < 200; seed++) {
    const s = createGame(seed);
    while (!s.over) {
      const a = chooseAIAction(s); assert.equal(legality(s, AI, a).ok, true);
      const choices = s.worlds.flatMap(w => [expand(w.id), attack(w.id), ...ATTRS.map(attr => develop(w.id, attr))]).filter(o => legality(s, HUMAN, o).ok);
      const order = choices.length ? choices[(s.turn * 7 + seed) % choices.length] : { type: 'pass' };
      assert.equal(commitHuman(s, order).ok, true);
      for (const e of Object.values(s.empires)) { assert.ok(e.credits >= 0); assert.ok(e.military >= 0); }
      for (const w of s.worlds) for (const a of ATTRS) assert.ok(w[a] >= 1 && w[a] <= 5);
      assert.ok(s.turn <= 20);
    }
  }
});
