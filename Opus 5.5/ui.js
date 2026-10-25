/* Void Empires — Blitz · interface */
(function () {
  'use strict';
  const VE = window.VE;
  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; };
  const num = id => String(id + 1).padStart(2, '0');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const AI_DELAY = reduceMotion ? 250 : 900;

  const PROFILE_LABEL = { trade: 'Trade world', forge: 'Forge world', bastion: 'Bastion world', home: 'Homeworld', relay: 'Ancient relay' };
  const OWNER_LABEL = { human: 'Yours', ai: 'Rival', null: 'Neutral' };
  const EMPIRE = { human: 'Aurora Concord', ai: 'Vulcan Hegemony' };
  const WHO = { human: 'You', ai: 'Rival' };

  const ICON = {
    you: '<svg viewBox="0 0 12 12"><path d="M6 .8 11.2 6 6 11.2.8 6z"/></svg>',
    rival: '<svg viewBox="0 0 12 12"><path d="M6 1 11.4 10.8H.6z"/></svg>',
    neutral: '<svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    home: '<svg viewBox="0 0 12 12"><path d="M6 .6l1.6 3.5 3.8.4-2.9 2.6.8 3.8L6 9 2.7 10.9l.8-3.8L.6 4.5l3.8-.4z"/></svg>',
    relay: '<svg viewBox="0 0 12 12"><path d="M6 .5 10.8 3.2v5.6L6 11.5 1.2 8.8V3.2z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="6" cy="6" r="1.8"/></svg>',
    shield: '<svg viewBox="0 0 12 12"><path d="M6 .6 10.6 2.3v3.4c0 2.8-2 4.8-4.6 5.7C3.4 10.5 1.4 8.5 1.4 5.7V2.3z"/></svg>',
    expand: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="3.2"/><path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    e: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 5.5v9M12.6 7.6c-.4-.9-1.4-1.4-2.6-1.4-1.5 0-2.6.8-2.6 1.9 0 2.6 5.4 1.3 5.4 4 0 1.1-1.2 1.9-2.8 1.9-1.3 0-2.4-.6-2.8-1.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    i: '<svg viewBox="0 0 20 20"><path d="M2.5 17.5V9l4.5 3V9l4.5 3V5h2l1 4h3v8.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    d: '<svg viewBox="0 0 20 20"><path d="M10 2 16.5 4.5v5c0 4-2.8 6.8-6.5 8.3C6.3 16.3 3.5 13.5 3.5 9.5v-5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 10l2 2 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    attack: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 1.5v5M10 13.5v5M1.5 10h5M13.5 10h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 12 12"><path d="M2 6.4 4.8 9 10 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cross: '<svg viewBox="0 0 12 12"><path d="M3 3l6 6M9 3 3 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  };

  const OPTIONS = [
    { key: 'expand', type: 'expand', label: 'Expand', sub: 'Colonize a neutral world', icon: 'expand' },
    { key: 'dev-e', type: 'develop', attr: 'e', label: 'Develop Economy', sub: '+2 Credits per turn', icon: 'e' },
    { key: 'dev-i', type: 'develop', attr: 'i', label: 'Develop Industry', sub: '+1 Military per turn', icon: 'i' },
    { key: 'dev-d', type: 'develop', attr: 'd', label: 'Develop Defense', sub: '+6 Military to assault it', icon: 'd' },
    { key: 'attack', type: 'attack', label: 'Attack', sub: 'Capture an adjacent rival world', icon: 'attack' },
  ];

  // Rotationally symmetric jitter for an organic chart (id and 19-id are mirrored)
  const JITTER = [[.10, .06], [-.06, -.12], [.08, .14], [-.10, -.06], [-.06, .10], [.04, -.04], [.12, .06], [0, -.06], [-.12, .10], [.06, -.10]];
  const jitter = id => (id < 10 ? JITTER[id] : JITTER[19 - id].map(v => -v));

  const ui = {
    s: null, selected: null, staged: null, timer: null, lastSeq: 0, shownTurn: 0,
    portrait: false, pos: [], size: 48, worldEls: [], laneEls: [],
  };

  /* ------------------------------ Setup ------------------------------ */

  function seedFromURL() {
    const m = /[?&]seed=(\d+)/.exec(location.search);
    return m ? (Number(m[1]) >>> 0) : null;
  }
  function setURLSeed(seed) {
    try { history.replaceState(null, '', `${location.pathname}?seed=${seed}`); } catch (e) { /* file:// may refuse */ }
  }

  function startGame(seed) {
    clearTimeout(ui.timer);
    ui.s = VE.newGame(seed);
    ui.selected = VE.HOMES.human;
    ui.staged = null;
    ui.lastSeq = ui.s.seq;
    ui.shownTurn = 0;
    $('#fx').innerHTML = ''; $('#fxsvg').innerHTML = ''; $('#toasts').innerHTML = '';
    setURLSeed(seed);
    $('#seedLabel').textContent = `seed ${seed}`;
    $('#introSeed').textContent = seed;
    pump();
  }

  function buildWorlds() {
    const host = $('#worlds');
    host.innerHTML = '';
    ui.worldEls = [];
    for (let id = 0; id < VE.N; id++) {
      const b = el('button', 'world');
      b.type = 'button';
      b.dataset.id = id;
      b.innerHTML = `
        <span class="halo"></span>
        <span class="orbit"></span>
        <span class="planet"><span class="surface"></span><span class="clouds"></span><span class="shade"></span></span>
        <span class="relay-rings"><i></i><i></i></span>
        <span class="brackets"><i></i><i></i><i></i><i></i></span>
        <span class="badge"></span>
        <span class="shield">${ICON.shield}<em></em></span>
        <span class="tag"></span>
        <span class="label"><span class="name"><b>${num(id)}</b> <span class="nm"></span></span><span class="stats"></span></span>`;
      b.addEventListener('click', () => select(id));
      b.addEventListener('keydown', onWorldKey);
      host.appendChild(b);
      ui.worldEls.push(b);
    }
  }

  function buildLanes() {
    const svg = $('#lanes');
    svg.innerHTML = `
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>`;
    ui.laneEls = VE.LINKS.map(([a, b]) => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'lane');
      g.innerHTML = '<line class="lane-glow"/><line class="lane-core"/><line class="lane-flow"/>';
      svg.appendChild(g);
      return { a, b, g, lines: g.querySelectorAll('line') };
    });
  }

  function layout() {
    const map = $('#map');
    const W = map.clientWidth, H = map.clientHeight;
    if (!W || !H) return;
    ui.portrait = H > W * 1.05;
    const cols = ui.portrait ? VE.ROWS : VE.COLS;
    const rows = ui.portrait ? VE.COLS : VE.ROWS;
    const padX = W * (ui.portrait ? 0.04 : 0.03), padY = H * 0.05;
    const cw = (W - 2 * padX) / cols, ch = (H - 2 * padY - 18) / rows;
    ui.size = Math.max(24, Math.min(68, Math.min(cw, ch) * (ui.portrait ? 0.36 : 0.36)));
    map.style.setProperty('--s', ui.size + 'px');
    ui.pos = [];
    for (let id = 0; id < VE.N; id++) {
      const r = Math.floor(id / VE.COLS), c = id % VE.COLS;
      const [jx, jy] = jitter(id);
      const gx = ui.portrait ? r : c, gy = ui.portrait ? c : r;
      const jxx = ui.portrait ? jy * 0.35 : jx, jyy = ui.portrait ? jx * 0.8 : jy;
      const x = padX + (gx + 0.5 + jxx * 0.9) * cw;
      const y = padY + (gy + 0.5 + jyy * 0.7) * ch - 6;
      ui.pos.push([x, y]);
      const b = ui.worldEls[id];
      b.style.left = x + 'px';
      b.style.top = y + 'px';
    }
    const svg = $('#lanes'), fx = $('#fxsvg');
    [svg, fx].forEach(n => n.setAttribute('viewBox', `0 0 ${W} ${H}`));
    ui.laneEls.forEach(l => {
      const [x1, y1] = ui.pos[l.a], [x2, y2] = ui.pos[l.b];
      l.lines.forEach(ln => { ln.setAttribute('x1', x1); ln.setAttribute('y1', y1); ln.setAttribute('x2', x2); ln.setAttribute('y2', y2); });
    });
  }

  /* ------------------------------ Flow ------------------------------ */

  function pump() {
    render();
    const s = ui.s;
    if (s.over) { ui.timer = setTimeout(showResult, reduceMotion ? 300 : 1400); return; }
    if (s.actor === VE.AI) {
      ui.timer = setTimeout(() => { VE.runAI(s); pump(); }, AI_DELAY);
    }
  }

  function currentOrder() {
    if (!ui.staged || ui.selected === null) return null;
    return { type: ui.staged.type, attr: ui.staged.attr, target: ui.selected };
  }

  function select(id) {
    ui.selected = id;
    render();
  }

  function stage(key) {
    const opt = OPTIONS.find(o => o.key === key);
    if (!opt) return;
    if (ui.staged && ui.staged.key === key) ui.staged = null;
    else ui.staged = { key, type: opt.type, attr: opt.attr };
    render();
  }

  function commit() {
    const s = ui.s;
    if (s.over || s.actor !== VE.HUMAN) return;
    const order = currentOrder();
    if (!order) return;
    const res = VE.act(s, VE.HUMAN, order);
    if (!res.ok) { toast(`Order refused: ${res.reason}`, 'warn'); render(); return; }
    ui.staged = null;
    pump();
  }

  function pass() {
    const s = ui.s;
    if (s.over || s.actor !== VE.HUMAN) return;
    VE.act(s, VE.HUMAN, { type: 'pass' });
    ui.staged = null;
    pump();
  }

  /* ------------------------------ Render ------------------------------ */

  function render() {
    const s = ui.s;
    if (s.turn !== ui.shownTurn && !s.over) { ui.shownTurn = s.turn; turnBanner(); }
    renderTrack(); renderEmpires(); renderPhase(); renderWorlds(); renderLanes();
    renderInspector(); renderComposer(); renderEvents(); renderLog(); processFx();
  }

  function renderTrack() {
    const s = ui.s, host = $('#turntrack');
    if (!host.children.length) {
      for (let t = 1; t <= VE.MAX_TURNS; t++) {
        const li = el('li', 'tt');
        li.dataset.t = t;
        let mark = '';
        if (t === 5) mark = '<i class="ev ev-awaken" title="Relays awaken (end of turn 5)"></i>';
        if (t === 11) mark = '<i class="ev ev-nova" title="Supernova: no Military income"></i>';
        if (t >= 16 && t <= 19) li.classList.add('blockade');
        if (t === 20) mark = '<i class="ev ev-end" title="Collapse & final score"></i>';
        if (t >= 5) li.classList.add('relaylive');
        li.classList.add(t % 2 ? 'odd' : 'even');
        li.innerHTML = `<span>${t}</span>${mark}`;
        host.appendChild(li);
      }
    }
    [...host.children].forEach(li => {
      const t = Number(li.dataset.t);
      li.classList.toggle('past', t < s.turn || (s.over && t <= s.turn));
      li.classList.toggle('now', t === s.turn && !s.over);
      li.setAttribute('aria-label', `Turn ${t}${t === s.turn ? ' (current)' : ''}`);
    });
  }

  function empireHTML(who) {
    const s = ui.s, e = s.empires[who], sc = VE.score(s, who), inc = VE.baseIncome(s, who);
    const novaNote = s.turn + 1 === 11 ? '<em class="warn">0 next turn</em>' : s.turn === 11 ? '<em class="warn">nova: 0 this turn</em>' : '';
    return `
      <div class="emp-head">
        <span class="emp-glyph">${who === 'human' ? ICON.you : ICON.rival}</span>
        <div><div class="emp-who">${who === 'human' ? 'You' : 'Rival AI'}</div><div class="emp-name">${EMPIRE[who]}</div></div>
        <div class="emp-score" title="Total prestige">
          <b>${sc.total}</b><span>prestige</span>
        </div>
      </div>
      <div class="emp-stats">
        <div class="st"><span class="k">Credits</span><span class="v">${e.credits}</span><span class="d">+${inc.credits}/turn</span></div>
        <div class="st"><span class="k">Military</span><span class="v">${e.military}</span><span class="d">+${inc.military}/turn ${novaNote}</span></div>
        <div class="st"><span class="k">Worlds</span><span class="v">${sc.worlds}</span><span class="d">${sc.planetValue} planet value</span></div>
        <div class="st"><span class="k">Relay</span><span class="v">${sc.relayPrestige}</span><span class="d">banked prestige</span></div>
      </div>`;
  }

  function renderEmpires() {
    $('#empHuman').innerHTML = empireHTML('human');
    $('#empAI').innerHTML = empireHTML('ai');
    const s = ui.s;
    $('#empHuman').classList.toggle('active', s.actor === 'human');
    $('#empAI').classList.toggle('active', s.actor === 'ai');
  }

  function renderPhase() {
    const s = ui.s, h = VE.score(s, 'human').total, a = VE.score(s, 'ai').total;
    const share = h + a ? (h / (h + a)) * 100 : 50;
    let status;
    if (s.over) status = '<span class="ph-state">Match complete</span><button type="button" class="results-btn" data-results>View results</button>';
    else if (s.actor === 'human') status = '<span class="ph-state you"><i class="dot"></i>Your order</span>';
    else status = '<span class="ph-state rival"><i class="dot pulse"></i>Rival is deciding…</span>';
    const first = s.initiative === 'human' ? 'You act first' : 'Rival acts first';
    $('#phase').innerHTML = `
      <div class="ph-turn"><span>Turn</span><b>${s.turn}</b><span>/ ${VE.MAX_TURNS}</span></div>
      ${status}
      <div class="ph-init">${s.over ? '' : first}</div>
      <div class="tug" role="img" aria-label="Prestige: you ${h}, rival ${a}"><i style="width:${share}%"></i><span class="tug-l">${h}</span><span class="tug-r">${a}</span></div>`;
  }

  function legalSet() {
    const s = ui.s, set = new Map();
    if (s.over) return set;
    for (const w of s.worlds) {
      if (ui.staged) {
        const c = VE.checkOrder(s, 'human', { type: ui.staged.type, attr: ui.staged.attr, target: w.id });
        if (c.ok) set.set(w.id, ui.staged.type);
      } else {
        for (const type of ['expand', 'attack']) if (VE.checkOrder(s, 'human', { type, target: w.id }).ok) set.set(w.id, type);
      }
    }
    return set;
  }

  function renderWorlds() {
    const s = ui.s, legal = legalSet();
    s.worlds.forEach((w, id) => {
      const b = ui.worldEls[id];
      const owner = w.owner || 'neutral';
      const sum = w.e + w.i + w.d;
      const scale = (w.relay ? 1.08 : w.home ? 1.1 : 1) * (0.9 + 0.02 * Math.min(sum, 15));
      b.style.setProperty('--k', scale.toFixed(3));
      b.className = `world p-${w.profile} o-${owner}` +
        (w.relay ? ' is-relay' : '') + (w.relay && s.relaysAwake ? ' awake' : '') + (w.home ? ' is-home' : '') +
        (ui.selected === id ? ' selected' : '') +
        (legal.has(id) ? (ui.staged ? ' legal staged-legal' : ' legal reach') : '') +
        (ui.staged && ui.selected === id ? ' pending' : '') +
        (VE.isProtected(w, s.turn) ? ' protected' : '');
      b.querySelector('.nm').textContent = w.name;
      b.querySelector('.stats').innerHTML = `<i class="e">E${w.e}</i><i class="i">I${w.i}</i><i class="d">D${w.d}</i>` +
        (w.relay ? `<i class="rl" title="${s.relaysAwake ? 'Relay awake' : 'Relay dormant'}">${s.relaysAwake ? 'RELAY ◆ LIVE' : 'RELAY'}</i>` : '');
      b.querySelector('.badge').innerHTML = (w.owner === 'human' ? ICON.you : w.owner === 'ai' ? ICON.rival : '') + (w.home ? `<span class="hm">${ICON.home}</span>` : '');
      b.querySelector('.shield em').textContent = VE.isProtected(w, s.turn) ? `T${w.capturedTurn + 1}` : '';
      const tag = b.querySelector('.tag');
      if (ui.staged && ui.selected === id) {
        const ok = VE.checkOrder(s, 'human', currentOrder()).ok;
        tag.textContent = (ok ? '' : '✕ ') + stagedName();
        tag.className = 'tag show' + (ok ? '' : ' bad');
      } else { tag.className = 'tag'; tag.textContent = ''; }


      const parts = [`World ${num(id)} ${w.name}`, OWNER_LABEL[w.owner], PROFILE_LABEL[w.profile], `Economy ${w.e}, Industry ${w.i}, Defense ${w.d}`];
      if (w.home) parts.push(`${w.home === 'human' ? 'your' : 'rival'} home`);
      if (VE.isProtected(w, s.turn)) parts.push(`capture-protected through turn ${w.capturedTurn + 1}`);
      if (legal.has(id)) parts.push(`legal ${legal.get(id)} target`);
      if (ui.selected === id) parts.push('selected');
      b.setAttribute('aria-label', parts.join(', '));
      b.setAttribute('aria-pressed', ui.selected === id ? 'true' : 'false');
      b.tabIndex = (ui.selected === id || (ui.selected === null && id === 0)) ? 0 : -1;
    });
  }

  function renderLanes() {
    const s = ui.s;
    ui.laneEls.forEach(l => {
      const oa = s.worlds[l.a].owner, ob = s.worlds[l.b].owner;
      let cls = 'lane';
      if (oa && oa === ob) cls += oa === 'human' ? ' l-you' : ' l-rival';
      else if (oa && ob) cls += ' l-front';
      else if (oa || ob) cls += (oa || ob) === 'human' ? ' l-you-out' : ' l-rival-out';
      if (s.worlds[l.a].relay && s.worlds[l.b].relay) cls += ' l-relay';
      if (ui.selected === l.a || ui.selected === l.b) cls += ' l-hot';
      l.g.setAttribute('class', cls);
    });
  }

  function bars(v) {
    let h = '';
    for (let k = 1; k <= 5; k++) h += `<i class="${k <= v ? 'on' : ''}"></i>`;
    return `<span class="bars" aria-hidden="true">${h}</span>`;
  }

  function renderInspector() {
    const s = ui.s, host = $('#inspector');
    if (ui.selected === null) { host.innerHTML = '<p class="empty">Select any world on the chart to inspect it.</p>'; return; }
    const w = s.worlds[ui.selected];
    const owner = w.owner || 'neutral';
    const prot = VE.isProtected(w, s.turn);
    const lanes = VE.ADJ[w.id];
    const chips = [
      `<span class="chip c-${owner}">${w.owner === 'human' ? ICON.you : w.owner === 'ai' ? ICON.rival : ICON.neutral}${OWNER_LABEL[w.owner]}</span>`,
      `<span class="chip">${PROFILE_LABEL[w.profile]}</span>`,
    ];
    if (w.home) chips.push(`<span class="chip c-home">${ICON.home}${w.home === 'human' ? 'Your home' : 'Rival home'}</span>`);
    if (w.relay) chips.push(`<span class="chip c-relay">${ICON.relay}${s.relaysAwake ? 'Relay · +2 prestige/turn' : 'Relay · awakens end of T5'}</span>`);
    if (prot) chips.push(`<span class="chip c-shield">${ICON.shield}Protected through T${w.capturedTurn + 1}</span>`);
    const prodWho = w.owner === 'human' ? 'to you' : w.owner === 'ai' ? 'to the rival' : 'if claimed';
    const atk = VE.attackMilitary(w.d, s.turn);
    let protLine;
    if (prot) protLine = `Captured on turn ${w.capturedTurn}. Protected through turn ${w.capturedTurn + 1}; first attackable on turn ${w.capturedTurn + 2}.`;
    else if (w.capturedTurn !== null) protLine = `Captured on turn ${w.capturedTurn}; protection expired.`;
    else protLine = 'No capture protection.';
    host.innerHTML = `
      <div class="ins-head">
        <div class="ins-art world p-${w.profile} o-${owner}${w.relay ? ' is-relay' : ''}${w.relay && s.relaysAwake ? ' awake' : ''}" aria-hidden="true">
          <span class="orbit"></span><span class="planet"><span class="surface"></span><span class="clouds"></span><span class="shade"></span></span><span class="relay-rings"><i></i><i></i></span>
        </div>
        <div class="ins-title">
          <div class="ins-num">World ${num(w.id)}</div>
          <h2>${w.name}</h2>
          <div class="chips">${chips.join('')}</div>
        </div>
      </div>
      <div class="attrs">
        <div class="attr a-e"><span class="ai">${ICON.e}</span><span class="an">Economy</span>${bars(w.e)}<b>${w.e}</b></div>
        <div class="attr a-i"><span class="ai">${ICON.i}</span><span class="an">Industry</span>${bars(w.i)}<b>${w.i}</b></div>
        <div class="attr a-d"><span class="ai">${ICON.d}</span><span class="an">Defense</span>${bars(w.d)}<b>${w.d}</b></div>
      </div>
      <dl class="facts">
        <div><dt>Production</dt><dd><b>+${2 * w.e}</b> Credits · <b>+${w.i}</b> Military <small>${prodWho}</small></dd></div>
        <div><dt>Planet value</dt><dd><b>${3 + w.e + w.i + w.d}</b> prestige at final scoring</dd></div>
        <div><dt>Assault cost</dt><dd><b>8</b> Credits + <b>${atk}</b> Military${VE.blockadeSurcharge(s.turn) ? ' <small>incl. blockade +8</small>' : ''}</dd></div>
        <div><dt>Protection</dt><dd>${protLine}</dd></div>
        <div><dt>Lanes</dt><dd class="lanes-list">${lanes.map(n => `<button type="button" class="lane-chip o-${s.worlds[n].owner || 'neutral'}" data-goto="${n}" aria-label="Select world ${num(n)} ${s.worlds[n].name}">${num(n)}</button>`).join('')}</dd></div>
      </dl>`;
    host.querySelectorAll('[data-goto]').forEach(btn => btn.addEventListener('click', () => { const n = Number(btn.dataset.goto); select(n); ui.worldEls[n].focus(); }));
  }

  function stagedName() {
    const o = OPTIONS.find(x => x.key === ui.staged.key);
    return o ? o.label : '';
  }

  function costText(cost) {
    const p = [];
    if (cost.credits) p.push(`${cost.credits} Cr`);
    if (cost.military) p.push(`${cost.military} Mil`);
    return p.join(' + ') || 'Free';
  }

  function renderComposer() {
    const s = ui.s, host = $('#options');
    const humanTurn = !s.over && s.actor === 'human';
    if (!host.children.length) {
      OPTIONS.forEach((o, idx) => {
        const b = el('button', 'opt');
        b.type = 'button';
        b.dataset.key = o.key;
        b.innerHTML = `<span class="opt-ic">${ICON[o.icon]}</span><span class="opt-main"><span class="opt-label">${o.label}</span><span class="opt-why"></span></span><span class="opt-cost"></span><kbd>${idx + 1}</kbd>`;
        b.addEventListener('click', () => stage(o.key));
        host.appendChild(b);
      });
    }
    [...host.children].forEach(b => {
      const o = OPTIONS.find(x => x.key === b.dataset.key);
      const target = ui.selected;
      const chk = VE.checkOrder(s, 'human', { type: o.type, attr: o.attr, target });
      const staged = ui.staged && ui.staged.key === o.key;
      b.classList.toggle('staged', !!staged);
      b.classList.toggle('ok', chk.ok);
      b.classList.toggle('no', !chk.ok);
      b.setAttribute('aria-pressed', staged ? 'true' : 'false');
      b.querySelector('.opt-cost').textContent = target === null ? '' : costText(chk.cost);
      b.querySelector('.opt-why').innerHTML = chk.ok ? `${ICON.check}<span>${o.sub}</span>` : `${ICON.cross}<span>${chk.reason}</span>`;
      b.setAttribute('aria-label', `${o.label}, ${costText(chk.cost)}, ${chk.ok ? 'available' : 'unavailable: ' + chk.reason}${staged ? ', staged' : ''}`);
    });

    const prev = $('#preview'), sum = $('#commitSummary');
    const order = currentOrder();
    let ok = false;
    if (!ui.staged) {
      prev.className = 'preview idle';
      prev.innerHTML = humanTurn
        ? '<p>Choose an order above to stage it against the selected world, or Pass to save your resources.</p>'
        : s.over ? '<p>The match has ended.</p>' : '<p>Stand by while the rival commits its order.</p>';
      sum.innerHTML = humanTurn ? '<span class="muted">No order staged</span>' : '<span class="muted">Waiting…</span>';
    } else {
      const w = s.worlds[ui.selected];
      const chk = VE.checkOrder(s, 'human', order);
      ok = chk.ok && humanTurn;
      const e = s.empires.human;
      const after = { credits: e.credits - chk.cost.credits, military: e.military - chk.cost.military };
      prev.className = 'preview ' + (chk.ok ? 'good' : 'bad');
      prev.innerHTML = `
        <div class="pv-head"><span class="pv-k">Staged</span><b>${stagedName()}</b><span class="pv-arrow">→</span><b>${num(w.id)} ${w.name}</b></div>
        <p class="pv-effect">${chk.effect}</p>
        <div class="pv-ledger">
          <div><span>Credits</span><b>${e.credits}</b><i>→</i><b class="${after.credits < 0 ? 'neg' : ''}">${chk.ok ? after.credits : '—'}</b></div>
          <div><span>Military</span><b>${e.military}</b><i>→</i><b class="${after.military < 0 ? 'neg' : ''}">${chk.ok ? after.military : '—'}</b></div>
        </div>
        ${chk.ok ? '' : `<p class="pv-reason">${ICON.cross}<span>${chk.reason} Commit is disabled; nothing will be spent.</span></p>`}
        ${!humanTurn && !s.over ? '<p class="pv-reason wait">Rival is acting. Your staged order waits for your phase.</p>' : ''}`;
      sum.innerHTML = `<span class="${chk.ok ? '' : 'bad'}">${stagedName()} → ${num(w.id)}</span><span class="muted">${costText(chk.cost)}</span>`;
    }
    $('#commitBtn').disabled = !ok;
    $('#passBtn').disabled = !humanTurn;
    $('#commitBtn').textContent = ok ? `Commit · ${costText(VE.checkOrder(s, 'human', order).cost)}` : 'Commit order';
  }

  function renderEvents() {
    const s = ui.s, host = $('#events');
    const active = s.over ? [] : VE.activeEffects(s.turn);
    const next = VE.nextEvent(s.turn);
    const sched = [
      { t: '5', k: 'awaken', name: 'Relay awakening', done: s.turn > 5 || (s.turn === 5 && s.over) },
      { t: '11', k: 'nova', name: 'Supernova', done: s.turn > 11 },
      { t: '16–19', k: 'blockade', name: 'Blockade', done: s.turn > 19 },
      { t: '20', k: 'end', name: 'Collapse', done: s.over },
    ];
    let nextHTML = '';
    if (next && !s.over) {
      const inT = next.turn - s.turn;
      nextHTML = `<div class="ev-next">
        <div class="ev-tag">Forecast · ${inT === 0 ? 'this turn' : `in ${inT} turn${inT > 1 ? 's' : ''}`}</div>
        <h3>${next.title} <small>${next.when}</small></h3>
        <p>${next.text}</p></div>`;
    }
    host.innerHTML = `
      ${active.length ? `<div class="ev-active">${active.map(a => `<div class="ev-now k-${a.key}"><span class="ev-tag live">Active now</span><b>${a.title}</b><span>${a.text}</span></div>`).join('')}</div>` : '<div class="ev-active"><div class="ev-now calm"><span class="ev-tag">Active now</span><b>No effects</b><span>Standard prices and income.</span></div></div>'}
      ${nextHTML}
      <ol class="ev-sched">${sched.map(x => `<li class="${x.done ? 'done' : ''} k-${x.k}"><span>T${x.t}</span>${x.name}</li>`).join('')}</ol>`;
  }

  function renderLog() {
    const s = ui.s, host = $('#log');
    const items = s.log.slice(-40).reverse();
    host.innerHTML = items.map(e => {
      const who = e.who ? `<b class="lw ${e.who}">${e.who === 'human' ? ICON.you : ICON.rival}${WHO[e.who]}</b> ` : '';
      return `<li class="lk-${e.kind}${e.who ? ' by-' + e.who : ''}"><span class="lt">T${e.turn}</span><span class="lx">${who}${e.text}</span></li>`;
    }).join('');
  }

  /* ------------------------------ Effects ------------------------------ */

  function processFx() {
    const s = ui.s;
    const fresh = s.log.filter(e => e.n > ui.lastSeq);
    ui.lastSeq = s.seq;
    fresh.forEach((e, k) => {
      setTimeout(() => {
        if (e.target !== undefined && ['expand', 'attack', 'develop', 'prestige'].includes(e.kind)) burst(e);
        if (e.who === 'ai' && e.kind !== 'prestige') toast(`<b class="rv">${ICON.rival}Rival</b> ${e.text}`, 'ai');
        if (e.who === 'ai' && e.kind === 'pass') { /* toast already shown */ }
        if (e.kind === 'event' || e.kind === 'end') toast(e.text, 'event');
      }, k * 160);
    });
  }

  function burst(e) {
    const [x, y] = ui.pos[e.target] || [0, 0];
    const fx = $('#fx');
    const ring = el('div', `burst b-${e.kind} by-${e.who}`);
    ring.style.left = x + 'px'; ring.style.top = y + 'px';
    const label = { expand: 'Colonized', attack: 'Captured', develop: 'Developed', prestige: '+2 prestige' }[e.kind];
    ring.innerHTML = `<i></i><i></i><span>${label}</span>`;
    fx.appendChild(ring);
    setTimeout(() => ring.remove(), 1800);
    if (e.kind === 'attack') {
      const from = VE.ADJ[e.target].find(n => ui.s.worlds[n].owner === e.who && n !== e.target);
      if (from !== undefined) beam(ui.pos[from], [x, y], e.who);
    }
  }

  function beam(a, b, who) {
    const svg = $('#fxsvg');
    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    ln.setAttribute('x1', a[0]); ln.setAttribute('y1', a[1]); ln.setAttribute('x2', b[0]); ln.setAttribute('y2', b[1]);
    ln.setAttribute('class', `beam ${who}`);
    svg.appendChild(ln);
    setTimeout(() => ln.remove(), 1200);
  }

  function toast(html, kind) {
    const host = $('#toasts');
    const t = el('div', `toast t-${kind}`, html);
    host.appendChild(t);
    while (host.children.length > 3) host.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 3600);
    setTimeout(() => t.remove(), 4100);
  }

  function turnBanner() {
    const s = ui.s, b = $('#banner');
    const first = s.initiative === 'human' ? 'You have initiative' : 'Rival has initiative';
    let note = '';
    if (s.turn === 5) note = 'Relays awaken at the end of this turn';
    else if (s.turn === 11) note = 'Supernova: no Military income';
    else if (s.turn >= 16 && s.turn <= 19) note = 'Blockade: attacks +8 Military';
    else if (s.turn === 20) note = 'Final turn';
    b.innerHTML = `<small>Turn</small><b>${s.turn}</b><span>${first}${note ? ' · ' + note : ''}</span>`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }

  /* ------------------------------ Result ------------------------------ */

  function showResult() {
    const s = ui.s, r = s.result;
    if (!r) return;
    const dlg = $('#result');
    dlg.classList.remove('win', 'loss', 'draw');
    const outcome = r.winner === 'human' ? 'win' : r.winner === 'ai' ? 'loss' : 'draw';
    dlg.classList.add(outcome);
    $('#resultEyebrow').textContent = r.reason === 'elimination' ? `Elimination · turn ${r.turn}` : 'Final prestige · after turn 20';
    $('#resultTitle').textContent = { win: 'Victory', loss: 'Defeat', draw: 'Stalemate' }[outcome];
    $('#resultLede').textContent = r.reason === 'elimination'
      ? (outcome === 'win' ? 'The Vulcan Hegemony has lost its last world. The void is yours.' : 'Your final world has fallen. The Aurora Concord is no more.')
      : outcome === 'win' ? `The Aurora Concord leads by ${r.human.total - r.ai.total} prestige as the galaxy collapses.`
        : outcome === 'loss' ? `The Vulcan Hegemony leads by ${r.ai.total - r.human.total} prestige as the galaxy collapses.`
          : 'Both empires end with identical prestige.';
    const row = (k, a, b, strong) => `<div class="rt-row${strong ? ' strong' : ''}"><span>${k}</span><b class="you">${a}</b><b class="rival">${b}</b></div>`;
    $('#resultTable').innerHTML = `
      <div class="rt-row head"><span></span><b class="you">${ICON.you}You</b><b class="rival">${ICON.rival}Rival</b></div>
      ${row('Total prestige', r.human.total, r.ai.total, true)}
      ${row('Planet value', r.human.planetValue, r.ai.planetValue)}
      ${row('Relay prestige', r.human.relayPrestige, r.ai.relayPrestige)}
      ${row('Worlds held', r.human.worlds, r.ai.worlds)}`;
    if (!dlg.open) dlg.showModal();
  }

  /* ------------------------------ Input ------------------------------ */

  function onWorldKey(ev) {
    const id = Number(ev.currentTarget.dataset.id);
    const r = Math.floor(id / VE.COLS), c = id % VE.COLS;
    let dr = 0, dc = 0;
    const k = ev.key;
    if (k === 'ArrowLeft') ui.portrait ? (dr = -1) : (dc = -1);
    else if (k === 'ArrowRight') ui.portrait ? (dr = 1) : (dc = 1);
    else if (k === 'ArrowUp') ui.portrait ? (dc = -1) : (dr = -1);
    else if (k === 'ArrowDown') ui.portrait ? (dc = 1) : (dr = 1);
    else return;
    ev.preventDefault();
    const nr = Math.min(VE.ROWS - 1, Math.max(0, r + dr)), nc = Math.min(VE.COLS - 1, Math.max(0, c + dc));
    const nid = nr * VE.COLS + nc;
    select(nid);
    ui.worldEls[nid].focus();
  }

  function onKey(ev) {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    const tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    const k = ev.key.toLowerCase();
    if (k >= '1' && k <= '5') { stage(OPTIONS[Number(k) - 1].key); ev.preventDefault(); }
    else if (k === 'c') { commit(); ev.preventDefault(); }
    else if (k === 'p') { pass(); ev.preventDefault(); }
    else if (k === 'escape') { ui.staged = null; render(); }
  }

  /* ------------------------------ Sky ------------------------------ */

  function sky() {
    const c = $('#sky'), ctx = c.getContext('2d');
    let stars = [], base = null, W = 0, H = 0, dpr = 1;
    function build() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      c.width = W * dpr; c.height = H * dpr;
      base = document.createElement('canvas'); base.width = c.width; base.height = c.height;
      const b = base.getContext('2d'); b.scale(dpr, dpr);
      b.fillStyle = '#05040b'; b.fillRect(0, 0, W, H);
      const rng = VE.mulberry32(7);
      const neb = [[.18, .25, '#3b1c6e', .55], [.82, .78, '#5a1638', .45], [.62, .18, '#0e3a4f', .40], [.35, .85, '#1a2a6a', .38], [.5, .5, '#25124a', .30]];
      b.globalCompositeOperation = 'lighter';
      neb.forEach(([x, y, col, a]) => {
        const r = Math.max(W, H) * (0.35 + rng() * 0.2);
        const g = b.createRadialGradient(x * W, y * H, 0, x * W, y * H, r);
        g.addColorStop(0, hexA(col, a)); g.addColorStop(1, hexA(col, 0));
        b.fillStyle = g; b.fillRect(0, 0, W, H);
      });
      for (let k = 0; k < 40; k++) {
        const x = rng() * W, y = rng() * H, r = 40 + rng() * 160;
        const g = b.createRadialGradient(x, y, 0, x, y, r);
        const col = ['#6f3cff', '#ff3d7f', '#2fd6c4', '#3b6bff'][k % 4];
        g.addColorStop(0, hexA(col, 0.035)); g.addColorStop(1, hexA(col, 0));
        b.fillStyle = g; b.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      b.globalCompositeOperation = 'source-over';
      const count = Math.floor((W * H) / 2200);
      for (let k = 0; k < count; k++) {
        const x = rng() * W, y = rng() * H, m = rng();
        b.fillStyle = `rgba(${200 + rng() * 55},${200 + rng() * 40},255,${0.15 + m * 0.5})`;
        b.fillRect(x, y, m > 0.92 ? 1.6 : 1, m > 0.92 ? 1.6 : 1);
      }
      stars = Array.from({ length: Math.floor(count / 12) }, () => ({ x: rng() * W, y: rng() * H, r: 0.6 + rng() * 1.3, p: rng() * 6.28, sp: 0.4 + rng() * 1.2, hue: rng() }));
      draw(0);
    }
    function hexA(hex, a) {
      const n = parseInt(hex.slice(1), 16);
      return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
    }
    function draw(t) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const st of stars) {
        const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(st.p + t * 0.001 * st.sp));
        ctx.fillStyle = st.hue > 0.8 ? `rgba(255,200,220,${a})` : st.hue > 0.6 ? `rgba(180,255,240,${a})` : `rgba(235,235,255,${a})`;
        ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, 6.283); ctx.fill();
        if (st.r > 1.6) { ctx.fillStyle = `rgba(255,255,255,${a * 0.15})`; ctx.fillRect(st.x - 5, st.y - 0.3, 10, 0.6); ctx.fillRect(st.x - 0.3, st.y - 5, 0.6, 10); }
      }
    }
    let last = 0;
    function loop(t) {
      if (t - last > 50) { draw(t); last = t; }
      requestAnimationFrame(loop);
    }
    build();
    window.addEventListener('resize', build);
    if (!reduceMotion) requestAnimationFrame(loop);
  }

  /* ------------------------------ Boot ------------------------------ */

  function boot() {
    buildWorlds();
    buildLanes();
    sky();
    const ro = new ResizeObserver(() => layout());
    ro.observe($('#map'));
    document.addEventListener('keydown', onKey);
    $('#commitBtn').addEventListener('click', commit);
    $('#passBtn').addEventListener('click', pass);
    $('#rulesBtn').addEventListener('click', () => $('#intro').showModal());
    $('#newBtn').addEventListener('click', () => { if (confirm('Abandon this match and chart a new galaxy?')) startGame(VE.randomSeed()); });
    $('#startBtn').addEventListener('click', () => { $('#intro').close(); ui.worldEls[ui.selected].focus(); });
    $('#newGalaxyBtn').addEventListener('click', () => { $('#result').close(); startGame(VE.randomSeed()); });
    $('#replayBtn').addEventListener('click', () => { $('#result').close(); startGame(ui.s.seed); });
    $('#viewBtn').addEventListener('click', () => $('#result').close());
    $('#phase').addEventListener('click', ev => { if (ev.target.closest('[data-results]')) showResult(); });
    const seed = seedFromURL();
    startGame(seed !== null ? seed : VE.randomSeed());
    layout();
    $('#intro').showModal();
  }

  window.addEventListener('DOMContentLoaded', boot);
  window.__ui = ui;
})();
