// ============================================================================
// Small shared UI helpers used across every page.
// ============================================================================

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export function formatMoney(n) {
  const v = Number(n || 0);
  return "$" + v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

export function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function relTime(d) {
  if (!d) return "";
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  const units = [
    ["an", 31536000], ["mois", 2592000], ["semaine", 604800],
    ["jour", 86400], ["heure", 3600], ["minute", 60],
  ];
  if (diff < 45) return "à l'instant";
  for (const [label, secs] of units) {
    const v = Math.floor(diff / secs);
    if (v >= 1) return `il y a ${v} ${label}${v > 1 && label !== "mois" ? "s" : ""}`;
  }
  return "à l'instant";
}

// ---- toasts ----------------------------------------------------------------
export function toast(msg, type = "ok") {
  let root = $("#toast-root");
  if (!root) {
    root = el(`<div id="toast-root"></div>`);
    document.body.appendChild(root);
  }
  const t = el(`<div class="toast${type === "error" ? " error" : ""}">${escapeHtml(msg)}</div>`);
  root.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ---- generic modal -----------------------------------------------------------
export function openModal({ title, bodyHtml, wide = false, footHtml = "", onMount = null }) {
  closeModal();
  const backdrop = el(`
    <div class="modal-backdrop" id="active-modal">
      <div class="modal${wide ? " wide" : ""}">
        <div class="modal-head">
          <h3>${escapeHtml(title)}</h3>
          <button class="icon-btn" data-close-modal>${ICONS.x}</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footHtml ? `<div class="modal-foot">${footHtml}</div>` : ""}
      </div>
    </div>
  `);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop || e.target.closest("[data-close-modal]")) closeModal();
  });
  document.body.appendChild(backdrop);
  if (onMount) onMount(backdrop);
  return backdrop;
}
export function closeModal() {
  $("#active-modal")?.remove();
}

export function confirmDialog(message, onConfirm, { danger = true, confirmLabel = "Confirmer" } = {}) {
  openModal({
    title: "Confirmation",
    bodyHtml: `<p style="font-size:13.5px;line-height:1.6;color:var(--c-text-muted)">${escapeHtml(message)}</p>`,
    footHtml: `
      <button class="btn btn-outline" data-close-modal>Annuler</button>
      <button class="btn ${danger ? "btn-danger" : "btn-accent"}" id="confirm-yes">${escapeHtml(confirmLabel)}</button>
    `,
    onMount: (m) => {
      $("#confirm-yes", m).addEventListener("click", () => { closeModal(); onConfirm(); });
    },
  });
}

export function debounce(fn, ms = 250) {
  let h;
  return (...args) => { clearTimeout(h); h = setTimeout(() => fn(...args), ms); };
}

// ---- icon set (hand-drawn minimal, stroke=currentColor, 24x24) -------------
const S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
export const ICONS = {
  home: `<svg viewBox="0 0 24 24" ${S}><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>`,
  cart: `<svg viewBox="0 0 24 24" ${S}><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.6h7.4a2 2 0 0 0 2-1.6L21 8H6"/></svg>`,
  trending: `<svg viewBox="0 0 24 24" ${S}><path d="M3 17l6-6 4 4 8-8"/><path d="M15 6h6v6"/></svg>`,
  bars: `<svg viewBox="0 0 24 24" ${S}><path d="M4 20V10M12 20V4M20 20v-7"/></svg>`,
  pie: `<svg viewBox="0 0 24 24" ${S}><path d="M21.2 15.3A10 10 0 1 1 12 2v10z"/></svg>`,
  dollar: `<svg viewBox="0 0 24 24" ${S}><path d="M12 2v20M17 7a4 4 0 0 0-4-2c-2.5 0-4 1.3-4 3s1.5 2.6 4 3 4 1.4 4 3-1.5 3-4 3a4.5 4.5 0 0 1-4-2"/></svg>`,
  list: `<svg viewBox="0 0 24 24" ${S}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>`,
  fileText: `<svg viewBox="0 0 24 24" ${S}><path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5M9 13h6M9 17h6M9 9h2"/></svg>`,
  file: `<svg viewBox="0 0 24 24" ${S}><path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/></svg>`,
  users: `<svg viewBox="0 0 24 24" ${S}><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 5.5a3.2 3.2 0 0 1 0 6.2M21.5 20a6 6 0 0 0-4.5-6.7"/></svg>`,
  archive: `<svg viewBox="0 0 24 24" ${S}><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 13h4"/></svg>`,
  briefcase: `<svg viewBox="0 0 24 24" ${S}><rect x="2.5" y="7.5" width="19" height="12" rx="2"/><path d="M8 7.5V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5M2.5 12.5h19"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="9.2"/><path d="M12 7v5l3.2 2"/></svg>`,
  megaphone: `<svg viewBox="0 0 24 24" ${S}><path d="M3 11v3a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 8.5a4 4 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" ${S}><path d="M12 2l8 3.5v6c0 5-3.4 8.4-8 10.5-4.6-2.1-8-5.5-8-10.5v-6z"/><path d="M9 12l2 2 4-4"/></svg>`,
  box: `<svg viewBox="0 0 24 24" ${S}><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v9l9 5 9-5V8M12 13v9"/></svg>`,
  handshake: `<svg viewBox="0 0 24 24" ${S}><path d="M2 12l5-4 4 3 3-2 5 4"/><path d="M6 13l4 4 3-3 4 4 2-2-6-6"/></svg>`,
  card: `<svg viewBox="0 0 24 24" ${S}><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.5-2.4 1a7.7 7.7 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.7 7.7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.7 7.7 0 0 0 1.7-1l2.4 1 2-3.5z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" ${S}><circle cx="11" cy="11" r="7.5"/><path d="M21 21l-4.3-4.3"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" ${S}><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M9.5 20a2.5 2.5 0 0 0 5 0"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" ${S}><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 6.8 6.8 0 0 0 20 14.5z"/></svg>`,
  palette: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="9.5"/><circle cx="8.2" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="7.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.8" cy="10" r="1.3" fill="currentColor" stroke="none"/><path d="M15.5 15.5a2.2 2.2 0 0 1-2.2 2c-3.5 0-5.8-2.9-5.8-6a6.5 6.5 0 1 1 8.6 6.1 1 1 0 0 1-.6-2.1z"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" ${S}><path d="M6 9l6 6 6-6"/></svg>`,
  x: `<svg viewBox="0 0 24 24" ${S}><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" ${S}><path d="M12 5v14M5 12h14"/></svg>`,
  minus: `<svg viewBox="0 0 24 24" ${S}><path d="M5 12h14"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" ${S}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" ${S}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" ${S}><path d="M20 6L9 17l-5-5"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" ${S}><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" ${S}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>`,
  userPlus: `<svg viewBox="0 0 24 24" ${S}><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M18 8v6M21 11h-6"/></svg>`,
  swap: `<svg viewBox="0 0 24 24" ${S}><path d="M17 3l4 4-4 4"/><path d="M3 7h18M7 21l-4-4 4-4"/><path d="M21 17H3"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M7 4l14 8-14 8z"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
  percent: `<svg viewBox="0 0 24 24" ${S}><path d="M5 19L19 5M6.5 8.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>`,
  bank: `<svg viewBox="0 0 24 24" ${S}><path d="M3 10l9-6 9 6"/><path d="M4 10v9h16v-9M2 21h20M9 13v4M12 13v4M15 13v4"/></svg>`,
};
