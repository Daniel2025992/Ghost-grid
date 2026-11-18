// Serverless rooms: one player's browser is the "room host", friends connect directly (WebRTC via PeerJS).
// It speaks the same message protocol as server/index.js so the rest of the client does not care.
import Peer from 'peerjs';

const CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), b => CH[b % CH.length]).join('');
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');
const pid = c => 'ggrid-v1-' + c;
function peerOpts() {
  // default: the free public PeerJS broker. #peer=host:port points to your own PeerJS server (used by tests).
  const m = (location.hash.match(/peer=([\w.\-]+):(\d+)/)); const o = {debug: 0};
  if (m) { o.host = m[1]; o.port = +m[2]; o.path = '/'; o.secure = false; }
  return o;
}
const errText = e => e && e.type === 'network' ? 'אין חיבור לשירות החיבור. בדוק אינטרנט' : e && e.type === 'server-error' ? 'שירות החיבור לא זמין כרגע' : 'שגיאת חיבור (' + ((e && e.type) || e) + ')';

export function createP2P(self, handler) {
  let peer = null, room = null, conn = null, closed = false;
  const T = {mode: 'p2p', isHost: false};
  const emit = m => { if (!closed) handler(m); };

  /* ---------- host side ---------- */
  const info = () => ({code: room.code, name: room.name, world: room.world, seed: room.seed, private: true, players: room.members.size, max: room.max, host: room.hostName});
  function bcast(o, exceptId) {
    room.members.forEach((mem, id) => { if (id === exceptId) return; if (mem.conn) { if (mem.conn.open) mem.conn.send(o); } else emit(o); });
  }
  function dropMember(id) {
    if (!room || !id || !room.members.has(id) || id === room.hostId) return;
    room.members.delete(id); bcast({t: 'left', id});
  }
  function onMember(id, m) {
    const mem = room.members.get(id); if (!mem || !m) return;
    switch (m.t) {
      case 'state': { const p = m.p; if (Array.isArray(p) && p.length === 4 && p.every(Number.isFinite)) { mem.p = p; bcast({t: 'state', id, p, a: m.a | 0}, id); } break; }
      case 'skin': if (typeof m.skin === 'string') { mem.skin = m.skin.slice(0, 20); bcast({t: 'skin', id, skin: mem.skin}, id); } break;
      case 'chat': { const txt = String(m.text || '').slice(0, 200).trim(); if (txt) bcast({t: 'chat', id, name: mem.user.name, text: txt}); break; }
      case 'world': if (id === room.hostId) { room.world = Math.max(0, Math.min(20, m.world | 0)); room.seed = (Math.random() * 2 ** 31) | 0; bcast({t: 'world', world: room.world, seed: room.seed}); } break;
      case 'done': if (Number.isInteger(m.node) && m.node >= 0 && m.node < 64) bcast({t: 'done', id, name: mem.user.name, node: m.node}); break;
      case 'kick': if (id === room.hostId && room.members.has(m.id) && m.id !== id) { const t = room.members.get(m.id); if (t.conn) { t.conn.send({t: 'kicked'}); setTimeout(() => t.conn.close(), 200); } dropMember(m.id); } break;
      case 'leave': if (id !== room.hostId) { if (mem.conn) mem.conn.close(); dropMember(id); } break;
    }
  }
  function accept(c) {
    c.on('data', m => {
      if (!m) return;
      if (m.t === 'hello') {
        if (room.members.size >= room.max) { c.send({t: 'err', error: 'החדר מלא'}); setTimeout(() => c.close(), 300); return; }
        let id = String(m.user && m.user.id || '').slice(0, 32) || rid(); if (room.members.has(id)) id = rid();
        const user = {id, name: String(m.user && m.user.name || 'Player').slice(0, 20)};
        c._gid = id; room.members.set(id, {conn: c, user, skin: String(m.skin || 'ghost').slice(0, 20), p: [0, 0, 0, 0]});
        c.send({t: 'joined', room: info(), you: id, host: room.hostId, peers: [...room.members.values()].filter(x => x.user.id !== id).map(x => ({id: x.user.id, name: x.user.name, skin: x.skin, p: x.p}))});
        bcast({t: 'joined-peer', peer: {id, name: user.name, skin: room.members.get(id).skin, p: [0, 0, 0, 0]}}, id);
      } else if (c._gid) onMember(c._gid, m);
    });
    c.on('close', () => dropMember(c._gid));
    c.on('error', () => dropMember(c._gid));
  }

  T.host = ({name, world}) => new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = () => {
      const code = genCode(), p = new Peer(pid(code), peerOpts()); let opened = false;
      p.on('open', () => {
        opened = true; peer = p; T.isHost = true;
        room = {code, name: String(name || self.name + ' - חדר').slice(0, 30), world: Math.max(0, Math.min(20, world | 0)), seed: (Math.random() * 2 ** 31) | 0, max: 15, hostId: self.id, hostName: self.name, members: new Map()};
        room.members.set(self.id, {conn: null, user: self, skin: 'ghost', p: [0, 0, 0, 0]});
        p.on('connection', accept);
        emit({t: 'joined', room: info(), you: self.id, host: self.id, peers: []});
        resolve();
      });
      p.on('error', e => {
        if (!opened) { if (e.type === 'unavailable-id' && ++tries < 6) { try { p.destroy(); } catch (x) {} attempt(); } else reject(new Error(errText(e))); }
        else console.warn('peer error', e);
      });
      p.on('disconnected', () => { if (opened && !p.destroyed) try { p.reconnect(); } catch (x) {} });
    };
    attempt();
  });

  /* ---------- client side ---------- */
  T.join = (code, skin) => new Promise((resolve, reject) => {
    code = String(code || '').toUpperCase().trim();
    if (code.length !== 5) return reject(new Error('הקוד חייב להיות בן 5 תווים'));
    const p = new Peer(peerOpts()); peer = p; let joined = false;
    const to = setTimeout(() => { if (!joined) { reject(new Error('לא נמצא חדר עם הקוד הזה, או שהחיבור נכשל')); try { p.destroy(); } catch (x) {} } }, 15000);
    p.on('open', () => {
      conn = p.connect(pid(code), {reliable: true});
      conn.on('open', () => conn.send({t: 'hello', user: self, skin}));
      conn.on('data', m => {
        if (!m) return;
        if (m.t === 'err' && !joined) { clearTimeout(to); reject(new Error(m.error)); return; }
        if (m.t === 'joined') { joined = true; clearTimeout(to); }
        emit(m); if (m.t === 'joined') resolve();
      });
      conn.on('close', () => { if (joined) emit({t: 'closed', why: 'המארח עזב את החדר'}); });
    });
    p.on('error', e => { clearTimeout(to); if (!joined) reject(new Error(e.type === 'peer-unavailable' ? 'לא נמצא חדר עם הקוד הזה' : errText(e))); });
  });

  T.send = o => {
    if (closed) return;
    if (T.isHost) { if (room) onMember(self.id, o); return; }
    if (conn && conn.open) conn.send(o);
  };
  T.close = () => {
    if (closed) return;
    if (T.isHost && room) bcast({t: 'closed', why: 'המארח סגר את החדר'}, self.id);
    closed = true;
    setTimeout(() => { try { peer && peer.destroy(); } catch (e) {} }, 300);
  };
  return T;
}
