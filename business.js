import { addProduct, clampCartons, formatPiece, formatTHB, lineBaht, listBaht, pieceSatang, LOGO_MIN_CARTONS, QUOTE_HINT_CARTONS } from './shop.js';

document.querySelectorAll('article[data-product]').forEach((card) => {
  const id = card.dataset.product;
  // cards without logo printing have no checkbox: a stand-in that is never checked
  const qty = card.querySelector('[name=cartons]'), logo = card.querySelector('[name=logo]') ?? { checked: false, addEventListener() {} };
  const $ = (s) => card.querySelector(s);
  function update() {
    const c = clampCartons(qty.value);
    logo.disabled = c < LOGO_MIN_CARTONS;
    if (logo.disabled) logo.checked = false;
    const saving = listBaht(id, c) - lineBaht(id, c, false);
    $('.piece').textContent = formatPiece(pieceSatang(id, c, logo.checked));
    $('.line').textContent = formatTHB(lineBaht(id, c, logo.checked));
    $('.saving').textContent = `You save ${formatTHB(saving)}`;
    $('.saving').hidden = saving <= 0;
    $('.quote-hint').hidden = c <= QUOTE_HINT_CARTONS;
  }
  qty.addEventListener('input', update);
  qty.addEventListener('blur', () => { qty.value = clampCartons(qty.value); update(); });
  logo.addEventListener('change', update);
  $('.add').addEventListener('click', () => {
    const c = clampCartons(qty.value);
    qty.value = c;
    window.sc.setBag(addProduct(window.sc.getBag(), id, c, logo.checked));
  });
  update(); addEventListener('pageshow', update);  // Back-navigation restores input values after scripts run
});
