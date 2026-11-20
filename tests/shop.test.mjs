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
test('loadBag rejects names that would need cleaning, never repairs', () => {
  const st = (v) => ({ getItem: () => v });
  for (const name of [' Ann ', 'Ann  Lee', 'x'.repeat(41), 123, {}])
    assert.deepEqual(S.loadBag(st(JSON.stringify([{ kind: 'sponsor', key: 'k', rai: 1, province: 'Nan', name }]))), [], String(name));
  assert.equal(S.loadBag(st('[{"kind":"sponsor","key":"k","rai":1,"province":"Nan","name":" Ann "}]')).length, 0);
  assert.equal(S.loadBag(st('[{"kind":"sponsor","key":"k","rai":1,"province":"Nan","name":"Ann"}]')).length, 1);
});
test('addPack clamps quantity before adding', () => {
  const base = S.addPack([]);
  assert.equal(S.addPack(base, '2')[0].qty, 3);
  assert.equal(S.addPack(base, 0)[0].qty, 2);
  assert.equal(S.addPack(base, NaN)[0].qty, 2);
  assert.equal(S.addPack(base, 2.7)[0].qty, 3);
});
test('setCartons keeps line order', () => {
  const bag = S.addProduct(S.addProduct(S.addProduct([], 'bowl', 2), 'cup', 3), 'meal-box', 4);
  const out = S.setCartons(bag, 'cup', false, 5);
  assert.deepEqual(out.map((l) => l.id), ['bowl', 'cup', 'meal-box']);
  assert.equal(out[1].cartons, 5);
  const logo = S.addProduct(S.addProduct(S.addProduct([], 'bowl', 2), 'cup', 12, true), 'meal-box', 1);
  assert.deepEqual(S.setCartons(logo, 'cup', true, 11).map((l) => l.id), ['bowl', 'cup', 'meal-box']);
  const dropped = S.setCartons(logo, 'cup', true, 9);
  assert.deepEqual(dropped.map((l) => l.id), ['bowl', 'cup', 'meal-box']);
  assert.deepEqual(dropped[1], { kind: 'product', id: 'cup', cartons: 9, logo: false });
  const plainFirst = [{ kind: 'product', id: 'bowl', cartons: 2, logo: false }, { kind: 'product', id: 'cup', cartons: 2, logo: false }, { kind: 'product', id: 'cup', cartons: 12, logo: true }, { kind: 'product', id: 'meal-box', cartons: 1, logo: false }];
  const merged = S.setCartons(plainFirst, 'cup', true, 9);
  assert.deepEqual(merged.map((l) => l.id), ['bowl', 'cup', 'meal-box']);
  assert.deepEqual(merged[1], { kind: 'product', id: 'cup', cartons: 11, logo: false });
});
test('logo printing only on the meal box, bowl, hot cup and carry bag', () => {
  assert.deepEqual(S.PRODUCTS.filter((p) => p.logo).map((p) => p.id), ['meal-box', 'bowl', 'cup', 'bag']);
  for (const id of ['cutlery', 'chopsticks', 'drinking-straw']) {
    assert.equal(S.pieceSatang(id, 20, true), S.pieceSatang(id, 20, false), id);
    assert.equal(S.lineBaht(id, 20, true), S.lineBaht(id, 20, false), id);
    assert.deepEqual(S.addProduct([], id, 12, true), [{ kind: 'product', id, cartons: 12, logo: false }], id);
  }
  assert.equal(S.pieceSatang('bag', 10, true), S.pieceSatang('bag', 10, false) + S.LOGO_SATANG);
  for (const p of S.PRODUCTS) for (const c of [10, 20, 999]) assert.ok(Number.isInteger(S.lineBaht(p.id, c, true)), p.id);
});
test('chopsticks are priced per pair', () => {
  assert.equal(S.product('chopsticks').unit, 'pair');
  assert.ok(S.PRODUCTS.filter((p) => p.id !== 'chopsticks').every((p) => p.unit === 'piece'));
});
test('loadBag turns an old logo line on cutlery, chopsticks or straws into a plain line', () => {
  const st = (v) => ({ getItem: () => JSON.stringify(v) });
  const line = (id, cartons, logo) => ({ kind: 'product', id, cartons, logo });
  assert.deepEqual(S.loadBag(st([line('drinking-straw', 12, true)])), [line('drinking-straw', 12, false)]);
  // under the old 10-carton minimum too: kept as plain, not a reason to drop the bag
  assert.deepEqual(S.loadBag(st([line('cutlery', 3, true)])), [line('cutlery', 3, false)]);
  // merges with the plain line of the same product, in its place; other lines untouched
  const old = [line('chopsticks', 2, false), line('cup', 12, true), line('chopsticks', 15, true), { kind: 'pack', qty: 1 }];
  const bag = S.loadBag(st(old));
  assert.deepEqual(bag, [line('chopsticks', 17, false), line('cup', 12, true), { kind: 'pack', qty: 1 }]);
  assert.ok(Number.isInteger(S.totals(bag).total));
  // a logo line on a product that offers it still needs 10 cartons
  assert.deepEqual(S.loadBag(st([line('bowl', 3, true)])), []);
});
