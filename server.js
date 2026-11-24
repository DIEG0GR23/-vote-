'use strict';
// VOTE! — servidor sin dependencias (solo Node.js 18+).
// Ejecuta:  node server.js   y abre http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------- Configuración (.env) ----------
(function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* sin .env: modo demo */ }
})();

const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const CLIENT_ID = process.env.TWITCH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || '';
const DEMO = !CLIENT_ID || !CLIENT_SECRET;
const PUB = path.join(__dirname, 'public');
const DATA = path.join(__dirname, 'data', 'db.json');

// ---------- Datos ----------
let db;
try { db = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch { db = { streamers: {} }; }
let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.mkdirSync(path.dirname(DATA), { recursive: true });
    fs.writeFileSync(DATA + '.tmp', JSON.stringify(db, null, 2));
    fs.renameSync(DATA + '.tmp', DATA);
  }, 150);
}

const sessions = new Map(); // sid -> { user, token }
const states = new Map();   // oauth state -> { next, t }
const newId = (n = 9) => crypto.randomBytes(n).toString('base64url');

// ---------- Utilidades HTTP ----------
function cookies(req) {
  const o = {};
  for (const p of (req.headers.cookie || '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  }
  return o;
}
const getSession = req => sessions.get(cookies(req).sid) || null;
function json(res, code, obj, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(obj));
}
function redirect(res, to, headers = {}) { res.writeHead(302, { Location: to, ...headers }); res.end(); }
function readBody(req) {
  return new Promise((ok, bad) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 1e5) { bad(new Error('Demasiado grande')); req.destroy(); } });
    req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { ok({}); } });
  });
}
const safeNext = (n, d) => (typeof n === 'string' && /^\/[A-Za-z0-9_\/-]*$/.test(n) ? n : d);
function sessionCookie(user, token) {
  const sid = newId(18);
  sessions.set(sid, { user, token });
  return `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 12}`;
}
const fail = (code, msg) => Object.assign(new Error(msg), { code });

// ---------- Twitch ----------
async function helix(q, token) {
  const r = await fetch('https://api.twitch.tv/helix/' + q, {
    headers: { 'Client-Id': CLIENT_ID, Authorization: 'Bearer ' + token },
  });
  if (r.status === 401) throw fail(401, 'Tu sesión de Twitch expiró. Cierra sesión y vuelve a entrar.');
  if (!r.ok) throw fail(502, 'Twitch respondió con error ' + r.status);
  return r.json();
}
function clipSlug(u) {
  u = String(u || '').trim();
  const m = u.match(/clips\.twitch\.tv\/(?:embed\?clip=)?([A-Za-z0-9_-]+)/) || u.match(/twitch\.tv\/[^/?#]+\/clip\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{6,}$/.test(u) ? u : null;
}
async function resolveClip(url, sess) {
  const slug = clipSlug(url);
  if (!slug) throw fail(400, 'Ese link no parece un clip de Twitch. Ejemplo: https://clips.twitch.tv/NombreDelClip o https://www.twitch.tv/canal/clip/NombreDelClip');
  if (DEMO) {
    return { slug, url: 'https://clips.twitch.tv/' + slug, title: slug.replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').slice(0, 60),
      broadcaster: sess.user.display_name, creator: '', thumbnail: '', duration: 0, views: 0 };
  }
  const d = (await helix('clips?id=' + encodeURIComponent(slug), sess.token)).data || [];
  if (!d.length) throw fail(404, 'No encontramos ese clip en Twitch. Revisa que el link esté completo y que el clip no se haya borrado.');
  const c = d[0];
  return { slug: c.id, url: c.url, title: c.title, broadcaster: c.broadcaster_name, creator: c.creator_name,
    thumbnail: c.thumbnail_url, duration: Math.round(c.duration || 0), views: c.view_count || 0 };
}

// ---------- Modelo ----------
function streamerFor(user) {
  let s = db.streamers[user.id];
  if (!s) {
    s = db.streamers[user.id] = { id: user.id, categories: [], clips: [], votes: {},
      voting: { status: 'idle', categoryId: null, endsAt: 0, startedAt: 0 }, log: [], blocked: 0,
      settings: { minAccountDays: 0 } };
  }
  Object.assign(s, { login: user.login, display_name: user.display_name, profile_image_url: user.profile_image_url || '' });
  save();
  return s;
}
const byLogin = login => Object.values(db.streamers).find(s => s.login === String(login).toLowerCase());
function addLog(s, msg, kind = 'info') {
  s.log.unshift({ t: Date.now(), msg, kind });
  if (s.log.length > 200) s.log.length = 200;
  save();
}
function tick(s) {
  if (s.voting.status === 'live' && Date.now() >= s.voting.endsAt) {
    s.voting.status = 'ended';
    const cat = s.categories.find(c => c.id === s.voting.categoryId);
    addLog(s, `Votación "${cat ? cat.name : ''}" terminada por tiempo`);
  }
}
const clipPublic = c => ({ id: c.id, slug: c.slug, url: c.url, title: c.title, description: c.description || '',
  broadcaster: c.broadcaster, creator: c.creator, thumbnail: c.thumbnail, duration: c.duration, views: c.views });
function results(s, catId) {
  const cat = s.categories.find(c => c.id === catId);
  if (!cat) return null;
  const v = s.votes[catId] || {};
  const counts = Object.fromEntries(cat.clipIds.map(id => [id, 0]));
  for (const k in v) if (v[k] in counts) counts[v[k]]++;
  const items = cat.clipIds.map(id => s.clips.find(c => c.id === id)).filter(Boolean)
    .map(c => ({ ...clipPublic(c), votes: counts[c.id] }));
  return { categoryId: cat.id, name: cat.name, total: items.reduce((a, b) => a + b.votes, 0), items };
}
function votingPublic(s) {
  const cat = s.categories.find(c => c.id === s.voting.categoryId);
  return { status: s.voting.status, endsAt: s.voting.endsAt, now: Date.now(), category: cat ? { id: cat.id, name: cat.name } : null };
}
function cleanName(n) {
  n = String(n || '').replace(/\s+/g, ' ').trim();
  if (!n) throw fail(400, 'Escribe un nombre.');
  if (n.length > 60) throw fail(400, 'Máximo 60 caracteres.');
  return n;
}

// ---------- API del streamer ----------
async function streamerApi(req, res, parts, sess) {
  const s = streamerFor(sess.user);
  tick(s);
  const M = req.method, [a, b, c] = parts; // /api/s/<a>/<b>/<c>
  const body = M === 'GET' ? {} : await readBody(req);
  const cat = id => { const x = s.categories.find(k => k.id === id); if (!x) throw fail(404, 'Categoría no encontrada'); return x; };

  if (M === 'GET' && a === 'state') {
    return json(res, 200, {
      demo: DEMO, me: sess.user, viewerUrl: `${BASE_URL}/v/${s.login}`, overlayUrl: `${BASE_URL}/overlay/${s.login}`,
      categories: s.categories, clips: s.clips.map(clipPublic), voting: votingPublic(s),
      results: s.categories.map(k => results(s, k.id)), log: s.log.slice(0, 80), blocked: s.blocked, settings: s.settings,
    });
  }
  if (M === 'POST' && a === 'categories') {
    const name = cleanName(body.name);
    if (s.categories.some(k => k.name.toLowerCase() === name.toLowerCase())) throw fail(409, 'Ya existe una categoría con ese nombre.');
    const k = { id: newId(6), name, clipIds: [], createdAt: Date.now() };
    s.categories.push(k); addLog(s, `Categoría creada: ${name}`); save();
    return json(res, 200, k);
  }
  if (M === 'PATCH' && a === 'categories' && b) {
    const k = cat(b);
    if (body.name !== undefined) k.name = cleanName(body.name);
    if (Array.isArray(body.clipIds)) k.clipIds = body.clipIds.filter(id => s.clips.some(cl => cl.id === id));
    save(); return json(res, 200, k);
  }
  if (M === 'DELETE' && a === 'categories' && b) {
    const k = cat(b);
    if (s.voting.status === 'live' && s.voting.categoryId === k.id) throw fail(409, 'Termina la votación de esta categoría antes de borrarla.');
    s.categories = s.categories.filter(x => x !== k); delete s.votes[k.id];
    if (s.voting.categoryId === k.id) s.voting = { status: 'idle', categoryId: null, endsAt: 0, startedAt: 0 };
    addLog(s, `Categoría eliminada: ${k.name}`); save();
    return json(res, 200, { ok: true });
  }
  if (M === 'GET' && a === 'clip-preview') {
    const u = new URL(req.url, BASE_URL).searchParams.get('url');
    return json(res, 200, await resolveClip(u, sess));
  }
  if (M === 'POST' && a === 'clips') {
    const meta = await resolveClip(body.url, sess);
    if (s.clips.some(x => x.slug === meta.slug)) throw fail(409, 'Ese clip ya está en tu biblioteca. Edítalo para agregarlo a otra categoría.');
    const clip = { id: newId(6), ...meta, title: String(body.title || '').trim().slice(0, 100) || meta.title,
      description: String(body.description || '').trim().slice(0, 300), createdAt: Date.now() };
    s.clips.push(clip);
    for (const id of Array.isArray(body.categoryIds) ? body.categoryIds : []) {
      const k = s.categories.find(x => x.id === id); if (k && !k.clipIds.includes(clip.id)) k.clipIds.push(clip.id);
    }
    addLog(s, `Clip agregado: ${clip.title}`); save();
    return json(res, 200, clipPublic(clip));
  }
  if (M === 'PATCH' && a === 'clips' && b) {
    const clip = s.clips.find(x => x.id === b); if (!clip) throw fail(404, 'Clip no encontrado');
    if (body.title !== undefined) clip.title = String(body.title).trim().slice(0, 100) || clip.title;
    if (body.description !== undefined) clip.description = String(body.description).trim().slice(0, 300);
    if (Array.isArray(body.categoryIds)) {
      for (const k of s.categories) {
        const want = body.categoryIds.includes(k.id), has = k.clipIds.includes(clip.id);
        if (want && !has) k.clipIds.push(clip.id);
        if (!want && has) k.clipIds = k.clipIds.filter(x => x !== clip.id);
      }
    }
    save(); return json(res, 200, clipPublic(clip));
  }
  if (M === 'DELETE' && a === 'clips' && b) {
    const clip = s.clips.find(x => x.id === b); if (!clip) throw fail(404, 'Clip no encontrado');
    const live = s.voting.status === 'live' && cat(s.voting.categoryId).clipIds.includes(clip.id);
    if (live) throw fail(409, 'Ese clip está nominado en la votación en vivo. Termínala antes de borrarlo.');
    s.clips = s.clips.filter(x => x !== clip);
    for (const k of s.categories) k.clipIds = k.clipIds.filter(x => x !== clip.id);
    for (const cid in s.votes) for (const v in s.votes[cid]) if (s.votes[cid][v] === clip.id) delete s.votes[cid][v];
    addLog(s, `Clip eliminado: ${clip.title}`); save();
    return json(res, 200, { ok: true });
  }
  if (M === 'POST' && a === 'voting') {
    const sec = Math.round(Number(body.seconds) || 0);
    if (b === 'start') {
      const k = cat(body.categoryId);
      if (k.clipIds.length < 2) throw fail(400, 'La categoría necesita al menos 2 clips nominados.');
      if (sec < 10 || sec > 86400) throw fail(400, 'El temporizador debe durar entre 10 segundos y 24 horas.');
      s.voting = { status: 'live', categoryId: k.id, endsAt: Date.now() + sec * 1000, startedAt: Date.now() };
      addLog(s, `Votación iniciada: ${k.name}`);
    } else if (b === 'add') {
      if (!s.voting.categoryId) throw fail(400, 'No hay votación para extender.');
      if (sec < 1 || sec > 3600) throw fail(400, 'Tiempo no válido.');
      if (s.voting.status === 'live') s.voting.endsAt += sec * 1000;
      else { s.voting.status = 'live'; s.voting.endsAt = Date.now() + sec * 1000; addLog(s, 'Votación reabierta'); }
    } else if (b === 'end') {
      if (s.voting.status !== 'live') throw fail(400, 'No hay votación en vivo.');
      s.voting.status = 'ended'; s.voting.endsAt = Date.now();
      addLog(s, `Votación terminada: ${cat(s.voting.categoryId).name}`);
    } else if (b === 'reset') {
      const k = cat(body.categoryId || s.voting.categoryId);
      s.votes[k.id] = {};
      addLog(s, `Votos reiniciados: ${k.name}`, 'warn');
    } else throw fail(404, 'Acción no válida');
    save();
    return json(res, 200, votingPublic(s));
  }
  if (M === 'PATCH' && a === 'settings') {
    const d = Math.max(0, Math.min(3650, Math.round(Number(body.minAccountDays) || 0)));
    s.settings.minAccountDays = d; addLog(s, `Antigüedad mínima de cuenta: ${d} días`); save();
    return json(res, 200, s.settings);
  }
  throw fail(404, 'Ruta no encontrada');
}

// ---------- API pública (viewers y overlay) ----------
async function viewerApi(req, res, login, action, sess) {
  const s = byLogin(login);
  if (!s) throw fail(404, 'Este streamer todavía no usa VOTE!');
  tick(s);
  const v = votingPublic(s);
  const k = s.categories.find(c => c.id === s.voting.categoryId);
  if (req.method === 'GET' && action === 'overlay') {
    return json(res, 200, { voting: v, streamer: { display_name: s.display_name }, results: k ? results(s, k.id) : null });
  }
  if (req.method === 'GET' && !action) {
    const r = k ? results(s, k.id) : null;
    return json(res, 200, {
      demo: DEMO, streamer: { login: s.login, display_name: s.display_name, profile_image_url: s.profile_image_url },
      me: sess ? { login: sess.user.login, display_name: sess.user.display_name } : null, voting: v,
      nominees: k && v.status !== 'idle' ? r.items.map(({ votes, ...c }) => c) : [],
      myVote: sess && k ? (s.votes[k.id] || {})[sess.user.id] || null : null,
      results: v.status === 'ended' ? r : null,
    });
  }
  if (req.method === 'POST' && action === 'vote') {
    if (!sess) throw fail(401, 'Inicia sesión con Twitch para votar.');
    if (v.status !== 'live' || !k) throw fail(409, 'La votación no está abierta.');
    const { clipId } = await readBody(req);
    if (!k.clipIds.includes(clipId)) throw fail(400, 'Ese clip no está nominado.');
    const u = sess.user, who = '@' + u.login;
    const minD = s.settings.minAccountDays;
    if (minD && u.created_at && (Date.now() - Date.parse(u.created_at)) / 864e5 < minD) {
      s.blocked++; addLog(s, `Bloqueado ${who}: cuenta con menos de ${minD} días`, 'block');
      throw fail(403, `Tu cuenta de Twitch debe tener al menos ${minD} días para votar.`);
    }
    s.votes[k.id] = s.votes[k.id] || {};
    if (s.votes[k.id][u.id]) {
      s.blocked++; addLog(s, `Bloqueado ${who}: intento de voto repetido`, 'block');
      throw fail(409, 'Ya votaste en esta categoría.');
    }
    s.votes[k.id][u.id] = clipId; save();
    return json(res, 200, { ok: true, myVote: clipId });
  }
  throw fail(404, 'Ruta no encontrada');
}

// ---------- Archivos estáticos ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveFile(res, rel) {
  const file = path.normalize(path.join(PUB, rel));
  if (!file.startsWith(PUB)) return json(res, 403, { error: 'No permitido' });
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

// ---------- Router ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE_URL);
  const p = url.pathname;
  const sess = getSession(req);
  try {
    // --- Autenticación ---
    if (p === '/auth/login') {
      const next = safeNext(url.searchParams.get('next'), '/streamer');
      if (DEMO) return redirect(res, '/demo-login?next=' + encodeURIComponent(next));
      const state = newId(12);
      states.set(state, { next, t: Date.now() });
      const q = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: BASE_URL + '/auth/callback', response_type: 'code', scope: '', state, force_verify: 'false' });
      return redirect(res, 'https://id.twitch.tv/oauth2/authorize?' + q);
    }
    if (p === '/auth/callback') {
      const st = states.get(url.searchParams.get('state'));
      states.delete(url.searchParams.get('state'));
      if (!st || Date.now() - st.t > 6e5) return redirect(res, '/?error=state');
      if (url.searchParams.get('error')) return redirect(res, st.next);
      const r = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code: url.searchParams.get('code') || '',
          grant_type: 'authorization_code', redirect_uri: BASE_URL + '/auth/callback' }) });
      const tok = await r.json();
      if (!tok.access_token) throw fail(502, 'Twitch rechazó el inicio de sesión: ' + (tok.message || r.status));
      const u = (await helix('users', tok.access_token)).data[0];
      const user = { id: u.id, login: u.login, display_name: u.display_name, profile_image_url: u.profile_image_url, created_at: u.created_at };
      return redirect(res, st.next, { 'Set-Cookie': sessionCookie(user, tok.access_token) });
    }
    if (p === '/auth/demo' && req.method === 'POST') {
      if (!DEMO) throw fail(403, 'El modo demo está desactivado.');
      const { name } = await readBody(req);
      const login = String(name || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 25);
      if (login.length < 3) throw fail(400, 'Escribe un nombre de al menos 3 letras o números.');
      const user = { id: 'demo_' + login, login, display_name: String(name).trim().slice(0, 25), profile_image_url: '',
        created_at: new Date(Date.now() - 400 * 864e5).toISOString() };
      return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(user, '') });
    }
    if (p === '/auth/logout') {
      sessions.delete(cookies(req).sid);
      return redirect(res, safeNext(url.searchParams.get('next'), '/'), { 'Set-Cookie': 'sid=; Path=/; Max-Age=0' });
    }
    // --- API ---
    if (p === '/api/me') return json(res, 200, { demo: DEMO, me: sess ? sess.user : null });
    if (p.startsWith('/api/s/')) {
      if (!sess) throw fail(401, 'Inicia sesión con Twitch.');
      return await streamerApi(req, res, p.split('/').slice(3), sess);
    }
    let m;
    if ((m = p.match(/^\/api\/v\/([a-z0-9_]+)(?:\/(vote|overlay))?$/))) return await viewerApi(req, res, m[1], m[2], sess);
    // --- Páginas ---
    if (p === '/') return serveFile(res, 'index.html');
    if (p === '/streamer') return serveFile(res, 'streamer.html');
    if (p === '/demo-login') return serveFile(res, 'demo.html');
    if (/^\/v\/[a-z0-9_]+$/.test(p)) return serveFile(res, 'vote.html');
    if (/^\/overlay\/[a-z0-9_]+$/.test(p)) return serveFile(res, 'overlay.html');
    return serveFile(res, p.slice(1));
  } catch (e) {
    if (!e.code || e.code >= 500) console.error(e);
    if (res.headersSent) return res.end();
    return json(res, typeof e.code === 'number' ? e.code : 500, { error: e.message || 'Error del servidor' });
  }
});

server.listen(PORT, () => {
  console.log('\n  VOTE! está corriendo');
  console.log(`  Streamer:  ${BASE_URL}/streamer`);
  console.log(DEMO
    ? '  Modo DEMO (sin credenciales de Twitch). Lee README.md para conectar Twitch de verdad.\n'
    : '  Login con Twitch activado.\n');
});
