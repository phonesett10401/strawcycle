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

test('tooSlow: rolling median over a full window', () => {
  assert.equal(T.tooSlow(Array(59).fill(80)), false);            // window not full yet
  assert.equal(T.tooSlow(Array(60).fill(80)), true);
  assert.equal(T.tooSlow([...Array(90).fill(80), ...Array(60).fill(16)]), false);  // recovered
  assert.equal(T.tooSlow([...Array(10).fill(16), ...Array(35).fill(80), ...Array(25).fill(16)]), true);
});

test('through: piecewise scroll <-> p', () => {
  const pts = [[0, 0.05], [100, 0.2], [300, 1]];
  assert.equal(T.through(pts, -5), 0.05); assert.equal(T.through(pts, 50), 0.125); assert.ok(Math.abs(T.through(pts, 200) - 0.6) < 1e-12); assert.equal(T.through(pts, 999), 1);
  assert.ok(Math.abs(T.through(pts.map(([a, b]) => [b, a]), 0.6) - 200) < 1e-9);
});
test('portrait framing only moves the camera', () => {
  const a = T.params(0.9, 1), b = T.params(0.9, 1, true);
  assert.notDeepEqual(a.camera, b.camera); assert.deepEqual({ ...a, camera: 0 }, { ...b, camera: 0 });
});
