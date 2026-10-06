/* Shell de l'application : état partagé, routing, sidebar, header,
 * recherche globale (Ctrl+K), notifications, raccourcis, NUI. */
(function () {
  'use strict';
  const LSC = window.LSC, U = LSC.ui, { $, esc, icon, paint, money } = U;

  /* Pages (une route = une page). label = nom de l'onglet quand la page est regroupée. */
  const ROUTE_LIST = [
    { id: 'pos', label: 'Point de vente', icon: 'shopping-cart', perm: 'pos.use' },
    { id: 'home', label: 'Accueil', icon: 'house' },
    { id: 'mysales', label: 'Mes ventes', icon: 'chart-line', perm: 'sales.view_own' },
    { id: 'empstats', label: 'Bilan employé', icon: 'chart-column', perm: ['stats.own', 'stats.all'] },
    { id: 'bilan', label: 'Bilan', icon: 'chart-pie', perm: 'accounting.view' },
    { id: 'declaration', label: 'Déclaration', icon: 'file-spreadsheet', perm: 'accounting.view' },
    { id: 'sales', label: 'Toutes les ventes', icon: 'dollar-sign', perm: ['sales.view_all', 'accounting.view'] },
    { id: 'byproduct', label: 'Par produit', icon: 'chart-bar', perm: ['sales.view_all', 'accounting.view'] },
    { id: 'invoices', label: 'Factures partenaires', icon: 'receipt', perm: 'invoices.manage', badge: 'overdueInvoices' },
    { id: 'payroll', label: 'Salaires', icon: 'banknote', perm: 'payroll.manage' },
    { id: 'expenses', label: 'Commandes (frais)', icon: 'shopping-bag', perm: 'expenses.manage' },
    { id: 'bank', label: 'Compte bancaire', icon: 'landmark', perm: 'bank.view' },
    { id: 'staff', label: 'Liste', icon: 'users', perm: 'staff.view', badge: 'signups' },
    { id: 'warnings', label: 'Avertissements', icon: 'megaphone', perm: ['warnings.manage', 'staff.view'] },
    { id: 'dismiss', label: 'Licenciement', icon: 'user-x', perm: 'staff.manage' },
    { id: 'archives', label: 'Archives', icon: 'archive', perm: 'staff.view' },
    { id: 'absences', label: 'Absences', icon: 'calendar-off', perm: ['service.self', 'staff.view'] },
    { id: 'service', label: 'Services', icon: 'timer', perm: 'service.self' },
    { id: 'inventory', label: 'Stock', icon: 'boxes', perm: ['inventory.manage', 'stock.move'], badge: 'lowStock' },
    { id: 'roles', label: 'Rôles & permissions', icon: 'shield-check', perm: 'roles.manage' },
    { id: 'settings', label: 'Paramètres', icon: 'settings', perm: 'settings.manage' },
    { id: 'audit', label: 'Historique', icon: 'history', perm: 'audit.view' },
    { id: 'account', label: 'Mon compte', icon: 'circle-user-round' }
  ];
  const ROUTES = {};
  ROUTE_LIST.forEach(r => { ROUTES[r.id] = r; });
  /* Menu simplifié : les pages proches sont regroupées et affichées en onglets */
  const NAV = [
    { title: 'Dashboard', items: [
      { label: 'Point de vente', icon: 'shopping-cart', routes: ['pos'] },
      { label: 'Accueil', icon: 'house', routes: ['home'] },
      { label: 'Mon activité', icon: 'chart-line', routes: ['mysales', 'empstats'] }] },
    { title: 'Comptabilité', items: [
      { label: 'Bilan', icon: 'chart-pie', routes: ['bilan', 'declaration'] },
      { label: 'Ventes', icon: 'dollar-sign', routes: ['sales', 'byproduct'] },
      { label: 'Factures', icon: 'receipt', routes: ['invoices'] },
      { label: 'Salaires & frais', icon: 'banknote', routes: ['payroll', 'expenses'] },
      { label: 'Compte bancaire', icon: 'landmark', routes: ['bank'] }] },
    { title: 'Ressources humaines', items: [
      { label: 'Personnel', icon: 'users', routes: ['staff', 'absences', 'warnings', 'archives'] },
      { label: 'Licenciement', icon: 'user-x', routes: ['dismiss'] },
      { label: 'Services', icon: 'timer', routes: ['service'] }] },
    { title: 'Mon entreprise', items: [
      { label: 'Stock', icon: 'boxes', routes: ['inventory'] },
      { label: 'Rôles & permissions', icon: 'shield-check', routes: ['roles'] },
      { label: 'Paramètres', icon: 'settings', routes: ['settings', 'audit'] }] }
  ];
  const groupOf = route => { for (const s of NAV) for (const i of s.items) if (i.routes.includes(route)) return i; return null; };

  const App = LSC.app = {
    state: null, me: null, perms: [], permissions: [], route: 'home', onTick: null, loadedFrom: 0, oldest: 0,
    /* Données plus anciennes que la fenêtre chargée : récupérées mois par mois puis la page est redessinée.
     * Renvoie true si un chargement est lancé (la page se redessine toute seule ensuite). */
    ensure(from) {
      from = Math.max(+from || 0, this.oldest || 0);
      if (!(from < this.loadedFrom) || this._loading) return !!this._loading;
      this._loading = (async () => {
        let cur = this.loadedFrom;
        while (cur > from) {
          const a = Math.max(from, cur - 31 * 864e5);
          const r = await LSC.api.call('rows.range', { from: a, to: cur });
          if (!r.ok) { U.toast(r.error || 'Chargement de l’historique impossible', 'error'); cur = from; break; }
          apply(Object.assign(r, { merge: true }));
          cur = a;
        }
        this.loadedFrom = Math.min(this.loadedFrom, cur);
        this._loading = null;
        this.render();
      })();
      return true;
    },
    /* historique (audit) plus ancien : chargé séparément car c'est la plus grosse collection */
    async moreAudit(days) {
      if (!(this.auditFrom > this.oldest)) return;
      const to = this.auditFrom, from = Math.max(this.oldest, to - (days || 30) * 864e5);
      const r = await LSC.api.call('rows.range', { from, to, kinds: ['audit'] });
      if (!r.ok) return U.toast(r.error || 'Chargement impossible', 'error');
      apply(Object.assign(r, { merge: true }));
      this.auditFrom = from; this.render();
    },
    can(p) { const ps = Array.isArray(p) ? p : [p]; return this.perms.includes('*') || ps.some(x => this.perms.includes(x)); },
    allowed(route) { const r = ROUTES[route]; return !!r && (!r.perm || this.can(r.perm)); },
    meEmp() { return this.state.employees.find(e => e.id === this.me.id); },
    myRole() { return this.state.roles.find(r => r.id === this.me.roleId) || { name: '—', commission: 0 }; },
    emp(id) { return this.state.employees.find(e => e.id === id); },
    empName(id) { const e = this.emp(id); return e ? e.name : '—'; },
    roleName(id) { const r = this.state.roles.find(x => x.id === id); return r ? r.name : '—'; },
    customer(id) { return this.state.customers.find(c => c.id === id); },
    product(id) { return this.state.products.find(p => p.id === id); },
    catLabel(id) { const c = this.state.company.categories.find(x => x.id === id); return c ? c.label : 'Autres'; },
    payLabel(id) { const m = this.state.company.paymentMethods.find(x => x.id === id); return m ? m.label : id; },
    /* Appel serveur + rafraîchissement global (toutes les pages partagent l'état) */
    async call(action, payload, okMsg) {
      const r = await LSC.api.call(action, payload);
      if (r && r.needLogin) { showLogin('Session expirée : reconnectez-vous.'); return r; }
      if (!r || !r.ok) { U.toast((r && r.error) || "Erreur lors de l'enregistrement", 'error'); return r || { ok: false }; }
      apply(r);
      if (okMsg) U.toast(okMsg);
      this.render();
      return r;
    },
    render() { renderChrome(); renderPage(false); },
    go(route, opts) {
      if (!this.allowed(route)) { U.toast("Vous n'avez pas les permissions nécessaires", 'error'); return; }
      this.onTick = null;
      this.route = route;
      LSC.api.lastRoute(route, this.me && this.me.id); LSC.api.touch();
      if (location.hash.slice(1) !== route) history.replaceState(null, '', '#' + route);
      renderChrome(); renderPage(true);
      if (opts && opts.then) opts.then();
    }
  };

  /* ---------- thèmes : choix perso (gardé dans le navigateur), sinon thème par défaut de l'entreprise ---------- */
  const THEMES = [
    { id: 'dark', name: 'Sombre', c: '#1fd1a5', b: '#0c1215' },
    { id: 'light', name: 'Clair', c: '#0d9e7c', b: '#eef2f4' },
    { id: 'halloween', name: 'Halloween', c: '#ff8a1f', b: '#120d17' },
    { id: 'noel', name: 'Noël', c: '#e6404c', b: '#0a1714' },
    { id: 'rose', name: 'Rose', c: '#ff5fa2', b: '#150d12' },
    { id: 'rouge', name: 'Rouge', c: '#ff4d5a', b: '#150c0c' },
    { id: 'bleu', name: 'Bleu', c: '#4ba3ff', b: '#0b1018' },
    { id: 'violet', name: 'Violet', c: '#a77bff', b: '#110d18' },
    { id: 'or', name: 'Doré', c: '#f2c14e', b: '#14110a' }
  ];
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  const DECO = {
    halloween: () => '<span class="d-web" style="left:calc(var(--sb) - 10px);top:calc(var(--top) - 10px)">🕸️</span><span class="d-web" style="right:-10px;bottom:-12px;transform:scaleX(-1)">🕸️</span>'
      + [[24, 70], [47, 44], [71, 92]].map(([x, l], i) => `<span class="d-spider" style="left:${x}%;--len:${l}px;top:calc(var(--top) + ${l}px);animation-delay:-${i * 1.7}s">🕷️</span>`).join('')
      + [0, 8, 15].map((d, i) => `<span class="d-bat" style="top:${16 + i * 11}%;animation-delay:${d}s">🦇</span>`).join('')
      + '<span class="d-badge">🎃</span><span class="d-ghost">👻</span>',
    noel: () => '<span class="d-garland"></span>'
      + Array.from({ length: 16 }, (_, i) => `<span class="d-snow" style="left:${(i * 6.3 + 3) % 100}%;font-size:${9 + (i * 7) % 9}px;animation-duration:${11 + (i * 5) % 9}s;animation-delay:-${(i * 2.3) % 14}s;--dx:${(i % 2 ? 1 : -1) * (20 + i * 3)}px">❄</span>`).join('')
      + '<span class="d-badge">🎄</span>'
  };
  const Theme = LSC.theme = {
    list: THEMES,
    pref: () => store('lsc_theme') || 'auto',
    deco: () => store('lsc_deco') !== '0',
    company: () => (App.state && App.state.company.theme) || store('lsc_theme_co') || 'dark',
    current() { const p = Theme.pref(), co = Theme.company(); return THEMES.some(t => t.id === p) ? p : THEMES.some(t => t.id === co) ? co : 'dark'; },
    apply() {
      const id = Theme.current(), el = document.getElementById('deco');
      document.documentElement.dataset.theme = id;
      if (el) el.innerHTML = Theme.deco() && DECO[id] ? DECO[id]() : '';
    },
    set(p) { store('lsc_theme', p); Theme.apply(); },
    toggleDeco() { store('lsc_deco', Theme.deco() ? '0' : '1'); Theme.apply(); }
  };

  /* Réponse serveur : état complet (démarrage, mode local) ou fusion (le serveur n'envoie que
   * le document principal + les lignes modifiées / la période demandée). */
  const ROWS = LSCServer.ROWS;
  function apply(r) {
    if (!r.state) return;
    if (r.merge && App.state) {
      const prev = App.state, next = r.state;
      Object.keys(ROWS).forEach(k => {
        const f = ROWS[k], map = new Map((prev[k] || []).map(x => [x.id, x]));
        (next[k] || []).forEach(x => map.set(x.id, x));
        ((r.removed || {})[k] || []).forEach(id => map.delete(id));
        next[k] = [...map.values()].sort((a, b) => String(a[f]).localeCompare(String(b[f])));
      });
      App.state = next;
    } else { App.state = r.state; App.loadedFrom = r.from || 0; App.auditFrom = r.auditFrom || App.loadedFrom; App.oldest = r.oldest || 0; }
    const th = App.state.company.theme || 'dark';
    if (th !== store('lsc_theme_co')) store('lsc_theme_co', th);
    if (document.documentElement.dataset.theme !== Theme.current()) Theme.apply();
    App.me = r.me; App.perms = r.me.perms; App.permissions = r.permissions || App.permissions;
  }

  /* ---------- rendu ---------- */
  function badges() {
    const S = App.state, ST = LSC.stats, out = {};
    out.overdueInvoices = S.invoices.filter(i => ST.invoiceStatus(i) === 'overdue').length;
    out.lowStock = S.inventory.filter(i => i.qty <= i.min).length;
    out.signups = (S.signups || []).length;
    return out;
  }
  function renderChrome() {
    const S = App.state, co = S.company, me = App.meEmp(), role = App.myRole(), b = badges();
    $('#brandName').textContent = co.name;
    $('#brandSub').textContent = co.subtitle;
    $('#brandLogo').innerHTML = co.logo ? `<img src="${esc(co.logo)}" alt="${esc(co.name)}" onerror="this.parentNode.classList.remove('img');this.parentNode.textContent='LS'">` : 'LS';
    $('#brandLogo').classList.toggle('img', !!co.logo);
    $('#sidebar').innerHTML = NAV.map(sec => {
      const items = sec.items.map(i => Object.assign({ ok: i.routes.filter(r => App.allowed(r)) }, i)).filter(i => i.ok.length);
      if (!items.length) return '';
      return `<div class="nav-sec"><div class="nav-title">${esc(sec.title)}</div>${items.map(i => {
        const n = i.ok.reduce((a, r) => a + (ROUTES[r].badge ? b[ROUTES[r].badge] || 0 : 0), 0);
        const target = i.ok.includes(App.route) ? App.route : i.ok[0];
        return `<button class="nav-item ${i.ok.includes(App.route) ? 'on' : ''}" data-route="${target}" title="${esc(i.label)}">${icon(i.icon)}<span>${esc(i.label)}</span>${n ? `<span class="nav-badge">${n}</span>` : ''}</button>`;
      }).join('')}</div>`;
    }).join('') + `<button class="side-user" data-route="account" title="Mon compte">${U.avatar(me.name)}<div><b>${esc(me.name)}</b><span>${esc(role.name)}</span></div>${icon('settings', 'sm')}</button>`;
    renderService();
    $('#userBtn').innerHTML = `${U.avatar(me.name)}<div><b>${esc(me.name)}</b><span class="role">${esc(role.name)}</span></div>${icon('chevron-down', 'sm')}`;
    const unread = S.notifications.filter(n => !n.read).length;
    $('#bellCount').hidden = !unread; $('#bellCount').textContent = unread;
    const onPos = App.route === 'pos';
    $('#topSearch').placeholder = onPos ? 'Rechercher un service, un produit...' : 'Rechercher partout (employés, ventes, clients...)';
    if (!onPos && document.activeElement !== $('#topSearch')) $('#topSearch').value = '';
    $('#topPartner').innerHTML = onPos ? `<select class="input" id="partnerSel"><option value="">Aucun partenaire</option>${U.opts(S.partners.map(p => ({ value: p.id, label: p.name })), LSC.pages.pos.partnerId())}</select>` : '';
    const ps = $('#partnerSel');
    if (ps) ps.onchange = () => LSC.pages.pos.setPartner(ps.value);
    paint();
  }
  function renderPage(enter) {
    const main = $('#main');
    if (!App.allowed(App.route)) App.route = App.allowed('pos') ? 'pos' : 'home';
    const page = LSC.pages[App.route];
    const scroll = main.scrollTop;
    main.className = 'main route-' + App.route + (enter ? ' enter' : '');
    /* onglets du groupe (ex. Factures : Clients | Fournisseurs), hors du conteneur de page */
    const g = groupOf(App.route), ok = g ? g.routes.filter(r => App.allowed(r)) : [], b = badges();
    main.innerHTML = (ok.length > 1 ? `<div class="page-tabs">${ok.map(r => { const x = ROUTES[r], n = x.badge ? b[x.badge] : 0; return `<button class="ptab ${r === App.route ? 'on' : ''}" data-route="${r}">${icon(x.icon)}${esc(x.label)}${n ? `<span class="nav-badge">${n}</span>` : ''}</button>`; }).join('')}</div>` : '') + '<div class="page" id="page"></div>';
    const el = $('#page');
    try { page.render(el); }
    catch (e) { console.error(e); el.innerHTML = U.empty({ icon: 'bug', title: "Erreur d'affichage", text: e.message, hint: false }); }
    main.scrollTop = enter ? 0 : scroll;
    paint();
  }

  /* ---------- horloge / tick ---------- */
  function tick() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    $('#clock').innerHTML = `<b>${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}</b>${p(d.getHours())}:${p(d.getMinutes())}`;
    const t = $('#svcTime'), s = App.state && mySession();
    if (t && s) t.textContent = hms(sessionSeconds(s));
    if (App.onTick) try { App.onTick(); } catch (e) { App.onTick = null; }
  }

  /* ---------- prise de service (minuteur des heures de travail) ---------- */
  const mySession = () => App.state.sessions.find(x => x.employeeId === App.me.id && !x.end);
  const isPaused = s => !!(s && s.pauses && s.pauses.length && !s.pauses[s.pauses.length - 1].end);
  function sessionSeconds(s) {
    const now = Date.now();
    let ms = now - Date.parse(s.start);
    (s.pauses || []).forEach(z => { ms -= (z.end ? Date.parse(z.end) : now) - Date.parse(z.start); });
    return Math.max(0, Math.floor(ms / 1000));
  }
  const hms = sec => [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map(n => String(n).padStart(2, '0')).join(':');
  function renderService() {
    const b = $('#svcBtn');
    b.hidden = !App.can('service.self');
    if (b.hidden) return;
    const s = mySession(), paused = isPaused(s);
    b.className = 'svc-btn ' + (s ? (paused ? 'pause' : 'on') : 'off');
    b.title = s ? 'Gérer mon service' : 'Prendre son service';
    b.innerHTML = s ? `${U.dot(paused ? 'warn' : 'ok')}<span><small>${paused ? 'En pause' : 'En service'}</small><b id="svcTime">${hms(sessionSeconds(s))}</b></span>`
      : `${icon('play')}<span>Prise de service</span>`;
  }
  async function serviceClick() {
    const s = mySession();
    if (!s) { await App.call('service.start', {}, 'Service commencé — le minuteur tourne'); return; }
    const paused = isPaused(s);
    const p = U.popover($('#svcBtn'), `<div class="pop-head"><span>${paused ? 'En pause' : 'En service'} depuis ${U.fmtTime(s.start)}</span></div>
      <button class="pop-item" data-svc="pause">${icon(paused ? 'play' : 'pause')}<span><b>${paused ? 'Reprendre le service' : 'Faire une pause'}</b><small>Le temps de pause n'est pas compté</small></span></button>
      <button class="pop-item" data-svc="end">${icon('square')}<span><b>Terminer le service</b><small>Les heures sont enregistrées pour la paie</small></span></button>
      <button class="pop-item" data-svc="page">${icon('timer')}<span><b>Mes services</b><small>Historique des heures</small></span></button>`, 'narrow');
    p.addEventListener('click', async e => {
      const a = e.target.closest('[data-svc]');
      if (!a) return;
      U.closePopover();
      if (a.dataset.svc === 'page') App.go('service');
      else if (a.dataset.svc === 'pause') App.call('service.pause', {}, paused ? 'Service repris' : 'Pause commencée');
      else App.call('service.end', {}, 'Service terminé — heures enregistrées');
    });
  }

  /* ---------- annonce publicitaire (Advert) : textes prêts à copier ---------- */
  function copyText(text) {
    const ok = () => U.toast('Copié dans le presse-papiers');
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { U.toast('Copie impossible', 'error'); }
      ta.remove();
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
  }
  function openAdvert(index) {
    const list = App.state.company.adverts || [];
    let i = Math.min(index || 0, Math.max(0, list.length - 1));
    const edit = App.can('settings.manage');
    const m = U.modal({ title: 'Annonce publicitaire', icon: 'megaphone', size: 'sm advert', body: '<div id="advBody"></div>',
      foot: edit ? `<button class="btn sm ghost" data-adv="new">${icon('plus')}Nouvelle</button><span class="grow"></span><button class="btn sm" data-adv="edit">${icon('pencil')}Modifier</button>` : '' });
    const draw = () => {
      const a = list[i];
      const fields = a ? [['Titre', a.title], ['Image', a.image], ['Message', a.message]] : [];
      m.el.querySelector('#advBody').innerHTML = (list.length > 1 ? `<div class="sub-tabs">${list.map((x, k) => `<button class="chip ${k === i ? 'on' : ''}" data-advtab="${k}">${esc(x.label || 'Annonce ' + (k + 1))}</button>`).join('')}</div>` : '')
        + (a ? fields.map((f, k) => `<div class="adv-box"><div><b>${f[0]}:</b> ${esc(f[1] || '—')}</div><button class="icon-btn" data-copy="${k}" title="Copier">${icon('copy')}</button></div>`).join('')
          : U.empty({ icon: 'megaphone', title: 'Aucune annonce', text: 'Créez une annonce publicitaire.', hint: false }));
      paint();
      m.copy = k => copyText(fields[k][1] || '');
    };
    m.el.addEventListener('click', e => {
      const c = e.target.closest('[data-copy]'), t = e.target.closest('[data-advtab]'), a = e.target.closest('[data-adv]');
      if (c) m.copy(+c.dataset.copy);
      else if (t) { i = +t.dataset.advtab; draw(); }
      else if (a) { m.close(); advertForm(a.dataset.adv === 'new' ? -1 : i); }
    });
    draw();
  }
  function advertForm(i) {
    const list = (App.state.company.adverts || []).slice(), a = list[i];
    U.form({ title: a ? 'Modifier l’annonce' : 'Nouvelle annonce', icon: 'megaphone', values: a || { label: 'Annonce ' + (list.length + 1) },
      fields: [{ name: 'label', label: 'Nom (onglet)', full: true, placeholder: 'Ouvert, Fermé, Promo...' },
        { name: 'title', label: 'Titre', required: true, full: true, hint: 'Les codes couleur du jeu (~p~, ~g~...) sont conservés.' },
        { name: 'image', label: 'Image (URL)', full: true }, { name: 'message', label: 'Message', type: 'textarea', rows: 4, required: true, full: true }],
      extraFoot: a ? `<button class="btn danger" data-advdel>${icon('trash-2')}Supprimer</button>` : '',
      onMount: m => { const d = m.el.querySelector('[data-advdel]'); if (d) d.onclick = async () => { list.splice(i, 1); const r = await App.call('settings.save', { company: { adverts: list } }, 'Annonce supprimée'); if (r.ok) m.close(); }; },
      onSubmit: async v => {
        if (a) list[i] = Object.assign({}, a, v); else list.push(v);
        const r = await App.call('settings.save', { company: { adverts: list } }, 'Annonce enregistrée');
        if (r.ok) setTimeout(() => openAdvert(a ? i : list.length - 1), 0);
        return r;
      } });
  }

  /* ---------- notifications ---------- */
  const NICON = { lowStock: 'package-x', overdue: 'clock-alert', signup: 'user-plus', lock: 'lock', archive: 'archive', payment: 'circle-dollar-sign', service: 'timer-off', largeSale: 'trending-up' };
  function openBell() {
    const list = App.state.notifications.slice().reverse();
    const unread = list.filter(n => !n.read).length;
    const p = U.popover($('#bellBtn'), `<div class="pop-head"><span>${unread ? unread + ' nouvelle' + (unread > 1 ? 's' : '') + ' notification' + (unread > 1 ? 's' : '') : 'Notifications'}</span>${unread ? '<button class="btn sm ghost" data-readall>Tout marquer lu</button>' : ''}</div>
      ${list.length ? list.slice(0, 30).map(n => `<button class="pop-item ${n.read ? '' : 'unread'}" data-n="${n.id}"><span class="li-ic ${n.level}">${icon(NICON[n.type] || 'bell')}</span><span style="min-width:0"><b>${esc(n.title)}</b><small>${esc(n.body)}</small><small class="faint">${U.ago(n.at)}</small></span>${n.read ? '' : U.dot('ok')}</button>`).join('') : U.empty({ icon: 'bell-off', title: 'Aucune notification', text: 'Vous êtes à jour.', hint: false })}`);
    p.addEventListener('click', async e => {
      if (e.target.closest('[data-readall]')) { U.closePopover(); await App.call('notifications.read', {}); return; }
      const it = e.target.closest('[data-n]');
      if (!it) return;
      const n = App.state.notifications.find(x => x.id === it.dataset.n);
      U.closePopover();
      if (n && !n.read) await App.call('notifications.read', { id: n.id });
      if (n && n.route && App.allowed(n.route)) App.go(n.route);
    });
  }

  /* ---------- menu utilisateur ---------- */
  function openUser() {
    const me = App.meEmp();
    const p = U.popover($('#userBtn'), `<div class="pop-head"><span>${esc(me.name)}</span>${U.status('staff', me.status)}</div>
      ${App.can('service.self') ? `<button class="pop-item" data-act="service">${icon('timer')}<span><b>Services</b><small>Prendre / terminer son service</small></span></button>` : ''}
      <button class="pop-item" data-act="account">${icon('circle-user-round')}<span><b>Mon compte</b><small>Photo, identifiants, compte bancaire</small></span></button>
      <button class="pop-item" data-act="theme">${icon('palette')}<span><b>Thème</b><small>${esc(THEMES.find(t => t.id === Theme.current()).name)}${Theme.pref() === 'auto' ? ' (entreprise)' : ''}</small></span></button>
      ${App.can(['stats.own', 'stats.all']) ? `<button class="pop-item" data-act="stats">${icon('chart-column')}<span><b>Mon bilan</b><small>Ventes, commissions, heures</small></span></button>` : ''}
      ${LSC.api.mode !== 'nui' ? `<button class="pop-item" data-act="logout">${icon('log-out')}<span><b>Déconnexion</b></span></button>` : ''}
      ${LSC.api.mode === 'nui' ? `<button class="pop-item" data-act="close">${icon('x')}<span><b>Fermer la tablette</b></span></button>` : ''}`, 'narrow');
    p.addEventListener('click', async e => {
      const act = e.target.closest('[data-act]');
      U.closePopover();
      if (act) {
        const a = act.dataset.act;
        if (a === 'service') App.go('service');
        else if (a === 'stats') App.go('empstats');
        else if (a === 'account') App.go('account');
        else if (a === 'theme') setTimeout(openTheme, 0);
        else if (a === 'logout') LSC.api.logout();
        else if (a === 'close') LSC.api.close();
      }
    });
  }

  function openTheme() {
    const pref = Theme.pref(), co = THEMES.find(t => t.id === Theme.company()) || THEMES[0];
    const opt = (id, name, t) => `<button class="theme-opt ${id === 'auto' ? 'auto' : ''} ${pref === id ? 'on' : ''}" data-th="${id}"><i style="background:linear-gradient(135deg, ${t.b} 50%, ${t.c} 50%)"></i><span>${esc(name)}</span></button>`;
    const p = U.popover($('#userBtn'), `<div class="pop-head"><span>Thème</span></div>
      <div class="theme-list">${opt('auto', 'Auto — ' + co.name + ' (thème de l\'entreprise)', co)}${THEMES.map(t => opt(t.id, t.name, t)).join('')}</div>
      <label class="check" style="padding:2px 12px 12px"><input type="checkbox" data-deco ${Theme.deco() ? 'checked' : ''}><span>Décorations (Halloween, Noël)</span></label>`, 'narrow');
    p.addEventListener('click', e => { const b = e.target.closest('[data-th]'); if (!b) return; Theme.set(b.dataset.th); p.querySelectorAll('[data-th]').forEach(x => x.classList.toggle('on', x === b)); });
    p.addEventListener('change', e => { if (e.target.matches('[data-deco]')) Theme.toggleDeco(); });
  }

  /* ---------- recherche globale (Ctrl+K) ---------- */
  function openPalette(initial) {
    if (U.modal.top() && U.modal.top().palette) return;
    const m = U.modal({ title: 'Recherche globale', icon: 'search', size: 'lg palette', body: `<div class="palette-in">${icon('search')}<input id="palIn" placeholder="Employés, clients, ventes, factures, produits, partenaires, transactions..." autofocus value="${esc(initial || '')}"></div><div class="palette-res" id="palRes"></div>` });
    m.palette = true;
    const input = m.el.querySelector('#palIn'), res = m.el.querySelector('#palRes');
    let items = [], sel = 0;
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      items = q.length < 1 ? [] : search(q);
      sel = 0;
      if (!q) { res.innerHTML = U.empty({ icon: 'search', title: 'Que cherchez-vous ?', text: 'Tapez un nom, un numéro de vente (#184), un ID joueur, un téléphone...', hint: false }); paint(); return; }
      if (!items.length) { res.innerHTML = U.empty({ icon: 'search-x', title: 'Aucun résultat', text: 'Essayez avec un autre terme.', hint: false }); paint(); return; }
      let last = '';
      res.innerHTML = items.map((it, i) => { const h = it.group !== last ? `<div class="pop-sec">${esc(it.group)}</div>` : ''; last = it.group; return h + `<button class="pop-item ${i === 0 ? 'sel' : ''}" data-i="${i}">${it.lead}<span style="min-width:0"><b>${esc(it.title)}</b><small>${esc(it.sub)}</small></span></button>`; }).join('');
      paint();
    };
    const pick = i => { const it = items[i]; if (!it) return; m.close(); it.open(); };
    input.addEventListener('input', draw);
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); sel = Math.max(0, Math.min(items.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
        res.querySelectorAll('.pop-item').forEach((b, i) => b.classList.toggle('sel', i === sel));
        const b = res.querySelector('.pop-item.sel'); if (b) b.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
    });
    res.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) pick(+b.dataset.i); });
    m.submit = () => pick(sel);
    draw();
  }
  function search(q) {
    const S = App.state, out = [], has = (...v) => v.some(x => String(x || '').toLowerCase().includes(q));
    const lead = n => `<span class="li-ic">${icon(n)}</span>`;
    const push = (group, list, max) => list.slice(0, max || 5).forEach(x => out.push(Object.assign({ group }, x)));
    push('Employés', S.employees.filter(e => has(e.name, e.charId, e.discordId, e.bankAccount)).map(e => ({ lead: U.avatar(e.name), title: e.name, sub: `${App.roleName(e.roleId)} · Char ID ${e.charId || '—'}${e.archived ? ' · archivé' : ''}`, open: () => LSC.open.employee(e.id) })));
    push('Ventes', S.sales.filter(s => has('#' + s.num, s.ref, s.customerName, s.employeeName)).slice().reverse().map(s => ({ lead: lead('receipt'), title: `#${s.ref} — ${money(s.total)}`, sub: `${s.customerName} · ${s.employeeName} · ${U.fmtDT(s.createdAt)}`, open: () => LSC.open.sale(s.id) })));
    push('Factures', S.invoices.filter(i => has(i.ref, i.customerName)).map(i => ({ lead: lead('file-text'), title: `${i.ref} — ${money(i.total)}`, sub: i.customerName, open: () => LSC.open.invoice(i.id) })));
    push('Produits', S.products.filter(p => has(p.name, p.description)).map(p => ({ lead: lead(p.icon || 'wrench'), title: p.name, sub: `${App.catLabel(p.category)} · ${money(p.price)}`, open: () => LSC.open.product(p.id) })));
    push('Partenaires', S.partners.filter(p => has(p.name, p.contact)).map(p => ({ lead: lead('handshake'), title: p.name, sub: p.contact || p.type, open: () => App.go('invoices') })));
    push('Transactions', S.bank.filter(t => has(t.label, String(t.amount))).slice().reverse().map(t => ({ lead: lead(t.type === 'in' ? 'arrow-down-left' : 'arrow-up-right'), title: `${t.type === 'in' ? '+' : '-'}${money(t.amount)} — ${t.label}`, sub: U.fmtDT(t.at), open: () => LSC.open.transaction(t.id) })));
    return out;
  }

  /* ---------- connexion (mode http) ---------- */
  /* ---------- connexion (Char ID + mot de passe), session de 1 h ---------- */
  /* ---------- connexion (Char ID + mot de passe), session de 1 h ; création de compte ---------- */
  function showLogin(msg, mode, charId) {
    U.closePopover();
    while (U.modal.top()) U.modal.top().close();
    App.state = null;
    document.body.classList.add('locked');
    let ov = document.getElementById('login');
    if (!ov) { ov = document.createElement('div'); ov.id = 'login'; ov.className = 'login-screen'; document.body.appendChild(ov); }
    const reg = mode === 'register', np = mode === 'newpwd', link = mode === 'link';
    const fld = (name, label, type, extra) => `<label class="field"><span class="field-label">${label}</span><input class="input" name="${name}" type="${type || 'text'}" ${extra || ''}></label>`;
    ov.innerHTML = `<form class="login-card" autocomplete="on">
        <div class="logo img"><img src="img/logo.png" alt=""></div>
        <h1>Los Santos Customs</h1><p class="muted">${reg ? 'Créer un compte employé' : np ? 'Nouveau mot de passe' : link ? 'Relier mon compte' : 'Management & Comptabilité'}</p>
        ${msg ? `<div class="alert ${mode === 'sent' ? 'ok' : 'warn'}">${icon(mode === 'sent' ? 'check-circle' : np ? 'key-round' : link ? 'link' : 'shield-alert')}<span>${esc(msg)}</span></div>` : ''}
        ${reg ? `<div class="login-row">${fld('firstName', 'Prénom *', 'text', 'required maxlength="30"')}${fld('lastName', 'Nom *', 'text', 'required maxlength="30"')}</div>
        ${fld('charId', 'Char ID *', 'text', 'required maxlength="30" autocomplete="username"')}
        ${fld('password', 'Mot de passe * (6 caractères min.)', 'password', 'required minlength="6" autocomplete="new-password"')}
        ${fld('password2', 'Confirmer le mot de passe *', 'password', 'required autocomplete="new-password"')}
        <small class="login-note">${icon('shield-alert')}N'utilisez pas un vrai mot de passe (e-mail, Discord, banque…) : choisissez-en un uniquement pour ce serveur RP.</small>
        <div class="login-row">${fld('discordId', 'Discord ID', 'text', 'inputmode="numeric" maxlength="25"')}${fld('bankAccount', 'N° de compte bancaire', 'text', 'maxlength="40"')}</div>
        <button class="btn primary block" type="submit">${icon('user-plus')}Envoyer la demande</button>
        <small class="muted">Le compte sera actif après validation par la direction (grade Apprenti).</small>
        <button class="btn ghost block" type="button" data-mode="login">${icon('arrow-left')}J'ai déjà un compte</button>`
      : np ? `${fld('charId', 'Char ID', 'text', 'readonly autocomplete="username"')}
        ${fld('password', 'Nouveau mot de passe (6 caractères min.)', 'password', 'required minlength="6" autocomplete="new-password"')}
        ${fld('password2', 'Confirmer le mot de passe', 'password', 'required autocomplete="new-password"')}
        <small class="login-note">${icon('shield-alert')}N'utilisez pas un vrai mot de passe (e-mail, Discord, banque…) : choisissez-en un uniquement pour ce serveur RP.</small>
        <button class="btn primary block" type="submit">${icon('key-round')}Enregistrer et se connecter</button>
        <button class="btn ghost block" type="button" data-mode="login">${icon('arrow-left')}Retour</button>`
      : `${fld('charId', 'Char ID', 'text', 'required autocomplete="username"')}
        ${fld('password', 'Mot de passe', 'password', 'required autocomplete="current-password"')}
        <button class="btn primary block" type="submit">${icon(link ? 'link' : 'log-in')}${link ? 'Relier mon compte' : 'Se connecter'}</button>
        <button class="btn ghost block" type="button" data-mode="register">${icon('user-plus')}Créer un compte</button>`}
      </form>`;
    paint();
    const f = ov.querySelector('form'), el = f.elements;
    if (charId) el.charId.value = charId;
    setTimeout(() => (reg ? el.firstName : charId ? el.password : el.charId).focus(), 30);
    const enter = () => { ov.remove(); document.body.classList.remove('locked'); history.replaceState(null, '', '#pos'); boot(); };
    f.querySelector('[data-mode]').onclick = e => showLogin('', e.currentTarget.dataset.mode, el.charId.value.trim());
    f.onsubmit = async e => {
      e.preventDefault();
      const btn = f.querySelector('button[type=submit]');
      if (reg) {
        if (el.password.value !== el.password2.value) return U.toast('Les mots de passe ne correspondent pas', 'error');
        const v = { firstName: el.firstName.value.trim(), lastName: el.lastName.value.trim(), charId: el.charId.value.trim(), password: el.password.value, discordId: el.discordId.value.trim(), bankAccount: el.bankAccount.value.trim() };
        btn.disabled = true;
        const r = await LSC.api.call('auth.register', v);
        btn.disabled = false;
        if (!r.ok) return U.toast(r.error || 'Création impossible', 'error');
        return showLogin(r.first ? `Premier compte créé avec le grade ${r.role} : connectez-vous.` : 'Demande envoyée : vous pourrez vous connecter dès que la direction aura validé votre compte.', 'sent', v.charId);
      }
      if (np) {
        if (el.password.value !== el.password2.value) return U.toast('Les mots de passe ne correspondent pas', 'error');
        btn.disabled = true;
        const r = await LSC.api.call('auth.setPassword', { charId: el.charId.value.trim(), password: el.password.value });
        btn.disabled = false;
        if (!r.ok) return U.toast(r.error || 'Enregistrement impossible', 'error');
        return enter();
      }
      btn.disabled = true;
      const id = el.charId.value.trim(), r = await LSC.api.call('auth.login', { charId: id, password: el.password.value });
      btn.disabled = false;
      if (r.needNewPassword) return showLogin('Votre mot de passe a été réinitialisé (ou pas encore défini) : choisissez-en un nouveau.', 'newpwd', id);
      if (r.locked) return showLogin(r.error, link ? 'link' : 'login', id);
      if (!r.ok) { U.toast(r.error || 'Char ID ou mot de passe incorrect', 'error'); el.password.select(); return; }
      enter();
    };
  }
  /* vérifie l'expiration (onglet resté ouvert, retour sur la page) */
  function checkSession() { if (App.state && LSC.api.expired()) showLogin('Session expirée (1 h) : reconnectez-vous.'); }
  setInterval(checkSession, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkSession(); });

  /* ---------- démarrage ---------- */
  async function boot() {
    $('#main').innerHTML = U.pageSkeleton();
    const r = await LSC.api.call('bootstrap');
    if (!r.ok) { if (r.needLink) return showLogin('Première ouverture en jeu : connectez-vous une seule fois avec votre Char ID et votre mot de passe pour relier votre compte.', 'link'); if (r.needLogin) return showLogin(); $('#main').innerHTML = U.empty({ icon: 'server-crash', title: 'Chargement impossible', text: r.error || 'Serveur injoignable', hint: false }); paint(); return; }
    apply(r);
    const h = location.hash.slice(1) || LSC.api.lastRoute(null, App.me.id) || '';
    App.route = ROUTES[h] && App.allowed(h) ? h : App.allowed('pos') ? 'pos' : 'home';
    LSC.api.lastRoute(App.route, App.me.id);
    if (location.hash.slice(1) !== App.route) history.replaceState(null, '', '#' + App.route);
    App.render();
    $('#main').classList.add('enter');
  }

  Theme.apply();

  /* ---------- événements globaux ---------- */
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-route], #main [data-go]');
    if (nav) App.go(nav.dataset.route || nav.dataset.go);
  });
  $('#bellBtn').onclick = () => { if (!U.closePopover()) openBell(); };
  $('#svcBtn').onclick = () => { if (App.state && !U.closePopover()) serviceClick(); };
  $('#advertBtn').onclick = () => { if (App.state) openAdvert(0); };
  $('#userBtn').onclick = () => { if (!U.closePopover()) openUser(); };
  /* téléphone : menu latéral en tiroir */
  const closeNav = () => document.body.classList.remove('nav-open');
  $('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
  $('#navShade').onclick = closeNav;
  $('#sidebar').addEventListener('click', e => { if (e.target.closest('[data-route], [data-act]')) closeNav(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNav(); });
  $('#topSearch').addEventListener('input', e => { if (App.route === 'pos') LSC.pages.pos.setQuery(e.target.value); });
  $('#topSearch').addEventListener('focus', e => { if (App.route !== 'pos' && App.state) { e.target.blur(); openPalette(); } });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (App.state && h !== App.route && ROUTES[h]) App.go(h); });

  document.addEventListener('keydown', e => {
    if (!App.state) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if (e.key === 'Escape') {
      if (U.closePopover()) return;
      const m = U.modal.top();
      if (m) { e.preventDefault(); m.close(); return; }
      if (LSC.api.mode === 'nui') LSC.api.close();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      const m = U.modal.top();
      if (m && m.submit) m.submit();
      else if (!m && App.route === 'pos') LSC.pages.pos.checkout();
      return;
    }
    if (e.key === 'Delete' && !typing && !U.modal.top() && App.route === 'pos') { e.preventDefault(); LSC.pages.pos.removeSelected(); }
  });

  /* FiveM : ouverture/fermeture de la tablette */
  window.addEventListener('message', e => {
    const d = e.data || {};
    if (d.type === 'visibility') {
      document.body.classList.toggle('nui-hidden', !d.open);
      if (d.open) boot();
    }
    /* plaque (et plus tard catégorie) du véhicule proche, envoyée par fivem/client.lua ou l'API */
    if (d.type === 'vehicle') LSC.pages.pos.setVehicle({ plate: d.plate, class: d.class, gtaClass: d.gtaClass, model: d.model });
  });
  if (LSC.api.mode === 'nui') document.body.classList.add('nui-hidden');

  /* rafraîchissement périodique en mode multi-utilisateur */
  if (LSC.api.mode !== 'local') setInterval(async () => {
    if (!App.state || U.modal.top() || document.body.classList.contains('nui-hidden') || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName)) return;
    const r = await LSC.api.call('bootstrap');
    if (r.ok) { apply(r); App.render(); }
  }, 20000);

  setInterval(tick, 1000); tick();
  LSC.openPalette = openPalette;
  if (LSC.api.mode !== 'nui') boot();
})();
