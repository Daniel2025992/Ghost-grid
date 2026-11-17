// GHOST//GRID server: accounts, roles, rooms (WebSocket), admin API, server-side AI.
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, 'public');
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- tiny JSON DB ----------
let db = { users: {}, sessions: {}, settings: { allowSignup: true, allowPublicRooms: true, maxRoomPlayers: 8, aiForAdmins: true, aiModel: 'claude-sonnet-4-5' } };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch {}
let saveT = null;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { const tmp = DB_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, DB_FILE); }, 150); }
function saveNow() { clearTimeout(saveT); fs.writeFileSync(DB_FILE, JSON.stringify(db)); }

// ---------- crypto ----------
const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') });
const checkPw = (pw, u) => { if (!u.hash) return false; const h = crypto.scryptSync(pw, u.salt, 64); return crypto.timingSafeEqual(h, Buffer.from(u.hash, 'hex')); };
const uid = () => crypto.randomBytes(8).toString('hex');
const normEmail = e => String(e || '').trim().toLowerCase();
const validEmail = e => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e);
const nameTaken = (n, exceptId) => Object.values(db.users).some(u => u.id !== exceptId && u.name.toLowerCase() === n.toLowerCase());
const validName = n => /^[\p{L}\p{N}_.\- ]{3,20}$/u.test(n);
function uniqueName(base) {
  let b = String(base || 'player').replace(/[^\p{L}\p{N}_.\-]/gu, '').slice(0, 16) || 'player'; if (b.length < 3) b += '123';
  let n = b, i = 1; while (nameTaken(n)) n = b.slice(0, 16) + (++i); return n;
}
const publicUser = u => ({ id: u.id, email: u.email, name: u.name, role: u.role, banned: !!u.banned, created: u.created, google: !!u.google });

// ---------- bootstrap owner ----------
function ensureOwner() {
  const email = normEmail(process.env.OWNER_EMAIL);
  const pw = process.env.OWNER_PASSWORD;
  if (!email || !pw) return;
  let u = Object.values(db.users).find(x => x.email === email);
  if (!u) {
    u = { id: uid(), email, name: uniqueName('Owner'), role: 'owner', created: Date.now(), ...hashPw(pw), progress: null };
    db.users[u.id] = u;
  } else {
    u.role = 'owner'; Object.assign(u, hashPw(pw));
  }
  saveNow();
}
ensureOwner();

// ---------- rate limit ----------
const hits = new Map();
function limited(key, max, ms) {
  const now = Date.now(); const arr = (hits.get(key) || []).filter(t => now - t < ms);
  arr.push(now); hits.set(key, arr); return arr.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some(t => now - t < 600000)) hits.delete(k); }, 60000).unref();

// ---------- sessions ----------
function newSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { userId, created: Date.now() }; save(); return token;
}
function userFromToken(token) {
  const s = db.sessions[token]; if (!s) return null;
  const u = db.users[s.userId]; if (!u || u.banned) return null; return u;
}

// ---------- http ----------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));
app.use((req, res, next) => { // CORS so the APK/EXE (other origins) can reach the server
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
const ip = req => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

const auth = (req, res, next) => {
  const t = (req.headers.authorization || '').replace(/^Bearer /, '');
  const u = userFromToken(t); if (!u) return res.status(401).json({ error: 'unauthorized' });
  req.user = u; req.token = t; next();
};
const isAdmin = u => u.role === 'admin' || u.role === 'owner';
const adminOnly = (req, res, next) => isAdmin(req.user) ? next() : res.status(403).json({ error: 'admin only' });
const ownerOnly = (req, res, next) => req.user.role === 'owner' ? next() : res.status(403).json({ error: 'owner only' });

app.get('/api/config', (req, res) => res.json({
  name: 'GHOST//GRID', googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  allowSignup: db.settings.allowSignup, allowPublicRooms: db.settings.allowPublicRooms, aiForAdmins: db.settings.aiForAdmins && !!process.env.ANTHROPIC_API_KEY,
}));

app.post('/api/register', (req, res) => {
  if (limited('reg' + ip(req), 10, 3600000)) return res.status(429).json({ error: 'too many attempts' });
  if (!db.settings.allowSignup) return res.status(403).json({ error: 'signup disabled' });
  const email = normEmail(req.body.email), pw = String(req.body.password || ''), name = String(req.body.name || '').trim();
  if (!validEmail(email)) return res.status(400).json({ error: 'invalid email' });
  if (!validName(name)) return res.status(400).json({ error: 'username must be 3-20 letters/numbers' });
  if (pw.length < 8 || pw.length > 200) return res.status(400).json({ error: 'password must be 8+ chars' });
  if (nameTaken(name)) return res.status(409).json({ error: 'username already taken' });
  if (Object.values(db.users).some(u => u.email === email)) return res.status(409).json({ error: 'email already registered' });
  const u = { id: uid(), email, name, role: 'player', created: Date.now(), ...hashPw(pw), progress: null };
  db.users[u.id] = u; save();
  res.json({ token: newSession(u.id), user: publicUser(u) });
});

app.post('/api/login', (req, res) => {
  if (limited('login' + ip(req), 20, 600000)) return res.status(429).json({ error: 'too many attempts' });
  const idf = String(req.body.email || '').trim().toLowerCase(), pw = String(req.body.password || '');
  const u = Object.values(db.users).find(x => x.email === idf || x.name.toLowerCase() === idf);
  if (!u || !checkPw(pw, u)) return res.status(401).json({ error: 'wrong email or password' });
  if (u.banned) return res.status(403).json({ error: 'account banned' });
  res.json({ token: newSession(u.id), user: publicUser(u) });
});

app.post('/api/google', async (req, res) => {
  const cid = process.env.GOOGLE_CLIENT_ID;
  if (!cid) return res.status(501).json({ error: 'Google login not configured on this server' });
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(String(req.body.credential || '')));
    const g = await r.json();
    if (!r.ok || g.aud !== cid || !(g.email_verified === true || g.email_verified === 'true')) return res.status(401).json({ error: 'invalid Google token' });
    const email = normEmail(g.email);
    let u = Object.values(db.users).find(x => x.email === email);
    if (!u) {
      if (!db.settings.allowSignup) return res.status(403).json({ error: 'signup disabled' });
      u = { id: uid(), email, name: uniqueName(g.name || email.split('@')[0]), role: 'player', created: Date.now(), google: true, progress: null };
      db.users[u.id] = u;
    } else u.google = true;
    if (u.banned) return res.status(403).json({ error: 'account banned' });
    save(); res.json({ token: newSession(u.id), user: publicUser(u) });
  } catch (e) { res.status(502).json({ error: 'google verification failed' }); }
});

app.post('/api/logout', auth, (req, res) => { delete db.sessions[req.token]; save(); res.json({ ok: true }); });
app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user), progress: req.user.progress }));
app.put('/api/progress', auth, (req, res) => {
  const p = req.body.progress; if (!p || typeof p !== 'object' || JSON.stringify(p).length > 100000) return res.status(400).json({ error: 'bad progress' });
  req.user.progress = p; save(); res.json({ ok: true });
});
app.put('/api/me', auth, (req, res) => {
  if (req.body.name) { const n = String(req.body.name).trim(); if (!validName(n)) return res.status(400).json({ error: 'username must be 3-20 letters/numbers' }); if (nameTaken(n, req.user.id)) return res.status(409).json({ error: 'username already taken' }); req.user.name = n; }
  if (req.body.password) {
    if (String(req.body.password).length < 8) return res.status(400).json({ error: 'password must be 8+ chars' });
    Object.assign(req.user, hashPw(String(req.body.password)));
  }
  save(); res.json({ user: publicUser(req.user) });
});

// ----- admin -----
app.get('/api/admin/users', auth, adminOnly, (req, res) => res.json({ users: Object.values(db.users).map(publicUser) }));
app.post('/api/admin/users/:id/role', auth, adminOnly, (req, res) => {
  const t = db.users[req.params.id]; const role = req.body.role;
  if (!t) return res.status(404).json({ error: 'no such user' });
  if (!['player', 'admin'].includes(role)) return res.status(400).json({ error: 'role must be player or admin' });
  if (t.role === 'owner') return res.status(403).json({ error: 'cannot change owner' });
  t.role = role; save(); res.json({ user: publicUser(t) });
});
// add admin by email (user must already be registered, or create with password)
app.post('/api/admin/add', auth, adminOnly, (req, res) => {
  const email = normEmail(req.body.email); if (!validEmail(email)) return res.status(400).json({ error: 'invalid email' });
  let t = Object.values(db.users).find(x => x.email === email);
  let tempPassword = null;
  if (!t) {
    tempPassword = String(req.body.password || crypto.randomBytes(6).toString('base64url'));
    if (tempPassword.length < 8) return res.status(400).json({ error: 'password must be 8+ chars' });
    t = { id: uid(), email, name: uniqueName(email.split('@')[0]), role: 'admin', created: Date.now(), ...hashPw(tempPassword), progress: null };
    db.users[t.id] = t;
  } else if (t.role !== 'owner') t.role = 'admin';
  save(); res.json({ user: publicUser(t), tempPassword });
});
app.post('/api/admin/users/:id/ban', auth, adminOnly, (req, res) => {
  const t = db.users[req.params.id]; if (!t) return res.status(404).json({ error: 'no such user' });
  if (t.role === 'owner' || (t.role === 'admin' && req.user.role !== 'owner')) return res.status(403).json({ error: 'not allowed' });
  t.banned = !!req.body.banned;
  if (t.banned) for (const [k, s] of Object.entries(db.sessions)) if (s.userId === t.id) delete db.sessions[k];
  save(); kickUser(t.id); res.json({ user: publicUser(t) });
});
app.post('/api/admin/users/:id/reset-password', auth, adminOnly, (req, res) => {
  const t = db.users[req.params.id]; if (!t) return res.status(404).json({ error: 'no such user' });
  if (t.role === 'owner' && req.user.role !== 'owner') return res.status(403).json({ error: 'not allowed' });
  const pw = String(req.body.password || crypto.randomBytes(6).toString('base64url'));
  if (pw.length < 8) return res.status(400).json({ error: 'password must be 8+ chars' });
  Object.assign(t, hashPw(pw)); save(); res.json({ tempPassword: pw });
});
app.post('/api/admin/transfer-owner', auth, ownerOnly, (req, res) => {
  const t = db.users[req.body.userId]; if (!t) return res.status(404).json({ error: 'no such user' });
  req.user.role = 'admin'; t.role = 'owner'; save(); res.json({ ok: true });
});
app.get('/api/admin/settings', auth, adminOnly, (req, res) => res.json({ settings: db.settings, aiConfigured: !!process.env.ANTHROPIC_API_KEY, googleConfigured: !!process.env.GOOGLE_CLIENT_ID }));
app.put('/api/admin/settings', auth, adminOnly, (req, res) => {
  const s = req.body.settings || {}, d = db.settings;
  for (const k of ['allowSignup', 'allowPublicRooms', 'aiForAdmins']) if (typeof s[k] === 'boolean') d[k] = s[k];
  if (Number.isInteger(s.maxRoomPlayers)) d.maxRoomPlayers = Math.min(32, Math.max(2, s.maxRoomPlayers));
  if (typeof s.aiModel === 'string' && /^[\w.\-]{3,60}$/.test(s.aiModel)) d.aiModel = s.aiModel;
  save(); res.json({ settings: d });
});
app.get('/api/admin/rooms', auth, adminOnly, (req, res) => res.json({ rooms: [...rooms.values()].map(r => roomInfo(r, true)) }));
app.delete('/api/admin/rooms/:code', auth, adminOnly, (req, res) => {
  const r = rooms.get(req.params.code); if (!r) return res.status(404).json({ error: 'no such room' });
  closeRoom(r, 'closed by admin'); res.json({ ok: true });
});

// ----- AI (server key, admins only) -----
const AI_SYSTEM = `You design missions for GHOST//GRID, a FICTIONAL cyberpunk puzzle game. Nothing is real hacking; all targets are invented. Reply with ONLY valid JSON.`;
app.post('/api/ai/missions', auth, adminOnly, async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(501).json({ error: 'ANTHROPIC_API_KEY is not set on the server' });
  if (!db.settings.aiForAdmins) return res.status(403).json({ error: 'AI disabled in settings' });
  if (limited('ai' + req.user.id, 30, 3600000)) return res.status(429).json({ error: 'AI rate limit' });
  const theme = String(req.body.theme || 'cyberpunk').slice(0, 200), n = Math.min(8, Math.max(1, +req.body.count || 4));
  const prompt = `Create ${n} different fictional missions for a harmless puzzle game about hacking in a neon future city. Theme: "${theme}". Everything is invented, no real companies, domains or real hacking instructions. Write "title" and "story" in Hebrew (story: 1-2 short sentences). "target" is an invented system name in English capital letters with a number, like VAULT-7. "puzzle" must be one of: "code", "caesar", "sequence", "typing". For "caesar" the "phrase" is 2-4 English capital words (8-26 chars). For "typing" the "phrase" is a harmless fake terminal command of simple words (16-34 chars). Otherwise "phrase" is "". "reward" is an integer 80-400. Output exactly: {"missions":[{"title":"","story":"","target":"","puzzle":"","phrase":"","reward":0}]}`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: db.settings.aiModel, max_tokens: 1500, system: AI_SYSTEM, messages: [{ role: 'user', content: prompt }] }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j.error?.message || 'AI error' });
    const text = j.content?.map(c => c.text || '').join('') || '';
    const m = text.match(/\{[\s\S]*\}/); if (!m) return res.status(502).json({ error: 'AI returned no JSON' });
    res.json(JSON.parse(m[0]));
  } catch (e) { res.status(502).json({ error: 'AI request failed' }); }
});

// static client
if (fs.existsSync(PUBLIC_DIR)) app.use(express.static(PUBLIC_DIR));
app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---------- rooms ----------
const rooms = new Map(); // code -> room
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode() { let c; do { c = Array.from(crypto.randomBytes(5), b => CODE_CH[b % CODE_CH.length]).join(''); } while (rooms.has(c)); return c; }
function roomInfo(r, full) {
  return { code: r.code, name: r.name, world: r.world, seed: r.seed, private: r.private, players: r.members.size, max: r.max, host: r.hostName, ...(full ? { members: [...r.members.values()].map(m => m.user.name) } : {}) };
}
function send(ws, o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)); }
function bcast(r, o, except) { const s = JSON.stringify(o); for (const m of r.members.values()) if (m.ws !== except && m.ws.readyState === 1) m.ws.send(s); }
function closeRoom(r, why) { for (const m of r.members.values()) { send(m.ws, { t: 'closed', why }); m.ws.room = null; } rooms.delete(r.code); }
function leave(ws) {
  const r = ws.room; if (!r) return; ws.room = null;
  r.members.delete(ws.user.id); bcast(r, { t: 'left', id: ws.user.id });
  if (!r.members.size) rooms.delete(r.code);
  else if (r.hostId === ws.user.id) { const nh = r.members.values().next().value; r.hostId = nh.user.id; r.hostName = nh.user.name; bcast(r, { t: 'host', id: r.hostId }); }
}
function kickUser(id) { for (const c of wss.clients) if (c.user?.id === id) { send(c, { t: 'kicked' }); c.close(); } }

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
const lobby = new Set();

wss.on('connection', ws => {
  ws.user = null; ws.room = null; ws.alive = true; ws.bucket = { n: 60, t: Date.now() };
  ws.on('pong', () => ws.alive = true);
  ws.on('message', raw => {
    // simple token bucket: ~40 msgs/sec
    const now = Date.now(); ws.bucket.n = Math.min(60, ws.bucket.n + (now - ws.bucket.t) / 25); ws.bucket.t = now;
    if (--ws.bucket.n < 0) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!ws.user) {
      if (m.t !== 'auth') return;
      const u = userFromToken(m.token); if (!u) { send(ws, { t: 'auth', ok: false }); return ws.close(); }
      ws.user = u; return send(ws, { t: 'auth', ok: true, user: publicUser(u) });
    }
    const u = ws.user, r = ws.room;
    switch (m.t) {
      case 'list': {
        if (!db.settings.allowPublicRooms) return send(ws, { t: 'rooms', rooms: [] });
        return send(ws, { t: 'rooms', rooms: [...rooms.values()].filter(x => !x.private && x.members.size < x.max).map(x => roomInfo(x)) });
      }
      case 'create': {
        if (r) leave(ws);
        const priv = !!m.private; if (!priv && !db.settings.allowPublicRooms) return send(ws, { t: 'err', error: 'public rooms disabled' });
        const room = { code: genCode(), name: String(m.name || u.name + "'s room").slice(0, 30), world: Math.max(0, Math.min(20, m.world | 0)), seed: (Math.random() * 2 ** 31) | 0, private: priv, max: db.settings.maxRoomPlayers, hostId: u.id, hostName: u.name, members: new Map() };
        rooms.set(room.code, room); return join(ws, room);
      }
      case 'join': {
        const room = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!room) return send(ws, { t: 'err', error: 'room not found' });
        if (room.members.size >= room.max && !room.members.has(u.id)) return send(ws, { t: 'err', error: 'room full' });
        if (r) leave(ws); return join(ws, room);
      }
      case 'leave': return leave(ws), send(ws, { t: 'left-room' });
      case 'state': if (r) { const mem = r.members.get(u.id); const p = m.p; if (Array.isArray(p) && p.length === 4 && p.every(Number.isFinite)) { mem.p = p; bcast(r, { t: 'state', id: u.id, p, a: m.a | 0 }, ws); } } return;
      case 'skin': if (r && typeof m.skin === 'string') { r.members.get(u.id).skin = m.skin.slice(0, 20); bcast(r, { t: 'skin', id: u.id, skin: m.skin.slice(0, 20) }, ws); } return;
      case 'chat': if (r) { const txt = String(m.text || '').slice(0, 200).trim(); if (txt) bcast(r, { t: 'chat', id: u.id, name: u.name, text: txt }); } return;
      case 'world': if (r && r.hostId === u.id) { r.world = Math.max(0, Math.min(20, m.world | 0)); r.seed = (Math.random() * 2 ** 31) | 0; bcast(r, { t: 'world', world: r.world, seed: r.seed }); } return;
      case 'done': if (r && Number.isInteger(m.node) && m.node >= 0 && m.node < 64) bcast(r, { t: 'done', id: u.id, name: u.name, node: m.node }); return;
      case 'kick': if (r && r.hostId === u.id && r.members.has(m.id) && m.id !== u.id) { const t = r.members.get(m.id); send(t.ws, { t: 'kicked' }); leave(t.ws); } return;
    }
  });
  ws.on('close', () => leave(ws));
});
function join(ws, room) {
  room.members.set(ws.user.id, { ws, user: ws.user, p: [0, 0, 0, 0], skin: 'ghost' });
  ws.room = room;
  send(ws, { t: 'joined', room: roomInfo(room), you: ws.user.id, host: room.hostId, peers: [...room.members.values()].filter(m => m.ws !== ws).map(m => ({ id: m.user.id, name: m.user.name, skin: m.skin, p: m.p })) });
  bcast(room, { t: 'joined-peer', peer: { id: ws.user.id, name: ws.user.name, skin: 'ghost', p: [0, 0, 0, 0] } }, ws);
}
setInterval(() => { for (const c of wss.clients) { if (!c.alive) { c.terminate(); continue; } c.alive = false; c.ping(); } }, 30000).unref();

export { server, db, saveNow };
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => console.log(`GHOST//GRID server on :${PORT}`));
  process.on('SIGTERM', () => { saveNow(); process.exit(0); });
}
