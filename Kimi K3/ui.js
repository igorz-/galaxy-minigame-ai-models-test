/* Void Empires — Blitz: interface layer (requires logic.js -> window.VE). */
(function () {
  'use strict';
  const VE = window.VE;

  /* ---------- static map geometry (identical for every seed) ---------- */
  const POS = [];
  for (let id = 0; id < 20; id++) {
    const col = id % 5, row = Math.floor(id / 5);
    const jx = (((id * 37) % 9) - 4) * 0.65;
    const jy = (((id * 61) % 9) - 4) * 0.75;
    POS.push({ x: 11 + col * 19.5 + jx, y: 13.5 + row * 22 + jy });
  }

  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  /* ---------- session state ---------- */
  let state = null;
  let selected = null;                    // world id or null
  let staged = null;                      // { type: 'expand'|'develop'|'attack', attr: 'E'|'I'|'D' }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function newMatch(seed) {
    state = seed === undefined ? VE.createGame() : VE.createGame(seed);
    selected = null;
    staged = null;
    $('#result').classList.add('hidden');
    update();
  }

  /* ---------- starfield ---------- */
  function initStars() {
    const cv = $('#stars');
    const ctx = cv.getContext('2d');
    let stars = [];
    function resize() {
      cv.width = window.innerWidth * devicePixelRatio;
      cv.height = window.innerHeight * devicePixelRatio;
      stars = [];
      const n = Math.floor((window.innerWidth * window.innerHeight) / 2600);
      for (let i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * cv.width,
          y: Math.random() * cv.height,
          r: (Math.random() * 1.1 + 0.25) * devicePixelRatio,
          p: Math.random() * Math.PI * 2,
          s: 0.4 + Math.random() * 1.4,
          hue: Math.random() < 0.12 ? '190, 220, 255' : Math.random() < 0.08 ? '255, 230, 190' : '235, 240, 255',
        });
      }
    }
    resize();
    window.addEventListener('resize', resize);
    let t0 = 0;
    function frame(t) {
      const dt = (t - t0) / 1000; t0 = t;
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const st of stars) {
        st.p += dt * st.s;
        const tw = reducedMotion ? 0.75 : 0.55 + 0.45 * Math.sin(st.p);
        ctx.globalAlpha = tw;
        ctx.fillStyle = 'rgb(' + st.hue + ')';
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- map construction ---------- */
  const worldBtns = [];
  const laneLines = [];
  function buildMap() {
    const svg = $('#lanes');
    const NS = 'http://www.w3.org/2000/svg';
    VE.LINKS.forEach(([a, b], i) => {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', POS[a].x); line.setAttribute('y1', POS[a].y);
      line.setAttribute('x2', POS[b].x); line.setAttribute('y2', POS[b].y);
      if ((a === 7 && b === 12)) line.classList.add('relay-lane');
      svg.appendChild(line);
      laneLines.push({ line, a, b });
    });

    const wrap = $('#worlds');
    for (let id = 0; id < 20; id++) {
      const btn = el('button', 'world');
      btn.type = 'button';
      btn.style.left = POS[id].x + '%';
      btn.style.top = POS[id].y + '%';
      btn.dataset.id = id;

      const pw = el('span', 'planet-wrap');
      pw.appendChild(el('span', 'halo'));
      pw.appendChild(el('span', 'viable-ring'));
      pw.appendChild(el('span', 'planet'));
      const rr = el('span', 'relay-ring'); rr.setAttribute('aria-hidden', 'true');
      pw.appendChild(rr);
      const hg = el('span', 'home-gem'); hg.setAttribute('aria-hidden', 'true');
      pw.appendChild(hg);
      btn.appendChild(pw);

      const ret = el('span', 'reticle');
      for (let k = 0; k < 4; k++) ret.appendChild(el('i'));
      btn.appendChild(ret);

      btn.appendChild(el('span', 'w-num', String(id + 1).padStart(2, '0')));
      btn.appendChild(el('span', 'w-name'));
      btn.appendChild(el('span', 'w-sub'));
      btn.appendChild(el('span', 'shield-chip'));

      btn.addEventListener('click', () => selectWorld(id));
      wrap.appendChild(btn);
      worldBtns.push(btn);
    }

    const legend = $('#maplegend');
    legend.innerHTML =
      '<span class="lg"><span class="dot dH"></span>Your empire</span>' +
      '<span class="lg"><span class="dot dA"></span>Rival empire</span>' +
      '<span class="lg"><span class="dot dN"></span>Neutral</span>' +
      '<span class="lg"><span class="dot dR"></span>Relay</span>';
  }

  function selectWorld(id) {
    selected = id;
    // keep the staged order type & attribute; legality is recalculated in update()
    update();
  }

  /* ---------- order helpers ---------- */
  function legalityFor(type, id, attr) {
    if (type === 'expand') return VE.canExpand(state, 'H', id);
    if (type === 'attack') return VE.canAttack(state, 'H', id);
    return VE.canDevelop(state, 'H', id, attr || 'E');
  }
  function legalTargets(type, attr) {
    const ids = [];
    for (let id = 0; id < 20; id++) if (legalityFor(type, id, attr).ok) ids.push(id);
    return ids;
  }
  function commitOrder() {
    if (!staged || selected === null) return;
    const chk = legalityFor(staged.type, selected, staged.attr);
    if (!chk.ok) return;
    const done = VE.humanCommit(state, { type: staged.type, world: selected, attr: staged.attr });
    if (done) {
      staged = null;
      afterAction();
    }
  }
  function passTurn() {
    if (VE.humanPass(state)) {
      staged = null;
      afterAction();
    }
  }
  function afterAction() {
    update();
    if (state.over) showResult();
  }

  /* ---------- rendering ---------- */
  function update() {
    renderTopbar();
    renderMapState();
    renderEmpires();
    renderEvents();
    renderInspector();
    renderComposer();
    renderLog();
  }

  function renderTopbar() {
    const tb = $('#turnbox');
    tb.innerHTML = '';
    tb.appendChild(el('span', 'turn-no', 'Turn ' + state.turn + ' / 20'));
    const chip = el('span', 'init-chip ' + (state.first === 'H' ? 'you' : 'rival'),
      state.first === 'H' ? 'You move first' : 'Rival moved first');
    tb.appendChild(chip);
    $('#seedlabel').textContent = 'SEED ' + state.seed;

    const banner = $('#phasebanner');
    banner.innerHTML = '';
    if (state.over) banner.appendChild(document.createTextNode('The galaxy has collapsed'));
    else {
      banner.appendChild(el('b', null, 'Your order'));
      banner.appendChild(document.createTextNode(state.turn % 2 === 1 ? ' — you hold initiative' : ' — the rival has moved'));
    }
  }

  function renderMapState() {
    const viable = staged ? new Set(legalTargets(staged.type, staged.attr)) : new Set();
    for (let id = 0; id < 20; id++) {
      const w = state.worlds[id];
      const btn = worldBtns[id];
      const ownCls = w.owner === 'H' ? 'own-H' : w.owner === 'A' ? 'own-A' : 'own-none';
      btn.className = 'world p-' + w.profile + ' ' + ownCls +
        (selected === id ? ' selected' : '') +
        (viable.has(id) ? ' viable' : '') +
        (VE.isProtected(state, w) ? ' protected' : '');
      btn.querySelector('.relay-ring').style.display = w.relay ? '' : 'none';
      btn.querySelector('.home-gem').style.display = w.home ? '' : 'none';
      btn.querySelector('.w-name').textContent = w.name;
      btn.querySelector('.w-sub').textContent = 'E' + w.E + ' · I' + w.I + ' · D' + w.D;
      const sh = btn.querySelector('.shield-chip');
      if (VE.isProtected(state, w)) sh.textContent = '⛨ protected · T' + (w.capturedTurn + 1);
      const ownerWord = w.owner === 'H' ? 'yours' : w.owner === 'A' ? 'rival' : 'neutral';
      btn.setAttribute('aria-label',
        'World ' + w.num + ' ' + w.name + ', ' + w.profile + ', ' + ownerWord +
        ', Economy ' + w.E + ', Industry ' + w.I + ', Defense ' + w.D +
        (w.relay ? ', ancient relay' : '') + (w.home ? ', homeworld' : '') +
        (VE.isProtected(state, w) ? ', capture-protected through turn ' + (w.capturedTurn + 1) : ''));
    }
    for (const { line, a, b } of laneLines) {
      const hot = selected !== null && (a === selected || b === selected);
      line.classList.toggle('hot', hot);
    }
  }

  function empirePanel(side, cls, name) {
    const e = state.empires[side];
    const inc = VE.income(state, side);
    const score = VE.getScore(state, side);
    const box = el('div', 'emp ' + cls);
    const head = el('div', 'emp-head');
    head.appendChild(el('span', 'emp-name', name));
    head.appendChild(el('span', 'emp-worlds', score.worlds + (score.worlds === 1 ? ' world' : ' worlds')));
    box.appendChild(head);
    const stats = el('div', 'emp-stats');
    const mk = (v, k, small) => {
      const s = el('div', 'stat');
      const vv = el('div', 'v', String(v));
      if (small) { const sm = el('small', null, small); vv.appendChild(sm); }
      s.appendChild(vv); s.appendChild(el('div', 'k', k));
      return s;
    };
    stats.appendChild(mk(e.credits, 'Credits', ' +' + inc.credits));
    stats.appendChild(mk(e.military, 'Military', ' +' + inc.military));
    stats.appendChild(mk(score.planetValue, 'Planet value'));
    stats.appendChild(mk(e.prestige, 'Relay prestige'));
    box.appendChild(stats);
    const sc = el('div', 'emp-score');
    const left = el('span', null, 'Projected prestige');
    const right = el('b', null, String(score.total));
    sc.appendChild(left); sc.appendChild(right);
    box.appendChild(sc);
    return box;
  }
  function renderEmpires() {
    const box = $('#empires');
    box.innerHTML = '';
    box.appendChild(empirePanel('H', 'you', 'Aurelian Compact — You'));
    box.appendChild(empirePanel('A', 'rival', 'Kharon Dominion — Rival'));
  }

  function renderEvents() {
    const box = $('#events');
    box.innerHTML = '';
    box.appendChild(el('h3', 'panel-title', 'Celestial calendar'));
    for (const item of VE.forecast(state)) {
      const row = el('div', 'ev ' + item.kind);
      row.appendChild(el('span', 'tag', item.kind === 'active' ? 'ACTIVE' : 'FORECAST'));
      row.appendChild(el('span', null, item.text));
      box.appendChild(row);
    }
  }

  function pips(v) {
    const p = el('span', 'pips');
    for (let i = 1; i <= 5; i++) p.appendChild(el('i', i <= v ? 'on' : ''));
    return p;
  }
  function renderInspector() {
    const box = $('#inspector');
    box.innerHTML = '';
    box.appendChild(el('h3', 'panel-title', 'World inspector'));
    if (selected === null) {
      box.appendChild(el('p', 'ins-empty', 'Select any world on the chart to inspect it.'));
      return;
    }
    const w = state.worlds[selected];
    const head = el('div', 'ins-head');
    head.appendChild(el('h4', null, w.name));
    head.appendChild(el('span', 'ins-num', 'World ' + w.num));
    box.appendChild(head);

    const chips = el('div', 'chips');
    const ownerChip = w.owner === 'H' ? ['own-H', 'Your empire'] : w.owner === 'A' ? ['own-A', 'Rival empire'] : ['', 'Neutral'];
    chips.appendChild(el('span', 'chip ' + ownerChip[0], ownerChip[1]));
    chips.appendChild(el('span', 'chip', w.profile));
    if (w.relay) chips.appendChild(el('span', 'chip relay', '✦ Ancient relay'));
    if (w.home) chips.appendChild(el('span', 'chip home', '◆ Homeworld'));
    if (VE.isProtected(state, w)) chips.appendChild(el('span', 'chip prot', '⛨ Protected'));
    box.appendChild(chips);

    const rows = el('div', 'attr-rows');
    const mkRow = (cls, k, v) => {
      const r = el('div', 'attr-row ' + cls);
      r.appendChild(el('span', 'k', k));
      r.appendChild(pips(v));
      r.appendChild(el('span', 'v', String(v)));
      return r;
    };
    rows.appendChild(mkRow('e', 'Economy', w.E));
    rows.appendChild(mkRow('i', 'Industry', w.I));
    rows.appendChild(mkRow('d', 'Defense', w.D));
    box.appendChild(rows);

    const prod = el('div', 'ins-prod',
      'Yields its owner +' + (2 * w.E) + ' Credits and +' + w.I + ' Military per turn' +
      (w.relay ? ' · banks 2 prestige per turn once awakened' : '') +
      ' · attack cost: 8 Cr + ' + VE.attackMilitaryCost(state, w) + ' Mil');
    box.appendChild(prod);

    if (w.capturedTurn > 0) {
      const note = el('div', 'ins-prot-note',
        VE.isProtected(state, w)
          ? '⛨ Capture-protected through turn ' + (w.capturedTurn + 1) + ' — first attackable on turn ' + VE.firstAttackableTurn(w) + '.'
          : 'Captured on turn ' + w.capturedTurn + ' — attackable since turn ' + VE.firstAttackableTurn(w) + '.');
      box.appendChild(note);
    }
  }

  function priceText(type) {
    if (type === 'expand') return VE.expandCost(state, 'H') + ' Cr';
    if (type === 'develop') return '8 Cr';
    if (selected !== null) {
      const w = state.worlds[selected];
      return '8 Cr + ' + VE.attackMilitaryCost(state, w) + ' Mil';
    }
    return '8 Cr + Mil';
  }
  function effectText(type) {
    const w = state.worlds[selected];
    if (type === 'expand') {
      return 'Claim ' + w.name + ' ' + w.num + ' (' + w.profile + ', E' + w.E + ' I' + w.I + ' D' + w.D + '). It produces from next turn.';
    }
    if (type === 'develop') {
      const attrName = staged.attr === 'E' ? 'Economy' : staged.attr === 'I' ? 'Industry' : 'Defense';
      const cur = w[staged.attr];
      const gain = staged.attr === 'E' ? ' (+2 Credits every future turn)' : staged.attr === 'I' ? ' (+1 Military every future turn)' : ' (attack cost +6 Military)';
      return 'Raise ' + w.name + ' ' + w.num + ' ' + attrName + ' ' + cur + ' → ' + (cur + 1) + '.' + gain;
    }
    const mil = VE.attackMilitaryCost(state, w);
    return 'Conquer ' + w.name + ' ' + w.num + ' with all attributes intact. Protected from recapture through turn ' + (state.turn + 1) + '. Costs 8 Cr + ' + mil + ' Mil now.';
  }
  function renderComposer() {
    const box = $('#composer');
    box.innerHTML = '';
    box.appendChild(el('h3', 'panel-title', 'Order composer'));

    const grid = el('div', 'order-grid');
    const defs = [
      { type: 'expand', ic: '⌖', nm: 'Expand' },
      { type: 'develop', ic: '⬆', nm: 'Develop' },
      { type: 'attack', ic: '⚔', nm: 'Attack' },
    ];
    for (const d of defs) {
      const b = el('button', 'order-btn' + (staged && staged.type === d.type ? ' armed' : ''));
      b.type = 'button';
      b.appendChild(el('span', 'ic', d.ic));
      b.appendChild(el('span', 'nm', d.nm));
      b.appendChild(el('span', 'pr', priceText(d.type)));
      b.setAttribute('aria-pressed', staged && staged.type === d.type ? 'true' : 'false');
      b.addEventListener('click', () => {
        if (staged && staged.type === d.type) staged = null;
        else staged = { type: d.type, attr: staged ? staged.attr : 'E' };
        update();
      });
      grid.appendChild(b);
    }
    box.appendChild(grid);

    if (staged && staged.type === 'develop') {
      const picker = el('div', 'attr-picker');
      for (const a of ['E', 'I', 'D']) {
        const b = el('button', 'attr-btn' + (staged.attr === a ? ' armed' : ''),
          a === 'E' ? 'Economy' : a === 'I' ? 'Industry' : 'Defense');
        b.type = 'button';
        b.addEventListener('click', () => { staged.attr = a; update(); });
        picker.appendChild(b);
      }
      box.appendChild(picker);
    }

    const preview = el('div', 'preview');
    if (!staged) {
      preview.appendChild(el('span', 'hint',
        selected === null
          ? 'Select a world, then arm an order. Selecting alone spends nothing.'
          : 'Arm Expand, Develop, or Attack to preview its exact price and effect.'));
    } else if (selected === null) {
      preview.appendChild(el('span', 'hint', 'Now select a target world for the ' + staged.type + ' order.'));
    } else {
      const chk = legalityFor(staged.type, selected, staged.attr);
      if (chk.ok) {
        preview.appendChild(el('div', 'eff', effectText(staged.type)));
        preview.appendChild(el('div', 'cost-line', 'Price: ' + priceText(staged.type) + ' — affordable.'));
      } else {
        preview.appendChild(el('div', 'why', 'Unavailable: ' + chk.reason));
      }
    }
    box.appendChild(preview);

    const actions = el('div', 'actions');
    const commit = el('button', 'cta', 'Commit order');
    commit.type = 'button';
    const canCommit = !!staged && selected !== null && legalityFor(staged.type, selected, staged.attr).ok && !state.over;
    commit.disabled = !canCommit;
    commit.addEventListener('click', commitOrder);
    const pass = el('button', 'ghost-btn', 'Pass');
    pass.type = 'button';
    pass.disabled = state.over;
    pass.addEventListener('click', passTurn);
    actions.appendChild(commit);
    actions.appendChild(pass);
    box.appendChild(actions);
  }

  function renderLog() {
    const list = $('#log');
    list.innerHTML = '';
    const entries = state.log.slice(-14).reverse();
    for (const entry of entries) {
      const isTurn = entry.text.startsWith('— Turn');
      const li = el('li', (entry.side ? 'side-' + entry.side : '') + (isTurn ? ' turn-mark' : ''));
      if (!isTurn) li.appendChild(el('span', 't', 'T' + entry.turn));
      li.appendChild(document.createTextNode(entry.text));
      list.appendChild(li);
    }
    list.scrollTop = 0;
  }

  /* ---------- result ---------- */
  function showResult() {
    const card = $('#resultcard');
    card.innerHTML = '';
    const s = state.scores;
    let verdict, cls, flavor;
    if (state.draw) {
      verdict = 'A Perfect Balance'; cls = 'draw';
      flavor = 'Two empires, one silence. The stars cannot tell them apart.';
    } else if (state.winner === 'H') {
      verdict = 'Victory — The Compact Endures'; cls = 'win';
      flavor = state.scores.A.worlds === 0
        ? 'The Kharon Dominion is erased from the chart. The void remembers your name.'
        : 'When the galaxy collapsed, your prestige outshone the rival sun.';
    } else {
      verdict = 'Defeat — The Dominion Prevails'; cls = 'lose';
      flavor = state.scores.H.worlds === 0
        ? 'Your last world falls dark. The void keeps no grave.'
        : 'When the galaxy collapsed, the rival\u2019s prestige burned brighter.';
    }
    card.appendChild(el('div', 'modal-glyph', '✦'));
    const v = el('div', 'result-verdict ' + cls, verdict);
    v.id = 'result-title';
    card.appendChild(v);
    card.appendChild(el('p', 'result-flavor', flavor));

    const table = el('table', 'score-table');
    table.innerHTML =
      '<tr><th></th><th class="colH">You</th><th class="colA">Rival</th></tr>' +
      '<tr><td>Worlds held</td><td class="colH">' + s.H.worlds + '</td><td class="colA">' + s.A.worlds + '</td></tr>' +
      '<tr><td>Planet value</td><td class="colH">' + s.H.planetValue + '</td><td class="colA">' + s.A.planetValue + '</td></tr>' +
      '<tr><td>Relay prestige</td><td class="colH">' + s.H.relay + '</td><td class="colA">' + s.A.relay + '</td></tr>' +
      '<tr class="total"><td>Total prestige</td><td class="colH">' + s.H.total + '</td><td class="colA">' + s.A.total + '</td></tr>';
    card.appendChild(table);

    const btns = el('div', 'result-btns');
    const fresh = el('button', 'cta', 'New Galaxy');
    fresh.type = 'button';
    fresh.addEventListener('click', () => newMatch());
    const replay = el('button', 'ghost-btn', 'Replay Seed ' + state.seed);
    replay.type = 'button';
    const seed = state.seed;
    replay.addEventListener('click', () => newMatch(seed));
    btns.appendChild(fresh);
    btns.appendChild(replay);
    card.appendChild(btns);

    $('#result').classList.remove('hidden');
    fresh.focus();
  }

  /* ---------- keyboard shortcuts ---------- */
  document.addEventListener('keydown', ev => {
    const inField = ev.target instanceof Element && ev.target.matches('input, textarea');
    if (inField || !$('#result').classList.contains('hidden') || !$('#intro').classList.contains('hidden')) return;
    if (state && !state.over) {
      if (ev.key === '1') { staged = { type: 'expand', attr: staged ? staged.attr : 'E' }; update(); }
      else if (ev.key === '2') { staged = { type: 'develop', attr: staged ? staged.attr : 'E' }; update(); }
      else if (ev.key === '3') { staged = { type: 'attack', attr: staged ? staged.attr : 'E' }; update(); }
      else if (ev.key === 'Enter') { commitOrder(); }
      else if (ev.key.toLowerCase() === 'p') { passTurn(); }
      else if (ev.key === 'Escape') { staged = null; selected = null; update(); }
    }
  });

  /* ---------- boot ---------- */
  initStars();
  buildMap();
  newMatch();
  if (/[?&]play\b/.test(location.search)) $('#intro').classList.add('hidden');
  $('#beginbtn').addEventListener('click', () => {
    $('#intro').classList.add('hidden');
    if (worldBtns[5]) worldBtns[5].focus();
  });
  $('#helpbtn').addEventListener('click', () => $('#intro').classList.remove('hidden'));
})();
