// End-to-end server test: node test.js
import { spawn } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocket } from 'ws';
import assert from 'node:assert/strict';

const port = 3900 + Math.floor(Math.random() * 90);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-'));
const proc = spawn('node', ['index.js'], { cwd: path.dirname(new URL(import.meta.url).pathname), env: { ...process.env, PORT: port, DATA_DIR: dir, OWNER_EMAIL: 'boss@example.com', OWNER_PASSWORD: 'Sup3r-secret-pw', ANTHROPIC_API_KEY: '' }, stdio: 'inherit' });
const B = `http://localhost:${port}`;
const api = async (p, method = 'GET', body, tok) => {
  const r = await fetch(B + p, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, j: await r.json().catch(() => ({})) };
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
function wsc(token) {
  return new Promise(res => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`); ws.msgs = [];
    ws.on('message', d => ws.msgs.push(JSON.parse(d)));
    ws.on('open', () => { ws.send(JSON.stringify({ t: 'auth', token })); });
    ws.waitFor = async (t, ms = 2000) => { const end = Date.now() + ms; while (Date.now() < end) { const i = ws.msgs.findIndex(m => m.t === t); if (i >= 0) return ws.msgs.splice(i, 1)[0]; await sleep(20); } throw new Error('timeout waiting ' + t); };
    ws.on('message', function f() { if (ws.msgs.some(m => m.t === 'auth')) { ws.off('message', f); res(ws); } });
  });
}
let ok = 0; const t = (n, c) => { assert.ok(c, n); ok++; console.log('  ✓', n); };

try {
  for (let i = 0; i < 50; i++) { try { await fetch(B + '/healthz'); break; } catch { await sleep(100); } }
  // auth
  let r = await api('/api/login', 'POST', { email: 'boss@example.com', password: 'bad' }); t('wrong password rejected', r.s === 401);
  r = await api('/api/login', 'POST', { email: 'boss@example.com', password: 'Sup3r-secret-pw' }); t('owner login', r.s === 200 && r.j.user.role === 'owner');
  const owner = r.j.token;
  r = await api('/api/register', 'POST', { email: 'a@x.com', password: 'short' }); t('short password rejected', r.s === 400);
  r = await api('/api/register', 'POST', { email: 'bad', password: 'longenough1' }); t('bad email rejected', r.s === 400);
  r = await api('/api/register', 'POST', { email: 'a@x.com', password: 'password1', name: 'Alice' }); t('register', r.s === 200 && r.j.user.role === 'player');
  const alice = r.j.token, aliceId = r.j.user.id;
  r = await api('/api/register', 'POST', { email: 'A@x.com', password: 'password1', name: 'Other' }); t('duplicate email (case-insens.)', r.s === 409);
  r = await api('/api/register', 'POST', { email: 'z@x.com', password: 'password1' }); t('username required', r.s === 400);
  r = await api('/api/register', 'POST', { email: 'z@x.com', password: 'password1', name: 'ab' }); t('username too short', r.s === 400);
  r = await api('/api/register', 'POST', { email: 'z@x.com', password: 'password1', name: 'alice' }); t('username unique (case-insens.)', r.s === 409);
  r = await api('/api/login', 'POST', { email: 'alice', password: 'password1' }); t('login with username', r.s === 200);
  r = await api('/api/register', 'POST', { email: 'b@x.com', password: 'password2', name: 'Bob' }); const bob = r.j.token, bobId = r.j.user.id;
  r = await api('/api/me', 'GET', null, alice); t('me', r.j.user.email === 'a@x.com');
  r = await api('/api/progress', 'PUT', { progress: { xp: 5 } }, alice); r = await api('/api/me', 'GET', null, alice); t('progress saved', r.j.progress.xp === 5);
  // permissions
  r = await api('/api/admin/users', 'GET', null, alice); t('player blocked from admin API', r.s === 403);
  r = await api('/api/admin/users', 'GET', null, owner); t('owner sees users', r.j.users.length === 3);
  r = await api('/api/ai/missions', 'POST', {}, alice); t('player blocked from AI', r.s === 403);
  r = await api('/api/ai/missions', 'POST', {}, owner); t('admin AI w/o server key -> clear 501', r.s === 501);
  // admins
  r = await api(`/api/admin/users/${aliceId}/role`, 'POST', { role: 'admin' }, owner); t('promote to admin', r.j.user.role === 'admin');
  r = await api('/api/admin/add', 'POST', { email: 'new@x.com' }, alice); t('admin adds new admin w/ temp password', r.j.user.role === 'admin' && r.j.tempPassword.length >= 8);
  const tmpPw = r.j.tempPassword; r = await api('/api/login', 'POST', { email: 'new@x.com', password: tmpPw }); t('new admin can log in', r.s === 200);
  r = await api(`/api/admin/users/${bobId}/role`, 'POST', { role: 'owner' }, alice); t('cannot grant owner', r.s === 400);
  const ownerId = (await api('/api/admin/users', 'GET', null, owner)).j.users.find(u => u.role === 'owner').id;
  r = await api(`/api/admin/users/${ownerId}/role`, 'POST', { role: 'player' }, alice); t('admin cannot demote owner', r.s === 403);
  r = await api(`/api/admin/users/${ownerId}/ban`, 'POST', { banned: true }, alice); t('admin cannot ban owner', r.s === 403);
  r = await api('/api/admin/settings', 'PUT', { settings: { maxRoomPlayers: 3 } }, alice); t('admin changes settings', r.j.settings.maxRoomPlayers === 3);
  // rooms
  const wa = await wsc(alice), wb = await wsc(bob);
  wa.send(JSON.stringify({ t: 'create', private: true, name: 'Test', world: 2 }));
  const j = await wa.waitFor('joined'); t('create private room', j.room.private && j.room.code.length === 5 && j.host === aliceId);
  wb.send(JSON.stringify({ t: 'list' })); const l = await wb.waitFor('rooms'); t('private room hidden from list', l.rooms.length === 0);
  wb.send(JSON.stringify({ t: 'join', code: j.room.code.toLowerCase() })); const jb = await wb.waitFor('joined'); t('join by code (case-insens.)', jb.peers.length === 1 && jb.room.world === 2);
  await wa.waitFor('joined-peer');
  wb.send(JSON.stringify({ t: 'state', p: [1, 2, 3, 0.5], a: 1 })); const st = await wa.waitFor('state'); t('position broadcast', st.p[2] === 3 && st.id === bobId);
  wb.send(JSON.stringify({ t: 'state', p: ['x'], a: 1 })); wb.send(JSON.stringify({ t: 'chat', text: 'hi' })); const ch = await wa.waitFor('chat'); t('chat + bad state ignored', ch.text === 'hi' && ch.name === 'Bob');
  wb.send(JSON.stringify({ t: 'done', node: 3 })); const dn = await wa.waitFor('done'); t('shared node completion', dn.node === 3);
  wb.send(JSON.stringify({ t: 'world', world: 4 })); await sleep(150); t('non-host cannot change world', !wa.msgs.some(m => m.t === 'world'));
  wa.send(JSON.stringify({ t: 'world', world: 4 })); const w = await wb.waitFor('world'); t('host changes world', w.world === 4);
  wb.send(JSON.stringify({ t: 'join', code: 'ZZZZZ' })); t('unknown room error', (await wb.waitFor('err')).error === 'room not found');
  // public room + list
  const wc = await wsc(owner); wc.send(JSON.stringify({ t: 'create', private: false, name: 'Open' })); await wc.waitFor('joined');
  wb.send(JSON.stringify({ t: 'list' })); t('public room listed', (await wb.waitFor('rooms')).rooms.length === 1);
  // host leave -> host migration
  wa.close(); const hm = await wb.waitFor('host'); t('host migration', hm.id === bobId);
  // ban kicks
  r = await api(`/api/admin/users/${bobId}/ban`, 'POST', { banned: true }, owner); await wb.waitFor('kicked'); t('ban kicks live player', true);
  r = await api('/api/me', 'GET', null, bob); t('banned token dead', r.s === 401);
  r = await api('/api/login', 'POST', { email: 'b@x.com', password: 'password2' }); t('banned cannot log in', r.s === 403);
  // bad ws auth
  const bad = new WebSocket(`ws://localhost:${port}/ws`); await new Promise(res => { bad.on('open', () => bad.send(JSON.stringify({ t: 'auth', token: 'nope' }))); bad.on('close', res); }); t('bad ws token closed', true);
  // transfer owner
  r = await api('/api/admin/transfer-owner', 'POST', { userId: aliceId }, owner); t('transfer ownership', r.j.ok);
  r = await api('/api/me', 'GET', null, alice); t('alice now owner', r.j.user.role === 'owner');
  r = await api('/api/config'); t('config public', r.j.name === 'GHOST//GRID');
  console.log(`\nALL ${ok} SERVER TESTS PASSED`);
} catch (e) { console.error('FAIL', e); process.exitCode = 1; } finally { proc.kill(); process.exit(process.exitCode || 0); }
