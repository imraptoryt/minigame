import { supabase } from "../supabaseClient.js";
import { requireSession } from "../auth.js";
import { mountShell, mountTopbar } from "../sidebar.js";
import { $, $$, el, toast, formatDate, escapeHtml, openModal, closeModal, confirmDialog } from "../ui.js";

const session = await requireSession();
const TABS = [
  { key: "list", label: "Liste du personnel", perm: "hr.view_personnel" },
  { key: "archive", label: "Archives", perm: "hr.view_archives" },
  { key: "recruitment", label: "Recrutement", perm: "hr.manage_recrutement" },
  { key: "services", label: "Services", perm: "hr.manage_services" },
];
const allowed = TABS.filter((t) => session.can(t.perm));
mountShell({ session, defaultTab: allowed[0]?.key || "list" });
mountTopbar({ session });

if (!allowed.length) {
  $("#hr-tabs").style.display = "none";
  $("#hr-body").innerHTML = `<div class="card"><div class="empty-state"><div class="icon">🔒</div><h4>Accès refusé</h4><p>Aucune permission RH ne t'a été attribuée.</p></div></div>`;
} else {
  let tab = new URLSearchParams(location.search).get("tab") || allowed[0].key;
  if (!allowed.some((t) => t.key === tab)) tab = allowed[0].key;

  $("#hr-tabs").innerHTML = allowed.map((t) => `<button class="tab-btn${t.key === tab ? " active" : ""}" data-k="${t.key}">${t.label}</button>`).join("");
  $$("[data-k]", $("#hr-tabs")).forEach((b) => b.addEventListener("click", () => {
    window.location.search = "?tab=" + b.dataset.k;
  }));

  renderTab(tab);
}

function renderTab(tab) {
  $("#add-btn").style.display = "none";
  if (tab === "list") return renderList();
  if (tab === "archive") return renderArchive();
  if (tab === "recruitment") return renderRecruitment();
  if (tab === "services") return renderServices();
}

// ---- Liste du personnel -----------------------------------------------------
async function renderList() {
  $("#tab-sub").textContent = "L'équipe active de l'entreprise";
  const canManage = session.can("hr.manage_personnel");
  if (canManage) { $("#add-btn").style.display = "inline-flex"; $("#add-btn").onclick = () => employeeModal(); }

  const { data } = await supabase.from("employees").select("*").eq("company_id", session.company.id).eq("status", "active").order("full_name");
  const body = $("#hr-body");
  if (!data?.length) { body.innerHTML = emptyState("👤", "Aucun employé", "Ajoute ton premier employé."); return; }

  body.innerHTML = `<div class="card"><div class="table-wrap"><table class="data">
    <thead><tr><th>Nom</th><th>Grade</th><th>Discord</th><th>Embauché le</th><th class="num">Heures</th>${canManage ? "<th></th>" : ""}</tr></thead>
    <tbody>${data.map((e) => `
      <tr>
        <td><strong>${escapeHtml(e.full_name)}</strong></td>
        <td><span class="badge badge-neutral">${escapeHtml(e.grade)}</span></td>
        <td class="faint">${escapeHtml(e.discord_id || "—")}</td>
        <td>${formatDate(e.hire_date)}</td>
        <td class="num">${Number(e.hours_worked || 0).toFixed(1)} h</td>
        ${canManage ? `<td style="text-align:right;white-space:nowrap;">
          <button class="btn btn-sm btn-outline" data-edit="${e.id}">Modifier</button>
          <button class="btn btn-sm btn-outline" data-archive="${e.id}">Archiver</button>
        </td>` : ""}
      </tr>
    `).join("")}</tbody>
  </table></div></div>`;

  $$("[data-edit]", body).forEach((b) => b.addEventListener("click", () => employeeModal(data.find((e) => e.id === b.dataset.edit))));
  $$("[data-archive]", body).forEach((b) => b.addEventListener("click", () => confirmDialog("Archiver cet employé ?", async () => {
    await supabase.from("employees").update({ status: "archived" }).eq("id", b.dataset.archive);
    toast("Employé archivé"); renderList();
  }, { confirmLabel: "Archiver" })));
}

function employeeModal(emp = null) {
  openModal({
    title: emp ? "Modifier l'employé" : "Nouvel employé",
    bodyHtml: `
      <div class="field"><label>Nom complet</label><input class="input" id="em-name" value="${emp ? escapeHtml(emp.full_name) : ""}" /></div>
      <div class="field"><label>Grade</label><input class="input" id="em-grade" value="${emp ? escapeHtml(emp.grade) : "Employé"}" /></div>
      <div class="field"><label>Discord</label><input class="input" id="em-discord" value="${emp ? escapeHtml(emp.discord_id || "") : ""}" /></div>
    `,
    footHtml: `<button class="btn btn-outline" data-close-modal>Annuler</button><button class="btn btn-accent" id="em-save">Enregistrer</button>`,
    onMount: (m) => {
      $("#em-save", m).addEventListener("click", async () => {
        const payload = { full_name: $("#em-name", m).value.trim(), grade: $("#em-grade", m).value.trim() || "Employé", discord_id: $("#em-discord", m).value.trim() || null };
        if (!payload.full_name) return toast("Nom requis", "error");
        const { error } = emp
          ? await supabase.from("employees").update(payload).eq("id", emp.id)
          : await supabase.from("employees").insert({ ...payload, company_id: session.company.id });
        if (error) return toast(error.message, "error");
        toast("Enregistré"); closeModal(); renderList();
      });
    },
  });
}

// ---- Archives -----------------------------------------------------------------
async function renderArchive() {
  $("#tab-sub").textContent = "Anciens employés";
  const { data } = await supabase.from("employees").select("*").eq("company_id", session.company.id).eq("status", "archived").order("full_name");
  const body = $("#hr-body");
  if (!data?.length) { body.innerHTML = emptyState("🗄️", "Aucune archive", "Les employés archivés apparaîtront ici."); return; }
  const canManage = session.can("hr.manage_personnel");
  body.innerHTML = `<div class="card"><div class="table-wrap"><table class="data">
    <thead><tr><th>Nom</th><th>Grade</th><th>Embauché le</th>${canManage ? "<th></th>" : ""}</tr></thead>
    <tbody>${data.map((e) => `
      <tr><td><strong>${escapeHtml(e.full_name)}</strong></td><td>${escapeHtml(e.grade)}</td><td>${formatDate(e.hire_date)}</td>
      ${canManage ? `<td style="text-align:right;"><button class="btn btn-sm btn-outline" data-restore="${e.id}">Restaurer</button></td>` : ""}</tr>
    `).join("")}</tbody>
  </table></div></div>`;
  $$("[data-restore]", body).forEach((b) => b.addEventListener("click", async () => {
    await supabase.from("employees").update({ status: "active" }).eq("id", b.dataset.restore);
    toast("Employé restauré"); renderArchive();
  }));
}

// ---- Recrutement -----------------------------------------------------------------
const STATUS_LABEL = { pending: "En attente", interview: "Entretien", accepted: "Accepté", rejected: "Refusé" };
async function renderRecruitment() {
  $("#tab-sub").textContent = "Candidatures reçues";
  $("#add-btn").style.display = "inline-flex"; $("#add-btn").onclick = () => appModal();

  const { data } = await supabase.from("recruitment_applications").select("*").eq("company_id", session.company.id).order("created_at", { ascending: false });
  const body = $("#hr-body");
  if (!data?.length) { body.innerHTML = emptyState("💼", "Aucune candidature", "Ajoute une candidature reçue sur Discord."); return; }

  body.innerHTML = `<div class="card"><div class="table-wrap"><table class="data">
    <thead><tr><th>Candidat</th><th>Discord</th><th>Poste</th><th>Statut</th><th></th></tr></thead>
    <tbody>${data.map((a) => `
      <tr>
        <td><strong>${escapeHtml(a.applicant_name)}</strong>${a.notes ? `<div class="faint" style="font-size:12px;">${escapeHtml(a.notes)}</div>` : ""}</td>
        <td class="faint">${escapeHtml(a.discord_id || "—")}</td>
        <td>${escapeHtml(a.position || "—")}</td>
        <td><select class="input" data-status="${a.id}" style="width:140px;padding:6px 8px;font-size:12.5px;">
          ${Object.entries(STATUS_LABEL).map(([k, l]) => `<option value="${k}" ${a.status === k ? "selected" : ""}>${l}</option>`).join("")}
        </select></td>
        <td style="text-align:right;"><button class="btn btn-sm btn-danger" data-del="${a.id}">Supprimer</button></td>
      </tr>
    `).join("")}</tbody>
  </table></div></div>`;

  $$("[data-status]", body).forEach((s) => s.addEventListener("change", async () => {
    await supabase.from("recruitment_applications").update({ status: s.value }).eq("id", s.dataset.status);
    toast("Statut mis à jour");
  }));
  $$("[data-del]", body).forEach((b) => b.addEventListener("click", () => confirmDialog("Supprimer cette candidature ?", async () => {
    await supabase.from("recruitment_applications").delete().eq("id", b.dataset.del);
    toast("Supprimée"); renderRecruitment();
  })));
}

function appModal() {
  openModal({
    title: "Nouvelle candidature",
    bodyHtml: `
      <div class="field"><label>Nom du candidat</label><input class="input" id="ap-name" /></div>
      <div class="field"><label>Discord</label><input class="input" id="ap-discord" /></div>
      <div class="field"><label>Poste visé</label><input class="input" id="ap-position" placeholder="Mécanicien" /></div>
      <div class="field"><label>Notes</label><textarea class="input" id="ap-notes" rows="3"></textarea></div>
    `,
    footHtml: `<button class="btn btn-outline" data-close-modal>Annuler</button><button class="btn btn-accent" id="ap-save">Ajouter</button>`,
    onMount: (m) => {
      $("#ap-save", m).addEventListener("click", async () => {
        const applicant_name = $("#ap-name", m).value.trim();
        if (!applicant_name) return toast("Nom requis", "error");
        const { error } = await supabase.from("recruitment_applications").insert({
          company_id: session.company.id, applicant_name,
          discord_id: $("#ap-discord", m).value.trim() || null,
          position: $("#ap-position", m).value.trim() || null,
          notes: $("#ap-notes", m).value.trim() || null,
        });
        if (error) return toast(error.message, "error");
        toast("Candidature ajoutée"); closeModal(); renderRecruitment();
      });
    },
  });
}

// ---- Services (prise de poste / journal des heures) ------------------------------
async function renderServices() {
  $("#tab-sub").textContent = "Prises de service en cours et historique";
  const [{ data: open }, { data: recent }] = await Promise.all([
    supabase.from("shifts").select("*, employees(full_name)").eq("company_id", session.company.id).is("clock_out", null).order("clock_in", { ascending: false }),
    supabase.from("shifts").select("*, employees(full_name)").eq("company_id", session.company.id).not("clock_out", "is", null).order("clock_out", { ascending: false }).limit(20),
  ]);

  const body = $("#hr-body");
  body.innerHTML = `
    <div class="card mb-16">
      <div class="card-title-row"><h3>En service actuellement</h3></div>
      <div style="padding:14px 20px 20px;">
        ${open?.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;">${open.map((s) => `<span class="badge badge-success">🟢 ${escapeHtml(s.employees?.full_name || "—")}</span>`).join("")}</div>` : `<p class="muted" style="font-size:13px;">Personne n'est en service pour le moment.</p>`}
      </div>
    </div>
    <div class="card">
      <div class="card-title-row"><h3>Historique récent</h3></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Employé</th><th>Début</th><th>Fin</th><th class="num">Durée</th></tr></thead>
        <tbody>${(recent || []).map((s) => {
          const dur = ((new Date(s.clock_out) - new Date(s.clock_in)) / 3600000).toFixed(1);
          return `<tr><td>${escapeHtml(s.employees?.full_name || "—")}</td><td>${formatDate(s.clock_in)}</td><td>${formatDate(s.clock_out)}</td><td class="num">${dur} h</td></tr>`;
        }).join("") || `<tr><td colspan="4" class="muted" style="text-align:center;padding:24px;">Aucun historique.</td></tr>`}</tbody>
      </table></div>
    </div>
  `;
}

function emptyState(icon, title, sub) {
  return `<div class="card"><div class="empty-state"><div class="icon">${icon}</div><h4>${title}</h4><p>${sub}</p></div></div>`;
}
