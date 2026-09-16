import { supabase } from "../supabaseClient.js";
import { requireSession } from "../auth.js";
import { mountShell, mountTopbar } from "../sidebar.js";
import { $, el, ICONS, formatMoney, formatDate } from "../ui.js";

const session = await requireSession({ permission: "sales.view_bilan_employe" });
mountShell({ session });
mountTopbar({ session });

(async () => {
  if (!session.employee) { $("#bilan-stats").innerHTML = ""; return; }
  const empId = session.employee.id;
  const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - (weekStart.getDay() || 7) + 1);

  const [{ data: allSales }, { data: weekSales }, { data: payroll }] = await Promise.all([
    supabase.from("sales").select("total").eq("employee_id", empId),
    supabase.from("sales").select("total, created_at").eq("employee_id", empId).gte("created_at", weekStart.toISOString()),
    supabase.from("payroll_entries").select("*").eq("employee_id", empId).order("week_number", { ascending: false }).limit(10),
  ]);

  const allRevenue = (allSales || []).reduce((s, r) => s + Number(r.total), 0);
  const weekRevenue = (weekSales || []).reduce((s, r) => s + Number(r.total), 0);

  const stats = [
    { icon: "cart", label: "Ventes cette semaine", value: String((weekSales || []).length) },
    { icon: "dollar", label: "CA cette semaine", value: formatMoney(weekRevenue) },
    { icon: "trending", label: "CA total (all-time)", value: formatMoney(allRevenue) },
    { icon: "clock", label: "Heures totales", value: Number(session.employee.hours_worked || 0).toFixed(1) + " h" },
  ];
  $("#bilan-stats").innerHTML = "";
  stats.forEach((s) => $("#bilan-stats").appendChild(el(`
    <div class="card stat-card"><div class="row1">${s.label} ${ICONS[s.icon] || ""}</div><div class="value">${s.value}</div></div>
  `)));

  $("#payroll-table").innerHTML = payroll?.length ? `<table class="data">
    <thead><tr><th>Semaine</th><th class="num">Brut</th><th>Statut</th></tr></thead>
    <tbody>${payroll.map((p) => `<tr><td class="mono">S${p.week_number}</td><td class="num">${formatMoney(p.salaire_brut)}</td><td>${p.paid ? `<span class="badge badge-success">Versé</span>` : `<span class="badge badge-warning">Dû</span>`}</td></tr>`).join("")}</tbody>
  </table>` : `<p class="muted" style="padding-top:12px;font-size:13px;">Aucune fiche de paie pour le moment.</p>`;

  const { data: recentSales } = await supabase.from("sales").select("*").eq("employee_id", empId).order("created_at", { ascending: false }).limit(8);
  $("#sales-table").innerHTML = recentSales?.length ? `<table class="data">
    <thead><tr><th>Date</th><th>Plaque</th><th class="num">Total</th></tr></thead>
    <tbody>${recentSales.map((s) => `<tr><td>${formatDate(s.created_at)}</td><td class="mono">${s.plate || "—"}</td><td class="num">${formatMoney(s.total)}</td></tr>`).join("")}</tbody>
  </table>` : `<p class="muted" style="padding-top:12px;font-size:13px;">Aucune vente récente.</p>`;
})();
