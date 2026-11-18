// Accounts, rooms (multiplayer) and admin panel. Everything works offline as a guest too.
export function initOnline(ctx) {
  const {S, world, hooks, WORLDS, SKINS, skinById, toast, glog, esc, $} = ctx;
  const O = {base: '', token: '', user: null, config: null, ws: null, room: null, you: null, hostId: null, peers: new Map(), connected: false};
  const ls = {get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} }};
  const el = (html, id, cls) => { const d = document.createElement('div'); if (id) d.id = id; if (cls) d.className = cls; d.innerHTML = html; document.body.appendChild(d); return d; };
  const isAdmin = () => !!O.user && (O.user.role === 'admin' || O.user.role === 'owner');

  /* ---------- http ---------- */
  async function api(path, method = 'GET', body) {
    const r = await fetch(O.base + path, {method, headers: {'content-type': 'application/json', ...(O.token ? {authorization: 'Bearer ' + O.token} : {})}, body: body ? JSON.stringify(body) : undefined});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
    return j;
  }
  const normBase = b => String(b || '').trim().replace(/\/+$/, '').replace(/^(?!https?:\/\/)/, 'https://');

  /* ---------- auth screen ---------- */
  const auth = el(`<div class="card glass" style="text-align:right">
    <h2 style="text-align:center;font-family:Consolas,monospace;letter-spacing:4px;direction:ltr"><b style="color:var(--c)">GHOST</b><i style="color:var(--m);font-style:normal">//</i><b style="color:var(--c)">GRID</b></h2>
    <div class="tabs"><button id="aTabIn" class="on">התחברות</button><button id="aTabUp">הרשמה</button></div>
    <input class="fld" id="aName" placeholder="שם משתמש (3-20 תווים)" hidden maxlength="20" style="letter-spacing:1px;font-size:15px;margin-top:8px">
    <input class="fld" id="aEmail" type="text" placeholder="אימייל" autocapitalize="off" autocomplete="username" style="letter-spacing:1px;font-size:15px;margin-top:8px;text-align:left">
    <input class="fld" id="aPass" type="password" placeholder="סיסמה (8+ תווים)" autocomplete="current-password" style="letter-spacing:1px;font-size:15px;margin-top:8px;text-align:left">
    <button class="big" id="aGo" style="margin-top:12px">התחבר</button>
    <div id="gBtn" style="margin-top:10px;display:flex;justify-content:center"></div>
    <div id="aMsg" class="note" style="min-height:18px;color:var(--r)"></div>
    <button class="big sec" id="aGuest">🎮 שחק כאורח (בלי שרת, בלי חברים)</button>
    <details style="margin-top:10px"><summary class="note" style="cursor:pointer">⚙ כתובת שרת</summary>
      <input class="fld" id="aBase" placeholder="https://your-server.example" style="letter-spacing:0;font-size:14px;margin-top:8px;text-align:left">
      <div class="note">באתר שמוגש מהשרת עצמו זה מתמלא לבד. באפליקציית APK/EXE הדבק כאן את כתובת השרת שלך.</div></details>
  </div>`, 'auth', 'overlay');
  auth.hidden = true; auth.style.zIndex = 50;
  let mode = 'in';
  const setTab = m => { mode = m; $('aTabIn').classList.toggle('on', m === 'in'); $('aTabUp').classList.toggle('on', m === 'up'); $('aName').hidden = m === 'in'; $('aEmail').placeholder = m === 'in' ? 'אימייל או שם משתמש' : 'אימייל'; $('aGo').textContent = m === 'in' ? 'התחבר' : 'צור חשבון'; $('aPass').autocomplete = m === 'in' ? 'current-password' : 'new-password'; };
  $('aTabIn').onclick = () => setTab('in'); $('aTabUp').onclick = () => setTab('up');
  const amsg = (t, ok) => { $('aMsg').textContent = t; $('aMsg').style.color = ok ? 'var(--g)' : 'var(--r)'; };

  async function loadConfig() {
    O.base = normBase($('aBase').value) || O.base;
    try { const r = await fetch(O.base + '/api/config'); O.config = await r.json(); return true; } catch (e) { O.config = null; return false; }
  }
  async function finishLogin(j) {
    O.token = j.token; O.user = j.user; ls.set('gg_auth', JSON.stringify({base: O.base, token: O.token}));
    try { // merge cloud progress: keep whichever has more hacks
      const me = await api('/api/me');
      if (me.progress && (me.progress.hacks || 0) >= (ctx.getProgress().hacks || 0)) ctx.applyProgress(me.progress);
      else api('/api/progress', 'PUT', {progress: ctx.getProgress()}).catch(() => {});
    } catch (e) {}
    ctx.setOnSaved(debounce(p => { if (O.token) api('/api/progress', 'PUT', {progress: p}).catch(() => {}); }, 2500));
    afterAuth();
  }
  function debounce(f, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; }
  $('aGo').onclick = async () => {
    amsg('', true); $('aGo').disabled = true;
    try {
      if (!(await loadConfig())) throw new Error('אין חיבור לשרת. בדוק את הכתובת ב"כתובת שרת"');
      if (mode === 'up' && $('aName').value.trim().length < 3) throw new Error('חובה לבחור שם משתמש (3 תווים לפחות)');
      const j = await api(mode === 'in' ? '/api/login' : '/api/register', 'POST', {email: $('aEmail').value, password: $('aPass').value, name: $('aName').value});
      await finishLogin(j);
    } catch (e) { amsg(e.message); }
    $('aGo').disabled = false;
  };
  $('aPass').addEventListener('keydown', e => { if (e.key === 'Enter') $('aGo').click(); });
  $('aGuest').onclick = () => { O.user = null; O.token = ''; afterAuth(); };

  function setupGoogle() {
    const id = O.config && O.config.googleClientId; if (!id || $('gBtn').dataset.ok) return;
    $('gBtn').dataset.ok = '1';
    const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
    sc.onload = () => {
      try {
        window.google.accounts.id.initialize({client_id: id, callback: async resp => {
          try { await finishLogin(await api('/api/google', 'POST', {credential: resp.credential})); } catch (e) { amsg(e.message); }
        }});
        window.google.accounts.id.renderButton($('gBtn'), {theme: 'filled_black', size: 'large', text: 'continue_with', locale: 'he'});
      } catch (e) {}
    };
    document.head.appendChild(sc);
  }

  /* ---------- main menu additions ---------- */
  const wel = $('welcome').querySelector('.card');
  const menuBox = document.createElement('div'); menuBox.id = 'menuBox';
  wel.insertBefore(menuBox, $('bStart'));
  const btns = document.querySelector('.btns');
  const bRoom = document.createElement('button'); bRoom.id = 'bRoom'; bRoom.className = 'ib'; bRoom.textContent = '👥 חברים'; bRoom.hidden = true;
  const bAdmin = document.createElement('button'); bAdmin.id = 'bAdmin'; bAdmin.className = 'ib'; bAdmin.textContent = '⚙ ניהול'; bAdmin.hidden = true;
  btns.insertBefore(bRoom, btns.firstChild); btns.insertBefore(bAdmin, btns.firstChild);

  async function afterAuth() {
    auth.hidden = true; $('welcome').hidden = false;
    const u = O.user;
    ctx.setAdmin(isAdmin(), !!(O.config && O.config.aiForAdmins));
    menuBox.innerHTML = u
      ? `<div class="chip" style="justify-content:center;margin:10px auto;width:max-content">👤 <b>${esc(u.name)}</b> · ${u.role === 'owner' ? '👑 בעלים' : u.role === 'admin' ? '🛡 מנהל' : 'שחקן'} <button id="mLogout" class="lnk" style="padding:3px 9px">יציאה</button></div>
         <button class="big" id="mMulti" style="margin-bottom:8px;background:linear-gradient(90deg,var(--m),var(--c))">👥 שחק עם חברים (קוד חדר)</button>
         ${isAdmin() ? '<button class="big sec" id="mAdmin" style="margin-top:0;margin-bottom:8px">⚙ פאנל ניהול</button>' : ''}`
      : `<div class="note" style="text-align:center">מצב אורח: אפשר לשחק סולו. כדי לשחק עם חברים צריך להתחבר.</div><button class="big sec" id="mLogin" style="margin:8px 0">🔑 התחברות / הרשמה</button>`;
    bRoom.hidden = !u; bAdmin.hidden = !isAdmin();
    if ($('mLogout')) $('mLogout').onclick = logout; if ($('mMulti')) $('mMulti').onclick = openMulti; if ($('mAdmin')) $('mAdmin').onclick = openAdmin; if ($('mLogin')) $('mLogin').onclick = showAuth;
    $('bStart').textContent = '▶ משחק סולו · מפת עולמות';
    $('bAi').textContent = isAdmin() && O.config && O.config.aiForAdmins ? '✨ AI (שרת)' : '✨ AI';
  }
  function showAuth() { $('welcome').hidden = true; auth.hidden = false; setupGoogle(); }
  async function logout() {
    try { await api('/api/logout', 'POST'); } catch (e) {}
    leaveRoom(true); ls.del('gg_auth'); O.token = ''; O.user = null; ctx.setOnSaved(null); ctx.setAdmin(false, false);
    showAuth(); setTab('in');
  }
  bRoom.onclick = () => { if (O.room) toggleRoomPanel(); else openMulti(); };
  bAdmin.onclick = openAdmin;

  /* ---------- multiplayer ---------- */
  const mp = el('', 'mpModal', 'overlay'); mp.hidden = true; mp.style.zIndex = 45;
  const roomBar = el('', 'roomBar', 'glass'); roomBar.hidden = true;
  const chat = el(`<div id="chatLog"></div><input id="chatIn" class="fld" maxlength="200" placeholder="צ'אט… (Enter לשליחה)" style="letter-spacing:0;font-size:13px;text-align:right;padding:7px">`, 'chat', 'glass'); chat.hidden = true;

  function wsUrl() { return O.base.replace(/^http/, 'ws') + '/ws'; }
  function connectWs() {
    return new Promise((res, rej) => {
      if (O.ws && O.ws.readyState === 1) return res();
      const ws = new WebSocket(wsUrl()); O.ws = ws;
      let done = false;
      ws.onopen = () => ws.send(JSON.stringify({t: 'auth', token: O.token}));
      ws.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'auth') { done = true; if (m.ok) { O.connected = true; res(); } else rej(new Error('התחברות נכשלה')); return; }
        onMsg(m);
      };
      ws.onerror = () => { if (!done) rej(new Error('אין חיבור לשרת')); };
      ws.onclose = () => { O.connected = false; if (O.room) { toast('החיבור לשרת נותק', 'bad'); leaveRoom(true); } };
    });
  }
  const send = o => { if (O.ws && O.ws.readyState === 1) O.ws.send(JSON.stringify(o)); };

  function addChat(name, text, sys) {
    const l = $('chatLog'), d = document.createElement('div');
    d.innerHTML = sys ? `<i>${esc(text)}</i>` : `<b>${esc(name)}:</b> ${esc(text)}`; l.appendChild(d);
    while (l.children.length > 40) l.removeChild(l.firstChild); l.scrollTop = l.scrollHeight;
  }
  $('chatIn').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { const v = $('chatIn').value.trim(); if (v) send({t: 'chat', text: v}); $('chatIn').value = ''; $('chatIn').blur(); } if (e.key === 'Escape') $('chatIn').blur(); });
  addEventListener('keydown', e => { if (O.room && e.key === 'Enter' && document.activeElement === document.body && !e.target.closest('#modal')) $('chatIn').focus(); });

  function renderRoomBar() {
    const r = O.room; if (!r) { roomBar.hidden = true; chat.hidden = true; return; }
    const names = [...O.peers.values()].map(p => p.name);
    roomBar.hidden = false; chat.hidden = false;
    roomBar.innerHTML = `<span>🔑 <b class="code" id="rbCode">${esc(r.code)}</b></span><button id="rbCopy" class="lnk" style="padding:3px 9px">העתק</button><span>${r.private ? '🔒 פרטי' : '🌐 ציבורי'}</span><span>👥 ${names.length + 1}/${r.max}</span><span>🎚 קושי: <b>${esc(hooks.tier().name)}</b></span><span class="note" style="margin:0">${esc(names.join(', '))}</span><button id="rbLeave" class="lnk" style="padding:3px 9px">יציאה</button>`;
    $('rbCopy').onclick = () => { try { navigator.clipboard.writeText(r.code); } catch (e) {} toast('הקוד הועתק: ' + r.code); };
    $('rbLeave').onclick = () => leaveRoom(false);
  }
  function toggleRoomPanel() { openMulti(); }
  function leaveRoom(silent) {
    if (O.room && !silent) send({t: 'leave'});
    O.room = null; hooks.inRoom = false; O.peers.clear(); world.clearPeers(); renderRoomBar(); hooks.onRoomSize && hooks.onRoomSize();
    clearInterval(O.tick); if (O.ws && silent) { try { O.ws.close(); } catch (e) {} O.ws = null; }
  }
  function worldOptions() { return WORLDS.map((w, i) => `<option value="${i}">${esc(w.name)}</option>`).join(''); }
  function openMulti() {
    if (!O.user) { showAuth(); return; }
    mp.hidden = false; $('welcome').hidden = true;
    if (O.room) {
      mp.innerHTML = `<div class="card glass" style="text-align:right"><h2>👥 חדר ${esc(O.room.code)}</h2>
        <div class="note">שלח לחברים את הקוד. הם נכנסים דרך "הצטרף בקוד".</div>
        <div class="chip" style="font-size:26px;letter-spacing:6px;justify-content:center;margin:12px 0"><b>${esc(O.room.code)}</b></div>
        <button class="big" id="mpCopy">📋 העתק קוד</button><button class="big sec" id="mpLeave">יציאה מהחדר</button><button class="big sec" id="mpClose">סגור</button></div>`;
      $('mpCopy').onclick = () => { try { navigator.clipboard.writeText(O.room.code); } catch (e) {} toast('הועתק'); };
      $('mpLeave').onclick = () => { leaveRoom(false); mp.hidden = true; $('welcome').hidden = !S.started ? false : true; };
      $('mpClose').onclick = () => { mp.hidden = true; };
      return;
    }
    mp.innerHTML = `<div class="card glass" style="text-align:right"><h2>👥 משחק עם חברים</h2>
      <div class="step">צור חדר</div>
      <input class="fld" id="mpName" placeholder="שם החדר" maxlength="30" style="letter-spacing:0;font-size:14px;text-align:right">
      <div class="row"><select class="fld" id="mpWorld" style="letter-spacing:0;font-size:14px;text-align:right">${worldOptions()}</select></div>
      <div class="row"><button id="mpPriv" style="flex:1" class="on">🔒 פרטי (רק עם קוד)</button><button id="mpPub" style="flex:1">🌐 ציבורי (מופיע ברשימה)</button></div>
      <button class="big" id="mpCreate" style="margin-top:10px">➕ צור חדר</button>
      <div class="step">הצטרף בקוד</div>
      <div class="row"><input class="fld" id="mpCode" maxlength="5" placeholder="CODE" style="text-transform:uppercase;text-align:center"><button id="mpJoin" style="background:var(--c);color:#02101a;font-weight:bold">הצטרף</button></div>
      <div class="step">חדרים ציבוריים <button id="mpRef" class="lnk" style="padding:2px 8px;margin-right:6px">↻</button></div>
      <div id="mpList" class="note">טוען…</div>
      <div id="mpMsg" class="note" style="color:var(--r)"></div>
      <button class="big sec" id="mpClose">חזרה</button></div>`;
    let priv = true;
    const setPriv = p => { priv = p; $('mpPriv').classList.toggle('on', p); $('mpPub').classList.toggle('on', !p); };
    $('mpPriv').onclick = () => setPriv(true); $('mpPub').onclick = () => setPriv(false);
    $('mpClose').onclick = () => { mp.hidden = true; if (!S.started) $('welcome').hidden = false; };
    const msg = t => { $('mpMsg').textContent = t; };
    const go = async fn => { try { await connectWs(); fn(); } catch (e) { msg(e.message); } };
    $('mpCreate').onclick = () => go(() => send({t: 'create', private: priv, name: $('mpName').value, world: +$('mpWorld').value}));
    $('mpJoin').onclick = () => go(() => send({t: 'join', code: $('mpCode').value}));
    const refresh = () => go(() => send({t: 'list'}));
    $('mpRef').onclick = refresh; O.onRooms = list => {
      const box = $('mpList'); if (!box) return;
      box.innerHTML = list.length ? '' : 'אין חדרים ציבוריים כרגע';
      list.forEach(r => { const b = document.createElement('button'); b.className = 'mc'; b.innerHTML = `<span class="ic">🌐</span><span class="tx"><b>${esc(r.name)}</b><small>${esc(WORLDS[r.world].en)} · ${r.players}/${r.max} · ${esc(r.host)}</small></span>`; b.onclick = () => go(() => send({t: 'join', code: r.code})); box.appendChild(b); });
    };
    O.onErr = t => msg(t);
    refresh();
  }

  function onMsg(m) {
    switch (m.t) {
      case 'rooms': O.onRooms && O.onRooms(m.rooms); break;
      case 'err': if (O.onErr) O.onErr(m.error); toast(m.error, 'bad'); break;
      case 'joined': {
        O.room = m.room; O.you = m.you; O.hostId = m.host; hooks.inRoom = true; O.peers.clear();
        m.peers.forEach(p => addPeer(p)); hooks.onRoomSize && hooks.onRoomSize();
        mp.hidden = true; $('welcome').hidden = true; if (!isAdminOrNot()) { }
        renderRoomBar(); addChat('', 'נכנסת לחדר ' + m.room.code, true);
        send({t: 'skin', skin: S.skin});
        clearInterval(O.tick); let last = '';
        O.tick = setInterval(() => { if (!O.room || !S.started) return; const p = world.getState().map(v => Math.round(v * 100) / 100), k = p.join(); if (k !== last) { last = k; send({t: 'state', p}); } }, 100);
        ctx.flyToWorld(m.room.world, m.room.seed);
        break;
      }
      case 'joined-peer': addPeer(m.peer); sizeChanged(); addChat('', m.peer.name + ' הצטרף', true); sfx(); break;
      case 'left': { const p = O.peers.get(m.id); if (p) addChat('', p.name + ' יצא', true); O.peers.delete(m.id); world.removePeer(m.id); sizeChanged(); break; }
      case 'state': world.setPeerState(m.id, m.p); break;
      case 'skin': world.setPeerSkin(m.id, skinById(m.skin)); break;
      case 'chat': addChat(m.name, m.text); break;
      case 'host': O.hostId = m.id; addChat('', 'המארח החדש: ' + ((O.peers.get(m.id) || {}).name || 'אתה'), true); break;
      case 'world': O.room.world = m.world; O.room.seed = m.seed; ctx.flyToWorld(m.world, m.seed); break;
      case 'done': ctx.markDone(m.node); break;
      case 'kicked': toast('הוצאת מהחדר', 'bad'); leaveRoom(true); break;
      case 'closed': toast('החדר נסגר: ' + m.why, 'bad'); leaveRoom(true); break;
      case 'left-room': break;
    }
  }
  const isAdminOrNot = () => true;
  const sfx = () => { try { ctx.sBlip(); } catch (e) {} };
  function addPeer(p) {
    O.peers.set(p.id, {name: p.name});
    world.addPeer(p.id, p.name, skinById(p.skin)); if (p.p) world.setPeerState(p.id, p.p);
  }
  hooks.roomSize = () => O.room ? O.peers.size + 1 : 1;
  const sizeChanged = () => { hooks.onRoomSize && hooks.onRoomSize(); renderRoomBar(); };
  hooks.isHost = () => !!O.room && O.hostId === O.you;
  hooks.sendWorld = i => send({t: 'world', world: i});
  hooks.onNodeDone = m => { if (O.room && m.idx != null && !m.ai) send({t: 'done', node: m.idx}); };
  hooks.serverAI = async (theme, count) => api('/api/ai/missions', 'POST', {theme, count});
  hooks.onWorldEntered = () => { renderRoomBar(); };

  /* ---------- admin panel ---------- */
  const adm = el('', 'adminModal', 'overlay'); adm.hidden = true; adm.style.zIndex = 46;
  let tab = 'users';
  async function openAdmin() {
    if (!isAdmin()) return;
    adm.hidden = false; $('welcome').hidden = true;
    adm.innerHTML = `<div class="card glass" style="text-align:right;width:min(760px,100%)"><h2>⚙ פאנל ניהול</h2>
      <div class="tabs"><button data-t="users">👥 משתמשים</button><button data-t="add">➕ הוסף מנהל</button><button data-t="settings">⚙ הגדרות</button><button data-t="rooms">🚪 חדרים</button><button data-t="ai">✨ AI</button></div>
      <div id="admBody" style="margin-top:12px"></div><div id="admMsg" class="note"></div>
      <button class="big sec" id="admClose">סגור</button></div>`;
    adm.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; renderAdm(); });
    $('admClose').onclick = () => { adm.hidden = true; if (!S.started) $('welcome').hidden = false; };
    renderAdm();
  }
  const amsg2 = (t, ok) => { const m = $('admMsg'); if (m) { m.textContent = t; m.style.color = ok ? 'var(--g)' : 'var(--r)'; } };
  async function renderAdm() {
    adm.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    const body = $('admBody'); body.innerHTML = 'טוען…'; amsg2('');
    try {
      if (tab === 'users') {
        const {users} = await api('/api/admin/users'); body.innerHTML = '';
        users.sort((a, b) => ({owner: 0, admin: 1, player: 2}[a.role] - {owner: 0, admin: 1, player: 2}[b.role]));
        users.forEach(u => {
          const d = document.createElement('div'); d.className = 'shopi';
          const owner = u.role === 'owner', me = O.user.role === 'owner';
          d.innerHTML = `<span class="ic">${owner ? '👑' : u.role === 'admin' ? '🛡' : '👤'}</span><span class="tx"><b>${esc(u.name)}${u.banned ? ' 🚫' : ''}</b><small style="direction:ltr;text-align:right">${esc(u.email)}</small></span>
            ${owner ? '' : `<button data-a="role">${u.role === 'admin' ? 'הסר מנהל' : 'הפוך למנהל'}</button><button data-a="ban" style="background:var(--r)">${u.banned ? 'בטל חסימה' : 'חסום'}</button><button data-a="pw" style="background:var(--a)">סיסמה</button>${me ? '<button data-a="own" style="background:var(--m)">העבר בעלות</button>' : ''}`}`;
          d.querySelectorAll('button').forEach(b => b.onclick = async () => {
            try {
              const a = b.dataset.a;
              if (a === 'role') await api(`/api/admin/users/${u.id}/role`, 'POST', {role: u.role === 'admin' ? 'player' : 'admin'});
              if (a === 'ban') await api(`/api/admin/users/${u.id}/ban`, 'POST', {banned: !u.banned});
              if (a === 'pw') { const r = await api(`/api/admin/users/${u.id}/reset-password`, 'POST', {}); alert('סיסמה זמנית (שמור, לא תוצג שוב):\n' + r.tempPassword); }
              if (a === 'own') { if (!confirm('להעביר את הבעלות ל-' + u.email + '? אתה תהפוך למנהל רגיל.')) return; await api('/api/admin/transfer-owner', 'POST', {userId: u.id}); O.user.role = 'admin'; afterAuth(); }
              renderAdm();
            } catch (e) { amsg2(e.message); }
          });
          body.appendChild(d);
        });
      } else if (tab === 'add') {
        body.innerHTML = `<div class="note" style="margin-top:0">הוסף מנהל לפי אימייל. אם המשתמש כבר רשום הוא יהפוך למנהל. אם עדיין לא, ברגע שיירשם עם האימייל הזה הוא יהפוך למנהל אוטומטית. אם תכתוב גם סיסמה, ייווצר לו חשבון מיד.</div>
          <div class="row"><input class="fld" id="addEmail" placeholder="אימייל" style="letter-spacing:0;font-size:14px;text-align:left"></div>
          <div class="row"><input class="fld" id="addPw" placeholder="סיסמה (אופציונלי, ליצירת חשבון מיד)" style="letter-spacing:0;font-size:14px;text-align:left"></div>
          <button class="big" id="addGo" style="margin-top:10px">הוסף מנהל</button>`;
        $('addGo').onclick = async () => { try { const r = await api('/api/admin/add', 'POST', {email: $('addEmail').value, password: $('addPw').value || undefined}); amsg2(r.pending ? '✓ ' + r.email + ' עדיין לא רשום. ברגע שיירשם עם האימייל הזה הוא יהפוך אוטומטית למנהל.' : '✓ ' + r.user.email + ' הוא עכשיו מנהל' + (r.tempPassword ? ' · סיסמה זמנית: ' + r.tempPassword : ''), true); } catch (e) { amsg2(e.message); } };
      } else if (tab === 'settings') {
        const {settings, aiConfigured, googleConfigured} = await api('/api/admin/settings');
        const row = (k, label) => `<label class="shopi" style="cursor:pointer"><span class="tx"><b>${label}</b></span><input type="checkbox" data-k="${k}" ${settings[k] ? 'checked' : ''} style="width:22px;height:22px"></label>`;
        body.innerHTML = row('allowSignup', 'אפשר הרשמה של משתמשים חדשים') + row('allowPublicRooms', 'אפשר חדרים ציבוריים') + row('aiForAdmins', 'AI של השרת למנהלים')
          + `<div class="shopi"><span class="tx"><b>מקסימום שחקנים בחדר (עד 15)</b></span><input class="fld" id="setMax" type="number" min="2" max="15" value="${settings.maxRoomPlayers}" style="width:90px;letter-spacing:0;font-size:15px"></div>
          <div class="shopi"><span class="tx"><b>מודל AI בשרת</b></span><input class="fld" id="setModel" value="${esc(settings.aiModel)}" style="width:230px;letter-spacing:0;font-size:13px;text-align:left"></div>
          <div class="note">מפתח ה-AI בשרת: ${aiConfigured ? '✅ מוגדר' : '❌ לא מוגדר (הגדר ANTHROPIC_API_KEY בשרת)'} · התחברות גוגל: ${googleConfigured ? '✅' : '❌ לא מוגדר (GOOGLE_CLIENT_ID)'}</div>
          <button class="big" id="setSave" style="margin-top:10px">💾 שמור</button>`;
        $('setSave').onclick = async () => {
          const s = {maxRoomPlayers: +$('setMax').value, aiModel: $('setModel').value}; body.querySelectorAll('[data-k]').forEach(c => s[c.dataset.k] = c.checked);
          try { await api('/api/admin/settings', 'PUT', {settings: s}); amsg2('✓ נשמר', true); } catch (e) { amsg2(e.message); }
        };
      } else if (tab === 'rooms') {
        const {rooms} = await api('/api/admin/rooms'); body.innerHTML = rooms.length ? '' : '<div class="note">אין חדרים פעילים</div>';
        rooms.forEach(r => { const d = document.createElement('div'); d.className = 'shopi'; d.innerHTML = `<span class="ic">${r.private ? '🔒' : '🌐'}</span><span class="tx"><b>${esc(r.name)} · ${esc(r.code)}</b><small>${esc(WORLDS[r.world].en)} · ${esc((r.members || []).join(', '))}</small></span><button style="background:var(--r)">סגור</button>`; d.querySelector('button').onclick = async () => { await api('/api/admin/rooms/' + r.code, 'DELETE'); renderAdm(); }; body.appendChild(d); });
      } else if (tab === 'ai') {
        body.innerHTML = `<div class="note" style="margin-top:0">כמנהל אתה מקבל AI בלי מפתח: השרת משתמש במפתח שלו. כתוב נושא והוסף צמתים לעולם הנוכחי (אחרי שנכנסת לעולם).</div>
          <div class="row"><input class="fld" id="aiTheme" placeholder="נושא, למשל: תחנת חלל נטושה" style="letter-spacing:0;font-size:14px;text-align:right"></div>
          <button class="big" id="aiGo" style="margin-top:10px">✨ צור צמתים בעולם הנוכחי</button>`;
        $('aiGo').onclick = async () => {
          if (!S.started) { amsg2('קודם היכנס לעולם'); return; }
          $('aiGo').disabled = true; amsg2('ה-AI כותב…', true);
          try { const r = await hooks.serverAI($('aiTheme').value || 'cyberpunk', 3); ctx.addAIFromServer(r); amsg2('✓ נוספו צמתים לעולם', true); } catch (e) { amsg2(e.message); }
          $('aiGo').disabled = false;
        };
      }
    } catch (e) { body.innerHTML = ''; amsg2(e.message); }
  }

  /* ---------- boot ---------- */
  (async function boot() {
    const saved = (() => { try { return JSON.parse(ls.get('gg_auth') || 'null'); } catch (e) { return null; } })();
    const demo = /demo|walk|near|skin|hack|api|brief|map/.test(location.hash);
    if (!demo) showAuth();
    const origin = /^https?:/.test(location.protocol) ? location.origin : '';
    O.base = (saved && saved.base) || origin; $('aBase').value = O.base;
    await loadConfig();
    if (!O.config && origin && O.base !== origin) { O.base = origin; await loadConfig(); }
    if (saved && saved.token && O.config) {
      O.token = saved.token;
      try { const me = await api('/api/me'); await finishLogin({token: saved.token, user: me.user}); return; } catch (e) { O.token = ''; }
    }
  })();

  return O;
}
