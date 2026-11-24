// Utilidades compartidas por todas las páginas de VOTE!
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => (/^https:\/\//.test(String(u || '')) ? String(u) : '');
const COLORS = ['#ff4b1f', '#9147ff', '#ffd400', '#2ee6a6', '#ff2e88', '#3ba9ff', '#ff8a00', '#b6ff3b', '#ffffff', '#00c2c7'];
const TWITCH_ICON = '<svg class="twitch-ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.3 3 3 6.4v13.1h4.5V22h2.5l2.4-2.5h3.7l4.9-4.9V3H4.3Zm1.6 1.6h13.5v9.2l-2.9 2.9h-4.5L9.5 19.1v-2.4H5.9V4.6Zm4.5 8h1.6V7.7h-1.6v4.9Zm4.4 0h1.6V7.7h-1.6v4.9Z"/></svg>';
const LOGO = '<span class="logo">VOTE<b>!</b></span>';

async function api(path, opts = {}) {
  const r = await fetch(path, {
    method: opts.method || 'GET', credentials: 'same-origin',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let d = {};
  try { d = await r.json(); } catch { /* vacío */ }
  if (!r.ok) throw Object.assign(new Error(d.error || 'Error ' + r.status), { status: r.status });
  return d;
}

let toastTimer;
function toast(msg, err = false) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); document.body.appendChild(t); }
  t.className = 'toast pop' + (err ? ' err' : '');
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 3200);
}

// Modal genérico: devuelve el elemento .modal; onClose opcional
function modal(html, onClose) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal pop" role="dialog" aria-modal="true"><button class="x" aria-label="Cerrar">✕</button>${html}</div>`;
  const close = () => { bg.remove(); document.removeEventListener('keydown', key); onClose && onClose(); };
  const key = e => { if (e.key === 'Escape') close(); };
  bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('.x')) close(); });
  document.addEventListener('keydown', key);
  document.body.appendChild(bg);
  const m = bg.firstElementChild; m.close = close;
  return m;
}
function confirmBox(text, okLabel = 'Sí, continuar', cls = 'red') {
  return new Promise(ok => {
    let done = false;
    const m = modal(`<h3 style="margin:6px 30px 14px 0">${esc(text)}</h3>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-no>Cancelar</button><button class="btn ${cls}" data-yes>${esc(okLabel)}</button></div>`,
      () => { if (!done) ok(false); });
    m.querySelector('[data-no]').onclick = () => m.close();
    m.querySelector('[data-yes]').onclick = () => { done = true; m.close(); ok(true); };
    m.querySelector('[data-yes]').focus();
  });
}

function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0');
}

// Gráfica de pastel en SVG. items: [{label, value}]
function pieSvg(items) {
  const total = items.reduce((a, b) => a + b.value, 0);
  if (!total) return `<svg class="pie" viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" fill="#222"/><text x="100" y="106" text-anchor="middle" fill="#888" font-weight="800" font-size="14">Sin votos aún</text></svg>`;
  let a0 = -Math.PI / 2, out = '';
  items.forEach((it, i) => {
    if (!it.value) return;
    const col = COLORS[i % COLORS.length];
    if (it.value === total) { out += `<circle cx="100" cy="100" r="92" fill="${col}"/>`; return; }
    const a1 = a0 + (it.value / total) * Math.PI * 2;
    const p = a => [100 + 92 * Math.cos(a), 100 + 92 * Math.sin(a)].map(n => n.toFixed(2)).join(' ');
    out += `<path d="M100 100 L${p(a0)} A92 92 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)} Z" fill="${col}" stroke="#000" stroke-width="1.5"/>`;
    a0 = a1;
  });
  return `<svg class="pie" viewBox="0 0 200 200">${out}</svg>`;
}
function legendHtml(items) {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  return `<div class="legend">${items.map((it, i) => `<div><i style="background:${COLORS[i % COLORS.length]}"></i>${esc(it.label)} <span class="mute">· ${it.value} (${Math.round(it.value / total * 100)}%)</span></div>`).join('')}</div>`;
}
function clipEmbed(slug) {
  return `<iframe src="https://clips.twitch.tv/embed?clip=${encodeURIComponent(slug)}&parent=${encodeURIComponent(location.hostname)}&autoplay=false" allowfullscreen style="width:100%;aspect-ratio:16/9;border:0;border-radius:12px;background:#111"></iframe>`;
}
