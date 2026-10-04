/* Ressources humaines : Bilan employé, Personnel, Archives, Recrutement,
 * Services (présence), Avertissements. */
(function () {
  'use strict';
  const LSC = window.LSC, U = LSC.ui, ST = LSC.stats, { esc, icon, money, onActs, idCell } = U;
  const A = () => LSC.app, S = () => LSC.app.state;
  const act = (name, label, ic, cls) => `<button class="icon-btn sm ${cls || ''}" data-a="${name}" title="${esc(label)}">${icon(ic, 'sm')}</button>`;

  /* =================== BILAN EMPLOYÉ =================== */
  const est = { period: 'week', emp: null };
  function empStats(el) {
    const s = S(), all = A().can('stats.all');
    if (!est.emp || !all) est.emp = all && est.emp ? est.emp : A().me.id;
    const e = A().emp(est.emp) || A().meEmp();
    const r = ST.range(est.period, est.from, est.to, est.wk), z = ST.employee(s, e.id, r), o = ST.employee(s, e.id, ST.prev(r));
    const list = ST.buckets(r), vals = list.map(() => 0), cnt = list.map(() => 0);
    z.sales.forEach(x => { const t = Date.parse(x.createdAt); let i = list.length - 1; while (i > 0 && list[i].start > t) i--; vals[i] += x.total; cnt[i]++; });
    const warns = s.warnings.filter(w => w.employeeId === e.id);
    const top = ST.byProduct(s, r, x => x.employeeId === e.id).slice(0, 5);
    const choices = s.employees.filter(x => all ? true : x.id === A().me.id).sort((a, b) => a.archived - b.archived || a.name.localeCompare(b.name));
    el.innerHTML = `<div class="page-head"><div class="who">${U.avatar(e.name, 'xl')}<div><h1>${esc(e.name)}</h1><div class="sub">${esc(A().roleName(e.roleId))} · ${U.status('staff', e.status)} ${e.archived ? U.badge('Archivé', 'muted') : ''} · Commission ${(s.roles.find(x => x.id === e.roleId) || {}).commission || 0}%${ST.absentNow(s, e.id) ? ' · ' + U.badge('En absence', 'warn') : ''}</div><div class="sub">${ident(e)}${e.bankAccount ? ' · Compte ' + esc(e.bankAccount) : ''}</div></div></div>
        <div class="actions">${all ? `<select class="input sm" id="esEmp">${U.opts(choices.map(x => ({ value: x.id, label: x.name + (x.archived ? ' (archivé)' : '') })), e.id)}</select>` : ''}${U.periodBar(est)}</div></div>
      <div class="grid stats">
        ${U.stat({ label: 'Ventes', value: money(z.revenue), trend: ST.trend(z.revenue, o.revenue), icon: 'dollar-sign' })}
        ${U.stat({ label: 'Nombre de ventes', value: z.count, trend: ST.trend(z.count, o.count), icon: 'receipt', tone: 'info' })}
        ${U.stat({ label: 'Commissions', value: money(z.commissions), icon: 'percent', tone: 'info' })}
        ${U.stat({ label: 'Services réalisés', value: z.services, icon: 'wrench' })}
        ${U.stat({ label: 'Heures travaillées', value: U.fmtDur(z.minutes), icon: 'timer', tone: 'warn' })}
        ${U.stat({ label: 'Panier moyen', value: money(z.avg), icon: 'shopping-basket' })}
      </div>
      <div class="grid cols-3 mt">
        ${U.panel('Évolution personnelle', U.chart({ labels: list.map(b => b.label), series: [{ name: 'Ventes ($)', values: vals }], height: 230 }), { cls: 'span-2', icon: 'chart-line' })}
        ${U.panel('Services les plus vendus', U.hbars(top.map(t => ({ label: `${t.name} (${t.qty})`, value: t.revenue }))), { icon: 'trophy' })}
      </div>
      <div class="grid cols-3 mt">
        <div class="panel span-2"><div class="panel-head"><h3>${icon('receipt')}Dernières ventes</h3></div><div class="panel-body" id="esSales"></div></div>
        ${U.panel('Avertissements', warns.length ? `<div class="list">${warns.slice().reverse().map(w => `<div class="li"><span class="li-ic warn">${icon('megaphone')}</span><div><b>#${w.num} · ${esc(w.type)}</b><small>${esc(w.reason)}</small><small class="faint">${esc(w.authorName)} · ${U.fmtDate(w.at)}</small></div></div>`).join('')}</div>` : U.empty({ icon: 'shield-check', title: 'Aucun avertissement', hint: false }), { icon: 'megaphone' })}
      </div>
      ${(e.promotions || []).length ? `<div class="mt">${U.panel('Évolution de carrière', `<div class="list">${e.promotions.slice().reverse().map(p => `<div class="li"><span class="li-ic ok">${icon('arrow-up-right')}</span><div><b>${esc(p.from)} → ${esc(p.to)}</b><small>par ${esc(p.by)}</small></div><div class="meta"><small>${U.fmtDate(p.at)}</small></div></div>`).join('')}</div>`, { icon: 'award' })}</div>` : ''}`;
    U.table(el.querySelector('#esSales'), { id: 'es-sales', rows: z.sales, sort: 'createdAt', pageSize: 8, resetPage: true, compact: true, onRow: x => LSC.open.sale(x.id),
      empty: { icon: 'receipt', title: 'Aucune vente', text: 'Aucune vente sur cette période.', hint: false },
      columns: [{ key: 'num', label: 'ID', render: x => '#' + x.num }, { key: 'customerName', label: 'Client' }, { key: 'total', label: 'Total', align: 'right', render: x => `<b>${money(x.total)}</b>` },
        { key: 'commission', label: 'Commission', align: 'right', render: x => money(x.commission) }, { key: 'createdAt', label: 'Date', render: x => U.fmtDT(x.createdAt) }] });
    const sel = el.querySelector('#esEmp');
    if (sel) sel.onchange = () => { est.emp = sel.value; empStats(el); };
    U.bindPeriod(el, est, () => empStats(el));
  }
  LSC.open.employee = id => {
    if (A().can('stats.all') || id === A().me.id) { est.emp = id; A().go('empstats'); }
    else U.toast("Vous n'avez pas les permissions nécessaires", 'error');
  };

  /* =================== PERSONNEL =================== */
  const pst = { q: '', status: '' };
  function staff(el) {
    const s = S(), r = ST.range('week'), mng = A().can('staff.manage');
    const list = s.employees.filter(e => !e.archived);
    const rows = list.map(e => {
      const z = ST.employee(s, e.id, r), last = s.sessions.filter(x => x.employeeId === e.id).pop();
      return Object.assign({}, e, { role: s.roles.find(x => x.id === e.roleId) || { name: '—', rank: 0 }, z, last: e.lastLogin || (last && last.start) || null });
    });
    const count = k => list.filter(e => e.status === k).length;
    el.innerHTML = `<div class="page-head"><div><h1>Liste du personnel</h1><div class="sub">${list.length} employés · statistiques de la semaine en cours</div></div>
        <div class="actions">${mng ? `<button class="btn primary sm" data-new>${icon('user-plus')}Nouveau compte</button>` : ''}</div></div>
      <div class="grid stats">${U.stat({ label: 'En service', value: count('on'), icon: 'user-check' })}${U.stat({ label: 'En pause', value: count('pause'), icon: 'coffee', tone: 'warn' })}
        ${U.stat({ label: 'Hors service', value: count('off'), icon: 'user-x', tone: 'info' })}${U.stat({ label: 'Suspendus', value: count('suspended'), icon: 'user-round-x', tone: 'danger' })}</div>
      ${mng && s.signups.length ? `<div class="panel mt"><div class="panel-head"><h3>${icon('user-plus')}Demandes de compte <span class="nav-badge">${s.signups.length}</span></h3><span class="muted">Validées au grade Apprenti</span></div>
        <div class="panel-body"><div class="list">${s.signups.map(g => `<div class="li" data-id="${g.id}"><div class="who">${U.avatar(g.name)}<div><b>${esc(g.name)}</b><small>${ident(g)}${g.bankAccount ? ' · Compte ' + esc(g.bankAccount) : ''} · ${U.ago(g.createdAt)}</small></div></div>
          <span class="row nowrap" style="margin-left:auto"><button class="btn sm primary" data-a="approve">${icon('check')}Valider</button><button class="btn sm ghost" data-a="reject">${icon('x')}Refuser</button></span></div>`).join('')}</div></div></div>` : ''}
      <div class="panel mt"><div class="panel-body"><div class="filters"><div class="search">${icon('search')}<input class="input" id="stq" placeholder="Nom, Char ID, Discord, compte..." value="${esc(pst.q)}"></div>
        <select class="input" id="sts"><option value="">Tous statuts</option>${U.opts([{ value: 'on', label: 'En service' }, { value: 'off', label: 'Hors service' }, { value: 'pause', label: 'En pause' }, { value: 'suspended', label: 'Suspendu' }], pst.status)}</select></div><div id="stTable"></div></div></div>`;
    const draw = reset => U.table(el.querySelector('#stTable'), {
      id: 'staff', sort: 'rank', resetPage: reset, cls: 'sticky-last', onRow: e => LSC.open.employee(e.id),
      rows: rows.filter(e => (!pst.status || e.status === pst.status) && (!pst.q || [e.name, e.charId, e.discordId, e.bankAccount].join(' ').toLowerCase().includes(pst.q.toLowerCase()))),
      empty: { icon: 'users', title: 'Aucun employé', text: 'Aucun employé ne correspond.' },
      columns: [
        { key: 'name', label: 'Nom Prénom', render: e => `<div class="who">${U.avatar(e.name)}<div><b>${esc(e.name)}</b><small>${ident(e)}</small></div></div>` },
        { key: 'rank', label: 'Grade', sortValue: e => e.role.rank, render: e => canRank(e) ? `<span class="row nowrap" data-id="${e.id}"><select class="input sm" data-rank="${e.id}">${U.opts(rankRoles(e).map(r => ({ value: r.id, label: r.name })), e.roleId)}</select>${act('up', 'Promouvoir', 'chevron-up')}${act('down', 'Rétrograder', 'chevron-down')}</span>` : esc(e.role.name) },
        { key: 'bankAccount', label: 'Compte bancaire', render: e => e.bankAccount ? `<span class="nowrap">${esc(e.bankAccount)}</span>` : '<span class="faint">—</span>' },
        { key: 'status', label: 'Statut', render: e => (e.dismissal ? U.badge('Licenciement en cours', 'warn') + ' ' : '') + (locked(e) ? U.badge('Bloqué', 'danger') + ' ' : '') + (e.mustReset || !e.hasPassword ? U.badge('Mot de passe à choisir', 'warn') + ' ' : '') + (mng && e.id !== A().me.id ? `<select class="input sm" data-status="${e.id}">${U.opts([{ value: 'on', label: 'En service' }, { value: 'off', label: 'Hors service' }, { value: 'pause', label: 'En pause' }, { value: 'suspended', label: 'Suspendu' }], e.status)}</select>` : U.status('staff', e.status)) + (ST.absentNow(s, e.id) ? ' ' + U.badge('En absence', 'warn') : '') },
        { key: 'last', label: 'Dernière connexion', render: e => e.last ? `${U.fmtDate(e.last)} <span class="muted">${U.fmtTime(e.last)}</span>` : '<span class="faint">—</span>' },
        { key: 'hours', label: 'Heures', align: 'right', sortValue: e => e.z.minutes, render: e => U.fmtDur(e.z.minutes) },
        { key: 'ca', label: 'CA généré', align: 'right', sortValue: e => e.z.revenue, render: e => `<b>${money(e.z.revenue)}</b>` },
        { key: 'com', label: 'Commission', align: 'right', sortValue: e => e.z.commissions, render: e => money(e.z.commissions) },
        { key: 'a', label: '', sortable: false, align: 'right', render: e => mng ? idCell(e.id, (locked(e) && canAct(e) ? act('unlock', 'Débloquer le compte', 'lock-open') : '') + (A().can('staff.resetpwd') && canAct(e) ? act('reset', 'Réinitialiser le mot de passe', 'key-round') : '') + act('edit', 'Modifier', 'pencil') + (e.id !== A().me.id ? act('arch', 'Archiver (départ)', 'archive', 'danger') : '')) : '' }]
    });
    el.querySelector('#stq').oninput = e => { pst.q = e.target.value; draw(true); };
    el.querySelector('#sts').onchange = e => { pst.status = e.target.value; draw(true); };
    el.querySelector('#stTable').addEventListener('change', e => { const rk = e.target.closest('[data-rank]'); if (rk) return setRank(rk.dataset.rank, rk.value); });
    el.querySelector('#stTable').addEventListener('change', e => { const sel = e.target.closest('[data-status]'); if (sel) A().call('staff.setStatus', { id: sel.dataset.status, status: sel.value }, 'Statut mis à jour'); });
    const nb = el.querySelector('[data-new]');
    if (nb) nb.onclick = () => LSC.forms.employee(null);
    onActs(el, { edit: id => LSC.forms.employee(id), arch: id => archive(id), up: id => stepRank(id, 1), down: id => stepRank(id, -1),
      unlock: id => A().call('staff.unlock', { id }, 'Compte débloqué'),
      reset: async id => { const e = s.employees.find(x => x.id === id); if (await U.confirm(`Réinitialiser le mot de passe de ${e.name} ? À sa prochaine connexion avec son Char ID, il devra en choisir un nouveau.`, { ok: 'Réinitialiser', danger: true })) A().call('staff.resetPassword', { id }, 'Mot de passe réinitialisé'); },
      approve: id => A().call('signups.approve', { id }, 'Compte validé : l’employé peut se connecter'),
      reject: async id => { const g = s.signups.find(x => x.id === id); if (g && await U.confirm(`Refuser la demande de compte de ${g.name} ?`, { ok: 'Refuser', danger: true })) A().call('signups.reject', { id }, 'Demande refusée'); } });
    draw();
  }
  const locked = e => e.lockedUntil && Date.parse(e.lockedUntil) > Date.now();
  const canAct = e => e.id !== A().me.id && (A().can('*') || (S().roles.find(r => r.id === e.roleId) || { rank: 0 }).rank < myRank());
  /* Changement de grade : uniquement vers des grades inférieurs au sien (sauf accès complet) */
  const myRank = () => A().myRole().rank || 0;
  const canRank = e => A().can('staff.manage') && (A().can('*') || (e.id !== A().me.id && (e.role ? e.role.rank : 0) < myRank()));
  const rankRoles = e => S().roles.filter(r => A().can('*') || r.rank < myRank() || r.id === e.roleId).sort((a, b) => a.rank - b.rank);
  async function setRank(id, roleId) {
    const e = S().employees.find(x => x.id === id), r = S().roles.find(x => x.id === roleId);
    if (!e || !r || e.roleId === roleId) return;
    if (!await U.confirm(`Passer ${e.name} au grade « ${r.name} » ?`, { ok: 'Changer le grade' })) return A().render();
    A().call('staff.setRole', { id, roleId }, `${e.name} est maintenant ${r.name}`);
  }
  function stepRank(id, dir) {
    const e = S().employees.find(x => x.id === id), list = rankRoles(Object.assign({}, e, { role: S().roles.find(r => r.id === e.roleId) }));
    const i = list.findIndex(r => r.id === e.roleId), next = list[i + dir];
    if (!next) return U.toast(dir > 0 ? 'Grade maximum que vous pouvez attribuer' : 'Déjà au grade le plus bas', 'warn');
    setRank(id, next.id);
  }
  /* Compte employé : Prénom, Nom, Char ID, Discord ID, compte bancaire, grade (Apprenti par défaut) */
  LSC.forms.employee = id => {
    const s = S(), e = id ? s.employees.find(x => x.id === id) : null;
    const myRank = (A().myRole().rank || 0), full = A().can('*');
    const roles = s.roles.filter(r => full || r.rank < myRank || (e && r.id === e.roleId)).sort((a, b) => a.rank - b.rank);
    const def = roles.find(r => r.id === 'apprenti') || roles[0];
    U.form({ title: e ? 'Compte — ' + e.name : 'Nouveau compte employé', icon: 'user-plus', values: e ? Object.assign({}, e, { hiredAt: U.toInputDate(e.hiredAt) }) : { roleId: def && def.id, hiredAt: U.toInputDate(Date.now()) },
      fields: [{ name: 'firstName', label: 'Prénom', required: true }, { name: 'lastName', label: 'Nom', required: true },
        { name: 'charId', label: 'Char ID', required: true, placeholder: 'ex. 1487' }, { name: 'discordId', label: 'Discord ID', placeholder: 'ex. 284019374512330000', hint: 'Identifiant numérique Discord.' },
        { name: 'bankAccount', label: 'N° compte bancaire', placeholder: 'ex. LSB-1487-4410', hint: 'Compte sur lequel le salaire est versé.' },
        { name: 'roleId', label: 'Grade', type: 'select', options: roles.map(r => ({ value: r.id, label: `${r.name} (${r.commission}%)` })), hint: e ? '' : 'Apprenti par défaut.' },
        { name: 'hiredAt', label: 'Date d’arrivée', type: 'date' }, { name: 'photo', label: 'Photo de profil (URL)', placeholder: 'https://...' },
        { name: 'license', label: 'Licence FiveM', placeholder: e ? 'Laisser vide pour ne pas changer' : 'license:xxxxxxxx', hint: 'Identifie le joueur côté serveur FiveM.' },
        { name: 'pwdInfo', type: 'html', full: true, html: `<p class="hint" style="margin:0">${icon('key-round', 'xs')} ${e ? 'Mot de passe caché. Pour en changer : bouton « Réinitialiser le mot de passe » (DRH +) dans la liste.' : 'L’employé choisira son mot de passe à sa première connexion avec son Char ID.'}</p>` }],
      onSubmit: v => A().call('staff.save', Object.assign({ id }, v), e ? 'Compte modifié' : 'Compte créé') });
  };
  /* identité courte affichée sous le nom */
  const ident = e => `Char ID ${esc(e.charId || '—')}${e.discordId ? ' · Discord ' + esc(e.discordId) : ''}`;
  function archive(id, reason) {
    const e = S().employees.find(x => x.id === id);
    U.form({ title: (reason === 'Licenciement' ? 'Licencier ' : 'Archiver ') + e.name, icon: 'archive', size: 'sm', danger: true, submit: reason === 'Licenciement' ? 'Licencier' : 'Archiver', values: { reason: reason || 'Démission' },
      intro: `<p class="lead" style="margin-bottom:12px">Ses données (ventes, salaires, commissions, avertissements, heures) sont conservées dans les archives.</p>`,
      fields: [{ name: 'reason', label: 'Motif du départ', type: 'select', full: true, options: ['Démission', 'Licenciement', 'Fin de contrat', 'Inactivité', 'Autre'] }],
      onSubmit: v => A().call('staff.archive', { id, reason: v.reason }, 'Employé archivé') });
  }

  /* =================== LICENCIEMENT (aide à la décision) ===================
   * Employés, grade, salaire des 2 dernières semaines terminées et prérequis (fond vert / rouge). */
  const dsst = { only: false };
  function dismiss(el) {
    const s = S(), w1 = ST.range('week', '', '', -1), w2 = ST.range('week', '', '', -2);
    if (A().ensure(w2.from)) { el.innerHTML = U.pageSkeleton(); return; }
    const myRk = myRank(), full = A().can('*');
    /* salaire d'une semaine : fiche de paie si elle existe, sinon estimation (fixe + heures + commissions) */
    const pay = (e, r) => {
      const p = s.payrolls.filter(x => x.employeeId === e.id && Date.parse(x.from) < r.to && Date.parse(x.to) > r.from);
      if (p.length) return { v: p.reduce((a, x) => a + x.total, 0), est: false, paid: p.every(x => x.status === 'paid') };
      if (Date.parse(e.hiredAt) > r.to) return { v: 0, est: false, none: true }; // pas encore arrivé
      const role = s.roles.find(x => x.id === e.roleId) || {}, z = ST.employee(s, e.id, r);
      return { v: (role.salary || 0) + z.minutes / 60 * (role.hourly || 0) + z.commissions, est: true };
    };
    const ongoing = s.employees.filter(e => !e.archived && e.dismissal);
    const rows = s.employees.filter(e => !e.archived && !e.dismissal).map(e => {
      const role = s.roles.find(x => x.id === e.roleId) || { name: '—', rank: 0 };
      const p2 = pay(e, w2), p1 = pay(e, w1), q2 = ST.prereq(s, e, w2.from, w2.to), q1 = ST.prereq(s, e, w1.from, w1.to);
      return Object.assign({}, e, { role, p2, p1, total: p2.v + p1.v, q2, q1, ok: q1.ok && q2.ok, days: Math.floor((Date.now() - Date.parse(e.hiredAt)) / ST.DAY) });
    });
    const ko = rows.filter(r => !r.ok).length;
    const money1 = p => p.none ? '<span class="faint" title="Pas encore arrivé">—</span>' : `<span title="${p.est ? 'Estimation (paie non calculée)' : p.paid ? 'Payé' : 'Fiche de paie'}">${p.est ? '~' : ''}${money(p.v)}</span>`;
    const req = (q, r) => `<span class="req ${q.ok ? 'ok' : 'ko'}" title="${esc(ST.weekLabel(r))} — ${esc(q.checks.map(c => (c.ok ? '✔ ' : '✘ ') + c.label + ' : ' + c.detail).join(' | ') || 'Aucun prérequis')}"></span>`;
    el.innerHTML = `<div class="page-head"><div><h1>Licenciement</h1><div class="sub">Aide à la décision : salaire et prérequis des deux dernières semaines terminées (${esc(ST.weekLabel(w2).replace('Semaine ', 'S'))} et ${esc(ST.weekLabel(w1).replace('Semaine ', 'S'))}).</div></div>
        <div class="actions"><label class="check"><input type="checkbox" id="dsOnly" ${dsst.only ? 'checked' : ''}><span>Prérequis non atteints uniquement</span></label></div></div>
      <div class="grid stats">${U.stat({ label: 'Employés', value: rows.length, icon: 'users' })}${U.stat({ label: 'Prérequis atteints', value: rows.length - ko, icon: 'circle-check' })}${U.stat({ label: 'Prérequis non atteints', value: ko, icon: 'circle-x', tone: 'danger' })}
        ${U.stat({ label: 'Masse salariale (2 sem.)', value: money(rows.reduce((a, r) => a + r.total, 0)), icon: 'banknote', tone: 'info' })}</div>
      ${ongoing.length ? `<div class="panel mt"><div class="panel-head"><h3>${icon('user-x')}Licenciements en cours (${ongoing.length})</h3><span class="muted">Le compte est supprimé de la compta à la confirmation</span></div>
        <div class="panel-body"><div class="list">${ongoing.map(e => { const d = e.dismissal, n = (s.company.dismissChecklist || []).length, k = (d.checks || []).length;
          const st = U.badge(`Étapes ${k}/${n}`, k === n ? 'ok' : 'warn');
          return `<div class="li" data-id="${e.id}">${U.avatar(e.name)}<div style="min-width:0"><b>${esc(e.name)}</b><small>${esc(A().roleName(e.roleId))} · Char ID ${esc(e.charId || '—')} · commencé par ${esc(d.by)} le ${U.fmtDate(d.at)}${d.reason ? ' · ' + esc(d.reason) : ''}</small></div>
            <span class="row nowrap" style="margin-left:auto">${st}<button class="btn sm" data-a="steps">${icon('list-checks')}Continuer</button><button class="btn sm ghost" data-a="undo">${icon('undo-2')}Annuler</button></span></div>`; }).join('')}</div></div></div>` : ''}
      <div class="panel mt"><div class="panel-body"><div id="dsTable"></div></div></div>`;
    U.table(el.querySelector('#dsTable'), {
      id: 'dismiss', sort: 'ok', rows: rows.filter(r => !dsst.only || !r.ok), rowClass: r => r.ok ? 'row-ok' : 'row-ko',
      empty: { icon: 'users', title: 'Aucun employé', text: 'Personne ne correspond.', hint: false },
      columns: [
        { key: 'name', label: 'Nom Prénom', render: e => `<div class="who">${U.avatar(e.name)}<div><b>${esc(e.name)}</b><small>Char ID ${esc(e.charId || '—')}</small></div></div>` },
        { key: 'rank', label: 'Grade', sortValue: e => e.role.rank, render: e => esc(e.role.name) },
        { key: 'p2', label: 'Salaire S-2', align: 'right', sortValue: e => e.p2.v, render: e => money1(e.p2) },
        { key: 'p1', label: 'Salaire S-1', align: 'right', sortValue: e => e.p1.v, render: e => money1(e.p1) },
        { key: 'total', label: 'Total 2 sem.', align: 'right', render: e => `<b>${money(e.total)}</b>` },
        { key: 'hiredAt', label: 'Arrivée', sortValue: e => Date.parse(e.hiredAt), render: e => `${U.fmtDate(e.hiredAt)}<br><small class="muted">${e.days} j</small>` },
        { key: 'discordId', label: 'Discord ID', render: e => e.discordId ? `<span class="nowrap">${esc(e.discordId)}</span>` : '<span class="faint">—</span>' },
        { key: 'ok', label: 'Prérequis', sortValue: e => (e.q1.ok ? 1 : 0) + (e.q2.ok ? 1 : 0), render: e => `<span class="row nowrap">${req(e.q2, w2)}${req(e.q1, w1)}${U.badge(e.ok ? 'Atteints' : 'Non atteints', e.ok ? 'ok' : 'danger')}</span>` },
        { key: 'a', label: '', sortable: false, align: 'right', render: e => e.id !== A().me.id && (full || e.role.rank < myRk) ? idCell(e.id, `<button class="btn sm danger" data-a="fire">${icon('user-x')}Licencier</button>`) : '' }]
    });
    el.querySelector('#dsOnly').onchange = e => { dsst.only = e.target.checked; dismiss(el); };
    onActs(el, {
      fire: id => dismissSteps(id), steps: id => dismissSteps(id),
      undo: async id => { const e = s.employees.find(x => x.id === id); if (await U.confirm(`Annuler le licenciement de ${e.name} ? Il retrouve l'accès à son compte.`, { ok: 'Annuler le licenciement' })) A().call('staff.dismissCancel', { id }, 'Licenciement annulé'); }
    });
  }

  /* Fenêtre de licenciement : cocher chaque étape ; confirmation possible quand tout est fait */
  function dismissSteps(id) {
    const s = S(), e = s.employees.find(x => x.id === id), d = e.dismissal || {}, steps = s.company.dismissChecklist || [];
    const m = U.modal({ title: 'Licencier ' + e.name, icon: 'user-x',
      body: `<p class="lead" style="margin-bottom:12px">Cochez chaque étape une fois faite. À la confirmation, un message part sur Discord et son compte est supprimé de la compta (historique conservé dans les archives).</p>
        <label class="field"><span class="field-label">Motif</span><input class="input" id="dsReason" maxlength="200" placeholder="ex. Absences répétées, faute grave..." value="${esc(d.reason || '')}"></label>
        <div class="section-title">Étapes</div><div class="list" id="dsChecks">${steps.map(x => `<label class="check li" style="padding:8px 4px"><input type="checkbox" value="${esc(x.id)}" ${(d.checks || []).includes(x.id) ? 'checked' : ''}><span>${esc(x.label)}</span></label>`).join('') || '<p class="muted">Aucune étape définie (Paramètres → Licenciement).</p>'}</div>
        <p class="hint" style="margin:10px 0 0">${icon('banknote', 'xs')} ${salaryInfo(s, e)}</p>`,
      foot: `<span class="muted nowrap" id="dsCount" style="font-size:12px"></span><span class="grow"></span><button class="btn ghost" data-close>Fermer</button><button class="btn" data-save>${icon('save')}Enregistrer</button><button class="btn danger" data-confirm>${icon('user-x')}Confirmer le licenciement</button>` });
    const boxes = () => [...m.el.querySelectorAll('#dsChecks input')], checked = () => boxes().filter(b => b.checked).map(b => b.value);
    const sync = () => { const n = checked().length; m.el.querySelector('#dsCount').textContent = `${n}/${steps.length} étape(s) faite(s)`; m.el.querySelector('[data-confirm]').disabled = n !== steps.length; };
    m.el.querySelector('#dsChecks').addEventListener('change', sync); sync();
    const send = async confirm => {
      const r = await A().call('staff.dismiss', { id, checks: checked(), reason: m.el.querySelector('#dsReason').value, confirm }, confirm ? `${e.name} licencié : compte supprimé de la compta` : 'Avancement enregistré');
      if (r.ok) m.close();
    };
    m.el.querySelector('[data-save]').onclick = () => send(false);
    m.el.querySelector('[data-confirm]').onclick = async () => { if (await U.confirm(`Confirmer le licenciement de ${e.name} ? Un message part sur Discord et son compte est supprimé de la compta.`, { danger: true, ok: 'Confirmer' })) send(true); };
  }
  /* état du dernier salaire (aide pour l'étape « Compta ») */
  function salaryInfo(s, e) {
    const r = ST.range('week'), p = s.payrolls.filter(x => x.employeeId === e.id && Date.parse(x.to) > r.from - 7 * ST.DAY).pop();
    if (!p) return 'Salaire de la semaine : pas encore calculé (Salaires & frais → Recalculer la paie).';
    return p.status === 'paid' ? `Dernier salaire : ${money(p.total)} payé le ${U.fmtDate(p.paidAt)}.` : `Dernier salaire : ${money(p.total)} à payer (Salaires & frais → Marquer payé).`;
  }

  /* =================== ARCHIVES =================== */
  function archives(el) {
    const s = S(), all = ST.range('all');
    const rows = s.employees.filter(e => e.archived).map(e => {
      const z = ST.employee(s, e.id, all);
      return Object.assign({}, e, { z, warns: s.warnings.filter(w => w.employeeId === e.id).length, paid: s.payrolls.filter(p => p.employeeId === e.id && p.status === 'paid').reduce((a, p) => a + p.total, 0) });
    });
    el.innerHTML = `<div class="page-head"><div><h1>Archives du personnel</h1><div class="sub">Anciens employés : les données sont conservées et restent consultables.</div></div></div>
      <div class="panel"><div class="panel-body" id="arTable"></div></div>`;
    U.table(el.querySelector('#arTable'), { id: 'archives', rows, sort: 'leftAt', onRow: e => detail(e),
      empty: { icon: 'archive', title: 'Aucune archive', text: "Aucun employé n'a quitté l'entreprise.", hint: false },
      columns: [{ key: 'name', label: 'Nom', render: e => `<div class="who">${U.avatar(e.name)}<div><b>${esc(e.name)}</b><small>${ident(e)}</small></div></div>` },
        { key: 'lastRoleName', label: 'Ancien grade' }, { key: 'hiredAt', label: 'Arrivée', render: e => U.fmtDate(e.hiredAt) }, { key: 'leftAt', label: 'Départ', render: e => U.fmtDate(e.leftAt) },
        { key: 'leaveReason', label: 'Motif', render: e => U.badge(e.leaveReason || '—') }, { key: 'ca', label: 'CA total', align: 'right', sortValue: e => e.z.revenue, render: e => money(e.z.revenue) },
        { key: 'h', label: 'Heures', align: 'right', sortValue: e => e.z.minutes, render: e => U.fmtDur(e.z.minutes) }, { key: 'warns', label: 'Avert.', align: 'right' },
        { key: 'a', label: '', sortable: false, align: 'right', render: e => A().can('staff.manage') ? idCell(e.id, act('restore', 'Réintégrer', 'undo-2')) : '' }] });
    onActs(el, { restore: async id => { if (await U.confirm('Réintégrer cet employé ?', { ok: 'Réintégrer' })) A().call('staff.restore', { id }, 'Employé réintégré'); } });
    function detail(e) {
      const s2 = S();
      U.modal({ title: e.name + ' — archives', icon: 'archive', size: 'lg',
        body: `<div class="grid stats">${U.stat({ label: 'CA total', value: money(e.z.revenue), sub: e.z.count + ' ventes', icon: 'dollar-sign' })}${U.stat({ label: 'Commissions', value: money(e.z.commissions), icon: 'percent', tone: 'info' })}
          ${U.stat({ label: 'Salaires versés', value: money(e.paid), icon: 'banknote', tone: 'info' })}${U.stat({ label: 'Heures', value: U.fmtDur(e.z.minutes), icon: 'timer', tone: 'warn' })}</div>
          <div class="grid cols-2 mt"><dl class="kv"><dt>Ancien grade</dt><dd>${esc(e.lastRoleName)}</dd><dt>Arrivée</dt><dd>${U.fmtDate(e.hiredAt)}</dd><dt>Départ</dt><dd>${U.fmtDate(e.leftAt)}</dd><dt>Motif</dt><dd>${esc(e.leaveReason)}</dd></dl>
          <div>${(e.promotions || []).map(p => `<div class="li"><span class="li-ic ok">${icon('arrow-up-right')}</span><div><b>${esc(p.from)} → ${esc(p.to)}</b><small>${U.fmtDate(p.at)} par ${esc(p.by)}</small></div></div>`).join('') || '<p class="muted" style="margin:0">Aucune promotion.</p>'}</div></div>
          <div class="section-title">Avertissements</div>${s2.warnings.filter(w => w.employeeId === e.id).map(w => `<div class="li"><span class="li-ic warn">${icon('megaphone')}</span><div><b>#${w.num} · ${esc(w.type)}</b><small>${esc(w.reason)} — ${U.fmtDate(w.at)}</small></div></div>`).join('') || '<p class="muted" style="margin:0">Aucun.</p>'}`,
        foot: `<button class="btn ghost" data-stats>${icon('chart-column')}Bilan détaillé</button><span class="grow"></span><button class="btn" data-close>Fermer</button>` })
        .el.querySelector('[data-stats]').onclick = () => { U.modal.top().close(); LSC.open.employee(e.id); };
    }
  }

  /* =================== SERVICES / PRÉSENCE =================== */
  const svst = { emp: '' };
  function service(el) {
    const s = S(), me = A().meEmp(), open = s.sessions.find(x => x.employeeId === me.id && !x.end);
    const onDuty = s.employees.filter(e => !e.archived && s.sessions.some(x => x.employeeId === e.id && !x.end));
    const week = ST.range('week'), mins = ST.minutes(s, me.id, week);
    const paused = open && open.pauses.length && !open.pauses[open.pauses.length - 1].end;
    const state = open ? (paused ? 'pause' : 'on') : 'off';
    const mng = A().can('staff.manage');
    /* historique : uniquement le sien ; chef d'équipe et + peuvent choisir un employé */
    const all = A().can('service.view_all');
    if (!all || !s.employees.some(e => e.id === svst.emp)) svst.emp = me.id;
    const who = s.employees.find(e => e.id === svst.emp) || me;
    const rows = s.sessions.filter(x => x.end && x.employeeId === who.id);
    el.innerHTML = `<div class="page-head"><div><h1>Services</h1><div class="sub">Prise et fin de service : les heures alimentent automatiquement la paie.</div></div></div>
      <div class="grid cols-3">
        <section class="panel"><div class="service-card">
          <span class="service-state ${state}">${U.dot(state === 'on' ? 'ok' : state === 'pause' ? 'warn' : '')}${state === 'on' ? 'EN SERVICE' : state === 'pause' ? 'EN PAUSE' : 'HORS SERVICE'}</span>
          <div class="service-timer" id="svTimer">${open ? U.fmtDur(LSCServer.minutesOf(open, Date.now())) : '00h00'}</div>
          <div class="muted">${open ? `Depuis ${U.fmtTime(open.start)}` : 'Vous n’êtes pas en service.'}</div>
          <div class="service-actions">${open ? `<button class="btn" data-sv="pause">${icon(paused ? 'play' : 'pause')}${paused ? 'Reprendre' : 'Pause'}</button><button class="btn danger" data-sv="end">${icon('square')}Terminer le service</button>` : `<button class="btn primary" data-sv="start">${icon('play')}Prendre son service</button>`}</div>
          <p class="muted" style="margin:18px 0 0;font-size:12px">Cette semaine : <b style="color:var(--text)">${U.fmtDur(mins)}</b></p></div></section>
        ${U.panel(`En service maintenant (${onDuty.length})`, onDuty.length ? `<div class="list">${onDuty.map(e => { const x = s.sessions.find(y => y.employeeId === e.id && !y.end); return `<div class="li">${U.avatar(e.name)}<div><b>${esc(e.name)}</b><small>${esc(A().roleName(e.roleId))} · depuis ${U.fmtTime(x.start)}</small></div><div class="meta">${U.status('staff', e.status)}<small data-live="${x.id}">${U.fmtDur(LSCServer.minutesOf(x, Date.now()))}</small></div>${mng && e.id !== me.id ? `<span data-id="${e.id}">${act('force', 'Clôturer son service', 'square', 'danger')}</span>` : ''}</div>`; }).join('')}</div>` : U.empty({ icon: 'user-x', title: 'Personne en service', hint: false }), { cls: 'span-2', icon: 'users' })}
      </div>
      <div class="panel mt"><div class="panel-head"><h3>${icon('history')}${who.id === me.id ? 'Mes services' : 'Services de ' + esc(who.name)}</h3>
        ${all ? `<select class="input sm" id="svEmp" data-combo>${U.opts(s.employees.filter(e => !e.archived).map(e => ({ value: e.id, label: e.name })), who.id)}</select>` : ''}</div>
        <div class="panel-body"><div class="grid stats" style="margin-bottom:12px">${U.stat({ label: 'Cette semaine', value: U.fmtDur(ST.minutes(s, who.id, week)), icon: 'timer' })}
          ${U.stat({ label: 'Semaine dernière', value: U.fmtDur(ST.minutes(s, who.id, ST.range('week', '', '', -1))), icon: 'history', tone: 'info' })}
          ${U.stat({ label: 'Heures non payées', value: U.fmtDur(rows.filter(x => !x.payrollId).reduce((a, x) => a + (x.minutes || 0), 0)), icon: 'hourglass', tone: 'warn' })}
          ${U.stat({ label: 'Services terminés', value: rows.length, icon: 'list-checks' })}</div><div id="svTable"></div></div></div>`;
    U.table(el.querySelector('#svTable'), { id: 'sessions', rows, sort: 'start', pageSize: 10,
      empty: { icon: 'timer', title: 'Aucun service', text: 'Aucun service terminé pour le moment.', hint: false },
      columns: [
        { key: 'start', label: 'Date', render: x => U.fmtDate(x.start) }, { key: 'in', label: 'Début', render: x => U.fmtTime(x.start) }, { key: 'end', label: 'Fin', render: x => U.fmtTime(x.end) },
        { key: 'minutes', label: 'Durée', align: 'right', render: x => `<b>${U.fmtDur(x.minutes)}</b>` }, { key: 'payrollId', label: 'Paie', render: x => x.payrollId ? U.badge('Payée', 'ok') : U.badge('À payer', 'muted') }] });
    const se = el.querySelector('#svEmp');
    if (se) se.onchange = () => { svst.emp = se.value || me.id; service(el); };
    el.querySelectorAll('[data-sv]').forEach(b => b.onclick = () => {
      const a = b.dataset.sv;
      A().call('service.' + a, {}, a === 'start' ? 'Service commencé' : a === 'end' ? 'Service terminé — heures enregistrées' : paused ? 'Service repris' : 'Pause commencée');
    });
    onActs(el, { force: async id => { if (await U.confirm(`Clôturer le service de ${A().empName(id)} ?`, { danger: true, ok: 'Clôturer' })) A().call('service.end', { employeeId: id }, 'Service clôturé'); } });
    A().onTick = () => {
      const t = document.getElementById('svTimer');
      if (!t) { A().onTick = null; return; }
      const cur = S().sessions.find(x => x.employeeId === me.id && !x.end);
      if (cur) t.textContent = U.fmtDur(LSCServer.minutesOf(cur, Date.now()));
      document.querySelectorAll('[data-live]').forEach(n => { const x = S().sessions.find(y => y.id === n.dataset.live); if (x) n.textContent = U.fmtDur(LSCServer.minutesOf(x, Date.now())); });
    };
  }

  /* =================== AVERTISSEMENTS =================== */
  const wst = { emp: '' };
  function warnings(el) {
    const s = S(), mng = A().can('warnings.manage');
    const rows = s.warnings.filter(w => !wst.emp || w.employeeId === wst.emp);
    el.innerHTML = `<div class="page-head"><div><h1>Avertissements</h1><div class="sub">Sanctions et rappels à l'ordre du personnel.</div></div>
        <div class="actions"><select class="input sm" id="wEmp" data-combo><option value="">Tous les employés</option>${U.opts(s.employees.map(e => ({ value: e.id, label: e.name })), wst.emp)}</select>${mng ? `<button class="btn primary sm" data-new>${icon('plus')}Nouvel avertissement</button>` : ''}</div></div>
      <div class="panel"><div class="panel-body" id="wTable"></div></div>`;
    U.table(el.querySelector('#wTable'), { id: 'warnings', rows, sort: 'at', resetPage: true, onRow: w => wDetail(w),
      empty: { icon: 'shield-check', title: 'Aucun avertissement', text: 'Aucun avertissement enregistré.', hint: false },
      columns: [{ key: 'num', label: 'N°', render: w => `<b>#${w.num}</b>` }, { key: 'employeeName', label: 'Employé', render: w => `<div class="who">${U.avatar(w.employeeName)}<b>${esc(w.employeeName)}</b></div>` },
        { key: 'type', label: 'Type', render: w => U.badge(w.type, w.type === 'Faute grave' ? 'danger' : 'warn') }, { key: 'reason', label: 'Motif', render: w => `<span class="muted">${esc(w.reason)}</span>` },
        { key: 'authorName', label: 'Auteur', render: w => esc(w.authorName) + `<br><small class="muted">${esc(w.authorRole || '')}</small>` }, { key: 'at', label: 'Date', render: w => U.fmtDate(w.at) },
        { key: 'a', label: '', sortable: false, align: 'right', render: w => mng ? idCell(w.id, act('del', 'Retirer', 'trash-2', 'danger')) : '' }] });
    el.querySelector('#wEmp').onchange = e => { wst.emp = e.target.value; warnings(el); };
    const nb = el.querySelector('[data-new]');
    if (nb) nb.onclick = () => U.form({ title: 'Nouvel avertissement', icon: 'megaphone',
      fields: [{ name: 'employeeId', label: 'Employé', type: 'select', full: true, attrs: 'data-combo', options: [{ value: '', label: 'Choisir...' }].concat(s.employees.filter(e => !e.archived && e.id !== A().me.id).map(e => ({ value: e.id, label: `${e.name} — ${A().roleName(e.roleId)}` }))) },
        { name: 'type', label: 'Type', type: 'select', full: true, options: ['Retard', 'Absence', 'Comportement', 'Non-respect des procédures', 'Faute grave', 'Autre'] },
        { name: 'reason', label: 'Motif', type: 'textarea', required: true, full: true }],
      onSubmit: v => A().call('warnings.save', v, 'Avertissement enregistré') });
    onActs(el, { del: async id => { if (await U.confirm('Retirer cet avertissement ?', { danger: true, ok: 'Retirer' })) A().call('warnings.delete', { id }, 'Avertissement retiré'); } });
  }
  function wDetail(w) {
    U.modal({ title: 'Avertissement #' + w.num, icon: 'megaphone', size: 'sm',
      body: `<dl class="kv"><dt>Employé</dt><dd>${esc(w.employeeName)}</dd><dt>Type</dt><dd>${esc(w.type)}</dd><dt>Auteur</dt><dd>${esc(w.authorName)} (${esc(w.authorRole || '')})</dd><dt>Date</dt><dd>${U.fmtDate(w.at)}</dd></dl>
        <div class="section-title">Motif</div><p style="margin:0">${esc(w.reason)}</p>`, foot: '<span class="grow"></span><button class="btn" data-close>Fermer</button>' });
  }

  /* =================== ABSENCES =================== */
  const abst = { tab: 'current' };
  function absences(el) {
    const s = S(), mng = A().can('staff.manage'), now = Date.now(), DAY = ST.DAY;
    const state = a => Date.parse(a.from) > now ? 'future' : Date.parse(a.to) + DAY - 1 < now ? 'past' : 'current';
    const all = s.absences.map(a => Object.assign({ st: state(a), days: Math.round((Date.parse(a.to) - Date.parse(a.from)) / DAY) + 1 }, a));
    const n = k => all.filter(a => a.st === k).length;
    const ST_L = { current: ['En cours', 'warn'], future: ['À venir', 'info'], past: ['Terminée', 'muted'] };
    el.innerHTML = `<div class="page-head"><div><h1>Absences</h1><div class="sub">Absences déclarées. Elles apparaissent dans la liste du personnel et sont prises en compte dans les prérequis de paie.</div></div>
        <div class="actions"><button class="btn primary sm" data-new>${icon('calendar-plus')}Déclarer une absence</button></div></div>
      <div class="panel"><div class="panel-body"><div class="filters">${U.tabs([{ id: 'current', label: 'En cours', count: n('current') }, { id: 'future', label: 'À venir', count: n('future') }, { id: 'past', label: 'Terminées', count: n('past') }, { id: 'all', label: 'Toutes', count: all.length }], abst.tab)}</div><div id="abTable"></div></div></div>`;
    U.table(el.querySelector('#abTable'), { id: 'absences', sort: 'from', resetPage: true,
      rows: all.filter(a => abst.tab === 'all' || a.st === abst.tab),
      empty: { icon: 'calendar-check', title: 'Aucune absence', text: 'Aucune absence dans cette catégorie.', hint: false },
      columns: [{ key: 'employeeName', label: 'Employé', render: a => `<div class="who">${U.avatar(a.employeeName)}<b>${esc(a.employeeName)}</b></div>` },
        { key: 'from', label: 'Du', render: a => U.fmtDate(a.from) }, { key: 'to', label: 'Au', render: a => U.fmtDate(a.to) },
        { key: 'days', label: 'Durée', align: 'right', render: a => a.days + ' j' }, { key: 'reason', label: 'Motif', render: a => `<span class="muted">${esc(a.reason)}</span>` },
        { key: 'createdBy', label: 'Déclarée par', render: a => esc(a.createdBy) }, { key: 'st', label: 'Statut', render: a => U.badge(ST_L[a.st][0], ST_L[a.st][1]) },
        { key: 'a', label: '', sortable: false, align: 'right', render: a => mng || a.employeeId === A().me.id ? idCell(a.id, act('edit', 'Modifier', 'pencil') + act('del', 'Supprimer', 'trash-2', 'danger')) : '' }] });
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { abst.tab = b.dataset.tab; absences(el); });
    el.querySelector('[data-new]').onclick = () => absenceForm(null);
    onActs(el, { edit: id => absenceForm(id), del: async id => { if (await U.confirm('Supprimer cette absence ?', { danger: true, ok: 'Supprimer' })) A().call('absences.delete', { id }, 'Absence supprimée'); } });
  }
  function absenceForm(id) {
    const s = S(), a = id ? s.absences.find(x => x.id === id) : null, mng = A().can('staff.manage');
    const emps = mng ? s.employees.filter(e => !e.archived) : [A().meEmp()];
    U.form({ title: a ? 'Modifier l’absence' : 'Déclarer une absence', icon: 'calendar-plus', size: 'sm',
      values: a ? Object.assign({}, a, { from: U.toInputDate(a.from), to: U.toInputDate(a.to) }) : { employeeId: A().me.id, from: U.toInputDate(Date.now()), to: U.toInputDate(Date.now()) },
      fields: [{ name: 'employeeId', label: 'Employé', type: 'select', full: true, attrs: 'data-combo', options: emps.map(e => ({ value: e.id, label: e.name })) },
        { name: 'from', label: 'Du', type: 'date', required: true }, { name: 'to', label: 'Au (inclus)', type: 'date', required: true },
        { name: 'reason', label: 'Motif', full: true, placeholder: 'Vacances, maladie, raison personnelle...' }],
      onSubmit: v => A().call('absences.save', Object.assign({ id }, v), a ? 'Absence modifiée' : 'Absence déclarée') });
  }
  LSC.forms.absence = absenceForm;

  /* =================== MON COMPTE =================== */
  function account(el) {
    const s = S(), e = A().meEmp(), role = A().myRole(), DAY = ST.DAY;
    const days = Math.floor((Date.now() - Date.parse(e.hiredAt)) / DAY), w = ST.range('week'), z = ST.employee(s, e.id, w);
    const ro = (label, value, ic) => `<div class="acc-ro">${icon(ic)}<div><small>${label}</small><b>${value}</b></div></div>`;
    el.innerHTML = `<div class="page-head"><div><h1>Mon compte</h1><div class="sub">Vos informations d'employé. Le Char ID, le grade et la date d'arrivée sont gérés par la direction.</div></div></div>
      <div class="grid cols-3">
        <section class="panel"><div class="panel-body acc-card">
          <div class="acc-photo">${e.photo ? `<img src="${esc(e.photo)}" alt="" onerror="this.remove()">` : ''}<span>${esc(e.name.split(' ').map(x => x[0]).slice(0, 2).join(''))}</span></div>
          <h2>${esc(e.name)}</h2><div class="muted">${esc(role.name)}</div><div style="margin-top:8px">${U.status('staff', e.status)}${ST.absentNow(s, e.id) ? ' ' + U.badge('En absence', 'warn') : ''}</div>
          <div class="acc-week"><div><b>${money(z.revenue)}</b><small>CA cette semaine</small></div><div><b>${U.fmtDur(z.minutes)}</b><small>Heures</small></div><div><b>${money(z.commissions)}</b><small>Commissions</small></div></div>
        </div></section>
        <section class="panel span-2"><div class="panel-head"><h3>${icon('id-card')}Informations</h3></div><div class="panel-body">
          <div class="acc-grid">
            ${ro('Nom Prénom', esc(e.name), 'user-round')}
            ${ro('Grade', esc(role.name) + ` <small class="muted">· commission ${role.commission || 0}%</small>`, 'shield-check')}
            ${ro('Char ID', esc(e.charId || '—'), 'fingerprint')}
            ${ro('Date d’arrivée', U.fmtDate(e.hiredAt) + ` <small class="muted">· ${days} jour${days > 1 ? 's' : ''}</small>`, 'calendar-check')}
          </div>
          <div class="section-title">Modifiable par vous</div>
          <form class="form" id="accForm">
            ${U.field({ name: 'photo', label: 'Photo de profil (URL)', full: true, placeholder: 'https://...', hint: 'Lien direct vers une image (png, jpg, gif).' }, e.photo || '')}
            ${U.field({ name: 'discordId', label: 'Discord ID', placeholder: 'ex. 284019374512330000' }, e.discordId || '')}
            ${U.field({ name: 'bankAccount', label: 'N° de compte bancaire', placeholder: 'ex. LSB-1487-4410', hint: 'Compte sur lequel votre salaire est versé.' }, e.bankAccount || '')}
            ${LSC.api.mode !== 'nui' ? U.field({ name: 'password', label: 'Nouveau mot de passe', type: 'password', placeholder: 'Laisser vide pour ne pas changer' }, '') + U.field({ name: 'password2', label: 'Confirmer le mot de passe', type: 'password' }, '') : ''}
          </form>
          <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" id="accSave">${icon('save')}Enregistrer</button></div>
        </div></section>
      </div>`;
    const f = el.querySelector('#accForm');
    f.elements.photo.addEventListener('input', () => {
      const box = el.querySelector('.acc-photo'), u = f.elements.photo.value.trim(), img = box.querySelector('img');
      if (img) img.remove();
      if (/^https?:\/\//.test(u)) box.insertAdjacentHTML('afterbegin', `<img src="${esc(u)}" alt="" onerror="this.remove()">`);
    });
    el.querySelector('#accSave').onclick = () => {
      const v = { photo: f.elements.photo.value.trim(), discordId: f.elements.discordId.value.trim(), bankAccount: f.elements.bankAccount.value.trim() };
      if (f.elements.password && f.elements.password.value) {
        if (f.elements.password.value !== f.elements.password2.value) return U.toast('Les mots de passe ne correspondent pas', 'error');
        v.password = f.elements.password.value;
      }
      A().call('account.update', v, 'Compte mis à jour');
    };
  }

  Object.assign(LSC.pages, { absences: { render: absences }, account: { render: account }, empstats: { render: empStats }, staff: { render: staff }, dismiss: { render: dismiss }, archives: { render: archives }, service: { render: service }, warnings: { render: warnings } });
})();
