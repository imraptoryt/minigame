/* Statistiques calculées à partir des données (aucun chiffre en dur). */
(function () {
  'use strict';
  const DAY = 864e5, HOUR = 36e5;
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const sod = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const pad = n => String(n).padStart(2, '0');
  const ts = iso => iso ? Date.parse(iso) : NaN;

  /* wk = décalage en semaines (0 = semaine en cours, -1 = semaine précédente...) */
  function range(period, from, to, wk) {
    const now = Date.now(), d = new Date(now);
    let a, b, bucket = 'day';
    if (period === 'today') { a = sod(now); b = a + DAY - 1; bucket = 'hour'; }
    else if (period === 'week') { a = sod(sod(now) - ((d.getDay() + 6) % 7) * DAY + (wk || 0) * 7 * DAY + 12 * 36e5); b = sod(a + 7.5 * DAY) - 1; }
    else if (period === 'year') { a = new Date(d.getFullYear(), 0, 1).getTime(); b = new Date(d.getFullYear() + 1, 0, 1).getTime() - 1; bucket = 'month'; }
    else if (period === 'custom') {
      a = from ? Date.parse(from + 'T00:00:00') : sod(now) - 29 * DAY;
      b = to ? Date.parse(to + 'T23:59:59') : now;
      if (b < a) { const x = a; a = b; b = x; }
      bucket = b - a > 62 * DAY ? 'month' : 'day';
    } else if (period === 'all') { a = 0; b = now + DAY; bucket = 'month'; }
    else { a = new Date(d.getFullYear(), d.getMonth(), 1).getTime(); b = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1; }
    return { period, from: a, to: b, bucket };
  }
  /* Période précédente de même durée écoulée (ex. 1-3 oct. comparé à 1-3 sept.) */
  /* numéro de semaine ISO + libellé « Semaine 40 · 28/09 → 04/10 » */
  function weekNum(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); const w1 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w1) / DAY - 3 + (w1.getDay() + 6) % 7) / 7); }
  function weekLabel(r) { const f = new Date(r.from), t = new Date(r.to); return `Semaine ${weekNum(r.from)} · ${pad(f.getDate())}/${pad(f.getMonth() + 1)} → ${pad(t.getDate())}/${pad(t.getMonth() + 1)}`; }
  const prev = r => {
    const elapsed = Math.min(r.to, Date.now()) - r.from;
    let from = r.from - (r.to - r.from + 1);
    if (r.period === 'month') { const d = new Date(r.from); from = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(); }
    if (r.period === 'year') { const d = new Date(r.from); from = new Date(d.getFullYear() - 1, 0, 1).getTime(); }
    return { period: r.period, from, to: Math.min(from + elapsed, r.from - 1), bucket: r.bucket };
  };
  const within = (r, iso) => { const t = typeof iso === 'number' ? iso : ts(iso); return t >= r.from && t <= r.to; };

  function buckets(r) {
    const out = [];
    if (r.bucket === 'hour') for (let h = 0; h < 24; h++) out.push({ start: r.from + h * HOUR, label: pad(h) + 'h' });
    else if (r.bucket === 'month') {
      const s = new Date(r.from), e = new Date(Math.min(r.to, Date.now()));
      let y = s.getFullYear(), m = s.getMonth();
      if (r.period === 'year') { y = s.getFullYear(); m = 0; }
      const endKey = r.period === 'year' ? y * 12 + 11 : e.getFullYear() * 12 + e.getMonth();
      while (y * 12 + m <= endKey) { out.push({ start: new Date(y, m, 1).getTime(), label: MONTHS[m] }); m++; if (m > 11) { m = 0; y++; } }
    } else for (let t = sod(r.from); t <= r.to; t = sod(t + DAY * 1.5)) { const x = new Date(t); out.push({ start: t, label: pad(x.getDate()) + '/' + pad(x.getMonth() + 1) }); }
    return out;
  }
  function bucketIndex(r, list, t) {
    let i = list.length - 1;
    while (i > 0 && list[i].start > t) i--;
    return i;
  }

  /* Journal comptable unifié : chaque ligne porte ses montants par nature. */
  function ledger(S) {
    const L = [];
    S.sales.forEach(s => { if (s.status !== 'cancelled') L.push({ t: ts(s.createdAt), revenue: s.total, factory: s.factory, count: 1 }); });
    S.invoices.forEach(i => { if (i.status === 'paid' && !i.saleId) L.push({ t: ts(i.paidAt), revenue: i.total, count: 0 }); });
    S.expenses.forEach(e => L.push({ t: ts(e.date), charges: e.amount, cat: e.category }));
    S.bills.forEach(b => { if (b.status === 'paid') L.push({ t: ts(b.paidAt), bills: b.amount }); });
    S.payrolls.forEach(p => { if (p.status === 'paid') L.push({ t: ts(p.paidAt), salaries: p.base + (p.bonus || 0) + (p.primesTotal || 0) - p.deduction }); });
    S.commissions.forEach(c => L.push({ t: ts(c.createdAt), commissions: c.amount }));
    S.bank.forEach(b => { if (b.type === 'out' && b.category === 'achat') L.push({ t: ts(b.at), purchases: b.amount }); });
    return L;
  }
  const KEYS = ['revenue', 'count', 'factory', 'charges', 'bills', 'salaries', 'commissions', 'purchases'];
  function finish(z, S) {
    z.gross = z.revenue - z.factory;
    z.expenses = z.charges + z.bills + z.salaries + z.commissions + z.purchases;
    z.net = z.revenue - z.expenses;
    z.tax = Math.max(0, z.net) * (+S.company.taxRate || 0) / 100;
    z.netAfterTax = z.net - z.tax;
    return z;
  }
  const zero = () => { const z = {}; KEYS.forEach(k => { z[k] = 0; }); return z; };
  function summary(S, r) {
    const z = zero();
    ledger(S).forEach(e => { if (e.t >= r.from && e.t <= r.to) KEYS.forEach(k => { if (e[k]) z[k] += e[k]; }); });
    return finish(z, S);
  }
  function series(S, r) {
    const list = buckets(r), out = list.map(b => Object.assign(zero(), { label: b.label }));
    ledger(S).forEach(e => { if (e.t >= r.from && e.t <= r.to) { const o = out[bucketIndex(r, list, e.t)]; KEYS.forEach(k => { if (e[k]) o[k] += e[k]; }); } });
    return out.map(o => finish(o, S));
  }
  const trend = (cur, old) => old ? (cur - old) / Math.abs(old) * 100 : (cur ? 100 : 0);

  function salesIn(S, r, f) { return S.sales.filter(s => s.status !== 'cancelled' && within(r, s.createdAt) && (!f || f(s))); }

  function byProduct(S, r, f) {
    const m = {};
    salesIn(S, r, f).forEach(s => s.items.forEach(i => {
      const o = m[i.productId] || (m[i.productId] = { productId: i.productId, name: i.name, category: i.category, qty: 0, sales: 0, revenue: 0, margin: 0 });
      o.qty += i.qty; o.sales++; o.revenue += i.total; o.margin += i.total - i.cost * i.qty;
    }));
    return Object.values(m).sort((a, b) => b.revenue - a.revenue);
  }

  function minutes(S, empId, r) {
    const now = Date.now();
    return S.sessions.filter(s => s.employeeId === empId && within(r, s.start)).reduce((a, s) => a + (s.end ? s.minutes || 0 : LSCServer.minutesOf(s, now)), 0);
  }
  function employee(S, empId, r) {
    const sales = salesIn(S, r, s => s.employeeId === empId);
    const revenue = sales.reduce((a, s) => a + s.total, 0);
    const commissions = S.commissions.filter(c => c.employeeId === empId && within(r, c.createdAt)).reduce((a, c) => a + c.amount, 0);
    const services = sales.reduce((a, s) => a + s.items.reduce((b, i) => b + i.qty, 0), 0);
    const mins = minutes(S, empId, r);
    return { sales, revenue, count: sales.length, commissions, services, minutes: mins, avg: sales.length ? revenue / sales.length : 0 };
  }

  /* Absences d'un employé qui chevauchent une période */
  const absencesIn = (S, empId, from, to) => (S.absences || []).filter(a => a.employeeId === empId && ts(a.from) <= to && ts(a.to) + DAY - 1 >= from);
  const absentNow = (S, empId) => absencesIn(S, empId, Date.now(), Date.now()).length > 0;
  /* Prérequis de paie sur une période (règles dans Paramètres > Prérequis salaire) */
  function prereq(S, emp, from, to) {
    const R = S.company.payrollRules || {}, checks = [];
    const ca = S.sales.filter(s => s.employeeId === emp.id && s.status !== 'cancelled' && ts(s.createdAt) >= from && ts(s.createdAt) <= to).reduce((a, s) => a + s.total, 0);
    const abs = absencesIn(S, emp.id, from, to);
    const exempt = abs.length && R.absence === 'exempt';
    if (+R.quota > 0) checks.push({ label: `Quota de ventes (${'$' + Math.round(R.quota).toLocaleString('en-US')})`, ok: exempt || ca >= R.quota, detail: exempt ? 'Dispensé (absence)' : '$' + Math.round(ca).toLocaleString('en-US') });
    if (R.absence === 'block') checks.push({ label: 'Aucune absence', ok: !abs.length, detail: abs.length ? abs.length + ' absence(s)' : 'Présent' });
    if (+R.minDays > 0) { const days = Math.floor((to - ts(emp.hiredAt)) / DAY); checks.push({ label: `Ancienneté (${R.minDays} j min.)`, ok: days >= R.minDays, detail: days + ' j' }); }
    if ((R.roles || []).length) { const role = S.roles.find(r => r.id === emp.roleId); checks.push({ label: 'Grade éligible', ok: R.roles.includes(emp.roleId), detail: role ? role.name : '—' }); }
    return { ok: checks.every(c => c.ok), checks, absences: abs, ca };
  }

  function bankBalance(S) { return S.meta && typeof S.meta.balance === 'number' ? S.meta.balance : S.bank.reduce((a, b) => a + (b.type === 'in' ? b.amount : -b.amount), 0); }
  const invoiceStatus = i => i.status === 'sent' && ts(i.due) < Date.now() ? 'overdue' : i.status;
  const billStatus = b => b.status === 'pending' && ts(b.due) < Date.now() ? 'overdue' : b.status;

  window.LSC = window.LSC || {};
  window.LSC.stats = { range, prev, within, buckets, summary, series, trend, salesIn, byProduct, minutes, employee, bankBalance, invoiceStatus, billStatus, sod, DAY, weekNum, weekLabel, absencesIn, absentNow, prereq };
})();
