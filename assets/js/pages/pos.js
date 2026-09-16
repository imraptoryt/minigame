import { supabase } from "../supabaseClient.js";
import { requireSession } from "../auth.js";
import { mountShell, mountTopbar } from "../sidebar.js";
import { $, $$, el, toast, formatMoney, debounce, openModal, closeModal } from "../ui.js";

const session = await requireSession({ permission: "pos.access" });
mountShell({ session });
mountTopbar({ session });

const CAT_PERM = { services: "pos.services", ventes: "pos.ventes", customs: "pos.customs", peinture: "pos.peinture" };

let categories = [];
let products = [];
let partners = [];
let activeCatId = null;
let searchTerm = "";
let cart = []; // { productId, name, price, cost, qty }
let adjustment = 0; // + markup / - discount

(async () => {
  const [{ data: cats }, { data: prods }, { data: parts }] = await Promise.all([
    supabase.from("product_categories").select("*").eq("company_id", session.company.id).order("position"),
    supabase.from("products").select("*").eq("company_id", session.company.id).eq("active", true).order("position"),
    supabase.from("partners").select("*").eq("company_id", session.company.id).eq("active", true).order("name"),
  ]);

  categories = (cats || []).filter((c) => session.can(CAT_PERM[c.key] || "pos.access"));
  products = prods || [];
  partners = parts || [];

  if (!categories.length) {
    $("#cat-tabs").innerHTML = `<span class="muted" style="font-size:13px;">Aucune catégorie accessible avec ton rôle actuel.</span>`;
    $("#product-zone").innerHTML = "";
    return;
  }

  $("#cat-tabs").innerHTML = "";
  categories.forEach((c, i) => {
    const btn = el(`<button class="tab-btn${i === 0 ? " active" : ""}" data-id="${c.id}">${c.icon || ""} ${c.label}</button>`);
    btn.addEventListener("click", () => {
      $$(".tab-btn", $("#cat-tabs")).forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeCatId = c.id;
      renderProducts();
    });
    $("#cat-tabs").appendChild(btn);
  });
  activeCatId = categories[0].id;
  renderProducts();

  const psel = $("#partner-select");
  partners.forEach((p) => psel.appendChild(el(`<option value="${p.id}">${p.name} (${p.commission_rate}%)</option>`)));
  psel.addEventListener("change", renderCart);
})();

$("#product-search").addEventListener("input", debounce((e) => { searchTerm = e.target.value.toLowerCase(); renderProducts(); }, 150));

function renderProducts() {
  const zone = $("#product-zone");
  zone.innerHTML = "";
  let list = products.filter((p) => p.category_id === activeCatId && p.name.toLowerCase().includes(searchTerm));

  if (!list.length) {
    zone.appendChild(el(`<div class="empty-state"><div class="icon">📦</div><h4>Aucun produit</h4><p>Ajoute des produits pour cette catégorie depuis Mon entreprise ▸ Paramètres.</p></div>`));
    return;
  }

  const subGroups = {};
  list.forEach((p) => { const key = p.sub_category || ""; (subGroups[key] ||= []).push(p); });

  Object.keys(subGroups).sort().forEach((key) => {
    if (key) zone.appendChild(el(`<div class="sub-group-label">${key}</div>`));
    const grid = el(`<div class="product-grid"></div>`);
    subGroups[key].forEach((p) => {
      const card = el(`
        <div class="product-card" data-id="${p.id}">
          <div class="emoji">${p.image_emoji || "🔧"}</div>
          <div class="name">${p.name}</div>
          <div class="price">${formatMoney(p.price)}</div>
        </div>
      `);
      card.addEventListener("click", () => addToCart(p));
      grid.appendChild(card);
    });
    zone.appendChild(grid);
  });
}

function addToCart(p) {
  const line = cart.find((l) => l.productId === p.id);
  if (line) line.qty += 1;
  else cart.push({ productId: p.id, name: p.name, price: Number(p.price), cost: Number(p.cost_price), qty: 1 });
  renderCart();
}

function renderCart() {
  const wrap = $("#cart-lines");
  if (!cart.length) {
    wrap.innerHTML = `<div class="empty-state" style="padding:26px 10px;"><div class="icon">🛒</div><p>Le panier est vide</p></div>`;
  } else {
    wrap.innerHTML = "";
    cart.forEach((l, i) => {
      wrap.appendChild(el(`
        <div class="cart-line">
          <div class="info"><div class="n">${l.name}</div><div class="p">${formatMoney(l.price)} / unité</div></div>
          <div class="qty-ctrl">
            <button data-dec="${i}">−</button><span>${l.qty}</span><button data-inc="${i}">+</button>
          </div>
          <button class="icon-btn btn-icon-only" data-rm="${i}" style="width:26px;height:26px;">✕</button>
        </div>
      `));
    });
    $$("[data-inc]", wrap).forEach((b) => b.addEventListener("click", () => { cart[+b.dataset.inc].qty++; renderCart(); }));
    $$("[data-dec]", wrap).forEach((b) => b.addEventListener("click", () => {
      const idx = +b.dataset.dec; cart[idx].qty--; if (cart[idx].qty <= 0) cart.splice(idx, 1); renderCart();
    }));
    $$("[data-rm]", wrap).forEach((b) => b.addEventListener("click", () => { cart.splice(+b.dataset.rm, 1); renderCart(); }));
  }

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const cost = cart.reduce((s, l) => s + l.cost * l.qty, 0);
  const partnerId = $("#partner-select").value;
  const partner = partners.find((p) => p.id === partnerId);
  const commission = partner ? subtotal * (Number(partner.commission_rate) / 100) : 0;
  const total = subtotal + adjustment;

  $("#cart-commission").textContent = formatMoney(commission);
  $("#cart-cost").textContent = formatMoney(cost);
  $("#cart-total").textContent = formatMoney(total);
  $("#cart-sub").textContent = adjustment !== 0
    ? `${adjustment > 0 ? "Majoration" : "Réduction"} de ${formatMoney(Math.abs(adjustment))} appliquée`
    : "Nouvelle commande";
}
renderCart();

function adjustModal(kind) {
  openModal({
    title: kind === "discount" ? "Appliquer une réduction" : "Appliquer une majoration",
    bodyHtml: `
      <div class="field"><label>Type</label>
        <select class="input" id="adj-type"><option value="percent">Pourcentage (%)</option><option value="fixed">Montant fixe ($)</option></select>
      </div>
      <div class="field"><label>Valeur</label><input class="input" id="adj-value" type="number" min="0" step="0.01" placeholder="0" /></div>
    `,
    footHtml: `<button class="btn btn-outline" data-close-modal>Annuler</button><button class="btn btn-accent" id="adj-apply">Appliquer</button>`,
    onMount: (m) => {
      $("#adj-apply", m).addEventListener("click", () => {
        const val = Number($("#adj-value", m).value) || 0;
        const type = $("#adj-type", m).value;
        const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
        const amount = type === "percent" ? subtotal * (val / 100) : val;
        adjustment = kind === "discount" ? -Math.abs(amount) : Math.abs(amount);
        renderCart();
        closeModal();
      });
    },
  });
}
$("#discount-btn").addEventListener("click", () => {
  if (!session.can("pos.discount")) return toast("Permission 'Appliquer une réduction' requise", "error");
  adjustModal("discount");
});
$("#markup-btn").addEventListener("click", () => {
  if (!session.can("pos.markup")) return toast("Permission 'Appliquer une majoration' requise", "error");
  adjustModal("markup");
});

$("#clear-cart").addEventListener("click", () => { cart = []; adjustment = 0; $("#plate-input").value = ""; renderCart(); });

$("#save-cart").addEventListener("click", async () => {
  if (!cart.length) return toast("Le panier est vide", "error");
  const btn = $("#save-cart");
  btn.disabled = true; btn.textContent = "Enregistrement...";
  try {
    const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
    const cost = cart.reduce((s, l) => s + l.cost * l.qty, 0);
    const partnerId = $("#partner-select").value || null;
    const partner = partners.find((p) => p.id === partnerId);
    const commission = partner ? subtotal * (Number(partner.commission_rate) / 100) : 0;
    const total = subtotal + adjustment;

    const { data: sale, error } = await supabase.from("sales").insert({
      company_id: session.company.id, employee_id: session.employee?.id || null,
      partner_id: partnerId, plate: $("#plate-input").value.trim() || null,
      subtotal, adjustment, commission, cost_total: cost, total,
    }).select().single();
    if (error) throw error;

    const items = cart.map((l) => ({
      sale_id: sale.id, product_id: l.productId, name_snap: l.name, price_snap: l.price, cost_snap: l.cost, qty: l.qty,
    }));
    const { error: itemsErr } = await supabase.from("sale_items").insert(items);
    if (itemsErr) throw itemsErr;

    toast("Vente enregistrée");
    cart = []; adjustment = 0; $("#plate-input").value = ""; $("#partner-select").value = "";
    renderCart();
  } catch (e) {
    toast(e.message || "Erreur lors de l'enregistrement", "error");
  }
  btn.disabled = false; btn.textContent = "Enregistrer";
});
