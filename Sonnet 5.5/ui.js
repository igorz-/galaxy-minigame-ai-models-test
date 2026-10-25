(function () {
  'use strict';
  const E = Engine;
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const PCOL = {
    trade: ['#8bffd0', '#0b5a5c', '#3be3b0'],
    forge: ['#ffc27a', '#7a2410', '#ff8a3a'],
    bastion: ['#c3adff', '#232368', '#8c6bff'],
  };

  let S = null;
  let gameId = 0;
  let started = false;
  const ui = { sel: null, type: null, attr: 'e' };

  /* ---------- starfield ---------- */
  (function stars() {
    const cv = $('stars'), cx = cv.getContext('2d');
    let w, h, list = [];
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function size() {
      const d = Math.min(devicePixelRatio || 1, 2);
      w = cv.width = innerWidth * d; h = cv.height = innerHeight * d;
      list = Array.from({ length: 240 }, () => ({ x: Math.random() * w, y: Math.random() * h, r: (Math.random() * 1.3 + .3) * d, p: Math.random() * 6.28, s: Math.random() * .02 + .005, v: Math.random() * .04 + .01 }));
    }
    function draw(t) {
      cx.clearRect(0, 0, w, h);
      for (const s of list) {
        const a = .35 + .5 * Math.sin(s.p + t * s.s * .06);
        cx.fillStyle = 'rgba(200,220,255,' + a.toFixed(2) + ')';
        cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, 6.283); cx.fill();
        if (!calm) { s.y += s.v; if (s.y > h) s.y = 0; }
      }
      if (!calm) requestAnimationFrame(draw);
    }
    size(); addEventListener('resize', size); requestAnimationFrame(draw);
  })();

  /* ---------- map construction ---------- */
  const POS = [];
  for (let id = 0; id < 20; id++) {
    const r = Math.floor(id / 5), c = id % 5;
    const jx = E.RELAYS.includes(id) ? 0 : Math.round(Math.sin(id * 12.9898) * 16);
    const jy = E.RELAYS.includes(id) ? 0 : Math.round(Math.cos(id * 7.233) * 14);
    POS.push({ x: 110 + c * 195 + jx, y: 105 + r * 148 + jy });
  }
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const nodes = [], lanes = [];

  function buildMap() {
    const svg = $('map');
    const defs = el('defs', {}, svg);
    for (const k in PCOL) {
      const g = el('radialGradient', { id: 'p-' + k, cx: '38%', cy: '32%', r: '75%' }, defs);
      el('stop', { offset: '0', 'stop-color': PCOL[k][0] }, g);
      el('stop', { offset: '.55', 'stop-color': PCOL[k][2] }, g);
      el('stop', { offset: '1', 'stop-color': PCOL[k][1] }, g);
    }
    const sh = el('radialGradient', { id: 'shade', cx: '35%', cy: '30%', r: '80%' }, defs);
    el('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '.28' }, sh);
    el('stop', { offset: '.4', 'stop-color': '#fff', 'stop-opacity': '0' }, sh);
    el('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '.6' }, sh);
    const f = el('filter', { id: 'glow', x: '-60%', y: '-60%', width: '220%', height: '220%' }, defs);
    el('feGaussianBlur', { stdDeviation: '9' }, f);

    const lg = el('g', {}, svg);
    E.LINKS.forEach(([a, b]) => {
      const l = el('line', { x1: POS[a].x, y1: POS[a].y, x2: POS[b].x, y2: POS[b].y, class: 'lane' }, lg);
      lanes.push({ a, b, l });
    });

    const hex = (r) => Array.from({ length: 6 }, (_, i) => {
      const a = Math.PI / 3 * i - Math.PI / 2;
      return (Math.cos(a) * r).toFixed(1) + ',' + (Math.sin(a) * r).toFixed(1);
    }).join(' ');

    for (let id = 0; id < 20; id++) {
      const g = el('g', { class: 'node', tabindex: 0, role: 'button', transform: 'translate(' + POS[id].x + ',' + POS[id].y + ')', 'data-id': id }, svg);
      el('circle', { class: 'hit', r: 56 }, g);
      el('polygon', { class: 'relayhex', points: hex(50) }, g);
      el('circle', { class: 'halo', r: 40, filter: 'url(#glow)' }, g);
      el('circle', { class: 'legalring', r: 47 }, g);
      const pl = el('circle', { class: 'planet', r: 31 }, g);
      el('circle', { r: 31, fill: 'url(#shade)', 'pointer-events': 'none' }, g);
      el('circle', { class: 'ring2', r: 41 }, g);
      el('circle', { class: 'ownring', r: 35 }, g);
      el('circle', { class: 'pend', r: 52 }, g);
      el('path', { class: 'sel', d: 'M-58,-42 v-16 h16 M42,-58 h16 v16 M58,42 v16 h-16 M-42,58 h-16 v-16' }, g);
      const num = el('text', { class: 'num', y: 8 }, g);
      const eid = el('text', { class: 'eid', y: 64 }, g);
      const tag = el('text', { class: 'tag', y: 82 }, g);
      const badge = el('g', { class: 'badge', transform: 'translate(24,-44)' }, g);
      el('rect', { x: -17, y: -9, width: 34, height: 18, rx: 9 }, badge);
      const bt = el('text', { y: 4 }, badge);
      const shield = el('g', { class: 'shield', transform: 'translate(-31,-31)' }, g);
      el('path', { d: 'M0,-12 L11,-8 V2 C11,9 5,13 0,15 C-5,13 -11,9 -11,2 V-8 Z' }, shield);
      el('path', { d: 'M-4,1 l3,3 l6,-7', fill: 'none', stroke: '#ffcf4a', 'stroke-width': 2.2 }, shield);
      const pb = el('g', { class: 'pendg', transform: 'translate(0,-64)' }, g);
      el('rect', { class: 'pendbg', x: -36, y: -10, width: 72, height: 19, rx: 9.5 }, pb);
      const pt = el('text', { class: 'pendlbl', y: 4 }, pb);
      pt.textContent = 'PENDING';
      nodes.push({ g, pl, num, eid, tag, bt });
      g.addEventListener('click', () => selectWorld(id));
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectWorld(id); }
      });
    }
  }

  /* ---------- helpers ---------- */
  const ownerName = (p) => (p === 'H' ? 'You' : p === 'A' ? 'Rival' : 'Neutral');
  const wname = (id) => E.pad(id) + ' ' + E.NAMES[id];
  const costStr = (c, m) => [c ? c + ' Cr' : '', m ? m + ' Mil' : ''].filter(Boolean).join(' + ') || 'free';
  const humanTurn = () => S.phase === 'human' && !S.over;
  const stagedOrder = () => (ui.type && ui.sel !== null ? { type: ui.type, target: ui.sel, attr: ui.attr } : null);
  const stagedCheck = () => { const o = stagedOrder(); return o ? E.check(S, 'H', o) : null; };
  const roleLabel = (id) => (E.RELAYS.includes(id) ? 'Ancient relay' : id === E.HOME.H || id === E.HOME.A ? 'Homeworld' : null);

  function selectWorld(id) {
    ui.sel = id;
    render();
  }

  function eventInfo(t) {
    let active = null, next;
    if (t === 11) active = { title: 'Supernova in effect', text: 'Neither empire gained Military this turn. Credits are unaffected.' };
    if (t >= 16 && t <= 19) active = { title: 'Blockade in effect', text: 'Every Attack costs +8 Military (turns 16–19).' };
    if (t <= 5) next = { at: 'End of turn 5', title: 'Relays awaken', text: 'Both relays gain +1 Economy and +1 Industry (max 5). Relay prestige starts: +2 per owned relay at the end of every turn.' };
    else if (t <= 10) next = { at: 'End of turn 10', title: 'Supernova warning', text: 'On turn 11 neither empire gains Military. Credits and existing Military are untouched.' };
    else if (t <= 15) next = { at: 'End of turn 15', title: 'Blockade warning', text: 'Attacks on turns 16–19 cost +8 Military.' };
    else if (t <= 19) next = { at: 'Turn 20', title: 'Blockade lifts', text: 'Attack prices return to normal. Final relay award comes at the end of turn 20.' };
    else next = { at: 'End of turn 20', title: 'Final relay award & scoring', text: 'Relay owners bank the last +2, then the galaxy is scored.' };
    return { active, next };
  }

  /* ---------- rendering ---------- */
  function render() {
    const focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.k : null;
    renderTop(); renderEvents(); renderEmpires(); renderMap(); renderInspector(); renderComposer(); renderLog();
    if (focusKey) { const f = document.querySelector('[data-k="' + focusKey + '"]'); if (f && f !== document.activeElement) f.focus({ preventScroll: true }); }
  }

  function renderTop() {
    const t = Math.max(1, S.turn);
    $('turnNum').textContent = t;
    $('seedLbl').textContent = S.seed;
    const tk = $('ticks');
    if (!tk.children.length) for (let i = 1; i <= 20; i++) tk.appendChild(Object.assign(document.createElement('i'), { className: 'tick' }));
    [...tk.children].forEach((c, i) => {
      const n = i + 1;
      c.className = 'tick' + (n < t ? ' done' : n === t ? ' now' : '') + ([5, 11, 16].includes(n) ? ' ev' : '');
    });
  }

  function renderEvents() {
    const { active, next } = eventInfo(Math.max(1, S.turn));
    $('events').innerHTML =
      '<div class="ev ' + (active ? 'active' : '') + '"><small>' + (active ? 'ACTIVE NOW' : 'ACTIVE NOW') + '</small>' +
      (active ? '<b>' + active.title + '</b><span>' + active.text + '</span>' : '<b>Calm</b><span>No event modifies this turn.</span>') + '</div>' +
      '<div class="ev next"><small>FORECAST · ' + next.at.toUpperCase() + '</small><b>' + next.title + '</b><span>' + next.text + '</span></div>';
  }

  function renderEmpires() {
    const mk = (p, cls, name, tag) => {
      const sc = E.score(S, p), inc = E.income(S, p);
      const acting = humanTurn() ? p === 'H' : S.phase === 'ai' && p === 'A';
      return '<div class="emp ' + cls + (acting ? ' acting' : '') + '"><h2><span>' + name + '</span><em>' + (acting ? 'ACTING' : tag) + '</em></h2>' +
        '<div class="total">' + sc.total + '<small>PRESTIGE</small></div>' +
        '<div class="split">' + sc.planets + ' planets + ' + sc.relay + ' relay</div>' +
        '<dl><dt>Credits</dt><dd>' + S.cred[p] + '<i>+' + inc.c + '</i></dd>' +
        '<dt>Military</dt><dd>' + S.mil[p] + '<i class="' + (inc.m ? '' : 'zero') + '">+' + inc.m + '</i></dd>' +
        '<dt>Worlds</dt><dd>' + sc.worlds + '</dd></dl></div>';
    };
    $('empires').innerHTML = mk('H', 'you', 'Nadir Accord', 'YOU') + mk('A', 'riv', 'Vulcan Pact', 'RIVAL');
  }

  function legalSet() {
    const set = new Set();
    if (!humanTurn() || !ui.type) return set;
    for (let id = 0; id < 20; id++) if (E.check(S, 'H', { type: ui.type, target: id, attr: ui.attr }).ok) set.add(id);
    return set;
  }

  function renderMap() {
    const legal = legalSet();
    const chk = humanTurn() ? stagedCheck() : null;
    for (let id = 0; id < 20; id++) {
      const n = nodes[id], o = S.owner[id], a = S.attrs[id];
      const prot = E.isProtected(S, id);
      const relay = E.RELAYS.includes(id);
      n.g.setAttribute('class', 'node n-' + (o || 'none') + (relay ? ' relay' : '') + (prot ? ' prot' : '') +
        (ui.sel === id ? ' selected' : '') + (legal.has(id) ? ' legal' + (ui.type === 'attack' ? ' atk' : '') : '') +
        (chk && chk.ok && ui.sel === id ? ' pending' : '') +
        (S.last && S.last.target === id && S.last.turn === S.turn ? ' recent' : ''));
      n.pl.setAttribute('fill', 'url(#p-' + S.profile[id] + ')');
      n.num.textContent = E.pad(id);
      n.eid.textContent = 'E' + a.e + ' I' + a.i + ' D' + a.d;
      n.tag.textContent = id === E.HOME.H || id === E.HOME.A ? (relay ? 'RELAY' : 'HOME') : relay ? 'RELAY' : '';
      n.bt.textContent = o === 'H' ? 'YOU' : o === 'A' ? 'RIV' : '';
      n.g.setAttribute('aria-label', 'World ' + E.pad(id) + ', ' + E.NAMES[id] + '. ' + ownerName(o) + (o ? '-owned' : '') +
        (relay ? ', relay' : '') + (id === E.HOME.H || id === E.HOME.A ? ', homeworld' : '') +
        '. Economy ' + a.e + ', Industry ' + a.i + ', Defense ' + a.d + (prot ? '. Capture-protected' : '') +
        (legal.has(id) ? '. Legal target' : '') + (ui.sel === id ? '. Selected' : ''));
      n.g.setAttribute('aria-pressed', ui.sel === id ? 'true' : 'false');
    }
    // highlight lanes
    lanes.forEach((ln) => {
      const oa = S.owner[ln.a], ob = S.owner[ln.b];
      let c = 'lane';
      if (oa && oa === ob) c += oa === 'H' ? ' you' : ' riv';
      if (E.RELAYS.includes(ln.a) && E.RELAYS.includes(ln.b)) c += ' relaylane';
      if (ui.sel !== null && (ln.a === ui.sel || ln.b === ui.sel)) c += ' hl';
      ln.l.setAttribute('class', c);
    });
    // draw selected node last so brackets stay on top
    if (ui.sel !== null && nodes[ui.sel].g.parentNode.lastChild !== nodes[ui.sel].g && document.activeElement !== nodes[ui.sel].g) {
      nodes[ui.sel].g.parentNode.appendChild(nodes[ui.sel].g);
    }
  }

  function renderInspector() {
    const box = $('inspector');
    if (ui.sel === null) { box.innerHTML = '<h3>World inspector</h3><p class="muted">Select any world on the chart to inspect it. Selecting spends nothing.</p>'; return; }
    const id = ui.sel, a = S.attrs[id], o = S.owner[id], prof = E.PROFILES[S.profile[id]], pc = PCOL[S.profile[id]];
    const role = roleLabel(id);
    const prot = E.isProtected(S, id);
    const bar = (k, name) => '<div class="bar ' + k + '"><span>' + name + '</span><span class="pips">' +
      [1, 2, 3, 4, 5].map((n) => '<i class="' + (n <= a[k] ? 'on' : '') + '"></i>').join('') + '</span><b>' + a[k] + '</b></div>';
    let protTxt = '';
    if (S.cap[id] !== null) {
      protTxt = prot
        ? '<span class="chip prot">⛨ Protected through turn ' + (S.cap[id] + 1) + ' · attackable turn ' + (S.cap[id] + 2) + '</span>'
        : '<span class="chip">Captured turn ' + S.cap[id] + ' · protection ended</span>';
    }
    box.innerHTML = '<h3>World inspector</h3>' +
      '<div class="insp-head"><div class="insp-orb" style="--a:' + pc[0] + ';--b:' + pc[1] + ';--g:' + pc[2] + '"></div>' +
      '<div><h2>' + wname(id) + '</h2><p><span class="owner-pill ' + (o || 'N') + '">' + ownerName(o) + '</span> &nbsp;' + prof.name + ' profile' + (role ? ' · ' + role : '') + '</p></div></div>' +
      '<div class="chips">' + (role ? '<span class="chip gold">' + (role === 'Ancient relay' ? '◆ RELAY · +2 prestige/turn from turn 5' : '⌂ HOMEWORLD') + '</span>' : '') + protTxt +
      '<span class="chip">Lanes: ' + E.ADJ[id].map((n) => E.pad(n)).join(' ') + '</span></div>' +
      '<div class="bars">' + bar('e', 'Economy') + bar('i', 'Industry') + bar('d', 'Defense') + '</div>' +
      '<p class="muted">' + (o ? 'Produces <b>' + 2 * a.e + ' Credits</b> and <b>' + a.i + ' Military</b> per turn for ' + (o === 'H' ? 'you' : 'the rival') + '.' : 'Neutral worlds pay no income. Would yield ' + 2 * a.e + ' Cr and ' + a.i + ' Mil per turn if owned.') +
      ' Capture price: 8 Cr + ' + E.attackMil(S, id) + ' Mil.</p>';
  }

  const SHORT = { expand: 'Expand', develop: 'Develop', attack: 'Attack' };
  function renderComposer() {
    const box = $('composer');
    const my = humanTurn();
    const types = ['expand', 'develop', 'attack'];
    const checks = {};
    types.forEach((t) => { checks[t] = ui.sel === null ? null : E.check(S, 'H', { type: t, target: ui.sel, attr: ui.attr }); });
    const st = stagedCheck();
    const targetTxt = ui.sel === null ? 'No world selected' : wname(ui.sel);

    let h = '<h3>Order composer</h3>';
    h += '<p class="phase">' + (my ? '<i></i>Your move: choose one order or pass.' : S.over ? 'Match finished.' : S.phase === 'ai' ? '<i></i>Rival is acting…' : '<i></i>Resolving end of turn…') + '</p>';
    h += '<div class="otabs" role="radiogroup" aria-label="Order type">';
    types.forEach((t) => {
      const c = checks[t];
      const sub = c === null ? '—' : c.ok ? costStr(c.c, c.m) : 'unavailable';
      h += '<button type="button" role="radio" data-k="t-' + t + '" data-type="' + t + '" aria-checked="' + (ui.type === t) + '" class="otab ' + (c ? (c.ok ? 'good' : 'bad') : '') + '"' + (my ? '' : ' disabled') + '><strong>' + SHORT[t] + '</strong><small>' + sub + '</small></button>';
    });
    h += '</div>';
    if (ui.type === 'develop') {
      h += '<div class="attrs" role="radiogroup" aria-label="Attribute to develop">';
      E.ATTRS.forEach((k) => {
        const v = ui.sel !== null && S.owner[ui.sel] === 'H' ? ' (' + S.attrs[ui.sel][k] + (S.attrs[ui.sel][k] < 5 ? '→' + (S.attrs[ui.sel][k] + 1) : ' max') + ')' : '';
        h += '<button type="button" role="radio" class="attr" data-k="a-' + k + '" data-attr="' + k + '" aria-checked="' + (ui.attr === k) + '"' + (my ? '' : ' disabled') + '>' + E.ATTR_NAME[k].slice(0, 4) + v + '</button>';
      });
      h += '</div>';
    }

    h += '<div class="preview" aria-live="polite">';
    h += '<div class="row"><span>Target</span><b>' + targetTxt + '</b></div>';
    if (!ui.type) {
      h += '<p class="muted">Pick Expand, Develop or Attack. ' + (ui.sel !== null ? 'Unavailable options explain why below.' : 'Then select a world to target.') + '</p>';
      if (ui.sel !== null) types.forEach((t) => { const c = checks[t]; h += '<div class="row"><span>' + SHORT[t] + '</span><b style="font-family:var(--font);font-weight:400;text-align:right;color:' + (c.ok ? 'var(--ok)' : 'var(--bad)') + '">' + (c.ok ? 'Legal · ' + costStr(c.c, c.m) : c.reason) + '</b></div>'; });
    } else {
      h += '<div class="row"><span>Order</span><b>' + SHORT[ui.type] + (ui.type === 'develop' ? ' ' + E.ATTR_NAME[ui.attr] : '') + '</b></div>';
      if (st) {
        h += '<div class="row"><span>Price</span><b>' + costStr(st.c, st.m) + '</b></div>';
        h += '<div class="row"><span>Reserves after</span><b>' + (S.cred.H - (st.ok ? st.c : 0)) + ' Cr · ' + (S.mil.H - (st.ok ? st.m : 0)) + ' Mil</b></div>';
        const bl = E.surcharge(S.turn);
        if (ui.type === 'attack' && ui.sel !== null) h += '<div class="row"><span>Breakdown</span><b>4 + 6×D' + S.attrs[ui.sel].d + (bl ? ' + ' + bl + ' blockade' : '') + ' Mil</b></div>';
        h += '<p class="eff">' + effectText() + '</p>';
        h += '<div class="status ' + (st.ok ? 'ok' : 'no') + '">' + (st.ok ? '✓ Legal. Ready to commit.' : '✕ ' + st.reason) + '</div>';
      } else h += '<p class="muted">Select a world to target.</p>';
    }
    h += '</div>';
    h += '<div class="actions"><button type="button" class="primary" id="commit" data-k="commit"' + (my && st && st.ok ? '' : ' disabled') + '>Commit order</button>' +
      '<button type="button" class="secondary" id="pass" data-k="pass"' + (my ? '' : ' disabled') + '>Pass</button></div>';
    box.innerHTML = h;
  }

  function effectText() {
    const t = ui.sel, a = S.attrs[t];
    if (ui.type === 'expand') return 'Claim ' + wname(t) + ' with E' + a.e + ' I' + a.i + ' D' + a.d + '. Income from next turn. Your next expansion will cost ' + (12 + 4 * (E.owned(S, 'H').length + 1)) + ' Cr.';
    if (ui.type === 'develop') {
      const v = a[ui.attr];
      const gain = ui.attr === 'e' ? '+2 Credits per turn' : ui.attr === 'i' ? '+1 Military per turn' : 'attacks on it cost +6 Military';
      return E.ATTR_NAME[ui.attr] + ' ' + v + (v < 5 ? ' → ' + (v + 1) : '') + ': ' + gain + (ui.attr === 'd' ? ' (immediately)' : ' from next turn') + '. +1 planet value.';
    }
    return 'Capture ' + wname(t) + ' with all attributes intact. Rival reserves unchanged. It is shielded through turn ' + (S.turn + 1) + ' and attackable on turn ' + (S.turn + 2) + '.';
  }

  function renderLog() {
    $('log').innerHTML = S.log.slice(0, 40).map((l) => '<li class="' + l.kind + '"><b>T' + l.turn + '</b>' + l.text + '</li>').join('');
  }

  /* ---------- order handling ---------- */
  $('composer').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.type) { ui.type = b.dataset.type; render(); }
    else if (b.dataset.attr) { ui.attr = b.dataset.attr; render(); }
    else if (b.id === 'commit') commit();
    else if (b.id === 'pass') doPass();
  });

  async function commit() {
    if (!humanTurn()) return;
    const o = stagedOrder();
    if (!o || !E.apply(S, 'H', o).ok) { render(); return; }
    announce(S.log[0].text);
    render();
    await afterHuman();
  }
  async function doPass() {
    if (!humanTurn()) return;
    E.pass(S, 'H');
    announce('You pass.');
    render();
    await afterHuman();
  }
  function announce(t) { $('announce').textContent = t; }

  /* ---------- turn flow ---------- */
  async function aiMove(id) {
    S.phase = 'ai'; render();
    await sleep(850);
    if (id !== gameId) return false;
    E.aiAct(S);
    announce(S.log[0].text);
    render();
    return true;
  }

  async function runTurn() {
    const id = gameId;
    E.startTurn(S);
    ui.type = ui.type;
    S.phase = S.first === 'A' ? 'ai' : 'human';
    render();
    if (S.first === 'A') {
      if (!(await aiMove(id))) return;
      if (S.over) return showResult();
    }
    S.phase = 'human';
    render();
  }

  async function afterHuman() {
    const id = gameId;
    if (S.over) return showResult();
    if (S.first === 'H') {
      if (!(await aiMove(id))) return;
      if (S.over) return showResult();
    }
    S.phase = 'between'; render();
    await sleep(500);
    if (id !== gameId) return;
    E.endTurn(S);
    render();
    if (S.over) return showResult();
    await runTurn();
  }

  /* ---------- results ---------- */
  function showResult() {
    const r = S.result;
    const you = r.scores.H, riv = r.scores.A;
    const cls = r.winner === 'H' ? 'win' : r.winner === 'A' ? 'lose' : 'draw';
    const title = r.winner === 'H' ? 'Victory' : r.winner === 'A' ? 'Defeat' : 'Draw';
    const sub = r.how === 'elimination'
      ? (r.winner === 'H' ? 'The Vulcan Pact has no worlds left.' : 'The Nadir Accord has been wiped out.')
      : r.winner === 'H' ? 'You out-scored the Vulcan Pact on prestige.' : r.winner === 'A' ? 'The Vulcan Pact took the higher prestige.' : 'Both empires finished with equal prestige.';
    $('resultBody').innerHTML = '<p class="eyebrow">' + (r.how === 'elimination' ? 'Elimination · turn ' + S.turn : 'Final scoring · turn 20') + '</p>' +
      '<div class="verdict ' + cls + '">' + title + '</div><p>' + sub + '</p>' +
      '<table class="rtable"><thead><tr><th></th><th class="y">YOU</th><th class="r">RIVAL</th></tr></thead><tbody>' +
      '<tr><td>World count</td><td>' + you.worlds + '</td><td>' + riv.worlds + '</td></tr>' +
      '<tr><td>Planet value</td><td>' + you.planets + '</td><td>' + riv.planets + '</td></tr>' +
      '<tr><td>Banked relay prestige</td><td>' + you.relay + '</td><td>' + riv.relay + '</td></tr>' +
      '<tr class="tot"><td>Total prestige</td><td>' + you.total + '</td><td>' + riv.total + '</td></tr></tbody></table>' +
      '<div class="dlgbtns"><button class="primary" id="rNew" type="button">New Galaxy</button><button class="secondary" id="rRep" type="button">Replay Seed</button></div>' +
      '<p class="muted" style="margin-top:10px">Seed ' + S.seed + '</p>';
    $('rNew').onclick = () => { $('resultDlg').close(); newGalaxy(); };
    $('rRep').onclick = () => { $('resultDlg').close(); replay(); };
    const d = $('resultDlg');
    if (!d.open) d.showModal();
  }

  /* ---------- game lifecycle ---------- */
  function setup(seed) {
    gameId++;
    S = E.newGame(seed);
    ui.sel = E.HOME.H; ui.type = null; ui.attr = 'e';
    render();
  }
  const randSeed = () => (Math.random() * 4294967296) >>> 0;
  function inProgress() { return started && !S.over && S.turn > 0; }
  function begin() { if (started) return; started = true; runTurn(); }
  function newGalaxy() { setup(randSeed()); started = true; runTurn(); }
  function replay() { setup(S.seed); started = true; runTurn(); }

  $('btnNew').onclick = () => { if (!inProgress() || confirm('Abandon this match and generate a new galaxy?')) newGalaxy(); };
  $('btnReplay').onclick = () => { if (!inProgress() || confirm('Restart this seed from turn 1?')) replay(); };
  $('btnHelp').onclick = () => $('introDlg').showModal();
  $('btnStart').onclick = () => { $('introDlg').close(); begin(); };
  $('introDlg').addEventListener('close', begin);

  buildMap();
  setup(randSeed());
  $('introDlg').showModal();
})();
