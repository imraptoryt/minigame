// ============================================================================
// Theme engine. Three independent axes, each a CSS attribute on <html>:
//   data-theme  : "light" | "dark"
//   data-accent : "green" | "blue" | "purple" | "orange" | "red" | "teal" | "pink"
//   data-radius : "sharp" | "soft" | "round"
// Persisted to localStorage immediately (instant, per-device) and mirrored to
// companies.theme so a fresh login on another device picks up the shop's
// house theme as a starting point.
// ============================================================================

const KEY = "lsc_theme";

export const ACCENTS = ["green", "blue", "purple", "orange", "red", "teal", "pink"];
export const RADII = [
  { key: "sharp", label: "Carré" },
  { key: "soft", label: "Doux" },
  { key: "round", label: "Rond" },
];

export function getTheme() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { mode: "light", accent: "green", radius: "soft" };
  } catch { return { mode: "light", accent: "green", radius: "soft" }; }
}

export function applyTheme(theme) {
  const t = { ...getTheme(), ...theme };
  document.documentElement.setAttribute("data-theme", t.mode === "dark" ? "dark" : "light");
  document.documentElement.setAttribute("data-accent", t.accent || "green");
  document.documentElement.setAttribute("data-radius", t.radius || "soft");
  localStorage.setItem(KEY, JSON.stringify(t));
  return t;
}

// call immediately on every page (before paint) to avoid flash of wrong theme
applyTheme(getTheme());

export function toggleMode() {
  const t = getTheme();
  return applyTheme({ mode: t.mode === "dark" ? "light" : "dark" });
}
export function setAccent(accent) { return applyTheme({ accent }); }
export function setRadius(radius) { return applyTheme({ radius }); }

export async function adoptCompanyTheme(supabase, companyId) {
  if (!companyId) return;
  const { data } = await supabase.from("companies").select("theme").eq("id", companyId).single();
  if (data?.theme && !localStorage.getItem(KEY + "_seen_" + companyId)) {
    applyTheme({ mode: data.theme.mode === "dark" ? "dark" : "light", accent: data.theme.accent, radius: data.theme.radius });
    localStorage.setItem(KEY + "_seen_" + companyId, "1");
  }
}

export async function saveCompanyTheme(supabase, companyId, theme) {
  await supabase.from("companies").update({ theme }).eq("id", companyId);
}
