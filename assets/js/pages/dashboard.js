import { supabase } from "../supabaseClient.js";
import { requireSession } from "../auth.js";
import { mountShell, mountTopbar } from "../sidebar.js";
import { $, el, ICONS, formatMoney } from "../ui.js";

const session = await requireSession({ permission: "dashboard.view" });
mountShell({ session });
mountTopbar({ session });

$("#greeting").innerHTML = `😊 Bonjour ${session.profile.full_name.split(" ")[0]}`;

function isoWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}
function weekBounds(offset = 0) {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now); monday.setHours(0,0,0,0); monday.setDate(now.getDate() - day + 1 + offset * 7);
  const nextMonday = new Date(monday); nextMonday.setDate(monday.getDate() + 7);
  return { start: monday, end: nextMonday };
}
function pctDelta(cur, prev) {
  if (!prev) return { label: "0.00%", cls: "flat" };
  const d = ((cur - prev) / prev) * 100;
  return { label: `${d >= 0 ? "+" : ""}${d.toFixed(2)}%`, cls: d > 0 ? "up" : d < 0 ? "down" : "flat" };
}

const week = isoWeek();
$("#week-badge").textContent = "S" + week;

(async () => {
  const cur = weekBounds(0), prev = weekBounds(-1);

  const [{ data: salesCur }, { data: salesPrev }, { data: employees }, { data: payrollCur }] = await Promise.all([
    supabase.from("sales").select("id,total,employee_id,created_at").eq("company_id", session.company.id).gte("created_at", cur.start.toISOString()).lt("created_at", cur.end.toISOString()),
    supabase.from("sales").select("id,total,employee_id").eq("company_id", session.company.id).gte("created_at", prev.start.toISOString()).lt("created_at", prev.end.toISOString()),
    supabase.from("employees").select("id,full_name,grade,status").eq("company_id", session.company.id).eq("status", "active"),
    session.employee
      ? supabase.from("payroll_entries").select("*").eq("employee_id", session.employee.id).eq("week_number", week).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const mySalesCur = (salesCur || []).filter((s) => s.employee_id === session.employee?.id);
  const mySalesPrev = (salesPrev || []).filter((s) => s.employee_id === session.employee?.id);

  // employee of the week (by revenue, this week; falls back to all-time if empty)
  const byEmp = {};
  (salesCur || []).forEach((s) => { byEmp[s.employee_id] = (byEmp[s.employee_id] || 0) + Number(s.total); });
  let empOfWeek = { name: "—", total: 0 };
  let topId = Object.keys(byEmp).sort((a, b) => byEmp[b] - byEmp[a])[0];
  if (topId) {
    const emp = (employees || []).find((e) => e.id === topId);
    if (emp) empOfWeek = { name: emp.full_name, total: byEmp[topId] };
  }

  // hours this week from shifts
  let hours = 0;
  if (session.employee) {
    const { data: shifts } = await supabase.from("shifts").select("clock_in, clock_out")
      .eq("employee_id", session.employee.id).gte("clock_in", cur.start.toISOString());
    (shifts || []).forEach((s) => {
      const end = s.clock_out ? new Date(s.clock_out) : new Date();
      hours += (end - new Date(s.clock_in)) / 3600000;
    });
  }

  const salaireCur = payrollCur?.salaire_brut || 0;
  const salesCurTotal = mySalesCur.length;
  const salesPrevTotal = mySalesPrev.length;
  const salaireDelta = pctDelta(salaireCur, 0);
  const salesDelta = pctDelta(salesCurTotal, salesPrevTotal);

  const stats = [
    { icon: "dollar", label: `Salaire S${week}`, value: formatMoney(salaireCur), delta: salaireDelta },
    { icon: "cart", label: `Nombre de ventes S${week}`, value: String(salesCurTotal), delta: salesDelta },
    { icon: "trending", label: "Employé de la semaine", value: empOfWeek.name, sub: `Total des ventes: ${formatMoney(empOfWeek.total)}` },
    { icon: "shield", label: "Grade actuel", value: session.employee?.grade || "—", sub: session.roles[0] ? `${session.roles[0].name}` : "" },
    { icon: "clock", label: `Heures travaillées S${week}`, value: hours.toFixed(1) + " h", delta: { label: "0.00%", cls: "flat" } },
  ];

  $("#stat-grid").innerHTML = "";
  stats.forEach((s) => {
    $("#stat-grid").appendChild(el(`
      <div class="card stat-card">
        <div class="row1">${s.label} ${ICONS[s.icon] || ""}</div>
        <div class="value" style="${s.value.length > 12 ? "font-size:16px" : ""}">${s.value}</div>
        ${s.delta ? `<div class="delta ${s.delta.cls}">${s.delta.label}</div>` : s.sub ? `<div class="delta flat">${s.sub}</div>` : ""}
      </div>
    `));
  });

  // ---- chart: revenue per day, last 14 days --------------------------------
  const { data: allRecent } = await supabase.from("sales").select("total, created_at")
    .eq("company_id", session.company.id)
    .gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString());

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const byDay = Object.fromEntries(days.map((d) => [d, 0]));
  (allRecent || []).forEach((s) => {
    const key = s.created_at.slice(0, 10);
    if (key in byDay) byDay[key] += Number(s.total);
  });

  const ctx = $("#ca-chart").getContext("2d");
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--c-accent").trim();
  const grid = styles.getPropertyValue("--c-border").trim();
  const text = styles.getPropertyValue("--c-text-muted").trim();

  new Chart(ctx, {
    type: "line",
    data: {
      labels: days.map((d) => d.slice(8, 10) + "/" + d.slice(5, 7)),
      datasets: [{
        label: "Chiffre d'affaire",
        data: days.map((d) => byDay[d]),
        borderColor: accent, backgroundColor: accent + "22",
        tension: .35, fill: true, pointRadius: 0, borderWidth: 2.5,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => "$" + c.parsed.y.toLocaleString("fr-FR") } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: text, font: { size: 11 } } },
        y: { grid: { color: grid }, ticks: { color: text, font: { size: 11 }, callback: (v) => "$" + v } },
      },
    },
  });

  // ---- fiche de paie ---------------------------------------------------------
  $("#fiche-top").innerHTML = `
    ${kv(ICONS.shield, "Rôle", session.roles[0]?.name || "—")}
    ${kv(ICONS.card, "Compte bancaire", `<span class="mono">${session.profile.bank_number || "—"}</span>`)}
  `;
  $("#fiche-mid").innerHTML = `
    ${kv(null, "Chiffre d'affaires", formatMoney(payrollCur?.chiffre_affaires || 0))}
    ${kv(null, "Avances", formatMoney(payrollCur?.avances || 0))}
    ${kv(null, "Primes", formatMoney(payrollCur?.primes || 0))}
    ${kv(null, "Salaire brut", formatMoney(payrollCur?.salaire_brut || 0))}
  `;
  $("#fiche-total").innerHTML = `
    <div class="kv-row total"><span class="k">Salaire à verser :</span><span class="v">${formatMoney(payrollCur?.paid ? 0 : (payrollCur?.salaire_brut || 0))}</span></div>
  `;
})();

function kv(icon, k, v) {
  return `<div class="kv-row"><span class="k">${icon || ""}${k}</span><span class="v">${v}</span></div>`;
}
