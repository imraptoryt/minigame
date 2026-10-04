/* Composants réutilisables : Modal, Form, Table, Toast, StatCard, Chart,
 * Pagination, Tabs, EmptyState, Skeleton, badges, formatage. */
(function () {
  'use strict';
  const LSC = window.LSC = window.LSC || {};
  LSC.pages = LSC.pages || {}; LSC.open = LSC.open || {}; LSC.forms = LSC.forms || {};

  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  function money(n, signed) {
    const cur = (LSC.app && LSC.app.state && LSC.app.state.company.currency) || '$';
    const v = Math.round((+n || 0) * 100) / 100, a = Math.abs(v);
    const s = a.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(a) ? 0 : 2, maximumFractionDigits: 2 });
    return (v < 0 ? '-' : signed && v > 0 ? '+' : '') + cur + s;
  }
  const short = n => { const a = Math.abs(n); return (n < 0 ? '-' : '') + (a >= 1e6 ? (a / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k' : Math.round(a)); };
  const fmtDate = iso => { if (!iso) return '—'; const d = new Date(iso); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); };
  const fmtTime = iso => { if (!iso) return '—'; const d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const fmtDT = iso => iso ? fmtDate(iso) + ' - ' + fmtTime(iso) : '—';
  const fmtDur = m => pad(Math.floor((m || 0) / 60)) + 'h' + pad(Math.round((m || 0) % 60));
  const toInputDate = t => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  function ago(iso) {
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 60) return "à l'instant";
    if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h';
    return 'il y a ' + Math.floor(s / 86400) + ' j';
  }
  const icon = (n, cls) => `<i data-lucide="${n}" class="ic ${cls || ''}"></i>`;
  function paint() {
    if (window.lucide) try { window.lucide.createIcons(); } catch (e) { /* icônes facultatives */ }
    document.querySelectorAll('select[data-combo]').forEach(combo);
  }
  /* Liste « on tape, ça suggère » : remplace un <select data-combo> par un champ texte + suggestions.
   * Le <select> reste (caché) et garde la valeur : le code existant (value, onchange, formulaires) ne change pas. */
  let comboSeq = 0;
  function combo(sel) {
    if (sel._combo) return;
    sel._combo = true;
    const opts = [...sel.options], blank = opts.find(o => !o.value), id = 'cb' + (++comboSeq);
    const inp = document.createElement('input');
    inp.className = sel.className.replace(/\binput\b/, '') + ' input combo';
    inp.setAttribute('list', id); inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.placeholder = blank ? blank.text.replace(/\.\.\.$/, '') + ' — tapez un nom' : 'Tapez un nom...';
    inp.required = sel.required; sel.required = false;
    const label = () => { const o = sel.selectedOptions[0]; return o && o.value ? o.text : ''; };
    inp.value = label();
    const dl = document.createElement('datalist');
    dl.id = id;
    dl.innerHTML = opts.filter(o => o.value).map(o => `<option value="${esc(o.text)}"></option>`).join('');
    sel.hidden = true;
    sel.after(inp, dl);
    const set = v => { if (sel.value !== v) { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); } };
    inp.addEventListener('input', () => {
      const t = inp.value.trim().toLowerCase();
      if (!t) return set(blank ? blank.value : '');
      const o = opts.find(x => x.value && x.text.toLowerCase() === t);
      if (o) set(o.value);
    });
    inp.addEventListener('change', () => {
      const t = inp.value.trim().toLowerCase();
      if (!t) { set(blank ? blank.value : ''); return; }
      const hits = opts.filter(x => x.value && x.text.toLowerCase().includes(t));
      if (hits.length === 1) set(hits[0].value);
      inp.value = label() || (hits.length ? inp.value : '');
    });
  }

  function avatar(name, cls) {
    /* photo de profil de l'employé si renseignée (Mon compte) */
    const st = LSC.app && LSC.app.state, emp = st && st.employees.find(e => e.name === name && e.photo);
    if (emp) return `<span class="avatar photo ${cls || ''}"><img src="${esc(emp.photo)}" alt="" loading="lazy" onerror="this.parentNode.classList.remove('photo');this.remove()"></span>`;
    const ini = String(name || '?').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
    let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return `<span class="avatar ${cls || ''}" style="--h:${h}">${esc(ini)}</span>`;
  }
  const badge = (text, tone) => `<span class="badge ${tone || ''}">${esc(text)}</span>`;
  const dot = tone => `<span class="dot ${tone || ''}"></span>`;
  const STATUS = {
    sale: { paid: ['Payée', 'ok'], pending: ['En attente', 'warn'], cancelled: ['Annulée', 'danger'] },
    invoice: { draft: ['Brouillon', 'muted'], sent: ['Envoyée', 'info'], paid: ['Payée', 'ok'], overdue: ['En retard', 'danger'], cancelled: ['Annulée', 'muted'] },
    bill: { pending: ['En attente', 'warn'], overdue: ['En retard', 'danger'], paid: ['Payée', 'ok'] },
    payroll: { draft: ['Brouillon', 'muted'], validated: ['Validée', 'info'], paid: ['Payée', 'ok'] },
    staff: { on: ['En service', 'ok'], off: ['Hors service', 'muted'], pause: ['En pause', 'warn'], suspended: ['Suspendu', 'danger'] },
    app: { new: ['Nouvelle', 'info'], review: ['En cours', 'warn'], interview: ['Entretien', 'warn'], accepted: ['Acceptée', 'ok'], refused: ['Refusée', 'danger'] }
  };
  const status = (kind, s) => { const x = (STATUS[kind] || {})[s] || [s, 'muted']; return badge(x[0], x[1]); };
  const opts = (list, sel) => list.map(o => { const v = typeof o === 'object' ? o.value : o, l = typeof o === 'object' ? o.label : o; return `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(l)}</option>`; }).join('');

  /* ---------- Toast ---------- */
  function toast(msg, type) {
    type = type || 'ok';
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = icon(type === 'error' ? 'circle-alert' : type === 'warn' ? 'triangle-alert' : 'circle-check') + `<span>${esc(msg)}</span>`;
    $('#toasts').appendChild(t); paint();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 200); }, type === 'error' ? 4000 : 2600);
  }

  /* ---------- Modal ---------- */
  const stack = [];
  function modal(o) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal ${o.size || ''}" role="dialog" aria-modal="true">
      <div class="modal-head">${o.icon ? icon(o.icon) : ''}<h3>${esc(o.title)}</h3><button class="icon-btn" data-close title="Fermer (Échap)">${icon('x')}</button></div>
      <div class="modal-body">${o.body || ''}</div>${o.foot ? `<div class="modal-foot">${o.foot}</div>` : ''}</div>`;
    $('#layer').appendChild(wrap);
    const m = {
      el: wrap.querySelector('.modal'), wrap, submit: null, onClose: o.onClose || null,
      close() { const i = stack.indexOf(m); if (i < 0) return; stack.splice(i, 1); wrap.remove(); if (m.onClose) m.onClose(); }
    };
    wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) m.close(); });
    stack.push(m); paint();
    setTimeout(() => { const f = wrap.querySelector('[autofocus]') || wrap.querySelector('.modal-body input:not([type=hidden]):not([type=checkbox]):not([type=radio]), .modal-body select, .modal-body textarea'); if (f) f.focus(); }, 30);
    return m;
  }
  modal.top = () => stack[stack.length - 1];
  modal.count = () => stack.length;

  function confirmBox(text, o) {
    o = o || {};
    return new Promise(res => {
      const m = modal({ title: o.title || 'Confirmation', icon: o.danger ? 'triangle-alert' : 'circle-help', body: `<p class="lead">${esc(text)}</p>`,
        foot: `<button class="btn ghost" data-close>Annuler</button><button class="btn ${o.danger ? 'danger' : 'primary'}" data-ok>${esc(o.ok || 'Confirmer')}</button>`, onClose: () => res(false) });
      m.submit = () => { m.onClose = null; m.close(); res(true); };
      m.el.querySelector('[data-ok]').onclick = m.submit;
    });
  }

  /* ---------- Formulaire en modal ---------- */
  function field(f, v) {
    if (v === undefined) v = f.value != null ? f.value : '';
    const req = f.required ? 'required' : '';
    const attrs = `name="${f.name}" ${req} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} ${f.attrs || ''}`;
    let ctl;
    switch (f.type) {
      case 'textarea': ctl = `<textarea class="input" rows="${f.rows || 3}" ${attrs}>${esc(v)}</textarea>`; break;
      case 'select': ctl = `<select class="input" ${attrs}>${opts(f.options || [], v)}</select>`; break;
      case 'checkbox': return `<label class="check ${f.full ? 'full' : ''}"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}><span>${esc(f.label)}</span></label>`;
      case 'html': return `<div class="field ${f.full ? 'full' : ''}">${f.label ? `<span class="field-label">${esc(f.label)}</span>` : ''}${f.html}</div>`;
      case 'money': ctl = `<div class="input-affix"><span>${esc((LSC.app && LSC.app.state.company.currency) || '$')}</span><input class="input" type="number" step="0.01" min="${f.min != null ? f.min : 0}" value="${esc(v)}" ${attrs}></div>`; break;
      default: ctl = `<input class="input" type="${f.type || 'text'}" value="${esc(v)}" ${f.step ? `step="${f.step}"` : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${attrs}>`;
    }
    return `<label class="field ${f.full ? 'full' : ''}"><span class="field-label">${esc(f.label)}${f.required ? ' <b>*</b>' : ''}</span>${ctl}${f.hint ? `<small class="hint">${esc(f.hint)}</small>` : ''}</label>`;
  }
  function form(o) {
    const values = o.values || {};
    const m = modal({
      title: o.title, icon: o.icon, size: o.size,
      body: `${o.intro || ''}<form class="form" novalidate>${o.fields.map(f => field(f, values[f.name])).join('')}</form>`,
      foot: `${o.extraFoot || ''}<span class="grow"></span><button class="btn ghost" data-close>Annuler</button><button class="btn ${o.danger ? 'danger' : 'primary'}" data-submit>${icon(o.submitIcon || 'check')}${esc(o.submit || 'Enregistrer')}</button>`
    });
    const fe = m.el.querySelector('form'), btn = m.el.querySelector('[data-submit]');
    m.read = () => {
      const v = {};
      o.fields.forEach(f => {
        const el = fe.elements[f.name];
        if (!el || f.type === 'html') return;
        if (f.type === 'checkbox') v[f.name] = el.checked;
        else if (f.type === 'number' || f.type === 'money') v[f.name] = el.value === '' ? null : +el.value;
        else v[f.name] = el.value.trim();
      });
      return v;
    };
    m.submit = async () => {
      const v = m.read();
      const miss = o.fields.find(f => f.required && (v[f.name] === '' || v[f.name] == null));
      if (miss) { toast(`Champ obligatoire : ${miss.label}`, 'error'); const el = fe.elements[miss.name]; if (el && el.focus) el.focus(); return; }
      btn.disabled = true;
      try { const r = await o.onSubmit(v, m); if (!(r === false || (r && r.ok === false))) m.close(); }
      finally { btn.disabled = false; }
    };
    btn.onclick = m.submit;
    fe.addEventListener('submit', e => { e.preventDefault(); m.submit(); });
    fe.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.ctrlKey) { e.preventDefault(); m.submit(); } });
    if (o.onChange) fe.addEventListener('input', e => o.onChange(m.read(), fe, e));
    if (o.onMount) o.onMount(m, fe);
    return m;
  }

  /* ---------- Table : tri + pagination ---------- */
  const tableState = {};
  function table(el, o) {
    const st = tableState[o.id] || (tableState[o.id] = { sort: o.sort || null, dir: o.dir || -1, page: 1 });
    if (o.resetPage) st.page = 1;
    const draw = () => {
      if (!o.rows.length) { el.innerHTML = empty(o.empty || {}); paint(); return; }
      let data = o.rows.slice();
      const col = st.sort && o.columns.find(c => c.key === st.sort);
      if (col) { const get = col.sortValue || (r => r[col.key]); data.sort((a, b) => { const x = get(a), y = get(b); return (x > y ? 1 : x < y ? -1 : 0) * st.dir; }); }
      const size = o.pageSize || 12, pages = Math.max(1, Math.ceil(data.length / size));
      if (st.page > pages) st.page = pages;
      const slice = data.slice((st.page - 1) * size, st.page * size);
      el.innerHTML = `<div class="table-wrap"><table class="tbl ${o.compact ? 'compact' : ''} ${o.cls || ''}"><thead><tr>${o.columns.map(c =>
        `<th class="${c.align || ''} ${c.sortable === false ? '' : 'sortable'}" data-k="${c.key}" style="${c.width ? 'width:' + c.width : ''}">${c.label}${st.sort === c.key ? icon(st.dir > 0 ? 'chevron-up' : 'chevron-down', 'xs') : ''}</th>`).join('')}</tr></thead>
        <tbody>${slice.map((r, i) => `<tr data-i="${i}" class="${o.onRow ? 'clickable' : ''} ${o.rowClass ? o.rowClass(r) : ''}">${o.columns.map(c => `<td class="${c.align || ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        ${pages > 1 || data.length > 8 ? pager(st.page, pages, data.length, size) : ''}`;
      el.querySelectorAll('th.sortable').forEach(th => th.onclick = () => { const k = th.dataset.k; if (st.sort === k) st.dir *= -1; else { st.sort = k; st.dir = -1; } draw(); });
      el.querySelectorAll('[data-page]').forEach(b => b.onclick = () => { st.page = +b.dataset.page; draw(); });
      if (o.onRow) el.querySelectorAll('tbody tr').forEach(tr => tr.addEventListener('click', e => { if (e.target.closest('button, a, input, select, label')) return; o.onRow(slice[+tr.dataset.i]); }));
      paint();
    };
    draw();
  }
  function pager(page, pages, total, size) {
    const nums = [];
    for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p); else if (nums[nums.length - 1] !== '…') nums.push('…');
    return `<div class="pager"><span class="muted">${(page - 1) * size + 1}–${Math.min(page * size, total)} sur ${total}</span><span class="grow"></span>
      <button class="icon-btn sm" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">${icon('chevron-left')}</button>
      ${nums.map(p => p === '…' ? '<span class="muted">…</span>' : `<button class="pg ${p === page ? 'on' : ''}" data-page="${p}">${p}</button>`).join('')}
      <button class="icon-btn sm" ${page >= pages ? 'disabled' : ''} data-page="${page + 1}">${icon('chevron-right')}</button></div>`;
  }

  /* ---------- Blocs ---------- */
  function stat(o) {
    const tr = o.trend != null && isFinite(o.trend) ? `<span class="trend ${o.trend >= 0 ? 'up' : 'down'}">${icon(o.trend >= 0 ? 'trending-up' : 'trending-down', 'xs')}${o.trend >= 0 ? '+' : ''}${o.trend.toFixed(1)}%</span>` : '';
    return `<div class="stat ${o.cls || ''}" ${o.route ? `data-go="${o.route}"` : ''}><div class="stat-top"><span class="stat-label">${esc(o.label)}</span><span class="stat-ic ${o.tone || ''}">${icon(o.icon || 'circle')}</span></div>
      <div class="stat-value ${o.valueCls || ''}">${o.value}</div><div class="stat-sub">${tr}<span>${o.sub || ''}</span></div></div>`;
  }
  function panel(title, body, o) {
    o = o || {};
    return `<section class="panel ${o.cls || ''}">${title ? `<div class="panel-head"><h3>${o.icon ? icon(o.icon) : ''}${esc(title)}</h3>${o.right || ''}</div>` : ''}<div class="panel-body ${o.bodyCls || ''}">${body}</div></section>`;
  }
  function empty(o) {
    o = o || {};
    return `<div class="empty">${icon(o.icon || 'inbox')}<h4>${esc(o.title || 'Aucune donnée')}</h4><p>${esc(o.text || 'Aucune donnée disponible pour cette période.')}</p>${o.hint !== false ? `<small>${esc(o.hint || 'Modifiez les filtres ou créez un nouvel élément.')}</small>` : ''}${o.action || ''}</div>`;
  }
  function skeleton(kind) {
    const line = w => `<div class="sk" style="width:${w};height:12px"></div>`;
    if (kind === 'stats') return `<div class="grid stats">${'<div class="stat"><div class="sk" style="width:50%;height:10px"></div><div class="sk" style="width:70%;height:22px;margin:12px 0 8px"></div>' + line('40%') + '</div>'}`.repeat(1) + '</div>';
    if (kind === 'grid') return `<div class="prod-grid">${'<div class="prod sk-card"><div class="sk" style="height:92px;border-radius:0"></div><div style="padding:10px">' + line('70%') + '<div style="height:8px"></div>' + line('40%') + '</div></div>'.repeat(8)}</div>`;
    if (kind === 'chart') return '<div class="sk" style="height:180px"></div>';
    return `<div class="sk-table">${('<div class="sk-row">' + line('18%') + line('22%') + line('14%') + line('10%') + '</div>').repeat(7)}</div>`;
  }
  function pageSkeleton() {
    return `<div class="page-head"><div class="sk" style="width:240px;height:18px"></div></div>
      <div class="grid stats">${Array(6).fill('<div class="stat"><div class="sk" style="width:50%;height:10px"></div><div class="sk" style="width:70%;height:22px;margin:12px 0 8px"></div><div class="sk" style="width:40%;height:10px"></div></div>').join('')}</div>
      <div class="grid cols-3" style="margin-top:14px"><div class="panel span-2"><div class="panel-body">${skeleton('chart')}</div></div><div class="panel"><div class="panel-body">${skeleton('chart')}</div></div></div>
      <div class="panel" style="margin-top:14px"><div class="panel-body">${skeleton('table')}</div></div>`;
  }
  const tabs = (items, active, attr) => `<div class="tabs">${items.map(t => `<button class="tab ${t.id === active ? 'on' : ''}" data-${attr || 'tab'}="${t.id}">${t.icon ? icon(t.icon) : ''}${esc(t.label)}${t.count != null ? `<span class="tab-count">${t.count}</span>` : ''}</button>`).join('')}</div>`;

  /* ---------- Filtre de période ---------- */
  const PERIODS = [['week', 'Semaine'], ['today', "Aujourd'hui"], ['month', 'Ce mois'], ['year', 'Cette année'], ['custom', 'Personnalisé']];
  function periodBar(st) {
    const wk = st.period === 'week' ? `<div class="week-nav"><button class="icon-btn sm" data-wk="-1" title="Semaine précédente">${icon('chevron-left')}</button><span>${esc(LSC.stats.weekLabel(LSC.stats.range('week', '', '', st.wk || 0)))}</span><button class="icon-btn sm" data-wk="1" title="Semaine suivante" ${(st.wk || 0) >= 0 ? 'disabled' : ''}>${icon('chevron-right')}</button></div>` : '';
    return `<div class="period">${wk}<div class="seg">${PERIODS.map(p => `<button class="seg-btn ${st.period === p[0] ? 'on' : ''}" data-period="${p[0]}">${p[1]}</button>`).join('')}</div>
      ${st.period === 'custom' ? `<input type="date" class="input sm" data-pfrom value="${st.from || ''}"><span class="muted">→</span><input type="date" class="input sm" data-pto value="${st.to || ''}">` : ''}</div>`;
  }
  function bindPeriod(root, st, draw) {
    const redraw = () => {
      const r = LSC.stats.range(st.period, st.from, st.to, st.wk), p = LSC.stats.prev(r);
      if (!(LSC.app && LSC.app.ensure && LSC.app.ensure(Math.min(r.from, p.from)))) draw();
    };
    root.querySelectorAll('[data-period]').forEach(b => b.onclick = () => {
      st.period = b.dataset.period; st.wk = 0;
      if (st.period === 'custom' && !st.from) { st.from = toInputDate(Date.now() - 29 * 864e5); st.to = toInputDate(Date.now()); }
      redraw();
    });
    root.querySelectorAll('[data-wk]').forEach(b => b.onclick = () => { st.wk = Math.min(0, (st.wk || 0) + +b.dataset.wk); redraw(); });
    const f = root.querySelector('[data-pfrom]'), t = root.querySelector('[data-pto]');
    if (f) f.onchange = () => { st.from = f.value; redraw(); };
    if (t) t.onchange = () => { st.to = t.value; redraw(); };
  }

  /* ---------- Graphique SVG (aire / barres) ----------
   * Dessiné à la taille réelle de son conteneur (texte net, hauteur fixe) et redessiné au redimensionnement. */
  let chartSeq = 0;
  const chartQueue = new Map(), chartBoxes = new Set();
  const chartRO = typeof ResizeObserver === 'function' ? new ResizeObserver(list => list.forEach(e => { const b = e.target; if (b._o && Math.abs(b.clientWidth - (b._w || 0)) > 2) drawChart(b); })) : null;
  function chart(o) {
    if (!o.labels.length) return empty({ icon: 'chart-line', title: 'Aucune donnée', hint: false });
    const id = 'ch' + (++chartSeq);
    chartQueue.set(id, o);
    setTimeout(flushCharts, 0);
    const legend = `<div class="legend">${o.series.map(se => `<span><i style="background:${se.color || 'var(--accent)'}"></i>${esc(se.name)}</span>`).join('')}</div>`;
    return `${legend}<div class="chart-box" data-chart="${id}" style="height:${o.height || 220}px"></div>`;
  }
  function flushCharts() {
    chartBoxes.forEach(b => { if (!b.isConnected) { if (chartRO) chartRO.unobserve(b); chartBoxes.delete(b); } });
    chartQueue.forEach((o, id) => {
      chartQueue.delete(id);
      const b = document.querySelector(`[data-chart="${id}"]`);
      if (!b) return;
      b._o = o; drawChart(b);
      if (chartRO) { chartRO.observe(b); chartBoxes.add(b); }
    });
  }
  /* pas « rond » : 1, 2, 2.5, 5 × 10^n */
  const niceStep = (range, n) => { const raw = range / n || 1, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
  function drawChart(box) {
    const o = box._o, W = box.clientWidth, H = box.clientHeight;
    box._w = W;
    if (W < 60 || H < 40) return;
    const n = o.labels.length, id = box.dataset.chart;
    const all = o.series.flatMap(s => s.values);
    let max = Math.max(0, ...all), min = Math.min(0, ...all);
    if (max === min) max = min + 1;
    const step = Math.max(o.money === false ? 1 : 0, niceStep(max - min, H < 170 ? 3 : 4));
    max = Math.ceil(max / step) * step; min = min < 0 ? -Math.ceil(-min / step) * step : 0;
    const fmt = o.money === false ? (v => short(v)) : (v => (v < 0 ? '-' : '') + '$' + short(Math.abs(v)));
    const ticks = [];
    for (let i = 0; min + i * step <= max + step / 2; i++) ticks.push(+(min + i * step).toFixed(6));
    const pl = Math.max(...ticks.map(v => fmt(v).length)) * 6.2 + 12, pr = 10, pt = 10, pb = 24;
    const iw = W - pl - pr, ih = H - pt - pb;
    const y = v => pt + ih * (1 - (v - min) / (max - min));
    const bar = o.type === 'bar', band = iw / n;
    const x = i => bar ? pl + band * i + band / 2 : pl + (n === 1 ? iw / 2 : i * iw / (n - 1));
    let g = '', defs = '';
    ticks.forEach(v => { g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="grid-line${v === 0 && min < 0 ? ' zero' : ''}"/><text x="${pl - 8}" y="${y(v) + 3.5}" class="ax" text-anchor="end">${fmt(v)}</text>`; });
    const every = Math.ceil(n / Math.max(2, Math.floor(iw / 58)));
    o.labels.forEach((l, i) => { if (i % every === 0 || (i === n - 1 && (n - 1) % every > every / 2)) g += `<text x="${x(i)}" y="${H - 7}" class="ax" text-anchor="${!bar && i === 0 ? 'start' : !bar && i === n - 1 ? 'end' : 'middle'}">${esc(l)}</text>`; });
    let s = '';
    o.series.forEach((se, si) => {
      const col = se.color || 'var(--accent)', gid = `${id}-${si}`;
      if (bar) {
        const k = o.series.length, bw = Math.max(3, Math.min(34, band * 0.62 / k));
        defs += `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${col}"/><stop offset="1" style="stop-color:${col};stop-opacity:.45"/></linearGradient>`
          + `<linearGradient id="${gid}n" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color:var(--danger)"/><stop offset="1" style="stop-color:var(--danger);stop-opacity:.45"/></linearGradient>`;
        se.values.forEach((v, i) => {
          const bx = x(i) - (bw * k) / 2 + bw * si, y0 = y(0), yv = y(v), neg = v < 0 && k === 1;
          s += `<rect class="bar" x="${bx + 1}" y="${Math.min(y0, yv)}" width="${bw - 2}" height="${Math.max(1, Math.abs(y0 - yv))}" rx="3" fill="url(#${gid}${neg ? 'n' : ''})"><title>${esc(o.labels[i])} — ${esc(se.name)} : ${fmt(v)}</title></rect>`;
        });
      } else {
        const pts = se.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
        if (si === 0 && o.type !== 'line') {
          defs += `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${col};stop-opacity:.32"/><stop offset="1" style="stop-color:${col};stop-opacity:0"/></linearGradient>`;
          s += `<polygon points="${x(0)},${y(Math.max(min, 0))} ${pts} ${x(n - 1)},${y(Math.max(min, 0))}" fill="url(#${gid})"/>`;
        }
        s += `<polyline class="line" points="${pts}" fill="none" style="stroke:${col}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" ${se.dash ? 'stroke-dasharray="5 5"' : ''}/>`;
        const dots = n <= 40;
        se.values.forEach((v, i) => { s += `<circle class="pt" cx="${x(i)}" cy="${y(v)}" r="${dots ? 3 : 6}" style="stroke:${col}" ${dots ? '' : 'fill="transparent" stroke-width="0"'}><title>${esc(o.labels[i])} — ${esc(se.name)} : ${o.money === false ? v : money(v)}</title></circle>`; });
      }
    });
    box.innerHTML = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"><defs>${defs}</defs>${g}${s}</svg>`;
  }
  /* barres horizontales simples */
  const hbars = (rows, fmt) => {
    const max = Math.max(1, ...rows.map(r => r.value));
    return rows.length ? `<div class="hbars">${rows.map(r => `<div class="hbar"><div class="hbar-top"><span>${esc(r.label)}</span><b>${(fmt || money)(r.value)}</b></div><div class="hbar-track"><i style="width:${Math.max(2, r.value / max * 100)}%;${r.color ? 'background:' + r.color : ''}"></i></div></div>`).join('')}</div>` : empty({ hint: false });
  };

  /* ---------- Popover ---------- */
  function popover(anchor, html, cls) {
    closePopover();
    const p = document.createElement('div');
    p.className = 'pop ' + (cls || '');
    p.innerHTML = html;
    document.body.appendChild(p);
    const r = anchor.getBoundingClientRect();
    p.style.top = (r.bottom + 8) + 'px';
    p.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    paint();
    setTimeout(() => document.addEventListener('mousedown', outside), 0);
    function outside(e) { if (!p.contains(e.target) && !anchor.contains(e.target)) closePopover(); }
    p._outside = outside;
    return p;
  }
  function closePopover() { const p = $('.pop'); if (p) { document.removeEventListener('mousedown', p._outside); p.remove(); return true; } return false; }

  /* Boutons d'action de ligne (data-a) dans un conteneur data-id.
   * Un seul écouteur par conteneur ; les handlers sont remplacés à chaque rendu. */
  function onActs(el, handlers) {
    el._acts = handlers;
    if (el._actsBound) return;
    el._actsBound = true;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'), h = el._acts;
      if (!b || !h || !h[b.dataset.a]) return;
      e.stopPropagation();
      const holder = b.closest('[data-id]');
      h[b.dataset.a](holder ? holder.dataset.id : null, b);
    });
  }
  const idCell = (id, html) => `<span data-id="${id}" class="acts">${html}</span>`;

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* copie (presse-papiers ; repli execCommand pour la NUI) */
  function copy(text) {
    const done = () => toast('Copié : ' + text);
    const old = () => { const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copie impossible', 'error'); } t.remove(); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, old); else old();
  }
  LSC.ui = { copy, $, esc, money, short, fmtDate, fmtTime, fmtDT, fmtDur, toInputDate, ago, icon, paint, avatar, badge, dot, status, opts, toast, modal, confirm: confirmBox, form, field, table, stat, panel, empty, skeleton, pageSkeleton, tabs, periodBar, bindPeriod, chart, hbars, popover, closePopover, download, onActs, idCell };
})();
