import { supabase, isConfigured } from "./supabaseClient.js";

let _session = null; // cached: { user, profile, company, roles, permissionSet, employee }

const EMAIL_DOMAIN = "@lsc.internal";
export function emailFromUsername(username) {
  return (username || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "") + EMAIL_DOMAIN;
}

export function isLoggedInCache() {
  return !!_session;
}

/** Load (or reuse cached) full session: auth user + profile + roles + permissions. */
export async function loadSession({ force = false } = {}) {
  if (_session && !force) return _session;

  const { data: { session: authSession } } = await supabase.auth.getSession();
  if (!authSession) { _session = null; return null; }

  const uid = authSession.user.id;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
  if (!profile) { _session = { user: authSession.user, profile: null }; return _session; }

  const [{ data: company }, { data: userRoles }, { data: overrides }, { data: employee }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", profile.company_id).maybeSingle(),
    supabase.from("user_roles").select("role_id, roles(id, name, color, is_base, priority)").eq("user_id", uid),
    supabase.from("user_permission_overrides").select("permission_key, allowed").eq("user_id", uid),
    supabase.from("employees").select("*").eq("profile_id", uid).maybeSingle(),
  ]);

  const roles = (userRoles || []).map((r) => r.roles).filter(Boolean).sort((a, b) => b.priority - a.priority);
  const roleIds = roles.map((r) => r.id);

  let granted = new Set();
  if (roleIds.length) {
    const { data: rp } = await supabase
      .from("role_permissions")
      .select("permission_key, allowed")
      .in("role_id", roleIds);
    (rp || []).forEach((p) => { if (p.allowed) granted.add(p.permission_key); });
  }
  (overrides || []).forEach((o) => {
    if (o.allowed) granted.add(o.permission_key);
    else granted.delete(o.permission_key);
  });

  _session = {
    user: authSession.user,
    profile,
    company,
    roles,
    employee,
    permissionSet: granted,
    can: (key) => granted.has(key),
  };
  return _session;
}

export function getCachedSession() {
  return _session;
}

/** Call at the top of every protected page. Redirects to login if needed. */
export async function requireSession({ permission = null } = {}) {
  if (!isConfigured) {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;padding:24px;text-align:center;">
        <div>
          <h2 style="margin-bottom:8px;">Configuration Supabase manquante</h2>
          <p style="color:#777;max-width:460px;">Ouvre <code>assets/js/config.js</code> et renseigne ton <code>SUPABASE_URL</code> et ta <code>SUPABASE_ANON_KEY</code> (Project Settings → API dans Supabase), puis redéploie.</p>
        </div>
      </div>`;
    throw new Error("not configured");
  }

  const s = await loadSession();
  if (!s) { window.location.href = "index.html"; throw new Error("no session"); }
  if (!s.profile) { window.location.href = "index.html?onboarding=1"; throw new Error("no profile"); }
  if (permission && !s.can(permission)) {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;text-align:center;padding:24px;">
        <div>
          <div style="font-size:34px;margin-bottom:10px;">🔒</div>
          <h2 style="margin-bottom:6px;">Accès refusé</h2>
          <p style="color:#777;">Ton rôle ne te donne pas la permission <code>${permission}</code>.</p>
          <a href="dashboard.html" style="color:var(--c-accent,#16A34A);font-weight:700;">← Retour à l'accueil</a>
        </div>
      </div>`;
    throw new Error("forbidden");
  }
  return s;
}

export async function signIn(identifier, password) {
  const { data: email, error: lookupErr } = await supabase.rpc("resolve_login_email", { p_identifier: identifier });
  if (lookupErr) throw lookupErr;
  if (!email) throw new Error("IDENTIFIANT_INTROUVABLE");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await loadSession({ force: true });
}

export async function signUp({ username, charId, password, fullName, phone, bankNumber }) {
  const email = emailFromUsername(username);
  const { error: signUpErr } = await supabase.auth.signUp({ email, password });
  if (signUpErr) throw signUpErr;
  // If email confirmation is required, there's no session yet — this app never
  // uses real emails, so that setting must be off (see README) for this to work.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { needsConfirmation: true };
  const { error: rpcErr } = await supabase.rpc("bootstrap_or_join", {
    p_full_name: fullName, p_username: username, p_char_id: charId || null,
    p_phone: phone || null, p_bank_number: bankNumber || null,
  });
  if (rpcErr) throw rpcErr;
  await loadSession({ force: true });
  return { needsConfirmation: false };
}

export async function changePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
  _session = null;
  window.location.href = "index.html";
}
