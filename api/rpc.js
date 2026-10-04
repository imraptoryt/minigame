/* =====================================================================
 * LS Customs — API serveur (fonction Vercel, Node 18+)
 * POST /api/rpc  { action, payload }
 *
 * Identification de l'acteur (jamais fournie librement par le client) :
 *   - Web     : jeton signé obtenu via auth.login (Char ID + mot de passe)
 *   - FiveM   : en-tête x-lsc-server-key (secret partagé avec server.lua)
 *               + actorLicense (licence du joueur, lue côté serveur FiveM)
 * Toute la logique et les permissions sont dans js/core/server.js.
 *
 * Variables d'environnement :
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (accès base, côté serveur uniquement)
 *   LSC_SECRET          (signature des jetons web)
 *   LSC_FIVEM_KEY       (secret partagé avec la ressource FiveM)
 *   LSC_SEED            ('demo' pour charger les données de démonstration au 1er lancement)
 *   LSC_OWNER_CHARID, LSC_OWNER_PIN, LSC_OWNER_LICENSE, LSC_OWNER_FIRSTNAME, LSC_OWNER_LASTNAME (patron initial)
 * ===================================================================== */
const crypto = require('crypto');
const Server = require('../js/core/server.js');
const Seed = require('../js/core/seed.js');

const env = process.env;
const hash = s => crypto.createHash('sha256').update('lsc:' + s).digest('hex');
Server.config.hash = hash;
Server.config.ownerCharId = env.LSC_OWNER_CHARID || ''; // seul ce Char ID peut devenir le premier PDG

async function sb(path, opts) {
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/' + path, Object.assign({ signal: AbortSignal.timeout(9000) }, opts, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' }
  }));
  if (!r.ok) throw new Error('Supabase ' + r.status + ' ' + await r.text());
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
/* lecture paginée (Supabase renvoie 1000 lignes max par requête) */
async function sbAll(path) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const rows = await sb(path + '&order=at.asc,id.asc&limit=1000&offset=' + off);
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

/* ---------- Stockage ----------
 * lsc_state : document principal (réglages, comptes, grades, catalogue, paies, factures...) — petit.
 * lsc_rows  : une ligne par vente / commission / service / opération bancaire / historique / mouvement de stock.
 * Une action ne charge que le document + les lignes « en cours » + ce qu'elle demande (Server.needs).
 * Écriture atomique (fonction SQL lsc_commit) avec verrou optimiste sur la version du document. */
const KINDS = Object.keys(Server.ROWS);
const coreOf = db => { const c = {}; Object.keys(db).forEach(k => { if (!KINDS.includes(k)) c[k] = db[k]; }); return c; };
const rowOf = (k, x) => ({ kind: k, id: x.id, at: x[Server.ROWS[k]] || new Date().toISOString(), ref: Server.ROW_REF[k] ? x[Server.ROW_REF[k]] || null : null, open: Server.rowOpen(k, x), data: x });
const allRows = full => { const ups = []; KINDS.forEach(k => (full[k] || []).forEach(x => ups.push(rowOf(k, x)))); return ups; };
async function commit(version, core, ups, dels, reset) {
  return sb('rpc/lsc_commit', { method: 'POST', body: JSON.stringify({ p_version: version, p_core: core, p_up: ups || [], p_del: dels || [], p_reset: !!reset }) });
}
let cache = null; // { core, version } : évite de retélécharger le document s'il n'a pas changé
const remember = (core, version) => { cache = { core: structuredClone(core), version }; };
async function loadCore() {
  if (cache) {
    const v = await sb('lsc_state?id=eq.1&select=version');
    if (v.length && v[0].version === cache.version) return { core: structuredClone(cache.core), version: cache.version };
  }
  for (let i = 0; i < 3; i++) {
    const got = await sb('lsc_state?id=eq.1&select=data,version');
    if (got.length) {
      const data = got[0].data, version = got[0].version;
      const legacy = KINDS.some(k => Array.isArray(data[k]));
      const changed = Seed.migrate(data, Server);
      /* ancienne base (tout dans un seul document) : on la découpe en lignes, sans perte */
      if (legacy) { const v = await commit(version, coreOf(data), allRows(data), [], false); if (v > 0) return { core: coreOf(data), version: v }; continue; }
      if (changed) { const v = await commit(version, data, [], [], false); if (v > 0) return { core: data, version: v }; continue; }
      remember(data, version);
      return { core: data, version };
    }
    const firstName = env.LSC_OWNER_FIRSTNAME || 'Patron', lastName = env.LSC_OWNER_LASTNAME || 'LS Customs';
    const owner = { name: firstName + ' ' + lastName, firstName, lastName, charId: env.LSC_OWNER_CHARID || '1', discordId: '', bankAccount: '', license: env.LSC_OWNER_LICENSE || '' };
    if (env.LSC_OWNER_PIN) owner.pinHash = hash(env.LSC_OWNER_PIN);
    const data = env.LSC_SEED === 'demo' ? Seed.build(Server) : Seed.build(Server, env.LSC_OWNER_PIN ? { demo: false, owner } : { demo: false });
    if (env.LSC_SEED === 'demo' && env.LSC_OWNER_PIN) data.employees.forEach(e => { if (e.roleId === 'patron') e.pinHash = hash(env.LSC_OWNER_PIN); });
    const v = await commit(0, coreOf(data), allRows(data), [], true);
    if (v > 0) return { core: coreOf(data), version: v };
  }
  throw new Error('Initialisation de la base impossible');
}
const clean = v => String(v).replace(/[^\w.:-]/g, '');
const inList = a => encodeURIComponent('(' + a.map(x => '"' + clean(x) + '"').join(',') + ')');
/* requêtes d'affichage : une par niveau de visibilité (tout / ses propres lignes), rien pour le reste */
function scoped(base, scope, kinds) {
  const out = [], all = kinds.filter(k => scope[k] === 'all'), own = kinds.filter(k => scope[k] === 'own');
  if (all.length) out.push(Object.assign({}, base, { kinds: all }));
  if (own.length) out.push(Object.assign({}, base, { kinds: own, emp: scope.me }));
  return out;
}
async function loadRows(queries) {
  const maps = {}; KINDS.forEach(k => { maps[k] = new Map(); });
  for (const q of queries) {
    let f = 'lsc_rows?select=kind,id,data';
    if (q.emp) f += '&data->>employeeId=eq.' + encodeURIComponent(clean(q.emp));
    if (q.open) f += '&open=is.true';
    if (q.kinds) f += '&kind=in.' + inList(q.kinds);
    if (q.from != null) f += '&at=gte.' + encodeURIComponent(new Date(q.from).toISOString());
    if (q.to != null) f += '&at=lte.' + encodeURIComponent(new Date(q.to).toISOString());
    if (q.ids) f += '&id=in.' + inList(q.ids);
    if (q.refs) f += '&ref=in.' + inList(q.refs);
    if (q.plate || q.model) f += '&or=' + encodeURIComponent('(' + [q.plate && 'data->vehicle->>plate.eq.' + clean(q.plate), q.model && 'data->vehicle->>model.eq.' + clean(q.model)].filter(Boolean).join(',') + ')');
    (await sbAll(f)).forEach(r => { if (maps[r.kind]) maps[r.kind].set(r.id, r.data); });
  }
  return maps;
}
function assemble(core, maps) {
  const db = Object.assign({}, core);
  KINDS.forEach(k => { const f = Server.ROWS[k]; db[k] = [...maps[k].values()].sort((a, b) => String(a[f]).localeCompare(String(b[f]))); });
  return db;
}
/* lignes ajoutées / modifiées / supprimées par l'action */
function diff(before, db) {
  const ups = [], dels = [], changed = {}, removed = {};
  KINDS.forEach(k => {
    const seen = new Set(); changed[k] = []; removed[k] = [];
    db[k].forEach(x => { seen.add(x.id); if (before[k].get(x.id) !== JSON.stringify(x)) { ups.push(rowOf(k, x)); changed[k].push(x); } });
    before[k].forEach((_, id) => { if (!seen.has(id)) { dels.push({ kind: k, id }); removed[k].push(id); } });
  });
  return { ups, dels, changed, removed };
}
const snapshot = maps => { const b = {}; KINDS.forEach(k => { b[k] = new Map([...maps[k]].map(([id, x]) => [id, JSON.stringify(x)])); }); return b; };
async function oldest() { const r = await sb('lsc_rows?select=at&order=at.asc&limit=1'); return r.length ? Date.parse(r[0].at) : Date.now(); }

/* Jetons web : base64url(id.exp).signature */
const sign = s => crypto.createHmac('sha256', env.LSC_SECRET).update(s).digest('base64url');
/* session de 1 h, renouvelée à chaque appel */
function issue(id) { const body = Buffer.from(id + '.' + (Date.now() + 3600e3)).toString('base64url'); return body + '.' + sign(body); }
function verify(token) {
  if (!token || !env.LSC_SECRET) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const [id, exp] = Buffer.from(body, 'base64url').toString().split('.');
  return +exp > Date.now() ? id : null;
}
function safeEqual(a, b) { a = Buffer.from(String(a || '')); b = Buffer.from(String(b || '')); return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b); }

function actorOf(req, body, db) {
  if (env.LSC_FIVEM_KEY && safeEqual(req.headers['x-lsc-server-key'], env.LSC_FIVEM_KEY)) {
    const e = db.employees.find(x => !x.archived && x.license && x.license === body.actorLicense);
    return e ? e.id : null;
  }
  const auth = String(req.headers.authorization || '');
  return verify(auth.startsWith('Bearer ') ? auth.slice(7) : '');
}

module.exports = async (req, res) => {
  if (req.method === 'GET' && req.query && req.query.ping !== undefined) {
    /* tâche quotidienne : garde Supabase actif + rappel d'archivage en début de mois */
    try {
      const { core, version } = await loadCore(), now = Date.now(), m = Server.maintenance(core, now), g = await Server.glifeRecap(core, now);
      if (m || g) { const nv = await commit(version, core); if (nv > 0) { remember(core, nv); await Server.runEffects([].concat(m ? m.effects : [], g ? g.effects : [])); } }
      return res.json({ ok: true });
    } catch (e) { console.error('[LSC] ping', e); return res.status(500).json({ ok: false }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST uniquement' });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.LSC_SECRET) return res.status(500).json({ ok: false, error: 'Serveur non configuré (variables Supabase / LSC_SECRET manquantes)' });
  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const action = String(body.action || ''), payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { core, version } = await loadCore();

      /* connexion : blocage après 5 échecs, nouveau mot de passe si réinitialisé (règles dans server.js) */
      const fivem = !!(env.LSC_FIVEM_KEY && safeEqual(req.headers['x-lsc-server-key'], env.LSC_FIVEM_KEY));
      if (action === 'auth.login' || action === 'auth.setPassword') {
        const r = (action === 'auth.login' ? Server.login : Server.setPassword)(core, payload);
        /* en jeu : la licence du joueur est reliée au compte (une seule fois, plus besoin de mot de passe ensuite) */
        const lic = fivem ? String(body.actorLicense || '') : '';
        if (r.ok && lic) {
          core.employees.forEach(x => { if (x.license === lic && x.id !== r.id) x.license = ''; });
          const e = core.employees.find(x => x.id === r.id);
          if (e.license !== lic) { e.license = lic; e.linkedAt = new Date().toISOString(); r.changed = true; }
        }
        if (r.changed) { const nv = await commit(version, core); if (nv < 0) continue; remember(core, nv); }
        if (!r.ok) return res.status(r.needNewPassword ? 200 : r.locked ? 423 : 401).json({ ok: false, error: r.error, locked: r.locked, needNewPassword: r.needNewPassword });
        return res.json(Object.assign({ ok: true }, fivem ? { linked: true } : { token: issue(r.id) }));
      }

      /* création de compte : demande en attente, validée ensuite par la direction */
      if (action === 'auth.register') {
        const r = Server.register(core, payload);
        if (!r.ok) return res.json(r);
        { const nv = await commit(version, core); if (nv > 0) { remember(core, nv); return res.json(r); } }
        continue;
      }

      const actorId = actorOf(req, body, core);
      /* en jeu, licence inconnue : l'employé se connecte une fois pour relier son compte */
      if (!actorId && fivem) return res.json({ ok: false, needLink: true, error: 'Reliez votre compte : connectez-vous une fois avec votre Char ID' });
      if (!actorId) return res.status(401).json({ ok: false, needLogin: true, error: 'Authentification requise' });
      const web = !(env.LSC_FIVEM_KEY && safeEqual(req.headers['x-lsc-server-key'], env.LSC_FIVEM_KEY));
      const token = web ? { token: issue(actorId) } : {};
      const now = Date.now();

      /* démarrage : document + 15 derniers jours (historique d'actions : 3 jours) + éléments en cours,
       * limité à ce que l'employé a le droit de voir */
      if (action === 'bootstrap') {
        const scope = Server.rowScope(core, actorId), from = now - Server.WINDOW, auditFrom = now - 3 * 864e5;
        const rest = KINDS.filter(k => k !== 'audit');
        const q = scoped({ open: true }, scope, rest).concat(scoped({ from, to: now + 864e5 }, scope, rest), scoped({ from: auditFrom, to: now + 864e5 }, scope, ['audit']));
        const db = assemble(core, await loadRows(q));
        return res.json(Object.assign(Server.view(db, actorId), { from, auditFrom, oldest: await oldest() }, token));
      }
      /* historique demandé par l'interface (période plus ancienne) */
      if (action === 'rows.range') {
        const from = +payload.from, to = +payload.to;
        if (!isFinite(from) || !isFinite(to) || to < from || to - from > 62 * 864e5) return res.json({ ok: false, error: 'Période invalide' });
        const kinds = Array.isArray(payload.kinds) ? KINDS.filter(k => payload.kinds.includes(k)) : KINDS.filter(k => k !== 'audit');
        const db = assemble(core, await loadRows(scoped({ from, to }, Server.rowScope(core, actorId), kinds)));
        return res.json(Object.assign(Server.view(db, actorId), { merge: true }));
      }
      if (action === 'demo.switch') return res.status(403).json({ ok: false, error: 'Indisponible en production' });
      if (action === 'demo.reset') {
        const me = core.employees.find(e => e.id === actorId);
        if (!me || !Server.hasPerm(Server.roleOf(core, me), '*')) return res.status(403).json({ ok: false, error: "Vous n'avez pas les permissions nécessaires" });
        const fresh = Object.assign(Seed.build(Server, { demo: false }), { employees: core.employees, roles: core.roles, signups: core.signups || [] });
        if (await commit(version, coreOf(fresh), allRows(fresh), [], true) > 0) return res.json(Object.assign(Server.view(fresh, actorId), { from: 0 }));
        continue;
      }

      const maps = await loadRows(Server.needs(action, payload, core, now));
      const before = snapshot(maps), db = assemble(core, maps);
      const r = Server.handle(db, actorId, action, payload, now);
      if (!r.ok) return res.json(r);
      /* les effets (webhooks Discord) partent d'ici : l'URL ne quitte jamais le serveur */
      if (r.readonly) return res.json({ ok: true, readonly: true, data: r.data, delivery: await Server.runEffects(r.effects) });
      const d = diff(before, db), next = coreOf(db);
      const nv = await commit(version, next, d.ups, d.dels);
      if (nv > 0) {
        remember(next, nv);
        await Server.runEffects(r.effects);
        /* réponse : document + lignes modifiées seulement (l'interface fusionne) */
        return res.json(Object.assign(Server.view(Object.assign({}, next, d.changed), actorId), { data: r.data, merge: true, removed: d.removed }, token));
      }
      /* conflit : un autre employé a écrit entre-temps -> on rejoue sur la version fraîche */
    }
    return res.status(409).json({ ok: false, error: "Conflit d'écriture, réessayez" });
  } catch (e) {
    console.error('[LSC]', action, e);
    return res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
};
