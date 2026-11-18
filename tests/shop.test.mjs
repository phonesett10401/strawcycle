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
test('saveBag then loadBag round trip', () => {
  const mem = {}; const st = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  const bag = S.addPack(S.addSponsor([], 2, 'Chiang Mai', 'Cy', 'k'));
  S.saveBag(st, bag);
  assert.deepEqual(S.loadBag(st), bag);
});
