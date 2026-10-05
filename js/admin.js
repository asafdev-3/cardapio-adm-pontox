// ─── ESTADO ───
let restaurantId = null;
let categories = [];
let menuItems = [];
let editingItemId = null;

// ─── LOGIN ───
async function handleLogin() {
  const pin = document.getElementById("pin-input").value.trim();
  const btn = document.getElementById("login-btn");
  const errEl = document.getElementById("pin-error");

  if (!pin) return;

  btn.textContent = "Verificando...";
  btn.disabled = true;
  errEl.classList.add("hidden");

  const { data, error } = await supabaseClient
    .from("restaurants")
    .select("id")
    .eq("slug", DEFAULT_SLUG)
    .eq("pin_hash", pin)
    .single();

  btn.textContent = "Entrar";
  btn.disabled = false;

  if (error || !data) {
    document.getElementById("pin-input").value = "";
    errEl.classList.remove("hidden");
    setTimeout(() => errEl.classList.add("hidden"), 3000);
    return;
  }

  restaurantId = data.id;
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("admin-screen").classList.remove("hidden");
  await loadData();
}

document.getElementById("login-btn").addEventListener("click", handleLogin);
document.getElementById("pin-input").addEventListener("keydown", e => {
  if (e.key === "Enter") handleLogin();
});

// ─── LOGOUT ───
document.getElementById("logout-btn").addEventListener("click", () => {
  restaurantId = null;
  document.getElementById("admin-screen").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("pin-input").value = "";
});

// ─── CARREGAR DADOS ───
async function loadData() {
  const [catRes, itemRes] = await Promise.all([
    supabaseClient.from("categories").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
    supabaseClient.from("menu_items").select("*, categories(name)").eq("restaurant_id", restaurantId).order("sort_order")
  ]);

  if (!catRes.error) categories = catRes.data;
  if (!itemRes.error) menuItems = itemRes.data;

  renderList();
  await loadRestaurantSettings();
}

// ─── RENDER LISTA ───
function renderList() {
  const box = document.getElementById("admin-list");

  if (!menuItems.length) {
    box.innerHTML = `<p class="empty-msg">Nenhum item cadastrado ainda.</p>`;
    return;
  }

  box.innerHTML = menuItems.map(item => {
    const cat = categories.find(c => c.id === item.category_id);
    return `
      <div class="admin-item">
        ${item.image_url
          ? `<img src="${item.image_url}" class="admin-item-img" alt="${item.name}">`
          : `<div class="admin-item-img" style="display:flex;align-items:center;justify-content:center;color:#333;font-size:1.2rem">🍔</div>`
        }
        <div class="admin-item-info">
          <div class="admin-item-name">${item.name}</div>
          <div class="admin-item-meta">${cat ? cat.name : "Sem categoria"} · ${item.available ? "✅ Disponível" : "⏸ Pausado"}</div>
        </div>
        <div class="admin-item-price">${formatPrice(item.price)}</div>
        <div class="item-actions">
          <button class="btn-edit" onclick="startEdit('${item.id}')">Editar</button>
          <button class="btn-toggle-avail ${item.available ? "" : "paused"}" onclick="toggleAvail('${item.id}', ${item.available})">
            ${item.available ? "Pausar" : "Ativar"}
          </button>
          <button class="btn-del" onclick="deleteItem('${item.id}')">Excluir</button>
        </div>
      </div>
    `;
  }).join("");
}

// ─── FOTO ───
document.getElementById("item-image").addEventListener("change", function() {
  const name = this.files[0] ? this.files[0].name : "Nenhuma foto selecionada";
  document.getElementById("file-name").textContent = name;
});

// ─── SALVAR ───
document.getElementById("save-item").addEventListener("click", async () => {
  const name = document.getElementById("item-name").value.trim();
  const price = parseFloat(document.getElementById("item-price").value);
  const categoryName = document.getElementById("item-category").value.trim();
  const description = document.getElementById("item-description").value.trim();
  const file = document.getElementById("item-image").files[0];

  if (!name || !price) {
    showMsg("Nome e preço são obrigatórios.", "error");
    return;
  }

  const btn = document.getElementById("save-item");
  btn.textContent = "Salvando...";
  btn.disabled = true;

  let categoryId = null;
  if (categoryName) categoryId = await getOrCreateCategory(categoryName);

  let imageUrl = null;
  if (file) imageUrl = await uploadImage(file);

  let response;

  if (editingItemId) {
    const updateData = { name, price, description, category_id: categoryId };
    if (imageUrl) updateData.image_url = imageUrl;
    response = await supabaseClient.from("menu_items").update(updateData).eq("id", editingItemId);
    await logAction("edit_item", { id: editingItemId, name, price });
  } else {
    response = await supabaseClient.from("menu_items").insert({
      restaurant_id: restaurantId,
      category_id: categoryId,
      name, description, price,
      image_url: imageUrl,
      available: true
    });
    await logAction("add_item", { name, price });
  }

  btn.textContent = editingItemId ? "Salvar alterações" : "Salvar item";
  btn.disabled = false;

  if (response.error) {
    showMsg("Erro ao salvar. Tente novamente.", "error");
    console.error(response.error);
    return;
  }

  showMsg(editingItemId ? "Item atualizado!" : "Item adicionado!", "success");
  cancelEdit();
  await loadData();
});

// ─── EDITAR ───
function startEdit(id) {
  const item = menuItems.find(i => i.id === id);
  if (!item) return;

  editingItemId = id;
  document.getElementById("item-name").value = item.name;
  document.getElementById("item-price").value = item.price;
  document.getElementById("item-description").value = item.description || "";

  const cat = categories.find(c => c.id === item.category_id);
  document.getElementById("item-category").value = cat ? cat.name : "";
  document.getElementById("file-name").textContent = "Manter foto atual";

  document.getElementById("form-title").textContent = "Editar item";
  document.getElementById("save-item").textContent = "Salvar alterações";
  document.getElementById("cancel-edit").classList.remove("hidden");

  document.getElementById("item-name").scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelEdit() {
  editingItemId = null;
  document.getElementById("item-name").value = "";
  document.getElementById("item-price").value = "";
  document.getElementById("item-description").value = "";
  document.getElementById("item-category").value = "";
  document.getElementById("item-image").value = "";
  document.getElementById("file-name").textContent = "Nenhuma foto selecionada";
  document.getElementById("form-title").textContent = "Adicionar item";
  document.getElementById("save-item").textContent = "Salvar item";
  document.getElementById("cancel-edit").classList.add("hidden");
}

document.getElementById("cancel-edit").addEventListener("click", cancelEdit);

// ─── TOGGLE DISPONIBILIDADE ───
async function toggleAvail(id, current) {
  await supabaseClient.from("menu_items").update({ available: !current }).eq("id", id);
  await logAction("toggle_available", { id, available: !current });
  await loadData();
}

// ─── EXCLUIR ───
async function deleteItem(id) {
  if (!confirm("Excluir este item permanentemente?")) return;
  await supabaseClient.from("menu_items").delete().eq("id", id);
  await logAction("delete_item", { id });
  await loadData();
}

// ─── CATEGORIA ───
async function getOrCreateCategory(name) {
  const existing = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;

  const { data, error } = await supabaseClient
    .from("categories")
    .insert({ restaurant_id: restaurantId, name })
    .select()
    .single();

  if (error) { console.error(error); return null; }
  categories.push(data);
  return data.id;
}

// ─── UPLOAD ───
async function uploadImage(file) {
  const fileName = normalizeFileName(file.name);
  const path = `pontox/${Date.now()}-${fileName}`;

  const { data, error } = await supabaseClient.storage
    .from("menu-images")
    .upload(path, file, { upsert: true });

  if (error) { console.error(error); return null; }

  return supabaseClient.storage.from("menu-images").getPublicUrl(data.path).data.publicUrl;
}

// ─── LOG ───
async function logAction(action, payload) {
  await supabaseClient.from("admin_logs").insert({ restaurant_id: restaurantId, action, payload });
}

// ─── FEEDBACK ───
function showMsg(text, type) {
  const el = document.getElementById("form-msg");
  el.textContent = text;
  el.className = `form-msg ${type}`;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3000);
}

async function loadRestaurantSettings() {
    const { data, error } = await supabaseClient
        .from("restaurants")
        .select("opening_time, closing_time, temporarily_closed, closure_message")
        .eq("id", restaurantId)
        .single();

    if (error || !data) return;

    document.getElementById("opening-time").value = data.opening_time || "";
    document.getElementById("closing-time").value = data.closing_time || "";
    document.getElementById("temporarily-closed").checked = data.temporarily_closed || false;
    document.getElementById("closure-message").value = data.closure_message || "";
}
 
async function saveRestaurantSettings() {

    const payload = {
        opening_time: document.getElementById("opening-time").value,
        closing_time: document.getElementById("closing-time").value,
        temporarily_closed: document.getElementById("temporarily-closed").checked,
        closure_message: document.getElementById("closure-message").value
    };

    const { error } = await supabaseClient
        .from("restaurants")
        .update(payload)
        .eq("id", restaurantId);

    if (error) {
        alert("Erro ao salvar.");
        console.error(error);
        return;
    }

    alert("Funcionamento atualizado!");
}
document
    .getElementById("save-hours-btn")
    .addEventListener("click", saveRestaurantSettings);

