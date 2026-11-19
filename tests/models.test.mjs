// Guards the film's models: total size and triangle budgets, and the node names film.js looks up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../models/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.glb'));

function glb(file) {
  const buf = readFileSync(new URL(file, dir));
  assert.equal(buf.readUInt32LE(0), 0x46546c67, `${file}: not a GLB`);
  assert.equal(buf.readUInt32LE(8), buf.length, `${file}: header length`);
  assert.equal(buf.readUInt32LE(16), 0x4e4f534a, `${file}: first chunk is not JSON`);
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  return { size: buf.length, json };
}

// Triangles drawn: each mesh's index count / 3, once per node that uses it (Draco accessors still carry count).
function triangles({ json }) {
  let n = 0;
  for (const node of json.nodes ?? []) {
    if (node.mesh === undefined) continue;
    for (const p of json.meshes[node.mesh].primitives) n += json.accessors[p.indices].count / 3;
  }
  return n;
}

const models = Object.fromEntries(files.map((f) => [f, glb(f)]));

test('all four models are present', () => {
  assert.deepEqual(files.sort(), ['cafe.glb', 'farmer.glb', 'hut.glb', 'packaging.glb']);
});

test('models total at most 1.5 MB', () => {
  const size = Object.values(models).reduce((a, m) => a + m.size, 0);
  assert.ok(size <= 1572864, `${size} bytes`);
});

test('models total at most 200,000 triangles', () => {
  const tris = Object.values(models).reduce((a, m) => a + triangles(m), 0);
  assert.ok(tris <= 200000, `${tris} triangles`);
});

const NEEDED = {
  'packaging.glb': ['fork', 'spoon', 'chopsticks', 'drinking_straw'],
  'farmer.glb': ['torch_flame'],
  'cafe.glb': ['candle_flame', 'string_posts', ...Array.from({ length: 14 }, (_, i) => `bulb_${String(i).padStart(2, '0')}`)],
};

for (const [file, names] of Object.entries(NEEDED)) {
  test(`${file} has the nodes film.js needs`, () => {
    const have = new Set(models[file].json.nodes.map((n) => n.name));
    assert.deepEqual(names.filter((n) => !have.has(n)), []);
  });
}
