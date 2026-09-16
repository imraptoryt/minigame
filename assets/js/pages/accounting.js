import { supabase } from "../supabaseClient.js";
import { requireSession } from "../auth.js";
import { mountShell, mountTopbar } from "../sidebar.js";
import { $, $$, toast, formatMoney, formatDate, escapeHtml, openModal, closeModal, confirmDialog } from "../ui.js";

const session = await requireSession();
const TABS = [
  { key: "bilan", label: "Bilan", perm: "accounting.view_bilan" },
  { key: "client", label: "Facturation client", perm: "accounting.manage_facturation_client" },
  { key: "payable", label: "Factures à payer", perm: "accounting.manage_factures_a_payer" },
  { key: "salaries", label: "Salaires", perm: "accounting.manage_salaires" },
  { key: "charges", label: "Charges", perm: "accounting.manage_charges" },
];
const allowed = TABS.filter((t) => session.can(t.perm));
mountShell({ session, defaultTab: allowed[0]?.key || "bilan" });
mountTopbar({ session });

if (!allowed.length) {
  $("#acc-tabs").style.display = "none";
  $("#acc-body").innerHTML = emptyState("🔒", "Accès refusé", "Aucune permission comptabilité ne t'a été attribuée.");
} else {
  let tab = new URLSearchParams(location.search).get("tab") || allowed[0].key;
  if (!allowed.some((t) => t.key === tab)) tab = allowed[0].key;
  $("#acc-tabs").innerHTML = allowed.map((t) => `<button class="tab-btn${t.key === tab ? " active" : ""}" data-k="${t.key}">${t.label}</button>`).join("");
  $$("[data-k]", $("#acc-tabs")).forEach((b) => b.addEventListener("click", () => { window.location.search = "?tab=" + b.dataset.k; }));
  render(tab);
}

function render(tab) {
  $("#add-btn").style.display = "none";
  if (tab === "bilan") return renderBilan();
  if (tab === "client") return renderInvoices("client_invoices", "client_name", "Client");
  if (tab === "payable") return renderInvoices("payable_invoices", "supplier_name", "Fournisseur");
  if (tab === "salaries") return renderSalaries();
  if (tab === "charges") return renderCharges();
}

function emptyState(icon, title, sub) { return `<div class="card"><div class="empty-state"><div class="icon">${icon}</div><h4>${title}</h4><p>${sub}</p></div></div>`; }

// ---- Bilan ------------------------------------------------------------------
async function renderBilan() {
  $("#tab-sub").textContent = "Vue d'ensemble financière";
  const [{ data: sales }, { data: charges }, { data: payroll }, { data: client }, { data: payable }] = await Promise.all([
    supabase.from("sales").select("total").eq("company_id", session.company.id),
    supabase.from("charges").select("amount,paid").eq("company_id", session.company.id),
    supabase.from("payroll_entries").select("salaire_brut,paid").eq("company_id", session.company.id),
    supabase.from("client_invoices").select("amount,status").eq("company_id", session.company.id),
    supabase.from("payable_invoices").select("amount,status").eq("company_id", session.company.id),
  ]);
  const revenue = sum(sales, "total");
  const chargesTotal = sum(charges, "amount");
  const salariesTotal = sum(payroll, "salaire_brut");
  const clientDue = sum((client || []).filter((c) => c.status !== "paid"), "amount");
  const payableDue = sum((payable || []).filter((c) => c.status !== "paid"), "amount");
  const net = revenue - chargesTotal - salariesTotal;

  $("#acc-body").innerHTML = `
    <div class="stat-grid">
      ${statCard("Chiffre d'affaires total", formatMoney(revenue), "var(--c-success)")}
      ${statCard("Charges", formatMoney(chargesTotal), "var(--c-danger)")}
      ${statCard("Salaires", formatMoney(salariesTotal), "var(--c-danger)")}
      ${statCard("À encaisser (clients)", formatMoney(clientDue), "var(--c-warning)")}
      ${statCard("Résultat net", formatMoney(net), net >= 0 ? "var(--c-success)" : "var(--c-danger)")}
    </div>
    <div class="card card-pad">
      <h3 style="font-size:15px;margin-bottom:14px;">Répartition</h3>
      <div class="kv-row"><span class="k">Chiffre d'affaires</span><span class="v" style="color:var(--c-success)">+${formatMoney(revenue)}</span></div>
      <div class="kv-row"><span class="k">Charges</span><span class="v" style="color:var(--c-danger)">−${formatMoney(chargesTotal)}</span></div>
      <div class="kv-row"><span class="k">Salaires</span><span class="v" style="color:var(--c-danger)">−${formatMoney(salariesTotal)}</span></div>
      <div class="kv-row"><span class="k">Factures à payer (en attente)</span><span class="v" style="color:var(--c-danger)">−${formatMoney(payableDue)}</span></div>
      <div class="kv-row total"><span class="k">Résultat net</span><span class="v">${formatMoney(net)}</span></div>
    </div>
  `;
}
function sum(rows, key) { return (rows || []).reduce((s, r) => s + Number(r[key] || 0), 0); }
function statCard(label, value, color) {
  return `<div class="card stat-card"><div class="row1">${label}</div><div class="value" style="color:${color};font-size:19px;">${value}</div></div>`;
}

// ---- Facturation client / Factures à payer (shared shape) -------------------
async function renderInvoices(table, nameField, nameLabel) {
  const isClient = table === "client_invoices";
  $("#tab-sub").textContent = isClient ? "Sommes à recevoir de tes clients" : "Sommes que l'entreprise doit régler";
  $("#add-btn").style.display = "inline-flex";
  $("#add-btn").onclick = () => invoiceModal(table, nameField, nameLabel);

  const { data } = await supabase.from(table).select("*").eq("company_id", session.company.id).order("created_at", { ascending: false });
  const body = $("#acc-body");
  if (!data?.length) { body.innerHTML = emptyState("🧾", "Rien pour le moment", `Ajoute une facture ${isClient ? "client" : "fournisseur"}.`); return; }

  body.innerHTML = `<div class="card"><div class="table-wrap"><table class="data">
    <thead><tr><th>${nameLabel}</th><th>Description</th><th class="num">Montant</th><th>Échéance</th><th>Statut</th><th></th></tr></thead>
    <tbody>${data.map((r) => `
      <tr>
        <td><strong>${escapeHtml(r[nameField])}</strong></td>
        <td class="faint">${escapeHtml(r.description || "—")}</td>
        <td class="num">${formatMoney(r.amount)}</td>
        <td>${formatDate(r.due_date)}</td>
        <td>${statusBadge(r.status)}</td>
        <td style="text-align:right;white-space:nowrap;">
          ${r.status !== "paid" ? `<button class="btn btn-sm btn-outline" data-pay="${r.id}">Marquer payée</button>` : ""}
          <button class="icon-btn btn-icon-only" data-del="${r.id}" style="width:30px;height:30px;">✕</button>
        </td>
      </tr>
    `).join("")}</tbody>
  </table></div></div>`;

  $$("[data-pay]", body).forEach((b) => b.addEventListener("click", async () => {
    await supabase.from(table).update({ status: "paid" }).eq("id", b.dataset.pay);
    toast("Marquée comme payée"); renderInvoices(table, nameField, nameLabel);
  }));
  $$("[data-del]", body).forEach((b) => b.addEventListener("click", () => confirmDialog("Supprimer cette entrée ?", async () => {
    await supabase.from(table).delete().eq("id", b.dataset.del);
    toast("Supprimée"); renderInvoices(table, nameField, nameLabel);
  })));
}
function statusBadge(s) {
  if (s === "paid") return `<span class="badge badge-success">Payée</span>`;
  if (s === "overdue") return `<span class="badge badge-danger">En retard</span>`;
  return `<span class="badge badge-warning">En attente</span>`;
}
function invoiceModal(table, nameField, nameLabel) {
  openModal({
    title: nameLabel === "Client" ? "Nouvelle facture client" : "Nouvelle facture fournisseur",
    bodyHtml: `
      <div class="field"><label>${nameLabel}</label><input class="input" id="iv-name" /></div>
      <div class="field"><label>Description</label><input class="input" id="iv-desc" /></div>
      <div class="form-grid">
        <div class="field"><label>Montant ($)</label><input class="input" id="iv-amount" type="number" min="0" step="0.01" /></div>
        <div class="field"><label>Échéance</label><input class="input" id="iv-due" type="date" /></div>
      </div>
    `,
    footHtml: `<button class="btn btn-outline" data-close-modal>Annuler</button><button class="btn btn-accent" id="iv-save">Ajouter</button>`,
    onMount: (m) => {
      $("#iv-save", m).addEventListener("click", async () => {
        const name = $("#iv-name", m).value.trim();
        if (!name) return toast(`${nameLabel} requis`, "error");
        const { error } = await supabase.from(table).insert({
          company_id: session.company.id, [nameField]: name,
          description: $("#iv-desc", m).value.trim() || null,
          amount: Number($("#iv-amount", m).value) || 0,
          due_date: $("#iv-due", m).value || null,
        });
        if (error) return toast(error.message, "error");
        toast("Ajoutée"); closeModal(); renderInvoices(table, nameField, nameLabel);
      });
    },
  });
}

// ---- Salaires -----------------------------------------------------------------
async function renderSalaries() {
  $("#tab-sub").textContent = "Paie hebdomadaire par employé";
  $("#add-btn").style.display = "inline-flex"; $("#add-btn").onclick = () => salaryModal();

  const { data } = await supabase.from("payroll_entries").select("*, employees(full_name)").eq("company_id", session.company.id).order("week_number", { ascending: false });
  const body = $("#acc-body");
  if (!data?.length) { body.innerHTML = emptyState("💰", "Aucune paie", "Ajoute une fiche de paie hebdomadaire."); return; }

  body.innerHTML = `<div class="card"><div class="table-wrap"><table class="data">
    <thead><tr><th>Employé</th><th>Semaine</th><th class="num">CA</th><th class="num">Avances</th><th class="num">Primes</th><th class="num">Brut</th><th>Statut</th><th></th></tr></thead>
    <tbody>${data.map((p) => `
      <tr>
        <td><strong>${escapeHtml(p.employees?.full_name || "—")}</strong></td>
        <td class="mono">S${p.week_number}</td>
        <td class="num">${formatMoney(p.chiffre_affaires)}</td>
        <td class="num">${formatMoney(p.avances)}</td>
        <td class="num">${formatMoney(p.primes)}</td>
        <td class="num"><strong>${formatMoney(p.salaire_brut)}</strong></td>
        <td>${p.paid ? `<span class="badge badge-success">Versé</span>` : `<span class="badge badge-warning">Dû</span>`}</td>
        <td style="text-align:right;white-space:nowrap;">
          ${!p.paid ? `<button class="btn btn-sm btn-outline" data-pay="${p.id}">Marquer versé</button>` : ""}
          <button class="icon-btn btn-icon-only" data-del="${p.id}" style="width:30px;height:30px;">✕</button>
        </td>
      </tr>
    `).join("")}</tbody>
  </table></div></div>`;

  $$("[data-pay]", body).forEach((b) => b.addEventListener("click", async () => {
    await supabase.from("payroll_entries").update({ paid: true }).eq("id", b.dataset.pay);
    toast("Salaire marqué versé"); renderSalaries();
  }));
  $$("[data-del]", body).forEach((b) => b.addEventListener("click", () => confirmDialog("Supprimer cette fiche de paie ?", async () => {
    await supabase.from("payroll_entries").delete().eq("id", b.dataset.del);
    toast("Supprimée"); renderSalaries();
  })));
}
async function salaryModal() {
  const { data: employees } = await supabase.from("employees").select("id,full_name").eq("company_id", session.company.id).eq("status", "active").order("full_name");
  openModal({
    title: "Nouvelle fiche de paie",
    bodyHtml: `
      <div class="field"><label>Employé</label><select class="input" id="sa-emp">${(employees || []).map((e) => `<option value="${e.id}">${escapeHtml(e.full_name)}</option>`).join("")}</select></div>
      <div class="field"><label>Semaine</label><input class="input" id="sa-week" type="number" value="${isoWeek()}" /></div>
      <div class="form-grid">
        <div class="field"><label>Chiffre d'affaires</label><input class="input" id="sa-ca" type="number" step="0.01" value="0" /></div>
        <div class="field"><label>Avances</label><input class="input" id="sa-av" type="number" step="0.01" value="0" /></div>
        <div class="field"><label>Primes</label><input class="input" id="sa-pr" type="number" step="0.01" value="0" /></div>
        <div class="field"><label>Salaire brut</label><input class="input" id="sa-brut" type="number" step="0.01" value="0" /></div>
      </div>
    `,
    footHtml: `<button class="btn btn-outline" data-close-modal>Annuler</button><button class="btn btn-accent" id="sa-save">Créer</button>`,
    onMount: (m) => {
      $("#sa-save", m).addEventListener("click", async () => {
        if (!employees?.length) return toast("Ajoute d'abord un employé", "error");
        const { error } = await supabase.from("payroll_entries").insert({
          company_id: session.company.id, employee_id: $("#sa-emp", m).value,
          week_number: Number($("#sa-week", m).value) || isoWeek(),
          chiffre_affaires: Number($("#sa-ca", m).value) || 0,
          avances: Number($("#sa-av", m).value) || 0,
          primes: Number($("#sa-pr", m).value) || 0,
          salaire_brut: Number($("#sa-brut", m).value) || 0,
        });
        if (error) return toast(error.message, "error");
        toast("Fiche de paie créée"); closeModal(); renderSalaries();
      });
    },
  });
}
function isoWeek() {
  const d = new Date(); const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

// ---- Charges -----------------------------------------------------------------
async function renderCharges() {
  $("#tab-sub").textContent = "Dépenses fixes et ponctuelles";
  $("#add-btn").style.display = "inline-flex"; $("#add-btn").onclick = () => chargeModal();

  const { data } = await supabase.from("charges").select("*").eq("company_id", session.company.id).order("created_at", { ascending: false });
  const body = $("#acc-body");
  if (!data?.length) { body.innerHTML = emptyState("📉", "Aucune charge", "Ajoute une charge récurrente ou ponctuelle."); return; }

  body.innerHTML = `<div class="card"><div class="table-wrap"><table class="data">
    <thead><tr><th>Libellé</th><th>Catégorie</th><th class="num">Montant</th><th>Récurrente</th><th>Statut</th><th></th></tr></thead>
    <tbody>${data.map((c) => `
      <tr>
        <td><strong>${escapeHtml(c.label)}</strong></td>
        <td class="faint">${escapeHtml(c.category)}</td>
        <td class="num">${formatMoney(c.amount)}</td>
        <td>${c.recurring ? `<span class="badge badge-neutral">🔁 Oui</span>` : `<span class="faint">Non</span>`}</td>
        <td>${c.paid ? `<span class="badge badge-success">Payée</span>` : `<span class="badge badge-warning">En attente</span>`}</td>
        <td style="text-align:right;white-space:nowrap;">
          ${!c.paid ? `<button class="btn btn-sm btn-outline" data-pay="${c.id}">Marquer payée</button>` : ""}
          <button class="icon-btn btn-icon-only" data-del="${c.id}" style="width:30px;height:30px;">✕</button>
        </td>
      </tr>
    `).join("")}</tbody>
  </table></div></div>`;

  $$("[data-pay]", body).forEach((b) => b.addEventListener("click", async () => {
    await supabase.from("charges").update({ paid: true }).eq("id", b.dataset.pay);
    toast("Marquée payée"); renderCharges();
  }));
  $$("[data-del]", body).forEach((b) => b.addEventListener("click", () => confirmDialog("Supprimer cette charge ?", async () => {
    await supabase.from("charges").delete().eq("id", b.dataset.del);
    toast("Supprimée"); renderCharges();
  })));
}
function chargeModal() {
  openModal({
    title: "Nouvelle charge",
    bodyHtml: `
      <div class="field"><label>Libellé</label><input class="input" id="ch-label" placeholder="Loyer garage" /></div>
      <div class="field"><label>Catégorie</label><input class="input" id="ch-cat" value="Général" /></div>
      <div class="form-grid">
        <div class="field"><label>Montant ($)</label><input class="input" id="ch-amount" type="number" step="0.01" /></div>
        <div class="field"><label>Échéance</label><input class="input" id="ch-due" type="date" /></div>
      </div>
      <label class="flex-center" style="font-size:13px;font-weight:600;"><input type="checkbox" id="ch-recurring" /> Charge récurrente</label>
    `,
    footHtml: `<button class="btn btn-outline" data-close-modal>Annuler</button><button class="btn btn-accent" id="ch-save">Ajouter</button>`,
    onMount: (m) => {
      $("#ch-save", m).addEventListener("click", async () => {
        const label = $("#ch-label", m).value.trim();
        if (!label) return toast("Libellé requis", "error");
        const { error } = await supabase.from("charges").insert({
          company_id: session.company.id, label, category: $("#ch-cat", m).value.trim() || "Général",
          amount: Number($("#ch-amount", m).value) || 0, due_date: $("#ch-due", m).value || null,
          recurring: $("#ch-recurring", m).checked,
        });
        if (error) return toast(error.message, "error");
        toast("Charge ajoutée"); closeModal(); renderCharges();
      });
    },
  });
}
