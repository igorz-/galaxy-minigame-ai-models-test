import { createGame, HUMAN, AI, LINKS, ATTRS, owned, income, score, legality, attackCost, protectedAt, commitHuman, forecast } from './engine.js';
import { makePlanet, paintStars } from './art.js';

const $ = selector => document.querySelector(selector);
const num = n => String(n + 1).padStart(2, '0');
const cap = s => s[0].toUpperCase() + s.slice(1);
const icons = {
  expand: '<circle cx="10" cy="10" r="6"/><path d="M10 1v5m0 8v5M1 10h5m8 0h5"/>',
  develop: '<path d="M3 16V9h4v7m3 0V4h4v12m3 0V1M1 19h18"/>',
  attack: '<path d="m3 2 14 14m-4-1 3-3m1 7 2 2M17 2 3 16m0-5 6 6m-7 1 3-3"/>',
  credits: '<circle cx="10" cy="10" r="7"/><path d="M13 6H9a3 3 0 0 0 0 6h4M6 9h5"/>',
  military: '<path d="m10 2 7 3v6c0 4-7 7-7 7s-7-3-7-7V5Z"/><path d="m7 10 2 2 4-4"/>',
  prestige: '<path d="m10 1 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L.2 7.4l6.1-.9Z"/>',
  economy: '<circle cx="10" cy="10" r="7"/><path d="M13 6H9a3 3 0 0 0 0 6h4M6 9h5"/>',
  industry: '<path d="M3 18V8l5 3V7l5 3V3h4v15ZM6 14v1m4-1v1m4-1v1"/>',
  defense: '<path d="m10 2 7 3v6c0 4-7 7-7 7s-7-3-7-7V5Z"/><path d="M10 6v7m-3-3h6"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.prestige}</svg>`;
let game, selected = 5, type = null, attr = 'economy', planets = [], lastAction = null;
const positions = Array.from({ length: 20 }, (_, id) => {
  const row = Math.floor(id / 5), col = id % 5;
  const shifts = [[0, -7, 8, -3, 0], [0, 6, 0, -9, 0], [0, -7, 0, 6, 0], [0, 9, -6, 5, 0]];
  return { x: 105 + col * 197.5, y: 87 + row * 128 + shifts[row][col] };
});

function begin(seed) {
  game = createGame(seed); selected = 5; type = null; attr = 'economy'; lastAction = null;
  planets = game.worlds.map(w => makePlanet(w, game.seed));
  paintStars($('#starfield'), game.seed);
  $('#worlds').innerHTML = game.worlds.map(w => {
    const p = positions[w.id];
    return `<button id="world-${w.id}" class="world" style="left:${p.x / 10}%;top:${p.y / 5.7}%" data-world="${w.id}"><span class="world-orbit"></span><span class="planet-wrap"><img class="planet" src="${planets[w.id]}" alt="" draggable="false">${w.relay ? '<span class="relay-ring"></span>' : ''}<span class="ownership-mark"></span><span class="protection-mark">⌑</span></span><span class="world-label"><small>${num(w.id)}</small> ${w.name}</span><span class="world-caption"></span></button>`;
  }).join('');
  $('#seed-label').textContent = `CHART SEED ${game.seed.toString(16).toUpperCase().padStart(8, '0')}`;
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  render();
}

function renderEmpires() {
  const empire = actor => {
    const e = game.empires[actor], inc = income(game, actor), sc = score(game, actor);
    return `<div class="empire ${actor}"><div class="empire-name"><span class="faction-symbol">${actor === HUMAN ? '✳' : '⟐'}</span><div><span class="eyebrow">${actor === HUMAN ? 'YOUR EMPIRE' : 'DETERMINISTIC RIVAL'}</span><h2>${actor === HUMAN ? 'The Sol Collective' : 'The Vesper Union'}</h2><span class="world-count">${sc.count} ${sc.count === 1 ? 'world' : 'worlds'} held</span></div></div><div class="empire-resources"><div title="Credits reserve; income is paid at the start of each shared turn">${icon('credits')}<strong>${e.credits}</strong><small>Credits <b>+${inc.credits}/t</b></small></div><div title="Military reserve; Industry generates Military">${icon('military')}<strong>${e.military}</strong><small>Military <b>+${inc.military}/t</b></small></div><div class="prestige-stat" title="${sc.planet} planet value + ${sc.relay} banked relay prestige">${icon('prestige')}<strong>${sc.total}</strong><small>Prestige <b>${sc.planet} + ${sc.relay}</b></small></div></div></div>`;
  };
  $('#empire-strip').innerHTML = `${empire(HUMAN)}<div class="turn-clock"><span class="eyebrow">SHARED TURN</span><div><strong>${String(game.turn).padStart(2, '0')}</strong><span>/ 20</span></div><span class="initiative">${game.over ? 'EXPEDITION ENDED' : game.turn % 2 ? 'YOU MOVE FIRST' : 'RIVAL MOVED FIRST'}</span><div class="turn-track">${Array.from({ length: 20 }, (_, i) => `<i class="${i < game.turn ? 'done' : ''} ${[4, 9, 14, 19].includes(i) ? 'event-tick' : ''}"></i>`).join('')}</div></div>${empire(AI)}`;
  for (const actor of [HUMAN, AI]) {
    const s = score(game, actor);
    $(`.empire.${actor} .world-count`).insertAdjacentHTML('beforeend', `<span class="score-split">Planet ${s.planet} / Relay ${s.relay}</span>`);
  }
}
function renderMap() {
  const staged = type ? { type, target: selected, attr } : null;
  for (const w of game.worlds) {
    const el = $(`#world-${w.id}`), check = type && legality(game, HUMAN, { ...staged, target: w.id });
    const prot = protectedAt(w, game.turn), isSelected = selected === w.id;
    el.className = `world ${w.owner || 'neutral'} ${w.relay ? 'relay' : ''} ${isSelected ? 'selected' : ''} ${type && isSelected ? 'pending' : ''} ${check?.ok ? 'legal-target' : ''} ${prot ? 'protected' : ''} ${lastAction === w.id ? 'just-changed' : ''}`;
    el.setAttribute('aria-pressed', String(isSelected));
    el.setAttribute('aria-label', `World ${num(w.id)}, ${w.name}. ${w.owner === HUMAN ? 'Your world' : w.owner === AI ? 'Rival world' : 'Neutral'}. ${w.relay ? 'Ancient relay. ' : ''}Economy ${w.economy}, Industry ${w.industry}, Defense ${w.defense}.${prot ? ` Protected through turn ${w.captured + 1}.` : ''}${check?.ok ? ' Legal target.' : ''}`);
    el.querySelector('.ownership-mark').textContent = w.owner === HUMAN ? '✳' : w.owner === AI ? '⟐' : '';
    el.querySelector('.world-caption').textContent = w.relay ? (game.turn > 5 || game.over ? '◇ RELAY · +2 PRESTIGE' : '◇ ANCIENT RELAY') : w.home ? (w.id === 5 ? 'COLLECTIVE ORIGIN' : 'UNION ORIGIN') : '';
    el.setAttribute('aria-description', el.getAttribute('aria-label'));
    el.removeAttribute('aria-label');
    el.querySelector('.ownership-mark').setAttribute('aria-hidden', 'true');
    el.querySelector('.protection-mark').setAttribute('aria-hidden', 'true');
  }
  $('#lanes').innerHTML = LINKS.map(([a, b]) => {
    const p = positions[a], q = positions[b], wa = game.worlds[a], wb = game.worlds[b];
    const owner = wa.owner && wa.owner === wb.owner ? wa.owner : '';
    const highlight = a === selected || b === selected;
    return `<line class="lane ${owner} ${highlight ? 'highlight' : ''} ${a === 7 && b === 12 ? 'relay-lane' : ''}" x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>`;
  }).join('');
  $('.map-hint').textContent = game.over ? 'EXPEDITION COMPLETE' : type ? 'DOTTED RINGS MARK LEGAL TARGETS' : 'SELECT A WORLD TO BEGIN ↗';
}
function renderInspector() {
  const w = game.worlds[selected], o = type ? { type, target: selected, attr } : null, check = legality(game, HUMAN, o);
  const owner = w.owner === HUMAN ? 'Your territory' : w.owner === AI ? 'Rival territory' : 'Unclaimed world';
  const description = type === 'expand' ? `Add ${w.name} to your empire. Its attributes and direct lanes become yours.` : type === 'attack' ? `Capture ${w.name}. Attributes stay intact; protected through turn ${game.turn + 1}.` : type === 'develop' ? `Raise ${cap(attr)} to ${Math.min(5, w[attr] + 1)}.${attr === 'economy' ? ' +2 Credits per future turn.' : attr === 'industry' ? ' +1 Military per future turn.' : ' +6 Military to conquer this world.'}` : 'Your next chapter starts here. Choose an order below to preview its cost.';
  $('#inspector').innerHTML = `<div class="inspector-top"><span class="eyebrow">WORLD INSPECTOR</span><span class="inspector-num">${num(w.id)} / 20</span></div><div class="selected-planet"><div><span class="owner-tag ${w.owner || 'neutral'}">${w.owner === HUMAN ? '✳' : w.owner === AI ? '⟐' : '○'} ${owner}</span><h2>${w.name}</h2><p>${w.profile}${w.relay ? ' · Prestige source' : w.home ? ' · Origin world' : ' world'}</p></div><img src="${planets[w.id]}" alt="${w.name}" class="inspector-planet"></div><div class="attributes">${ATTRS.map(a => `<div title="${a === 'economy' ? 'Produces 2 Credits per level, per turn' : a === 'industry' ? 'Produces 1 Military per level, per turn' : 'Every level adds 6 Military to the attack price'}"><span>${icon(a)} ${cap(a)}</span><strong>${w[a]}<small>/5</small></strong><div class="level-bars">${Array.from({ length: 5 }, (_, i) => `<i class="${i < w[a] ? 'filled' : ''}"></i>`).join('')}</div></div>`).join('')}</div><div class="world-production"><span>Production / turn</span><b>${icon('credits')} +${2 * w.economy}</b><b>${icon('military')} +${game.turn === 11 ? '0*' : w.industry}</b></div>${w.captured !== null ? `<div class="protection-note">${protectedAt(w, game.turn) ? '⌑ Capture protection' : '○ Protection expired'} · through T${w.captured + 1}; attackable T${w.captured + 2}</div>` : ''}${w.relay ? `<div class="relay-note">◇ ${game.turn < 5 ? 'Awakens at the end of turn 5.' : 'Banks +2 prestige per completed turn.'}</div>` : ''}<div class="order-heading"><h3>Your next move</h3><span>ONE ORDER / TURN</span></div><div class="order-tabs" role="group" aria-label="Order type">${['expand', 'develop', 'attack'].map(t => {
    const c = legality(game, HUMAN, { type: t, target: selected, attr });
    return `<button id="order-${t}" data-type="${t}" class="${type === t ? 'active' : ''} ${!c.ok ? 'unavailable' : ''}" aria-pressed="${type === t}" title="${c.reason || `${cap(t)}: ${c.credits} Credits${c.military ? ` + ${c.military} Military` : ''}`}">${icon(t)}<span>${cap(t)}</span></button>`;
  }).join('')}</div>${type === 'develop' ? `<div class="attribute-options" role="group" aria-label="Attribute to develop">${ATTRS.map(a => `<button id="attr-${a}" data-attr="${a}" class="${attr === a ? 'active' : ''}" aria-pressed="${attr === a}" title="${legality(game, HUMAN, { type: 'develop', target: selected, attr: a }).reason || 'Develop for 8 Credits'}">${cap(a)} <span>+1</span></button>`).join('')}</div>` : ''}<div class="order-preview ${type && !check.ok ? 'invalid' : ''}"><div class="preview-title"><b>${type ? `${cap(type)} ${type === 'develop' ? cap(attr) : 'world'}` : 'A world of possibilities'}</b>${type ? `<span>${icon('credits')} ${check.credits}${check.military ? ` <i>+</i> ${icon('military')} ${check.military}` : ''}</span>` : '<span>↗</span>'}</div><p>${description}</p>${type && !check.ok ? `<p class="legality-reason"><span>ⓘ</span> ${check.reason}</p>` : ''}${type === 'attack' && game.turn >= 16 && game.turn <= 19 ? '<p class="legality-reason">Blockade active: price includes +8 Military.</p>' : ''}</div><div class="commit-controls"><button class="primary" id="commit" ${!type || !check.ok || game.over ? 'disabled' : ''}>Commit order <span>↗</span></button><button class="pass-button" id="pass" ${game.over ? 'disabled' : ''}>Pass this turn <span>→</span></button></div><p class="commit-note">${game.over ? 'The expedition is complete.' : game.turn % 2 ? 'Your order resolves, then the rival responds.' : 'The rival has acted. Your order closes this turn.'}</p>${game.over ? '<button class="secondary" id="show-result">View expedition result ↗</button>' : ''}`;
}
function renderBottom() {
  const f = forecast(game), remaining = Math.max(0, f.turn - game.turn);
  $('#forecast').innerHTML = `<div class="section-head"><span class="eyebrow">ON THE HORIZON</span><span class="event-badge ${f.active ? 'is-active' : ''}">${f.active ? 'ACTIVE NOW' : `TURN ${String(f.turn).padStart(2, '0')}`}</span></div><div class="event-body"><span class="event-art">${f.turn === 5 ? '✺' : f.turn === 11 ? '✷' : '◌'}</span><div><h2>${f.title}</h2><p>${f.text}</p></div></div><div class="event-foot"><span>${f.active ? 'CURRENT EFFECT · PUBLIC TO BOTH EMPIRES' : remaining ? `IN ${remaining} ${remaining === 1 ? 'TURN' : 'TURNS'} · FORECAST` : 'AT THE END OF THIS TURN'}</span><span>↗</span></div>`;
  $('#activity-log').innerHTML = game.logs.slice(-3).reverse().map(entry => `<div class="log-entry ${entry.actor}"><span class="log-turn">T${String(entry.turn).padStart(2, '0')}</span><span class="log-symbol">${entry.actor === HUMAN ? '✳' : entry.actor === AI ? '⟐' : '◇'}</span><p>${entry.text}</p></div>`).join('');
}
function render() {
  const focus = document.activeElement?.id;
  renderEmpires(); renderMap(); renderInspector(); renderBottom();
  if (focus) { const el = document.getElementById(focus); if (el && el !== document.activeElement && !el.disabled) el.focus({ preventScroll: true }); }
}
function commit(order) {
  const turn = game.turn, before = game.logs.length;
  const result = commitHuman(game, order);
  if (!result.ok) { $('#announcement').textContent = result.reason; render(); return; }
  lastAction = order.target ?? null; type = null;
  render();
  $('#announcement').textContent = game.logs.slice(before).map(e => e.text).join(' ') + (game.over ? ' Expedition complete.' : ` Turn ${game.turn}. Your move.`);
  if (game.over) showResult();
  else if (turn !== game.turn && document.activeElement === document.body) $('#pass').focus({ preventScroll: true });
}
function showResult() {
  const win = game.winner === HUMAN, draw = game.winner === 'draw';
  $('#result-dialog').innerHTML = `<button class="dialog-close" data-close aria-label="Inspect final galaxy">×</button><div class="result-emblem">${win ? '✳' : draw ? '◇' : '⟐'}</div><div class="eyebrow">EXPEDITION COMPLETE · ${game.ending === 'elimination' ? 'ELIMINATION' : 'TURN 20'}</div><h2>${win ? 'The stars are <em>yours.</em>' : draw ? 'A shared <em>horizon.</em>' : 'Every ending.<br><em>A new beginning.</em>'}</h2><p>${win ? 'The Sol Collective has left its mark on the Reach.' : draw ? 'Two empires. Equal legacies. The Reach remembers both.' : 'The Vesper Union prevails. Another galaxy awaits your ambition.'}</p><div class="result-scores">${[HUMAN, AI].map(actor => {
    const s = score(game, actor);
    return `<div class="${actor}"><span class="eyebrow">${actor === HUMAN ? 'SOL COLLECTIVE · YOU' : 'VESPER UNION · RIVAL'}</span><strong>${s.total}</strong><span>TOTAL PRESTIGE</span><dl><dt>Worlds held</dt><dd>${s.count}</dd><dt>Planet value</dt><dd>${s.planet}</dd><dt>Banked relay prestige</dt><dd>${s.relay}</dd></dl></div>`;
  }).join('')}</div><button class="primary" id="result-new">New galaxy <span>↗</span></button><button class="secondary" id="result-replay">Replay seed <span>↻</span></button><small class="result-seed">SEED ${game.seed} · SAME MAP. NEW POSSIBILITIES.</small>`;
  $('#result-dialog').showModal();
}

$('#worlds').addEventListener('click', e => {
  const button = e.target.closest('[data-world]'); if (!button) return;
  selected = Number(button.dataset.world); lastAction = null; render();
});
$('#worlds').addEventListener('keydown', e => {
  const dirs = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 5, ArrowUp: -5 };
  if (!(e.key in dirs)) return;
  e.preventDefault(); selected = (selected + dirs[e.key] + 20) % 20; render(); $(`#world-${selected}`).focus();
});
$('#inspector').addEventListener('click', e => {
  const button = e.target.closest('button'); if (!button) return;
  if (button.dataset.type) { type = button.dataset.type; render(); }
  else if (button.dataset.attr) { attr = button.dataset.attr; render(); }
  else if (button.id === 'commit') commit({ type, target: selected, attr });
  else if (button.id === 'pass') commit({ type: 'pass' });
  else if (button.id === 'show-result') showResult();
});
$('#intro-close').addEventListener('click', () => { $('#intro').hidden = true; });
for (const id of ['manual-button', 'map-help', 'scoring-button']) $(`#${id}`).addEventListener('click', () => $('#manual-dialog').showModal());
$('#new-button').addEventListener('click', () => $('#new-dialog').showModal());
$('#confirm-new').addEventListener('click', () => begin(freshSeed()));
$('#confirm-replay').addEventListener('click', () => begin(game.seed));
document.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) e.target.closest('dialog').close();
  if (e.target.closest('#result-new')) begin(freshSeed());
  if (e.target.closest('#result-replay')) begin(game.seed);
});
document.addEventListener('keydown', e => {
  if (e.key === '?' && !document.querySelector('dialog[open]')) $('#manual-dialog').showModal();
  if (e.key === 'Escape' && !document.querySelector('dialog[open]') && type) { type = null; render(); }
});
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
function freshSeed() { let seed; do { seed = crypto.getRandomValues(new Uint32Array(1))[0]; } while (seed === game?.seed); return seed; }
begin(freshSeed());
