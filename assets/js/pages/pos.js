import { supabase } from "../supabaseClient.js";
import { requireSession } from "../auth.js";
import { mountShell, mountTopbar } from "../sidebar.js";
import { $, $$, el, toast, formatMoney, escapeHtml, debounce, openModal, closeModal, confirmDialog } from "../ui.js";

const session = await requireSession({ permission: "pos.access" });
mountShell({ session });
mountTopbar({ session });

const CAT_PERM = { services: "pos.services", ventes: "pos.ventes", customs: "pos.customs", peinture: "pos.peinture" };
const canEdit = session.can("company.manage_settings");

let categories = [];
let products = [];
let tags = [];
let partners = [];
let activeCatId = null;
let searchTerm = "";
let editMode = false;
let cart = []; // { productId, name, price, cost, taxRate, directPayout, qty }
let adjustment = 0; // + markup / - discount

if (canEdit) {
  const toolbar = $(".pos-toolbar");
  const editBtn = el(`<button class="btn btn-outline btn-sm" id="edit-toggle">✎ Éditer</button>`);
  const addBtn = el(`<button class="btn btn-accent btn-sm" id="add-product-btn" style="display:none;">＋ Produit</button>`);
  const tagBtn = el(`<button class="btn btn-outline btn-sm" id="manage-tags-btn" style="display:none;">🏷️ Étiquettes</button>`);
  toolbar.appendChild(editBtn);
  toolbar.appendChild(addBtn);
  toolbar.appendChild(tagBtn);
  editBtn.addEventListener("click", () => {
    editMode = !editMode;
    editBtn.textContent = editMode ? "✓ Terminer" : "✎ Éditer";
    editBtn.classList.toggle("btn-accent", editMode);
    editBtn.classList.toggle("btn-outline", !editMode);
    addBtn.style.display = editMode ? "inline-flex" : "none";
    tagBtn.style.display = editMode ? "inline-flex" : "none";
    renderProducts();
  });
  addBtn.addEventListener("click", () => productModal(null));
  tagBtn.addEventListener("click", () => manageTagsModal());
}

async function loadAll() {
  const [{ data: cats }, { data: prods }, { data: tgs }, { data: parts }] = await Promise.all([
    supabase.from("product_categories").select("*").eq("company_id", session.company.id).order("position"),
    supabase.from("products").select("*").eq("company_id", session.company.id).eq("active", true).order("position"),
    supabase.from("product_tags").select("*").eq("company_id", session.company.id),
    supabase.from("partners").select("*").eq("company_id", session.company.id).eq("active", true).order("name"),
  ]);

  categories = (cats || []).filter((c) => session.can(CAT_PERM[c.key] || "pos.access"));
  products = prods || [];
  tags = tgs || [];
  partners = parts || [];

  if (!categories.length) {
    $("#cat-tabs").innerHTML = `<span class="muted" style="font-size:13px;">Aucune catégorie accessible avec ton rôle actuel.</span>`;
    $("#product-zone").innerHTML = "";
    return;
  }

  const prevActive = activeCatId;
  $("#cat-tabs").innerHTML = "";
  categories.forEach((c, i) => {
    const isActive = prevActive ? c.id === prevActive : i === 0;
    const btn = el(`<button class="tab-btn${isActive ? " active" : ""}" data-id="${c.id}">${c.icon || ""} ${escapeHtml(c.label)}</button>`);
    btn.addEventListener("click", () => {
      $$(".tab-btn", $("#cat-tabs")).forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeCatId = c.id;
      renderProducts();
    });
    $("#cat-tabs").appendChild(btn);
  });
  activeCatId = prevActive && categories.some((c) => c.id === prevActive) ? prevActive : categories[0].id;
  renderProducts();

  const psel = $("#partner-select");
  const keepPartner = psel.value;
  psel.innerHTML = `<option value="">Aucun partenaire</option>`;
  partners.forEach((p) => psel.appendChild(el(`<option value="${p.id}">${escapeHtml(p.name)} (${p.commission_rate}%)</option>`)));
  psel.value = keepPartner;
  const hint = $("#no-partner-hint");
  if (hint) hint.style.display = partners.length ? "none" : "block";
}
loadAll();

$("#partner-select").addEventListener("change", renderCart);
$("#product-search").addEventListener("input", debounce((e) => { searchTerm = e.target.value.toLowerCase(); renderProducts(); }, 150));

function renderProducts() {
  const zone = $("#product-zone");
  let list = products.filter((p) => p.category_id === activeCatId && p.name.toLowerCase().includes(searchTerm));

  if (!list.length && !editMode) {
    zone.innerHTML = `<div class="empty-state"><div class="icon">📦</div><h4>Aucun produit</h4><p>${canEdit ? "Clique sur \"Éditer\" pour en ajouter." : "Ajoute des produits depuis Mon entreprise ▸ Paramètres."}</p></div>`;
    return;
  }

  const subGroups = {};
  list.forEach((p) => { const key = p.sub_category || ""; (subGroups[key] ||= []).push(p); });

  // Built as one HTML string (instead of many individual DOM inserts) so
  // switching categories stays instant even with large catalogues.
  let html = "";
  Object.keys(subGroups).sort().forEach((key) => {
    if (key) html += `<div class="sub-group-label">${escapeHtml(key)}</div>`;
    html += `<div class="product-grid">`;
    subGroups[key].forEach((p) => {
      html += `
        <div class="product-card" data-id="${p.id}" style="position:relative;">
          ${editMode ? `<div style="position:absolute;top:6px;right:6px;display:flex;gap:4px;">
            <button data-edit-prod="${p.id}" class="icon-btn btn-icon-only" title="Modifier" style="width:24px;height:24px;background:var(--c-surface);">✎</button>
            <button data-del-prod="${p.id}" class="icon-btn btn-icon-only" title="Supprimer" style="width:24px;height:24px;background:var(--c-surface);">✕</button>
          </div>` : ""}
          <div class="emoji">${p.image_emoji || "🔧"}</div>
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="price">${formatMoney(p.price)}${p.direct_payout === false ? ' <span class="faint" title="Salaire">🏦</span>' : ""}${Number(p.tax_rate) > 0 ? ` <span class="faint" title="Taxe ${p.tax_rate}%">📊</span>` : ""}</div>
        </div>
      `;
    });
    html += `</div>`;
  });
  zone.innerHTML = html;
}

// One delegated listener, attached once, handles every product card click
// for the lifetime of the page — no per-card listeners to create/destroy.
$("#product-zone").addEventListener("click", (e) => {
  const editBtn = e.target.closest("[data-edit-prod]");
  if (editBtn) { productModal(products.find((p) => p.id === editBtn.dataset.editProd)); return; }
  const delBtn = e.target.closest("[data-del-prod]");
  if (delBtn) {
    confirmDialog("Supprimer ce produit ?", async () => {
      await supabase.from("products").delete().eq("id", delBtn.dataset.delProd);
      toast("Produit supprimé");
      loadAll();
    });
    return;
  }
  const card = e.target.closest(".product-card");
  if (!card) return;
  const p = products.find((x) => x.id === card.dataset.id);
  if (!p) return;
  if (editMode) productModal(p); else addToCart(p);
});

function productModal(prod) {
  const catTags = tags.filter((t) => t.category_id === activeCatId);
  openModal({
    title: prod ? "Modifier le produit" : "Nouveau produit",
    wide: true,
    bodyHtml: `
      <div class="field"><label>Nom</label><input class="input" id="pm-name" value="${prod ? escapeHtml(prod.name) : ""}" /></div>
      <div class="form-grid">
        <div class="field"><label>Étiquette</label>
          <select class="input" id="pm-tag">
            <option value="">Aucune</option>
            ${catTags.map((t) => `<option value="${escapeHtml(t.label)}" ${prod?.sub_category === t.label ? "selected" : ""}>${escapeHtml(t.label)}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>Icône (emoji)</label><input class="input" id="pm-emoji" value="${prod ? prod.image_emoji || "🔧" : "🔧"}" /></div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Prix ($, 0 = gratuit)</label><input class="input" id="pm-price" type="number" step="0.01" value="${prod ? prod.price : 0}" /></div>
        <div class="field"><label>Prix usine ($, 0 = aucun)</label><input class="input" id="pm-cost" type="number" step="0.01" value="${prod ? prod.cost_price : 0}" /></div>
      </div>
      <div class="field"><label>Taux de taxe / charge société (%, 0 = aucune)</label><input class="input" id="pm-tax" type="number" step="0.1" min="0" max="100" value="${prod ? prod.tax_rate : 0}" /></div>
      <label class="flex-center" style="font-size:13px;font-weight:600;">
        <input type="checkbox" id="pm-direct" ${!prod || prod.direct_payout !== false ? "checked" : ""}/>
        Paiement direct à l'employé (compte dans son chiffre d'affaires, pas dans son salaire à verser)
      </label>
      <p class="faint" style="font-size:11.5px;">Décoche si l'argent reste dans la caisse de l'entreprise plutôt que d'aller directement à l'employé — dans ce cas ça sera à ajouter à son salaire.</p>
    `,
    footHtml: `<button class="btn btn-outline" data-close-modal>Annuler</button><button class="btn btn-accent" id="pm-save">Enregistrer</button>`,
    onMount: (m) => {
      $("#pm-save", m).addEventListener("click", async () => {
        const payload = {
          category_id: activeCatId,
          name: $("#pm-name", m).value.trim(),
          sub_category: $("#pm-tag", m).value || null,
          image_emoji: $("#pm-emoji", m).value.trim() || "🔧",
          price: Number($("#pm-price", m).value) || 0,
          cost_price: Number($("#pm-cost", m).value) || 0,
          tax_rate: Number($("#pm-tax", m).value) || 0,
          direct_payout: $("#pm-direct", m).checked,
        };
        if (!payload.name) return toast("Nom requis", "error");
        const { error } = prod
          ? await supabase.from("products").update(payload).eq("id", prod.id)
          : await supabase.from("products").insert({ ...payload, company_id: session.company.id, position: 99 });
        if (error) return toast(error.message, "error");
        toast("Enregistré");
        closeModal();
        loadAll();
      });
    },
  });
}

function manageTagsModal() {
  const render = (m) => {
    const catTags = tags.filter((t) => t.category_id === activeCatId);
    $("#tags-list", m).innerHTML = catTags.length
      ? catTags.map((t) => `
        <div class="cart-line" data-tag="${t.id}">
          <div class="info"><input class="input" data-rename="${t.id}" value="${escapeHtml(t.label)}" style="padding:6px 8px;font-size:13px;" /></div>
          <button class="icon-btn btn-icon-only" data-del-tag="${t.id}" style="width:26px;height:26px;">✕</button>
        </div>
      `).join("")
      : `<p class="faint" style="font-size:12.5px;">Aucune étiquette pour cette catégorie.</p>`;

    $$("[data-rename]", m).forEach((inp) => inp.addEventListener("change", async () => {
      const tag = tags.find((t) => t.id === inp.dataset.rename);
      const newLabel = inp.value.trim();
      if (!newLabel || newLabel === tag.label) return;
      const oldLabel = tag.label;
      await supabase.from("product_tags").update({ label: newLabel }).eq("id", tag.id);
      await supabase.from("products").update({ sub_category: newLabel })
        .eq("company_id", session.company.id).eq("category_id", activeCatId).eq("sub_category", oldLabel);
      toast("Étiquette renommée");
      await loadAll();
      render(m);
    }));
    $$("[data-del-tag]", m).forEach((b) => b.addEventListener("click", () => confirmDialog("Supprimer cette étiquette ? (les produits qui l'utilisent restent, juste sans étiquette)", async () => {
      const tag = tags.find((t) => t.id === b.dataset.delTag);
      await supabase.from("product_tags").delete().eq("id", tag.id);
      await supabase.from("products").update({ sub_category: null })
        .eq("company_id", session.company.id).eq("category_id", activeCatId).eq("sub_category", tag.label);
      toast("Étiquette supprimée");
      await loadAll();
      render(m);
    })));
  };

  const m = openModal({
    title: "Gérer les étiquettes",
    bodyHtml: `
      <div class="field"><label>Nouvelle étiquette</label>
        <div style="display:flex;gap:8px;">
          <input class="input" id="new-tag-input" placeholder="Ex: Éclairage" />
          <button class="btn btn-accent btn-sm" id="new-tag-btn">Ajouter</button>
        </div>
      </div>
      <div id="tags-list" class="mt-8"></div>
    `,
    footHtml: `<button class="btn btn-outline" data-close-modal>Fermer</button>`,
  });
  $("#new-tag-btn", m).addEventListener("click", async () => {
    const label = $("#new-tag-input", m).value.trim();
    if (!label) return;
    const { error } = await supabase.from("product_tags").insert({ company_id: session.company.id, category_id: activeCatId, label });
    if (error) return toast(error.message, "error");
    $("#new-tag-input", m).value = "";
    await loadAll();
    render(m);
  });
  render(m);
}

function addToCart(p) {
  const line = cart.find((l) => l.productId === p.id);
  if (line) line.qty += 1;
  else cart.push({
    productId: p.id, name: p.name, price: Number(p.price), cost: Number(p.cost_price),
    taxRate: Number(p.tax_rate || 0), directPayout: p.direct_payout !== false, qty: 1,
  });
  renderCart();
}

function renderCart() {
  const wrap = $("#cart-lines");
  if (!cart.length) {
    wrap.innerHTML = `<div class="empty-state" style="padding:26px 10px;"><div class="icon">🛒</div><p>Le panier est vide</p></div>`;
  } else {
    wrap.innerHTML = "";
    cart.forEach((l, i) => {
      wrap.appendChild(el(`
        <div class="cart-line">
          <div class="info"><div class="n">${escapeHtml(l.name)}</div><div class="p">${formatMoney(l.price)} / unité</div></div>
          <div class="qty-ctrl">
            <button data-dec="${i}">−</button><span>${l.qty}</span><button data-inc="${i}">+</button>
          </div>
          <button class="icon-btn btn-icon-only" data-rm="${i}" style="width:26px;height:26px;">✕</button>
        </div>
      `));
    });
    $$("[data-inc]", wrap).forEach((b) => b.addEventListener("click", () => { cart[+b.dataset.inc].qty++; renderCart(); }));
    $$("[data-dec]", wrap).forEach((b) => b.addEventListener("click", () => {
      const idx = +b.dataset.dec; cart[idx].qty--; if (cart[idx].qty <= 0) cart.splice(idx, 1); renderCart();
    }));
    $$("[data-rm]", wrap).forEach((b) => b.addEventListener("click", () => { cart.splice(+b.dataset.rm, 1); renderCart(); }));
  }

  const { subtotal, cost, taxTotal, payableTotal } = computeTotals();
  const partnerId = $("#partner-select").value;
  const partner = partners.find((p) => p.id === partnerId);
  const commission = partner ? subtotal * (Number(partner.commission_rate) / 100) : 0;
  const total = subtotal + adjustment;

  $("#cart-commission").textContent = formatMoney(commission);
  $("#cart-cost").textContent = formatMoney(cost);
  $("#cart-total").textContent = formatMoney(total);
  $("#cart-sub").textContent = adjustment !== 0
    ? `${adjustment > 0 ? "Majoration" : "Réduction"} de ${formatMoney(Math.abs(adjustment))} appliquée`
    : "Nouvelle commande";

  let extraRow = $("#cart-extra-rows");
  if (extraRow) extraRow.remove();
  const rows = [];
  if (taxTotal > 0) rows.push(`<div class="kv-row"><span class="k">Taxes (part société) :</span><span class="v">${formatMoney(taxTotal)}</span></div>`);
  if (payableTotal < subtotal) rows.push(`<div class="kv-row"><span class="k">Dont part salaire employé :</span><span class="v">${formatMoney(payableTotal)}</span></div>`);
  if (rows.length) {
    extraRow = el(`<div id="cart-extra-rows">${rows.join("")}</div>`);
    $("#cart-cost").closest(".kv-row").after(extraRow);
  }
}
renderCart();

function computeTotals() {
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const cost = cart.reduce((s, l) => s + l.cost * l.qty, 0);
  const taxTotal = cart.reduce((s, l) => s + (l.price * l.qty) * (l.taxRate / 100), 0);
  const payableTotal = cart.reduce((s, l) => s + (l.directPayout ? 0 : l.price * l.qty), 0);
  return { subtotal, cost, taxTotal, payableTotal };
}

function adjustModal(kind) {
  openModal({
    title: kind === "discount" ? "Appliquer une réduction" : "Appliquer une majoration",
    bodyHtml: `
      <div class="field"><label>Type</label>
        <select class="input" id="adj-type"><option value="percent">Pourcentage (%)</option><option value="fixed">Montant fixe ($)</option></select>
      </div>
      <div class="field"><label>Valeur (0 = aucune)</label><input class="input" id="adj-value" type="number" min="0" step="0.01" placeholder="0" /></div>
    `,
    footHtml: `<button class="btn btn-outline" data-close-modal>Annuler</button><button class="btn btn-accent" id="adj-apply">Appliquer</button>`,
    onMount: (m) => {
      $("#adj-apply", m).addEventListener("click", () => {
        const val = Number($("#adj-value", m).value) || 0;
        const type = $("#adj-type", m).value;
        const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
        const amount = type === "percent" ? subtotal * (val / 100) : val;
        adjustment = kind === "discount" ? -Math.abs(amount) : Math.abs(amount);
        renderCart();
        closeModal();
      });
    },
  });
}
$("#discount-btn").addEventListener("click", () => {
  if (!session.can("pos.discount")) return toast("Permission 'Appliquer une réduction' requise", "error");
  adjustModal("discount");
});
$("#markup-btn").addEventListener("click", () => {
  if (!session.can("pos.markup")) return toast("Permission 'Appliquer une majoration' requise", "error");
  adjustModal("markup");
});

$("#clear-cart").addEventListener("click", () => { cart = []; adjustment = 0; $("#plate-input").value = ""; $("#plate-result").style.display = "none"; renderCart(); });

$("#plate-lookup-btn").addEventListener("click", async () => {
  const plate = $("#plate-input").value.trim();
  if (!plate) return;
  const box = $("#plate-result");
  box.style.display = "block";
  box.innerHTML = `<p class="faint" style="font-size:12px;margin-top:6px;">Recherche...</p>`;
  try {
    const r = await fetch(`/api/vehicle-lookup?plate=${encodeURIComponent(plate)}`);
    const data = await r.json();
    if (!r.ok) {
      box.innerHTML = `<p class="faint" style="font-size:12px;margin-top:6px;">${escapeHtml(data.error || "Véhicule introuvable")}</p>`;
      return;
    }
    box.innerHTML = `
      <div class="copy-field" style="margin-top:8px;padding:10px 12px;">
        <div class="txt">
          <strong>${escapeHtml(data.name || data.model || "Véhicule")}</strong><br/>
          Propriétaire : ${escapeHtml(data.owner?.name || "Inconnu")}
          ${data.illegal ? '<div class="badge badge-danger mt-4" style="display:inline-flex;">Illégal</div>' : ""}
        </div>
      </div>
    `;
  } catch (e) {
    box.innerHTML = `<p class="faint" style="font-size:12px;margin-top:6px;">Erreur de connexion à l'API véhicules</p>`;
  }
});

$("#save-cart").addEventListener("click", async () => {
  if (!cart.length) return toast("Le panier est vide", "error");
  const btn = $("#save-cart");
  btn.disabled = true; btn.textContent = "Enregistrement...";
  try {
    const { subtotal, cost, taxTotal, payableTotal } = computeTotals();
    const partnerId = $("#partner-select").value || null;
    const partner = partners.find((p) => p.id === partnerId);
    const commission = partner ? subtotal * (Number(partner.commission_rate) / 100) : 0;
    const total = subtotal + adjustment;

    const { data: sale, error } = await supabase.from("sales").insert({
      company_id: session.company.id, employee_id: session.employee?.id || null,
      partner_id: partnerId, plate: $("#plate-input").value.trim() || null,
      subtotal, adjustment, commission, cost_total: cost, tax_total: taxTotal, payable_total: payableTotal, total,
    }).select().single();
    if (error) throw error;

    const items = cart.map((l) => ({
      sale_id: sale.id, product_id: l.productId, name_snap: l.name, price_snap: l.price, cost_snap: l.cost,
      tax_rate_snap: l.taxRate, direct_payout_snap: l.directPayout, qty: l.qty,
    }));
    const { error: itemsErr } = await supabase.from("sale_items").insert(items);
    if (itemsErr) throw itemsErr;

    toast("Vente enregistrée");
    cart = []; adjustment = 0; $("#plate-input").value = ""; $("#partner-select").value = ""; $("#plate-result").style.display = "none";
    renderCart();
  } catch (e) {
    toast(e.message || "Erreur lors de l'enregistrement", "error");
  }
  btn.disabled = false; btn.textContent = "Enregistrer";
});
