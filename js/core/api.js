/* Transport : l'UI n'appelle que LSC.api.call(action, payload).
 * Elle ne modifie jamais les données directement. */
(function () {
  'use strict';
  const cfg = Object.assign({ mode: 'auto', apiUrl: '/api/rpc', storageKey: 'lsc_db_v1' }, window.LSC_CONFIG || {});
  const isNui = typeof window.GetParentResourceName === 'function';
  const mode = cfg.mode === 'auto' ? (isNui ? 'nui' : 'local') : cfg.mode;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { console.warn('[LSC] stockage local indisponible', e); } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  /* ---------- mode local (démo) ---------- */
  let db = null;
  function load() {
    try { db = JSON.parse(store.get(cfg.storageKey)); } catch (e) { db = null; }
    if (!db || !db.meta || !Array.isArray(db.sales)) { db = LSCSeed.build(LSCServer, { demo: false }); save(); }
    else if (LSCSeed.migrate(db, LSCServer)) save();
  }
  function save() { store.set(cfg.storageKey, JSON.stringify(db)); }
  /* Session : 1 h, prolongée à chaque action. Au-delà, connexion Char ID + mot de passe. */
  const SESSION_MS = 3600e3;
  function session() {
    try {
      const s = JSON.parse(store.get('lsc_session'));
      if (s && s.exp > Date.now() && db.employees.some(e => e.id === s.id && !e.archived)) return s;
    } catch (e) { /* session absente */ }
    return null;
  }
  const touch = id => store.set('lsc_session', JSON.stringify({ id, exp: Date.now() + SESSION_MS }));
  async function local(action, payload) {
    if (!db) load();
    payload = payload || {};
    /* connexion : mêmes règles que le serveur (blocage après 5 échecs, nouveau mot de passe si réinitialisé) */
    if (action === 'auth.login' || action === 'auth.setPassword') {
      const r = (action === 'auth.login' ? LSCServer.login : LSCServer.setPassword)(db, payload);
      if (r.changed) save();
      if (!r.ok) return { ok: false, error: r.error, locked: r.locked, needNewPassword: r.needNewPassword };
      touch(r.id);
      return { ok: true };
    }
    if (action === 'auth.logout') { store.del('lsc_session'); return { ok: true }; }
    if (action === 'auth.register') {
      const work = JSON.parse(JSON.stringify(db));
      const r = LSCServer.register(work, payload);
      if (r.ok) { db = work; save(); }
      return r;
    }
    const s = session();
    if (!s) return { ok: false, needLogin: true, error: 'Session expirée : reconnectez-vous' };
    touch(s.id);
    const actor = () => s.id;
    if (action === 'demo.reset') {
      const keep = { employees: db.employees, roles: db.roles, signups: db.signups };
      db = Object.assign(LSCSeed.build(LSCServer, { demo: false }), keep); save(); // tout est effacé sauf les comptes
      if (!session()) store.del('lsc_session');
      return session() ? LSCServer.view(db, s.id) : { ok: false, needLogin: true, error: 'Reconnectez-vous' };
    }
    if (action === 'bootstrap') {
      const m = LSCServer.maintenance(db); // rappel d'archivage en début de mois
      if (m) { save(); LSCServer.runEffects(m.effects); }
      /* récap quotidien des factures en jeu (GLife), sans bloquer l'ouverture */
      LSCServer.glifeRecap(db).then(g => { if (g) { save(); LSCServer.runEffects(g.effects); } }).catch(() => {});
      return LSCServer.view(db, actor());
    }
    const work = JSON.parse(JSON.stringify(db)); // transaction : rien n'est écrit si l'action échoue
    const res = LSCServer.handle(work, actor(), action, payload);
    if (!res.ok) return res;
    if (res.readonly) return { ok: true, readonly: true, data: res.data, delivery: await LSCServer.runEffects(res.effects) };
    db = work; save();
    LSCServer.runEffects(res.effects); // webhooks Discord, sans bloquer l'interface
    return Object.assign(LSCServer.view(db, actor()), { data: res.data });
  }

  /* ---------- FiveM NUI ---------- */
  async function nui(action, payload) {
    const r = await fetch(`https://${window.GetParentResourceName()}/rpc`, {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify({ action, payload: payload || {} })
    });
    return r.json();
  }

  /* ---------- HTTP (Vercel) ---------- */
  async function http(action, payload) {
    const token = store.get('lsc_token');
    const r = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: JSON.stringify({ action, payload: payload || {} })
    });
    const res = await r.json().catch(() => ({ ok: false, error: 'Réponse serveur invalide' }));
    if (res.ok && res.token) store.set('lsc_token', res.token); // jeton renouvelé (session glissante 1 h)
    if (res.needLogin) store.del('lsc_token');
    return res;
  }

  async function call(action, payload) {
    try {
      if (mode === 'local') return await local(action, payload);
      if (mode === 'nui') return await nui(action, payload);
      return await http(action, payload);
    } catch (e) {
      console.error('[LSC]', action, e);
      return { ok: false, error: mode === 'local' ? 'Erreur interne : ' + e.message : 'Serveur injoignable' };
    }
  }

  window.LSC = window.LSC || {};
  window.LSC.api = {
    mode, call,
    async logout() { store.del('lsc_token'); if (mode === 'local') await local('auth.logout'); location.reload(); },
    /* session expirée ? (local : 1 h sans action ; web : jeton d'1 h) — jamais en jeu (identité FiveM) */
    expired() {
      if (mode === 'local') { if (!db) load(); return !session(); }
      if (mode === 'http') {
        const t = store.get('lsc_token');
        if (!t) return true;
        try { const exp = +atob(t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')).split('.')[1]; return !(exp > Date.now()); } catch (e) { return true; }
      }
      return false;
    },
    /* activité (navigation) : prolonge la session locale */
    touch() { if (mode === 'local' && db) { const s = session(); if (s) touch(s.id); } },
    /* dernière page ouverte (restaurée à la réouverture tant que la session est valide) */
    lastRoute(r, who) {
      if (r) { store.set('lsc_route', JSON.stringify({ r, who: who || '' })); return r; }
      try { const x = JSON.parse(store.get('lsc_route')); return x && (!who || !x.who || x.who === who) ? x.r : null; } catch (e) { return null; }
    },
    close() { if (mode === 'nui') fetch(`https://${window.GetParentResourceName()}/close`, { method: 'POST', body: '{}' }).catch(() => {}); },
    exportLocal() { if (!db) load(); return JSON.stringify(db, null, 2); }
  };
})();
