import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import { PRODUCTS, formatPiece } from '../shop.js';
const html = readFileSync('business.html', 'utf8');
for (const p of PRODUCTS) test(`business card: ${p.id}`, () => {
  const card = html.split(/<article\b/).find((c) => c.includes(`data-product="${p.id}"`));
  assert.ok(card, 'card exists');
  assert.ok(card.includes(formatPiece(p.satang)), 'list price per piece');
  assert.ok(card.includes(`${p.perCarton.toLocaleString('en')} per carton`), 'per carton');
});
test('business forms and badge', () => {
  assert.match(html, /<form[^>]*data-demo-form="sample"/);
  assert.match(html, /<form[^>]*data-demo-form="quote"/);
  assert.ok(html.includes('StrawCycle Partner'));
});
