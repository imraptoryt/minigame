/* Mon entreprise : Rôles & permissions, Inventaire & Production (produits),
 * Partenaires, Compte bancaire, Clients, Historique, Paramètres. */
(function () {
  'use strict';
  const LSC = window.LSC, U = LSC.ui, ST = LSC.stats, { esc, icon, money, onActs, idCell } = U;
  const A = () => LSC.app, S = () => LSC.app.state;
  const act = (name, label, ic, cls) => `<button class="icon-btn sm ${cls || ''}" data-a="${name}" title="${esc(label)}">${icon(ic, 'sm')}</button>`;

  /* =================== RÔLES & PERMISSIONS =================== */
  const rst = { sel: null };
  function roles(el) {
    const s = S(), list = s.roles.slice().sort((a, b) => b.rank - a.rank);
    if (!list.some(r => r.id === rst.sel)) rst.sel = list[0] && list[0].id;
    const r = list.find(x => x.id === rst.sel), full = A().can('*'), myRank = A().myRole().rank || 0;
    const editable = r && (full || r.rank < myRank) && !r.perms.includes('*');
    const groups = {};
    A().permissions.forEach(p => { (groups[p[2]] = groups[p[2]] || []).push(p); });
    el.innerHTML = `<div class="page-head"><div><h1>Gestion des rôles</h1><div class="sub">Grades, taux de commission, salaires et permissions. Les permissions sont vérifiées côté serveur.</div></div>
        <div class="actions"><button class="btn primary sm" data-new>${icon('plus')}Nouveau grade</button></div></div>
      <div class="grid cols-3">
        ${U.panel('Grades', `<div class="list">${list.map(x => `<div class="role-item ${x.id === rst.sel ? 'on' : ''}" data-role="${x.id}"><span class="li-ic ${x.perms.includes('*') ? 'ok' : ''}">${icon(x.perms.includes('*') ? 'crown' : 'shield')}</span>
          <div style="min-width:0"><b>${esc(x.name)}</b><small>Rang ${x.rank} · ${x.commission}% du bénéfice · fixe ${money(x.salary)}</small></div>
          <span class="badge" style="margin-left:auto">${s.employees.filter(e => !e.archived && e.roleId === x.id).length}</span></div>`).join('')}</div>`, { icon: 'shield-check', bodyCls: '' })}
        <section class="panel span-2">${r ? `<div class="panel-head"><h3>${icon('key-round')}${esc(r.name)}</h3><div class="row">${editable ? `<button class="btn sm" data-edit>${icon('pencil')}Commission & salaire</button><button class="btn sm danger" data-del>${icon('trash-2')}</button>` : ''}</div></div>
          <div class="panel-body">${r.perms.includes('*') ? `<div class="alert info">${icon('crown')}<span><b>Accès complet</b> — ce grade possède toutes les permissions.</span></div>` : ''}
          ${!editable && !r.perms.includes('*') ? `<div class="alert warn" style="margin-bottom:12px">${icon('lock')}<span>Vous ne pouvez pas modifier un grade égal ou supérieur au vôtre.</span></div>` : ''}
          ${r.perms.includes('*') ? '' : `<div class="perm-grid" id="permGrid">${Object.keys(groups).map(g => `<div class="perm-group"><h4>${esc(g)}</h4>${groups[g].map(p => `<label class="perm"><input type="checkbox" value="${p[0]}" ${r.perms.includes(p[0]) ? 'checked' : ''} ${editable ? '' : 'disabled'}><span>${esc(p[1])}</span></label>`).join('')}</div>`).join('')}</div>
          ${editable ? `<div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" data-saveperms>${icon('save')}Enregistrer les permissions</button></div>` : ''}`}</div>` : U.empty({ title: 'Aucun grade' })}</section>
      </div>`;
    el.querySelectorAll('[data-role]').forEach(b => b.onclick = () => { rst.sel = b.dataset.role; roles(el); });
    el.querySelector('[data-new]').onclick = () => roleForm(null);
    const on = (sel, fn) => { const b = el.querySelector(sel); if (b) b.onclick = fn; };
    on('[data-edit]', () => roleForm(r.id));
    on('[data-del]', async () => { if (await U.confirm(`Supprimer le grade ${r.name} ?`, { danger: true, ok: 'Supprimer' })) A().call('roles.delete', { id: r.id }, 'Grade supprimé'); });
    on('[data-saveperms]', () => A().call('roles.save', Object.assign({}, r, { perms: [...el.querySelectorAll('#permGrid input:checked')].map(i => i.value) }), 'Permissions enregistrées'));
  }
  function roleForm(id) {
    const r = id ? S().roles.find(x => x.id === id) : null;
    U.form({ title: r ? 'Grade — ' + r.name : 'Nouveau grade', icon: 'shield', values: r || { rank: 15, commission: 60, salary: 0, hourly: 0 },
      fields: [{ name: 'name', label: 'Nom', required: true, full: true }, { name: 'rank', label: 'Rang (hiérarchie)', type: 'number', min: 1, max: 99, hint: 'Plus le rang est élevé, plus le grade est haut.' },
        { name: 'commission', label: 'Commission (% du bénéfice)', type: 'number', min: 0, max: 100, step: '0.5' }, { name: 'salary', label: 'Salaire fixe par paie', type: 'money' }],
      onSubmit: async v => { const res = await A().call('roles.save', Object.assign({ id, perms: r ? r.perms : ['pos.use', 'sales.view_own', 'stats.own', 'service.self'] }, v), r ? 'Grade modifié' : 'Grade créé'); if (res.ok && res.data) rst.sel = res.data.id; return res; } });
  }

  /* =================== STOCK : entrées / sorties par catégorie (webhook Discord) =================== */
  const ivst = { cat: null, q: '' };
  const NONE = '__none';
  function inventory(el) {
    const s = S(), mng = A().can('inventory.manage');
    const cats = s.stockCats || [];
    const loose = s.inventory.filter(i => !cats.some(k => k.id === i.categoryId));
    const ids = cats.map(k => k.id).concat(loose.length ? [NONE] : []);
    if (!ids.includes(ivst.cat)) ivst.cat = ids[0] || null;
    const cat = cats.find(k => k.id === ivst.cat) || null;
    const items = ivst.cat === NONE ? loose : cat ? s.inventory.filter(i => i.categoryId === cat.id) : [];
    const itemIds = new Set(items.map(i => i.id));
    const moves = s.inventoryTx.filter(t => itemIds.has(t.itemId));
    const linked = id => s.products.filter(p => p.inventoryId === id).map(p => p.name);
    const lastMove = id => { for (let i = s.inventoryTx.length - 1; i >= 0; i--) if (s.inventoryTx[i].itemId === id) return s.inventoryTx[i]; return null; };
    el.innerHTML = `<div class="page-head"><div><h1>Stock — entrées / sorties</h1><div class="sub">Chaque entrée ou sortie est enregistrée et publiée sur le webhook Discord de sa catégorie (les sorties dues aux ventes aussi).</div></div>
        <div class="actions">${mng ? `<button class="btn sm" data-x="newcat">${icon('folder-plus')}Nouvelle catégorie</button>` : ''}${mng && ivst.cat ? `<button class="btn primary sm" data-x="newitem">${icon('plus')}Nouvel article</button>` : ''}</div></div>
      <div class="stock-layout">
        <aside class="panel"><div class="panel-head"><h3>${icon('folders')}Catégories</h3></div><div class="panel-body list">
          ${cats.map(k => { const n = s.inventory.filter(i => i.categoryId === k.id).length; return `<div class="role-item ${k.id === ivst.cat ? 'on' : ''}" data-cat="${k.id}"><span class="li-ic">${icon(k.icon || 'package')}</span>
            <div style="min-width:0"><b>${esc(k.name)}</b><small>${n} article${n > 1 ? 's' : ''} · ${k.hasWebhook ? '<span class="ok-t">Discord actif</span>' : '<span class="faint">sans webhook</span>'}</small></div>${k.hasWebhook ? `<span style="margin-left:auto">${U.dot('ok')}</span>` : ''}</div>`; }).join('')}
          ${loose.length ? `<div class="role-item ${ivst.cat === NONE ? 'on' : ''}" data-cat="${NONE}"><span class="li-ic">${icon('package-open')}</span><div><b>Sans catégorie</b><small>${loose.length} article(s)</small></div></div>` : ''}
          ${!ids.length ? U.empty({ icon: 'folders', title: 'Aucune catégorie', text: mng ? 'Créez une catégorie (ex. Pièces, Coffre, Outillage).' : 'Aucune catégorie de stock.', hint: false }) : ''}
        </div></aside>
        <div class="stack" style="min-width:0">${ivst.cat ? `
          <section class="panel"><div class="panel-head"><h3>${icon(cat ? cat.icon || 'package' : 'package-open')}${esc(cat ? cat.name : 'Sans catégorie')}</h3>
            ${cat ? (cat.hasWebhook ? U.badge('Webhook Discord actif', 'ok') : U.badge('Aucun webhook', 'muted')) : ''}
            <div class="row">${mng && cat ? `${cat.hasWebhook ? `<button class="btn sm ghost" data-x="test">${icon('send')}Tester</button>` : ''}<button class="btn sm" data-x="editcat">${icon('pencil')}Catégorie</button><button class="icon-btn sm danger" data-x="delcat" title="Supprimer la catégorie">${icon('trash-2', 'sm')}</button>` : ''}</div></div>
            <div class="panel-body"><div class="filters"><div class="search">${icon('search')}<input class="input" id="ivq" placeholder="Rechercher un article..." value="${esc(ivst.q)}"></div></div><div id="ivTable"></div></div></section>
          <section class="panel"><div class="panel-head"><h3>${icon('arrow-left-right')}Historique des entrées / sorties</h3></div><div class="panel-body" id="mvTable"></div></section>` : ''}
        </div></div>`;
    const draw = reset => {
      const box = el.querySelector('#ivTable');
      if (!box) return;
      U.table(box, { id: 'stock', sort: 'name', dir: 1, resetPage: reset, rows: items.filter(i => !ivst.q || i.name.toLowerCase().includes(ivst.q.toLowerCase())),
        empty: { icon: 'package', title: 'Aucun article', text: 'Cette catégorie est vide.', hint: mng ? 'Ajoutez un article avec « Nouvel article ».' : false },
        columns: [
          { key: 'name', label: 'Article', render: i => `<b>${esc(i.name)}</b>${linked(i.id).length ? `<br><small class="muted">Vendu au POS : ${esc(linked(i.id).join(', '))}</small>` : ''}` },
          { key: 'qty', label: 'Quantité', align: 'right', render: i => `<b class="big-qty ${i.qty <= 0 ? 'danger-t' : i.min && i.qty <= i.min ? 'warn-t' : ''}">${i.qty}</b>` },
          { key: 'last', label: 'Dernier mouvement', sortValue: i => (lastMove(i.id) || {}).at || '', render: i => { const t = lastMove(i.id); return t ? `<span class="${t.delta < 0 ? 'danger-t' : 'ok-t'}">${t.delta > 0 ? '+' : ''}${t.delta}</span> <small class="muted">${esc(A().empName(t.by))} · ${U.ago(t.at)}</small>` : '<span class="faint">—</span>'; } },
          { key: 'a', label: '', sortable: false, align: 'right', render: i => idCell(i.id, `<button class="btn sm" data-a="in">${icon('arrow-down-to-line', 'xs')}Entrée</button><button class="btn sm" data-a="out">${icon('arrow-up-from-line', 'xs')}Sortie</button>${mng ? act('edit', 'Modifier', 'pencil') + act('del', 'Supprimer', 'trash-2', 'danger') : ''}`) }] });
      U.table(el.querySelector('#mvTable'), { id: 'moves', sort: 'at', pageSize: 10, rows: moves,
        empty: { icon: 'arrow-left-right', title: 'Aucun mouvement', text: 'Aucune entrée ni sortie pour cette catégorie.', hint: false },
        columns: [{ key: 'at', label: 'Date', render: t => U.fmtDT(t.at) }, { key: 'name', label: 'Article' },
          { key: 'delta', label: 'Mouvement', align: 'right', render: t => `<b class="${t.delta < 0 ? 'danger-t' : 'ok-t'}">${t.delta > 0 ? '+' : ''}${t.delta}</b>` },
          { key: 'qty', label: 'Stock après', align: 'right' }, { key: 'by', label: 'Employé', render: t => esc(A().empName(t.by)) }, { key: 'reason', label: 'Motif', render: t => `<span class="muted">${esc(t.reason)}</span>` }] });
    };
    el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { ivst.cat = b.dataset.cat; ivst.q = ''; inventory(el); });
    const q = el.querySelector('#ivq');
    if (q) q.oninput = e => { ivst.q = e.target.value; draw(true); };
    el.querySelectorAll('[data-x]').forEach(b => b.onclick = async () => {
      const x = b.dataset.x;
      if (x === 'newcat') stockCatForm(null);
      else if (x === 'editcat') stockCatForm(cat.id);
      else if (x === 'newitem') itemForm(null, cat ? cat.id : '');
      else if (x === 'delcat') { if (await U.confirm(`Supprimer la catégorie « ${cat.name} » ?`, { danger: true, ok: 'Supprimer' })) A().call('stock.cat.delete', { id: cat.id }, 'Catégorie supprimée'); }
      else if (x === 'test') {
        const r = await LSC.api.call('stock.cat.test', { id: cat.id });
        if (!r.ok) return U.toast(r.error, 'error');
        const d = (r.delivery || [])[0];
        U.toast(d && d.ok ? 'Message de test envoyé sur Discord' : `Discord a refusé l'envoi${d && d.status ? ' (' + d.status + ')' : ''} — vérifiez l'URL`, d && d.ok ? 'ok' : 'error');
      }
    });
    onActs(el, {
      in: id => moveForm(id, 'in'), out: id => moveForm(id, 'out'), edit: id => itemForm(id),
      del: async id => { if (await U.confirm('Supprimer cet article et son suivi ?', { danger: true, ok: 'Supprimer' })) A().call('inventory.delete', { id }, 'Article supprimé'); }
    });
    draw();
  }
  function moveForm(id, type) {
    const s = S(), i = s.inventory.find(x => x.id === id), k = (s.stockCats || []).find(c => c.id === i.categoryId);
    const isIn = type === 'in';
    U.form({ title: (isIn ? 'Entrée — ' : 'Sortie — ') + i.name, icon: isIn ? 'arrow-down-to-line' : 'arrow-up-from-line', size: 'sm', submit: isIn ? 'Enregistrer l’entrée' : 'Enregistrer la sortie',
      intro: `<p class="lead" style="margin-bottom:12px">Stock actuel : <b>${i.qty}</b>${k && k.hasWebhook ? ` · <span class="ok-t">publié sur Discord (${esc(k.name)})</span>` : ''}</p>`,
      values: { qty: 1 },
      fields: [{ name: 'qty', label: 'Quantité', type: 'number', min: 1, step: '1', required: true, full: true, attrs: 'autofocus' },
        { name: 'reason', label: 'Motif', full: true, placeholder: isIn ? 'Livraison, réassort, retour...' : 'Réparation, perte, prêt...' }],
      onSubmit: v => A().call('stock.move', { id, type, qty: v.qty, reason: v.reason }, (isIn ? 'Entrée' : 'Sortie') + ' enregistrée' + (k && k.hasWebhook ? ' et envoyée sur Discord' : '')) });
  }
  function itemForm(id, catId) {
    const s = S(), i = id ? s.inventory.find(x => x.id === id) : null;
    U.form({ title: i ? 'Modifier ' + i.name : 'Nouvel article', icon: 'package', size: 'sm', values: i ? Object.assign({}, i, { categoryId: i.categoryId || '' }) : { categoryId: catId && catId !== NONE ? catId : '' },
      fields: [{ name: 'name', label: 'Nom', required: true, full: true },
        { name: 'categoryId', label: 'Catégorie', type: 'select', full: true, options: [{ value: '', label: '— Sans catégorie —' }].concat((s.stockCats || []).map(k => ({ value: k.id, label: k.name }))) },
        ...(i ? [] : [{ name: 'qty', label: 'Quantité initiale', type: 'number', min: 0 }]),
        { name: 'min', label: 'Seuil d’alerte', type: 'number', min: 0, hint: 'Facultatif : alerte « stock faible ».' }],
      onSubmit: v => A().call('inventory.save', Object.assign({ id }, v), i ? 'Article modifié' : 'Article créé') });
  }
  function stockCatForm(id) {
    const k = id ? (S().stockCats || []).find(x => x.id === id) : null;
    const cur = k && k.webhook ? k.webhook.replace(/(\/webhooks\/\d+\/).{6,}/, '$1••••••') : '';
    U.form({ title: k ? 'Catégorie — ' + k.name : 'Nouvelle catégorie de stock', icon: 'folder-plus', values: k ? { name: k.name, icon: k.icon } : { icon: 'package' },
      fields: [{ name: 'name', label: 'Nom', required: true, placeholder: 'Pièces, Coffre, Outillage...' }, { name: 'icon', label: 'Icône (Lucide)', placeholder: 'package, wrench, vault...' },
        { name: 'webhook', label: 'Webhook Discord', full: true, placeholder: k && k.webhook ? 'Laisser vide pour garder l’actuel · « - » pour le retirer' : 'https://discord.com/api/webhooks/...',
          hint: (cur ? 'Actuel : ' + cur + '. ' : '') + 'Discord › Paramètres du salon › Intégrations › Webhooks › Copier l’URL.' }],
      onSubmit: async v => { const r = await A().call('stock.cat.save', Object.assign({ id }, v), k ? 'Catégorie modifiée' : 'Catégorie créée'); if (r.ok && r.data) { ivst.cat = r.data.id; A().render(); } return r; } });
  }
  /* Fiche produit (utilisée aussi depuis le POS) */
  LSC.forms.product = (id, defaults) => {
    const s = S(), p = id ? s.products.find(x => x.id === id) : null;
    const it = p && p.inventoryId ? s.inventory.find(x => x.id === p.inventoryId) : null;
    const vals = p ? Object.assign({}, p, { sub: p.sub || '', webhook: '', stock: it ? it.qty : '', margin: p.price ? Math.round((p.price - p.cost) / p.price * 100) : 0 })
      : Object.assign({ category: s.company.categories[0].id, sub: '', icon: 'wrench', visible: true, active: true, consume: 1, inventoryId: '' }, defaults || {});
    const catOf = cid => s.company.categories.find(c => c.id === cid) || {};
    const subOpts = cid => [{ value: '', label: '— Aucune —' }].concat((catOf(cid).subs || []).map(x => ({ value: x.id, label: x.label })));
    const classes = (p && p.classes) || [];
    const classHtml = `<div id="pfClasses" class="row" style="gap:14px;flex-wrap:wrap">${[1, 2, 3, 4, 5].map(n => `<label class="check"><input type="checkbox" data-vc="${n}" ${classes.includes(n) ? 'checked' : ''}><span>Cat. ${n}</span></label>`).join('')}<small class="hint">Aucune case = disponible pour toutes les catégories.</small></div>`;
    U.form({ title: p ? 'Modifier — ' + p.name : 'Nouveau produit', icon: 'tag', size: 'lg', values: vals,
      fields: [{ name: 'name', label: 'Nom', required: true }, { name: 'category', label: 'Catégorie', type: 'select', options: s.company.categories.map(c => ({ value: c.id, label: c.label })) },
        { name: 'sub', label: 'Sous-catégorie', type: 'select', options: subOpts(vals.category) },
        { name: 'classes', label: 'Catégories de véhicule concernées', type: 'html', html: classHtml },
        { name: 'description', label: 'Description', type: 'textarea', full: true, rows: 2 },
        { name: 'image', label: 'Image', placeholder: 'img/products/... ou https://...', hint: 'Choisir dans la liste, coller une URL, ou laisser vide pour l’icône.', attrs: 'list="imgList"' }, { name: 'icon', label: 'Icône (Lucide)', placeholder: 'wrench, car, cog...' },
        { name: 'cost', label: "Prix d'achat / usine", type: 'money' }, { name: 'price', label: 'Prix de vente', type: 'money', required: true },
        { name: 'margin', label: 'Marge (%)', type: 'number', step: '1', hint: 'Modifier la marge recalcule le prix de vente.' },
        { name: 'webhook', label: 'Webhook Discord des sorties de stock', full: true, placeholder: p && p.hasWebhook ? 'Webhook enregistré — laisser vide pour le garder' : 'https://discord.com/api/webhooks/...', hint: `Chaque vente envoie une sortie de stock sur ce salon (annulation = retour). Vide = webhook par défaut des Paramètres${S().company.hasStockWebhook ? '' : ' (non défini)'}. « - » pour retirer.` },
        { name: 'consume', label: 'Quantité sortie par vente', type: 'number', min: 1 },
        { name: 'visible', label: 'Visible dans le point de vente', type: 'checkbox' }, { name: 'active', label: 'Produit actif', type: 'checkbox' }],
      extraFoot: p ? `<button class="btn danger" data-delprod>${icon('trash-2')}Supprimer</button>` : '',
      onChange: (v, fe, e) => {
        if (e.target.name === 'category') {
          fe.elements.sub.innerHTML = U.opts(subOpts(v.category), '');
          fe.querySelector('#pfClasses').closest('.field').hidden = !catOf(v.category).vehicleClass;
        }
        if (e.target.name === 'margin' && v.cost != null && v.margin != null && v.margin < 100) fe.elements.price.value = Math.round(v.cost / (1 - v.margin / 100));
        else if ((e.target.name === 'price' || e.target.name === 'cost') && v.price) fe.elements.margin.value = Math.round((v.price - (v.cost || 0)) / v.price * 100);
      },
      onMount: m => {
        m.el.querySelector('#pfClasses').closest('.field').hidden = !catOf(vals.category).vehicleClass;
        m.el.querySelector('form').insertAdjacentHTML('beforeend', `<datalist id="imgList">${[...new Set(s.products.map(x => x.image).filter(Boolean))].sort().map(x => `<option value="${esc(x)}">`).join('')}</datalist>`);
        const d = m.el.querySelector('[data-delprod]'); if (d) d.onclick = async () => { if (await U.confirm(`Supprimer ${p.name} ?`, { danger: true, ok: 'Supprimer' })) { const r = await A().call('products.delete', { id }, 'Produit supprimé'); if (r.ok) m.close(); } }; },
      onSubmit: (v, m) => { delete v.margin; v.classes = [...m.el.querySelectorAll('[data-vc]:checked')].map(i => +i.dataset.vc); return A().call('products.save', Object.assign({ id }, v), p ? 'Produit modifié' : 'Produit ajouté'); } });
  };

  /* =================== PARTENAIRES =================== */
  const TYPES = [{ value: 'garage', label: 'Garage' }, { value: 'assurance', label: 'Assurance' }, { value: 'concessionnaire', label: 'Concessionnaire' }, { value: 'entreprise', label: 'Entreprise RP' }, { value: 'fourriere', label: 'Fourrière' }, { value: 'transporteur', label: 'Transporteur' }];
  const typeLabel = t => (TYPES.find(x => x.value === t) || { label: t }).label;
  const logo = p => `<span class="partner-logo">${p.logo ? `<img src="${esc(p.logo)}" alt="" onerror="this.remove()">` : esc(p.name.split(' ').map(x => x[0]).slice(0, 2).join(''))}</span>`;
  /* Tous les partenaires, avec ce qu'il reste à facturer. Affiché dans la page Factures. */
  function partnerCards(el) {
    const s = S(), mng = A().can('partners.manage'), inv = A().can('invoices.manage');
    el.innerHTML = s.partners.length ? `<div class="partner-grid">${s.partners.map(p => {
      const todo = s.sales.filter(x => x.partnerId === p.id && x.status === 'pending' && !x.invoiceId), due = todo.reduce((a, x) => a + x.total, 0);
      const open = s.invoices.filter(i => i.partnerId === p.id && (i.status === 'sent' || i.status === 'draft'));
      return `<section class="panel" data-id="${p.id}"><div class="panel-body"><div class="who">${logo(p)}<div><b style="font-size:14px">${esc(p.name)}</b><small>${esc(typeLabel(p.type))}${p.contact ? ' · ' + esc(p.contact) : ''}</small></div></div>
        <div class="chips" style="margin:12px 0">${p.rate ? U.badge(`Remise ${p.rate}%`, 'ok') : ''}${p.hasWebhook ? U.badge('Discord relié', 'info') : U.badge('Pas de webhook', 'warn')}${p.pingUser || p.pingRole ? U.badge('Ping actif', 'info') : ''}</div>
        <dl class="kv"><dt>À facturer</dt><dd class="${due ? 'warn-t' : ''}"><b>${money(due)}</b> <small class="muted">(${todo.length} vente${todo.length > 1 ? 's' : ''})</small></dd>
          <dt>Factures en attente</dt><dd>${open.length ? money(open.reduce((a, i) => a + i.total, 0)) + ` <small class="muted">(${open.length})</small>` : '—'}</dd></dl>
        <div class="row" style="margin-top:12px">${inv ? `<button class="btn primary sm" data-a="gen" ${todo.length ? '' : 'disabled'}>${icon('file-plus')}Générer la facture</button>` : ''}<span class="grow"></span>${act('hist', 'Historique des ventes', 'history')}${mng ? act('edit', 'Modifier', 'pencil') + act('del', 'Supprimer', 'trash-2', 'danger') : ''}</div></div></section>`;
    }).join('')}</div>` : `<div class="panel">${U.empty({ icon: 'handshake', title: 'Aucun partenaire', text: 'Ajoutez un partenaire : ses ventes au POS seront mises à facturer.', hint: false })}</div>`;
    onActs(el, {
      edit: id => partnerForm(id), hist: id => LSC.open.partner(id),
      del: async id => { if (await U.confirm('Supprimer ce partenaire ?', { danger: true, ok: 'Supprimer' })) A().call('partners.delete', { id }, 'Partenaire supprimé'); },
      gen: async id => {
        const p = s.partners.find(x => x.id === id), todo = s.sales.filter(x => x.partnerId === id && x.status === 'pending' && !x.invoiceId);
        if (await U.confirm(`Générer la facture de ${p.name} : ${money(todo.reduce((a, x) => a + x.total, 0))} (${todo.length} vente${todo.length > 1 ? 's' : ''}) ?${p.hasWebhook ? ' Elle sera envoyée sur leur Discord.' : ''}`, { ok: 'Générer' })) A().call('invoices.generate', { partnerId: id }, 'Facture générée' + (p.hasWebhook ? ' et envoyée sur Discord' : ''));
      }
    });
    U.paint();
  }
  LSC.partnerCards = partnerCards;
  LSC.forms.partner = id => partnerForm(id);
  function partnerForm(id) {
    const s = S(), p = id ? s.partners.find(x => x.id === id) : null, prices = (p && p.prices) || {};
    const grid = `<div style="max-height:220px;overflow:auto;border:1px solid var(--line);border-radius:6px;padding:6px 10px">${s.products.filter(x => x.active).map(x => `<div class="row" style="padding:4px 0"><span style="flex:1">${esc(x.name)} <small class="muted">${money(x.price)}</small></span><input class="input sm" style="width:110px" type="number" step="0.01" min="0" data-price="${x.id}" placeholder="—" value="${prices[x.id] != null ? prices[x.id] : ''}"></div>`).join('')}</div>`;
    U.form({ title: p ? 'Modifier ' + p.name : 'Nouveau partenaire', icon: 'handshake', size: 'lg', values: p || { type: 'entreprise', rate: 0 },
      fields: [{ name: 'name', label: 'Nom', required: true }, { name: 'type', label: 'Type', type: 'select', options: TYPES }, { name: 'contact', label: 'Contact' }, { name: 'phone', label: 'Téléphone' },
        { name: 'logo', label: 'Logo (URL)' }, { name: 'rate', label: 'Commission / remise (%)', type: 'number', min: 0, max: 100, hint: 'Appliquée sur tous les produits sans prix spécifique.' },
        { name: 'webhook', label: 'Webhook Discord (salon du partenaire)', full: true, placeholder: 'https://discord.com/api/webhooks/...', hint: 'Les factures y sont envoyées. Écrire « - » pour retirer le webhook.' },
        { name: 'pingUser', label: 'ID Discord à mentionner', placeholder: 'ex. 284019374512330000', hint: 'Facultatif : personne pingée à chaque facture.' },
        { name: 'pingRole', label: 'ID du rôle à mentionner', placeholder: 'ex. 112233445566778899', hint: 'Facultatif : rôle pingé (@rôle).' },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 2 }, { name: 'prices', type: 'html', label: 'Prix spécifiques (laisser vide = remise %)', full: true, html: grid }],
      onSubmit: (v, m) => { v.prices = {}; m.el.querySelectorAll('[data-price]').forEach(i => { if (i.value !== '') v.prices[i.dataset.price] = +i.value; }); return A().call('partners.save', Object.assign({ id }, v), p ? 'Partenaire modifié' : 'Partenaire ajouté'); } });
  }
  LSC.open.partner = id => {
    const s = S(), p = s.partners.find(x => x.id === id);
    if (!p) return;
    const sales = s.sales.filter(x => x.partnerId === id);
    const m = U.modal({ title: p.name, icon: 'handshake', size: 'lg', body: `<div class="who" style="margin-bottom:12px">${logo(p)}<div><b>${esc(typeLabel(p.type))}</b><small>${esc(p.contact || '—')} · ${esc(p.phone || '—')}${p.notes ? ' · ' + esc(p.notes) : ''}</small></div></div><div id="phist"></div>`, foot: '<span class="grow"></span><button class="btn" data-close>Fermer</button>' });
    U.table(m.el.querySelector('#phist'), { id: 'phist', rows: sales, sort: 'createdAt', pageSize: 8, resetPage: true, compact: true, onRow: x => { m.close(); LSC.open.sale(x.id); },
      empty: { icon: 'receipt', title: 'Aucune vente', text: 'Aucune vente avec ce partenaire.', hint: false },
      columns: [{ key: 'num', label: 'Vente', render: x => '#' + x.num }, { key: 'createdAt', label: 'Date', render: x => U.fmtDT(x.createdAt) }, { key: 'employeeName', label: 'Employé' }, { key: 'total', label: 'Total', align: 'right', render: x => money(x.total) }, { key: 'status', label: 'Statut', render: x => U.status('sale', x.status) }] });
  };

  /* =================== COMPTE BANCAIRE =================== */
  const bst = { period: 'week', q: '', cat: '', type: '' };
  const BCAT = { vente: 'Vente', facture: 'Facture client', charge: 'Charge', fournisseur: 'Fournisseur', salaire: 'Salaire', achat: 'Achat stock', remboursement: 'Remboursement', apport: 'Apport', depot: 'Dépôt espèces', retrait: 'Retrait', autre: 'Autre' };
  function bank(el) {
    const s = S(), r = ST.range(bst.period, bst.from, bst.to, bst.wk);
    const sorted = s.bank.slice().sort((a, b) => a.at.localeCompare(b.at));
    let bal = ST.bankBalance(s) - sorted.reduce((a, t) => a + (t.type === 'in' ? t.amount : -t.amount), 0); const after = {};
    sorted.forEach(t => { bal += t.type === 'in' ? t.amount : -t.amount; after[t.id] = bal; });
    const inR = sorted.filter(t => ST.within(r, t.at));
    const ins = inR.filter(t => t.type === 'in').reduce((a, t) => a + t.amount, 0), outs = inR.filter(t => t.type === 'out').reduce((a, t) => a + t.amount, 0);
    const list = ST.buckets(r), vals = list.map(b => { let v = 0; for (const t of sorted) { if (Date.parse(t.at) < b.start + (r.bucket === 'hour' ? 36e5 : r.bucket === 'month' ? 31 * ST.DAY : ST.DAY)) v = after[t.id]; else break; } return v; });
    el.innerHTML = `<div class="page-head"><div><h1>Compte bancaire</h1><div class="sub">Alimenté automatiquement : ventes carte / compte entreprise, factures, charges, salaires, achats.</div></div>
        <div class="actions">${U.periodBar(bst)}${A().can('bank.manage') ? `<button class="btn primary sm" data-new>${icon('plus')}Nouvelle transaction</button>` : ''}</div></div>
      <div class="grid stats">${U.stat({ label: 'Solde disponible', value: money(bal), valueCls: bal < 0 ? 'danger-t' : 'ok-t', icon: 'landmark' })}
        ${U.stat({ label: 'Entrées', value: '+' + money(ins), sub: inR.filter(t => t.type === 'in').length + ' opération(s)', icon: 'arrow-down-left' })}
        ${U.stat({ label: 'Sorties', value: '-' + money(outs), sub: inR.filter(t => t.type === 'out').length + ' opération(s)', icon: 'arrow-up-right', tone: 'danger' })}
        ${U.stat({ label: 'Variation', value: money(ins - outs, true), valueCls: ins - outs < 0 ? 'danger-t' : '', icon: 'activity', tone: 'info' })}</div>
      <div class="mt">${U.panel('Évolution du solde', U.chart({ labels: list.map(b => b.label), series: [{ name: 'Solde', values: vals, color: 'var(--info)' }], height: 190 }), { icon: 'chart-line' })}</div>
      <div class="panel mt"><div class="panel-body"><div class="filters"><div class="search">${icon('search')}<input class="input" id="bkq" placeholder="Libellé, montant..." value="${esc(bst.q)}"></div>
        <select class="input" id="bkt"><option value="">Entrées et sorties</option>${U.opts([{ value: 'in', label: 'Entrées' }, { value: 'out', label: 'Sorties' }], bst.type)}</select>
        <select class="input" id="bkc"><option value="">Toutes catégories</option>${U.opts(Object.keys(BCAT).map(k => ({ value: k, label: BCAT[k] })), bst.cat)}</select></div><div id="bkTable"></div></div></div>`;
    const draw = reset => U.table(el.querySelector('#bkTable'), { id: 'bank', sort: 'at', resetPage: reset,
      rows: inR.filter(t => (!bst.type || t.type === bst.type) && (!bst.cat || t.category === bst.cat) && (!bst.q || (t.label + ' ' + t.amount).toLowerCase().includes(bst.q.toLowerCase()))),
      empty: { icon: 'landmark', title: 'Aucune transaction', text: 'Aucune donnée disponible pour cette période.', hint: 'Modifiez les filtres ou créez une nouvelle transaction.' },
      columns: [{ key: 'at', label: 'Date', render: t => `${U.fmtDate(t.at)} <span class="muted">${U.fmtTime(t.at)}</span>` }, { key: 'label', label: 'Libellé', render: t => `<b>${esc(t.label)}</b>` },
        { key: 'category', label: 'Catégorie', render: t => U.badge(BCAT[t.category] || t.category) }, { key: 'by', label: 'Par', render: t => `<span class="muted">${esc(A().empName(t.by))}</span>` },
        { key: 'amount', label: 'Montant', align: 'right', sortValue: t => t.type === 'in' ? t.amount : -t.amount, render: t => `<b class="${t.type === 'in' ? 'ok-t' : 'danger-t'}">${t.type === 'in' ? '+' : '-'}${money(t.amount)}</b>` },
        { key: 'bal', label: 'Solde', align: 'right', sortValue: t => after[t.id], render: t => `<span class="muted">${money(after[t.id])}</span>` }] });
    el.querySelector('#bkq').oninput = e => { bst.q = e.target.value; draw(true); };
    el.querySelector('#bkt').onchange = e => { bst.type = e.target.value; draw(true); };
    el.querySelector('#bkc').onchange = e => { bst.cat = e.target.value; draw(true); };
    const nb = el.querySelector('[data-new]');
    if (nb) nb.onclick = () => U.form({ title: 'Nouvelle transaction', icon: 'landmark', values: { type: 'in', category: 'depot' },
      fields: [{ name: 'type', label: 'Type', type: 'select', options: [{ value: 'in', label: 'Entrée (+)' }, { value: 'out', label: 'Sortie (-)' }] }, { name: 'amount', label: 'Montant', type: 'money', required: true },
        { name: 'category', label: 'Catégorie', type: 'select', options: ['depot', 'apport', 'retrait', 'autre'].map(k => ({ value: k, label: BCAT[k] })) }, { name: 'label', label: 'Libellé', required: true, placeholder: 'Dépôt de la caisse espèces' }],
      onSubmit: v => A().call('bank.add', v, 'Transaction enregistrée') });
    U.bindPeriod(el, bst, () => bank(el));
    draw();
  }
  LSC.open.transaction = id => {
    const t = S().bank.find(x => x.id === id);
    if (!t) return;
    if (t.category === 'vente' && t.ref) return LSC.open.sale(t.ref);
    if (t.category === 'facture' && t.ref) return LSC.open.invoice(t.ref);
    bst.q = t.label; bst.period = 'custom'; bst.from = U.toInputDate(Date.parse(t.at)); bst.to = bst.from;
    A().go('bank');
  };

  /* =================== HISTORIQUE (AUDIT) =================== */
  const ast = { q: '', actor: '' };
  function audit(el) {
    const s = S();
    el.innerHTML = `<div class="page-head"><div><h1>Historique</h1><div class="sub">Journal des actions importantes (audit).</div></div>
        <div class="actions"><div class="search">${icon('search')}<input class="input" id="auq" placeholder="Rechercher..." value="${esc(ast.q)}"></div><select class="input sm" id="aua" data-combo><option value="">Tous les employés</option>${U.opts(s.employees.map(e => ({ value: e.id, label: e.name })), ast.actor)}</select>${A().auditFrom > A().oldest ? `<button class="btn sm ghost" id="auMore">${icon('history')}Plus ancien</button>` : ''}</div></div>
      <div class="panel"><div class="panel-body" id="auList"></div></div>`;
    const draw = () => {
      const rows = s.audit.filter(a => (!ast.actor || a.actorId === ast.actor) && (!ast.q || a.text.toLowerCase().includes(ast.q.toLowerCase()))).slice(-300).reverse();
      if (!rows.length) { el.querySelector('#auList').innerHTML = U.empty({ icon: 'history', title: 'Aucune action', text: 'Aucune entrée ne correspond.', hint: false }); U.paint(); return; }
      let day = '';
      el.querySelector('#auList').innerHTML = `<div class="list timeline">${rows.map(a => { const d = U.fmtDate(a.at), h = d !== day ? `<div class="day-sep">${d}</div>` : ''; day = d; return h + `<div class="li"><time>${U.fmtTime(a.at)}</time>${U.avatar(a.actor)}<div>${esc(a.text)}</div></div>`; }).join('')}</div>${rows.length === 300 ? '<p class="muted" style="margin:10px 0 0">300 dernières entrées affichées — affinez la recherche.</p>' : ''}`;
      U.paint();
    };
    el.querySelector('#auq').oninput = e => { ast.q = e.target.value; draw(); };
    const more = el.querySelector('#auMore');
    if (more) more.onclick = () => A().moreAudit(30);
    el.querySelector('#aua').onchange = e => { ast.actor = e.target.value; draw(); };
    draw();
  }

  /* =================== PARAMÈTRES =================== */
  function settings(el) {
    const s = S(), co = s.company, local = LSC.api.mode === 'local';
    el.innerHTML = `<div class="page-head"><div><h1>Paramètres</h1><div class="sub">Configuration de l'entreprise, de la comptabilité et du point de vente.</div></div></div>
      <div class="settings-grid">
        <section class="panel"><div class="panel-head"><h3>${icon('building-2')}Entreprise</h3></div><div class="panel-body"><form class="form" id="fCo">
          ${[['name', 'Nom'], ['subtitle', 'Sous-titre'], ['address', 'Adresse'], ['phone', 'Téléphone']].map(f => U.field({ name: f[0], label: f[1] }, co[f[0]])).join('')}
          ${U.field({ name: 'theme', label: 'Thème par défaut', type: 'select', options: LSC.theme.list.map(t => ({ value: t.id, label: t.name })), hint: 'Pour tout le monde ; chacun peut choisir le sien (menu du profil → Thème).' }, co.theme || 'dark')}
          ${U.field({ name: 'logo', label: 'Logo (URL)', full: true, placeholder: 'https://...' }, co.logo)}${U.field({ name: 'description', label: 'Description', type: 'textarea', full: true, rows: 2 }, co.description)}</form>
          <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary sm" data-save="co">${icon('save')}Enregistrer</button></div></div></section>
        <section class="panel"><div class="panel-head"><h3>${icon('calculator')}Comptabilité</h3></div><div class="panel-body"><form class="form" id="fAcc">
          ${U.field({ name: 'currency', label: 'Devise (symbole)' }, co.currency)}${U.field({ name: 'rounding', label: 'Arrondis', type: 'select', options: [{ value: 1, label: "À l'unité ($1)" }, { value: 0.01, label: 'Au centime ($0.01)' }] }, co.rounding)}
          ${U.field({ name: 'commissionBase', label: 'Commission des employés', type: 'select', options: [{ value: 'margin', label: '% du bénéfice (prix − coût) — règle mairie' }, { value: 'revenue', label: '% du chiffre d’affaires' }] }, co.commissionBase || 'margin')}
          ${U.field({ name: 'payReason', label: 'Motif du virement de paie', hint: 'Précédé du n° de semaine : « S40 Paye LS Customs ».' }, co.payReason || 'Paye LS Customs')}${U.field({ name: 'invoiceDays', label: 'Échéance factures (jours)', type: 'number', min: 1 }, co.invoiceDays)}
          ${U.field({ name: 'largeSale', label: 'Seuil « vente importante »', type: 'money' }, co.largeSale)}${U.field({ name: 'maxDiscountPct', label: 'Plafond réduction sans permission étendue (%)', type: 'number', min: 0, max: 100 }, co.maxDiscountPct)}</form>
          <p class="hint" style="margin:10px 0 0">Les taux de commission sont définis par grade dans « Gestion des rôles ».</p>
          <div class="section-title">Impôt par tranches (barème mairie)</div>
          <div class="form tax-form">${(co.taxBrackets || []).map((b, i, a) => `${i < a.length - 1 ? U.field({ name: 'tb' + i, label: `Tranche ${i + 1} : jusqu'à`, type: 'money' }, b.upTo) : `<div class="field"><span class="field-label">Tranche ${i + 1}</span><div class="input" style="display:flex;align-items:center;opacity:.7">au-delà</div></div>`}${U.field({ name: 'tr' + i, label: 'Taux (%)', type: 'number', min: 0, max: 100 }, b.rate)}`).join('')}</div>
          <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary sm" data-save="acc">${icon('save')}Enregistrer</button></div></div></section>
        <section class="panel"><div class="panel-head"><h3>${icon('shopping-cart')}Point de vente</h3></div><div class="panel-body">
          <div class="section-title">Catégories</div><div id="catRows">${co.categories.map(c => catRow(c)).join('')}</div><button class="btn sm" id="addCat">${icon('plus')}Ajouter une catégorie</button>
          <div class="section-title">Paiement</div><p class="muted" style="margin:0 0 8px">Vente avec un partenaire : mise à facturer (page Factures). Sinon paiement direct.</p>
          <div class="form">${U.field({ name: 'directPayment', label: 'Paiement direct', type: 'select', options: [{ value: 'card', label: 'Carte (compte bancaire)' }, { value: 'company', label: 'Compte entreprise' }, { value: 'cash', label: 'Espèces (caisse)' }] }, co.directPayment || 'card')}</div>
          <div class="section-title">Catégories de véhicules (onglet Performances)</div>
          <div class="form">${[0, 1, 2, 3, 4].map(i => U.field({ name: 'vc' + i, label: 'Catégorie ' + (i + 1) }, (co.vehicleClasses || [])[i] || '')).join('')}</div>
          <div class="form" style="margin-top:12px">${U.field({ name: 'discountReasons', label: 'Motifs de réduction (séparés par des virgules)', full: true }, co.discountReasons.join(', '))}${U.field({ name: 'markupReasons', label: 'Motifs de majoration', full: true }, co.markupReasons.join(', '))}</div>
          <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary sm" data-save="pos">${icon('save')}Enregistrer</button></div></div></section>
        <section class="panel"><div class="panel-head"><h3>${icon('users')}Employés</h3></div><div class="panel-body">
          <table class="tbl compact"><thead><tr><th>Grade</th><th class="right">Commission</th><th class="right">Salaire fixe</th><th class="right">Effectif</th></tr></thead><tbody>
          ${s.roles.slice().sort((a, b) => b.rank - a.rank).map(r => `<tr><td>${esc(r.name)}</td><td class="right">${r.commission}%</td><td class="right">${money(r.salary)}</td><td class="right">${s.employees.filter(e => !e.archived && e.roleId === r.id).length}</td></tr>`).join('')}</tbody></table>
          ${A().allowed('roles') ? `<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn sm" data-go="roles">${icon('shield-check')}Grades, permissions et salaires</button></div>` : ''}</div></section>
        <section class="panel"><div class="panel-head"><h3>${icon('shopping-bag')}Frais — types de commande</h3></div><div class="panel-body" id="fFees">
          <p class="muted" style="margin:0 0 10px">Les seuls frais de l'entreprise. Le prix unitaire pré-remplit chaque nouvelle commande.</p>
          <div class="cfg-head fee"><span>Nom</span><span>Prix unitaire</span><span title="Déductible des impôts">Déd.</span><span></span></div>
          <div id="feeRows">${co.expenseCategories.map(feeRow).join('')}</div>
          <div class="row" style="margin-top:8px"><button class="btn sm" id="addFee">${icon('plus')}Ajouter un type</button><span class="grow"></span><button class="btn primary sm" data-save="fees">${icon('save')}Enregistrer</button></div></div></section>
        <section class="panel"><div class="panel-head"><h3>${icon('gift')}Primes automatiques</h3></div><div class="panel-body" id="fPrimes">
          <p class="muted" style="margin:0 0 10px">Ajoutées automatiquement aux fiches lors de « Générer la paie » si la condition est remplie sur la période. Les primes manuelles se donnent depuis Salaires.</p>
          <div class="cfg-head rule"><span></span><span>Nom</span><span>Condition</span><span>Seuil</span><span>Prime</span><span></span></div>
          <div id="ruleRows">${(co.primeRules || []).map(ruleRow).join('')}</div>
          <div class="row" style="margin-top:8px"><button class="btn sm" id="addRule">${icon('plus')}Ajouter une règle</button><span class="grow"></span><button class="btn primary sm" data-save="primes">${icon('save')}Enregistrer</button></div></div></section>
        <section class="panel"><div class="panel-head"><h3>${icon('badge-check')}Prérequis salaire (par semaine)</h3></div><div class="panel-body" id="fReq">
          <p class="muted" style="margin:0 0 12px">Dans Salaires, un rond <span class="req ok"></span> vert s'affiche à côté du nom si tous les prérequis de la période sont atteints, sinon <span class="req ko"></span> rouge.</p>
          <div class="form">${U.field({ name: 'quota', label: 'Quota minimum de ventes (CA / semaine)', type: 'money', hint: '0 = pas de quota.' }, (co.payrollRules || {}).quota)}
          ${U.field({ name: 'minDays', label: 'Ancienneté minimum (jours depuis le recrutement)', type: 'number', min: 0, hint: '0 = pas de condition.' }, (co.payrollRules || {}).minDays)}
          ${U.field({ name: 'absence', label: 'En cas d’absence dans la semaine', type: 'select', full: true, options: [{ value: 'exempt', label: 'Dispensé du quota (absence justifiée)' }, { value: 'block', label: 'Prérequis non atteint' }, { value: 'ignore', label: 'Ne pas tenir compte des absences' }] }, (co.payrollRules || {}).absence)}</div>
          <div class="section-title">Grades éligibles <small class="muted" style="text-transform:none;letter-spacing:0">(aucun coché = tous)</small></div>
          <div class="chips">${s.roles.slice().sort((a, b) => a.rank - b.rank).map(r => `<label class="check" style="margin-right:12px"><input type="checkbox" data-rr="${r.id}" ${((co.payrollRules || {}).roles || []).includes(r.id) ? 'checked' : ''}><span>${esc(r.name)}</span></label>`).join('')}</div>
          <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary sm" data-save="req">${icon('save')}Enregistrer</button></div></div></section>
        <section class="panel"><div class="panel-head"><h3>${icon('bell')}Notifications</h3></div><div class="panel-body" id="fNotif">
          ${[['signup', 'Demande de compte'], ['lowStock', 'Stock faible'], ['overdue', 'Facture en retard'], ['largeSale', 'Transaction importante'], ['payment', 'Paiement reçu'], ['service', 'Fin de service']].map(n => `<label class="check" style="padding:5px 0"><input type="checkbox" data-n="${n[0]}" ${co.notify[n[0]] !== false ? 'checked' : ''}><span>${n[1]}</span></label>`).join('')}
          <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary sm" data-save="notif">${icon('save')}Enregistrer</button></div></div></section>
        <section class="panel"><div class="panel-head"><h3>${icon('user-x')}Licenciement</h3></div><div class="panel-body">
          <p class="muted" style="margin:0 0 10px">Étapes à cocher dans la fenêtre « Licencier ». Quand tout est coché, la confirmation envoie le message Discord et supprime le compte de la compta.</p>
          <div id="dcRows">${(co.dismissChecklist || []).map(dcRow).join('')}</div>
          <div class="row" style="margin-top:8px"><button class="btn sm" id="addDc">${icon('plus')}Ajouter une étape</button><span class="grow"></span><button class="btn primary sm" data-save="dc">${icon('save')}Enregistrer</button></div></div></section>
        <section class="panel"><div class="panel-head"><h3>${icon('car')}Catégories de véhicules</h3></div><div class="panel-body">
          <p class="muted" style="margin:0 0 10px">La catégorie est sélectionnée automatiquement d'après cette liste (modèle donné par l'API GLife ou par le jeu). Un véhicule absent de la liste déclenche une alerte « à vérifier en jeu » et un message Discord.</p>
          ${unlistedBlock(s, co)}
          <div class="section-title">Liste (${Object.keys(co.modelClasses || {}).length} modèles)</div>
          <div class="search" style="margin-bottom:8px">${icon('search')}<input class="input" id="mcq" placeholder="Filtrer un modèle..."></div>
          <div class="cfg-head mc"><span>Modèle</span><span>Catégorie</span><span></span></div>
          <div id="mcRows" style="max-height:260px;overflow:auto">${Object.keys(co.modelClasses || {}).sort().map(m => mcRow(m, co.modelClasses[m], co)).join('')}</div>
          <div class="row" style="margin-top:6px"><button class="btn sm" id="addMc">${icon('plus')}Ajouter un modèle</button><button class="btn sm" id="impMc">${icon('upload')}Importer une liste</button></div>
          <details style="margin-top:12px"><summary class="section-title" style="cursor:pointer;margin:0">Classes GTA (en jeu)</summary>
            <div class="gta-grid">${LSCServer.GTA_CLASSES.map((g, i) => `<label class="field"><span class="field-label">${esc(g)}</span><select class="input sm" data-gta="${i}">${vcOpts(co, (co.gtaClasses || LSCServer.GTA_DEFAULT)[i])}</select></label>`).join('')}</div></details>
          <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary sm" data-save="veh">${icon('save')}Enregistrer</button></div></div></section>
        <section class="panel"><div class="panel-head"><h3>${icon('message-square')}Discord</h3></div><div class="panel-body" id="fDisc">
          <p class="muted" style="margin:0 0 10px">Laisser vide pour garder le webhook enregistré, « - » pour le retirer.</p>
          <div class="form">${U.field({ name: 'stockWebhook', label: 'Sorties de stock (webhook par défaut)', full: true, placeholder: co.hasStockWebhook ? 'Webhook enregistré' : 'https://discord.com/api/webhooks/...', hint: 'Utilisé pour les produits qui n’ont pas leur propre webhook (fiche produit).' }, '')}
          ${U.field({ name: 'archiveWebhook', label: 'Rappel d’archivage (début de mois)', full: true, placeholder: co.hasArchiveWebhook ? 'Webhook enregistré' : 'https://discord.com/api/webhooks/...' }, '')}
          ${U.field({ name: 'archiveRole', label: 'ID du rôle à pinger pour le rappel', full: true, placeholder: 'ex. 112233445566778899' }, co.archiveRole || '')}
          ${U.field({ name: 'saleWebhook', label: 'Logs : grosses ventes', placeholder: co.hasSaleWebhook ? 'Webhook enregistré' : 'https://discord.com/api/webhooks/...' }, '')}
          ${U.field({ name: 'largeSale', label: 'Grosse vente à partir de', type: 'money' }, co.largeSale)}
          ${U.field({ name: 'fireWebhook', label: 'Logs : licenciements', full: true, placeholder: co.hasFireWebhook ? 'Webhook enregistré' : 'https://discord.com/api/webhooks/...' }, '')}
          ${U.field({ name: 'glifeWebhook', label: 'Récap quotidien des factures en jeu (GLife)', placeholder: co.hasGlifeWebhook ? 'Webhook enregistré' : 'https://discord.com/api/webhooks/...' }, '')}
          ${U.field({ name: 'glifeCompanyId', label: 'ID de l’entreprise GLife', type: 'number', min: 1 }, co.glifeCompanyId || 139)}
          ${U.field({ name: 'unlistedWebhook', label: 'Véhicules non recensés', full: true, placeholder: co.hasUnlistedWebhook ? 'Webhook enregistré' : 'https://discord.com/api/webhooks/...', hint: 'Un message par modèle absent de la liste (signalé à la première recherche).' }, '')}</div>
          <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary sm" data-save="disc">${icon('save')}Enregistrer</button></div></div></section>
        <section class="panel"><div class="panel-head"><h3>${icon('database')}Données</h3></div><div class="panel-body">
          <p class="muted" style="margin:0 0 12px">Mode actuel : <b style="color:var(--text)">${{ local: 'Démo locale (navigateur)', http: 'Serveur (Vercel + Supabase)', nui: 'FiveM NUI' }[LSC.api.mode]}</b>${local ? ' — les données sont stockées dans ce navigateur uniquement.' : ''}</p>
          <div class="row">${local ? `<button class="btn sm" id="exp">${icon('download')}Exporter (JSON)</button>` : ''}${local && A().can('*') ? `<button class="btn sm danger" id="reset">${icon('rotate-ccw')}Tout effacer (sauf comptes)</button>` : ''}</div>
          ${A().can('*') ? archiveBlock(s) : ''}</div></section>
      </div>`;
    const form = id => { const f = el.querySelector(id), v = {}; [...f.elements].forEach(i => { if (i.name) v[i.name] = i.value; }); return v; };
    const save = (company, msg) => A().call('settings.save', { company }, msg || 'Paramètres enregistrés');
    el.querySelector('#addFee').onclick = () => { el.querySelector('#feeRows').insertAdjacentHTML('beforeend', feeRow({ id: '', label: '', price: 0 })); U.paint(); };
    el.querySelector('#addRule').onclick = () => { el.querySelector('#ruleRows').insertAdjacentHTML('beforeend', ruleRow({ id: '', label: '', type: 'ca', threshold: 0, amount: 0, enabled: true })); U.paint(); };
    ['#feeRows', '#ruleRows'].forEach(sel => el.querySelector(sel).addEventListener('click', e => { const b = e.target.closest('[data-rmrow]'); if (b) b.closest('.cfg-row').remove(); }));
    el.querySelector('#addCat').onclick = () => { el.querySelector('#catRows').insertAdjacentHTML('beforeend', catRow({ id: '', label: '', icon: 'package' })); U.paint(); };
    el.querySelector('#catRows').addEventListener('click', e => { const b = e.target.closest('[data-rmcat]'); if (b) b.closest('.cat-row').remove(); });
    el.querySelectorAll('[data-save]').forEach(b => b.onclick = () => {
      const k = b.dataset.save;
      if (k === 'co') save(form('#fCo'));
      else if (k === 'disc') { const v = {}; el.querySelectorAll('#fDisc input').forEach(i => { v[i.name] = i.value.trim(); }); v.largeSale = +v.largeSale || 0; v.glifeCompanyId = +v.glifeCompanyId || 0; save(v, 'Réglages Discord enregistrés'); }
      else if (k === 'dc') save({ dismissChecklist: [...el.querySelectorAll('#dcRows .cfg-row')].map(r => ({ id: r.dataset.id, label: r.querySelector('input').value.trim() })) }, 'Étapes du licenciement enregistrées');
      else if (k === 'veh') {
        const modelClasses = {};
        el.querySelectorAll('#mcRows .cfg-row').forEach(r => { const m = r.querySelector('[data-k=model]').value.trim().toLowerCase(); if (m) modelClasses[m] = +r.querySelector('[data-k=cls]').value; });
        save({ modelClasses, gtaClasses: [...el.querySelectorAll('[data-gta]')].map(x => +x.value) }, 'Catégories de véhicules enregistrées');
      }
      else if (k === 'acc') {
        const v = form('#fAcc'); ['rounding', 'invoiceDays', 'largeSale', 'maxDiscountPct'].forEach(x => { v[x] = +v[x]; });
        const tv = n => { const i = el.querySelector(`[name=${n}]`); return i ? i.value : null; }; // barème : hors du <form>
        v.taxBrackets = (co.taxBrackets || []).map((b, i) => ({ upTo: tv('tb' + i) != null ? +tv('tb' + i) : null, rate: +tv('tr' + i) || 0 }));
        save(v);
      }
      else if (k === 'pos') {
        const categories = [...el.querySelectorAll('.cat-row')].map(r => ({ id: r.dataset.id || r.querySelector('[data-k=label]').value.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-'), label: r.querySelector('[data-k=label]').value, icon: r.querySelector('[data-k=icon]').value }));
        const split = n => el.querySelector(`[name=${n}]`).value.split(',').map(x => x.trim()).filter(Boolean);
        const fv = n => el.querySelector(`[name=${n}]`).value;
        save({ categories, directPayment: fv('directPayment'), vehicleClasses: [0, 1, 2, 3, 4].map(i => fv('vc' + i)), discountReasons: split('discountReasons'), markupReasons: split('markupReasons') });
      } else if (k === 'fees') {
        const list = [...el.querySelectorAll('#feeRows .cfg-row')].map(r => ({ id: r.dataset.id, label: r.querySelector('[data-k=label]').value, price: +r.querySelector('[data-k=price]').value || 0, deductible: r.querySelector('[data-k=ded]').checked }));
        save({ expenseCategories: list }, 'Types de commande enregistrés');
      } else if (k === 'primes') {
        const list = [...el.querySelectorAll('#ruleRows .cfg-row')].map(r => ({ id: r.dataset.id, enabled: r.querySelector('[data-k=enabled]').checked, label: r.querySelector('[data-k=label]').value, type: r.querySelector('[data-k=type]').value, threshold: +r.querySelector('[data-k=threshold]').value || 0, amount: +r.querySelector('[data-k=amount]').value || 0 }));
        save({ primeRules: list }, 'Règles de primes enregistrées');
      } else if (k === 'req') {
        const f = el.querySelector('#fReq'), g = n => f.querySelector(`[name=${n}]`).value;
        save({ payrollRules: { quota: +g('quota') || 0, minDays: +g('minDays') || 0, absence: g('absence'), roles: [...f.querySelectorAll('[data-rr]:checked')].map(i => i.dataset.rr) } }, 'Prérequis enregistrés');
      } else if (k === 'notif') { const notify = {}; el.querySelectorAll('[data-n]').forEach(i => { notify[i.dataset.n] = i.checked; }); save({ notify }); }
    });
    el.querySelector('#impMc').onclick = () => importModels(co);
    el.querySelector('#addDc').onclick = () => { el.querySelector('#dcRows').insertAdjacentHTML('beforeend', dcRow({ id: '', label: '' })); U.paint(); };
    el.querySelector('#dcRows').addEventListener('click', e => { const b = e.target.closest('[data-rmrow]'); if (b) b.closest('.cfg-row').remove(); });
    el.querySelectorAll('[data-addun]').forEach(b => b.onclick = () => {
      const r = b.closest('.li'), k = r.dataset.k, n = +r.querySelector('select').value;
      A().call('settings.save', { company: { modelClasses: Object.assign({}, co.modelClasses, { [k]: n }) } }, 'Modèle ajouté à la liste');
    });
    el.querySelector('#addMc').onclick = () => { el.querySelector('#mcRows').insertAdjacentHTML('afterbegin', mcRow('', 1, co)); U.paint(); el.querySelector('#mcRows [data-k=model]').focus(); };
    el.querySelector('#mcq').oninput = e => { const q = e.target.value.trim().toLowerCase(); el.querySelectorAll('#mcRows .cfg-row').forEach(r => { r.hidden = !!q && !r.querySelector('[data-k=model]').value.includes(q); }); };
    el.querySelector('#mcRows').addEventListener('click', e => { const b = e.target.closest('[data-rmrow]'); if (b) b.closest('.cfg-row').remove(); });
    const am = () => el.querySelector('#arMonth').value;
    const ad = el.querySelector('#arDl');
    if (ad) ad.onclick = async () => { ad.disabled = true; const n = await archiveDownload(am()); ad.disabled = false; if (n != null) U.toast(`Archive téléchargée (${n} éléments)`); };
    const ax = el.querySelector('#arDel');
    if (ax) ax.onclick = async () => {
      const month = am(); ax.disabled = true;
      const n = await archiveDownload(month);
      ax.disabled = false;
      if (n == null) return;
      if (!await U.confirm(`L'archive de ${monthLabel(month)} a été téléchargée (${n} éléments). Supprimer maintenant ces données de l'application ? Les comptes, grades, produits, partenaires et réglages sont conservés, ainsi que tout ce qui est encore en cours (à facturer, à payer, service ouvert).`, { danger: true, ok: 'Supprimer le mois' })) return;
      A().call('archive.purge', { month }, `${monthLabel(month)} archivé et supprimé`);
    };
    const ex = el.querySelector('#exp');
    if (ex) ex.onclick = () => { U.download('ls-customs-' + U.toInputDate(Date.now()) + '.json', LSC.api.exportLocal()); U.toast('Export téléchargé'); };
    const rs = el.querySelector('#reset');
    if (rs) rs.onclick = async () => { if (await U.confirm('Effacer toutes les données (ventes, services, paies, stock...) ? Les comptes et grades sont conservés.', { danger: true, ok: 'Tout effacer' })) { try { localStorage.removeItem('lsc_cart'); } catch (e) { /* ignore */ } await A().call('demo.reset', {}, 'Données effacées'); } };
  }
  /* modèles signalés « non recensés » par les employés, à ajouter en un clic */
  function unlistedBlock(s, co) {
    const u = s.meta.unlisted || {}, keys = Object.keys(u).sort((a, b) => String(u[b].at).localeCompare(String(u[a].at)));
    if (!keys.length) return '';
    return `<div class="section-title">${icon('triangle-alert', 'xs')} À recenser (${keys.length})</div><div class="list" style="margin-bottom:10px">${keys.map(k => { const x = u[k]; return `<div class="li" data-k="${esc(k)}"><span class="li-ic warn">${icon('car')}</span><div style="min-width:0"><b>${esc(x.name || x.model)}</b><small>${esc(x.model || '')}${x.plate ? ' · ' + esc(x.plate) : ''} · ${esc(x.by || '')} · ${U.fmtDate(x.at)}${x.chosen ? ' · vendu en cat. ' + x.chosen : ''}</small></div>
      <span class="row nowrap" style="margin-left:auto"><select class="input sm">${vcOpts(co, x.chosen || x.hint || 1)}</select><button class="btn sm primary" data-addun>${icon('plus')}Ajouter</button></span></div>`; }).join('')}</div>`;
  }
  /* import : une ligne par véhicule — « nom⇥modèle⇥Catégorie 3 », « Nom — modèle — Catégorie 3 », « modèle;3 », « modèle = 3 »... */
  function parseModels(text) {
    const out = {};
    text.split(/\r?\n/).forEach(line => {
      const parts = line.split(/\t|;|\s[—–]\s|\s\|\s/).map(x => x.trim()).filter(Boolean);
      let model, cat;
      if (parts.length >= 3) { model = parts[1]; cat = parts[2]; }
      else if (parts.length === 2) { model = parts[0]; cat = parts[1]; }
      else { const m = /^(.+?)\s*[=:,]?\s*(?:cat[ée]gorie\s*)?([0-5])\s*$/i.exec(line.trim()); if (m) { model = m[1]; cat = m[2]; } }
      const n = /([0-5])\s*$/.exec(String(cat || '')), k = LSCServer.vkey(model);
      if (k && n && !/^mod[eè]le$/i.test(model)) out[k] = Math.max(1, +n[1]); // 0 = catégorie 1
    });
    return out;
  }
  function importModels(co) {
    U.form({ title: 'Importer une liste de véhicules', icon: 'upload', size: 'lg', submit: 'Importer',
      intro: '<p class="lead" style="margin-bottom:10px">Collez la liste (copiée d’un tableur : nom, modèle, catégorie — ou « modèle ; catégorie » par ligne). Les modèles déjà présents sont mis à jour.</p>',
      fields: [{ name: 'text', label: 'Liste', type: 'textarea', rows: 12, full: true, required: true }],
      onSubmit: v => {
        const add = parseModels(v.text || ''), n = Object.keys(add).length;
        if (!n) { U.toast('Aucune ligne reconnue', 'error'); return { ok: false }; }
        return A().call('settings.save', { company: { modelClasses: Object.assign({}, co.modelClasses, add) } }, `${n} modèle(s) importé(s)`);
      } });
  }
  const dcRow = x => `<div class="cfg-row dc" data-id="${esc(x.id || '')}"><input class="input sm" value="${esc(x.label)}" placeholder="ex. Tenue récupérée"><button class="icon-btn sm danger" data-rmrow title="Retirer">${icon('x', 'sm')}</button></div>`;
  const vcOpts = (co, v) => [1, 2, 3, 4, 5].map(n => `<option value="${n}" ${+v === n ? 'selected' : ''}>${n} · ${esc((co.vehicleClasses || [])[n - 1] || '')}</option>`).join('');
  const mcRow = (m, n, co) => `<div class="cfg-row mc"><input class="input sm" data-k="model" value="${esc(m)}" placeholder="ex. zentorno"><select class="input sm" data-k="cls">${vcOpts(co, n)}</select><button class="icon-btn sm danger" data-rmrow title="Retirer">${icon('x', 'sm')}</button></div>`;
  /* =================== ARCHIVES MENSUELLES =================== */
  const monthLabel = m => { const d = new Date(m + '-15'); return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); };
  function archiveBlock(s) {
    const done = (s.meta.archives || []), now = new Date(), months = [];
    for (let i = 1; i <= 12; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 15); months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); }
    return `<div class="section-title">Archives mensuelles</div>
      <p class="muted" style="margin:0 0 10px">Télécharge les données d'un mois terminé (ventes, services, paies, factures, banque, historique...) puis les supprime pour garder l'application rapide et gratuite. Les comptes, grades, produits, partenaires et réglages ne sont jamais supprimés ; le solde bancaire reste exact.</p>
      <div class="row" style="flex-wrap:wrap"><select class="input sm" id="arMonth">${U.opts(months.map(m => ({ value: m, label: monthLabel(m) + (done.some(a => a.month === m) ? ' (déjà archivé)' : '') })), months[0])}</select>
        <button class="btn sm" id="arDl">${icon('download')}Télécharger</button><button class="btn sm danger" id="arDel">${icon('archive')}Télécharger puis supprimer</button></div>
      ${done.length ? `<div class="list" style="margin-top:8px">${done.slice(-4).reverse().map(a => `<div class="li"><span class="li-ic">${icon('archive')}</span><div><b>${esc(monthLabel(a.month))}</b><small>${a.count} éléments supprimés · ${esc(a.by)} · ${U.fmtDate(a.at)}</small></div></div>`).join('')}</div>` : ''}`;
  }
  /* récupère le mois partie par partie (réponses légères) et télécharge un seul fichier JSON */
  async function archiveDownload(month) {
    const out = { app: 'LS Customs', month, exportedAt: new Date().toISOString() };
    let n = 0;
    for (const part of Object.keys(LSCServer.ARCHIVE)) {
      const r = await LSC.api.call('archive.export', { month, part });
      if (!r.ok) { U.toast(r.error || 'Export impossible', 'error'); return null; }
      out[part] = r.data.rows; n += r.data.rows.length;
    }
    U.download(`ls-customs-archive-${month}.json`, JSON.stringify(out, null, 2));
    return n;
  }
  const feeRow = f => `<div class="cfg-row fee" data-id="${esc(f.id || '')}"><input class="input sm" data-k="label" value="${esc(f.label)}" placeholder="Commande moteur"><input class="input sm" type="number" min="0" step="0.01" data-k="price" value="${f.price || 0}"><label class="check" title="Déductible des impôts (achat fournisseur). Décochez pour un achat de véhicule, de local, une custom..."><input type="checkbox" data-k="ded" ${f.deductible === false ? '' : 'checked'}><span>Déd.</span></label><button class="icon-btn sm danger" data-rmrow title="Retirer">${icon('x', 'sm')}</button></div>`;
  const RULE_TYPES = [{ value: 'ca', label: 'CA de la période ≥ ($)' }, { value: 'hours', label: 'Heures de service ≥' }, { value: 'sales', label: 'Nombre de ventes ≥' }, { value: 'top', label: 'Meilleur vendeur (CA)' }];
  const ruleRow = r => `<div class="cfg-row rule" data-id="${esc(r.id || '')}"><label class="check"><input type="checkbox" data-k="enabled" ${r.enabled !== false ? 'checked' : ''} title="Active"></label><input class="input sm" data-k="label" value="${esc(r.label)}" placeholder="Nom de la prime"><select class="input sm" data-k="type">${U.opts(RULE_TYPES, r.type)}</select><input class="input sm" type="number" min="0" data-k="threshold" value="${r.threshold || 0}" title="Seuil (ignoré pour Meilleur vendeur)"><input class="input sm" type="number" min="0" step="0.01" data-k="amount" value="${r.amount || 0}" title="Montant de la prime ($)"><button class="icon-btn sm danger" data-rmrow title="Retirer">${icon('x', 'sm')}</button></div>`;
  const catRow = c => `<div class="cat-row" data-id="${esc(c.id)}"><input class="input sm" style="width:auto" data-k="label" value="${esc(c.label)}" placeholder="Nom"><input class="input sm" style="width:auto" data-k="icon" value="${esc(c.icon)}" placeholder="icône"><button class="icon-btn sm danger" data-rmcat title="Retirer">${icon('x', 'sm')}</button></div>`;

  Object.assign(LSC.pages, { roles: { render: roles }, inventory: { render: inventory }, bank: { render: bank }, audit: { render: audit }, settings: { render: settings } });
})();
