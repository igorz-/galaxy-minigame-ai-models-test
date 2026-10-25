import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, LINKS, RELAYS, ATTRIBUTES, owned, adjacent, income, score, attackCost, protectedWorld, orderCost, legality, resolveOrder, chooseAIAction, finishTurn, submitHumanOrder } from '../src/engine.js';

const expand = target => ({ type: 'expand', target });
const attack = target => ({ type: 'attack', target });
const develop = (target, attribute = 'economy') => ({ type: 'develop', target, attribute });
const pass = { type: 'pass' };

test('the chart is fixed, connected, symmetric, and seeded', () => {
  const game = createGame(1234);
  assert.equal(game.worlds.length, 20);
  assert.equal(LINKS.length, 23);
  assert.equal(new Set(LINKS.map(([a, b]) => `${a}:${b}`)).size, 23);
  const seen = new Set([0]);
  for (let i = 0; i < 20; i++) for (const [a, b] of LINKS) { if (seen.has(a)) seen.add(b); if (seen.has(b)) seen.add(a); }
  assert.equal(seen.size, 20);
  for (const w of game.worlds) {
    const opposite = game.worlds[19 - w.id];
    for (const a of ATTRIBUTES) assert.equal(w[a], opposite[a]);
  }
  assert.deepEqual(owned(game, 'human').map(w => w.id), [5]);
  assert.deepEqual(owned(game, 'ai').map(w => w.id), [14]);
  assert.deepEqual(game.worlds.filter(w => w.relay).map(w => w.id), [7, 12]);
  assert.deepEqual(game.worlds.filter(w => w.home).map(w => w.id), [5, 14]);
  assert.equal(game.worlds[0].profile, 'Forge');
  assert.equal(game.worlds[6].profile, 'Trade');
  assert.deepEqual(createGame(1234), game);
  assert.notDeepEqual(createGame(5432).worlds, game.worlds);
});

test('turn one income pays before orders; turns alternate with one order each', () => {
  const game = createGame(5);
  assert.deepEqual(game.empires.human, { credits: 20, military: 2, relayPrestige: 0 });
  assert.deepEqual(game.empires.ai, { credits: 20, military: 2, relayPrestige: 0 });
  assert.equal(game.orders.length, 0);
  submitHumanOrder(game, pass);
  assert.equal(game.turn, 2);
  assert.equal(game.empires.human.credits, 26);
  assert.equal(game.empires.human.military, 4);
  assert.deepEqual(game.orders.map(o => [o.turn, o.actor]), [[1, 'human'], [1, 'ai'], [2, 'ai']]);
  submitHumanOrder(game, pass);
  assert.equal(game.turn, 3);
  assert.deepEqual(game.orders.map(o => [o.turn, o.actor]), [[1, 'human'], [1, 'ai'], [2, 'ai'], [2, 'human']]);
  assert.equal(game.empires.human.credits, 32);
  assert.equal(game.empires.human.military, 6);
});

test('expansion uses dynamic prices, direct adjacency, and exact affordability', () => {
  const game = createGame(32);
  assert.equal(orderCost(game, 'human', expand(6)).credits, 16);
  assert.equal(legality(game, 'human', expand(7)).ok, false);
  game.empires.human.credits = 16;
  const before = { ...game.worlds[6] };
  assert.equal(resolveOrder(game, 'human', expand(6)).ok, true);
  assert.equal(game.empires.human.credits, 0);
  assert.equal(game.worlds[6].economy, before.economy);
  assert.equal(game.worlds[6].capturedTurn, null);
  assert.equal(orderCost(game, 'human', expand(7)).credits, 20);
  game.empires.human.credits = 20;
  resolveOrder(game, 'human', expand(7));
  assert.equal(orderCost(game, 'human', expand(12)).credits, 24);
  assert.equal(adjacent(game, 'human', 12), true);
  assert.equal(adjacent(game, 'human', 11), false);
});

test('illegal human orders are atomic and do not use the order opportunity', () => {
  const game = createGame(2);
  const before = structuredClone(game);
  for (const order of [expand(7), expand(5), attack(14), develop(6), develop(5, 'invalid'), { type: 'unknown' }, expand(100)]) {
    assert.equal(submitHumanOrder(game, order).ok, false);
    assert.deepEqual(game, before);
  }
  assert.equal(submitHumanOrder(game, expand(6)).ok, true);
  assert.equal(game.turn, 2);
  assert.equal(game.worlds[6].owner, 'human');
});

test('development caps at five and only future turns pay upgraded production', () => {
  const game = createGame(4);
  game.empires.human.credits = 8;
  resolveOrder(game, 'human', develop(5));
  assert.equal(game.worlds[5].economy, 4);
  assert.equal(game.empires.human.credits, 0);
  assert.equal(income(game, 'human').credits, 8);
  game.empires.human.credits = 8;
  resolveOrder(game, 'human', develop(5));
  assert.equal(game.worlds[5].economy, 5);
  game.empires.human.credits = 8;
  assert.equal(resolveOrder(game, 'human', develop(5)).ok, false);
  assert.equal(game.empires.human.credits, 8);
  const regular = createGame(4);
  submitHumanOrder(regular, develop(5));
  assert.equal(regular.empires.human.credits, 20); // 20 - 8 + next-turn 8
});

test('exact-cost attacks preserve attributes and defender reserves', () => {
  const game = createGame(1);
  game.worlds[6].owner = 'ai';
  game.worlds[6].defense = 2;
  game.empires.human = { credits: 8, military: 16, relayPrestige: 0 };
  const defender = { ...game.empires.ai };
  const attributes = ATTRIBUTES.map(a => game.worlds[6][a]);
  assert.equal(resolveOrder(game, 'human', attack(6)).ok, true);
  assert.deepEqual(ATTRIBUTES.map(a => game.worlds[6][a]), attributes);
  assert.deepEqual(game.empires.ai, defender);
  assert.equal(game.empires.human.credits, 0);
  assert.equal(game.empires.human.military, 0);
  assert.equal(game.worlds[6].owner, 'human');
});

test('turn eight capture blocks recapture through nine, but not ten', () => {
  const game = createGame(1);
  game.turn = 8;
  game.worlds[6].owner = 'ai';
  game.worlds[7].owner = 'ai';
  game.empires.human.credits = game.empires.ai.credits = 100;
  game.empires.human.military = game.empires.ai.military = 100;
  resolveOrder(game, 'human', attack(6));
  assert.equal(game.worlds[6].capturedTurn, 8);
  assert.equal(legality(game, 'ai', attack(6)).ok, false);
  game.turn = 9;
  assert.equal(protectedWorld(game.worlds[6], game.turn), true);
  assert.equal(legality(game, 'ai', attack(6)).ok, false);
  assert.equal(legality(game, 'human', develop(6)).ok, true);
  game.turn = 10;
  assert.equal(legality(game, 'ai', attack(6)).ok, true);
});

test('blockade only changes Military prices on turns sixteen through nineteen', () => {
  const game = createGame(6);
  game.worlds[6].owner = 'ai';
  game.worlds[6].defense = 2;
  for (const [turn, expected] of [[15, 16], [16, 24], [17, 24], [19, 24], [20, 16]]) {
    game.turn = turn;
    assert.equal(attackCost(game.worlds[6], turn), expected);
    game.empires.human = { credits: 8, military: expected - 1, relayPrestige: 0 };
    assert.equal(legality(game, 'human', attack(6)).ok, false);
    game.empires.human.military++;
    assert.equal(legality(game, 'human', attack(6)).ok, true);
  }
  game.worlds[6].defense++;
  assert.equal(attackCost(game.worlds[6], 20), 22);
});

test('relay awakening upgrades both relays, caps levels and awards before next income', () => {
  const game = createGame(9);
  game.turn = 4;
  game.worlds[7].owner = 'human';
  finishTurn(game);
  assert.equal(game.empires.human.relayPrestige, 0);
  game.worlds[12].economy = 5;
  game.worlds[12].industry = 5;
  const beforeCredits = game.empires.human.credits;
  finishTurn(game);
  assert.equal(game.turn, 6);
  assert.equal(game.worlds[7].economy, 3);
  assert.equal(game.worlds[7].industry, 3);
  assert.equal(game.worlds[12].economy, 5);
  assert.equal(game.worlds[12].industry, 5);
  assert.equal(game.empires.human.relayPrestige, 2);
  assert.equal(game.empires.human.credits - beforeCredits, 12);
});

test('turn eleven suppresses only Military income, and turn twelve restores it', () => {
  const game = createGame(5);
  game.turn = 10;
  game.empires.human.military = 37;
  game.empires.ai.military = 42;
  const credits = game.empires.human.credits;
  finishTurn(game);
  assert.equal(game.turn, 11);
  assert.equal(game.empires.human.military, 37);
  assert.equal(game.empires.ai.military, 42);
  assert.equal(game.empires.human.credits, credits + 6);
  assert.equal(income(game, 'human').military, 0);
  finishTurn(game);
  assert.equal(game.turn, 12);
  assert.equal(game.empires.human.military, 39);
});

test('each held relay pays sixteen awards; final award happens before scoring', () => {
  const game = createGame(5);
  game.worlds[7].owner = 'human';
  game.worlds[12].owner = 'ai';
  // No rival orders: drive only the public end-of-turn event boundary.
  for (let turn = 5; turn <= 20; turn++) {
    game.turn = turn;
    game.empires.ai.credits = 0; // next-turn income cannot afford an attack
    game.empires.ai.military = 0;
    finishTurn(game);
  }
  assert.equal(game.empires.human.relayPrestige, 32);
  assert.equal(game.empires.ai.relayPrestige, 32);
  assert.equal(game.result.human.relay, 32);
  assert.equal(game.result.reason, 'prestige');
  assert.equal(game.turn, 20);
});

test('banked prestige stays with the previous relay owner', () => {
  const game = createGame(5);
  game.turn = 7;
  game.worlds[7].owner = 'human';
  game.empires.human.relayPrestige = 8;
  game.worlds[12].owner = 'ai';
  game.empires.ai.credits = 8;
  game.empires.ai.military = 100;
  resolveOrder(game, 'ai', attack(7));
  assert.equal(game.empires.human.relayPrestige, 8);
  finishTurn(game);
  assert.equal(game.empires.ai.relayPrestige, 4);
});

test('elimination interrupts the turn before rival orders, events, or awards', () => {
  const game = createGame(5);
  game.turn = 5;
  game.worlds[13].owner = 'human';
  game.worlds[7].owner = 'human';
  game.empires.human.credits = 8;
  game.empires.human.military = 16;
  submitHumanOrder(game, attack(14));
  assert.equal(game.result.reason, 'elimination');
  assert.equal(game.result.winner, 'human');
  assert.equal(game.orders.length, 1);
  assert.equal(game.worlds[7].economy, 2);
  assert.equal(game.empires.human.relayPrestige, 0);
  assert.equal(game.phase, 'ended');
  assert.equal(submitHumanOrder(game, pass).ok, false);
});

test('losing a homeworld is not elimination while another holding survives', () => {
  const game = createGame(5);
  game.worlds[13].owner = 'human';
  game.worlds[19].owner = 'ai';
  game.empires.human.credits = 8;
  game.empires.human.military = 16;
  resolveOrder(game, 'human', attack(14));
  assert.equal(game.result, null);
  assert.equal(owned(game, 'ai').length, 1);
});

test('final scoring ignores reserves, counts disconnected worlds, and draws ties', () => {
  const game = createGame(5);
  game.turn = 20;
  game.empires.human.credits = 9999;
  game.empires.human.military = 9999;
  finishTurn(game);
  assert.equal(game.result.winner, 'draw');
  assert.deepEqual(game.result.human, { total: 10, planet: 10, relay: 0, worlds: 1 });
  const disconnected = createGame(6);
  disconnected.worlds[4].owner = 'human';
  assert.equal(score(disconnected, 'human').worlds, 2);
  assert.equal(income(disconnected, 'human').credits, 6 + disconnected.worlds[4].economy * 2);
});

test('a final-turn development adds one planet point and can break a tie', () => {
  const game = createGame(5);
  game.turn = 20;
  submitHumanOrder(game, develop(5));
  assert.equal(game.result.human.total, 11);
  assert.equal(game.result.ai.total, 10);
  assert.equal(game.result.winner, 'human');
});

test('AI prioritizes elimination, then relay capture over neutral relay expansion', () => {
  const game = createGame(5);
  game.empires.ai.credits = 100;
  game.empires.ai.military = 100;
  game.worlds[6].owner = 'ai';
  game.worlds[7].owner = 'human';
  game.worlds[13].owner = 'ai';
  assert.deepEqual(chooseAIAction(game), attack(7));
  game.worlds[7].owner = null;
  assert.deepEqual(chooseAIAction(game), attack(5));
});

test('AI defends a vulnerable relay only when a defense upgrade prevents next-turn attack', () => {
  const game = createGame(5);
  game.worlds[7].owner = 'ai';
  game.worlds[6].owner = 'human';
  game.worlds[12].owner = 'ai';
  game.empires.ai.credits = 100;
  game.empires.ai.military = 0;
  game.empires.human.credits = 8;
  game.empires.human.military = 16;
  assert.deepEqual(chooseAIAction(game), develop(7, 'defense'));
  game.worlds[7].capturedTurn = game.turn;
  assert.notDeepEqual(chooseAIAction(game), develop(7, 'defense'));
  game.worlds[7].capturedTurn = null;
  game.turn = 15;
  assert.notDeepEqual(chooseAIAction(game), develop(7, 'defense')); // blockade raises next-turn cost above reserves
  game.empires.human.military = 24;
  assert.deepEqual(chooseAIAction(game), develop(7, 'defense'));
});

test('AI chooses a shortest route toward a neutral relay', () => {
  const game = createGame(1);
  assert.deepEqual(chooseAIAction(game), expand(13));
});

test('full matches are repeatable and never violate resource or order invariants', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const a = createGame(seed), b = createGame(seed);
    const history = [];
    while (!a.result) {
      const candidates = a.worlds.flatMap(w => [attack(w.id), expand(w.id), develop(w.id, 'industry'), develop(w.id), develop(w.id, 'defense')]);
      const legal = candidates.filter(o => legality(a, 'human', o).ok);
      const order = legal[(a.turn * 17 + seed) % (legal.length || 1)] || pass;
      assert.equal(submitHumanOrder(a, order).ok, true);
      assert.equal(submitHumanOrder(b, order).ok, true);
      history.push(order);
      for (const e of Object.values(a.empires)) assert.ok(e.credits >= 0 && e.military >= 0);
      for (const w of a.worlds) for (const attr of ATTRIBUTES) assert.ok(w[attr] >= 1 && w[attr] <= 5);
      assert.ok(history.length <= 20);
    }
    assert.deepEqual(a, b);
    const turns = a.orders.map(o => `${o.turn}:${o.actor}`);
    assert.equal(new Set(turns).size, turns.length);
    const replay = createGame(seed);
    assert.equal(replay.empires.human.relayPrestige, 0);
    assert.equal(replay.orders.length, 0);
    assert.deepEqual(replay.worlds, createGame(seed).worlds);
  }
});
