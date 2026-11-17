import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const lerp = (a, b, k) => a + (b - a) * k;

export function createAvatar() {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);

  const mBody = new THREE.MeshStandardMaterial({color: 0x9fb7d1, metalness: 0.88, roughness: 0.26, envMapIntensity: 1.15});
  const mDark = new THREE.MeshStandardMaterial({color: 0x0d1220, metalness: 0.9, roughness: 0.34, envMapIntensity: 1.1});
  const mTrim = new THREE.MeshBasicMaterial({color: 0x00f0ff});
  const mVisor = new THREE.MeshBasicMaterial({color: 0x00f0ff});
  const mGlow = new THREE.MeshBasicMaterial({color: 0x00f0ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide});

  const rb = (w, h, d, r, mat) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), mat);
  const cap = (r, l, mat) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, 16), mat);
  const sph = (r, mat, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), mat); m.scale.set(sx, sy, sz); return m; };
  const cyl = (rt, rb2, h, mat, seg = 20) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb2, h, seg), mat);
  const put = (o, x, y, z) => { o.position.set(x, y, z); return o; };

  /* ----- torso ----- */
  const hips = put(rb(0.62, 0.3, 0.4, 0.12, mBody), 0, 1.02, 0);
  const belly = put(rb(0.6, 0.3, 0.42, 0.12, mDark), 0, 1.28, 0);
  const torso = put(rb(0.8, 0.9, 0.5, 0.2, mBody), 0, 1.68, 0);
  const chestCore = put(sph(0.095, mTrim), 0, 1.78, 0.255);
  const stripL = put(rb(0.05, 0.5, 0.02, 0.01, mTrim), -0.22, 1.66, 0.255);
  const stripR = put(rb(0.05, 0.5, 0.02, 0.01, mTrim), 0.22, 1.66, 0.255);
  const belt = put(rb(0.66, 0.05, 0.44, 0.02, mTrim), 0, 1.13, 0);
  const neck = put(cyl(0.12, 0.15, 0.2, mDark), 0, 2.12, 0);
  body.add(hips, belly, torso, chestCore, stripL, stripR, belt, neck);

  /* ----- backpack ----- */
  const pack = new THREE.Group();
  pack.add(put(rb(0.52, 0.72, 0.24, 0.08, mDark), 0, 1.68, -0.38));
  pack.add(put(rb(0.08, 0.5, 0.03, 0.01, mTrim), 0, 1.68, -0.51));
  [-1, 1].forEach(s => {
    pack.add(put(cyl(0.07, 0.09, 0.24, mDark, 14), s * 0.18, 1.3, -0.4));
    pack.add(put(cyl(0.05, 0.05, 0.03, mTrim, 14), s * 0.18, 1.17, -0.4));
    pack.add(put(cyl(0.012, 0.012, 0.42, mDark, 6), s * 0.2, 2.15, -0.4));
    pack.add(put(sph(0.03, mTrim), s * 0.2, 2.37, -0.4));
  });
  body.add(pack);

  /* ----- head ----- */
  const head = new THREE.Group(); head.position.set(0, 2.38, 0); body.add(head);
  head.add(sph(0.4, mBody, 1, 1.02, 1.05));
  head.add(put(rb(0.58, 0.28, 0.3, 0.12, mDark), 0, -0.01, 0.23));
  const visor = put(rb(0.5, 0.13, 0.05, 0.05, mVisor), 0, 0.02, 0.46);
  head.add(visor);
  [-1, 1].forEach(s => {
    const cup = cyl(0.12, 0.12, 0.1, mDark, 20); cup.rotation.z = Math.PI / 2; put(cup, s * 0.4, 0, 0); head.add(cup);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 8, 28), mTrim); ring.rotation.y = Math.PI / 2; put(ring, s * 0.455, 0, 0); head.add(ring);
  });
  head.add(put(rb(0.26, 0.04, 0.05, 0.01, mTrim), 0, 0.2, 0.4));

  /* ----- accessories ----- */
  const acc = {};
  acc.ears = new THREE.Group();
  [-1, 1].forEach(s => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 4), mBody); c.rotation.z = -s * 0.28; put(c, s * 0.22, 0.52, 0); acc.ears.add(c);
    const i = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), mTrim); i.rotation.z = -s * 0.28; put(i, s * 0.22, 0.5, 0.05); acc.ears.add(i);
  });
  acc.horns = new THREE.Group();
  [-1, 1].forEach(s => {
    const h = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.62, 12), mDark); h.rotation.z = -s * 0.62; put(h, s * 0.3, 0.55, 0); acc.horns.add(h);
    const t = sph(0.04, mTrim); put(t, s * 0.46, 0.8, 0); acc.horns.add(t);
  });
  acc.antenna = new THREE.Group();
  acc.antenna.add(put(cyl(0.014, 0.014, 0.55, mDark, 6), 0.2, 0.68, -0.05));
  const antBall = put(sph(0.055, mTrim), 0.2, 0.96, -0.05); acc.antenna.add(antBall);
  acc.antenna.add(put(cyl(0.012, 0.012, 0.35, mDark, 6), -0.22, 0.6, -0.05));
  acc.antenna.add(put(sph(0.04, mTrim), -0.22, 0.79, -0.05));
  acc.halo = new THREE.Group();
  const haloRing = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.022, 10, 64), mTrim); haloRing.rotation.x = Math.PI / 2; put(haloRing, 0, 0.78, 0); acc.halo.add(haloRing);
  const haloGlow = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 10, 64), mGlow); haloGlow.rotation.x = Math.PI / 2; put(haloGlow, 0, 0.78, 0); acc.halo.add(haloGlow);
  acc.spikes = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const z = 0.28 - i * 0.12, c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22 + (i % 2) * 0.1, 6), mTrim);
    c.rotation.x = -0.25 - i * 0.06; put(c, 0, 0.44 - i * 0.015, z); acc.spikes.add(c);
  }
  acc.crown = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2, c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22 + (i % 2) * 0.08, 5), mBody);
    put(c, Math.cos(a) * 0.3, 0.48, Math.sin(a) * 0.3); acc.crown.add(c);
  }
  const crownRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 40), mTrim); crownRing.rotation.x = Math.PI / 2; put(crownRing, 0, 0.4, 0); acc.crown.add(crownRing);
  acc.wings = new THREE.Group(); acc.wings.position.set(0, 1.85, -0.5); body.add(acc.wings);
  const wingParts = [];
  [-1, 1].forEach(s => {
    const w = new THREE.Group(); w.position.set(s * 0.18, 0, 0); acc.wings.add(w);
    for (let i = 0; i < 4; i++) {
      const bl = new THREE.Mesh(new THREE.ConeGeometry(0.075 - i * 0.008, 1.5 - i * 0.18, 4), i % 2 ? mTrim : mBody);
      bl.geometry.translate(0, 0.75 - i * 0.09, 0);
      bl.rotation.z = -s * (1.05 + i * 0.3); bl.rotation.x = -0.35; bl.scale.set(1, 1, 0.35);
      w.add(bl);
    }
    wingParts.push({g: w, s});
  });
  Object.values(acc).forEach(g => { g.visible = false; if (g !== acc.wings && g !== acc.halo) head.add(g); });
  head.add(acc.halo);
  acc.wings.visible = false;

  /* ----- arms ----- */
  function makeArm(s) {
    const sh = new THREE.Group(); sh.position.set(s * 0.58, 1.98, 0);
    sh.add(sph(0.2, mBody, 1, 0.85, 1));
    sh.add(put(rb(0.04, 0.16, 0.3, 0.01, mTrim), s * 0.17, 0.02, 0));
    sh.add(put(cap(0.1, 0.28, mDark), 0, -0.34, 0));
    const el = new THREE.Group(); el.position.set(0, -0.58, 0); sh.add(el);
    el.add(sph(0.11, mBody));
    el.add(put(cap(0.09, 0.3, mDark), 0, -0.3, 0));
    el.add(put(cyl(0.115, 0.1, 0.22, mBody), 0, -0.3, 0));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.014, 8, 24), mTrim); ring.rotation.x = Math.PI / 2; put(ring, 0, -0.42, 0); el.add(ring);
    const hand = put(sph(0.115, mTrim, 1, 0.9, 1.1), 0, -0.65, 0); el.add(hand);
    body.add(sh);
    return {sh, el, hand};
  }
  const armR = makeArm(1), armL = makeArm(-1);

  /* ----- legs ----- */
  function makeLeg(s) {
    const hp = new THREE.Group(); hp.position.set(s * 0.2, 1.0, 0);
    hp.add(put(cap(0.14, 0.26, mBody), 0, -0.27, 0));
    const kn = new THREE.Group(); kn.position.set(0, -0.52, 0); hp.add(kn);
    kn.add(sph(0.13, mDark));
    kn.add(put(cap(0.115, 0.28, mBody), 0, -0.27, 0));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.014, 8, 24), mTrim); ring.rotation.x = Math.PI / 2; put(ring, 0, -0.42, 0); kn.add(ring);
    kn.add(put(rb(0.27, 0.17, 0.47, 0.07, mDark), 0, -0.46, 0.07));
    kn.add(put(rb(0.25, 0.025, 0.45, 0.01, mTrim), 0, -0.545, 0.07));
    body.add(hp);
    return {hp, kn};
  }
  const legR = makeLeg(1), legL = makeLeg(-1);

  /* ----- fx: feet ring, light, hack ring ----- */
  const feetRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 48), new THREE.MeshBasicMaterial({color: 0x00f0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false}));
  feetRing.rotation.x = -Math.PI / 2; feetRing.position.y = 0.05; root.add(feetRing);
  const feetGlow = new THREE.Mesh(new THREE.CircleGeometry(1.2, 40), new THREE.MeshBasicMaterial({color: 0x00f0ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false}));
  feetGlow.rotation.x = -Math.PI / 2; feetGlow.position.y = 0.04; root.add(feetGlow);
  const light = new THREE.PointLight(0x00f0ff, 9, 9, 2); light.position.set(0, 1.9, 1.5); root.add(light);
  const hackRing = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.012, 8, 40), mTrim); hackRing.visible = false; hackRing.rotation.x = Math.PI / 2; armR.el.add(put(hackRing, 0, -0.78, 0.0));
  const hackRing2 = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.01, 8, 40), mTrim); hackRing2.visible = false; hackRing2.rotation.x = Math.PI / 2; armR.el.add(put(hackRing2, 0, -0.9, 0.0));

  /* ----- skin ----- */
  const trimColor = new THREE.Color(0x00f0ff);
  let skin = null;
  function applySkin(s, trimOverride) {
    skin = s;
    mBody.color.setHex(s.body); mBody.metalness = s.metal ?? 0.88; mBody.roughness = s.rough ?? 0.26;
    mDark.color.setHex(s.dark);
    trimColor.setHex(s.trim);
    mTrim.color.copy(trimColor).multiplyScalar(1.35);
    mVisor.color.setHex(s.visor).multiplyScalar(1.5);
    mGlow.color.copy(trimColor).multiplyScalar(1.4);
    feetRing.material.color.copy(trimColor).multiplyScalar(1.4);
    feetGlow.material.color.copy(trimColor);
    light.color.copy(trimColor);
    Object.keys(acc).forEach(k => { acc[k].visible = (k === s.acc) || (s.acc2 && k === s.acc2); });
  }
  function setSkin(s) { applySkin(s); }
  const tmpC = new THREE.Color();
  function rainbow(t) {
    tmpC.setHSL((t * 0.12) % 1, 1, 0.55); trimColor.copy(tmpC);
    mTrim.color.copy(tmpC).multiplyScalar(1.7);
    mGlow.color.copy(tmpC).multiplyScalar(1.4);
    tmpC.setHSL((t * 0.12 + 0.35) % 1, 1, 0.55); mVisor.color.copy(tmpC).multiplyScalar(1.7);
    tmpC.setHSL((t * 0.12 + 0.6) % 1, 0.55, 0.32); mBody.color.copy(tmpC);
    feetRing.material.color.copy(trimColor).multiplyScalar(1.4); feetGlow.material.color.copy(trimColor); light.color.copy(trimColor);
  }

  /* ----- animation ----- */
  let ph = 0, walk = 0, air = 0, hackBlend = 0, party = 0, look = 0;
  const handPos = new THREE.Vector3();
  function update(dt, t, st) {
    if (skin && skin.rainbow) rainbow(t);
    const spd = st.speed;                       // 0..1.6
    walk = lerp(walk, Math.min(1, spd), 1 - Math.exp(-dt * 12));
    air = lerp(air, st.grounded ? 0 : 1, 1 - Math.exp(-dt * 14));
    hackBlend = lerp(hackBlend, st.hack ? 1 : 0, 1 - Math.exp(-dt * 8));
    party = lerp(party, st.celebrate > 0 ? 1 : 0, 1 - Math.exp(-dt * 10));
    ph += dt * (7 + spd * 5.2) * (walk > 0.05 ? 1 : 0.2);
    const A = 0.95 * walk * (1 - air);
    const sw = Math.sin(ph);
    const breathe = Math.sin(t * 1.7) * 0.012;

    body.position.y = Math.abs(Math.sin(ph)) * 0.09 * walk * (1 - air) + breathe - hackBlend * 0.08 + (air * 0.05);
    body.rotation.x = 0.16 * walk * (spd > 1.1 ? 1.6 : 1) + hackBlend * 0.08 - air * 0.12;
    body.rotation.z = Math.sin(ph) * 0.04 * walk;
    head.rotation.x = -0.1 * walk - hackBlend * 0.1;
    head.rotation.y = Math.sin(t * 0.7) * 0.12 * (1 - walk) * (1 - hackBlend);

    // legs
    const tuck = air;
    legR.hp.rotation.x = lerp(sw * A, -0.7, tuck);
    legL.hp.rotation.x = lerp(-sw * A, 0.25, tuck);
    legR.kn.rotation.x = lerp(Math.max(0, -Math.cos(ph)) * A * 1.15, 1.1, tuck);
    legL.kn.rotation.x = lerp(Math.max(0, Math.cos(ph)) * A * 1.15, 0.4, tuck);
    legR.hp.rotation.z = -0.03 - hackBlend * 0.1; legL.hp.rotation.z = 0.03 + hackBlend * 0.1;

    // arms
    let rx = -sw * A * 0.9, lx = sw * A * 0.9, rz = 0.08, lz = -0.08;
    let rex = -0.25 - walk * 0.7, lex = -0.25 - walk * 0.7;
    rx = lerp(rx, -0.5, air); lx = lerp(lx, -0.5, air); rz = lerp(rz, 0.5, air); lz = lerp(lz, -0.5, air);
    // hacking: right arm points forward, left arm holds a hologram
    rx = lerp(rx, -1.45 + Math.sin(t * 9) * 0.03, hackBlend); rex = lerp(rex, -0.15, hackBlend); rz = lerp(rz, 0.02, hackBlend);
    lx = lerp(lx, -0.9, hackBlend); lex = lerp(lex, -1.3 + Math.sin(t * 7) * 0.08, hackBlend); lz = lerp(lz, -0.18, hackBlend);
    // celebrate
    rx = lerp(rx, -2.9 + Math.sin(t * 14) * 0.15, party); lx = lerp(lx, -2.9 - Math.sin(t * 14) * 0.15, party);
    rz = lerp(rz, 0.35, party); lz = lerp(lz, -0.35, party); rex = lerp(rex, -0.2, party); lex = lerp(lex, -0.2, party);
    armR.sh.rotation.set(rx, 0, rz); armL.sh.rotation.set(lx, 0, lz);
    armR.el.rotation.x = rex; armL.el.rotation.x = lex;

    // fx
    hackRing.visible = hackRing2.visible = hackBlend > 0.5;
    hackRing.rotation.z = t * 3; hackRing2.rotation.z = -t * 4.5;
    hackRing.scale.setScalar(1 + Math.sin(t * 8) * 0.12);
    visor.scale.y = hackBlend > 0.5 ? (0.7 + 0.5 * Math.abs(Math.sin(t * 22))) : 1;
    antBall.scale.setScalar(1 + Math.sin(t * 5) * 0.3);
    acc.halo.children.forEach(c => { c.position.y = 0.78 + Math.sin(t * 2) * 0.03; });
    acc.halo.rotation.y = t * 0.8;
    wingParts.forEach(w => { w.g.rotation.y = w.s * (0.12 + Math.sin(t * 1.8) * 0.05 + air * 0.35); });
    feetRing.rotation.z = t * 0.9;
    const fr = 1 + Math.sin(t * 3) * 0.05 - air * 0.15;
    feetRing.scale.setScalar(fr); feetGlow.scale.setScalar(fr);
    feetRing.material.opacity = 0.85 - air * 0.4; feetGlow.material.opacity = 0.22 - air * 0.12;
  }
  function handWorld(out) { armR.hand.getWorldPosition(out); return out; }

  setSkin({id: 'ghost', body: 0x9fb7d1, dark: 0x0d1220, trim: 0x00f0ff, visor: 0x00f0ff, acc: 'antenna'});
  return {root, setSkin, update, handWorld, trimColor, getTop: () => 2.8};
}
