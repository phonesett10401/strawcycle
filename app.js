// Shared on every page: bag drawer, checkout dialog, demo forms. Pages talk to it through window.sc.
import {
  product, pieceSatang, clampCartons, setCartons, removeLine, lineTotal, hasPhysical, totals, impact,
  formatTHB, formatPiece, formatKg, FREE_SHIPPING_AT, HOME_PACK, LOGO_MIN_CARTONS,
  orderNumber, fieldId, deliveryWindow, loadBag, saveBag,
} from './shop.js';

window.scReady = true; // tells the inline failsafe in each page that reveals are handled

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => (/^(aria|data)-|^role$/.test(k) ? e.setAttribute(k, v) : (e[k] = v)));
  e.append(...kids);
  return e;
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = (() => { try { return localStorage; } catch { return null; } })(); // blocked site data throws
let bag = loadBag(store);

// Static markup only, no user data.
document.body.insertAdjacentHTML('beforeend', `
  <p id="bag-status" class="visually-hidden" role="status" aria-live="polite"></p>
  <div id="bag-backdrop" hidden></div>
  <aside id="bag" role="dialog" aria-modal="true" aria-labelledby="bag-title" hidden>
    <div class="bag-head"><h2 id="bag-title">Your bag</h2><button class="close" type="button" data-close-bag>Close</button></div>
    <ul id="bag-items"></ul>
    <p id="bag-hint" class="fine"></p>
    <dl class="bag-totals">
      <div data-row="goods"><dt>Packaging</dt><dd></dd></div>
      <div data-row="sponsor"><dt>Sponsorships</dt><dd></dd></div>
      <div data-row="shipping"><dt>Shipping</dt><dd></dd></div>
      <div class="grand"><dt>Total</dt><dd id="bag-total"></dd></div>
    </dl>
    <button id="bag-checkout" class="btn" type="button">Go to checkout</button>
  </aside>
  <dialog id="checkout-dialog" aria-labelledby="co-title">
    <button class="close" type="button" data-close>Close</button>
    <form id="checkout-form" novalidate>
      <h2 id="co-title">Checkout</h2>
      <p class="demo-tag">Demo: no payment taken</p>
      <div class="field"><label for="co-name">Your name</label><input id="co-name" name="name" type="text" autocomplete="name" required></div>
      <div class="field"><label for="co-email">Email</label><input id="co-email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="co-business">Business name (optional)</label><input id="co-business" name="business" type="text" autocomplete="organization"></div>
      <div class="field" id="co-address-field"><label for="co-address">Delivery address</label><textarea id="co-address" name="address" rows="3" autocomplete="street-address" required></textarea></div>
      <div id="checkout-summary" class="summary"></div>
      <button class="btn" type="submit">Place demo order</button>
      <p class="fine">This is a class project. Nothing is charged or sent anywhere.</p>
    </form>
    <section id="confirmation" hidden>
      <h2>Thank you, your demo order is placed</h2>
      <p>Order number <strong id="conf-number"></strong></p>
      <div id="conf-summary" class="summary"></div>
      <p id="conf-delivery"></p>
      <p id="conf-impact"></p>
      <div id="conf-certs" class="certs"></div>
      <p class="fine">No payment was taken and no real order exists.</p>
      <button class="btn" type="button" data-close>Back to the shop</button>
    </section>
  </dialog>`);

// Reveal on scroll
const reveals = document.querySelectorAll('.reveal');
if (reduced || !('IntersectionObserver' in window)) {
  reveals.forEach((r) => r.classList.add('in'));
} else {
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.12 });
  reveals.forEach((r) => io.observe(r));
}

// Line wording shared by the drawer, its aria-labels and the checkout summary.
const sponsorText = (l) => `${l.rai} rai, ${l.province}, for ${l.name}`;
function describe(l) {
  if (l.kind === 'product') return product(l.id).name + (l.logo ? ', with your logo' : '');
  if (l.kind === 'pack') return HOME_PACK.name;
  return `Sponsorship: ${sponsorText(l)}`;
}
const countOf = (l) => (l.kind === 'product' ? l.cartons : l.kind === 'pack' ? l.qty : 0);

// Dialogs: close buttons, focus return
const bagEl = $('#bag'), backdrop = $('#bag-backdrop'), bagBtns = document.querySelectorAll('[data-open-bag]');
const bagOpen = () => bagEl.classList.contains('open');
let returnTo = null, wantOpen = false;
document.querySelectorAll('dialog').forEach((d) => {
  d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) d.close(); });
  d.addEventListener('close', () => { if (!wantOpen) returnTo?.focus(); });
});

// Bag drawer
let bagReturn = null;
const behind = document.querySelectorAll('main, .site-header, .site-footer'); // inert while the drawer is open
const setBehind = (on) => behind.forEach((n) => { n.inert = on; });
bagBtns.forEach((b) => b.setAttribute('aria-expanded', 'false'));
function openBag(opener) {
  if (bagOpen()) return;
  bagReturn = opener;
  wantOpen = true;
  setBehind(true);
  bagEl.hidden = backdrop.hidden = false;
  void bagEl.offsetWidth; // reflow so the slide-in runs
  bagEl.classList.add('open'); backdrop.classList.add('open');
  $('[data-close-bag]', bagEl).focus();
  bagBtns.forEach((b) => b.setAttribute('aria-expanded', 'true'));
}
function closeBag(restore = true) {
  if (bagEl.hidden) return;
  wantOpen = false;
  setBehind(false);
  bagEl.classList.remove('open'); backdrop.classList.remove('open');
  bagBtns.forEach((b) => b.setAttribute('aria-expanded', 'false'));
  const hide = () => { if (!bagOpen()) bagEl.hidden = backdrop.hidden = true; };
  if (reduced) hide(); else { bagEl.addEventListener('transitionend', hide, { once: true }); setTimeout(hide, 400); }
  if (restore) bagReturn?.focus();
}
document.addEventListener('click', (e) => {
  const o = e.target.closest('[data-open-bag]');
  if (o) openBag(o);
  else if (e.target.closest('[data-close-bag]') || e.target === backdrop) closeBag();
});
document.addEventListener('keydown', (e) => {
  if (!bagOpen() || $('dialog[open]')) return;
  if (e.key === 'Escape') { e.preventDefault(); closeBag(); }
  if (e.key === 'Tab') {
    const f = [...bagEl.querySelectorAll('button:not([disabled]), input:not([disabled])')];
    const first = f[0], last = f[f.length - 1];
    if (!bagEl.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

const status = (msg) => { const s = $('#bag-status'); s.textContent = ''; setTimeout(() => { s.textContent = msg; }, 50); };
const commit = (next) => { bag = next; saveBag(store, bag); renderBag(); };

function lineItem(l, i) {
  const total = el('span', { className: 'bl-total' }, formatTHB(lineTotal(l)));
  const remove = el('button', {
    type: 'button', 'aria-label': `Remove ${describe(l)}`,
    onclick: () => { commit(removeLine(bag, i)); $('[data-close-bag]', bagEl).focus(); }, // the removed button is gone
  }, 'Remove');
  if (l.kind === 'sponsor') {
    return el('li', {}, el('div', { className: 'bl-info' }, el('strong', {}, sponsorText(l)), el('span', { className: 'fine' }, 'Field sponsorship')),
      el('div', { className: 'bl-row' }, total, remove));
  }
  if (l.kind === 'pack') {
    return el('li', {}, el('div', { className: 'bl-info' }, el('strong', {}, HOME_PACK.name), el('span', { className: 'fine' }, `Quantity ${l.qty}`)),
      el('div', { className: 'bl-row' }, total, remove));
  }
  const p = product(l.id);
  const input = el('input', {
    type: 'number', min: 1, max: 999, step: 1, value: l.cartons, inputMode: 'numeric',
    'aria-label': `Cartons of ${describe(l)}`, 'data-ckey': `${l.id}|${l.logo}`,
  });
  input.addEventListener('change', () => {
    const c = clampCartons(input.value);
    const keepsLogo = l.logo && c >= LOGO_MIN_CARTONS;
    commit(setCartons(bag, l.id, l.logo, c));
    $(`[data-ckey="${l.id}|${keepsLogo}"]`, bagEl)?.focus();
    if (l.logo && !keepsLogo) status(`Logo printing needs ${LOGO_MIN_CARTONS} cartons, so the logo was removed.`);
  });
  return el('li', {},
    el('div', { className: 'bl-info' }, el('strong', {}, p.name),
      el('span', { className: 'fine' }, `${l.logo ? 'With your logo. ' : ''}${p.perCarton} pieces per carton, ${formatPiece(pieceSatang(l.id, l.cartons, l.logo))} per piece`)),
    el('div', { className: 'bl-row' }, el('label', { className: 'bl-qty' }, 'Cartons ', input), total, remove));
}

function renderBag() {
  const list = $('#bag-items');
  list.replaceChildren();
  if (!bag.length) list.append(el('li', { className: 'bag-empty' }, 'Your bag is empty.'));
  bag.forEach((l, i) => list.append(lineItem(l, i)));
  const t = totals(bag);
  [['goods', t.goods], ['sponsor', t.sponsor], ['shipping', t.shipping]].forEach(([k, v]) => {
    const row = $(`[data-row="${k}"]`, bagEl);
    row.hidden = v === 0;
    $('dd', row).textContent = formatTHB(v);
  });
  $('#bag-total').textContent = formatTHB(t.total);
  $('#bag-hint').textContent = t.goods === 0 ? ''
    : t.goods >= FREE_SHIPPING_AT ? 'Free shipping unlocked.'
      : `Add ${formatTHB(FREE_SHIPPING_AT - t.goods)} more packaging for free shipping.`;
  $('#bag-checkout').disabled = !bag.length;
  $('#bag-count').textContent = bag.length;
  bagBtns.forEach((b) => b.setAttribute('aria-label', `Bag, ${bag.length} ${bag.length === 1 ? 'item' : 'items'}`));
}

window.sc = {
  getBag: () => bag,
  setBag(next) {
    commit(next);
    openBag(document.activeElement);
    status(`Added to your bag. ${bag.length} ${bag.length === 1 ? 'item' : 'items'} in the bag.`);
  },
};

// Forms: required fields and email shape, errors beside each field.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let uid = 0;
const clearError = (f) => {
  f.removeAttribute('aria-invalid');
  f.removeAttribute('aria-describedby');
  if (f.id) $(`#${f.id}-err`)?.remove();
};
function validate(form) {
  const bad = [];
  [...form.elements].filter((f) => f.willValidate && f.name).forEach((f) => {
    if (!f.id) f.id = `f-${++uid}`;
    clearError(f);
    const v = f.value.trim();
    const label = (f.labels?.[0]?.textContent || f.name).replace(/\(optional\)/i, '').trim().toLowerCase();
    const msg = f.required && !v ? (f.type === 'email' ? 'Enter your email.' : `Enter ${label}.`)
      : f.type === 'email' && v && !EMAIL.test(v) ? 'Enter an email like name@example.com.' : '';
    if (!msg) return;
    f.setAttribute('aria-invalid', 'true');
    f.setAttribute('aria-describedby', `${f.id}-err`);
    f.after(el('p', { id: `${f.id}-err`, className: 'field-error', role: 'alert' }, msg));
    bad.push(f);
  });
  bad[0]?.focus();
  return bad.length === 0;
}
const dateFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const longDate = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' });
const row = (label, value) => el('p', { className: 'sum-row' }, el('span', {}, label), el('span', {}, value));
function fillSummary(target, lines) {
  const t = totals(lines);
  target.replaceChildren(
    ...lines.map((l) => row(l.kind === 'sponsor' ? describe(l) : `${describe(l)} (×${countOf(l)}${l.kind === 'product' ? ' cartons' : ''})`, formatTHB(lineTotal(l)))),
    ...(t.shipping ? [row('Shipping', formatTHB(t.shipping))] : []),
    row('Total', formatTHB(t.total)));
}

// Checkout (demo: nothing is sent anywhere)
const co = $('#checkout-dialog'), form = $('#checkout-form'), conf = $('#confirmation');
$('#bag-checkout').addEventListener('click', () => {
  if (!bag.length) return;
  closeBag(false);
  const physical = hasPhysical(bag);
  $('#co-address-field').hidden = !physical;
  $('#co-address').disabled = !physical; // disabled fields are skipped by validate()
  fillSummary($('#checkout-summary'), bag);
  returnTo = $('[data-open-bag]');
  co.showModal();
});
form.addEventListener('input', (e) => clearError(e.target));
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!bag.length || !validate(form)) return;
  const lines = bag, now = new Date(), physical = hasPhysical(lines);
  $('#conf-number').textContent = orderNumber(now);
  fillSummary($('#conf-summary'), lines);
  const w = deliveryWindow(now), im = impact(lines);
  $('#conf-delivery').textContent = physical ? `Arrives between ${dateFmt.format(w.from)} and ${dateFmt.format(w.to)}` : '';
  $('#conf-impact').textContent = physical
    ? `This order kept ${formatKg(im.strawKg)} of straw out of the fire${im.fieldM2 >= 1 ? ` (about ${im.fieldM2.toLocaleString('en-GB')} m² of field)` : ''}`
    : '';
  $('#conf-delivery').hidden = $('#conf-impact').hidden = !physical;
  $('#conf-certs').replaceChildren(...lines.filter((l) => l.kind === 'sponsor').map((l) => {
    const cert = el('article', { className: 'certificate', 'aria-label': `Certificate for ${l.name}` },
      el('p', { className: 'cert-kicker' }, 'StrawCycle field certificate'),
      el('h3', {}, l.name),
      el('p', {}, `has kept ${l.rai} rai of rice field in ${l.province} from being burned.`),
      el('p', { className: 'fine' }, `Field ID ${fieldId(l.province)}, ${longDate.format(now)}. Demo certificate.`),
      el('button', { type: 'button', className: 'btn btn-secondary', onclick: () => {
        cert.classList.add('printing'); document.body.classList.add('printing-cert');
        window.print();
      } }, 'Print certificate'));
    return cert;
  }));
  form.hidden = true;
  conf.hidden = false;
  commit([]);
  const h = $('h2', conf);
  h.tabIndex = -1;
  h.focus();
});
addEventListener('afterprint', () => {
  document.body.classList.remove('printing-cert');
  document.querySelectorAll('.certificate.printing').forEach((c) => c.classList.remove('printing'));
});
co.addEventListener('close', () => {
  [...form.elements].forEach(clearError); // stale errors go; typed input stays
  if (conf.hidden) return;
  form.reset();
  form.hidden = false;
  conf.hidden = true;
});

// Demo forms (sample box, quote): validate, then swap for a confirmation. Nothing is sent.
document.querySelectorAll('form[data-demo-form]').forEach((f) => {
  f.noValidate = true;
  f.addEventListener('input', (e) => clearError(e.target));
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate(f)) return;
    const who = f.elements.business?.value.trim() || f.elements.name?.value.trim() || 'there';
    const panel = el('div', { className: 'demo-confirm', tabIndex: -1, role: 'status' },
      el('h3', {}, `Thanks, ${who}.`),
      el('p', {}, 'This is a demo, so nothing was sent.'),
      el('p', { className: 'fine' }, `Reference ${`SC-Q-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`}`));
    f.replaceWith(panel);
    panel.focus();
  });
});
renderBag();
