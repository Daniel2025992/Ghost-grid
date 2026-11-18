// In-world 3D challenges (no pop-up quizzes): the player physically does the task around a node.
//  plates  - memory relay: watch the plates light up, then step on them in the same order
//  letters - decrypt: walk through the floating letters in the right order to spell the word
//  gates   - sprint: run through the glowing gates in order before time runs out
import * as THREE from 'three';

const WORDS = ['GHOST', 'NEON', 'CIPHER', 'VAULT', 'MATRIX', 'PULSE', 'KERNEL', 'SIGNAL', 'BREACH', 'TOKEN', 'QUANTUM', 'SHADOW', 'PROXY', 'ROUTER', 'BINARY', 'DAEMON', 'FIREWALL', 'CORE', 'GRID', 'NEXUS'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createChallenges(env) {
  const {scene, pos, hdr} = env;
  const group = new THREE.Group(); scene.add(group);
  let cur = null, hudT = 0;

  function disposeAll(o) {
    o.traverse(x => {
      if (x.geometry) x.geometry.dispose();
      if (x.material) (Array.isArray(x.material) ? x.material : [x.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
    });
  }
  function clear() { while (group.children.length) { const c = group.children[0]; group.remove(c); disposeAll(c); } }

  function glyph(ch, hex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), col = '#' + new THREE.Color(hex).getHexString();
    const g = x.createRadialGradient(64, 64, 6, 64, 64, 62); g.addColorStop(0, 'rgba(4,10,24,.92)'); g.addColorStop(0.8, 'rgba(4,10,24,.8)'); g.addColorStop(1, 'rgba(4,10,24,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = col; x.lineWidth = 6; x.shadowColor = col; x.shadowBlur = 16; x.beginPath(); x.arc(64, 64, 48, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#fff'; x.font = 'bold 66px Consolas, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 64, 70);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function arena(cx, cz, R, hex) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.12, R, 96), new THREE.MeshBasicMaterial({color: hdr(hex, 1.3), transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false}));
    ring.rotation.x = -Math.PI / 2; ring.position.set(cx, 0.06, cz); group.add(ring);
  }

  function hud(force) {
    if (!cur) return;
    const now = performance.now(); if (!force && now - hudT < 100) return; hudT = now;
    env.onHud({kind: cur.kind, left: cur.left, total: cur.total, text: cur.text(), progress: cur.progress(), lives: cur.lives, stage: cur.stage || null});
  }

  /* ---------- plates ---------- */
  function startPlates(s) {
    const n = clamp(4 + Math.floor(s.level / 3), 4, 7), L = clamp(3 + Math.floor(s.level / 2), 3, 8), R = 7.5, cols = env.colors();
    const plates = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, hex = cols[i % cols.length];
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.16, 36), new THREE.MeshBasicMaterial({color: hdr(hex, 0.45)}));
      m.position.set(s.cx + Math.cos(a) * R, 0.1, s.cz + Math.sin(a) * R);
      const lab = new THREE.Sprite(new THREE.SpriteMaterial({map: glyph(String(i + 1), hex), toneMapped: false, depthWrite: false, transparent: true}));
      lab.scale.set(1.5, 1.5, 1); lab.position.set(m.position.x, 0.8, m.position.z);
      group.add(m, lab); plates.push({m, hex, lit: 0, tint: null});
    }
    const seq = []; for (let i = 0; i < L; i++) { let v; do { v = Math.floor(Math.random() * n); } while (i && v === seq[i - 1]); seq.push(v); }
    cur = {kind: 'plates', total: s.time, left: s.time, lives: 3, plates, seq, k: 0, phase: 'show', ph: 0.8, si: 0, stood: -1, flashes: [],
      text() { return this.phase === 'show' ? '👀 צפה ברצף הלוחות' : 'דרוך על הלוחות לפי הסדר'; },
      progress() { return [this.k, this.seq.length]; },
      tick(dt) {
        const c = this;
        c.plates.forEach(p => { p.lit = Math.max(0, p.lit - dt * 2.4); p.m.material.color.copy(p.tint ? p.tint.clone().multiplyScalar(0.5 + p.lit * 2.2) : hdr(p.hex, 0.45 + p.lit * 2.4)); if (p.lit <= 0) p.tint = null; p.m.position.y = 0.1 + p.lit * 0.12; });
        if (c.phase === 'show') {
          c.ph -= dt;
          if (c.ph <= 0) {
            if (c.si >= c.seq.length) { c.phase = 'input'; c.stood = -1; env.onFx('go'); return; }
            const p = c.plates[c.seq[c.si]]; p.lit = 1; p.tint = null; env.onFx('note', c.seq[c.si]); c.si++; c.ph = 0.75;
          }
          return;
        }
        let on = -1;
        c.plates.forEach((p, i) => { if (Math.hypot(pos.x - p.m.position.x, pos.z - p.m.position.z) < 1.35 && pos.y < 1.5) on = i; });
        if (on !== c.stood) {
          c.stood = on;
          if (on >= 0) {
            if (on === c.seq[c.k]) { c.k++; c.plates[on].lit = 1; c.plates[on].tint = new THREE.Color(0x20ff80).multiplyScalar(2.2); env.onFx('note', on); if (c.k >= c.seq.length) end(true); }
            else { c.lives--; c.plates[on].lit = 1; c.plates[on].tint = new THREE.Color(0xff2040).multiplyScalar(2.2); env.onPenalty('plates'); env.onFx('bad'); c.k = 0; if (c.lives <= 0) { end(false, 'טעית יותר מדי פעמים'); return; } c.phase = 'show'; c.si = 0; c.ph = 1.3; }
          }
        }
      }
    };
  }

  /* ---------- letters ---------- */
  function startLetters(s) {
    const cols = env.colors(), len = clamp(4 + Math.floor(s.level / 3), 4, 8);
    const pool = WORDS.filter(w => w.length >= len - 1 && w.length <= len + 1); const word = (s.word || pool[Math.floor(Math.random() * pool.length)] || 'GHOST').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8);
    const decoys = clamp(3 + Math.floor(s.level / 2), 4, 9), R = 11, objs = [], taken = [];
    const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(ch => !word.includes(ch));
    const place = () => { for (let tries = 0; tries < 60; tries++) { const a = Math.random() * Math.PI * 2, r = 3.5 + Math.random() * (R - 5); const x = s.cx + Math.cos(a) * r, z = s.cz + Math.sin(a) * r; if (taken.every(q => Math.hypot(q[0] - x, q[1] - z) > 2.6)) { taken.push([x, z]); return [x, z]; } } const a = Math.random() * 6.28; return [s.cx + Math.cos(a) * 8, s.cz + Math.sin(a) * 8]; };
    const mk = (ch, idx) => {
      const [x, z] = place(), hex = cols[(idx + 1) % cols.length];
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: glyph(ch, hex), toneMapped: false, depthWrite: false, transparent: true}));
      sp.scale.set(2.3, 2.3, 1); sp.position.set(x, 1.6, z); group.add(sp);
      const base = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 28), new THREE.MeshBasicMaterial({color: hdr(hex, 1.4), transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false}));
      base.rotation.x = -Math.PI / 2; base.position.set(x, 0.07, z); group.add(base);
      objs.push({ch, idx, sp, base, x, z, ph: Math.random() * 6, cool: 0, alive: true, flash: 0});
    };
    word.split('').forEach((ch, i) => mk(ch, i));
    for (let i = 0; i < decoys; i++) mk(alpha[Math.floor(Math.random() * alpha.length)], -1);
    const drift = s.level >= 6;
    cur = {kind: 'letters', total: s.time, left: s.time, lives: 4, word, objs, k: 0,
      text() { return 'עבור דרך האותיות לפי הסדר: ' + this.word.split('').map((c, i) => i === this.k ? '[' + c + ']' : c).join(' ') + ' · הבאה: ' + (this.word[this.k] || ''); },
      progress() { return [this.k, this.word.length]; },
      tick(dt, t) {
        const c = this;
        c.objs.forEach(o => {
          if (!o.alive) return;
          o.cool = Math.max(0, o.cool - dt); o.flash = Math.max(0, o.flash - dt * 2.5);
          let x = o.x, z = o.z; if (drift) { x += Math.sin(t * 0.8 + o.ph) * 1.6; z += Math.cos(t * 0.7 + o.ph) * 1.6; }
          o.cx = x; o.cz = z;
          o.sp.position.set(x, 1.6 + Math.sin(t * 2 + o.ph) * 0.25, z); o.base.position.set(x, 0.07, z);
          const isN = o.idx === c.k, nextHint = isN ? 0.45 + 0.25 * Math.sin(t * 6) : -0.5; o.sp.scale.setScalar(2.3 + nextHint + o.flash * 0.6); o.sp.material.opacity = isN ? 1 : 0.55; o.base.scale.setScalar(isN ? 1.5 + 0.2 * Math.sin(t * 6) : 0.8); o.base.material.opacity = isN ? 1 : 0.3;
          o.sp.material.color.setRGB(1 + o.flash * 1.5, 1 - o.flash * 0.7, 1 - o.flash * 0.7);
          if (o.cool <= 0 && Math.hypot(pos.x - x, pos.z - z) < 1.5 && pos.y < 2.8) {
            if (o.idx === c.k) { o.alive = false; group.remove(o.sp, o.base); disposeAll(o.sp); disposeAll(o.base); c.k++; env.onFx('note', c.k); env.onBurst(x, z); if (c.k >= c.word.length) { end(true); return; } }
            else { o.cool = 1.4; o.flash = 1; c.lives--; env.onPenalty('letters'); env.onFx('bad'); if (c.lives <= 0) { end(false, 'נגעת באותיות שגויות'); return; } }
          }
        });
      }
    };
  }

  /* ---------- gates ---------- */
  function startGates(s) {
    const n = clamp(5 + Math.floor(s.level / 3), 5, 9), cols = env.colors(), gates = [];
    let ang = Math.random() * 6.28, path = 0, last = [pos.x, pos.z];
    for (let i = 0; i < n; i++) {
      ang += 2.2 + Math.random() * 1.6; const r = 6 + Math.random() * 6.5, x = s.cx + Math.cos(ang) * r, z = s.cz + Math.sin(ang) * r;
      const m = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.14, 10, 40), new THREE.MeshBasicMaterial({color: hdr(cols[0], 0.5)}));
      m.position.set(x, 1.9, z); m.lookAt(s.cx, 1.9, s.cz);
      const lab = new THREE.Sprite(new THREE.SpriteMaterial({map: glyph(String(i + 1), cols[1]), toneMapped: false, depthWrite: false, transparent: true})); lab.scale.set(1.3, 1.3, 1); lab.position.set(x, 4.2, z);
      group.add(m, lab); gates.push({m, lab, x, z, done: false}); path += Math.hypot(x - last[0], z - last[1]); last = [x, z];
    }
    const total = s.time || Math.round(path / 6.0 + 7);
    cur = {kind: 'gates', total, left: total, lives: 99, gates, k: 0,
      text() { return 'רוץ (Shift) דרך השערים לפי המספרים'; },
      progress() { return [this.k, this.gates.length]; },
      tick(dt, t) {
        const c = this;
        c.gates.forEach((g, i) => {
          const isNext = i === c.k; g.m.rotation.z += dt * (isNext ? 2.2 : 0.4);
          const k = g.done ? 0.25 : (isNext ? 1.4 + 0.8 * Math.sin(t * 8) : 0.5); g.m.material.color.copy(hdr(g.done ? 0x20ff80 : cols[0], k)); g.lab.visible = !g.done;
        });
        const g = c.gates[c.k];
        if (g && Math.hypot(pos.x - g.x, pos.z - g.z) < 2.1 && pos.y < 4) { g.done = true; c.k++; env.onFx('note', c.k); env.onBurst(g.x, g.z); if (c.k >= c.gates.length) end(true); }
      }
    };
  }

  /* ---------- control ---------- */
  function start(s) {
    stop(true);
    s = {level: 1, time: 0, ...s}; s.level = Math.max(1, s.level);
    arena(s.cx, s.cz, 12, env.colors()[0]);
    const T = {plates: 42 + 5 * clamp(3 + Math.floor(s.level / 2), 3, 8), letters: 34 + 9 * clamp(4 + Math.floor(s.level / 3), 4, 8), gates: 0}[s.kind];
    s.time = s.kind === 'gates' ? 0 : Math.max(14, Math.round((s.time || T) * (s.timeMul || 1)));
    ({plates: startPlates, letters: startLetters, gates: startGates})[s.kind](s);
    if (s.kind === 'gates' && s.timeMul) { cur.total = cur.left = Math.max(10, Math.round(cur.total * s.timeMul)); }
    cur.cx = s.cx; cur.cz = s.cz; cur.stage = s.stage; cur.ended = false;
    hud(true); env.onFx('start');
  }
  function end(ok, why) { if (!cur || cur.ended) return; cur.ended = true; const c = cur; cur = null; setTimeout(() => clear(), ok ? 600 : 0); env.onEnd(ok, why || '', c.left / c.total); }
  function stop(silent) { cur = null; clear(); if (!silent) env.onHud(null); }
  function update(dt, t) {
    if (!cur) return;
    cur.left -= dt;
    cur.tick(dt, t);
    if (!cur) return;
    if (Math.hypot(pos.x - cur.cx, pos.z - cur.cz) > 34) { end(false, 'התרחקת מדי מהמשימה'); return; }
    if (cur.left <= 0) { end(false, 'נגמר הזמן'); return; }
    hud();
  }
  return {start, stop, update, active: () => !!cur, _state: () => cur};
}
