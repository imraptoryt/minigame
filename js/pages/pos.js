/* Point de vente — module prioritaire.
 * Le panier est local à l'écran ; à l'enregistrement, seuls les ID produits,
 * quantités, client, partenaire, paiement et réduction/majoration demandées
 * sont envoyés. Le serveur recalcule tout et vérifie les permissions. */
(function () {
  'use strict';
  const LSC = window.LSC, U = LSC.ui, { esc, icon, money, paint } = U;
  const app = () => LSC.app, S = () => LSC.app.state;

  const saved = (() => { try { return JSON.parse(localStorage.getItem('lsc_cart')) || {}; } catch (e) { return {}; } })();
  const noVehicle = () => ({ plate: '', cls: null, source: 'manual' });
  const P = { cat: 'all', sub: 'all', q: '', sel: null, partnerId: '', customerId: null, discount: null, markup: null, payment: 'card', cq: '', cart: [], vehicle: noVehicle() };
  Object.assign(P, { cart: saved.cart || [], customerId: saved.customerId || null, partnerId: saved.partnerId || '', discount: saved.discount || null, markup: saved.markup || null, vehicle: saved.vehicle || noVehicle() });
  let root = null;

  function persist() { try { localStorage.setItem('lsc_cart', JSON.stringify({ cart: P.cart, customerId: P.customerId, partnerId: P.partnerId, discount: P.discount, markup: P.markup, vehicle: P.vehicle })); } catch (e) { /* facultatif */ } }
  function sanitize() {
    P.cart = P.cart.filter(l => app().product(l.productId));
    if (P.partnerId && !S().partners.some(p => p.id === P.partnerId)) P.partnerId = '';
  }
  const quote = () => LSCServer.quote(S(), { items: P.cart, partnerId: P.partnerId, discount: P.discount, markup: P.markup }, app().myRole().commission);
  const partner = () => P.partnerId ? S().partners.find(p => p.id === P.partnerId) : null;
  const available = p => LSCServer.stockOf(S(), p);
  const inCart = id => (P.cart.find(l => l.productId === id) || {}).qty || 0;
  const thumb = (p, cls) => `<div class="${cls} ${p && p.image ? 'has-img' : ''}">${icon((p && p.icon) || 'wrench')}${p && p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" onerror="this.parentNode.classList.remove('has-img');this.remove()">` : ''}</div>`;
  const canEdit = () => app().can('products.manage');
  const cats = () => S().company.categories;
  const catOf = id => cats().find(c => c.id === id);
  const subsOf = id => (catOf(id) || {}).subs || [];
  const isVehicleCat = id => !!(catOf(id) || {}).vehicleClass;
  /* perf disponible pour la catégorie de véhicule choisie (aucune classe cochée = toutes) */
  const classOk = (p, cls) => !isVehicleCat(p.category) || !(p.classes || []).length || p.classes.includes(cls);
  const cartNeedsVehicle = () => P.cart.some(l => { const p = app().product(l.productId); return p && isVehicleCat(p.category); });
  /* Produits triés : ordre des catégories, puis des sous-catégories, puis ordre choisi dans le mode édition */
  function sorted() {
    const idx = {}, sidx = {};
    cats().forEach((c, i) => { idx[c.id] = i; (c.subs || []).forEach((s, j) => { sidx[c.id + '|' + s.id] = j + 1; }); });
    return S().products.slice().sort((a, b) => (idx[a.category] ?? 999) - (idx[b.category] ?? 999) ||
      (sidx[a.category + '|' + a.sub] || 0) - (sidx[b.category + '|' + b.sub] || 0) || (a.order || 1e6) - (b.order || 1e6) || a.name.localeCompare(b.name));
  }

  /* ---------- rendu ---------- */
  function render(el) {
    root = el; sanitize();
    if (P.edit && !canEdit()) P.edit = false;
    el.innerHTML = `<div class="pos ${P.edit ? 'editing' : ''}">
      <section class="pos-left">
        <div class="page-head"><h1>Point de vente - ${esc(S().company.name)}</h1>
          <div class="actions">${canEdit() ? `${P.edit ? `<button class="btn sm" data-act="newCat">${icon('folder-plus')}Nouvelle catégorie</button>` : ''}<button class="btn sm" data-act="newProduct">${icon('plus')}Nouveau produit</button>
            <button class="btn sm ${P.edit ? 'primary' : ''}" data-act="edit">${icon(P.edit ? 'check' : 'layout-grid')}${P.edit ? 'Terminer' : 'Modifier / ranger'}</button>` : ''}</div></div>
        ${P.edit ? `<div class="alert info edit-hint">${icon('move')}<span><b>Mode édition</b> — glissez une carte pour la ranger (sur une carte, une sous-catégorie ou un onglet), glissez les onglets et les sous-catégories pour les réordonner. Cliquez sur une carte pour modifier son prix, son image...</span></div>` : ''}
        <div class="cat-tabs" id="posCats"></div>
        <div class="sub-tabs" id="posSubs"></div>
        <div class="panel"><div class="prod-scroll" id="posGrid"></div></div>
      </section>
      <aside class="pos-right">
        <section class="panel cart">
          <div class="panel-head"><h3>${icon('shopping-basket')}Panier</h3><small id="cartSub">Nouvelle commande</small></div>
          <div id="cartVehicle"></div>
          <div class="cart-lines" id="cartLines"></div>
          <div id="cartSum"></div>
          <div class="cart-actions"><button class="btn" data-act="clear">${icon('trash-2')}Vider le panier</button><button class="btn primary" data-act="checkout" title="Ctrl + Entrée">${icon('save')}Enregistrer</button></div>
        </section>
      </aside></div>`;
    drawGrid(); drawCart();
    bind();
  }

  /* produits affichables (hors filtre de catégorie) : en mode édition, tout est montré */
  function filtered() {
    const q = P.q.trim().toLowerCase();
    return sorted().filter(p => (P.edit || (p.active && p.visible)) &&
      (!q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q) || app().catLabel(p.category).toLowerCase().includes(q)));
  }
  function drawTabs(list) {
    if (P.cat !== 'all' && !cats().some(c => c.id === P.cat)) P.cat = 'all';
    const all = [{ id: 'all', label: 'Tous', icon: 'layout-grid' }].concat(cats());
    root.querySelector('#posCats').innerHTML = all.map(c => `<button class="tab ${P.cat === c.id ? 'on' : ''}" data-cat="${c.id}" title="${esc(c.label)}" ${P.edit && c.id !== 'all' ? 'draggable="true"' : ''}>${P.edit && c.id !== 'all' ? icon('grip-vertical', 'xs') : ''}${icon(c.icon || 'package')}<span class="tab-l">${esc(c.label)}</span>${c.vehicleClass && P.vehicle.cls ? `<b class="tab-vc">Cat. ${P.vehicle.cls}</b>` : ''}</button>`).join('');
    /* sous-catégories de l'onglet sélectionné */
    const subs = P.cat === 'all' ? [] : subsOf(P.cat);
    if (P.sub !== 'all' && !subs.some(s => s.id === P.sub)) P.sub = 'all';
    const sc = id => list.filter(p => p.category === P.cat && (id === 'all' || p.sub === id)).length;
    root.querySelector('#posSubs').innerHTML = subs.length ? [{ id: 'all', label: 'Toutes' }].concat(subs).map(s => `<button class="chip ${P.sub === s.id ? 'on' : ''}" data-subtab="${s.id}">${esc(s.label)}<span>${sc(s.id)}</span></button>`).join('') : '';
  }
  function card(p) {
    const pa = partner(), price = LSCServer.roundTo(LSCServer.unitPrice(p, pa), S().company.rounding), st = available(p), q = inCart(p.id);
    const item = p.inventoryId ? S().inventory.find(i => i.id === p.inventoryId) : null;
    const tone = st == null ? '' : st <= 0 ? 'danger' : item && item.qty <= item.min ? 'warn' : '';
    const off = !p.active || !p.visible;
    return `<button class="prod ${q && !P.edit ? 'in' : ''} ${st === 0 ? 'out' : ''} ${off ? 'off' : ''}" data-id="${p.id}" ${P.edit ? 'draggable="true"' : ''} title="${esc(p.description || p.name)}">
      ${thumb(p, 'prod-img')}
      ${q && !P.edit ? `<span class="prod-qty">${q}</span>` : ''}
      ${off ? `<span class="prod-flag">${p.active ? 'Masqué' : 'Inactif'}</span>` : canEdit() && !P.edit ? `<span class="icon-btn sm prod-edit" data-edit="${p.id}" title="Modifier">${icon('pencil', 'xs')}</span>` : ''}
      ${P.edit && isVehicleCat(p.category) ? `<span class="prod-classes">${(p.classes || []).length ? 'Cat. ' + p.classes.join(' · ') : 'Toutes cat.'}</span>` : ''}
      <div class="prod-body"><div class="prod-name">${esc(p.name)}</div><div class="prod-cat">${esc(app().catLabel(p.category))}</div>
        <div class="prod-price">${p.price ? money(price) + (price !== p.price ? `<s>${money(p.price)}</s>` : '') : '<span class="warn-t">Prix à définir</span>'}</div>
        <div class="prod-stock ${tone}">${U.dot(tone || 'ok')}${st == null ? 'Disponible' : st <= 0 ? 'Rupture de stock' : 'Stock : ' + st}</div></div></button>`;
  }
  /* Grille rangée par catégorie (sections), dans l'ordre choisi */
  function drawGrid() {
    if (!root || !root.querySelector('#posGrid')) return;
    const grid = root.querySelector('#posGrid'), list = filtered();
    drawTabs(list);
    const html = cats().filter(c => P.cat === 'all' || c.id === P.cat).map(c => {
      let items = list.filter(p => p.category === c.id);
      const total = items.length;
      if (!items.length && !P.edit) return '';
      const head = `<div class="cat-sec-head">${icon(c.icon || 'package')}<h3>${esc(c.label)}</h3><span class="tab-count">${total}</span>
        ${c.vehicleClass ? `<span class="badge info">${icon('car', 'xs')}Selon la catégorie du véhicule</span>` : ''}
        ${P.edit ? `<span class="grow"></span><button class="btn sm ghost" data-subnew="${c.id}">${icon('folder-plus', 'xs')}Sous-catégorie</button><button class="icon-btn sm" data-catedit="${c.id}" title="Renommer / icône / option véhicule">${icon('pencil', 'xs')}</button><button class="icon-btn sm danger" data-catdel="${c.id}" title="Supprimer la catégorie">${icon('trash-2', 'xs')}</button>` : ''}</div>`;
      /* Performances : rien n'est proposé tant que la catégorie du véhicule n'est pas choisie */
      if (c.vehicleClass && !P.edit) {
        if (!P.vehicle.cls) return `<div class="cat-sec" data-sec="${c.id}">${head}<div class="vc-pick"><span>${icon('car')}Choisissez la catégorie du véhicule pour afficher les performances :</span><div class="vc-cards">${vcButtons(true)}</div></div></div>`;
        items = items.filter(p => classOk(p, P.vehicle.cls));
      }
      const groups = [{ sub: null, items: items.filter(p => !p.sub || !(c.subs || []).some(s => s.id === p.sub)) }]
        .concat((c.subs || []).map(s => ({ sub: s, items: items.filter(p => p.sub === s.id) })))
        .filter(g => (P.cat !== c.id || P.sub === 'all' || (g.sub && g.sub.id === P.sub)) && (g.items.length || P.edit) && (g.sub || g.items.length || !(c.subs || []).length));
      const body = groups.map(g => g.sub
        ? `<div class="sub-sec" data-subsec="${g.sub.id}" data-subcat="${c.id}"><div class="sub-head" data-subid="${g.sub.id}" ${P.edit ? 'draggable="true"' : ''}>${P.edit ? icon('grip-vertical', 'xs') : ''}<span>${esc(g.sub.label)}</span><span class="tab-count">${g.items.length}</span>
            ${P.edit ? `<span class="grow"></span><button class="icon-btn sm" data-subedit="${c.id}|${g.sub.id}" title="Renommer">${icon('pencil', 'xs')}</button><button class="icon-btn sm danger" data-subdel="${c.id}|${g.sub.id}" title="Supprimer la sous-catégorie">${icon('trash-2', 'xs')}</button>` : ''}</div>
            <div class="prod-grid">${g.items.map(card).join('') || '<div class="drop-empty">Glissez des articles ici</div>'}</div></div>`
        : `<div class="prod-grid">${g.items.map(card).join('') || '<div class="drop-empty">Glissez des articles ici</div>'}</div>`).join('');
      return `<div class="cat-sec" data-sec="${c.id}">${head}${body || (c.vehicleClass ? `<p class="muted" style="margin:0">Aucune performance pour un véhicule de catégorie ${P.vehicle.cls}.</p>` : '')}</div>`;
    }).join('');
    grid.innerHTML = html || U.empty({ icon: 'search-x', title: 'Aucun service', text: P.q ? `Aucun résultat pour « ${P.q} ».` : 'Aucun produit visible dans cette catégorie.', hint: canEdit() ? 'Ajoutez un produit ou utilisez « Modifier / ranger ».' : false });
    paint();
  }

  /* ---------- mode édition : catégories et rangement ---------- */
  function moveProduct(id, target) {
    const list = sorted(), me = list.find(p => p.id === id), rest = list.filter(p => p.id !== id);
    if (!me) return;
    let cat, sub, at;
    if (target.ref) { const r = rest.findIndex(p => p.id === target.ref); if (r < 0) return; cat = rest[r].category; sub = rest[r].sub || null; at = target.after ? r + 1 : r; }
    else {
      cat = target.cat; sub = target.sub || null;
      let last = -1;
      rest.forEach((p, i) => { if (p.category === cat && (p.sub || null) === sub) last = i; });
      at = last >= 0 ? last + 1 : rest.length;
    }
    rest.splice(at, 0, Object.assign({}, me, { category: cat, sub }));
    const where = app().catLabel(cat) + (sub ? ' › ' + (subsOf(cat).find(s => s.id === sub) || {}).label : '');
    app().call('catalog.arrange', { products: rest.map(p => ({ id: p.id, category: p.category, sub: p.sub || null })) }, me.category !== cat || (me.sub || null) !== sub ? `${me.name} déplacé vers ${where}` : 'Article déplacé');
  }
  /* sous-catégories : stockées dans la catégorie (subs) */
  const withSubs = (catId, fn) => cats().map(c => c.id === catId ? Object.assign({}, c, { subs: fn((c.subs || []).slice()) }) : c);
  function moveSub(catId, id, ref, after) {
    app().call('catalog.arrange', { categories: withSubs(catId, subs => {
      const me = subs.find(s => s.id === id), rest = subs.filter(s => s.id !== id), i = rest.findIndex(s => s.id === ref);
      if (!me || i < 0) return subs;
      rest.splice(after ? i + 1 : i, 0, me);
      return rest;
    }) }, 'Sous-catégories réordonnées');
  }
  function subForm(catId, id) {
    const s = id ? subsOf(catId).find(x => x.id === id) : null;
    U.form({ title: (s ? 'Renommer la sous-catégorie' : 'Nouvelle sous-catégorie') + ' — ' + app().catLabel(catId), icon: 'folder-plus', size: 'sm', values: s || {},
      fields: [{ name: 'label', label: 'Nom', required: true, full: true, placeholder: 'Ex. Moteur, Freins, Transmission...' }],
      onSubmit: v => app().call('catalog.arrange', { categories: withSubs(catId, subs => s ? subs.map(x => x.id === id ? Object.assign({}, x, v) : x) : subs.concat([{ id: '', label: v.label }])) }, s ? 'Sous-catégorie renommée' : 'Sous-catégorie créée') });
  }
  async function subDelete(catId, id) {
    const s = subsOf(catId).find(x => x.id === id), n = S().products.filter(p => p.category === catId && p.sub === id).length;
    if (!await U.confirm(`Supprimer la sous-catégorie « ${s.label} » ?${n ? ` Ses ${n} article(s) resteront dans « ${app().catLabel(catId)} ».` : ''}`, { danger: true, ok: 'Supprimer' })) return;
    if (P.sub === id) P.sub = 'all';
    app().call('catalog.arrange', { categories: withSubs(catId, subs => subs.filter(x => x.id !== id)) }, 'Sous-catégorie supprimée');
  }
  function moveCat(id, ref, after) {
    const me = cats().find(c => c.id === id), rest = cats().filter(c => c.id !== id);
    let i = rest.findIndex(c => c.id === ref);
    if (!me || i < 0) return;
    rest.splice(after ? i + 1 : i, 0, me);
    app().call('catalog.arrange', { categories: rest }, 'Catégories réordonnées');
  }
  function catForm(id) {
    const c = id ? cats().find(x => x.id === id) : null;
    U.form({ title: c ? 'Modifier la catégorie' : 'Nouvelle catégorie', icon: 'folder-plus', size: 'sm', values: c || { icon: 'package' },
      fields: [{ name: 'label', label: 'Nom', required: true, full: true, placeholder: 'Ex. Services, Ventes, Pièces...' },
        { name: 'icon', label: 'Icône (Lucide)', full: true, hint: 'Ex. wrench, truck, palette, sparkles, package, shopping-bag, car, gauge' },
        { name: 'vehicleClass', label: 'Articles selon la catégorie du véhicule (1 à 5) — demandée dans le panier', type: 'checkbox', full: true }],
      onSubmit: v => {
        const list = cats().map(x => x.id === id ? Object.assign({}, x, v) : x);
        if (!c) list.push({ id: '', label: v.label, icon: v.icon, vehicleClass: v.vehicleClass, subs: [] });
        return app().call('catalog.arrange', { categories: list }, c ? 'Catégorie modifiée' : 'Catégorie créée');
      } });
  }
  async function catDelete(id) {
    const c = cats().find(x => x.id === id);
    if (S().products.some(p => p.category === id)) return U.toast(`Catégorie non vide : déplacez d'abord ses articles`, 'warn');
    if (await U.confirm(`Supprimer la catégorie « ${c.label} » ?`, { danger: true, ok: 'Supprimer' })) {
      if (P.cat === id) P.cat = 'all';
      app().call('catalog.arrange', { categories: cats().filter(x => x.id !== id) }, 'Catégorie supprimée');
    }
  }
  function bindDnd() {
    const pos = root.querySelector('.pos');
    let drag = null;
    const clear = () => pos.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-into'));
    const side = (el, e) => { const r = el.getBoundingClientRect(); return e.clientX > r.left + r.width / 2; };
    pos.addEventListener('dragstart', e => {
      if (!P.edit) return;
      const c = e.target.closest('.prod[data-id]'), t = e.target.closest('.tab[data-cat]'), sh = e.target.closest('.sub-head[data-subid]');
      if (c) drag = { type: 'p', id: c.dataset.id, el: c };
      else if (sh) drag = { type: 's', id: sh.dataset.subid, cat: sh.closest('[data-subcat]').dataset.subcat, el: sh };
      else if (t && t.dataset.cat !== 'all') drag = { type: 'c', id: t.dataset.cat, el: t };
      else return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', drag.id);
      drag.el.classList.add('dragging');
    });
    const target = e => {
      if (!drag) return null;
      const card = e.target.closest('.prod[data-id]'), tab = e.target.closest('.tab[data-cat]'), sec = e.target.closest('[data-sec]'), sub = e.target.closest('[data-subsec]');
      if (drag.type === 'c') return tab && tab.dataset.cat !== 'all' && tab.dataset.cat !== drag.id ? { el: tab, cls: side(tab, e) ? 'drop-after' : 'drop-before' } : null;
      if (drag.type === 's') {
        const h = sub && sub.dataset.subcat === drag.cat && sub.dataset.subsec !== drag.id ? sub.querySelector('.sub-head') : null;
        if (!h) return null;
        const r = sub.getBoundingClientRect();
        return { el: h, cls: e.clientY > r.top + r.height / 2 ? 'drop-after' : 'drop-before', sub: sub.dataset.subsec };
      }
      if (card && card.dataset.id !== drag.id) return { el: card, cls: side(card, e) ? 'drop-after' : 'drop-before' };
      if (tab && tab.dataset.cat !== 'all') return { el: tab, cls: 'drop-into' };
      if (sub && !card) return { el: sub, cls: 'drop-into' };
      if (sec && !card) return { el: sec, cls: 'drop-into' };
      return null;
    };
    pos.addEventListener('dragover', e => { const t = target(e); if (!t) return; e.preventDefault(); clear(); t.el.classList.add(t.cls); });
    pos.addEventListener('drop', e => {
      const t = target(e);
      if (!t) return;
      e.preventDefault();
      const d = drag, after = t.cls === 'drop-after';
      clear();
      if (d.type === 'c') moveCat(d.id, t.el.dataset.cat, after);
      else if (d.type === 's') moveSub(d.cat, d.id, t.sub, after);
      else if (t.el.dataset.id) moveProduct(d.id, { ref: t.el.dataset.id, after });
      else if (t.el.dataset.subsec) moveProduct(d.id, { cat: t.el.dataset.subcat, sub: t.el.dataset.subsec });
      else moveProduct(d.id, { cat: t.el.dataset.cat || t.el.dataset.sec });
    });
    pos.addEventListener('dragend', () => { clear(); if (drag) drag.el.classList.remove('dragging'); drag = null; });
  }

  /* ---------- véhicule : plaque + catégorie 1 à 5 (onglets « selon le véhicule ») ---------- */
  const classLabel = n => ((S().company.vehicleClasses || [])[n - 1]) || 'Catégorie ' + n;
  const vcButtons = big => [1, 2, 3, 4, 5].map(n => `<button class="vc-card ${big ? 'big' : ''} ${P.vehicle.cls === n ? 'on' : ''}" data-vclass="${n}" title="Catégorie ${n} — ${esc(classLabel(n))}"><b>${n}</b><small>${esc(classLabel(n))}</small></button>`).join('');
  const SRC = { auto: ['Détectée en jeu', 'ok'], table: ['Catégorie du modèle', 'ok'], history: ['Historique de la plaque', 'info'], model: ['Même modèle déjà vu', 'info'], manual: ['Choix manuel', 'muted'] };
  function drawVehicle() {
    const box = root.querySelector('#cartVehicle');
    if (!(isVehicleCat(P.cat) || cartNeedsVehicle())) { box.innerHTML = ''; return; }
    const v = P.vehicle, k = v.known;
    const plates = [...new Set(S().sales.filter(x => x.vehicle && x.vehicle.plate).map(x => x.vehicle.plate).reverse())].slice(0, 15);
    box.innerHTML = `<div class="veh-card ${!v.cls ? 'missing' : ''}">
      <div class="veh-top">
        <label class="plate" title="Plaque d'immatriculation"><span>San Andreas</span><input id="vehPlate" maxlength="8" placeholder="PLAQUE" value="${esc(v.plate)}" list="plateList" autocomplete="off" spellcheck="false"></label>
        <div class="veh-meta"><b>${v.cls ? 'Catégorie ' + v.cls + ' · ' + esc(classLabel(v.cls)) : 'Catégorie du véhicule à choisir'}</b>
          <small>${v.cls ? U.badge((SRC[v.source] || SRC.manual)[0], (SRC[v.source] || SRC.manual)[1]) : 'Obligatoire pour les performances'}</small>
          <small class="muted">${k ? (k.count ? `${k.count} intervention${k.count > 1 ? 's' : ''} · dernière le ${U.fmtDate(k.lastAt)}` : 'Jamais venu au garage') : v.plate ? 'Appuyez sur Entrée pour rechercher' : ''}</small></div>
        <div class="veh-actions"><button class="icon-btn sm" data-act="vehLookup" title="Rechercher la plaque">${icon('scan-search', 'sm')}</button><button class="icon-btn sm" data-act="vehClear" title="Effacer le véhicule">${icon('x', 'sm')}</button></div>
      </div>
      ${vehInfo(v)}${vehAlert(v)}
      <div class="vc-cards">${vcButtons(false)}</div>
      <datalist id="plateList">${plates.map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>`;
    paint();
  }
  function setClass(n, source) {
    P.vehicle.cls = n; P.vehicle.source = source || 'manual';
    const bad = P.cart.filter(l => { const p = app().product(l.productId); return p && !classOk(p, n); });
    if (bad.length) { P.cart = P.cart.filter(l => !bad.includes(l)); U.toast(`${bad.length} article(s) retiré(s) : non disponible(s) en catégorie ${n}`, 'warn'); }
    persist(); drawCart(); drawGrid();
  }
  /* Fiche du véhicule renvoyée par l'API GLife : modèle (et concession illégale).
   * Une même plaque peut correspondre à plusieurs véhicules : on choisit alors le modèle. */
  const vehSel = v => v.info && v.info.list && v.info.sel != null ? v.info.list[v.info.sel] : null;
  function vehInfo(v) {
    const g = v.info;
    if (!g) return '';
    if (g.notFound) return `<div class="veh-info muted">${icon('circle-help', 'sm')}Plaque introuvable dans la base GLife</div>`;
    if (g.error) return `<div class="veh-info muted">${icon('wifi-off', 'sm')}API véhicules injoignable</div>`;
    if (!Array.isArray(g.list)) return '';
    const x = vehSel(v), many = g.list.length > 1;
    const pick = many ? `<select class="input sm" id="vehModel"><option value="">${g.list.length} véhicules avec cette plaque — choisir le modèle...</option>${g.list.map((o, i) => `<option value="${i}" ${g.sel === i ? 'selected' : ''}>${esc(o.name || o.model)} (${esc(o.model)})</option>`).join('')}</select>` : '';
    if (many || !x) return `<div class="veh-info">${pick}</div>`;
    return `<div class="veh-info"><div>${icon('car', 'sm')} <b>${esc(x.name || x.model || 'Véhicule')}</b>${x.model ? ` <small class="muted">${esc(x.model)}</small>` : ''}${x.illegal ? ' ' + U.badge('Concession illégale', 'danger') : ''}</div></div>`;
  }
  /* alerte : modèle absent de la liste (à vérifier en jeu) ou catégorie 0 (aucune performance) */
  function vehAlert(v) {
    const u = v.unlisted;
    if (u && u.none) return `<div class="alert info veh-alert">${icon('ban', 'sm')}<span><b>${esc(u.name || u.model)}</b> : catégorie 0, aucune performance possible sur ce véhicule.</span></div>`;
    if (!u) return '';
    return `<div class="alert warn veh-alert">${icon('triangle-alert', 'sm')}<span><b>Véhicule non recensé</b> (${esc(u.name || u.model)}) : vérifiez bien sa catégorie <b>en jeu</b> avant de la choisir.${u.hint ? ` <small>Dernière fois : catégorie ${u.hint}.</small>` : ''} La direction a été prévenue.</span></div>`;
  }
  /* signale un modèle non recensé (une seule fois par modèle, côté serveur) */
  const reportVehicle = u => LSC.api.call('vehicle.report', { model: u.model, name: u.name, plate: P.vehicle.plate, hint: u.hint }).catch(() => {});
  /* Appel direct de l'API publique GLife (CORS ouvert). Renvoie une liste (une plaque peut être partagée). */
  async function glifeVehicle(plate) {
    const url = (window.LSC_CONFIG || {}).vehicleApi;
    if (!url) return null;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null, t = ctl && setTimeout(() => ctl.abort(), 6000);
    try {
      const r = await fetch(url + '?plate=' + encodeURIComponent(plate), { signal: ctl && ctl.signal });
      if (r.status === 404) return { notFound: true };
      if (!r.ok) return { error: true };
      const d = await r.json(), arr = (Array.isArray(d) ? d : [d]).filter(Boolean);
      if (!arr.length) return { notFound: true };
      const list = arr.slice(0, 60).map(o => ({
        model: String(o.model || ''), name: String(o.name || '').trim(), illegal: !!o.illegal
      }));
      return { list, sel: list.length === 1 ? 0 : null };
    } catch (e) { return { error: true }; } finally { if (t) clearTimeout(t); }
  }
  /* Catégorie : historique de la plaque, sinon dernier véhicule du même modèle */
  async function vehicleClass(plate, silent) {
    const x = vehSel(P.vehicle), g = P.vehicle.info;
    /* plusieurs véhicules sur la plaque : on attend le choix du modèle */
    if (g && Array.isArray(g.list) && g.list.length > 1 && !x) { persist(); drawCart(); return; }
    const r = await LSC.api.call('vehicle.lookup', { plate, model: x && x.model, name: x && x.name });
    if (!r.ok) return U.toast(r.error, 'error');
    if (P.vehicle.plate.trim().toUpperCase() !== plate) return;
    const d = r.data;
    P.vehicle.known = { count: d.count, lastAt: d.lastAt };
    P.vehicle.unlisted = d.none ? { none: true, model: x && x.model, name: x && x.name } : d.listed === false ? { model: x && x.model, name: x && x.name, hint: d.hint } : null;
    if (d.listed === false) { if (P.vehicle.source !== 'manual') P.vehicle.cls = null; reportVehicle(P.vehicle.unlisted); }
    if (d.none) { P.vehicle.cls = null; persist(); drawCart(); drawGrid(); return; }
    if (d.class && !(P.vehicle.cls && P.vehicle.source === 'manual')) { setClass(d.class, P.vehicle.source === 'auto' ? 'auto' : d.source || 'history'); if (!silent) U.toast(`${plate} : catégorie ${d.class} (${classLabel(d.class)})`); }
    else { persist(); drawCart(); drawGrid(); if (!d.class && !silent && !P.vehicle.unlisted && !(P.vehicle.info && P.vehicle.info.list && P.vehicle.info.sel == null)) U.toast(`Catégorie inconnue pour ${plate} : choisissez-la`, 'warn'); }
  }
  async function lookupPlate(silent) {
    const plate = (P.vehicle.plate || '').trim().toUpperCase();
    if (!plate) { if (!silent) U.toast('Saisissez une plaque', 'warn'); return; }
    const info = await glifeVehicle(plate);
    if (P.vehicle.plate.trim().toUpperCase() !== plate) return;
    P.vehicle.info = info;
    await vehicleClass(plate, silent);
  }
  let plateTimer = null;

  function drawCart() {
    if (!root || !root.querySelector('#cartLines')) return;
    drawVehicle();
    const q = quote(), lines = root.querySelector('#cartLines'), pa = partner();
    const n = P.cart.reduce((a, l) => a + l.qty, 0);
    root.querySelector('#cartSub').textContent = n ? `Nouvelle commande · ${n} article${n > 1 ? 's' : ''}${pa ? ' · ' + pa.name : ''}` : 'Nouvelle commande';
    lines.innerHTML = q.items.length ? q.items.map(i => {
      const p = app().product(i.productId);
      return `<div class="cart-line ${P.sel === i.productId ? 'sel' : ''}" data-line="${i.productId}">
        ${thumb(p, 'cart-thumb')}
        <div class="cart-name">${esc(i.name)}</div><div class="cart-total">${money(i.total)}</div>
        <div class="cart-unit">${money(i.price)} x ${i.qty}</div>
        <div class="cart-ctrl"><span class="qty"><button data-dec="${i.productId}" title="Diminuer">${icon('minus', 'xs')}</button><span>${i.qty}</span><button data-inc="${i.productId}" title="Augmenter">${icon('plus', 'xs')}</button></span>
          <button class="icon-btn sm danger" data-del="${i.productId}" title="Supprimer (Suppr)">${icon('trash-2', 'sm')}</button></div></div>`;
    }).join('') : U.empty({ icon: 'shopping-basket', title: 'Panier vide', text: 'Cliquez sur un service pour l’ajouter.', hint: false });
    const rate = app().myRole().commission;
    root.querySelector('#cartSum').innerHTML = `<div class="sum">
        <div class="sum-row"><span>Commission${rate ? ` (${rate}%)` : ''} :</span><b>${money(q.commission)}</b></div>
        <div class="sum-row"><span>Prix usine :</span><b>${money(q.factory)}</b></div>
        <div class="sum-row"><span>Sous-total :</span><b>${money(q.subtotal)}</b></div>
        <div class="sum-row click ${q.discount ? 'neg' : ''}" data-act="discount" title="Appliquer / modifier une réduction"><span>Réduction${P.discount ? ` (${P.discount.type === 'percent' ? P.discount.value + '%' : 'fixe'})` : ''} :</span><span><b>${q.discount ? '-' : ''}${money(q.discount)}</b><span class="edit">${icon('pencil', 'xs')}</span></span></div>
        <div class="sum-row click" data-act="markup" title="Appliquer / modifier une majoration"><span>Majoration${P.markup ? ` (${P.markup.type === 'percent' ? P.markup.value + '%' : 'fixe'})` : ''} :</span><span><b>${money(q.markup)}</b><span class="edit">${icon('pencil', 'xs')}</span></span></div>
      </div><div class="sum-total"><span>Total :</span><b>${money(q.total)}</b></div>`;
    root.querySelector('[data-act="checkout"]').disabled = !q.items.length;
    paint();
  }

  /* ---------- actions panier ---------- */
  function add(id, cardEl) {
    const p = app().product(id);
    if (!p) return;
    const st = available(p);
    if (st != null && inCart(id) + 1 > st) { U.toast(`Stock insuffisant pour ${p.name}`, 'warn'); return; }
    const l = P.cart.find(x => x.productId === id);
    if (l) l.qty++; else P.cart.push({ productId: id, qty: 1 });
    P.sel = id;
    persist(); drawCart(); drawGrid();
    const c = root && root.querySelector(`.prod[data-id="${id}"]`) || cardEl;
    if (c) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
  }
  function setQty(id, d) {
    const l = P.cart.find(x => x.productId === id);
    if (!l) return;
    if (d > 0) { const st = available(app().product(id)); if (st != null && l.qty + 1 > st) { U.toast('Stock insuffisant', 'warn'); return; } }
    l.qty += d;
    if (l.qty <= 0) remove(id); else { P.sel = id; persist(); drawCart(); drawGrid(); }
  }
  function remove(id) {
    P.cart = P.cart.filter(x => x.productId !== id);
    if (P.sel === id) P.sel = P.cart.length ? P.cart[P.cart.length - 1].productId : null;
    persist(); drawCart(); drawGrid();
  }
  function reset() { P.cart = []; P.sel = null; P.discount = null; P.markup = null; P.customerId = null; P.cq = ''; P.vehicle = noVehicle(); persist(); }

  /* ---------- modales ---------- */
  function adjustModal(kind) {
    const isD = kind === 'discount', cur = P[kind], co = S().company;
    if (isD && !app().can(['pos.discount', 'pos.discount.unlimited'])) return U.toast("Vous n'avez pas les permissions nécessaires pour appliquer une réduction", 'error');
    if (!isD && !app().can('pos.markup')) return U.toast("Vous n'avez pas les permissions nécessaires pour appliquer une majoration", 'error');
    const reasons = isD ? co.discountReasons : co.markupReasons;
    const m = U.form({
      title: isD ? 'Réduction' : 'Majoration', icon: 'percent', size: 'sm', submit: 'Appliquer',
      intro: isD && !app().can('pos.discount.unlimited') ? `<div class="alert info" style="margin-bottom:12px">${icon('info')}<span>Plafond pour votre grade : <b>${co.maxDiscountPct}%</b> du sous-total.</span></div>` : '',
      values: { type: cur ? cur.type : 'percent', value: cur ? cur.value : (isD ? 10 : ''), reason: cur ? cur.reason : (reasons[0] || '') },
      fields: [
        { name: 'type', label: 'Type', type: 'select', options: [{ value: 'percent', label: 'Pourcentage (%)' }, { value: 'fixed', label: 'Montant fixe ($)' }], full: true },
        { name: 'value', label: 'Valeur', type: 'number', min: 0, step: '0.01', required: true, full: true },
        { name: 'reason', label: 'Motif', required: true, full: true, attrs: `list="adjReasons"` }
      ],
      extraFoot: cur ? `<button class="btn danger" data-remove>${icon('x')}Retirer</button>` : '',
      onSubmit: v => {
        if (!(v.value > 0)) { U.toast('Valeur invalide', 'error'); return false; }
        if (v.type === 'percent' && v.value > 100) { U.toast('Le pourcentage ne peut pas dépasser 100%', 'error'); return false; }
        const sub = quote().subtotal, amount = v.type === 'percent' ? sub * v.value / 100 : v.value;
        if (isD && !app().can('pos.discount.unlimited') && sub && amount / sub * 100 > co.maxDiscountPct + 1e-9) { U.toast(`Réduction limitée à ${co.maxDiscountPct}% pour votre grade`, 'error'); return false; }
        P[kind] = { type: v.type, value: v.value, reason: v.reason };
        persist(); drawCart();
        U.toast(isD ? 'Réduction appliquée' : 'Majoration appliquée');
      }
    });
    m.el.querySelector('form').insertAdjacentHTML('beforeend', `<datalist id="adjReasons">${reasons.map(r => `<option value="${esc(r)}">`).join('')}</datalist>`);
    const rm = m.el.querySelector('[data-remove]');
    if (rm) rm.onclick = () => { P[kind] = null; persist(); drawCart(); m.close(); U.toast(isD ? 'Réduction retirée' : 'Majoration retirée'); };
  }

  /* Enregistrer : la vente part directement (pas de fenêtre de confirmation ni de reçu) */
  let saving = false;
  async function checkout() {
    if (saving) return;
    const q = quote();
    if (!q.items.length) return U.toast('Le panier est vide', 'warn');
    const pa = partner();
    if (cartNeedsVehicle() && !P.vehicle.cls) { U.toast('Choisissez la catégorie du véhicule (1 à 5) dans le panier', 'error'); drawCart(); return; }
    const veh = cartNeedsVehicle() || P.vehicle.plate ? P.vehicle : null;
    const mode = LSCServer.saleMode(S(), pa); // même règle que le serveur : partenaire -> à facturer, sinon paiement direct
    const btn = root.querySelector('[data-act="checkout"]');
    saving = true; if (btn) btn.disabled = true;
    const r = await app().call('pos.createSale', { items: P.cart, partnerId: P.partnerId || null, payment: mode.payment, discount: P.discount, markup: P.markup, note: '',
      vehicle: veh ? { plate: veh.plate, class: veh.cls, source: veh.source === 'manual' ? 'manual' : 'auto', model: (vehSel(veh) || {}).model || veh.model, name: (vehSel(veh) || {}).name } : null });
    saving = false;
    if (!r.ok) { if (btn) btn.disabled = false; return; }
    const sale = r.data.sale;
    reset(); app().render();
    U.toast(`Vente #${sale.ref} enregistrée · ${money(sale.total)}${sale.status === 'pending' ? ' · à facturer à ' + (sale.partnerName || 'partenaire') : ''}`);
  }

  /* ---------- événements ---------- */
  function bind() {
    root.querySelector('#posCats').onclick = e => { const b = e.target.closest('[data-cat]'); if (!b) return; P.cat = b.dataset.cat; P.sub = 'all'; drawGrid(); drawCart(); };
    root.querySelector('#posSubs').onclick = e => { const b = e.target.closest('[data-subtab]'); if (b) { P.sub = b.dataset.subtab; drawGrid(); } };
    root.querySelector('#posGrid').onclick = e => {
      const ed = e.target.closest('[data-edit]'), ce = e.target.closest('[data-catedit]'), cd = e.target.closest('[data-catdel]');
      const sn = e.target.closest('[data-subnew]'), se = e.target.closest('[data-subedit]'), sd = e.target.closest('[data-subdel]'), vc = e.target.closest('[data-vclass]');
      if (vc) return setClass(+vc.dataset.vclass, 'manual');
      if (sn) return subForm(sn.dataset.subnew, null);
      if (se) return subForm(...se.dataset.subedit.split('|'));
      if (sd) return subDelete(...sd.dataset.subdel.split('|'));
      if (ce) return catForm(ce.dataset.catedit);
      if (cd) return catDelete(cd.dataset.catdel);
      if (ed) { e.stopPropagation(); LSC.forms.product(ed.dataset.edit); return; }
      const c = e.target.closest('.prod');
      if (c) { if (P.edit) LSC.forms.product(c.dataset.id); else add(c.dataset.id, c); }
    };
    root.querySelector('.page-head .actions').onclick = e => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'edit') { P.edit = !P.edit; render(root); }
      else if (a.dataset.act === 'newCat') catForm(null);
      else if (a.dataset.act === 'newProduct') LSC.forms.product(null, P.cat !== 'all' ? { category: P.cat, sub: P.sub !== 'all' ? P.sub : '' } : null);
    };
    bindDnd();
    root.querySelector('#cartLines').onclick = e => {
      const inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]'), del = e.target.closest('[data-del]'), line = e.target.closest('[data-line]');
      if (inc) setQty(inc.dataset.inc, 1); else if (dec) setQty(dec.dataset.dec, -1); else if (del) remove(del.dataset.del);
      else if (line) { P.sel = line.dataset.line; root.querySelectorAll('.cart-line').forEach(l => l.classList.toggle('sel', l === line)); }
    };
    const right = root.querySelector('.pos-right');
    right.addEventListener('input', e => {
      if (e.target.id !== 'vehPlate') return;
      P.vehicle.plate = e.target.value.toUpperCase(); P.vehicle.known = null; P.vehicle.info = null; P.vehicle.unlisted = null; persist();
      clearTimeout(plateTimer);
      if (P.vehicle.plate.trim().length >= 3) plateTimer = setTimeout(() => lookupPlate(true), 700);
    });
    right.addEventListener('keydown', e => { if (e.target.id === 'vehPlate' && e.key === 'Enter') lookupPlate(); });
    right.addEventListener('change', e => {
      if (e.target.id !== 'vehModel' || !P.vehicle.info) return;
      P.vehicle.info.sel = e.target.value === '' ? null : +e.target.value;
      if (P.vehicle.source !== 'manual') P.vehicle.cls = null;
      vehicleClass(P.vehicle.plate.trim().toUpperCase(), true);
    });
    right.addEventListener('click', e => {
      const vc = e.target.closest('[data-vclass]');
      if (vc) return setClass(+vc.dataset.vclass, 'manual');
      if (e.target.closest('[data-act="vehLookup"]')) return lookupPlate();
      if (e.target.closest('[data-act="vehClear"]')) { P.vehicle = noVehicle(); persist(); drawCart(); drawGrid(); }
    });
    right.addEventListener('click', e => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'clear') { if (!P.cart.length && !P.discount && !P.markup) return; reset(); drawCart(); drawGrid(); U.toast('Panier vidé'); }
      else if (act === 'checkout') checkout();
      else if (act === 'discount' || act === 'markup') adjustModal(act);
    });
    const ts = document.getElementById('topSearch');
    if (ts && ts.value !== P.q) ts.value = P.q;
  }

  LSC.pages.pos = {
    render,
    partnerId: () => P.partnerId,
    setQuery(q) { P.q = q || ''; drawGrid(); },
    setPartner(id) { P.partnerId = id || ''; persist(); drawGrid(); drawCart(); if (id) U.toast('Tarifs partenaire appliqués'); },
    setCustomer(id) { P.customerId = id; P.cq = ''; persist(); },
    /* appelé par FiveM (plaque du véhicule proche) ou plus tard par l'API véhicules */
    setVehicle(v) {
      if (!v) return;
      if (v.plate) P.vehicle.plate = String(v.plate).trim().toUpperCase();
      /* en jeu : catégorie d'après la liste des modèles ; modèle non recensé = à vérifier (pas de choix automatique) */
      const co = (LSC.app.state || {}).company || {}, model = String(v.model || '').toLowerCase(), key = LSCServer.vkey(model), t = co.modelClasses || {};
      let n = Math.floor(+v.class);
      P.vehicle.unlisted = null;
      if (!(n >= 1 && n <= 5) && key) {
        if (key in t) { n = t[key]; if (n === 0) P.vehicle.unlisted = { none: true, model }; }
        else {
          const g = v.gtaClass != null ? (co.gtaClasses || [])[+v.gtaClass] : null;
          P.vehicle.unlisted = { model, hint: g || null, gtaClass: v.gtaClass };
          if (LSC.app.state) reportVehicle(P.vehicle.unlisted);
        }
      }
      P.vehicle.model = model || P.vehicle.model;
      if (n >= 1 && n <= 5) { P.vehicle.cls = n; P.vehicle.source = 'auto'; }
      persist();
      if (root && document.body.contains(root.querySelector('.pos'))) { drawCart(); drawGrid(); }
      /* catégorie inconnue : recherche par plaque (attend la fin du chargement si besoin) */
      let tries = 0;
      const go = () => { if (LSC.app.state) lookupPlate().catch(() => {}); else if (tries++ < 15) setTimeout(go, 400); };
      if (P.vehicle.plate && !(n >= 1 && n <= 5) && !P.vehicle.unlisted) go();
    },
    checkout,
    removeSelected() { if (P.sel) { const p = app().product(P.sel); remove(P.sel); if (p) U.toast(p.name + ' retiré du panier'); } }
  };
})();
