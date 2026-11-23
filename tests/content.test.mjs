import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
test('impact: money flow pictures, 650 kg, estimate label', () => {
  const h = readFileSync('impact.html', 'utf8');
  assert.equal((h.match(/class="flow-icon"/g) || []).length, 3);  // one picture per step
  assert.ok(h.includes('650 kg')); assert.match(h, /estimate/);
});
test('help: delivery and shipping terms', () => {
  const h = readFileSync('help.html', 'utf8');
  for (const s of ['2 to 4 working days', '฿3,000', '฿150']) assert.ok(h.includes(s), s);
});
test('no placeholder sections remain', () => {
  for (const p of ['index', 'business', 'sponsor', 'impact', 'help'])
    assert.ok(!readFileSync(`${p}.html`, 'utf8').includes('data-fill'), p);
});
