/* =====================================================================
 * LS Customs · API serveur (fonction Vercel, Node 18+)
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
/* mots de passe : scrypt avec sel propre à chaque compte (« s1$sel$hash ») ;
 * les anciens SHA-256 restent acceptés et sont convertis à la connexion suivante */
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const legacyHash = s => crypto.createHash('sha256').update('lsc:' + s).digest('hex');
const scrypt = (pwd, salt) => crypto.scryptSync(String(pwd), salt, 32, SCRYPT);
const hash = pwd => { const salt = crypto.randomBytes(16).toString('hex'); return 's1$' + salt + '$' + scrypt(pwd, salt).toString('hex'); };
function verifyPwd(pwd, stored) {
  stored = String(stored || '');
  if (!stored) { scrypt(pwd, 'lsc-dummy'); return false; } // même durée, compte existant ou non
  if (stored.startsWith('s1$')) { const [, salt, h] = stored.split('$'); const want = Buffer.from(h || '', 'hex'), got = scrypt(pwd, salt); return want.length === got.length && crypto.timingSafeEqual(want, got); }
  return safeEqual(legacyHash(pwd), stored);
}
Server.config.hash = hash;
Server.config.verify = verifyPwd;
Server.config.rehash = stored => !String(stored || '').startsWith('s1$');
/* empreinte de la connexion (IP en ligne, licence en jeu) : sert au blocage anti-essais et à la limite d'inscriptions ;
 * jamais l'IP en clair dans la base */
function connKey(req, body, fivem) {
  const raw = fivem ? 'lic:' + String(body.actorLicense || '') : 'ip:' + String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim();
  return raw.slice(0, 3) + crypto.createHmac('sha256', env.LSC_SECRET || 'lsc').update(raw).digest('hex').slice(0, 20);
}
Server.config.ownerCharId = env.LSC_OWNER_CHARID || ''; // seul ce Char ID peut devenir le premier PDG

async function sb(path, opts) {
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/' + path, Object.assign({ signal: AbortSignal.timeout(9000) }, opts, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip', Prefer: 'return=representation' }
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
 * lsc_state : document principal (réglages, comptes, grades, catalogue, paies, factures...) · petit.
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
/* ---------- Cache des lignes récentes (mémoire de l'instance Vercel) ----------
 * Lignes en cours + 17 derniers jours, lues une fois puis tenues à jour avec ce que cette instance écrit.
 * Tant que la version en base est celle du cache, rien n'est relu depuis Supabase.
 * Une écriture venue d'ailleurs (autre instance, SQL à la main) change la version : le cache est relu en entier.
 * Le journal des écritures permet d'envoyer à l'interface seulement ce qui a changé (action « sync »). */
const SPAN = 17 * 864e5;
let rc = null; // { version, base, from, built, rows: Map('kind|id' -> { kind, id, t, open, data }), log: [{ ver, keys, dels }] }
const rkey = (k, id) => k + '|' + id;
async function warm(version) {
  const now = Date.now();
  if (rc && rc.version === version && now - rc.built < 12 * 36e5) return;
  const from = now - SPAN, rows = new Map();
  (await sbAll('lsc_rows?select=kind,id,at,open,data&or=' + encodeURIComponent('(open.is.true,at.gte.' + new Date(from).toISOString() + ')')))
    .forEach(r => rows.set(rkey(r.kind, r.id), { kind: r.kind, id: r.id, t: Date.parse(r.at), open: !!r.open, data: r.data }));
  rc = { version, base: version, from, built: now, rows, log: [] };
}
const cacheable = q => !(q.ids || q.refs || q.plate || q.model) && (q.from == null ? !!q.open : q.from >= rc.from);
function fromCache(q) {
  const out = [];
  rc.rows.forEach(r => {
    if ((q.kinds && !q.kinds.includes(r.kind)) || (q.open && !r.open) || (q.from != null && !(r.t >= q.from)) || (q.to != null && !(r.t <= q.to))) return;
    if (q.emp && (r.data || {}).employeeId !== q.emp) return;
    out.push(r);
  });
  return out;
}
/* après une écriture réussie de cette instance : le cache suit (sinon il sera relu au prochain appel) */
/* salaire de la semaine de l'employé, calculé sur le cache (lecture seule, sans copie) : à jour à chaque rafraîchissement */
function payOf(core, actorId, version, now) {
  if (!rc || rc.version !== version) return undefined;
  const db = Object.assign({}, core), from = now - 15 * 864e5;
  KINDS.forEach(k => { db[k] = []; });
  rc.rows.forEach(r => { if (r.open || r.t >= from) db[r.kind].push(r.data); });
  try { return Server.payEstimate(db, actorId, now); } catch (e) { console.error('payEstimate', e); return undefined; }
}
function withPay(v, pay) { if (v.state && pay) v.state.myPay = pay; return v; }
function track(version, nv, d) {
  if (!(nv > 0) || !rc || rc.version !== version) { if (nv > 0 && rc && rc.version !== nv) rc = null; return; }
  const keys = [], dels = [];
  if (d) {
    d.ups.forEach(u => { const k = rkey(u.kind, u.id); rc.rows.set(k, { kind: u.kind, id: u.id, t: Date.parse(u.at), open: !!u.open, data: structuredClone(u.data) }); keys.push(k); });
    d.dels.forEach(x => { rc.rows.delete(rkey(x.kind, x.id)); dels.push(x); });
  }
  rc.version = nv; rc.log.push({ ver: nv, keys, dels });
  if (rc.log.length > 300) { rc.log.shift(); rc.base = rc.log[0].ver - 1; }
}
async function loadRows(queries, version) {
  const maps = {}; KINDS.forEach(k => { maps[k] = new Map(); });
  if (version != null) await warm(version);
  for (const q of queries) {
    if (version != null && rc && rc.version === version && cacheable(q)) { fromCache(q).forEach(r => maps[r.kind].set(r.id, structuredClone(r.data))); continue; }
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
/* session de 24 h, ou 30 jours avec « Rester connecté », renouvelée à chaque appel.
 * Le jeton porte une empreinte du mot de passe : un changement ou une réinitialisation déconnecte partout. */
const pwPrint = e => e && e.pinHash ? sign('pw:' + e.pinHash).slice(0, 12) : '';
function issue(id, long, db) {
  const e = db.employees.find(x => x.id === id);
  const body = Buffer.from([id, Date.now() + (long ? 30 * 864e5 : 864e5), long ? 1 : 0, pwPrint(e)].join('.')).toString('base64url');
  return body + '.' + sign(body);
}
function verify(token, db) {
  if (!token || !env.LSC_SECRET) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const [id, exp, long, pw] = Buffer.from(body, 'base64url').toString().split('.');
  if (!(+exp > Date.now())) return null;
  if (pw !== undefined && pw !== pwPrint(db.employees.find(x => x.id === id))) return null;
  return { id, long: long === '1' };
}
function safeEqual(a, b) { a = Buffer.from(String(a || '')); b = Buffer.from(String(b || '')); return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b); }

function actorOf(req, body, db) {
  if (env.LSC_FIVEM_KEY && safeEqual(req.headers['x-lsc-server-key'], env.LSC_FIVEM_KEY)) {
    const e = db.employees.find(x => !x.archived && x.license && x.license === body.actorLicense);
    return e ? e.id : null;
  }
  const auth = String(req.headers.authorization || '');
  const t = verify(auth.startsWith('Bearer ') ? auth.slice(7) : '', db);
  return t ? (req.longSession = t.long, t.id) : null;
}

module.exports = async (req, res) => {
  if (req.method === 'GET' && req.query && req.query.ping !== undefined) {
    if (env.CRON_SECRET && !safeEqual(req.headers.authorization, 'Bearer ' + env.CRON_SECRET)) return res.status(401).json({ ok: false });
    /* tâche planifiée (Vercel tous les jours à 6h UTC + Supabase le dimanche 23h59 Paris) :
     * garde Supabase actif, rappel d'archivage en début de mois, recalcul automatique des salaires */
    try {
      let { core, version } = await loadCore();
      const now = Date.now(), m = Server.maintenance(core, now), g = await Server.glifeRecap(core, now);
      if (m || g) { const nv = await commit(version, core); track(version, nv, null); if (nv > 0) { remember(core, nv); version = nv; await Server.runEffects([].concat(m ? m.effects : [], g ? g.effects : [])); } }
      /* passage de grade automatique, le lundi */
      let promoted = null;
      if (Server.autoPromoteDue(core, now)) {
        const maps = await loadRows(Server.needs('staff.autoPromote', {}, core, now), version);
        const before = snapshot(maps), db = assemble(core, maps);
        promoted = Server.autoPromote(db, now);
        const d = diff(before, db), next = coreOf(db), nv = await commit(version, next, d.ups, d.dels);
        track(version, nv, d);
        if (nv > 0) { remember(next, nv); core = next; version = nv; }
        promoted = Object.assign({ saved: nv > 0 }, promoted);
      }
      const plan = Server.payrollPlan(core, now);
      let payroll = plan && plan.skip ? { skipped: plan.skip } : null;
      if (plan && !plan.skip) {
        const maps = await loadRows(Server.needs('payroll.generate', plan.payload, core, now), version);
        const before = snapshot(maps), db = assemble(core, maps);
        const r = Server.handle(db, plan.actorId, 'payroll.generate', plan.payload, now);
        if (r.ok) {
          db.meta.payrollAutoAt = new Date(now).toISOString();
          const d = diff(before, db), next = coreOf(db), nv = await commit(version, next, d.ups, d.dels);
          track(version, nv, d);
          if (nv > 0) remember(next, nv);
          payroll = Object.assign({ saved: nv > 0 }, r.data);
        } else payroll = { error: r.error };
      }
      return res.json({ ok: true, payroll, promoted });
    } catch (e) { console.error('[LSC] ping', e); return res.status(500).json({ ok: false }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST uniquement' });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.LSC_SECRET) return res.status(500).json({ ok: false, error: 'Serveur non configuré (variables Supabase / LSC_SECRET manquantes)' });
  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const action = String(body.action || '');
  let payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { core, version } = await loadCore();

      /* connexion : blocage après 5 échecs, nouveau mot de passe si réinitialisé (règles dans server.js) */
      const fivem = !!(env.LSC_FIVEM_KEY && safeEqual(req.headers['x-lsc-server-key'], env.LSC_FIVEM_KEY));
      if (action === 'auth.login' || action === 'auth.setPassword') {
        const r = (action === 'auth.login' ? Server.login : Server.setPassword)(core, Object.assign({}, payload, { from: connKey(req, body, fivem) }));
        /* en jeu : la licence du joueur est reliée au compte (une seule fois, plus besoin de mot de passe ensuite) */
        const lic = fivem ? String(body.actorLicense || '') : '';
        if (r.ok && lic) {
          core.employees.forEach(x => { if (x.license === lic && x.id !== r.id) x.license = ''; });
          const e = core.employees.find(x => x.id === r.id);
          if (e.license !== lic) { e.license = lic; e.linkedAt = new Date().toISOString(); r.changed = true; }
        }
        if (r.changed) { const nv = await commit(version, core); if (nv < 0) continue; track(version, nv, null); remember(core, nv); }
        if (!r.ok) return res.status(r.needNewPassword ? 200 : r.locked ? 423 : 401).json({ ok: false, error: r.error, locked: r.locked, needNewPassword: r.needNewPassword });
        return res.json(Object.assign({ ok: true }, fivem ? { linked: true } : { token: issue(r.id, payload.remember === true, core) }));
      }

      /* création de compte : demande en attente, validée ensuite par la direction */
      if (action === 'auth.register') {
        const r = Server.register(core, Object.assign({}, payload, { from: connKey(req, body, fivem) }));
        if (!r.ok) return res.json(r);
        { const nv = await commit(version, core); if (nv > 0) { track(version, nv, null); remember(core, nv); return res.json(r); } }
        continue;
      }

      const actorId = actorOf(req, body, core);
      /* en jeu, licence inconnue : l'employé se connecte une fois pour relier son compte */
      if (!actorId && fivem) return res.json({ ok: false, needLink: true, error: 'Reliez votre compte : connectez-vous une fois avec votre Char ID' });
      if (!actorId) return res.status(401).json({ ok: false, needLogin: true, error: 'Authentification requise' });
      const web = !(env.LSC_FIVEM_KEY && safeEqual(req.headers['x-lsc-server-key'], env.LSC_FIVEM_KEY));
      const token = web ? { token: issue(actorId, req.longSession, core) } : {};
      const now = Date.now();

      /* démarrage : document + 15 derniers jours (historique d'actions : 3 jours) + éléments en cours,
       * limité à ce que l'employé a le droit de voir */
      /* rafraîchissement automatique de l'interface : rien si la base n'a pas bougé,
       * sinon seulement les lignes écrites depuis (journal du cache), ou tout si le journal ne suffit pas */
      if (action === 'sync') {
        const ver = Math.floor(+payload.ver) || 0;
        if (ver === version) return res.json(Object.assign({ ok: true, same: true, ver: version }, token));
        await warm(version);
        if (ver > 0 && ver >= rc.base && ver < rc.version && rc.version === version) {
          const scope = Server.rowScope(core, actorId) || {}, keys = new Set(), removed = {}, rows = {};
          rc.log.forEach(l => { if (l.ver > ver) { l.keys.forEach(k => keys.add(k)); l.dels.forEach(x => { keys.delete(rkey(x.kind, x.id)); (removed[x.kind] = removed[x.kind] || []).push(x.id); }); } });
          KINDS.forEach(k => { rows[k] = []; });
          keys.forEach(k => { const r = rc.rows.get(k), s = r && scope[r.kind]; if (s === 'all' || (s === 'own' && (r.data || {}).employeeId === scope.me)) rows[r.kind].push(structuredClone(r.data)); });
          return res.json(Object.assign(withPay(Server.view(Object.assign({}, core, rows), actorId), payOf(core, actorId, version, now)), { merge: true, removed, ver: version }, token));
        }
      }
      if (action === 'bootstrap' || action === 'sync') {
        const scope = Server.rowScope(core, actorId), from = now - Server.WINDOW, auditFrom = now - 3 * 864e5;
        const rest = KINDS.filter(k => k !== 'audit');
        const q = scoped({ open: true }, scope, rest).concat(scoped({ from, to: now + 864e5 }, scope, rest), scoped({ from: auditFrom, to: now + 864e5 }, scope, ['audit']));
        q.push({ kinds: ['sales'], from: now - 15 * 864e5, to: now + 864e5 }); // salaire de la semaine : CA de toute l'équipe (la vue reste filtrée)
        const db = assemble(core, await loadRows(q, version)), v = Server.view(db, actorId);
        if (v.state) try { v.state.myPay = Server.payEstimate(db, actorId, now); } catch (e) { console.error('payEstimate', e); } // ne bloque jamais l'ouverture
        return res.json(Object.assign(v, { from, auditFrom, oldest: await oldest(), ver: version }, token));
      }
      /* historique demandé par l'interface (période plus ancienne) */
      if (action === 'rows.range') {
        const from = +payload.from, to = +payload.to;
        if (!isFinite(from) || !isFinite(to) || to < from || to - from > 62 * 864e5) return res.json({ ok: false, error: 'Période invalide' });
        const kinds = Array.isArray(payload.kinds) ? KINDS.filter(k => payload.kinds.includes(k)) : KINDS.filter(k => k !== 'audit');
        const db = assemble(core, await loadRows(scoped({ from, to }, Server.rowScope(core, actorId), kinds), version));
        return res.json(Object.assign(Server.view(db, actorId), { merge: true }));
      }
      if (action === 'demo.switch') return res.status(403).json({ ok: false, error: 'Indisponible en production' });
      if (action === 'demo.reset') {
        const me = core.employees.find(e => e.id === actorId);
        if (!me || !Server.hasPerm(Server.roleOf(core, me), '*')) return res.status(403).json({ ok: false, error: "Vous n'avez pas les permissions nécessaires" });
        const fresh = Object.assign(Seed.build(Server, { demo: false }), { employees: core.employees, roles: core.roles, signups: core.signups || [] });
        if (await commit(version, coreOf(fresh), allRows(fresh), [], true) > 0) { rc = null; return res.json(Object.assign(Server.view(fresh, actorId), { from: 0 })); }
        continue;
      }

      if (payload && payload.__server) payload = Object.assign({}, payload, { __server: undefined });
      const maps = await loadRows(Server.needs(action, payload, core, now), version);
      const before = snapshot(maps), db = assemble(core, maps);
      const r = Server.handle(db, actorId, action, payload, now);
      if (!r.ok) return res.json(r);
      /* les effets (webhooks Discord) partent d'ici : l'URL ne quitte jamais le serveur */
      if (r.readonly) return res.json({ ok: true, readonly: true, data: r.data, delivery: await Server.runEffects(r.effects) });
      const d = diff(before, db), next = coreOf(db);
      const nv = await commit(version, next, d.ups, d.dels);
      track(version, nv, d);
      if (nv > 0) {
        remember(next, nv);
        await Server.runEffects(r.effects);
        /* réponse : document + lignes modifiées seulement (l'interface fusionne) */
        /* jeton refait après l'action : changer son mot de passe garde cette session, déconnecte les autres */
        return res.json(Object.assign(withPay(Server.view(Object.assign({}, next, d.changed), actorId), payOf(next, actorId, nv, now)), { data: r.data, merge: true, removed: d.removed, ver: nv }, web ? { token: issue(actorId, req.longSession, next) } : {}));
      }
      /* conflit : un autre employé a écrit entre-temps -> on rejoue sur la version fraîche */
    }
    return res.status(409).json({ ok: false, error: "Conflit d'écriture, réessayez" });
  } catch (e) {
    console.error('[LSC]', action, e);
    return res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
};
