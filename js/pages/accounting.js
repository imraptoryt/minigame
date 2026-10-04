/* Comptabilité : Bilan, Ventes, Mes ventes, Ventes par produit,
 * Facturation client, Factures à payer, Salaires, Charges. */
(function () {
  'use strict';
  const LSC = window.LSC, U = LSC.ui, ST = LSC.stats, { esc, icon, money } = U;
  const A = () => LSC.app, S = () => LSC.app.state;
  const act = (name, label, ic, cls) => `<button class="icon-btn sm ${cls || ''}" data-a="${name}" title="${esc(label)}">${icon(ic, 'sm')}</button>`;
  const { onActs, idCell } = U;
  const SLIDES = 'https://docs.google.com/presentation/d/143wqzgB963IFtGqS2dPSmZ0I5K1Tfmk2bAuyNJkry5I/edit';

  /* =================== IMPÔTS (barème de la mairie) =================== */
  const fmtTo = t => t === Infinity ? 'et plus' : money(t), neg = v => v ? '-' + money(v) : money(0);
  function taxBlock(z) {
    const ded = z.expenses - z.chargesND, t = z.taxInfo;
    return `<div class="grid cols-2" style="gap:18px"><dl class="kv">
        <dt>Chiffre d'affaires (imposable)</dt><dd class="ok-t">${money(z.revenue)}</dd>
        <dt class="muted">Salaires et commissions</dt><dd>${neg(z.salaries + z.commissions)}</dd>
        <dt class="muted">Achats fournisseurs (stock)</dt><dd>${neg(z.purchases)}</dd>
        <dt class="muted">Frais déductibles</dt><dd>${neg(z.charges - z.chargesND + z.bills)}</dd>
        ${z.chargesND ? `<dt class="muted">Frais non déductibles</dt><dd class="faint" title="Payés, mais pas retirés avant l'impôt">${money(z.chargesND)}</dd>` : ''}
        <dt style="font-weight:700;color:var(--text)">Résultat imposable</dt><dd style="font-weight:700" class="${z.taxable < 0 ? 'danger-t' : ''}">${money(z.taxable)}</dd>
      </dl><div>
        <table class="tbl compact"><thead><tr><th>Tranche</th><th class="right">Taux</th><th class="right">Part</th><th class="right">Impôt</th></tr></thead><tbody>
        ${t.lines.map(l => `<tr class="${l.base ? '' : 'faint'}"><td>${money(l.from)} → ${fmtTo(l.to)}</td><td class="right">${l.rate}%</td><td class="right">${money(l.base)}</td><td class="right">${money(l.amount)}</td></tr>`).join('')}
        </tbody></table>
        <div class="sum-total" style="padding:10px 0 0;margin-top:8px;border-top:1px solid var(--line)"><span>Impôt total dû</span><b>${money(z.tax)}</b></div>
        <div class="row" style="justify-content:space-between;margin-top:6px"><span class="muted">Résultat net (imposable − impôt)</span><b class="${z.taxable - z.tax < 0 ? 'danger-t' : 'ok-t'}">${money(z.taxable - z.tax)}</b></div>
        <p class="hint" style="margin:8px 0 0">Charges déductibles retirées : ${money(ded)}. Barème modifiable dans Paramètres → Comptabilité.</p>
      </div></div>`;
  }
  function taxRules() {
    const li = (b, t) => `<li><b>${b}</b> ${t}</li>`;
    return `<ul class="rules">
      ${li('CA :', "tout l'argent encaissé, hors TVA (la TVA n'est pas une charge, elle se reverse à la mairie).")}
      ${li('Imposable :', "le CA et les produits d'autres activités. Les subventions de la mairie ne le sont pas.")}
      ${li('Déductible :', 'salaires, achats fournisseurs (kits, stock), loyers.')}
      ${li('Non déductible :', 'achat de locaux ou de véhicules, customs de véhicules, achats de confort (nourriture).')}
      ${li('Salaires :', "un % du bénéfice de l'employé (prix − coût du kit), pas de son CA.")}
      ${li('Impôt :', 'par tranches — 10 % jusqu’à 20 000 $, 20 % de 20 000 à 50 000 $, 30 % au-delà.')}
      ${li('Après impôt :', 'dividendes (obligatoires), primes (facultatives), trésorerie à laisser en banque (obligatoire).')}
    </ul><a class="btn sm ghost" href="${SLIDES}" target="_blank" rel="noopener" style="margin-top:8px">${icon('external-link')}Bases de la comptabilité (mairie)</a>`;
  }

  /* =================== BILAN =================== */
  const bst = { period: 'week' };
  function bilan(el) {
    const s = S(), r = ST.range(bst.period, bst.from, bst.to, bst.wk), z = ST.summary(s, r), o = ST.summary(s, ST.prev(r)), ser = ST.series(s, r);
    const top = ST.byProduct(s, r).slice(0, 6), bySeller = {};
    s.sales.filter(x => x.status !== 'cancelled' && ST.within(r, x.createdAt)).forEach(x => { bySeller[x.employeeName] = (bySeller[x.employeeName] || 0) + x.total; });
    const sellers = Object.keys(bySeller).sort((a, b) => bySeller[b] - bySeller[a]).slice(0, 6).map(k => ({ label: k, value: bySeller[k] }));
    const cats = {};
    s.expenses.filter(e => ST.within(r, e.date)).forEach(e => { cats[e.category] = (cats[e.category] || 0) + e.amount; });
    const catLabel = id => (s.company.expenseCategories.find(c => c.id === id) || {}).label || ((s.expenses.find(e => e.category === id) || {}).categoryLabel) || id;
    const rows = [
      ['Chiffre d\'affaires', z.revenue, 'ok'], ['Prix usine des ventes', -z.factory], ['Marge brute (bénéfice)', z.gross, 'b'],
      ['Achats de stock', -z.purchases], ['Frais (commandes)', -z.charges - z.bills], ['Salaires', -z.salaries], ['Commissions', -z.commissions],
      ['Total dépenses', -z.expenses, 'b'], ['Bénéfice net', z.net, 'b'], ['Impôt (barème)', -z.tax], ['Bénéfice net après impôt', z.netAfterTax, 'b']
    ];
    el.innerHTML = `<div class="page-head"><div><h1>Bilan</h1><div class="sub">Compte de résultat calculé à partir des ventes, charges, paies et achats.</div></div><div class="actions">${U.periodBar(bst)}</div></div>
      <div class="grid stats">
        ${U.stat({ label: "Chiffre d'affaires", value: money(z.revenue), trend: ST.trend(z.revenue, o.revenue), icon: 'dollar-sign' })}
        ${U.stat({ label: 'Dépenses', value: money(z.expenses), trend: ST.trend(z.expenses, o.expenses), icon: 'arrow-up-right', tone: 'warn' })}
        ${U.stat({ label: 'Bénéfice', value: money(z.gross), sub: 'marge brute', icon: 'trending-up' })}
        ${U.stat({ label: 'Bénéfice net', value: money(z.net), valueCls: z.net < 0 ? 'danger-t' : 'ok-t', trend: ST.trend(z.net, o.net), icon: 'piggy-bank' })}
      </div>
      <div class="grid stats mt">
        ${U.stat({ label: 'Salaires', value: money(z.salaries), icon: 'banknote', tone: 'info', route: 'payroll' })}
        ${U.stat({ label: 'Commissions', value: money(z.commissions), icon: 'percent', tone: 'info' })}
        ${U.stat({ label: 'Frais (commandes)', value: money(z.charges + z.bills), sub: 'moteur, kit carrosserie, Kärcher', icon: 'wallet', tone: 'warn', route: 'expenses' })}
        ${U.stat({ label: 'Achats', value: money(z.purchases), sub: 'réassort stock', icon: 'package', tone: 'warn', route: 'inventory' })}
      </div>
      <div class="grid cols-3 mt">
        ${U.panel('Chiffre d\'affaires et dépenses', U.chart({ labels: ser.map(x => x.label), series: [{ name: "Chiffre d'affaires", values: ser.map(x => x.revenue) }, { name: 'Dépenses', values: ser.map(x => x.expenses), color: 'var(--warn)' }], type: 'area', height: 262 }), { icon: 'chart-line', cls: 'span-2' })}
        ${U.panel('Compte de résultat', `<dl class="kv">${rows.map(x => `<dt class="${x[2] === 'b' ? '' : 'muted'}" style="${x[2] === 'b' ? 'font-weight:700;color:var(--text)' : ''}">${x[0]}</dt><dd class="${x[1] < 0 ? '' : 'ok-t'}" style="${x[2] === 'b' ? 'font-weight:700' : ''}">${money(x[1])}</dd>`).join('')}</dl>`, { icon: 'scale' })}
      </div>
      <div class="grid cols-3 mt">
        ${U.panel('Impôt de la période', taxBlock(z), { icon: 'landmark', cls: 'span-2', right: '<span class="muted">sur la période affichée</span>' })}
        ${U.panel('Règles de la mairie', taxRules(), { icon: 'book-open' })}
      </div>
      <div class="grid cols-3 mt">
        ${U.panel('Bénéfice net par période', U.chart({ labels: ser.map(x => x.label), series: [{ name: 'Bénéfice net', values: ser.map(x => x.net) }], type: 'bar', height: 220 }), { icon: 'chart-column', cls: 'span-2' })}
        ${U.panel('Répartition des frais', U.hbars(Object.keys(cats).sort((a, b) => cats[b] - cats[a]).map(k => ({ label: catLabel(k), value: cats[k], color: 'var(--warn)' }))), { icon: 'chart-pie' })}
      </div>
      <div class="grid cols-3 mt">
        ${U.panel('Nombre de ventes', U.chart({ labels: ser.map(x => x.label), series: [{ name: 'Ventes', values: ser.map(x => x.count), color: 'var(--info)' }], type: 'bar', money: false, height: 220 }), { icon: 'chart-column', cls: 'span-2' })}
        ${U.panel('Meilleurs services', top.length ? U.hbars(top.map(t => ({ label: `${t.name} (${t.qty})`, value: t.revenue }))) : U.empty({ title: 'Aucune vente', hint: false }), { icon: 'trophy' })}
      </div>
      <div class="grid cols-3 mt">
        ${U.panel('Meilleurs vendeurs', sellers.length ? U.hbars(sellers) : U.empty({ title: 'Aucune vente', hint: false }), { icon: 'medal' })}
        ${U.panel('Dernières transactions', LSC.home.lastSales(s), { icon: 'arrow-left-right', right: A().allowed('sales') ? `<button class="btn sm ghost" data-go="sales">Tout voir</button>` : '' })}
        ${U.panel('Alertes comptables', LSC.home.alerts(s), { icon: 'triangle-alert' })}
      </div>
      ${s.company.glifeCompanyId ? `<div class="mt">${U.panel('Factures en jeu (GLife)', '<div id="glInv">' + U.skeleton('table') + '</div>', { icon: 'receipt-text', right: '<span class="muted">entreprise ' + esc(s.company.glifeCompanyId) + '</span>' })}</div>` : ''}`;
    if (s.company.glifeCompanyId) glifePanel(el.querySelector('#glInv'), s, r);
    U.bindPeriod(el, bst, () => bilan(el));
    el.querySelectorAll('[data-sale]').forEach(x => x.onclick = () => LSC.open.sale(x.dataset.sale));
  }

  /* Factures facturées en jeu (API publique GLife), par personnage de l'entreprise */
  const glCache = {};
  async function glifePanel(box, s, r) {
    const key = s.company.glifeCompanyId + ':' + r.from + ':' + Math.min(r.to, Date.now());
    let rows = glCache[key];
    if (!rows) {
      try { rows = glCache[key] = await LSCServer.glifeInvoices(s.company.glifeCompanyId, r.from, Math.min(r.to, Date.now())); }
      catch (e) { if (box.isConnected) box.innerHTML = U.empty({ icon: 'wifi-off', title: 'API GLife injoignable', hint: false }); return; }
    }
    if (!box.isConnected) return;
    const emp = id => s.employees.find(e => e.charId === id);
    U.table(box, { id: 'glife', rows, sort: 'revenue', pageSize: 15,
      empty: { icon: 'receipt-text', title: 'Aucune facture en jeu', text: 'Aucune facture sur cette période.', hint: false },
      columns: [{ key: 'name', label: 'Personnage', render: x => `<b>${esc(x.name)}</b><br><small class="muted">Char ID ${esc(x.charId)}</small>` },
        { key: 'emp', label: 'Personnel', sortable: false, render: x => emp(x.charId) ? U.badge(A().roleName(emp(x.charId).roleId), 'ok') : U.badge('Non relié', 'warn') },
        { key: 'count', label: 'Factures', align: 'right' }, { key: 'revenue', label: 'Total facturé', align: 'right', render: x => `<b>${money(x.revenue)}</b>` }] });
  }

  /* =================== VENTES =================== */
  const sst = { period: 'week', q: '', emp: '', pay: '', status: '', min: '', max: '' };
  const mst = { period: 'week', q: '', pay: '', status: '' };
  function salesPage(el, own) {
    const s = S(), st = own ? mst : sst, me = A().me.id;
    const emps = s.employees.filter(e => s.sales.some(x => x.employeeId === e.id));
    el.innerHTML = `<div class="page-head"><div><h1>${own ? 'Mes ventes' : 'Ventes'}</h1><div class="sub">${own ? 'Historique de vos ventes et commissions.' : 'Toutes les ventes enregistrées au point de vente.'}</div></div>
        <div class="actions">${U.periodBar(st)}${A().can('pos.use') ? `<button class="btn primary sm" data-go="pos">${icon('plus')}Nouvelle vente</button>` : ''}</div></div>
      <div id="salesStats"></div>
      <div class="panel mt"><div class="panel-body">
        <div class="filters">
          <div class="search">${icon('search')}<input class="input" data-f="q" placeholder="N°, client, employé..." value="${esc(st.q)}"></div>
          ${own ? '' : `<select class="input" data-f="emp" data-combo><option value="">Tous les employés</option>${U.opts(emps.map(e => ({ value: e.id, label: e.name })), st.emp)}</select>`}
          <select class="input" data-f="pay"><option value="">Tous paiements</option>${U.opts(s.company.paymentMethods.map(m => ({ value: m.id, label: m.label })), st.pay)}</select>
          <select class="input" data-f="status"><option value="">Tous statuts</option>${U.opts([{ value: 'paid', label: 'Payée' }, { value: 'pending', label: 'En attente' }, { value: 'cancelled', label: 'Annulée' }], st.status)}</select>
          ${own ? '' : `<input class="input" style="width:110px;min-width:0" type="number" data-f="min" placeholder="Min $" value="${esc(st.min)}"><input class="input" style="width:110px;min-width:0" type="number" data-f="max" placeholder="Max $" value="${esc(st.max)}">`}
        </div><div id="salesTable"></div></div></div>`;
    const draw = reset => {
      const r = ST.range(st.period, st.from, st.to, st.wk), q = st.q.toLowerCase();
      const rows = s.sales.filter(x => ST.within(r, x.createdAt) && (!own || x.employeeId === me) && (!st.emp || x.employeeId === st.emp) && (!st.pay || x.payment === st.pay) && (!st.status || x.status === st.status)
        && (st.min === '' || x.total >= +st.min) && (st.max === '' || x.total <= +st.max)
        && (!q || ('#' + x.num + ' ' + x.ref + ' ' + x.customerName + ' ' + x.employeeName).toLowerCase().includes(q)));
      const ok = rows.filter(x => x.status !== 'cancelled'), tot = ok.reduce((a, x) => a + x.total, 0);
      const com = ok.reduce((a, x) => a + (x.commission || 0), 0);
      el.querySelector('#salesStats').innerHTML = `<div class="grid stats">
        ${U.stat({ label: 'Total des ventes', value: money(tot), icon: 'dollar-sign' })}
        ${U.stat({ label: 'Nombre de ventes', value: ok.length, sub: rows.length - ok.length ? `${rows.length - ok.length} annulée(s)` : '', icon: 'receipt', tone: 'info' })}
        ${U.stat({ label: 'Panier moyen', value: money(ok.length ? tot / ok.length : 0), icon: 'shopping-basket' })}
        ${U.stat({ label: own ? 'Mes commissions' : 'Commissions', value: money(com), icon: 'percent', tone: 'info' })}</div>`;
      U.table(el.querySelector('#salesTable'), {
        id: own ? 'mysales' : 'sales', rows, sort: 'createdAt', resetPage: reset, onRow: x => LSC.open.sale(x.id),
        empty: { icon: 'receipt', title: 'Aucune transaction', text: 'Aucune vente pour ces filtres.', hint: 'Modifiez les filtres ou créez une nouvelle vente.' },
        rowClass: x => x.status === 'cancelled' ? 'dim' : '',
        columns: [
          { key: 'num', label: 'ID', render: x => `<b>#${x.num}</b>` },
          { key: 'partnerName', label: 'Partenaire', render: x => x.partnerName ? esc(x.partnerName) : '<span class="faint">—</span>' },
          ...(own ? [] : [{ key: 'employeeName', label: 'Employé', render: x => esc(x.employeeName) }]),
          { key: 'items', label: 'Articles', sortValue: x => x.items.length, render: x => `<span class="muted">${esc(x.items.map(i => i.name + (i.qty > 1 ? ' x' + i.qty : '')).join(', ')).slice(0, 60)}</span>` },
          { key: 'total', label: 'Total', align: 'right', render: x => `<b>${money(x.total)}</b>${x.discount ? `<br><small class="warn-t">-${money(x.discount.amount)}</small>` : ''}` },
          ...(own ? [{ key: 'commission', label: 'Commission', align: 'right', render: x => money(x.commission) }] : []),
          { key: 'payment', label: 'Paiement', render: x => esc(A().payLabel(x.payment)) },
          { key: 'createdAt', label: 'Date', render: x => `<span class="nowrap">${U.fmtDate(x.createdAt)} <span class="muted">${U.fmtTime(x.createdAt)}</span></span>` },
          { key: 'status', label: 'Statut', render: x => U.status('sale', x.status) }]
      });
    };
    el.querySelectorAll('[data-f]').forEach(i => i.addEventListener(i.tagName === 'SELECT' ? 'change' : 'input', () => { st[i.dataset.f] = i.value; draw(true); }));
    U.bindPeriod(el, st, () => salesPage(el, own));
    draw();
  }

  LSC.open.sale = id => {
    const s = S().sales.find(x => x.id === id);
    if (!s) return U.toast('Vente introuvable (ou non visible avec vos permissions)', 'error');
    const adj = (a, label) => a ? `<dt>${label}</dt><dd>${a.type === 'percent' ? a.value + '% · ' : ''}${money(a.amount)} <small class="muted">— ${esc(a.reason)} (${esc(a.byName)})</small></dd>` : '';
    const m = U.modal({
      title: 'Vente #' + s.ref, icon: 'receipt', size: 'lg',
      body: `<div class="grid cols-2">
        <dl class="kv"><dt>Employé</dt><dd>${esc(s.employeeName)}</dd>${s.partnerName ? `<dt>Partenaire</dt><dd>${esc(s.partnerName)}</dd>` : ''}
          ${s.vehicle ? `<dt>Véhicule</dt><dd>${s.vehicle.name ? esc(s.vehicle.name) + ' · ' : ''}${esc(s.vehicle.plate || '—')}${s.vehicle.class ? ` · Catégorie ${s.vehicle.class}` : ''} <small class="muted">(${s.vehicle.source === 'auto' ? 'auto' : 'manuel'})</small></dd>` : ''}
          <dt>Date</dt><dd>${U.fmtDT(s.createdAt)}</dd><dt>Paiement</dt><dd>${esc(A().payLabel(s.payment))}</dd><dt>Statut</dt><dd>${U.status('sale', s.status)}</dd></dl>
        <dl class="kv"><dt>Sous-total</dt><dd>${money(s.subtotal)}</dd>${adj(s.discount, 'Réduction')}${adj(s.markup, 'Majoration')}
          <dt>Prix usine</dt><dd>${money(s.factory)}</dd><dt>Commission (${s.commissionRate}%)</dt><dd>${money(s.commission)}</dd><dt><b>Total</b></dt><dd class="ok-t"><b>${money(s.total)}</b></dd></dl></div>
        <div class="section-title">Articles</div>
        <table class="tbl compact"><thead><tr><th>Article</th><th class="right">Prix</th><th class="right">Qté</th><th class="right">Total</th></tr></thead>
          <tbody>${s.items.map(i => `<tr><td>${esc(i.name)}</td><td class="right">${money(i.price)}</td><td class="right">${i.qty}</td><td class="right">${money(i.total)}</td></tr>`).join('')}</tbody></table>
        ${s.note ? `<div class="section-title">Note</div><p class="muted" style="margin:0">${esc(s.note)}</p>` : ''}
        ${s.status === 'cancelled' ? `<div class="alert danger mt">${icon('ban')}<span>Annulée le ${U.fmtDT(s.cancelledAt)} par <b>${esc(s.cancelledBy)}</b> — ${esc(s.cancelReason)}</span></div>` : ''}`,
      foot: `${s.invoiceId && A().can('invoices.manage') ? `<button class="btn ghost" data-inv>${icon('file-text')}Voir la facture</button>` : ''}<span class="grow"></span>
        ${s.status !== 'cancelled' && A().can('sales.cancel') ? `<button class="btn danger" data-cancel>${icon('ban')}Annuler la vente</button>` : ''}<button class="btn" data-close>Fermer</button>`
    });
    const inv = m.el.querySelector('[data-inv]');
    if (inv) inv.onclick = () => { m.close(); LSC.open.invoice(s.invoiceId); };
    const c = m.el.querySelector('[data-cancel]');
    if (c) c.onclick = () => U.form({ title: 'Annuler la vente #' + s.ref, icon: 'ban', size: 'sm', danger: true, submit: "Confirmer l'annulation",
      intro: `<p class="lead" style="margin-bottom:12px">Le paiement bancaire sera remboursé, le stock restitué et la commission régularisée.</p>`,
      fields: [{ name: 'reason', label: 'Motif', required: true, full: true }],
      onSubmit: async v => { const r = await A().call('sales.cancel', { id: s.id, reason: v.reason }, 'Vente annulée'); if (r.ok) m.close(); return r; } });
  };

  /* =================== VENTES PAR PRODUIT =================== */
  const pst = { period: 'week', q: '' };
  function byProduct(el) {
    const s = S(), r = ST.range(pst.period, pst.from, pst.to, pst.wk), rows = ST.byProduct(s, r);
    const tot = rows.reduce((a, x) => a + x.revenue, 0), mar = rows.reduce((a, x) => a + x.margin, 0);
    el.innerHTML = `<div class="page-head"><div><h1>Ventes par produit</h1><div class="sub">Analyse des services et produits vendus (hors ventes annulées, avant réduction).</div></div><div class="actions">${U.periodBar(pst)}</div></div>
      <div class="grid stats">${U.stat({ label: "Chiffre d'affaires", value: money(tot), icon: 'dollar-sign' })}${U.stat({ label: 'Marge', value: money(mar), sub: tot ? (mar / tot * 100).toFixed(1) + '% du CA' : '', icon: 'trending-up' })}
        ${U.stat({ label: 'Articles vendus', value: rows.reduce((a, x) => a + x.qty, 0), icon: 'package', tone: 'info' })}${U.stat({ label: 'Meilleur service', value: rows[0] ? esc(rows[0].name) : '—', sub: rows[0] ? money(rows[0].revenue) : '', icon: 'trophy', tone: 'warn' })}</div>
      <div class="grid cols-3 mt">
        <div class="panel span-2"><div class="panel-head"><h3>${icon('chart-bar')}Détail par service</h3><div class="search">${icon('search')}<input class="input" id="bpq" placeholder="Filtrer..." value="${esc(pst.q)}"></div></div><div class="panel-body" id="bpTable"></div></div>
        ${U.panel('Top 8 — chiffre d\'affaires', U.hbars(rows.slice(0, 8).map(x => ({ label: x.name, value: x.revenue }))), { icon: 'trophy' })}
      </div>`;
    const draw = () => U.table(el.querySelector('#bpTable'), {
      id: 'byproduct', rows: rows.filter(x => !pst.q || x.name.toLowerCase().includes(pst.q.toLowerCase())), sort: 'revenue', onRow: x => LSC.open.product(x.productId, r),
      empty: { icon: 'chart-bar', title: 'Aucune vente', text: 'Aucune vente sur cette période.' },
      columns: [
        { key: 'name', label: 'Service', render: x => `<b>${esc(x.name)}</b><br><small class="muted">${esc(A().catLabel(x.category))}</small>` },
        { key: 'qty', label: 'Nombre de ventes', align: 'right' },
        { key: 'revenue', label: "Chiffre d'affaires", align: 'right', render: x => `<b>${money(x.revenue)}</b>` },
        { key: 'margin', label: 'Marge', align: 'right', render: x => `<span class="ok-t">${money(x.margin)}</span>` },
        { key: 'pct', label: 'Marge %', align: 'right', sortValue: x => x.revenue ? x.margin / x.revenue : 0, render: x => (x.revenue ? (x.margin / x.revenue * 100).toFixed(0) : 0) + '%' }]
    });
    el.querySelector('#bpq').oninput = e => { pst.q = e.target.value; draw(); };
    U.bindPeriod(el, pst, () => byProduct(el));
    draw();
  }
  LSC.open.product = (id, range) => {
    const s = S(), p = s.products.find(x => x.id === id);
    const r = range || ST.range('month');
    const sales = ST.salesIn(s, r, x => x.items.some(i => i.productId === id));
    const lines = sales.map(x => ({ sale: x, item: x.items.find(i => i.productId === id) }));
    const qty = lines.reduce((a, l) => a + l.item.qty, 0), rev = lines.reduce((a, l) => a + l.item.total, 0), mar = lines.reduce((a, l) => a + l.item.total - l.item.cost * l.item.qty, 0);
    const byEmp = {};
    lines.forEach(l => { const k = l.sale.employeeName; byEmp[k] = byEmp[k] || { qty: 0, rev: 0 }; byEmp[k].qty += l.item.qty; byEmp[k].rev += l.item.total; });
    const list = ST.buckets(r), vals = list.map(() => 0);
    lines.forEach(l => { const t = Date.parse(l.sale.createdAt); let i = list.length - 1; while (i > 0 && list[i].start > t) i--; vals[i] += l.item.total; });
    const name = p ? p.name : (lines[0] ? lines[0].item.name : 'Produit');
    const m = U.modal({ title: name, icon: (p && p.icon) || 'package', size: 'xl',
      body: `<div class="grid stats">${U.stat({ label: 'Nombre de ventes', value: qty, icon: 'receipt' })}${U.stat({ label: "Chiffre d'affaires", value: money(rev), icon: 'dollar-sign' })}${U.stat({ label: 'Marge', value: money(mar), icon: 'trending-up' })}${U.stat({ label: 'Prix actuel', value: p ? money(p.price) : '—', sub: p ? 'coût ' + money(p.cost) : 'produit supprimé', icon: 'tag', tone: 'info' })}</div>
        <div class="grid cols-3 mt">${U.panel('Évolution', U.chart({ labels: list.map(b => b.label), series: [{ name: "Chiffre d'affaires", values: vals }], height: 210 }), { cls: 'span-2', icon: 'chart-line' })}
          ${U.panel('Employés ayant vendu', U.hbars(Object.keys(byEmp).sort((a, b) => byEmp[b].rev - byEmp[a].rev).map(k => ({ label: `${k} (${byEmp[k].qty})`, value: byEmp[k].rev }))), { icon: 'users' })}</div>
        <div class="section-title">Historique</div><div id="pdHist"></div>`,
      foot: `${p && A().can('products.manage') ? `<button class="btn" data-edit>${icon('pencil')}Modifier le produit</button>` : ''}<span class="grow"></span><button class="btn" data-close>Fermer</button>` });
    U.table(m.el.querySelector('#pdHist'), { id: 'pdhist', rows: lines.map(l => ({ id: l.sale.id, num: l.sale.num, at: l.sale.createdAt, emp: l.sale.employeeName, cust: l.sale.partnerName || '—', qty: l.item.qty, total: l.item.total })), sort: 'at', pageSize: 8, resetPage: true, compact: true,
      onRow: x => { m.close(); LSC.open.sale(x.id); }, empty: { title: 'Aucune vente sur la période', hint: false },
      columns: [{ key: 'num', label: 'Vente', render: x => '#' + x.num }, { key: 'at', label: 'Date', render: x => U.fmtDT(x.at) }, { key: 'emp', label: 'Employé' }, { key: 'cust', label: 'Partenaire' }, { key: 'qty', label: 'Qté', align: 'right' }, { key: 'total', label: 'Total', align: 'right', render: x => money(x.total) }] });
    const ed = m.el.querySelector('[data-edit]');
    if (ed) ed.onclick = () => { m.close(); LSC.forms.product(id); };
  };

  /* =================== FACTURATION CLIENT =================== */
  const ist = { tab: 'all', q: '' };
  function invoices(el) {
    const s = S(), all = s.invoices.map(i => Object.assign({}, i, { st: ST.invoiceStatus(i) }));
    const count = k => all.filter(i => i.st === k).length;
    const tabsList = [{ id: 'all', label: 'Toutes', count: all.length }, { id: 'draft', label: 'Brouillons', count: count('draft') }, { id: 'sent', label: 'Envoyées', count: count('sent') }, { id: 'overdue', label: 'En retard', count: count('overdue') }, { id: 'paid', label: 'Payées', count: count('paid') }, { id: 'cancelled', label: 'Annulées', count: count('cancelled') }];
    const pending = all.filter(i => i.st === 'sent' || i.st === 'overdue');
    const todo = s.sales.filter(x => x.partnerId && x.status === 'pending' && !x.invoiceId);
    el.innerHTML = `<div class="page-head"><div><h1>Factures partenaires</h1><div class="sub">Les ventes faites avec un partenaire sont mises « à facturer ». « Générer la facture » les regroupe et l'envoie sur le Discord du partenaire (avec ping).</div></div>
        <div class="actions">${A().can('partners.manage') ? `<button class="btn sm" data-newp>${icon('handshake')}Nouveau partenaire</button>` : ''}<button class="btn primary sm" data-new>${icon('file-pen')}Facture personnalisée</button></div></div>
      <div class="grid stats">${U.stat({ label: 'À facturer', value: money(todo.reduce((a, x) => a + x.total, 0)), sub: todo.length + ' vente(s) partenaire', icon: 'file-plus', tone: 'warn' })}
        ${U.stat({ label: 'À encaisser', value: money(pending.reduce((a, i) => a + i.total, 0)), sub: pending.length + ' facture(s)', icon: 'hourglass', tone: 'info' })}
        ${U.stat({ label: 'En retard', value: money(all.filter(i => i.st === 'overdue').reduce((a, i) => a + i.total, 0)), sub: count('overdue') + ' facture(s)', icon: 'clock-alert', tone: 'danger' })}
        ${U.stat({ label: 'Encaissé ce mois', value: money(all.filter(i => i.st === 'paid' && ST.within(ST.range('month'), i.paidAt)).reduce((a, i) => a + i.total, 0)), icon: 'circle-check' })}
      </div>
      <div class="section-title" style="margin-top:18px">Partenaires (${s.partners.length})</div><div id="pCards"></div>
      <div class="panel mt"><div class="panel-head"><h3>${icon('history')}Historique des factures</h3></div><div class="panel-body"><div class="filters">${U.tabs(tabsList, ist.tab)}<span class="grow"></span><div class="search">${icon('search')}<input class="input" id="invq" placeholder="N°, partenaire..." value="${esc(ist.q)}"></div></div><div id="invTable"></div></div></div>`;
    const draw = reset => U.table(el.querySelector('#invTable'), {
      id: 'invoices', sort: 'createdAt', resetPage: reset, onRow: x => LSC.open.invoice(x.id),
      rows: all.filter(i => (ist.tab === 'all' || i.st === ist.tab) && (!ist.q || (i.ref + ' ' + i.customerName).toLowerCase().includes(ist.q.toLowerCase()))),
      empty: { icon: 'file-text', title: 'Aucune facture', text: 'Aucune facture dans cette catégorie.', hint: 'Créez une nouvelle facture.' },
      columns: [
        { key: 'num', label: 'Facture', render: x => `<b>${esc(x.ref)}</b><br>${x.kind === 'auto' ? U.badge('Auto · ' + (x.saleIds || []).length + ' vente(s)', 'info') : U.badge('Personnalisée')}` },
        { key: 'customerName', label: 'Partenaire', render: x => esc(x.customerName) },
        { key: 'total', label: 'Montant', align: 'right', render: x => `<b>${money(x.total)}</b>` },
        { key: 'createdAt', label: 'Émise le', render: x => U.fmtDate(x.createdAt) },
        { key: 'due', label: 'Échéance', render: x => `<span class="${x.st === 'overdue' ? 'danger-t' : ''}">${U.fmtDate(x.due)}</span>` },
        { key: 'st', label: 'Statut', render: x => U.status('invoice', x.st) },
        { key: 'a', label: '', sortable: false, align: 'right', render: x => idCell(x.id, (x.st === 'draft' ? act('send', 'Envoyer', 'send') : '') + (x.st === 'sent' || x.st === 'overdue' || x.st === 'draft' ? act('pay', 'Encaisser', 'circle-dollar-sign') : '') + (x.st === 'draft' ? act('edit', 'Modifier', 'pencil') : '')) }]
    });
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { ist.tab = b.dataset.tab; invoices(el); });
    el.querySelector('#invq').oninput = e => { ist.q = e.target.value; draw(true); };
    el.querySelector('[data-new]').onclick = () => invoiceEditor(null);
    const np = el.querySelector('[data-newp]');
    if (np) np.onclick = () => LSC.forms.partner(null);
    LSC.partnerCards(el.querySelector('#pCards'));
    onActs(el.querySelector('#invTable'), { send: id => A().call('invoices.send', { id }, 'Facture envoyée'), pay: id => payInvoice(id), edit: id => invoiceEditor(id) });
    draw();
  }
  function payInvoice(id) {
    const i = S().invoices.find(x => x.id === id);
    U.form({ title: 'Encaisser ' + i.ref, icon: 'circle-dollar-sign', size: 'sm', submit: 'Confirmer le paiement', intro: `<p class="lead" style="margin-bottom:12px">${esc(i.customerName)} — <b class="ok-t">${money(i.total)}</b></p>`,
      fields: [{ name: 'method', label: 'Mode de règlement', type: 'select', full: true, options: [{ value: 'bank', label: 'Virement / carte (compte bancaire)' }, { value: 'cash', label: 'Espèces (caisse)' }] }],
      onSubmit: v => A().call('invoices.pay', { id, method: v.method }, 'Paiement effectué') });
  }
  LSC.open.invoice = id => {
    const i = S().invoices.find(x => x.id === id);
    if (!i) return U.toast('Facture introuvable', 'error');
    const st = ST.invoiceStatus(i);
    const m = U.modal({ title: 'Facture ' + i.ref, icon: 'file-text', size: 'lg',
      body: `<div class="grid cols-2"><dl class="kv"><dt>Partenaire</dt><dd>${esc(i.customerName)}</dd><dt>Émise le</dt><dd>${U.fmtDate(i.createdAt)}</dd><dt>Par</dt><dd>${esc(i.createdByName || '—')}</dd></dl>
        <dl class="kv"><dt>Échéance</dt><dd>${U.fmtDate(i.due)}</dd><dt>Statut</dt><dd>${U.status('invoice', st)}</dd>${i.paidAt ? `<dt>Payée le</dt><dd>${U.fmtDT(i.paidAt)}</dd>` : ''}</dl></div>
        <div class="section-title">Lignes</div><table class="tbl compact"><thead><tr><th>Désignation</th><th class="right">Prix</th><th class="right">Qté</th><th class="right">Total</th></tr></thead>
        <tbody>${i.items.map(l => `<tr><td>${esc(l.label)}</td><td class="right">${money(l.price)}</td><td class="right">${l.qty}</td><td class="right">${money(l.price * l.qty)}</td></tr>`).join('')}
        <tr><td colspan="3" class="right"><b>Total</b></td><td class="right ok-t"><b>${money(i.total)}</b></td></tr></tbody></table>
        ${i.note ? `<div class="section-title">Note</div><p class="muted" style="margin:0">${esc(i.note)}</p>` : ''}`,
      foot: `${i.saleId ? `<button class="btn ghost" data-sale>${icon('receipt')}Voir la vente</button>` : ''}<span class="grow"></span>
        ${st === 'draft' ? `<button class="btn danger" data-del>${icon('trash-2')}Supprimer</button><button class="btn" data-edit>${icon('pencil')}Modifier</button><button class="btn" data-send>${icon('send')}Envoyer</button>` : ''}
        ${(st === 'sent' || st === 'overdue') && !i.saleId ? `<button class="btn danger" data-cancel>${icon('ban')}Annuler</button>` : ''}
        ${st === 'sent' || st === 'overdue' || st === 'draft' ? `<button class="btn primary" data-pay>${icon('circle-dollar-sign')}Encaisser</button>` : `<button class="btn" data-close>Fermer</button>`}` });
    const on = (sel, fn) => { const b = m.el.querySelector(sel); if (b) b.onclick = fn; };
    on('[data-sale]', () => { m.close(); LSC.open.sale(i.saleId); });
    on('[data-edit]', () => { m.close(); invoiceEditor(i.id); });
    on('[data-send]', async () => { if ((await A().call('invoices.send', { id: i.id }, 'Facture envoyée')).ok) m.close(); });
    on('[data-pay]', () => { m.close(); payInvoice(i.id); });
    on('[data-cancel]', async () => { if (await U.confirm(`Annuler la facture ${i.ref} ?`, { danger: true, ok: 'Annuler la facture' })) { if ((await A().call('invoices.cancel', { id: i.id }, 'Facture annulée')).ok) m.close(); } });
    on('[data-del]', async () => { if (await U.confirm(`Supprimer le brouillon ${i.ref} ?`, { danger: true, ok: 'Supprimer' })) { if ((await A().call('invoices.delete', { id: i.id }, 'Brouillon supprimé')).ok) m.close(); } });
  };
  function invoiceEditor(id) {
    const s = S(), inv = id ? s.invoices.find(x => x.id === id) : null;
    let lines = inv ? inv.items.map(l => Object.assign({}, l)) : [];
    const prodOpts = s.products.filter(p => p.active).map(p => ({ value: p.id, label: `${p.name} — ${money(p.price)}` }));
    const m = U.modal({ title: inv ? 'Modifier ' + inv.ref : 'Facture personnalisée', icon: 'file-pen', size: 'lg',
      body: `<div class="form"><label class="field"><span class="field-label">Partenaire <b>*</b></span><select class="input" id="ieCust"><option value="">Choisir...</option>${U.opts(s.partners.map(x => ({ value: x.id, label: x.name })), inv ? inv.partnerId : '')}</select></label>
        <label class="field"><span class="field-label">Échéance</span><input class="input" type="date" id="ieDue" value="${U.toInputDate(inv ? inv.due : Date.now() + s.company.invoiceDays * ST.DAY)}"></label></div>
        <div class="section-title">Lignes</div>
        <div class="lines-editor"><div class="le-row le-head"><span>Désignation</span><span>Prix</span><span>Qté</span><span class="right">Total</span><span></span></div><div id="ieLines"></div>
          <div class="row" style="margin-top:8px"><select class="input" id="ieProd" style="flex:1"><option value="">+ Ajouter un service / produit...</option>${U.opts(prodOpts, '')}</select><button class="btn sm" id="ieFree">${icon('plus')}Ligne libre</button></div></div>
        <div class="sum-total" style="padding:12px 0 0;margin-top:12px;border-top:1px solid var(--line)"><span>Total</span><b id="ieTotal">$0</b></div>
        <label class="field" style="margin-top:12px"><span class="field-label">Note</span><textarea class="input" id="ieNote" rows="2">${esc(inv ? inv.note : '')}</textarea></label>`,
      foot: `<span class="grow"></span><button class="btn ghost" data-close>Annuler</button><button class="btn" data-save>${icon('save')}Brouillon</button>${inv ? '' : `<button class="btn primary" data-send>${icon('send')}Créer et envoyer</button>`}` });
    const box = m.el.querySelector('#ieLines');
    const draw = () => {
      box.innerHTML = lines.length ? lines.map((l, i) => `<div class="le-row" data-i="${i}"><input class="input" data-k="label" value="${esc(l.label)}"><input class="input" type="number" step="0.01" data-k="price" value="${l.price}"><input class="input" type="number" min="1" data-k="qty" value="${l.qty}"><span class="right"><b>${money(l.price * l.qty)}</b></span><button class="icon-btn sm danger" data-rm="${i}">${icon('x', 'sm')}</button></div>`).join('') : '<p class="muted" style="margin:4px 0 0">Aucune ligne.</p>';
      m.el.querySelector('#ieTotal').textContent = money(lines.reduce((a, l) => a + l.price * l.qty, 0));
      U.paint();
    };
    box.addEventListener('input', e => { const r = e.target.closest('[data-i]'); if (!r) return; const l = lines[+r.dataset.i], k = e.target.dataset.k; l[k] = k === 'label' ? e.target.value : +e.target.value || 0; r.querySelector('b').textContent = money(l.price * l.qty); m.el.querySelector('#ieTotal').textContent = money(lines.reduce((a, x) => a + x.price * x.qty, 0)); });
    box.addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { lines.splice(+b.dataset.rm, 1); draw(); } });
    m.el.querySelector('#ieProd').onchange = e => { const p = s.products.find(x => x.id === e.target.value); if (p) { const ex = lines.find(l => l.productId === p.id); if (ex) ex.qty++; else lines.push({ productId: p.id, label: p.name, price: p.price, qty: 1 }); draw(); } e.target.value = ''; };
    m.el.querySelector('#ieFree').onclick = () => { lines.push({ productId: null, label: 'Prestation', price: 0, qty: 1 }); draw(); };
    const save = async send => {
      const to = m.el.querySelector('#ieCust').value;
      const payload = { id: inv ? inv.id : undefined, partnerId: to || null, due: m.el.querySelector('#ieDue').value, note: m.el.querySelector('#ieNote').value, items: lines, send };
      if (!payload.partnerId) return U.toast('Choisissez un partenaire', 'error');
      const r = await A().call('invoices.save', payload, send ? 'Facture créée et envoyée' : 'Facture créée');
      if (r.ok) m.close();
    };
    m.el.querySelector('[data-save]').onclick = () => save(false);
    const sb = m.el.querySelector('[data-send]');
    if (sb) sb.onclick = () => save(true);
    m.submit = () => save(!inv);
    draw();
  }

  /* =================== FACTURES À PAYER =================== */
  const blst = { tab: 'open' };
  function bills(el) {
    const s = S(), all = s.bills.map(b => Object.assign({}, b, { st: ST.billStatus(b) }));
    const open = all.filter(b => b.st !== 'paid'), soon = open.filter(b => Date.parse(b.due) - Date.now() < 7 * ST.DAY && b.st !== 'overdue');
    el.innerHTML = `<div class="page-head"><div><h1>Factures à payer</h1><div class="sub">Factures fournisseurs. Le paiement débite le compte bancaire.</div></div><div class="actions"><button class="btn primary sm" data-new>${icon('plus')}Nouvelle facture fournisseur</button></div></div>
      <div class="grid stats">${U.stat({ label: 'Total à payer', value: money(open.reduce((a, b) => a + b.amount, 0)), sub: open.length + ' facture(s)', icon: 'file-clock', tone: 'warn' })}
        ${U.stat({ label: 'En retard', value: money(open.filter(b => b.st === 'overdue').reduce((a, b) => a + b.amount, 0)), sub: open.filter(b => b.st === 'overdue').length + ' facture(s)', icon: 'clock-alert', tone: 'danger' })}
        ${U.stat({ label: 'Échéance < 7 jours', value: money(soon.reduce((a, b) => a + b.amount, 0)), sub: soon.length + ' facture(s)', icon: 'calendar-clock', tone: 'warn' })}
        ${U.stat({ label: 'Payé ce mois', value: money(all.filter(b => b.st === 'paid' && ST.within(ST.range('month'), b.paidAt)).reduce((a, b) => a + b.amount, 0)), icon: 'circle-check' })}</div>
      <div class="panel mt"><div class="panel-body"><div class="filters">${U.tabs([{ id: 'open', label: 'À payer', count: open.length }, { id: 'paid', label: 'Payées', count: all.length - open.length }, { id: 'all', label: 'Toutes' }], blst.tab)}</div><div id="billTable"></div></div></div>`;
    U.table(el.querySelector('#billTable'), {
      id: 'bills', sort: 'due', dir: 1, resetPage: true,
      rows: all.filter(b => blst.tab === 'all' || (blst.tab === 'paid' ? b.st === 'paid' : b.st !== 'paid')),
      empty: { icon: 'file-check', title: 'Aucune facture', text: 'Rien à payer pour le moment.', hint: false },
      rowClass: b => b.st === 'overdue' ? '' : '',
      columns: [
        { key: 'supplier', label: 'Fournisseur', render: b => `<b>${esc(b.supplier)}</b>${b.note ? `<br><small class="muted">${esc(b.note)}</small>` : ''}` },
        { key: 'ref', label: 'Facture', render: b => '#' + esc(b.ref) },
        { key: 'amount', label: 'Montant', align: 'right', render: b => `<b>${money(b.amount)}</b>` },
        { key: 'due', label: 'Échéance', render: b => `<span class="${b.st === 'overdue' ? 'danger-t' : ''}">${U.fmtDate(b.due)}</span>` },
        { key: 'st', label: 'Statut', render: b => U.status('bill', b.st) + (b.paidAt ? `<br><small class="muted">le ${U.fmtDate(b.paidAt)}</small>` : '') },
        { key: 'a', label: '', sortable: false, align: 'right', render: b => idCell(b.id, b.st === 'paid' ? '' : act('pay', 'Payer', 'circle-dollar-sign') + act('edit', 'Modifier', 'pencil') + act('del', 'Supprimer', 'trash-2', 'danger')) }]
    });
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { blst.tab = b.dataset.tab; bills(el); });
    el.querySelector('[data-new]').onclick = () => billForm(null);
    onActs(el, {
      pay: async id => { const b = s.bills.find(x => x.id === id); if (await U.confirm(`Payer ${money(b.amount)} à ${b.supplier} (#${b.ref}) depuis le compte bancaire ?`, { ok: 'Payer' })) A().call('bills.pay', { id }, 'Paiement effectué'); },
      edit: id => billForm(id),
      del: async id => { if (await U.confirm('Supprimer cette facture fournisseur ?', { danger: true, ok: 'Supprimer' })) A().call('bills.delete', { id }, 'Facture supprimée'); }
    });
  }
  function billForm(id) {
    const b = id ? S().bills.find(x => x.id === id) : null;
    U.form({ title: b ? 'Modifier la facture fournisseur' : 'Nouvelle facture fournisseur', icon: 'file-clock',
      values: b ? Object.assign({}, b, { due: U.toInputDate(b.due) }) : { due: U.toInputDate(Date.now() + 7 * ST.DAY) },
      fields: [{ name: 'supplier', label: 'Fournisseur', required: true, attrs: 'list="supList"' }, { name: 'ref', label: 'N° de facture', required: true, placeholder: 'INV-45' },
        { name: 'amount', label: 'Montant', type: 'money', required: true }, { name: 'due', label: 'Échéance', type: 'date', required: true },
        { name: 'note', label: 'Note', type: 'textarea', full: true, rows: 2 }],
      onMount: (m, fe) => fe.insertAdjacentHTML('beforeend', `<datalist id="supList">${[...new Set(S().bills.map(x => x.supplier).concat(S().partners.map(p => p.name)))].map(x => `<option value="${esc(x)}">`).join('')}</datalist>`),
      onSubmit: v => A().call('bills.save', Object.assign({ id }, v), b ? 'Facture modifiée' : 'Facture enregistrée') });
  }

  /* =================== SALAIRES =================== */
  /* Salaires : une feuille par semaine (fiches dont la période se termine dans la semaine) */
  const pyst = { tab: 'week', wk: 0 };
  function payroll(el) {
    const s = S(), r = ST.range('week', '', '', pyst.wk);
    const rows = s.payrolls.filter(p => { const t = Date.parse(p.to); return t >= r.from && t <= r.to; });
    const unpaid = rows.filter(p => p.status !== 'paid'), paid = rows.filter(p => p.status === 'paid');
    const prim = p => (p.primesTotal || 0) + (p.bonus || 0), sal = p => p.total - prim(p);
    const sum = (list, f) => list.reduce((a, p) => a + f(p), 0);
    const emp = p => s.employees.find(x => x.id === p.employeeId);
    const req = p => { const e = emp(p); return e ? ST.prereq(s, e, Date.parse(p.from), Date.parse(p.to)) : null; };
    const reason = `S${ST.weekNum(r.from)} ${s.company.payReason || 'Paye LS Customs'}`;
    const cp = (txt, title) => `<button class="icon-btn sm" data-copy="${esc(txt)}" title="${esc(title)}">${icon('copy', 'sm')}</button>`;
    el.innerHTML = `<div class="page-head"><div><h1>Salaires</h1><div class="sub">Salaire = fixe + commissions (% du bénéfice) − retenues. Les primes sont comptées à part.</div></div>
        <div class="actions"><div class="week-nav"><button class="icon-btn sm" data-wkn="-1" title="Semaine précédente">${icon('chevron-left')}</button><span>${esc(ST.weekLabel(r))}</span><button class="icon-btn sm" data-wkn="1" title="Semaine suivante" ${pyst.wk >= 0 ? 'disabled' : ''}>${icon('chevron-right')}</button></div>
          <button class="btn sm" id="pyGen">${icon('calculator')}${rows.length ? 'Recalculer' : 'Générer'} la paie de la semaine</button><button class="btn sm" id="pyPrime">${icon('gift')}Attribuer une prime</button></div></div>
      <div class="grid stats">${U.stat({ label: 'Salaires (sans primes)', value: money(sum(rows, sal)), sub: rows.length + ' employé(s)', icon: 'banknote', tone: 'info' })}
        ${U.stat({ label: 'Primes', value: money(sum(rows, prim)), sub: 'hors salaire', icon: 'gift' })}
        ${U.stat({ label: 'Reste à verser', value: money(sum(unpaid, p => p.total)), sub: unpaid.length + ' fiche(s)', icon: 'hourglass', tone: unpaid.length ? 'warn' : '' })}
        ${U.stat({ label: 'Déjà payé', value: money(sum(paid, p => p.total)), sub: paid.length + ' fiche(s)', icon: 'circle-check' })}</div>
      <div class="alert info mt pay-reason">${icon('clipboard-copy')}<span>Motif du virement : <b>${esc(reason)}</b></span>${cp(reason, 'Copier le motif')}</div>
      <div class="panel mt"><div class="panel-body"><div class="filters">${U.tabs([{ id: 'week', label: 'Fiches de la semaine', count: rows.length }, { id: 'primes', label: 'Primes manuelles', count: (s.primes || []).filter(x => !x.payrollId).length }], pyst.tab)}
        <span class="grow"></span>${pyst.tab === 'week' && unpaid.length ? `<button class="btn sm primary" id="pyPayAll">${icon('check-check')}Tout marquer payé (${unpaid.length})</button>` : ''}</div><div id="pyTable"></div></div></div>`;
    if (pyst.tab === 'primes') U.table(el.querySelector('#pyTable'), {
      id: 'primes', rows: s.primes || [], sort: 'at',
      empty: { icon: 'gift', title: 'Aucune prime manuelle', text: 'Utilisez « Attribuer une prime ». Les primes automatiques sont calculées à la génération de la paie.', hint: false },
      columns: [{ key: 'employeeName', label: 'Employé', render: x => `<div class="who">${U.avatar(x.employeeName)}<b>${esc(x.employeeName)}</b></div>` },
        { key: 'amount', label: 'Montant', align: 'right', render: x => `<b class="ok-t">+${money(x.amount)}</b>` }, { key: 'reason', label: 'Motif' },
        { key: 'by', label: 'Attribuée par' }, { key: 'at', label: 'Date', render: x => U.fmtDT(x.at) },
        { key: 'payrollId', label: 'Statut', render: x => x.payrollId ? U.badge('Versée', 'ok') : U.badge('Prochaine paie', 'info') },
        { key: 'a', label: '', sortable: false, align: 'right', render: x => x.payrollId ? '' : idCell(x.id, act('delprime', 'Retirer', 'trash-2', 'danger')) }]
    });
    else U.table(el.querySelector('#pyTable'), {
      id: 'payroll-week', rows, sort: 'employeeName', dir: 1, resetPage: true,
      empty: { icon: 'banknote', title: 'Aucune fiche pour cette semaine', text: 'Cliquez sur « Générer la paie de la semaine ».', hint: false },
      columns: [
        { key: 'employeeName', label: 'Employé', render: p => { const q = req(p); return `<div class="who">${U.avatar(p.employeeName)}<div><b>${esc(p.employeeName)}</b><small>${esc(p.roleName)} · ${U.fmtDur(p.minutes)}</small>${q && q.absences.length ? `<small>${U.badge('Absence', 'warn')}</small>` : ''}</div></div>`; } },
        { key: 'account', label: 'N° de compte', sortValue: p => (emp(p) || {}).bankAccount || '', render: p => { const e = emp(p); return e && e.bankAccount ? `<span class="nowrap">${esc(e.bankAccount)} ${cp(e.bankAccount, 'Copier le n° de compte')}</span>` : `<span class="warn-t">Non renseigné</span>`; } },
        { key: 'ca', label: 'CA', align: 'right', sortValue: p => (req(p) || {}).ca || 0, render: p => money((req(p) || {}).ca || 0) },
        { key: 'salary', label: 'Salaire', align: 'right', sortValue: sal, render: p => `${money(sal(p))}<br><small class="muted">${money(p.base)} + ${money(p.commissions)} com.${p.deduction ? ' − ' + money(p.deduction) : ''}</small>` },
        { key: 'primes', label: 'Primes', align: 'right', sortValue: prim, render: p => prim(p) ? `<span class="ok-t" title="${esc((p.primes || []).map(x => (x.auto ? '[auto] ' : '') + x.label + ' : ' + money(x.amount)).concat(p.bonus ? ['Bonus : ' + money(p.bonus)] : []).join(' | '))}">+${money(prim(p))}</span>` : '<span class="faint">$0</span>' },
        { key: 'total', label: 'Salaire + primes', align: 'right', render: p => `<span class="nowrap"><b class="big-qty">${money(p.total)}</b> ${cp(String(Math.round(p.total * 100) / 100), 'Copier le montant')}</span>` },
        { key: 'motif', label: 'Motif', sortable: false, render: p => `<span class="nowrap">${esc(reason)} ${cp(reason, 'Copier le motif')}</span>` },
        { key: 'req', label: 'Objectifs', sortValue: p => (req(p) || {}).ok ? 1 : 0, render: p => { const q = req(p); return q ? idCell(p.id, `<button class="req-btn ${q.ok ? 'ok' : 'ko'}" data-a="req" title="${esc(q.checks.map(c => (c.ok ? '✔ ' : '✘ ') + c.label + ' : ' + c.detail).join(' | ') || 'Aucun prérequis configuré')}"><span class="req ${q.ok ? 'ok' : 'ko'}"></span>${q.ok ? 'Atteints' : 'Non atteints'}</button>`) : ''; } },
        { key: 'status', label: 'Paiement', render: p => p.status === 'paid' ? `${U.badge('Payé', 'ok')}<br><small class="muted">le ${U.fmtDate(p.paidAt).slice(0, 5)} · ${esc(p.paidBy || '')}</small>` : idCell(p.id, `<button class="btn sm primary" data-a="pay">${icon('check')}Marquer payé</button>`) },
        { key: 'a', label: '', sortable: false, align: 'right', render: p => p.status === 'paid' ? idCell(p.id, act('slip', 'Fiche de paie', 'file-text')) : idCell(p.id, act('slip', 'Fiche de paie', 'file-text') + act('prime', 'Ajouter une prime', 'gift') + act('edit', 'Retenue', 'pencil') + act('del', 'Supprimer', 'trash-2', 'danger')) }]
    });
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { pyst.tab = b.dataset.tab; payroll(el); });
    el.addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (b) { e.stopPropagation(); U.copy(b.dataset.copy); } });
    el.querySelectorAll('[data-wkn]').forEach(b => b.onclick = () => { pyst.wk = Math.min(0, pyst.wk + +b.dataset.wkn); if (!A().ensure(ST.range('week', '', '', pyst.wk).from)) payroll(el); });
    el.querySelector('#pyGen').onclick = async () => {
      const res = await A().call('payroll.generate', { from: new Date(r.from).toISOString(), to: new Date(Math.min(r.to, Date.now())).toISOString() });
      if (res.ok) { pyst.tab = 'week'; U.toast(`${res.data.count} fiche(s) de paie calculée(s)`); A().render(); }
    };
    el.querySelector('#pyPrime').onclick = () => primeForm(null);
    const pa = el.querySelector('#pyPayAll');
    if (pa) pa.onclick = async () => {
      if (!await U.confirm(`Marquer ${unpaid.length} salaire(s) comme payé(s) pour un total de ${money(sum(unpaid, p => p.total))} ? Le montant est débité du compte bancaire.`, { ok: 'Tout marquer payé' })) return;
      for (const p of unpaid) { const x = await LSC.api.call('payroll.pay', { id: p.id }); if (!x.ok) { U.toast(x.error, 'error'); break; } }
      await A().call('bootstrap', {}, 'Salaires marqués comme payés');
    };
    onActs(el, {
      pay: async id => { const p = s.payrolls.find(x => x.id === id), e = emp(p); if (await U.confirm(`Marquer comme payé : ${money(p.total)} à ${p.employeeName}${e && e.bankAccount ? ' (compte ' + e.bankAccount + ')' : ''} ?`, { ok: 'Marquer payé' })) A().call('payroll.pay', { id }, 'Salaire marqué comme payé'); },
      req: id => payslip(id), slip: id => payslip(id), edit: id => payEdit(id),
      prime: id => primeForm(s.payrolls.find(x => x.id === id).employeeId),
      delprime: async id => { if (await U.confirm('Retirer cette prime ?', { danger: true, ok: 'Retirer' })) A().call('primes.delete', { id }, 'Prime retirée'); },
      del: async id => { if (await U.confirm('Supprimer cette fiche de paie ?', { danger: true, ok: 'Supprimer' })) A().call('payroll.delete', { id }, 'Fiche supprimée'); }
    });
  }
  /* Prime manuelle : versée avec la prochaine paie (ajoutée tout de suite si une fiche est en brouillon) */
  function primeForm(employeeId) {
    const s = S();
    U.form({ title: 'Attribuer une prime', icon: 'gift', size: 'sm', values: { employeeId: employeeId || '', amount: '' },
      fields: [{ name: 'employeeId', label: 'Employé', type: 'select', full: true, required: true, attrs: 'data-combo', options: [{ value: '', label: 'Choisir...' }].concat(s.employees.filter(e => !e.archived).map(e => ({ value: e.id, label: e.name }))) },
        { name: 'amount', label: 'Montant', type: 'money', required: true, full: true },
        { name: 'reason', label: 'Motif', full: true, placeholder: 'Prime qualité, renfort, événement...' }],
      onSubmit: v => A().call('primes.add', v, 'Prime attribuée') });
  }
  function payEdit(id) {
    const p = S().payrolls.find(x => x.id === id);
    U.form({ title: 'Paie — ' + p.employeeName, icon: 'banknote', size: 'sm', values: p,
      fields: [{ name: 'deduction', label: 'Retenue', type: 'money', full: true }, { name: 'note', label: 'Note', full: true }],
      onSubmit: v => A().call('payroll.update', Object.assign({ id }, v), 'Paie mise à jour') });
  }
  function payslip(id) {
    const s = S(), p = s.payrolls.find(x => x.id === id), e = s.employees.find(x => x.id === p.employeeId);
    const q = e ? ST.prereq(s, e, Date.parse(p.from), Date.parse(p.to)) : null;
    U.modal({ title: 'Fiche de paie — ' + p.employeeName, icon: 'banknote', size: 'sm',
      body: `<p class="muted" style="margin:0 0 12px">${esc(p.roleName)} · du ${U.fmtDate(p.from)} au ${U.fmtDate(p.to)}${e ? `<br>Char ID ${esc(e.charId || '—')} · Compte ${esc(e.bankAccount || 'non renseigné')}` : ''}</p>
        ${q ? `<div class="req-box ${q.ok ? 'ok' : 'ko'}"><b><span class="req ${q.ok ? 'ok' : 'ko'}"></span>${q.ok ? 'Prérequis de la semaine atteints' : 'Prérequis non atteints'}</b>
          ${q.checks.map(c => `<div class="row"><span class="${c.ok ? 'ok-t' : 'danger-t'}">${icon(c.ok ? 'check' : 'x', 'xs')}</span><span>${esc(c.label)}</span><span class="grow"></span><span class="muted">${esc(c.detail)}</span></div>`).join('') || '<small class="muted">Aucun prérequis configuré (Paramètres).</small>'}
          ${q.absences.length ? `<div class="row"><span class="warn-t">${icon('calendar-off', 'xs')}</span><span>Absence(s)</span><span class="grow"></span><span class="muted">${q.absences.map(a => U.fmtDate(a.from).slice(0, 5) + '→' + U.fmtDate(a.to).slice(0, 5)).join(', ')}</span></div>` : ''}</div>` : ''}
        <dl class="kv"><dt>Salaire fixe</dt><dd>${money(p.salary)}</dd>${p.hourly ? `<dt>Heures (${U.fmtDur(p.minutes)} × ${money(p.hourly)})</dt><dd>${money(p.base - p.salary)}</dd>` : ''}
        <dt>Commissions (${p.commissionIds.length} ventes)</dt><dd>${money(p.commissions)}</dd>${(p.primes || []).map(x => `<dt>${x.auto ? 'Prime auto' : 'Prime'} — ${esc(x.label)}</dt><dd class="ok-t">+${money(x.amount)}</dd>`).join('')}${p.bonus ? `<dt>Bonus</dt><dd class="ok-t">+${money(p.bonus)}</dd>` : ''}<dt>Retenue</dt><dd class="danger-t">-${money(p.deduction)}</dd></dl>
        <div class="sum-total" style="padding:12px 0 0;margin-top:12px;border-top:1px solid var(--line)"><span>Salaire + primes</span><b>${money(p.total)}</b></div>
        <p class="muted" style="margin:10px 0 0">${p.status === 'paid' ? U.badge('Payé', 'ok') : U.badge('À payer', 'warn')} ${p.validatedBy ? ` validée par ${esc(p.validatedBy)}` : ''}${p.paidAt ? ` · versée le ${U.fmtDT(p.paidAt)}` : ''}${p.note ? '<br>' + esc(p.note) : ''}</p>`,
      foot: '<span class="grow"></span><button class="btn" data-close>Fermer</button>' });
  }

  /* =================== FRAIS = COMMANDES (moteur, kit carrosserie, Kärcher...) =================== */
  const est = { period: 'week', cat: '' };
  const feeLabel = (s, e) => (s.company.expenseCategories.find(c => c.id === e.category) || {}).label || e.categoryLabel || e.category;
  function expenses(el) {
    const s = S(), r = ST.range(est.period, est.from, est.to, est.wk), cats = s.company.expenseCategories;
    const inR = s.expenses.filter(e => ST.within(r, e.date)), rows = inR.filter(e => !est.cat || e.category === est.cat);
    const byCat = {}; inR.forEach(e => { const k = feeLabel(s, e); byCat[k] = (byCat[k] || 0) + e.amount; });
    el.innerHTML = `<div class="page-head"><div><h1>Commandes (frais)</h1><div class="sub">Les seuls frais de l'entreprise : chaque commande débite le compte bancaire. Types et prix unitaires dans Paramètres.</div></div>
        <div class="actions">${U.periodBar(est)}<button class="btn primary sm" data-new>${icon('plus')}Nouvelle commande</button></div></div>
      <div class="grid stats">${U.stat({ label: 'Total des frais', value: money(inR.reduce((a, e) => a + e.amount, 0)), sub: inR.length + ' commande(s)', icon: 'wallet', tone: 'warn' })}
        ${cats.map(c => { const l = inR.filter(e => e.category === c.id); return U.stat({ label: c.label, value: money(l.reduce((a, e) => a + e.amount, 0)), sub: l.reduce((a, e) => a + (e.qty || 1), 0) + ' unité(s) · ' + money(c.price) + ' / u', icon: 'package', tone: 'info' }); }).join('')}</div>
      <div class="grid cols-3 mt"><div class="panel span-2"><div class="panel-body">
          <div class="filters"><select class="input" id="exCat"><option value="">Toutes les commandes</option>${U.opts(cats.map(c => ({ value: c.id, label: c.label })), est.cat)}</select></div><div id="exTable"></div></div></div>
        ${U.panel('Répartition', U.hbars(Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]).map(k => ({ label: k, value: byCat[k], color: 'var(--warn)' }))), { icon: 'chart-pie' })}</div>`;
    U.table(el.querySelector('#exTable'), { id: 'expenses', rows, sort: 'date', resetPage: true,
      empty: { icon: 'wallet', title: 'Aucune commande', text: 'Aucune commande sur cette période.', hint: 'Modifiez les filtres ou passez une nouvelle commande.' },
      columns: [{ key: 'date', label: 'Date', render: e => U.fmtDate(e.date) }, { key: 'category', label: 'Commande', render: e => U.badge(feeLabel(s, e)) },
        { key: 'qty', label: 'Qté', align: 'right', render: e => e.qty || 1 }, { key: 'unitPrice', label: 'Prix unitaire', align: 'right', render: e => money(e.unitPrice != null ? e.unitPrice : e.amount) },
        { key: 'amount', label: 'Total', align: 'right', render: e => `<b>${money(e.amount)}</b>` },
        { key: 'supplier', label: 'Fournisseur', render: e => esc(e.supplier || '—') }, { key: 'description', label: 'Note', render: e => `<span class="muted">${esc(e.description || '—')}</span>` },
        { key: 'a', label: '', sortable: false, align: 'right', render: e => idCell(e.id, act('dup', 'Recommander', 'copy') + act('edit', 'Modifier', 'pencil') + act('del', 'Supprimer', 'trash-2', 'danger')) }] });
    el.querySelector('#exCat').onchange = e => { est.cat = e.target.value; expenses(el); };
    el.querySelector('[data-new]').onclick = () => expenseForm(null);
    U.bindPeriod(el, est, () => expenses(el));
    onActs(el, { edit: id => expenseForm(id), dup: id => expenseForm(null, s.expenses.find(x => x.id === id)),
      del: async id => { if (await U.confirm('Supprimer cette commande ? Le montant sera recrédité sur le compte bancaire.', { danger: true, ok: 'Supprimer' })) A().call('expenses.delete', { id }, 'Commande supprimée'); } });
  }
  function expenseForm(id, copy) {
    const s = S(), cats = s.company.expenseCategories, e = id ? s.expenses.find(x => x.id === id) : copy;
    const first = cats.find(c => e && c.id === e.category) || cats[0];
    const values = e ? Object.assign({}, e, { category: first.id, qty: e.qty || 1, unitPrice: e.unitPrice != null ? e.unitPrice : first.price, date: U.toInputDate(id ? e.date : Date.now()) })
      : { category: first.id, qty: 1, unitPrice: first.price, date: U.toInputDate(Date.now()) };
    U.form({ title: id ? 'Modifier la commande' : 'Nouvelle commande', icon: 'shopping-bag', values,
      fields: [{ name: 'category', label: 'Commande', type: 'select', full: true, options: cats.map(c => ({ value: c.id, label: `${c.label} — ${money(c.price)} / u` })) },
        { name: 'qty', label: 'Quantité', type: 'number', min: 1, step: '1', required: true }, { name: 'unitPrice', label: 'Prix unitaire', type: 'money', required: true },
        { name: 'total', label: 'Total débité', type: 'html', full: true, html: `<div class="big-num" id="exTotal">${money(values.qty * values.unitPrice)}</div>` },
        { name: 'supplier', label: 'Fournisseur' }, { name: 'date', label: 'Date', type: 'date' }, { name: 'description', label: 'Note', full: true }],
      onChange: (v, fe, ev) => {
        if (ev.target.name === 'category') { const c = cats.find(x => x.id === v.category); if (c) fe.elements.unitPrice.value = c.price; }
        const t = fe.querySelector('#exTotal'); if (t) t.textContent = money((+fe.elements.qty.value || 0) * (+fe.elements.unitPrice.value || 0));
      },
      onSubmit: v => A().call('expenses.save', Object.assign({ id }, v), id ? 'Commande modifiée' : 'Commande enregistrée') });
  }

  Object.assign(LSC.pages, {
    bilan: { render: bilan }, sales: { render: el => salesPage(el, false) }, mysales: { render: el => salesPage(el, true) },
    byproduct: { render: byProduct }, invoices: { render: invoices }, bills: { render: bills }, payroll: { render: payroll }, expenses: { render: expenses }
  });
})();
