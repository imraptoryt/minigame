import { supabase } from "../supabaseClient.js";
import { requireSession } from "../auth.js";
import { mountShell, mountTopbar } from "../sidebar.js";
import { $, $$, el, toast, openModal, closeModal, confirmDialog, escapeHtml } from "../ui.js";

const session = await requireSession({ permission: "company.manage_roles" });
mountShell({ session });
mountTopbar({ session });

const ROLE_COLORS = ["#16A34A", "#2563EB", "#7C3AED", "#EA580C", "#DC2626", "#0D9488", "#DB2777", "#CA8A04", "#4B5563", "#0EA5E9"];

let permissions = [];   // catalog
let profiles = [];      // company members
let roles = [];         // all roles
let selectedRoleId = null;
let detailTab = "permissions";

async function loadAll() {
  const [{ data: perms }, { data: profs }, { data: rls }] = await Promise.all([
    supabase.from("permissions").select("*").order("category"),
    supabase.from("profiles").select("*").eq("company_id", session.company.id).order("full_name"),
    supabase.from("roles").select("*").eq("company_id", session.company.id).order("priority", { ascending: false }),
  ]);
  permissions = perms || [];
  profiles = profs || [];
  roles = rls || [];

  const memberCounts = {};
  if (roles.length) {
    const { data: ur } = await supabase.from("user_roles").select("role_id");
    (ur || []).forEach((r) => { memberCounts[r.role_id] = (memberCounts[r.role_id] || 0) + 1; });
  }
  roles.forEach((r) => (r._count = memberCounts[r.id] || 0));

  renderRoleList();
  if (!selectedRoleId && roles.length) selectedRoleId = roles[0].id;
  if (selectedRoleId) await renderRoleDetail();
  else $("#role-detail").innerHTML = `<div class="card"><div class="empty-state"><div class="icon">🛡️</div><h4>Aucun rôle</h4><p>Crée ton premier rôle pour commencer.</p></div></div>`;

  populateOverrideSelect();
}

function renderRoleList() {
  const wrap = $("#role-list");
  wrap.innerHTML = "";
  roles.forEach((r) => {
    const row = el(`
      <div class="role-row${r.id === selectedRoleId ? " active" : ""}" data-id="${r.id}">
        <span class="swatch-dot" style="background:${r.color}"></span>
        <span class="rname">${escapeHtml(r.name)}${r.is_base ? ' <span class="badge badge-neutral" style="margin-left:4px;">base</span>' : ""}</span>
        <span class="rcount">${r._count}</span>
      </div>
    `);
    row.addEventListener("click", async () => { selectedRoleId = r.id; renderRoleList(); await renderRoleDetail(); });
    wrap.appendChild(row);
  });
}

async function renderRoleDetail() {
  const role = roles.find((r) => r.id === selectedRoleId);
  const host = $("#role-detail");
  if (!role) { host.innerHTML = ""; return; }

  host.innerHTML = `
    <div class="card">
      <div class="card-pad" style="border-bottom:1px solid var(--c-border);">
        <div class="flex-between" style="gap:14px;flex-wrap:wrap;">
          <div class="flex-center" style="flex:1;min-width:220px;">
            <span class="swatch-dot" style="width:16px;height:16px;background:${role.color};border-radius:50%;flex-shrink:0;"></span>
            <input class="input" id="role-name-input" value="${escapeHtml(role.name)}" style="font-weight:800;font-size:16px;border:none;background:transparent;padding-left:4px;max-width:220px;" ${role.is_base && role.name === "Patron" ? "" : ""}/>
          </div>
          <div class="flex-center">
            <label class="flex-center" style="font-size:12.5px;color:var(--c-text-muted);font-weight:600;">
              <input type="checkbox" id="role-base-check" ${role.is_base ? "checked" : ""}/> Rôle de base
            </label>
            <button class="btn btn-danger btn-sm" id="role-delete-btn">${escapeHtml("Supprimer")}</button>
          </div>
        </div>
        <div class="swatch-row" id="role-color-row" style="padding-left:0;"></div>
        <p class="faint" style="font-size:11.5px;margin-top:2px;">Un rôle "de base" est proposé automatiquement aux nouveaux employés.</p>
      </div>

      <div style="padding:16px 20px 0;">
        <div class="tabs" id="detail-tabs">
          <button class="tab-btn${detailTab === "permissions" ? " active" : ""}" data-t="permissions">Permissions</button>
          <button class="tab-btn${detailTab === "members" ? " active" : ""}" data-t="members">Membres (${role._count})</button>
        </div>
      </div>
      <div id="detail-body" style="padding:8px 20px 20px;"></div>
    </div>
  `;

  ROLE_COLORS.forEach((c) => {
    const sw = el(`<button class="swatch${role.color.toLowerCase() === c.toLowerCase() ? " active" : ""}" style="--sw:${c}"></button>`);
    sw.addEventListener("click", async () => { await updateRole(role.id, { color: c }); });
    $("#role-color-row", host).appendChild(sw);
  });

  $("#role-name-input", host).addEventListener("change", (e) => updateRole(role.id, { name: e.target.value.trim() || role.name }));
  $("#role-base-check", host).addEventListener("change", (e) => updateRole(role.id, { is_base: e.target.checked }));
  $("#role-delete-btn", host).addEventListener("click", () => {
    confirmDialog(`Supprimer le rôle "${role.name}" ? Les membres perdront les permissions qu'il accordait.`, async () => {
      const { error } = await supabase.from("roles").delete().eq("id", role.id);
      if (error) return toast(error.message, "error");
      selectedRoleId = null;
      toast("Rôle supprimé");
      await loadAll();
    });
  });

  $$("[data-t]", host).forEach((b) => b.addEventListener("click", async () => { detailTab = b.dataset.t; await renderRoleDetail(); }));

  if (detailTab === "permissions") await renderPermissionsTab(role);
  else await renderMembersTab(role);
}

async function updateRole(id, patch) {
  const { error } = await supabase.from("roles").update(patch).eq("id", id);
  if (error) return toast(error.message, "error");
  await loadAll();
}

async function renderPermissionsTab(role) {
  const { data: rp } = await supabase.from("role_permissions").select("permission_key, allowed").eq("role_id", role.id);
  const granted = new Set((rp || []).filter((p) => p.allowed).map((p) => p.permission_key));

  const byCat = {};
  permissions.forEach((p) => (byCat[p.category] ||= []).push(p));

  const body = $("#detail-body");
  body.innerHTML = "";
  Object.entries(byCat).forEach(([cat, perms]) => {
    const allOn = perms.every((p) => granted.has(p.key));
    const catEl = el(`
      <div class="perm-cat">
        <div class="perm-cat-head">
          <h4>${escapeHtml(cat)}</h4>
          <label class="switch"><input type="checkbox" data-cat="${escapeHtml(cat)}" ${allOn ? "checked" : ""}/><span class="track"></span></label>
        </div>
        ${perms.map((p) => `
          <div class="perm-row">
            <div class="pinfo">
              <div class="plabel">${escapeHtml(p.label)}</div>
              ${p.description ? `<div class="pdesc">${escapeHtml(p.description)}</div>` : ""}
              <div class="pkey">${p.key}</div>
            </div>
            <label class="switch"><input type="checkbox" data-perm="${p.key}" ${granted.has(p.key) ? "checked" : ""}/><span class="track"></span></label>
          </div>
        `).join("")}
      </div>
    `);
    body.appendChild(catEl);
  });

  $$("[data-perm]", body).forEach((cb) => cb.addEventListener("change", async () => {
    await togglePermission(role.id, cb.dataset.perm, cb.checked);
  }));
  $$("[data-cat]", body).forEach((cb) => cb.addEventListener("change", async () => {
    const cat = cb.dataset.cat;
    const keys = permissions.filter((p) => p.category === cat).map((p) => p.key);
    await Promise.all(keys.map((k) => togglePermission(role.id, k, cb.checked, false)));
    await renderPermissionsTab(role);
  }));
}

async function togglePermission(roleId, key, checked, refresh = true) {
  if (checked) {
    const { error } = await supabase.from("role_permissions").upsert({ role_id: roleId, permission_key: key, allowed: true });
    if (error) toast(error.message, "error");
  } else {
    const { error } = await supabase.from("role_permissions").delete().eq("role_id", roleId).eq("permission_key", key);
    if (error) toast(error.message, "error");
  }
  if (refresh) { /* switches already reflect state visually; no full reload needed */ }
}

async function renderMembersTab(role) {
  const { data: ur } = await supabase.from("user_roles").select("user_id").eq("role_id", role.id);
  const memberIds = new Set((ur || []).map((u) => u.user_id));

  const body = $("#detail-body");
  if (!profiles.length) { body.innerHTML = `<p class="muted">Aucun employé pour le moment.</p>`; return; }
  body.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th></th><th>Employé</th><th>N°</th></tr></thead><tbody>
    ${profiles.map((p) => `
      <tr>
        <td style="width:40px;"><label class="switch"><input type="checkbox" data-member="${p.id}" ${memberIds.has(p.id) ? "checked" : ""}/><span class="track"></span></label></td>
        <td>${escapeHtml(p.full_name)}</td>
        <td class="mono faint">${p.employee_number ?? "—"}</td>
      </tr>
    `).join("")}
  </tbody></table></div>`;

  $$("[data-member]", body).forEach((cb) => cb.addEventListener("change", async () => {
    if (cb.checked) {
      const { error } = await supabase.from("user_roles").insert({ user_id: cb.dataset.member, role_id: role.id });
      if (error) return toast(error.message, "error");
    } else {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", cb.dataset.member).eq("role_id", role.id);
      if (error) return toast(error.message, "error");
    }
    role._count += cb.checked ? 1 : -1;
    renderRoleList();
  }));
}

$("#new-role-btn").addEventListener("click", () => {
  openModal({
    title: "Nouveau rôle",
    bodyHtml: `<div class="field"><label>Nom du rôle</label><input class="input" id="nr-name" placeholder="Mécanicien" /></div>`,
    footHtml: `<button class="btn btn-outline" data-close-modal>Annuler</button><button class="btn btn-accent" id="nr-create">Créer</button>`,
    onMount: (m) => {
      $("#nr-create", m).addEventListener("click", async () => {
        const name = $("#nr-name", m).value.trim();
        if (!name) return toast("Nom requis", "error");
        const maxPriority = roles.length ? Math.max(...roles.map((r) => r.priority)) : 0;
        const color = ROLE_COLORS[roles.length % ROLE_COLORS.length];
        const { data, error } = await supabase.from("roles").insert({
          company_id: session.company.id, name, color, priority: maxPriority + 1,
        }).select().single();
        if (error) return toast(error.message, "error");
        closeModal();
        selectedRoleId = data.id;
        toast("Rôle créé — configure ses permissions");
        await loadAll();
      });
    },
  });
});

// ---- per-member permission overrides ("one perm at a time") ------------------
function populateOverrideSelect() {
  const sel = $("#override-member-select");
  const current = sel.value;
  sel.innerHTML = `<option value="">Choisir un employé...</option>` +
    profiles.map((p) => `<option value="${p.id}">${escapeHtml(p.full_name)}</option>`).join("");
  if (current) sel.value = current;
}
$("#override-member-select").addEventListener("change", renderOverrides);

async function computeInherited(profileId) {
  const { data: ur } = await supabase.from("user_roles").select("role_id, roles(name, priority)").eq("user_id", profileId);
  const myRoles = (ur || []).map((r) => r.roles).filter(Boolean).sort((a, b) => b.priority - a.priority);
  const roleIds = (ur || []).map((r) => r.role_id);
  const grantedBy = {};
  if (roleIds.length) {
    const { data: rp } = await supabase.from("role_permissions").select("permission_key, allowed, role_id").in("role_id", roleIds).eq("allowed", true);
    (rp || []).forEach((p) => {
      const roleName = myRoles.find((r) => r && roleIds.includes(p.role_id))?.name;
      if (!grantedBy[p.permission_key]) {
        const owningRole = (ur || []).find((u) => u.role_id === p.role_id)?.roles?.name;
        grantedBy[p.permission_key] = owningRole || "un rôle";
      }
    });
  }
  return grantedBy; // key -> role name that grants it (if any)
}

async function renderOverrides() {
  const profileId = $("#override-member-select").value;
  const body = $("#override-body");
  if (!profileId) { body.innerHTML = `<p class="muted" style="padding-top:10px;">Choisis un employé pour voir/forcer ses permissions individuelles.</p>`; return; }

  const [{ data: overrides }, inherited] = await Promise.all([
    supabase.from("user_permission_overrides").select("permission_key, allowed").eq("user_id", profileId),
    computeInherited(profileId),
  ]);
  const overrideMap = Object.fromEntries((overrides || []).map((o) => [o.permission_key, o.allowed]));

  const byCat = {};
  permissions.forEach((p) => (byCat[p.category] ||= []).push(p));

  body.innerHTML = Object.entries(byCat).map(([cat, perms]) => `
    <div class="perm-cat">
      <div class="perm-cat-head"><h4>${escapeHtml(cat)}</h4></div>
      ${perms.map((p) => {
        const state = p.key in overrideMap ? (overrideMap[p.key] ? "allow" : "deny") : "inherit";
        const via = inherited[p.key] ? ` <span class="faint">(via ${escapeHtml(inherited[p.key])})</span>` : "";
        return `
        <div class="perm-row">
          <div class="pinfo"><div class="plabel">${escapeHtml(p.label)}${via}</div><div class="pkey">${p.key}</div></div>
          <div class="tri-switch" data-key="${p.key}">
            <button data-v="inherit" class="${state === "inherit" ? "active" : ""}">Hérité</button>
            <button data-v="allow" class="${state === "allow" ? "active" : ""}">Autorisé</button>
            <button data-v="deny" class="${state === "deny" ? "active" : ""}">Refusé</button>
          </div>
        </div>`;
      }).join("")}
    </div>
  `).join("");

  $$(".tri-switch", body).forEach((tri) => {
    tri.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-v]");
      if (!btn) return;
      const key = tri.dataset.key;
      const v = btn.dataset.v;
      if (v === "inherit") {
        await supabase.from("user_permission_overrides").delete().eq("user_id", profileId).eq("permission_key", key);
      } else {
        await supabase.from("user_permission_overrides").upsert({ user_id: profileId, permission_key: key, allowed: v === "allow" });
      }
      $$("button", tri).forEach((b) => b.classList.toggle("active", b.dataset.v === v));
    });
  });
}

loadAll();
