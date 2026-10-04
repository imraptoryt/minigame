/* Accueil : vue d'ensemble calculée depuis les données. */
(function () {
  'use strict';
  const LSC = window.LSC, U = LSC.ui, ST = LSC.stats, { esc, icon, money } = U;
  const st = { wk: 0 };

  /* Accueil : les infos de l'employé connecté (sa semaine, sa paie, ses objectifs).
   * Les statistiques de l'entreprise sont dans Bilan. */
  function render(el) {
    const A = LSC.app, S = A.state, me = A.meEmp(), role = A.myRole();
    const r = ST.range('week', '', '', st.wk), z = ST.employee(S, me.id, r), req = ST.prereq(S, me, r.from, r.to);
    const pay = S.payrolls.filter(p => p.employeeId === me.id && Date.parse(p.from) < r.to && Date.parse(p.to) > r.from).pop();
    const manual = (S.primes || []).filter(x => x.employeeId === me.id && !x.payrollId && ST.within(r, x.at));
    const hours = Math.round(z.minutes / 60 * 100) / 100;
    const p = pay ? { salary: pay.salary, hourly: pay.base - pay.salary, com: pay.commissions, primes: pay.primes || [], ded: pay.deduction || 0, bonus: pay.bonus || 0, total: pay.total }
      : { salary: role.salary || 0, hourly: hours * (role.hourly || 0), com: z.commissions, primes: manual.map(x => ({ label: x.reason, amount: x.amount })), ded: 0, bonus: 0 };
    if (!pay) p.total = p.salary + p.hourly + p.com + p.primes.reduce((a, x) => a + x.amount, 0);
    const primesTotal = p.primes.reduce((a, x) => a + x.amount, 0);
    const payBadge = pay ? (pay.status === 'paid' ? U.badge('Payée le ' + U.fmtDate(pay.paidAt).slice(0, 5), 'ok') : U.badge('À payer', 'warn')) : U.badge('Estimation', 'info');
    const open = S.sessions.find(x => x.employeeId === me.id && !x.end);
    const mySales = S.sales.filter(x => x.employeeId === me.id).slice(-6).reverse();
    const slips = S.payrolls.filter(x => x.employeeId === me.id).slice(-5).reverse();
    const abs = (S.absences || []).filter(x => x.employeeId === me.id).slice(-3).reverse(), warns = S.warnings.filter(x => x.employeeId === me.id).slice(-3).reverse();

    el.innerHTML = `<div class="page-head"><div class="who">${U.avatar(me.name, 'lg')}<div><h1>Bonjour ${esc(me.name.split(' ')[0])}</h1><div class="sub">${esc(role.name)} · Char ID ${esc(me.charId || '—')}${me.bankAccount ? ' · Compte ' + esc(me.bankAccount) : ''}</div></div></div>
        <div class="actions"><div class="week-nav"><button class="icon-btn sm" data-wk="-1" title="Semaine précédente">${icon('chevron-left')}</button><span>${esc(ST.weekLabel(r))}</span><button class="icon-btn sm" data-wk="1" title="Semaine suivante" ${st.wk >= 0 ? 'disabled' : ''}>${icon('chevron-right')}</button></div></div></div>
      <div class="grid stats">
        ${U.stat({ label: 'Mon CA', value: money(z.revenue), sub: `${z.count} vente${z.count > 1 ? 's' : ''}`, icon: 'dollar-sign', route: A.allowed('mysales') ? 'mysales' : '' })}
        ${U.stat({ label: 'Heures de service', value: U.fmtDur(z.minutes), sub: open ? 'en service en ce moment' : 'cette semaine', icon: 'timer', tone: 'info', route: 'service' })}
        ${U.stat({ label: 'Commission', value: money(p.com), sub: `${role.commission || 0}% des ventes`, icon: 'percent' })}
        ${U.stat({ label: 'Primes', value: money(primesTotal), sub: p.primes.length + ' prime(s)', icon: 'gift', tone: 'warn' })}
        ${U.stat({ label: pay && pay.status === 'paid' ? 'Salaire versé' : 'Salaire estimé', value: money(p.total), sub: 'salaire + primes', icon: 'banknote', tone: 'info' })}
        ${U.stat({ label: 'Objectifs', value: req.checks.length ? (req.ok ? 'Atteints' : 'Non atteints') : '—', valueCls: req.checks.length ? (req.ok ? 'ok-t' : 'danger-t') : '', sub: `CA ${money(req.ca)}`, icon: 'target', tone: req.ok ? '' : 'danger' })}
      </div>
      <div class="grid cols-3 mt">
        ${U.panel('Ma paie de la semaine', `<dl class="kv"><dt>Grade</dt><dd>${esc(role.name)}</dd><dt>Salaire fixe</dt><dd>${money(p.salary)}</dd>
          ${role.hourly || p.hourly ? `<dt>Heures (${U.fmtDur(z.minutes)} × ${money(role.hourly || 0)})</dt><dd>${money(p.hourly)}</dd>` : ''}<dt>Commissions</dt><dd>${money(p.com)}</dd>
          ${p.primes.map(x => `<dt class="muted">Prime — ${esc(x.label)}</dt><dd class="ok-t">+${money(x.amount)}</dd>`).join('')}
          ${p.bonus ? `<dt>Bonus</dt><dd class="ok-t">+${money(p.bonus)}</dd>` : ''}${p.ded ? `<dt>Retenue</dt><dd class="danger-t">-${money(p.ded)}</dd>` : ''}
          <dt><b>Total</b></dt><dd class="ok-t"><b>${money(p.total)}</b></dd><dt>Statut</dt><dd>${payBadge}</dd></dl>
          ${pay ? '' : '<p class="hint" style="margin:10px 0 0">Estimation : les primes automatiques sont ajoutées par la direction lors du calcul de la paie.</p>'}`, { icon: 'banknote' })}
        ${U.panel('Objectifs de la semaine', req.checks.length ? `<div class="list">${req.checks.map(c => `<div class="li"><span class="req ${c.ok ? 'ok' : 'ko'}"></span><div><b>${esc(c.label)}</b><small>${esc(c.detail || '')}</small></div><div class="meta">${U.badge(c.ok ? 'OK' : 'Manquant', c.ok ? 'ok' : 'danger')}</div></div>`).join('')}</div>` : U.empty({ icon: 'target', title: 'Aucun objectif', text: 'Aucun prérequis défini pour la paie.', hint: false }), { icon: 'target', right: req.checks.length ? U.badge(req.ok ? 'Atteints' : 'Non atteints', req.ok ? 'ok' : 'danger') : '' })}
        ${U.panel('Mon service', `<div class="service-card" style="padding:8px 0"><span class="service-state ${open ? 'on' : 'off'}">${U.dot(open ? 'ok' : '')}${open ? 'EN SERVICE' : 'HORS SERVICE'}</span>
          <div class="service-timer" style="font-size:34px">${U.fmtDur(z.minutes)}</div><div class="muted">${open ? 'Depuis ' + U.fmtTime(open.start) : 'cette semaine'}</div>
          <div class="service-actions"><button class="btn sm" data-go="service">${icon('history')}Mes services</button></div></div>`, { icon: 'timer' })}
      </div>
      <div class="grid cols-3 mt">
        ${U.panel('Mes dernières ventes', mySales.length ? `<div class="list">${mySales.map(x => `<div class="li clickable" data-sale="${x.id}"><span class="li-ic ${x.status === 'cancelled' ? 'danger' : 'ok'}">${icon(x.status === 'cancelled' ? 'x' : 'receipt')}</span><div style="min-width:0"><b>#${esc(x.ref)}</b><small>${esc(x.items.map(i => i.name).join(', '))}</small></div><div class="meta"><b>${money(x.total)}</b><small>${U.ago(x.createdAt)}</small></div></div>`).join('')}</div>` : U.empty({ icon: 'receipt', title: 'Aucune vente', hint: false }), { icon: 'receipt', right: A.allowed('mysales') ? `<button class="btn sm ghost" data-go="mysales">Tout voir</button>` : '' })}
        ${U.panel('Mes fiches de paie', slips.length ? `<div class="list">${slips.map(x => `<div class="li"><span class="li-ic ${x.status === 'paid' ? 'ok' : 'warn'}">${icon('banknote')}</span><div><b>${U.fmtDate(x.from).slice(0, 5)} → ${U.fmtDate(x.to).slice(0, 5)}</b><small>${x.status === 'paid' ? 'Payée' : 'À payer'}</small></div><div class="meta"><b>${money(x.total)}</b></div></div>`).join('')}</div>` : U.empty({ icon: 'banknote', title: 'Aucune fiche de paie', hint: false }), { icon: 'wallet' })}
        ${U.panel('Absences & avertissements', abs.length || warns.length ? `<div class="list">${abs.map(x => `<div class="li"><span class="li-ic info">${icon('calendar-off')}</span><div><b>Absence — ${esc(x.reason)}</b><small>du ${U.fmtDate(x.from)} au ${U.fmtDate(x.to)}</small></div></div>`).join('')}${warns.map(x => `<div class="li"><span class="li-ic danger">${icon('megaphone')}</span><div><b>Avertissement — ${esc(x.type)}</b><small>${esc(x.reason)}</small></div><div class="meta"><small>${U.fmtDate(x.at)}</small></div></div>`).join('')}</div>` : U.empty({ icon: 'shield-check', title: 'Rien à signaler', hint: false }), { icon: 'calendar-off', right: `<button class="btn sm ghost" data-go="absences">Absences</button>` })}
      </div>`;
    el.querySelectorAll('[data-wk]').forEach(b => b.onclick = () => { st.wk = Math.min(0, st.wk + +b.dataset.wk); if (!A.ensure(ST.range('week', '', '', st.wk).from)) render(el); });
    el.querySelectorAll('[data-sale]').forEach(x => x.onclick = () => LSC.open.sale(x.dataset.sale));
  }

  function lastSales(S) {
    const list = S.sales.slice(-7).reverse();
    if (!list.length) return U.empty({ icon: 'receipt', title: 'Aucune transaction', hint: false });
    return `<div class="list">${list.map(s => `<div class="li clickable" data-sale="${s.id}"><span class="li-ic ${s.status === 'cancelled' ? 'danger' : 'ok'}">${icon(s.status === 'cancelled' ? 'x' : 'receipt')}</span>
      <div style="min-width:0"><b>#${esc(s.ref)}</b><small>${s.partnerName ? esc(s.partnerName) + ' · ' : ''}${esc(s.employeeName)}</small></div>
      <div class="meta"><b class="${s.status === 'cancelled' ? 'faint' : ''}">${money(s.total)}</b><small>${U.ago(s.createdAt)}</small></div></div>`).join('')}</div>`;
  }
  function alerts(S) {
    const out = [];
    S.inventory.filter(i => i.qty <= i.min).forEach(i => out.push(['warn', 'package-x', `Stock faible : ${i.name}`, `${i.qty} ${i.unit} restants (min. ${i.min})`, 'inventory']));
    S.invoices.filter(i => ST.invoiceStatus(i) === 'overdue').forEach(i => out.push(['danger', 'file-warning', `Facture partenaire en retard : ${i.ref}`, `${i.customerName} · ${money(i.total)}`, 'invoices']));
    const drafts = S.payrolls.filter(p => p.status !== 'paid').length;
    if (drafts && LSC.app.can('payroll.manage')) out.push(['info', 'banknote', `${drafts} fiche(s) de paie à traiter`, 'Valider puis payer', 'payroll']);
    if (LSC.app.can('bank.view') && ST.bankBalance(S) < 5000) out.push(['danger', 'landmark', 'Trésorerie faible', money(ST.bankBalance(S)), 'bank']);
    if (!out.length) return U.empty({ icon: 'shield-check', title: 'Aucune alerte', text: 'Tout est en ordre.', hint: false });
    return `<div class="list">${out.slice(0, 7).map(a => `<div class="li ${LSC.app.allowed(a[4]) ? 'clickable' : ''}" ${LSC.app.allowed(a[4]) ? `data-go="${a[4]}"` : ''}><span class="li-ic ${a[0]}">${icon(a[1])}</span><div style="min-width:0"><b>${esc(a[2])}</b><small>${esc(a[3])}</small></div></div>`).join('')}</div>`;
  }
  LSC.pages.home = { render };
  LSC.home = { lastSales, alerts };
})();
