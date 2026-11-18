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
