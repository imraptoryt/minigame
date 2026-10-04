/* =====================================================================
 * LS Customs — logique métier « serveur » (source de vérité)
 * ---------------------------------------------------------------------
 * Toutes les écritures passent par handle() : permissions vérifiées,
 * montants recalculés depuis la base (jamais depuis l'UI).
 * Le même fichier tourne :
 *   - côté serveur : api/rpc.js (Vercel) appelé par le web et FiveM ;
 *   - dans le navigateur en mode démo local (localStorage).
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LSCServer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 864e5;
  /* SHA-256 (synchrone, identique navigateur / Node) pour les mots de passe */
  function sha256(str) {
    const m = unescape(encodeURIComponent(str)), K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
      0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
      0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const b = []; for (let i = 0; i < m.length; i++) b.push(m.charCodeAt(i));
    const bits = b.length * 8; b.push(0x80); while (b.length % 64 !== 56) b.push(0);
    for (let i = 7; i >= 0; i--) b.push(i > 3 ? 0 : (bits >>> (i * 8)) & 0xff);
    const w = new Array(64), rot = (x, n) => (x >>> n) | (x << (32 - n));
    for (let j = 0; j < b.length; j += 64) {
      for (let i = 0; i < 16; i++) w[i] = (b[j + 4 * i] << 24) | (b[j + 4 * i + 1] << 16) | (b[j + 4 * i + 2] << 8) | b[j + 4 * i + 3];
      for (let i = 16; i < 64; i++) w[i] = (w[i - 16] + (rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3)) + w[i - 7] + (rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10))) | 0;
      let [a, bb, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      H = [a, bb, c, d, e, f, g, h].map((x, i) => (H[i] + x) | 0);
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  const config = { hash: pwd => sha256('lsc:' + pwd) }; // hachage des mots de passe (remplaçable côté Node)
  const PWD_MIN = 6, LOCK_MAX = 5, LOCK_MS = 15 * 60e3; // 6 caractères min. ; blocage 15 min après 5 échecs

  /* [clé, libellé, groupe] */
  const PERMISSIONS = [
    ['pos.use', 'Utiliser le point de vente', 'Point de vente'],
    ['pos.discount', 'Appliquer une réduction (plafonnée)', 'Point de vente'],
    ['pos.discount.unlimited', 'Réduction sans plafond', 'Point de vente'],
    ['pos.markup', 'Appliquer une majoration', 'Point de vente'],
    ['sales.view_own', 'Voir ses ventes', 'Ventes'],
    ['sales.view_all', 'Voir toutes les ventes', 'Ventes'],
    ['sales.cancel', 'Annuler une vente', 'Ventes'],
    ['stats.own', 'Voir son bilan', 'Statistiques'],
    ['stats.all', 'Voir le bilan des employés', 'Statistiques'],
    ['accounting.view', 'Voir la comptabilité', 'Comptabilité'],
    ['invoices.manage', 'Gérer les factures partenaires', 'Comptabilité'],
    ['expenses.manage', 'Gérer les charges', 'Comptabilité'],
    ['payroll.manage', 'Gérer les salaires', 'Comptabilité'],
    ['bank.view', 'Voir le compte bancaire', 'Comptabilité'],
    ['bank.manage', 'Opérations bancaires manuelles', 'Comptabilité'],
    ['service.self', 'Prendre son service', 'Ressources humaines'],
    ['staff.view', 'Voir le personnel', 'Ressources humaines'],
    ['service.view_all', 'Voir les heures de service de tous', 'Ressources humaines'],
    ['staff.manage', 'Gérer les employés', 'Ressources humaines'],
    ['staff.resetpwd', 'Réinitialiser les mots de passe', 'Ressources humaines'],
    ['warnings.manage', 'Gérer les avertissements', 'Ressources humaines'],
    ['products.manage', 'Gérer produits et prix', 'Entreprise'],
    ['inventory.manage', "Gérer l'inventaire", 'Entreprise'],
    ['stock.move', 'Entrées / sorties de stock', 'Entreprise'],
    ['partners.manage', 'Gérer les partenaires', 'Entreprise'],
    ['roles.manage', 'Gérer rôles et permissions', 'Entreprise'],
    ['settings.manage', 'Modifier les paramètres', 'Entreprise'],
    ['audit.view', "Consulter l'historique", 'Entreprise']
  ];
  const PERM_KEYS = new Set(PERMISSIONS.map(p => p[0]));

  /* Entités (une collection = une entité ; SaleItem/InvoiceItem sont imbriqués) */
  const COLLECTIONS = ['primes', 'stockCats', 'absences','roles', 'employees', 'customers', 'products', 'inventory', 'inventoryTx', 'partners',
    'sales', 'commissions', 'invoices', 'bills', 'expenses', 'payrolls', 'bank', 'sessions', 'warnings',
    'signups', 'notifications', 'audit'];

  /* Classes GTA : 0 Compactes, 1 Berlines, 2 SUV, 3 Coupés, 4 Muscle, 5 Sport classiques, 6 Sportives, 7 Super,
   * 8 Motos, 9 Tout-terrain, 10 Industriels, 11 Utilitaires, 12 Vans, 13 Vélos, 14 Bateaux, 15 Hélicos, 16 Avions,
   * 17 Service, 18 Urgence, 19 Militaires, 20 Commerciaux, 21 Trains, 22 Open wheel */
  const GTA_CLASSES = ['Compactes', 'Berlines', 'SUV', 'Coupés', 'Muscle', 'Sport classiques', 'Sportives', 'Super', 'Motos', 'Tout-terrain', 'Industriels', 'Utilitaires', 'Vans', 'Vélos', 'Bateaux', 'Hélicoptères', 'Avions', 'Service', 'Urgence', 'Militaires', 'Commerciaux', 'Trains', 'Open wheel'];
  const GTA_DEFAULT = [1, 2, 2, 2, 3, 3, 3, 4, 1, 2, 5, 2, 2, 1, 5, 5, 5, 2, 5, 5, 5, 5, 5];
  const vkey = s => String(s || '').toLowerCase().replace(/\[[^\]]*\]/g, '').normalize('NFD').replace(/[^a-z0-9]/g, '');
  /* catégorie d'après la liste des modèles (nom technique ou nom affiché) */
  const modelClass = (db, model, name) => {
    const t = (db.company && db.company.modelClasses) || {}, a = vkey(model), b = vkey(name);
    return a && a in t ? t[a] : b && b in t ? t[b] : null;
  };
  function defaultCompany() {
    return {
      name: 'Los Santos Customs', subtitle: 'Management & Comptabilité', description: 'Garage, réparation et customisation automobile.',
      address: 'Burton, Los Santos', phone: '555-0199', logo: 'img/logo.png',
      currency: '$', taxRate: 0, rounding: 1, maxDiscountPct: 15, largeSale: 1000, invoiceDays: 7,
      categories: [
        { id: 'services', label: 'Services', icon: 'truck' },
        { id: 'reparations', label: 'Réparations', icon: 'wrench' },
        { id: 'peinture', label: 'Peinture & couleurs', icon: 'palette' },
        { id: 'performances', label: 'Performances', icon: 'gauge', vehicleClass: true },
        { id: 'custom', label: 'Customisation', icon: 'sparkles' }
      ],
      paymentMethods: [
        { id: 'cash', label: 'Espèces', icon: 'banknote', bank: false, enabled: true },
        { id: 'card', label: 'Carte', icon: 'credit-card', bank: true, enabled: true },
        { id: 'company', label: 'Compte entreprise', icon: 'building-2', bank: true, enabled: true },
        { id: 'invoice', label: 'Facturation', icon: 'file-text', bank: false, enabled: true }
      ],
      /* Facturation réservée aux partenariats et grosses commandes ; sinon paiement direct */
      invoiceThreshold: 0, directPayment: 'card',
      /* Catégorie (1 à 5) par modèle de véhicule (se remplit à chaque vente, modifiable) */
      modelClasses: {},
      /* Classe GTA (GetVehicleClass, 0 à 22) -> catégorie 1 à 5, utilisée en jeu */
      gtaClasses: GTA_DEFAULT.slice(),
      /* Licenciement : étapes à cocher avant de confirmer (modifiables dans Paramètres) */
      dismissChecklist: [
        { id: 'dc_company', label: "Company : retiré de l'entreprise en jeu" },
        { id: 'dc_discord', label: 'Discord : rôles retirés' },
        { id: 'dc_compta', label: 'Compta : dernier salaire réglé' }
      ],
      /* GLife : ID de l'entreprise (factures en jeu) */
      glifeCompanyId: 139,
      /* Catégories de véhicules (1 à 5) utilisées par l'onglet Performances */
      vehicleClasses: ['Compactes & citadines', 'Berlines & SUV', 'Sportives', 'Super-sportives', 'Exotiques & spéciales'],
      /* prérequis hebdomadaires pour la paie (rond vert / rouge dans Salaires) */
      payrollRules: { quota: 1000, absence: 'exempt', minDays: 7, roles: [] },
      adverts: [{
        id: 'adv_ouvert', label: 'Ouvert', title: '~p~ Ouvert', image: 'https://imgg.fr/r/qNcalpr9.png',
        message: '🔧 On répare, on customise, on fait briller ton moteur dans une ambiance chaleureuse.✨ 🚙 Un souci sous le capot ? Pas de panique, on a la solution.'
      }],
      discountReasons: ['Client fidèle', 'Geste commercial', 'Partenaire', 'Erreur de prix'],
      markupReasons: ['Intervention de nuit', 'Urgence', 'Zone éloignée', 'Pièce spéciale'],
      /* Frais : uniquement des commandes (prix unitaire par défaut, modifiable dans Paramètres) */
      expenseCategories: [
        { id: 'moteur', label: 'Commande moteur', price: 1200 },
        { id: 'kit_carro', label: 'Commande kit carrosserie', price: 150 },
        { id: 'karcher', label: 'Commande Kärcher', price: 350 }
      ],
      /* Primes automatiques, calculées à chaque génération de paie (aucune par défaut) */
      primeRules: [],
      /* Paie : commission = % du bénéfice de la vente (prix − coût), ou du CA ; motif du virement « S40 Paye LS Customs » */
      commissionBase: 'margin',
      payReason: 'Paye LS Customs',
      /* Impôt par tranches (barème de la mairie) sur le résultat imposable */
      taxBrackets: [{ upTo: 20000, rate: 10 }, { upTo: 50000, rate: 20 }, { upTo: null, rate: 30 }],
      notify: { lowStock: true, overdue: true, signup: true, largeSale: true, service: true, payment: true }
    };
  }

  function emptyDb() {
    const db = { meta: { version: 1, layout: 7, balance: 0, seq: { sale: 0, invoice: 0, warning: 0 } }, company: defaultCompany() };
    COLLECTIONS.forEach(k => { db[k] = []; });
    return db;
  }

  /* ---------- utilitaires ---------- */
  const clone = o => JSON.parse(JSON.stringify(o));
  const uid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const roundTo = (n, step) => { step = +step || 1; return Math.round(Math.round((+n || 0) / step) * step * 100) / 100; };
  const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n * 100) / 100).toLocaleString('en-US');
  const fmtD = t => { const d = new Date(t); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); };
  const fmtDur = m => pad(Math.floor(m / 60)) + 'h' + pad(Math.round(m % 60));
  const str = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
  const num = (v, min = 0, max = 1e9) => { const n = +v; return isFinite(n) ? Math.min(max, Math.max(min, n)) : min; };
  const firstName = n => String(n || '').split(' ')[0];
  function fail(msg) { const e = new Error(msg); e.userError = true; throw e; }
  function find(list, id, label) { const x = list.find(i => i.id === id); if (!x) fail(label + ' introuvable'); return x; }
  const roleOf = (db, emp) => db.roles.find(r => r.id === emp.roleId) || { id: null, name: '—', perms: [], commission: 0, rank: 0, salary: 0, hourly: 0 };
  const hasPerm = (role, p) => role.perms.includes('*') || role.perms.includes(p);
  const customerName = c => c ? (c.firstName + ' ' + c.lastName).trim() : 'Client de passage';

  function minutesOf(s, until) {
    const end = s.end ? Date.parse(s.end) : until;
    let m = (end - Date.parse(s.start)) / 6e4;
    (s.pauses || []).forEach(p => { m -= ((p.end ? Date.parse(p.end) : until) - Date.parse(p.start)) / 6e4; });
    return Math.max(0, Math.round(m));
  }

  /* ---------- tarification (partagée UI / serveur) ---------- */
  function unitPrice(product, partner) {
    if (partner && partner.prices && partner.prices[product.id] != null) return +partner.prices[product.id];
    if (partner && partner.rate) return product.price * (1 - partner.rate / 100);
    return product.price;
  }
  function adjAmount(spec, base) {
    if (!spec || !(+spec.value > 0)) return 0;
    return spec.type === 'fixed' ? +spec.value : base * Math.min(+spec.value, 100) / 100;
  }
  function stockOf(db, product) {
    if (!product.inventoryId) return null;
    const it = db.inventory.find(i => i.id === product.inventoryId);
    return it ? Math.floor(it.qty / (product.consume || 1)) : null;
  }
  /* Calcule un panier. L'UI l'utilise pour l'affichage, le serveur pour la vérité. */
  function quote(db, input, rate) {
    const r = n => roundTo(n, db.company.rounding);
    const partner = input.partnerId ? db.partners.find(p => p.id === input.partnerId) : null;
    const qty = new Map();
    (Array.isArray(input.items) ? input.items : []).forEach(l => {
      const q = Math.floor(+l.qty);
      if (l && l.productId && q > 0) qty.set(l.productId, Math.min(999, (qty.get(l.productId) || 0) + q));
    });
    const items = [], missing = [];
    qty.forEach((q, id) => {
      const p = db.products.find(x => x.id === id);
      if (!p) { missing.push(id); return; }
      const price = r(unitPrice(p, partner));
      items.push({ productId: id, name: p.name, category: p.category, price, cost: +p.cost || 0, qty: q, total: r(price * q) });
    });
    const subtotal = r(items.reduce((s, i) => s + i.total, 0));
    const factory = r(items.reduce((s, i) => s + i.cost * i.qty, 0));
    const discount = r(Math.min(adjAmount(input.discount, subtotal), subtotal));
    const markup = r(adjAmount(input.markup, subtotal));
    const total = r(Math.max(0, subtotal - discount + markup));
    rate = +rate || 0;
    /* la commission se calcule sur le bénéfice de la vente (prix − coût usine / kit), sauf réglage « CA » */
    const base = db.company.commissionBase === 'revenue' ? total : Math.max(0, total - factory);
    return { items, missing, partner, subtotal, factory, discount, markup, total, commissionRate: rate, commission: r(base * rate / 100) };
  }

  /* ---------- contexte d'exécution d'une action ---------- */
  function context(db, actorId, now) {
    const me = db.employees.find(e => e.id === actorId && !e.archived);
    if (!me) fail('Session invalide : employé introuvable ou archivé');
    if (me.status === 'suspended') fail('Votre compte est suspendu');
    if (me.dismissal && me.dismissal.done) fail('Votre compte a été fermé (licenciement)');
    const role = roleOf(db, me);
    const can = p => hasPerm(role, p);
    const c = {
      db, me, role, can, now, iso: new Date(now).toISOString(),
      r: n => roundTo(n, db.company.rounding),
      need(...ps) { if (!ps.some(can)) fail("Vous n'avez pas les permissions nécessaires"); },
      /* interdit d'agir sur un employé de grade égal/supérieur (sauf accès complet) */
      above(emp) { if (!can('*') && emp.id !== me.id && roleOf(db, emp).rank >= role.rank) fail('Action impossible sur un employé de grade égal ou supérieur'); },
      audit(action, text) {
        db.audit.push({ id: uid('log'), at: c.iso, actorId: me.id, actor: me.name, action, text: firstName(me.name) + ' ' + text });
        if (db.audit.length > 5000) db.audit.splice(0, db.audit.length - 5000);
      },
      notify(type, title, body, level, route) {
        if (db.company.notify && db.company.notify[type] === false) return;
        db.notifications.push({ id: uid('ntf'), type, title, body, level: level || 'info', route: route || '', at: c.iso, read: false });
        if (db.notifications.length > 80) db.notifications.splice(0, db.notifications.length - 80);
      },
      bank(type, amount, category, label, ref) {
        if (!(amount > 0)) return null;
        const t = { id: uid('bnk'), type, amount: c.r(amount), category, label, ref: ref || null, at: c.iso, by: me.id };
        db.bank.push(t);
        db.meta.balance = c.r((db.meta.balance || 0) + (type === 'in' ? t.amount : -t.amount));
        return t;
      },
      stock(itemId, delta, reason, ref) {
        const it = find(db.inventory, itemId, 'Article');
        const before = it.qty;
        it.qty = Math.round((it.qty + delta) * 100) / 100;
        db.inventoryTx.push({ id: uid('itx'), itemId, name: it.name, categoryId: it.categoryId || null, delta, qty: it.qty, reason, ref: ref || null, by: me.id, at: c.iso });
        if (it.qty <= it.min && before > it.min) c.notify('lowStock', 'Stock faible', `${it.name} : ${it.qty} ${it.unit || ''} restants`.trim(), 'warn', 'inventory');
        /* suivi Discord : chaque entrée / sortie part sur le webhook de la catégorie */
        const cat = (db.stockCats || []).find(k => k.id === it.categoryId);
        if (cat && cat.webhook) c.effect({ type: 'discord', url: cat.webhook, body: stockEmbed(db, cat, it, delta, reason, me, c.iso) });
        return it;
      },
      /* effets externes (webhooks) exécutés par l'hôte une fois l'action enregistrée */
      effects: [],
      effect(e) { c.effects.push(e); }
    };
    return c;
  }

  const A = {};

  /* =================== POINT DE VENTE =================== */
  function adjRecord(c, spec, amount, subtotal, kind) {
    if (!(amount > 0)) return null;
    if (kind === 'discount') {
      c.need('pos.discount', 'pos.discount.unlimited');
      const pct = subtotal ? amount / subtotal * 100 : 100;
      const max = +c.db.company.maxDiscountPct || 0;
      if (!c.can('pos.discount.unlimited') && pct > max + 1e-9) fail(`Réduction limitée à ${max}% pour votre grade`);
    } else c.need('pos.markup');
    const reason = str(spec.reason, 120);
    if (!reason) fail('Indiquez le motif de la ' + (kind === 'discount' ? 'réduction' : 'majoration'));
    return { type: spec.type === 'fixed' ? 'fixed' : 'percent', value: +spec.value, amount, reason, by: c.me.id, byName: c.me.name, at: c.iso };
  }

  /* partenaire -> « à facturer » (facture générée depuis Factures) ; sinon paiement direct */
  function saleMode(db, partner) {
    const co = db.company;
    if (partner) return { payment: 'invoice', reason: 'partner' };
    return { payment: co.directPayment === 'cash' || co.directPayment === 'company' ? co.directPayment : 'card', reason: 'direct' };
  }
  /* Sorties / retours de stock : un message par webhook (celui du produit, sinon celui par défaut) */
  function stockWebhooks(c, sale, back) {
    const groups = {};
    sale.items.forEach(i => {
      const pr = c.db.products.find(x => x.id === i.productId), url = (pr && pr.webhook) || c.db.company.stockWebhook;
      if (url) (groups[url] = groups[url] || []).push(`• ${i.name} ×${i.qty * ((pr && pr.consume) || 1)}`);
    });
    const v = sale.vehicle;
    Object.keys(groups).forEach(url => c.effect({ type: 'discord', url, body: {
      username: (c.db.company.name || 'LS Customs') + ' — Stock',
      embeds: [{
        title: `${back ? '📥 Retour en stock — annulation' : '📤 Sortie de stock — vente'} #${sale.ref}`, color: back ? 0x1fd1a5 : 0xef5d5d,
        description: groups[url].join('\n'),
        fields: [{ name: 'Employé', value: c.me.name + (c.me.charId ? ` (Char ID ${c.me.charId})` : ''), inline: true },
          ...(v && (v.plate || v.name) ? [{ name: 'Véhicule', value: `${v.name || v.model || ''} ${v.plate ? '(' + v.plate + ')' : ''}${v.class ? ' · Cat. ' + v.class : ''}`.trim(), inline: true }] : []),
          ...(sale.partnerName ? [{ name: 'Partenaire', value: sale.partnerName, inline: true }] : [])],
        timestamp: c.iso
      }]
    } }));
  }
  A['pos.createSale'] = (c, p) => {
    c.need('pos.use');
    const db = c.db;
    const partner = p.partnerId ? find(db.partners, p.partnerId, 'Partenaire') : null;
    const q = quote(db, { items: p.items, partnerId: partner && partner.id, discount: p.discount, markup: p.markup }, c.role.commission);
    if (q.missing.length) fail("Un article du panier n'existe plus");
    if (!q.items.length) fail('Le panier est vide');
    /* Mode de paiement décidé par le serveur : partenaire -> à facturer, sinon paiement direct */
    const mode = saleMode(db, partner);
    const method = (db.company.paymentMethods || []).find(m => m.id === mode.payment);
    if (!method) fail('Mode de paiement invalide');
    const need = {};
    q.items.forEach(i => {
      const pr = db.products.find(x => x.id === i.productId);
      if (!pr.active) fail(pr.name + ' est désactivé');
      if (pr.inventoryId && db.inventory.some(x => x.id === pr.inventoryId)) need[pr.inventoryId] = (need[pr.inventoryId] || 0) + i.qty * (pr.consume || 1);
    });
    Object.keys(need).forEach(id => {
      const it = db.inventory.find(x => x.id === id);
      if (it.qty < need[id]) fail(`Stock insuffisant : ${it.name} (${it.qty} restants)`);
    });
    const discount = adjRecord(c, p.discount, q.discount, q.subtotal, 'discount');
    const markup = adjRecord(c, p.markup, q.markup, q.subtotal, 'markup');
    /* Catégorie du véhicule (1-5) : obligatoire pour les catégories « selon le véhicule » */
    const vcats = new Set(db.company.categories.filter(k => k.vehicleClass).map(k => k.id));
    const pv = p.vehicle || {}, vClass = Math.floor(+pv.class), plate = str(pv.plate, 12).toUpperCase();
    const needClass = q.items.some(i => vcats.has(i.category));
    if (needClass) {
      if (!(vClass >= 1 && vClass <= 5)) fail('Choisissez la catégorie du véhicule (1 à 5)');
      q.items.forEach(i => {
        const pr = db.products.find(x => x.id === i.productId);
        if (vcats.has(pr.category) && (pr.classes || []).length && !pr.classes.includes(vClass)) fail(`${pr.name} n'est pas disponible pour un véhicule de catégorie ${vClass}`);
      });
    }
    const vehicle = needClass || plate ? { plate, class: vClass >= 1 && vClass <= 5 ? vClass : null, source: pv.source === 'auto' ? 'auto' : 'manual',
      model: str(pv.model, 40).toLowerCase() || null, name: str(pv.name, 60) || null } : null;

    /* --- à partir d'ici, plus aucune validation : on écrit --- */
    const n = ++db.meta.seq.sale;
    const ref = 'LSC-' + pad(n, 6);
    [discount, markup].forEach(a => a && Object.assign(a, { original: q.subtotal, final: q.total }));
    const sale = {
      id: uid('sale'), num: n, ref, employeeId: c.me.id, employeeName: c.me.name,
      customerId: null, customerName: partner ? partner.name : 'Client',
      partnerId: partner ? partner.id : null, partnerName: partner ? partner.name : null,
      items: q.items, subtotal: q.subtotal, factory: q.factory, discount, markup, total: q.total,
      commissionRate: q.commissionRate, commission: q.commission,
      payment: method.id, status: method.id === 'invoice' ? 'pending' : 'paid', note: str(p.note, 300), vehicle, createdAt: c.iso
    };
    db.sales.push(sale);
    if (q.commission > 0) db.commissions.push({ id: uid('com'), employeeId: c.me.id, saleId: sale.id, ref, amount: q.commission, rate: q.commissionRate, createdAt: c.iso, payrollId: null });
    if (method.bank) c.bank('in', sale.total, 'vente', `Vente #${ref}`, sale.id);
    Object.keys(need).forEach(id => c.stock(id, -need[id], 'Vente #' + ref, sale.id));
    stockWebhooks(c, sale, false);
    /* table modèle -> catégorie : apprise à la première vente du modèle (modifiable dans Paramètres) */
    if (vehicle && vehicle.class && (vehicle.model || vehicle.name) && modelClass(db, vehicle.model, vehicle.name) == null) {
      const u = (db.meta.unlisted || {})[vkey(vehicle.model || vehicle.name)];
      if (u) { u.chosen = vehicle.class; u.sales = (u.sales || 0) + 1; }
    }
    if (sale.total >= (+db.company.largeSale || Infinity) && db.company.saleWebhook) c.effect({ type: 'discord', url: db.company.saleWebhook, body: {
      username: (db.company.name || 'LS Customs') + ' — Ventes',
      embeds: [{ title: `💰 Grosse vente #${ref} — ${money(sale.total)}`, color: 0x1fd1a5,
        description: sale.items.map(i => `• ${i.name} ×${i.qty} — ${money(i.total)}`).join('\n'),
        fields: [{ name: 'Employé', value: c.me.name + (c.me.charId ? ` (Char ID ${c.me.charId})` : ''), inline: true },
          ...(vehicle && (vehicle.plate || vehicle.name) ? [{ name: 'Véhicule', value: `${vehicle.name || vehicle.model || ''} ${vehicle.plate ? '(' + vehicle.plate + ')' : ''}${vehicle.class ? ' · Cat. ' + vehicle.class : ''}`.trim(), inline: true }] : []),
          ...(partner ? [{ name: 'Partenaire', value: partner.name, inline: true }] : []),
          ...(discount ? [{ name: 'Réduction', value: `${money(discount.amount)} — ${discount.reason}` }] : [])],
        timestamp: c.iso }]
    } });
    if (sale.total >= (+db.company.largeSale || Infinity)) c.notify('largeSale', 'Vente importante', `#${ref} — ${money(sale.total)} par ${c.me.name}`, 'ok', 'sales');
    c.audit('sale.create', `a créé la vente #${ref} (${money(sale.total)})${vehLabel(vehicle)}`);
    return { sale };
  };

  /* Catégorie d'un véhicule d'après sa plaque. Pour l'instant : dernière catégorie
   * connue dans l'historique des ventes. À brancher plus tard sur l'API véhicules. */
  A['vehicle.lookup'] = (c, p) => {
    c.need('pos.use');
    const plate = str(p.plate, 12).toUpperCase();
    if (!plate) fail('Plaque manquante');
    const all = c.db.sales.filter(x => x.vehicle && x.vehicle.plate === plate && x.status !== 'cancelled');
    const last = all[all.length - 1], model = str(p.model, 40).toLowerCase(), name = str(p.name, 60);
    const base = { readonly: true, plate, count: all.length, lastAt: last ? last.createdAt : null };
    /* 1. liste des modèles (Paramètres) : catégorie sélectionnée automatiquement */
    const fixed = modelClass(c.db, model, name);
    if (fixed != null) return Object.assign(base, { class: fixed || null, none: fixed === 0, source: 'table', listed: true });
    /* 2. modèle connu mais non recensé : pas de catégorie automatique, à vérifier en jeu */
    const prev = all.slice().reverse().find(x => x.vehicle.class && (!model || x.vehicle.model === model));
    if (model || name) return Object.assign(base, { class: null, source: null, listed: false, hint: prev ? prev.vehicle.class : null });
    /* 3. plaque seule (modèle inconnu) : dernière catégorie utilisée pour cette plaque */
    return Object.assign(base, { class: prev ? prev.vehicle.class : null, source: prev ? 'history' : null });
  };

  A['vehicle.report'] = (c, p) => {
    c.need('pos.use');
    const model = str(p.model, 40).toLowerCase(), name = str(p.name, 60), key = vkey(model || name);
    if (!key || modelClass(c.db, model, name) != null) return { readonly: true };
    const u = c.db.meta.unlisted = c.db.meta.unlisted || {};
    if (u[key]) return { readonly: true }; // déjà signalé
    u[key] = { model, name, plate: str(p.plate, 12).toUpperCase(), by: c.me.name, at: c.iso, hint: Math.floor(+p.hint) >= 1 && Math.floor(+p.hint) <= 5 ? Math.floor(+p.hint) : null };
    const co = c.db.company;
    if (co.unlistedWebhook) c.effect({ type: 'discord', url: co.unlistedWebhook, body: {
      username: (co.name || 'LS Customs') + ' — Véhicules',
      embeds: [{ title: `❓ Véhicule non recensé : ${name || model}`, color: 0xf0b43c,
        fields: [{ name: 'Modèle', value: model || '—', inline: true }, { name: 'Plaque', value: u[key].plate || '—', inline: true },
          { name: 'Signalé par', value: c.me.name + (c.me.charId ? ` (Char ID ${c.me.charId})` : ''), inline: true },
          { name: 'À faire', value: 'Ajouter sa catégorie : Paramètres → Catégories de véhicules → À recenser' }],
        timestamp: c.iso }]
    } });
    return { reported: true };
  };

  A['sales.cancel'] = (c, p) => {
    c.need('sales.cancel');
    const db = c.db, s = find(db.sales, p.id, 'Vente');
    if (s.status === 'cancelled') fail('Vente déjà annulée');
    const reason = str(p.reason, 200) || 'Sans motif';
    const banked = db.bank.filter(t => t.type === 'in' && (t.ref === s.id || (s.invoiceId && t.ref === s.invoiceId))).reduce((a, t) => a + t.amount, 0);
    s.status = 'cancelled'; s.cancelledAt = c.iso; s.cancelledBy = c.me.name; s.cancelReason = reason;
    if (banked) c.bank('out', banked, 'remboursement', `Annulation vente #${s.ref}`, s.id);
    s.items.forEach(i => {
      const pr = db.products.find(x => x.id === i.productId);
      if (pr && pr.inventoryId && db.inventory.some(x => x.id === pr.inventoryId)) c.stock(pr.inventoryId, i.qty * (pr.consume || 1), 'Annulation #' + s.ref, s.id);
    });
    const regul = db.commissions.filter(x => x.saleId === s.id && x.payrollId && x.amount > 0);
    db.commissions = db.commissions.filter(x => !(x.saleId === s.id && !x.payrollId));
    regul.forEach(x => db.commissions.push({ id: uid('com'), employeeId: x.employeeId, saleId: s.id, ref: s.ref, amount: -x.amount, rate: x.rate, createdAt: c.iso, payrollId: null, note: 'Régularisation annulation' }));
    if (s.invoiceId) {
      const inv = db.invoices.find(i => i.id === s.invoiceId);
      if (inv && inv.status !== 'paid' && inv.saleIds) {
        inv.saleIds = inv.saleIds.filter(x => x !== s.id);
        inv.items = inv.items.filter(l => l.saleId !== s.id);
        inv.total = c.r(inv.items.reduce((a, l) => a + l.price * l.qty, 0));
        if (!inv.saleIds.length) inv.status = 'cancelled';
      } else if (inv && inv.status !== 'paid') inv.status = 'cancelled';
    }
    stockWebhooks(c, s, true);
    c.audit('sale.cancel', `a annulé la vente #${s.ref} (${reason})`);
  };

  /* =================== CLIENTS =================== */
  A['customers.save'] = (c, p) => {
    const db = c.db;
    const data = { firstName: str(p.firstName, 40), lastName: str(p.lastName, 40), playerId: str(p.playerId, 20), phone: str(p.phone, 20), notes: str(p.notes, 300) };
    if (!data.firstName || !data.lastName) fail('Nom et prénom obligatoires');
    if (data.playerId && db.customers.some(x => x.playerId === data.playerId && x.id !== p.id)) fail('Un client possède déjà cet ID joueur');
    if (p.id) {
      c.need('customers.manage');
      Object.assign(find(db.customers, p.id, 'Client'), data);
      c.audit('customer.update', `a modifié le client ${customerName(data)}`);
      return { id: p.id };
    }
    c.need('pos.use', 'customers.manage');
    const cu = Object.assign({ id: uid('cus'), createdAt: c.iso }, data);
    db.customers.push(cu);
    c.audit('customer.create', `a créé le client ${customerName(cu)}`);
    return { id: cu.id };
  };
  A['customers.delete'] = (c, p) => {
    c.need('customers.manage');
    const cu = find(c.db.customers, p.id, 'Client');
    c.db.customers = c.db.customers.filter(x => x.id !== p.id);
    c.audit('customer.delete', `a supprimé le client ${customerName(cu)}`);
  };

  /* =================== PRODUITS =================== */
  A['products.save'] = (c, p) => {
    c.need('products.manage');
    const db = c.db;
    const cats = db.company.categories.map(x => x.id);
    const data = {
      name: str(p.name, 60), description: str(p.description, 300), category: cats.includes(p.category) ? p.category : (cats[cats.length - 1] || 'autres'),
      image: str(p.image, 500), icon: str(p.icon, 40) || 'wrench', cost: c.r(num(p.cost)), price: c.r(num(p.price)),
      consume: num(p.consume, 1, 1000) || 1, visible: p.visible !== false, active: p.active !== false,
      classes: [...new Set((Array.isArray(p.classes) ? p.classes : []).map(Number).filter(n => n >= 1 && n <= 5))].sort()
    };
    if (!data.name) fail('Nom obligatoire');
    const cat = db.company.categories.find(x => x.id === data.category);
    data.sub = cat && (cat.subs || []).some(s => s.id === p.sub) ? p.sub : null;
    let invId = p.inventoryId || null;
    if (invId === '__new') {
      const it = { id: uid('stk'), name: data.name, qty: 0, min: 5, unit: 'u', cost: data.cost };
      db.inventory.push(it); invId = it.id;
    } else if (invId && !db.inventory.some(i => i.id === invId)) fail("Article d'inventaire introuvable");
    data.inventoryId = invId;
    /* webhook Discord des sorties : vide = inchangé, « - » = retirer */
    const wh = str(p.webhook, 300);
    if (wh === '-') data.webhook = '';
    else if (wh) { if (!WEBHOOK_RE.test(wh)) fail('URL de webhook Discord invalide'); data.webhook = wh; }
    let prod;
    if (p.id) {
      prod = find(db.products, p.id, 'Produit');
      if (prod.price !== data.price) c.audit('product.price', `a modifié le prix du service ${data.name} (${money(prod.price)} → ${money(data.price)})`);
      Object.assign(prod, data);
      c.audit('product.update', `a modifié le produit ${data.name}`);
    } else {
      const last = db.products.reduce((m, x) => Math.max(m, x.order || 0), 0);
      prod = Object.assign({ id: uid('prd'), createdAt: c.iso, order: last + 1 }, data);
      db.products.push(prod);
      c.audit('product.create', `a créé le produit ${data.name}`);
    }
    if (invId && p.stock != null && p.stock !== '') {
      const it = db.inventory.find(i => i.id === invId), target = num(p.stock, 0, 1e6);
      if (target !== it.qty) c.stock(invId, target - it.qty, 'Ajustement (fiche produit)');
    }
    return { id: prod.id };
  };
  /* Catalogue du POS : ordre/création des catégories et rangement des produits */
  A['catalog.arrange'] = (c, p) => {
    c.need('products.manage');
    const db = c.db;
    if (Array.isArray(p.categories)) {
      const seen = new Set();
      const cats = p.categories.map(x => {
        const ss = new Set();
        const subs = (Array.isArray(x.subs) ? x.subs : []).map(s => ({ id: str(s.id, 40) || uid('sub'), label: str(s.label, 30) })).filter(s => s.label && !ss.has(s.id) && ss.add(s.id));
        return { id: str(x.id, 40) || uid('cat'), label: str(x.label, 30), icon: str(x.icon, 40) || 'package', vehicleClass: !!x.vehicleClass, subs };
      }).filter(x => x.label && !seen.has(x.id) && seen.add(x.id));
      if (!cats.length) fail('Au moins une catégorie est requise');
      const used = db.products.find(pr => !cats.some(x => x.id === pr.category));
      if (used) fail(`Catégorie non vide : déplacez d'abord « ${used.name} »`);
      db.company.categories = cats;
    }
    if (Array.isArray(p.products)) {
      p.products.forEach((x, i) => {
        const pr = db.products.find(y => y.id === (x && x.id));
        if (!pr) return;
        if (x.category && db.company.categories.some(k => k.id === x.category)) pr.category = x.category;
        if ('sub' in x) pr.sub = x.sub || null;
        pr.order = i + 1;
      });
    }
    /* un article dont la sous-catégorie n'existe plus revient dans la catégorie */
    db.products.forEach(pr => {
      const k = db.company.categories.find(x => x.id === pr.category);
      if (pr.sub && !(k && (k.subs || []).some(s => s.id === pr.sub))) pr.sub = null;
    });
    c.audit('catalog.arrange', 'a réorganisé le catalogue du point de vente');
  };
  A['products.toggle'] = (c, p) => {
    c.need('products.manage');
    const prod = find(c.db.products, p.id, 'Produit');
    if (!['active', 'visible'].includes(p.field)) fail('Champ invalide');
    prod[p.field] = !prod[p.field];
    c.audit('product.toggle', `a ${prod[p.field] ? 'activé' : 'désactivé'} « ${p.field === 'visible' ? 'visible au POS' : 'actif'} » pour ${prod.name}`);
  };
  A['products.delete'] = (c, p) => {
    c.need('products.manage');
    const prod = find(c.db.products, p.id, 'Produit');
    c.db.products = c.db.products.filter(x => x.id !== p.id);
    c.audit('product.delete', `a supprimé le produit ${prod.name}`);
  };

  /* =================== STOCK : catégories + webhooks Discord =================== */
  const WEBHOOK_RE = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
  function stockEmbed(db, cat, it, delta, reason, me, at) {
    const isIn = delta > 0;
    return {
      username: (db.company.name || 'LS Customs') + ' — Stock',
      embeds: [{
        title: `${isIn ? '📥 Entrée' : '📤 Sortie'} — ${it.name}`,
        color: isIn ? 0x1fd1a5 : 0xef5d5d,
        fields: [
          { name: 'Quantité', value: (isIn ? '+' : '−') + Math.abs(delta) + (it.unit && it.unit !== 'u' ? ' ' + it.unit : ''), inline: true },
          { name: 'Stock restant', value: String(it.qty), inline: true },
          { name: 'Employé', value: me.name + (me.charId ? ` (Char ID ${me.charId})` : ''), inline: true },
          { name: 'Motif', value: reason || '—' }
        ],
        footer: { text: 'Catégorie : ' + cat.name },
        timestamp: at
      }]
    };
  }
  A['stock.cat.save'] = (c, p) => {
    c.need('inventory.manage');
    const data = { name: str(p.name, 40), icon: str(p.icon, 40) || 'package' };
    if (!data.name) fail('Nom obligatoire');
    const prev = p.id ? find(c.db.stockCats, p.id, 'Catégorie') : null;
    /* webhook : vide = inchangé à l'édition ; « - » = supprimer */
    const wh = str(p.webhook, 300);
    if (wh === '-') data.webhook = '';
    else if (wh) { if (!WEBHOOK_RE.test(wh)) fail('URL de webhook Discord invalide'); data.webhook = wh; }
    else if (!prev) data.webhook = '';
    if (prev) { Object.assign(prev, data); c.audit('stock.cat', `a modifié la catégorie de stock ${data.name}`); return { id: prev.id }; }
    const k = Object.assign({ id: uid('scat'), createdAt: c.iso }, data);
    c.db.stockCats.push(k);
    c.audit('stock.cat', `a créé la catégorie de stock ${data.name}`);
    return { id: k.id };
  };
  A['stock.cat.delete'] = (c, p) => {
    c.need('inventory.manage');
    const k = find(c.db.stockCats, p.id, 'Catégorie');
    if (c.db.inventory.some(i => i.categoryId === k.id)) fail('Catégorie non vide : déplacez ou supprimez ses articles');
    c.db.stockCats = c.db.stockCats.filter(x => x.id !== k.id);
    c.audit('stock.cat', `a supprimé la catégorie de stock ${k.name}`);
  };
  A['stock.cat.test'] = (c, p) => {
    c.need('inventory.manage');
    const k = find(c.db.stockCats, p.id, 'Catégorie');
    if (!k.webhook) fail('Aucun webhook configuré pour cette catégorie');
    c.effect({ type: 'discord', url: k.webhook, body: { username: (c.db.company.name || 'LS Customs') + ' — Stock', embeds: [{ title: '✅ Webhook connecté', description: `Les entrées et sorties de la catégorie **${k.name}** seront publiées ici.`, color: 0x1fd1a5, footer: { text: 'Test envoyé par ' + c.me.name }, timestamp: c.iso }] } });
    return { readonly: true };
  };
  /* Entrée / sortie manuelle d'un article (coffre, pièces, outillage...) */
  A['stock.move'] = (c, p) => {
    c.need('stock.move', 'inventory.manage');
    const it = find(c.db.inventory, p.id, 'Article');
    const qty = Math.abs(num(p.qty, 0, 1e6));
    if (!(qty > 0)) fail('Quantité invalide');
    const delta = p.type === 'out' ? -qty : qty;
    if (it.qty + delta < 0) fail(`Stock insuffisant : ${it.qty} ${it.name} disponible(s)`);
    const reason = str(p.reason, 120) || (delta > 0 ? 'Entrée' : 'Sortie');
    c.stock(it.id, delta, reason);
    c.audit('stock.move', `a ${delta > 0 ? 'rentré' : 'sorti'} ${qty} × ${it.name} (${reason})`);
    return { qty: it.qty };
  };

  /* =================== INVENTAIRE =================== */
  A['inventory.save'] = (c, p) => {
    c.need('inventory.manage');
    const data = { name: str(p.name, 60) };
    if (!data.name) fail('Nom obligatoire');
    if (p.categoryId !== undefined) data.categoryId = p.categoryId && c.db.stockCats.some(k => k.id === p.categoryId) ? p.categoryId : null;
    if (p.min != null && p.min !== '') data.min = num(p.min, 0, 1e6);
    if (p.unit) data.unit = str(p.unit, 12);
    if (p.cost != null && p.cost !== '') data.cost = c.r(num(p.cost));
    if (p.id) { Object.assign(find(c.db.inventory, p.id, 'Article'), data); c.audit('inventory.update', `a modifié l'article ${data.name}`); return { id: p.id }; }
    const it = Object.assign({ id: uid('stk'), qty: 0, min: 0, unit: 'u', cost: 0, categoryId: null }, data);
    c.db.inventory.push(it);
    if (num(p.qty) > 0) c.stock(it.id, num(p.qty, 0, 1e6), 'Stock initial');
    c.audit('inventory.create', `a créé l'article ${data.name}`);
    return { id: it.id };
  };
  A['inventory.adjust'] = (c, p) => {
    c.need('inventory.manage');
    const it = find(c.db.inventory, p.id, 'Article');
    const kinds = { production: 'Production', achat: 'Achat', perte: 'Perte', ajustement: 'Ajustement', retour: 'Retour' };
    const kind = kinds[p.kind] ? p.kind : 'ajustement';
    let delta = num(p.qty, -1e6, 1e6);
    if (!delta) fail('Quantité invalide');
    if (kind === 'perte') delta = -Math.abs(delta);
    if (kind === 'achat' || kind === 'production' || kind === 'retour') delta = Math.abs(delta);
    if (it.qty + delta < 0) fail('Le stock ne peut pas être négatif');
    c.stock(it.id, delta, kinds[kind] + (p.reason ? ' — ' + str(p.reason, 100) : ''));
    if (kind === 'achat') {
      const unit = p.cost != null && p.cost !== '' ? num(p.cost) : it.cost;
      c.bank('out', c.r(unit * delta), 'achat', `Achat stock — ${it.name} x${delta}`, it.id);
    }
    c.audit('inventory.adjust', `a ${delta > 0 ? 'ajouté' : 'retiré'} ${Math.abs(delta)} ${it.unit} de ${it.name} (${kinds[kind]})`);
  };
  A['inventory.delete'] = (c, p) => {
    c.need('inventory.manage');
    const it = find(c.db.inventory, p.id, 'Article');
    if (c.db.products.some(x => x.inventoryId === it.id)) fail('Article lié à un produit : retirez le lien avant de le supprimer');
    c.db.inventory = c.db.inventory.filter(x => x.id !== it.id);
    c.audit('inventory.delete', `a supprimé l'article ${it.name}`);
  };

  /* =================== PARTENAIRES =================== */
  A['partners.save'] = (c, p) => {
    c.need('partners.manage');
    const prices = {};
    Object.keys(p.prices || {}).forEach(k => {
      const v = p.prices[k];
      if (v !== '' && v != null && c.db.products.some(x => x.id === k)) prices[k] = c.r(num(v));
    });
    const data = { name: str(p.name, 60), type: str(p.type, 30) || 'entreprise', logo: str(p.logo, 500), contact: str(p.contact, 60), phone: str(p.phone, 20), rate: num(p.rate, 0, 100), notes: str(p.notes, 300), prices,
      pingUser: str(p.pingUser, 25), pingRole: str(p.pingRole, 25) };
    if (!data.name) fail('Nom obligatoire');
    if (data.pingUser && !/^\d{5,25}$/.test(data.pingUser)) fail('ID Discord invalide (chiffres uniquement)');
    if (data.pingRole && !/^\d{5,25}$/.test(data.pingRole)) fail('ID de rôle Discord invalide (chiffres uniquement)');
    /* webhook : vide = inchangé à l'édition ; « - » = supprimer */
    const prev = p.id ? find(c.db.partners, p.id, 'Partenaire') : null, wh = str(p.webhook, 300);
    if (wh === '-') data.webhook = '';
    else if (wh) { if (!WEBHOOK_RE.test(wh)) fail('URL de webhook Discord invalide'); data.webhook = wh; }
    else if (!prev) data.webhook = '';
    if (prev) { Object.assign(prev, data); c.audit('partner.update', `a modifié le partenaire ${data.name}`); return { id: p.id }; }
    const pa = Object.assign({ id: uid('par'), createdAt: c.iso }, data);
    c.db.partners.push(pa);
    c.audit('partner.create', `a ajouté le partenaire ${data.name}`);
    return { id: pa.id };
  };
  A['partners.delete'] = (c, p) => {
    c.need('partners.manage');
    const pa = find(c.db.partners, p.id, 'Partenaire');
    c.db.partners = c.db.partners.filter(x => x.id !== p.id);
    c.audit('partner.delete', `a supprimé le partenaire ${pa.name}`);
  };

  /* =================== FACTURATION CLIENT =================== */
  function invoiceLines(c, items) {
    const lines = (Array.isArray(items) ? items : []).map(i => {
      const pr = i.productId ? c.db.products.find(x => x.id === i.productId) : null;
      return { productId: pr ? pr.id : null, label: str(i.label, 80) || (pr ? pr.name : ''), price: c.r(num(i.price, -1e7, 1e7)), qty: Math.floor(num(i.qty, 1, 999)) || 1 };
    }).filter(l => l.label);
    if (!lines.length) fail('Ajoutez au moins une ligne');
    return lines;
  }
  /* Destinataire d'une facture : toujours un partenaire */
  function invoiceTarget(c, p) {
    if (!p.partnerId) fail('Choisissez un partenaire');
    const pa = find(c.db.partners, p.partnerId, 'Partenaire');
    return { partnerId: pa.id, customerId: null, customerName: pa.name };
  }
  /* Message Discord du partenaire (ping utilisateur / rôle) */
  function invoiceWebhook(c, inv, title) {
    const pa = c.db.partners.find(x => x.id === inv.partnerId);
    if (!pa || !pa.webhook) return;
    const ping = [pa.pingUser ? `<@${pa.pingUser}>` : '', pa.pingRole ? `<@&${pa.pingRole}>` : ''].filter(Boolean).join(' ');
    c.effect({ type: 'discord', url: pa.webhook, body: {
      username: (c.db.company.name || 'LS Customs') + ' — Facturation',
      content: ping || undefined,
      allowed_mentions: { users: pa.pingUser ? [pa.pingUser] : [], roles: pa.pingRole ? [pa.pingRole] : [] },
      embeds: [{
        title: `${title} — ${inv.ref}`, color: 0x1fd1a5,
        description: inv.items.slice(0, 15).map(l => `• ${l.label}${l.qty > 1 ? ' ×' + l.qty : ''} — ${money(l.price * l.qty)}`).join('\n') + (inv.items.length > 15 ? `\n… ${inv.items.length - 15} ligne(s) de plus` : ''),
        fields: [
          { name: 'Partenaire', value: pa.name, inline: true },
          { name: 'Montant', value: money(inv.total), inline: true },
          { name: 'Échéance', value: fmtD(inv.due), inline: true },
          ...(inv.note ? [{ name: 'Note', value: inv.note }] : [])
        ],
        footer: { text: 'Émise par ' + c.me.name }, timestamp: c.iso
      }]
    } });
  }
  function createInvoice(c, p, status, fromSale, built) {
    const items = built || invoiceLines(c, p.items);
    const total = c.r(items.reduce((s, l) => s + l.price * l.qty, 0));
    if (total < 0) fail('Le total ne peut pas être négatif');
    const target = invoiceTarget(c, p);
    const n = ++c.db.meta.seq.invoice;
    const inv = {
      id: uid('fac'), num: n, ref: 'FAC-' + pad(n, 4), ...target, items, total,
      due: p.due ? new Date(p.due).toISOString() : new Date(c.now + (c.db.company.invoiceDays || 7) * DAY).toISOString(),
      note: str(p.note, 300), status: status || 'draft', kind: p.kind || 'custom', saleId: p.saleId || null, saleIds: p.saleIds || null, createdBy: c.me.id, createdByName: c.me.name, createdAt: c.iso
    };
    c.db.invoices.push(inv);
    return inv;
  }
  A['invoices.save'] = (c, p) => {
    c.need('invoices.manage');
    if (p.id) {
      const inv = find(c.db.invoices, p.id, 'Facture');
      if (inv.status !== 'draft') fail('Seul un brouillon peut être modifié');
      const items = invoiceLines(c, p.items), total = c.r(items.reduce((s, l) => s + l.price * l.qty, 0));
      if (total < 0) fail('Le total ne peut pas être négatif');
      Object.assign(inv, invoiceTarget(c, p), { items, total, note: str(p.note, 300), due: p.due ? new Date(p.due).toISOString() : inv.due });
      c.audit('invoice.update', `a modifié la facture ${inv.ref}`);
      return { id: inv.id };
    }
    const inv = createInvoice(c, Object.assign({}, p, { kind: 'custom', saleIds: null, saleId: null }), p.send ? 'sent' : 'draft');
    if (p.send) invoiceWebhook(c, inv, 'Nouvelle facture');
    c.audit('invoice.create', `a créé la facture ${inv.ref} (${money(inv.total)})`);
    return { id: inv.id };
  };
  /* « — Blista (ALMADA) · Cat. 2 » : véhicule de la vente, pour les factures et l'historique */
  const vehLabel = v => v && (v.plate || v.name) ? ` — ${v.name || v.model || 'Véhicule'}${v.plate ? ' (' + v.plate + ')' : ''}${v.class ? ' · Cat. ' + v.class : ''}` : '';
  /* Facture automatique : regroupe toutes les ventes du partenaire pas encore facturées */
  A['invoices.generate'] = (c, p) => {
    c.need('invoices.manage');
    const pa = find(c.db.partners, p.partnerId, 'Partenaire');
    const sales = c.db.sales.filter(x => x.partnerId === pa.id && x.status === 'pending' && !x.invoiceId);
    if (!sales.length) fail(`Aucune vente à facturer pour ${pa.name}`);
    const items = sales.map(x => ({ saleId: x.id, label: `Vente #${x.ref} (${fmtD(x.createdAt)})${vehLabel(x.vehicle)} — ${x.items.map(i => i.name + (i.qty > 1 ? ' ×' + i.qty : '')).join(', ')}`.slice(0, 200), price: x.total, qty: 1 }));
    const from = sales[0].createdAt, to = sales[sales.length - 1].createdAt;
    const inv = createInvoice(c, { partnerId: pa.id, items: [], kind: 'auto', saleIds: sales.map(x => x.id), note: `${sales.length} vente(s) du ${fmtD(from)} au ${fmtD(to)}` }, 'sent', true, items);
    sales.forEach(x => { x.invoiceId = inv.id; });
    invoiceWebhook(c, inv, 'Facture');
    c.audit('invoice.generate', `a généré la facture ${inv.ref} pour ${pa.name} (${money(inv.total)}, ${sales.length} vente(s))`);
    return { id: inv.id };
  };
  A['invoices.send'] = (c, p) => {
    c.need('invoices.manage');
    const inv = find(c.db.invoices, p.id, 'Facture');
    if (inv.status !== 'draft') fail('Facture déjà envoyée');
    inv.status = 'sent'; inv.sentAt = c.iso;
    invoiceWebhook(c, inv, 'Nouvelle facture');
    c.audit('invoice.send', `a envoyé la facture ${inv.ref} à ${inv.customerName}`);
  };
  A['invoices.pay'] = (c, p) => {
    c.need('invoices.manage');
    const inv = find(c.db.invoices, p.id, 'Facture');
    if (inv.status !== 'sent' && inv.status !== 'draft') fail('Cette facture ne peut pas être encaissée');
    inv.status = 'paid'; inv.paidAt = c.iso; inv.paidBy = c.me.name; inv.method = p.method === 'cash' ? 'cash' : 'bank';
    if (inv.method === 'bank') c.bank('in', inv.total, 'facture', `Facture ${inv.ref} — ${inv.customerName}`, inv.id);
    (inv.saleIds || (inv.saleId ? [inv.saleId] : [])).forEach(id => { const s = c.db.sales.find(x => x.id === id); if (s && s.status === 'pending') s.status = 'paid'; });
    c.notify('payment', 'Paiement reçu', `Facture ${inv.ref} — ${money(inv.total)} (${inv.customerName})`, 'ok', 'invoices');
    c.audit('invoice.pay', `a validé le paiement de la facture ${inv.ref}`);
  };
  A['invoices.cancel'] = (c, p) => {
    c.need('invoices.manage');
    const inv = find(c.db.invoices, p.id, 'Facture');
    if (inv.status === 'paid' || inv.status === 'cancelled') fail('Facture déjà réglée ou annulée');
    if (inv.saleId) fail('Facture liée à une vente : annulez la vente depuis la page Ventes');
    inv.status = 'cancelled'; inv.cancelledAt = c.iso;
    /* facture automatique annulée : les ventes redeviennent « à facturer » */
    (inv.saleIds || []).forEach(id => { const s = c.db.sales.find(x => x.id === id); if (s && s.invoiceId === inv.id) s.invoiceId = null; });
    c.audit('invoice.cancel', `a annulé la facture ${inv.ref}`);
  };
  A['invoices.delete'] = (c, p) => {
    c.need('invoices.manage');
    const inv = find(c.db.invoices, p.id, 'Facture');
    if (inv.status !== 'draft') fail('Seul un brouillon peut être supprimé');
    c.db.invoices = c.db.invoices.filter(x => x.id !== inv.id);
    c.audit('invoice.delete', `a supprimé le brouillon ${inv.ref}`);
  };

  /* =================== FACTURES FOURNISSEURS =================== */
  A['bills.save'] = (c, p) => {
    c.need('bills.manage');
    const data = { supplier: str(p.supplier, 60), ref: str(p.ref, 30), amount: c.r(num(p.amount, 0, 1e8)), due: p.due ? new Date(p.due).toISOString() : c.iso, category: str(p.category, 30) || 'fournisseurs', note: str(p.note, 300) };
    if (!data.supplier || !data.ref) fail('Fournisseur et numéro obligatoires');
    if (!(data.amount > 0)) fail('Montant invalide');
    if (p.id) {
      const b = find(c.db.bills, p.id, 'Facture fournisseur');
      if (b.status === 'paid') fail('Facture déjà payée');
      Object.assign(b, data); c.audit('bill.update', `a modifié la facture fournisseur #${data.ref}`); return { id: b.id };
    }
    const b = Object.assign({ id: uid('bil'), status: 'pending', createdAt: c.iso }, data);
    c.db.bills.push(b);
    c.audit('bill.create', `a enregistré la facture fournisseur ${data.supplier} #${data.ref} (${money(data.amount)})`);
    return { id: b.id };
  };
  A['bills.pay'] = (c, p) => {
    c.need('bills.manage');
    const b = find(c.db.bills, p.id, 'Facture fournisseur');
    if (b.status === 'paid') fail('Facture déjà payée');
    b.status = 'paid'; b.paidAt = c.iso; b.paidBy = c.me.name;
    c.bank('out', b.amount, 'fournisseur', `Fournisseur — ${b.supplier} #${b.ref}`, b.id);
    c.audit('bill.pay', `a payé la facture fournisseur ${b.supplier} #${b.ref} (${money(b.amount)})`);
  };
  A['bills.delete'] = (c, p) => {
    c.need('bills.manage');
    const b = find(c.db.bills, p.id, 'Facture fournisseur');
    if (b.status === 'paid') fail('Une facture payée ne peut pas être supprimée');
    c.db.bills = c.db.bills.filter(x => x.id !== b.id);
    c.audit('bill.delete', `a supprimé la facture fournisseur #${b.ref}`);
  };

  /* =================== CHARGES =================== */
  A['expenses.save'] = (c, p) => {
    c.need('expenses.manage');
    const cats = c.db.company.expenseCategories;
    const cat = cats.find(x => x.id === p.category);
    if (!cat) fail('Type de commande inconnu');
    /* commande = quantité × prix unitaire (prix par défaut du type si non précisé) */
    const qty = Math.max(1, Math.floor(num(p.qty, 1, 1e5))), unitPrice = c.r(p.unitPrice != null && p.unitPrice !== '' ? num(p.unitPrice, 0, 1e7) : num(cat.price));
    const data = {
      category: cat.id, categoryLabel: cat.label, qty, unitPrice, amount: c.r(qty * unitPrice), description: str(p.description, 200), supplier: str(p.supplier, 60),
      date: p.date ? new Date(p.date).toISOString() : c.iso, recurring: 'none'
    };
    if (!(data.amount > 0)) fail('Montant invalide');
    const label = cat.label + (data.description ? ' — ' + data.description : '');
    if (p.id) {
      const e = find(c.db.expenses, p.id, 'Charge');
      const diff = c.r(data.amount - e.amount);
      Object.assign(e, data);
      if (diff) c.bank(diff > 0 ? 'out' : 'in', Math.abs(diff), 'charge', 'Ajustement charge — ' + label, e.id);
      c.audit('expense.update', `a modifié la charge ${label}`);
      return { id: e.id };
    }
    const e = Object.assign({ id: uid('exp'), createdBy: c.me.id, createdAt: c.iso }, data);
    c.db.expenses.push(e);
    c.bank('out', e.amount, 'charge', 'Charge — ' + label, e.id);
    c.audit('expense.create', `a enregistré la charge ${label} (${money(e.amount)})`);
    return { id: e.id };
  };
  A['expenses.delete'] = (c, p) => {
    c.need('expenses.manage');
    const e = find(c.db.expenses, p.id, 'Charge');
    c.db.expenses = c.db.expenses.filter(x => x.id !== e.id);
    c.bank('in', e.amount, 'charge', 'Annulation charge — ' + e.description, e.id);
    c.audit('expense.delete', `a supprimé une charge de ${money(e.amount)}`);
  };

  /* =================== SALAIRES =================== */
  function recomputePayroll(c, pr) {
    pr.primesTotal = c.r((pr.primes || []).reduce((a, x) => a + x.amount, 0));
    pr.total = c.r(pr.base + pr.commissions + pr.primesTotal + (pr.bonus || 0) - pr.deduction);
  }
  /* Primes automatiques d'un employé sur une période (règles : Paramètres > Primes) */
  function autoPrimes(db, e, from, to, minutes, caMap) {
    const ca = caMap[e.id] || 0, nb = db.sales.filter(s => s.employeeId === e.id && s.status !== 'cancelled' && Date.parse(s.createdAt) >= from && Date.parse(s.createdAt) <= to).length;
    const best = Object.keys(caMap).reduce((b, id) => (caMap[id] > (caMap[b] || 0) ? id : b), null);
    return (db.company.primeRules || []).filter(r => r.enabled && r.amount > 0 && (
      (r.type === 'ca' && ca >= r.threshold) || (r.type === 'hours' && minutes / 60 >= r.threshold) ||
      (r.type === 'sales' && nb >= r.threshold) || (r.type === 'top' && best === e.id && ca > 0)
    )).map(r => ({ ruleId: r.id, label: r.label, amount: r.amount, auto: true }));
  }
  A['payroll.generate'] = (c, p) => {
    c.need('payroll.manage');
    const db = c.db;
    const from = Date.parse(p.from), to = Date.parse(p.to) + (String(p.to || '').length <= 10 ? DAY - 1 : 0);
    if (!(from < to)) fail('Période invalide');
    const caMap = {};
    db.sales.forEach(s => { if (s.status !== 'cancelled' && Date.parse(s.createdAt) >= from && Date.parse(s.createdAt) <= to) caMap[s.employeeId] = (caMap[s.employeeId] || 0) + s.total; });
    db.employees.forEach(e => { if (e.archived) delete caMap[e.id]; });
    let n = 0;
    db.employees.filter(e => !e.archived).forEach(e => {
      const role = roleOf(db, e);
      const sess = db.sessions.filter(s => s.employeeId === e.id && s.end && !s.payrollId && Date.parse(s.start) >= from && Date.parse(s.start) <= to);
      const comms = db.commissions.filter(x => x.employeeId === e.id && !x.payrollId && Date.parse(x.createdAt) <= to);
      const minutes = sess.reduce((a, s) => a + (s.minutes || 0), 0);
      const hours = Math.round(minutes / 60 * 100) / 100;
      const commissions = c.r(comms.reduce((a, x) => a + x.amount, 0));
      /* période déjà payée (même partiellement) : le fixe et les primes auto ne sont pas comptés deux fois */
      const paid = db.payrolls.some(x => x.employeeId === e.id && x.status === 'paid' && Date.parse(x.from) < to && Date.parse(x.to) > from);
      const salary = paid ? 0 : role.salary || 0;
      const base = c.r(salary + hours * (role.hourly || 0));
      const manual = (db.primes || []).filter(x => x.employeeId === e.id && !x.payrollId && Date.parse(x.at) <= to);
      const primes = (paid ? [] : autoPrimes(db, e, from, to, minutes, caMap)).concat(manual.map(x => ({ primeId: x.id, label: x.reason, amount: x.amount, auto: false })));
      const existing = db.payrolls.find(x => x.employeeId === e.id && x.status !== 'paid');
      if (existing && existing.status === 'validated') return;
      /* plus rien à verser : l'ancien brouillon est retiré */
      if (!base && !commissions && !primes.length) { if (existing) db.payrolls = db.payrolls.filter(x => x !== existing); return; }
      const rec = existing || { id: uid('pay'), employeeId: e.id, bonus: 0, deduction: 0, createdAt: c.iso };
      Object.assign(rec, {
        employeeName: e.name, roleName: role.name, from: new Date(from).toISOString(), to: new Date(to).toISOString(),
        salary, hourly: role.hourly || 0, minutes, hours, base, commissions, primes,
        commissionIds: comms.map(x => x.id), sessionIds: sess.map(s => s.id), status: 'draft'
      });
      recomputePayroll(c, rec);
      if (!existing) db.payrolls.push(rec);
      n++;
    });
    c.audit('payroll.generate', `a généré la paie du ${fmtD(from)} au ${fmtD(to)} (${n} fiches)`);
    return { count: n };
  };
  A['payroll.update'] = (c, p) => {
    c.need('payroll.manage');
    const pr = find(c.db.payrolls, p.id, 'Fiche de paie');
    if (pr.status !== 'draft') fail('Seule une paie en brouillon peut être modifiée');
    if (p.bonus != null) pr.bonus = c.r(num(p.bonus));
    pr.deduction = c.r(num(p.deduction)); pr.note = str(p.note, 200);
    recomputePayroll(c, pr);
    c.audit('payroll.update', `a modifié la paie de ${pr.employeeName} (retenue ${money(pr.deduction)})`);
  };
  /* Primes manuelles : ajoutées à la prochaine paie (et à la fiche en brouillon si elle existe) */
  A['primes.add'] = (c, p) => {
    c.need('payroll.manage');
    const e = find(c.db.employees, p.employeeId, 'Employé');
    const amount = c.r(num(p.amount, 0, 1e7)), reason = str(p.reason, 120) || 'Prime';
    if (!(amount > 0)) fail('Montant invalide');
    const x = { id: uid('pri'), employeeId: e.id, employeeName: e.name, amount, reason, by: c.me.name, at: c.iso, payrollId: null };
    c.db.primes.push(x);
    const draft = c.db.payrolls.find(r => r.employeeId === e.id && r.status === 'draft');
    if (draft) { (draft.primes = draft.primes || []).push({ primeId: x.id, label: reason, amount, auto: false }); recomputePayroll(c, draft); }
    c.audit('prime.add', `a attribué une prime de ${money(amount)} à ${e.name} (${reason})`);
    return { id: x.id };
  };
  A['primes.delete'] = (c, p) => {
    c.need('payroll.manage');
    const x = find(c.db.primes, p.id, 'Prime');
    if (x.payrollId) fail('Prime déjà versée');
    c.db.primes = c.db.primes.filter(y => y.id !== x.id);
    c.db.payrolls.forEach(r => { if (r.status === 'draft' && (r.primes || []).some(y => y.primeId === x.id)) { r.primes = r.primes.filter(y => y.primeId !== x.id); recomputePayroll(c, r); } });
    c.audit('prime.delete', `a retiré la prime de ${money(x.amount)} de ${x.employeeName}`);
  };
  A['payroll.validate'] = (c, p) => {
    c.need('payroll.manage');
    const pr = find(c.db.payrolls, p.id, 'Fiche de paie');
    if (pr.status !== 'draft') fail('Paie déjà validée');
    pr.status = 'validated'; pr.validatedAt = c.iso; pr.validatedBy = c.me.name;
    c.audit('payroll.validate', `a validé la paie de ${pr.employeeName} (${money(pr.total)})`);
  };
  A['payroll.pay'] = (c, p) => {
    c.need('payroll.manage');
    const db = c.db, pr = find(db.payrolls, p.id, 'Fiche de paie');
    if (pr.status === 'paid') fail('Salaire déjà marqué comme payé');
    if (pr.status === 'draft') { pr.validatedAt = c.iso; pr.validatedBy = c.me.name; } // « Marquer payé » en un clic
    pr.status = 'paid'; pr.paidAt = c.iso; pr.paidBy = c.me.name;
    db.commissions.forEach(x => { if (pr.commissionIds.includes(x.id) && !x.payrollId) x.payrollId = pr.id; });
    db.sessions.forEach(s => { if ((pr.sessionIds || []).includes(s.id) && !s.payrollId) s.payrollId = pr.id; });
    const pids = (pr.primes || []).map(x => x.primeId).filter(Boolean);
    (db.primes || []).forEach(x => { if (pids.includes(x.id) && !x.payrollId) x.payrollId = pr.id; });
    c.bank('out', pr.total, 'salaire', `Salaire — ${pr.employeeName}`, pr.id);
    c.audit('payroll.pay', `a payé le salaire de ${pr.employeeName} (${money(pr.total)})`);
  };
  A['payroll.delete'] = (c, p) => {
    c.need('payroll.manage');
    const pr = find(c.db.payrolls, p.id, 'Fiche de paie');
    if (pr.status === 'paid') fail('Une paie versée ne peut pas être supprimée');
    c.db.payrolls = c.db.payrolls.filter(x => x.id !== pr.id);
    c.audit('payroll.delete', `a supprimé la fiche de paie de ${pr.employeeName}`);
  };

  /* =================== SERVICE / PRÉSENCE =================== */
  const openSession = (db, empId) => db.sessions.find(s => s.employeeId === empId && !s.end);
  A['service.start'] = c => {
    c.need('service.self');
    if (openSession(c.db, c.me.id)) fail('Vous êtes déjà en service');
    c.db.sessions.push({ id: uid('ses'), employeeId: c.me.id, start: c.iso, end: null, pauses: [], minutes: 0 });
    c.me.status = 'on'; c.me.lastLogin = c.iso;
    c.audit('service.start', 'a pris son service');
  };
  A['service.pause'] = c => {
    c.need('service.self');
    const s = openSession(c.db, c.me.id);
    if (!s) fail("Vous n'êtes pas en service");
    const last = s.pauses[s.pauses.length - 1];
    if (last && !last.end) { last.end = c.iso; c.me.status = 'on'; c.audit('service.resume', 'a repris son service'); }
    else { s.pauses.push({ start: c.iso, end: null }); c.me.status = 'pause'; c.audit('service.pause', 'est en pause'); }
  };
  A['service.end'] = (c, p) => {
    let emp = c.me;
    if (p.employeeId && p.employeeId !== c.me.id) { c.need('staff.manage'); emp = find(c.db.employees, p.employeeId, 'Employé'); c.above(emp); }
    else c.need('service.self');
    const s = openSession(c.db, emp.id);
    if (!s) fail('Aucun service en cours');
    s.pauses.forEach(z => { if (!z.end) z.end = c.iso; });
    s.end = c.iso; s.minutes = minutesOf(s, c.now);
    if (emp.status !== 'suspended') emp.status = 'off';
    c.notify('service', 'Fin de service', `${emp.name} a terminé son service (${fmtDur(s.minutes)})`, 'info', 'service');
    c.audit('service.end', emp.id === c.me.id ? `a terminé son service (${fmtDur(s.minutes)})` : `a clôturé le service de ${emp.name}`);
  };

  /* =================== PERSONNEL =================== */
  /* Grade par défaut d'un nouveau compte : Apprenti (sinon le grade le plus bas) */
  const defaultRole = db => db.roles.find(r => r.id === 'apprenti') || db.roles.slice().sort((x, y) => x.rank - y.rank)[0];
  A['staff.save'] = (c, p) => {
    c.need('staff.manage');
    const db = c.db, role = p.roleId ? find(db.roles, p.roleId, 'Grade') : defaultRole(db);
    if (!c.can('*') && role.rank >= c.role.rank) fail('Vous ne pouvez pas attribuer un grade égal ou supérieur au vôtre');
    const data = {
      firstName: str(p.firstName, 30), lastName: str(p.lastName, 30), charId: str(p.charId, 30),
      discordId: str(p.discordId, 30), bankAccount: str(p.bankAccount, 40)
    };
    if (!data.firstName || !data.lastName) fail('Nom et prénom obligatoires');
    if (!data.charId) fail('Char ID obligatoire');
    if (data.discordId && !/^\d{5,25}$/.test(data.discordId)) fail('Discord ID invalide (chiffres uniquement)');
    if (db.employees.some(x => !x.archived && x.id !== p.id && x.charId === data.charId)) fail('Un employé possède déjà ce Char ID');
    data.name = data.firstName + ' ' + data.lastName;
    let e;
    if (p.id) {
      e = find(db.employees, p.id, 'Employé');
      c.above(e);
      if (e.roleId !== role.id) {
        if (e.id === c.me.id && !c.can('*')) fail('Vous ne pouvez pas changer votre propre grade');
        const old = roleOf(db, e).name;
        (e.promotions = e.promotions || []).push({ from: old, to: role.name, at: c.iso, by: c.me.name });
        c.audit('staff.role', `a changé le grade de ${e.name} (${old} → ${role.name})`);
      }
      Object.assign(e, data, { roleId: role.id });
      c.audit('staff.update', `a modifié l'employé ${e.name}`);
    } else {
      e = Object.assign({ id: uid('emp'), roleId: role.id, status: 'off', archived: false, hiredAt: c.iso, promotions: [], lastLogin: null }, data);
      db.employees.push(e);
      c.audit('staff.create', `a recruté ${e.name} (${role.name})`);
    }
    if (p.license) e.license = str(p.license, 80);
    if (!p.id) { e.pinHash = null; e.mustReset = true; } // l'employé choisira son mot de passe à sa première connexion
    if (p.photo !== undefined) e.photo = cleanPhoto(p.photo);
    if (p.hiredAt) { const t = Date.parse(p.hiredAt); if (isFinite(t)) e.hiredAt = new Date(t).toISOString(); }
    return { id: e.id };
  };
  const cleanPhoto = v => { const u = str(v, 500); if (u && !/^https?:\/\/\S+$/i.test(u)) fail('Photo : URL invalide (http/https)'); return u; };
  /* Mon compte : chacun met à jour ses propres infos (photo, Discord, compte bancaire, PIN).
   * Char ID, grade et date d'arrivée restent gérés par la direction (staff.save). */
  A['account.update'] = (c, p) => {
    const e = c.me;
    if (p.photo !== undefined) e.photo = cleanPhoto(p.photo);
    if (p.discordId !== undefined) { const d = str(p.discordId, 30); if (d && !/^\d{5,25}$/.test(d)) fail('Discord ID invalide (chiffres uniquement)'); e.discordId = d; }
    if (p.bankAccount !== undefined) e.bankAccount = str(p.bankAccount, 40);
    const pwd = p.password || p.pin;
    if (pwd) { if (String(pwd).length < PWD_MIN) fail(`Le mot de passe doit faire au moins ${PWD_MIN} caractères`); e.pinHash = config.hash(String(pwd)); }
    c.audit('account.update', 'a mis à jour son compte');
  };
  /* =================== CONNEXION (partagée par le mode local et l'API) ===================
   * 5 échecs -> compte bloqué 15 min (débloquable par Recruteur +).
   * Mot de passe réinitialisé (DRH +) ou jamais défini -> l'employé en choisit un nouveau. */
  const byChar = (db, id) => db.employees.find(x => !x.archived && (x.charId || x.playerId) === id);
  const lockMsg = (e, now) => `Compte bloqué après ${LOCK_MAX} essais : réessayez dans ${Math.max(1, Math.ceil((Date.parse(e.lockedUntil) - now) / 60e3))} min ou demandez à un recruteur de le débloquer`;
  function login(db, p, now) {
    now = now || Date.now();
    const id = str(p.charId, 30), e = byChar(db, id);
    if (!e) return { ok: false, error: (db.signups || []).some(x => x.charId === id) ? 'Compte en attente de validation par la direction' : 'Char ID ou mot de passe incorrect' };
    if (e.status === 'suspended') return { ok: false, error: 'Compte suspendu' };
    if (e.dismissal && e.dismissal.done) return { ok: false, error: 'Compte fermé (licenciement)' };
    if (e.lockedUntil && Date.parse(e.lockedUntil) > now) return { ok: false, locked: true, error: lockMsg(e, now) };
    if (e.mustReset || !e.pinHash) return { ok: false, needNewPassword: true, error: 'Choisissez votre nouveau mot de passe' };
    if (e.pinHash !== config.hash(String(p.password || ''))) {
      e.failedLogins = (e.failedLogins || 0) + 1;
      if (e.failedLogins >= LOCK_MAX) {
        e.failedLogins = 0; e.lockedUntil = new Date(now + LOCK_MS).toISOString();
        db.notifications.push({ id: uid('ntf'), type: 'lock', title: 'Compte bloqué', body: `${e.name} : ${LOCK_MAX} mots de passe erronés`, level: 'warn', route: 'staff', at: new Date(now).toISOString(), read: false });
        db.meta.version++;
        return { ok: false, locked: true, changed: true, error: lockMsg(e, now) };
      }
      db.meta.version++;
      const left = LOCK_MAX - e.failedLogins;
      return { ok: false, changed: true, error: `Char ID ou mot de passe incorrect (${left} essai${left > 1 ? 's' : ''} avant blocage)` };
    }
    Object.assign(e, { failedLogins: 0, lockedUntil: null, lastLogin: new Date(now).toISOString() });
    db.meta.version++;
    return { ok: true, id: e.id, changed: true };
  }
  function setPassword(db, p, now) {
    now = now || Date.now();
    const e = byChar(db, str(p.charId, 30));
    if (!e) return { ok: false, error: 'Char ID introuvable' };
    if (e.status === 'suspended') return { ok: false, error: 'Compte suspendu' };
    if (e.lockedUntil && Date.parse(e.lockedUntil) > now) return { ok: false, error: lockMsg(e, now) };
    if (!(e.mustReset || !e.pinHash)) return { ok: false, error: 'Ce compte a déjà un mot de passe' };
    const pwd = String(p.password || '');
    if (pwd.length < PWD_MIN) return { ok: false, error: `Le mot de passe doit faire au moins ${PWD_MIN} caractères` };
    Object.assign(e, { pinHash: config.hash(pwd), mustReset: false, failedLogins: 0, lockedUntil: null, lastLogin: new Date(now).toISOString() });
    db.meta.version++;
    return { ok: true, id: e.id, changed: true };
  }
  A['staff.unlock'] = (c, p) => {
    c.need('staff.manage');
    const e = find(c.db.employees, p.id, 'Employé');
    c.above(e);
    Object.assign(e, { failedLogins: 0, lockedUntil: null });
    c.audit('staff.unlock', `a débloqué le compte de ${e.name}`);
  };
  A['staff.resetPassword'] = (c, p) => {
    c.need('staff.resetpwd');
    const e = find(c.db.employees, p.id, 'Employé');
    if (e.id === c.me.id) fail('Changez votre propre mot de passe dans « Mon compte »');
    c.above(e);
    Object.assign(e, { pinHash: null, mustReset: true, failedLogins: 0, lockedUntil: null });
    c.audit('staff.resetpwd', `a réinitialisé le mot de passe de ${e.name}`);
  };

  /* Changement de grade rapide (promotion / rétrogradation) */
  A['staff.setRole'] = (c, p) => {
    c.need('staff.manage');
    const db = c.db, e = find(db.employees, p.id, 'Employé'), role = find(db.roles, p.roleId, 'Grade');
    if (e.id === c.me.id && !c.can('*')) fail('Vous ne pouvez pas changer votre propre grade');
    c.above(e);
    if (!c.can('*') && role.rank >= c.role.rank) fail('Vous ne pouvez pas attribuer un grade égal ou supérieur au vôtre');
    if (e.roleId === role.id) return;
    const old = roleOf(db, e), up = role.rank > old.rank;
    (e.promotions = e.promotions || []).push({ from: old.name, to: role.name, at: c.iso, by: c.me.name });
    e.roleId = role.id;
    c.audit('staff.role', `a ${up ? 'promu' : 'rétrogradé'} ${e.name} (${old.name} → ${role.name})`);
    return { up };
  };
  A['staff.setStatus'] = (c, p) => {
    c.need('staff.manage');
    const e = find(c.db.employees, p.id, 'Employé');
    c.above(e);
    if (!['on', 'off', 'pause', 'suspended'].includes(p.status)) fail('Statut invalide');
    if (e.id === c.me.id && p.status === 'suspended') fail('Vous ne pouvez pas vous suspendre');
    e.status = p.status;
    c.audit('staff.status', `a passé ${e.name} en « ${{ on: 'En service', off: 'Hors service', pause: 'En pause', suspended: 'Suspendu' }[p.status]} »`);
  };
  A['staff.archive'] = (c, p) => {
    c.need('staff.manage');
    const e = find(c.db.employees, p.id, 'Employé');
    if (e.id === c.me.id) fail('Vous ne pouvez pas vous archiver');
    c.above(e);
    const s = openSession(c.db, e.id);
    if (s) { s.end = c.iso; s.minutes = minutesOf(s, c.now); }
    Object.assign(e, { archived: true, leftAt: c.iso, leaveReason: str(p.reason, 200) || 'Départ', lastRoleName: roleOf(c.db, e).name, status: 'off' });
    /* fiche de paie non validée : retirée (elle serait sinon payable après le départ) */
    c.db.payrolls = c.db.payrolls.filter(x => !(x.employeeId === e.id && x.status === 'draft'));
    c.audit('staff.archive', `a archivé ${e.name} (${e.leaveReason})`);
  };
  function fireLog(c, e, reason) {
    if (!c.db.company.fireWebhook) return;
    const days = Math.floor((c.now - Date.parse(e.hiredAt)) / DAY);
    c.effect({ type: 'discord', url: c.db.company.fireWebhook, body: {
      username: (c.db.company.name || 'LS Customs') + ' — Personnel',
      embeds: [{ title: `🚫 Licenciement — ${e.name}`, color: 0xef5d5d,
        description: (reason ? 'Motif : ' + reason + '\n' : '') + 'Compte supprimé de la compta.',
        fields: [{ name: 'Grade', value: roleOf(c.db, e).name || '—', inline: true }, { name: 'Char ID', value: e.charId || '—', inline: true },
          { name: 'Discord', value: e.discordId ? `<@${e.discordId}>` : '—', inline: true },
          { name: 'Arrivée', value: `${fmtD(e.hiredAt)} (${days} j)`, inline: true }, { name: 'Par', value: `${c.me.name} (${c.role.name})`, inline: true },
          { name: 'Étapes', value: (c.db.company.dismissChecklist || []).map(x => '✅ ' + x.label.split(' :')[0]).join('  '), inline: false }],
        timestamp: c.iso }],
      allowed_mentions: { users: [] }
    } });
  }
  A['staff.dismiss'] = (c, p) => {
    c.need('staff.manage');
    const e = find(c.db.employees, p.id, 'Employé');
    if (e.id === c.me.id) fail('Vous ne pouvez pas vous licencier');
    if (e.archived) fail('Employé déjà archivé');
    c.above(e);
    if (e.dismissal && e.dismissal.done) fail('Licenciement déjà confirmé');
    const steps = c.db.company.dismissChecklist || [], given = Array.isArray(p.checks) ? p.checks : [];
    const checks = steps.filter(x => given.includes(x.id)).map(x => x.id), done = !!p.confirm && checks.length === steps.length;
    if (p.confirm && !done) fail('Cochez toutes les étapes avant de confirmer le licenciement');
    const first = !e.dismissal;
    e.dismissal = Object.assign(e.dismissal || { at: c.iso, by: c.me.name }, { reason: str(p.reason, 200) || (e.dismissal && e.dismissal.reason) || '', checks, done });
    if (done) {
      Object.assign(e.dismissal, { doneAt: c.iso, doneBy: c.me.name });
      const s = openSession(c.db, e.id);
      if (s) { s.pauses.forEach(z => { if (!z.end) z.end = c.iso; }); s.end = c.iso; s.minutes = minutesOf(s, c.now); }
      fireLog(c, e, e.dismissal.reason);
      /* compte supprimé de la compta : plus d'accès (mot de passe, licence), fiche gardée dans les archives pour l'historique */
      Object.assign(e, { archived: true, leftAt: c.iso, leaveReason: 'Licenciement', lastRoleName: roleOf(c.db, e).name, status: 'off', pinHash: null, license: '', failedLogins: 0, lockedUntil: null });
      c.db.payrolls = c.db.payrolls.filter(x => !(x.employeeId === e.id && x.status === 'draft'));
      c.audit('staff.dismiss', `a licencié ${e.name} : compte supprimé de la compta`);
    } else if (first) c.audit('staff.dismiss', `a commencé le licenciement de ${e.name} (${checks.length}/${steps.length} étapes)`);
    return { done };
  };
  A['staff.dismissCancel'] = (c, p) => {
    c.need('staff.manage');
    const e = find(c.db.employees, p.id, 'Employé');
    c.above(e);
    if (!e.dismissal) fail('Aucun licenciement en cours');
    e.dismissal = null;
    c.audit('staff.dismiss', `a annulé le licenciement de ${e.name}`);
  };
  A['staff.restore'] = (c, p) => {
    c.need('staff.manage');
    const e = find(c.db.employees, p.id, 'Employé');
    if (!e.archived) fail("L'employé n'est pas archivé");
    e.archived = false; e.rehiredAt = c.iso; e.leftAt = null;
    c.audit('staff.restore', `a réintégré ${e.name}`);
  };

  /* =================== ABSENCES =================== */
  A['absences.save'] = (c, p) => {
    const emp = find(c.db.employees, p.employeeId || c.me.id, 'Employé');
    if (emp.id === c.me.id) c.need('service.self', 'staff.manage');
    else { c.need('staff.manage'); c.above(emp); }
    const from = Date.parse(p.from), to = Date.parse(p.to);
    if (!isFinite(from) || !isFinite(to)) fail('Dates invalides');
    if (to < from) fail('La date de fin doit être après la date de début');
    const data = { employeeId: emp.id, employeeName: emp.name, from: new Date(from).toISOString(), to: new Date(to).toISOString(), reason: str(p.reason, 200) || 'Non précisé' };
    if (p.id) {
      const a = find(c.db.absences, p.id, 'Absence');
      if (a.employeeId !== c.me.id) c.need('staff.manage');
      Object.assign(a, data);
      c.audit('absence.update', `a modifié l'absence de ${emp.name}`);
      return { id: a.id };
    }
    const a = Object.assign({ id: uid('abs'), createdBy: c.me.name, createdAt: c.iso }, data);
    c.db.absences.push(a);
    c.audit('absence.create', `a déclaré une absence pour ${emp.name} (du ${fmtD(from)} au ${fmtD(to)})`);
    return { id: a.id };
  };
  A['absences.delete'] = (c, p) => {
    const a = find(c.db.absences, p.id, 'Absence');
    if (a.employeeId !== c.me.id) c.need('staff.manage');
    c.db.absences = c.db.absences.filter(x => x.id !== a.id);
    c.audit('absence.delete', `a supprimé l'absence de ${a.employeeName}`);
  };

  /* =================== DEMANDES DE COMPTE (inscription) =================== */
  /* Public (sans session) : enregistre une demande. Le compte n'existe qu'après validation par la direction. */
  function register(db, p, now) {
    try {
      p = p && typeof p === 'object' ? p : {};
      const iso = new Date(now || Date.now()).toISOString();
      const data = {
        firstName: str(p.firstName, 30), lastName: str(p.lastName, 30), charId: str(p.charId, 30),
        discordId: str(p.discordId, 30), bankAccount: str(p.bankAccount, 40)
      };
      if (!data.firstName || !data.lastName) fail('Nom et prénom obligatoires');
      if (!data.charId) fail('Char ID obligatoire');
      if (data.discordId && !/^\d{5,25}$/.test(data.discordId)) fail('Discord ID invalide (chiffres uniquement)');
      const pwd = String(p.password || '');
      if (pwd.length < PWD_MIN) fail(`Le mot de passe doit faire au moins ${PWD_MIN} caractères`);
      db.signups = db.signups || [];
      /* base vide : le premier compte devient PDG (seulement le Char ID du propriétaire s'il est configuré) */
      if (!db.employees.some(x => !x.archived) && (!config.ownerCharId || data.charId === String(config.ownerCharId))) {
        const top = db.roles.slice().sort((a, b) => b.rank - a.rank)[0];
        db.employees.push(Object.assign({ id: uid('emp'), name: data.firstName + ' ' + data.lastName, pinHash: config.hash(pwd), roleId: top.id, status: 'off', archived: false, hiredAt: iso, promotions: [], lastLogin: null }, data));
        db.meta.version++;
        return { ok: true, first: true, role: top.name };
      }
      if (db.employees.some(x => !x.archived && x.charId === data.charId)) fail('Ce Char ID possède déjà un compte');
      if (db.signups.some(x => x.charId === data.charId)) fail('Une demande est déjà en attente pour ce Char ID');
      if (db.signups.length >= 30) fail('Trop de demandes en attente : contactez la direction');
      const sg = Object.assign({ id: uid('sgn'), name: data.firstName + ' ' + data.lastName, pinHash: config.hash(pwd), createdAt: iso }, data);
      db.signups.push(sg);
      if (!db.company.notify || db.company.notify.signup !== false) {
        db.notifications.push({ id: uid('ntf'), type: 'signup', title: 'Demande de compte', body: `${sg.name} (Char ID ${sg.charId}) attend une validation`, level: 'info', route: 'staff', at: iso, read: false });
      }
      db.meta.version++;
      return { ok: true };
    } catch (e) {
      if (e && e.userError) return { ok: false, error: e.message };
      throw e;
    }
  }
  A['signups.approve'] = (c, p) => {
    c.need('staff.manage');
    const db = c.db, sg = find(db.signups, p.id, 'Demande');
    if (db.employees.some(x => !x.archived && x.charId === sg.charId)) fail('Un employé possède déjà ce Char ID');
    const role = defaultRole(db);
    const e = {
      id: uid('emp'), name: sg.name, firstName: sg.firstName, lastName: sg.lastName, charId: sg.charId, discordId: sg.discordId, bankAccount: sg.bankAccount,
      pinHash: sg.pinHash, roleId: role.id, status: 'off', archived: false, hiredAt: c.iso, promotions: [], lastLogin: null
    };
    db.employees.push(e);
    db.signups = db.signups.filter(x => x.id !== sg.id);
    c.audit('staff.create', `a validé le compte de ${e.name} (${role.name})`);
    return { id: e.id };
  };
  A['signups.reject'] = (c, p) => {
    c.need('staff.manage');
    const sg = find(c.db.signups, p.id, 'Demande');
    c.db.signups = c.db.signups.filter(x => x.id !== sg.id);
    c.audit('staff.signup', `a refusé la demande de compte de ${sg.name}`);
  };

  /* =================== AVERTISSEMENTS =================== */
  A['warnings.save'] = (c, p) => {
    c.need('warnings.manage');
    const e = find(c.db.employees, p.employeeId, 'Employé');
    if (e.id === c.me.id) fail('Vous ne pouvez pas vous avertir vous-même');
    c.above(e);
    const reason = str(p.reason, 400);
    if (!reason) fail('Motif obligatoire');
    const n = ++c.db.meta.seq.warning;
    c.db.warnings.push({ id: uid('wrn'), num: n, employeeId: e.id, employeeName: e.name, type: str(p.type, 40) || 'Autre', reason, authorId: c.me.id, authorName: c.me.name, authorRole: c.role.name, at: c.iso });
    c.audit('warning.create', `a donné l'avertissement #${n} à ${e.name}`);
  };
  A['warnings.delete'] = (c, p) => {
    c.need('warnings.manage');
    const w = find(c.db.warnings, p.id, 'Avertissement');
    c.db.warnings = c.db.warnings.filter(x => x.id !== w.id);
    c.audit('warning.delete', `a retiré l'avertissement #${w.num} de ${w.employeeName}`);
  };

  /* =================== RÔLES & PERMISSIONS =================== */
  A['roles.save'] = (c, p) => {
    c.need('roles.manage');
    const db = c.db;
    const perms = [...new Set((Array.isArray(p.perms) ? p.perms : []).filter(k => PERM_KEYS.has(k) || k === '*'))];
    if (perms.includes('*') && !c.can('*')) fail("Seul un accès complet peut accorder l'accès complet");
    const data = { name: str(p.name, 40), rank: Math.round(num(p.rank, 1, 99)), commission: num(p.commission, 0, 100), salary: c.r(num(p.salary)), hourly: c.r(num(p.hourly)), perms };
    if (!data.name) fail('Nom obligatoire');
    if (!c.can('*') && data.rank >= c.role.rank) fail('Le rang doit être inférieur au vôtre');
    if (p.id) {
      const r = find(db.roles, p.id, 'Grade');
      if (!c.can('*') && r.rank >= c.role.rank) fail('Vous ne pouvez pas modifier un grade égal ou supérieur');
      if (r.perms.includes('*')) { data.perms = ['*']; data.rank = r.rank; }
      const diff = data.perms.filter(x => !r.perms.includes(x)).length + r.perms.filter(x => !data.perms.includes(x)).length;
      Object.assign(r, data);
      c.audit('role.update', `a modifié le grade ${r.name}` + (diff ? ` (${diff} permission(s) changée(s))` : ''));
      return { id: r.id };
    }
    const r = Object.assign({ id: uid('rol') }, data);
    db.roles.push(r);
    c.audit('role.create', `a créé le grade ${r.name}`);
    return { id: r.id };
  };
  A['roles.delete'] = (c, p) => {
    c.need('roles.manage');
    const r = find(c.db.roles, p.id, 'Grade');
    if (r.perms.includes('*')) fail('Le grade avec accès complet ne peut pas être supprimé');
    if (!c.can('*') && r.rank >= c.role.rank) fail('Vous ne pouvez pas supprimer ce grade');
    if (c.db.employees.some(e => !e.archived && e.roleId === r.id)) fail('Des employés possèdent encore ce grade');
    c.db.roles = c.db.roles.filter(x => x.id !== r.id);
    c.audit('role.delete', `a supprimé le grade ${r.name}`);
  };

  /* =================== BANQUE / PARAMÈTRES / NOTIFS =================== */
  A['bank.add'] = (c, p) => {
    c.need('bank.manage');
    const amount = c.r(num(p.amount, 0, 1e9));
    if (!(amount > 0)) fail('Montant invalide');
    const label = str(p.label, 120);
    if (!label) fail('Libellé obligatoire');
    c.bank(p.type === 'out' ? 'out' : 'in', amount, str(p.category, 30) || 'autre', label);
    c.audit('bank.add', `a enregistré une opération bancaire : ${p.type === 'out' ? '-' : '+'}${money(amount)} (${label})`);
  };
  A['settings.save'] = (c, p) => {
    c.need('settings.manage');
    const co = c.db.company, s = p.company || {};
    ['name', 'subtitle', 'description', 'address', 'phone', 'logo', 'currency'].forEach(k => { if (s[k] != null) co[k] = str(s[k], k === 'logo' ? 500 : 200); });
    if (s.taxRate != null) co.taxRate = num(s.taxRate, 0, 100);
    if (s.rounding != null) co.rounding = +s.rounding === 0.01 ? 0.01 : 1;
    if (s.maxDiscountPct != null) co.maxDiscountPct = num(s.maxDiscountPct, 0, 100);
    if (s.largeSale != null) co.largeSale = num(s.largeSale, 0, 1e9);
    if (s.theme != null && ['dark', 'light', 'halloween', 'noel'].includes(s.theme)) co.theme = s.theme;
    if (s.commissionBase != null) co.commissionBase = s.commissionBase === 'revenue' ? 'revenue' : 'margin';
    if (s.payReason != null) co.payReason = str(s.payReason, 60);
    if (Array.isArray(s.taxBrackets)) {
      const b = s.taxBrackets.slice(0, 3).map((x, i, a) => ({ upTo: i === a.length - 1 ? null : c.r(num(x.upTo, 0, 1e9)), rate: num(x.rate, 0, 100) }));
      if (b.some((x, i) => i && b[i - 1].upTo != null && x.upTo != null && x.upTo <= b[i - 1].upTo)) fail('Les seuils des tranches doivent être croissants');
      if (b.length) co.taxBrackets = b;
    }
    if (s.invoiceDays != null) co.invoiceDays = Math.round(num(s.invoiceDays, 1, 90));
    /* webhooks Discord : vide = inchangé, « - » = retirer */
    ['stockWebhook', 'archiveWebhook', 'saleWebhook', 'fireWebhook', 'glifeWebhook', 'unlistedWebhook'].forEach(k => {
      const v = s[k] == null ? '' : str(s[k], 300);
      if (v === '-') co[k] = '';
      else if (v) { if (!WEBHOOK_RE.test(v)) fail('URL de webhook Discord invalide'); co[k] = v; }
    });
    if (Array.isArray(s.dismissChecklist)) co.dismissChecklist = s.dismissChecklist.map(x => ({ id: str(x.id, 30) || uid('dc'), label: str(x.label, 120) })).filter(x => x.label).slice(0, 20);
    if (s.glifeCompanyId != null) co.glifeCompanyId = Math.floor(num(s.glifeCompanyId, 0, 1e9)) || 0;
    if (s.modelClasses && typeof s.modelClasses === 'object') {
      const mc = {};
      Object.keys(s.modelClasses).slice(0, 6000).forEach(k => { const m = vkey(str(k, 60)), n = Math.floor(+s.modelClasses[k]); if (m && n >= 0 && n <= 5) mc[m] = Math.max(1, n); });
      co.modelClasses = mc;
      const u = c.db.meta.unlisted || {};
      Object.keys(u).forEach(k => { if (k in mc || vkey(u[k].name) in mc) delete u[k]; });
    }
    if (Array.isArray(s.gtaClasses) && s.gtaClasses.length === GTA_CLASSES.length) co.gtaClasses = s.gtaClasses.map(n => Math.min(5, Math.max(1, Math.floor(+n) || 1)));
    if (s.archiveRole != null) { const r = str(s.archiveRole, 25); if (r && !/^\d{5,25}$/.test(r)) fail('ID de rôle Discord invalide (chiffres uniquement)'); co.archiveRole = r; }
    if (Array.isArray(s.categories)) {
      const cats = s.categories.map(x => {
        const prev = co.categories.find(k => k.id === x.id) || {}; // conserve sous-catégories et option véhicule
        return Object.assign({ subs: [] }, prev, { id: str(x.id, 30) || uid('cat'), label: str(x.label, 30), icon: str(x.icon, 40) || 'package' });
      }).filter(x => x.label);
      if (!cats.length) fail('Au moins une catégorie est requise');
      const used = c.db.products.find(pr => !cats.some(x => x.id === pr.category));
      if (used) fail(`Catégorie utilisée par « ${used.name} » : réaffectez le produit d'abord`);
      co.categories = cats;
    }
    if (Array.isArray(s.paymentMethods)) {
      co.paymentMethods = co.paymentMethods.map(m => {
        const n = s.paymentMethods.find(x => x.id === m.id) || {};
        return Object.assign({}, m, { label: str(n.label, 30) || m.label, enabled: n.enabled !== false, bank: m.id === 'card' || m.id === 'company' ? true : (m.id === 'invoice' ? false : !!n.bank) });
      });
      if (!co.paymentMethods.some(m => m.enabled)) fail('Au moins un moyen de paiement doit être actif');
    }
    if (s.invoiceThreshold != null) co.invoiceThreshold = c.r(num(s.invoiceThreshold, 0, 1e9));
    if (s.directPayment != null) co.directPayment = ['card', 'cash', 'company'].includes(s.directPayment) ? s.directPayment : 'card';
    if (Array.isArray(s.vehicleClasses)) co.vehicleClasses = [0, 1, 2, 3, 4].map(i => str(s.vehicleClasses[i], 40) || co.vehicleClasses[i] || 'Catégorie ' + (i + 1));
    if (s.payrollRules && typeof s.payrollRules === 'object') {
      const r = s.payrollRules;
      co.payrollRules = {
        quota: c.r(num(r.quota, 0, 1e9)), minDays: Math.round(num(r.minDays, 0, 365)),
        absence: ['exempt', 'block', 'ignore'].includes(r.absence) ? r.absence : 'exempt',
        roles: (Array.isArray(r.roles) ? r.roles : []).filter(id => c.db.roles.some(x => x.id === id))
      };
    }
    if (Array.isArray(s.expenseCategories)) {
      const seen = new Set();
      const list = s.expenseCategories.map(x => ({ id: str(x.id, 30) || uid('fee'), label: str(x.label, 50), price: c.r(num(x.price, 0, 1e7)), deductible: x.deductible !== false })).filter(x => x.label && !seen.has(x.id) && seen.add(x.id));
      if (!list.length) fail('Au moins un type de commande est requis');
      co.expenseCategories = list;
    }
    if (Array.isArray(s.primeRules)) {
      co.primeRules = s.primeRules.slice(0, 20).map(r => ({
        id: str(r.id, 30) || uid('pr'), label: str(r.label, 60), type: ['ca', 'hours', 'sales', 'top'].includes(r.type) ? r.type : 'ca',
        threshold: num(r.threshold, 0, 1e9), amount: c.r(num(r.amount, 0, 1e7)), enabled: r.enabled !== false
      })).filter(r => r.label);
    }
    if (Array.isArray(s.adverts)) {
      co.adverts = s.adverts.slice(0, 20).map(a => ({ id: str(a.id, 40) || uid('adv'), label: str(a.label, 30), title: str(a.title, 200), image: str(a.image, 500), message: str(a.message, 1500) }))
        .filter(a => a.title || a.message);
    }
    ['discountReasons', 'markupReasons'].forEach(k => { if (Array.isArray(s[k])) co[k] = s[k].map(x => str(x, 60)).filter(Boolean).slice(0, 20); });
    if (s.notify && typeof s.notify === 'object') Object.keys(co.notify).forEach(k => { if (k in s.notify) co.notify[k] = !!s.notify[k]; });
    c.audit('settings.update', 'a modifié les paramètres');
  };
  A['notifications.read'] = (c, p) => {
    c.db.notifications.forEach(n => { if (!p.id || n.id === p.id) n.read = true; });
  };

  /* =================== ARCHIVES MENSUELLES =================== */
  /* Données datées : collection -> champ date. Les comptes, grades, produits, partenaires et réglages ne sont jamais archivés. */
  const ARCHIVE = { sales: 'createdAt', commissions: 'createdAt', sessions: 'start', bank: 'at', audit: 'at', inventoryTx: 'at',
    payrolls: 'to', invoices: 'createdAt', expenses: 'date', bills: 'createdAt', primes: 'at', absences: 'to', notifications: 'at' };
  /* on garde tout ce qui est encore « en cours » (à facturer, à payer, service ouvert...) */
  const ARCHIVE_KEEP = {
    sales: x => x.status === 'pending', commissions: x => !x.payrollId, sessions: x => !x.end || !x.payrollId,
    payrolls: x => x.status !== 'paid', invoices: x => x.status !== 'paid' && x.status !== 'cancelled', bills: x => x.status !== 'paid', primes: x => !x.payrollId
  };
  function monthRange(m) {
    const k = /^(\d{4})-(\d{2})$/.exec(String(m || ''));
    if (!k) return null;
    const from = Date.UTC(+k[1], +k[2] - 1, 1), to = Date.UTC(+k[1], +k[2], 1) - 1;
    return { from: from - 2 * 36e5, to: to - 2 * 36e5 }; // heure de Paris (marge d'été)
  }
  const inRange = (r, v) => { const t = Date.parse(v); return t >= r.from && t <= r.to; };
  A['archive.export'] = (c, p) => {
    c.need('*');
    const r = monthRange(p.month);
    if (!r) fail('Mois invalide');
    if (!ARCHIVE[p.part]) fail('Partie inconnue');
    const f = ARCHIVE[p.part];
    return { readonly: true, part: p.part, rows: (c.db[p.part] || []).filter(x => inRange(r, x[f] || x.createdAt)) };
  };
  A['archive.purge'] = (c, p) => {
    c.need('*');
    const r = monthRange(p.month);
    if (!r) fail('Mois invalide');
    const d = new Date(c.now);
    if (r.to >= Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - 2 * 36e5) fail('Seuls les mois terminés peuvent être archivés');
    let n = 0;
    Object.keys(ARCHIVE).forEach(k => {
      if (!Array.isArray(c.db[k])) return;
      const f = ARCHIVE[k], keep = ARCHIVE_KEEP[k], before = c.db[k].length;
      c.db[k] = c.db[k].filter(x => !inRange(r, x[f] || x.createdAt) || (keep && keep(x)));
      n += before - c.db[k].length;
    });
    (c.db.meta.archives = c.db.meta.archives || []).push({ month: p.month, at: c.iso, by: c.me.name, count: n });
    c.audit('archive.purge', `a archivé et supprimé les données de ${p.month} (${n} éléments)`);
    return { count: n };
  };

  /* Rappel d'archivage : au changement de mois, notification + message Discord (rôle pingé).
   * Appelé par la tâche quotidienne (API) ou à l'ouverture (mode local). Renvoie les effets ou null. */
  function maintenance(db, now) {
    if (!db || !db.meta || !db.employees.length) return null;
    const d = new Date(now || Date.now()), month = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 15)).toISOString().slice(0, 7);
    if (!db.meta.archiveRemind) { db.meta.archiveRemind = month; return { effects: [] }; } // première fois : point de départ
    if (db.meta.archiveRemind >= month) return null;
    db.meta.archiveRemind = month;
    if ((db.meta.archives || []).some(a => a.month === month)) return { effects: [] };
    const label = new Date(month + '-15T12:00:00Z').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }), co = db.company;
    db.notifications.push({ id: uid('ntf'), type: 'archive', title: 'Archive du mois', body: `Téléchargez l'archive de ${label} (Paramètres → Données)`, level: 'info', route: 'settings', at: d.toISOString(), read: false });
    const effects = co.archiveWebhook ? [{ type: 'discord', url: co.archiveWebhook, body: {
      username: (co.name || 'LS Customs') + ' — Comptabilité',
      content: co.archiveRole ? `<@&${co.archiveRole}>` : undefined,
      allowed_mentions: { roles: co.archiveRole ? [co.archiveRole] : [] },
      embeds: [{ title: `🗄️ Archive de ${label} à télécharger`, color: 0x5aa9ef,
        description: `Le mois de ${label} est terminé.\nPensez à télécharger son archive puis à la supprimer de l'application : **Paramètres → Données → Archives mensuelles**.\nSupabase gratuit ne fait pas de sauvegarde : ce fichier est votre sauvegarde.`,
        timestamp: d.toISOString() }]
    } }] : [];
    return { effects };
  }

  /* =================== FACTURES EN JEU (GLife) ===================
   * API publique : par personnage de l'entreprise, nombre de factures et total facturé sur une période.
   * Récap envoyé sur Discord une fois par jour (tâche quotidienne / ouverture en local). */
  const GLIFE = 'https://apirp.glife.fr/roleplay/company/invoices';
  async function glifeInvoices(companyId, from, to) {
    const r = await fetch(`${GLIFE}?id=${encodeURIComponent(companyId)}&start=${Math.floor(from / 1000)}&end=${Math.floor(to / 1000)}`);
    if (!r.ok) throw new Error('GLife ' + r.status);
    const d = await r.json();
    return (Array.isArray(d) ? d : []).map(x => ({ charId: String(x.id), name: String(x.name || ''), count: +x.total || 0, revenue: +x.revenue || 0 })).sort((a, b) => b.revenue - a.revenue);
  }
  async function glifeRecap(db, now) {
    now = now || Date.now();
    const co = db && db.company;
    if (!co || !co.glifeWebhook || !co.glifeCompanyId) return null;
    const since = Date.parse(db.meta.glifeRecapAt || '') || now - DAY;
    if (now - since < 20 * 36e5) return null; // au plus une fois par jour
    let rows;
    try { rows = await glifeInvoices(co.glifeCompanyId, since, now); } catch (e) { return null; }
    db.meta.glifeRecapAt = new Date(now).toISOString();
    const emp = id => db.employees.find(e => !e.archived && e.charId === id);
    const total = rows.reduce((a, x) => a + x.revenue, 0), n = rows.reduce((a, x) => a + x.count, 0);
    const lines = rows.slice(0, 25).map((x, i) => `${i < 3 ? ['🥇', '🥈', '🥉'][i] : '•'} **${x.name}**${emp(x.charId) ? '' : ' ⚠️'} — ${x.count} facture${x.count > 1 ? 's' : ''} · ${money(x.revenue)}`);
    return { effects: [{ type: 'discord', url: co.glifeWebhook, body: {
      username: (co.name || 'LS Customs') + ' — Factures en jeu',
      embeds: [{ title: `🧾 Factures en jeu — ${fmtD(since)} → ${fmtD(now)}`, color: 0x5aa9ef,
        description: (lines.join('\n') || 'Aucune facture sur la période.') + (rows.some(x => !emp(x.charId)) ? '\n\n⚠️ = Char ID absent de la liste du personnel' : ''),
        fields: [{ name: 'Total facturé', value: money(total), inline: true }, { name: 'Factures', value: String(n), inline: true }, { name: 'Employés', value: String(rows.length), inline: true }],
        footer: { text: 'Source : API GLife (entreprise ' + co.glifeCompanyId + ')' }, timestamp: new Date(now).toISOString() }]
    } }] };
  }

  /* =================== STOCKAGE PAR LIGNES (Supabase) ===================
   * Les grosses collections sont stockées ligne par ligne : une action ne charge que
   * le document principal + les lignes « en cours » + ce dont elle a besoin (voir needs). */
  const ROWS = { sales: 'createdAt', commissions: 'createdAt', sessions: 'start', bank: 'at', audit: 'at', inventoryTx: 'at' };
  const ROW_REF = { commissions: 'saleId', bank: 'ref', inventoryTx: 'ref' };
  const rowOpen = (k, x) => k === 'sales' ? x.status === 'pending' : k === 'commissions' ? !x.payrollId : k === 'sessions' ? (!x.end || !x.payrollId) : false;
  const WINDOW = 15 * DAY; // l'interface charge 15 jours (semaine en cours + précédente), le reste à la demande
  function needs(action, p, core, now) {
    p = p || {}; now = now || Date.now();
    const q = [{ open: true }], day = DAY;
    if (action === 'bootstrap') q.push({ from: now - WINDOW, to: now + day });
    else if (action === 'vehicle.lookup') q.push({ kinds: ['sales'], plate: str(p.plate, 12).toUpperCase(), model: str(p.model, 40).toLowerCase() });
    else if (action === 'sales.cancel') {
      const inv = ((core && core.invoices) || []).find(i => i.saleId === p.id || (i.saleIds || []).includes(p.id));
      q.push({ kinds: ['sales'], ids: [String(p.id || '')] }, { kinds: ['commissions', 'bank'], refs: [String(p.id || '')].concat(inv ? [inv.id] : []) });
    } else if (action === 'payroll.generate') { const a = Date.parse(p.from), b = Date.parse(p.to); if (isFinite(a) && isFinite(b)) q.push({ kinds: ['sales'], from: a - day, to: b + 2 * day }); }
    else if (action === 'archive.export' || action === 'archive.purge') {
      const r = monthRange(p.month);
      if (r && (action === 'archive.purge' || ROWS[p.part])) q.push({ kinds: action === 'archive.purge' ? Object.keys(ROWS) : [p.part], from: r.from, to: r.to });
    }
    return q;
  }

  function rowScope(db, actorId) {
    const me = db.employees.find(e => e.id === actorId && !e.archived);
    if (!me) return null;
    const role = roleOf(db, me), can = p => hasPerm(role, p), any = (...ps) => ps.some(can);
    return { me: me.id,
      sales: any('sales.view_all', 'accounting.view', 'stats.all') ? 'all' : 'own',
      commissions: any('payroll.manage', 'stats.all', 'accounting.view') ? 'all' : 'own',
      sessions: any('service.view_all', 'payroll.manage') ? 'all' : 'own',
      bank: can('bank.view') ? 'all' : 'none', audit: can('audit.view') ? 'all' : 'none',
      inventoryTx: any('inventory.manage', 'stock.move') ? 'all' : 'none' };
  }

  /* ---------- lecture filtrée selon les permissions ---------- */
  function view(db, actorId) {
    const me = db.employees.find(e => e.id === actorId && !e.archived);
    if (!me) return { ok: false, error: "Vous n'êtes pas (ou plus) employé chez LS Customs" };
    const role = roleOf(db, me), can = p => hasPerm(role, p), any = (...ps) => ps.some(can);
    const own = (arr, k = 'employeeId') => arr.filter(x => x[k] === me.id);
    const rules = {
      sales: any('sales.view_all', 'accounting.view', 'stats.all') ? db.sales : own(db.sales),
      commissions: any('payroll.manage', 'stats.all', 'accounting.view') ? db.commissions : own(db.commissions),
      payrolls: can('payroll.manage') ? db.payrolls : own(db.payrolls),
      primes: can('payroll.manage') ? (db.primes || []) : own(db.primes || []),
      sessions: any('service.view_all', 'payroll.manage') ? db.sessions : own(db.sessions),
      warnings: any('warnings.manage', 'staff.view') ? db.warnings : own(db.warnings),
      absences: any('staff.view', 'payroll.manage') ? db.absences : own(db.absences),
      bank: can('bank.view') ? db.bank : [],
      audit: can('audit.view') ? db.audit.slice(-2000) : [],
      invoices: any('invoices.manage', 'accounting.view') ? db.invoices : [],
      bills: any('bills.manage', 'accounting.view') ? db.bills : [],
      expenses: any('expenses.manage', 'accounting.view') ? db.expenses : [],
      /* demandes de compte : visibles par la direction, sans le mot de passe */
      signups: can('staff.manage') ? (db.signups || []).map(x => { const o = Object.assign({}, x); delete o.pinHash; return o; }) : [],
      inventoryTx: any('inventory.manage', 'stock.move') ? db.inventoryTx.slice(-2000) : [],
      /* l'URL du webhook n'est transmise qu'aux gestionnaires du stock */
      partners: db.partners.map(k => Object.assign({}, k, { hasWebhook: !!k.webhook, webhook: can('partners.manage') ? k.webhook : '' })),
      stockCats: (db.stockCats || []).map(k => Object.assign({}, k, { hasWebhook: !!k.webhook, webhook: can('inventory.manage') ? k.webhook : '' }))
    };
    const state = { company: db.company, meta: db.meta };
    COLLECTIONS.forEach(k => { state[k] = k in rules ? rules[k] : db[k]; });
    state.employees = db.employees.map(e => { const o = Object.assign({}, e, { hasPassword: !!e.pinHash }); delete o.pinHash; delete o.license; delete o.failedLogins; return o; });
    /* URL des webhooks : uniquement pour ceux qui les gèrent */
    const WH = ['stockWebhook', 'archiveWebhook', 'saleWebhook', 'fireWebhook', 'glifeWebhook', 'unlistedWebhook'];
    state.company = Object.assign({}, db.company);
    WH.forEach(k => { state.company['has' + k[0].toUpperCase() + k.slice(1)] = !!db.company[k]; if (!can('settings.manage')) state.company[k] = ''; });
    state.products = db.products.map(x => x.webhook ? Object.assign({}, x, { hasWebhook: true, webhook: can('products.manage') ? x.webhook : '' }) : x);
    return { ok: true, state: clone(state), me: { id: me.id, roleId: role.id, perms: role.perms.slice() }, permissions: PERMISSIONS, serverTime: Date.now() };
  }

  /* ---------- point d'entrée unique ---------- */
  function handle(db, actorId, action, payload, now) {
    now = now || Date.now();
    if (action === 'bootstrap') return view(db, actorId);
    const fn = Object.prototype.hasOwnProperty.call(A, action) ? A[action] : null;
    if (!fn) return { ok: false, error: 'Action inconnue : ' + action };
    try {
      const c = context(db, actorId, now);
      const data = fn(c, payload && typeof payload === 'object' ? payload : {});
      if (data && data.readonly) return { ok: true, data, readonly: true, effects: c.effects }; // lecture seule : rien à enregistrer
      db.meta.version++;
      return { ok: true, data: data || null, effects: c.effects };
    } catch (e) {
      if (e && e.userError) return { ok: false, error: e.message };
      throw e;
    }
  }

  /* Exécute les effets externes (webhooks Discord). Appelé par l'hôte APRÈS l'enregistrement. */
  async function runEffects(list) {
    const out = [];
    for (const e of list || []) {
      if (e.type !== 'discord') continue;
      try {
        const r = await fetch(e.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e.body) });
        out.push({ ok: r.ok, status: r.status });
      } catch (err) { out.push({ ok: false, status: 0 }); }
    }
    return out;
  }

  return {
    config, PERMISSIONS, COLLECTIONS, ACTIONS: Object.keys(A), handle, view, register, login, setPassword, maintenance, glifeInvoices, glifeRecap, GTA_CLASSES, GTA_DEFAULT, vkey, ROWS, ROW_REF, rowOpen, needs, rowScope, WINDOW, ARCHIVE, emptyDb, defaultCompany, runEffects, saleMode, sha256,
    quote, unitPrice, stockOf, minutesOf, roundTo, hasPerm, roleOf
  };
});
