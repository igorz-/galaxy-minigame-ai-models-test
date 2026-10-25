/* =====================================================================
   RELIC WARS — tests.js
   Headless verification of the rules brief. Runs inside a vm context
   where engine.js and ai.js have already been evaluated (see run.js).
   ===================================================================== */
'use strict';

let PASS = 0, FAIL = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { PASS++; }
  else { FAIL++; failures.push(msg); console.error('  ✕ ' + msg); }
}
function eq(a, b, msg) { ok(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }
function deepEq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg); }

/* ------------------------------------------------- 1. Galaxy structure */
{
  eq(LANES.length, 23, 'lane count = 23');
  const key = (a, b) => Math.min(a, b) + '-' + Math.max(a, b);
  const set = new Set(LANES.map(([a, b]) => key(a, b)));
  eq(set.size, 23, 'lanes unique');
  // 16 horizontal
  let horiz = 0;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (set.has(key(r * 5 + c, r * 5 + c + 1))) horiz++;
  eq(horiz, 16, '16 horizontal lanes');
  let vert = 0;
  for (let r = 0; r < 3; r++) {
    if (set.has(key(r * 5, (r + 1) * 5))) vert++;
    if (set.has(key(r * 5 + 4, (r + 1) * 5 + 4))) vert++;
  }
  eq(vert, 6, '6 vertical lanes on edge columns');
  ok(set.has(key(7, 12)), 'relay lane 7-12 exists');
  // adjacency symmetric
  for (let id = 0; id < 20; id++) for (const n of ADJ[id]) ok(ADJ[n].includes(id), `adj symmetric ${id}-${n}`);
  // no interior vertical lanes (cols 1-3 except relay link)
  for (const c of [1, 2, 3]) for (let r = 0; r < 3; r++) {
    const a = r * 5 + c, b = (r + 1) * 5 + c;
    if (!(a === 7 && b === 12)) ok(!set.has(key(a, b)), `no vertical lane ${a}-${b}`);
  }
}

/* --------------------------------------------- 2. Seeded map & symmetry */
{
  const S = createMatch(123456789);
  eq(S.worlds.length, 20, '20 worlds');
  eq(S.worlds[5].owner, 'human', 'human home is id 5');
  eq(S.worlds[14].owner, 'ai', 'ai home is id 14');
  eq(S.worlds.filter(w => w.owner === null).length, 18, '18 neutral worlds');
  // homes + relays overridden
  deepEq({ e: S.worlds[5].e, i: S.worlds[5].i, d: S.worlds[5].d }, { e: 3, i: 2, d: 2 }, 'human home E3/I2/D2');
  deepEq({ e: S.worlds[14].e, i: S.worlds[14].i, d: S.worlds[14].d }, { e: 3, i: 2, d: 2 }, 'ai home E3/I2/D2');
  for (const rid of [7, 12]) {
    deepEq({ e: S.worlds[rid].e, i: S.worlds[rid].i, d: S.worlds[rid].d }, { e: 2, i: 2, d: 2 }, `relay ${rid} E2/I2/D2`);
    eq(S.worlds[rid].owner, null, `relay ${rid} starts neutral`);
  }
  // forced profiles
  eq(S.worlds[0].profile, 'Forge', 'id 0 forced Forge');
  eq(S.worlds[19].profile, 'Forge', 'id 19 forced Forge');
  eq(S.worlds[6].profile, 'Trade', 'id 6 forced Trade');
  eq(S.worlds[13].profile, 'Trade', 'id 13 forced Trade');
  // rotational symmetry of profiles AND attributes
  for (let id = 0; id < 10; id++) {
    const a = S.worlds[id], b = S.worlds[19 - id];
    eq(a.profile, b.profile, `pair ${id}/${19 - id} same profile`);
    deepEq({ e: a.e, i: a.i, d: a.d }, { e: b.e, i: b.i, d: b.d }, `pair ${id}/${19 - id} same attributes`);
  }
  // profile attribute mapping
  const PROF = CFG.PROFILES;
  for (const w of S.worlds) {
    if ([5, 14, 7, 12].includes(w.id)) continue;
    deepEq({ e: w.e, i: w.i, d: w.d }, PROF[w.profile], `world ${w.id} matches profile ${w.profile}`);
  }
  // determinism across regeneration + seed changes profiles
  const S2 = createMatch(123456789);
  deepEq(S.worlds.map(w => w.profile), S2.worlds.map(w => w.profile), 'same seed → same profiles');
  let differs = false;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    if (JSON.stringify(createMatch(seed).worlds.map(w => w.profile)) !== JSON.stringify(S.worlds.map(w => w.profile))) { differs = true; break; }
  }
  ok(differs, 'different seeds change profiles');
  // positions/links never change with seed
  deepEq(createMatch(999).worlds.map(w => w.name), S.worlds.map(w => w.name), 'names fixed');
  // starting reserves
  eq(S.empires.human.credits, 14, 'start 14 credits');
  eq(S.empires.human.mil, 0, 'start 0 military');
}

/* ------------------------------------------------------ 3. Turn-1 income */
{
  const S = createMatch(42);
  S.turn = 1;
  payIncome(S);
  eq(S.empires.human.credits, 20, 'turn 1: 20 credits');
  eq(S.empires.human.mil, 2, 'turn 1: 2 military');
  eq(S.empires.ai.credits, 20, 'turn 1: rival 20 credits');
  eq(S.empires.ai.mil, 2, 'turn 1: rival 2 military');
  // income formula on developed state
  S.worlds[5].e = 5; S.worlds[5].i = 4;
  const inc = getIncome(S, 'human', 2);
  eq(inc.credits, 10, 'income credits = 2×ΣE');
  eq(inc.mil, 4, 'income mil = ΣI');
  // turn 11 suppression
  const sup = getIncome(S, 'human', 11);
  eq(sup.credits, 10, 'turn 11 credits unaffected');
  eq(sup.mil, 0, 'turn 11 zero military income');
  const before = S.empires.human.mil;
  S.turn = 11; payIncome(S);
  eq(S.empires.human.mil, before, 'payIncome on turn 11 adds no military');
}

/* ------------------------------------------ 4. Expand cost & adjacency */
{
  const mk = (ownedIds) => {
    const S = createMatch(7);
    for (const w of S.worlds) w.owner = null;
    for (const id of ownedIds) S.worlds[id].owner = 'human';
    S.empires.human.credits = 999;
    S.turn = 1;
    return S;
  };
  const S1 = mk([5]);
  eq(expandCost(S1, 'human'), 16, 'expand from 1 world = 16');
  const S2 = mk([5, 0]);
  eq(expandCost(S2, 'human'), 20, 'expand from 2 worlds = 20');
  const S3 = mk([5, 0, 1]);
  eq(expandCost(S3, 'human'), 24, 'expand from 3 worlds = 24');
  // adjacency: from home 5 → legal targets are 0, 6, 10
  ok(orderStatus(S1, 'human', { type: 'expand', target: 0 }).legal, 'expand to adjacent 0 legal');
  ok(orderStatus(S1, 'human', { type: 'expand', target: 6 }).legal, 'expand to adjacent 6 legal');
  ok(orderStatus(S1, 'human', { type: 'expand', target: 10 }).legal, 'expand to adjacent 10 legal');
  ok(!orderStatus(S1, 'human', { type: 'expand', target: 1 }).legal, 'expand to non-adjacent illegal');
  ok(!orderStatus(S1, 'human', { type: 'expand', target: 7 }).legal, 'expand to non-adjacent relay illegal');
  // adjacency via ANY owned world (disconnected holdings still count)
  const S4 = mk([5, 19]);
  ok(orderStatus(S4, 'human', { type: 'expand', target: 18 }).legal, 'expand adjacent to disconnected holding legal');
  // affordability gate
  S1.empires.human.credits = 15;
  ok(!orderStatus(S1, 'human', { type: 'expand', target: 0 }).legal, 'expand unaffordable illegal');
  S1.empires.human.credits = 16;
  ok(orderStatus(S1, 'human', { type: 'expand', target: 0 }).legal, 'exact-cost expand legal');
  // owned / enemy targets illegal
  ok(!orderStatus(S1, 'human', { type: 'expand', target: 5 }).legal, 'expand onto own world illegal');
  S1.worlds[0].owner = 'ai';
  ok(!orderStatus(S1, 'human', { type: 'expand', target: 0 }).legal, 'expand onto enemy world illegal');
}

/* ------------------------------------------------------ 5. Develop rules */
{
  const S = createMatch(7);
  S.turn = 3;
  S.empires.human.credits = 8;
  const before = { ...S.worlds[5] };
  const res = resolveOrder(S, 'human', { type: 'develop', target: 5, attr: 'd' });
  ok(res.ok, 'develop legal on own world');
  eq(S.worlds[5].d, before.d + 1, 'develop raises exactly one attribute by 1');
  eq(S.worlds[5].e, before.e, 'develop leaves E intact');
  eq(S.empires.human.credits, 0, 'develop spends exactly 8');
  // unaffordable
  ok(!resolveOrder(S, 'human', { type: 'develop', target: 5, attr: 'e' }).ok, 'develop without credits fails');
  eq(S.worlds[5].e, before.e, 'failed develop mutates nothing');
  // cap at 5
  S.empires.human.credits = 100;
  S.worlds[5].e = 5;
  const st = orderStatus(S, 'human', { type: 'develop', target: 5, attr: 'e' });
  ok(!st.legal, 'develop capped attribute illegal');
  ok(st.reasons.join(' ').includes('max'), 'reason mentions max');
  // wrong owner
  ok(!orderStatus(S, 'human', { type: 'develop', target: 14, attr: 'e' }).legal, 'develop enemy world illegal');
  ok(!orderStatus(S, 'human', { type: 'develop', target: 0, attr: 'e' }).legal, 'develop neutral world illegal');
  // affects income from NEXT turn
  const S2 = createMatch(7); S2.turn = 4;
  S2.empires.human.credits = 8;
  S2.worlds[5].e = 4;
  const incBefore = getIncome(S2, 'human', 5).credits;
  resolveOrder(S2, 'human', { type: 'develop', target: 5, attr: 'e' });
  eq(getIncome(S2, 'human', 5).credits, incBefore + 2, 'E upgrade adds +2 cr per payment from next turn');
}

/* ------------------------------------------------------ 6. Attack rules */
{
  const mk = () => {
    const S = createMatch(7);
    S.worlds[6].owner = 'ai';            // Talos, Trade E3/I1/D1
    S.worlds[6].d = 2;
    S.worlds[5].owner = 'human';
    S.turn = 4;
    S.empires.human.credits = 8;
    return S;
  };
  let S = mk();
  eq(attackMilCost(S, 6, 4), 16, 'D2 attack = 16 mil normally');
  S.empires.human.mil = 16;
  const attrsBefore = { e: S.worlds[6].e, i: S.worlds[6].i, d: S.worlds[6].d };
  const aiRes = { ...S.empires.ai };
  const res = resolveOrder(S, 'human', { type: 'attack', target: 6 });
  ok(res.ok, 'exact-cost attack succeeds');
  eq(S.worlds[6].owner, 'human', 'world captured');
  deepEq({ e: S.worlds[6].e, i: S.worlds[6].i, d: S.worlds[6].d }, attrsBefore, 'captured attributes intact');
  eq(S.empires.human.credits, 0, 'attack spends 8 cr');
  eq(S.empires.human.mil, 0, 'attack spends exact mil');
  deepEq(S.empires.ai, aiRes, "defender's reserves unchanged");
  eq(S.worlds[6].protectedUntil, 5, 'captured on T=4 → protected through 5');

  // blockade surcharge window
  S = mk();
  eq(attackMilCost(S, 6, 15), 16, 'turn 15: no surcharge yet');
  eq(attackMilCost(S, 6, 16), 24, 'turn 16: +8 blockade');
  eq(attackMilCost(S, 6, 19), 24, 'turn 19: +8 blockade');
  eq(attackMilCost(S, 6, 20), 16, 'turn 20: blockade lifted');

  // defense upgrades raise cost immediately
  S = mk();
  S.empires.human.credits = 100;
  S.worlds[6].owner = 'human'; // to develop it
  resolveOrder(S, 'human', { type: 'develop', target: 6, attr: 'd' });
  eq(attackMilCost(S, 6, 4), 22, 'D3 → 22 mil (+6 per defense)');

  // protection window: captured turn 8 → shielded 8 & 9, attackable 10
  S = mk();
  S.worlds[7].owner = 'ai';        // rival has a lane into 6 (7-6 lane)
  S.turn = 8; S.empires.human.mil = 100;
  resolveOrder(S, 'human', { type: 'attack', target: 6 });
  eq(S.worlds[6].protectedUntil, 9, 'turn-8 capture protected through 9');
  ok(isProtected(S, 6, 8), 'protected during turn 8');
  ok(isProtected(S, 6, 9), 'protected during turn 9');
  ok(!isProtected(S, 6, 10), 'attackable on turn 10');
  S.turn = 9; S.empires.ai.credits = 8; S.empires.ai.mil = 100;
  const shieldSt = orderStatus(S, 'ai', { type: 'attack', target: 6 });
  ok(!shieldSt.legal, 'rival cannot attack shielded world on turn 9');
  ok(shieldSt.reasons.join(' ').includes('protection'), 'reason names capture protection');
  S.turn = 10;
  ok(orderStatus(S, 'ai', { type: 'attack', target: 6 }).legal, 'rival can attack it on turn 10');

  // attack requires adjacency + enemy ownership
  S = mk();
  S.empires.human.mil = 100;
  ok(!orderStatus(S, 'human', { type: 'attack', target: 7 }).legal, 'attack non-adjacent enemy illegal');
  ok(!orderStatus(S, 'human', { type: 'attack', target: 0 }).legal, 'attack neutral illegal');
  ok(!orderStatus(S, 'human', { type: 'attack', target: 5 }).legal, 'attack own world illegal');

  // elimination ends match immediately
  S = mk();
  for (const w of S.worlds) if (w.owner === 'ai' && w.id !== 6) w.owner = null;
  S.empires.human.mil = 100;
  resolveOrder(S, 'human', { type: 'attack', target: 6 });
  ok(S.over, 'match over on elimination');
  eq(S.winner, 'human', 'human wins by elimination');
  eq(S.endReason, 'elimination', 'end reason elimination');
}

/* ----------------------------------------- 7. Relays, events, prestige */
{
  const S = createMatch(7);
  S.turn = 5;
  S.worlds[7].owner = 'human';
  S.worlds[12].owner = 'ai';
  const evs = endTurnEvent(S);
  eq(evs.length, 1, 'one event at end of turn 5');
  eq(evs[0].kind, 'wake', 'relays awaken');
  deepEq({ e: S.worlds[7].e, i: S.worlds[7].i }, { e: 3, i: 3 }, 'relay 7 → E3/I3');
  deepEq({ e: S.worlds[12].e, i: S.worlds[12].i }, { e: 3, i: 3 }, 'relay 12 → E3/I3');
  // cap at 5
  S.worlds[7].e = 5; S.worlds[7].i = 5;
  endTurnEvent(S); // idempotent-ish: re-run (turn still 5) — cap must hold
  eq(S.worlds[7].e, 5, 'awaken caps E at 5');
  eq(S.worlds[7].i, 5, 'awaken caps I at 5');
  // first prestige at end of turn 5
  const awards = awardRelayPrestige(S);
  eq(awards.length, 2, 'both relays award');
  eq(S.empires.human.prestige, 2, 'human banks 2 from relay 7');
  eq(S.empires.ai.prestige, 2, 'rival banks 2 from relay 12');
  // unowned relay pays nothing
  S.worlds[12].owner = null;
  awardRelayPrestige(S);
  eq(S.empires.human.prestige, 4, 'owned relay keeps paying');
  eq(S.empires.ai.prestige, 2, 'unowned relay pays nothing');
  // banked prestige stays after flip
  S.worlds[7].owner = 'ai';
  awardRelayPrestige(S);
  eq(S.empires.human.prestige, 4, 'previously banked stays with earner');
  eq(S.empires.ai.prestige, 4, 'new owner banks from flip');
  // before turn 5 no prestige
  const S0 = createMatch(7); S0.turn = 4; S0.worlds[7].owner = 'human';
  eq(awardRelayPrestige(S0).length, 0, 'no prestige before turn 5');
  // warnings
  const S10 = createMatch(7); S10.turn = 10;
  eq(endTurnEvent(S10)[0].kind, 'warn-supernova', 'supernova warning end of turn 10');
  const S15 = createMatch(7); S15.turn = 15;
  eq(endTurnEvent(S15)[0].kind, 'warn-blockade', 'blockade warning end of turn 15');
  const S20 = createMatch(7); S20.turn = 20;
  eq(endTurnEvent(S20)[0].kind, 'final', 'final event end of turn 20');
  eq(endTurnEvent(createMatch(7)).length, 0, 'no event on ordinary turns');
  // blockade active window
  ok(!blockadeActive(15) && blockadeActive(16) && blockadeActive(19) && !blockadeActive(20), 'blockade only turns 16–19');
  // max prestige: 16 awards (turns 5..20) × 2 per relay
  const Sx = createMatch(7); Sx.worlds[7].owner = 'human';
  let total = 0;
  for (let t = 5; t <= 20; t++) { Sx.turn = t; total += awardRelayPrestige(Sx).length; }
  eq(total, 16, '16 eligible awards for one held relay');
  eq(Sx.empires.human.prestige, 32, '32 prestige from holding one relay throughout');
}

/* ------------------------------------------------------- 8. Scoring */
{
  const S = createMatch(7);
  // human: homes 5 (3/2/2) + 0 Forge (1/3/1) → pv = 3×2 + (7+5) = 18
  S.worlds[0].owner = 'human';
  S.empires.human.prestige = 6;
  const sc = getScore(S, 'human');
  eq(sc.worlds, 2, 'score worlds');
  eq(sc.planetValue, 3 * 2 + (3 + 2 + 2) + (1 + 3 + 1), 'planet value = 3×count + ΣEID');
  eq(sc.relicPrestige, 6, 'relic prestige banked');
  eq(sc.total, sc.planetValue + 6, 'total = pv + relic');
  // tie → draw
  S.worlds[19].owner = 'ai'; // Forge 1/3/1 mirrors
  S.worlds[14].owner = 'ai';
  S.empires.ai.prestige = 6;
  const st = finalStandings(S);
  eq(st.human.total, st.ai.total, 'symmetric totals');
  eq(st.winner, 'draw', 'equal totals draw');
  // late develop still adds 1 planet value
  const pvBefore = getScore(S, 'human').planetValue;
  S.empires.human.credits = 8; S.turn = 20;
  resolveOrder(S, 'human', { type: 'develop', target: 5, attr: 'd' });
  eq(getScore(S, 'human').planetValue, pvBefore + 1, 'late develop +1 planet value');
}

/* ------------------------------------ 9. Illegal orders spend nothing */
{
  const S = createMatch(7);
  S.turn = 3;
  S.empires.human.credits = 0; // broke empire: nothing is affordable
  const snap = JSON.stringify(S.empires) + JSON.stringify(S.worlds);
  ok(!resolveOrder(S, 'human', { type: 'expand', target: 12 }).ok, 'non-adjacent expand rejected');
  ok(!resolveOrder(S, 'human', { type: 'attack', target: 14 }).ok, 'non-adjacent attack rejected');
  ok(!resolveOrder(S, 'human', { type: 'develop', target: 14, attr: 'e' }).ok, 'develop on enemy rejected');
  ok(!resolveOrder(S, 'human', { type: 'expand', target: 0 }).ok, 'unaffordable expand rejected');
  ok(!resolveOrder(S, 'human', { type: 'develop', target: 5, attr: 'e' }).ok, 'unaffordable develop rejected');
  S.worlds[6].owner = 'ai';             // structurally valid attack target (6 adj 5)
  S.empires.human.credits = 8;          // credits fine...
  S.empires.human.mil = 9;              // ...but D1 costs 10 mil
  ok(!resolveOrder(S, 'human', { type: 'attack', target: 6 }).ok, 'attack with insufficient military rejected');
  eq(S.empires.human.credits, 8, 'rejected attack kept credits');
  eq(S.empires.human.mil, 9, 'rejected attack kept military');
  S.empires.human.credits = 0; S.empires.human.mil = 0;
  S.worlds[6].owner = null;
  eq(JSON.stringify(S.empires) + JSON.stringify(S.worlds), snap, 'rejected orders mutate nothing else');
}

/* ----------------------------------------------------- 10. AI priorities */
{
  const mk = () => {
    const S = createMatch(7);
    for (const w of S.worlds) { w.owner = null; w.protectedUntil = 0; }
    S.turn = 5;
    S.empires.ai.credits = 100; S.empires.ai.mil = 100;
    S.empires.human.credits = 0; S.empires.human.mil = 0;
    return S;
  };
  // Rule 1: lethal blow takes priority over everything
  let S = mk();
  S.worlds[14].owner = 'ai';
  S.worlds[13].owner = 'ai';
  S.worlds[6].owner = 'human';     // human's ONLY world, adjacent to relay 7? 6 adj: 5,7,1 — not ai-adjacent yet
  S.worlds[5].owner = 'human';     // two worlds; make 6 adjacent to ai via 5? no.
  // simpler: human single world 13-adjacent
  S = mk();
  S.worlds[14].owner = 'ai';
  S.worlds[9].owner = 'human';     // 9 adjacent to 14 (right column vertical)
  S.worlds[7].owner = 'human';     // human also holds relay → rule 2 would target 7, but rule 1 must kill 9 first? 
  // human has 2 worlds → rule 1 not applicable; make 9 the only world:
  S.worlds[7].owner = null;
  let o = chooseAIAction(S);
  deepEq({ t: o.type, g: o.target }, { t: 'attack', g: 9 }, 'AI rule 1: capture last world');
  // Rule 2a: capture human relay preferred over high-value world
  S = mk();
  S.worlds[14].owner = 'ai'; S.worlds[13].owner = 'ai';
  S.worlds[12].owner = 'human';    // relay adjacent to 13
  S.worlds[9].owner = 'human';     // last-world rule not triggered (2 worlds)
  S.worlds[9].e = 5; S.worlds[9].i = 5; S.worlds[9].d = 1; // juicy but rule 2 wins
  o = chooseAIAction(S);
  deepEq({ t: o.type, g: o.target }, { t: 'attack', g: 12 }, 'AI rule 2: capture human relay');
  // Rule 2b: expand onto neutral relay (lower id when both)
  S = mk();
  S.worlds[6].owner = 'ai';        // adjacent to relay 7
  S.worlds[8].owner = 'ai';        // adjacent to relay 7 (7 adj 6,8,12)
  S.worlds[13].owner = 'ai';       // adjacent to relay 12
  o = chooseAIAction(S);
  deepEq({ t: o.type, g: o.target }, { t: 'expand', g: 7 }, 'AI rule 2: claim lower-id neutral relay');
  // Rule 3: defend threatened relay
  S = mk();
  S.turn = 5;
  S.worlds[7].owner = 'ai';        // relay D2 → before 16, after 22 (next turn 6, no blockade)
  S.worlds[12].owner = 'ai';       // other relay owned → rule 2 inert
  S.worlds[6].owner = 'human';     // human adjacent to relay 7
  S.worlds[0].owner = 'human';     // second world → rule 1 inert
  S.empires.human.credits = 8; S.empires.human.mil = 16; // can pay 16 but not 22
  o = chooseAIAction(S);
  deepEq({ t: o.type, g: o.target, a: o.attr }, { t: 'develop', g: 7, a: 'd' }, 'AI rule 3: raise relay defense when it flips affordability');
  // not triggered when human cannot afford even before upgrade
  S.empires.human.mil = 15;
  o = chooseAIAction(S);
  ok(!(o.type === 'develop' && o.target === 7 && o.attr === 'd'), 'AI rule 3 inert when human cannot afford attack');
  // not triggered when human can still afford after upgrade
  S.empires.human.mil = 30;
  o = chooseAIAction(S);
  ok(!(o.type === 'develop' && o.target === 7 && o.attr === 'd'), 'AI rule 3 inert when upgrade would not deter');
  // skipped when relay still protected next turn
  S.empires.human.mil = 16;
  S.worlds[7].protectedUntil = 6; // next turn = 6 → protected
  o = chooseAIAction(S);
  ok(!(o.type === 'develop' && o.target === 7 && o.attr === 'd'), 'AI rule 3 skips protected relay');
  S.worlds[7].protectedUntil = 5; // next turn 6 → attackable
  // Rule 4: highest value non-relay, ties → lower mil cost then lower id
  S = mk();
  S.worlds[14].owner = 'ai'; S.worlds[13].owner = 'ai';
  S.worlds[9].owner = 'human'; S.worlds[9].e = 3; S.worlds[9].i = 1; S.worlds[9].d = 1;  // val 8, cost 10
  S.worlds[7].owner = 'ai';  S.worlds[12].owner = 'ai'; // both relays AI-held → rule 2 inert
  S.worlds[11].owner = 'human'; S.worlds[11].e = 5; S.worlds[11].i = 5; S.worlds[11].d = 5; // val 18, adj to 12(ai), cost 34
  S.empires.human.credits = 50; S.empires.human.mil = 50;
  o = chooseAIAction(S);
  deepEq({ t: o.type, g: o.target }, { t: 'attack', g: 11 }, 'AI rule 4: highest value first');
  // tie-break: equal value → lower military cost wins
  S.worlds[11].d = 1; // val 5+5+5+3=18-? recompute: 3+5+5+1=14; make 9 equal value 14 with lower cost:
  S.worlds[9].e = 5; S.worlds[9].i = 5; S.worlds[9].d = 1; // val 3+5+5+1 = 14, cost 10
  o = chooseAIAction(S);
  deepEq({ t: o.type, g: o.target }, { t: 'attack', g: 9 }, 'AI rule 4 tie: lower military cost wins');
  // Rule 5: expand toward unlinked neutral relay
  S = mk();
  S.worlds[14].owner = 'ai';
  S.empires.human.credits = 50; S.empires.human.mil = 50;
  S.worlds[0].owner = 'human'; S.worlds[1].owner = 'human'; // rule1 inert (2+ worlds)
  o = chooseAIAction(S);
  deepEq({ t: o.type, g: o.target }, { t: 'expand', g: 13 }, 'AI rule 5: step toward relay 12 via 13');
  // Rule 5 fallback: best E+I neutral
  S = mk();
  S.worlds[14].owner = 'ai';
  S.worlds[7].owner = 'ai'; S.worlds[12].owner = 'ai'; // relays gone from neutral pool
  S.worlds[0].owner = 'human'; S.worlds[1].owner = 'human';
  S.empires.human.credits = 50; S.empires.human.mil = 50;
  // legal neutrals from 14: 9,19,13. Make 13 poor, 9 rich:
  S.worlds[13].e = 1; S.worlds[13].i = 1;
  S.worlds[9].e = 3; S.worlds[9].i = 3;
  S.worlds[19].e = 1; S.worlds[19].i = 3;
  o = chooseAIAction(S);
  deepEq({ t: o.type, g: o.target }, { t: 'expand', g: 9 }, 'AI rule 5 fallback: highest E+I');
  // Rule 6: develop economy while credit income < 12, industry otherwise
  S = mk();
  S.worlds[14].owner = 'ai'; S.worlds[7].owner = 'ai'; S.worlds[12].owner = 'ai';
  S.worlds[13].owner = 'human'; S.worlds[9].owner = 'human'; S.worlds[19].owner = 'human';
  S.worlds[0].owner = 'human'; S.worlds[1].owner = 'human';   // rule 1 inert (5 worlds)
  S.empires.human.credits = 0; S.empires.human.mil = 0;       // rule 3 inert (can't pay 8 cr)
  S.empires.ai.credits = 8; S.empires.ai.mil = 0;             // rule 4 inert (no mil), rule 5 inert (expand costs 24)
  S.worlds[7].e = 1; S.worlds[12].e = 1;                      // ΣE = 3+1+1 → income 10 < 12
  o = chooseAIAction(S);
  deepEq({ t: o.type, g: o.target, a: o.attr }, { t: 'develop', g: 7, a: 'e' }, 'AI rule 6: economy while income < 12 (lowest id)');
  // income ≥ 12 → industry
  S.worlds[7].e = 2; S.worlds[12].e = 2;                      // ΣE = 7 → income 14 ≥ 12
  o = chooseAIAction(S);
  deepEq({ t: o.type, g: o.target, a: o.attr }, { t: 'develop', g: 7, a: 'i' }, 'AI rule 6: industry when income ≥ 12');
  // preferred attribute capped → try the other
  S.worlds[7].i = 5; S.worlds[12].i = 5; S.worlds[14].i = 5;  // industry maxed everywhere
  o = chooseAIAction(S);
  deepEq({ t: o.type, g: o.target, a: o.attr }, { t: 'develop', g: 7, a: 'e' }, 'AI rule 6: falls back to economy when industry capped');
  // turns 17–20: fortify a relay bordering the human
  S.turn = 17;
  S.worlds[7].i = 2; S.worlds[12].i = 2;
  o = chooseAIAction(S);
  deepEq({ t: o.type, g: o.target, a: o.attr }, { t: 'develop', g: 12, a: 'd' }, 'AI rule 6 late: fortify relay bordering human (12 touches 13)');
  // no bordering relay → first legal development (lowest id, E<I<D)
  S.worlds[13].owner = 'ai';                                   // 12 no longer borders human; 7 never did
  o = chooseAIAction(S);
  deepEq({ t: o.type, g: o.target, a: o.attr }, { t: 'develop', g: 7, a: 'e' }, 'AI rule 6 late: first legal development');
  // Rule 7: pass
  S = mk();
  S.worlds[14].owner = 'ai';
  S.worlds[7].owner = 'ai'; S.worlds[12].owner = 'ai';
  S.worlds[13].owner = 'human'; S.worlds[9].owner = 'human'; S.worlds[19].owner = 'human';
  S.worlds[0].owner = 'human'; S.worlds[1].owner = 'human';
  S.empires.ai.credits = 0; S.empires.ai.mil = 0;
  S.worlds[14].e = 5; S.worlds[14].i = 5; S.worlds[14].d = 5;
  S.worlds[7].e = 5; S.worlds[7].i = 5; S.worlds[7].d = 5;
  S.worlds[12].e = 5; S.worlds[12].i = 5; S.worlds[12].d = 5;
  eq(chooseAIAction(S), null, 'AI rule 7: pass when nothing legal');
}

/* ---------------------------------------- 11. Full-match simulations */

function makePolicy(seed) {
  const rng = mulberry32(seed ^ 0xABCD123);
  return (S) => {
    const opts = [];
    for (const id of legalTargets(S, 'human', 'attack')) opts.push({ type: 'attack', target: id, w: 3 });
    for (const id of legalTargets(S, 'human', 'expand')) opts.push({ type: 'expand', target: id, w: 2 });
    for (const attr of ['e', 'i', 'd']) {
      for (const id of legalTargets(S, 'human', 'develop', attr)) opts.push({ type: 'develop', target: id, attr, w: 1 });
    }
    if (!opts.length) return null;
    const total = opts.reduce((s, x) => s + x.w, 0);
    let r = rng() * total;
    for (const x of opts) { r -= x.w; if (r <= 0) return x; }
    return opts[opts.length - 1];
  };
}

function simMatch(seed, policy) {
  const S = createMatch(seed);
  let guard = 0;
  while (!S.over && guard++ < 100) {
    S.turn += 1;
    payIncome(S);
    const seq = S.turn % 2 === 1 ? ['human', 'ai'] : ['ai', 'human'];
    for (const who of seq) {
      if (S.over) break;
      const o = who === 'ai' ? chooseAIAction(S) : policy(S);
      if (o) {
        const st = orderStatus(S, who, o);
        if (!st.legal) throw new Error(`${who} produced illegal order ${JSON.stringify(o)} on turn ${S.turn}: ${st.reasons}`);
        resolveOrder(S, who, o);
      } else {
        logPass(S, who);
      }
    }
    if (S.over) break; // elimination interrupts before events & prestige
    endTurnEvent(S);
    if (S.turn >= CFG.RELAY_WAKE_TURN) awardRelayPrestige(S);
    if (S.turn === CFG.MAX_TURN) {
      const st = finalStandings(S);
      S.over = true; S.winner = st.winner; S.endReason = 'prestige';
    }
    // invariants
    for (const emp of ['human', 'ai']) {
      if (S.empires[emp].credits < 0 || S.empires[emp].mil < 0) throw new Error(`negative reserves turn ${S.turn}`);
    }
    for (const w of S.worlds) {
      if (w.e < 1 || w.e > 5 || w.i < 1 || w.i > 5 || w.d < 1 || w.d > 5) throw new Error(`attribute out of range on world ${w.id}`);
    }
  }
  return S;
}

{
  const seeds = [1, 7, 42, 1337, 123456789, 0xDEADBEEF, 20261024];
  let elimCount = 0, fullCount = 0;
  const endTurns = [];
  for (const seed of seeds) {
    const S = simMatch(seed, makePolicy(seed));
    ok(S.over, `seed ${seed}: match terminates`);
    ok(S.turn <= 20, `seed ${seed}: ends by turn 20 (turn ${S.turn})`);
    ok(['human', 'ai', 'draw'].includes(S.winner), `seed ${seed}: valid winner ${S.winner}`);
    endTurns.push(S.turn);
    if (S.endReason === 'elimination') {
      elimCount++;
      const loser = S.winner === 'human' ? 'ai' : 'human';
      eq(worldCount(S, loser), 0, `seed ${seed}: loser eliminated`);
      ok(S.log[S.log.length - 1].text.includes('elimination'), `seed ${seed}: elimination logged`);
    } else fullCount++;
    // scoring consistency
    const st = finalStandings(S);
    for (const who of ['human', 'ai']) {
      const ws = ownedWorlds(S, who);
      let sum = 0; for (const w of ws) sum += w.e + w.i + w.d;
      eq(st[who].planetValue, 3 * ws.length + sum, `seed ${seed}: ${who} planet value formula`);
      eq(st[who].total, st[who].planetValue + st[who].relicPrestige, `seed ${seed}: ${who} total formula`);
      ok(st[who].relicPrestige % 2 === 0, `seed ${seed}: ${who} relic prestige multiple of 2`);
      ok(st[who].relicPrestige <= 64, `seed ${seed}: ${who} relic prestige ≤ 64`);
    }
    // determinism: same seed + same policy → identical match
    const S2 = simMatch(seed, makePolicy(seed));
    deepEq(
      { w: S.worlds, e: S.empires, t: S.turn, win: S.winner, why: S.endReason },
      { w: S2.worlds, e: S2.empires, t: S2.turn, win: S2.winner, why: S2.endReason },
      `seed ${seed}: deterministic replay`
    );
  }
  console.log(`  (simulated ${seeds.length} matches: ${elimCount} by elimination, ${fullCount} to turn 20; end turns: ${endTurns.join(', ')})`);
  ok(true, 'full-match simulations completed');
}

/* ------------------------------------ 11b. 20-turn loopback (all events) */
{
  // Both empires pass every turn: exercises the full scheduled calendar,
  // relay awakening, turn-11 suppression, and final scoring at turn 20.
  const S = createMatch(3);
  const milTrack = [];
  for (let t = 1; t <= 20; t++) {
    S.turn = t;
    payIncome(S);
    milTrack.push({ t, h: S.empires.human.mil, a: S.empires.ai.mil });
    logPass(S, 'human'); logPass(S, 'ai');
    endTurnEvent(S);
    if (t >= CFG.RELAY_WAKE_TURN) awardRelayPrestige(S);
  }
  eq(S.worlds[7].e, 3, 'loopback: relay 7 awakened E3');
  eq(S.worlds[7].i, 3, 'loopback: relay 7 awakened I3');
  eq(S.empires.human.prestige, 0, 'loopback: unowned relays pay nobody');
  // credits: 14 + 20 turns × 6 cr (home E3 ×2) = 134
  eq(S.empires.human.credits, 14 + 20 * 6, 'loopback: credit income every turn');
  // military: 2/turn for 20 turns minus turn 11 → 38
  eq(S.empires.human.mil, 38, 'loopback: turn 11 paid zero military');
  const t11 = milTrack.find(m => m.t === 11);
  const t10 = milTrack.find(m => m.t === 10);
  eq(t11.h, t10.h, 'loopback: military flat across turn 11');
  // final scoring: symmetric homes → draw by prestige
  const st = finalStandings(S);
  eq(st.human.planetValue, 3 + 3 + 2 + 2, 'loopback: home planet value 10');
  eq(st.human.total, st.ai.total, 'loopback: totals equal');
  eq(st.winner, 'draw', 'loopback: symmetric pass-fest draws');

  // Same 20 turns but human holds relay 7 from turn 4 onward:
  const S2 = createMatch(3);
  S2.worlds[7].owner = 'human';
  for (let t = 1; t <= 20; t++) {
    S2.turn = t;
    payIncome(S2);
    endTurnEvent(S2);
    if (t >= CFG.RELAY_WAKE_TURN) awardRelayPrestige(S2);
  }
  eq(S2.empires.human.prestige, 32, 'relay held turns 5–20 → 16 awards × 2 = 32');
  const st2 = finalStandings(S2);
  eq(st2.winner, 'human', 'held relay decides the match');
  eq(st2.human.total, st2.human.planetValue + 32, 'total = planet value + relics');
}

/* --------------------------------------- 12. Replay-seed / new-galaxy */
{
  const a = createMatch(555);
  // mutate everything mutable
  a.turn = 9;
  a.empires.human.credits = 77; a.empires.ai.mil = 33;
  a.worlds[7].owner = 'human'; a.worlds[7].protectedUntil = 10;
  a.empires.human.prestige = 12;
  const b = createMatch(555); // "Replay Seed"
  deepEq(b.worlds, createMatch(555).worlds, 'replay seed restores initial map');
  eq(b.turn, 0, 'replay resets turn');
  eq(b.empires.human.credits, 14, 'replay resets credits');
  eq(b.empires.human.prestige, 0, 'replay resets prestige');
  eq(b.worlds[7].owner, null, 'replay resets ownership');
  eq(b.worlds[7].protectedUntil, 0, 'replay resets protection');
}

/* ---------------------------------------------------------- summary */
console.log(`\n${FAIL === 0 ? '✔ ALL PASS' : '✘ FAILURES'} — ${PASS} passed, ${FAIL} failed`);
if (FAIL > 0) {
  for (const f of failures.slice(0, 20)) console.log('  - ' + f);
  throw new Error('test suite failed');
}
