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
