import {
  newGame,
  LINKS,
  income,
  score,
  check,
  humanOrder,
  protectedAt,
} from "./engine.js";
const app = document.querySelector("#app");
let seed = crypto.getRandomValues(new Uint32Array(1))[0],
  state = newGame(seed),
  selected = 5,
  staged = null,
  intro = !localStorage.getItem("astra-intro"),
  help = false;
const num = (id) => String(id + 1).padStart(2, "0");
const icons = { credits: "◈", military: "⚑", e: "◈", i: "⚒", d: "⬡" };
const positions = Array.from({ length: 20 }, (_, id) => ({
  x: 10 + (id % 5) * 20,
  y: 13 + Math.floor(id / 5) * 24 + ((id % 5) % 2 ? 3 : 0),
}));
function forecast() {
  if (state.turn < 5)
    return [
      "05",
      "The awakening",
      "At the end of turn 5, relays gain +1 Economy and Industry and begin earning 2 prestige per turn.",
    ];
  if (state.turn === 5)
    return [
      "05",
      "The awakening",
      "This turn’s end: relays gain +1 Economy and Industry. Each held relay begins earning 2 prestige.",
    ];
  if (state.turn <= 10)
    return [
      "11",
      "A star goes silent",
      "Turn 11: no new Military for either empire. Credit income and reserves are unaffected.",
    ];
  if (state.turn === 11)
    return [
      "NOW",
      "Supernova",
      "Military income is suspended this turn only. Your existing reserves remain available.",
    ];
  if (state.turn <= 15)
    return [
      "16",
      "The closing lanes",
      "Turns 16–19: every attack costs 8 additional Military. The blockade lifts on turn 20.",
    ];
  if (state.turn < 20)
    return [
      "NOW",
      "Blockade in effect",
      "Every attack costs +8 Military through turn 19. Normal prices return on turn 20.",
    ];
  return [
    "20",
    "The final horizon",
    "After this turn’s relay awards, total prestige decides the fate of the galaxy.",
  ];
}
function faction(a) {
  const s = score(state, a),
    emp = state.empires[a],
    inc = income(state, a);
  return `<section class="faction ${a}"><div class="faction-title"><span class="faction-mark">${a === "human" ? "✳" : "✣"}</span><div><span class="eyebrow">${a === "human" ? "YOUR EMPIRE" : "AI RIVAL"}</span><h2>${a === "human" ? "The Expedition" : "The Directorate"}</h2></div><span class="world-count">${s.count}<small> ${s.count === 1 ? "world" : "worlds"}</small></span></div><div class="resources"><div><span>◈ Credits</span><strong>${emp.credits}</strong><small>+${inc.credits} / turn</small></div><div><span>⚑ Military</span><strong>${emp.military}</strong><small>+${inc.military} / turn</small></div><div><span>✧ Prestige</span><strong>${s.total}</strong><small>${s.planet} planet + ${s.bank} relay</small></div></div></section>`;
}
function render() {
  const w = state.worlds[selected],
    f = forecast(),
    order = staged ? { ...staged, id: selected } : null,
    legal = check(state, "human", order),
    s = score(state, "human");
  app.innerHTML = `<header class="masthead"><a class="brand" href="#" aria-label="Astra home">a<span class="brand-star">✳</span>stra<span class="brand-sub">GALACTIC EXPEDITIONS</span></a><div class="masthead-center">A SMALL GALAXY. A GREAT AMBITION.</div><button class="text-button" data-action="help">Field guide <span>↗</span></button></header>
<main><div class="page-heading"><div><div class="eyebrow">STRATEGIC ATLAS / SECTOR 07</div><h1>The stars are <em>within reach.</em></h1></div><div class="turn-heading"><span class="live-dot"></span><span>${state.over ? "EXPEDITION COMPLETE" : "YOUR COMMAND"}</span><strong>${num(state.turn - 1)}<span> / 20</span></strong></div></div>
<div class="empire-strip">${faction("human")}<div class="versus">VS</div>${faction("ai")}</div>
<div class="game-layout"><section class="chart-panel"><div class="chart-top"><div><span class="eyebrow">THE KNOWN GALAXY</span><h2>Twenty worlds. One legacy.</h2></div><span class="chart-scale">✦ &nbsp; ALL SYSTEMS VISIBLE</span></div><div class="galaxy" aria-label="Galaxy chart"><div class="nebula"></div><div class="map-coordinates">α — 07.42<br>δ + 19.08</div><svg class="lanes" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">${LINKS.map(([a, b]) => `<line x1="${positions[a].x * 10}" y1="${positions[a].y * 6}" x2="${positions[b].x * 10}" y2="${positions[b].y * 6}" class="${a === 7 && b === 12 ? "relay-lane" : ""} ${state.worlds[a].owner && state.worlds[a].owner === state.worlds[b].owner ? state.worlds[a].owner : ""}"/>`).join("")}</svg>${state.worlds
    .map((world) => {
      const p = positions[world.id],
        valid = staged && check(state, "human", { ...staged, id: world.id }).ok;
      return `<button class="world ${world.owner || "neutral"} ${world.relay ? "relay" : ""} ${world.home ? "home" : ""} ${selected === world.id ? "selected" : ""} ${valid ? "legal-target" : ""} ${order && selected === world.id ? "pending" : ""}" style="left:${p.x}%;top:${p.y}%;--planet-hue:${[24, 184, 214, 280, 34, 195, 165, 38, 262, 16, 202, 320, 38, 158, 14, 220, 30, 185, 267, 18][world.id]}deg" data-world="${world.id}" aria-pressed="${selected === world.id}" aria-label="World ${num(world.id)}, ${world.name}, ${world.owner === "human" ? "yours" : world.owner === "ai" ? "rival" : "neutral"}${world.relay ? ", ancient relay" : ""}"><span class="planet-wrap"><span class="orbit"></span><span class="planet"></span>${world.owner ? `<span class="owner-badge">${world.owner === "human" ? "●" : "◆"}</span>` : ""}${world.relay ? '<span class="relay-spark">✦</span>' : ""}${protectedAt(world, state.turn) ? '<span class="shield">⬡</span>' : ""}</span><span class="world-label"><span class="world-number">${num(world.id)}</span> ${world.name}</span><span class="world-status">${world.relay ? "◇ RELAY" : world.home ? "⌂ HOMEWORLD" : world.owner === "human" ? "● EXPEDITION" : world.owner === "ai" ? "◆ DIRECTORATE" : "UNCLAIMED"}</span></button>`;
    })
    .join(
      "",
    )}</div><div class="chart-bottom"><div class="legend"><span><i class="human"></i> Expedition</span><span><i class="ai"></i> Directorate</span><span><i class="neutral"></i> Unclaimed</span><span class="relay-key">◇ Ancient relay</span></div><span class="seed-label">SEED ${state.seed.toString(16).toUpperCase()}</span></div></section>
<aside class="inspector"><div class="inspector-top"><span class="eyebrow">SYSTEM ${num(w.id)} / ${w.profile.toUpperCase()}</span><span class="ownership ${w.owner || "neutral"}">${w.owner === "human" ? "● YOUR WORLD" : w.owner === "ai" ? "◆ RIVAL WORLD" : "○ UNCLAIMED"}</span></div><div class="world-title"><h2>${w.name}</h2><span>${w.relay ? "✧" : w.home ? "⌂" : "↗"}</span></div><p class="world-description">${w.relay ? "An ancient beacon. A foothold in eternity." : w.home ? "The beginning of an interstellar ambition." : w.profile === "Trade" ? "Thriving markets at the edge of the known." : w.profile === "Forge" ? "A world of furnaces, iron, and possibility." : "A quiet world with an unbreakable resolve."}</p><div class="attributes">${["e", "i", "d"].map((attr) => `<div><span>${icons[attr]} ${{ e: "Economy", i: "Industry", d: "Defense" }[attr]}</span><strong>${w[attr]}<small>/5</small></strong><div class="level-bars">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= w[attr] ? "filled" : ""}"></i>`).join("")}</div></div>`).join("")}</div><div class="production"><span>World production</span><b>◈ ${2 * w.e} <small>Credits</small> &nbsp; ⚑ ${state.turn === 11 ? 0 : w.i} <small>Military</small></b></div>${w.relay ? `<div class="special-note">✦ ${state.turn < 5 ? "Awakens at the end of turn 5" : "Awakened · +2 prestige each turn"}</div>` : ""}${protectedAt(w, state.turn) ? `<div class="special-note">⬡ Protected through turn ${w.captured + 1}. Attackable turn ${w.captured + 2}.</div>` : ""}
<div class="order-composer"><div class="eyebrow">ISSUE AN ORDER</div><div class="order-tabs">${[
    ["expand", "↗", "Expand"],
    ["develop", "⊕", "Develop"],
    ["attack", "⚔", "Attack"],
  ]
    .map(
      ([type, icon, label]) =>
        `<button data-order="${type}" class="${staged?.type === type ? "active" : ""}" aria-pressed="${staged?.type === type}"><span>${icon}</span>${label}</button>`,
    )
    .join(
      "",
    )}</div>${staged?.type === "develop" ? `<div class="attribute-options">${["e", "i", "d"].map((attr) => `<button data-attr="${attr}" class="${staged.attr === attr ? "active" : ""}">${{ e: "Economy", i: "Industry", d: "Defense" }[attr]}</button>`).join("")}</div>` : ""}<div class="order-preview"><div><strong>${staged ? { expand: "Establish a colony", develop: `Improve ${{ e: "Economy", i: "Industry", d: "Defense" }[staged.attr]}`, attack: "Take control of this world" }[staged.type] : "Your next move"}</strong>${staged ? `<b>◈ ${legal.credits}${legal.military ? ` &nbsp; ⚑ ${legal.military}` : ""}</b>` : "<span>01 → 02 → 03</span>"}</div><p class="${staged && !legal.ok ? "unavailable" : ""}">${!staged ? "Select a world, choose an order, then commit." : !legal.ok ? legal.reason : staged.type === "expand" ? "Claim this world. Its production begins next turn." : staged.type === "attack" ? `Guaranteed capture. Protected through turn ${state.turn + 1}.` : `${{ e: "+2 Credits per future turn.", i: "+1 Military per future turn.", d: "+6 Military required for an enemy attack." }[staged.attr]} Level ${w[staged.attr]} → ${w[staged.attr] + 1}.`}</p></div><button class="commit" data-action="commit" ${!legal.ok ? "disabled" : ""}>Commit order <span>↗</span></button><button class="pass" data-action="pass" ${state.over ? "disabled" : ""}>Hold position <span>Pass turn →</span></button><p class="initiative">${state.turn % 2 ? "You move first. The Directorate follows." : "The Directorate has moved. Your order closes this turn."}</p></div></aside></div>
<div class="lower-grid"><section class="forecast"><div class="forecast-number">${f[0]}<small>${f[0] === "NOW" ? "ACTIVE" : "TURN"}</small></div><div><span class="eyebrow">${f[0] === "NOW" ? "CURRENT CONDITIONS" : "ON THE HORIZON"}</span><h3>${f[1]}</h3><p>${f[2]}</p></div><span class="forecast-symbol">✺</span></section><section class="activity"><div class="activity-title"><span class="eyebrow">EXPEDITION LOG</span><span>LIVE TRANSMISSION <i class="live-dot"></i></span></div><div class="log-list" aria-live="polite">${
    state.log.length
      ? state.log
          .slice(0, 3)
          .map(
            (l) =>
              `<div class="log-entry"><span>T${String(l.turn).padStart(2, "0")}</span><i class="${l.actor}"></i><p>${l.text}</p></div>`,
          )
          .join("")
      : '<div class="empty-log">The galaxy is quiet. Write its next chapter.</div>'
  }</div></section></div><footer><span>ASTRA <i>/</i> A GAME OF SMALL DECISIONS & VAST CONSEQUENCES</span><button data-action="new" class="text-button">New expedition ↗</button></footer></main>
${!intro && !help && !state.over ? `<div class="mobile-dock"><button class="commit" data-action="commit" ${!legal.ok ? "disabled" : ""}>Commit order ↗</button><button class="pass" data-action="pass">Pass turn →</button></div>` : ""}${intro || help ? guide() : ""}${state.over ? result() : ""}`;
  bind();
}
function guide() {
  return `<div class="modal-backdrop"><section class="modal intro-modal" role="dialog" aria-modal="true" aria-labelledby="intro-title"><div class="intro-art"><div class="intro-orbit"></div><div class="intro-planet"></div><span class="intro-star">✦</span><span class="eyebrow">A FIELD GUIDE TO THE UNKNOWN</span></div><div class="modal-content"><div class="eyebrow">WELCOME, COMMANDER</div><h2 id="intro-title">A small galaxy.<br><em>A great ambition.</em></h2><p>Twenty worlds. Twenty turns. Lead the Expedition against the Directorate and leave the greater legacy.</p><div class="guide-steps"><div><b>01</b><span><strong>Choose your world</strong>Follow the lanes to expand your reach.</span></div><div><b>02</b><span><strong>Make your move</strong>Expand, develop, or attack. One order per turn.</span></div><div><b>03</b><span><strong>Build a legacy</strong>Hold the relays from turn 5 for +2 prestige each turn.</span></div></div><p class="guide-detail">Highest prestige wins: 3 per world + all attribute levels + banked relay prestige. Capture the rival’s last world to win immediately. Combat is guaranteed when you can pay its price.</p><button class="commit" data-action="start">${help ? "Return to the stars" : "Begin expedition"} <span>↗</span></button><small class="intro-foot">NO TIMER. NO DICE. EVERY DECISION COUNTS.</small></div></section></div>`;
}
function result() {
  return `<div class="modal-backdrop"><section class="modal result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title"><div class="result-emblem">${state.winner === "human" ? "✳" : state.winner === "draw" ? "◇" : "✣"}</div><div class="eyebrow">EXPEDITION COMPLETE / TURN ${state.turn}</div><h2 id="result-title">${state.winner === "human" ? "A legacy among the stars." : state.winner === "draw" ? "A galaxy in balance." : "The stars will remember."}</h2><p>${state.elimination ? (state.winner === "human" ? "The Directorate’s last world has fallen." : "Your last world has fallen to the Directorate.") : state.winner === "human" ? "Your expedition has earned the greater prestige." : state.winner === "draw" ? "Two empires. An equal claim to history." : "The Directorate has earned the greater prestige."}</p><div class="result-scores">${[
    "human",
    "ai",
  ]
    .map((a) => {
      const v = score(state, a);
      return `<div><span>${a === "human" ? "THE EXPEDITION" : "THE DIRECTORATE"}</span><strong>${v.total}</strong><p>${v.planet} planet value<br>${v.bank} relay prestige<br>${v.count} worlds held</p></div>`;
    })
    .join(
      "",
    )}</div><button class="commit" data-action="new">New galaxy <span>↗</span></button><button class="pass" data-action="replay">Replay seed <span>↺</span></button></section></div>`;
}
function restart(fresh) {
  if (fresh) seed = crypto.getRandomValues(new Uint32Array(1))[0];
  state = newGame(seed);
  selected = 5;
  staged = null;
  intro = false;
  help = false;
  render();
}
function bind() {
  document.querySelector("main").inert = intro || help || state.over;
  document.querySelector("header").inert = intro || help || state.over;
  document.querySelectorAll("[data-world]").forEach(
    (el) =>
      (el.onclick = () => {
        selected = Number(el.dataset.world);
        render();
        document
          .querySelector(`[data-world="${selected}"]`)
          .focus({ preventScroll: true });
      }),
  );
  document.querySelectorAll("[data-order]").forEach(
    (el) =>
      (el.onclick = () => {
        staged = { type: el.dataset.order, attr: staged?.attr || "e" };
        render();
        document
          .querySelector(`[data-order="${staged.type}"]`)
          .focus({ preventScroll: true });
      }),
  );
  document.querySelectorAll("[data-attr]").forEach(
    (el) =>
      (el.onclick = () => {
        staged.attr = el.dataset.attr;
        render();
        document
          .querySelector(`[data-attr="${staged.attr}"]`)
          .focus({ preventScroll: true });
      }),
  );
  document.querySelectorAll("[data-action]").forEach(
    (el) =>
      (el.onclick = () => {
        switch (el.dataset.action) {
          case "start":
            intro = false;
            help = false;
            localStorage.setItem("astra-intro", "1");
            render();
            document
              .querySelector(`[data-world="${selected}"]`)
              .focus({ preventScroll: true });
            break;
          case "help":
            help = true;
            render();
            break;
          case "commit":
            if (humanOrder(state, { ...staged, id: selected })) {
              staged = null;
              render();
              document
                .querySelector('[data-action="pass"]')
                ?.focus({ preventScroll: true });
            }
            break;
          case "pass":
            humanOrder(state, null);
            staged = null;
            render();
            document
              .querySelector('[data-action="pass"]')
              ?.focus({ preventScroll: true });
            break;
          case "new":
            restart(true);
            break;
          case "replay":
            restart(false);
            break;
        }
      }),
  );
  const modal = document.querySelector(".modal");
  if (modal) {
    modal.querySelector("button")?.focus({ preventScroll: true });
    modal.onkeydown = (e) => {
      if (e.key === "Tab") {
        const buttons = [...modal.querySelectorAll("button")],
          first = buttons[0],
          last = buttons.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
  }
}
render();
