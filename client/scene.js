import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {createAvatar} from './avatar.js';
import {WORLDS} from './worlds.js';

const COL = {cyan: 0x00f0ff, magenta: 0xff2bd6, green: 0x39ff88, red: 0xff3355, amber: 0xffb000, violet: 0x7a5cff};
const hdr = (hex, k = 1.6) => new THREE.Color(hex).multiplyScalar(k);
const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const FinalShader = {
  uniforms: {tDiffuse: {value: null}, uTime: {value: 0}, uGlitch: {value: 0}, uFlash: {value: 0}},
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uGlitch; uniform float uFlash; varying vec2 vUv;
    float h(float x){ return fract(sin(x*127.1)*43758.5453); }
    void main(){
      vec2 uv=vUv; float g=uGlitch;
      float band=step(0.985-g*0.25, h(floor(uv.y*32.0)+floor(uTime*9.0)));
      uv.x+=band*g*0.07*(h(uTime)-0.5);
      vec2 c=uv-0.5; float d=dot(c,c);
      float ca=0.0014+g*0.012+d*0.012;
      vec3 col=vec3(texture2D(tDiffuse,uv+c*ca*2.0).r, texture2D(tDiffuse,uv).g, texture2D(tDiffuse,uv-c*ca*2.0).b);
      col*=1.0-d*1.25;
      col*=0.965+0.035*sin(uv.y*900.0+uTime*4.0);
      col+=(h(uv.x*100.0+uv.y*10.0+uTime)-0.5)*0.025;
      col=mix(col,col*vec3(1.5,0.45,0.45),g*0.5);
      col=mix(col,vec3(1.7,1.7,1.9),uFlash);
      gl_FragColor=vec4(col,1.0);
    }`
};

export function createWorld(canvas, cb) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, powerPreference: 'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const uTimeG = {value: 0};
  const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02030a);
  scene.fog = new THREE.FogExp2(0x040616, 0.011);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 700);
  const HOME_POS = new THREE.Vector3(0, 15, 36), HOME_TGT = new THREE.Vector3(0, 6, 0);
  camera.position.copy(HOME_POS);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 7; controls.maxDistance = 75;
  controls.enablePan = false; controls.autoRotate = true; controls.autoRotateSpeed = 0.4;
  controls.target.copy(HOME_TGT);

  /* ---------- floor ---------- */
  const floorMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {uTime: {value: 0}, uC1: {value: new THREE.Color(COL.cyan)}, uC2: {value: new THREE.Color(COL.magenta)}},
    vertexShader: `varying vec3 vP; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vP=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `
      varying vec3 vP; uniform float uTime; uniform vec3 uC1; uniform vec3 uC2;
      float grid(vec2 p,float s,float w){ vec2 q=p/s; vec2 g=abs(fract(q-0.5)-0.5)/fwidth(q); float l=min(g.x,g.y); return 1.0-min(l/w,1.0); }
      void main(){
        float d=length(vP.xz);
        float g1=grid(vP.xz,2.0,1.1); float g2=grid(vP.xz,10.0,1.5);
        float fade=exp(-d*0.017);
        float pulse=smoothstep(0.0,1.0,sin(d*0.22-uTime*1.6)*0.5+0.5);
        vec3 col=mix(uC1,uC2,clamp(d/95.0,0.0,1.0));
        float a=(g1*0.2+g2*0.65)*fade;
        col*=1.0+pulse*0.5;
        gl_FragColor=vec4(col*a*1.0,a);
      }`
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const floorDark = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), new THREE.MeshBasicMaterial({color: 0x02030a}));
  floorDark.rotation.x = -Math.PI / 2; floorDark.position.y = -0.05;
  scene.add(floorDark);

  /* ---------- retro sun ---------- */
  const sunMat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: {uTop: {value: new THREE.Color(0xff1f8c)}, uBot: {value: new THREE.Color(0xffb81f)}},
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uTop; uniform vec3 uBot; varying vec2 vUv; void main(){
      float y=vUv.y; vec3 top=uTop; vec3 bot=uBot;
      vec3 c=mix(bot,top,smoothstep(0.0,1.0,y));
      float stripe=step(0.55,fract(y*20.0)); if(y<0.52 && stripe<0.5) discard;
      gl_FragColor=vec4(c*1.15,1.0); }`
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(46, 48, 32), sunMat);
  sun.position.set(40, 38, -300);
  scene.add(sun);

  /* ---------- city (rebuilt per world theme) ---------- */
  const cityGroup = new THREE.Group(); scene.add(cityGroup);
  function clearGroup(g) { while (g.children.length) { const c = g.children[0]; g.remove(c); disposeObj(c); } }
  const pyrGeo = new THREE.ConeGeometry(0.7071, 1, 4, 1, false); pyrGeo.rotateY(Math.PI / 4); pyrGeo.translate(0, 0.5, 0);
  function buildCity(W, seed) {
    clearGroup(cityGroup);
    const rng = mulberry(((seed | 0) ^ 0x2f6a1b) + W.id * 977), st = W.style, N = 150;
    const col = [new THREE.Color(W.c1), new THREE.Color(W.c2), new THREE.Color(W.c3)];
    const items = [];
    for (let i = 0; i < N; i++) {
      const a = rng() * Math.PI * 2, r = 36 + rng() * 85;
      let w = 2 + rng() * 5, d = 2 + rng() * 5, h = 6 + rng() * (10 + r * 0.42), kind = 'box', yaw = 0;
      if (st === 'stacks') { w = 4 + rng() * 7; d = 4 + rng() * 7; h = 4 + rng() * (8 + r * 0.18); }
      else if (st === 'spires') { kind = 'pyr'; w = 2 + rng() * 3; d = w; h = 14 + rng() * (16 + r * 0.6); }
      else if (st === 'crystals') { kind = 'pyr'; w = 3 + rng() * 6; d = w * (0.7 + rng() * 0.6); h = 8 + rng() * (14 + r * 0.4); yaw = rng() * Math.PI; }
      else if (st === 'obelisks') { w = 1.4 + rng() * 2; d = w; h = 18 + rng() * (20 + r * 0.7); }
      else if (st === 'mixed' && rng() < 0.4) { kind = 'pyr'; h *= 1.2; yaw = rng() * Math.PI; }
      items.push({kind, x: Math.cos(a) * r, z: Math.sin(a) * r, w, d, h, yaw, c: col[Math.floor(rng() * 3)]});
    }
    const bodyCol = new THREE.Color(W.bg).multiplyScalar(1.6).add(new THREE.Color(0x010206));
    const boxes = items.filter(i => i.kind === 'box'), pyrs = items.filter(i => i.kind === 'pyr');
    const dummy = new THREE.Object3D();
    [[boxes, new THREE.BoxGeometry(1, 1, 1), 0.5], [pyrs, pyrGeo.clone(), 0]].forEach(([arr, geo, oy]) => {
      if (!arr.length) return;
      const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({color: bodyCol}), arr.length);
      arr.forEach((b, i) => { dummy.position.set(b.x, oy * b.h, b.z); dummy.scale.set(b.w, b.h, b.d); dummy.rotation.set(0, b.yaw, 0); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
      cityGroup.add(im);
    });
    const lp = [], lc = [], wp = [], wc = [];
    const BE = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    const PE = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4]];
    items.forEach(b => {
      const cs = Math.cos(b.yaw), sn = Math.sin(b.yaw);
      const P3 = (lx, y, lz) => [b.x + lx * cs + lz * sn, y, b.z - lx * sn + lz * cs];
      const hw = b.w / 2, hd = b.d / 2;
      const C = b.kind === 'box'
        ? [P3(-hw, 0, -hd), P3(hw, 0, -hd), P3(hw, 0, hd), P3(-hw, 0, hd), P3(-hw, b.h, -hd), P3(hw, b.h, -hd), P3(hw, b.h, hd), P3(-hw, b.h, hd)]
        : [P3(-hw, 0, -hd), P3(hw, 0, -hd), P3(hw, 0, hd), P3(-hw, 0, hd), [b.x, b.h, b.z]];
      (b.kind === 'box' ? BE : PE).forEach(([p, q]) => { lp.push(...C[p], ...C[q]); lc.push(b.c.r, b.c.g, b.c.b, b.c.r, b.c.g, b.c.b); });
      if (b.kind === 'box') {
        const nW = Math.floor(8 + rng() * 20);
        for (let k = 0; k < nW; k++) {
          const face = Math.floor(rng() * 4), yy = 1 + rng() * (b.h - 2), u = rng();
          let lx, lz;
          if (face === 0) { lx = -hw + u * b.w; lz = -hd - 0.03; } else if (face === 1) { lx = -hw + u * b.w; lz = hd + 0.03; }
          else if (face === 2) { lx = -hw - 0.03; lz = -hd + u * b.d; } else { lx = hw + 0.03; lz = -hd + u * b.d; }
          const q = P3(lx, yy, lz); wp.push(...q);
          const cc = rng() < 0.6 ? new THREE.Color(0xffd27a).lerp(b.c, 0.25) : b.c;
          wc.push(cc.r * 1.1, cc.g * 1.1, cc.b * 1.1);
        }
      }
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
    cityGroup.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({vertexColors: true, transparent: true, opacity: 0.6})));
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    wg.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
    cityGroup.add(new THREE.Points(wg, new THREE.PointsMaterial({size: 0.55, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false})));
    // blinking beacons on the tallest structures
    const tall = items.slice().sort((a, b) => b.h - a.h).slice(0, 14);
    const bp = new Float32Array(tall.length * 3); tall.forEach((b, i) => { bp[i * 3] = b.x; bp[i * 3 + 1] = b.h + 0.6; bp[i * 3 + 2] = b.z; });
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
    beaconMat = new THREE.PointsMaterial({size: 5, sizeAttenuation: true, map: dotTex, color: new THREE.Color(W.c2).multiplyScalar(2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false});
    cityGroup.add(new THREE.Points(bg, beaconMat));
  }
  let beaconMat = null;

  /* ---------- data motes ---------- */
  const moteMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {uTime: {value: 0}, uA: {value: new THREE.Color(0x00f0ff)}, uB: {value: new THREE.Color(0xff2bd6)}},
    vertexShader: `
      uniform float uTime; attribute float aS; attribute float aP; varying float vA; varying float vM;
      void main(){
        vec3 p=position; p.y=mod(p.y+uTime*aS,42.0); p.x+=sin(uTime*0.3+aP*6.28)*0.7;
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        gl_PointSize=clamp((70.0/-mv.z)*(0.6+aP*0.9),1.0,7.0);
        vA=smoothstep(0.0,6.0,p.y)*(1.0-smoothstep(32.0,42.0,p.y)); vM=aP;
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `
      uniform vec3 uA; uniform vec3 uB; varying float vA; varying float vM;
      void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard;
        vec3 c=mix(uA,uB,step(0.7,vM));
        gl_FragColor=vec4(c*1.0,(1.0-d*2.0)*0.8*vA); }`
  });
  (function () {
    const n = 1300, pos = new Float32Array(n * 3), s = new Float32Array(n), p = new Float32Array(n), rng = mulberry(5);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, r = 4 + Math.sqrt(rng()) * 70;
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = rng() * 42; pos[i * 3 + 2] = Math.sin(a) * r;
      s[i] = 0.5 + rng() * 1.8; p[i] = rng();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
    g.setAttribute('aP', new THREE.BufferAttribute(p, 1));
    const pts = new THREE.Points(g, moteMat); pts.frustumCulled = false; scene.add(pts);
  })();

  /* ---------- hub ---------- */
  const hub = new THREE.Group(); hub.position.set(0, 3, 0); scene.add(hub);
  const hubWire = new THREE.Mesh(new THREE.IcosahedronGeometry(2.3, 1), new THREE.MeshBasicMaterial({color: hdr(COL.cyan, 1.2), wireframe: true, transparent: true, opacity: 0.9}));
  const hubCore = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 20), new THREE.MeshBasicMaterial({color: new THREE.Color(1, 1, 1).multiplyScalar(1.7)}));
  hub.add(hubWire, hubCore);
  const hubRings = [];
  [[3.3, 0], [4.1, 1.1], [5.0, 2.2]].forEach(([r, tilt], i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.04, 8, 120), new THREE.MeshBasicMaterial({color: hdr(i === 1 ? COL.magenta : COL.cyan, 1.3), transparent: true, opacity: 0.85}));
    ring.rotation.x = Math.PI / 2 + tilt * 0.35; ring.rotation.y = tilt * 0.5;
    hub.add(ring); hubRings.push(ring);
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 80, 16, 1, true), new THREE.MeshBasicMaterial({color: hdr(COL.cyan, 1.2), transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide}));
  beam.position.y = 40; scene.add(beam);
  const hubFloor = new THREE.Mesh(new THREE.RingGeometry(5.6, 5.8, 80), new THREE.MeshBasicMaterial({color: hdr(COL.cyan, 1.2), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, side: THREE.DoubleSide}));
  hubFloor.rotation.x = -Math.PI / 2; hubFloor.position.y = 0.04; scene.add(hubFloor);

  /* ---------- lights + environment (PBR avatar) ---------- */
  const hemiL = new THREE.HemisphereLight(0x6fa8ff, 0x1a0630, 0.55); scene.add(hemiL);
  const keyL = new THREE.DirectionalLight(0xbfe8ff, 2.4); keyL.position.set(8, 14, 10); scene.add(keyL);
  const rimL = new THREE.DirectionalLight(0xff2bd6, 3.2); rimL.position.set(-10, 6, -12); scene.add(rimL);
  let envTex = null;
  function buildEnv(W) {
    const pm = new THREE.PMREMGenerator(renderer);
    const es = new THREE.Scene(); es.background = new THREE.Color(0x04060e);
    const strip = (w, h, x, y, z, hex, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m);
    };
    strip(16, 2.2, 0, 11, 13, W.c1, 4.5); strip(16, 2.2, -13, 7, -7, W.c2, 5); strip(7, 7, 13, 5, -8, 0xffffff, 2.2);
    strip(10, 1.5, 12, 3, 9, W.c3, 3.5); strip(40, 40, 0, -12, 0, W.c1, 0.9);
    if (envTex) envTex.dispose();
    envTex = pm.fromScene(es, 0.03).texture; scene.environment = envTex; pm.dispose();
    es.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }

  /* ---------- stars ---------- */
  (function stars() {
    const n = 1500, p = new Float32Array(n * 3), rng = mulberry(77);
    for (let i = 0; i < n; i++) {
      const th = rng() * Math.PI * 2, ph = 0.05 + rng() * 1.35;
      p[i * 3] = Math.sin(ph) * Math.cos(th) * 380; p[i * 3 + 1] = Math.cos(ph) * 380; p[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 380;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({size: 1.7, sizeAttenuation: false, color: 0xcfe6ff, fog: false, transparent: true, opacity: 0.85})));
  })();

  /* ---------- floor rings ---------- */
  const floorRings = [];
  [[6.9, 7.1, 'c2', 0.7], [23.9, 24.1, 'c1', 0.45], [32.7, 33.0, 'c3', 0.8]].forEach(([a, b, key, o]) => {
    const hex = COL.cyan;
    const m = new THREE.Mesh(new THREE.RingGeometry(a, b, 200), new THREE.MeshBasicMaterial({color: hdr(hex, 1.2), transparent: true, opacity: o, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false}));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.045; scene.add(m); floorRings.push({m, key});
  });

  /* ---------- boundary wall ---------- */
  const wallMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: {uP: {value: new THREE.Vector3(0, 0, 24)}, uC: {value: new THREE.Color(0.1, 0.9, 1.0)}},
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `
      uniform vec3 uP; uniform vec3 uC; varying vec2 vUv; varying vec3 vW;
      void main(){
        vec2 q=vec2(vUv.x*96.0, vW.y*0.4);
        vec2 g=abs(fract(q-0.5)-0.5)/fwidth(q);
        float line=1.0-min(min(g.x,g.y)/1.3,1.0);
        float prox=smoothstep(16.0,1.5,distance(uP.xz,vW.xz));
        float h=1.0-smoothstep(0.0,15.0,vW.y);
        float a=(line*0.95+0.05)*prox*h+line*0.05*h;
        gl_FragColor=vec4(uC*a*1.3,a);
      }`
  });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 16, 128, 1, true), wallMat); wall.position.y = 8; scene.add(wall);

  /* ---------- billboards ---------- */
  const boardGroup = new THREE.Group(); scene.add(boardGroup);
  function buildBoards(W) {
    clearGroup(boardGroup);
    const txt = W.boards, cols = [W.c1, W.c2, W.c3, 0xffffff];
    for (let i = 0; i < 8; i++) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 256;
      const x = c.getContext('2d'), hex = '#' + new THREE.Color(cols[i % cols.length]).getHexString();
      x.fillStyle = 'rgba(4,8,20,.72)'; x.fillRect(0, 0, 512, 256);
      x.strokeStyle = hex; x.lineWidth = 8; x.shadowColor = hex; x.shadowBlur = 22; x.strokeRect(14, 14, 484, 228);
      x.fillStyle = '#fff'; x.font = 'bold 92px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt[i], 256, 118);
      x.fillStyle = hex; x.font = '32px Consolas, monospace'; x.fillText('— GHOST//GRID —', 256, 205);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(11, 5.5), new THREE.MeshBasicMaterial({map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide}));
      const a = i / 8 * Math.PI * 2 + 0.3, r = 42 + (i % 3) * 5;
      m.position.set(Math.cos(a) * r, 9 + (i % 3) * 4, Math.sin(a) * r); m.lookAt(0, m.position.y, 0); boardGroup.add(m);
    }
  }

  /* ---------- flying cars ---------- */
  const cars = (function () {
    const N = 44, im = new THREE.InstancedMesh(new THREE.BoxGeometry(4.2, 0.2, 0.55), new THREE.MeshBasicMaterial({color: 0xffffff}), N);
    const rng = mulberry(31), data = [], cl = [COL.cyan, COL.magenta, COL.amber, COL.violet, 0xffffff];
    for (let i = 0; i < N; i++) {
      data.push({R: 48 + rng() * 72, h: 12 + rng() * 36, a: rng() * 6.28, v: (7 + rng() * 9) * (rng() < 0.5 ? -1 : 1)});
      im.setColorAt(i, new THREE.Color(cl[Math.floor(rng() * cl.length)]).multiplyScalar(2.2));
    }
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; scene.add(im);
    return {im, data, d: new THREE.Object3D()};
  })();

  /* ---------- label helper ---------- */
  function makeLabel(title, sub, hex) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const x = c.getContext('2d'); x.textAlign = 'center';
    const css = '#' + new THREE.Color(hex).getHexString();
    x.shadowColor = css; x.shadowBlur = 18; x.fillStyle = '#ffffff';
    x.font = 'bold 54px Consolas, "Courier New", monospace'; x.fillText(title, 256, 70);
    x.shadowBlur = 10; x.fillStyle = css; x.font = '34px Arial, sans-serif'; x.fillText(sub, 256, 124);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthTest: false, toneMapped: false}));
    sp.scale.set(8, 2.5, 1); sp.renderOrder = 10;
    sp.userData.tex = tex;
    return sp;
  }
  const TYPE_NAME = {code: 'פיצוח קוד', caesar: 'פענוח הצפנה', sequence: 'רצף חומת אש', typing: 'הקלדה מהירה', boss: '👑 בוס'};
  function geoFor(type) {
    if (type === 'boss') return new THREE.TorusKnotGeometry(1.5, 0.45, 120, 14);
    if (type === 'code') return new THREE.OctahedronGeometry(1.7, 0);
    if (type === 'caesar') return new THREE.TorusKnotGeometry(1.0, 0.32, 90, 10);
    if (type === 'sequence') return new THREE.DodecahedronGeometry(1.6, 0);
    return new THREE.IcosahedronGeometry(1.6, 1);
  }

  /* ---------- nodes ---------- */
  const nodeGroup = new THREE.Group(); scene.add(nodeGroup);
  const nodes = new Map();
  let mode = 'free', previewing = false;
  let hacking = null, hover = null, glitch = 0, glitchDecay = 0, bloomTarget = 0.6;

  function disposeObj(o) {
    o.traverse(ch => {
      if (ch.geometry) ch.geometry.dispose();
      if (ch.material) {
        if (ch.material.map) ch.material.map.dispose();
        ch.material.dispose();
      }
    });
  }
  function clearNodes() {
    while (nodeGroup.children.length) { const c = nodeGroup.children[0]; nodeGroup.remove(c); disposeObj(c); }
    nodes.clear();
  }
  function setNodes(list) {
    clearNodes();
    const n = list.length;
    list.forEach((d, i) => {
      const ang = (i / n) * Math.PI * 2 + 0.5;
      const r = 13 + (i % 2) * 4.5;
      const y = 4.5 + ((i * 37) % 5) * 1.5;
      const base = new THREE.Vector3(Math.cos(ang) * r, y, Math.sin(ang) * r);
      const colHex = d.done ? COL.green : (d.boss ? COL.amber : (d.ai ? COL.magenta : theme.c1));
      const g = new THREE.Group(); g.position.copy(base);
      const wire = new THREE.Mesh(geoFor(d.type), new THREE.MeshBasicMaterial({color: hdr(colHex, 1.15), wireframe: true, transparent: true, opacity: 0.92}));
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshBasicMaterial({color: hdr(colHex, 1.9)}));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.04, 8, 90), new THREE.MeshBasicMaterial({color: hdr(colHex, 1.3), transparent: true, opacity: 0.9}));
      ring.rotation.x = Math.PI / 2.3;
      const hit = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), new THREE.MeshBasicMaterial({transparent: true, opacity: 0, depthWrite: false}));
      hit.userData.id = d.id;
      const label = makeLabel(d.label, d.done ? '✓ נפרץ' : (TYPE_NAME[d.type] || ''), colHex);
      label.position.set(0, 3.9, 0);
      g.add(wire, core, ring, hit, label);
      nodeGroup.add(g);

      const polePts = [new THREE.Vector3(base.x, 0.03, base.z), base.clone()];
      const pole = new THREE.Line(new THREE.BufferGeometry().setFromPoints(polePts), new THREE.LineBasicMaterial({color: hdr(colHex, 1.0), transparent: true, opacity: 0.4}));
      const fr = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.9, 48), new THREE.MeshBasicMaterial({color: hdr(colHex, 1.2), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, side: THREE.DoubleSide}));
      fr.rotation.x = -Math.PI / 2; fr.position.set(base.x, 0.05, base.z);
      nodeGroup.add(pole, fr);

      const hubPos = new THREE.Vector3(0, 3, 0);
      const mid = new THREE.Vector3(base.x / 2, Math.max(base.y, 3) + 5.5, base.z / 2);
      const curve = new THREE.QuadraticBezierCurve3(hubPos, mid, base.clone());
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(56)), new THREE.LineBasicMaterial({color: hdr(colHex, 1.1), transparent: true, opacity: 0.5}));
      nodeGroup.add(line);
      {
        const sl = Math.hypot(base.x, base.z), s0 = 7.4, s1 = sl - 2.2, slen = Math.max(1, s1 - s0);
        const sg = new THREE.PlaneGeometry(slen, 0.9); sg.rotateX(-Math.PI / 2);
        const strip = new THREE.Mesh(sg, new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
          uniforms: {uT: uTimeG, uC: {value: hdr(colHex, 1.1)}, uL: {value: slen}},
          vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
          fragmentShader: 'uniform float uT; uniform vec3 uC; uniform float uL; varying vec2 vUv; void main(){ float e=1.0-smoothstep(0.0,0.12,min(vUv.y,1.0-vUv.y)); float d=step(0.5,fract(vUv.x*uL*0.35-uT*0.9)); float f=smoothstep(0.0,0.08,vUv.x)*smoothstep(1.0,0.92,vUv.x); float a=(e*0.9+d*0.18)*f; gl_FragColor=vec4(uC*a,a); }'
        }));
        const mid = (s0 + s1) / 2;
        strip.position.set(base.x / sl * mid, 0.045, base.z / sl * mid); strip.rotation.y = Math.atan2(-base.z, base.x);
        nodeGroup.add(strip);
      }
      const pulses = [];
      for (let k = 0; k < 2; k++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshBasicMaterial({color: hdr(colHex, 2.6)}));
        nodeGroup.add(m); pulses.push({mesh: m, t: k * 0.5 + Math.random() * 0.2, sp: 0.18 + Math.random() * 0.12});
      }
      nodes.set(d.id, {g, wire, core, ring, hit, label, base, curve, pulses, pole, fr, line, colHex, baseCol: new THREE.Color(colHex), phase: Math.random() * 6.28, flash: 0, done: d.done});
    });
  }

  /* ---------- camera tween ---------- */
  let tween = null;
  function flyTo(pos, tgt, dur = 1.5) {
    tween = {t: 0, dur, p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: tgt.clone()};
    controls.autoRotate = false;
  }
  function focusNode(id) {
    const n = nodes.get(id); if (!n) return;
    if (mode === 'play') {
      if (Math.hypot(n.base.x - P.pos.x, n.base.z - P.pos.z) > 9) {
        const r = Math.hypot(n.base.x, n.base.z) || 1, ux = n.base.x / r, uz = n.base.z / r;
        teleportTo(n.base.x + ux * 5.6, n.base.z + uz * 5.6, Math.atan2(-ux, -uz));
      }
      return;
    }
    const dir = new THREE.Vector3(n.base.x, 0, n.base.z); if (dir.lengthSq() < 0.01) dir.set(1, 0, 0); dir.normalize();
    flyTo(n.base.clone().addScaledVector(dir, 11).add(new THREE.Vector3(0, 3.2, 0)), n.base.clone().add(new THREE.Vector3(0, 0.3, 0)));
  }
  function focusHub() { if (mode === 'play') return; flyTo(HOME_POS, HOME_TGT, 1.6); setTimeout(() => { if (!tween) controls.autoRotate = true; }, 1700); }

  /* ---------- effects ---------- */
  const bursts = [], shocks = [];
  function burstAt(x, y, z, hex = COL.green, count = 300, ring = true) {
    const pos = new Float32Array(count * 3), vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = 3 + Math.random() * 9;
      vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp; vel[i * 3 + 1] = Math.cos(ph) * sp * 0.8 + 2; vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({size: 0.26, map: dotTex, color: hdr(hex, 2.2), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false}));
    pts.frustumCulled = false; scene.add(pts);
    bursts.push({pts, vel, life: 0, max: 1.9});
    if (ring) {
      const sh = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 64), new THREE.MeshBasicMaterial({color: hdr(hex, 2.4), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false}));
      sh.rotation.x = -Math.PI / 2; sh.position.set(x, 0.1, z); scene.add(sh);
      shocks.push({mesh: sh, life: 0, max: 1.4});
    }
  }
  function burst(id, hex = COL.green) {
    const n = nodes.get(id); if (!n) return;
    burstAt(n.base.x, n.base.y, n.base.z, hex, 300, true);
    columnFx(n.base.x, n.base.z, hex);
  }
  const cols = [];
  function columnFx(x, z, hex) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 46, 20, 1, true), new THREE.MeshBasicMaterial({color: hdr(hex, 1.5), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide}));
    m.position.set(x, 23, z); scene.add(m); cols.push({m, life: 0, max: 0.7});
  }
  function failFx(id) { const n = nodes.get(id); if (n) n.flash = 1; setGlitch(1, 0.7); }
  function setGlitch(v, dur) { glitch = v; glitchDecay = v / Math.max(0.05, dur); }

  /* ---------- player ---------- */
  const avatar = createAvatar(); scene.add(avatar.root);
  const P = {pos: new THREE.Vector3(0, 0, 24), vy: 0, heading: Math.PI, grounded: true, speed: 0, dx: 0, dz: -1, celebrate: 0};
  avatar.root.position.copy(P.pos); avatar.root.rotation.y = P.heading;
  const keys = new Set(), joy = {x: 0, y: 0};
  let jumpReq = false, near = null, camY = 1.7;
  const R_MAX = 32.5, HUB_R = 7.2, NODE_R = 2.4;
  const UP = new THREE.Vector3(0, 1, 0);

  const sc = document.createElement('canvas'); sc.width = sc.height = 64;
  { const sx = sc.getContext('2d'), gr = sx.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); sx.fillStyle = gr; sx.fillRect(0, 0, 64, 64); }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false}));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.035; shadow.renderOrder = 1; scene.add(shadow);

  const TR = 90, trPos = new Float32Array(TR * 3), trB = new Float32Array(TR).fill(-100);
  const trGeo = new THREE.BufferGeometry();
  trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3)); trGeo.setAttribute('aB', new THREE.BufferAttribute(trB, 1));
  const trMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {uT: uTimeG, uC: {value: new THREE.Color(0x00f0ff)}},
    vertexShader: `uniform float uT; attribute float aB; varying float vA; void main(){ float age=uT-aB; vA=clamp(1.0-age/0.9,0.0,1.0); vec3 p=position; p.y+=age*0.7; vec4 mv=modelViewMatrix*vec4(p,1.0); gl_PointSize=clamp((90.0/-mv.z)*(0.5+age*0.8),1.0,18.0)*step(0.001,vA); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uC; varying float vA; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor=vec4(uC*1.5,(1.0-d*2.0)*vA*0.9); }`
  });
  const trail = new THREE.Points(trGeo, trMat); trail.frustumCulled = false; scene.add(trail);
  let trI = 0, trAcc = 0;

  const hbeam = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1, 8, 1, true), new THREE.MeshBasicMaterial({color: hdr(COL.cyan, 1.6), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false}));
  const hbeam2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 10, 1, true), new THREE.MeshBasicMaterial({color: hdr(COL.cyan, 1.2), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false}));
  hbeam.visible = hbeam2.visible = false; scene.add(hbeam, hbeam2);
  const bpuls = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({color: hdr(0xffffff, 2.4)})); m.visible = false; scene.add(m); return m; });
  const hA = new THREE.Vector3(), hB = new THREE.Vector3(), hD = new THREE.Vector3();

  const focusOf = out => out.set(P.pos.x, camY, P.pos.z);
  function behindCam(dist = 8.5, h = 3.6) {
    tween = null; camY = 1.7; focusOf(tmpF);
    controls.target.copy(tmpF);
    camera.position.set(tmpF.x - Math.sin(P.heading) * dist, tmpF.y + h, tmpF.z - Math.cos(P.heading) * dist);
    controls.update();
  }
  const tmpF = new THREE.Vector3();
  function setMode(m, dur = 1.3) {
    mode = m; tween = null; previewing = false;
    if (m === 'play') {
      controls.autoRotate = false; controls.minDistance = 3.5; controls.maxDistance = 18; controls.maxPolarAngle = Math.PI * 0.485;
      camY = 1.7; focusOf(tmpF);
      flyTo(new THREE.Vector3(tmpF.x - Math.sin(P.heading) * 8.5, tmpF.y + 3.6, tmpF.z - Math.cos(P.heading) * 8.5), tmpF.clone(), dur);
    } else {
      controls.minDistance = 7; controls.maxDistance = 75; controls.maxPolarAngle = Math.PI * 0.49;
      flyTo(HOME_POS, HOME_TGT, 1.6);
      setTimeout(() => { if (!tween && mode === 'free' && !hacking && !previewing) controls.autoRotate = true; }, 1700);
    }
  }
  function teleportTo(x, z, face, fx = true) {
    if (fx) { columnFx(P.pos.x, P.pos.z, avatar.trimColor.getHex()); burstAt(P.pos.x, 1.4, P.pos.z, avatar.trimColor.getHex(), 140, false); }
    P.pos.set(x, 0, z); P.vy = 0; P.grounded = true; P.speed = 0; P.heading = face;
    behindCam();
    if (fx) { columnFx(x, z, avatar.trimColor.getHex()); burstAt(x, 1.4, z, avatar.trimColor.getHex(), 160, true); setGlitch(0.55, 0.4); }
  }
  function previewSkin(on) {
    if (on === previewing) return;
    previewing = on;
    if (on) {
      const fx = Math.sin(P.heading), fz = Math.cos(P.heading), rx = fz, rz = -fx;
      controls.autoRotate = false; controls.minDistance = 3; controls.maxDistance = 20; controls.maxPolarAngle = Math.PI * 0.49;
      flyTo(new THREE.Vector3(P.pos.x + fx * 6.6 + rx * 0.2, 1.9, P.pos.z + fz * 6.6 + rz * 0.2), new THREE.Vector3(P.pos.x - rx * 1.45, 1.3, P.pos.z - rz * 1.45), 1.0);
    } else setMode(mode);
  }
  function celebrate() { P.celebrate = 1.8; if (P.grounded) { P.vy = 6.5; P.grounded = false; } }

  window.addEventListener('keydown', e => {
    const tg = e.target; if (tg && /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (cb.isFrozen() || mode !== 'play') return;
    const c = e.code;
    if (c === 'Space') { e.preventDefault(); if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur(); jumpReq = true; }
    else if (c.startsWith('Arrow') || c === 'KeyW' || c === 'KeyA' || c === 'KeyS' || c === 'KeyD') { e.preventDefault(); keys.add(c); }
    else if (c === 'ShiftLeft' || c === 'ShiftRight') keys.add('Shift');
    else if (c === 'KeyE' || c === 'Enter') { e.preventDefault(); if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur(); cb.onInteract && cb.onInteract(); }
  });
  window.addEventListener('keyup', e => { keys.delete(e.code); if (e.code.startsWith('Shift')) keys.delete('Shift'); });
  window.addEventListener('blur', () => keys.clear());

  function updatePlayer(dt, t) {
    const frz = cb.isFrozen(); lastPos.copy(P.pos);
    let targetSpeed = 0, run = false;
    if (mode === 'play' && previewing) {
      P.heading += dt * 0.75;
    } else if (mode === 'play' && !frz) {
      const hk = hacking != null ? nodes.get(hacking) : null;
      if (hk) {
        const dh = Math.atan2(hk.base.x - P.pos.x, hk.base.z - P.pos.z) - P.heading;
        P.heading += Math.atan2(Math.sin(dh), Math.cos(dh)) * (1 - Math.exp(-dt * 10));
      } else {
        const ix = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + joy.x;
        const iy = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + joy.y;
        const mag = Math.min(1, Math.hypot(ix, iy));
        if (mag > 0.08) {
          tmpV.set(controls.target.x - camera.position.x, 0, controls.target.z - camera.position.z);
          if (tmpV.lengthSq() < 1e-4) tmpV.set(0, 0, -1);
          tmpV.normalize();
          let dx = tmpV.x * iy - tmpV.z * ix, dz = tmpV.z * iy + tmpV.x * ix;
          const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
          P.dx = dx; P.dz = dz;
          run = keys.has('Shift') || mag > 0.95 && (joy.x || joy.y);
          targetSpeed = (run ? 9.4 : 5.6) * mag;
          const dh = Math.atan2(dx, dz) - P.heading;
          P.heading += Math.atan2(Math.sin(dh), Math.cos(dh)) * (1 - Math.exp(-dt * 14));
        }
        if (jumpReq && P.grounded) { P.vy = 9.4; P.grounded = false; }
      }
    }
    jumpReq = false;
    P.speed += (targetSpeed - P.speed) * (1 - Math.exp(-dt * (targetSpeed > P.speed ? 9 : 7)));
    if (P.speed < 0.02) P.speed = 0;
    P.pos.x += P.dx * P.speed * dt; P.pos.z += P.dz * P.speed * dt;
    // vertical
    if (!P.grounded) {
      P.vy -= 26 * dt; P.pos.y += P.vy * dt;
      if (P.pos.y <= 0) {
        if (P.vy < -7) { const sh = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.45, 40), new THREE.MeshBasicMaterial({color: hdr(avatar.trimColor.getHex(), 1.6), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false})); sh.rotation.x = -Math.PI / 2; sh.position.set(P.pos.x, 0.08, P.pos.z); scene.add(sh); shocks.push({mesh: sh, life: 0, max: 0.7}); }
        P.pos.y = 0; P.vy = 0; P.grounded = true;
      }
    }
    // collisions
    const r = Math.hypot(P.pos.x, P.pos.z);
    if (r > R_MAX) { P.pos.x *= R_MAX / r; P.pos.z *= R_MAX / r; }
    if (r < HUB_R && P.pos.y < 4) { const k = HUB_R / (r || 1); P.pos.x = r ? P.pos.x * k : HUB_R; P.pos.z = r ? P.pos.z * k : 0; }
    nodes.forEach(n => {
      const ex = P.pos.x - n.base.x, ez = P.pos.z - n.base.z, d = Math.hypot(ex, ez);
      if (d < NODE_R && P.pos.y < 3.2) { const k = NODE_R / (d || 1); P.pos.x = n.base.x + (d ? ex * k : NODE_R); P.pos.z = n.base.z + (d ? ez * k : 0); }
    });
    // celebrate timer
    P.celebrate = Math.max(0, P.celebrate - dt);
    // avatar
    avatar.root.position.copy(P.pos); avatar.root.rotation.y = P.heading;
    avatar.update(dt, t, {speed: P.speed / 5.6, grounded: P.grounded, hack: mode === 'play' && hacking != null && !previewing, celebrate: P.celebrate});
    shadow.position.set(P.pos.x, 0.035, P.pos.z); shadow.scale.setScalar(Math.max(0.5, 1 - P.pos.y * 0.14)); shadow.material.opacity = Math.max(0.2, 1 - P.pos.y * 0.15);
    wallMat.uniforms.uP.value.copy(P.pos);
    // trail
    if (P.speed > 0.6 && P.grounded) {
      trAcc += dt; trMat.uniforms.uC.value.copy(avatar.trimColor);
      while (trAcc > 0.028) {
        trAcc -= 0.028; const k = trI++ % TR;
        trPos[k * 3] = P.pos.x + (Math.random() - 0.5) * 0.35 - P.dx * 0.2; trPos[k * 3 + 1] = 0.1 + Math.random() * 0.12; trPos[k * 3 + 2] = P.pos.z + (Math.random() - 0.5) * 0.35 - P.dz * 0.2; trB[k] = t;
      }
      trGeo.attributes.position.needsUpdate = true; trGeo.attributes.aB.needsUpdate = true;
    }
    // proximity
    let best = null, bd = 6.5;
    if (mode === 'play' && !frz && !previewing) nodes.forEach((n, id) => { const d = Math.hypot(n.base.x - P.pos.x, n.base.z - P.pos.z); if (d < bd) { bd = d; best = id; } });
    if (best !== near) { near = best; cb.onNear && cb.onNear(near); }
    // hack beam
    const hk = mode === 'play' && hacking != null && !previewing ? nodes.get(hacking) : null;
    if (hk) {
      avatar.handWorld(hA); hB.copy(hk.g.position); hD.subVectors(hB, hA);
      const len = hD.length(); hD.normalize();
      [hbeam, hbeam2].forEach(b => { b.visible = true; b.position.copy(hA).addScaledVector(hD, len / 2); b.scale.set(1, len, 1); b.quaternion.setFromUnitVectors(UP, hD); b.material.color.copy(hdr(hk.colHex, b === hbeam ? 1.6 : 1.2)); });
      bpuls.forEach((m, i) => { m.visible = true; m.position.copy(hA).addScaledVector(hD, len * (((t * 1.6) + i / 3) % 1)); });
    } else { hbeam.visible = hbeam2.visible = false; bpuls.forEach(m => m.visible = false); }
    return dP.subVectors(P.pos, lastPos);
  }
  const lastPos = new THREE.Vector3(), dP = new THREE.Vector3();

  /* ---------- weather ---------- */
  const weatherMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {uT: uTimeG, uMode: {value: 0}, uCol: {value: new THREE.Color(1, 1, 1)}},
    vertexShader: `
      uniform float uT; uniform float uMode; attribute float aS; attribute float aP; varying float vA;
      void main(){
        vec3 p=position; float H=44.0;
        float spd = uMode<1.5 ? 26.0+aS*10.0 : (uMode<2.5 ? 2.0+aS*2.0 : (uMode<3.5 ? -(3.0+aS*3.0) : -(1.2+aS*1.2)));
        p.y=mod(p.y-uT*spd,H);
        float sw=uMode>1.5?1.2:0.08;
        p.x+=sin(uT*0.7+aP*20.0)*sw; p.z+=cos(uT*0.5+aP*13.0)*sw;
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        float sz=uMode<1.5?2.2:(uMode<2.5?5.0:4.0);
        gl_PointSize=clamp(sz*(60.0/-mv.z)*(0.6+aP),1.0,14.0);
        vA=smoothstep(0.0,3.0,p.y)*smoothstep(H,H-6.0,p.y)*step(0.5,uMode)*(uMode<1.5?0.5:0.9);
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `
      uniform float uMode; uniform vec3 uCol; varying float vA;
      void main(){ vec2 q=gl_PointCoord-0.5; if(uMode<1.5) q*=vec2(3.2,0.6); float d=length(q); if(d>0.5) discard;
        gl_FragColor=vec4(uCol*(1.0-d*1.4),vA*(1.0-d*2.0)); }`
  });
  (function () {
    const n = 1800, pos = new Float32Array(n * 3), sp = new Float32Array(n), ph = new Float32Array(n), rng = mulberry(99);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 48;
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = rng() * 44; pos[i * 3 + 2] = Math.sin(a) * r; sp[i] = rng(); ph[i] = rng();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.BufferAttribute(sp, 1)); g.setAttribute('aP', new THREE.BufferAttribute(ph, 1));
    const pts = new THREE.Points(g, weatherMat); pts.frustumCulled = false; scene.add(pts);
  })();

  /* ---------- patrol drones ---------- */
  const droneGroup = new THREE.Group(); scene.add(droneGroup);
  let drones = [], droneCool = 0;
  function setDrones(list) {
    clearGroup(droneGroup); drones = [];
    (list || []).forEach(d => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), new THREE.MeshBasicMaterial({color: hdr(COL.red, 1.4), wireframe: true}));
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), new THREE.MeshBasicMaterial({color: hdr(0xffffff, 2)}));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.05, 8, 40), new THREE.MeshBasicMaterial({color: hdr(COL.red, 1.5)}));
      ring.rotation.x = Math.PI / 2; g.add(body, core, ring);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 2.6, 1, 28, 1, true), new THREE.MeshBasicMaterial({color: hdr(COL.red, 1.2), transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide}));
      const spot = new THREE.Mesh(new THREE.RingGeometry(2.25, 2.6, 40), new THREE.MeshBasicMaterial({color: hdr(COL.red, 1.6), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false}));
      spot.rotation.x = -Math.PI / 2;
      const fill = new THREE.Mesh(new THREE.CircleGeometry(2.25, 40), new THREE.MeshBasicMaterial({color: hdr(COL.red, 1.0), transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false}));
      fill.rotation.x = -Math.PI / 2;
      droneGroup.add(g, cone, spot, fill);
      drones.push({d, g, body, ring, cone, spot, fill, alert: 0});
    });
  }
  function updateDrones(dt, t) {
    const T = Date.now() / 1000;
    droneCool = Math.max(0, droneCool - dt);
    drones.forEach((o, i) => {
      const d = o.d, a = d.phase + ((T * (d.v / d.r)) % (Math.PI * 2));
      const x = Math.cos(a) * d.r, z = Math.sin(a) * d.r, y = d.h + Math.sin(t * 2 + i) * 0.25;
      o.g.position.set(x, y, z); o.body.rotation.y += dt * 2; o.ring.rotation.z += dt * 3;
      o.cone.position.set(x, y / 2, z); o.cone.scale.set(1, y, 1);
      o.spot.position.set(x, 0.07, z); o.fill.position.set(x, 0.065, z);
      o.alert = Math.max(0, o.alert - dt * 2);
      const k = 1 + o.alert * 0.25; o.spot.scale.setScalar(k); o.fill.material.opacity = 0.13 + o.alert * 0.3;
      if (mode === 'play' && !previewing && view === 'world' && droneCool <= 0 && P.pos.y < 2.6 && Math.hypot(P.pos.x - x, P.pos.z - z) < 2.5) {
        droneCool = 1.6; o.alert = 1; setGlitch(0.8, 0.5); cb.onDroneHit && cb.onDroneHit(i);
      }
    });
  }

  /* ---------- other players ---------- */
  const peers = new Map();
  function addPeer(id, name, skin) {
    if (peers.has(id)) return;
    const av = createAvatar(); av.root.traverse(o => { if (o.isPointLight) o.visible = false; });
    if (skin) av.setSkin(skin);
    scene.add(av.root);
    const label = makeLabel(name, '', COL.cyan); label.scale.set(5.2, 1.6, 1); scene.add(label);
    peers.set(id, {av, label, tp: new THREE.Vector3(), th: 0, first: true, sp: 0});
  }
  function setPeerState(id, p) { const o = peers.get(id); if (!o) return; o.tp.set(p[0], p[1], p[2]); o.th = p[3]; if (o.first) { o.av.root.position.copy(o.tp); o.av.root.rotation.y = o.th; o.first = false; } }
  function setPeerSkin(id, skin) { const o = peers.get(id); if (o && skin) o.av.setSkin(skin); }
  function removePeer(id) { const o = peers.get(id); if (!o) return; scene.remove(o.av.root, o.label); disposeObj(o.av.root); disposeObj(o.label); peers.delete(id); }
  function clearPeers() { [...peers.keys()].forEach(removePeer); }
  const _pv = new THREE.Vector3();
  function updatePeers(dt, t) {
    peers.forEach(o => {
      const r = o.av.root; _pv.copy(r.position);
      r.position.lerp(o.tp, 1 - Math.exp(-dt * 10));
      const dh = Math.atan2(Math.sin(o.th - r.rotation.y), Math.cos(o.th - r.rotation.y)); r.rotation.y += dh * (1 - Math.exp(-dt * 10));
      const sp = dt > 0 ? Math.hypot(r.position.x - _pv.x, r.position.z - _pv.z) / dt : 0;
      o.sp += (sp - o.sp) * (1 - Math.exp(-dt * 8));
      o.av.update(dt, t, {speed: o.sp / 5.6, grounded: r.position.y < 0.05, hack: false, celebrate: 0});
      o.label.position.set(r.position.x, r.position.y + 3.5, r.position.z);
    });
  }

  /* ---------- theme ---------- */
  let theme = WORLDS[0];
  function applyTheme(idx, seed) {
    const W = WORLDS[idx] || WORLDS[0]; theme = W;
    scene.background.setHex(W.bg); scene.fog.color.setHex(W.fog);
    floorMat.uniforms.uC1.value.setHex(W.c1); floorMat.uniforms.uC2.value.setHex(W.c2);
    sunMat.uniforms.uTop.value.setHex(W.sunTop); sunMat.uniforms.uBot.value.setHex(W.sunBot);
    moteMat.uniforms.uA.value.setHex(W.c1); moteMat.uniforms.uB.value.setHex(W.c2);
    wallMat.uniforms.uC.value.setHex(W.c1);
    hubWire.material.color.copy(hdr(W.c1, 1.2));
    hubRings.forEach((r, i) => r.material.color.copy(hdr(i === 1 ? W.c2 : W.c1, 1.3)));
    beam.material.color.copy(hdr(W.c1, 1.2)); hubFloor.material.color.copy(hdr(W.c1, 1.2));
    floorRings.forEach(o => o.m.material.color.copy(hdr(W[o.key], 1.2)));
    rimL.color.setHex(W.c2); keyL.color.copy(new THREE.Color(W.c1).lerp(new THREE.Color(0xffffff), 0.6)); hemiL.color.setHex(W.c3);
    const cl = [W.c1, W.c2, W.c3, 0xffffff, W.c2];
    for (let i = 0; i < cars.data.length; i++) cars.im.setColorAt(i, new THREE.Color(cl[i % cl.length]).multiplyScalar(2.2));
    cars.im.instanceColor.needsUpdate = true;
    const wm = {none: 0, rain: 1, snow: 2, embers: 3, spores: 4}[W.weather] || 0;
    weatherMat.uniforms.uMode.value = wm;
    weatherMat.uniforms.uCol.value.copy(hdr(wm === 3 ? W.c1 : (wm === 4 ? W.c1 : (wm === 1 ? W.c1 : 0xffffff)), wm === 2 ? 1.1 : 1.8));
    buildEnv(W); buildCity(W, seed == null ? W.id : seed); buildBoards(W); setDrones(W.drones);
  }

  /* ---------- post ---------- */
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const rt = new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 4});
  const composer = new EffectComposer(renderer, rt);
  const rp = new RenderPass(scene, camera);
  composer.addPass(rp);
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.6, 0.55, 0.82);
  composer.addPass(bloom);
  const fin = new ShaderPass(FinalShader);
  composer.addPass(fin);
  composer.addPass(new OutputPass());

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    mapCam.aspect = w / h; mapCam.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  /* ---------- world map (level select) + fly-in ---------- */
  let view = 'world';
  const mapScene = new THREE.Scene(); mapScene.background = new THREE.Color(0x01020a); mapScene.fog = new THREE.FogExp2(0x02030c, 0.004);
  const mapCam = new THREE.PerspectiveCamera(55, 1, 0.1, 1200); mapCam.position.set(0, 14, 40);
  const mctrl = new OrbitControls(mapCam, canvas);
  mctrl.enableDamping = true; mctrl.dampingFactor = 0.06; mctrl.enablePan = false; mctrl.minDistance = 24; mctrl.maxDistance = 85; mctrl.maxPolarAngle = Math.PI * 0.62;
  mctrl.autoRotate = true; mctrl.autoRotateSpeed = 0.35; mctrl.enabled = false;
  (function mapBackdrop() {
    const neb = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {uT: uTimeG},
      vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; uniform float uT;
        float h(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
        float n(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
        float fbm(vec3 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n(p);p*=2.02;a*=.5;}return s;}
        void main(){ float a=fbm(vP*2.4+vec3(uT*0.01)); float b=fbm(vP*4.0-vec3(3.0,1.0,uT*0.015));
          vec3 c=vec3(0.02,0.03,0.09)+vec3(0.25,0.05,0.45)*pow(a,3.0)*1.6+vec3(0.0,0.35,0.5)*pow(b,4.0)*1.3;
          gl_FragColor=vec4(c,1.0);}`
    }));
    mapScene.add(neb);
    const n = 2600, p = new Float32Array(n * 3), rng = mulberry(321);
    for (let i = 0; i < n; i++) { const th = rng() * Math.PI * 2, ph = Math.acos(2 * rng() - 1); p[i * 3] = Math.sin(ph) * Math.cos(th) * 600; p[i * 3 + 1] = Math.cos(ph) * 600; p[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 600; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    mapScene.add(new THREE.Points(g, new THREE.PointsMaterial({size: 1.9, sizeAttenuation: false, color: 0xdbe9ff, fog: false, transparent: true, opacity: 0.9})));
  })();
  const planetVS = 'varying vec3 vL; varying vec3 vN; varying vec3 vV; void main(){ vL=position; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=-mv.xyz; gl_Position=projectionMatrix*mv; }';
  const planetFS = `
    uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uT; uniform float uLock; uniform float uHover;
    varying vec3 vL; varying vec3 vN; varying vec3 vV;
    float h(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
    float n(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
    float fbm(vec3 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}
    void main(){
      vec3 p=normalize(vL); float q=fbm(p*3.0+vec3(uT*0.03,0.0,0.0));
      float bands=sin(p.y*9.0+q*5.0)*0.5+0.5;
      vec3 col=mix(uA,uB,bands); col=mix(col,uC,smoothstep(0.55,0.9,q));
      vec3 N=normalize(vN); float lit=0.3+0.7*max(dot(N,normalize(vec3(0.4,0.6,0.7))),0.0);
      float fres=pow(1.0-max(dot(N,normalize(vV)),0.0),2.4);
      vec2 g=abs(fract(vec2(atan(p.z,p.x)*3.0/3.14159,p.y*6.0))-0.5); float grid=smoothstep(0.47,0.5,max(g.x,g.y))*0.25;
      vec3 c=col*lit*0.95+uA*fres*1.5+uB*grid;
      c=mix(c,vec3(dot(c,vec3(0.33)))*0.3,uLock);
      c*=1.0+uHover*0.4;
      gl_FragColor=vec4(c,1.0); }`;
  const mapGroup = new THREE.Group(); mapScene.add(mapGroup);
  let planets = [], hoverPlanet = null;
  function setMapData(list) {
    clearGroup(mapGroup); planets = [];
    const n = list.length, pts = [], R = 4.2;
    list.forEach((w, i) => {
      const pos = new THREE.Vector3((i - (n - 1) / 2) * 10.5, Math.sin(i * 0.9) * 3.4, Math.cos(i * 1.15) * 7.5);
      pts.push(pos.clone());
      const g = new THREE.Group(); g.position.copy(pos);
      const mat = new THREE.ShaderMaterial({uniforms: {uA: {value: new THREE.Color(w.c1)}, uB: {value: new THREE.Color(w.c2)}, uC: {value: new THREE.Color(w.c3)}, uT: uTimeG, uLock: {value: w.locked ? 1 : 0}, uHover: {value: 0}}, vertexShader: planetVS, fragmentShader: planetFS});
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 56, 40), mat); mesh.userData.idx = i;
      const atm = new THREE.Mesh(new THREE.SphereGeometry(R * 1.17, 40, 28), new THREE.MeshBasicMaterial({color: hdr(w.locked ? 0x667788 : w.c1, 0.9), transparent: true, opacity: 0.16, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false}));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.55, 0.05, 8, 120), new THREE.MeshBasicMaterial({color: hdr(w.locked ? 0x445566 : w.c2, 1.3), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending}));
      ring.rotation.x = Math.PI / 2 + 0.35 + i * 0.12; ring.rotation.y = i * 0.5;
      const sub = w.locked ? '🔒 ' + (w.lockText || 'נעול') : (w.done ? '✓ ' + '★'.repeat(w.stars || 1) : 'פתוח · ' + (w.progress || ''));
      const label = makeLabel(w.en, sub, w.locked ? 0x8899aa : w.c1); label.scale.set(10, 3.1, 1); label.position.set(0, R + 2.6, 0);
      g.add(mesh, atm, ring, label); mapGroup.add(g);
      planets.push({g, mesh, ring, pos, mat, idx: i, locked: !!w.locked, hover: 0});
    });
    const curve = new THREE.CatmullRomCurve3(pts);
    mapGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.07, 6, false), new THREE.MeshBasicMaterial({color: hdr(COL.cyan, 1.1), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false})));
  }
  let flight = null, flash = 0;
  function setView(v) {
    view = v; rp.scene = v === 'map' ? mapScene : scene; rp.camera = v === 'map' ? mapCam : camera;
    controls.enabled = v !== 'map'; mctrl.enabled = v === 'map';
    if (v === 'map') { mode = 'map'; hacking = null; previewing = false; if (near != null) { near = null; cb.onNear && cb.onNear(null); } mctrl.autoRotate = true; }
  }
  function showMap(on) {
    if (on) {
      clearPeersVisible(false); mapCam.fov = 55; mapCam.updateProjectionMatrix(); flash = 0;
      mapCam.position.set(0, 17, 56); mctrl.target.set(0, 0, 0); setView('map'); mctrl.update();
    } else { setView('world'); setMode('free'); clearPeersVisible(true); }
  }
  function clearPeersVisible(v) { peers.forEach(o => { o.av.root.visible = v; o.label.visible = v; }); }
  function flyInto(idx, done) {
    const pl = planets[idx]; if (!pl || flight) return;
    mctrl.enabled = false; mctrl.autoRotate = false;
    const p0 = mapCam.position.clone(), t0 = mctrl.target.clone(), dir = p0.clone().sub(pl.pos).normalize();
    flight = {t: 0, dur: 2.3, p0, t0, p1: pl.pos.clone().addScaledVector(dir, 2.0), tg: pl.pos.clone(), done};
  }
  function updateFlight(dt) {
    const f = flight; f.t += dt / f.dur; const k = Math.min(1, f.t), e = k * k * (1.3 - 0.3 * k);
    mapCam.position.lerpVectors(f.p0, f.p1, e);
    tmpV.lerpVectors(f.t0, f.tg, Math.min(1, k * 1.6)); mapCam.lookAt(tmpV);
    mapCam.fov = 55 + e * 65; mapCam.updateProjectionMatrix();
    flash = Math.max(flash, Math.max(0, (k - 0.78) / 0.22)); bloom.strength = 0.6 + e * 1.4;
    setGlitch(Math.max(glitch, e * 0.5), 0.3);
    if (k >= 1) {
      flight = null; mapCam.fov = 55; mapCam.updateProjectionMatrix(); flash = 1;
      f.done && f.done();
      setView('world'); clearPeersVisible(true); tween = null;
      P.pos.set(0, 0, 24); P.vy = 0; P.grounded = true; P.speed = 0; P.heading = Math.PI;
      camera.position.set(0, 170, 40); controls.target.set(0, 0, 24); controls.update();
      setMode('play', 3.2);
    }
  }



  /* ---------- picking ---------- */
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    if (view === 'map') {
      ray.setFromCamera(mouse, mapCam);
      const ph = ray.intersectObjects(planets.map(p => p.mesh), false);
      return ph.length ? ph[0].object.userData.idx : null;
    }
    ray.setFromCamera(mouse, camera);
    const hits = ray.intersectObjects([...nodes.values()].map(n => n.hit), false);
    return hits.length ? hits[0].object.userData.id : null;
  }
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = {x: e.clientX, y: e.clientY, t: performance.now()}; });
  canvas.addEventListener('pointerup', e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
    down = null;
    if (moved < 7 && dt < 600 && !flight) { const id = pick(e); if (id != null) { if (view === 'map') cb.onPlanet && cb.onPlanet(id); else cb.onPick(id); } }
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' || down) return;
    const id = pick(e);
    if (view === 'map') { hoverPlanet = id; canvas.style.cursor = id != null ? 'pointer' : 'grab'; cb.onPlanetHover && cb.onPlanetHover(id, e.clientX, e.clientY); return; }
    if (id !== hover) { hover = id; canvas.style.cursor = id != null ? 'pointer' : 'grab'; }
    cb.onHover(id, e.clientX, e.clientY);
  });

  /* ---------- loop ---------- */
  const clock = new THREE.Clock();
  const tmpV = new THREE.Vector3(), tmpCol = new THREE.Color(), redCol = new THREE.Color(COL.red).multiplyScalar(1.6);
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    floorMat.uniforms.uTime.value = t; moteMat.uniforms.uTime.value = t; fin.uniforms.uTime.value = t; uTimeG.value = t;
    const mv = updatePlayer(dt, t);
    updateDrones(dt, t); updatePeers(dt, t);
    if (view === 'map') { mctrl.update(); planets.forEach(p => { p.mesh.rotation.y += dt * 0.12; p.ring.rotation.z += dt * 0.25; const tg = hoverPlanet === p.idx ? 1 : 0; p.hover += (tg - p.hover) * 0.15; p.mat.uniforms.uHover.value = p.hover; p.g.scale.setScalar(1 + p.hover * 0.07); }); if (flight) updateFlight(dt); }
    if (flash > 0 && !flight) flash = Math.max(0, flash - dt * 0.8);
    fin.uniforms.uFlash.value = flash;
    if (beaconMat) beaconMat.opacity = 0.35 + 0.65 * (Math.sin(t * 3) * 0.5 + 0.5);
    if (mode === 'play' && !previewing) {
      if (tween) { tween.p1.add(mv); tween.t1.add(mv); }
      else {
        camY += ((1.7 + P.pos.y * 0.55) - camY) * (1 - Math.exp(-dt * 6));
        focusOf(tmpF); tmpF.sub(controls.target);
        camera.position.add(tmpF); controls.target.add(tmpF);
      }
    }
    for (let i = 0; i < cars.data.length; i++) {
      const c = cars.data[i]; c.a += c.v / c.R * dt;
      const sg = Math.sign(c.v);
      cars.d.position.set(Math.cos(c.a) * c.R, c.h, Math.sin(c.a) * c.R);
      cars.d.rotation.y = Math.atan2(-sg * Math.cos(c.a), -sg * Math.sin(c.a));
      cars.d.updateMatrix(); cars.im.setMatrixAt(i, cars.d.matrix);
    }
    cars.im.instanceMatrix.needsUpdate = true;
    for (let i = cols.length - 1; i >= 0; i--) {
      const c = cols[i]; c.life += dt; const k = c.life / c.max;
      c.m.scale.set(Math.max(0.02, 1 - k), 1, Math.max(0.02, 1 - k)); c.m.material.opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) { scene.remove(c.m); c.m.geometry.dispose(); c.m.material.dispose(); cols.splice(i, 1); }
    }
    if (tween) {
      tween.t += dt / tween.dur;
      const k = ease(Math.min(1, tween.t));
      camera.position.lerpVectors(tween.p0, tween.p1, k);
      controls.target.lerpVectors(tween.t0, tween.t1, k);
      if (tween.t >= 1) tween = null;
    }
    controls.update();
    hubWire.rotation.y += dt * 0.5; hubWire.rotation.x += dt * 0.2;
    hubRings.forEach((r, i) => { r.rotation.z += dt * (0.5 + i * 0.35) * (i % 2 ? -1 : 1); });
    hubCore.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
    beam.material.opacity = 0.1 + Math.sin(t * 2) * 0.03;
    nodes.forEach((n, id) => {
      const act = hacking === id;
      n.wire.rotation.y += dt * (act ? 2.6 : 0.45); n.wire.rotation.x += dt * 0.2;
      n.ring.rotation.z += dt * (act ? 4.2 : 0.8);
      const sc = (hover === id ? 1.14 : 1) + Math.sin(t * 2 + n.phase) * 0.03 + (act ? 0.1 + Math.sin(t * 10) * 0.05 : 0);
      tmpV.set(sc, sc, sc); n.g.scale.lerp(tmpV, 0.2);
      n.g.position.y = n.base.y + Math.sin(t * 1.2 + n.phase) * 0.28;
      if (n.flash > 0) {
        n.flash = Math.max(0, n.flash - dt * 1.3);
        tmpCol.copy(n.baseCol).multiplyScalar(1.15).lerp(redCol, n.flash);
        n.wire.material.color.copy(tmpCol);
      }
      n.pulses.forEach(p => { p.t = (p.t + dt * p.sp * (act ? 3 : 1)) % 1; p.mesh.position.copy(n.curve.getPoint(p.t)); });
    });
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]; b.life += dt;
      const arr = b.pts.geometry.attributes.position.array;
      for (let k = 0; k < arr.length; k += 3) {
        b.vel[k + 1] -= dt * 4; b.vel[k] *= 0.985; b.vel[k + 2] *= 0.985;
        arr[k] += b.vel[k] * dt; arr[k + 1] += b.vel[k + 1] * dt; arr[k + 2] += b.vel[k + 2] * dt;
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, 1 - b.life / b.max);
      if (b.life >= b.max) { scene.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose(); bursts.splice(i, 1); }
    }
    for (let i = shocks.length - 1; i >= 0; i--) {
      const s = shocks[i]; s.life += dt; const k = s.life / s.max;
      s.mesh.scale.setScalar(1 + k * 22); s.mesh.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); shocks.splice(i, 1); }
    }
    if (glitch > 0) glitch = Math.max(0, glitch - glitchDecay * dt);
    fin.uniforms.uGlitch.value = glitch;
    bloom.strength += ((hacking ? 0.85 : bloomTarget) - bloom.strength) * 0.05;
    composer.render();
  }
  resize();
  applyTheme(0, 0);
  renderer.setAnimationLoop(frame);

  return {
    setNodes, focusNode, focusHub, burst, fail: failFx, glitch: setGlitch,
    setHacking: id => { hacking = id; },
    setSkin: sk => avatar.setSkin(sk), setMode, getMode: () => mode,
    setJoy: (x, y) => { joy.x = x; joy.y = y; }, jump: () => { jumpReq = true; },
    celebrate, previewSkin,
    place: (x, z, h) => { teleportTo(x, z, h, false); },
    getPos: () => P.pos.clone(), getNear: () => near,
    applyTheme, showMap, setMapData, flyInto, isFlying: () => !!flight, getView: () => view,
    addPeer, setPeerState, setPeerSkin, removePeer, clearPeers,
    getState: () => [P.pos.x, P.pos.y, P.pos.z, P.heading],
    resetPlayer: () => { P.pos.set(0, 0, 24); P.vy = 0; P.grounded = true; P.speed = 0; P.heading = Math.PI; },
    canvas
  };
}
