import { supabase } from "./supabaseClient.js";
import { $, $$, el, ICONS, toast, relTime, escapeHtml, openModal, closeModal } from "./ui.js";
import { getTheme, applyTheme, toggleMode, setAccent, setRadius, ACCENTS, RADII, saveCompanyTheme } from "./theme.js";
import { signOut, changePassword } from "./auth.js";

const ACCENT_COLOR_MAP = { or: "#F0B90B", green: "#16A34A", blue: "#2563EB", purple: "#7C3AED", orange: "#EA580C", red: "#DC2626", teal: "#0D9488", pink: "#DB2777" };

const NAV = [
  { group: "Dashboard", items: [
    { href: "dashboard.html", label: "Accueil", icon: "home", perm: "dashboard.view" },
    { href: "pos.html", label: "Point de vente", icon: "cart", perm: "pos.access" },
    { href: "employee-report.html", label: "Bilan employé", icon: "bars", perm: "sales.view_bilan_employe" },
  ]},
  { group: "Comptabilité", items: [
    { href: "sales.html", label: "Ventes", icon: "dollar", perms: ["sales.view_own", "accounting.view_ventes", "accounting.view_ventes_par_produit"] },
    { href: "accounting.html", label: "Bilan", icon: "pie", perms: ["accounting.view_bilan", "accounting.manage_facturation_client", "accounting.manage_factures_a_payer", "accounting.manage_salaires", "accounting.manage_charges"] },
  ]},
  { group: "Ressources humaines", items: [
    { href: "hr.html", label: "Personnel", icon: "users", perms: ["hr.view_personnel", "hr.view_archives", "hr.manage_recrutement", "hr.manage_services"] },
    { href: "announcements.html", label: "Annonces", icon: "megaphone", perm: "announcements.view" },
  ]},
  { group: "Mon entreprise", items: [
    { href: "roles.html", label: "Gestion des rôles", icon: "shield", perm: "company.manage_roles" },
    { href: "company.html", label: "Entreprise", icon: "settings", perms: ["company.manage_inventory", "company.manage_partners", "company.manage_bank", "company.manage_settings"] },
  ]},
];

function canAccess(session, it) {
  return it.perms ? it.perms.some((p) => session.can(p)) : session.can(it.perm);
}

export function mountShell({ session }) {
  const path = location.pathname.split("/").pop() || "dashboard.html";

  const navHtml = NAV.map((g) => `
    <div class="nav-group-label">${g.group}</div>
    ${g.items.map((it) => {
      const has = canAccess(session, it);
      const isActive = it.href.split("?")[0] === path;
      return `<a class="nav-item${isActive ? " active" : ""}${has ? "" : " locked"}" href="${has ? it.href : "#"}" title="${has ? "" : "Permission requise"}">
        ${ICONS[it.icon] || ""}<span>${it.label}</span>
      </a>`;
    }).join("")}
  `).join("");

  const sidebar = el(`
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand"><img class="brand-logo" src="assets/img/logo.webp" alt="" /> ${session.company?.name || "Los Santos Customs"}</div>
      <div class="sidebar-actions">
        <button class="btn-clock" id="clock-btn">${ICONS.play} Prise de service</button>
        <button class="btn-ghost-dark" id="announce-btn">${ICONS.megaphone} Menu annonces</button>
      </div>
      <nav class="nav-scroll">${navHtml}</nav>
      <div class="sidebar-footer">
        <div class="profile-menu" id="profile-menu">
          <div class="pm-item" id="pm-theme-toggle">${getTheme().mode === "dark" ? ICONS.sun : ICONS.moon}<span style="flex:1">Mode ${getTheme().mode === "dark" ? "clair" : "sombre"}</span></div>
          <div class="swatch-row" id="accent-row"></div>
          <hr/>
          <div class="pm-item" id="pm-password">🔑<span style="flex:1">Mot de passe</span></div>
          <div class="pm-item" id="pm-switch">${ICONS.swap}<span style="flex:1">Changer de profil</span></div>
          <div class="pm-item" id="pm-create">${ICONS.userPlus}<span style="flex:1">Créer un profil</span></div>
          <hr/>
          <div class="pm-item" id="pm-logout" style="color:var(--c-danger)">${ICONS.logout}<span style="flex:1">Déconnexion</span></div>
        </div>
        <div class="profile-row" id="profile-row">
          <div class="avatar">${session.profile.avatar_emoji || "🧑"}</div>
          <div class="profile-meta">
            <div class="name">${session.profile.full_name}</div>
            <div class="id mono">${session.profile.employee_number ?? ""}${session.roles[0] ? " · " + session.roles[0].name.slice(0,6).toUpperCase() : ""}</div>
          </div>
          ${ICONS.chevronDown}
        </div>
      </div>
    </aside>
  `);

  $("#sidebar-root").replaceWith(sidebar);

  const row = $("#accent-row", sidebar);
  ACCENTS.forEach((a) => {
    const sw = el(`<button class="swatch${getTheme().accent === a ? " active" : ""}" data-accent="${a}"></button>`);
    sw.style.setProperty("--sw", ACCENT_COLOR_MAP[a]);
    sw.addEventListener("click", () => {
      setAccent(a);
      $$(".swatch", row).forEach((s) => s.classList.toggle("active", s.dataset.accent === a));
      maybeSyncTheme(session);
    });
    row.appendChild(sw);
  });

  $("#pm-theme-toggle", sidebar).addEventListener("click", () => {
    const t = toggleMode();
    $("#pm-theme-toggle", sidebar).innerHTML = (t.mode === "dark" ? ICONS.sun : ICONS.moon) + `<span style="flex:1">Mode ${t.mode === "dark" ? "clair" : "sombre"}</span>`;
    maybeSyncTheme(session);
  });

  $("#profile-row", sidebar).addEventListener("click", (e) => {
    e.stopPropagation();
    $("#profile-menu", sidebar).classList.toggle("open");
  });
  document.addEventListener("click", () => $("#profile-menu", sidebar)?.classList.remove("open"));

  $("#pm-switch", sidebar).addEventListener("click", signOut);
  $("#pm-create", sidebar).addEventListener("click", () => { window.location.href = "index.html?tab=signup"; });
  $("#pm-logout", sidebar).addEventListener("click", signOut);
  $("#pm-password", sidebar).addEventListener("click", () => changePasswordModal());

  $("#announce-btn", sidebar).addEventListener("click", () => quickAnnounceModal(session));

  setupClock(sidebar, session);

  return sidebar;
}

export function mountTopbar({ session, onSearch = null } = {}) {
  const bar = el(`
    <header class="topbar" id="topbar">
      <button class="icon-btn" id="mobile-toggle" style="display:none">${ICONS.list}</button>
      <div class="search">${ICONS.search}<input id="global-search" placeholder="Rechercher..." /></div>
      <div class="topbar-spacer"></div>
      <div style="position:relative;">
        <button class="icon-btn" id="bell-btn" title="Annonces">${ICONS.bell}</button>
        <div class="notif-menu" id="notif-menu"></div>
      </div>
    </header>
  `);
  $("#topbar-root").replaceWith(bar);
  if (onSearch) $("#global-search", bar).addEventListener("input", (e) => onSearch(e.target.value));

  $("#mobile-toggle", bar).addEventListener("click", () => $("#sidebar")?.classList.toggle("open"));
  function checkWidth() { $("#mobile-toggle", bar).style.display = window.innerWidth <= 860 ? "flex" : "none"; }
  checkWidth();
  window.addEventListener("resize", checkWidth);

  if (session) setupNotifBell(bar, session);

  return bar;
}

function setupNotifBell(bar, session) {
  const btn = $("#bell-btn", bar);
  const menu = $("#notif-menu", bar);
  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const open = menu.classList.toggle("open");
    if (!open || menu.dataset.loaded) return;
    menu.innerHTML = `<div style="padding:14px;font-size:12.5px;color:var(--c-text-faint);">Chargement...</div>`;
    const { data } = await supabase.from("announcements").select("title, created_at")
      .eq("company_id", session.company.id).order("created_at", { ascending: false }).limit(5);
    menu.dataset.loaded = "1";
    if (!data?.length) {
      menu.innerHTML = `<div style="padding:14px;font-size:12.5px;color:var(--c-text-faint);">Aucune annonce.</div>`;
      return;
    }
    menu.innerHTML = data.map((a) => `<div class="notif-item"><div class="nt">${escapeHtml(a.title)}</div><div class="nd">${relTime(a.created_at)}</div></div>`).join("")
      + `<a href="announcements.html" class="notif-footer">Voir toutes les annonces</a>`;
  });
  document.addEventListener("click", () => menu.classList.remove("open"));
}

async function maybeSyncTheme(session) {
  if (session.can("company.manage_settings")) {
    await saveCompanyTheme(supabase, session.company.id, getTheme());
  }
}

async function setupClock(sidebar, session) {
  const btn = $("#clock-btn", sidebar);
  if (!session.employee) { btn.disabled = true; return; }
  const { data: open } = await supabase
    .from("shifts").select("*")
    .eq("employee_id", session.employee.id).is("clock_out", null)
    .order("clock_in", { ascending: false }).limit(1).maybeSingle();

  const render = (active) => {
    btn.dataset.active = active ? "true" : "false";
    btn.innerHTML = active ? `${ICONS.stop} Terminer le service` : `${ICONS.play} Prise de service`;
  };
  render(!!open);

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      if (btn.dataset.active === "true") {
        const { data: cur } = await supabase.from("shifts").select("id, clock_in")
          .eq("employee_id", session.employee.id).is("clock_out", null)
          .order("clock_in", { ascending: false }).limit(1).maybeSingle();
        if (cur) {
          await supabase.from("shifts").update({ clock_out: new Date().toISOString() }).eq("id", cur.id);
          const hrs = (Date.now() - new Date(cur.clock_in).getTime()) / 3600000;
          await supabase.from("employees").update({ hours_worked: (session.employee.hours_worked || 0) + hrs })
            .eq("id", session.employee.id);
          toast("Service terminé — bonne pause !");
        }
        render(false);
      } else {
        await supabase.from("shifts").insert({ company_id: session.company.id, employee_id: session.employee.id });
        toast("Prise de service enregistrée");
        render(true);
      }
    } catch (e) { toast(e.message || "Erreur", "error"); }
    btn.disabled = false;
  });
}

function changePasswordModal() {
  openModal({
    title: "Changer mon mot de passe",
    bodyHtml: `
      <div class="field"><label>Nouveau mot de passe</label><input class="input" id="cp-new" type="password" autocomplete="new-password" /></div>
      <div class="field"><label>Confirmer</label><input class="input" id="cp-confirm" type="password" autocomplete="new-password" /></div>
    `,
    footHtml: `<button class="btn btn-outline" data-close-modal>Annuler</button><button class="btn btn-accent" id="cp-save">Enregistrer</button>`,
    onMount: (m) => {
      $("#cp-save", m).addEventListener("click", async () => {
        const a = $("#cp-new", m).value, b = $("#cp-confirm", m).value;
        if (a.length < 6) return toast("6 caractères minimum", "error");
        if (a !== b) return toast("Les mots de passe ne correspondent pas", "error");
        try {
          await changePassword(a);
          toast("Mot de passe mis à jour");
          closeModal();
        } catch (e) { toast(e.message || "Erreur", "error"); }
      });
    },
  });
}

function quickAnnounceModal(session) {
  if (!session.can("announcements.publish")) {
    if (session.can("announcements.view")) window.location.href = "announcements.html";
    else toast("Tu n'as pas la permission de publier une annonce", "error");
    return;
  }
  openModal({
    title: "Publier une annonce",
    bodyHtml: `
      <div class="field"><label>Titre</label><input class="input" id="qa-title" placeholder="~p~ Ouvert" /></div>
      <div class="field"><label>Image (URL)</label><input class="input" id="qa-image" placeholder="https://..." /></div>
      <div class="field"><label>Message</label><textarea class="input" id="qa-msg" rows="4" placeholder="Ton message..."></textarea></div>
    `,
    footHtml: `<button class="btn btn-outline" data-close-modal>Annuler</button><button class="btn btn-accent" id="qa-submit">Publier</button>`,
    onMount: (m) => {
      $("#qa-submit", m).addEventListener("click", async () => {
        const title = $("#qa-title", m).value.trim();
        const message = $("#qa-msg", m).value.trim();
        if (!title || !message) { toast("Titre et message requis", "error"); return; }
        const { error } = await supabase.from("announcements").insert({
          company_id: session.company.id, title, message,
          image_url: $("#qa-image", m).value.trim() || null, author_id: session.user.id,
        });
        if (error) { toast(error.message, "error"); return; }
        toast("Annonce publiée");
        closeModal();
        if (location.pathname.endsWith("announcements.html")) window.dispatchEvent(new Event("lsc:refresh"));
      });
    },
  });
}
