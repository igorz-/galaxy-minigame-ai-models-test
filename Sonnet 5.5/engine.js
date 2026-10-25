(function (root) {
  'use strict';

  const ROWS = 4, COLS = 5, N = 20, MAX_TURN = 20;
  const RELAYS = [7, 12];
  const HOME = { H: 5, A: 14 };
  const ATTRS = ['e', 'i', 'd'];
  const ATTR_NAME = { e: 'Economy', i: 'Industry', d: 'Defense' };
  const PROFILES = {
    trade: { key: 'trade', name: 'Trade', e: 3, i: 1, d: 1 },
    forge: { key: 'forge', name: 'Forge', e: 1, i: 3, d: 1 },
    bastion: { key: 'bastion', name: 'Bastion', e: 1, i: 1, d: 3 },
  };
  const PROFILE_LIST = [PROFILES.trade, PROFILES.forge, PROFILES.bastion];
  const NAMES = [
    'Aster', 'Boreal', 'Cinder', 'Dorado', 'Eridu',
    'Nadir', 'Ferrous', 'Meridian I', 'Garnet', 'Halcyon',
    'Icarus', 'Juno', 'Meridian II', 'Kepler', 'Vulcan',
    'Lyra', 'Mira', 'Nox', 'Orion', 'Pallas',
  ];

  const LINKS = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS - 1; c++) LINKS.push([r * COLS + c, r * COLS + c + 1]);
  for (let r = 0; r < ROWS - 1; r++) {
    LINKS.push([r * COLS, (r + 1) * COLS]);
    LINKS.push([r * COLS + COLS - 1, (r + 1) * COLS + COLS - 1]);
  }
  LINKS.push([7, 12]);

  const ADJ = Array.from({ length: N }, () => []);
  LINKS.forEach(([a, b]) => { ADJ[a].push(b); ADJ[b].push(a); });

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const other = (p) => (p === 'H' ? 'A' : 'H');
  const pad = (n) => String(n + 1).padStart(2, '0');

  function newGame(seed) {
    seed = seed >>> 0;
    const rng = mulberry32(seed);
    const profile = new Array(N);
    for (let id = 0; id < N / 2; id++) {
      let k = Math.floor(rng() * 3);
      if (id === 0) k = 1;
      if (id === 6) k = 0;
      profile[id] = profile[N - 1 - id] = PROFILE_LIST[k].key;
    }
    const attrs = profile.map((k) => ({ e: PROFILES[k].e, i: PROFILES[k].i, d: PROFILES[k].d }));
    attrs[HOME.H] = { e: 3, i: 2, d: 2 };
    attrs[HOME.A] = { e: 3, i: 2, d: 2 };
    RELAYS.forEach((r) => { attrs[r] = { e: 2, i: 2, d: 2 }; });
    const owner = new Array(N).fill(null);
    owner[HOME.H] = 'H';
    owner[HOME.A] = 'A';
    return {
      seed, turn: 0, profile, attrs, owner,
      cap: new Array(N).fill(null),
      cred: { H: 14, A: 14 }, mil: { H: 0, A: 0 }, bank: { H: 0, A: 0 },
      first: 'H', phase: 'init', over: false, result: null,
      log: [], last: null, lastIncome: { H: { c: 0, m: 0 }, A: { c: 0, m: 0 } },
    };
  }

  const owned = (s, p) => { const o = []; for (let i = 0; i < N; i++) if (s.owner[i] === p) o.push(i); return o; };
  const adjacentTo = (s, id, p) => ADJ[id].some((n) => s.owner[n] === p);
  const isRelay = (id) => RELAYS.includes(id);
  const surcharge = (turn) => (turn >= 16 && turn <= 19 ? 8 : 0);
  const isProtected = (s, id) => s.cap[id] !== null && s.turn <= s.cap[id] + 1;

  function income(s, p) {
    let c = 0, m = 0;
    for (const id of owned(s, p)) { c += 2 * s.attrs[id].e; m += s.attrs[id].i; }
    if (s.turn === 11) m = 0;
    return { c, m };
  }

  function planetValue(s, p) {
    const w = owned(s, p);
    return 3 * w.length + w.reduce((a, id) => a + s.attrs[id].e + s.attrs[id].i + s.attrs[id].d, 0);
  }
  const score = (s, p) => {
    const planets = planetValue(s, p);
    return { planets, relay: s.bank[p], total: planets + s.bank[p], worlds: owned(s, p).length };
  };

  function addLog(s, kind, text) { s.log.unshift({ turn: s.turn, kind, text }); }

  function attackMil(s, id, turn) { return 4 + 6 * s.attrs[id].d + surcharge(turn === undefined ? s.turn : turn); }

  function check(s, p, o) {
    const t = o.target;
    if (t === null || t === undefined) return { ok: false, reason: 'Select a world first.', c: 0, m: 0 };
    const q = other(p);
    let c = 0, m = 0, reason = null;
    if (o.type === 'expand') {
      c = 12 + 4 * owned(s, p).length;
      if (s.owner[t] !== null) reason = s.owner[t] === p ? 'You already own this world.' : 'Already claimed. Use Attack on enemy worlds.';
      else if (!adjacentTo(s, t, p)) reason = 'No direct lane from any of your worlds.';
    } else if (o.type === 'develop') {
      c = 8;
      if (s.owner[t] !== p) reason = s.owner[t] === null ? 'Neutral world. Expand to claim it first.' : 'You can only develop your own worlds.';
      else if (s.attrs[t][o.attr] >= 5) reason = ATTR_NAME[o.attr] + ' is already at level 5.';
    } else if (o.type === 'attack') {
      c = 8; m = attackMil(s, t);
      if (s.owner[t] === p) reason = 'That is your own world.';
      else if (s.owner[t] === null) reason = 'Neutral world. Use Expand instead.';
      else if (!adjacentTo(s, t, p)) reason = 'No direct lane from any of your worlds.';
      else if (isProtected(s, t)) reason = 'Capture-protected through turn ' + (s.cap[t] + 1) + '. Attackable on turn ' + (s.cap[t] + 2) + '.';
    } else reason = 'Choose an order type.';
    if (!reason) {
      const needC = c > s.cred[p], needM = m > s.mil[p];
      if (needC && needM) reason = 'Need ' + (c - s.cred[p]) + ' more Credits and ' + (m - s.mil[p]) + ' more Military.';
      else if (needC) reason = 'Need ' + (c - s.cred[p]) + ' more Credits.';
      else if (needM) reason = 'Need ' + (m - s.mil[p]) + ' more Military.';
    }
    return { ok: !reason, reason, c, m };
  }

  function apply(s, p, o) {
    const chk = check(s, p, o);
    if (!chk.ok) return chk;
    const t = o.target, q = other(p), who = p === 'H' ? 'You' : 'Rival';
    s.cred[p] -= chk.c; s.mil[p] -= chk.m;
    const nm = pad(t) + ' ' + NAMES[t];
    if (o.type === 'expand') {
      s.owner[t] = p; s.cap[t] = null;
      addLog(s, p, who + (p === 'H' ? ' colonise ' : ' colonises ') + nm + ' for ' + chk.c + ' Cr.');
    } else if (o.type === 'develop') {
      s.attrs[t][o.attr]++;
      addLog(s, p, who + (p === 'H' ? ' raise ' : ' raises ') + ATTR_NAME[o.attr] + ' on ' + nm + ' to ' + s.attrs[t][o.attr] + '.');
    } else {
      s.owner[t] = p; s.cap[t] = s.turn;
      addLog(s, p, who + (p === 'H' ? ' capture ' : ' captures ') + nm + ' (' + chk.c + ' Cr, ' + chk.m + ' Mil).');
      if (owned(s, q).length === 0) finish(s, p, 'elimination');
    }
    s.last = { p, type: o.type, target: t, turn: s.turn };
    return chk;
  }

  function pass(s, p) {
    addLog(s, p, (p === 'H' ? 'You pass.' : 'Rival passes.'));
    s.last = { p, type: 'pass', target: null, turn: s.turn };
  }

  function startTurn(s) {
    s.turn++;
    ['H', 'A'].forEach((p) => {
      const inc = income(s, p);
      s.cred[p] += inc.c; s.mil[p] += inc.m;
      s.lastIncome[p] = inc;
    });
    s.first = s.turn % 2 === 1 ? 'H' : 'A';
    s.last = null;
    addLog(s, 'sys', 'Turn ' + s.turn + ' begins. ' + (s.first === 'H' ? 'You act first.' : 'Rival acts first.') +
      (s.turn === 11 ? ' Supernova: no Military income.' : ''));
  }

  function finish(s, winner, how) {
    s.over = true; s.phase = 'over';
    s.result = { how, winner, scores: { H: score(s, 'H'), A: score(s, 'A') } };
  }

  function endTurn(s) {
    if (s.turn === 5) {
      RELAYS.forEach((r) => { s.attrs[r].e = Math.min(5, s.attrs[r].e + 1); s.attrs[r].i = Math.min(5, s.attrs[r].i + 1); });
      addLog(s, 'sys', 'The ancient relays awaken: +1 Economy and +1 Industry.');
    }
    if (s.turn === 10) addLog(s, 'sys', 'Warning: supernova. Turn 11 brings no Military income.');
    if (s.turn === 15) addLog(s, 'sys', 'Warning: blockade. Attacks on turns 16-19 cost +8 Military.');
    if (s.turn >= 5) {
      RELAYS.forEach((r) => {
        const o = s.owner[r];
        if (o) { s.bank[o] += 2; addLog(s, o, (o === 'H' ? 'You earn' : 'Rival earns') + ' +2 prestige from ' + NAMES[r] + '.'); }
      });
    }
    if (s.turn >= MAX_TURN) {
      const a = score(s, 'H').total, b = score(s, 'A').total;
      finish(s, a > b ? 'H' : b > a ? 'A' : null, 'score');
    }
  }

  function aiChoose(s) {
    const p = 'A', q = 'H';
    const ok = (type, target, attr) => check(s, p, { type, target, attr }).ok;
    const atk = (t) => ({ type: 'attack', target: t });
    const exp = (t) => ({ type: 'expand', target: t });
    const dev = (t, a) => ({ type: 'develop', target: t, attr: a });

    const hw = owned(s, q);
    if (hw.length === 1 && ok('attack', hw[0])) return atk(hw[0]);
    for (const r of RELAYS) if (s.owner[r] === q && ok('attack', r)) return atk(r);
    for (const r of RELAYS) if (s.owner[r] === null && ok('expand', r)) return exp(r);

    for (const r of RELAYS) {
      if (s.owner[r] !== p || !adjacentTo(s, r, q) || s.attrs[r].d >= 5) continue;
      if (s.cap[r] !== null && s.cap[r] >= s.turn) continue;
      const m = (d) => 4 + 6 * d + surcharge(s.turn + 1);
      const canPay = (d) => s.cred[q] >= 8 && s.mil[q] >= m(d);
      const d = s.attrs[r].d;
      if (canPay(d) && !canPay(d + 1) && ok('develop', r, 'd')) return dev(r, 'd');
    }

    const cands = [];
    for (let id = 0; id < N; id++) {
      if (s.owner[id] === q && !isRelay(id) && ok('attack', id)) {
        const a = s.attrs[id];
        cands.push({ id, v: 3 + a.e + a.i + a.d, m: attackMil(s, id) });
      }
    }
    if (cands.length) {
      cands.sort((x, y) => y.v - x.v || x.m - y.m || x.id - y.id);
      return atk(cands[0].id);
    }

    const neutrals = [];
    for (let id = 0; id < N; id++) if (s.owner[id] === null && ok('expand', id)) neutrals.push(id);
    const farRelays = RELAYS.filter((r) => s.owner[r] === null && !adjacentTo(s, r, p));
    const toward = neutrals.filter((n) => farRelays.some((r) => ADJ[n].includes(r)));
    if (toward.length) return exp(toward[0]);
    if (neutrals.length) {
      neutrals.sort((x, y) => (s.attrs[y].e + s.attrs[y].i) - (s.attrs[x].e + s.attrs[x].i) || s.attrs[y].e - s.attrs[x].e || x - y);
      return exp(neutrals[0]);
    }

    const firstDev = (attr) => {
      for (const id of owned(s, p)) if (ok('develop', id, attr)) return dev(id, attr);
      return null;
    };
    if (s.turn <= 16) {
      const pref = income(s, p).c < 12 ? 'e' : 'i';
      return firstDev(pref) || firstDev(pref === 'e' ? 'i' : 'e');
    }
    for (const r of RELAYS) if (s.owner[r] === p && adjacentTo(s, r, q) && ok('develop', r, 'd')) return dev(r, 'd');
    for (const id of owned(s, p)) for (const a of ATTRS) if (ok('develop', id, a)) return dev(id, a);
    return null;
  }

  function aiAct(s) {
    const o = aiChoose(s);
    if (o) apply(s, 'A', o); else pass(s, 'A');
    return o;
  }

  const api = {
    ROWS, COLS, N, MAX_TURN, RELAYS, HOME, ATTRS, ATTR_NAME, PROFILES, NAMES, LINKS, ADJ,
    mulberry32, newGame, owned, adjacentTo, isRelay, surcharge, isProtected, income, planetValue, score,
    check, apply, pass, startTurn, endTurn, aiChoose, aiAct, attackMil, other, pad,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Engine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
