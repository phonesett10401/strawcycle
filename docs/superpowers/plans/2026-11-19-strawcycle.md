# StrawCycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build StrawCycle: a five-page static site where restaurants buy rice-straw packaging by the carton and people sponsor a field. Home is a scroll-driven Three.js film.

**Architecture:** Plain HTML pages share `styles.css` and `app.js`, which handles the bag drawer, checkout and forms. Pure, tested logic lives in `shop.js` (money, bag, impact) and `timeline.js` (film state as a function of scroll and time). `film.js` draws the Home film with Three.js (WebGL) from `timeline.js` and swaps to still images when 3D can't run.

**Tech Stack:** HTML, CSS, vanilla JS ES modules, no build step. Three.js `0.170.0` comes from `https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js` through an import map. Tests run with `node --test` (Node 24). Local server: `python -m http.server 5173 --bind 127.0.0.1`.

**Spec:** `docs/superpowers/specs/2026-11-19-strawcycle-design.md`

**Adapt from:** Still Gallery at `C:\ENL class business website`. `shop.js` gives the money-logic pattern, the safe storage and the order number. `app.js` gives the bag drawer (inert background, focus trap, `wantOpen`), the checkout `<dialog>`, field errors with `role=alert`, and the reveal failsafe (`html.js` plus `window.sgReady`, renamed `window.scReady`). Copy the patterns, not the gallery content.

## Global Constraints

- No dependencies to install. `package.json` is `{"type":"module","scripts":{"test":"node --test"}}`.
- Three.js only from the pinned jsdelivr URL above. WebGL renderer, not WebGPU.
- Prices are in Thai baht. Totals are whole baht. Price per piece is shown with 2 decimals (`฿3.20`).
- Every order and form is a demo. Nothing is sent anywhere, and the footer on every page says: "A class project: demo shop, no real orders. Counters are illustrative."
- Every page has one `h1`, the header nav (`index.html`, `business.html`, `sponsor.html`, `impact.html`, `help.html`), `button[data-open-bag]` containing `#bag-count`, and `<script type="module" src="app.js">`.
- The site works in light and dark mode (the Home film is always dusk; its captions stay readable in both) and at 375 px with no horizontal scroll. Tap targets are at least 44 px.
- All motion sits inside `@media (prefers-reduced-motion: no-preference)`. Reduced motion gets the still images instead of the film.
- Pages must be readable with JS off (static HTML content). The bag and checkout need JS.
- Design comes from the `hallmark` skill (new site) and is checked with `ui-ux-pro-max`. Anti-goals: purple gradients, glass cards, emoji icons, stock leaf graphics, vague eco claims.
- Put user text into the DOM only through `textContent`, never `innerHTML`.

## Review Focus

1. **Carton field gets odd input** (empty, 0, negative, `2.5`, `100000`, letters). Clamp to a whole number from 1 to 999 and never show `NaN`. → Task 1 `clampCartons` tests, Task 5 UI check.
2. **The logo option, then cartons lowered below 10.** The logo is dropped from that line and the price updates, so the bag never holds a logo line under 10 cartons. → Task 2 `setCartons` test.
3. **Tampered or broken `localStorage`** (bad JSON, unknown ids, wrong shapes, storage that throws). The bag loads empty and nothing crashes. → Task 2 `loadBag` tests.
4. **3D fails part-way** (CDN offline, no WebGL, context lost when an iPhone backgrounds the tab, slow frames). The stills appear and the captions and both doors keep working. → Task 6 `shouldUse3D` tests, Task 7 context-loss handler and manual check.
5. **A sponsor name that is long or has HTML or emoji** (`<b>Ann</b>`, 60 characters, `🌾`). It shows as plain text, wraps on the certificate, and is capped at 40 characters. A blank name is refused. → Task 2 `cleanName` tests, Task 4 certificate uses `textContent`.

---

### Task 1: Project setup and catalogue pricing

**Files:**
- Create: `package.json`, `shop.js`, `tests/shop.test.mjs`, `.claude/launch.json`

**Interfaces:**
- Produces, in `shop.js`:
  - `PRODUCTS`: array of `{ id, name, perCarton, satang, grams, estimate }`, exactly:
    - `meal-box`, 'Meal box, 750 ml', 300, 320, 20, false
    - `bowl`, 'Bowl, 500 ml', 500, 240, 14, true
    - `cup`, 'Hot cup, 12 oz, with lid', 1000, 190, 10, true
    - `bag`, 'Carry bag', 500, 280, 18, true
    - `cutlery`, 'Cutlery set (fork, spoon, knife)', 1000, 120, 6, true
  - `LOGO_SATANG = 50`, `LOGO_MIN_CARTONS = 10`, `QUOTE_HINT_CARTONS = 100`, `MAX_CARTONS = 999`
  - `product(id) → object`, which throws `Unknown product: <id>`
  - `discountFor(cartons) → 0 | 0.10 | 0.18`: 1–4 → 0, 5–19 → 0.10, 20 and up → 0.18
  - `pieceSatang(id, cartons, logo) → integer`: `Math.round(satang × (1 − discount)) + (logo ? 50 : 0)`
  - `lineBaht(id, cartons, logo) → integer baht`: `pieceSatang × perCarton × cartons / 100`
  - `listBaht(id, cartons) → integer baht`, the price without discount or logo. The saving shown is `listBaht − lineBaht(id, cartons, false)`.
  - `clampCartons(value) → integer 1..999`. It parses a string or number, floors it, and returns 1 for anything not finite.
  - `formatTHB(baht) → '฿1,234'` (no decimals) and `formatPiece(satang) → '฿3.20'`, both through `Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })` with the fraction digits fixed.

- [ ] **Step 1: Write the failing tests** in `tests/shop.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../shop.js';

test('discount tiers', () => {
  assert.deepEqual([1, 4, 5, 19, 20, 500].map(S.discountFor), [0, 0, 0.10, 0.10, 0.18, 0.18]);
});
test('price per piece: discount on list price, logo flat', () => {
  assert.equal(S.pieceSatang('meal-box', 1, false), 320);
  assert.equal(S.pieceSatang('meal-box', 5, false), 288);
  assert.equal(S.pieceSatang('meal-box', 20, false), 262);      // 262.4 rounds
  assert.equal(S.pieceSatang('meal-box', 20, true), 312);
  assert.equal(S.pieceSatang('bowl', 20, false), 197);          // 196.8 rounds
});
test('line totals are whole baht', () => {
  assert.equal(S.lineBaht('meal-box', 1, false), 960);
  assert.equal(S.lineBaht('meal-box', 20, false), 15720);
  assert.equal(S.lineBaht('cup', 5, false), 8550);
  assert.equal(S.listBaht('meal-box', 20) - S.lineBaht('meal-box', 20, false), 3480);
  for (const p of S.PRODUCTS) for (const c of [1, 7, 33]) for (const l of [false, true])
    assert.ok(Number.isInteger(S.lineBaht(p.id, c, l)));
});
test('clampCartons', () => {
  assert.deepEqual(['', '0', -3, '2.5', 100000, 'abc', NaN, '12'].map(S.clampCartons), [1, 1, 1, 2, 999, 1, 1, 12]);
});
test('unknown product throws', () => assert.throws(() => S.product('straw-hat'), /Unknown product/));
test('formatting', () => {
  assert.equal(S.formatPiece(320).replace(/\s/g, ''), '฿3.20');
  assert.equal(S.formatTHB(15720).replace(/\s/g, ''), '฿15,720');
});
```

- [ ] **Step 2: Run** `node --test`. Expected: FAIL (`shop.js` missing).
- [ ] **Step 3: Implement the interfaces above** in `shop.js`, and create `package.json` from Global Constraints. In `.claude/launch.json`, add `{"version":"0.0.1","configurations":[{"name":"site","runtimeExecutable":"python","runtimeArgs":["-m","http.server","5173","--bind","127.0.0.1"],"port":5173}]}`.
- [ ] **Step 4: Run** `node --test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: catalogue and carton pricing`.

---

### Task 2: Bag, sponsorships, shipping, impact and order details

**Files:**
- Modify: `shop.js`
- Test: `tests/shop.test.mjs`

**Interfaces:**
- Consumes: Task 1.
- Produces, in `shop.js`:
  - Constants:
    - `SPONSOR_BAHT = 99`, `MAX_RAI = 10`
    - `PROVINCES = ['Chiang Rai','Chiang Mai','Lampang','Nan']`, with codes `{ 'Chiang Rai':'CRI', 'Chiang Mai':'CMI', 'Lampang':'LPG', 'Nan':'NAN' }`
    - `HOME_PACK = { id:'home-pack', name:'Home pack: 50 meal boxes', baht:249, pieces:50, grams:20 }`
    - `FREE_SHIPPING_AT = 3000`, `SHIPPING_FEE = 150`
    - `KG_PER_RAI = 650`, `M2_PER_RAI = 1600`
    - `NAME_MAX = 40`
  - Bag lines are plain objects:
    - `{ kind:'product', id, cartons, logo }`
    - `{ kind:'pack', qty }`
    - `{ kind:'sponsor', key, rai, province, name }`
  - Bag functions:
    - `addProduct(bag, id, cartons, logo) → bag`. Merges into the line with the same `id` and `logo`, clamps cartons to 999, and drops the logo when cartons are under 10.
    - `setCartons(bag, id, logo, cartons) → bag`. Same clamping and logo rule; if the logo is dropped, merges into the plain line.
    - `addPack(bag, qty = 1) → bag`
    - `addSponsor(bag, rai, province, name, key) → bag`. Throws on a blank name, an unknown province, or `rai` outside 1–10. The caller passes `key`; `app.js` uses `'s' + Date.now()`.
    - `removeLine(bag, index) → bag`
  - `cleanName(s) → string`: trims, collapses spaces, caps at 40 characters. Returns `''` when blank.
  - `lineTotal(line) → baht`
  - `hasPhysical(bag) → boolean`
  - `totals(bag) → { goods, sponsor, shipping, total }`:
    - `goods` = products plus packs;
    - shipping is 0 when `goods` is 0 or at least 3000, otherwise 150.
  - `impact(bag) → { strawKg, fieldM2, rai }`:
    - `strawKg` = (product pieces × grams + pack pieces × 20) / 1000;
    - `fieldM2` = `Math.round(strawKg / 650 × 1600)`;
    - `rai` = the sum of sponsor `rai`.
  - `formatKg(kg) → string`: one decimal below 10, a whole number from 10 up, followed by ` kg`.
  - `orderNumber(now = new Date(), rand = Math.random) → 'SC-YYMMDD-NNNN'`
  - `fieldId(province, rand = Math.random) → 'SC-F-<code>-NNNN'`
  - `deliveryWindow(now) → { from, to }`: 2 and 4 **working days** later (skips Saturday and Sunday). Shortcut comment: Thai public holidays are ignored; add a holiday list if this ever ships.
  - `loadBag(storage) → bag` and `saveBag(storage, bag)` under the key `'sc-bag'`. `loadBag` validates every line through the functions above and returns `[]` on any error or if `storage` is null.

- [ ] **Step 1: Write the failing tests**:

```js
test('logo dropped below 10 cartons', () => {
  let bag = S.addProduct([], 'meal-box', 12, true);
  assert.deepEqual(bag, [{ kind: 'product', id: 'meal-box', cartons: 12, logo: true }]);
  bag = S.setCartons(bag, 'meal-box', true, 9);
  assert.deepEqual(bag, [{ kind: 'product', id: 'meal-box', cartons: 9, logo: false }]);
  assert.deepEqual(S.addProduct([], 'cup', 3, true), [{ kind: 'product', id: 'cup', cartons: 3, logo: false }]);
});
test('same product merges, cartons capped', () => {
  const bag = S.addProduct(S.addProduct([], 'bowl', 600), 'bowl', 600);
  assert.equal(bag.length, 1); assert.equal(bag[0].cartons, 999);
});
test('sponsorships: digital, one line each', () => {
  let bag = S.addSponsor([], 2, 'Nan', 'Ann', 's1');
  bag = S.addSponsor(bag, 1, 'Lampang', 'Ben', 's2');
  assert.equal(bag.length, 2);
  assert.deepEqual(S.totals(bag), { goods: 0, sponsor: 297, shipping: 0, total: 297 });
  assert.equal(S.hasPhysical(bag), false);
  assert.throws(() => S.addSponsor([], 1, 'Nan', '   ', 's3'));
  assert.throws(() => S.addSponsor([], 11, 'Nan', 'Ann', 's3'));
  assert.throws(() => S.addSponsor([], 1, 'Bangkok', 'Ann', 's3'));
});
test('shipping counts goods only', () => {
  const pack = S.addPack([]);
  assert.deepEqual(S.totals(pack), { goods: 249, sponsor: 0, shipping: 150, total: 399 });
  const big = S.addProduct([], 'meal-box', 4);            // 3840
  assert.equal(S.totals(S.addSponsor(big, 1, 'Nan', 'A', 'k')).shipping, 0);
  const small = S.addSponsor(S.addProduct([], 'meal-box', 3), 10, 'Nan', 'A', 'k'); // goods 2880, sponsor 990
  assert.equal(S.totals(small).shipping, 150);
});
test('impact', () => {
  const bag = S.addSponsor(S.addPack(S.addProduct([], 'meal-box', 1)), 3, 'Nan', 'A', 'k');
  assert.deepEqual(S.impact(bag), { strawKg: 7, fieldM2: 17, rai: 3 });
  assert.equal(S.formatKg(7), '7.0 kg'); assert.equal(S.formatKg(123.4), '123 kg');
});
test('cleanName', () => {
  assert.equal(S.cleanName('  Ann   Lee '), 'Ann Lee');
  assert.equal(S.cleanName('x'.repeat(60)).length, 40);
  assert.equal(S.cleanName('<b>Ann</b>'), '<b>Ann</b>');   // kept as text; DOM uses textContent
  assert.equal(S.cleanName('   '), '');
});
test('order number, field id, delivery window', () => {
  assert.equal(S.orderNumber(new Date(2026, 10, 19), () => 0.25), 'SC-261119-2500');
  assert.equal(S.fieldId('Chiang Rai', () => 0.5), 'SC-F-CRI-5000');
  const fri = S.deliveryWindow(new Date(2026, 10, 20, 10));  // Friday
  assert.equal(fri.from.getDate(), 24); assert.equal(fri.to.getDate(), 26);
});
test('loadBag survives bad storage', () => {
  const st = (v) => ({ getItem: () => v });
  assert.deepEqual(S.loadBag(null), []);
  assert.deepEqual(S.loadBag({ getItem() { throw new Error('blocked'); } }), []);
  for (const v of ['nope', '{}', '[{"kind":"product","id":"x","cartons":1}]',
    '[{"kind":"product","id":"cup","cartons":0}]', '[{"kind":"product","id":"cup","cartons":3,"logo":true}]',
    '[{"kind":"sponsor","key":"k","rai":1,"province":"Nan","name":""}]', '[{"artworkId":"quiet-field"}]'])
    assert.deepEqual(S.loadBag(st(v)), [], v);
  const good = S.addSponsor(S.addProduct([], 'cup', 2), 1, 'Nan', 'Ann', 'k');
  assert.deepEqual(S.loadBag(st(JSON.stringify(good))), good);
});
```

- [ ] **Step 2: Run** `node --test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement the interfaces above** in `shop.js`. `loadBag` rejects (rather than repairs) a logo line under 10 cartons.
- [ ] **Step 4: Run** `node --test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: bag, sponsorships, shipping and impact`.

---

### Task 3: Design system and the five page shells

**Files:**
- Create: `styles.css`, `index.html`, `business.html`, `sponsor.html`, `impact.html`, `help.html`, `tests/pages.test.mjs`

**Interfaces:**
- Produces:
  - CSS custom properties on `:root` with dark values under `prefers-color-scheme: dark`.
  - The shared classes later tasks use: `.wrap`, `.section`, `.reveal`, `.btn`, `.btn-primary`, `.btn-secondary`, `.card`, `.field`, `.sum-row`, `.skip`, `.site-header`, `.site-footer`.
  - Each page's `<main id="main">` holds placeholder sections that later tasks fill.

- [ ] **Step 1: Run the `hallmark` skill** for a new site, giving it the spec's intent, audience and anti-goals. The palette must start from straw gold, ember orange, smoke grey and dusk blue. Pick fonts that carry a warm, grounded, agricultural-modern voice (not the gallery's). Record the chosen tokens at the top of `styles.css`.
- [ ] **Step 2: Write the failing test** `tests/pages.test.mjs`:

```js
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
const PAGES = ['index', 'business', 'sponsor', 'impact', 'help'];
for (const p of PAGES) test(`${p}.html shell`, () => {
  const h = readFileSync(`${p}.html`, 'utf8');
  assert.equal((h.match(/<h1[\s>]/g) || []).length, 1);
  for (const q of PAGES) assert.ok(h.includes(`href="${q}.html`), `${p} links ${q}`);
  assert.match(h, /data-open-bag[^>]*>[\s\S]*?id="bag-count"/);
  assert.match(h, /<script type="module" src="app.js">/);
  assert.match(h, /A class project: demo shop, no real orders\. Counters are illustrative\./);
  assert.match(h, new RegExp(`href="${p}.html"[^>]*aria-current="page"`));
});
```

- [ ] **Step 3: Run** `node --test`. Expected: FAIL.
- [ ] **Step 4: Build `styles.css` and the five shells.**
  - Header: wordmark, nav and bag button. On phones the nav collapses to a short row (as in Still Gallery), with no hamburger.
  - The footer carries the demo line from Global Constraints.
  - Each `h1`:
    - Home: "Straw, not smoke."
    - Business: "Packaging for your restaurant"
    - Sponsor: "Sponsor a field"
    - Impact: "Where the smoke comes from"
    - Help: "Delivery, samples and returns"
  - Include the inline reveal failsafe script from Still Gallery, renamed `scReady`.
- [ ] **Step 5: Run** `node --test`. Expected: all pass. Open `http://localhost:5173` and check light mode, dark mode and 375 px.
- [ ] **Step 6: Commit** `feat: design system and page shells`.

---

### Task 4: Shared bag drawer, checkout and forms (`app.js`)

**Files:**
- Create: `app.js`

**Interfaces:**
- Consumes: Task 2 (`loadBag`, `saveBag`, `totals`, `impact`, `hasPhysical`, `lineTotal`, `removeLine`, `setCartons`, `orderNumber`, `fieldId`, `deliveryWindow`, `formatTHB`, `formatKg`, `cleanName`) and Task 3 classes.
- Produces:
  - `window.sc = { getBag(), setBag(bag) }`. `setBag` saves, re-renders the drawer and count, and opens the drawer with a "Added" status message announced through `aria-live="polite"`.
  - Pages call `window.sc.setBag(...)` after `addProduct`, `addPack` or `addSponsor`.
  - Any `<form data-demo-form="sample|quote">` gets validation (required fields, email shape) and is replaced by a confirmation panel: "Thanks, <business name>. This is a demo, so nothing was sent." The panel includes a reference `SC-Q-NNNN`.
  - Sets `window.scReady = true`.

- [ ] **Step 1: Inject the bag drawer and checkout `<dialog>` markup**, adapting Still Gallery's `app.js`: inert background, focus trap, focus return, Escape to close, the `wantOpen` flag.
  - **Bag lines:**
    - Product lines show name, logo flag, cartons (a number input feeding `setCartons`), price per piece and line total.
    - Sponsor lines show "1 rai, Nan, for Ann".
    - Every line has a remove button with an `aria-label` naming the line.
  - **Summary rows:** goods, sponsorships, shipping, total. A row is hidden when its value is 0, except total.
- [ ] **Step 2: Checkout form.**
  - Always shown: name and email (required), business name (optional).
  - Delivery address (required) only when `hasPhysical(bag)`.
  - Errors appear beside each field with `role="alert"`.
- [ ] **Step 3: Confirmation.**
  - Order number and summary.
  - If physical: delivery window ("Arrives between Tue 24 Nov and Thu 26 Nov") and "This order kept 7.0 kg of straw out of the fire (about 17 m² of field)". Leave out the m² part when it is below 1.
  - One certificate per sponsor line: name, "has kept N rai of rice field in <province> from being burned", field ID, date, and a "Print certificate" button that calls `window.print()`.
  - A `@media print` rule shows only that certificate.
  - After confirming, clear the bag.
- [ ] **Step 4: Manual check** in the browser:
  - add a product with `localStorage` edited by hand;
  - check out a sponsor-only bag (no address field), a mixed bag and a goods-only bag;
  - Escape, keyboard only, and 375 px.
  - Run `node --test`; it still passes.
- [ ] **Step 5: Commit** `feat: shared bag, checkout and demo forms`.

---

### Task 5: For businesses page

**Files:**
- Modify: `business.html`, `styles.css`
- Create: `business.js`, `tests/business.test.mjs`

**Interfaces:**
- Consumes: Task 1 pricing, Task 2 `addProduct`, Task 4 `window.sc`.
- Produces:
  - Static cards `<article class="card" data-product="<id>">` with the name, `<span class="per-carton">` ("300 per carton"), `<span class="piece">` (list price per piece), a carton input `[name=cartons]` (min 1, max 999), a logo checkbox `[name=logo]`, `<output class="line">` and `<output class="saving">`, and an Add button.

- [ ] **Step 1: Write the failing test**. For every `PRODUCTS` entry, `business.html` must have a card with that `data-product`, the formatted list price per piece, and the text `<perCarton> per carton` (formatted with `toLocaleString('en')`). It also needs a `form[data-demo-form="sample"]`, a `form[data-demo-form="quote"]`, and the text "StrawCycle Partner".
- [ ] **Step 2: Run** `node --test`. Expected: FAIL.
- [ ] **Step 3: Build the page:**
  - **Hero line:** straw packaging that pays farmers not to burn.
  - **The five cards.**
  - **Bulk tier table:** 1–4, 5–19 −10%, 20+ −18%.
  - **Logo note:** +฿0.50 per piece, from 10 cartons.
  - **Partner badge block:** a mock window sticker reading "StrawCycle Partner, 12 rai saved from burning" with the caption "Example: a busy café a year in, about 1,000 boxes a day".
  - **Free sample form:** business name, type (select: Restaurant, Café, Hotel, Office, Other), district, email.
  - **Quote form:** business name, email, what you need.
- [ ] **Step 4: Write `business.js`** (module, loaded only here). On input it:
  - runs `clampCartons` and writes the clamped value back on blur;
  - disables the logo checkbox and unticks it under 10 cartons, with a visible hint;
  - updates `.line` (`lineBaht`), `.piece` (`pieceSatang`) and `.saving` ("You save ฿3,480", hidden when 0);
  - shows "Over 100 cartons? Ask for a quote" with a link to the quote form when cartons exceed 100;
  - on Add, calls `window.sc.setBag(addProduct(window.sc.getBag(), id, cartons, logo))`.
- [ ] **Step 5: Manual check** of Review Focus items 1–2 in the browser (type `0`, `2.5`, `abc`, `100000`; tick the logo at 12, then go to 9). Run `node --test`; all pass.
- [ ] **Step 6: Commit** `feat: business shop with bulk pricing`.

---

### Task 6: Sponsor page and film timeline logic

The two parts are independent; they share a task only for review size. If a reviewer rejects one, split them.

**Files:**
- Modify: `sponsor.html`, `styles.css`
- Create: `sponsor.js`, `timeline.js`, `tests/timeline.test.mjs`

**Interfaces:**
- Consumes: Task 2 `addSponsor`, `addPack`, `cleanName`, `PROVINCES`; Task 4 `window.sc`.
- Produces, in `timeline.js` (pure, no DOM, no Three):
  - `rng(seed) → () => number in [0,1)` (mulberry32)
  - `sceneAt(p) → { index: 0..3, local: 0..1 }`, with scene boundaries at 0.25, 0.5 and 0.75; `p` is clamped to 0..1.
  - `params(p, t) → { camera: { x, y, z, lookX, lookY, lookZ }, sun, fire, smoke, clear, fold, fly, city }`. Every value except the camera is in 0..1:
    - `fire`: rises across 0.2–0.32, falls to 0 by 0.45.
    - `smoke`: peaks at about 0.37, then 0 by 0.5. `clear` is `1 − smoke` from 0.37 on.
    - `fold`: 0 before 0.5, 1 at 0.72.
    - `fly`: 0 before 0.72, 1 at 0.9.
    - `city`: rises from 0.75 to 1.
    - `sun`: falls from 1 at p 0 to 0 at p 1.
    - `t` adds only small idle motion: flicker, drift and a camera sway of ±0.05.
  - `counter(base, perSecond, t) → integer`: `Math.floor(base + perSecond × t)`
  - `shouldUse3D({ webgl, reducedMotion, frameMs }) → boolean`: false when there's no WebGL, when reduced motion is on, or when the median of `frameMs` (sampled after warm-up) is over 40.

- [ ] **Step 1: Write the failing tests** `tests/timeline.test.mjs`:

```js
import test from 'node:test'; import assert from 'node:assert/strict'; import * as T from '../timeline.js';
test('deterministic', () => assert.deepEqual(T.params(0.41, 3.2), T.params(0.41, 3.2)));
test('seeded rng repeats', () => { const a = T.rng(7), b = T.rng(7); assert.equal(a(), b()); });
test('scenes', () => {
  assert.deepEqual(T.sceneAt(0), { index: 0, local: 0 });
  assert.equal(T.sceneAt(0.5).index, 2); assert.equal(T.sceneAt(1).index, 3); assert.equal(T.sceneAt(1.7).index, 3);
});
test('story beats', () => {
  const at = (p) => T.params(p, 0);
  assert.equal(at(0.1).fire, 0); assert.ok(at(0.3).fire > 0.5); assert.equal(at(0.5).smoke, 0);
  assert.ok(at(0.37).smoke > 0.9); assert.equal(at(0.49).fold, 0); assert.equal(at(0.72).fold, 1);
  assert.equal(at(0.7).fly, 0); assert.equal(at(0.9).fly, 1); assert.ok(at(1).city > 0.99);
  for (let p = 0; p <= 1; p += 0.01) for (const k of ['sun', 'fire', 'smoke', 'clear', 'fold', 'fly', 'city'])
    assert.ok(at(p)[k] >= 0 && at(p)[k] <= 1, `${k}@${p}`);
});
test('time only sways', () => assert.ok(Math.abs(T.params(0.6, 0).camera.x - T.params(0.6, 9).camera.x) <= 0.1)); // ±0.05 sway
test('counter', () => assert.equal(T.counter(1200, 0.5, 9), 1204));
test('shouldUse3D', () => {
  assert.equal(T.shouldUse3D({ webgl: false, reducedMotion: false, frameMs: [16] }), false);
  assert.equal(T.shouldUse3D({ webgl: true, reducedMotion: true, frameMs: [16] }), false);
  assert.equal(T.shouldUse3D({ webgl: true, reducedMotion: false, frameMs: [50, 45, 60] }), false);
  assert.equal(T.shouldUse3D({ webgl: true, reducedMotion: false, frameMs: [16, 70, 17] }), true);
});
```

- [ ] **Step 2: Run** `node --test`. Expected: FAIL.
- [ ] **Step 3: Implement `timeline.js`** using piecewise smoothstep ramps between the listed points. The camera path is a fixed list of keyframes interpolated with Catmull-Rom (the builder chooses positions in Task 7; start with placeholders that pass the tests).
- [ ] **Step 4: Build the sponsor page.**
  - Rai stepper (1–10) with a live total (`฿99 × rai`), province select (`PROVINCES`), certificate name input (`maxlength="40"`, required).
  - A **live certificate preview** that updates with `textContent`.
  - An Add button calling `addSponsor` with `key 's' + Date.now()`.
  - A home pack card (฿249) calling `addPack`.
  - A short "where your ฿99 goes" explainer: farmer paid per kilo, straw collected, field not burned.
- [ ] **Step 5: Manual check** of Review Focus item 5 in the preview (long name, `<b>`, emoji, blank name refused with a field error). Run `node --test`; all pass.
- [ ] **Step 6: Commit** `feat: sponsor page and film timeline`.

---

### Task 7: The Home film

**Files:**
- Modify: `index.html`, `styles.css`, `timeline.js` (camera keyframes only)
- Create: `film.js`, `images/scene-1.svg` … `scene-4.svg` (placeholders), `docs/image-prompts.md`

**Interfaces:**
- Consumes: Task 6 `params`, `rng`, `counter`, `shouldUse3D`.
- Produces: `film.js` exports `start(canvas) → { render(p, t), dispose() }` and wires itself to scroll and `requestAnimationFrame` on load. Also `window.scFilm = { render }`, so the video project can drive frames by hand.

- [ ] **Step 1: Home HTML, which must work without the film.**
  - `<canvas id="film" aria-hidden="true">`, fixed and full-screen, behind four `<section class="beat">` blocks. Each block is 100svh and holds one caption (the spec's four, in plain English).
  - Each beat also holds an `<img class="still">` of its scene, shown only in fallback mode (`html.no-film`).
  - At the end: the two doors, `a.btn-primary[href="business.html"]` "Packaging for your restaurant" and `a.btn-secondary[href="sponsor.html"]` "Sponsor a field, ฿99".
  - Three counters (rai saved, farmers paid, boxes made) using `counter()` with fixed base figures, marked illustrative.
  - A "Skip the film" link to `#doors`. The two doors are also in the header area on the first screen.
  - The import map for `three` goes in `index.html` only.
- [ ] **Step 2: Fallback switch** in `film.js`.
  - Check WebGL with `canvas.getContext('webgl2') || getContext('webgl')` and read reduced motion.
  - Render about 30 warm-up frames, then decide with `shouldUse3D`.
  - On `false`, a failed `three` import, or `webglcontextlost`, dispose and add `html.no-film`.
  - Also add `html.no-film` up front when the module hasn't set `window.scFilm` within 4 s.
- [ ] **Step 3: Build the scene.** Read the spec's "Home: the scroll film" section and draw `params(p, t)` exactly:
  - **Field:** a low-poly ground plane with instanced straw-stubble strands and a hut.
  - **Fire and embers:** additive points.
  - **Smoke:** soft billboard particles, run backwards by `clear`.
  - **Straw fibres:** about 3,000 points lerped from scattered positions (`rng(1)`) to box, bowl and cup surface samples by `fold`.
  - **Flight:** boxes fly along a curve by `fly`.
  - **City:** point lights and a café table plane come up by `city`.
  - **Sky:** gradient by `sun`.
  - Set the camera keyframes in `timeline.js`.
  - Cap `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))`, halve particle counts when `innerWidth < 768`, and pause on `visibilitychange`.
- [ ] **Step 4: Write `docs/image-prompts.md`**: four ChatGPT image prompts, one per scene, each matching the film's palette and camera. For each, ask for 16:9 (video) and 9:16 (phone fallback). Also write the file names to save as (`images/scene-N.jpg` and `images/scene-N-tall.jpg`). The `<img class="still">` uses `<picture>` to pick the tall one on portrait screens, and falls back to the SVG placeholder until the JPGs exist.
- [ ] **Step 5: Manual check.**
  - On desktop: smooth scroll through all four beats, and fire and dust moving while still.
  - With 375 px and CPU 4× throttle in DevTools: the stills appear when frames are slow.
  - Block `cdn.jsdelivr.net`: the stills appear.
  - Reduced motion: the stills appear.
  - The doors are tappable in every case.
  - Run `window.scFilm.render(0.6, 2)` twice: identical frames.
  - Run `node --test`; all pass.
- [ ] **Step 6: Commit** `feat: home scroll film with fallback`.

---

### Task 8: Impact and Help content, with sources

**Files:**
- Modify: `impact.html`, `help.html`
- Create: `tests/content.test.mjs`

- [ ] **Step 1: Write the failing test.**
  - `impact.html` contains at least three `<a href="https://` source links, the text "650 kg" and the word "estimate".
  - `help.html` contains "2 to 4 working days", "฿3,000" and "฿150".
- [ ] **Step 2: Run** `node --test`. Expected: FAIL.
- [ ] **Step 3: Research and write Impact.**
  - Check the Urmatt/GIZ Chiang Rai pilot and Fang Thai Factory against their pages.
  - Find a source for straw per rai, or keep 650 kg and label it an estimate.
  - Find one source on northern Thailand's burning season and PM2.5.
  - **Sections:** the problem; how the money flows (business pays → farmer paid per kilo → straw pressed into packaging) as a simple three-step diagram in HTML and CSS; the real pilots; "our numbers" (650 kg per rai, 20 g per meal box, other weights estimated, 1 rai = 1,600 m²).
- [ ] **Step 4: Write Help.**
  - Delivery: 2 to 4 working days, free over ฿3,000 of goods, otherwise ฿150; sponsorships are digital.
  - Free samples.
  - Returns: unopened cartons within 14 days.
  - Logo printing: from 10 cartons, +฿0.50 per piece.
  - A short FAQ: Is it food-safe? Is it microwave-safe? Does it compost? Answer honestly and generally: "straw-fibre packaging is generally…, ours would be tested to Thai FDA rules".
- [ ] **Step 5: Run** `node --test`; all pass.
- [ ] **Step 6: Commit** `feat: impact and help content`.

---

### Task 9: Polish, audit and README

**Files:**
- Modify: as findings require
- Create: `README.md`

- [ ] **Step 1: Run the checks.**
  - The `ui-ux-pro-max` priority checks (accessibility, touch targets, layout, type, motion).
  - Hallmark's `sloplint.mjs --render` on every page.
  - The audit skills `emil-design-engineering` and `audit-as-a11y-eng` on the result.
  - Fix what they find.
- [ ] **Step 2: Check every page** in light mode, dark mode and at 375 px for horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`), keyboard-only, and with JS off.
- [ ] **Step 3: Write `README.md`.** Cover what StrawCycle is, the pages, how the business works, that it's a demo, and how to run, test and deploy on Vercel (preset Other, no build command). Credit Three.js (MIT) and list the image sources.
- [ ] **Step 4: Run** `node --test`; all pass.
- [ ] **Step 5: Commit** `docs: README; fix: audit findings`.
