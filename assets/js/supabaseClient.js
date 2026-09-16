import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const cfg = window.LSC_CONFIG || {};

export const supabase = createClient(
  cfg.SUPABASE_URL || "https://placeholder.supabase.co",
  cfg.SUPABASE_ANON_KEY || "placeholder"
);

export const isConfigured =
  !!cfg.SUPABASE_URL &&
  !!cfg.SUPABASE_ANON_KEY &&
  !cfg.SUPABASE_URL.includes("YOUR-PROJECT") &&
  !cfg.SUPABASE_ANON_KEY.includes("YOUR-ANON");
