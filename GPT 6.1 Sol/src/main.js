import {
  createGame,
  humanOrder,
  legality,
  income,
  score,
  owned,
  LINKS,
  ATTRS,
  attackCost,
  protectedAt,
  forecast,
  capitalize,
} from "./engine.js";
import { planetArt, starfield } from "./art.js";

const $ = (id) => document.getElementById(id);
const freshSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
let game = createGame(freshSeed()),
  selected = 5,
  staged = null,
  attribute = "economy",
  art = [],
  sound = false,
  audio;
let toastTimer;
const positions = Array.from({ length: 20 }, (_, id) => ({
  x: 100 + (id % 5) * 200 + [0, 9, -4, 5, 0][id % 5],
  y: 93 + Math.floor(id / 5) * 151 + [0, -9, 5, -4, 0][id % 5],
}));
const number = (n) => String(n).padStart(2, "0");
const emblem = (actor) =>
  actor === "human"
    ? '<svg viewBox="0 0 40 44" class="faction-emblem" aria-hidden="true"><path d="M20 3 35 12v18L20 41 5 30V12Z" fill="none" stroke="currentColor"/><path d="m20 10 9 20-9-5-9 5Z" fill="currentColor"/><path d="M20 12v13" stroke="#1c2915"/></svg>'
    : '<svg viewBox="0 0 40 44" class="faction-emblem" aria-hidden="true"><path d="M20 3 35 12v18L20 41 5 30V12Z" fill="none" stroke="currentColor"/><path d="m11 13 9 6 9-6v15l-9 7-9-7Z" fill="currentColor"/><path d="m15 22 5 4 5-4" fill="none" stroke="#30201b" stroke-width="2"/></svg>';

function beep(kind = "select") {
  if (!sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const osc = audio.createOscillator(),
      gain = audio.createGain();
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(
      kind === "commit" ? 420 : kind === "error" ? 150 : 620,
      audio.currentTime,
    );
    osc.frequency.exponentialRampToValueAtTime(
      kind === "commit" ? 840 : 230,
      audio.currentTime + 0.12,
    );
    gain.gain.setValueAtTime(0.035, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.16);
    osc.start();
    osc.stop(audio.currentTime + 0.17);
  } catch {
    /* Sound is an optional enhancement. */
  }
}
function toast(text, error = false) {
  clearTimeout(toastTimer);
  $("toast").textContent = text;
  $("toast").className = `toast${error ? " error" : ""}`;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => ($("toast").hidden = true), 3000);
}
function initializeMap() {
  art = game.worlds.map((w) => planetArt(w.id, game.seed));
  $("galaxy-map").style.backgroundImage = `url(${starfield(game.seed)})`;
  $("lanes").innerHTML = LINKS.map(
    ([a, b], i) =>
      `<line id="lane-${i}" class="lane" x1="${positions[a].x}" y1="${positions[a].y}" x2="${positions[b].x}" y2="${positions[b].y}"/>`,
  ).join("");
  $("worlds").innerHTML = game.worlds
    .map(
      (w) =>
        `<button class="world" id="world-${w.id}" data-world="${w.id}" style="left:${positions[w.id].x / 10}%;top:${positions[w.id].y / 6.5}%" aria-pressed="false"><span class="planet-wrap"><span class="selection-ring"></span><span class="orbit-ring"></span><img class="planet-image" src="${art[w.id]}" alt=""><span class="owner-marker"></span><span class="protection-mark" hidden>▣</span></span><span class="world-label"><span class="world-id">${number(w.id + 1)}</span>${w.name}</span><span class="world-sub"></span><span class="target-marker" hidden>+</span></button>`,
    )
    .join("");
  $("turn-track").innerHTML = Array.from({ length: 20 }, () => "<i></i>").join(
    "",
  );
}
function renderEmpire(actor) {
  const empire = game.empires[actor],
    gain = income(game, actor),
    tally = score(game, actor);
  $(actor === "human" ? "human-status" : "ai-status").innerHTML =
    `<div class="faction-identity">${emblem(actor)}<div><div class="faction-name">${actor === "human" ? "The Verdant Union" : "The Ashen Dominion"}</div><div class="faction-kicker">${actor === "human" ? "YOUR EMPIRE / HUMAN" : "RIVAL EMPIRE / DETERMINISTIC AI"}</div></div></div>
    <div class="resource"><div class="resource-label"><span class="resource-icon">◈</span> CREDITS</div><div class="resource-value">${empire.credits}<span class="resource-income">+${gain.credits}/t</span></div></div>
    <div class="resource"><div class="resource-label"><span class="resource-icon">⌁</span> MILITARY</div><div class="resource-value">${empire.military}<span class="resource-income">+${gain.military}/t</span></div></div>
    <div class="resource worlds-resource"><div class="resource-label"><span class="resource-icon">⊕</span> WORLDS</div><div class="resource-value">${tally.worlds}<span class="resource-income">/ 20</span></div></div>
    <div class="resource prestige-resource" title="${tally.planet} planet value + ${tally.relay} banked relay prestige"><div class="resource-label"><span class="resource-icon">✧</span> PRESTIGE</div><div class="resource-value">${tally.total}</div><span class="resource-breakdown">${tally.planet} PLANET + ${tally.relay} RELAY</span></div>`;
}
function currentOrder(id = selected) {
  return staged
    ? {
        type: staged,
        target: id,
        ...(staged === "develop" ? { attribute } : {}),
      }
    : null;
}
function renderMap() {
  for (const w of game.worlds) {
    const button = $(`world-${w.id}`),
      order = currentOrder(w.id),
      legal = order && legality(game, "human", order).legal;
    button.className = `world ${w.owner || "neutral"}${w.relay ? " relay" : ""}${w.id === selected ? " selected" : ""}${legal ? " legal-target" : ""}${staged && w.id === selected ? ` staged${!legal ? " pending-invalid" : ""}` : ""}`;
    button.setAttribute("aria-pressed", String(w.id === selected));
    button.setAttribute(
      "aria-description",
      `World ${number(w.id + 1)} ${w.name}. ${w.owner === "human" ? "Your world" : w.owner === "ai" ? "Rival world" : "Neutral"}. ${w.profile}. Economy ${w.economy}, Industry ${w.industry}, Defense ${w.defense}.${protectedAt(w, game.turn) ? ` Protected through turn ${w.capturedTurn + 1}.` : ""}${order ? ` ${legal ? "Legal target." : legality(game, "human", order).reason}` : ""}`,
    );
    button.querySelector(".owner-marker").textContent =
      w.owner === "human" ? "▲" : w.owner === "ai" ? "▼" : "·";
    button.querySelector(".world-label").innerHTML =
      `<span class="world-id">${number(w.id + 1)}</span> <span aria-hidden="true">${w.relay ? "◇ " : w.home ? "⌂ " : ""}</span>${w.name}`;
    for (const selector of [".planet-wrap", ".world-sub", ".target-marker"])
      button.querySelector(selector).setAttribute("aria-hidden", "true");
    button.querySelector(".world-sub").innerHTML =
      `<span>E <b>${w.economy}</b></span><span>I <b>${w.industry}</b></span><span>D <b>${w.defense}</b></span>`;
    button.querySelector(".target-marker").hidden =
      !legal && !(staged && w.id === selected);
    button.querySelector(".target-marker").textContent =
      w.id === selected ? (legal ? "⌖" : "×") : "+";
    button.querySelector(".protection-mark").hidden = !protectedAt(
      w,
      game.turn,
    );
    // Use the visible world name as the accessible name and full rules as its description.
    button.removeAttribute("aria-label");
  }
  LINKS.forEach(([a, b], i) => {
    const wa = game.worlds[a],
      wb = game.worlds[b];
    $(`lane-${i}`).setAttribute(
      "class",
      `lane${wa.owner && wa.owner === wb.owner ? (wa.owner === "human" ? " human-lane" : " rival-lane") : ""}${wa.relay && wb.relay ? " relay-lane" : ""}${a === selected || b === selected ? " selected-lane" : ""}`,
    );
  });
}
function renderInspector() {
  const w = game.worlds[selected];
  $("selected-number").textContent = `SYS ${number(w.id + 1)}`;
  const marker = w.relay
    ? "◇ ANCIENT RELAY"
    : w.home
      ? "⌂ HOMEWORLD"
      : w.owner === "human"
        ? "▲ UNION TERRITORY"
        : w.owner === "ai"
          ? "▼ DOMINION TERRITORY"
          : "○ UNCLAIMED WORLD";
  $("inspector").innerHTML =
    `<div class="world-hero"><span class="hero-orbit"></span><span class="hero-orbit second"></span><span class="hero-coordinates">SYSTEM ${number(w.id + 1)}<br>${(4.28 + w.id * 0.17).toFixed(2)} / +${(38.12 + w.id * 0.31).toFixed(2)}</span><img class="hero-planet" src="${art[w.id]}" alt="${w.name}, a textured ${w.relay ? "violet" : w.id === 5 ? "ocean-blue" : "rocky"} world"><span class="hero-tag ${w.owner === "ai" ? "rival" : !w.owner ? "neutral" : ""}">${marker}</span></div>
  <div class="world-info"><div class="world-title-row"><div><h2>${w.name}</h2><div class="profile">${w.profile.toUpperCase()} / SYSTEM ${number(w.id + 1)}</div></div><span class="world-owner">${w.owner === "human" ? "THE VERDANT UNION" : w.owner === "ai" ? "THE ASHEN DOMINION" : "NEUTRAL TERRITORY"}</span></div>
  <p class="world-info-desc">${w.relay ? "An ancient signal, waiting to be heard. A source of production and enduring prestige." : w.home ? "Where an empire began. Its future reaches far beyond these familiar skies." : w.profile === "Trade" ? "A thriving crossroads. Rich markets fuel the next wave of your expansion." : w.profile === "Forge" ? "Fire beneath the surface. Industrial output turns ambition into military power." : "An unyielding frontier. Natural fortifications make this world costly to capture."}</p>
  <div class="attribute-grid">${ATTRS.map((a) => `<div><div class="attribute-label">${a === "economy" ? "◈" : a === "industry" ? "⌁" : "⬡"} ${a.toUpperCase()}</div><div class="attribute-value">${w[a]}<small>/ 5</small></div><div class="level-pips">${Array.from({ length: 5 }, (_, i) => `<i class="${i < w[a] ? "filled" : ""}"></i>`).join("")}</div></div>`).join("")}</div>
  <div class="production-line">${w.owner ? `PRODUCES +${w.economy * 2} CREDITS / +${game.turn === 11 ? 0 : w.industry} MILITARY PER TURN` : `IF CLAIMED: +${w.economy * 2} CREDITS / +${w.industry} MILITARY PER TURN`}<br>CAPTURE COST: 8 CREDITS + ${attackCost(w, game.turn)} MILITARY</div>
  ${w.capturedTurn !== null ? `<p class="protection-info">${protectedAt(w, game.turn) ? "▣ CAPTURE PROTECTION" : "▢ PROTECTION EXPIRED"}<br>Protected through turn ${w.capturedTurn + 1}. Attackable on turn ${w.capturedTurn + 2}.</p>` : ""}</div>`;
}
function renderComposer() {
  const w = game.worlds[selected],
    order = currentOrder(),
    check = legality(game, "human", order);
  document.querySelectorAll("[data-order]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.order === staged));
    b.title = legality(game, "human", {
      type: b.dataset.order,
      target: selected,
      attribute,
    }).reason;
    b.disabled = !!game.result;
  });
  $("attribute-controls").hidden = staged !== "develop";
  // Keep control nodes stable so keyboard focus survives updates.
  if (!$("attribute-controls").children.length)
    $("attribute-controls").innerHTML = ATTRS.map(
      (a) =>
        `<button data-attribute="${a}" aria-pressed="false">${capitalize(a)}</button>`,
    ).join("");
  document.querySelectorAll("[data-attribute]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.attribute === attribute));
    b.title = legality(game, "human", {
      type: "develop",
      target: selected,
      attribute: b.dataset.attribute,
    }).reason;
  });
  const credits =
    staged === "expand" ? 12 + 4 * owned(game, "human").length : 8;
  $("order-preview").className =
    `order-preview${order && !check.legal ? " invalid" : ""}`;
  $("order-preview").innerHTML = order
    ? `<div class="preview-heading"><span>${staged.toUpperCase()} / ${w.name.toUpperCase()}</span><span class="${check.legal ? "legal" : "illegal"}">${check.legal ? "✓ READY" : "⊘ UNAVAILABLE"}</span></div><div class="order-price"><span>${credits}<small>CREDITS</small></span>${staged === "attack" ? `<span>${attackCost(w, game.turn)}<small>MILITARY</small></span>` : ""}</div><p class="preview-reason">${check.reason}</p>`
    : `<div class="preview-heading"><span>AWAITING YOUR COMMAND</span><span>↗</span></div><p class="preview-reason">Choose Expand, Develop, or Attack. Inspect the cost before committing your order.</p>`;
  $("commit-button").disabled = !check.legal || !!game.result;
  $("pass-button").disabled = !!game.result;
  $("command-note").textContent = game.result
    ? "Expedition complete. Open the result to play again."
    : "Orders resolve immediately. No second confirmation.";
}
const logHTML = (entry) =>
  `<div class="log-line ${entry.actor}"><span class="log-turn">T${number(entry.turn)}</span><span class="log-dot"></span><span>${entry.actor === "human" ? "You · " : entry.actor === "ai" ? "Rival · " : ""}${entry.text}</span></div>`;
function renderIntel() {
  const event = forecast(game);
  $("event-time").textContent = event.active
    ? "● ACTIVE NOW"
    : `TURN ${number(event.turn)}`;
  $("forecast-content").innerHTML =
    `<div class="forecast-body"><svg class="forecast-icon" viewBox="0 0 50 50" fill="none" aria-hidden="true"><circle cx="25" cy="25" r="14" stroke="currentColor" stroke-width=".6"/><ellipse cx="25" cy="25" rx="23" ry="9" stroke="currentColor" stroke-width=".6" transform="rotate(-35 25 25)"/><path d="m25 15 2.8 7.2L35 25l-7.2 2.8L25 35l-2.8-7.2L15 25l7.2-2.8Z" fill="currentColor"/><circle cx="9" cy="37" r="2" fill="currentColor"/></svg><div><h2 class="forecast-title">${event.title}</h2><p>${event.text}</p><div class="event-state${event.active ? " active" : ""}">${event.active ? "CURRENT EFFECT / PUBLIC INFORMATION" : "FORECAST / AUTOMATIC GALAXY EVENT"}</div></div></div>`;
  $("activity").innerHTML = game.log.slice(-3).reverse().map(logHTML).join("");
}
function renderAll() {
  $("turn-number").textContent = number(game.turn);
  $("initiative-label").textContent = game.result
    ? "EXPEDITION COMPLETE"
    : game.turn % 2
      ? "YOU HAVE INITIATIVE"
      : "RIVAL MOVED FIRST";
  [...$("turn-track").children].forEach(
    (el, i) =>
      (el.className =
        i + 1 === game.turn ? "current" : i + 1 < game.turn ? "past" : ""),
  );
  $("seed-label").textContent =
    `GALAXY SEED / ${game.seed.toString(16).toUpperCase().padStart(8, "0")}`;
  renderEmpire("human");
  renderEmpire("ai");
  renderMap();
  renderInspector();
  renderComposer();
  renderIntel();
}
function selectWorld(id) {
  selected = id;
  beep();
  renderMap();
  renderInspector();
  renderComposer();
}
function commit(order) {
  const previous = game.turn,
    target = order.type !== "pass" ? game.worlds[order.target].name : "";
  const result = humanOrder(game, order);
  if (!result.legal) {
    toast(result.reason, true);
    beep("error");
    return;
  }
  beep("commit");
  staged = null;
  renderAll();
  $("briefing").hidden = true;
  if (game.result) showResult();
  else
    toast(
      `${order.type === "pass" ? "Position held" : order.type === "expand" ? `${target} colonized` : order.type === "develop" ? `${target} developed` : `${target} captured`}. Turn ${previous} complete. ${game.turn % 2 === 0 ? "Rival has moved. " : ""}Your command.`,
    );
}
function modal(title, body) {
  $("modal").setAttribute("aria-labelledby", "modal-title");
  $("modal-content").innerHTML =
    `<div class="modal-header"><span id="modal-title">${title}</span><button class="close-modal" data-modal-action="close" aria-label="Close dialog">×</button></div>${body}`;
  if (!$("modal").open) $("modal").showModal();
}
function showManual() {
  modal(
    "FIELD MANUAL / KNOW YOUR GALAXY",
    `<div class="modal-body"><div class="eyebrow">TRANSMISSION 001</div><h2>Small galaxy. Big decisions.</h2><p>You lead the Verdant Union against the deterministic Ashen Dominion. Every world, reserve, and outcome is public. No dice. No hidden advantages.</p><div class="manual-grid"><section><h3>01 / Make your move</h3><p><strong>Select a world → choose an order → Commit.</strong> One order per empire per shared turn. You move first on odd turns; the rival moves first on even turns. Pass preserves your reserves. Selecting another world retargets a staged order without spending anything.</p></section><section><h3>02 / Build an empire</h3><ul><li><strong>Expand:</strong> adjacent neutral world. Costs 12 + 4 × owned worlds in Credits.</li><li><strong>Develop:</strong> +1 Economy, Industry, or Defense on your world. 8 Credits; maximum level 5.</li><li><strong>Attack:</strong> adjacent rival world. 8 Credits + 4 + 6 × target Defense in Military.</li></ul></section><section><h3>03 / Invest for tomorrow</h3><p>Each turn begins with <strong>2 × Economy in Credits</strong> and <strong>1 × Industry in Military</strong>. All holdings produce, even disconnected ones. New colonies and upgrades pay next turn. Captures keep all attributes and are protected through the following turn.</p></section><section><h3>04 / Leave a legacy</h3><p>Win immediately by taking the rival’s last world. Otherwise, after turn 20:<br><strong>3 per world + all attribute levels + banked relay prestige.</strong> Higher total wins; a tie is a draw. Credits and Military do not score.</p></section></div><p class="manual-note">◇ End of turn 5: relays gain +1 Economy & Industry, then held relays bank +2 prestige every turn through turn 20. Turn 11: no new Military. Turns 16–19: attacks cost +8 Military. The final turn includes its relay award.</p><p>Keyboard: Tab to any control and Enter or Space to activate. Use arrow keys between worlds on the chart. The rival follows the same costs and rules, prioritizing relays and legal conquests.</p><button class="primary-button" data-modal-action="close">BACK TO THE FRONTIER <span>↗</span></button></div>`,
  );
}
function showResult() {
  const r = game.result;
  if (!r) return;
  const win = r.winner === "human",
    draw = r.winner === "draw";
  modal(
    "EXPEDITION COMPLETE / FINAL TRANSMISSION",
    `<div class="modal-body"><div class="result-symbol">${draw ? "◇" : win ? "✳" : "⌖"}</div><div class="result-kicker">${r.reason === "elimination" ? "GALACTIC DOMINANCE" : "TWENTY TURNS. ONE LEGACY."}</div><h2>${draw ? "A galaxy shared." : win ? "Your empire endures." : "The frontier remembers."}</h2><p>${draw ? "Two empires. Equal prestige. Neither could claim the final word." : win ? "The Verdant Union has claimed its place among the stars." : "The Ashen Dominion prevails. Every expedition is a lesson for the next."} ${r.reason === "elimination" ? "Victory by elimination: the losing empire has no worlds remaining." : "Victory is decided by planet value and banked relay prestige."}</p><table class="result-table"><thead><tr><th>FINAL ACCOUNT</th><th>YOUR UNION</th><th>RIVAL DOMINION</th></tr></thead><tbody>${[
      ["Worlds", "worlds"],
      ["Planet value", "planet"],
      ["Banked relay prestige", "relay"],
      ["TOTAL PRESTIGE", "total"],
    ]
      .map(
        ([label, key]) =>
          `<tr><td>${label}</td><td>${r.human[key]}</td><td>${r.ai[key]}</td></tr>`,
      )
      .join(
        "",
      )}</tbody></table><p>Seed ${game.seed.toString(16).toUpperCase()}. Replay the same galaxy with a new strategy, or head into the unknown.</p><div class="modal-actions"><button class="primary-button" data-modal-action="new">NEW GALAXY <span>↗</span></button><button class="outline-button" data-modal-action="replay">REPLAY SEED <span>↺</span></button></div></div>`,
  );
}
function reset(seed) {
  game = createGame(seed);
  selected = 5;
  staged = null;
  attribute = "economy";
  $("modal").close();
  $("toast").hidden = true;
  clearTimeout(toastTimer);
  initializeMap();
  renderAll();
  $("briefing").hidden = false;
  $("world-5").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function newGalaxyPrompt() {
  if (game.result) {
    showResult();
    return;
  }
  modal(
    "EXPEDITION CONTROL",
    `<div class="modal-body"><div class="eyebrow">A NEW HORIZON</div><h2>Chart another course?</h2><p>Starting a new expedition ends your current match. New Galaxy generates fresh planet profiles. Replay Seed restores this exact map with all resources, ownership, upgrades, and prestige reset.</p><div class="modal-actions"><button class="primary-button" data-modal-action="new">NEW GALAXY <span>↗</span></button><button class="outline-button" data-modal-action="replay">REPLAY SEED <span>↺</span></button></div><button class="text-button" data-modal-action="close">KEEP EXPLORING →</button></div>`,
  );
}
$("worlds").addEventListener("click", (e) => {
  const b = e.target.closest("[data-world]");
  if (b) selectWorld(Number(b.dataset.world));
});
$("worlds").addEventListener("keydown", (e) => {
  const b = e.target.closest("[data-world]");
  if (!b) return;
  const id = Number(b.dataset.world),
    offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5 };
  if (!(e.key in offsets)) return;
  e.preventDefault();
  const next = id + offsets[e.key];
  if (
    next >= 0 &&
    next < 20 &&
    (!(e.key === "ArrowLeft" || e.key === "ArrowRight") ||
      Math.floor(id / 5) === Math.floor(next / 5))
  ) {
    selectWorld(next);
    $(`world-${next}`).focus({ preventScroll: true });
  }
});
document.querySelectorAll("[data-order]").forEach((b) =>
  b.addEventListener("click", () => {
    staged = b.dataset.order;
    beep();
    renderMap();
    renderComposer();
  }),
);
$("attribute-controls").addEventListener("click", (e) => {
  const b = e.target.closest("[data-attribute]");
  if (b) {
    attribute = b.dataset.attribute;
    beep();
    renderMap();
    renderComposer();
  }
});
$("commit-button").addEventListener("click", () => {
  if (currentOrder()) commit(currentOrder());
});
$("pass-button").addEventListener("click", () => commit({ type: "pass" }));
$("begin-button").addEventListener("click", () => {
  $("briefing").hidden = true;
  beep();
});
$("manual-button").addEventListener("click", showManual);
$("mobile-manual-button").addEventListener("click", showManual);
$("new-button").addEventListener("click", newGalaxyPrompt);
$("sound-button").addEventListener("click", () => {
  sound = !sound;
  $("sound-button").setAttribute("aria-pressed", String(sound));
  $("sound-button").setAttribute(
    "aria-label",
    sound ? "Disable sound" : "Enable sound",
  );
  $("sound-button").querySelector(".sound-off").hidden = sound;
  beep();
});
$("log-button").addEventListener("click", () =>
  modal(
    "TRANSMISSION ARCHIVE",
    `<div class="modal-body"><h2>A record of the frontier.</h2><div class="full-log">${game.log.slice().reverse().map(logHTML).join("")}</div><div class="modal-actions"><button class="primary-button" data-modal-action="close">RETURN TO GALAXY <span>↗</span></button>${game.result ? '<button class="outline-button" data-modal-action="result">VIEW RESULT</button>' : ""}</div></div>`,
  ),
);
$("modal").addEventListener("click", (e) => {
  const action = e.target.closest("[data-modal-action]")?.dataset.modalAction;
  if (action === "close") $("modal").close();
  if (action === "new") reset(freshSeed());
  if (action === "replay") reset(game.seed);
  if (action === "result") showResult();
  if (e.target === $("modal")) {
    const r = $("modal").getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      $("modal").close();
  }
});
initializeMap();
renderAll();
