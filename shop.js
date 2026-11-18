// Catalogue and carton pricing. Prices in satang (1 baht = 100 satang) until the
// final baht total, so every line total is a whole number of baht.

export const PRODUCTS = [
  { id: 'meal-box', name: 'Meal box, 750 ml', perCarton: 300, satang: 320, grams: 20, estimate: false },
  { id: 'bowl', name: 'Bowl, 500 ml', perCarton: 500, satang: 240, grams: 14, estimate: true },
  { id: 'cup', name: 'Hot cup, 12 oz, with lid', perCarton: 1000, satang: 190, grams: 10, estimate: true },
  { id: 'bag', name: 'Carry bag', perCarton: 500, satang: 280, grams: 18, estimate: true },
  { id: 'cutlery', name: 'Cutlery set (fork, spoon, knife)', perCarton: 1000, satang: 120, grams: 6, estimate: true },
];

export const LOGO_SATANG = 50;
export const LOGO_MIN_CARTONS = 10;
export const QUOTE_HINT_CARTONS = 100;
export const MAX_CARTONS = 999;

const thb = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const piece = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function product(id) {
  const found = PRODUCTS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown product: ${id}`);
  return found;
}

export function discountFor(cartons) {
  if (cartons >= 20) return 0.18;
  if (cartons >= 5) return 0.10;
  return 0;
}

export function pieceSatang(id, cartons, logo) {
  const p = product(id);
  return Math.round(p.satang * (1 - discountFor(cartons))) + (logo ? LOGO_SATANG : 0);
}

export function lineBaht(id, cartons, logo) {
  return pieceSatang(id, cartons, logo) * product(id).perCarton * cartons / 100;
}

export function listBaht(id, cartons) {
  const p = product(id);
  return p.satang * p.perCarton * cartons / 100;
}

export function clampCartons(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_CARTONS, Math.max(1, n));
}

export function formatTHB(baht) {
  return thb.format(baht);
}

export function formatPiece(satang) {
  return piece.format(satang / 100);
}
