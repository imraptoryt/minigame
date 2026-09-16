import { supabase, isConfigured } from "../supabaseClient.js";
import { $, $$, toast } from "../ui.js";
import { signIn, signUp, loadSession } from "../auth.js";

if (!isConfigured) {
  $("#config-note").textContent = "⚠️ Configure assets/js/config.js avec ton URL et ta clé anonyme Supabase avant de te connecter.";
}

// tab switching --------------------------------------------------------------
const tabs = $("#auth-tabs");
tabs.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  $$("button", tabs).forEach((b) => b.classList.toggle("active", b === btn));
  $("#form-signin").style.display = btn.dataset.tab === "signin" ? "flex" : "none";
  $("#form-signup").style.display = btn.dataset.tab === "signup" ? "flex" : "none";
});
if (new URLSearchParams(location.search).get("tab") === "signup") {
  $('button[data-tab="signup"]', tabs).click();
}

// redirect if already fully set up, or show "finish setup" if mid-way -------
(async () => {
  const s = await loadSession();
  if (s?.profile) { window.location.href = "dashboard.html"; return; }
  if (s?.user && !s.profile) {
    $("#form-signin").style.display = "none";
    $("#form-signup").style.display = "none";
    tabs.style.display = "none";
    $("#finish-setup").style.display = "flex";
  }
})();

$("#fs-submit").addEventListener("click", async () => {
  const btn = $("#fs-submit");
  btn.disabled = true;
  try {
    const { error } = await supabase.rpc("bootstrap_or_join", {
      p_full_name: $("#fs-name").value.trim(),
      p_username: $("#fs-username").value.trim(),
      p_char_id: $("#fs-charid").value.trim() || null,
      p_phone: $("#fs-phone").value.trim() || null,
      p_bank_number: $("#fs-bank").value.trim() || null,
    });
    if (error) throw error;
    window.location.href = "dashboard.html";
  } catch (e) { $("#fs-err").textContent = translateAuthError(e); btn.disabled = false; }
});

// sign in ---------------------------------------------------------------------
$("#form-signin").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#si-err").textContent = "";
  const btn = $("#si-submit");
  btn.disabled = true; btn.textContent = "Connexion...";
  try {
    await signIn($("#si-id").value.trim(), $("#si-password").value);
    window.location.href = "dashboard.html";
  } catch (err) {
    $("#si-err").textContent = translateAuthError(err);
    btn.disabled = false; btn.textContent = "Se connecter";
  }
});

// sign up -----------------------------------------------------------------------
$("#form-signup").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#su-err").textContent = "";
  const phone = $("#su-phone").value.trim();
  if (!phone.startsWith("555-")) {
    $("#su-err").textContent = "Le téléphone doit commencer par 555-";
    return;
  }
  const btn = $("#su-submit");
  btn.disabled = true; btn.textContent = "Création...";
  try {
    const res = await signUp({
      username: $("#su-username").value.trim(),
      charId: $("#su-charid").value.trim(),
      password: $("#su-password").value,
      fullName: $("#su-name").value.trim(),
      phone, bankNumber: $("#su-bank").value.trim(),
    });
    if (res.needsConfirmation) {
      $("#su-err").textContent = "Impossible de créer la session — désactive \"Confirm email\" dans Supabase (Authentication ▸ Settings), voir le README.";
    } else {
      window.location.href = "dashboard.html";
    }
  } catch (err) {
    $("#su-err").textContent = translateAuthError(err);
  }
  btn.disabled = false; btn.textContent = "Créer mon compte";
});

function translateAuthError(err) {
  const m = (err && err.message) || String(err || "");
  if (m.includes("IDENTIFIANT_INTROUVABLE") || m.includes("Invalid login")) return "Identifiant ou mot de passe incorrect.";
  if (m.includes("already registered") || m.includes("already exists") || m.includes("duplicate key")) {
    if (m.includes("username")) return "Ce nom d'utilisateur est déjà pris.";
    if (m.includes("charid")) return "Cet ID personnage est déjà utilisé.";
    return "Un compte existe déjà avec ces identifiants.";
  }
  if (m.includes("Password should be") || m.includes("password") && m.includes("character")) return m.replace("Password", "Le mot de passe").replace("should be at least", "doit faire au moins").replace("characters", "caractères");
  if (m.includes("phone_format")) return "Le téléphone doit commencer par 555-";
  return m || "Une erreur est survenue.";
}

