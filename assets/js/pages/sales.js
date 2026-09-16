import { supabase } from "../supabaseClient.js";
import { requireSession } from "../auth.js";
import { mountShell, mountTopbar } from "../sidebar.js";
import { $, $$, toast, formatMoney, formatDate, escapeHtml } from "../ui.js";

const session = await requireSession();
const TABS = [
  { key: "mine", label: "Mes ventes", perm: "sales.view_own" },
  { key: "all", label: "Toutes les ventes", perm: "accounting.view_ventes" },
  { key: "byproduct", label: "Ventes par produit", perm: "accounting.view_ventes_par_produit" },
];
const allowed = TABS.filter((t) => session.can(t.perm));
mountShell({ session, defaultTab: allowed[0]?.key || "mine" });
mountTopbar({ session });

if (!allowed.length) {
  $("#sales-tabs").style.display = "none";
  $("#sales-body").innerHTML = emptyState("🔒", "Accès refusé", "Aucune permission de vente ne t'a été attribuée.");
} else {
  let tab = new URLSearchParams(location.search).get("tab") || allowed[0].key;
  if (!allowed.some((t) => t.key === tab)) tab = allowed[0].key;
  $("#sales-tabs").innerHTML = allowed.map((t) => `<button class="tab-btn${t.key === tab ? " active" : ""}" data-k="${t.key}">${t.label}</button>`).join("");
  $$("[data-k]", $("#sales-tabs")).forEach((b) => b.addEventListener("click", () => { window.location.search = "?tab=" + b.dataset.k; }));
  render(tab);
}

function render(tab) {
  if (tab === "mine") return renderMine();
  if (tab === "all") return renderAll();
  if (tab === "byproduct") return renderByProduct();
}
function emptyState(icon, title, sub) { return `<div class="card"><div class="empty-state"><div class="icon">${icon}</div><h4>${title}</h4><p>${sub}</p></div></div>`; }
function saleRow(s, showEmployee) {
  return `<tr>
    <td>${formatDate(s.created_at)}</td>
    ${showEmployee ? `<td>${escapeHtml(s.employees?.full_name || "—")}</td>` : ""}
    <td class="mono">${escapeHtml(s.plate || "—")}</td>
    <td class="faint">${escapeHtml(s.partners?.name || "Aucun partenaire")}</td>
    <td class="num">${formatMoney(s.subtotal)}</td>
    <td class="num" style="color:${s.adjustment > 0 ? "var(--c-success)" : s.adjustment < 0 ? "var(--c-danger)" : "inherit"}">${s.adjustment !== 0 ? (s.adjustment > 0 ? "+" : "") + formatMoney(s.adjustment) : "—"}</td>
    <td class="num"><strong>${formatMoney(s.total)}</strong></td>
  </tr>`;
}

async function renderMine() {
  $("#tab-sub").textContent = "Ton historique de ventes personnel";
  if (!session.employee) { $("#sales-body").innerHTML = emptyState("🧾", "Pas encore de fiche employé", ""); return; }
  const { data } = await supabase.from("sales").select("*, partners(name)").eq("employee_id", session.employee.id).order("created_at", { ascending: false }).limit(100);
  const body = $("#sales-body");
  if (!data?.length) { body.innerHTML = emptyState("🧾", "Aucune vente", "Tes ventes du Point de vente apparaîtront ici."); return; }
  body.innerHTML = `<div class="card"><div class="table-wrap"><table class="data">
    <thead><tr><th>Date</th><th>Plaque</th><th>Partenaire</th><th class="num">Sous-total</th><th class="num">Ajust.</th><th class="num">Total</th></tr></thead>
    <tbody>${data.map((s) => saleRow(s, false)).join("")}</tbody>
  </table></div></div>`;
}

async function renderAll() {
  $("#tab-sub").textContent = "Toutes les ventes de l'entreprise";
  const { data } = await supabase.from("sales").select("*, employees(full_name), partners(name)").eq("company_id", session.company.id).order("created_at", { ascending: false }).limit(150);
  const body = $("#sales-body");
  if (!data?.length) { body.innerHTML = emptyState("🧾", "Aucune vente", "Les ventes du Point de vente apparaîtront ici."); return; }
  const totalRevenue = data.reduce((s, r) => s + Number(r.total), 0);
  body.innerHTML = `
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px;">
      <div class="card stat-card"><div class="row1">Ventes affichées</div><div class="value">${data.length}</div></div>
      <div class="card stat-card"><div class="row1">Chiffre d'affaires</div><div class="value" style="color:var(--c-success)">${formatMoney(totalRevenue)}</div></div>
      <div class="card stat-card"><div class="row1">Panier moyen</div><div class="value">${formatMoney(totalRevenue / data.length)}</div></div>
    </div>
    <div class="card"><div class="table-wrap"><table class="data">
      <thead><tr><th>Date</th><th>Employé</th><th>Plaque</th><th>Partenaire</th><th class="num">Sous-total</th><th class="num">Ajust.</th><th class="num">Total</th></tr></thead>
      <tbody>${data.map((s) => saleRow(s, true)).join("")}</tbody>
    </table></div></div>
  `;
}

async function renderByProduct() {
  $("#tab-sub").textContent = "Quantités et revenus par produit";
  const { data } = await supabase.from("sale_items").select("name_snap, price_snap, qty, sales!inner(company_id)").eq("sales.company_id", session.company.id);
  const body = $("#sales-body");
  if (!data?.length) { body.innerHTML = emptyState("📦", "Aucune donnée", "Les ventes du Point de vente alimenteront ce classement."); return; }

  const byName = {};
  data.forEach((it) => {
    const k = it.name_snap;
    byName[k] ||= { qty: 0, revenue: 0 };
    byName[k].qty += it.qty;
    byName[k].revenue += it.qty * Number(it.price_snap);
  });
  const rows = Object.entries(byName).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue);
  const maxRevenue = Math.max(...rows.map((r) => r.revenue));

  body.innerHTML = `<div class="card">
    <div class="table-wrap"><table class="data">
      <thead><tr><th>Produit</th><th class="num">Qté vendue</th><th class="num">Revenu</th><th style="width:35%;">Part</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr>
          <td><strong>${escapeHtml(r.name)}</strong></td>
          <td class="num">${r.qty}</td>
          <td class="num">${formatMoney(r.revenue)}</td>
          <td><div style="background:var(--c-surface-2);border-radius:6px;height:8px;overflow:hidden;"><div style="width:${(r.revenue / maxRevenue) * 100}%;background:var(--c-accent);height:100%;"></div></div></td>
        </tr>
      `).join("")}</tbody>
    </table></div>
  </div>`;
}
