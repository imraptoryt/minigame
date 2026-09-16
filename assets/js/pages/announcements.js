import { supabase } from "../supabaseClient.js";
import { requireSession } from "../auth.js";
import { mountShell, mountTopbar } from "../sidebar.js";
import { $, $$, el, toast, relTime, openModal, closeModal, escapeHtml, ICONS } from "../ui.js";

const session = await requireSession({ permission: "announcements.view" });
mountShell({ session });
mountTopbar({ session });

if (!session.can("announcements.publish")) $("#publish-btn").style.display = "none";

async function load() {
  const { data } = await supabase.from("announcements")
    .select("*, profiles:author_id(full_name)")
    .eq("company_id", session.company.id)
    .order("created_at", { ascending: false })
    .limit(12);

  const list = data || [];
  renderCurrent(list[0]);
  renderHistory(list);
}

function copyField(label, value) {
  return `
    <div class="copy-field">
      <div class="txt"><strong>${label}:</strong> ${escapeHtml(value || "—")}</div>
      <button data-copy="${escapeHtml(value || "")}" title="Copier">${ICONS.copy}</button>
    </div>
  `;
}

function renderCurrent(ad) {
  const host = $("#current-ad");
  if (!ad) {
    host.innerHTML = `<div class="empty-state"><div class="icon">📣</div><h4>Aucune annonce</h4><p>Publie ta première annonce pour la voir apparaître ici.</p></div>`;
    return;
  }
  host.innerHTML = copyField("Titre", ad.title) + copyField("Image", ad.image_url) + copyField("Message", ad.message);
  $$("[data-copy]", host).forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast("Copié"); }
    catch { toast("Impossible de copier", "error"); }
  }));
}

function renderHistory(list) {
  const host = $("#history-list");
  if (!list.length) { host.innerHTML = `<div class="empty-state"><div class="icon">🗂️</div><p>Rien à afficher pour le moment.</p></div>`; return; }
  host.innerHTML = list.map((a) => `
    <div class="kv-row" style="padding:14px 20px;">
      <span class="k" style="gap:10px;"><span style="font-weight:700;color:var(--c-text);">${escapeHtml(a.profiles?.full_name || "Inconnu")}</span> <span class="faint">— ${escapeHtml(a.title)}</span></span>
      <span class="v faint" style="font-weight:500;">${relTime(a.created_at)}</span>
    </div>
  `).join("");
}

$("#publish-btn").addEventListener("click", () => {
  openModal({
    title: "Publier une annonce",
    bodyHtml: `
      <div class="field"><label>Titre</label><input class="input" id="pa-title" placeholder="~p~ Ouvert" /></div>
      <div class="field"><label>Image (URL)</label><input class="input" id="pa-image" placeholder="https://..." /></div>
      <div class="field"><label>Message</label><textarea class="input" id="pa-msg" rows="4" placeholder="Ton message..."></textarea></div>
    `,
    footHtml: `<button class="btn btn-outline" data-close-modal>Annuler</button><button class="btn btn-accent" id="pa-submit">Publier</button>`,
    onMount: (m) => {
      $("#pa-submit", m).addEventListener("click", async () => {
        const title = $("#pa-title", m).value.trim();
        const message = $("#pa-msg", m).value.trim();
        if (!title || !message) return toast("Titre et message requis", "error");
        const { error } = await supabase.from("announcements").insert({
          company_id: session.company.id, title, message,
          image_url: $("#pa-image", m).value.trim() || null, author_id: session.user.id,
        });
        if (error) return toast(error.message, "error");
        toast("Annonce publiée");
        closeModal();
        load();
      });
    },
  });
});

window.addEventListener("lsc:refresh", load);
load();
