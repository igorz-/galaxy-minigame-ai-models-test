/* =====================================================================
   RELIC WARS — ui.js
   Game flow controller, rendering, and interaction. Depends on
   engine.js, ai.js, sky.js.
   ===================================================================== */
'use strict';

/* ------------------------------------------------------------ helpers */

const $ = sel => document.querySelector(sel);
const el = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms * (typeof G !== 'undefined' ? G.speed : 1))));
const svgNS = 'http://www.w3.org/2000/svg';
function svgEl(name, attrs) {
  const n = document.createElementNS(svgNS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}
function randomSeed() { return (Math.random() * 0xFFFFFFFF) >>> 0; }

const OWNER_COLOR = { human: '#3ddc97', ai: '#b18cff', null: '#5b6685' };
const ownerColor = o => (o === 'human' ? OWNER_COLOR.human : o === 'ai' ? OWNER_COLOR.ai : OWNER_COLOR.null);

/* ------------------------------------------------------------ G state */

const G = {
  state: null,
  sel: null,
  staged: null,           // {type, attr?}
  lastDevAttr: 'e',
  phase: 'intro',         // intro | human | ai | resolving | event | over
  busy: true,
  speed: 1,
  acted: { human: null, ai: null },
  nodeEls: [],
  laneEls: [],
  layout: null,
};

/* --------------------------------------------------------- DOM refs */

let nodesEl, laneDefs, laneG, laneGlowG, mapfxEl, bannerEl, logListEl;

/* ============================================================ FLOW */

async function startMatch(seed) {
  G.state = createMatch(seed);
  G.sel = null; G.staged = null;
  G.acted = { human: null, ai: null };
  G.busy = true; G.phase = 'resolving';
  buildMap();
  el('seedChip').textContent = 'SEED ' + seed;
  el('seedInput').value = String(seed);
  hideOverlay(el('result'));
  hideOverlay(el('intro'));
  renderAll();
  await nextTurn();
}

async function nextTurn() {
  const S = G.state;
  G.phase = 'resolving'; G.busy = true;
  G.staged = null;
  G.acted = { human: null, ai: null };
  S.turn += 1;
  const paid = payIncome(S);
  renderAll();
  const youFirst = S.turn % 2 === 1;
  showBanner(`Turn ${S.turn}`, youFirst ? 'Your initiative' : 'Rival moves first', youFirst ? 'you' : 'foe');
  Sfx.play('turn');
  floatOnCard('human', `+${paid.human.credits} cr`, 'cr');
  if (!paid.human.suppressed && paid.human.mil > 0) floatOnCard('human', `+${paid.human.mil} mil`, 'mil');
  floatOnCard('ai', `+${paid.ai.credits} cr`, 'cr');
  if (!paid.ai.suppressed && paid.ai.mil > 0) floatOnCard('ai', `+${paid.ai.mil} mil`, 'mil');
  announce(`Turn ${S.turn}. ${youFirst ? 'You act first.' : 'Rival acts first.'}`);
  await sleep(950);
  if (!youFirst) {
    await aiAct();
    if (S.over) return finishMatch();
  }
  humanPhase();
}

function humanPhase() {
  G.phase = 'human'; G.busy = false;
  renderAll();
}

async function humanCommit() {
  const S = G.state;
  if (G.phase !== 'human' || G.busy || !G.staged || G.sel == null) return;
  const order = { type: G.staged.type, target: G.sel, attr: G.staged.attr };
  const st = orderStatus(S, 'human', order);
  if (!st.legal) { Sfx.play('deny'); renderAll(); return; } // never consumes the opportunity
  G.busy = true; G.phase = 'resolving';
  const res = resolveOrder(S, 'human', order);
  applyOrderFx(res);
  G.acted.human = 'order';
  G.staged = null;
  renderAll();
  if (S.over) { await sleep(800); return finishMatch(); }
  await sleep(800);
  if (!G.acted.ai) {
    await aiAct();
    if (S.over) { await sleep(600); return finishMatch(); }
  }
  await endTurn();
}

async function humanPass() {
  const S = G.state;
  if (G.phase !== 'human' || G.busy) return;
  G.busy = true; G.phase = 'resolving';
  logPass(S, 'human');
  Sfx.play('pass');
  G.acted.human = 'pass';
  G.staged = null;
  renderAll();
  await sleep(550);
  if (!G.acted.ai) {
    await aiAct();
    if (S.over) { await sleep(600); return finishMatch(); }
  }
  await endTurn();
}

async function aiAct() {
  const S = G.state;
  G.phase = 'ai';
  renderAll();
  announce('Rival is acting.');
  await sleep(900);
  const o = chooseAIAction(S);
  if (o) {
    const res = resolveOrder(S, 'ai', o);
    if (res.ok) applyOrderFx(res);
    else logPass(S, 'ai'); // should never happen
    G.acted.ai = 'order';
    announce(`Rival ${o.type}${o.attr ? ' ' + ATTR_NAME[o.attr] : ''} on ${worldLabel(o.target)}.`);
  } else {
    logPass(S, 'ai');
    G.acted.ai = 'pass';
    announce('Rival passed.');
  }
  renderAll();
  await sleep(900);
}

async function endTurn() {
  const S = G.state;
  G.phase = 'event';
  renderAll();
  const evs = endTurnEvent(S);
  if (evs.length) {
    for (const e of evs) {
      if (e.kind === 'wake') { Sfx.play('wake'); relicWave(); }
      if (e.kind === 'warn-supernova' || e.kind === 'warn-blockade') { Sfx.play('warn'); screenFx('screen-warn'); }
      if (e.kind === 'final') { Sfx.play('warn'); screenFx('screen-boom'); }
    }
    renderAll();
    await sleep(1300);
  }
  if (S.turn >= CFG.RELAY_WAKE_TURN) {
    const awards = awardRelayPrestige(S);
    if (awards.length) {
      Sfx.play('prestige');
      for (const a of awards) nodeFloat(a.id, `+${a.amount} ✦`, 'pres');
      renderAll();
      await sleep(1000);
    }
  }
  if (S.turn === CFG.MAX_TURN) {
    const st = finalStandings(S);
    S.over = true; S.winner = st.winner; S.endReason = 'prestige';
    pushLog(S, 'event', `Turn 20 complete — final prestige: You ${st.human.total} vs Rival ${st.ai.total}.`);
    renderAll();
    await sleep(1000);
    return finishMatch();
  }
  await sleep(420);
  await nextTurn();
}

function finishMatch() {
  G.phase = 'over'; G.busy = true; G.staged = null;
  renderAll();
  showResult();
}

/* ============================================================ EFFECTS */

function applyOrderFx(res) {
  if (!res || !res.ok) return;
  const id = res.target;
  if (res.type === 'attack') {
    Sfx.play('capture');
    fxDisk(id, res.who === 'human' ? 'var(--you)' : 'var(--foe)');
    nodeFloat(id, 'CAPTURED', res.who === 'human' ? 'you' : 'foe');
  } else if (res.type === 'expand') {
    Sfx.play('expand');
    fxDisk(id, res.who === 'human' ? 'var(--you)' : 'var(--foe)');
    nodeFloat(id, 'CLAIMED', res.who === 'human' ? 'you' : 'foe');
  } else if (res.type === 'develop') {
    Sfx.play('develop');
    nodeFloat(id, `+1 ${ATTR_NAME[res.attr][0]}→${res.newLevel}`, res.who === 'human' ? 'you' : 'foe');
  }
}

function fxDisk(id, color) {
  const node = G.nodeEls[id];
  if (!node) return;
  const d = document.createElement('span');
  d.className = 'fx-ring';
  d.style.borderColor = color;
  node.appendChild(d);
  d.addEventListener('animationend', () => d.remove(), { once: true });
}

function nodeFloat(id, text, cls) {
  const node = G.nodeEls[id];
  if (node) spawnFloat(node, text, cls);
}

function floatOnCard(who, text, cls) {
  spawnFloat(who === 'human' ? el('cardHuman') : el('cardAI'), text, cls);
}

function showBanner(main, sub, side) {
  bannerEl.className = 'banner ' + (side || '');
  bannerEl.innerHTML = `<div class="b-main">${main}</div><div class="b-sub">${sub}</div>`;
  void bannerEl.offsetWidth; // restart animation
  bannerEl.classList.add('show');
}

function screenFx(cls) {
  document.body.classList.remove(cls);
  void document.body.offsetWidth;
  document.body.classList.add(cls);
  setTimeout(() => document.body.classList.remove(cls), 1600);
}

function relicWave() {
  const L = G.layout;
  for (const id of CFG.RELAYS) {
    const w = document.createElement('span');
    w.className = 'wave';
    w.style.left = (L[id].x / 10) + '%';
    w.style.top = (L[id].y / 6.4) + '%';
    mapfxEl.appendChild(w);
    w.addEventListener('animationend', () => w.remove(), { once: true });
  }
}

function announce(text) { el('srLive').textContent = text; }

/* ============================================================ MAP BUILD */

function buildMap() {
  const S = G.state;
  const layout = layoutFor(S.seed);
  G.layout = layout;
  nodesEl.innerHTML = '';
  laneDefs.innerHTML = '';
  laneG.innerHTML = '';
  laneGlowG.innerHTML = '';
  G.nodeEls = [];
  G.laneEls = [];

  for (const [a, b] of LANES) {
    const gid = `lg${a}_${b}`;
    const grad = svgEl('linearGradient', {
      id: gid, gradientUnits: 'userSpaceOnUse',
      x1: layout[a].x, y1: layout[a].y, x2: layout[b].x, y2: layout[b].y,
    });
    const s1 = svgEl('stop', { offset: '0%' });
    const s2 = svgEl('stop', { offset: '100%' });
    grad.append(s1, s2);
    laneDefs.appendChild(grad);
    const attrs = { x1: layout[a].x, y1: layout[a].y, x2: layout[b].x, y2: layout[b].y, stroke: `url(#${gid})` };
    const glow = svgEl('line', { ...attrs, class: 'lane-glow' });
    const line = svgEl('line', { ...attrs, class: 'lane' });
    laneGlowG.appendChild(glow);
    laneG.appendChild(line);
    G.laneEls.push({ a, b, line, glow, s1, s2 });
  }

  for (let id = 0; id < CFG.WORLD_COUNT; id++) {
    const p = layout[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wnode';
    b.style.left = (p.x / 10) + '%';
    b.style.top = (p.y / 6.4) + '%';
    b.dataset.id = id;
    b.dataset.profile = S.worlds[id].profile;
    b.style.setProperty('--prot', p.rot);
    b.style.setProperty('--pscale', p.scale);
    b.innerHTML = `
      <span class="hit"></span>
      <span class="planetwrap">
        <span class="planet"></span>
        <span class="ring"></span>
        ${isRelay(id) ? '<span class="relayring"></span><span class="relayring2"></span>' : ''}
        <span class="nbadges"></span>
        <span class="halo"></span>
        <span class="act-icon"></span>
        <span class="selbox"><i></i><i></i><i></i><i></i></span>
      </span>
      <span class="nchip"></span>
      <span class="staged-chip">STAGED</span>`;
    b.addEventListener('click', () => selectWorld(id));
    nodesEl.appendChild(b);
    G.nodeEls[id] = b;
  }
}

/* ============================================================ RENDER */

function renderAll() {
  if (!G.state) return;
  renderHud();
  renderEmpires();
  renderMatchInfo();
  renderMap();
  renderInspector();
  renderComposer();
  renderEvents();
  renderLog();
  renderActionBar();
}

function renderHud() {
  const S = G.state;
  el('turnNum').textContent = 'TURN ' + S.turn;
  const youFirst = S.turn % 2 === 1;
  const ic = el('initChip');
  ic.textContent = youFirst ? 'YOU FIRST' : 'RIVAL FIRST';
  ic.className = 'chip tiny ' + (youFirst ? 'you' : 'foe');

  // turn track
  const track = el('turnTrack');
  if (track.childElementCount !== CFG.MAX_TURN) {
    track.innerHTML = '';
    for (let t = 1; t <= CFG.MAX_TURN; t++) {
      const i = document.createElement('i');
      if ([5, 10, 11, 15, 16, 20].includes(t)) i.classList.add('evt');
      i.title = 'Turn ' + t;
      track.appendChild(i);
    }
  }
  [...track.children].forEach((c, k) => {
    c.classList.toggle('done', k + 1 < S.turn);
    c.classList.toggle('now', k + 1 === S.turn);
  });

  const pl = el('phaseLine');
  const pt = el('phaseText');
  pl.className = 'phase';
  if (G.phase === 'human') { pl.classList.add('you'); pt.textContent = 'Your move'; }
  else if (G.phase === 'ai') { pl.classList.add('foe'); pt.textContent = 'Rival acting…'; }
  else if (G.phase === 'event') { pl.classList.add('evt'); pt.textContent = 'Resolving events…'; }
  else if (G.phase === 'over') { pt.textContent = 'Match over'; }
  else { pt.textContent = 'Resolving…'; }

  // fx badges
  const badges = [];
  if (blockadeActive(S.turn)) badges.push(`<span class="badge-fx blockade"><svg><use href="#i-sword"/></svg>Blockade +8 mil</span>`);
  if (S.turn === CFG.SUPERNOVA_TURN) badges.push(`<span class="badge-fx supernova"><svg><use href="#i-bolt"/></svg>No mil income</span>`);
  if (S.awakened) badges.push(`<span class="badge-fx relic"><svg><use href="#i-relay"/></svg>Relays awake</span>`);
  el('badges').innerHTML = badges.join('');
}

function empCardHTML(who) {
  const S = G.state;
  const emp = S.empires[who];
  const inc = getIncome(S, who, Math.min(S.turn + 1, CFG.MAX_TURN));
  const sc = getScore(S, who);
  const isYou = who === 'human';
  const nextSup = S.turn + 1 === CFG.SUPERNOVA_TURN && S.turn < CFG.MAX_TURN;
  const nowSup = S.turn === CFG.SUPERNOVA_TURN;
  const note = nowSup
    ? `<div class="empnote"><svg><use href="#i-bolt"/></svg>Supernova: no Military income this turn.</div>`
    : nextSup
      ? `<div class="empnote"><svg><use href="#i-bolt"/></svg>Turn ${CFG.SUPERNOVA_TURN} pays zero Military.</div>`
      : '';
  return `
  <div class="emp ${isYou ? 'you' : 'foe'}">
    <div class="emphead">
      <span class="empmark"><svg><use href="#${isYou ? 'i-home' : 'i-sword'}"/></svg></span>
      <div>
        <h2>${EMPIRES[who].name.toUpperCase()}</h2>
        <p>${isYou ? 'You · first on odd turns' : 'Rival · first on even turns'}</p>
      </div>
      <span class="wcount" title="Worlds held">${sc.worlds} ⬡</span>
    </div>
    <div class="reserves">
      <div class="res">
        <span class="lbl"><svg><use href="#i-credit"/></svg>Credits</span>
        <div class="val mono">${emp.credits}</div>
        <div class="rate mono">${S.turn < CFG.MAX_TURN ? `+${inc.credits}/turn` : '—'}</div>
      </div>
      <div class="res">
        <span class="lbl"><svg><use href="#i-mil"/></svg>Military</span>
        <div class="val mono">${emp.mil}</div>
        <div class="rate mono ${nextSup ? 'sup' : ''}">${S.turn < CFG.MAX_TURN ? (nextSup ? '+0 (nova)' : `+${inc.mil}/turn`) : '—'}</div>
      </div>
    </div>
    <div class="presline">
      <span class="lbl"><svg style="width:11px;height:11px;fill:var(--relic);vertical-align:-1px"><use href="#i-spark"/></svg> Prestige</span>
      <span class="split">worlds ${sc.planetValue} · relics ${sc.relicPrestige}</span>
      <span class="val">${sc.total}</span>
    </div>
    ${note}
  </div>`;
}

function renderEmpires() {
  el('cardHuman').innerHTML = empCardHTML('human');
  el('cardAI').innerHTML = empCardHTML('ai');
}

function renderMatchInfo() {
  const S = G.state;
  const youFirst = S.turn % 2 === 1;
  const actedTxt = v => v === 'order' ? '<b>order committed</b>' : v === 'pass' ? '<b>passed</b>' : 'pending';
  const effects = [];
  if (blockadeActive(S.turn)) effects.push('Blockade: attacks +8 mil');
  if (S.turn === CFG.SUPERNOVA_TURN) effects.push('Supernova: no mil income');
  const prots = S.worlds.filter(w => isProtected(S, w.id, S.turn) && w.owner)
    .map(w => `${worldLabel(w.id)} (through ${w.protectedUntil})`);
  el('matchInfo').innerHTML = `
    <div class="mi-row"><span class="k">Initiative</span><span>${youFirst ? '<b>You</b> act first this turn' : '<b>Rival</b> acts first this turn'}</span></div>
    <div class="mi-row"><span class="k">Your order</span><span>${actedTxt(G.acted.human)}</span></div>
    <div class="mi-row"><span class="k">Rival order</span><span>${actedTxt(G.acted.ai)}</span></div>
    <div class="mi-row"><span class="k">Effects</span><span>${effects.length ? '<b>' + effects.join(' · ') + '</b>' : 'none active'}</span></div>
    <div class="mi-row"><span class="k">Shielded</span><span>${prots.length ? prots.join(', ') : '—'}</span></div>`;
}

function renderMap() {
  const S = G.state;
  const legalSet = (G.phase === 'human' && G.staged && G.sel != null)
    ? new Set(legalTargets(S, 'human', G.staged.type, G.staged.attr))
    : new Set();

  for (let id = 0; id < CFG.WORLD_COUNT; id++) {
    const w = S.worlds[id];
    const node = G.nodeEls[id];
    node.className = 'wnode';
    node.classList.add(w.owner === 'human' ? 'own-human' : w.owner === 'ai' ? 'own-ai' : 'neutral');
    if (isRelay(id)) { node.classList.add('is-relay'); if (S.awakened) node.classList.add('awake'); }
    if (G.sel === id) node.classList.add('selected');
    if (G.sel === id && G.staged && G.phase === 'human') node.classList.add('staged-target');
    if (legalSet.has(id) && !(G.sel === id && G.staged)) {
      node.classList.add('legal');
      node.dataset.legal = G.staged.type;
    } else {
      delete node.dataset.legal;
    }

    // chip
    node.querySelector('.nchip').innerHTML = `<b>${num(id)}</b> ${w.name}`;

    // badges
    let badges = '';
    if (id === CFG.HOME.human) badges += `<span class="nbadge home" title="Your homeworld"><svg><use href="#i-home"/></svg></span>`;
    if (id === CFG.HOME.ai) badges += `<span class="nbadge home" title="Rival homeworld"><svg><use href="#i-home"/></svg></span>`;
    if (w.protectedUntil >= S.turn && w.owner) badges += `<span class="nbadge prot" title="Capture protection through turn ${w.protectedUntil}"><svg><use href="#i-shield"/></svg></span>`;
    node.querySelector('.nbadges').innerHTML = badges;

    // action icon for legal targets
    const icon = G.staged ? (G.staged.type === 'expand' ? 'i-plus' : G.staged.type === 'attack' ? 'i-sword' : 'i-up') : '';
    node.querySelector('.act-icon').innerHTML = icon ? `<svg><use href="#${icon}"/></svg>` : '';

    // aria
    const ownerTxt = w.owner === 'human' ? 'yours' : w.owner === 'ai' ? 'rival-owned' : 'neutral';
    node.setAttribute('aria-label',
      `World ${num(id)} ${w.name}, ${ownerTxt}${isRelay(id) ? ', ancient relay' : ''}` +
      `${id === CFG.HOME.human || id === CFG.HOME.ai ? ', homeworld' : ''}` +
      `, Economy ${w.e}, Industry ${w.i}, Defense ${w.d}` +
      `${w.protectedUntil >= S.turn && w.owner ? `, capture protection through turn ${w.protectedUntil}` : ''}` +
      `${legalSet.has(id) ? `, legal ${G.staged.type} target` : ''}`);
    node.setAttribute('aria-pressed', G.sel === id ? 'true' : 'false');
  }

  // lanes
  for (const L of G.laneEls) {
    L.s1.setAttribute('stop-color', ownerColor(S.worlds[L.a].owner));
    L.s2.setAttribute('stop-color', ownerColor(S.worlds[L.b].owner));
    const sel = G.sel != null && (L.a === G.sel || L.b === G.sel);
    L.line.classList.toggle('sel', sel);
    L.glow.classList.toggle('sel', sel);
  }
}

/* ------------------------------------------------------------ INSPECTOR */

function pipsHTML(attr, v) {
  let s = '<span class="pips">';
  for (let k = 1; k <= 5; k++) s += `<i class="${attr} ${k <= v ? 'on' : ''}"></i>`;
  return s + '</span>';
}

function renderInspector() {
  const S = G.state;
  const p = el('panelInspect');
  if (G.sel == null) {
    p.innerHTML = `<div class="sec-head">Inspector</div>
      <div class="ins-empty">Select any world on the chart to inspect it — selection spends nothing.<br><br>
      <span class="mono" style="font-size:11px">Tip: worlds show <b>number · name</b>; lanes connect neighbors; relays wear spinning gold rings.</span></div>`;
    return;
  }
  const w = S.worlds[G.sel];
  const ownerTxt = w.owner === 'human' ? `<b class="you">Yours — ${EMPIRES.human.name}</b>`
    : w.owner === 'ai' ? `<b class="foe">Rival — ${EMPIRES.ai.name}</b>`
    : `<b class="neu">Neutral — pays no income</b>`;
  const tags = [];
  if (isRelay(w.id)) tags.push(`<span class="tag relic"><svg><use href="#i-relay"/></svg>Ancient relay</span>`);
  if (w.id === CFG.HOME.human) tags.push(`<span class="tag home-y"><svg><use href="#i-home"/></svg>Your homeworld</span>`);
  if (w.id === CFG.HOME.ai) tags.push(`<span class="tag home-f"><svg><use href="#i-home"/></svg>Rival homeworld</span>`);
  tags.push(`<span class="tag prof">${w.profile}</span>`);
  if (w.owner && isProtected(S, w.id, S.turn)) {
    tags.push(`<span class="tag prot"><svg><use href="#i-shield"/></svg>Shielded thru ${w.protectedUntil}</span>`);
  }

  const attrRow = (a, note) => `
    <div class="attrrow">
      <span class="an">${ATTR_NAME[a]}</span>
      ${pipsHTML(a, w[a])}
      <span class="av mono">${w[a]}</span>
      <span class="anote">${note}</span>
    </div>`;

  const milVs = attackMilCost(S, w.id, S.turn);
  const prod = w.owner ? `<b>+${2 * w.e} cr</b> and <b>+${w.i} mil</b> per turn` : `none while neutral (worth <b>+${2 * w.e} cr / +${w.i} mil</b> once claimed)`;

  let protLine;
  if (w.owner && w.protectedUntil >= S.turn) {
    protLine = `<span class="warn"><svg style="width:11px;height:11px;fill:currentColor;vertical-align:-1px"><use href="#i-shield"/></svg> Capture protection through turn ${w.protectedUntil} — first attackable turn ${w.protectedUntil + 1}.</span>`;
  } else if (w.owner && w.protectedUntil > 0) {
    protLine = `<span>Was shielded through turn ${w.protectedUntil} — attackable now.</span>`;
  } else {
    protLine = `<span>No capture protection${w.owner === null ? ' (new colonies get none)' : ''}.</span>`;
  }

  const lanes = ADJ[w.id].map(n => {
    const nw = S.worlds[n];
    const cls = nw.owner === 'human' ? 'you' : nw.owner === 'ai' ? 'foe' : '';
    return `<button class="lchip ${cls} ${isRelay(n) ? 'relicid' : ''}" data-act="select" data-id="${n}" title="Inspect ${worldLabel(n)}">${num(n)} ${nw.name}</button>`;
  }).join('');

  p.innerHTML = `
    <div class="sec-head">Inspector</div>
    <div class="ins-head">
      <span class="ins-num">${num(w.id)}</span>
      <div>
        <h2>${w.name}</h2>
        <div class="ins-tags">${tags.join('')}</div>
      </div>
    </div>
    <div class="ins-owner">${ownerTxt}</div>
    <div class="attrrows">
      ${attrRow('e', w.owner ? `+${2 * w.e} cr/turn` : `+${2 * w.e} cr/turn if owned`)}
      ${attrRow('i', w.owner ? `+${w.i} mil/turn` : `+${w.i} mil/turn if owned`)}
      ${attrRow('d', `attack cost ${milVs} mil`)}
    </div>
    <div class="ins-block">
      <span>Production: ${prod}</span>
      ${isRelay(w.id) ? `<span class="relic-t"><svg style="width:11px;height:11px;fill:currentColor;vertical-align:-1px"><use href="#i-relay"/></svg> Pays its owner <b>+2 prestige</b> at the end of every turn ${S.awakened ? '5–20 (awakened)' : 'from turn 5'}.</span>` : ''}
      <span>${protLine}</span>
      <span>Lanes: <span class="lanechips">${lanes}</span></span>
    </div>`;
}

/* ------------------------------------------------------------ COMPOSER */

function renderComposer() {
  const S = G.state;
  const p = el('panelOrders');
  const isHumanTurn = G.phase === 'human' && !S.over;
  const head = `<div class="sec-head">Order composer</div>`;

  if (S.over) {
    p.innerHTML = head + `<div class="ins-empty">Match over.</div>`;
    return;
  }
  if (G.sel == null) {
    p.innerHTML = head + `<div class="ins-empty">${isHumanTurn ? 'Select a world to stage an order.' : (G.phase === 'ai' ? 'Rival is acting…' : 'Resolve in progress…')}</div>`;
    return;
  }

  const w = S.worlds[G.sel];
  const target = `<span class="target">▸ ${num(w.id)} ${w.name}</span>`;
  const phaseHint = isHumanTurn ? '' : `<span class="phasehint">${G.phase === 'ai' ? 'rival acting…' : 'wait…'}</span>`;

  // --- EXPAND card
  const exO = { type: 'expand', target: G.sel };
  const ex = orderStatus(S, 'human', exO);
  const exCost = expandCost(S, 'human');
  // --- DEVELOP card
  const devLegalAny = ATTRS.some(a => orderStatus(S, 'human', { type: 'develop', target: G.sel, attr: a }).legal);
  const devReasons = orderStatus(S, 'human', { type: 'develop', target: G.sel, attr: G.staged?.attr || 'e' });
  // --- ATTACK card
  const atO = { type: 'attack', target: G.sel };
  const at = orderStatus(S, 'human', atO);
  const atMil = attackMilCost(S, w.id, S.turn);
  const blk = blockadeActive(S.turn);

  const statusLine = st => st.legal
    ? `<div class="ostatus">✓ Legal this turn</div>`
    : `<div class="ostatus bad"><span class="r">✕</span> ${st.reasons.slice(0, 2).join(' · ')}</div>`;

  const stagedCls = t => (G.staged && G.staged.type === t) ? ' staged' : '';
  const disabledAttr = isHumanTurn ? '' : ' aria-disabled="true"';

  const devBtn = a => {
    const capped = w[a] >= 5;
    const notOwned = w.owner !== 'human';
    const stagedAttr = G.staged && G.staged.type === 'develop' && G.staged.attr === a;
    const cls = ['devbtn', capped || notOwned ? 'max' : '', stagedAttr ? 'staged-attr' : ''].join(' ');
    return `<button class="${cls}" data-act="stage-develop" data-attr="${a}" ${capped || notOwned || !isHumanTurn ? 'disabled' : ''}>
      <span class="da">${a.toUpperCase()}</span>
      <span class="dl">${ATTR_NAME[a]}</span>
      <span class="dv">${w[a]}${capped ? '' : '→' + (w[a] + 1)}</span>
    </button>`;
  };

  p.innerHTML = `${head}
    <div class="ordhead">${target}${phaseHint}</div>
    <div class="orders" ${!isHumanTurn ? 'inert' : ''}>
      <button class="ocard expand${stagedCls('expand')}" data-act="stage-expand" ${disabledAttr}>
        <div class="ohead">
          <span class="oicon"><svg><use href="#i-plus"/></svg></span>
          <span class="oname">Expand</span>
          <span class="ocost">${exCost} cr <small>(12+4×${worldCount(S, 'human')})</small></span>
        </div>
        ${statusLine(ex)}
      </button>
      <div class="ocard develop${stagedCls('develop')}" role="group" aria-label="Develop">
        <div class="ohead">
          <span class="oicon"><svg><use href="#i-up"/></svg></span>
          <span class="oname">Develop</span>
          <span class="ocost">8 cr</span>
        </div>
        ${w.owner === 'human'
        ? `<div class="devbtns">${devBtn('e')}${devBtn('i')}${devBtn('d')}</div>
           ${devReasons.legal ? '<div class="ostatus">✓ Legal this turn</div>' : `<div class="ostatus bad"><span class="r">✕</span> ${devReasons.reasons[0]}</div>`}`
        : `<div class="ostatus bad"><span class="r">✕</span> ${w.owner === null ? 'Neutral world — expand first' : 'Rival world'}</div>`}
      </div>
      <button class="ocard attack${stagedCls('attack')}" data-act="stage-attack" ${disabledAttr}>
        <div class="ohead">
          <span class="oicon"><svg><use href="#i-sword"/></svg></span>
          <span class="oname">Attack</span>
          <span class="ocost">8 cr + ${atMil} mil${blk ? ' <small>(incl +8)</small>' : ''}</span>
        </div>
        ${statusLine(at)}
      </button>
    </div>
    <div class="preview">${previewText()}</div>
    <div class="ordfoot">
      <button class="btn ghost" data-act="pass" ${isHumanTurn ? '' : 'disabled'}>Pass</button>
      ${commitBtnHTML()}
    </div>`;
}

function stagedOrder() {
  if (!G.staged || G.sel == null) return null;
  return { type: G.staged.type, target: G.sel, attr: G.staged.attr };
}

function commitBtnHTML() {
  const S = G.state;
  const o = stagedOrder();
  const isHumanTurn = G.phase === 'human' && !S.over;
  if (!o) return `<button class="btn commit" data-act="commit" disabled>Commit</button>`;
  const st = orderStatus(S, 'human', o);
  const costTxt = o.type === 'attack' ? `8 cr + ${st.cost.mil} mil` : `${st.cost.cr} cr`;
  const label = o.type === 'develop' ? `Develop ${ATTR_NAME[o.attr]}` : o.type[0].toUpperCase() + o.type.slice(1);
  return `<button class="btn commit" data-act="commit" ${st.legal && isHumanTurn ? '' : 'disabled'}>
      Commit — ${label} <span class="commitcost">· ${costTxt}</span>
    </button>`;
}

function previewText() {
  const S = G.state;
  const o = stagedOrder();
  if (!o) return 'Stage an order above — exact price and effect show here before you commit.';
  const st = orderStatus(S, 'human', o);
  const w = S.worlds[o.target];
  if (!st.legal) return `<span class="r" style="color:var(--danger)">✕ ${st.reasons[0]}</span>${st.reasons[1] ? ' · ' + st.reasons[1] : ''}`;
  if (o.type === 'expand') {
    return `<b>${worldLabel(o.target)}</b> joins your empire for <b>${st.cost.cr} cr</b> — production pays from next turn. New colonies get <b>no capture shield</b>.`;
  }
  if (o.type === 'develop') {
    const gain = o.attr === 'e' ? '+2 cr/turn' : o.attr === 'i' ? '+1 mil/turn' : '+6 mil to every future attack against it';
    return `<b>${ATTR_NAME[o.attr]} ${w[o.attr]}→${w[o.attr] + 1}</b> on ${worldLabel(o.target)} for <b>8 cr</b>: ${gain} from next turn, and +1 final planet value.`;
  }
  const lethal = worldCount(S, 'ai') === 1 && w.owner === 'ai';
  const blk = blockadeActive(S.turn) ? ` (4+6×D${w.d} = ${st.cost.mil - 8}, +8 blockade)` : ` (4+6×D${w.d})`;
  return `${lethal ? '<span class="lethal">⚠ LAST WORLD — capturing it wins the match!</span> ' : ''}Capture <b>${worldLabel(o.target)}</b> for <b>8 cr + ${st.cost.mil} mil</b>${blk}. It becomes yours, attributes intact, <b>shielded through turn ${S.turn + 1}</b> (attackable turn ${S.turn + 2}).`;
}

/* ------------------------------------------------------------ EVENTS */

const EVENT_DEFS = [
  { turn: 5, when: 'End of turn 5', title: 'Relays awaken', text: 'Vigil I & Vigil II gain +1 Economy and +1 Industry (cap 5). Their owners receive the first +2 prestige each; the stronger output pays from turn 6.' },
  { turn: 10, when: 'End of turn 10', title: 'Supernova warning', text: 'Forecast: on turn 11 both empires gain ZERO new Military. Credit income and existing reserves are unaffected.' },
  { turn: 11, when: 'Turn 11', title: 'Supernova — Military silenced', text: 'Active this turn only: no Military income for either empire.', activeIf: t => t === 11 },
  { turn: 15, when: 'End of turn 15', title: 'Blockade warning', text: 'Forecast: every Attack costs +8 extra Military on turns 16–19. It lifts before turn-20 orders.' },
  { turn: 16, when: 'Turns 16–19', title: 'Blockade', text: 'Every Attack pays +8 Military on top of 4 + 6×Defense.', activeIf: t => blockadeActive(t) },
  { turn: 20, when: 'End of turn 20', title: 'Collapse & final scoring', text: 'The last relay tribute is banked, then totals are compared: planet value + relic prestige. Higher total wins; equal totals draw.' },
];

function eventState(def, turn, over) {
  if (def.activeIf) {
    if (def.activeIf(turn) && !over) return 'active';
    return turn > def.turn || (turn >= def.turn && over) ? 'done' : 'later';
  }
  if (turn > def.turn) return 'done';
  if (turn === def.turn) return over ? 'done' : 'next'; // happens at end of this turn
  return 'later';
}

function renderEvents() {
  const S = G.state;
  const list = el('eventList');
  list.innerHTML = EVENT_DEFS.map(def => {
    const stt = eventState(def, S.turn, S.over);
    return `<div class="tlitem ${stt}">
      <span class="tlturn">${def.turn === 20 ? 'T20' : def.turn === 16 ? '16–19' : def.turn === 11 ? 'T11' : 'T' + def.turn}</span>
      <div><h4>${def.title}</h4><p>${def.text}</p></div>
    </div>`;
  }).join('');

  const nc = el('nextEvent');
  const next = EVENT_DEFS.find(d => ['next', 'later'].includes(eventState(d, S.turn, S.over)));
  const active = EVENT_DEFS.filter(d => eventState(d, S.turn, S.over) === 'active');
  if (S.over) {
    nc.innerHTML = `<div class="nk"><span>All events resolved</span></div><h3>Match complete</h3><p>The galaxy has been scored.</p>`;
  } else if (next) {
    const when = next.turn === S.turn ? 'Tonight — end of this turn' :
      `End of turn ${next.turn} — in ${next.turn - S.turn} turn${next.turn - S.turn > 1 ? 's' : ''}`;
    nc.innerHTML = `<div class="nk"><span>${active.length ? 'Next scheduled event' : 'Next event · forecast'}</span><span>${when}</span></div>
      <h3>${next.title}</h3><p>${next.text}</p>
      ${active.map(a => `<p style="margin-top:6px;color:var(--relic-ink)">◆ Active now — ${a.title}: ${a.text}</p>`).join('')}`;
  } else {
    nc.innerHTML = active.length
      ? `<div class="nk"><span>Active effect</span></div><h3>${active[0].title}</h3><p>${active[0].text}</p>`
      : `<div class="nk"><span>Events</span></div><h3>All resolved</h3><p>Final scoring happens at the end of turn 20.</p>`;
  }
}

/* ------------------------------------------------------------ LOG */

let lastLogCount = 0;
function renderLog() {
  const S = G.state;
  const list = el('logList');
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  const entries = S.log.slice(-70);
  list.innerHTML = entries.map((e, k) => `
    <div class="logitem ${e.side} ${k === entries.length - 1 && S.log.length !== lastLogCount ? 'fresh' : ''}">
      <span class="lt">T${e.turn}</span><span class="ld"></span><span>${e.text}</span>
    </div>`).join('');
  lastLogCount = S.log.length;
  if (atBottom || entries.length < 8) list.scrollTop = list.scrollHeight;
}

/* ------------------------------------------------------------ ACTION BAR */

function renderActionBar() {
  const S = G.state;
  const isHumanTurn = G.phase === 'human' && !S.over;
  const o = stagedOrder();
  const sum = el('abSummary');
  if (!isHumanTurn) {
    sum.textContent = S.over ? 'Match over' : G.phase === 'ai' ? 'Rival is acting…' : 'Resolving…';
  } else if (!o) {
    sum.textContent = 'Select a world — nothing is spent until you Commit.';
  } else {
    const st = orderStatus(S, 'human', o);
    const w = S.worlds[o.target];
    const cost = o.type === 'attack' ? `8 cr + ${st.cost.mil} mil` : `${st.cost.cr} cr`;
    sum.innerHTML = st.legal
      ? `<b>${o.type.toUpperCase()}</b> ▸ ${num(w.id)} ${w.name} · ${cost}`
      : `<b>${o.type.toUpperCase()}</b> ▸ ${num(w.id)} ${w.name} — <span style="color:var(--danger)">${st.reasons[0]}</span>`;
  }
  el('abPass').disabled = !isHumanTurn;
  const commit = el('abCommit');
  if (o) {
    const st = orderStatus(S, 'human', o);
    commit.disabled = !(st.legal && isHumanTurn);
    const cost = o.type === 'attack' ? `8 cr + ${st.cost.mil} mil` : `${st.cost.cr} cr`;
    commit.innerHTML = `Commit <span class="commitcost">${cost}</span>`;
  } else {
    commit.disabled = true;
    commit.textContent = 'Commit';
  }
}

/* ============================================================ INTERACTION */

function selectWorld(id) {
  const S = G.state;
  if (!S) return;
  Sfx.play('select');
  G.sel = id;
  const w = S.worlds[id];
  if (!G.staged) {
    // contextual default (kept across retargets afterwards, per contract)
    if (w.owner === 'human') {
      const attr = ATTRS.find(a => w[a] < 5) || 'e';
      G.staged = { type: 'develop', attr };
    } else if (w.owner === null) {
      G.staged = { type: 'expand' };
    } else {
      G.staged = { type: 'attack' };
    }
  } else if (G.staged.type === 'develop' && !G.staged.attr) {
    G.staged.attr = G.lastDevAttr;
  }
  renderAll();
}

function stageOrder(type, attr) {
  if (G.phase !== 'human' || G.sel == null) return;
  Sfx.play('stage');
  if (type === 'develop') {
    const a = attr || G.lastDevAttr || 'e';
    G.staged = { type: 'develop', attr: a };
    if (attr) G.lastDevAttr = attr;
  } else {
    G.staged = { type };
  }
  renderAll();
}

/* ============================================================ OVERLAYS */

function showOverlay(node) { node.classList.remove('hidden'); node.setAttribute('aria-hidden', 'false'); }
function hideOverlay(node) { node.classList.add('hidden'); node.setAttribute('aria-hidden', 'true'); }

function showResult() {
  const S = G.state;
  const st = finalStandings(S);
  const byElim = S.endReason === 'elimination';
  const win = byElim ? S.winner : st.winner;
  const title = win === 'human' ? 'VICTORY' : win === 'ai' ? 'DEFEAT' : 'STALEMATE';
  el('resTitle').textContent = title;
  el('resTitle').className = 'title-glow ' + (win === 'human' ? 'res-title-you' : win === 'ai' ? 'res-title-foe' : 'res-title-draw');
  el('resKicker').textContent = byElim ? 'Elimination' : 'Turn 20 — final prestige';
  el('resReason').textContent = byElim
    ? `${EMPIRES[foeOf(win)].name} holds no worlds. The duel ends immediately — reserves and events no longer matter.`
    : win === 'draw'
      ? 'Both empires banked identical prestige. The galaxy collapses on a perfect tie.'
      : `${EMPIRES[win].name} out-prestiges the rival ${win === 'human' ? st.human.total + ' to ' + st.ai.total : st.ai.total + ' to ' + st.human.total}. Reserves do not score.`;
  Sfx.play(win === 'human' ? 'victory' : win === 'ai' ? 'defeat' : 'draw');

  const col = (who, sc) => {
    const isWin = !byElim && win === who || byElim && S.winner === who;
    return `<div class="res-col ${who === 'human' ? 'you' : 'foe'} ${isWin ? 'winner' : ''}">
      <h3><span class="empdot"></span>${who === 'human' ? 'Lucent Accord (You)' : 'Umbral Synod (Rival)'}${isWin ? '<span class="res-crown">✦ WINS</span>' : ''}</h3>
      <div class="res-row"><span>Worlds held</span><span class="v">${sc.worlds}</span></div>
      <div class="res-row"><span>Planet value <small style="color:var(--faint)">(3×worlds + Σ E·I·D)</small></span><span class="v">${sc.planetValue}</span></div>
      <div class="res-row"><span>Banked relic prestige</span><span class="v">${sc.relicPrestige}</span></div>
      <div class="res-row total"><span>Total prestige</span><span class="v">${sc.total}</span></div>
      ${byElim && sc.worlds === 0 ? '<div class="res-row"><span class="v" style="color:var(--danger)">ELIMINATED</span></div>' : ''}
    </div>`;
  };
  el('resTable').innerHTML = col('human', st.human) + col('ai', st.ai);
  el('resSeed').textContent = `Galaxy seed ${S.seed}`;
  showOverlay(el('result'));
  announce(title + '. ' + el('resReason').textContent);
}

function showIntro(seed) {
  el('seedInput').value = String(seed);
  showOverlay(el('intro'));
  setTimeout(() => el('launchBtn').focus(), 60);
}

function buildRules() {
  el('rulesBody').innerHTML = `
    <h3>The duel</h3>
    <p>You command the <b style="color:var(--you-ink)">Lucent Accord</b> against the deterministic <b style="color:var(--foe-ink)">Umbral Synod</b> across <b>20 worlds</b> linked by <b>23 lanes</b>. A match lasts at most <b>20 shared turns</b>; each empire issues <b>one order per turn</b> — or passes. You act first on odd turns, the rival on even turns. Everything is public; there are no dice.</p>
    <h3>Income (start of every turn, including turn 1)</h3>
    <p class="mono">Credits +2 × Σ Economy &nbsp;·&nbsp; Military +Σ Industry &nbsp;(turn 11: zero Military for both)</p>
    <p>Both empires begin with 14 Credits, 0 Military — so turn 1 starts at <b>20 cr / 2 mil</b> each. Reserves persist; neutral worlds pay nothing.</p>
    <h3>Orders</h3>
    <table>
      <tr><th>Order</th><th>Target</th><th>Price</th><th>Effect</th></tr>
      <tr><td><b>Expand</b></td><td>Neutral world with a direct lane to any world you own</td><td class="mono">12 + 4 × owned worlds (cr)</td><td>Claim it with attributes intact. No capture shield.</td></tr>
      <tr><td><b>Develop</b></td><td>Owned world, attribute &lt; 5</td><td class="mono">8 cr</td><td>+1 to one of Economy / Industry / Defense.</td></tr>
      <tr><td><b>Attack</b></td><td>Enemy world with a direct lane to you, not shielded</td><td class="mono">8 cr + (4 + 6×Defense + blockade) mil</td><td>Capture with attributes intact. Defender keeps reserves.</td></tr>
    </table>
    <p><b>Capture protection:</b> a world captured on turn T cannot be attacked on turns T or T+1 — it is attackable again on T+2. It still produces, develops, and scores.</p>
    <p><b>Blockade surcharge:</b> +8 Military on attacks during turns 16–19 only (not turn 20).</p>
    <h3>Ancient relays &amp; events</h3>
    <p>Relays <b>08 Vigil I</b> and <b>13 Vigil II</b> are ordinary worlds plus a tribute: at the <b>end of every turn 5–20</b>, each owned relay banks <b>+2 prestige</b> for its owner (16 awards → 32 prestige max per relay). Banked prestige is kept even if the relay is later lost.</p>
    <ul>
      <li><b>End of turn 5</b> — relays awaken: +1 Economy, +1 Industry each (cap 5).</li>
      <li><b>End of turn 10</b> — supernova warning; <b>turn 11</b> pays zero Military income.</li>
      <li><b>End of turn 15</b> — blockade warning; attacks cost +8 Military on <b>turns 16–19</b>.</li>
      <li><b>End of turn 20</b> — final tribute, then scoring.</li>
    </ul>
    <h3>Victory</h3>
    <p>An empire with <b>no worlds is eliminated</b> — the match ends immediately. Otherwise after turn 20:</p>
    <p class="mono">planet value = 3 × worlds + Σ(E+I+D) &nbsp;·&nbsp; total = planet value + relic prestige</p>
    <p>Higher total wins; equal totals draw. Credits and Military do not score — but a late Develop still adds 1 planet value.</p>
    <h3>The rival</h3>
    <p>The Synod follows a fixed, public priority: lethal blow → seize/claim relays → shield threatened relays with Defense → capture best-value worlds → expand toward unlinked relays → develop economy/industry (fortify relays after turn 16). Same seed + same orders = same match.</p>
    <h3>Controls</h3>
    <p><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> stage Expand/Develop/Attack · <kbd>Enter</kbd> commit (when no button is focused) · <kbd>P</kbd> pass · arrows navigate worlds · <kbd>Esc</kbd> deselect · <kbd>?</kbd> rules · <kbd>M</kbd> mute</p>`;
}

/* ============================================================ BOOT */

function bindUI() {
  nodesEl = el('nodes');
  laneDefs = el('laneDefs');
  laneG = el('laneG');
  laneGlowG = el('laneGlowG');
  mapfxEl = el('mapfx');
  bannerEl = el('banner');
  logListEl = el('logList');

  // delegated actions
  document.addEventListener('click', ev => {
    const t = ev.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'stage-expand') stageOrder('expand');
    else if (act === 'stage-attack') stageOrder('attack');
    else if (act === 'stage-develop') stageOrder('develop', t.dataset.attr);
    else if (act === 'commit') humanCommit();
    else if (act === 'pass') humanPass();
    else if (act === 'select') selectWorld(Number(t.dataset.id));
    else if (act === 'new-galaxy') startMatch(randomSeed());
    else if (act === 'replay') startMatch(G.state.seed);
    else if (act === 'rules') showOverlay(el('rulesModal'));
    else if (act === 'close-rules') hideOverlay(el('rulesModal'));
  });

  el('rulesBtn').addEventListener('click', () => showOverlay(el('rulesModal')));
  el('restartBtn').addEventListener('click', () => { if (G.state) startMatch(G.state.seed); });
  el('soundBtn').addEventListener('click', () => {
    Sfx.setEnabled(!Sfx.isEnabled());
    syncSoundBtn();
  });
  el('launchBtn').addEventListener('click', () => {
    let seed = parseInt(el('seedInput').value, 10);
    if (!Number.isFinite(seed)) seed = randomSeed();
    startMatch(seed >>> 0);
  });
  el('seedDice').addEventListener('click', () => {
    el('seedInput').value = String(randomSeed());
    Sfx.play('click');
  });
  el('seedInput').addEventListener('keydown', e => { if (e.key === 'Enter') el('launchBtn').click(); });

  // first gesture unlocks audio
  const unlock = () => { Sfx.unlock(); document.removeEventListener('pointerdown', unlock); };
  document.addEventListener('pointerdown', unlock);
  syncSoundBtn();

  // keyboard
  document.addEventListener('keydown', ev => {
    const t = ev.target;
    if (t && t.nodeType === 1 && t.matches('input, textarea')) return;
    const rulesOpen = !el('rulesModal').classList.contains('hidden');
    const introOpen = !el('intro').classList.contains('hidden');
    const resultOpen = !el('result').classList.contains('hidden');

    if (ev.key === 'Escape') {
      if (rulesOpen) { hideOverlay(el('rulesModal')); return; }
      if (!introOpen && !resultOpen) { G.sel = null; G.staged = null; renderAll(); }
      return;
    }
    if (rulesOpen || introOpen || resultOpen) {
      if ((ev.key === '?' || ev.key === 'r') && rulesOpen) hideOverlay(el('rulesModal'));
      return;
    }
    if (ev.key === '?' || (ev.key === 'r' && !ev.metaKey && !ev.ctrlKey)) { showOverlay(el('rulesModal')); ev.preventDefault(); return; }
    if (ev.key === 'm') { Sfx.setEnabled(!Sfx.isEnabled()); syncSoundBtn(); return; }
    if (G.phase !== 'human') return;
    if (ev.key === '1') stageOrder('expand');
    else if (ev.key === '2') stageOrder('develop');
    else if (ev.key === '3') stageOrder('attack');
    else if (ev.key === 'Enter') {
      // commit only when no interactive control holds focus (those activate natively)
      const ae = document.activeElement;
      const interactive = ae && ae !== document.body && ae.nodeType === 1 &&
        ae.matches('button, input, select, textarea, a');
      if (!interactive) { humanCommit(); ev.preventDefault(); }
    }
    else if (ev.key === 'p' || ev.key === 'P') humanPass();
  });

  // arrow-key roving focus across the 4x5 grid
  nodesEl.addEventListener('keydown', ev => {
    const btn = ev.target.closest('.wnode');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const r = Math.floor(id / CFG.COLS), c = id % CFG.COLS;
    let nr = r, nc = c;
    if (ev.key === 'ArrowRight') nc = Math.min(CFG.COLS - 1, c + 1);
    else if (ev.key === 'ArrowLeft') nc = Math.max(0, c - 1);
    else if (ev.key === 'ArrowDown') nr = Math.min(CFG.ROWS - 1, r + 1);
    else if (ev.key === 'ArrowUp') nr = Math.max(0, r - 1);
    else return;
    ev.preventDefault();
    G.nodeEls[nr * CFG.COLS + nc].focus();
  });

  // map tilt (desktop, no reduced motion)
  const frame = el('mapframe');
  const fine = window.matchMedia('(pointer: fine)').matches;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (fine && !reduced) {
    const wrap = el('stageWrap');
    wrap.addEventListener('pointermove', e => {
      const b = frame.getBoundingClientRect();
      const dx = (e.clientX - (b.left + b.width / 2)) / b.width;
      const dy = (e.clientY - (b.top + b.height / 2)) / b.height;
      frame.style.transform = `perspective(1400px) rotateY(${dx * 2.4}deg) rotateX(${-dy * 2.0}deg)`;
    });
    wrap.addEventListener('pointerleave', () => { frame.style.transform = ''; });
  }
}

function syncSoundBtn() {
  el('soundBtn').innerHTML = `<svg><use href="#${Sfx.isEnabled() ? 'i-sound' : 'i-mute'}"/></svg>`;
}

/* ============================================================ AUTOPLAY (test hook) */

/**
 * Plays a full match headlessly fast. humanPolicy(state) -> order|null.
 * Returns the final engine state. Used by tests; not part of normal UX.
 */
async function autoMatch(seed, humanPolicy) {
  G.speed = 0;
  await startMatch(seed);
  const S = G.state;
  let guard = 0;
  while (!S.over && guard++ < 1000) {
    if (G.phase === 'human') {
      const order = humanPolicy ? humanPolicy(S) : defaultPolicy(S);
      if (order && orderStatus(S, 'human', order).legal) {
        G.sel = order.target; G.staged = { type: order.type, attr: order.attr };
        await humanCommit();
      } else {
        await humanPass();
      }
    } else {
      await sleep(5); // let async flow advance
    }
  }
  G.speed = 1;
  return S;
}

function defaultPolicy(S) {
  // simple deterministic-ish greedy: attack > expand > develop
  const attacks = legalTargets(S, 'human', 'attack');
  if (attacks.length) return { type: 'attack', target: attacks[0] };
  const expands = legalTargets(S, 'human', 'expand');
  if (expands.length) return { type: 'expand', target: expands[0] };
  for (const id of legalTargets(S, 'human', 'develop', 'e')) return { type: 'develop', target: id, attr: 'e' };
  for (const id of legalTargets(S, 'human', 'develop', 'i')) return { type: 'develop', target: id, attr: 'i' };
  for (const id of legalTargets(S, 'human', 'develop', 'd')) return { type: 'develop', target: id, attr: 'd' };
  return null;
}

/* ============================================================ INIT */

function boot() {
  bindUI();
  buildRules();
  Sky.init(el('sky'));

  const seed = randomSeed();
  // Build a preview galaxy behind the intro so the deck is never empty.
  G.state = createMatch(seed);
  G.state.turn = 1; // preview only
  buildMap();
  el('seedChip').textContent = 'SEED ' + seed;
  renderAll();
  G.phase = 'intro';
  showIntro(seed);
}

window.addEventListener('DOMContentLoaded', boot);

window.RELIC = {
  get state() { return G.state; },
  get G() { return G; },
  autoMatch,
  startMatch,
  engine: {
    CFG, LANES, ADJ, NAMES, generateGalaxy, createMatch, orderStatus, legalTargets,
    resolveOrder, payIncome, endTurnEvent, awardRelayPrestige, getScore, finalStandings,
    getIncome, expandCost, attackMilCost, blockadeActive, worldCount, isProtected,
    isAdjacentToEmpire, mulberry32, num,
  },
  ai: { chooseAIAction },
};
