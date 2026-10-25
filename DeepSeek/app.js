/* Void Empires: Blitz — interface controller */
(function () {
  'use strict';

  const VE = window.VoidEmpires;
  if (!VE) {
    document.body.innerHTML = '<p style="padding:40px;color:#fff">Engine failed to load.</p>';
    return;
  }

  const { HUMAN, AI, NEUTRAL, CONFIG } = VE;
  const pad2 = VE.pad2;
  const displayNumber = VE.displayNumber;

  const POS = [
    [8.5, 15], [29.5, 15], [50, 15], [70.5, 15], [91.5, 15],
    [8.5, 38], [29.5, 38], [50, 38], [70.5, 38], [91.5, 38],
    [8.5, 61], [29.5, 61], [50, 61], [70.5, 61], [91.5, 61],
    [8.5, 84], [29.5, 84], [50, 84], [70.5, 84], [91.5, 84],
  ];

  const SURFACES = {
    trade: { surf: '#2f8088', light: '#9bf2de', dark: '#051a20' },
    forge: { surf: '#a55a34', light: '#ffd29a', dark: '#28100a' },
    bastion: { surf: '#6655ac', light: '#c7bdff', dark: '#140f35' },
    humanHome: { surf: '#2f7ea5', light: '#b5efff', dark: '#051b30' },
    aiHome: { surf: '#a2434f', light: '#ffc2bc', dark: '#2a0910' },
    relay: { surf: '#9e7a32', light: '#ffe4a8', dark: '#2a1c06' },
  };

  const ORDER_LABEL = { expand: 'COLONIZE', develop: 'DEVELOP', attack: 'ASSAULT' };
  const ORDER_VERB = { expand: 'COLONIZE', develop: 'DEVELOP', attack: 'ASSAULT' };
  const ATTR_LABEL = { economy: 'Economy', industry: 'Industry', defense: 'Defense' };
  const ATTR_SHORT = { economy: 'E', industry: 'I', defense: 'D' };

  const $ = (sel) => document.querySelector(sel);

  const dom = {
    app: $('#app'),
    starfield: $('#starfield'),
    turnNumber: $('#turnNumber'),
    turnTrack: $('#turnTrack'),
    initiativeLabel: $('#initiativeLabel'),
    seedText: $('#seedText'),
    seedChip: $('#seedChip'),
    helpBtn: $('#helpBtn'),
    menuBtn: $('#menuBtn'),
    humanCard: $('#humanCard'),
    rivalCard: $('#rivalCard'),
    humanStamp: $('#humanStamp'),
    rivalStamp: $('#rivalStamp'),
    humanCredits: $('#humanCredits'),
    humanMilitary: $('#humanMilitary'),
    humanCreditIncome: $('#humanCreditIncome'),
    humanMilitaryIncome: $('#humanMilitaryIncome'),
    humanWorlds: $('#humanWorlds'),
    humanPrestige: $('#humanPrestige'),
    humanRelays: $('#humanRelays'),
    humanSplit: $('#humanSplit'),
    humanPlanetBar: $('#humanPlanetBar'),
    humanRelayBar: $('#humanRelayBar'),
    rivalCredits: $('#rivalCredits'),
    rivalMilitary: $('#rivalMilitary'),
    rivalCreditIncome: $('#rivalCreditIncome'),
    rivalMilitaryIncome: $('#rivalMilitaryIncome'),
    rivalWorlds: $('#rivalWorlds'),
    rivalPrestige: $('#rivalPrestige'),
    rivalRelays: $('#rivalRelays'),
    rivalSplit: $('#rivalSplit'),
    rivalPlanetBar: $('#rivalPlanetBar'),
    rivalRelayBar: $('#rivalRelayBar'),
    agendaList: $('#agendaList'),
    logList: $('#logList'),
    phaseDot: $('#phaseDot'),
    phaseTitle: $('#phaseTitle'),
    phaseSub: $('#phaseSub'),
    forecastPill: $('#forecastPill'),
    forecastTitle: $('#forecastTitle'),
    forecastMeta: $('#forecastMeta'),
    forecastTurn: $('#forecastTurn'),
    conditions: $('#conditions'),
    laneLayer: $('#laneLayer'),
    worldLayer: $('#worldLayer'),
    inspector: $('#inspector'),
    mobileActions: $('#mobileActions'),
    mobileKicker: $('#mobileKicker'),
    mobileSummary: $('#mobileSummary'),
    mobileCost: $('#mobileCost'),
    mobilePass: $('#mobilePass'),
    mobileCommit: $('#mobileCommit'),
    toastLayer: $('#toastLayer'),
    liveRegion: $('#liveRegion'),
    briefingOverlay: $('#briefingOverlay'),
    briefingSeed: $('#briefingSeed'),
    beginBtnLabel: $('#beginBtnLabel'),
    beginBtn: $('#beginBtn'),
    briefingFootnote: $('#briefingFootnote'),
    resultOverlay: $('#resultOverlay'),
    resultPanel: $('#resultPanel'),
    resultEyebrow: $('#resultEyebrow'),
    resultTitle: $('#resultTitle'),
    resultReason: $('#resultReason'),
    scoreGrid: $('#scoreGrid'),
    resultSeed: $('#resultSeed'),
    resultNew: $('#resultNew'),
    resultReplay: $('#resultReplay'),
    menuOverlay: $('#menuOverlay'),
    menuClose: $('#menuClose'),
    menuCancel: $('#menuCancel'),
    menuReplay: $('#menuReplay'),
    menuNew: $('#menuNew'),
  };

  const ui = {
    busy: false,
    busyTitle: '',
    busySub: '',
    busyTone: 'gold',
    flash: null,
    worldEls: [],
    timers: [],
    prevOwners: [],
    briefingMode: 'start',
    started: false,
    resultVisible: false,
  };

  let game = null;

  /* ---------------- Utilities ---------------- */

  function randomSeed() {
    if (window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      return arr[0] >>> 0;
    }
    return ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
  }

  function formatSeed(seed) {
    return (seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }

  function schedule(fn, ms) {
    const id = window.setTimeout(() => {
      ui.timers = ui.timers.filter((t) => t !== id);
      fn();
    }, ms);
    ui.timers.push(id);
    return id;
  }

  function clearScheduled() {
    for (const id of ui.timers) window.clearTimeout(id);
    ui.timers = [];
  }

  function actorLabel(player) {
    return player === HUMAN ? 'Nadir Concord' : player === AI ? 'Vulcan Ascendancy' : 'Unclaimed';
  }

  function ownerClass(player) {
    return player === HUMAN ? 'human' : player === AI ? 'rival' : 'neutral';
  }

  function surfaceFor(world) {
    if (world.kind === 'relay') return SURFACES.relay;
    if (world.kind === 'home') return world.owner === AI || world.id === CONFIG.aiHome ? SURFACES.aiHome : SURFACES.humanHome;
    return SURFACES[world.profile] || SURFACES.trade;
  }

  function heroColors(world) {
    if (world.kind === 'relay') {
      return {
        glow: 'rgba(244, 197, 106, 0.13)',
        ring: 'rgba(244, 197, 106, 0.5)',
      };
    }
    if (world.owner === HUMAN) return { glow: 'rgba(72, 230, 255, 0.11)', ring: 'rgba(72, 230, 255, 0.62)' };
    if (world.owner === AI) return { glow: 'rgba(255, 107, 120, 0.11)', ring: 'rgba(255, 107, 120, 0.6)' };
    return { glow: 'rgba(154, 178, 208, 0.08)', ring: 'rgba(154, 178, 208, 0.34)' };
  }

  function canAct() {
    return !!game && game.phase === 'human' && !ui.busy && !game.ended && !overlayOpen();
  }

  function overlayOpen() {
    return !dom.briefingOverlay.hidden || !dom.resultOverlay.hidden || !dom.menuOverlay.hidden;
  }

  function announce(text) {
    dom.liveRegion.textContent = '';
    window.setTimeout(() => {
      dom.liveRegion.textContent = text;
    }, 30);
  }

  function toast(title, text, tone) {
    const el = document.createElement('div');
    el.className = 'toast' + (tone ? ' ' + tone : '');
    const copy = document.createElement('div');
    copy.className = 'toast-copy';
    const strong = document.createElement('strong');
    strong.textContent = title;
    const span = document.createElement('span');
    span.textContent = text;
    copy.append(strong, span);
    el.append(copy);
    dom.toastLayer.append(el);
    while (dom.toastLayer.children.length > 2) dom.toastLayer.firstElementChild.remove();
    window.setTimeout(() => {
      el.classList.add('leaving');
      window.setTimeout(() => el.remove(), 320);
    }, 3800);
  }

  function flashWorld(id) {
    const nonce = (ui.flash ? ui.flash.nonce : 0) + 1;
    ui.flash = { id, nonce };
    renderWorlds();
    window.setTimeout(() => {
      if (ui.flash && ui.flash.nonce === nonce) {
        ui.flash = null;
        renderWorlds();
      }
    }, 980);
  }

  /* ---------------- World layer ---------------- */

  function applySurface(node, surface) {
    node.style.setProperty('--surf', surface.surf);
    node.style.setProperty('--surf-light', surface.light);
    node.style.setProperty('--surf-dark', surface.dark);
  }

  function buildWorldLayer() {
    dom.worldLayer.innerHTML = '';
    ui.worldEls = [];
    ui.prevOwners = game.worlds.map((w) => w.owner);

    for (const world of game.worlds) {
      const [x, y] = POS[world.id];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'world';
      button.dataset.id = String(world.id);
      button.style.setProperty('--x', x + '%');
      button.style.setProperty('--y', y + '%');
      button.innerHTML = [
        '<span class="world-aura"></span>',
        '<span class="relay-orbit"></span>',
        '<span class="selection-ring"></span>',
        '<span class="target-ring"></span>',
        '<span class="legal-halo"></span>',
        '<span class="planet-shell"><span class="planet"></span></span>',
        '<span class="owner-mark"></span>',
        '<span class="world-badges"></span>',
        '<span class="world-label"><span class="wname"></span><span class="wmeta"></span></span>',
        '<span class="target-tag">TARGET</span>',
      ].join('');
      applySurface(button.querySelector('.planet'), surfaceFor(world));
      button.addEventListener('click', () => selectWorld(world.id));
      dom.worldLayer.append(button);
      ui.worldEls.push(button);
    }
    ui.prevOwners = game.worlds.map((w) => w.owner);
    renderWorlds();
  }

  function legalTargetSet() {
    const set = new Set();
    if (!game.staged) return set;
    const type = game.staged.type;
    if (type === 'develop') {
      for (let id = 0; id < 20; id += 1) {
        const check = VE.legalOrder(game, HUMAN, 'develop', id, game.staged.attribute);
        if (check.legal) set.add(id);
      }
      return set;
    }
    for (let id = 0; id < 20; id += 1) {
      const check = VE.legalOrder(game, HUMAN, type, id, game.staged.attribute);
      if (check.legal) set.add(id);
    }
    return set;
  }

  function renderWorlds() {
    if (!game) return;
    const legal = legalTargetSet();
    const target = game.staged ? game.selected : null;

    for (const world of game.worlds) {
      const el = ui.worldEls[world.id];
      if (!el) continue;
      const owner = ownerClass(world.owner);
      const isSelected = game.selected === world.id;
      const isTarget = target === world.id;
      const isLegal = legal.has(world.id);
      const protection = VE.protectionInfo(game, world.id);
      const flash = ui.flash && ui.flash.id === world.id;

      let cls = 'world owner-' + owner + ' kind-' + world.kind;
      if (isSelected) cls += ' is-selected';
      if (isTarget) cls += ' is-target';
      if (isLegal) cls += ' is-legal';
      if (flash) cls += ' impact';
      el.className = cls;

      const ownerMark = el.querySelector('.owner-mark');
      ownerMark.textContent = world.owner === HUMAN ? '◆' : world.owner === AI ? '▲' : '○';
      ownerMark.title = world.owner === HUMAN ? 'Held by Nadir Concord' : world.owner === AI ? 'Held by Vulcan Ascendancy' : 'Unclaimed';

      const badgeWrap = el.querySelector('.world-badges');
      let badges = '';
      if (world.kind === 'relay') badges += '<span class="mini-badge relay" title="Ancient relay">◆</span>';
      if (protection && protection.protectedNow) {
        badges += '<span class="mini-badge shield" title="Capture-protected through turn ' + pad2(protection.protectedThrough) + '"><svg><use href="#i-shield"/></svg></span>';
      }
      if (badgeWrap.innerHTML !== badges) badgeWrap.innerHTML = badges;

      el.querySelector('.wname').textContent = world.name.toUpperCase();
      const meta = world.kind === 'relay'
        ? displayNumber(world.id) + ' · RELAY'
        : world.kind === 'home'
          ? displayNumber(world.id) + ' · CAPITAL'
          : displayNumber(world.id) + ' · ' + world.levels.economy + '·' + world.levels.industry + '·' + world.levels.defense;
      el.querySelector('.wmeta').textContent = meta;

      const ownership = world.owner === HUMAN ? 'held by Nadir Concord' : world.owner === AI ? 'held by Vulcan Ascendancy' : 'unclaimed';
      let aria = 'World ' + displayNumber(world.id) + ' ' + world.name + '. ' +
        (world.kind === 'relay' ? 'Ancient relay. ' : world.kind === 'home' ? 'Capital world. ' : world.profileName + ' world. ') +
        ownership + '. Economy ' + world.levels.economy + ', Industry ' + world.levels.industry + ', Defense ' + world.levels.defense + '.';
      if (protection && protection.protectedNow) {
        aria += ' Capture protected through turn ' + pad2(protection.protectedThrough) + '; attackable from turn ' + pad2(protection.firstAttackable) + '.';
      }
      if (isTarget) aria += ' Pending order target.';
      el.setAttribute('aria-label', aria);
      el.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

      const surface = surfaceFor(world);
      applySurface(el.querySelector('.planet'), surface);
    }
  }

  function renderLanes() {
    if (!game) return;
    const defs = '<defs>' +
      '<linearGradient id="laneContested" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#48e6ff"/><stop offset="1" stop-color="#ff6b78"/>' +
      '</linearGradient></defs>';

    const staged = game.staged;
    const target = staged ? game.selected : null;
    let paths = '';

    for (const [a, b] of VE.LINKS) {
      const oa = game.worlds[a].owner;
      const ob = game.worlds[b].owner;
      let cls = 'lane';
      if (oa === HUMAN && ob === HUMAN) cls += ' lane-human';
      else if (oa === AI && ob === AI) cls += ' lane-rival';
      else if ((oa === HUMAN && ob === AI) || (oa === AI && ob === HUMAN)) cls += ' lane-contested';
      else if (oa === HUMAN || ob === HUMAN) cls += ' lane-human-spur';
      else if (oa === AI || ob === AI) cls += ' lane-rival-spur';
      else cls += ' lane-neutral';

      if (staged && (staged.type === 'expand' || staged.type === 'attack')) {
        if (a === target && game.worlds[b].owner === HUMAN) cls += ' lane-target';
        if (b === target && game.worlds[a].owner === HUMAN) cls += ' lane-target';
      } else if (!staged && (a === game.selected || b === game.selected)) {
        cls += ' lane-probe';
      }

      const [x1, y1] = POS[a];
      const [x2, y2] = POS[b];
      paths += '<line class="' + cls + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" pathLength="100"/>';
      if (a === 7 || b === 7 || a === 12 || b === 12) {
        const relayCls = 'lane lane-relay' + (cls.includes('lane-target') ? ' lane-target' : '');
        paths += '<line class="' + relayCls + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" pathLength="100"/>';
      }
    }

    dom.laneLayer.innerHTML = defs + paths;
  }

  /* ---------------- Selection and orders ---------------- */

  function selectWorld(id) {
    if (!game || !Number.isInteger(id)) return;
    game.selected = id;
    renderWorlds();
    renderLanes();
    renderInspector();
    renderMobileActions();
    const world = game.worlds[id];
    announce('Selected world ' + displayNumber(id) + ', ' + world.name + ', ' + actorLabel(world.owner) + '.');
  }

  function focusSelectedWorld() {
    if (!game) return;
    const el = ui.worldEls[game.selected];
    if (el) window.setTimeout(() => el.focus({ preventScroll: true }), 60);
  }

  function focusedWorldId() {
    const active = document.activeElement;
    if (active && active.classList && active.classList.contains('world') && active.dataset.id) {
      return Number(active.dataset.id);
    }
    return null;
  }

  function syncFocusedWorld() {
    const id = focusedWorldId();
    if (id !== null && id !== game.selected) selectWorld(id);
  }

  function pickDevelopAttribute(worldId) {
    const world = game.worlds[worldId];
    if (!world || world.owner !== HUMAN) return 'economy';
    for (const attr of ['economy', 'industry', 'defense']) {
      if (world.levels[attr] < CONFIG.maxLevel) return attr;
    }
    return 'economy';
  }

  function stageOrder(type, attribute) {
    if (!canAct()) return;
    if (type === 'develop') {
      let attr = attribute;
      if (!attr) attr = (game.staged && game.staged.type === 'develop') ? game.staged.attribute : pickDevelopAttribute(game.selected);
      game.staged = { type: 'develop', attribute: attr };
    } else {
      game.staged = { type };
    }
    const world = game.worlds[game.selected];
    announce(ORDER_LABEL[type] + ' staged for ' + world.name + '.');
    renderWorlds();
    renderLanes();
    renderInspector();
    renderMobileActions();
  }

  function clearStage() {
    if (!game.staged) return;
    game.staged = null;
    renderWorlds();
    renderLanes();
    renderInspector();
    renderMobileActions();
    announce('Staged order cleared.');
  }

  function handleCommit() {
    if (!canAct() || !game.staged) return;
    const order = { ...game.staged, targetId: game.selected, player: HUMAN };
    const check = VE.legalOrder(game, HUMAN, order.type, order.targetId, order.attribute);
    if (!check.legal) {
      toast('ORDER BLOCKED', check.reason, 'warn');
      renderInspector();
      return;
    }

    const result = VE.resolveOrder(game, HUMAN, order);
    if (!result.ok) {
      toast('ORDER BLOCKED', result.reason || 'The order could not resolve.', 'warn');
      renderAll();
      return;
    }

    game.staged = null;
    ui.busy = true;
    const spent = check.cost;
    setBusy('ORDER RESOLVING', describeOrder(HUMAN, order, spent), 'human');
    renderAll();
    flashWorld(order.targetId);
    toast('ORDER COMMITTED', describeOrder(HUMAN, order, spent), 'gold');
    announce(describeOrder(HUMAN, order, spent));
    schedule(afterHumanAction, 760);
  }

  function handlePass() {
    if (!canAct()) return;
    VE.recordPass(game, HUMAN);
    game.staged = null;
    ui.busy = true;
    setBusy('PASSING COMMAND', 'Your opportunity is spent. The shared turn continues.', 'gold');
    renderAll();
    toast('YOU PASS', 'No resources spent. The rival may still act this turn.', 'gold');
    announce('You passed.');
    schedule(afterHumanAction, 560);
  }

  function setBusy(title, sub, tone) {
    ui.busy = true;
    ui.busyTitle = title;
    ui.busySub = sub;
    ui.busyTone = tone || 'gold';
  }

  function clearBusy() {
    ui.busy = false;
    ui.busyTitle = '';
    ui.busySub = '';
  }

  function describeOrder(player, order, spent) {
    const target = game.worlds[order.targetId];
    const prefix = player === HUMAN ? 'You' : 'Vulcan';
    if (!target) return prefix + ' issued an order.';
    if (order.type === 'expand') {
      const credits = spent ? spent.credits : VE.expansionCost(game, player);
      return prefix + ' colonized ' + target.name + ' for ' + credits + ' C.';
    }
    if (order.type === 'develop') {
      const level = target.levels[order.attribute];
      const credits = spent ? spent.credits : 8;
      return prefix + ' developed ' + ATTR_LABEL[order.attribute] + ' on ' + target.name + ' to Lv ' + level + ' for ' + credits + ' C.';
    }
    if (order.type === 'attack') {
      const cost = spent || VE.attackCost(game, order.targetId);
      return prefix + ' captured ' + target.name + ' for ' + cost.credits + ' C and ' + cost.military + ' M.';
    }
    return prefix + ' issued an order.';
  }

  /* ---------------- Turn flow ---------------- */

  function startTurnUI() {
    if (!game || game.ended) return;
    const report = VE.beginTurn(game);
    game.staged = null;
    if (game.phase === 'ai') {
      setBusy('VULCAN COMMAND', 'The rival resolves its opening order on the public chart.', 'rival');
    } else {
      clearBusy();
    }
    renderAll();
    if (game.turn === 1) toast('CAMPAIGN BEGINS', 'Turn 01 income paid. You hold the first initiative.', 'gold');
    if (game.turn === 11) toast('MILITARY BLACKOUT', 'Both empires receive zero Military income this turn. Credit income is unaffected.', 'warn');
    announce('Turn ' + pad2(report.turn) + ' begins. ' + (game.phase === 'ai' ? 'Vulcan has initiative.' : 'You have initiative.'));
    if (game.phase === 'ai') schedule(() => runAI('opening'), 1050);
  }

  function afterHumanAction() {
    if (!game || game.ended) {
      if (game && game.ended) schedule(showResult, 700);
      return;
    }
    if (game.turn % 2 === 1) {
      game.phase = 'ai';
      setBusy('VULCAN RESPONSE', 'The rival answers your order. Both commands resolve before the turn closes.', 'rival');
      renderAll();
      schedule(() => runAI('response'), 820);
    } else {
      schedule(finishTurnUI, 520);
    }
  }

  function runAI(context) {
    if (!game || game.ended) return;
    const action = VE.chooseAIAction(game);
    if (action.order) {
      const result = VE.resolveOrder(game, AI, action.order);
      if (result.ok) {
        const target = game.worlds[action.order.targetId];
        flashWorld(action.order.targetId);
        toast('VULCAN ORDER', describeOrder(AI, action.order, result.cost) + ' ' + action.rationale, 'rival');
        announce('Vulcan ' + action.order.type + ' on ' + target.name + '.');
      } else {
        VE.recordPass(game, AI);
        toast('VULCAN PASSES', 'The rival could not resolve its order.', 'rival');
      }
    } else {
      VE.recordPass(game, AI);
      toast('VULCAN PASSES', action.rationale, 'rival');
      announce('Vulcan passed.');
    }

    game.staged = null;
    renderAll();

    if (game.ended) {
      schedule(showResult, 1000);
      return;
    }

    if (context === 'opening') {
      schedule(() => {
        game.phase = 'human';
        clearBusy();
        renderAll();
        announce('Your command phase. Select a world and stage one order.');
      }, 900);
    } else {
      setBusy('TURN RESOLUTION', 'Both commands are spent. Events and relay dividends are resolving.', 'gold');
      renderAll();
      schedule(finishTurnUI, 880);
    }
  }

  function finishTurnUI() {
    if (!game || game.ended) {
      if (game && game.ended) showResult();
      return;
    }
    game.phase = 'between';
    setBusy('TURN RESOLUTION', 'Events and relay dividends are resolving.', 'gold');
    const report = VE.finishTurn(game);
    game.staged = null;
    renderAll();

    report.events.forEach((event, index) => {
      schedule(() => {
        toast(event.title, event.text, event.kind === 'warning' ? 'warn' : 'gold');
        announce(event.title + '. ' + event.text);
      }, 260 + index * 300);
    });

    if (report.result) {
      schedule(showResult, 1250 + report.events.length * 200);
      return;
    }

    const wait = 1250 + report.events.length * 260;
    schedule(() => {
      clearBusy();
      startTurnUI();
    }, wait);
  }

  /* ---------------- Rendering ---------------- */

  function renderAll() {
    if (!game) return;
    renderChrome();
    renderEmpires();
    renderAgenda();
    renderLog();
    renderWorlds();
    renderLanes();
    renderInspector();
    renderConditions();
    renderMobileActions();
  }

  function renderChrome() {
    dom.turnNumber.textContent = game.turn > 0 ? pad2(game.turn) : '--';
    dom.seedText.textContent = formatSeed(game.seed);
    dom.seedChip.title = 'Galaxy seed ' + game.seed;
    dom.seedChip.setAttribute('aria-label', 'Galaxy seed ' + formatSeed(game.seed));

    let initiative = 'AWAITING DEPLOYMENT';
    let initiativeClass = 'dim';
    if (game.ended) {
      initiative = 'CAMPAIGN COMPLETE';
      initiativeClass = 'dim';
    } else if (game.turn > 0) {
      initiative = game.initiative === HUMAN ? 'YOU ACT FIRST' : 'RIVAL ACTS FIRST';
      initiativeClass = game.initiative === HUMAN ? '' : 'rival';
    }
    dom.initiativeLabel.textContent = initiative;
    dom.initiativeLabel.className = 'initiative-label ' + initiativeClass;

    let track = '';
    for (let i = 1; i <= 20; i += 1) {
      let cls = '';
      if (game.ended || i < game.turn) cls = 'done';
      else if (i === game.turn) cls = 'current';
      track += '<i class="' + cls + '"></i>';
    }
    dom.turnTrack.innerHTML = track;

    let title = 'AWAITING DEPLOYMENT';
    let sub = 'Open the campaign briefing to begin.';
    let tone = 'dim';

    if (game.ended) {
      title = 'CAMPAIGN COMPLETE';
      sub = 'Final prestige has been tallied. The sector is decided.';
      tone = 'gold';
    } else if (ui.busy) {
      title = ui.busyTitle;
      sub = ui.busySub;
      tone = ui.busyTone || 'gold';
    } else if (game.phase === 'human') {
      title = 'YOUR COMMAND';
      sub = 'Select a world. Stage one order, then commit — or pass.';
      tone = 'human';
    } else if (game.phase === 'ai') {
      title = 'VULCAN COMMAND';
      sub = 'The rival is resolving its order on the public chart.';
      tone = 'rival';
    } else if (game.phase === 'between') {
      title = 'TURN RESOLUTION';
      sub = 'Events and relay dividends are resolving.';
      tone = 'gold';
    }

    dom.phaseTitle.textContent = title;
    dom.phaseSub.textContent = sub;
    dom.phaseDot.className = 'phase-dot ' + tone;

    const humanActive = !game.ended && !ui.busy && game.phase === 'human';
    const rivalActive = !game.ended && (ui.busy ? ui.busyTone === 'rival' : game.phase === 'ai');
    dom.humanCard.classList.toggle('active', humanActive);
    dom.rivalCard.classList.toggle('active', rivalActive);
    dom.humanStamp.textContent = humanActive ? 'YOUR TURN' : (game.ended ? 'FINAL' : 'STANDBY');
    dom.rivalStamp.textContent = rivalActive ? 'RESOLVING' : (game.ended ? 'FINAL' : 'STANDBY');

    renderForecast();
  }

  function forecastEffect(event) {
    switch (event.title) {
      case 'Relay awakening':
        return 'Both relays gain +1 E/I; first +2 prestige paid.';
      case 'Supernova warning':
      case 'Military blackout':
        return 'Turn 11 pays zero Military income; Credits still pay.';
      case 'Blockade warning':
      case 'Blockade begins':
        return 'Turns 16–19 assaults cost +8 M; lifts on turn 20.';
      case 'Sector collapse':
        return 'Final relay dividend, then planet value plus prestige.';
      default:
        return event.detail;
    }
  }

  function renderForecast() {
    if (game.ended) {
      dom.forecastTitle.textContent = 'Campaign complete';
      dom.forecastMeta.textContent = 'Final tally in the result panel';
      dom.forecastTurn.textContent = '—';
      dom.forecastPill.title = 'The campaign has ended.';
      return;
    }
    const event = VE.nextScheduledEvent(game);
    dom.forecastTitle.textContent = event.title;
    dom.forecastMeta.textContent = forecastEffect(event);
    dom.forecastTurn.textContent = 'T' + pad2(event.turn);
    dom.forecastPill.title = event.title + ' — ' + event.detail;
  }

  function renderEmpires() {
    const scoreH = VE.getScore(game, HUMAN);
    const scoreR = VE.getScore(game, AI);
    const incTurn = game.turn === 0 ? 1 : game.turn;
    const incH = VE.getIncome(game, HUMAN, incTurn);
    const incR = VE.getIncome(game, AI, incTurn);

    dom.humanCredits.textContent = game.credits[HUMAN];
    dom.rivalCredits.textContent = game.credits[AI];
    dom.humanMilitary.textContent = game.military[HUMAN];
    dom.rivalMilitary.textContent = game.military[AI];
    dom.humanCreditIncome.textContent = '+' + incH.credits;
    dom.rivalCreditIncome.textContent = '+' + incR.credits;
    dom.humanMilitaryIncome.textContent = '+' + incH.military;
    dom.rivalMilitaryIncome.textContent = '+' + incR.military;
    dom.humanWorlds.textContent = scoreH.worldCount;
    dom.rivalWorlds.textContent = scoreR.worldCount;
    dom.humanPrestige.textContent = scoreH.total;
    dom.rivalPrestige.textContent = scoreR.total;
    dom.humanRelays.textContent = CONFIG.relays.filter((id) => game.worlds[id].owner === HUMAN).length;
    dom.rivalRelays.textContent = CONFIG.relays.filter((id) => game.worlds[id].owner === AI).length;
    dom.humanSplit.textContent = 'PLANET ' + scoreH.planetValue + ' · RELAY ' + scoreH.relayPrestige;
    dom.rivalSplit.textContent = 'PLANET ' + scoreR.planetValue + ' · RELAY ' + scoreR.relayPrestige;

    const pct = (score) => score.total > 0 ? (score.planetValue / score.total) * 100 : 0;
    const relayPct = (score) => score.total > 0 ? (score.relayPrestige / score.total) * 100 : 0;
    dom.humanPlanetBar.style.width = pct(scoreH) + '%';
    dom.humanRelayBar.style.width = relayPct(scoreH) + '%';
    dom.rivalPlanetBar.style.width = pct(scoreR) + '%';
    dom.rivalRelayBar.style.width = relayPct(scoreR) + '%';

    const incomeNote = incTurn === CONFIG.militaryBlackoutTurn ? ' (military blackout)' : '';
    dom.humanCreditIncome.title = 'Current credit income' + incomeNote;
    dom.rivalCreditIncome.title = 'Current credit income' + incomeNote;
  }

  function renderAgenda() {
    const t = game.turn;
    const ended = game.ended;
    const docs = [
      {
        turn: 5,
        title: 'Relay awakening',
        detail: 'Both relays gain +1 Economy and +1 Industry, then pay their first 2 prestige to any owner.',
        status: ended || t > 5 || (t === 5 && game.relaysAwakened) ? 'done' : t === 5 ? 'imminent' : 'upcoming',
      },
      {
        turn: 11,
        title: 'Military blackout',
        detail: 'Both empires receive zero Military income on turn 11. Credits and existing reserves are unaffected.',
        status: t > 11 || ended ? 'done' : t === 11 ? 'active' : t === 10 ? 'imminent' : 'upcoming',
      },
      {
        turn: 16,
        title: 'Relay blockade',
        detail: 'Every assault costs 8 extra Military on turns 16–19. The surcharge lifts before turn-20 orders.',
        status: t > 19 || ended ? 'done' : t >= 16 ? 'active' : t === 15 ? 'imminent' : 'upcoming',
      },
      {
        turn: 20,
        title: 'Sector collapse',
        detail: 'The last relay dividend is paid, then planet value plus banked prestige decides the match.',
        status: ended ? 'done' : t === 20 ? 'imminent' : 'upcoming',
      },
    ];

    dom.agendaList.innerHTML = docs.map((doc) => {
      const statusLabel = doc.status === 'active' ? 'ACTIVE' : doc.status === 'done' ? 'DONE' : doc.status === 'imminent' ? 'NEXT' : 'PENDING';
      return '<div class="agenda-item ' + doc.status + '">' +
        '<span class="agenda-turn">T' + pad2(doc.turn) + '</span>' +
        '<div class="agenda-copy"><strong>' + doc.title + '</strong><p>' + doc.detail + '</p></div>' +
        '<span class="agenda-status">' + statusLabel + '</span>' +
        '</div>';
    }).join('');
  }

  function renderLog() {
    if (!game.log.length) {
      dom.logList.innerHTML = '<li class="log-empty">The chronicle is empty. Begin the campaign to open a record of every order and event.</li>';
      return;
    }
    const entries = game.log.slice(-40).reverse();
    dom.logList.innerHTML = entries.map((entry) => {
      let tone = 'system';
      if (entry.actor === HUMAN) tone = 'human';
      else if (entry.actor === AI) tone = 'rival';
      else if (entry.kind === 'event' || entry.kind === 'prestige') tone = 'event';
      else if (entry.kind === 'elimination') tone = 'elimination';
      const turn = entry.turn > 0 ? 'T' + pad2(entry.turn) : '—';
      return '<li class="log-entry ' + tone + '">' +
        '<span class="log-turn">' + turn + '</span>' +
        '<span class="log-dot" aria-hidden="true"></span>' +
        '<span class="log-text"></span>' +
        '</li>';
    }).join('');
    const texts = dom.logList.querySelectorAll('.log-text');
    entries.forEach((entry, i) => {
      if (texts[i]) texts[i].textContent = entry.text;
    });
  }

  function renderConditions() {
    const chips = [];
    if (!game.turn) {
      chips.push('<span class="condition"><i></i>AWAITING DEPLOYMENT</span>');
    } else if (game.ended) {
      chips.push('<span class="condition gold"><i></i>CAMPAIGN COMPLETE</span>');
    } else {
      const initiativeClass = game.initiative === HUMAN ? 'human' : 'rival';
      chips.push('<span class="condition ' + initiativeClass + '"><i></i>' + (game.initiative === HUMAN ? 'YOU HAVE INITIATIVE' : 'RIVAL HAS INITIATIVE') + '</span>');
    }

    const relayAwake = game.relaysAwakened;
    if (relayAwake) chips.push('<span class="condition gold"><i></i>RELAY GRID ONLINE</span>');
    if (game.turn === CONFIG.militaryBlackoutTurn && !game.ended) {
      chips.push('<span class="condition alert"><i></i>MILITARY BLACKOUT · +0 M INCOME</span>');
    }
    if (!game.ended && VE.blockadeActive(game.turn)) {
      chips.push('<span class="condition alert"><i></i>BLOCKADE ACTIVE · ASSAULTS +8 M</span>');
    }
    const protectedWorlds = game.worlds.filter((w) => VE.isProtected(game, w.id)).length;
    if (protectedWorlds > 0 && !game.ended) {
      chips.push('<span class="condition gold"><i></i>CAPTURE PROTECTION ×' + protectedWorlds + '</span>');
    }
    if (game.turn === 20 && !game.ended) {
      chips.push('<span class="condition gold"><i></i>FINAL TURN · COLLAPSE AFTER ORDERS</span>');
    }
    dom.conditions.innerHTML = chips.join('');
  }

  /* ---------------- Inspector ---------------- */

  function attributeRow(world, attr) {
    const value = world.levels[attr];
    const effect = attr === 'economy'
      ? '+' + (value * 2) + ' C / turn'
      : attr === 'industry'
        ? '+' + value + ' M / turn'
        : (4 + value * 6) + ' M to assault';
    let pips = '';
    for (let i = 1; i <= 5; i += 1) pips += '<i class="pip' + (i <= value ? ' on' : '') + '"></i>';
    return '<div class="attr-row ' + attr + '">' +
      '<span class="attr-badge">' + ATTR_SHORT[attr] + '</span>' +
      '<div class="attr-main"><div class="attr-title-line"><span class="attr-name">' + ATTR_LABEL[attr] + '</span><span class="attr-effect">' + effect + '</span></div>' +
      '<div class="attr-pips" aria-hidden="true">' + pips + '</div></div>' +
      '<span class="attr-level">' + value + '<sup>/5</sup></span>' +
      '</div>';
  }

  function adjacencyBlock(world) {
    const neighbors = VE.adjacentWorlds(world.id).map((id) => game.worlds[id]);
    const chips = neighbors.map((neighbor) => {
      const owner = ownerClass(neighbor.owner);
      const glyph = neighbor.owner === HUMAN ? '◆' : neighbor.owner === AI ? '▲' : '○';
      return '<button class="lane-chip ' + owner + '" type="button" data-select-world="' + neighbor.id + '" data-focus-key="lane-' + neighbor.id + '" aria-label="Select world ' + displayNumber(neighbor.id) + ', ' + neighbor.name + ', ' + actorLabel(neighbor.owner) + '">' +
        '<i aria-hidden="true">' + glyph + '</i><span>' + neighbor.name.toUpperCase() + '</span><b>' + displayNumber(neighbor.id) + '</b>' +
        '</button>';
    }).join('');
    return '<div class="adjacency-block">' +
      '<div class="section-label"><span>ADJACENT LANES</span><span class="side-note">' + neighbors.length + ' DIRECT</span></div>' +
      '<div class="lane-chips">' + chips + '</div>' +
      '</div>';
  }

  function orderReason(check, target, type, canActNow) {
    if (!canActNow) return 'Orders are locked while the rival command resolves.';
    if (type === 'develop' && target.owner !== HUMAN) return 'You must own this world to develop it.';
    if (check.legal) {
      if (type === 'expand') return 'Ready — open the lane and claim this world.';
      if (type === 'develop') return 'Ready — ' + ATTR_LABEL[check.attribute] + ' rises to Lv ' + check.toLevel + '.';
      return 'Ready — exact price affordable.';
    }
    return check.reason;
  }

  function renderInspector() {
    if (!game) return;
    const focused = document.activeElement;
    let focusKey = null;
    if (focused && dom.inspector.contains(focused) && focused.dataset) focusKey = focused.dataset.focusKey || null;

    const world = game.worlds[game.selected];
    const surface = surfaceFor(world);
    const hero = heroColors(world);
    const protection = VE.protectionInfo(game, world.id);
    const canActNow = canAct();
    const staged = game.staged;

    const expandCheck = VE.legalOrder(game, HUMAN, 'expand', world.id);
    const attackCheck = VE.legalOrder(game, HUMAN, 'attack', world.id);
    const chosenDevAttr = staged && staged.type === 'develop' ? staged.attribute : 'economy';
    const developCheck = VE.legalOrder(game, HUMAN, 'develop', world.id, chosenDevAttr);
    const devChecks = {};
    for (const attr of ['economy', 'industry', 'defense']) devChecks[attr] = VE.legalOrder(game, HUMAN, 'develop', world.id, attr);

    const ownerName = world.owner === HUMAN ? 'NADIR CONCORD' : world.owner === AI ? 'VULCAN ASCENDANCY' : 'UNCLAIMED';
    const ownerSlug = ownerClass(world.owner);
    const kindLabel = world.kind === 'relay' ? 'ANCIENT RELAY' : world.kind === 'home' ? 'CAPITAL WORLD' : world.profileName.toUpperCase() + ' WORLD';

    const tags = [];
    if (world.kind === 'relay') tags.push('<span class="tag relay"><svg><use href="#i-relay"/></svg>ANCIENT RELAY</span>');
    if (world.kind === 'home') tags.push('<span class="tag ' + (world.owner === AI ? 'rival-home' : 'home') + '">CAPITAL</span>');
    if (protection && protection.protectedNow) {
      tags.push('<span class="tag protected"><svg><use href="#i-shield"/></svg>PROTECTED THRU T' + pad2(protection.protectedThrough) + ' · HIT T' + pad2(protection.firstAttackable) + '</span>');
    }
    if (world.kind === 'relay') tags.push('<span class="tag relay">+2 PRESTIGE / TURN FROM T5</span>');
    const linkedHuman = VE.isAdjacentToPlayer(game, world.id, HUMAN);
    const linkedRival = VE.isAdjacentToPlayer(game, world.id, AI);
    if (world.owner !== HUMAN && linkedHuman) tags.push('<span class="tag linked">LANE TO YOUR TERRITORY</span>');
    else if (world.owner !== AI && linkedRival) tags.push('<span class="tag rival-home">LANE TO RIVAL</span>');
    else if (!linkedHuman && !linkedRival) tags.push('<span class="tag severed">NO FRIENDLY LANE</span>');

    const creditYield = world.levels.economy * 2;
    const militaryYield = world.levels.industry;
    const planetValue = 3 + world.levels.economy + world.levels.industry + world.levels.defense;

    const attackCost = attackCheck.cost;
    const blockadeNote = VE.blockadeActive(game.turn) ? '+8 M blockade' : '';
    const expandCost = expandCheck.cost.credits;

    const stagedCheck = staged
      ? VE.legalOrder(game, HUMAN, staged.type, world.id, staged.attribute)
      : null;

    function cardMarkup(type, icon, title, sub, priceHtml, reason, check) {
      const isStaged = staged && staged.type === type;
      return '<div class="order-card' + (isStaged ? ' staged' : '') + '">' +
        '<button class="order-main" type="button" data-order="' + type + '" data-focus-key="order-' + type + '"' + (canActNow ? '' : ' disabled') + '>' +
        '<span class="order-icon"><svg><use href="#' + icon + '"/></svg></span>' +
        '<span class="order-name-line"><span class="order-name">' + title + '</span><span class="order-sub">' + sub + '</span></span>' +
        '<span class="order-price">' + priceHtml + '</span>' +
        '</button>' +
        '<div class="order-reason' + (check && check.legal && canActNow ? ' ok' : '') + '">' + reason + '</div>' +
        '</div>';
    }

    const expandCard = cardMarkup(
      'expand', 'i-expand', 'COLONIZE', 'Claim an adjacent neutral world',
      expandCost + ' C<small>CREDITS</small>',
      orderReason(expandCheck, world, 'expand', canActNow),
      expandCheck,
    );

    let devAttrs = '';
    if (world.owner === HUMAN) {
      devAttrs = '<div class="dev-attrs">';
      for (const attr of ['economy', 'industry', 'defense']) {
        const selected = staged && staged.type === 'develop' && staged.attribute === attr;
        const lvl = world.levels[attr];
        const disabled = !canActNow || lvl >= CONFIG.maxLevel;
        devAttrs += '<button class="dev-attr' + (selected ? ' selected' : '') + '" type="button" data-dev-attr="' + attr + '" data-focus-key="dev-' + attr + '"' +
          (disabled ? ' disabled' : '') +
          ' aria-label="Develop ' + ATTR_LABEL[attr] + ', level ' + lvl + '">' +
          '<span>' + ATTR_SHORT[attr] + ' ' + lvl + (lvl < CONFIG.maxLevel ? '›' + (lvl + 1) : ' MAX') + '</span>' +
          '<b>8 C</b>' +
          '</button>';
      }
      devAttrs += '</div>';
    }

    const developReason = orderReason(developCheck, world, 'develop', canActNow);
    const developCard = '<div class="order-card' + (staged && staged.type === 'develop' ? ' staged' : '') + '">' +
      '<button class="order-main" type="button" data-order="develop" data-focus-key="order-develop"' + (canActNow ? '' : ' disabled') + '>' +
      '<span class="order-icon"><svg><use href="#i-develop"/></svg></span>' +
      '<span class="order-name-line"><span class="order-name">DEVELOP</span><span class="order-sub">Raise one attribute by 1</span></span>' +
      '<span class="order-price">8 C<small>CREDITS</small></span>' +
      '</button>' +
      devAttrs +
      '<div class="order-reason' + (developCheck.legal && canActNow ? ' ok' : '') + '">' + developReason + '</div>' +
      '</div>';

    const attackReason = orderReason(attackCheck, world, 'attack', canActNow);
    const attackCard = cardMarkup(
      'attack', 'i-attack', 'ASSAULT', 'Capture an adjacent rival world',
      attackCost.credits + ' C<small>' + attackCost.military + ' M' + (blockadeNote ? ' · ' + blockadeNote : '') + '</small>',
      attackReason,
      attackCheck,
    );

    let stagedBox = '';
    if (staged) {
      const cost = stagedCheck.cost;
      const costText = staged.type === 'attack'
        ? cost.credits + ' C · ' + cost.military + ' M'
        : cost.credits + ' C';
      stagedBox = '<div class="staged-box">' +
        '<div class="staged-top"><span>PENDING ORDER</span><span style="display:flex;gap:6px;align-items:center;">' +
        '<span class="staged-state' + (stagedCheck.legal ? '' : ' invalid') + '">' + (stagedCheck.legal ? 'READY' : 'BLOCKED') + '</span>' +
        '<button class="clear-stage" type="button" data-action="clear" data-focus-key="clear">CLEAR</button></span></div>' +
        '<div class="staged-line"><strong>' + ORDER_LABEL[staged.type] + ' · ' + world.name.toUpperCase() + '</strong><b>' + costText + '</b></div>' +
        '<p class="staged-hint">' + (stagedCheck.legal ? 'Commit resolves immediately; nothing is spent until then.' : stagedCheck.reason) + '</p>' +
        '</div>';
    } else {
      stagedBox = '<div class="staged-box empty">' +
        '<div class="staged-top"><span>PENDING ORDER</span><span class="staged-state" style="color:var(--dim)">NONE</span></div>' +
        '<p class="empty-copy">Select an order above. Selecting another world retargets the staged order without spending anything.</p>' +
        '</div>';
    }

    const commitDisabled = !canActNow || !staged || !stagedCheck.legal;
    const passDisabled = !canActNow;
    const orderNote = canActNow ? '1 ORDER AVAILABLE' : (game.ended ? 'CAMPAIGN ENDED' : 'COMMAND LOCKED');
    const commitLabel = staged
      ? 'COMMIT · ' + (staged.type === 'attack' ? stagedCheck.cost.credits + ' C / ' + stagedCheck.cost.military + ' M' : stagedCheck.cost.credits + ' C')
      : 'COMMIT ORDER';

    dom.inspector.innerHTML = '<div class="inspector-inner">' +
      '<div class="inspector-head"><span class="kicker">WORLD INSPECTOR</span><span class="world-index">' + displayNumber(world.id) + ' / 20</span></div>' +
      '<div class="world-hero" style="--hero-glow:' + hero.glow + ';--hero-ring:' + hero.ring + ';">' +
      '<div class="hero-planet-wrap"><span class="hero-orbit"></span><span class="hero-planet" style="--surf:' + surface.surf + ';--surf-light:' + surface.light + ';--surf-dark:' + surface.dark + ';--hero-ring:' + hero.ring + ';--hero-glow:' + hero.glow + ';"></span></div>' +
      '<div class="hero-copy"><span class="owner-chip ' + ownerSlug + '"><i></i>' + ownerName + '</span>' +
      '<h2>' + world.name + '</h2><p class="hero-sub">' + kindLabel + ' · world ' + displayNumber(world.id) + ' · ' + (world.kind === 'relay' ? 'relay grid' : world.profileName + ' profile') + '</p></div>' +
      '</div>' +
      '<div class="tag-row">' + tags.join('') + '</div>' +
      '<div class="world-prod">' +
      '<div class="prod-cell"><span>CREDIT YIELD</span><b>+' + creditYield + ' C</b><small>2 × ECONOMY</small></div>' +
      '<div class="prod-cell"><span>MILITARY YIELD</span><b>+' + militaryYield + ' M</b><small>INDUSTRY</small></div>' +
      '<div class="prod-cell"><span>PLANET VALUE</span><b class="gold">' + planetValue + '</b><small>3 + E + I + D</small></div>' +
      '</div>' +
      '<div class="section-label"><span>WORLD ATTRIBUTES</span><span class="side-note">LEVELS 1–5</span></div>' +
      '<div class="attr-list">' + attributeRow(world, 'economy') + attributeRow(world, 'industry') + attributeRow(world, 'defense') + '</div>' +
      adjacencyBlock(world) +
      '<div class="order-panel">' +
      '<div class="section-label"><span>ISSUE ORDER</span><span class="side-note">' + orderNote + '</span></div>' +
      '<div class="order-cards">' + expandCard + developCard + attackCard + '</div>' +
      stagedBox +
      '<div class="action-row">' +
      '<button class="btn-pass" type="button" data-action="pass" data-focus-key="pass"' + (passDisabled ? ' disabled' : '') + '>' +
      '<svg><use href="#i-pass"/></svg><span>PASS</span><span class="key-hint"><kbd>P</kbd></span></button>' +
      '<button class="btn-commit" type="button" data-action="commit" data-focus-key="commit"' + (commitDisabled ? ' disabled' : '') + '>' +
      '<span>' + commitLabel + '</span><span class="key-hint"><kbd>↵</kbd></span><svg><use href="#i-arrow"/></svg></button>' +
      '</div>' +
      '<p class="order-footnote">Selecting another world retargets the staged order. Nothing is spent until commit.<br><span class="key-hint">KEYS&nbsp; 1–3 STAGE&nbsp; ·&nbsp; ENTER COMMIT&nbsp; ·&nbsp; P PASS</span></p>' +
      '</div>' +
      '</div>';

    if (focusKey) {
      const next = dom.inspector.querySelector('[data-focus-key="' + focusKey + '"]');
      if (next && !next.disabled) next.focus({ preventScroll: true });
      else if (dom.inspector.setAttribute) {
        dom.inspector.setAttribute('tabindex', '-1');
        dom.inspector.focus({ preventScroll: true });
      }
    }
  }

  function renderMobileActions() {
    if (!game) return;
    const visible = game.turn > 0 && !game.ended && !overlayOpen();
    dom.mobileActions.classList.toggle('visible', visible);
    document.body.classList.toggle('in-match', visible);

    if (!visible) return;
    const world = game.worlds[game.selected];
    const staged = game.staged;
    const canActNow = canAct();
    dom.mobileKicker.textContent = canActNow ? 'ORDER · ' + displayNumber(world.id) : 'COMMAND LOCKED';

    if (!staged) {
      dom.mobileSummary.textContent = world.name + ' selected';
      dom.mobileCost.textContent = 'Tap to open the world dossier';
      dom.mobileCommit.disabled = true;
      dom.mobilePass.disabled = !canActNow;
      return;
    }

    const check = VE.legalOrder(game, HUMAN, staged.type, world.id, staged.attribute);
    const costText = staged.type === 'attack'
      ? check.cost.credits + ' C · ' + check.cost.military + ' M'
      : check.cost.credits + ' C';
    dom.mobileSummary.textContent = ORDER_VERB[staged.type] + ' · ' + world.name.toUpperCase();
    dom.mobileCost.textContent = check.legal ? costText + ' · ready to commit' : costText + ' · ' + check.reason;
    dom.mobileCommit.disabled = !canActNow || !check.legal;
    dom.mobilePass.disabled = !canActNow;
  }

  /* ---------------- Overlays ---------------- */

  function showBriefing(mode) {
    ui.briefingMode = mode || 'start';
    dom.briefingSeed.textContent = formatSeed(game.seed);
    const started = game.turn > 0 || game.ended;
    dom.beginBtnLabel.textContent = started ? 'RETURN TO COMMAND' : 'INITIATE CAMPAIGN';
    dom.briefingFootnote.textContent = started
      ? 'Campaign in progress. The briefing pauses your attention, not the sector.'
      : 'You command the Nadir Concord. The Vulcan Ascendancy waits.';
    dom.briefingOverlay.hidden = false;
    renderMobileActions();
    window.setTimeout(() => dom.beginBtn.focus({ preventScroll: true }), 50);
  }

  function hideBriefing() {
    dom.briefingOverlay.hidden = true;
    renderMobileActions();
  }

  function showMenu() {
    dom.menuOverlay.hidden = false;
    renderMobileActions();
    window.setTimeout(() => dom.menuClose.focus({ preventScroll: true }), 50);
  }

  function hideMenu() {
    dom.menuOverlay.hidden = true;
    renderMobileActions();
  }

  function showResult() {
    if (!game || !game.result || ui.resultVisible) return;
    const result = game.result;
    ui.resultVisible = true;
    clearScheduled();
    dom.menuOverlay.hidden = true;
    dom.briefingOverlay.hidden = true;
    ui.busy = true;
    renderAll();

    const humanWon = result.winner === HUMAN;
    const rivalWon = result.winner === AI;
    const draw = result.winner === 'draw';
    dom.resultPanel.className = 'result-panel ' + (humanWon ? 'win' : rivalWon ? 'loss' : 'draw');

    dom.resultTitle.textContent = draw ? 'STALEMATE' : humanWon ? 'SECTOR SECURED' : 'SECTOR LOST';
    dom.resultEyebrow.textContent = result.reason === 'elimination'
      ? 'ELIMINATION · TURN ' + pad2(result.turn) + ' · CAMPAIGN COMPLETE'
      : 'FINAL TALLY · TURN 20 · CAMPAIGN COMPLETE';

    const h = result.scores[HUMAN];
    const r = result.scores[AI];
    if (result.reason === 'elimination') {
      dom.resultReason.textContent = humanWon
        ? 'The Vulcan Ascendancy has no worlds remaining. Its final holdings fell on turn ' + pad2(result.turn) + '; elimination interrupts the shared turn immediately.'
        : 'Nadir Concord has no worlds remaining. The campaign ends on turn ' + pad2(result.turn) + ' the instant its last holding is lost.';
    } else if (draw) {
      dom.resultReason.textContent = 'After twenty shared turns, both empires finish level on ' + h.total + ' total prestige. The sector remains contested.';
    } else {
      const winnerName = humanWon ? 'Nadir Concord' : 'Vulcan Ascendancy';
      const margin = Math.abs(h.total - r.total);
      dom.resultReason.textContent = 'After twenty shared turns, ' + winnerName + ' leads on total prestige, ' + Math.max(h.total, r.total) + ' to ' + Math.min(h.total, r.total) + '. The final relay dividend is included before the tally. Margin: ' + margin + ' prestige.';
    }

    function scoreCard(score, player, name, slug) {
      const won = result.winner === player;
      return '<article class="score-card ' + slug + (won ? ' winner' : '') + '">' +
        '<div class="score-card-header"><div class="score-name"><i></i><strong>' + name + '</strong></div>' +
        (won ? '<span class="score-winner-tag">' + (result.reason === 'elimination' ? 'SURVIVOR' : 'WINNER') + '</span>' : '') +
        '</div>' +
        '<div class="score-total"><b>' + score.total + '</b><span>TOTAL PRESTIGE</span></div>' +
        '<div class="score-breakdown">' +
        '<div class="score-line"><span>WORLDS HELD</span><b>' + score.worldCount + '</b></div>' +
        '<div class="score-line"><span>PLANET VALUE</span><b>' + score.planetValue + '</b></div>' +
        '<div class="score-line gold"><span>RELAY PRESTIGE</span><b>' + score.relayPrestige + '</b></div>' +
        '<div class="score-line"><span>ATTRIBUTE SUM</span><b>' + score.attributeSum + '</b></div>' +
        '</div>' +
        '<div class="score-reserves"><span>CREDITS ' + score.credits + '</span><span>MILITARY ' + score.military + '</span><span>RESERVES DO NOT SCORE</span></div>' +
        '</article>';
    }

    dom.scoreGrid.innerHTML = scoreCard(h, HUMAN, 'NADIR CONCORD', 'human') + scoreCard(r, AI, 'VULCAN ASCENDANCY', 'rival');
    dom.resultSeed.textContent = formatSeed(game.seed);
    dom.resultOverlay.hidden = false;
    renderMobileActions();
    announce((draw ? 'Stalemate. ' : humanWon ? 'Victory. ' : 'Defeat. ') + dom.resultReason.textContent);
    window.setTimeout(() => dom.resultNew.focus({ preventScroll: true }), 60);
  }

  /* ---------------- New matches ---------------- */

  function startMatch(seed) {
    clearScheduled();
    ui.busy = false;
    ui.flash = null;
    ui.resultVisible = false;
    ui.started = true;
    dom.briefingOverlay.hidden = true;
    dom.resultOverlay.hidden = true;
    dom.menuOverlay.hidden = true;
    dom.toastLayer.innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'auto' });
    game = VE.createGame(seed);
    buildWorldLayer();
    renderAll();
    startTurnUI();
    focusSelectedWorld();
  }

  function newGalaxy() {
    startMatch(randomSeed());
  }

  function replaySeed() {
    if (!game) return;
    startMatch(game.seed);
  }

  /* ---------------- Keyboard ---------------- */

  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === 'Tab' && overlayOpen()) {
      const overlay = !dom.briefingOverlay.hidden
        ? dom.briefingOverlay
        : !dom.resultOverlay.hidden
          ? dom.resultOverlay
          : dom.menuOverlay;
      const focusables = Array.from(overlay.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter((el) => el.offsetParent !== null);
      if (focusables.length) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!overlay.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      return;
    }

    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (event.key === 'Escape') {
      if (!dom.menuOverlay.hidden) {
        hideMenu();
        event.preventDefault();
        return;
      }
      if (!dom.briefingOverlay.hidden && (game.turn > 0 || game.ended)) {
        hideBriefing();
        focusSelectedWorld();
        event.preventDefault();
        return;
      }
      if (!overlayOpen() && game.staged) {
        clearStage();
        event.preventDefault();
      }
      return;
    }

    if (overlayOpen() || !canAct()) return;

    if (event.key === '1') {
      syncFocusedWorld();
      stageOrder('expand');
      event.preventDefault();
    } else if (event.key === '2') {
      syncFocusedWorld();
      stageOrder('develop');
      event.preventDefault();
    } else if (event.key === '3') {
      syncFocusedWorld();
      stageOrder('attack');
      event.preventDefault();
    } else if (event.key.toLowerCase() === 'p') {
      handlePass();
      event.preventDefault();
    } else if (event.key === 'Enter') {
      const active = document.activeElement;
      const fid = focusedWorldId();
      if (fid !== null) {
        if (fid !== game.selected) {
          selectWorld(fid);
          event.preventDefault();
          return;
        }
        if (game.staged) {
          handleCommit();
          event.preventDefault();
        }
        return;
      }
      if (active === document.body && game.staged) {
        handleCommit();
        event.preventDefault();
      }
    } else if (event.key.toLowerCase() === 'e' && game.staged && game.staged.type === 'develop') {
      stageOrder('develop', 'economy');
      event.preventDefault();
    } else if (event.key.toLowerCase() === 'i' && game.staged && game.staged.type === 'develop') {
      stageOrder('develop', 'industry');
      event.preventDefault();
    } else if (event.key.toLowerCase() === 'd' && game.staged && game.staged.type === 'develop') {
      stageOrder('develop', 'defense');
      event.preventDefault();
    }
  });

  /* ---------------- Event wiring ---------------- */

  document.addEventListener('click', (event) => {
    const orderBtn = event.target.closest('[data-order]');
    if (orderBtn && dom.inspector.contains(orderBtn)) {
      stageOrder(orderBtn.dataset.order);
      return;
    }
    const attrBtn = event.target.closest('[data-dev-attr]');
    if (attrBtn && dom.inspector.contains(attrBtn)) {
      stageOrder('develop', attrBtn.dataset.devAttr);
      return;
    }
    const laneBtn = event.target.closest('[data-select-world]');
    if (laneBtn && dom.inspector.contains(laneBtn)) {
      selectWorld(Number(laneBtn.dataset.selectWorld));
      return;
    }
    const actionBtn = event.target.closest('[data-action]');
    if (actionBtn && !actionBtn.disabled) {
      const action = actionBtn.dataset.action;
      if (action === 'commit') handleCommit();
      else if (action === 'pass') handlePass();
      else if (action === 'clear') clearStage();
      else if (action === 'open-orders') {
        dom.inspector.scrollIntoView({ behavior: 'smooth', block: 'start' });
        announce('World dossier opened.');
      }
    }
  });

  dom.helpBtn.addEventListener('click', () => {
    if (ui.busy) {
      toast('COMMAND CYCLE', 'Orders are resolving. The briefing will be available in a moment.', 'warn');
      return;
    }
    showBriefing('help');
  });

  dom.menuBtn.addEventListener('click', showMenu);
  dom.menuClose.addEventListener('click', hideMenu);
  dom.menuCancel.addEventListener('click', hideMenu);
  dom.menuReplay.addEventListener('click', replaySeed);
  dom.menuNew.addEventListener('click', newGalaxy);

  dom.beginBtn.addEventListener('click', () => {
    const wasFresh = game.turn === 0;
    hideBriefing();
    if (wasFresh) {
      startTurnUI();
    } else {
      renderAll();
      announce('Returned to command.');
    }
    focusSelectedWorld();
  });

  dom.resultNew.addEventListener('click', newGalaxy);
  dom.resultReplay.addEventListener('click', replaySeed);

  dom.menuOverlay.addEventListener('click', (event) => {
    if (event.target === dom.menuOverlay) hideMenu();
  });

  /* ---------------- Starfield ---------------- */

  function initStarfield() {
    const canvas = dom.starfield;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let stars = [];
    let meteors = [];
    let lastMeteor = performance.now() + 4000;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(320, Math.max(90, Math.floor((width * height) / 7500)));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.25 + 0.25,
        base: Math.random() * 0.45 + 0.15,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.5 + 0.15,
        tint: Math.random() > 0.86 ? 'cyan' : Math.random() > 0.92 ? 'gold' : 'white',
      }));
      if (reduce) drawStatic();
    }

    function drawStatic() {
      ctx.clearRect(0, 0, width, height);
      for (const star of stars) drawStar(star, 0);
    }

    function drawStar(star, time) {
      const twinkle = reduce ? 1 : 0.72 + Math.sin(time * 0.001 * star.speed + star.phase) * 0.28;
      const alpha = star.base * twinkle;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      if (star.tint === 'cyan') ctx.fillStyle = 'rgba(136, 236, 255, ' + alpha + ')';
      else if (star.tint === 'gold') ctx.fillStyle = 'rgba(255, 218, 156, ' + alpha + ')';
      else ctx.fillStyle = 'rgba(219, 235, 255, ' + alpha + ')';
      ctx.fill();
      if (star.r > 1.1) {
        ctx.strokeStyle = star.tint === 'cyan' ? 'rgba(136, 236, 255, ' + (alpha * 0.28) + ')' : 'rgba(219, 235, 255, ' + (alpha * 0.22) + ')';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(star.x - 2.6, star.y);
        ctx.lineTo(star.x + 2.6, star.y);
        ctx.moveTo(star.x, star.y - 2.6);
        ctx.lineTo(star.x, star.y + 2.6);
        ctx.stroke();
      }
    }

    function drawMeteors(time) {
      if (reduce) return;
      if (time - lastMeteor > 9000 && meteors.length === 0 && Math.random() > 0.7) {
        meteors.push({
          x: Math.random() * width * 0.8 + width * 0.1,
          y: Math.random() * height * 0.35,
          vx: -2.2 - Math.random() * 1.6,
          vy: 1.1 + Math.random() * 0.7,
          life: 1,
          length: 70 + Math.random() * 90,
        });
        lastMeteor = time;
      }
      for (let i = meteors.length - 1; i >= 0; i -= 1) {
        const m = meteors[i];
        m.x += m.vx;
        m.y += m.vy;
        m.life -= 0.011;
        if (m.life <= 0) {
          meteors.splice(i, 1);
          continue;
        }
        const nx = m.x - m.vx * (m.length / 2.5);
        const ny = m.y - m.vy * (m.length / 2.5);
        const grad = ctx.createLinearGradient(m.x, m.y, nx, ny);
        grad.addColorStop(0, 'rgba(190, 244, 255, ' + Math.max(0, m.life * 0.7) + ')');
        grad.addColorStop(1, 'rgba(190, 244, 255, 0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(nx, ny);
        ctx.stroke();
      }
    }

    function frame(time) {
      ctx.clearRect(0, 0, width, height);
      for (const star of stars) drawStar(star, time);
      drawMeteors(time);
      if (!reduce) requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener('resize', () => {
      resize();
      if (reduce) drawStatic();
    });
    if (!reduce) requestAnimationFrame(frame);
  }

  /* ---------------- Boot ---------------- */

  initStarfield();
  game = VE.createGame(randomSeed());
  buildWorldLayer();
  renderAll();
  showBriefing('start');
})();
