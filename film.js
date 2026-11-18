// Home scroll film: one Three.js scene drawn only from params(p, t) (timeline.js), so any frame can be
// rendered again exactly. The page passes scroll and the clock; video tools call window.scFilm.render(p, t).
// Falls back to the still images (html.no-film) when WebGL, speed, the CDN or reduced motion say so.
import { params, rng, counter, shouldUse3D } from './timeline.js';

const root = document.documentElement;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
let THREE;

// ?film=video: the video tool owns the frames. No MSAA (its resolve is not bit-exact between identical
// frames) and no speed check; frames come only from window.scFilm.render(p, t).
const VIDEO = new URLSearchParams(location.search).get('film') === 'video';

// Counters: illustrative story figures that follow the same t as the scene (film loop, scFilm.render, or the
// stills-mode clock), so a captured frame shows the counters for its own t.
const fmt = new Intl.NumberFormat('en-US');
const counters = [...document.querySelectorAll('[data-counter]')];
const tick = (t) => counters.forEach((c) => {
  const v = fmt.format(counter(+c.dataset.counter, +c.dataset.rate, t));
  if (c.textContent !== v) c.textContent = v;
});

// ---- shaders --------------------------------------------------------------------------------
const HEAD = /* glsl */`
uniform float uT, uScale;
attribute vec4 aSeed;
float psize(float s, vec4 mv) { return s * uScale / -mv.z; }
`;
const SOFT = /* glsl */`
varying float vA; varying vec3 vC;
void main() { float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vC, vA * pow(max(1.0 - d, 0.0), 1.6)); }`;

const DUST = /* glsl */`
uniform float uDust; varying float vA; varying vec3 vC;
void main() {
  vec3 p = position;
  p.x = mod(p.x + uT * (0.12 + aSeed.x * 0.1) + sin(uT * 0.4 + aSeed.y * 6.28) * 0.5 + 22.0, 44.0) - 22.0;
  p.y += sin(uT * 0.3 + aSeed.z * 6.28) * 0.35;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = psize(0.05 + aSeed.w * 0.07, mv);
  vA = uDust * (0.35 + 0.65 * (0.5 + 0.5 * sin(uT * 1.3 + aSeed.x * 40.0))) * smoothstep(0.5, 3.0, -mv.z);
  vC = vec3(1.0, 0.78, 0.45);
}`;

const FLAME = /* glsl */`
uniform float uFire; varying float vA; varying vec3 vC;
void main() {
  float life = fract(aSeed.w + uT * (0.8 + aSeed.x * 0.9));
  vec3 p = position;
  p.y += life * (0.5 + aSeed.y * 1.5) * uFire;
  p.x += sin(uT * 3.0 + aSeed.z * 20.0 + life * 4.0) * 0.14 * life;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = psize((0.6 - 0.45 * life) * (0.5 + 0.5 * uFire), mv);
  vA = uFire * (1.0 - life) * smoothstep(0.0, 0.08, life) * 0.9;
  vC = mix(vec3(1.0, 0.85, 0.5), vec3(0.95, 0.22, 0.04), smoothstep(0.0, 0.75, life));
}`;

const EMBER = /* glsl */`
uniform float uEmber, uRise; varying float vA; varying vec3 vC;
void main() {
  float f = fract(aSeed.w + uT * (0.04 + aSeed.x * 0.05) + uRise * 2.0); // scroll runs them up, then back down
  vec3 p = position;
  p.y += 0.3 + f * (5.0 + aSeed.y * 9.0);
  p.x += sin(f * 9.0 + aSeed.z * 6.28 + uT * 0.7) * (0.4 + f * 2.0) + f * 3.0;
  p.z += cos(f * 7.0 + aSeed.z * 6.28) * f * 1.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = psize(0.07 + aSeed.y * 0.06, mv);
  vA = uEmber * sin(3.1416 * f) * (0.55 + 0.45 * sin(uT * 7.0 + aSeed.x * 40.0));
  vC = vec3(1.0, 0.55, 0.18);
}`;

const SMOKE = /* glsl */`
uniform float uS; uniform vec3 uSmokeLow, uSmokeHigh; varying float vA; varying vec3 vC;
void main() {
  float hf = aSeed.w, h = hf * uS;  // height follows the smoke amount, so the fall is the rise run backwards
  vec3 p = position;
  p.y += 0.6 + h * 19.0 + sin(uT * 0.35 + aSeed.z * 6.28) * 0.4 * uS;
  float wide = 0.6 + h * h * 9.0;  // a narrow column that billows out as it climbs, leaning with the wind
  p.x += (aSeed.x - 0.5) * wide + h * h * 10.0 + sin(uT * 0.22 + aSeed.y * 6.28 + hf * 4.0) * 0.5 * uS;
  p.z += (aSeed.y - 0.5) * wide * 0.6;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = psize(1.6 + h * 9.0, mv);
  vA = uS * 0.5 * (1.0 - 0.6 * hf);
  vC = mix(uSmokeLow, uSmokeHigh, smoothstep(0.0, 0.35, hf));
}`;

const FIBRE = /* glsl */`
attribute vec3 aStart; uniform float uFold, uFibA, uFibOut; uniform vec3 uC;
varying float vA, vAng;
void main() {
  float u = clamp((uFold - aSeed.x * 0.3) / 0.55, 0.0, 1.0), e = u * u * (3.0 - 2.0 * u);
  float a = aSeed.z * 6.28 + e * 9.0 + uT * 0.8;  // the vortex keeps turning while the scroll rests
  float rad = 1.2 + aSeed.y * 2.4;  // a hollow funnel, wider at the top
  vec3 mid = uC + vec3(cos(a) * rad, (aSeed.y - 0.5) * 2.6 + 0.6, sin(a) * rad);
  mid = 2.0 * mid - 0.5 * (aStart + position);  // the curve passes through the vortex at e = 0.5
  vec3 p = mix(mix(aStart, mid, e), mix(mid, position, e), e);
  p.y += (1.0 - e) * 0.04 * sin(uT * 1.5 + aSeed.w * 30.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float w = 4.0 * e * (1.0 - e);
  gl_PointSize = psize(0.3 + 0.15 * w, mv);
  vA = uFibA * (0.26 + 0.3 * w) * (1.0 - 0.72 * e) * (1.0 - uFibOut);  // settled fibres stay as a glowing outline
  vAng = aSeed.w * 6.28 + e * 4.0 + uT * 0.6 * w;
}`;
const FIBRE_F = /* glsl */`
varying float vA, vAng;
void main() {
  vec2 c = gl_PointCoord - 0.5; float s = sin(vAng), k = cos(vAng);
  vec2 r = vec2(c.x * k - c.y * s, c.x * s + c.y * k);
  gl_FragColor = vec4(1.0, 0.8, 0.42, vA * smoothstep(0.1, 0.0, abs(r.y)) * smoothstep(0.5, 0.25, abs(r.x)));
}`;

const TRAIL = /* glsl */`
uniform vec3 uFA[3], uFM[3], uFE[3], uFP; varying float vA; varying vec3 vC;
void main() {
  int i = int(aSeed.x * 2.99);
  float e0 = uFP[i], e = max(e0 - aSeed.y * 0.14, 0.0);
  vec3 p = (1.0 - e) * (1.0 - e) * uFA[i] + 2.0 * e * (1.0 - e) * uFM[i] + e * e * uFE[i];
  p += (vec3(aSeed.z, fract(aSeed.z * 7.3), fract(aSeed.w * 5.1)) - 0.5) * (0.15 + aSeed.y * 0.6);
  p.y += 0.25;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = psize(0.16 * (1.0 - aSeed.y * 0.6), mv);
  vA = (1.0 - aSeed.y) * smoothstep(0.0, 0.03, e0) * (1.0 - smoothstep(0.85, 1.0, e0)) * (0.6 + 0.4 * sin(uT * 6.0 + aSeed.w * 30.0));
  vC = vec3(1.0, 0.78, 0.42);
}`;

const GLOW = /* glsl */`
attribute vec3 aCol; uniform float uLantern, uBulbs, uHalo; varying float vSoft; varying float vA; varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = psize(aSeed.y, mv);
  vSoft = aSeed.w;
  vA = (aSeed.x < 0.33 ? uLantern : aSeed.x < 0.66 ? uBulbs : uHalo) * (0.85 + 0.15 * sin(uT * 2.0 + aSeed.z * 30.0));
  vC = aCol;
}`;
const GLOW_F = /* glsl */`
varying float vA, vSoft; varying vec3 vC;
void main() { float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vC, vA * (exp(-d * d * 6.0) * 0.6 + smoothstep(0.22, 0.1, d) * (1.0 - vSoft))); }`;

const CITY = /* glsl */`
uniform float uCity; varying float vA; varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  bool red = aSeed.x > 0.97;
  gl_PointSize = psize(red ? 0.9 : 0.45 + aSeed.y * 0.3, mv);
  vA = uCity * (red ? 0.5 + 0.5 * sin(uT * 3.0 + aSeed.z * 20.0) : 0.6 + 0.4 * aSeed.w);
  vC = red ? vec3(1.0, 0.2, 0.15) : aSeed.x < 0.7 ? vec3(1.0, 0.72, 0.38) : vec3(0.8, 0.86, 1.0);
}`;

const STARS = /* glsl */`
uniform float uStars, uPR; varying float vA; varying vec3 vC;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = (1.0 + aSeed.x * 1.8) * uPR;
  vA = uStars * (0.4 + 0.6 * aSeed.y) * (0.7 + 0.3 * sin(uT * (1.0 + aSeed.z * 2.0) + aSeed.w * 30.0));
  vC = vec3(0.9, 0.93, 1.0);
}`;

const SKY_V = /* glsl */`
varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`;
const SKY_F = /* glsl */`
uniform vec3 uHorizon, uZenith, uSunDir, uSunCol, uGlow; uniform float uSunAmt, uCity; varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.04, 0.6, d.y), 0.7));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunCol * uSunAmt * (pow(s, 5.0) * 0.3 + pow(s, 80.0) * 0.6 + smoothstep(0.9994, 0.9997, s));
  col += uGlow * uCity * exp(-max(d.y, 0.0) * 12.0) * smoothstep(0.2, 1.0, -d.z);
  gl_FragColor = vec4(col, 1.0);
}`;

// ---- the world ------------------------------------------------------------------------------
const groundH = (x, z) => (z < -36 ? 0 : (0.1 * Math.sin(x * 0.9) * Math.cos(z * 0.7) + 0.05 * Math.sin(x * 2.3 + z * 1.7)) * smooth(-36, -31, z));
const C = [0, 2.6, -14];                              // where the straw swirls and folds
const HUT = [6.5, 0, -16];
const TABLE = [0, 0.915, -42];
const FIRES = [[-9, -12, -3, -13], [2, -11, 8, -12.5], [-6, -19, 1, -20], [4, -22, 11, -21], [-12, -25, -5, -27]];
// box, bowl, cup: where they fold (world), where they land on the table (offset), resting turn
const OBJ = [
  { at: [-1.35, 2.3, -14], land: [-0.42, 0, 0.1], rot: 0.35 },
  { at: [0, 2.35, -13.6], land: [0.5, 0, -0.15], rot: 0 },
  { at: [1.3, 2.2, -14], land: [0.12, 0, -0.55], rot: 0 },
];
const bowlR = (y) => 0.32 + 0.3 * Math.sqrt(y / 0.4);
const cupR = (y) => 0.21 + 0.11 * y / 0.75;
function sampleSurface(r) {                           // a point on the box, bowl or cup, in world space at fold time
  const k = r(), o = k < 0.45 ? 0 : k < 0.75 ? 1 : 2, a = r() * Math.PI * 2;
  let p;
  if (o === 0) {                                      // box surface: pick a face by its area
    const S = [1.1, 0.45, 0.8], A = [0.45 * 0.8, 1.1 * 0.8, 1.1 * 0.45], f = r() * (A[0] + A[1] + A[2]);
    const ax = f < A[0] ? 0 : f < A[0] + A[1] ? 1 : 2, edge = r() < 0.45, free = Math.floor(r() * 3);  // edges outline the box
    p = S.map((s, i) => ((edge ? i !== free : i === ax) ? (r() < 0.5 ? -0.5 : 0.5) : r() - 0.5) * s);
    p[1] += 0.225;
  } else if (o === 1) { const y = r() < 0.35 ? 0.4 : 0.4 * r() ** 0.7, rr = bowlR(y); p = [Math.cos(a) * rr, y, Math.sin(a) * rr]; }
  else if (r() < 0.3) { const rr = r() < 0.6 ? 0.34 : Math.sqrt(r()) * 0.34; p = [Math.cos(a) * rr, 0.78, Math.sin(a) * rr]; }
  else { const y = 0.75 * r(), rr = cupR(y); p = [Math.cos(a) * rr, y, Math.sin(a) * rr]; }
  return p.map((v, i) => v + OBJ[o].at[i]);
}

const col = (r, g, b) => new THREE.Color(r, g, b);

export function start(canvas) {
  THREE.ColorManagement.enabled = false;             // colours below are written as they should look
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !VIDEO, powerPreference: 'high-performance' });
  try { return build(canvas, renderer); } catch (e) { renderer.dispose(); renderer.forceContextLoss(); throw e; }
}

function build(canvas, renderer) {
  const small = innerWidth < 768, n = (x) => (small ? x >> 1 : x);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 500);
  scene.fog = new THREE.Fog(0, 18, 140);

  const U = {
    uT: { value: 0 }, uScale: { value: 1 }, uPR: { value: 1 }, uDust: { value: 0 }, uFire: { value: 0 }, uEmber: { value: 0 },
    uRise: { value: 0 }, uS: { value: 0 }, uFold: { value: 0 }, uFibA: { value: 0 }, uFibOut: { value: 0 }, uC: { value: new THREE.Vector3(...C) },
    uLantern: { value: 0 }, uBulbs: { value: 0 }, uHalo: { value: 0 }, uCity: { value: 0 }, uStars: { value: 0 },
    uFA: { value: OBJ.map(() => new THREE.Vector3()) }, uFM: { value: OBJ.map(() => new THREE.Vector3()) }, uFE: { value: OBJ.map(() => new THREE.Vector3()) }, uFP: { value: new THREE.Vector3() },
    uSmokeLow: { value: col(0.5, 0.3, 0.2) }, uSmokeHigh: { value: col(0.5, 0.48, 0.48) },
  };
  function points(count, seed, place, vert, frag = SOFT, blending = THREE.AdditiveBlending) {
    const r = rng(seed), pos = new Float32Array(count * 3), sd = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { pos.set(place(r, i), i * 3); sd.set([r(), r(), r(), r()], i * 4); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
    const m = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: HEAD + vert, fragmentShader: frag, transparent: true, depthWrite: false, blending }));
    m.frustumCulled = false;                          // positions move in the shader
    scene.add(m);
    return m;
  }
  const lambert = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = scene) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  // Sky dome (follows the camera) with stars
  const skyU = {
    uHorizon: { value: col(0, 0, 0) }, uZenith: { value: col(0, 0, 0) }, uSunDir: { value: new THREE.Vector3() },
    uSunCol: { value: col(1, 0.62, 0.3) }, uSunAmt: { value: 0 }, uGlow: { value: col(0.9, 0.48, 0.22) }, uCity: U.uCity,
  };
  const sky = new THREE.Group(); scene.add(sky);
  const dome = mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_V, fragmentShader: SKY_F, side: THREE.BackSide, depthWrite: false }), 0, 0, 0, sky);
  dome.renderOrder = -2;
  const stars = points(n(500), 9, (r) => { const a = r() * 6.28, y = 0.08 + r() * 0.9, s = Math.sqrt(1 - y * y); return [Math.cos(a) * s * 280, y * 280, Math.sin(a) * s * 280]; }, STARS);
  scene.remove(stars); sky.add(stars);

  // Mountain ridges far away, coloured by the sky each frame (aerial perspective)
  const ridges = [[-190, 6, 15, 3], [-230, 10, 26, 4]].map(([z, lo, hi, seed]) => {
    const r = rng(seed), N = 80, v = [], idx = [];
    let y = lo;
    for (let i = 0; i <= N; i++) { y = Math.min(hi, Math.max(lo, y + (r() - 0.5) * 6)); v.push(-280 + i * 7, y, z, -280 + i * 7, -6, z); }
    for (let i = 0; i < N; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex(idx);
    return mesh(g, new THREE.MeshBasicMaterial({ fog: false }));
  });

  // Ground: low-poly field that turns to dark city ground past z = -32
  {
    const g = new THREE.PlaneGeometry(220, 280, 55, 70); g.rotateX(-Math.PI / 2); g.translate(0, 0, -110);
    const r = rng(2), P = g.attributes.position, cols = [];
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i), k = smooth(-30, -37, z), v = 0.85 + r() * 0.3;
      P.setY(i, groundH(x, z) + r() * 0.06);
      cols.push((0.72 * (1 - k) + 0.09 * k) * v, (0.5 * (1 - k) + 0.1 * k) * v, (0.24 * (1 - k) + 0.14 * k) * v);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
    mesh(g, lambert(0xffffff, { vertexColors: true, flatShading: true }));
  }

  // Stubble: thin three-sided spikes in rows
  {
    const step = small ? 0.71 : 0.5, cells = [], r = rng(3), d = new THREE.Object3D(), c = new THREE.Color();
    for (let z = 10; z > -32; z -= step) for (let x = -22; x < 22; x += step * 0.8) {
      const px = x + (r() - 0.5) * 0.2, pz = z + (r() - 0.5) * 0.15;
      if (Math.abs(px - HUT[0]) < 1.6 && Math.abs(pz - HUT[2]) < 1.4) continue;
      cells.push([px, pz, r(), r(), r()]);
    }
    const g = new THREE.ConeGeometry(0.035, 0.38, 3, 1); g.translate(0, 0.19, 0);
    const im = new THREE.InstancedMesh(g, lambert(0xffffff), cells.length);
    cells.forEach(([x, z, a, b, s], i) => {
      d.position.set(x, groundH(x, z), z); d.rotation.set((a - 0.5) * 0.5, b * 6.28, (b - 0.5) * 0.5); d.scale.setScalar(0.6 + s * 0.8);
      d.updateMatrix(); im.setMatrixAt(i, d.matrix);
      im.setColorAt(i, c.setRGB(1 + a * 0.15, 0.74 + s * 0.12, 0.36 + b * 0.1));
    });
    scene.add(im);
  }

  // Farmer's hut on stilts, with a lantern
  {
    const hut = new THREE.Group(), wood = lambert(0x4a3222), thatch = lambert(0x6b4a26, { flatShading: true });
    for (const [x, z] of [[-1, -0.8], [1, -0.8], [-1, 0.8], [1, 0.8]]) mesh(new THREE.BoxGeometry(0.12, 1.9, 0.12), wood, x, 0.95, z, hut);
    mesh(new THREE.BoxGeometry(2.3, 0.12, 1.9), wood, 0, 0.95, 0, hut);
    mesh(new THREE.BoxGeometry(2.1, 0.8, 0.06), wood, 0, 1.4, -0.8, hut);
    const roof = mesh(new THREE.ConeGeometry(2.0, 1.1, 4), thatch, 0, 2.35, 0, hut); roof.rotation.y = Math.PI / 4; roof.scale.set(1.15, 1, 0.9);
    hut.position.set(...HUT); hut.rotation.y = -0.5; scene.add(hut);
  }

  // Particles: dust, flames, embers, smoke
  points(n(900), 4, (r) => [(r() - 0.5) * 44, 0.2 + r() ** 2 * 4, 6 - r() * 36], DUST);
  const onFire = (r) => { const f = FIRES[Math.floor(r() * FIRES.length)], k = r(); return [f[0] + (f[2] - f[0]) * k, 0, f[1] + (f[3] - f[1]) * k]; };
  const flames = points(n(1400), 5, (r) => { const p = onFire(r); p[1] = groundH(p[0], p[2]); return p; }, FLAME);
  const embers = points(n(700), 6, onFire, EMBER);
  const COLS = (() => { const r = rng(13); return FIRES.flatMap((f) => [0.3, 0.75].map((k) => { k += (r() - 0.5) * 0.2; return [f[0] + (f[2] - f[0]) * k, 0, f[1] + (f[3] - f[1]) * k]; })); })();
  const smoke = points(n(360), 7, (r) => { const c = COLS[Math.floor(r() * COLS.length)]; return [c[0] + (r() - 0.5) * 0.8, 0, c[2] + (r() - 0.5) * 0.8]; }, SMOKE, SOFT, THREE.NormalBlending);  // ten columns

  // Straw fibres: scattered on the field (rng(1)), swirl up, fold into the box, bowl and cup
  const fibres = points(n(3000), 8, (r) => sampleSurface(r), FIBRE, FIBRE_F);
  {
    const r = rng(1), cnt = fibres.geometry.attributes.position.count, s = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) { const x = (r() - 0.5) * 16, z = C[2] + (r() - 0.5) * 14; s.set([x, groundH(x, z) + 0.05, z], i * 3); }
    fibres.geometry.setAttribute('aStart', new THREE.BufferAttribute(s, 3));
  }

  // The packaging itself, faded in as the fibres settle
  const paper = lambert(0xe9d6a6, { emissive: 0x2b1e0c, transparent: true });
  const lathe = (f, h, top) => new THREE.LatheGeometry(Array.from({ length: 11 }, (_, k) => new THREE.Vector2(f(h * k / 10), h * k / 10)).concat(top || []), 28);
  const pack = OBJ.map(() => new THREE.Group());
  mesh(new THREE.BoxGeometry(1.1, 0.45, 0.8).translate(0, 0.225, 0), paper, 0, 0, 0, pack[0]);
  mesh(new THREE.BoxGeometry(1.15, 0.035, 0.85), paper, 0, 0.3, 0, pack[0]);
  mesh(lathe(bowlR, 0.4), new THREE.MeshLambertMaterial({ color: 0xe9d6a6, emissive: 0x2b1e0c, transparent: true, side: THREE.DoubleSide }), 0, 0, 0, pack[1]);
  mesh(new THREE.CylinderGeometry(0.32, 0.21, 0.75, 24).translate(0, 0.375, 0), paper, 0, 0, 0, pack[2]);
  mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 24), paper, 0, 0.78, 0, pack[2]);
  pack.forEach((g) => scene.add(g));
  const trails = points(n(240), 12, () => [0, 0, 0], TRAIL);  // gold sparks behind each flying piece
  const packMats = [paper, pack[1].children[0].material];

  // City: dark blocks with lit windows, rising on the horizon
  const city = new THREE.Group(); scene.add(city);
  const cityPts = points(n(3000), 10, (() => {
    const r = rng(11), blds = [], d = new THREE.Object3D();
    for (let i = 0; i < 160; i++) blds.push([(r() - 0.5) * 220, -112 - r() * 60, 3 + r() * 5, 3 + r() * 4, 3 + r() ** 2 * 12]);
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0x0b1222, fog: false }), blds.length);
    blds.forEach(([x, z, w, dd, h], i) => { d.position.set(x, 0, z); d.scale.set(w, h, dd); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    city.add(im);
    return (rr) => { const [x, z, w, dd, h] = blds[Math.floor(rr() * blds.length)]; return [x + (rr() - 0.5) * w * 0.9, 1 + rr() * (h - 1.5), z + dd / 2 + 0.05]; };
  })(), CITY);
  scene.remove(cityPts); city.add(cityPts);

  // Café: deck, table, a string of bulbs
  const cafe = new THREE.Group(); scene.add(cafe);
  const wood = lambert(0x7a4e2c, { transparent: true }), deck = lambert(0x3a2a20, { transparent: true });
  mesh(new THREE.BoxGeometry(7, 0.06, 6), deck, 0, 0.03, TABLE[2] - 0.5, cafe);
  mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.07, 32), wood, TABLE[0], 0.88, TABLE[2], cafe);
  mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.85, 10), wood, TABLE[0], 0.45, TABLE[2], cafe);
  mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.05, 20), wood, TABLE[0], 0.06, TABLE[2], cafe);
  const wire = new THREE.LineBasicMaterial({ color: 0x1a1410, transparent: true });
  cafe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 21 }, (_, i) => { const k = i / 20; return new THREE.Vector3(-3.6 + 7.2 * k, 3.13 - Math.sin(k * Math.PI) * 0.35, TABLE[2] - 2.5 + 3 * k); })), wire));
  const cafeMats = [wood, deck, wire];

  // Glows: the hut lantern and the café bulbs (aSeed.x picks which, aSeed.y is size)
  {
    const pos = [HUT[0] - 0.2, 1.6, HUT[2] + 0.3, C[0], C[1] - 0.1, C[2] - 0.6], sd = [0.2, 0.9, 0, 0, 0.8, 7, 0, 1], cl = [1, 0.62, 0.25, 0.55, 0.36, 0.16];
    for (let i = 0; i < 14; i++) { const k = i / 13; pos.push(-3.6 + 7.2 * k, 3.05 - Math.sin(k * Math.PI) * 0.35, TABLE[2] - 2.5 + 3 * k); sd.push(0.5, 0.42, i, 0); cl.push(1, 0.75, 0.42); }
    for (const x of [-16, -5, 6, 17]) for (let z = -48; z > -104; z -= 1.6) { pos.push(x, 0.3, z); sd.push(0.5, 0.4, z, 0); cl.push(1, 0.62, 0.3); } // street lights toward the city
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 4)); g.setAttribute('aCol', new THREE.Float32BufferAttribute(cl, 3));
    const m = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: HEAD + GLOW, fragmentShader: GLOW_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.frustumCulled = false; scene.add(m);
  }

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x2a1a10, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1); scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8090c0, 0.25); fill.position.set(0, 10, 30); scene.add(fill);
  const fireLight = new THREE.PointLight(0xff6a20, 0, 30, 1); fireLight.position.set(0, 1.2, -18); scene.add(fireLight);
  const packLight = new THREE.PointLight(0xffc27a, 0, 16, 1); packLight.position.set(C[0] - 1, C[1] + 2.5, C[2] + 3); scene.add(packLight);
  const cafeLight = new THREE.PointLight(0xffb060, 0, 12, 1); cafeLight.position.set(0, 2.8, TABLE[2]); scene.add(cafeLight);

  // Colours of the evening
  const H_WARM = col(1, 0.56, 0.26), H_DUSK = col(0.3, 0.4, 0.54), H_NIGHT = col(0.09, 0.12, 0.2);
  const Z_DUSK = col(0.13, 0.2, 0.38), Z_NIGHT = col(0.03, 0.055, 0.12), WARM_FILL = col(1, 0.7, 0.4), SMOKE_DARK = col(0.4, 0.35, 0.33), SMOKE_LIT = col(0.85, 0.45, 0.22), MOON = col(0.4, 0.5, 0.8), HAZE = col(0.46, 0.42, 0.4), CITYGLOW = col(0.9, 0.5, 0.22);
  const horizon = col(0, 0, 0), zenith = col(0, 0, 0), sunDir = new THREE.Vector3(), v = new THREE.Vector3();

  function render(p, t) {
    const q = clamp01(p), P = params(q, t), sunW = smooth(0.35, 1, P.sun), night = smooth(0.55, 0.9, q);
    camera.position.set(P.camera.x, P.camera.y, P.camera.z);
    camera.lookAt(P.camera.lookX, P.camera.lookY, P.camera.lookZ);
    sky.position.copy(camera.position);

    horizon.lerpColors(H_DUSK, H_WARM, sunW).lerp(H_NIGHT, night).lerp(HAZE, P.smoke * 0.8).lerp(CITYGLOW, P.city * 0.12);
    zenith.lerpColors(Z_DUSK, Z_NIGHT, night).lerp(HAZE, P.smoke * 0.6);
    skyU.uHorizon.value.copy(horizon); skyU.uZenith.value.copy(zenith);
    sunDir.set(0.12, -0.1 + 0.16 * P.sun, -1).normalize();
    skyU.uSunDir.value.copy(sunDir); skyU.uSunAmt.value = sunW * (1 - P.smoke * 0.7);
    scene.fog.color.copy(horizon).lerp(Z_NIGHT, 0.35);
    ridges[0].material.color.copy(horizon).lerp(Z_NIGHT, 0.5);
    ridges[1].material.color.copy(horizon).lerp(Z_NIGHT, 0.28);

    hemi.color.copy(horizon).lerp(zenith, 0.35).lerp(MOON, 0.35 * (1 - sunW)); hemi.intensity = 0.7 + 0.5 * sunW;
    sun.position.copy(sunDir).multiplyScalar(50); sun.color.copy(H_WARM); sun.intensity = 1.4 * sunW;
    fill.color.lerpColors(MOON, WARM_FILL, sunW); fill.intensity = 0.55 * sunW + 0.7 * (1 - sunW);
    fireLight.intensity = 9 * P.fire; cafeLight.intensity = 5 * P.city;

    U.uT.value = t;
    U.uDust.value = (1 - smooth(0.45, 0.6, q)) * (1 - 0.6 * P.smoke);
    U.uFire.value = P.fire; U.uS.value = Math.max(P.smoke, 0.5 * P.fire); U.uEmber.value = Math.max(P.fire, 0.8 * P.smoke);
    U.uRise.value = smooth(0.2, 0.37, q) - smooth(0.37, 0.5, q);
    U.uSmokeHigh.value.copy(HAZE).multiplyScalar(0.55 + 0.5 * sunW); U.uSmokeLow.value.lerpColors(SMOKE_DARK, SMOKE_LIT, P.fire);
    U.uFold.value = P.fold; U.uFibA.value = smooth(0.42, 0.52, q); U.uFibOut.value = smooth(0.72, 0.77, q);
    U.uLantern.value = (0.5 + 0.5 * (1 - sunW)) * (1 - smooth(0.6, 0.75, q));
    U.uBulbs.value = P.city; U.uCity.value = P.city;
    U.uStars.value = smooth(0.42, 0.62, q) * P.clear * (1 - 0.5 * P.city);
    flames.visible = embers.visible = P.fire > 0.001 || P.smoke > 0.001;
    smoke.visible = U.uS.value > 0.001; fibres.visible = U.uFibA.value > 0.001 && U.uFibOut.value < 1;

    const form = smooth(0.8, 1, P.fold);
    U.uHalo.value = form * (1 - smooth(0.72, 0.8, q)); packLight.intensity = (2.5 * smooth(0.1, 0.6, P.fold) + 2.5 * form) * (1 - P.city);
    packMats.forEach((m) => { m.opacity = form; });
    pack.forEach((g, i) => {
      const o = OBJ[i], e = clamp01((P.fly - i * 0.08) / 0.84) ** 2.2;  // slow start keeps them just ahead of the camera
      const end = v.set(TABLE[0] + o.land[0], TABLE[1], TABLE[2] + o.land[2]), mid = (a, b) => (a + b) / 2;
      const m = [mid(o.at[0], end.x), mid(o.at[1], end.y) + 4, mid(o.at[2], end.z)];
      const b = (k) => (1 - e) ** 2 * o.at[k] + 2 * e * (1 - e) * m[k] + e * e * end.getComponent(k);
      U.uFA.value[i].set(...o.at); U.uFM.value[i].set(...m); U.uFE.value[i].copy(end); U.uFP.value.setComponent(i, e);
      g.position.set(b(0), b(1) + 0.05 * Math.sin(t * 1.2 + i * 2) * (1 - e), b(2));
      g.rotation.set(Math.sin(e * Math.PI) * 0.5, o.rot + (1 - e) * (i % 2 ? -6.28 : 6.28), 0);
      g.scale.setScalar(1 - 0.38 * e);
      g.visible = form > 0.001;
    });
    trails.visible = P.fly > 0 && P.fly < 1;
    city.visible = P.city > 0.001; city.position.y = -((1 - P.city) ** 2) * 16;
    cafe.visible = P.city > 0.001; cafeMats.forEach((m) => { m.opacity = P.city; });

    renderer.render(scene, camera);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === camera.userData.w && h === camera.userData.h) return;  // phone URL bars fire resize; the 100lvh canvas stays put
    camera.userData = { w, h };
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = w < h ? 62 : 48; camera.updateProjectionMatrix();
    const b = renderer.getDrawingBufferSize(new THREE.Vector2());
    U.uScale.value = b.y / (2 * Math.tan(camera.fov * Math.PI / 360)); U.uPR.value = renderer.getPixelRatio();
  }
  resize();

  function dispose() {
    scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    renderer.dispose(); renderer.forceContextLoss();  // hand the GPU context back at once
  }
  return { render, dispose, resize, renderer };
}

// ---- page wiring ----------------------------------------------------------------------------
let clock = 0;
function fallback() {
  window.scStills(); root.classList.remove('film'); delete window.scFilm;
  if (!clock && counters.length) clock = setInterval(() => tick(performance.now() / 1000), 250);  // stills mode has no frame loop
}

async function boot() {
  const canvas = document.getElementById('film');
  const probe = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
  const webgl = !!probe;
  probe?.getExtension('WEBGL_lose_context')?.loseContext();  // free the probe's context at once
  const motion = matchMedia('(prefers-reduced-motion: reduce)'), reducedMotion = motion.matches;
  if (!canvas || !webgl || reducedMotion || root.classList.contains('no-film') || new URLSearchParams(location.search).get('film') === 'off') return fallback();

  let film;
  try { THREE = await import('three'); film = start(canvas); } catch (e) { console.warn('film off:', e); film?.dispose(); return fallback(); }
  if (root.classList.contains('no-film')) return film.dispose();  // the 4 s failsafe already chose the stills

  const doors = document.getElementById('doors');
  let end = 1, raf = 0, last = 0, manual = false, shown = 0, frames = 0;
  const frameMs = [], t0 = performance.now();
  const measure = () => { end = Math.max(1, doors.offsetTop + doors.offsetHeight / 2 - innerHeight / 2); };
  const target = () => clamp01(scrollY / end);
  const stop = () => {
    cancelAnimationFrame(raf); removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVis);
    canvas.removeEventListener('webglcontextlost', onLost); motion.removeEventListener('change', onMotion); film.dispose(); fallback();
  };
  function frame(now) {
    if (manual) return;
    raf = requestAnimationFrame(frame);
    if (last && now - last < 12) return;  // 90/120 Hz screens draw every other frame (battery)
    const dt = last ? now - last : 16; last = now;
    shown += (target() - shown) * (1 - Math.exp(-dt / 120));  // a little damping on wheel steps
    const t = (now - t0) / 1000;
    film.render(shown, t); tick(t);
    if (frameMs.length < 30 && ++frames > 5) {                  // skip shader-compile frames, then judge 30
      frameMs.push(dt);
      if (frameMs.length === 30) { if (VIDEO || shouldUse3D({ webgl, reducedMotion, frameMs })) root.classList.add('film'); else stop(); }
    }
  }
  const onResize = () => { film.resize(); measure(); };
  const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden && !manual) { last = 0; raf = requestAnimationFrame(frame); } };
  const onLost = (e) => { e.preventDefault(); stop(); };
  const onMotion = (e) => { if (e.matches) stop(); };  // reduced motion switched on mid-visit: stills
  addEventListener('resize', onResize); document.addEventListener('visibilitychange', onVis);
  canvas.addEventListener('webglcontextlost', onLost); motion.addEventListener('change', onMotion);
  measure(); shown = target();
  document.fonts?.ready.then(measure);  // caption heights change when the web fonts arrive
  // scFilm.render(p, t) draws exactly that frame (scene and counters) and stops the scroll loop; open the page
  // with ?film=video for capture (see VIDEO above).
  window.scFilm = { render: (p, t) => { manual = true; cancelAnimationFrame(raf); film.render(p, t); tick(t); } };
  if (VIDEO) root.classList.add('film'); else raf = requestAnimationFrame(frame);
}
boot();
