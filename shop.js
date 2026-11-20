// Catalogue and carton pricing. Prices in satang (1 baht = 100 satang) until the
// final baht total, so every line total is a whole number of baht.

// logo: logo printing is offered (box, bowl, cup and bag only); unit: what one price buys (chopsticks come in pairs, cutlery in sets).
export const PRODUCTS = [
  { id: 'meal-box', name: 'Meal box, 750 ml', perCarton: 300, satang: 320, grams: 20, estimate: false, logo: true, unit: 'piece' },
  { id: 'bowl', name: 'Bowl, 500 ml', perCarton: 500, satang: 240, grams: 14, estimate: true, logo: true, unit: 'piece' },
  { id: 'cup', name: 'Hot cup, 12 oz, with lid', perCarton: 1000, satang: 190, grams: 10, estimate: true, logo: true, unit: 'piece' },
  { id: 'bag', name: 'Carry bag', perCarton: 500, satang: 280, grams: 18, estimate: true, logo: true, unit: 'piece' },
  { id: 'cutlery', name: 'Cutlery set (fork, spoon)', perCarton: 1000, satang: 120, grams: 6, estimate: true, logo: false, unit: 'set' },
  { id: 'chopsticks', name: 'Chopsticks, pair', perCarton: 1000, satang: 90, grams: 5, estimate: true, logo: false, unit: 'pair' },
  { id: 'drinking-straw', name: 'Drinking straw', perCarton: 2000, satang: 35, grams: 1, estimate: true, logo: false, unit: 'piece' },
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

// The logo flag is ignored on products without logo printing.
export function pieceSatang(id, cartons, logo) {
  const p = product(id);
  return Math.round(p.satang * (1 - discountFor(cartons))) + (logo && p.logo ? LOGO_SATANG : 0);
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

// Bag, sponsorships, shipping, impact and order details.

export const SPONSOR_BAHT = 99;
export const MAX_RAI = 10;
export const PROVINCES = ['Chiang Rai', 'Chiang Mai', 'Lampang', 'Nan'];
const PROVINCE_CODES = { 'Chiang Rai': 'CRI', 'Chiang Mai': 'CMI', 'Lampang': 'LPG', 'Nan': 'NAN' };
export const HOME_PACK = { id: 'home-pack', name: 'Home pack: 50 meal boxes', baht: 249, pieces: 50, grams: 20 };
export const FREE_SHIPPING_AT = 3000;
export const SHIPPING_FEE = 150;
export const KG_PER_RAI = 650;
export const M2_PER_RAI = 1600;
export const NAME_MAX = 40;
const BAG_KEY = 'sc-bag';

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

export function cleanName(s) {
  return Array.from(String(s ?? '').trim().replace(/\s+/g, ' ')).slice(0, NAME_MAX).join('').trim();
}

// Merge into the line with the same product and logo flag; logo needs 10+ cartons and a product that offers it.
export function addProduct(bag, id, cartons, logo) {
  const p = product(id);
  const c = clampCartons(cartons);
  const l = Boolean(logo) && p.logo && c >= LOGO_MIN_CARTONS;
  const i = bag.findIndex((x) => x.kind === 'product' && x.id === id && x.logo === l);
  if (i < 0) return [...bag, { kind: 'product', id, cartons: c, logo: l }];
  return bag.map((x, j) => (j === i ? { ...x, cartons: clampCartons(x.cartons + c) } : x));
}

// Remove the logo line, then add it back with the new count (merges if a plain line exists).
export function setCartons(bag, id, logo, cartons) {
  product(id);
  const c = clampCartons(cartons);
  const i = bag.findIndex((x) => x.kind === 'product' && x.id === id && x.logo === Boolean(logo));
  if (i < 0) return addProduct(bag, id, cartons, logo);
  if ((Boolean(logo) && c >= LOGO_MIN_CARTONS) === Boolean(logo)) {
    return bag.map((x, j) => (j === i ? { ...x, cartons: c } : x));
  }
  // Logo dropped: fold into the plain line if there is one, else keep this line's place.
  const plain = bag.findIndex((x) => x.kind === 'product' && x.id === id && x.logo === false);
  if (plain < 0) return bag.map((x, j) => (j === i ? { ...x, cartons: c, logo: false } : x));
  return bag
    .map((x, j) => (j === plain ? { ...x, cartons: clampCartons(x.cartons + c) } : x))
    .filter((_, j) => j !== i);
}

export function addPack(bag, qty = 1) {
  const q = clampCartons(qty);
  const i = bag.findIndex((x) => x.kind === 'pack');
  if (i < 0) return [...bag, { kind: 'pack', qty: q }];
  return bag.map((x, j) => (j === i ? { ...x, qty: clampCartons(x.qty + q) } : x));
}

export function addSponsor(bag, rai, province, name, key) {
  const n = cleanName(name);
  if (!n) throw new Error('Name is required');
  if (!PROVINCES.includes(province)) throw new Error(`Unknown province: ${province}`);
  if (!isInt(rai, 1, MAX_RAI)) throw new Error(`Rai must be 1-${MAX_RAI}`);
  return [...bag, { kind: 'sponsor', key, rai, province, name: n }];
}

export function removeLine(bag, index) {
  return bag.filter((_, i) => i !== index);
}

export function lineTotal(line) {
  if (line.kind === 'product') return lineBaht(line.id, line.cartons, line.logo);
  if (line.kind === 'pack') return HOME_PACK.baht * line.qty;
  return SPONSOR_BAHT * line.rai;
}

export function hasPhysical(bag) {
  return bag.some((x) => x.kind !== 'sponsor');
}

export function totals(bag) {
  let goods = 0; let sponsor = 0;
  for (const line of bag) {
    if (line.kind === 'sponsor') sponsor += lineTotal(line);
    else goods += lineTotal(line);
  }
  const shipping = goods === 0 || goods >= FREE_SHIPPING_AT ? 0 : SHIPPING_FEE;
  return { goods, sponsor, shipping, total: goods + sponsor + shipping };
}

export function impact(bag) {
  let grams = 0; let rai = 0;
  for (const line of bag) {
    if (line.kind === 'product') {
      const p = product(line.id);
      grams += p.perCarton * line.cartons * p.grams;
    }
    else if (line.kind === 'pack') grams += HOME_PACK.pieces * line.qty * HOME_PACK.grams;
    else rai += line.rai;
  }
  const strawKg = grams / 1000;
  return { strawKg, fieldM2: Math.round(strawKg / KG_PER_RAI * M2_PER_RAI), rai };
}

export function formatKg(kg) {
  const r = Math.round(kg * 10) / 10;
  return (r < 10 ? r.toFixed(1) : String(Math.round(kg))) + ' kg';
}

const yymmdd = (d) => [d.getFullYear() % 100, d.getMonth() + 1, d.getDate()]
  .map((n) => String(n).padStart(2, '0')).join('');
const digits4 = (rand) => String(Math.floor(rand() * 10000)).padStart(4, '0');

export function orderNumber(now = new Date(), rand = Math.random) {
  return `SC-${yymmdd(now)}-${digits4(rand)}`;
}

export function fieldId(province, rand = Math.random) {
  const code = PROVINCE_CODES[province];
  if (!code) throw new Error(`Unknown province: ${province}`);
  return `SC-F-${code}-${digits4(rand)}`;
}

// shortcut: Thai public holidays are ignored, add a holiday list if this ever ships.
export function deliveryWindow(now) {
  const addWorkingDays = (n) => {
    const d = new Date(now);
    for (let left = n; left > 0;) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) left--;
    }
    return d;
  };
  return { from: addWorkingDays(2), to: addWorkingDays(4) };
}

// Validate a stored line; throws on anything that is not exactly a valid line.
function checkLine(l) {
  if (l?.kind === 'product') {
    const p = product(l.id);
    if (!isInt(l.cartons, 1, MAX_CARTONS) || typeof l.logo !== 'boolean') throw new Error('bad product line');
    // older bags may hold a logo line for a product that no longer offers it: it loads as a plain line
    const logo = l.logo && p.logo;
    if (logo && l.cartons < LOGO_MIN_CARTONS) throw new Error('logo under minimum');
    return { kind: 'product', id: l.id, cartons: l.cartons, logo };
  }
  if (l?.kind === 'pack') {
    if (!isInt(l.qty, 1, MAX_CARTONS)) throw new Error('bad pack line');
    return { kind: 'pack', qty: l.qty };
  }
  if (l?.kind === 'sponsor') {
    if (typeof l.key !== 'string') throw new Error('bad sponsor key');
    if (typeof l.name !== 'string' || cleanName(l.name) !== l.name) throw new Error('name needs cleaning');
    return addSponsor([], l.rai, l.province, l.name, l.key)[0];
  }
  throw new Error('unknown line');
}

// Returns [] for any error, including unreadable or blocked storage.
export function loadBag(storage) {
  try {
    const raw = storage?.getItem(BAG_KEY);
    if (raw == null) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    // re-adding the product lines merges a cleaned logo line into the plain line of the same product
    return data.map(checkLine).reduce((bag, l) => (l.kind === 'product' ? addProduct(bag, l.id, l.cartons, l.logo) : [...bag, l]), []);
  } catch {
    return [];
  }
}

export function saveBag(storage, bag) {
  try {
    storage?.setItem(BAG_KEY, JSON.stringify(bag));
    return true;
  } catch {
    return false;
  }
}
