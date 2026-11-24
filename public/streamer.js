// Panel del streamer
{
  let S = null;                 // estado desde /api/s/state
  let offset = 0;               // diferencia de reloj servidor - navegador
  let draft = emptyDraft();     // formulario "Añadir clip"
  let openCat = null, catQuery = '', resultsCat = null, focusNewCat = false;
  const app = $('#app');
  const VIEWS = [['inicio', 'Inicio'], ['categorias', 'Categorías'], ['clips', 'Añadir clip'], ['envivo', 'Panel en vivo'],
    ['resultados', 'Resultados'], ['seguridad', 'Seguridad'], ['perfil', 'Mi perfil']];
  const view = () => (VIEWS.some(v => v[0] === location.hash.slice(1)) ? location.hash.slice(1) : 'inicio');
  function emptyDraft() { return { id: null, url: '', title: '', description: '', preview: null, categoryIds: [] }; }
  const cats = () => S.categories;
  const clipById = id => S.clips.find(c => c.id === id);
  const resOf = id => S.results.find(r => r && r.categoryId === id);
  const totalVotes = () => S.results.reduce((a, r) => a + (r ? r.total : 0), 0);
  const thumb = (c, cls = 'thumb') => safeUrl(c.thumbnail)
    ? `<img class="${cls}" src="${esc(safeUrl(c.thumbnail))}" alt="" loading="lazy">` : `<div class="${cls}">CLIP</div>`;

  async function load() {
    try {
      S = await api('/api/s/state');
      offset = S.voting.now - Date.now();
      render();
    } catch (e) {
      if (e.status === 401) return showLogin();
      toast(e.message, true);
    }
  }
  async function act(fn, okMsg) {
    try { const r = await fn(); if (okMsg) toast(okMsg); await load(); return r; }
    catch (e) { toast(e.message, true); }
  }

  function showLogin() {
    S = null;
    app.innerHTML = `<main class="splash"><div class="box">
      <div><span class="logo big">VOTE<b>!</b></span><span class="logo-sub">for streamers</span></div>
      <h3>Conecta tu cuenta para comenzar</h3>
      <a class="btn purple pill" href="/auth/login?next=/streamer" style="min-height:52px;padding:0 26px">Iniciar sesión con Twitch ${TWITCH_ICON}</a>
    </div></main>`;
  }

  // ---------- Estructura ----------
  function render() {
    if (!S) return;
    const v = view(), live = S.voting.status === 'live';
    const av = safeUrl(S.me.profile_image_url) ? `<img src="${esc(safeUrl(S.me.profile_image_url))}" alt="">` : '<span class="av"></span>';
    app.innerHTML = `
      <header class="top">${LOGO}<span class="t">Dashboard</span>${live ? '<span class="badge-live">LIVE</span>' : ''}
        <span class="user">${av}${esc(S.me.display_name)}</span></header>
      <div class="shell">
        <nav class="side">${VIEWS.map(([k, l]) => `<a href="#${k}" class="${k === v ? 'on' : ''}">${esc(l)}${k === 'envivo' && live ? ' <span class="badge-live">LIVE</span>' : ''}</a>`).join('')}
          <span class="sep"></span><a href="/auth/logout?next=/streamer">Cerrar sesión</a></nav>
        <main id="main"></main>
      </div>`;
    const main = $('#main');
    ({ inicio: vHome, categorias: vCats, clips: vClips, envivo: vLive, resultados: vResults, seguridad: vSec, perfil: vProfile })[v](main);
    if (S.demo && v === 'inicio') main.insertAdjacentHTML('afterbegin', `<div class="card small" style="margin-bottom:16px;border:1px solid var(--yellow)"><b>Modo demo:</b> el login de Twitch es simulado y los datos de los clips se sacan del link. Para conectar Twitch de verdad, sigue el README.</div>`);
  }

  // ---------- Inicio ----------
  function vHome(m) {
    const cur = S.voting.category;
    m.innerHTML = `
      <div class="head"><h1>Hola, ${esc(S.me.display_name)}</h1></div>
      <div class="tiles">
        <a class="tile" href="#categorias">Lista de categorías<small>${cats().length} creadas</small></a>
        <a class="tile" href="#categorias" data-new>Crear nueva categoría<small>Ej. Mejor clip del año</small></a>
        <a class="tile" href="#envivo">Panel de control <span class="badge-live" style="margin-top:6px">LIVE</span></a>
        <a class="tile" href="#resultados">Gráfica de resultados<small>${totalVotes()} votos</small></a>
        <a class="tile" href="#clips">Añadir clip<small>${S.clips.length} en tu biblioteca</small></a>
        <a class="tile" href="#seguridad">Consola de seguridad<small>${S.blocked} bloqueos</small></a>
      </div>
      <div class="stats">
        <div class="stat"><b>${cats().length}</b><span>Categorías</span></div>
        <div class="stat"><b>${S.clips.length}</b><span>Clips</span></div>
        <div class="stat"><b>${totalVotes()}</b><span>Votos totales</span></div>
        <div class="stat"><b>${S.blocked}</b><span>Bloqueados</span></div>
      </div>
      <div class="activebar">${S.voting.status === 'live' ? '<span class="badge-live">LIVE</span> Votación activa: ' + esc(cur.name) + ' · <span id="timer">' + fmtTime(S.voting.endsAt - (Date.now() + offset)) + '</span>'
        : cur && S.voting.status === 'ended' ? 'Última votación: ' + esc(cur.name) + ' (terminada)' : 'Sin votación activa'}</div>
      <div class="card share">
        <h3>Links para compartir</h3>
        <label class="f">Link de votación para tu chat</label>
        <div class="row"><input readonly value="${esc(S.viewerUrl)}"><button class="btn sm" data-copy="${esc(S.viewerUrl)}">Copiar</button><a class="btn sm" href="${esc(S.viewerUrl)}" target="_blank" rel="noopener">Abrir</a></div>
        <label class="f">Overlay para OBS (fuente de navegador)</label>
        <div class="row"><input readonly value="${esc(S.overlayUrl)}"><button class="btn sm" data-copy="${esc(S.overlayUrl)}">Copiar</button><a class="btn sm" href="${esc(S.overlayUrl)}" target="_blank" rel="noopener">Abrir</a></div>
        <p class="small mute" style="margin:0">Con <b>localhost</b> solo funciona en esta computadora. Para que tu chat vote desde su casa hay que subir el proyecto a internet (ver README).</p>
      </div>`;
    m.querySelector('[data-new]').onclick = () => { focusNewCat = true; };
  }

  // ---------- Categorías ----------
  function vCats(m) {
    m.innerHTML = `
      <div class="head"><h1>Categorías</h1></div>
      <form class="row" id="newcat" style="margin-bottom:12px">
        <input id="q" placeholder="Buscador" value="${esc(catQuery)}" style="flex:1 1 200px">
        <input id="nc" placeholder="Nueva categoría (ej. Mejor VIP)" maxlength="60" style="flex:1 1 240px">
        <button class="btn green">+ Crear</button>
      </form>
      <div id="catlist"></div>`;
    $('#newcat').addEventListener('submit', async e => {
      e.preventDefault();
      const name = $('#nc').value.trim(); if (!name) return $('#nc').focus();
      const k = await act(() => api('/api/s/categories', { method: 'POST', body: { name } }), 'Categoría creada');
      if (k) { openCat = k.id; render(); }
    });
    $('#q').addEventListener('input', e => { catQuery = e.target.value; catList(); });
    catList();
    if (focusNewCat) { focusNewCat = false; $('#nc').focus(); }
  }
  function catList() {
    const box = $('#catlist'), q = catQuery.toLowerCase();
    const list = cats().filter(k => k.name.toLowerCase().includes(q));
    if (!cats().length) { box.innerHTML = `<div class="empty">Todavía no tienes categorías. Crea la primera arriba, por ejemplo <b>Mejor clip del año</b>.</div>`; return; }
    if (!list.length) { box.innerHTML = `<div class="empty">Ninguna categoría coincide con “${esc(catQuery)}”.</div>`; return; }
    box.innerHTML = list.map(k => {
      const r = resOf(k.id), isLive = S.voting.status === 'live' && S.voting.category && S.voting.category.id === k.id;
      const others = S.clips.filter(c => !k.clipIds.includes(c.id));
      return `<div class="catrow" data-id="${esc(k.id)}">
        <div class="h"><button class="name" data-toggle>${openCat === k.id ? '▾' : '▸'} ${esc(k.name)}</button>
          ${isLive ? '<span class="badge-live">LIVE</span>' : ''}
          <span class="small mute">${k.clipIds.length} clips · ${r ? r.total : 0} votos</span>
          <button class="btn sm" data-rename>Renombrar</button>
          <button class="btn sm green" data-start ${k.clipIds.length < 2 ? 'disabled title="Necesita al menos 2 clips"' : ''}>Votar</button>
          <button class="btn sm red" data-del>Eliminar</button></div>
        ${openCat === k.id ? `<div class="body">
          ${k.clipIds.length ? `<div class="nominees">${k.clipIds.map(clipById).filter(Boolean).map((c, i) => `<div class="nom">${thumb(c)}
            <div class="in"><span class="small mute">Nominado #${i + 1}</span><span class="ti">${esc(c.title)}</span>
            <button class="btn sm ghost" data-remove="${esc(c.id)}">Quitar de la categoría</button></div></div>`).join('')}</div>`
            : '<p class="mute">Esta categoría aún no tiene clips nominados.</p>'}
          <div class="row">
            ${others.length ? `<select data-addsel style="flex:1 1 220px"><option value="">Agregar un clip de tu biblioteca…</option>${others.map(c => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('')}</select>
            <button class="btn sm" data-add>Agregar</button>` : ''}
            <a class="btn sm purple" href="#clips" data-newclip>+ Nuevo clip desde link</a>
          </div></div>` : ''}
      </div>`;
    }).join('');
    box.querySelectorAll('.catrow').forEach(row => {
      const k = cats().find(x => x.id === row.dataset.id);
      const on = (sel, fn) => { const el = row.querySelector(sel); if (el) el.onclick = fn; };
      on('[data-toggle]', () => { openCat = openCat === k.id ? null : k.id; catList(); });
      on('[data-rename]', () => renameCat(k));
      on('[data-start]', () => timerModal(k.id));
      on('[data-del]', async () => {
        if (await confirmBox(`¿Eliminar la categoría "${k.name}" y sus votos? Los clips se quedan en tu biblioteca.`, 'Eliminar'))
          act(() => api('/api/s/categories/' + k.id, { method: 'DELETE' }), 'Categoría eliminada');
      });
      on('[data-add]', () => {
        const id = row.querySelector('[data-addsel]').value; if (!id) return;
        act(() => api('/api/s/categories/' + k.id, { method: 'PATCH', body: { clipIds: [...k.clipIds, id] } }), 'Clip nominado');
      });
      on('[data-newclip]', () => { draft = emptyDraft(); draft.categoryIds = [k.id]; });
      row.querySelectorAll('[data-remove]').forEach(b => b.onclick = () =>
        act(() => api('/api/s/categories/' + k.id, { method: 'PATCH', body: { clipIds: k.clipIds.filter(x => x !== b.dataset.remove) } }), 'Clip quitado'));
    });
  }
  function renameCat(k) {
    const m = modal(`<h3 style="margin-bottom:14px">Renombrar categoría</h3><form class="form"><input maxlength="60" value="${esc(k.name)}"><button class="btn green">Guardar</button></form>`);
    const inp = m.querySelector('input'); inp.select();
    m.querySelector('form').onsubmit = e => { e.preventDefault(); m.close(); act(() => api('/api/s/categories/' + k.id, { method: 'PATCH', body: { name: inp.value } }), 'Nombre actualizado'); };
  }

  // ---------- Clips ----------
  function vClips(m) {
    const ed = !!draft.id;
    m.innerHTML = `
      <div class="split">
        <div class="card form">
          <h2>${ed ? 'Editar clip' : 'Añadir clip'}</h2>
          <div><label class="f" for="cu">Link del clip</label>
            <input id="cu" placeholder="https://clips.twitch.tv/…" value="${esc(draft.url)}" ${ed ? 'disabled' : ''} autocomplete="off"></div>
          <div><label class="f" for="ct">Título del clip</label><input id="ct" placeholder="Título del clip" maxlength="100" value="${esc(draft.title)}"></div>
          <div class="pv">
            <div class="pvbox" id="pv">Vista previa</div>
            <div><label class="f" for="cd">Descripción del clip</label><textarea id="cd" placeholder="Descripción (opcional)" maxlength="300">${esc(draft.description)}</textarea></div>
          </div>
          <div class="row">
            <button class="btn red" id="bdel">${ed ? 'Eliminar' : 'Limpiar'}</button>
            <button class="btn yellow" id="bprev" ${ed ? 'disabled' : ''}>Vista previa</button>
            <button class="btn green grow" id="bsave">${ed ? 'Guardar cambios' : 'Guardar en…'}</button>
          </div>
          ${ed ? '<button class="btn ghost sm" id="bcancel">Cancelar edición</button>' : ''}
        </div>
        <div>
          <div class="head" style="margin-bottom:10px"><h2>Tu biblioteca</h2><span class="small mute">${S.clips.length} clips</span></div>
          <div class="lib">${S.clips.length ? S.clips.slice().reverse().map(c => {
            const inCats = cats().filter(k => k.clipIds.includes(c.id));
            return `<div class="libitem">${thumb(c)}<div><div style="font-weight:900">${esc(c.title)}</div>
              <div class="small mute">${esc(c.broadcaster || '')}${c.creator ? ' · clip de ' + esc(c.creator) : ''}</div>
              <div class="chips" style="margin-top:4px">${inCats.length ? inCats.map(k => `<span class="chip">${esc(k.name)}</span>`).join('') : '<span class="small mute">Sin categoría</span>'}</div></div>
              <button class="btn sm" data-edit="${esc(c.id)}">Editar</button></div>`;
          }).join('') : '<div class="empty">Pega el link de un clip de Twitch a la izquierda para empezar tu biblioteca.</div>'}</div>
        </div>
      </div>`;
    const sync = () => { draft.url = $('#cu').value.trim(); draft.title = $('#ct').value; draft.description = $('#cd').value; };
    ['#ct', '#cd'].forEach(s => $(s).addEventListener('input', sync));
    $('#cu').addEventListener('input', sync);
    $('#cu').addEventListener('change', () => { sync(); if (draft.url) preview(); });
    $('#cu').addEventListener('paste', () => setTimeout(() => { sync(); if (draft.url) preview(); }, 0));
    $('#bprev').onclick = () => { sync(); preview(); };
    $('#bdel').onclick = async () => {
      if (!ed) { draft = emptyDraft(); return render(); }
      if (await confirmBox(`¿Eliminar "${draft.title}" de tu biblioteca y de todas sus categorías?`, 'Eliminar')) {
        const id = draft.id; draft = emptyDraft();
        act(() => api('/api/s/clips/' + id, { method: 'DELETE' }), 'Clip eliminado');
      }
    };
    $('#bsave').onclick = () => { sync(); if (!ed && !draft.url) { toast('Pega primero el link del clip', true); return $('#cu').focus(); } saveInModal(); };
    if (ed) $('#bcancel').onclick = () => { draft = emptyDraft(); render(); };
    m.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      const c = clipById(b.dataset.edit);
      draft = { id: c.id, url: c.url, title: c.title, description: c.description, preview: c, categoryIds: cats().filter(k => k.clipIds.includes(c.id)).map(k => k.id) };
      render(); scrollTo({ top: 0, behavior: 'smooth' });
    });
    drawPreview();
  }
  function drawPreview() {
    const box = $('#pv'); if (!box) return;
    const p = draft.preview;
    if (!p) { box.textContent = 'Vista previa'; return; }
    box.innerHTML = `${thumb(p)}<button class="btn sm ghost" style="margin:6px" data-play>▶ Ver clip</button>`;
    box.querySelector('[data-play]').onclick = () => modal(`<h3 style="margin:0 34px 12px 0">${esc(p.title)}</h3>${clipEmbed(p.slug)}`);
  }
  async function preview() {
    if (!draft.url) return;
    const box = $('#pv'); if (box) box.textContent = 'Buscando…';
    try {
      const p = await api('/api/s/clip-preview?url=' + encodeURIComponent(draft.url));
      draft.preview = p;
      if (!draft.title.trim()) { draft.title = p.title; const t = $('#ct'); if (t) t.value = p.title; }
    } catch (e) { draft.preview = null; toast(e.message, true); }
    drawPreview();
  }
  function saveInModal() {
    const m = modal(`<h2 style="margin:0 34px 14px 0">Guardar en</h2>
      <div id="gl">${cats().length ? cats().map(k => `<label class="check"><input type="checkbox" value="${esc(k.id)}" ${draft.categoryIds.includes(k.id) ? 'checked' : ''}>${esc(k.name)}</label>`).join('')
        : '<p class="mute">Aún no tienes categorías. Crea una aquí o guarda el clip sin categoría.</p>'}</div>
      <form class="row" id="gn" style="margin:6px 0 16px"><input placeholder="Nueva categoría" maxlength="60" style="flex:1"><button class="btn sm">+ Crear</button></form>
      <button class="btn green" id="gs" style="width:100%">Guardar</button>`);
    m.querySelector('#gn').onsubmit = async e => {
      e.preventDefault();
      const inp = m.querySelector('#gn input'); if (!inp.value.trim()) return;
      try {
        const k = await api('/api/s/categories', { method: 'POST', body: { name: inp.value } });
        S.categories.push(k);
        m.querySelector('#gl').insertAdjacentHTML('beforeend', `<label class="check"><input type="checkbox" value="${esc(k.id)}" checked>${esc(k.name)}</label>`);
        m.querySelector('#gl p')?.remove(); inp.value = '';
      } catch (err) { toast(err.message, true); }
    };
    m.querySelector('#gs').onclick = async () => {
      const ids = [...m.querySelectorAll('#gl input:checked')].map(i => i.value);
      const btn = m.querySelector('#gs'); btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        if (draft.id) await api('/api/s/clips/' + draft.id, { method: 'PATCH', body: { title: draft.title, description: draft.description, categoryIds: ids } });
        else await api('/api/s/clips', { method: 'POST', body: { url: draft.url, title: draft.title, description: draft.description, categoryIds: ids } });
        m.close(); draft = emptyDraft(); await load();
        modal(`<div style="text-align:center;padding:10px 20px"><h2>¡Clip guardado con éxito!</h2><p><span class="ok-dot"></span></p></div>`);
      } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = 'Guardar'; }
    };
  }

  // ---------- Panel en vivo ----------
  function vLive(m) {
    const v = S.voting, cur = v.category, r = cur && resOf(cur.id);
    if (!cur) {
      const ready = cats().filter(k => k.clipIds.length >= 2);
      m.innerHTML = `<div class="head"><h1>Panel en vivo</h1></div>
        ${ready.length ? `<p class="mute">Elige qué categoría quieres poner a votación:</p>${ready.map(k => `<div class="catrow"><div class="h"><span class="name">${esc(k.name)}</span><span class="small mute">${k.clipIds.length} nominados</span><button class="btn green sm" data-s="${esc(k.id)}">Iniciar votación</button></div></div>`).join('')}`
          : '<div class="empty">Necesitas una categoría con al menos 2 clips nominados. Ve a <a href="#clips">Añadir clip</a> y guárdalos en una categoría.</div>'}`;
      m.querySelectorAll('[data-s]').forEach(b => b.onclick = () => timerModal(b.dataset.s));
      return;
    }
    const items = r.items.map(c => ({ label: c.title, value: c.votes }));
    const blocks = S.log.filter(l => l.kind === 'block').slice(0, 12);
    m.innerHTML = `<div class="live">
      <div class="card">
        <div class="row" style="margin-bottom:14px"><h3 class="grow">Votación actual: ${esc(cur.name)}</h3>
          ${v.status === 'live' ? '<span class="badge-live">EN VIVO</span>' : '<span class="chip">TERMINADA</span>'}</div>
        <div class="chart">${pieSvg(items)}<div>${legendHtml(items)}
          <div style="margin-top:18px"><span class="timer" id="timer">${fmtTime(v.endsAt - (Date.now() + offset))}</span></div></div></div>
        <div class="ctrl">
          <a class="btn ic" href="${esc(S.viewerUrl)}" target="_blank" rel="noopener" title="Ver como viewer" aria-label="Ver como viewer">👁</a>
          <button class="btn ic" data-add="10">+10s</button><button class="btn ic" data-add="30">+30s</button>
          <button class="btn ic" id="tm" title="Editar temporizador" aria-label="Editar temporizador">⏱</button>
          <select id="sw" style="width:auto;flex:1 1 180px"><option value="">Cambiar de categoría…</option>${cats().filter(k => k.id !== cur.id && k.clipIds.length >= 2).map(k => `<option value="${esc(k.id)}">${esc(k.name)}</option>`).join('')}</select>
        </div>
        <div class="ctrl">
          <button class="btn yellow" id="rs">Reiniciar votación</button>
          ${v.status === 'live' ? '<button class="btn red" id="end">Terminar votación</button>' : '<button class="btn green" id="reopen">Reabrir 1 minuto</button>'}
        </div>
      </div>
      <div class="card">
        <h3 style="margin-bottom:10px">Monitor de seguridad</h3>
        <div class="small" style="font-weight:800">VOTOS EN ESTA CATEGORÍA: ${r.total}<br>CUENTAS BLOQUEADAS: ${S.blocked}</div>
        <hr style="border:0;border-top:1px solid var(--line);margin:12px 0">
        <div class="log">${blocks.length ? blocks.map(l => `<div class="block">[${new Date(l.t).toLocaleTimeString()}] ${esc(l.msg)}</div>`).join('') : '<span class="mute">Sin intentos sospechosos por ahora.</span>'}</div>
      </div></div>`;
    m.querySelectorAll('[data-add]').forEach(b => b.onclick = () => act(() => api('/api/s/voting/add', { method: 'POST', body: { seconds: +b.dataset.add } })));
    $('#tm').onclick = () => timerModal(cur.id);
    $('#sw').onchange = e => e.target.value && timerModal(e.target.value);
    $('#rs').onclick = async () => { if (await confirmBox(`¿Borrar todos los votos de "${cur.name}"? No se puede deshacer.`, 'Reiniciar', 'yellow')) act(() => api('/api/s/voting/reset', { method: 'POST', body: { categoryId: cur.id } }), 'Votos reiniciados'); };
    if ($('#end')) $('#end').onclick = async () => { if (await confirmBox('¿Terminar la votación ahora?', 'Terminar')) act(() => api('/api/s/voting/end', { method: 'POST' }), 'Votación terminada'); };
    if ($('#reopen')) $('#reopen').onclick = () => act(() => api('/api/s/voting/add', { method: 'POST', body: { seconds: 60 } }), 'Votación reabierta');
  }
  function timerModal(catId) {
    const k = cats().find(x => x.id === catId);
    const opts = n => Array.from({ length: n }, (_, i) => `<option value="${i}">${i}</option>`).join('');
    const m = modal(`<h3 style="text-align:center;margin-bottom:6px">Editar temporizador</h3>
      <p class="small mute" style="text-align:center;margin:0 0 14px">${esc(k.name)}</p>
      <div class="selects"><div><label class="f">Minutos</label><select id="mi">${opts(121)}</select></div><div><label class="f">Segundos</label><select id="se">${opts(60)}</select></div></div>
      <div class="presets">${[[30, '30 s'], [60, '1 min'], [120, '2 min'], [300, '5 min'], [600, '10 min']].map(([s, l]) => `<button class="btn sm" data-p="${s}">${l}</button>`).join('')}</div>
      <button class="go" id="go">INICIAR</button>`);
    m.querySelector('#mi').value = '2';
    m.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { m.querySelector('#mi').value = Math.floor(b.dataset.p / 60); m.querySelector('#se').value = b.dataset.p % 60; });
    m.querySelector('#go').onclick = async () => {
      const seconds = +m.querySelector('#mi').value * 60 + +m.querySelector('#se').value;
      m.close();
      await act(() => api('/api/s/voting/start', { method: 'POST', body: { categoryId: catId, seconds } }), '¡Votación iniciada!');
      if (view() !== 'envivo') location.hash = 'envivo';
    };
  }

  // ---------- Resultados ----------
  function vResults(m) {
    const list = S.results.filter(Boolean);
    if (!list.length) { m.innerHTML = '<div class="head"><h1>Resultados</h1></div><div class="empty">Crea una categoría y ponla a votación para ver resultados aquí.</div>'; return; }
    if (!list.some(r => r.categoryId === resultsCat)) resultsCat = (S.voting.category && S.voting.category.id) || list[0].categoryId;
    const r = list.find(x => x.categoryId === resultsCat);
    const sorted = r.items.map((c, i) => ({ ...c, color: COLORS[i % COLORS.length] })).sort((a, b) => b.votes - a.votes);
    const top = sorted[0], tie = sorted[1] && top && sorted[1].votes === top.votes;
    m.innerHTML = `<div class="head"><h1>Resultados</h1><span class="small mute">${r.total} votos</span></div>
      <div class="tabs">${list.map(x => `<button class="btn sm ${x.categoryId === resultsCat ? 'on' : ''}" data-c="${esc(x.categoryId)}">${esc(x.name)}</button>`).join('')}</div>
      ${r.total ? `<div class="winner">${tie ? 'Empate en primer lugar' : '🏆 Va ganando: ' + esc(top.title)}</div>` : ''}
      <div class="split"><div class="card" style="display:grid;place-items:center">${pieSvg(r.items.map(c => ({ label: c.title, value: c.votes })))}</div>
      <div class="card rank">${sorted.length ? sorted.map((c, i) => `<div class="r"><b>#${i + 1}</b>${thumb(c)}<div><div style="font-weight:900">${esc(c.title)}</div>
        <div class="bar" style="margin-top:6px"><span style="width:${r.total ? c.votes / r.total * 100 : 0}%;background:${c.color}"></span></div></div>
        <div style="text-align:right;font-weight:900">${c.votes}<div class="small mute">${r.total ? Math.round(c.votes / r.total * 100) : 0}%</div></div></div>`).join('') : '<span class="mute">Sin clips nominados.</span>'}</div></div>`;
    m.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { resultsCat = b.dataset.c; render(); });
  }

  // ---------- Seguridad ----------
  function vSec(m) {
    m.innerHTML = `<div class="head"><h1>Consola de seguridad</h1></div>
      <div class="stats"><div class="stat"><b>${totalVotes()}</b><span>Votos válidos</span></div><div class="stat"><b>${S.blocked}</b><span>Intentos bloqueados</span></div></div>
      <div class="split">
        <div class="card"><h3 style="margin-bottom:10px">Reglas</h3>
          <p class="small mute">Cada cuenta de Twitch puede votar <b>una sola vez por categoría</b>. Además puedes exigir una antigüedad mínima para frenar cuentas recién creadas.</p>
          <form class="row" id="sf"><label class="f" for="md" style="width:100%">Antigüedad mínima de la cuenta (días)</label>
            <input id="md" type="number" min="0" max="3650" value="${S.settings.minAccountDays}" style="width:120px"><button class="btn green">Guardar</button></form>
        </div>
        <div class="card"><h3 style="margin-bottom:10px">Registro</h3>
          <div class="log">${S.log.length ? S.log.map(l => `<div class="${esc(l.kind)}">[${new Date(l.t).toLocaleString()}] ${esc(l.msg)}</div>`).join('') : '<span class="mute">Sin actividad todavía.</span>'}</div></div>
      </div>`;
    $('#sf').onsubmit = e => { e.preventDefault(); act(() => api('/api/s/settings', { method: 'PATCH', body: { minAccountDays: +$('#md').value } }), 'Regla guardada'); };
  }

  // ---------- Perfil ----------
  function vProfile(m) {
    const p = safeUrl(S.me.profile_image_url);
    m.innerHTML = `<div class="head"><h1>Mi perfil</h1></div>
      <div class="card row" style="gap:18px">${p ? `<img src="${esc(p)}" alt="" style="width:84px;height:84px;border-radius:50%">` : '<span class="av" style="width:84px;height:84px"></span>'}
        <div class="grow"><h2>${esc(S.me.display_name)}</h2><div class="mute">twitch.tv/${esc(S.me.login)}</div>
        <div class="small" style="margin-top:6px">${S.demo ? 'Conectado en <b>modo demo</b>' : 'Conectado con Twitch'}</div></div>
        <a class="btn red" href="/auth/logout?next=/streamer">Cerrar sesión</a></div>`;
  }

  // ---------- Eventos globales ----------
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    navigator.clipboard.writeText(b.dataset.copy).then(() => toast('Link copiado'), () => toast('No se pudo copiar; selecciónalo y copia a mano', true));
  });
  window.addEventListener('hashchange', render);
  setInterval(() => {
    const t = $('#timer'); if (!t || !S) return;
    const left = S.voting.endsAt - (Date.now() + offset);
    t.textContent = S.voting.status === 'live' ? fmtTime(left) : '0:00';
    if (S.voting.status === 'live' && left <= 0) load();
  }, 250);
  setInterval(() => { if (S && ['inicio', 'envivo', 'resultados', 'seguridad'].includes(view()) && !$('.modal-bg') && !document.activeElement.matches('input,select,textarea')) load(); }, 2500);
  load();
}
