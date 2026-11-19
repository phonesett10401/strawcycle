import test from 'node:test'; import assert from 'node:assert/strict'; import * as T from '../tiers.js';
test('pickTier', () => {
  assert.equal(T.pickTier({ width: 1920, coarse: false, deviceMemory: 8, video: false }), 'high');
  assert.equal(T.pickTier({ width: 1920, coarse: false, deviceMemory: undefined, video: false }), 'high');
  assert.equal(T.pickTier({ width: 1366, coarse: true, deviceMemory: undefined, video: false }), 'low'); // iPad landscape / Safari
  assert.equal(T.pickTier({ width: 390, coarse: true, deviceMemory: 8, video: false }), 'low');
  assert.equal(T.pickTier({ width: 1920, coarse: false, deviceMemory: 4, video: false }), 'low');
  assert.equal(T.pickTier({ width: 390, coarse: true, deviceMemory: 2, video: true }), 'ultra');
});
test('pickTier by gpu string', () => {
  const d = { width: 1920, coarse: false, deviceMemory: 8, video: false };
  assert.equal(T.pickTier({ ...d, gpu: 'ANGLE (AMD, AMD Radeon(TM) 610M Direct3D11 vs_5_0 ps_5_0, D3D11)' }), 'low');
  assert.equal(T.pickTier({ ...d, gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)' }), 'high');
  assert.equal(T.pickTier({ ...d, gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' }), 'low');
  assert.equal(T.pickTier({ ...d, gpu: 'Apple M2' }), 'high');
  assert.equal(T.pickTier({ ...d, gpu: undefined }), 'high');
  assert.equal(T.pickTier({ ...d, video: true, gpu: 'Intel(R) UHD Graphics 620' }), 'ultra');
});
test('tiers', () => {
  assert.equal(T.TIERS.low.post, false); assert.equal(T.TIERS.high.post, true); assert.equal(T.TIERS.ultra.msaa, false);
  assert.equal(T.TIERS.high.density, 10); assert.equal(T.TIERS.ultra.density, 30); assert.ok(Object.isFrozen(T.TIERS.high));
});
test('nextStep', () => {
  assert.deepEqual(['high', 'high-dpr1', 'low', 'stills'].map(T.nextStep), ['high-dpr1', 'low', 'stills', 'stills']);
});
test('parseFilmFlags', () => {
  assert.deepEqual(T.parseFilmFlags('?film=video&p=0.37&t=2'), { mode: 'video', p: 0.37, t: 2, tier: null });
  assert.deepEqual(T.parseFilmFlags('?film=video&p=abc&t=-1'), { mode: 'video', p: null, t: null, tier: null });
  assert.deepEqual(T.parseFilmFlags('?film=video&p=2'), { mode: 'video', p: 1, t: null, tier: null });
  assert.deepEqual(T.parseFilmFlags('?film=video&tier=low'), { mode: 'video', p: null, t: null, tier: 'low' });
  assert.deepEqual(T.parseFilmFlags('?tier=low'), { mode: null, p: null, t: null, tier: null });
  assert.deepEqual(T.parseFilmFlags('?film=bench'), { mode: 'bench', p: null, t: null, tier: null });
  assert.deepEqual(T.parseFilmFlags('?film=nope'), { mode: null, p: null, t: null, tier: null });
  assert.deepEqual(T.parseFilmFlags(''), { mode: null, p: null, t: null, tier: null });
});
