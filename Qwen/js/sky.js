/* =====================================================================
   RELIC WARS — sky.js
   Ambient background (starfield + nebula on canvas) and a tiny
   WebAudio synth for interface sound effects. Pure presentation.
   ===================================================================== */
'use strict';

const Sky = (() => {
  let canvas, ctx, W = 0, H = 0, dpr = 1;
  let stars = [], shooters = [], nebula = null;
  let last = 0, running = false;
  let nextShooter = 4000;
  let parX = 0, parY = 0, tX = 0, tY = 0;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildStars();
    buildNebula();
  }

  function buildStars() {
    const count = Math.max(120, Math.min(340, Math.round(W * H / 7000)));
    stars = [];
    const rng = mulberry32(0xC0FFEE);
    for (let i = 0; i < count; i++) {
      const layer = rng() < 0.55 ? 0 : rng() < 0.75 ? 1 : 2; // 0 far .. 2 near
      const tint = rng();
      stars.push({
        x: rng() * W, y: rng() * H,
        r: (layer === 0 ? 0.5 : layer === 1 ? 0.9 : 1.4) * (0.7 + rng() * 0.8),
        layer,
        base: 0.25 + rng() * 0.55,
        amp: 0.1 + rng() * 0.3,
        speed: 0.4 + rng() * 1.6,
        phase: rng() * Math.PI * 2,
        color: tint < 0.62 ? '230,236,255' : tint < 0.8 ? '190,220,255' : tint < 0.92 ? '255,232,205' : '214,196,255',
      });
    }
  }

  function blob(g, x, y, r, color, alpha) {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${color},${alpha})`);
    grd.addColorStop(0.5, `rgba(${color},${alpha * 0.35})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function buildNebula() {
    nebula = document.createElement('canvas');
    nebula.width = Math.max(1, Math.round(W)); nebula.height = Math.max(1, Math.round(H));
    const g = nebula.getContext('2d');
    g.clearRect(0, 0, W, H);
    // Deep-space base wash
    const base = g.createLinearGradient(0, 0, W * 0.4, H);
    base.addColorStop(0, '#0a0718');
    base.addColorStop(0.5, '#070510');
    base.addColorStop(1, '#0b0619');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'screen';
    // Nebula clouds — teal, magenta, indigo
    blob(g, W * 0.18, H * 0.22, Math.max(W, H) * 0.42, '16,120,110', 0.16);
    blob(g, W * 0.84, H * 0.30, Math.max(W, H) * 0.38, '120,32,110', 0.15);
    blob(g, W * 0.55, H * 0.86, Math.max(W, H) * 0.46, '52,40,140', 0.16);
    blob(g, W * 0.42, H * 0.48, Math.max(W, H) * 0.30, '90,60,160', 0.07);
    // Faint milky band
    g.save();
    g.translate(W * 0.5, H * 0.45);
    g.rotate(-0.5);
    const band = g.createLinearGradient(0, -H * 0.5, 0, H * 0.5);
    band.addColorStop(0, 'rgba(140,130,200,0)');
    band.addColorStop(0.5, 'rgba(150,140,210,0.05)');
    band.addColorStop(1, 'rgba(140,130,200,0)');
    g.fillStyle = band;
    g.fillRect(-W, -H * 0.28, W * 2, H * 0.56);
    g.restore();
    g.globalCompositeOperation = 'source-over';
  }

  function frame(ts) {
    if (!running) return;
    const dt = Math.min(64, ts - last || 16); last = ts;
    ctx.clearRect(0, 0, W, H);
    if (nebula) ctx.drawImage(nebula, 0, 0, W, H);

    // Parallax easing
    if (!reduced) {
      parX += (tX - parX) * 0.04;
      parY += (tY - parY) * 0.04;
    }

    const t = ts / 1000;
    for (const s of stars) {
      if (!reduced) {
        s.x += (s.layer === 0 ? 0.004 : s.layer === 1 ? 0.010 : 0.018) * dt;
        if (s.x > W + 2) s.x = -2;
      }
      const a = reduced ? s.base : s.base + s.amp * Math.sin(t * s.speed + s.phase);
      const px = s.x + parX * (s.layer + 1) * 0.5;
      const py = s.y + parY * (s.layer + 1) * 0.5;
      ctx.beginPath();
      ctx.fillStyle = `rgba(${s.color},${Math.max(0.05, a).toFixed(3)})`;
      ctx.arc(px, py, s.r, 0, Math.PI * 2);
      ctx.fill();
      if (s.layer === 2 && a > 0.72) {
        ctx.fillStyle = `rgba(${s.color},${((a - 0.72) * 0.5).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(px, py, s.r * 2.6, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Shooting stars
    if (!reduced) {
      nextShooter -= dt;
      if (nextShooter <= 0 && shooters.length < 2) {
        nextShooter = 6000 + Math.random() * 12000;
        shooters.push({
          x: Math.random() * W * 0.8, y: Math.random() * H * 0.4,
          vx: 0.45 + Math.random() * 0.3, vy: 0.16 + Math.random() * 0.12, life: 0,
        });
      }
      for (let i = shooters.length - 1; i >= 0; i--) {
        const sh = shooters[i];
        sh.life += dt; sh.x += sh.vx * dt; sh.y += sh.vy * dt;
        const k = Math.min(1, sh.life / 900);
        const alpha = Math.sin(k * Math.PI) * 0.85;
        const tailX = sh.x - sh.vx * 130, tailY = sh.y - sh.vy * 130;
        const grad = ctx.createLinearGradient(tailX, tailY, sh.x, sh.y);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, `rgba(220,235,255,${alpha})`);
        ctx.strokeStyle = grad; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(sh.x, sh.y); ctx.stroke();
        if (sh.life > 950 || sh.x > W + 150) shooters.splice(i, 1);
      }
    }
    requestAnimationFrame(frame);
  }

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    resize();
    let rt = null;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); });
    if (!reduced) {
      window.addEventListener('pointermove', e => {
        tX = (e.clientX / window.innerWidth - 0.5) * -10;
        tY = (e.clientY / window.innerHeight - 0.5) * -7;
      }, { passive: true });
    }
    running = true;
    requestAnimationFrame(ts => { last = ts; frame(ts); });
  }

  return { init };
})();

/* ------------------------------------------------------------------ SFX */

const Sfx = (() => {
  let ac = null, master = null;
  let enabled = true;
  try { enabled = localStorage.getItem('rw-sound') !== '0'; } catch (e) { /* ignore */ }

  function ctxGet() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(freq, dur, type = 'sine', vol = 0.12, slideTo = null, delay = 0) {
    const a = ctxGet(); if (!a || !enabled) return;
    const t0 = a.currentTime + delay;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  function noise(dur = 0.25, vol = 0.1, delay = 0) {
    const a = ctxGet(); if (!a || !enabled) return;
    const t0 = a.currentTime + delay;
    const len = Math.round(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(); src.buffer = buf;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  const recipes = {
    click:    () => tone(560, 0.05, 'square', 0.035),
    select:   () => { tone(500, 0.07, 'sine', 0.07, 640); },
    stage:    () => { tone(420, 0.06, 'triangle', 0.08, 520); },
    deny:     () => { tone(150, 0.14, 'sawtooth', 0.05, 110); },
    expand:   () => { tone(440, 0.14, 'sine', 0.09, 554); tone(659, 0.16, 'sine', 0.07, null, 0.09); },
    develop:  () => { tone(523, 0.1, 'triangle', 0.09, 784); tone(1046, 0.12, 'sine', 0.05, null, 0.08); },
    attack:   () => { noise(0.3, 0.12); tone(120, 0.28, 'sawtooth', 0.1, 52); tone(300, 0.2, 'square', 0.05, 90, 0.05); },
    capture:  () => { noise(0.22, 0.1); tone(160, 0.2, 'sawtooth', 0.09, 70); tone(523, 0.18, 'sine', 0.08, 784, 0.12); tone(1046, 0.22, 'sine', 0.06, null, 0.22); },
    prestige: () => { tone(880, 0.3, 'sine', 0.06); tone(1318, 0.35, 'sine', 0.05, null, 0.06); },
    wake:     () => { tone(392, 0.5, 'sine', 0.07); tone(523, 0.5, 'sine', 0.06, null, 0.08); tone(784, 0.6, 'sine', 0.05, null, 0.16); },
    warn:     () => { tone(220, 0.22, 'square', 0.06, 180); tone(220, 0.22, 'square', 0.06, 180, 0.3); },
    turn:     () => { tone(330, 0.08, 'sine', 0.05, 440); },
    pass:     () => { tone(300, 0.1, 'sine', 0.05, 220); },
    victory:  () => { [523, 659, 784, 1046].forEach((f, k) => tone(f, 0.35, 'sine', 0.08, null, k * 0.12)); },
    defeat:   () => { [440, 392, 330, 262].forEach((f, k) => tone(f, 0.4, 'sine', 0.08, null, k * 0.15)); },
    draw:     () => { tone(440, 0.4, 'sine', 0.07); tone(660, 0.4, 'sine', 0.06, null, 0.1); },
    ai:       () => { tone(240, 0.1, 'triangle', 0.05, 200); },
  };

  function play(name) {
    if (!enabled) return;
    const r = recipes[name];
    if (r) { try { r(); } catch (e) { /* audio unavailable */ } }
  }

  function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem('rw-sound', on ? '1' : '0'); } catch (e) { /* ignore */ }
    if (on) play('click');
  }

  return { play, setEnabled, isEnabled: () => enabled, unlock: ctxGet };
})();

/* --------------------------------------------------------- FLOAT TEXT */

/** Spawn a floating label anchored inside a positioned parent element. */
function spawnFloat(parentEl, text, cls = '') {
  if (!parentEl) return;
  const span = document.createElement('span');
  span.className = 'float ' + cls;
  span.textContent = text;
  parentEl.appendChild(span);
  span.addEventListener('animationend', () => span.remove(), { once: true });
  setTimeout(() => span.remove(), 2600);
}
