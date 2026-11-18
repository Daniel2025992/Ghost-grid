import {createWorld} from './scene.js';
import {WORLDS} from './worlds.js';
import {initOnline} from './online.js';

const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

let chalCur = null;
const TYPES = {
  code: {icon: '🔷', name: 'ממסר לוחות'},
  caesar: {icon: '🔤', name: 'פענוח אותיות'},
  sequence: {icon: '🏁', name: 'ספרינט שערים'},
  typing: {icon: '🔤', name: 'פענוח אותיות'},
  boss: {icon: '👑', name: 'בוס: 3 אתגרים ברצף'}
};
const KIND = {code: 'plates', caesar: 'letters', sequence: 'gates', typing: 'letters'};
/* group size -> difficulty tier (solo and up to 3 players: easy, 4: medium, 5-7: hard, 8-15: very hard) */
const TIERS = [
  {name: 'קל', drones: 1, speed: 1, time: 1, heat: 1, lvl: 0},
  {name: 'בינוני', drones: 1.4, speed: 1.15, time: 0.92, heat: 1.15, lvl: 1},
  {name: 'קשה', drones: 1.9, speed: 1.35, time: 0.82, heat: 1.35, lvl: 3},
  {name: 'קשה מאוד', drones: 2.6, speed: 1.7, time: 0.7, heat: 1.7, lvl: 5}
];
function tier() { const n = hooks.roomSize(); return TIERS[n <= 3 ? 0 : n === 4 ? 1 : n <= 7 ? 2 : 3]; }
function rescaleDrones() {
  const base = W().drones, t = tier(), count = Math.min(14, Math.max(base.length, Math.round(base.length * t.drones)));
  const list = Array.from({length: count}, (_, i) => { const b = base[i % base.length], round = Math.floor(i / base.length); return {...b, r: b.r + round * 3.5, v: b.v * t.speed * (round % 2 ? -1 : 1), phase: b.phase + round * 1.3 + i * 0.4}; });
  world.setDrones(list);
}

const PROV = {
  anthropic: {name: 'Claude (Anthropic)', model: 'claude-haiku-5-5', url: 'https://console.anthropic.com/settings/keys', hint: 'המפתח מתחיל ב-sk-ant-'},
  openai: {name: 'ChatGPT (OpenAI)', model: 'gpt-4o-mini', url: 'https://platform.openai.com/api-keys', hint: 'המפתח מתחיל ב-sk-'},
  gemini: {name: 'Gemini (Google)', model: 'gemini-2.0-flash', url: 'https://aistudio.google.com/apikey', hint: 'המפתח מתחיל ב-AIza'},
  openrouter: {name: 'OpenRouter', model: 'openai/gpt-4o-mini', url: 'https://openrouter.ai/keys', hint: 'המפתח מתחיל ב-sk-or-'}
};

const S = {
  level: 1, xp: 0, credits: 0, heat: 0, hacks: 0,
  up: {stealth: 0, overclock: 0},
  missions: [], cur: null, locked: false, puzzleActive: false, started: false,
  ai: {provider: 'anthropic', key: '', model: ''},
  sound: true, busy: false,
  skin: 'ghost', ownedSkins: ['ghost', 'phantom'], near: null, skinOpen: false,
  wi: 0, worlds: {}, heatMax: 0, seed: 0, mapOpen: false, isAdmin: false
};
const hooks = {inRoom: false, isHost: () => false, sendWorld: () => {}, onNodeDone: null, onWorldEntered: null, serverAI: null, roomSize: () => 1, onRoomSize: null, tier: () => TIERS[0]};
const W = () => WORLDS[S.wi] || WORLDS[0];
const lv = () => S.level + W().lvBonus + tier().lvl;
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------------- skins ---------------- */
const SKINS = [
  {id: 'ghost', name: 'רוח ניאון', price: 0, body: 0x9fb7d1, dark: 0x0d1220, trim: 0x00f0ff, visor: 0x00f0ff, metal: 0.9, rough: 0.25, acc: 'antenna'},
  {id: 'phantom', name: 'פנטום מג\'נטה', price: 0, body: 0x4a2058, dark: 0x120716, trim: 0xff2bd6, visor: 0xff2bd6, metal: 0.85, rough: 0.28, acc: 'ears'},
  {id: 'viper', name: 'צפע רעיל', price: 150, body: 0x24523a, dark: 0x07120c, trim: 0x39ff88, visor: 0xd6ff3a, metal: 0.8, rough: 0.3, acc: 'spikes'},
  {id: 'samurai', name: 'סמוראי ארגמן', price: 300, body: 0x8a1428, dark: 0x16080b, trim: 0xff3355, visor: 0xffb000, metal: 0.82, rough: 0.3, acc: 'horns'},
  {id: 'frost', name: 'מלכת הקרח', price: 450, body: 0xe4f1ff, dark: 0x2a3b5c, trim: 0x7dd3ff, visor: 0xffffff, metal: 0.55, rough: 0.12, acc: 'halo'},
  {id: 'gold', name: 'זהב כרום', price: 700, body: 0xffc233, dark: 0x2b1d05, trim: 0xe0a030, visor: 0xffe08a, metal: 1, rough: 0.16, acc: 'crown'},
  {id: 'void', name: 'שומר הריק', price: 1000, body: 0x0b0b14, dark: 0x000000, trim: 0x7a5cff, visor: 0xb48cff, metal: 0.95, rough: 0.18, acc: 'wings'},
  {id: 'glitch', name: 'גליץ\' קשת', price: 1400, body: 0x333355, dark: 0x0a0a14, trim: 0xff00ff, visor: 0x00ffff, metal: 0.85, rough: 0.22, acc: 'ears', acc2: 'antenna', rainbow: true}
];
const skinById = id => SKINS.find(k => k.id === id) || SKINS[0];
const hexCss = n => '#' + n.toString(16).padStart(6, '0');

/* ---------------- save / load ---------------- */
const getProgress = () => ({level: S.level, xp: S.xp, credits: S.credits, hacks: S.hacks, up: S.up, skin: S.skin, ownedSkins: S.ownedSkins, worlds: S.worlds});
function applyProgress(d) {
  if (!d) return;
  S.level = d.level || 1; S.xp = d.xp || 0; S.credits = d.credits || 0; S.hacks = d.hacks || 0; S.up = Object.assign({stealth: 0, overclock: 0}, d.up);
  if (d.skin) S.skin = d.skin; if (Array.isArray(d.ownedSkins)) S.ownedSkins = d.ownedSkins; if (d.worlds && typeof d.worlds === 'object') S.worlds = d.worlds;
  applySkin(); hud();
}
let onSaved = null;
function save() {
  const p = getProgress();
  try { localStorage.setItem('gg_save', JSON.stringify(p)); } catch (e) {}
  if (onSaved) onSaved(p);
}
function saveAI() { try { localStorage.setItem('gg_ai', JSON.stringify(S.ai)); } catch (e) {} }
function load() {
  try {
    const d = JSON.parse(localStorage.getItem('gg_save') || 'null');
    if (d) { S.level = d.level || 1; S.xp = d.xp || 0; S.credits = d.credits || 0; S.hacks = d.hacks || 0; S.up = Object.assign({stealth: 0, overclock: 0}, d.up); if (d.skin) S.skin = d.skin; if (Array.isArray(d.ownedSkins)) S.ownedSkins = d.ownedSkins; if (d.worlds && typeof d.worlds === 'object') S.worlds = d.worlds; }
    else S.credits = 120;
  } catch (e) {}
  try {
    const a = JSON.parse(localStorage.getItem('gg_ai') || 'null');
    if (a && PROV[a.provider]) Object.assign(S.ai, a);
  } catch (e) {}
}
const xpNeed = () => 100 + (S.level - 1) * 80;

/* ---------------- audio ---------------- */
let AC = null, master = null, droneOn = false;
function ac() {
  if (!AC) {
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = S.sound ? 1 : 0; master.connect(AC.destination); } catch (e) {}
  }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(f, d = 0.08, type = 'square', v = 0.05, when = 0) {
  if (!S.sound) return;
  const a = ac(); if (!a) return;
  const t = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.02);
}
function drone() {
  const a = ac(); if (!a || droneOn) return; droneOn = true;
  const g = a.createGain(), lp = a.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 260; g.gain.value = 0.05;
  [55, 55.4, 110.3].forEach((f, i) => { const o = a.createOscillator(); o.type = i === 2 ? 'triangle' : 'sine'; o.frequency.value = f; o.connect(lp); o.start(); });
  lp.connect(g); g.connect(master);
}
const sKey = () => tone(rnd(900, 1500), 0.03, 'square', 0.025);
const sBlip = () => tone(rnd(500, 800), 0.07, 'sine', 0.06);
const sOk = () => { tone(660, 0.1, 'triangle', 0.07); tone(880, 0.12, 'triangle', 0.07, 0.1); };
const sWin = () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.2, 'triangle', 0.08, i * 0.1));
const sBad = () => { tone(180, 0.25, 'sawtooth', 0.07); tone(130, 0.3, 'sawtooth', 0.07, 0.12); };
let sirenT = null;
function siren(ms) { let n = 0; clearInterval(sirenT); sirenT = setInterval(() => { tone(n % 2 ? 600 : 900, 0.28, 'sawtooth', 0.06); n++; }, 300); setTimeout(() => clearInterval(sirenT), ms); }

/* ---------------- world ---------------- */
const overlayOpen = () => !$('welcome').hidden || !$('apiModal').hidden || !$('shopModal').hidden || !$('lock').hidden;
const world = createWorld($('gl'), {
  isFrozen: () => !S.started || S.mapOpen || S.locked || S.skinOpen || !$('modal').hidden || overlayOpen(),
  onNear: id => { S.near = id; updatePrompt(); },
  onInteract: () => interact(),
  onPick: id => openMission(id),
  onChallengeHud: i => challengeCbs.onChallengeHud(i),
  onChallengePenalty: k => challengeCbs.onChallengePenalty(k),
  onChallengeFx: (k, v) => challengeCbs.onChallengeFx(k, v),
  onChallengeEnd: (a, b, c) => challengeCbs.onChallengeEnd(a, b, c),
  onPlanet: i => pickWorld(i),
  onPlanetHover: (i, x, y) => {
    const tip = $('tip');
    if (i == null) { tip.hidden = true; return; }
    const w = WORLDS[i]; tip.hidden = false; tip.textContent = w.name + ' · ' + w.nodes + ' צמתים · ' + w.drones.length + ' רחפנים' + (isUnlocked(i) ? '' : ' · 🔒');
    tip.style.left = (x + 14) + 'px'; tip.style.top = (y + 14) + 'px';
  },
  onDroneHit: () => { if (!S.started || S.locked || S.mapOpen) return; addHeat(9); glog('[!] רחפן סיור זיהה אותך', 'w'); toast('🚨 רחפן סיור זיהה אותך! החום עולה', 'bad'); shake(); sBad(); },
  onHover: (id, x, y) => {
    const tip = $('tip');
    const m = id != null ? S.missions.find(q => q.id === id) : null;
    if (!m || !S.started) { tip.hidden = true; return; }
    tip.hidden = false; tip.textContent = m.target + ' · ' + TYPES[m.type].name + (m.done ? ' ✓' : '');
    tip.style.left = (x + 14) + 'px'; tip.style.top = (y + 14) + 'px';
  }
});

/* ---------------- missions ---------------- */
const POOL = [
  {type: 'code', title: 'כספת הבנק העתידני', target: 'VAULT-7', story: 'בנק דמיוני מחביא את הקוד בכספת דיגיטלית. נחש אותו לפני שהמערכת מתעוררת.'},
  {type: 'code', title: 'דלת המעבדה', target: 'LAB-31', story: 'מעבדת רובוטים נעולה בקוד מספרי. אף אחד לא יודע מה הוא, אבל אפשר לנחש בחוכמה.'},
  {type: 'code', title: 'מנעול הרכבת', target: 'RAIL-12', story: 'רכבת המגנט של העיר תקועה. פתח את לוח הבקרה והחזר אותה לפעולה.'},
  {type: 'code', title: 'ארון הסודות', target: 'ARCHIVE-4', story: 'ארכיון של חתולים רובוטיים שומר סודות. הקוד הוא רק ספרות.'},
  {type: 'caesar', title: 'הודעה מוצפנת', target: 'ECHO-NET', phrase: 'THE GATE IS OPEN', story: 'מישהו שלח הודעה בצופן קיסר. הזז את הגלגל עד שהמילים הגיוניות.'},
  {type: 'caesar', title: 'סוכן הצללים', target: 'SHADOW-9', phrase: 'MEET AT MIDNIGHT', story: 'סוכן חשאי השאיר פתק מוצפן ברשת. מצא את ההזזה הנכונה.'},
  {type: 'caesar', title: 'מפתח הדרקון', target: 'DRAGON-2', phrase: 'DRAGON KEY FOUND', story: 'בחדר המשחקים הווירטואלי מסתתרת הודעה בצופן. פענח אותה.'},
  {type: 'caesar', title: 'פיצוח הלוויין', target: 'ORBIT-5', phrase: 'SATELLITE IS ONLINE', story: 'לוויין משדר הודעה מוצפנת לכדור הארץ. תפוס אותה.'},
  {type: 'sequence', title: 'חומת האש הכחולה', target: 'WALL-3', story: 'חומת אש מציגה רצף אורות. חזור עליו בדיוק כדי לעבור.'},
  {type: 'sequence', title: 'מערך הלייזרים', target: 'LASER-8', story: 'מערך לייזרים מהבהב בסדר סודי. זכור את הסדר.'},
  {type: 'sequence', title: 'לוח הבקרה של הרובוט', target: 'MECH-6', story: 'לוח כפתורים של רובוט ענק. לחץ בדיוק לפי הרצף.'},
  {type: 'typing', title: 'הזרקת פקודות', target: 'CORE-1', phrase: 'init --target=sim-node --mode=ghost', story: 'הקלד את הפקודה המדומה במהירות לפני שהחיבור מתנתק.'},
  {type: 'typing', title: 'סנכרון הרשת', target: 'SYNC-14', phrase: 'sync nodes --fast --quiet', story: 'הרשת מתפרקת. הקלד את פקודת הסנכרון בלי טעויות.'},
  {type: 'typing', title: 'אתחול הרובוט', target: 'BOT-77', phrase: 'boot robot --level=max --safe', story: 'רובוט שינה מחכה לפקודה. הקלד אותה לפני שהוא נרדם שוב.'}
];
let uid = 1;
function mkMission(src, ai, wi = S.wi, boss = false) {
  const base = 50 + (S.level + WORLDS[wi].lvBonus) * 22 + wi * 18;
  return {
    id: uid++, type: src.type, title: src.title, target: src.target, story: src.story,
    phrase: src.phrase || '', reward: clamp(Math.round(src.reward || (base + ri(0, 40))), 30, 900),
    ai: !!ai, done: false, boss
  };
}
function genMissions(wi, seed) {
  const Wd = WORLDS[wi], rng = mulberry((seed | 0) + wi * 131 + 7), bag = POOL.slice();
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  const n = Wd.nodes - (Wd.boss ? 1 : 0);
  const list = bag.slice(0, n).map(src => mkMission(src, false, wi));
  if (Wd.boss) list.push(mkMission({type: 'boss', title: 'שומר הליבה', target: 'SOL-CORE', story: 'השומר האחרון של השמש. שלוש חידות ברצף: קוד, צופן ורצף. טעות אחת מתחילה את הבוס מחדש.', reward: 700}, false, wi, true));
  list.forEach((m, i) => m.idx = i);
  return list;
}
function addMissions(list) {
  const room = 10 - S.missions.length;
  list.slice(0, Math.max(0, room)).forEach(m => { m.idx = S.missions.length; S.missions.push(m); });
  refreshWorld();
}
function refreshWorld() {
  world.setNodes(S.missions.map(m => ({id: m.id, type: m.type, label: m.target, done: m.done, ai: m.ai, boss: m.boss})));
  renderList();
}
function renderList() {
  const box = $('mlist'); box.innerHTML = '';
  S.missions.forEach(m => {
    const b = document.createElement('button');
    b.className = 'mc' + (m.ai ? ' ai' : '') + (m.done ? ' done' : '') + (S.cur && S.cur.id === m.id ? ' sel' : '');
    b.innerHTML = `<span class="ic">${m.done ? '✅' : TYPES[m.type].icon}</span><span class="tx"><b>${esc(m.title)}${m.ai ? '<span class="tag">AI</span>' : ''}</b><small>${esc(m.target)}</small></span><span class="rw">+${m.reward}</span>`;
    b.onclick = () => { openMission(m.id); if (innerWidth <= 820) $('missions').classList.add('closed'); };
    box.appendChild(b);
  });
  const left = S.missions.filter(m => !m.done).length;
  $('mcount').textContent = left + ' פתוחות';
  const canAI = !!S.ai.key || canServerAI();
  $('bNew').hidden = !canAI;
  $('bNew').textContent = S.isAdmin && serverAI ? '✨ צור צמתים עם ה-AI של השרת' : '✨ הוסף צמתים עם AI';
  $('aiStat').textContent = S.isAdmin && serverAI ? 'AI של השרת פעיל (מנהל, ללא מפתח)' : (S.ai.key ? 'AI מחובר: ' + PROV[S.ai.provider].name : 'אפשר לחבר AI כדי להוסיף צמתים');
  $('bAi').classList.toggle('on', canAI);
  $('wname').textContent = W().en + ' · ' + S.missions.filter(m => m.done).length + '/' + S.missions.length;
}

/* ---------------- HUD ---------------- */
function hud() {
  $('lv').textContent = S.level;
  $('xpb').style.width = clamp(S.xp / xpNeed() * 100, 0, 100) + '%';
  $('cr').textContent = Math.round(S.credits).toLocaleString('en-US');
  $('hb').style.width = S.heat + '%';
  $('hp').textContent = Math.round(S.heat) + '%';
  $('heatChip').classList.toggle('hot', S.heat > 75);
}
function glog(t, c = '') {
  const l = $('log'), d = document.createElement('div');
  d.textContent = t; if (c) d.className = c; l.appendChild(d);
  while (l.children.length > 7) l.removeChild(l.firstChild);
  if (c === 'w') tone(300, 0.1, 'sawtooth', 0.04); else sBlip();
}
function toast(t, cls = '') {
  const d = document.createElement('div'); d.className = 'toast ' + cls; d.textContent = t;
  $('toast').appendChild(d); setTimeout(() => d.remove(), 3200);
}
function addXp(n) {
  S.xp += n;
  while (S.xp >= xpNeed()) { S.xp -= xpNeed(); S.level++; toast('🎉 עלית לרמה ' + S.level + '! משימות קשות יותר מחכות', 'm'); sWin(); }
}
function addHeat(n) {
  S.heat = clamp(S.heat + n * W().heatMul * tier().heat * (1 - 0.2 * S.up.stealth), 0, 100); S.heatMax = Math.max(S.heatMax, S.heat);
  hud();
  if (S.heat >= 100) lockdown();
}
setInterval(() => { if (!S.locked && !S.puzzleActive && S.heat > 0) { S.heat = Math.max(0, S.heat - 0.8); hud(); } }, 1000);

function lockdown() {
  if (S.locked) return;
  S.locked = true; stopPuzzle(); closeModal(true);
  world.glitch(1.3, 3); shake();
  const loss = Math.floor(S.credits * 0.15); S.credits -= loss;
  $('lockMsg').textContent = loss > 0 ? 'זוהית! המערכת ננעלה. איבדת ' + loss + ' קרדיט.' : 'זוהית! המערכת ננעלה.';
  $('lock').hidden = false; siren(3600);
  glog('[!] LOCKDOWN: זוהית על ידי המערכת', 'w');
  setTimeout(() => { $('lock').hidden = true; S.locked = false; S.heat = 35; hud(); save(); }, 4000);
}
function shake() { const c = $('gl'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }

/* ---------------- modal ---------------- */
function head(m) {
  return `<div class="mh"><span class="ti">${TYPES[m.type].icon}</span><div><h2>${esc(m.title)}</h2><small>TARGET · ${esc(m.target)}</small></div><button class="x" id="mx">✕</button></div>`;
}
function setModal(html) { const el = $('modal'); el.innerHTML = html; el.hidden = false; const x = $('mx'); if (x) x.onclick = () => closeModal(); }
function closeModal(silent) {
  stopPuzzle(); $('modal').hidden = true;
  if (S.cur) { S.cur = null; renderList(); }
  world.setHacking(null);
  if (!silent) world.focusHub();
}
function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }
function openMission(id) {
  if (S.locked || !S.started || world.challengeActive()) return;
  const m = S.missions.find(q => q.id === id); if (!m) return;
  if (m.boss && S.missions.some(q => !q.boss && !q.done)) { toast('👑 הבוס נעול: פרוץ קודם את כל שאר הצמתים', 'bad'); sBad(); return; }
  stopPuzzle(); world.setHacking(null);
  S.cur = m; world.focusNode(id); renderList(); ac(); sBlip();
  const diff = clamp(Math.ceil((lv() + (m.reward / 100)) / 1.6), 1, 5);
  setModal(head(m) + `<p class="story">${esc(m.story)}</p>
    <div class="meta"><span>${TYPES[m.type].icon} ${TYPES[m.type].name}</span><span>💠 +${m.reward}</span><span>קושי ${stars(diff)}</span>${m.ai ? '<span style="border-color:#ff2bd6">✨ נכתב על ידי AI</span>' : ''}</div>
    <button class="big" id="mgo">${m.done ? '✓ כבר נפרץ – אפשר לשחק שוב בלי פרס' : '▶ התחל משימה בעולם'}</button>`);
  $('mgo').onclick = () => startPuzzle(m);
}
function result(m, ok, title, text) {
  setModal(head(m) + `<div class="res ${ok ? 'ok' : 'bad'}"><h2>${title}</h2><p>${text}</p></div>
    <button class="big" id="mnext">${ok ? 'המשך' : '↻ נסה שוב'}</button><button class="big sec" id="mclose">סגור</button>`);
  $('mnext').onclick = () => { ok ? closeModal() : startPuzzle(m.parent || m); };
  $('mclose').onclick = () => closeModal();
}

/* ---------------- puzzle runtime ---------------- */
let timerIv = null, timerRatio = 0, stopFns = [];
function stopTimer() { clearInterval(timerIv); timerIv = null; }
function startTimer(sec, onEnd) {
  stopTimer(); sec = Math.max(8, Math.round(sec * W().timeMul));
  const end = Date.now() + sec * 1000;
  const upd = () => {
    const left = Math.max(0, (end - Date.now()) / 1000), r = left / sec; timerRatio = r;
    const bar = $('tbar'); if (!bar) { stopTimer(); return; }
    bar.style.width = (r * 100) + '%'; bar.classList.toggle('low', r < 0.25);
    $('tl').textContent = Math.ceil(left) + 's';
    if (left <= 0) { stopTimer(); onEnd(); }
  };
  upd(); timerIv = setInterval(upd, 100);
}
function stopPuzzle() {
  stopTimer(); S.puzzleActive = false; chalCur = null;
  try { world.stopChallenge(); } catch (e) {} chalHud(null);
  stopFns.forEach(f => { try { f(); } catch (e) {} }); stopFns = [];
}
const bonusTime = () => S.up.overclock * 8;
function win(m) {
  if (m.chain) { m.chain.next(); return; }
  const ratio = timerRatio || 0.3; stopPuzzle(); world.setHacking(null);
  const first = !m.done;
  const gain = first ? m.reward + Math.round(m.reward * 0.5 * ratio) : 0;
  m.done = true;
  if (first) { S.hacks++; S.credits += gain; addXp(m.reward); if (hooks.onNodeDone) hooks.onNodeDone(m); }
  S.heat = Math.max(0, S.heat - 10); hud(); save();
  world.burst(m.id); world.glitch(0.35, 0.5); world.celebrate(); sWin();
  glog('[+] ' + m.target + ': גישה התקבלה', 'ok');
  refreshWorld();
  result(m, true, '✓ ACCESS GRANTED', first ? `נפרץ בהצלחה! קיבלת <b>${gain}</b> 💠 (כולל בונוס מהירות).` : 'שיחקת שוב, בלי פרס.');
  if (S.missions.every(q => q.done)) setTimeout(completeWorld, 1400);
}
function failMission(m, why, heat = 18) {
  stopPuzzle(); world.setHacking(null); world.fail(m.id); shake(); sBad();
  glog('[!] ' + m.target + ': ' + why, 'w');
  addHeat(heat);
  if (S.locked) return;
  result(m, false, '✕ נכשלת', esc(why) + '. החום עלה.');
}
const INSTR = {
  plates: 'צפה ברצף הלוחות המוארים ואז דרוך עליהם באותו סדר',
  letters: 'עבור דרך האותיות הצפות לפי הסדר כדי לאיית את המילה. אותיות אחרות מזיקות',
  gates: 'רוץ (Shift) דרך השערים לפי המספרים לפני שהזמן נגמר'
};
function chalSpec(kind, extra) {
  return {kind, level: lv() + (extra || 0), timeMul: W().timeMul * tier().time * (1 + 0.08 * S.up.overclock)};
}
function runStage(m, kind, extra, stage, onWin) {
  chalCur = {m, onWin};
  world.startChallenge(m.id, {...chalSpec(kind, extra), stage});
}
function startPuzzle(m) {
  if (S.locked) return;
  stopPuzzle(); closeModal(true); S.puzzleActive = true; S.cur = m; ac(); drone();
  world.setHacking(m.id);
  glog('[*] מתחיל משימה: ' + m.target, 'm');
  if (m.type === 'boss') {
    const stages = ['letters', 'plates', 'gates']; let i = 0;
    const next = () => { runStage(m, stages[i], i * 2, (i + 1) + '/3', () => { i++; if (i >= stages.length) win(m); else { sOk(); toast('👑 שלב ' + (i + 1) + ' מתוך 3', 'm'); next(); } }); };
    next(); toast('👑 ' + INSTR.letters, 'm'); return;
  }
  const kind = KIND[m.type] || 'plates';
  runStage(m, kind, 0, null, () => win(m));
  toast('🎯 ' + INSTR[kind], 'm');
}
/* challenge HUD */
function chalHud(i) {
  const el = $('chal'); if (!el) return;
  document.body.classList.toggle('inchal', !!i);
  if (!i) { el.hidden = true; return; }
  el.hidden = false;
  const ratio = Math.max(0, i.left / i.total), p = i.progress;
  $('chText').textContent = i.text + (i.stage ? '  ·  שלב ' + i.stage : '');
  $('chBar').style.width = (ratio * 100) + '%'; $('chBar').classList.toggle('low', ratio < 0.25);
  $('chTime').textContent = Math.ceil(Math.max(0, i.left)) + 's';
  $('chProg').textContent = p[0] + ' / ' + p[1] + (i.lives < 50 ? '   ' + '❤'.repeat(Math.max(0, i.lives)) : '');
}
$('chX').onclick = () => { if (!world.challengeActive()) return; stopPuzzle(); S.cur = null; toast('המשימה בוטלה'); renderList(); };
const noteTone = i => tone(260 + (i % 8) * 60, 0.16, 'triangle', 0.08);
const challengeCbs = {
  onChallengeHud: chalHud,
  onChallengePenalty: () => { addHeat(4); },
  onChallengeFx: (k, v) => { if (k === 'note') noteTone(v || 0); else if (k === 'bad') { sBad(); shake(); } else if (k === 'go') { sOk(); toast('עכשיו אתה!', 'm'); } else sBlip(); },
  onChallengeEnd: (ok, why, ratio) => {
    const c = chalCur; chalHud(null); if (!c) return;
    if (ok) { timerRatio = ratio; sWin(); c.onWin(); }
    else failMission(c.m, why || 'נכשלת');
  }
};

/* ----- code (mastermind) ----- */
function puzzleCode(m) {
  const len = clamp(3 + Math.ceil(lv() / 2), 4, 7);
  const secret = Array.from({length: len}, () => ri(0, 9)).join('');
  let attempts = 9;
  $('pz').innerHTML = `<div class="pinfo">נחש קוד בן <b>${len}</b> ספרות · ניסיונות: <b id="att">${attempts}</b></div>
    <div class="grow"><input id="gin" inputmode="numeric" maxlength="${len}" placeholder="${'•'.repeat(len)}" autocomplete="off"><button id="gbtn">נסה</button></div>
    <div id="hist"></div><div class="legend">✔ ספרה במקום הנכון · ✱ ספרה נכונה במקום אחר</div>`;
  const inp = $('gin'); inp.focus();
  const submit = () => {
    const g = inp.value.trim(); inp.value = '';
    if (!new RegExp('^\\d{' + len + '}$').test(g)) { tone(200, 0.1, 'sawtooth', 0.05); return; }
    attempts--; $('att').textContent = attempts;
    let bulls = 0; const sc = {}, gc = {};
    for (let i = 0; i < len; i++) { if (g[i] === secret[i]) bulls++; else { sc[secret[i]] = (sc[secret[i]] || 0) + 1; gc[g[i]] = (gc[g[i]] || 0) + 1; } }
    let cows = 0; for (const k in gc) cows += Math.min(gc[k], sc[k] || 0);
    const d = document.createElement('div'); d.innerHTML = `<b>${g}</b><span>✔ ${bulls} · ✱ ${cows}</span>`;
    $('hist').insertBefore(d, $('hist').firstChild); sBlip();
    if (bulls === len) { win(m); return; }
    addHeat(2); if (S.locked) return;
    if (attempts <= 0) failMission(m, 'נגמרו הניסיונות. הקוד היה ' + secret);
  };
  $('gbtn').onclick = submit;
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  startTimer(Math.max(45, 110 - lv() * 4) + bonusTime(), () => failMission(m, 'נגמר הזמן'));
}

/* ----- caesar ----- */
function shiftText(s, k) { return s.replace(/[A-Z]/g, c => String.fromCharCode((c.charCodeAt(0) - 65 + k + 26) % 26 + 65)); }
function puzzleCaesar(m) {
  const plain = (m.phrase || 'THE GATE IS OPEN').toUpperCase();
  const key = ri(3, 23), cipher = shiftText(plain, key);
  let wrong = 0;
  $('pz').innerHTML = `<div class="pinfo">ההודעה הוצפנה בהזזת אותיות. סובב את הגלגל עד שיופיע טקסט קריא באנגלית.</div>
    <div class="cipher">${esc(cipher)}</div>
    <div class="pinfo">הזזה: <b id="shv">0</b></div>
    <input class="slider" id="sh" type="range" min="0" max="25" value="0">
    <div class="plain" id="pl">${esc(cipher)}</div>
    <button class="big" id="csub">אשר פענוח</button>`;
  const sl = $('sh');
  const upd = () => { const v = +sl.value; $('shv').textContent = v; $('pl').textContent = shiftText(cipher, -v); sKey(); };
  sl.addEventListener('input', upd);
  $('csub').onclick = () => {
    if (+sl.value === key) { win(m); return; }
    wrong++; addHeat(7); sBad(); if (S.locked) return;
    if (wrong >= 5) failMission(m, 'יותר מדי ניסיונות שגויים', 10);
    else toast('לא נכון (' + wrong + '/5)', 'bad');
  };
  startTimer(Math.max(40, 80 - lv() * 3) + bonusTime(), () => failMission(m, 'נגמר הזמן'));
}

/* ----- sequence (simon) ----- */
function puzzleSequence(m) {
  const total = clamp(3 + lv(), 4, 11);
  let round = 2, seq = [], pos = 0, lives = 3, accept = false;
  const tos = [];
  stopFns.push(() => tos.forEach(clearTimeout));
  $('pz').innerHTML = `<div class="pinfo" id="sinfo"></div><div class="padg" id="pads"></div><div class="pinfo">סבב <b id="rd">1</b> / ${total - 1} · ❤ <b id="lv2">${lives}</b></div>`;
  const pads = [];
  for (let i = 0; i < 9; i++) { const b = document.createElement('button'); b.className = 'pad'; b.disabled = true; b.onclick = () => press(i); $('pads').appendChild(b); pads.push(b); }
  const flash = (i, ms = 380) => { pads[i].classList.add('on'); tone(250 + i * 55, ms / 1000, 'sine', 0.09); tos.push(setTimeout(() => pads[i].classList.remove('on'), ms)); };
  for (let i = 0; i < total; i++) seq.push(ri(0, 8));
  function play() {
    accept = false; pos = 0; $('sinfo').textContent = '👀 צפה ברצף...'; pads.forEach(p => p.disabled = true);
    const gap = Math.max(300, 640 - lv() * 25);
    for (let i = 0; i < round; i++) tos.push(setTimeout(() => flash(seq[i]), 700 + i * gap));
    tos.push(setTimeout(() => { accept = true; $('sinfo').textContent = '👉 עכשיו אתה!'; pads.forEach(p => p.disabled = false); }, 700 + round * gap));
  }
  function press(i) {
    if (!accept) return;
    flash(i, 220);
    if (i !== seq[pos]) {
      lives--; $('lv2').textContent = lives; addHeat(6); sBad(); accept = false;
      if (S.locked) return;
      if (lives <= 0) { failMission(m, 'נגמרו החיים', 8); return; }
      tos.push(setTimeout(play, 900)); return;
    }
    pos++;
    if (pos >= round) {
      accept = false;
      if (round >= total) { win(m); return; }
      round++; $('rd').textContent = round - 1; sOk();
      tos.push(setTimeout(play, 800));
    }
  }
  tos.push(setTimeout(play, 300));
  $('timer').hidden = true;
}

/* ----- typing ----- */
function puzzleTyping(m) {
  const phrase = (m.phrase || 'init --target=sim-node --mode=ghost');
  $('pz').innerHTML = `<div class="pinfo">הקלד את הפקודה המדומה בדיוק:</div><div class="phrase" id="ph"></div>
    <input class="fld t" id="ti" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="הקלד כאן...">`;
  const ph = $('ph'), inp = $('ti'); inp.focus();
  const draw = () => {
    const v = inp.value; let h = '';
    for (let i = 0; i < phrase.length; i++) {
      const ch = esc(phrase[i] === ' ' ? ' ' : phrase[i]);
      if (i < v.length) h += `<span class="${v[i] === phrase[i] ? 'ok' : 'bad'}">${ch}</span>`;
      else if (i === v.length) h += `<span class="cur">${ch}</span>`;
      else h += ch;
    }
    ph.innerHTML = h;
  };
  draw();
  inp.addEventListener('input', () => {
    sKey(); draw();
    if (inp.value === phrase) { win(m); return; }
    if (inp.value.length >= phrase.length && inp.value !== phrase) { addHeat(5); if (S.locked) return; sBad(); }
  });
  startTimer(Math.max(16, Math.round(phrase.length * 1.15)) + bonusTime(), () => failMission(m, 'נגמר הזמן'));
}
function puzzleBoss(m) {
  const stages = ['code', 'caesar', 'sequence']; let i = 0;
  const run = () => {
    stopPuzzle(); S.puzzleActive = true;
    const sub = {...m, type: stages[i], boss: false, parent: m, phrase: stages[i] === 'caesar' ? 'SOLAR CORE BREACH' : '', chain: {next: () => { i++; if (i >= stages.length) { win(m); return; } sOk(); toast('👑 שלב ' + (i + 1) + ' מתוך 3', 'm'); run(); }}};
    setModal(head(sub) + `<div class="pinfo" style="color:var(--a)">👑 שלב ${i + 1} / 3</div><div id="timer"><div class="tb"><i id="tbar"></i></div><b id="tl"></b></div><div id="pz"></div>`);
    PUZZLES[sub.type](sub);
  };
  run();
}
const PUZZLES = {code: puzzleCode, caesar: puzzleCaesar, sequence: puzzleSequence, typing: puzzleTyping, boss: puzzleBoss};

/* ---------------- AI ---------------- */
async function callAI(system, user) {
  const {provider, key} = S.ai, model = S.ai.model || PROV[provider].model;
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 45000);
  try {
    let r, j;
    if (provider === 'anthropic') {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctl.signal,
        headers: {'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'},
        body: JSON.stringify({model, max_tokens: 1800, system, messages: [{role: 'user', content: user}]})
      });
      j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
      return (j.content || []).map(c => c.text || '').join('');
    }
    if (provider === 'gemini') {
      r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key), {
        method: 'POST', signal: ctl.signal, headers: {'content-type': 'application/json'},
        body: JSON.stringify({systemInstruction: {parts: [{text: system}]}, contents: [{role: 'user', parts: [{text: user}]}], generationConfig: {responseMimeType: 'application/json'}})
      });
      j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
      return j.candidates[0].content.parts.map(p => p.text || '').join('');
    }
    const url = provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
    r = await fetch(url, {
      method: 'POST', signal: ctl.signal,
      headers: {'content-type': 'application/json', 'authorization': 'Bearer ' + key},
      body: JSON.stringify({model, messages: [{role: 'system', content: system}, {role: 'user', content: user}], max_tokens: 1800})
    });
    j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
    return j.choices[0].message.content;
  } finally { clearTimeout(to); }
}
function sanitizeMission(x) {
  if (!x || typeof x !== 'object') return null;
  const type = String(x.puzzle || x.type || '').toLowerCase();
  if (!TYPES[type]) return null;
  let phrase = String(x.phrase || '');
  if (type === 'caesar') {
    phrase = phrase.toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 28);
    if (phrase.length < 6) phrase = pick(['OPEN THE GATE', 'SIGNAL IS CLEAR', 'GHOST IN THE GRID']);
  } else if (type === 'typing') {
    phrase = phrase.replace(/[^A-Za-z0-9 \-_=.]/g, '').replace(/\s+/g, ' ').trim().slice(0, 36);
    if (phrase.length < 10) phrase = pick(['init --target=sim-node --mode=ghost', 'sync nodes --fast --quiet']);
  } else phrase = '';
  let target = String(x.target || '').toUpperCase().replace(/[^A-Z0-9\- ]/g, '').trim().slice(0, 14);
  if (target.length < 3) target = 'NODE-' + ri(1, 99);
  const title = String(x.title || '').trim().slice(0, 40) || 'משימה מסתורית';
  const story = String(x.story || '').trim().slice(0, 240) || 'משימה חדשה מחכה לך ברשת.';
  return {type, title, story, target, phrase, reward: Number(x.reward) || undefined};
}
async function aiMissions(n = 4) {
  const sys = 'You design missions for a FICTIONAL, harmless puzzle game about hacking in a neon future city. Everything is invented: fictional companies and fake system names. Never mention real companies, real IP addresses or domains, and never give real hacking or exploitation instructions - the puzzles are abstract games. Reply with JSON only.';
  const lo = 40 + S.level * 20, hi = 90 + S.level * 40;
  const user = `Create ${n} different missions for a player at level ${S.level}. Write "title" and "story" in Hebrew (story: 1-2 short sentences). "target" is an invented system name in English capital letters with a number, like VAULT-7. "puzzle" must be one of: "code", "caesar", "sequence", "typing". For "caesar" the field "phrase" is 2-4 English words in capital letters (a readable secret message, 8-26 characters). For "typing" the field "phrase" is a harmless fake terminal command made of simple words, 16-34 characters. For the other puzzles "phrase" is an empty string. "reward" is an integer from ${lo} to ${hi}. Use a variety of puzzle types. Avoid these titles: ${S.missions.map(m => m.title).join(', ') || 'none'}. Output exactly this JSON shape: {"missions":[{"title":"","story":"","target":"","puzzle":"","phrase":"","reward":0}]}`;
  const txt = await callAI(sys, user);
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error('התשובה של ה-AI לא הייתה JSON');
  const data = JSON.parse(txt.slice(a, b + 1));
  const arr = (data.missions || []).map(sanitizeMission).filter(Boolean).slice(0, n);
  if (!arr.length) throw new Error('ה-AI לא החזיר משימות תקינות');
  return arr.map(x => mkMission(x, true));
}
let serverAI = false;
const canServerAI = () => S.isAdmin && serverAI;
async function newMissions() {
  if (S.busy) return;
  if (S.missions.length >= 10) { toast('העולם מלא (עד 10 צמתים)', 'bad'); return; }
  if (!S.ai.key && !canServerAI()) { openApi(); return; }
  S.busy = true; const btn = $('bNew'); btn.disabled = true; btn.textContent = '✨ ה-AI כותב משימות...';
  glog('[*] מבקש משימות מה-AI...', 'm');
  try {
    let list;
    if (canServerAI() && !S.ai.key) {
      const r = await hooks.serverAI('המילה האחרונה בעולם ' + W().en + ', רמת קושי ' + lv(), 3);
      list = (r.missions || []).map(sanitizeMission).filter(Boolean).slice(0, 4).map(x => mkMission(x, true));
      if (!list.length) throw new Error('השרת לא החזיר משימות');
    } else list = await aiMissions(3);
    addMissions(list); toast('✨ נוספו ' + list.length + ' צמתי AI', 'm'); glog('[+] התקבלו משימות מה-AI', 'ok'); sWin();
  } catch (e) {
    console.warn(e);
    toast('ה-AI נכשל: ' + String(e.message || e).slice(0, 80), 'bad'); glog('[!] שגיאת AI', 'w');
  } finally { S.busy = false; btn.disabled = false; renderList(); }
}

/* ---------------- API modal ---------------- */
function renderProvs() {
  const box = $('provs'); box.innerHTML = '';
  Object.keys(PROV).forEach(k => {
    const b = document.createElement('button'); b.className = 'prov' + (S.ai.provider === k ? ' sel' : ''); b.textContent = PROV[k].name;
    b.onclick = () => { S.ai.provider = k; S.ai.model = ''; fillApi(); };
    box.appendChild(b);
  });
}
function fillApi() {
  renderProvs();
  const p = PROV[S.ai.provider];
  $('keyLink').href = p.url; $('keyHint').textContent = p.hint;
  $('keyIn').value = S.ai.key || ''; $('modelIn').value = S.ai.model || ''; $('modelIn').placeholder = 'מודל: ' + p.model;
  $('apiMsg').textContent = ''; $('apiMsg').className = '';
}
function openApi() { fillApi(); $('apiModal').hidden = false; ac(); sBlip(); }
function readApi() { S.ai.key = $('keyIn').value.trim(); S.ai.model = $('modelIn').value.trim(); }
function apiMsg(t, ok) { const m = $('apiMsg'); m.textContent = t; m.className = ok ? 'ok' : 'bad'; }
$('keyEye').onclick = () => { const i = $('keyIn'); i.type = i.type === 'password' ? 'text' : 'password'; };
$('apiTest').onclick = async () => {
  readApi(); if (!S.ai.key) { apiMsg('הדבק קודם מפתח.', false); return; }
  apiMsg('בודק חיבור...', true); $('apiTest').disabled = true;
  try {
    const t = await callAI('Reply with JSON only.', 'Reply with exactly {"ok":true}');
    if (t) apiMsg('✓ החיבור עובד! אפשר לשמור.', true);
  } catch (e) {
    const msg = String(e.message || e);
    apiMsg('✕ לא הצליח: ' + (/fetch|network/i.test(msg) ? 'אין חיבור לשרת של הספק (אינטרנט או חסימה של הדפדפן)' : msg.slice(0, 160)), false);
  }
  $('apiTest').disabled = false;
};
$('apiSave').onclick = () => { readApi(); saveAI(); renderList(); if (S.ai.key) { apiMsg('✓ נשמר. עכשיו לחץ "צור משימות עם AI".', true); toast('✨ AI מחובר: ' + PROV[S.ai.provider].name, 'm'); } else apiMsg('לא הוזן מפתח.', false); };
$('apiDel').onclick = () => { S.ai.key = ''; S.ai.model = ''; saveAI(); fillApi(); renderList(); apiMsg('המפתח נמחק מהדפדפן.', true); };
$('apiClose').onclick = () => { $('apiModal').hidden = true; };
$('bAi').onclick = openApi;
$('bWelAi').onclick = openApi;

/* ---------------- shop ---------------- */
const SHOP = [
  {k: 'stealth', icon: '🕶', name: 'מודול חמקני', desc: 'מקטין עלייה בחום ב-20% לכל רמה (עד 3)', cost: l => 150 * (l + 1), max: 3},
  {k: 'overclock', icon: '⏱', name: 'שעון על', desc: '+8 שניות לכל חידה בכל רמה (עד 3)', cost: l => 120 * (l + 1), max: 3},
  {k: 'coolant', icon: '❄', name: 'נוזל קירור', desc: 'מוריד 50% חום מיד (חד פעמי)', cost: () => 80, max: Infinity}
];
function renderShop() {
  $('shopCr').textContent = Math.round(S.credits);
  const box = $('shopList'); box.innerHTML = '';
  SHOP.forEach(it => {
    const lvl = it.k === 'coolant' ? 0 : S.up[it.k], maxed = lvl >= it.max, cost = it.cost(lvl);
    const d = document.createElement('div'); d.className = 'shopi';
    d.innerHTML = `<span class="ic">${it.icon}</span><span class="tx"><b>${it.name}${it.k !== 'coolant' ? ' · רמה ' + lvl + '/' + it.max : ''}</b><small>${it.desc}</small></span><button ${maxed || S.credits < cost ? 'disabled' : ''}>${maxed ? 'מקסימום' : cost + ' 💠'}</button>`;
    d.querySelector('button').onclick = () => {
      if (S.credits < cost || maxed) return;
      S.credits -= cost;
      if (it.k === 'coolant') { S.heat = Math.max(0, S.heat - 50); } else S.up[it.k]++;
      sOk(); hud(); save(); renderShop(); toast('נרכש: ' + it.name);
    };
    box.appendChild(d);
  });
}
$('bShop').onclick = () => { ac(); renderShop(); $('shopModal').hidden = false; };
$('shopClose').onclick = () => { $('shopModal').hidden = true; };

/* ---------------- buttons ---------------- */
$('bSnd').onclick = () => { S.sound = !S.sound; $('bSnd').textContent = S.sound ? '🔊' : '🔇'; if (master) master.gain.value = S.sound ? 1 : 0; if (S.sound) { ac(); drone(); sOk(); } };
$('bNew').onclick = () => { ac(); newMissions(); };
$('bMis').onclick = () => $('missions').classList.toggle('closed');
$('bStart').onclick = () => { ac(); drone(); sBlip(); $('welcome').hidden = true; openMap(); };
$('bMap').onclick = () => { if (!S.started || S.mapOpen) return; if (hooks.inRoom && !hooks.isHost()) { toast('רק המארח בוחר עולם', 'bad'); return; } ac(); openMap(); };
$('mapBack').onclick = () => { if (S.started) { closeMap(); } else { $('mapUI').hidden = true; document.body.classList.remove('inmap'); S.mapOpen = false; world.showMap(false); $('welcome').hidden = false; } };
addEventListener('keydown', e => { if (e.key === 'Escape') { if (S.skinOpen) closeSkins(); else if (!$('apiModal').hidden) $('apiModal').hidden = true; else if (!$('shopModal').hidden) $('shopModal').hidden = true; else if (!$('modal').hidden) closeModal(); } });
if (innerWidth <= 820) $('missions').classList.add('closed');

/* ---------------- interaction prompt ---------------- */
function updatePrompt() {
  const m = S.near != null ? S.missions.find(q => q.id === S.near) : null;
  const show = !!m && !world_frozen();
  $('prompt').hidden = !show;
  if (show) $('promptTx').textContent = (m.done ? 'שחק שוב: ' : 'פרוץ: ') + m.target + ' · ' + TYPES[m.type].name;
}
const world_frozen = () => !S.started || S.mapOpen || S.locked || S.skinOpen || !$('modal').hidden || overlayOpen();
function interact() { if (S.near != null && !world_frozen()) { ac(); openMission(S.near); } }
$('prompt').onclick = () => interact();
setInterval(updatePrompt, 250);

/* ---------------- skins panel ---------------- */
function applySkin() { world.setSkin(skinById(S.skin)); }
function renderSkins() {
  const el = $('skinPanel');
  el.innerHTML = `<h2><span>🎭 סקינים</span><button class="x" id="skx">✕</button></h2><div class="sub">בחר מראה לדמות · יתרה: <b style="color:#fff">${Math.round(S.credits)}</b> 💠</div><div class="skins" id="skgrid"></div>`;
  const grid = $('skgrid');
  SKINS.forEach(k => {
    const owned = S.ownedSkins.includes(k.id), sel = S.skin === k.id;
    const b = document.createElement('button');
    b.className = 'skin' + (sel ? ' sel' : '') + (owned ? '' : ' lock');
    const sw = k.rainbow ? 'conic-gradient(#f0f,#0ff,#ff0,#0f8,#f0f)' : `linear-gradient(135deg, ${hexCss(k.body)} 0%, ${hexCss(k.body)} 45%, ${hexCss(k.trim)} 46%, ${hexCss(k.trim)} 100%)`;
    b.innerHTML = `<div class="sw" style="background:${sw}"></div><b>${esc(k.name)}</b><small>${sel ? '✓ נבחר' : owned ? 'בחר' : '🔒 ' + k.price + ' 💠'}</small>`;
    b.onclick = () => {
      if (!owned) {
        if (S.credits < k.price) { toast('חסרים ' + Math.round(k.price - S.credits) + ' 💠 · פרוץ עוד צמתים', 'bad'); sBad(); return; }
        S.credits -= k.price; S.ownedSkins.push(k.id); toast('נרכש: ' + k.name, 'm'); hud();
      }
      S.skin = k.id; applySkin(); sOk(); save(); renderSkins();
    };
    grid.appendChild(b);
  });
  $('skx').onclick = closeSkins;
}
function openSkins() {
  if (S.locked || !S.started) return; ac();
  if (!$('modal').hidden) closeModal(true);
  S.skinOpen = true; $('skinPanel').hidden = false; $('missions').style.display = 'none'; renderSkins(); world.previewSkin(true); sBlip();
}
function closeSkins() { S.skinOpen = false; $('skinPanel').hidden = true; $('missions').style.display = ''; world.previewSkin(false); }
$('bSkin').onclick = () => { S.skinOpen ? closeSkins() : openSkins(); };
let camBtnMode = 'play';
$('bCam').onclick = () => { if (!S.started || S.skinOpen) return; camBtnMode = world.getMode() === 'play' ? 'free' : 'play'; world.setMode(camBtnMode); $('bCam').classList.toggle('on', camBtnMode === 'free'); toast(camBtnMode === 'free' ? '🎥 מצלמה חופשית (לחץ שוב לחזרה לדמות)' : '🏃 חזרת לדמות'); };

/* ---------------- worlds, map & fly-in ---------------- */
const isUnlocked = i => i === 0 || S.isAdmin || !!hooks.inRoom || !!(S.worlds[i - 1] && S.worlds[i - 1].done);
function mapData() {
  return WORLDS.map((w, i) => ({...w, locked: !isUnlocked(i), lockText: 'השלם עולם ' + i, done: !!(S.worlds[i] && S.worlds[i].done), stars: S.worlds[i] && S.worlds[i].stars, progress: w.nodes + ' צמתים'}));
}

/* ---------- intro briefing (Hebrew text + spoken voice) ---------- */
const STORIES = [
  'שלום, סוכן. בלב רובע הניאון מערכת הרשת התחילה להתפרק. האורות מהבהבים, הקודים מתבלבלים ורחפן סיור אחד כבר מחפש אותך. אנחנו צריכים שתגיע לצמתים ותתקן אותם, אחד אחד, לפני שהעיר תיכבה לגמרי. עקוב אחרי המשימות ופתור כל אחת בתוך העולם.',
  'יש בעיה במפעל הארגמן. המכונות יצאו משליטה, גחלים עפות באוויר ושני רחפנים שומרים על המקום. אם לא נחזיר את השליטה, כל המפעל ייפול. הגע לצמתים ותקן אותם מהר, כי הזמן כאן קצר יותר.',
  'ביצת הרעל התמלאה בערפל ירוק, והמערכת שם נדבקה בווירוס. שלושה רחפנים מסיירים בין הבצורות הזוהרות. היזהר מהקרניים, הגע לכל צומת ונקה אותו כדי שהביצה תחזור לחיים.',
  'מערך הקרח קפא. כל הנתונים נעולים בתוך גבישי קרח, והרחפנים כאן מהירים במיוחד. החידות קשות יותר, אבל אם תפתור אותן הקרח יימס והמערכת תחזור לעבוד.',
  'מצודת הריק היא המקום המסוכן ביותר עד עכשיו. גשם סגול, אובליסקים אפלים וארבעה רחפנים. כאן כבר צריך מיומנות. תקן את הצמתים לפני שהריק יבלע את הרשת.',
  'הגעת לליבת השמש, המקום האחרון. אם הליבה תקרוס, כל העולמות יפלו איתה. חמישה רחפנים שומרים עליה, ובסוף מחכה בוס עם שלוש חידות ברצף. תקן הכול והצל את הרשת.'
];
let introEl = null;
function stopSpeech() { try { speechSynthesis.cancel(); } catch (e) {} }
function speakHe(text, btn) {
  if (!('speechSynthesis' in window)) { toast('המכשיר לא תומך בהשמעת קול', 'bad'); return; }
  stopSpeech();
  const u = new SpeechSynthesisUtterance(text); u.lang = 'he-IL'; u.rate = 0.95;
  const v = speechSynthesis.getVoices().find(v => /^he/i.test(v.lang) || /hebrew|עברית/i.test(v.name));
  if (v) u.voice = v; else if (speechSynthesis.getVoices().length) toast('לא נמצא קול בעברית במכשיר. אפשר להוסיף אותו בהגדרות הדיבור של הטלפון', 'bad');
  u.onstart = () => { if (btn) btn.textContent = '⏹ עצור'; };
  u.onend = u.onerror = () => { if (btn) btn.textContent = '🔊 השמע'; };
  speechSynthesis.speak(u);
}
function closeIntro() { stopSpeech(); if (introEl) { introEl.remove(); introEl = null; } }
function showIntro(wi) {
  closeIntro();
  const w = WORLDS[wi], story = STORIES[wi] || w.blurb;
  const el = document.createElement('section'); el.id = 'intro'; el.className = 'glass';
  el.innerHTML = '<div class="it">🌍 ' + w.name + ' <small>' + w.en + '</small></div><p></p><div class="ib2"><button class="ib" id="introSay">🔊 השמע</button><button class="ib ai" id="introGo">בואו נתחיל ▶</button></div>';
  el.querySelector('p').textContent = story;
  document.body.appendChild(el); introEl = el;
  const say = el.querySelector('#introSay');
  say.onclick = () => { if (speechSynthesis.speaking) { stopSpeech(); say.textContent = '🔊 השמע'; } else speakHe(w.name + '. ' + story, say); };
  el.querySelector('#introGo').onclick = closeIntro;
}
(() => { const st = document.createElement('style'); st.textContent = '#intro{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);width:min(560px,94vw);max-height:60vh;overflow-y:auto;padding:12px 16px;z-index:30;text-align:right;direction:rtl}#intro .it{font-size:17px;color:var(--g);margin-bottom:6px;letter-spacing:1px}#intro .it small{font-size:11px;opacity:.7}#intro p{font-size:14px;line-height:1.6;margin-bottom:10px}#intro .ib2{display:flex;gap:8px;justify-content:flex-start}@media(max-height:480px){#intro{bottom:4px;padding:8px 12px;max-height:72vh}#intro p{font-size:12px;line-height:1.45;margin-bottom:6px}#intro .it{font-size:14px;margin-bottom:3px}}'; document.head.appendChild(st); })();
function enterWorld(wi, seed) {
  S.wi = wi; S.seed = seed; S.heat = 0; S.heatMax = 0; S.cur = null; S.near = null;
  S.missions = genMissions(wi, seed);
  world.applyTheme(wi, seed); rescaleDrones();
  refreshWorld(); hud(); $('wchip').hidden = false;
  glog('[*] נכנסת לעולם: ' + W().en, 'ok'); glog('[*] ' + W().blurb);
  if (hooks.onWorldEntered) hooks.onWorldEntered(wi, seed);
  if (!/#(walk|map|demo)/.test(location.hash)) showIntro(wi);
}
function openMap() {
  closeIntro();
  closeModal(true); if (S.skinOpen) closeSkins();
  S.mapOpen = true; document.body.classList.add('inmap'); $('mapUI').hidden = false; $('mapBack').hidden = false;
  $('mapTitle').textContent = hooks.inRoom ? (hooks.isHost() ? '🌍 בחר עולם לכל החדר' : '🌍 מפת העולמות') : '🌍 בחר עולם · לחץ על כוכב כדי לטוס אליו';
  world.setMapData(mapData()); world.showMap(true);
}
function closeMap() {
  S.mapOpen = false; document.body.classList.remove('inmap'); $('mapUI').hidden = true; $('tip').hidden = true;
  world.showMap(false); world.setMode('play');
}
function pickWorld(i) {
  if (world.isFlying()) return;
  if (hooks.inRoom && !hooks.isHost()) { toast('רק המארח בוחר עולם לחדר', 'bad'); return; }
  if (!isUnlocked(i)) { toast('🔒 השלם קודם את ' + WORLDS[i - 1].name, 'bad'); sBad(); return; }
  if (hooks.inRoom) { hooks.sendWorld(i); return; }
  flyToWorld(i, (Math.random() * 1e9) | 0);
}
function flyToWorld(i, seed) {
  ac(); drone(); sWin(); $('tip').hidden = true; $('mapBack').hidden = true; $('welcome').hidden = true;
  if (!S.mapOpen) { document.body.classList.add('inmap'); S.mapOpen = true; world.setMapData(mapData()); world.showMap(true); }
  $('mapTitle').textContent = '✈ טסים אל ' + WORLDS[i].name + '...';
  const go = () => world.flyInto(i, () => {
    S.started = true; S.mapOpen = false; document.body.classList.remove('inmap'); $('mapUI').hidden = true;
    enterWorld(i, seed);
  });
  setTimeout(go, 350);
}
function completeWorld() {
  if (S.locked || !S.started) return;
  const wi = S.wi, stars = S.heatMax < 35 ? 3 : S.heatMax < 70 ? 2 : 1, prev = S.worlds[wi], first = !(prev && prev.done);
  S.worlds[wi] = {done: true, stars: Math.max(stars, (prev && prev.stars) || 0)};
  const bonus = first ? 150 + wi * 60 : 0; S.credits += bonus; hud(); save();
  sWin(); world.celebrate(); world.glitch(0.3, 0.6); stopPuzzle();
  const last = wi >= WORLDS.length - 1;
  setModal(`<div class="res ok"><h2>🌍 העולם הושלם!</h2><p>${esc(W().name)}<br><span style="color:#ffd24a;font-size:24px">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span><br><small>פחות חום = יותר כוכבים</small>${bonus ? '<br>בונוס: +' + bonus + ' 💠' : ''}${!last && first ? '<br>נפתח עולם חדש: ' + esc(WORLDS[wi + 1].name) : ''}${last ? '<br>🏆 סיימת את כל העולמות!' : ''}</p></div><button class="big" id="wmap">🗺 למפת העולמות</button><button class="big sec" id="wstay">הישאר בעולם</button>`);
  $('wmap').onclick = () => { if (hooks.inRoom && !hooks.isHost()) { closeModal(); toast('המארח בוחר את העולם הבא', ''); } else openMap(); };
  $('wstay').onclick = () => closeModal();
}
$('wchip').onclick = () => $('bMap').click();

/* ---------------- touch controls ---------------- */
(function touch() {
  const joy = $('joy'), knob = $('joyk'); let id = null;
  const set = (e) => {
    const r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy; const m = Math.hypot(dx, dy), R = r.width / 2 - 8;
    if (m > R) { dx = dx / m * R; dy = dy / m * R; }
    knob.style.transform = `translate(${dx}px,${dy}px)`; world.setJoy(dx / R, -dy / R);
  };
  joy.addEventListener('pointerdown', e => { id = e.pointerId; joy.setPointerCapture(id); ac(); set(e); e.preventDefault(); });
  joy.addEventListener('pointermove', e => { if (e.pointerId === id) set(e); });
  const end = e => { if (e.pointerId === id) { id = null; knob.style.transform = ''; world.setJoy(0, 0); } };
  joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
  $('jbtn').addEventListener('pointerdown', e => { ac(); world.jump(); e.preventDefault(); });
})();

/* ---------------- init ---------------- */
load();
applySkin();
S.missions = genMissions(0, 1);
refreshWorld(); hud();
$('hint').hidden = false;

const online = initOnline({
  S, world, hooks, WORLDS, SKINS, skinById, toast, glog, esc, $, sOk, sBad, sBlip, sWin, ac,
  getProgress, applyProgress, refreshWorld, renderList, hud, save,
  setAdmin: (isAdmin, serverAi) => { S.isAdmin = !!isAdmin; serverAI = !!serverAi; renderList(); },
  setOnSaved: f => { onSaved = f; },
  flyToWorld, enterWorld, openMap, closeMap, isUnlocked, closeModal, openApi,
  markDone: idx => { const m = S.missions[idx]; if (m && !m.done) { m.done = true; world.burst(m.id); refreshWorld(); glog('[+] ' + m.target + ' נפרץ על ידי חבר', 'ok'); if (S.missions.every(q => q.done)) setTimeout(completeWorld, 1400); } },
  missions: () => S.missions,
  addAIFromServer: r => addMissions((r.missions || []).map(sanitizeMission).filter(Boolean).slice(0, 4).map(x => mkMission(x, true))),
  start: () => { S.started = true; },
});

hooks.tier = tier; hooks.onRoomSize = () => { rescaleDrones(); renderList(); };
window.__gg = {S, world, openMission, startPuzzle, enterWorld, openMap, WORLDS, online, hooks};
/* demo hooks for screenshots */
const H = location.hash;
const hw = +((H.match(/w=(\d)/) || [])[1] || 0);
const quickStart = () => { $('welcome').hidden = true; const a = $('auth'); if (a) a.hidden = true; S.started = true; enterWorld(hw, 5); world.resetPlayer(); world.setMode('play'); };
if (H.includes('demo')) {
  setTimeout(quickStart, 300);
  setTimeout(() => { openMission(S.missions[0].id); startPuzzle(S.missions[0]); }, 900);
  setTimeout(() => { const i = $('gin'); if (i) { i.value = '1234'; $('gbtn').click(); i.value = '5678'; $('gbtn').click(); } }, 1400);
}
if (H.includes('walk')) { setTimeout(quickStart, 300); }
if (H.includes('near')) { setTimeout(quickStart, 300); setTimeout(() => { world.focusNode(S.missions[1].id); }, 1200); }
if (H.includes('skin')) {
  const id = (H.match(/skin=([a-z]+)/) || [])[1] || 'samurai';
  S.ownedSkins = SKINS.map(k => k.id); S.skin = id; S.credits = 500; applySkin();
  setTimeout(quickStart, 300); setTimeout(() => { openSkins(); }, 1500);
}
if (H.includes('hack')) { setTimeout(quickStart, 300); setTimeout(() => { const m = S.missions[0]; world.focusNode(m.id); openMission(m.id); startPuzzle(m); }, 1500); }
if (H.includes('api')) { setTimeout(() => { quickStart(); openApi(); }, 300); }
if (H.includes('brief')) { setTimeout(quickStart, 300); setTimeout(() => openMission(S.missions[4 % S.missions.length].id), 700); }
if (H.includes('map')) { setTimeout(() => { if ($('auth')) $('auth').hidden = true; $('welcome').hidden = true; S.started = true; openMap(); }, 300); }
