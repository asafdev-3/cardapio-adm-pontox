function formatPrice(value) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function normalizeFileName(name) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^\w.-]/g, "");
}
