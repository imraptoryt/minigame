import { supabase } from "./supabaseClient.js";
import { $, $$, el, ICONS, toast, openModal, closeModal } from "./ui.js";
import { getTheme, applyTheme, toggleMode, setAccent, setRadius, ACCENTS, RADII, saveCompanyTheme } from "./theme.js";
import { signOut, changePassword } from "./auth.js";

const NAV = [
  { group: "Dashboard", items: [
    { href: "dashboard.html", label: "Accueil", icon: "home", perm: "dashboard.view" },
    { href: "pos.html", label: "Point de vente", icon: "cart", perm: "pos.access" },
    { href: "sales.html?tab=mine", match: "sales.html", label: "Mes ventes", icon: "trending", perm: "sales.view_own" },
    { href: "employee-report.html", label: "Bilan employé", icon: "bars", perm: "sales.view_bilan_employe" },
  ]},
  { group: "Comptabilité", items: [
    { href: "accounting.html?tab=bilan", match: "accounting.html", label: "Bilan", icon: "pie", perm: "accounting.view_bilan" },
    { href: "sales.html?tab=all", match: "sales.html", label: "Ventes", icon: "dollar", perm: "accounting.view_ventes" },
    { href: "sales.html?tab=byproduct", match: "sales.html", label: "Ventes par produit", icon: "bars", perm: "accounting.view_ventes_par_produit" },
    { href: "accounting.html?tab=client", match: "accounting.html", label: "Facturation client", icon: "fileText", perm: "accounting.manage_facturation_client" },
    { href: "accounting.html?tab=payable", match: "accounting.html", label: "Factures à payer", icon: "file", perm: "accounting.manage_factures_a_payer" },
    { href: "accounting.html?tab=salaries", match: "accounting.html", label: "Salaires", icon: "handshake", perm: "accounting.manage_salaires" },
    { href: "accounting.html?tab=charges", match: "accounting.html", label: "Charges", icon: "list", perm: "accounting.manage_charges" },
  ]},
  { group: "Ressources humaines", items: [
    { href: "hr.html?tab=list", match: "hr.html", label: "Liste du personnel", icon: "users", perm: "hr.view_personnel" },
    { href: "hr.html?tab=archive", match: "hr.html", label: "Archives du personnel", icon: "archive", perm: "hr.view_archives" },
    { href: "hr.html?tab=recruitment", match: "hr.html", label: "Recrutement", icon: "briefcase", perm: "hr.manage_recrutement" },
    { href: "hr.html?tab=services", match: "hr.html", label: "Services", icon: "clock", perm: "hr.manage_services" },
    { href: "announcements.html", label: "Adverts", icon: "megaphone", perm: "announcements.view" },
  ]},
  { group: "Mon entreprise", items: [
    { href: "roles.html", label: "Gestion des rôles", icon: "shield", perm: "company.manage_roles" },
    { href: "company.html?tab=inventory", match: "company.html", label: "Inventaire & Production", icon: "box", perm: "company.manage_inventory" },
    { href: "company.html?tab=partners", match: "company.html", label: "Gestion partenaires", icon: "handshake", perm: "company.manage_partners" },
    { href: "company.html?tab=bank", match: "company.html", label: "Compte bancaire", icon: "bank", perm: "company.manage_bank" },
    { href: "company.html?tab=settings", match: "company.html", label: "Paramètres", icon: "settings", perm: "company.manage_settings" },
  ]},
];

export function mountShell({ session, defaultTab = "" }) {
  const path = location.pathname.split("/").pop() || "dashboard.html";
  const currentTab = new URLSearchParams(location.search).get("tab") || defaultTab;

  const navHtml = NAV.map((g) => `
    <div class="nav-group-label">${g.group}</div>
    ${g.items.map((it) => {
      const has = session.can(it.perm);
      const [hrefPath, hrefQuery] = it.href.split("?");
      const targetFile = it.match || hrefPath;
      const targetTab = hrefQuery ? new URLSearchParams(hrefQuery).get("tab") : null;
      const isActive = targetFile === path && (!targetTab || targetTab === currentTab);
      return `<a class="nav-item${isActive ? " active" : ""}${has ? "" : " locked"}" href="${has ? it.href : "#"}" title="${has ? "" : "Permission requise: " + it.perm}">
        ${ICONS[it.icon] || ""}<span>${it.label}</span>
      </a>`;
    }).join("")}
  `).join("");

  const sidebar = el(`
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand"><span class="logo">${session.company?.logo_emoji || "🚘"}</span> ${session.company?.name || "Los Santos Customs"}</div>
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

  // accent swatches
  const row = $("#accent-row", sidebar);
  ACCENTS.forEach((a) => {
    const sw = el(`<button class="swatch${getTheme().accent === a ? " active" : ""}" style="--sw:var(--c-accent);" data-accent="${a}"></button>`);
    // resolve real color for the dot regardless of current active accent
    const colorMap = { green: "#16A34A", blue: "#2563EB", purple: "#7C3AED", orange: "#EA580C", red: "#DC2626", teal: "#0D9488", pink: "#DB2777" };
    sw.style.setProperty("--sw", colorMap[a]);
    sw.addEventListener("click", () => {
      setAccent(a);
      $$(".swatch", row).forEach((s) => s.classList.toggle("active", s.dataset.accent === a));
      maybeSyncTheme(session);
    });
    row.appendChild(sw);
  });

  $("#pm-theme-toggle", sidebar).addEventListener("click", () => {
    const t = toggleMode();
    $("#pm-theme-toggle span", sidebar).textContent = `Mode ${t.mode === "dark" ? "clair" : "sombre"}`;
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

  // mobile toggle (topbar wires a hamburger to #sidebar .open)
  return sidebar;
}

export function mountTopbar({ session, onSearch = null } = {}) {
  const bar = el(`
    <header class="topbar" id="topbar">
      <button class="icon-btn" id="mobile-toggle" style="display:none">${ICONS.list}</button>
      <div class="search">${ICONS.search}<input id="global-search" placeholder="Rechercher..." /></div>
      <div class="topbar-spacer"></div>
      <a class="icon-btn" href="announcements.html" title="Annonces">${ICONS.bell}</a>
    </header>
  `);
  $("#topbar-root").replaceWith(bar);
  if (onSearch) $("#global-search", bar).addEventListener("input", (e) => onSearch(e.target.value));

  $("#mobile-toggle", bar).addEventListener("click", () => $("#sidebar")?.classList.toggle("open"));
  function checkWidth() { $("#mobile-toggle", bar).style.display = window.innerWidth <= 860 ? "flex" : "none"; }
  checkWidth();
  window.addEventListener("resize", checkWidth);
  return bar;
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
      <div class="field"><label>Nouveau mot de passe</label><input class="input" id="cp-new" type="password" minlength="6" autocomplete="new-password" /></div>
      <div class="field"><label>Confirmer</label><input class="input" id="cp-confirm" type="password" minlength="6" autocomplete="new-password" /></div>
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
