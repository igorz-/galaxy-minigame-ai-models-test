/* Void Empires — Blitz: UI controller and turn flow. */
(function () {
  'use strict';

  const G = window.Game;
  const C = G.CONFIG;
  const $ = (id) => document.getElementById(id);

  const AI_DELAY = 700;     // pause so the rival's move is visible
  const TURN_DELAY = 550;   // pause between turns

  let state = null;
  let timers = [];
  let firstLoad = true;

  const ATTR_NAMES = { e: 'Economy', i: 'Industry', d: 'Defense' };
  const ATTR_SHORT = { e: 'Eco', i: 'Ind', d: 'Def' };

  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function later(fn, ms) { const t = setTimeout(fn, ms); timers.push(t); return t; }

  function randomSeed() {
    const a = new Uint32Array(1);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return a[0] >>> 0;
  }

  /* ================= match flow ================= */

  function startMatch(seed, showIntro) {
    clearTimers();
    state = G.createMatch(seed);
    $('result').classList.add('hidden');
    $('intro').classList.toggle('hidden', !showIntro);
    render();
    if (!showIntro) beginTurn();
  }

  function beginTurn() {
    state.turn += 1;
    state.staged = null;
    state.acted = { human: false, ai: false };

    const inc = G.payIncome(state);
    const t = state.turn;
    const mNote = t === C.SUPPRESS_MIL_TURN ? ' · supernova: 0⚔' : '';
    addLog('income', 'Turn ' + t + ' — income: ' +
      G.EMPIRES.human.name + ' +' + inc.human.credits + '¢ +' + inc.human.military + '⚔ · ' +
      G.EMPIRES.ai.name + ' +' + inc.ai.credits + '¢ +' + inc.ai.military + '⚔' + mNote);

    state.firstActor = (t % 2 === 1) ? 'human' : 'ai';

    if (state.firstActor === 'ai') {
      state.phase = 'locked';
      render();
      later(runAI, AI_DELAY);
    } else {
      state.phase = 'human';
      render();
    }
  }

  function runAI() {
    if (state.ended) return;
    const action = G.chooseAIAction(state);
    G.applyOrder(state, 'ai', action);
    syncNewLogs();
    checkEnd();
    if (state.ended) { render(); later(showResult, 750); return; }

    if (state.firstActor === 'ai') {
      // AI moved first this turn → human phase opens
      state.phase = 'human';
      render();
    } else {
      // AI moved second → close the shared turn
      finishTurn();
    }
  }

  function humanAction(order) {
    if (state.phase !== 'human' || state.ended) return;
    const res = G.applyOrder(state, 'human', order);
    if (!res.ok) return;   // illegal order spends nothing and keeps the phase
    state.staged = null;
    syncNewLogs();
    state.phase = 'locked';
    checkEnd();
    if (state.ended) { render(); later(showResult, 750); return; }
    render();
    if (state.firstActor === 'human') later(runAI, AI_DELAY);
    else finishTurn();
  }

  function finishTurn() {
    if (state.ended) return;
    const before = state.log.length;
    G.endOfTurn(state);
    if (state.log.length !== before) syncNewLogs();

    if (state.turn >= C.MAX_TURN) {
      G.finalizeScore(state);
      state.phase = 'over';
      render();
      later(showResult, 800);
      return;
    }
    later(beginTurn, TURN_DELAY);
  }

  function checkEnd() {
    if (!state.ended && G.checkElimination(state)) state.phase = 'over';
  }

  /* log helpers -------------------------------------------------- */
  let renderedLogCount = 0;
  function addLog(kind, text) {
    state.log.unshift({ turn: state.turn, kind: kind, text: text, fresh: true });
    renderedLogCount = 0; // force full re-render next time
  }
  function syncNewLogs() {
    // G.applyOrder unshifts entries; mark dirty and animate the newest line
    if (state.log[0]) state.log[0].fresh = true;
    renderedLogCount = 0;
  }

  function renderLog() {
    const el = $('log');
    if (renderedLogCount === state.log.length) return;
    el.innerHTML = '';
    state.log.slice(0, 40).forEach((entry, idx) => {
      const li = document.createElement('li');
      li.className = entry.kind + (idx === 0 && entry.fresh ? ' new' : '');
      li.textContent = entry.text;
      entry.fresh = false;
      el.appendChild(li);
    });
    renderedLogCount = state.log.length;
  }

  /* ================= rendering ================= */

  function render() {
    if (!state) return;
    renderTopbar();
    renderEventbar();
    renderEmpire('human');
    renderEmpire('ai');
    renderGrid();
    renderLanes();
    renderInspector();
    renderComposer();
    renderCommitRow();
    renderLog();
  }

  function renderTopbar() {
    $('turn-num').textContent = 'Turn ' + Math.max(state.turn, 1) + '/' + C.MAX_TURN;
    $('seed-chip').textContent = 'Seed ' + state.seed;
    const pill = $('phase-pill');
    const init = $('initiative');
    pill.classList.remove('waiting', 'locked');

    if (state.ended) {
      pill.textContent = 'Match over';
      pill.classList.add('locked');
      init.textContent = '';
    } else if (state.phase === 'human') {
      pill.textContent = 'Your order';
      init.textContent = state.firstActor === 'human' ? 'You have initiative' : 'Rival already moved';
    } else if (state.phase === 'locked') {
      pill.textContent = state.firstActor === 'ai' ? 'Rival is moving…' : 'Resolving…';
      pill.classList.add('waiting');
      init.textContent = state.firstActor === 'ai' ? 'Rival has initiative' : 'Rival responds next';
    } else if (state.phase === 'intro') {
      pill.textContent = 'Standing by';
      pill.classList.add('locked');
      init.textContent = '';
    }

    // dim the map while the rival acts
    $('map-frame').classList.toggle('ai-turn', state.phase === 'locked' && state.firstActor === 'ai');

    ['human', 'ai'].forEach(k => {
      const b = $(k + '-badge');
      const active = !state.ended &&
        ((state.phase === 'human' && k === 'human') || (state.phase === 'locked' && k === 'ai'));
      b.classList.toggle('turn-active', active);
      b.textContent = active ? 'ACTING' : 'STANDBY';
    });
  }

  function renderEventbar() {
    const active = G.eventTimeline(state).find(i => i.status === 'now');
    const forecast = G.forecastEvent(state);
    const now = $('event-now');
    const foreTag = '<span class="active-tag" style="background:#1d2b4d;color:#8fa4c9;border:1px solid #1d2b4d">Forecast</span>';
    if (active) {
      now.innerHTML = '<span class="active-tag">Active now</span> <b>' + active.title + '</b> — ' + active.effect +
        (forecast && forecast.id !== active.id ?
          '<span style="color:var(--text-faint)"> &nbsp;|&nbsp; ' + foreTag + ' <b>' + forecast.title +
          '</b> · turn ' + forecast.turn + '</span>' : '');
    } else if (forecast) {
      now.innerHTML = foreTag + ' <b>' + forecast.title + '</b> · turn ' + forecast.turn + ' — ' + forecast.effect;
    }

    const labels = { now: 'ACTIVE', warn: 'WARNING', soon: 'FORECAST', done: 'DONE' };
    $('event-track').innerHTML = G.eventTimeline(state).map(i =>
      '<li class="event-chip ' + i.status + '" title="' + i.effect + '"><span class="st">' +
      labels[i.status] + '</span>' + i.title + ' · T' + i.turn + '</li>').join('');
  }

  function renderEmpire(who) {
    const emp = state.empires[who];
    const worlds = G.countOwned(state, who);
    const creditInc = G.creditIncome(state, who);
    const milInc = G.militaryIncome(state, who, state.turn);
    const sc = G.getScore(state, who);
    const foe = who === 'human' ? 'ai' : 'human';

    $(who + '-credits').textContent = emp.credits;
    $(who + '-mil').textContent = emp.military;
    $(who + '-worlds').textContent = worlds;

    $('' + who + '-income').innerHTML =
      'Income / turn <span class="' + (milInc === 0 && state.turn === C.SUPPRESS_MIL_TURN ? 'zero' : 'plus') + '">+' +
      creditInc + '¢</span> <span class="' + (milInc === 0 ? 'zero' : 'plus') + '">+' + milInc + '⚔</span>' +
      (state.turn === C.SUPPRESS_MIL_TURN ? ' <span style="color:var(--bad)">· supernova</span>' : '');

    $('' + who + '-prestige').innerHTML =
      '<span class="pre-line-inner"><span>Banked prestige <b>' + emp.prestige + '</b></span>' +
      '<span>Relays held <b>' + G.ownedBy(state, who).filter(w => w.isRelay).length + '/2</b></span></span>';

    $('' + who + '-score').innerHTML =
      '<span>Projected total <b>' + sc.total + '</b></span><span>Planet value <b>' + sc.planetValue +
      '</b></span><span>vs rival worlds <b>' + G.countOwned(state, foe) + '</b></span>';
  }

  function buildGrid() {
    const grid = $('grid');
    grid.innerHTML = '';
    state.worlds.forEach(w => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'world';
      btn.dataset.id = w.id;
      btn.innerHTML =
        '<span class="planet">' +
        '<span class="planet-num">' + G.pad(w.id + 1) + '</span>' +
        (w.isRelay ? '<span class="relay-tag" title="Ancient relay">◆</span>' : '') +
        (w.isHome ? '<span class="home-tag">HOME</span>' : '') +
        '<span class="protect-tag hidden" title="Capture-protected">⛨</span>' +
        '</span>' +
        '<span class="name-row"><span class="world-name"></span><span class="owner-tag"></span></span>' +
        '<span class="aid-row">' +
        '<span class="aid aid-e">E<b></b></span>' +
        '<span class="aid aid-i">I<b></b></span>' +
        '<span class="aid aid-d">D<b></b></span>' +
        '</span>' +
        '<span class="owner-tag"></span>';
      btn.addEventListener('click', () => selectWorld(w.id));
      grid.appendChild(btn);
    });
  }

  function stagedTargets() {
    // which world ids are legal targets for the staged order type
    if (!state.staged || state.phase !== 'human') return null;
    const type = state.staged.type;
    const out = [];
    state.worlds.forEach(w => {
      const o = { type: type, target: w.id, attr: state.staged.attr };
      if (G.legalOrder(state, 'human', o).ok) out.push(w.id);
    });
    return new Set(out);
  }

  function renderGrid() {
    const grid = $('grid');
    if (!grid.children.length) buildGrid();
    const staged = state.staged;
    const targets = stagedTargets();
    const stagedWorld = staged ? staged.target : null;

    Array.from(grid.children).forEach(btn => {
      const id = +btn.dataset.id;
      const w = state.worlds[id];
      btn.classList.toggle('human', w.owner === 'human');
      btn.classList.toggle('ai', w.owner === 'ai');
      btn.classList.toggle('neutral', w.owner === null);
      btn.classList.toggle('is-relay', w.isRelay);
      btn.classList.toggle('selected', state.selected === id);
      btn.classList.toggle('pending', stagedWorld === id && state.selected !== id);
      const legal = targets && targets.has(id) && id !== state.selected;
      btn.classList.toggle('legal-target', !!legal);

      btn.querySelector('.world-name').textContent = w.name;
      btn.querySelector('.owner-tag').textContent =
        w.owner === 'human' ? 'YOU' : w.owner === 'ai' ? 'RIV' : 'NEU';
      btn.querySelector('.protect-tag').classList.toggle('hidden', !G.isProtected(w, state.turn));

      [['e', '.aid-e'], ['i', '.aid-i'], ['d', '.aid-d']].forEach(([k, sel]) => {
        const el = btn.querySelector(sel);
        el.querySelector('b').textContent = w[k];
        el.classList.toggle('maxed', w[k] >= 5);
      });

      const ownerTxt = w.owner === 'human' ? 'Yours' : w.owner === 'ai' ? 'Rival' : 'Neutral';
      btn.setAttribute('aria-label',
        G.label(w) + ', ' + w.name + ', ' + ownerTxt +
        (w.isRelay ? ', relay' : '') +
        (w.isHome ? ', homeworld' : '') +
        ', Economy ' + w.e + ', Industry ' + w.i + ', Defense ' + w.d +
        (G.isProtected(w, state.turn) ? ', capture-protected through turn ' + w.protectedThrough : '') +
        (legal ? ', legal target for staged order' : ''));
      btn.setAttribute('aria-pressed', state.selected === id ? 'true' : 'false');
    });
  }

  function renderLanes() {
    const svg = $('lanes');
    const grid = $('grid');
    const sr = svg.getBoundingClientRect();
    if (!sr.width || !grid.children.length) return;
    svg.setAttribute('viewBox', '0 0 ' + sr.width + ' ' + sr.height);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const centers = Array.from(grid.children).map(btn => {
      const r = btn.querySelector('.planet').getBoundingClientRect();
      return { x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height / 2 };
    });

    const targets = stagedTargets();
    const sel = state.selected;
    const selNeighbors = sel != null ? new Set(G.NEIGHBORS[sel]) : new Set();

    const mk = (a, b, cls) => {
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('x1', centers[a].x); l.setAttribute('y1', centers[a].y);
      l.setAttribute('x2', centers[b].x); l.setAttribute('y2', centers[b].y);
      l.setAttribute('class', cls);
      svg.appendChild(l);
    };

    G.LINKS.forEach(([a, b]) => {
      let cls = 'base';
      const wA = state.worlds[a], wB = state.worlds[b];
      if (wA.owner === 'human' && wB.owner === 'human') cls = 'base owner-human';
      else if (wA.owner === 'ai' && wB.owner === 'ai') cls = 'base owner-ai';
      mk(a, b, cls);
    });

    // highlight lanes touching the selected world, then legal-target lanes
    if (sel != null) {
      G.NEIGHBORS[sel].forEach(n => mk(sel, n, 'hl'));
    }
    if (targets) {
      G.LINKS.forEach(([a, b]) => {
        const hit = (targets.has(a) && b === sel) || (targets.has(b) && a === sel) ||
          targets.has(a) || targets.has(b);
        if (hit) {
          const cls = 'legal';
          // redraw above: remove the base line first? simpler: add on top
          mk(a, b, cls);
        }
      });
    }
  }

  /* ---- inspector ---- */
  function renderInspector() {
    const el = $('inspector');
    const w = state.worlds[state.selected];
    if (!w) { el.innerHTML = '<p class="hintline">Select a world to inspect.</p>'; return; }

    const ownerTxt = w.owner === 'human' ? 'Azure Combine (yours)' :
      w.owner === 'ai' ? 'Ember Court (rival)' : 'Neutral';
    const tags = [];
    tags.push('<span class="tag ' + (w.owner || 'neutral') + '">' + ownerTxt + '</span>');
    if (!w.isHome && !w.isRelay) tags.push('<span class="tag">' + w.profile + '</span>');
    if (w.isRelay) tags.push('<span class="tag gold">◆ Ancient relay</span>');
    if (w.isHome) tags.push('<span class="tag">⚑ Homeworld</span>');

    const prodC = w.owner ? 2 * w.e : 0;
    const prodM = w.owner ? w.i : 0;

    let protHtml = '';
    if (G.isProtected(w, state.turn)) {
      protHtml = '<div class="protected-note">⛨ Capture-protected through turn ' + w.protectedThrough +
        ' — first attackable on turn ' + (w.protectedThrough + 1) + '.</div>';
    } else if (w.protectedThrough !== null && w.protectedThrough < state.turn) {
      protHtml = '<div class="protected-note" style="opacity:.7">Protection expired after turn ' +
        w.protectedThrough + ' — attackable again.</div>';
    }

    const pipRow = (k) => {
      let pips = '';
      for (let n = 1; n <= 5; n++) {
        pips += '<span class="pip' + (n <= w[k] ? ' on' : '') + (w.isRelay ? ' gold' : '') + '"></span>';
      }
      const val = w[k];
      return '<div class="attr-row"><span class="aname">' + ATTR_NAMES[k] +
        '</span><span class="attr-pips">' + pips + '</span><span class="attr-val">' + val +
        (val >= 5 ? ' ✓' : '') + '</span></div>';
    };

    el.innerHTML =
      '<div class="insp-head"><h2>' + w.name + '</h2><span class="insp-num">#' + G.pad(w.id + 1) +
      '</span></div>' +
      '<div class="insp-tags">' + tags.join('') + '</div>' +
      '<div class="attr-table">' + pipRow('e') + pipRow('i') + pipRow('d') + '</div>' +
      '<div class="insp-meta">' +
      '<div><span class="k">Production:</span> ' + (w.owner ? '+' + prodC + '¢ and +' + prodM + '⚔ each turn' : 'pays no income while neutral') + '</div>' +
      '<div><span class="k">Attack cost:</span> 8¢ + ' + G.attackMilitary(w, state.turn) + '⚔' +
      (G.blockadeActive(state.turn) ? ' <span style="color:var(--gold)">(includes +8 blockade)</span>' :
        ' <span class="k">normal</span>') + '</div>' +
      '<div><span class="k">Neighbors:</span> ' + G.NEIGHBORS[w.id].map(n => G.pad(n + 1)).join(', ') + '</div>' +
      '</div>' + protHtml +
      '<div class="lanes-note">Direct lanes only — there are no fleets or supply lines; adjacency is a single hop.</div>';
  }

  /* ---- composer ---- */
  function stage(type, attr) {
    if (state.phase !== 'human') return;
    // keep the same target when switching order type on the same world
    state.staged = { type: type, target: state.selected, attr: attr || (state.staged && state.staged.attr) || 'e' };
    render();
  }

  function selectWorld(id) {
    if (state.phase !== 'human' && state.phase !== 'intro') {
      // still allow inspection while waiting, but no staging
      state.selected = id;
      render();
      return;
    }
    const hadStaged = !!state.staged;
    const prevType = hadStaged ? state.staged.type : null;
    const prevAttr = hadStaged ? state.staged.attr : null;
    state.selected = id;
    if (hadStaged) {
      // retarget the staged order; legality recomputed, nothing spent
      state.staged = { type: prevType, target: id, attr: prevAttr };
    }
    render();
  }

  function reasonText(r) {
    switch (r.reason) {
      case 'owned-self': return 'Already yours — try Develop.';
      case 'owned-foe': return 'Held by the rival — use Attack (adjacent only).';
      case 'not-owned': return 'Neutral — Expand to claim it.';
      case 'not-enemy': return 'Neutral — use Expand instead of Attack.';
      case 'not-adjacent': return 'No direct lane to your empire.';
      case 'capped': return 'Already at level 5.';
      case 'protected': return 'Capture-protected through turn ' + r.protectedThrough +
        ' — attackable on turn ' + (r.protectedThrough + 1) + '.';
      case 'credits': return 'Needs ' + r.cost.credits + '¢ (you have ' + state.empires.human.credits + '¢).';
      case 'military': return 'Needs ' + r.cost.military + '⚔ (you have ' + state.empires.human.military + '⚔).';
      default: return 'Not available.';
    }
  }

  function renderComposer() {
    const el = $('composer');
    const w = state.worlds[state.selected];
    const phase = state.phase === 'human';
    el.classList.toggle('idle', !phase);

    if (!phase) {
      const msg = state.ended ? 'The match has ended.' :
        state.phase === 'intro' ? 'Standing by — start the match to issue orders.' :
        state.firstActor === 'ai' ? 'The rival is issuing its order…' : 'Resolving orders…';
      el.innerHTML = '<h3>Order composer</h3><p class="hintline">' + msg + '</p>';
      return;
    }

    const staged = state.staged;
    const exp = G.legalOrder(state, 'human', { type: 'expand', target: state.selected });
    const atk = G.legalOrder(state, 'human', { type: 'attack', target: state.selected });
    const devOk = w.owner === 'human';
    const devCost = C.DEVELOP_COST;

    const costChip = (r, fallback) => {
      if (r.cost.military > 0) return r.cost.credits + '¢ + ' + r.cost.military + '⚔';
      if (r.cost.credits > 0) return r.cost.credits + '¢';
      return fallback;
    };

    const expandBtn =
      '<button class="order-btn' + (staged && staged.type === 'expand' ? ' staged' : '') + '"' +
      (exp.ok ? '' : ' disabled') + ' data-order="expand">' +
      '<span class="order-ico">◇</span>' +
      '<span><span class="order-title">Expand</span>' +
      '<span class="order-sub' + (exp.ok ? '' : ' blocked') + '">' +
      (exp.ok ? 'Claim this neutral world for your empire' : reasonText(exp)) +
      '</span></span>' +
      '<span class="order-cost' + (exp.ok ? '' : ' dim') + '">' + (exp.ok ? costChip(exp) : costChip(exp, '8¢')) + '</span>' +
      '</button>';

    const attrBtns = ['e', 'i', 'd'].map(k => {
      const r = G.legalOrder(state, 'human', { type: 'develop', target: state.selected, attr: k });
      const stagedAttr = staged && staged.type === 'develop' && staged.attr === k;
      return '<button class="attr-btn' + (stagedAttr ? ' staged' : '') + (w[k] >= 5 ? ' capped' : '') + '"' +
        (r.ok ? '' : ' disabled') + ' data-attr="' + k + '">' +
        '<b>' + ATTR_SHORT[k] + ' ' + w[k] + '→' + Math.min(5, w[k] + 1) + '</b>' +
        '<small>' + (r.ok ? '8¢' : reasonText(r)) + '</small></button>';
    }).join('');

    const devBtn =
      '<div class="order-btn' + (staged && staged.type === 'develop' ? ' staged' : '') + '" role="group" aria-label="Develop">' +
      '<span class="order-ico">▲</span>' +
      '<span><span class="order-title">Develop</span>' +
      '<span class="order-sub' + (devOk ? '' : ' blocked') + '">' +
      (devOk ? 'Raise one attribute by 1 on this world' : reasonText({ reason: w.owner === null ? 'not-owned' : 'owned-foe', cost: { credits: 8, military: 0 } })) +
      '</span></span>' +
      '<span class="order-cost' + (devOk ? '' : ' dim') + '">' + devCost + '¢</span>' +
      '</div>' +
      (devOk ? '<div class="attr-pick">' + attrBtns + '</div>' : '');

    const atkBtn =
      '<button class="order-btn' + (staged && staged.type === 'attack' ? ' staged' : '') + '"' +
      (atk.ok ? '' : ' disabled') + ' data-order="attack">' +
      '<span class="order-ico">✦</span>' +
      '<span><span class="order-title">Attack</span>' +
      '<span class="order-sub' + (atk.ok ? '' : ' blocked') + '">' +
      (atk.ok ? 'Capture this world (attributes intact, 2-turn protection)' : reasonText(atk)) +
      '</span></span>' +
      '<span class="order-cost' + (atk.ok ? '' : ' dim') + '">' +
      (atk.cost.military > 0 ? atk.cost.credits + '¢ + ' + atk.cost.military + '⚔' : '8¢ + —') + '</span>' +
      '</button>';

    // staged preview
    let preview = '';
    if (staged) {
      const r = G.legalOrder(state, 'human', staged);
      const typeLabel = staged.type === 'develop' ? 'DEVELOP ' + ATTR_NAMES[staged.attr] :
        staged.type === 'expand' ? 'EXPAND' : 'ATTACK';
      if (r.ok && staged.type !== 'pass') {
        let effect = '';
        if (staged.type === 'expand') effect = w.name + ' joins your empire with its attributes intact.';
        if (staged.type === 'develop') effect = ATTR_NAMES[staged.attr] + ' on ' + w.name + ' rises to ' +
          Math.min(5, w[staged.attr] + 1) + '; production changes next turn.';
        if (staged.type === 'attack') effect = 'You capture ' + w.name + ' from the rival; it is protected on turns ' +
          state.turn + '–' + (state.turn + 1) + '.';
        preview = '<div class="preview ok">✓ Staged: <b>' + typeLabel + ' → ' + w.name + '</b> for ' +
          r.cost.credits + '¢' + (r.cost.military ? ' + ' + r.cost.military + '⚔' : '') + '. ' + effect + '</div>';
      } else if (!r.ok) {
        preview = '<div class="preview bad">✕ <b>' + typeLabel + ' → ' + w.name + '</b>: ' +
          reasonText(r) + ' Commit is disabled.</div>';
      }
    }

    el.innerHTML = '<h3>Order Composer</h3>' +
      '<p class="composer-target">Target: <b>' + (w ? G.pad(w.id + 1) + ' ' + w.name : '—') + '</b></p>' +
      expandBtn + devBtn + atkBtn + preview +
      '<p class="hintline">One order per turn. Selecting another world retargets the staged order without spending.</p>';

    el.querySelectorAll('[data-order]').forEach(b =>
      b.addEventListener('click', () => stage(b.dataset.order)));
    el.querySelectorAll('[data-attr]').forEach(b =>
      b.addEventListener('click', () => stage('develop', b.dataset.attr)));
  }

  function renderCommitRow() {
    const btn = $('btn-commit');
    const hint = $('commit-hint');
    const canStage = state.phase === 'human' && !state.ended;
    const stagedLegal = !!(state.staged && G.legalOrder(state, 'human', state.staged).ok);

    btn.disabled = !stagedLegal;
    $('btn-pass').disabled = !canStage;

    if (state.ended) hint.textContent = 'Match complete — see the result screen.';
    else if (state.phase !== 'human') hint.textContent = state.firstActor === 'ai' && state.phase === 'locked'
      ? 'Rival is moving…' : 'Resolving orders…';
    else if (state.staged && !stagedLegal) hint.textContent = 'Staged order is not legal on this world.';
    else if (state.staged) hint.textContent = 'Commit resolves your order immediately.';
    else hint.textContent = 'Select a world, choose an order, then commit — or pass.';
  }

  /* ================= result ================= */

  function showResult() {
    const e = state.ended;
    if (!e) return;
    const hs = G.getScore(state, 'human');
    const as = G.getScore(state, 'ai');

    const title = $('result-title');
    const sub = $('result-sub');
    title.classList.remove('win', 'lose', 'draw');

    if (e.reason === 'elimination') {
      if (e.winner === 'human') { title.textContent = 'Victory'; title.classList.add('win'); sub.textContent = 'The Ember Court has no worlds left — total elimination on turn ' + state.turn + '.'; }
      else if (e.winner === 'ai') { title.textContent = 'Defeat'; title.classList.add('lose'); sub.textContent = 'Your last world has fallen — the Azure Combine is eliminated on turn ' + state.turn + '.'; }
      else { title.textContent = 'Mutual ruin'; title.classList.add('draw'); sub.textContent = 'Both empires collapsed on turn ' + state.turn + '.'; }
      $('result-eyebrow').textContent = 'Elimination';
    } else {
      if (e.winner === 'human') { title.textContent = 'Victory'; title.classList.add('win'); sub.textContent = 'You out-score the Ember Court after 20 shared turns.'; }
      else if (e.winner === 'ai') { title.textContent = 'Defeat'; title.classList.add('lose'); sub.textContent = 'The Ember Court out-scores you after 20 shared turns.'; }
      else { title.textContent = 'Draw'; title.classList.add('draw'); sub.textContent = 'Both empires finish on identical totals.'; }
      $('result-eyebrow').textContent = 'Final scoring · turn 20';
    }

    const row = (who, s, cls) =>
      '<div class="rt-row ' + cls + '">' +
      '<span class="who">' + G.EMPIRES[who].name + (who === 'human' ? ' (you)' : '') + '</span>' +
      '<span class="rt-cell total">' + s.total + '<small>Total prestige</small></span>' +
      '<span class="rt-cell">' + s.planetValue + '<small>Planet value</small></span>' +
      '<span class="rt-cell">' + s.relayPrestige + '<small>Relay prestige</small></span>' +
      '<span class="rt-cell">' + s.worlds + '<small>Worlds</small></span>' +
      '</div>';

    $('result-table').innerHTML =
      '<div class="rt-row head"><span>Empire</span><span class="rt-cell">Total</span>' +
      '<span class="rt-cell">Planet</span><span class="rt-cell">Relay</span><span class="rt-cell">Worlds</span></div>' +
      row('human', hs, 'human') + row('ai', as, 'ai');

    $('result-fine').textContent =
      'Planet value = 3 × worlds + Σ(Economy+Industry+Defense). Banked relay prestige persists through captures. ' +
      'Seed ' + state.seed + ' — Replay Seed restarts this exact map from turn 1.';

    $('result').classList.remove('hidden');
    $('btn-newgalaxy').focus();
  }

  /* ================= wiring ================= */

  function wire() {
    $('intro-start').addEventListener('click', () => {
      $('intro').classList.add('hidden');
      if (state.phase === 'intro') {
        beginTurn();
        // move focus to the selected world for keyboard navigation
        const btn = $('grid').children[state.selected];
        if (btn) btn.focus();
      }
    });

    $('btn-commit').addEventListener('click', () => {
      if (!state.staged || state.phase !== 'human') return;
      const order = { type: state.staged.type, target: state.staged.target, attr: state.staged.attr };
      humanAction(order);
    });

    $('btn-pass').addEventListener('click', () => humanAction({ type: 'pass' }));

    $('btn-new').addEventListener('click', () => {
      if (confirm('Abandon this match and start a new galaxy?')) startMatch(randomSeed(), false);
    });
    $('btn-restart').addEventListener('click', () => {
      if (confirm('Restart this seed from turn 1?')) startMatch(state.seed, false);
    });
    $('btn-newgalaxy').addEventListener('click', () => startMatch(randomSeed(), false));
    $('btn-replayseed').addEventListener('click', () => startMatch(state.seed, false));

    window.addEventListener('resize', () => { renderLanes(); });

    // keyboard: 1/2/3 order types, Enter commit, P pass, arrows move selection
    document.addEventListener('keydown', (ev) => {
      if ($('intro').classList.contains('hidden') === false) return;
      if (!$('result').classList.contains('hidden')) return;
      if (state.phase !== 'human') return;
      const tag = (ev.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (ev.key === '1') { stage('expand'); ev.preventDefault(); }
      else if (ev.key === '2') { stage('develop', (state.staged && state.staged.attr) || 'e'); ev.preventDefault(); }
      else if (ev.key === '3') { stage('attack'); ev.preventDefault(); }
      else if (ev.key === 'p' || ev.key === 'P') { humanAction({ type: 'pass' }); ev.preventDefault(); }
      else if (ev.key === 'Enter') {
        // let a focused button handle its own Enter activation
        if (tag === 'button') return;
        if (state.staged && G.legalOrder(state, 'human', state.staged).ok) {
          humanAction({ type: state.staged.type, target: state.staged.target, attr: state.staged.attr });
          ev.preventDefault();
        }
      } else if (ev.key.indexOf('Arrow') === 0) {
        const w = state.worlds[state.selected];
        let r = w.row, c = w.col;
        if (ev.key === 'ArrowUp') r = Math.max(0, r - 1);
        if (ev.key === 'ArrowDown') r = Math.min(3, r + 1);
        if (ev.key === 'ArrowLeft') c = Math.max(0, c - 1);
        if (ev.key === 'ArrowRight') c = Math.min(4, c + 1);
        const nid = r * 5 + c;
        if (nid !== state.selected) {
          selectWorld(nid);
          const btn = $('grid').children[nid];
          if (btn) btn.focus();
          ev.preventDefault();
        }
      }
    });
  }

  /* ================= boot ================= */

  function boot() {
    wire();
    startMatch(randomSeed(), true);
    firstLoad = false;
    // lanes need layout; draw again after first paint
    requestAnimationFrame(() => renderLanes());
    document.fonts && document.fonts.ready && document.fonts.ready.then(() => renderLanes());
  }

  document.addEventListener('DOMContentLoaded', boot);

  // small introspection hook (used by automated checks and console debugging)
  window.VoidEmpires = {
    getState: () => state,
    act: (order) => humanAction(order),
    select: (id) => selectWorld(id),
    stage: (type, attr) => stage(type, attr)
  };
})();