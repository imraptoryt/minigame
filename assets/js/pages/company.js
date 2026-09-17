import { supabase } from "../supabaseClient.js";
import { requireSession } from "../auth.js";
import { mountShell, mountTopbar } from "../sidebar.js";
import { $, $$, el, toast, formatMoney, formatDate, escapeHtml, openModal, closeModal, confirmDialog } from "../ui.js";
import { getTheme, applyTheme, ACCENTS, RADII, saveCompanyTheme } from "../theme.js";

const session = await requireSession();
const TABS = [
  { key: "inventory", label: "Inventaire & Production", perm: "company.manage_inventory" },
  { key: "partners", label: "Gestion partenaires", perm: "company.manage_partners" },
  { key: "bank", label: "Compte bancaire", perm: "company.manage_bank" },
  { key: "settings", label: "Paramètres", perm: "company.manage_settings" },
];
const allowed = TABS.filter((t) => session.can(t.perm));
mountShell({ session, defaultTab: allowed[0]?.key || "inventory" });
mountTopbar({ session });

if (!allowed.length) {
  $("#co-tabs").style.display = "none";
  $("#co-body").innerHTML = emptyState("🔒", "Accès refusé", "Aucune permission entreprise ne t'a été attribuée.");
} else {
  let tab = new URLSearchParams(location.search).get("tab") || allowed[0].key;
  if (!allowed.some((t) => t.key === tab)) tab = allowed[0].key;
  $("#co-tabs").innerHTML = allowed.map((t) => `<button class="tab-btn${t.key === tab ? " active" : ""}" data-k="${t.key}">${t.label}</button>`).join("");
  $$("[data-k]", $("#co-tabs")).forEach((b) => b.addEventListener("click", () => { window.location.search = "?tab=" + b.dataset.k; }));
  render(tab);
}

function render(tab) {
  $("#add-btn").style.display = "none";
  if (tab === "inventory") return renderInventory();
  if (tab === "partners") return renderPartners();
  if (tab === "bank") return renderBank();
  if (tab === "settings") return renderSettings();
}
function emptyState(icon, title, sub) { return `<div class="card"><div class="empty-state"><div class="icon">${icon}</div><h4>${title}</h4><p>${sub}</p></div></div>`; }

// ---- Inventaire & Production ---------------------------------------------------
async function renderInventory() {
  $("#tab-sub").textContent = "Stock et cadence de production";
  $("#add-btn").style.display = "inline-flex"; $("#add-btn").onclick = () => inventoryModal();

  const { data } = await supabase.from("inventory_items").select("*").eq("company_id", session.company.id).order("name");
  const body = $("#co-body");
  if (!data?.length) { body.innerHTML = emptyState("📦", "Inventaire vide", "Ajoute une pièce ou une matière première."); return; }

  body.innerHTML = `<div class="card"><div class="table-wrap"><table class="data">
    <thead><tr><th>Article</th><th>Catégorie</th><th class="num">Quantité</th><th>Unité</th><th class="num">Production / jour</th><th></th></tr></thead>
    <tbody>${data.map((i) => `
      <tr>
        <td><strong>${escapeHtml(i.name)}</strong></td>
        <td class="faint">${escapeHtml(i.category)}</td>
        <td class="num">${i.quantity}</td>
        <td class="faint">${escapeHtml(i.unit)}</td>
        <td class="num">${i.production_rate}</td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="icon-btn btn-icon-only" data-edit="${i.id}" style="width:30px;height:30px;">✎</button>
          <button class="icon-btn btn-icon-only" data-del="${i.id}" style="width:30px;height:30px;">✕</button>
        </td>
      </tr>
    `).join("")}</tbody>
  </table></div></div>`;

  $$("[data-edit]", body).forEach((b) => b.addEventListener("click", () => inventoryModal(data.find((i) => i.id === b.dataset.edit))));
  $$("[data-del]", body).forEach((b) => b.addEventListener("click", () => confirmDialog("Supprimer cet article ?", async () => {
    await supabase.from("inventory_items").delete().eq("id", b.dataset.del);
    toast("Supprimé"); renderInventory();
  })));
}
function inventoryModal(item = null) {
  openModal({
    title: item ? "Modifier l'article" : "Nouvel article",
    bodyHtml: `
      <div class="field"><label>Nom</label><input class="input" id="inv-name" value="${item ? escapeHtml(item.name) : ""}" /></div>
      <div class="form-grid">
        <div class="field"><label>Catégorie</label><input class="input" id="inv-cat" value="${item ? escapeHtml(item.category) : "Général"}" /></div>
        <div class="field"><label>Unité</label><input class="input" id="inv-unit" value="${item ? escapeHtml(item.unit) : "unité"}" /></div>
        <div class="field"><label>Quantité</label><input class="input" id="inv-qty" type="number" step="0.01" value="${item ? item.quantity : 0}" /></div>
        <div class="field"><label>Production / jour</label><input class="input" id="inv-rate" type="number" step="0.01" value="${item ? item.production_rate : 0}" /></div>
      </div>
    `,
    footHtml: `<button class="btn btn-outline" data-close-modal>Annuler</button><button class="btn btn-accent" id="inv-save">Enregistrer</button>`,
    onMount: (m) => {
      $("#inv-save", m).addEventListener("click", async () => {
        const payload = {
          name: $("#inv-name", m).value.trim(), category: $("#inv-cat", m).value.trim() || "Général",
          unit: $("#inv-unit", m).value.trim() || "unité", quantity: Number($("#inv-qty", m).value) || 0,
          production_rate: Number($("#inv-rate", m).value) || 0,
        };
        if (!payload.name) return toast("Nom requis", "error");
        const { error } = item
          ? await supabase.from("inventory_items").update(payload).eq("id", item.id)
          : await supabase.from("inventory_items").insert({ ...payload, company_id: session.company.id });
        if (error) return toast(error.message, "error");
        toast("Enregistré"); closeModal(); renderInventory();
      });
    },
  });
}

// ---- Gestion partenaires ---------------------------------------------------------
async function renderPartners() {
  $("#tab-sub").textContent = "Partenaires et taux de commission";
  $("#add-btn").style.display = "inline-flex"; $("#add-btn").onclick = () => partnerModal();

  const { data } = await supabase.from("partners").select("*").eq("company_id", session.company.id).order("name");
  const body = $("#co-body");
  if (!data?.length) { body.innerHTML = emptyState("🤝", "Aucun partenaire", "Ajoute un partenaire pour le proposer au Point de vente."); return; }

  body.innerHTML = `<div class="card"><div class="table-wrap"><table class="data">
    <thead><tr><th>Nom</th><th class="num">Commission</th><th>Statut</th><th></th></tr></thead>
    <tbody>${data.map((p) => `
      <tr>
        <td><strong>${escapeHtml(p.name)}</strong></td>
        <td class="num">${p.commission_rate}%</td>
        <td>${p.active ? `<span class="badge badge-success">Actif</span>` : `<span class="badge badge-neutral">Inactif</span>`}</td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="icon-btn btn-icon-only" data-edit="${p.id}" style="width:30px;height:30px;">✎</button>
          <button class="icon-btn btn-icon-only" data-del="${p.id}" style="width:30px;height:30px;">✕</button>
        </td>
      </tr>
    `).join("")}</tbody>
  </table></div></div>`;

  $$("[data-edit]", body).forEach((b) => b.addEventListener("click", () => partnerModal(data.find((p) => p.id === b.dataset.edit))));
  $$("[data-del]", body).forEach((b) => b.addEventListener("click", () => confirmDialog("Supprimer ce partenaire ?", async () => {
    await supabase.from("partners").delete().eq("id", b.dataset.del);
    toast("Supprimé"); renderPartners();
  })));
}
function partnerModal(p = null) {
  openModal({
    title: p ? "Modifier le partenaire" : "Nouveau partenaire",
    bodyHtml: `
      <div class="field"><label>Nom</label><input class="input" id="pt-name" value="${p ? escapeHtml(p.name) : ""}" /></div>
      <div class="field"><label>Commission (%)</label><input class="input" id="pt-rate" type="number" step="0.1" value="${p ? p.commission_rate : 0}" /></div>
      <label class="flex-center" style="font-size:13px;font-weight:600;"><input type="checkbox" id="pt-active" ${!p || p.active ? "checked" : ""}/> Actif (visible au point de vente)</label>
    `,
    footHtml: `<button class="btn btn-outline" data-close-modal>Annuler</button><button class="btn btn-accent" id="pt-save">Enregistrer</button>`,
    onMount: (m) => {
      $("#pt-save", m).addEventListener("click", async () => {
        const payload = { name: $("#pt-name", m).value.trim(), commission_rate: Number($("#pt-rate", m).value) || 0, active: $("#pt-active", m).checked };
        if (!payload.name) return toast("Nom requis", "error");
        const { error } = p
          ? await supabase.from("partners").update(payload).eq("id", p.id)
          : await supabase.from("partners").insert({ ...payload, company_id: session.company.id });
        if (error) return toast(error.message, "error");
        toast("Enregistré"); closeModal(); renderPartners();
      });
    },
  });
}

// ---- Compte bancaire ---------------------------------------------------------------
async function renderBank() {
  $("#tab-sub").textContent = "Mouvements du compte de l'entreprise";
  $("#add-btn").style.display = "inline-flex"; $("#add-btn").onclick = () => bankModal();

  const { data } = await supabase.from("bank_transactions").select("*").eq("company_id", session.company.id).order("created_at", { ascending: false });
  const body = $("#co-body");
  const balance = (data || []).reduce((s, t) => s + (t.type === "credit" ? Number(t.amount) : -Number(t.amount)), 0);

  body.innerHTML = `
    <div class="card card-pad mb-16" style="display:flex;align-items:center;justify-content:space-between;">
      <div><div class="muted" style="font-size:12.5px;font-weight:600;">Solde actuel</div><div style="font-size:26px;font-weight:800;">${formatMoney(balance)}</div></div>
    </div>
    ${!data?.length ? emptyState("🏦", "Aucun mouvement", "Ajoute un dépôt ou un retrait.") : `<div class="card"><div class="table-wrap"><table class="data">
      <thead><tr><th>Libellé</th><th>Type</th><th class="num">Montant</th><th>Date</th></tr></thead>
      <tbody>${data.map((t) => `
        <tr>
          <td><strong>${escapeHtml(t.label)}</strong></td>
          <td>${t.type === "credit" ? `<span class="badge badge-success">Crédit</span>` : `<span class="badge badge-danger">Débit</span>`}</td>
          <td class="num" style="color:${t.type === "credit" ? "var(--c-success)" : "var(--c-danger)"}">${t.type === "credit" ? "+" : "−"}${formatMoney(t.amount)}</td>
          <td>${formatDate(t.created_at)}</td>
        </tr>
      `).join("")}</tbody>
    </table></div></div>`}
  `;
}
function bankModal() {
  openModal({
    title: "Nouveau mouvement",
    bodyHtml: `
      <div class="field"><label>Libellé</label><input class="input" id="bk-label" placeholder="Vente comptoir, achat matériel..." /></div>
      <div class="form-grid">
        <div class="field"><label>Type</label><select class="input" id="bk-type"><option value="credit">Crédit (+)</option><option value="debit">Débit (−)</option></select></div>
        <div class="field"><label>Montant ($)</label><input class="input" id="bk-amount" type="number" step="0.01" /></div>
      </div>
    `,
    footHtml: `<button class="btn btn-outline" data-close-modal>Annuler</button><button class="btn btn-accent" id="bk-save">Ajouter</button>`,
    onMount: (m) => {
      $("#bk-save", m).addEventListener("click", async () => {
        const label = $("#bk-label", m).value.trim();
        if (!label) return toast("Libellé requis", "error");
        const { error } = await supabase.from("bank_transactions").insert({
          company_id: session.company.id, label, type: $("#bk-type", m).value, amount: Number($("#bk-amount", m).value) || 0,
        });
        if (error) return toast(error.message, "error");
        toast("Mouvement ajouté"); closeModal(); renderBank();
      });
    },
  });
}

// ---- Paramètres (entreprise + thème + catalogue) ------------------------------
const ACCENT_COLORS = { or: "#F0B90B", green: "#16A34A", blue: "#2563EB", purple: "#7C3AED", orange: "#EA580C", red: "#DC2626", teal: "#0D9488", pink: "#DB2777" };
const ACCENT_LABELS = { or: "Or", green: "Vert", blue: "Bleu", purple: "Violet", orange: "Orange", red: "Rouge", teal: "Turquoise", pink: "Rose" };

async function renderSettings() {
  $("#tab-sub").textContent = "Informations, thème et catalogue";
  const body = $("#co-body");
  const t = getTheme();

  body.innerHTML = `
    <div class="card card-pad mb-16">
      <h3 style="font-size:15px;margin-bottom:14px;">Entreprise</h3>
      <div class="form-grid">
        <div class="field"><label>Nom de l'entreprise</label><input class="input" id="cf-name" value="${escapeHtml(session.company.name)}" /></div>
        <div class="field"><label>Logo (emoji)</label><input class="input" id="cf-logo" value="${escapeHtml(session.company.logo_emoji || "🚘")}" maxlength="4" /></div>
      </div>
      <button class="btn btn-accent mt-16" id="cf-save">Enregistrer</button>
    </div>

    <div class="card card-pad mb-16">
      <h3 style="font-size:15px;margin-bottom:4px;">Thème</h3>
      <p class="faint" style="font-size:12.5px;margin-bottom:16px;">Personnalise l'apparence pour tout le monde, ou juste pour toi.</p>

      <div class="field mb-16"><label>Mode</label>
        <div class="tabs" style="width:fit-content;">
          <button class="tab-btn${t.mode !== "dark" ? " active" : ""}" data-mode="light">☀️ Clair</button>
          <button class="tab-btn${t.mode === "dark" ? " active" : ""}" data-mode="dark">🌙 Sombre</button>
        </div>
      </div>

      <div class="field mb-16"><label>Couleur d'accent</label>
        <div style="display:flex;gap:10px;flex-wrap:wrap;" id="settings-accent-row">
          ${ACCENTS.map((a) => `
            <button data-accent="${a}" style="display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:none;">
              <span class="swatch${t.accent === a ? " active" : ""}" style="--sw:${ACCENT_COLORS[a]};width:30px;height:30px;"></span>
              <span style="font-size:11px;color:var(--c-text-muted);">${ACCENT_LABELS[a]}</span>
            </button>
          `).join("")}
        </div>
      </div>

      <div class="field mb-16"><label>Arrondi</label>
        <div class="tabs" style="width:fit-content;">
          ${RADII.map((r) => `<button class="tab-btn${t.radius === r.key ? " active" : ""}" data-radius="${r.key}">${r.label}</button>`).join("")}
        </div>
      </div>

      <button class="btn btn-outline" id="theme-sync-btn">Définir comme thème par défaut de l'entreprise</button>
    </div>

    <div class="card card-pad">
      <div class="flex-between mb-16"><h3 style="font-size:15px;">Catalogue produits</h3><button class="btn btn-outline btn-sm" id="new-cat-btn">＋ Nouvelle catégorie</button></div>
      <div id="catalogue-zone"></div>
    </div>
  `;

  $("#cf-save").addEventListener("click", async () => {
    const { error } = await supabase.from("companies").update({
      name: $("#cf-name").value.trim() || session.company.name,
      logo_emoji: $("#cf-logo").value.trim() || "🚘",
    }).eq("id", session.company.id);
    if (error) return toast(error.message, "error");
    toast("Enregistré — recharge la page pour voir le nom mis à jour dans la barre latérale");
  });

  $$("[data-mode]", body).forEach((b) => b.addEventListener("click", () => {
    applyTheme({ mode: b.dataset.mode });
    $$("[data-mode]", body).forEach((x) => x.classList.toggle("active", x === b));
  }));
  $$("[data-accent]", body).forEach((b) => b.addEventListener("click", () => {
    applyTheme({ accent: b.dataset.accent });
    $$("[data-accent] .swatch", body).forEach((s) => s.classList.remove("active"));
    $(".swatch", b).classList.add("active");
  }));
  $$("[data-radius]", body).forEach((b) => b.addEventListener("click", () => {
    applyTheme({ radius: b.dataset.radius });
    $$("[data-radius]", body).forEach((x) => x.classList.toggle("active", x === b));
  }));
  $("#theme-sync-btn").addEventListener("click", async () => {
    await saveCompanyTheme(supabase, session.company.id, getTheme());
    toast("Thème par défaut de l'entreprise mis à jour");
  });

  $("#new-cat-btn").addEventListener("click", () => categoryModal());
  renderCatalogue();
}

async function renderCatalogue() {
  const zone = $("#catalogue-zone");
  const [{ data: cats }, { data: prods }] = await Promise.all([
    supabase.from("product_categories").select("*").eq("company_id", session.company.id).order("position"),
    supabase.from("products").select("*").eq("company_id", session.company.id).order("position"),
  ]);

  if (!cats?.length) { zone.innerHTML = `<p class="muted" style="font-size:13px;">Aucune catégorie. Crée-en une pour commencer à vendre au Point de vente.</p>`; return; }

  zone.innerHTML = cats.map((c) => {
    const items = (prods || []).filter((p) => p.category_id === c.id);
    return `
      <div class="card-section" style="padding:16px 0;">
        <div class="flex-between mb-16">
          <div class="flex-center"><span style="font-size:18px;">${c.icon}</span><strong>${escapeHtml(c.label)}</strong><span class="faint mono" style="font-size:11px;">${c.key}</span></div>
          <div class="flex-center">
            <button class="btn btn-sm btn-outline" data-newprod="${c.id}">＋ Produit</button>
            <button class="icon-btn btn-icon-only" data-delcat="${c.id}" style="width:28px;height:28px;">✕</button>
          </div>
        </div>
        ${items.length ? `<div class="table-wrap"><table class="data">
          <thead><tr><th>Nom</th><th>Sous-cat.</th><th class="num">Prix</th><th class="num">Prix usine</th><th>Salaire</th><th class="num">Taxe</th><th>Actif</th><th></th></tr></thead>
          <tbody>${items.map((p) => `
            <tr>
              <td>${p.image_emoji || ""} ${escapeHtml(p.name)}</td>
              <td class="faint">${escapeHtml(p.sub_category || "—")}</td>
              <td class="num">${formatMoney(p.price)}</td>
              <td class="num">${formatMoney(p.cost_price)}</td>
              <td>${p.direct_payout === false ? `<span class="badge badge-warning">À verser</span>` : `<span class="badge badge-neutral">Direct</span>`}</td>
              <td class="num">${Number(p.tax_rate) > 0 ? p.tax_rate + "%" : "—"}</td>
              <td>${p.active ? `<span class="badge badge-success">Oui</span>` : `<span class="badge badge-neutral">Non</span>`}</td>
              <td style="text-align:right;white-space:nowrap;">
                <button class="icon-btn btn-icon-only" data-editprod="${p.id}" style="width:28px;height:28px;">✎</button>
                <button class="icon-btn btn-icon-only" data-delprod="${p.id}" style="width:28px;height:28px;">✕</button>
              </td>
            </tr>
          `).join("")}</tbody>
        </table></div>` : `<p class="faint" style="font-size:12.5px;">Aucun produit dans cette catégorie.</p>`}
      </div>
    `;
  }).join("");

  $$("[data-newprod]", zone).forEach((b) => b.addEventListener("click", () => productModal(null, b.dataset.newprod, cats)));
  $$("[data-editprod]", zone).forEach((b) => b.addEventListener("click", () => productModal((prods || []).find((p) => p.id === b.dataset.editprod), null, cats)));
  $$("[data-delprod]", zone).forEach((b) => b.addEventListener("click", () => confirmDialog("Supprimer ce produit ?", async () => {
    await supabase.from("products").delete().eq("id", b.dataset.delprod);
    toast("Produit supprimé"); renderCatalogue();
  })));
  $$("[data-delcat]", zone).forEach((b) => b.addEventListener("click", () => confirmDialog("Supprimer cette catégorie et tous ses produits ?", async () => {
    await supabase.from("product_categories").delete().eq("id", b.dataset.delcat);
    toast("Catégorie supprimée"); renderCatalogue();
  })));
}

function categoryModal() {
  openModal({
    title: "Nouvelle catégorie",
    bodyHtml: `
      <div class="field"><label>Libellé</label><input class="input" id="cat-label" placeholder="Peinture" /></div>
      <div class="form-grid">
        <div class="field"><label>Clé (unique)</label><input class="input" id="cat-key" placeholder="peinture" /></div>
        <div class="field"><label>Icône (emoji)</label><input class="input" id="cat-icon" placeholder="🎨" value="📦" /></div>
      </div>
      <p class="faint" style="font-size:11.5px;">Astuce : utilise les clés <code>services</code>, <code>ventes</code>, <code>customs</code> ou <code>peinture</code> pour relier les permissions dédiées du Point de vente ; toute autre clé reste visible à quiconque a l'accès général au Point de vente.</p>
    `,
    footHtml: `<button class="btn btn-outline" data-close-modal>Annuler</button><button class="btn btn-accent" id="cat-save">Créer</button>`,
    onMount: (m) => {
      $("#cat-save", m).addEventListener("click", async () => {
        const label = $("#cat-label", m).value.trim();
        const key = $("#cat-key", m).value.trim().toLowerCase() || label.toLowerCase();
        if (!label || !key) return toast("Libellé et clé requis", "error");
        const { error } = await supabase.from("product_categories").insert({
          company_id: session.company.id, label, key, icon: $("#cat-icon", m).value.trim() || "📦", position: 99,
        });
        if (error) return toast(error.message, "error");
        toast("Catégorie créée"); closeModal(); renderCatalogue();
      });
    },
  });
}

function productModal(prod, defaultCatId, cats) {
  openModal({
    title: prod ? "Modifier le produit" : "Nouveau produit",
    bodyHtml: `
      <div class="field"><label>Catégorie</label>
        <select class="input" id="pr-cat">${cats.map((c) => `<option value="${c.id}" ${((prod?.category_id) || defaultCatId) === c.id ? "selected" : ""}>${c.label}</option>`).join("")}</select>
      </div>
      <div class="field"><label>Nom</label><input class="input" id="pr-name" value="${prod ? escapeHtml(prod.name) : ""}" /></div>
      <div class="field"><label>Sous-catégorie (optionnel)</label><input class="input" id="pr-sub" value="${prod ? escapeHtml(prod.sub_category || "") : ""}" placeholder="Apparence, Performance..." /></div>
      <div class="form-grid">
        <div class="field"><label>Prix ($, 0 = gratuit)</label><input class="input" id="pr-price" type="number" step="0.01" value="${prod ? prod.price : 0}" /></div>
        <div class="field"><label>Prix usine ($, 0 = aucun)</label><input class="input" id="pr-cost" type="number" step="0.01" value="${prod ? prod.cost_price : 0}" /></div>
        <div class="field"><label>Icône (emoji)</label><input class="input" id="pr-emoji" value="${prod ? prod.image_emoji || "🔧" : "🔧"}" /></div>
        <div class="field"><label>Actif</label><select class="input" id="pr-active"><option value="1" ${!prod || prod.active ? "selected" : ""}>Oui</option><option value="0" ${prod && !prod.active ? "selected" : ""}>Non</option></select></div>
      </div>
      <div class="field"><label>Taux de taxe / charge société (%, 0 = aucune)</label><input class="input" id="pr-tax" type="number" step="0.1" min="0" max="100" value="${prod ? prod.tax_rate : 0}" /></div>
      <label class="flex-center" style="font-size:13px;font-weight:600;">
        <input type="checkbox" id="pr-direct" ${!prod || prod.direct_payout !== false ? "checked" : ""}/>
        Paiement direct à l'employé (compte dans son chiffre d'affaires, pas dans son salaire à verser)
      </label>
    `,
    footHtml: `<button class="btn btn-outline" data-close-modal>Annuler</button><button class="btn btn-accent" id="pr-save">Enregistrer</button>`,
    onMount: (m) => {
      $("#pr-save", m).addEventListener("click", async () => {
        const payload = {
          category_id: $("#pr-cat", m).value, name: $("#pr-name", m).value.trim(),
          sub_category: $("#pr-sub", m).value.trim() || null,
          price: Number($("#pr-price", m).value) || 0, cost_price: Number($("#pr-cost", m).value) || 0,
          image_emoji: $("#pr-emoji", m).value.trim() || "🔧", active: $("#pr-active", m).value === "1",
          tax_rate: Number($("#pr-tax", m).value) || 0, direct_payout: $("#pr-direct", m).checked,
        };
        if (!payload.name) return toast("Nom requis", "error");
        const { error } = prod
          ? await supabase.from("products").update(payload).eq("id", prod.id)
          : await supabase.from("products").insert({ ...payload, company_id: session.company.id, position: 99 });
        if (error) return toast(error.message, "error");
        toast("Enregistré"); closeModal(); renderCatalogue();
      });
    },
  });
}
