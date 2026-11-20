// Home scroll film: one Three.js scene drawn only from params(p, t) (timeline.js), so any frame can be
// rendered again exactly. The page passes scroll and the clock; video tools call window.scFilm.render(p, t).
// Falls back to the still images (html.no-film) when WebGL, speed, the CDN or reduced motion say so.
import { params, rng, counter, shouldUse3D, tooSlow, through } from './timeline.js';
import { HEAD, SOFT, DUST, FIRE, TONGUE_V, TONGUE_F, NOISE, EMBER, BLADE_V, BLADE_F, SMOKE, SMOKE_F, FIBRE, FIBRE_F, TRAIL, GLOW, GLOW_F, CITY, CITY_F, BOKEH, STARS, SKY_V, SKY_F, RIDGE_V, RIDGE_F, TREE_V, TREE_F, GROUND_FX, PULP } from './shaders.js';
import { TIERS, pickTier, nextStep, parseFilmFlags } from './tiers.js';

const root = document.documentElement;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
let THREE;

// ?film=video: the video tool owns the frames. No MSAA (its resolve is not bit-exact between identical
// frames) and no speed check; frames come only from window.scFilm.render(p, t).
const FLAGS = parseFilmFlags(location.search);
const VIDEO = FLAGS.mode === 'video', BENCH = FLAGS.mode === 'bench';
// ?film=video&tier=low captures the phone look; otherwise the tier follows the device (video is always ultra).
// One WebGL probe: does WebGL exist, and which GPU is it (integrated GPUs start on Low). Its context is freed at once.
const probe = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
const WEBGL = !!probe;
let GPU;
try { GPU = probe?.getParameter(probe.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL); } catch { GPU = undefined; }
probe?.getExtension('WEBGL_lose_context')?.loseContext();
const TIER = TIERS[FLAGS.tier || pickTier({
  width: innerWidth, coarse: matchMedia('(pointer: coarse)').matches, deviceMemory: navigator.deviceMemory, video: VIDEO, gpu: GPU,
})];

// Counters: illustrative story figures that follow the same t as the scene (film loop, scFilm.render, or the
// stills-mode clock), so a captured frame shows the counters for its own t.
const LOW_EXPOSURE = 1.25, POST_EXPOSURE = 1.25;
const fmt = new Intl.NumberFormat('en-US');
const counters = [...document.querySelectorAll('[data-counter]')];
const tick = (t) => counters.forEach((c) => {
  const v = fmt.format(counter(+c.dataset.counter, +c.dataset.rate, t));
  if (c.textContent !== v) c.textContent = v;
});

// ---- shaders --------------------------------------------------------------------------------
















// ---- the world ------------------------------------------------------------------------------



const groundH = (x, z) => (z < -36 ? 0 : (0.1 * Math.sin(x * 0.9) * Math.cos(z * 0.7) + 0.05 * Math.sin(x * 2.3 + z * 1.7)) * smooth(-36, -31, z));
const SMOKE_CAP = { low: 0.3, high: 0.22, ultra: 0.26 };  // largest smoke puff, x uScale (screen overdraw)
const BLADES = 24000;                                // field blades at density 1 (High x10, Ultra x30)
const C = [0, 2.4, -14];                              // where the straw swirls and folds
const ROW = 0.3, HILL = 0.22;                         // harvest rows (along z) and the hill spacing along a row
const HUT = [9.5, 0, -16];                            // right of the hero text, the sun setting behind it
const DECK = 0.06;                                    // the terrace floor: cafe.glb's origin sits on it
const TABLE = [0, DECK + 0.75, -42];                  // the bistro table top, real size (0.70 m across)
const CANDLE_AT = [-0.2, 0, -0.17];                   // the candle on the table, back left (cafe.glb models it at z 0.13)
const CANDLE = [TABLE[0] + CANDLE_AT[0], TABLE[1], TABLE[2] + CANDLE_AT[2]];
// the festoon (wire, bulbs) moved back to the railing, turned across the view and scaled up (big globe bulbs, a long
// sag) so its ends leave the frame at the top: x, y, z (from the table on the deck), turn, scale
const LIGHTS_AT = [0, -1.4, -3.4, 0.45, 1.7];
// The burn (FIRE in shaders.js has the same maths for the flames, char and glow). Fire lines run a to b: [ax, az, bx, bz].
// FIRE_T per line, in burn units (burnAt: 0..1 over p 0.2-0.45, from p only): ignition start, the time the ignition
// takes to run the line, 1 if it runs from b, and how fast the front then moves (m per unit). Each line runs right to
// left as seen, so its front moves toward the camera: black char behind the flames, gold stubble ahead of them.
// The farmer's line (FARMER) is the nearest and starts at 0 at his torch, at its right end; the others were lit earlier.
const FIRES = [[-5.5, -18.8, -12, -17.5], [2.8, -22.6, -2.5, -21.3], [4.2, -13.6, -3.5, -12.9], [12, -23.5, 5.5, -24], [-2, -27, -10, -25.5]];
const FIRE_T = [[-0.9, 0.55, 0, 1.6], [-0.45, 0.5, 1, 1.6], [0, 0.8, 0, 1.3], [-0.7, 0.6, 0, 1.3], [-1.2, 0.6, 1, 1.5]];
const FARMER = 2, FARMER_S = 1.5;                  // his line; he is drawn 1.5x so he reads as the story's anchor at film distance
// raked straw piles out in the open field, centre-left, metres clear of the hut and of the lines: x, z, radius, height; and when each catches
const PILES = [[2.4, -16.8, 0.95, 0.85], [-0.6, -17, 0.75, 0.7]], PILE_T = [0.05, 0.3];
const COL_U = [0.5, 0.5, 0.25, 0.5, 0.5];             // where each line's smoke column stands (then one per pile)
const burnAt = (q) => clamp01((q - 0.2) / 0.25);
const fWob = (j, s) => 0.6 * Math.sin(s * 0.55 + j * 1.7) + 0.3 * Math.sin(s * 1.37 + j * 4.3) + 0.12 * Math.sin(s * 3.1 + j * 2);
// the front on line j at u (0..1 from a) at burn B: [x, z, age]; age < 0: not lit yet
function frontAt(j, u, B) {
  const [ax, az, bx, bz] = FIRES[j], [t0, run, fromB, speed] = FIRE_T[j], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), s = u * L;
  const age = B - t0 - run * (fromB ? 1 - u : u);
  const off = fWob(j, s) - speed * Math.max(age, 0) * (0.45 + 0.55 * smooth(0, 1.5, Math.min(s, L - s))) * (1 + 0.3 * Math.sin(s * 0.8 + j * 2.3));
  return [ax + dx * u - dz / L * off, az + dz * u + dx / L * off, age];
}
const pileAmt = (i, B) => smooth(0, 0.08, B - PILE_T[i]) * (1 - 0.45 * smooth(0.6, 1.4, B - PILE_T[i]));
// The farmer (farmer.glb) walks slowly along his line behind the fire it runs ahead of him; his torch head,
// (0.33, 0, 1.33) from his feet in the model, rests on the front. [x, z, turn]
function farmerAt(B) {
  const [x0, z0] = frontAt(FARMER, 0.04 + 0.3 * B, B), [ax, az, bx, bz] = FIRES[FARMER];
  const a = Math.atan2(bx - ax, bz - az), c = Math.cos(a), s = Math.sin(a);
  return [x0 - FARMER_S * (0.33 * c + 1.33 * s), z0 - FARMER_S * (1.33 * c - 0.33 * s), a];
}
// The packaging forms in the air over the field, just above chest height, and lands on the café table.
// box, bowl, cup, then fork, spoon, chopsticks (packaging.glb only; the drinking straw stands in the cup).
// at: where it folds (world); rot: turn in the air; pose: the model's tilt in the air (Euler x, z; cutlery shows
// its face, angled up); table: where it lands on the table [x, z, turn] (offset from the table centre).
// v1's procedural box, bowl and cup fold at FOLD_S and land at LAND_S; the real-size models fold at FIELD_S and land at 1.
const FOLD_S = 0.6, LAND_S = 0.18, FIELD_S = 4;
const OBJ = [
  { at: [-0.95, 1.0, -14], rot: 0.35, pose: [0, 0], table: [-0.08, 0.02, 0.15] },
  { at: [0.0, 1.0, -13.75], rot: 0, pose: [0, 0], table: [0.1, -0.13, 0] },
  { at: [0.8, 1.0, -14.05], rot: 0, pose: [0, 0], table: [0.23, -0.02, 0] },
  { at: [-0.75, 0.55, -13.55], rot: 0, pose: [1.25, 0.55], table: [0, 0.2, 1.9] },
  { at: [0.05, 0.53, -13.5], rot: 0, pose: [1.25, 0.55], table: [0.09, 0.21, 1.94] },
  { at: [0.8, 0.57, -13.7], rot: 0, pose: [1.25, 0.55], table: [0.19, 0.12, -1.1] },
];
const PACK_NODES = ['box', 'bowl', 'cup', 'fork', 'spoon', 'chopsticks'];
// the fibre ribbon's spine (FIBRE): an S rising from the stubble to over the forming spot, placed for wide screens and,
// since key 3 pins the portrait p 0.6 camera, again inside the narrow portrait frame (the fibres land on the pieces either way)
const SPINE_WIDE = [[-1.7, 0.05, -12.2], [0.9, 1.3, -12.5], [-1.2, 2.6, -13.5], [1.0, 3.6, -14.2], [0.2, 2.7, -14.1]];
const SPINE_TALL = [[0.5, 0.05, -11.5], [3, 0.9, -12.3], [0.6, 2.2, -13.2], [3.5, 4, -14], [2.2, 3, -14]];
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
    // as rotation.y
    const c = Math.cos(OBJ[0].rot), s = Math.sin(OBJ[0].rot);
    p = [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
  } else if (o === 1) { const y = r() < 0.35 ? 0.4 : 0.4 * r() ** 0.7, rr = bowlR(y); p = [Math.cos(a) * rr, y, Math.sin(a) * rr]; }
  else if (r() < 0.3) { const rr = r() < 0.6 ? 0.34 : Math.sqrt(r()) * 0.34; p = [Math.cos(a) * rr, 0.78, Math.sin(a) * rr]; }
  else { const y = 0.75 * r(), rr = cupR(y); p = [Math.cos(a) * rr, y, Math.sin(a) * rr]; }
  return p.map((v, i) => v * FOLD_S + OBJ[o].at[i]);
}

const col = (r, g, b) => new THREE.Color(r, g, b);

function pulp(mat, rim) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uRim = rim;
    s.fragmentShader = 'uniform vec3 uRim;\n' + s.fragmentShader.replace('#include <emissivemap_fragment>',
      // soft warm rim
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uRim * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);');
    s.vertexShader = 'varying vec3 vObjP;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjP = position;');
    s.fragmentShader = PULP + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float mot = pn(vObjP * 9.0) * 0.5 + pn(vObjP * 24.0) * 0.3 + pn(vObjP * vec3(80.0, 240.0, 80.0)) * 0.2;
      diffuseColor.rgb *= 0.8 + 0.36 * mot;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.58, 0.42, 0.22), smoothstep(0.78, 0.9, pn(vObjP * 150.0 + 3.1)) * 0.35);`);
  };
  return mat;
}

// Adds an object-space position varying and a colour snippet (the terrace tiles) to a built-in material.
// Used once: a second pattern would need its own customProgramCacheKey, as the compile hook source is shared.
function pattern(mat, glsl) {
  mat.onBeforeCompile = (s) => {
    s.vertexShader = 'varying vec3 vTP;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTP = position;');
    s.fragmentShader = 'varying vec3 vTP;\n' + s.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + glsl);
  };
  return mat;
}

// ---- models -----------------------------------------------------------------------------------
// The film works in display colours (ColorManagement off, linear output), so glTF's linear factors and sRGB textures
// are taken as display values: the factors converted, the textures read raw. Flames become additive (no depth write,
// brightness set by the film); transmission glass becomes plain tinted transparency with a glow (no transmission pass).
function prepare(m) {
  ['color', 'emissive', 'sheenColor'].forEach((k) => m[k]?.convertLinearToSRGB());
  ['map', 'emissiveMap', 'sheenColorMap'].forEach((k) => { if (m[k]) m[k].colorSpace = THREE.NoColorSpace; });
  if (m.name.startsWith('flame')) {
    const base = m.emissive.clone().multiplyScalar(m.emissiveIntensity);
    const b = new THREE.MeshBasicMaterial({ name: m.name, color: base, map: m.emissiveMap, transparent: true, opacity: m.opacity, side: m.side, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    b.userData.base = base;
    return b;
  }
  if (!(m.transmission > 0)) return m;
  const amber = m.name === 'glass';
  const g = new THREE.MeshStandardMaterial({ name: m.name, color: amber ? 0xa04a0c : 0xfff4e6, emissive: amber ? 0xb8460a : 0xffc070, emissiveIntensity: 0, roughness: 0.15, transparent: true, opacity: 0.8, depthWrite: false });
  if (amber) {
    g.onBeforeCompile = ribbedGlass;
    g.customProgramCacheKey = () => 'ribbedGlass';
  }
  return g;
}
// The candle's amber glass: vertical ribs (around the glass axis, cafe.glb space), clear between them so the wax and
// flame show through, darker and denser at the silhouette; the flame's glow lights the ribs most at its own height.
function ribbedGlass(sh) {
  sh.vertexShader = 'varying vec3 vGP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGP = position;');
  sh.fragmentShader = 'varying vec3 vGP;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    float rib = pow(0.5 + 0.5 * cos(atan(vGP.z - 0.13, vGP.x + 0.2) * 26.0), 1.5);
    float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
    float band = smoothstep(0.75, 0.79, vGP.y) * smoothstep(0.84, 0.8, vGP.y);
    totalEmissiveRadiance *= (0.35 + 1.3 * rib * (1.0 - 0.5 * fres)) * (0.5 + 0.8 * band);
    diffuseColor.a *= 0.68 + 0.22 * rib + 0.1 * fres;`);
}

// One-time layout inside a loaded model, so a rebuild after a tier step attaches it again as it is.
function arrange(name, root) {
  const swaps = new Map();
  root.traverse((o) => {
    if (!o.material) return;
    if (!swaps.has(o.material)) swaps.set(o.material, prepare(o.material));
    o.material = swaps.get(o.material);
  });
  if (name === 'cafe') {
    // the candle from the model's front left to CANDLE_AT; the festoon back over the railing, its poles hidden
    const candle = new THREE.Group(), lights = new THREE.Group();
    candle.position.set(CANDLE_AT[0] + 0.2, 0, CANDLE_AT[2] - 0.13);
    candle.add(root.getObjectByName('candle'), root.getObjectByName('candle_flame'));
    lights.position.set(LIGHTS_AT[0], LIGHTS_AT[1], LIGHTS_AT[2]);
    lights.rotation.y = LIGHTS_AT[3];
    lights.scale.setScalar(LIGHTS_AT[4]);
    root.children.filter((o) => /^(bulb_|string_)/.test(o.name)).forEach((o) => lights.add(o));
    lights.getObjectByName('string_posts').visible = false;
    root.add(candle, lights);
  }
  if (name === 'packaging') {
    // the drinking straw stands through the lid's straw hole, tilted, about 45% of the cup's height above it
    const pivot = new THREE.Group(), straw = root.getObjectByName('drinking_straw');
    pivot.position.set(0.01, 0.1112, 0.017);
    pivot.rotation.set(0.06, 0, -0.14);
    straw.rotation.set(0, 0, Math.PI / 2);
    straw.position.set(0.0035, -0.0255, 0);
    root.getObjectByName('cup').add(pivot.add(straw));
    root.userData.pieces = PACK_NODES.map((n) => root.getObjectByName(n));
  }
  return root;
}

// Loads every model; one that fails (404, blocked folder, blocked Draco decoder) is left out with a warning.
async function loadModels() {
  const [{ GLTFLoader }, { DRACOLoader }, { MeshSurfaceSampler }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/DRACOLoader.js'), import('three/addons/math/MeshSurfaceSampler.js'),
  ]);
  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
  const loader = new GLTFLoader().setDRACOLoader(draco), names = ['hut', 'packaging', 'cafe', 'farmer'], M = { Sampler: MeshSurfaceSampler };
  const got = await Promise.allSettled(names.map((n) => loader.loadAsync(`models/${n}.glb`)));
  draco.dispose();
  got.forEach((r, i) => {
    if (r.status === 'fulfilled') M[names[i]] = arrange(names[i], r.value.scene);
    else console.warn('film model off:', names[i], r.reason?.message ?? r.reason);
  });
  return M;
}

export function start(canvas, tier = TIER) {
  // colours below are written as they should look
  THREE.ColorManagement.enabled = false;
  // MSAA is fixed when the context is made, so a High start keeps it after a step down to low.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier.msaa && !VIDEO, powerPreference: 'high-performance' });
  try {
    let cur = build(canvas, renderer, tier), models = null;
    const film = {
      renderer, tier,
      render: (p, t) => cur.render(p, t),
      resize: (force) => cur.resize(force),
      // a late import must not attach after a step down
      attachPost: (m) => { if (film.tier.post) cur.attachPost(m); },
      attachModels(m) {
        models = m;
        cur.attachModels(m);
      },
      // Step down to another tier: rebuild the scene with that tier's counts on the same renderer (one-time hitch).
      setTier(next) {
        cur.dispose(true);
        cur = build(canvas, renderer, next);
        film.tier = next;
        if (models) cur.attachModels(models);
      },
      dispose: () => cur.dispose(),
    };
    return film;
  } catch (e) { renderer.dispose(); renderer.forceContextLoss(); throw e; }
}

function build(canvas, renderer, tier) {
  // Counts scale with the tier's density; v1's halving under 768 px stays on low only.
  const small = tier.name === 'low' && innerWidth < 768, n = (x) => (small ? x >> 1 : Math.round(x * tier.density));
  renderer.setPixelRatio(tier.dpr === null ? devicePixelRatio : Math.min(devicePixelRatio, tier.dpr));
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  // Filmic tone mapping everywhere: the composer's OutputPass applies it on High/Ultra, the renderer on Low and
  // while post is not loaded (or failed). Low gets a little more exposure so ACES does not make it darker than v1.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = tier.post ? POST_EXPOSURE : LOW_EXPOSURE;
  let post = null;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 500);
  scene.fog = new THREE.Fog(0, 18, 140);

  const U = {
    uT: { value: 0 }, uScale: { value: 1 }, uPR: { value: 1 }, uDust: { value: 0 }, uFire: { value: 0 }, uEmber: { value: 0 },
    uClear: { value: 0 }, uHot: { value: 1 }, uTA: { value: 1 }, uTW: { value: 0.32 }, uTH: { value: 1.4 }, uCityGround: { value: 0 }, uS: { value: 0 }, uFold: { value: 0 }, uFibA: { value: 0 }, uFibOut: { value: 0 }, uSurf: { value: 0 }, uSpine: { value: SPINE_WIDE.map((q) => new THREE.Vector3(...q)) }, uStartOff: { value: new THREE.Vector3() },
    uLantern: { value: 0 }, uBulbs: { value: 0 }, uHalo: { value: 0 }, uCity: { value: 0 }, uStars: { value: 0 }, uWin: { value: small ? 2.4 : 1 }, uLift: { value: 0 }, uLiftK: { value: 0 }, uLitF: { value: small ? 0.8 : 0.45 },
    uFA: { value: [0, 1, 2].map(() => new THREE.Vector3()) }, uFM: { value: [0, 1, 2].map(() => new THREE.Vector3()) }, uFE: { value: [0, 1, 2].map(() => new THREE.Vector3()) }, uFP: { value: new THREE.Vector3() },
    uFires: { value: FIRES.map((q) => new THREE.Vector4(...q)) }, uFireT: { value: FIRE_T.map((q) => new THREE.Vector4(...q)) }, uPiles: { value: PILES.map((q) => new THREE.Vector4(...q)) }, uPileT: { value: new THREE.Vector2(...PILE_T) }, uBurn: { value: 0 },
    uCol: { value: [...COL_U, 0, 0].map(() => new THREE.Vector4()) },
    uSmokeLow: { value: col(0.5, 0.3, 0.2) }, uSmokeHigh: { value: col(0.5, 0.48, 0.48) }, uSmokeFire: { value: col(0, 0, 0) },
    uSmokeA: { value: 0 }, uSmokeCap: { value: SMOKE_CAP[tier.name] }, uFoot: { value: small ? 0.04 : 0.13 }, uHfPow: { value: small ? 1.5 : 1 }, uPuff: { value: small ? 1.8 : 1 }, uFibCol: { value: col(1, 0.7, 0.32) },
    uSunDirW: { value: new THREE.Vector3() }, uRim: { value: col(0, 0, 0) }, uDrop: { value: 0 },
  };
  const bladeU = {
    uT: U.uT, uFireAmt: { value: 0 }, uPack: { value: 0 }, uSunDir: { value: new THREE.Vector3() },
    uSunCol: { value: col(1, 0.6, 0.3) }, uAmb: { value: col(0, 0, 0) }, uChar: { value: 0 }, uCool: { value: 0 }, uRows: { value: 0 }, uRimK: { value: 1 }, uSmall: { value: small ? 1 : 0 }, uHutSh: { value: new THREE.Vector4() }, uHutL: { value: new THREE.Vector2(1, 1) }, uPackPos: { value: new THREE.Vector3(...C) },
    uFires: U.uFires, uFireT: U.uFireT, uPiles: U.uPiles, uPileT: U.uPileT, uBurn: U.uBurn, uObj: { value: [0, 1, 2].map(() => new THREE.Vector4()) },
    uPileK: { value: 1 }, uFieldN: { value: 0 },
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

  const shadowTex = (() => {  // a soft round shadow (alpha map)
    const N = 64, a = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1, k = Math.max(0, 1 - (u * u + v * v)); a.fill(Math.round(255 * k * k), (y * N + x) * 4, (y * N + x) * 4 + 4); }
    const t = new THREE.DataTexture(a, N, N);
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  })();

  // Sky dome (follows the camera) with stars
  const skyU = {
    uHorizon: { value: col(0, 0, 0) }, uCoral: { value: col(0, 0, 0) }, uMid: { value: col(0, 0, 0) }, uZenith: { value: col(0, 0, 0) },
    uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: col(1, 0.62, 0.3) }, uSunAmt: { value: 0 }, uDisc: { value: 0 },
    uGlow: { value: col(0.9, 0.48, 0.22) }, uCity: U.uCity, uCloud: { value: 0 }, uCloudCol: { value: col(0, 0, 0) }, uCityGlow: { value: 0 }, uSmokeSun: { value: new THREE.Vector3() }, uSmokeDark: { value: col(0.12, 0.1, 0.09) }, uSmokeSky: { value: 0 }, uT: { value: 0 },
  };
  const sky = new THREE.Group(); scene.add(sky);
  const dome = mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_V, fragmentShader: SKY_F, side: THREE.BackSide, depthWrite: false }), 0, 0, 0, sky);
  dome.renderOrder = -2;
  const stars = points(n(500), 9, (r) => { const a = r() * 6.28, y = 0.08 + r() * 0.9, s = Math.sqrt(1 - y * y); return [Math.cos(a) * s * 280, y * 280, Math.sin(a) * s * 280]; }, STARS);
  scene.remove(stars); sky.add(stars);

  // Mountain ridges far away, coloured by the sky each frame (aerial perspective)
  const ridges = [[-150, 2, 7, 5], [-190, 5, 13, 3], [-230, 9, 22, 4], [-270, 13, 30, 6]].map(([z, lo, hi, seed]) => {
    const r = rng(seed), N = 200, v = [], idx = [];
    let y = lo;
    const top = [], ph = r() * 6.28;
    for (let i = 0; i <= N; i++) {
      y = Math.min(hi, Math.max(lo, y + (r() - 0.5) * 3));
      // big massifs and saddles, not one even saw
      const c = lo + (y - lo) * (0.55 + 0.45 * Math.sin(i * 0.045 + ph) * Math.sin(i * 0.017 + ph * 2)) + (r() - 0.5) * 0.8;
      v.push(-280 + i * 2.8, c, z, -280 + i * 2.8, -6, z); top.push(c, c);
    }
    for (let i = 0; i < N; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1)); g.setIndex(idx);
    return mesh(g, new THREE.ShaderMaterial({ uniforms: { uCol: { value: col(0, 0, 0) }, uHaze: { value: col(0, 0, 0) }, uTop: { value: hi }, uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: col(0, 0, 0) } }, vertexShader: RIDGE_V, fragmentShader: RIDGE_F }));
  });

  // Ground: low-poly field that turns to dark city ground past z = -32
  {
    const g = new THREE.PlaneGeometry(220, 280, 55, 70); g.rotateX(-Math.PI / 2); g.translate(0, 0, -110);
    const r = rng(2), P = g.attributes.position, cols = [], field = [];
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i), k = smooth(-30, -37, z), v = 0.85 + r() * 0.3;
      P.setY(i, groundH(x, z) + r() * 0.06);
      cols.push((0.72 * (1 - k) + 0.15 * k) * v, (0.5 * (1 - k) + 0.11 * k) * v, (0.24 * (1 - k) + 0.1 * k) * v);
      field.push(0.44 * v, 0.31 * v, 0.19 * v);  // bare dry soil and chaff between the rows
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.setAttribute('aField', new THREE.Float32BufferAttribute(field, 3));
    g.computeVertexNormals();
    // The field runs on to the hazy horizon; the dark city ground only fades in for the flight to the cafe.
    // own haze below: on Low three fogs after tone mapping (a dark band under the ridges)
    const gm = lambert(0xffffff, { vertexColors: true, flatShading: true, fog: false });
    gm.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, { uCityGround: U.uCityGround, uDrop: U.uDrop, uHaze: { value: scene.fog.color }, uFires: U.uFires, uFireT: U.uFireT, uPiles: U.uPiles, uPileT: U.uPileT, uBurn: U.uBurn, uChar: bladeU.uChar, uFireAmt: bladeU.uFireAmt, uRows: bladeU.uRows, uT: U.uT });
      s.vertexShader = 'attribute vec3 aField; uniform float uCityGround, uDrop; varying float vGH; varying vec3 vWP;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y -= uDrop * 12.0 * (1.0 - smoothstep(-50.0, -46.0, transformed.z));\nvWP = transformed;').replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = mix(aField, vColor.rgb, uCityGround);')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvGH = mix(min(0.95, smoothstep(8.0, 46.0, -mvPosition.z) * 0.55 + smoothstep(36.0, 80.0, -mvPosition.z) * 0.4 + smoothstep(-22.0, -34.0, transformed.z) * 0.95), smoothstep(2.0, 32.0, -mvPosition.z) * 0.92, uCityGround);');
      // the bare ground past the blades fades to the same haze as the far blades
      // before tone mapping, like the ridges and blades
      s.fragmentShader = 'varying float vGH; varying vec3 vWP; uniform vec3 uHaze; uniform float uChar, uFireAmt, uRows, uCityGround, uT;\n' + NOISE + FIRE + s.fragmentShader.replace('#include <tonemapping_fragment>', GROUND_FX + 'gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, vGH);\n#include <tonemapping_fragment>');
    };
    mesh(g, gm);
  }

  // Field: thin tapered straw blades, BLADES x density, placed from rng(3); sway and light are in BLADE_V.
  {
    // then straw heaped on the piles (lying every which way over the mound)
    const field = small ? 18000 : n(BLADES), perPile = small ? 300 : Math.round(250 * Math.sqrt(tier.density)), count = field + 2 * perPile, r = rng(3), d = new THREE.Object3D();
    bladeU.uFieldN.value = field;                     // instances from here on are the straw heaped on the piles
    const g = new THREE.BufferGeometry();
    // thin, tapering
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.24, 0.55, 0, 0.24, 0.55, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...bladeU }, vertexShader: BLADE_V, fragmentShader: BLADE_F,
      side: THREE.DoubleSide, fog: true,
    });
    const im = new THREE.InstancedMesh(g, mat, count);
    d.rotation.order = 'YXZ';                         // tilt (x), then turn (y): lying straw points any way
    for (let i = 0; i < field; i++) {
      // phones (portrait, narrow view) get their straw where the camera looks, and none right at the lens
      let z = (small ? 7.5 : 10) - r() * (small ? 41.5 : 44), x = (r() - 0.5) * (small ? 6 + 0.7 * (10 - z) : 52);
      const kind = r();
      let h, wd, tilt = (r() - 0.5) * 0.5, lie = false;
      if (z > 3 && kind < 0.18) { h = 0.45 + r() * 0.4; wd = 0.03 + r() * 0.02; }  // a few long clumps up front, for depth
      else if (kind < 0.62) {                         // cut stubble: short stalks in hills along the harvest rows
        x = Math.round(x / ROW) * ROW + (r() - 0.5) * 0.07; z = Math.round(z / HILL) * HILL + (r() - 0.5) * 0.07;
        h = 0.1 + r() * 0.18; wd = (small ? 0.03 : 0.018) + r() * 0.012;
      // loose straw lying between the rows
      } else { lie = true; h = 0.3 + r() * 0.45; wd = (small ? 0.045 : 0.025) + r() * 0.02; tilt = Math.PI / 2 - 0.12 + (r() - 0.5) * 0.2; }
      d.position.set(x, groundH(x, z) + (lie ? 0.015 : -0.02), z);
      d.rotation.set(tilt, r() * 6.28, (r() - 0.5) * 0.3);
      d.scale.set(wd, h, 1);
      d.updateMatrix(); im.setMatrixAt(i, d.matrix);
    }
    for (let i = field; i < count; i++) {
      const [px, pz, R, H] = PILES[i < field + perPile ? 0 : 1], k = Math.sqrt(r()) * 0.95, a = r() * 6.28;
      const x = px + Math.cos(a) * k * R, z = pz + Math.sin(a) * k * R;
      d.position.set(x, groundH(px, pz) + H * Math.sqrt(1 - k * k) * 0.88 - 0.03, z);
      d.rotation.set(Math.PI / 2 - 0.15 - r() * 0.7 * (1 - k), r() * 6.28, (r() - 0.5) * 0.6);
      d.scale.set(0.02 + r() * 0.02, 0.35 + r() * 0.4, 1);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.frustumCulled = false;                         // blades bend in the shader
    scene.add(im);
  }

  // A broken tree line at the far edge of the field, hazed by the fog; it sinks away before the cafe.
  const treeU = { uHaze: { value: col(0, 0, 0) }, uDark: { value: col(0, 0, 0) }, uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: col(0, 0, 0) }, uSmoke: { value: 0 } };
  const trees = (() => {
    const r = rng(16), d = new THREE.Object3D(), list = [], palms = [], grp = new THREE.Group();
    for (let i = 0; i < 1000; i++) {  // canopies of many sizes with real gaps
      const back = i >= 680, x = (r() - 0.5) * 240, z = back ? -62 - r() * 10 : -48 - r() * 10, big = r() < 0.12;
      const sx = big ? 1.3 + r() * 0.7 : 0.6 + r() * 0.8, sy = big ? 1.1 + r() * 0.6 : 0.6 + r() * r() * 1.1, sz = sx * (0.7 + r() * 0.4);
      if (!back && Math.sin(x * 0.11) + Math.sin(x * 0.047 + 1) < -0.9) continue;
      list.push([x, sy * 0.7, z, sx * (back ? 1.3 : 1), sy * (back ? 1.2 : 1), sz]);
    }
    // a low, broken hedge along the field's far end, misted, so the stubble does not stop on a straight line
    for (let i = 0; i < 420; i++) {
      const sx = 0.5 + r() * 0.7, sy = 0.22 + r() * 0.3;
      list.push([(r() - 0.5) * 130, sy * 0.35, -35 - r() * 4, sx, sy, sx * (0.7 + r() * 0.4)]);
    }
    // sugar palms over the canopy: slightly bent trunks with a crown of drooping fronds
    for (let i = 0; i < 32; i++) palms.push([(r() - 0.5) * 230, -46 - r() * 10, 4.5 + r() * 2.5, 1.7 + r() * 0.6]);
    const mat = new THREE.ShaderMaterial({ uniforms: treeU, vertexShader: TREE_V, fragmentShader: TREE_F });
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), mat, list.length);
    list.forEach(([x, y, z, sx, sy, sz], i) => { d.position.set(x, y, z); d.scale.set(sx, sy, sz); d.updateMatrix(); crowns.setMatrixAt(i, d.matrix); });
    const BEND = 0.6, trunkGeo = new THREE.CylinderGeometry(0.07, 0.13, 1, 5, 6).translate(0, 0.5, 0), tp = trunkGeo.attributes.position;
    for (let i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) + BEND * tp.getY(i) ** 2);
    // one crown: 8 fronds, each a tapered leaf with a sawn edge (leaflets) that rises a little and droops (unit length)
    const fv = [], fi = [], FN = 8, FS = 8;
    for (let k = 0; k < FN; k++) {
      const a = k / FN * 6.28 + 0.3 * Math.sin(k * 2.3), up = [1.25, 0.45, 0.85, 0.15][k % 4], ca = Math.cos(a), sa = Math.sin(a);  // some fronds stand up, so no crown reads as an umbrella
      for (let j = 0; j <= FS; j++) {
        const t = j / FS, y = up * t - 0.95 * t * t, w = 0.15 * Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 0.6 * (j % 2 ? 1.3 : 0.75);
        fv.push(ca * t + sa * w, y, sa * t - ca * w, ca * t - sa * w, y, sa * t + ca * w);
        const b = (k * (FS + 1) + j) * 2;
        if (j < FS) fi.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const frondGeo = new THREE.BufferGeometry();
    frondGeo.setAttribute('position', new THREE.Float32BufferAttribute(fv, 3));
    frondGeo.setIndex(fi);
    frondGeo.computeVertexNormals();
    const trunks = new THREE.InstancedMesh(trunkGeo, mat, palms.length);
    const fronds = new THREE.InstancedMesh(frondGeo, new THREE.ShaderMaterial({ uniforms: treeU, vertexShader: '#define PALM\n' + TREE_V, fragmentShader: TREE_F, side: THREE.DoubleSide }), palms.length);
    palms.forEach(([x, z, h, L], i) => {
      d.rotation.set(0, i * 2.4, 0);
      d.position.set(x, 0, z);
      d.scale.set(1, h, 1);
      d.updateMatrix();
      trunks.setMatrixAt(i, d.matrix);
      d.position.set(x + BEND * Math.cos(i * 2.4), h, z - BEND * Math.sin(i * 2.4));
      d.scale.setScalar(L);
      d.updateMatrix();
      fronds.setMatrixAt(i, d.matrix);
    });
    d.rotation.set(0, 0, 0);
    grp.add(crowns, trunks, fronds);
    scene.add(grp);
    return grp;
  })();

  // Farmer's hut on stilts, with a lantern
  let hutWin, hutV1;
  const hutRim = { value: col(0, 0, 0) }, hutAmb = { value: col(1, 1, 1) }, hut = new THREE.Group();
  // backlit by the low sun: the sky's fill on the hut is cut (uHutAmb, warm when the fire is near) so it reads as a silhouette
  const ambHook = (sh) => {
    sh.uniforms.uHutAmb = hutAmb;
    sh.fragmentShader = 'uniform vec3 uHutAmb;\n' + sh.fragmentShader.replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= uHutAmb;');
  };
  // and a warm rim where the low sun or the afterglow catches the thatch edges (v1 roof and hut.glb thatch)
  const rimHook = (sh) => {
    ambHook(sh);
    sh.uniforms.uHutRim = hutRim;
    sh.fragmentShader = 'uniform vec3 uHutRim;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uHutRim * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 5.0);');
  };
  {
    // backlit: dark, the rim does the work
    const wood = lambert(0x24170e), thatch = lambert(0x2a1c10, { flatShading: true });
    for (const [x, z] of [[-1, -0.8], [1, -0.8], [-1, 0.8], [1, 0.8]]) mesh(new THREE.BoxGeometry(0.12, 1.9, 0.12), wood, x, 0.95, z, hut);
    mesh(new THREE.BoxGeometry(2.3, 0.12, 1.9), wood, 0, 0.95, 0, hut);
    mesh(new THREE.BoxGeometry(2.1, 0.8, 0.06), wood, 0, 1.4, -0.8, hut);
    for (const x of [-1.03, 1.03]) mesh(new THREE.BoxGeometry(0.06, 0.8, 1.6), wood, x, 1.4, 0, hut);  // side walls: a room, not a panel
    // lamplight on the back wall: a small soft warm patch, not a lit panel
    hutWin = mesh(new THREE.PlaneGeometry(0.62, 0.4), new THREE.MeshBasicMaterial({ color: 0xffffff, alphaMap: shadowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 0.2, 1.38, -0.76, hut);
    thatch.onBeforeCompile = rimHook;
    const roof = mesh(new THREE.ConeGeometry(2.0, 1.1, 4), thatch, 0, 2.35, 0, hut); roof.rotation.y = Math.PI / 4; roof.scale.set(1.15, 1, 0.9);
    // hut.glb replaces these once it loads (the lamplight and the shade stay)
    hutV1 = hut.children.filter((m) => m !== hutWin);
    // its shade on the ground
    mesh(new THREE.PlaneGeometry(3.6, 3.0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shadowTex, transparent: true, opacity: 0.55, depthWrite: false }), 0, 0.04, 0, hut);
    hut.position.set(...HUT); hut.rotation.y = -0.5; scene.add(hut);
  }
  const hutShadow = mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x140904, alphaMap: shadowTex, transparent: true, depthWrite: false }), 0, 0.05, 0);

  // Particles: dust, flames, embers, smoke
  points(small ? 300 : Math.round(900 * tier.density ** 0.15), 4,  // dust: few, soft motes (a full x10 reads as snow, many tiny ones as sensor noise)
    (r) => [(r() - 0.3) * 44, 0.15 + r() ** 2 * 1.5, 6 - r() * 36], DUST);  // low (below the ridges), thicker toward the sun
  // fire points: [u (or angle on a pile), line 0-4 (pile 5-6), size]; the shaders put them on the fronts (FIRE)
  const LEN = FIRES.map(([ax, az, bx, bz]) => Math.hypot(bx - ax, bz - az)), LSUM = LEN.reduce((a, b) => a + b, 0);
  const onFire = (r) => {
    if (r() < 0.2) return [r(), 5 + Math.floor(r() * 2), 0];
    let k = r() * LSUM, j = 0;
    while (k > LEN[j]) k -= LEN[j++];
    return [k / LEN[j], j, 0];
  };
  // flame tongues: upright camera-facing cards, many and small on the lines, tall on the piles; phones get fewer, wider ones
  const tongues = (() => {
    const perM = small ? 5 : { low: 8, high: 14, ultra: 20 }[tier.name], perPile = small ? 20 : { low: 30, high: 45, ultra: 60 }[tier.name];
    const r = rng(5), aT = [];
    LEN.forEach((L, j) => {
      const N = Math.round(L * perM);
      for (let i = 0; i < N; i++) aT.push(j, (i + r()) / N, r(), r());
    });
    for (const j of [5, 6]) for (let i = 0; i < perPile; i++) aT.push(j, r(), r(), r());
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0], 3));
    g.setIndex([0, 1, 2, 1, 3, 2]);
    g.setAttribute('aT', new THREE.InstancedBufferAttribute(new Float32Array(aT), 4));
    g.instanceCount = aT.length / 4;
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: TONGUE_V, fragmentShader: TONGUE_F, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.frustumCulled = false;                          // placed in the shader
    m.renderOrder = 1;
    scene.add(m);
    return m;
  })();
  if (small) {
    U.uTW.value = 0.55;
    U.uTH.value = 1.45;
  }
  const embers = points(small ? 120 : Math.round(500 * Math.sqrt(tier.density)), 6, onFire, EMBER);  // x density reads as glitter
  embers.renderOrder = 1;                             // drawn after the smoke, so it glows through
  // the raked straw piles: low lumpy mounds that char as they burn, embers glowing in the straw
  const pileRim = { value: col(0, 0, 0) };
  const piles = PILES.map(([x, z, R, H]) => {
    const g = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const px = P.getX(i), py = P.getY(i), pz = P.getZ(i), k = 1 + 0.08 * Math.sin(px * 3.1 + 1) * Math.sin(pz * 2.7 + 2) + 0.03 * Math.sin(px * 6.3 - pz * 4.1 + py * 5);
      P.setXYZ(i, px * k, py * k, pz * k);
    }
    g.computeVertexNormals();
    const u = { uPChar: { value: 0 }, uPGlow: { value: 0 }, uT: U.uT, uPRim: pileRim };
    const mat = lambert(0x9c7a44);  // raked straw: golden, its edges catching the low sun (uPRim)
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'varying vec3 vPP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPP = position;');
      sh.fragmentShader = 'varying vec3 vPP; uniform float uPChar, uPGlow, uT; uniform vec3 uPRim;\n' + NOISE + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          float st = n2(vPP.xz * 40.0 + vPP.y * 23.0) * 0.6 + n2(vPP.xz * 9.0) * 0.4;  // under the heaped straw (the field's blades)
          diffuseColor.rgb *= 0.45 + 0.7 * st;
          float ch = smoothstep(0.35, 0.75, n2(vPP.xz * 3.0 + vPP.y * 2.0) * 0.6 + 0.4 * (1.0 - vPP.y) + uPChar - 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.025, 0.02), ch * min(uPChar * 2.0, 1.0));`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(1.0, 0.32, 0.06) * uPGlow * pow(n2(vPP.xz * 18.0 + vPP.y * 14.0 + uT * 0.4), 4.0) * 2.0;
          totalEmissiveRadiance += uPRim * (1.0 - min(uPChar * 2.0, 1.0)) * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);`);
    };
    mat.customProgramCacheKey = () => 'pile';
    const m = mesh(g, mat, x, groundH(x, z) - 0.04, z);
    m.scale.set(R, H, R);
    m.userData.u = u;
    return m;
  });
  // one smoke column per fire line, standing on its front, and one per pile; fewer, bigger puffs than x density
  // (overdraw), each thinner the more there are; the piles' plumes are the thickest
  const smokeN = small ? 360 : tier.name === 'ultra' ? 640 : 420;  // fill-bound (big blended sprites into a 4x MSAA target): High is held at 420
  U.uSmokeA.value = small ? 1 : 0.9 * Math.min(1, Math.sqrt(360 / smokeN));  // phones: fewer, clearer columns
  // the foot sits on the front (uCol); y carries the column
  const smoke = points(smokeN, 7, (r) => {
    const k = r() * 8.4, c = k < 5 ? Math.floor(k) : 5 + Math.floor((k - 5) / 1.7);
    return [(r() - 0.5) * (c < 5 ? 1.6 : 0.9), c, (r() - 0.5) * 0.4];
  }, SMOKE, SMOKE_F, THREE.NormalBlending);

  // Straw fibres: scattered on the field (rng(1)), drawn up one rising S-curve, fold into the box, bowl and cup. Each
  // fibre is a thin strip of FIB_SEG segments traced back along its own path (FIBRE), so it is long, tapered and curved.
  const fibreN = small ? 1500 : Math.round(3000 * tier.density ** 0.25);  // High 5,300; Ultra 7,000: few enough that single straws read
  const FIB_SEG = 10, fibres = (() => {
    const r = rng(8), end = new Float32Array(fibreN * 3), sd = new Float32Array(fibreN * 4), st = new Float32Array(fibreN * 3), strip = [], idx = [];
    for (let i = 0; i < fibreN; i++) {
      end.set(sampleSurface(r), i * 3);
      sd.set([r(), r(), r(), r()], i * 4);
    }
    // a soft patch where the ribbon leaves the stubble, front left
    const r1 = rng(1);
    for (let i = 0; i < fibreN; i++) {
      const x = SPINE_WIDE[0][0] + (r1() + r1() + r1() - 1.5) * 1.5, z = SPINE_WIDE[0][2] + (r1() + r1() + r1() - 1.5) * 1.2;
      st.set([x, groundH(x, z) + 0.05, z], i * 3);
    }
    for (let k = 0; k <= FIB_SEG; k++) strip.push(-1, k / FIB_SEG, 0, 1, k / FIB_SEG, 0);
    for (let k = 0; k < FIB_SEG; k++) idx.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(strip, 3));
    g.setIndex(idx);
    g.setAttribute('aEnd', new THREE.InstancedBufferAttribute(end, 3));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sd, 4));
    g.setAttribute('aStart', new THREE.InstancedBufferAttribute(st, 3));
    g.instanceCount = fibreN;
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: FIBRE, fragmentShader: FIBRE_F, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.frustumCulled = false;                          // placed in the shader
    scene.add(m);
    return m;
  })();
  fibres.renderOrder = 1;                             // after the packaging, so its surface hides only the fibres behind it

  // The packaging itself, faded in as the fibres settle
  const paper = pulp(lambert(0xe2cc98, { emissive: 0x24180a, transparent: true }), U.uRim);
  // the profile starts with a flat floor (rings from the axis out to f(0)) raised 2.5 cm, so the bowl is solid from above and clear of the table top
  const lathe = (f, h, floor) => new THREE.LatheGeometry(Array.from({ length: floor }, (_, k) => new THREE.Vector2(f(0) * k / floor, 0.025))
    .concat(Array.from({ length: 11 }, (_, k) => new THREE.Vector2(f(h * k / 10), h * k / 10))), 28);
  // each piece: an outer group that flies (place, turn, scale) and an inner one for its tilt in the air
  const pack = OBJ.map(() => new THREE.Group()), inner = pack.map((g) => g.add(new THREE.Group()).children[0]);
  const qAir = OBJ.map((o) => new THREE.Quaternion().setFromEuler(new THREE.Euler(o.pose[0], 0, o.pose[1], 'ZYX'))), qFlat = new THREE.Quaternion();
  mesh(new THREE.BoxGeometry(1.1, 0.45, 0.8).translate(0, 0.225, 0), paper, 0, 0, 0, inner[0]);
  mesh(new THREE.BoxGeometry(1.14, 0.1, 0.84), paper, 0, 0.405, 0, inner[0]);  // the lid: a shallow overhang over the top
  const bowlGeo = lathe(bowlR, 0.4, 4), bp = bowlGeo.attributes.position;
  // floor darkens softly toward the centre
  bowlGeo.setAttribute('color', new THREE.BufferAttribute(Float32Array.from({ length: bp.count * 3 }, (_, i) => {
    const v = Math.floor(i / 3), r = Math.hypot(bp.getX(v), bp.getZ(v)) / bowlR(0);
    return bp.getY(v) < 0.02 || bp.getY(v) > 0.03 ? 1 : 0.68 + 0.32 * Math.min(1, r) ** 1.5;
  }), 3));
  mesh(bowlGeo, pulp(lambert(0xe2cc98, { emissive: 0x24180a, transparent: true, side: THREE.DoubleSide, vertexColors: true }), U.uRim), 0, 0, 0, inner[1]);
  mesh(new THREE.CylinderGeometry(0.32, 0.21, 0.75, 24).translate(0, 0.375, 0), paper, 0, 0, 0, inner[2]);
  mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 24), paper, 0, 0.78, 0, inner[2]);
  pack.forEach((g) => scene.add(g));
  const trails = points(n(240), 12, () => [0, 0, 0], TRAIL);  // gold sparks behind each flying piece
  const packMats = [paper, inner[1].children[0].material];
  // packaging.glb waits here until the fold has not begun (or nothing is drawn yet), so neither the pieces nor the
  // fibre targets jump; packModel turns true once it is in
  let packSwap = null, packModel = false, drawn = false;

  // City: dark blocks with lit windows, rising on the horizon
  const city = new THREE.Group(); scene.add(city);
  const cityPts = points(small ? 9000 : n(3000), 10, (() => {
    const r = rng(11), blds = [], d = new THREE.Object3D();
    for (let i = 0; i < 160; i++) { const tower = r() < 0.1; blds.push([(r() - 0.5) * 220, -112 - r() * 60, tower ? 3 + r() : 3 + r() * 5, tower ? 3 + r() : 3 + r() * 4, tower ? 11 + r() * 7 : 3 + r() ** 2 * 11]); }
    // nearer, lower, off the avenue and clear of the frame edge
    for (let i = 0; i < 50; i++) { const s = r() < 0.5 ? -1 : 1; blds.push([s * (30 + r() * 75), -75 - r() * 35, 3 + r() * 4, 3 + r() * 3, 2 + r() * 5]); }
    // mid blocks behind the table: a phone's narrow view sees lit windows, not an empty avenue
    for (let i = 0; i < 24; i++) { const s = r() < 0.5 ? -1 : 1; blds.push([s * (3 + r() * 24), -92 - r() * 28, 3 + r() * 3, 3 + r() * 2, 4 + r() * 6]); }
    // near-black silhouettes; scene fog: farther blocks are hazier
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0x05060c }), blds.length);
    blds.forEach(([x, z, w, dd, h], i) => { d.position.set(x, 0, z); d.scale.set(w, h, dd); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    city.add(im);
    // warm, not neon  // rooftop signs
    const signs = blds.filter((b, i) => b[4] > 7 && i % 9 === 0), SIGN = [[1.4, 0.75, 0.3], [1.2, 0.5, 0.25], [1.1, 0.9, 0.6], [1.3, 1.0, 0.7]];
    const sm = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), signs.length);
    signs.forEach(([x, z, w, dd, h], i) => { d.position.set(x, h + 0.6, z + dd / 2 + 0.1); d.scale.set(w * 0.7, 0.8, 1); d.updateMatrix(); sm.setMatrixAt(i, d.matrix); sm.setColorAt(i, new THREE.Color(...SIGN[i % 4])); });
    city.add(sm);
    // windows by height (tall blocks get more), snapped to a floor and column grid; about one floor in five is dark
    return (rr) => {
      // tall blocks get more, the low near ones still read lit
      let b;
      do b = blds[Math.floor(rr() * blds.length)];
      while (rr() * 15 > b[4] + 4);
      const [x, z, w, dd, h] = b, cols = Math.max(2, Math.floor(w / 0.8)), floors = Math.max(1, Math.floor((h - 1) / 0.9));
      let f, c, n = 0;
      do { f = Math.floor(rr() * floors); c = Math.floor(rr() * cols); } while ((f * 7 + Math.abs(Math.round(x * 3))) % 5 === 0 && ++n < 8);
      return [x - w * 0.45 + (c + 0.5) * w * 0.9 / cols, 1 + f * 0.9, z + dd / 2 + 0.05];
    };
  })(), CITY, CITY_F);
  scene.remove(cityPts); city.add(cityPts);
  const bokeh = points(small ? 220 : Math.round(250 * Math.sqrt(tier.density)), 14,
    (r) => [(r() - 0.5) * 170, 0.2 + r() * 1.3, -52 - r() * 70], BOKEH);  // street level only
  scene.remove(bokeh); city.add(bokeh);

  // Café: deck, table, a string of bulbs
  const cafe = new THREE.Group(); scene.add(cafe);
  // dark teak with a soft sheen from the bulb above (standard material: a warm highlight, not a flat disc)
  // plain: the grain read as stripes; the Blender table brings its own
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2a20, emissive: 0x120a06, roughness: 0.55, metalness: 0, transparent: true });
  const deck = pattern(new THREE.MeshStandardMaterial({ color: 0x6a4232, roughness: 0.7, metalness: 0, transparent: true }),  // terracotta tiles
    'vec2 tp = vTP.xz / 0.6, fq = fract(tp); float gr = 1.0 - smoothstep(0.0, 0.04, min(min(fq.x, 1.0 - fq.x), min(fq.y, 1.0 - fq.y)));' +
    'diffuseColor.rgb *= (0.8 + 0.3 * fract(sin(dot(floor(tp), vec2(12.9898, 78.233))) * 43758.5453)) * (1.0 - 0.55 * gr);');
  const leaf = lambert(0x26301c, { transparent: true }), pot = lambert(0x6a4030, { transparent: true }), rail = lambert(0x1e1a18, { transparent: true });
  const jar = lambert(0xd89a5a, { emissive: 0x7a3a0e, transparent: true });  // warm translucent wax; the flame is the bright point
  mesh(new THREE.BoxGeometry(14, 0.06, 9), deck, 0, 0.03, TABLE[2], cafe);  // the terrace ends at the railing; the city lies below
  for (let x = -7; x <= 7; x += 1) mesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), rail, x, 0.5, TABLE[2] - 4.3, cafe);
  for (const y of [0.5, 1.0]) mesh(new THREE.BoxGeometry(14, y === 1 ? 0.06 : 0.025, 0.07), rail, 0, y, TABLE[2] - 4.3, cafe);
  // v1's real-size stand-ins for cafe.glb: candle, table top, column, foot
  const cafeV1 = [
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 16), jar, CANDLE[0], CANDLE[1] + 0.035, CANDLE[2], cafe),
    mesh(new THREE.CylinderGeometry(0.35, 0.345, 0.03, 64), wood, TABLE[0], TABLE[1] - 0.015, TABLE[2], cafe),
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 12), wood, TABLE[0], DECK + 0.36, TABLE[2], cafe),
    mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 32), wood, TABLE[0], DECK + 0.015, TABLE[2], cafe),
  ];
  {  // a potted plant: a café cue (chairs come with the Blender models)
    mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.42, 20), pot, TABLE[0] - 2.3, 0.21, TABLE[2] - 1.3, cafe);
    const r = rng(15);
    const blade = new THREE.ConeGeometry(0.07, 0.95, 6).translate(0, 0.47, 0);  // tall leaves fanning out of the pot
    for (let i = 0; i < 11; i++) { const l = mesh(blade, leaf, TABLE[0] - 2.3, 0.38, TABLE[2] - 1.3, cafe); l.rotation.set((r() - 0.5) * 0.9, r() * 6.28, (r() - 0.5) * 0.9); l.scale.set(1, 0.7 + r() * 0.6, 0.35); }
  }
  // the festoon: v1's catenary (the shape of cafe.glb's wire, in its space) until the model brings its own
  const lights = new THREE.Group();
  lights.position.set(TABLE[0] + LIGHTS_AT[0], DECK + LIGHTS_AT[1], TABLE[2] + LIGHTS_AT[2]);
  lights.rotation.y = LIGHTS_AT[3];
  lights.scale.setScalar(LIGHTS_AT[4]);
  cafe.add(lights);
  lights.updateMatrixWorld();
  const catenary = (k) => new THREE.Vector3(-1.8 + 3.4 * k, 2.36 - Math.sin(k * Math.PI) * 0.3, -1.2 + 1.65 * k);
  const wire = new THREE.LineBasicMaterial({ color: 0x6a5038, transparent: true });  // the catenary reads against the night
  cafeV1.push(lights.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 21 }, (_, i) => catenary(i / 20))), wire)).children[0]);
  const cafeMats = [wood, deck, wire, leaf, pot, rail, jar];

  // Glows: the hut lantern and the café bulbs (aSeed.x picks which, aSeed.y is size)
  // points 3-4 are the candle, 5-18 the bulbs: cafe.glb moves them onto its flame and bulbs
  const glowPos = (() => {
    const pos = [HUT[0] - 0.2, 1.6, HUT[2] + 0.3, HUT[0] - 0.2, 1.6, HUT[2] + 0.3, C[0], 1.3, C[2] - 0.7], sd = [0.2, 1.4, 0, 1, 0.2, 5.5, 1, 1, 0.8, 6, 0, 1], cl = [1, 0.62, 0.25, 0.5, 0.28, 0.1, 0.45, 0.3, 0.14];
    // candle flame and its halo
    pos.push(CANDLE[0], CANDLE[1] + 0.06, CANDLE[2], CANDLE[0], CANDLE[1] + 0.06, CANDLE[2]);
    sd.push(0.5, 0.05, 3, 0, 0.5, 0.7, 5, 1);
    cl.push(1, 0.7, 0.35, 0.5, 0.26, 0.1);
    // tight warm points with a small halo
    for (let i = 0; i < 14; i++) {
      pos.push(...lights.localToWorld(catenary(i / 13).setY(catenary(i / 13).y - 0.09)).toArray());
      sd.push(0.5, 0.3, i, 0.3);
      cl.push(1, 0.62, 0.3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 4)); g.setAttribute('aCol', new THREE.Float32BufferAttribute(cl, 3));
    const m = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: HEAD + GLOW, fragmentShader: GLOW_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.frustumCulled = false; scene.add(m);
    return g.attributes.position;
  })();

  // Lights
  // a warm ground bounce: undersides are not black
  const hemi = new THREE.HemisphereLight(0xffffff, 0x4a3222, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1); scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8090c0, 0.25); fill.position.set(0, 10, 30); scene.add(fill);
  // the burning piles light the stubble (and the farmer) around them; a second light rides the farmer's line
  const fireLight = new THREE.PointLight(0xff6a20, 0, 18, 1.5);
  fireLight.position.set(0.9, 3.6, -17.2);
  scene.add(fireLight);
  const lineLight = new THREE.PointLight(0xff6a20, 0, 10, 1.6);
  scene.add(lineLight);
  // warm key from the sun side; the cool fill comes from the sky
  const packLight = new THREE.PointLight(0xffb070, 0, 9, 1);
  packLight.position.set(C[0] + 1.6, 2.2, C[2] + 2.2);
  scene.add(packLight);
  // a warm overhead pool; the floor falls into darkness beyond it
  const cafeLight = new THREE.PointLight(0xffb060, 0, 6, 2);
  cafeLight.position.set(0, 2.8, TABLE[2]);
  scene.add(cafeLight);
  // the candle's own small warm pool, from just above the glass (closer, it blows out the wax)
  const candle = new THREE.PointLight(0xffa04a, 0, 4, 1.4);
  candle.position.set(CANDLE[0], CANDLE[1] + 0.2, CANDLE[2] + 0.05);
  scene.add(candle);
  // the table only, not the floor by the lens
  const tableSpot = new THREE.SpotLight(0xffd2a4, 0, 7, 0.42, 1, 1);
  tableSpot.position.set(0.3, 2.8, TABLE[2] + 0.2);
  tableSpot.target.position.set(TABLE[0], TABLE[1], TABLE[2]); scene.add(tableSpot, tableSpot.target);

  // Colours of the evening
  // sunset: amber-apricot horizon under dusty rose, deepening to orange-red as the sun touches the ridges; after the
  // smoke a golden/blue hour: a strong warm horizon glow under blue; then night.
  // the opening is golden hour (values picked so ACES lands on field-wide: apricot sky, gold toward the sun, salmon on
  // top); by p 0.2 the horizon deepens to amber-red and only the top of the sky cools to violet
  const H_WARM = col(1.7, 0.5, 0.11), H_RED = col(1, 0.36, 0.12), H_DEEP = col(1.3, 0.3, 0.07), H_DUSK = col(0.8, 0.46, 0.28), H_NIGHT = col(0.09, 0.11, 0.19);
  const SUN_KEY = col(1, 0.56, 0.24), FIRE_BOUNCE = col(1.2, 0.45, 0.12), fb = col(0, 0, 0), CORAL = col(0.95, 0.36, 0.2), MID_WARM = col(1.15, 0.36, 0.17), MID_DEEP = col(0.85, 0.28, 0.2), coral = col(0, 0, 0), mid = col(0, 0, 0), tc = col(0, 0, 0);
  const TREE_DARK = col(0.06, 0.05, 0.045), Z_WARM = col(0.72, 0.3, 0.22), Z_VIOLET = col(0.3, 0.2, 0.34), SMOKE_CEIL = col(0.2, 0.175, 0.16), SMOKE_HZ = col(0.34, 0.29, 0.26), AFTER = col(1, 0.48, 0.2);
  const Z_DUSK = col(0.2, 0.2, 0.31), Z_NIGHT = col(0.035, 0.04, 0.12), CITY_FOG = col(0.07, 0.065, 0.13), CLOUD = col(0.2, 0.13, 0.17), WARM_FILL = col(1, 0.7, 0.4), SMOKE_DARK = col(0.15, 0.13, 0.12), SMOKE_LIT = col(0.85, 0.45, 0.22), MOON = col(0.42, 0.45, 0.78), HAZE = col(0.46, 0.42, 0.4), CITYGLOW = col(0.9, 0.5, 0.22);
  const horizon = col(0, 0, 0), zenith = col(0, 0, 0), sunDir = new THREE.Vector3(), v = new THREE.Vector3(), sv = new THREE.Vector3(), fwd = new THREE.Vector3();

  // ---- Blender models (models/*.glb, see prepare()): each replaces its v1 shapes once loaded; until then, or if
  // it fails, v1 stays. They take the film's lights; their textures carry AO (on uv1) and detail only.
  const farmer = new THREE.Group();                   // placed each frame (farmerAt)
  scene.add(farmer);
  // emissive parts the film drives each frame: [material, kind, base]
  const emit = [];
  const pulpRim = (sh) => {
    sh.uniforms.uRim = U.uRim;
    sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uRim * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);');
  };
  const fade = (list, m) => {
    m.transparent = true;
    m.userData.op ??= m.opacity;
    if (!list.includes(m)) list.push(m);
  };
  function attachModels(M) {
    if (M.hut) {
      hutV1.forEach((m) => { m.visible = false; });
      hut.add(M.hut);
      M.hut.traverse((o) => {
        if (!o.material || o.material.isMeshBasicMaterial) return;
        o.material.onBeforeCompile = o.material.name.startsWith('thatch') ? rimHook : ambHook;
      });
    }
    if (M.farmer) {
      farmer.add(M.farmer);
      M.farmer.traverse((o) => { if (o.material?.userData.base) emit.push([o.material, 'torch', o.material.userData.base]); });
    }
    if (M.cafe) {
      cafeV1.forEach((m) => { m.visible = false; });
      M.cafe.position.set(TABLE[0], DECK, TABLE[2]);
      cafe.add(M.cafe);
      M.cafe.traverse((o) => {
        const m = o.material;
        if (!m) return;
        if (m.userData.base) emit.push([m, 'flame', m.userData.base]);
        else fade(cafeMats, m);
        if (m.name.startsWith('bulb')) emit.push([m, 'bulb', m.name === 'bulb' ? 4 : 1.6]);
        if (m.name === 'glass' || m.name === 'wax') emit.push([m, 'candle', m.name === 'glass' ? 1.1 : 0.5]);
        if (tier.name === 'low' && m.clearcoat) m.clearcoat = 0;
      });
      // the glow sprites onto the model's flame and bulbs
      scene.updateMatrixWorld();
      glowPos.setXYZ(3, ...M.cafe.getObjectByName('candle_flame').localToWorld(v.set(-0.2, 0.8, 0.13)).toArray());
      glowPos.setXYZ(4, v.x, v.y, v.z);
      for (let i = 0; i < 14; i++) glowPos.setXYZ(5 + i, ...M.cafe.getObjectByName('bulb_' + String(i).padStart(2, '0')).localToWorld(v.set(0, -0.09, 0)).toArray());
      glowPos.needsUpdate = true;
    }
    if (M.packaging) packSwap = () => swapPack(M);
  }
  function swapPack(M) {
    M.packaging.userData.pieces.forEach((node, i) => {
      inner[i].children.forEach((m) => { m.visible = false; });
      inner[i].add(node);
    });
    inner.forEach((g) => g.traverse((o) => {
      if (!o.material || !o.visible) return;
      fade(packMats, o.material);
      if (tier.name === 'low') o.material.sheen = 0;
      // v1's warm lift and afterglow rim on the pulp (U.uRim)
      if (o.material.name === 'straw_inner') return;
      o.material.emissive.setHex(0x24180a);
      o.material.onBeforeCompile = pulpRim;
      o.material.customProgramCacheKey = () => 'pulpRim';
    }));
    // fibre targets on the models' surfaces, posed as they fold (FIELD_S, in the air, before any lift)
    pack.forEach((g, i) => {
      g.position.set(...OBJ[i].at);
      g.rotation.set(0, OBJ[i].rot, 0);
      g.scale.setScalar(FIELD_S);
      inner[i].quaternion.copy(qAir[i]);
    });
    scene.updateMatrixWorld();
    const r = rng(8), parts = [], w = [];
    inner.forEach((g) => g.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const s = new M.Sampler(o).setRandomGenerator(r).build();
      parts.push([o, s]);
      w.push(s.distribution[s.distribution.length - 1]);
    }));
    const pos = fibres.geometry.attributes.aEnd, total = w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pos.count; i++) {
      let k = r() * total, j = 0;
      while (j < w.length - 1 && k > w[j]) k -= w[j++];
      parts[j][1].sample(v);
      v.applyMatrix4(parts[j][0].matrixWorld);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    packModel = true;
  }

  function render(p, t) {
    const q = clamp01(p), P = params(q, t, camera.aspect < 1), sunW = smooth(0.45, 1, P.sun), night = smooth(0.6, 0.95, q);
    const flick = 0.85 + 0.15 * Math.sin(t * 11.3) * Math.sin(t * 4.7 + 1.3);  // candle flicker
    if (packSwap && (!drawn || P.fold < 0.05)) {
      packSwap();
      packSwap = null;
    }
    camera.position.set(P.camera.x, P.camera.y, P.camera.z);
    camera.lookAt(P.camera.lookX, P.camera.lookY, P.camera.lookZ);
    sky.position.copy(camera.position);

    // afterglow once the smoke clears
    const red = smooth(0.95, 0.78, P.sun) * sunW, glow = (1 - sunW) * smooth(0.42, 0.55, q) * (1 - smooth(0.68, 0.9, q));
    horizon.lerpColors(H_DUSK, H_WARM, sunW).lerp(H_DEEP, 0.7 * red).lerp(H_NIGHT, night).lerp(SMOKE_HZ, P.smoke * 0.7).lerp(CITYGLOW, P.city * 0.06);
    zenith.lerpColors(Z_DUSK, Z_WARM, sunW * sunW).lerp(Z_VIOLET, red).lerp(Z_NIGHT, night).lerp(SMOKE_CEIL, P.smoke * 0.85);  // the smoke closes the sky
    coral.lerpColors(H_DUSK, CORAL, sunW).lerp(H_RED, 0.4 * red).lerp(H_NIGHT, night).lerp(SMOKE_HZ, P.smoke * 0.7);
    mid.lerpColors(zenith, tc.lerpColors(MID_WARM, MID_DEEP, red), sunW * (1 - P.smoke * 0.8));
    skyU.uHorizon.value.copy(horizon);
    skyU.uCoral.value.copy(coral);
    skyU.uMid.value.copy(mid);
    skyU.uZenith.value.copy(zenith);
    // Low behind the hut (its azimuth), just above the ridges at the hero, setting into them by p 0.35; blooms while sun > 0.2.
    // a clear disc just over the hills at the hero, half sunk into them by p 0.2, behind them by p 0.37
    sunDir.set(0.38, P.sun > 0.63 ? through([[0.63, -0.008], [0.8, -0.012], [0.95, 0.123], [1, 0.16]], P.sun) : -0.04 + 0.2 * P.sun ** 4, -1).normalize();
    skyU.uSunDir.value.copy(sunDir);
    skyU.uSunAmt.value = sunW * (1 - P.smoke * 0.85);
    U.uSunDirW.value.copy(sunDir);
    skyU.uDisc.value = smooth(0.68, 0.8, P.sun) * (1 - P.smoke);  // fades in the haze as it sets: no half-dome on the ridge
    // in the smoke a red sun burns through high in the view, a little right of centre on every screen
    camera.getWorldDirection(fwd);
    skyU.uSmokeSun.value.set(fwd.x - 0.1 * fwd.z, 0, fwd.z + 0.1 * fwd.x).normalize().setY(0.123).normalize();
    skyU.uSmokeSky.value = P.smoke;
    skyU.uT.value = t;
    skyU.uCloud.value = (1 - smooth(0.25, 0.34, q)) * (1 - P.smoke);
    skyU.uCloudCol.value.copy(CLOUD).lerp(zenith, 0.3);
    skyU.uCityGlow.value = 0.6 * P.city;
    skyU.uSunCol.value.setRGB(1, 0.62, 0.3).lerp(H_RED, 0.5 * red);
    // golden haze while the sun is up (a softer mix of the gold and coral horizons); night over the city is blue-violet, not smog
    scene.fog.color.copy(horizon).lerp(coral, 0.5 * sunW).lerp(Z_NIGHT, 0.35).lerp(CITY_FOG, 0.85 * P.city);
    // thicker haze in the smoke; distant blocks lighten in the night haze
    scene.fog.far = (90 + 50 * smooth(0.6, 0.8, q)) * (1 - 0.35 * P.smoke) + 80 * P.city;
    // aerial perspective: each farther ridge paler and bluer, all melting into the haze at their base and catching the
    // sun on their crests; they sink away before the city (Bangkok is flat)
    ridges.forEach((m, i) => {
      const u = m.material.uniforms;
      // nearly lost in the smoke
      u.uCol.value.copy(horizon).lerp(Z_NIGHT, 0.5 - 0.13 * i).lerp(zenith, 0.1 * i).multiplyScalar(1 - (0.5 - 0.1 * i) * sunW).lerp(scene.fog.color, 0.75 * P.smoke);  // darker hill layers against the golden sky
      u.uHaze.value.copy(scene.fog.color);
      u.uSunDir.value.copy(sunDir);
      u.uSunCol.value.copy(skyU.uSunCol.value).multiplyScalar(sunW * (1 - P.smoke) + 0.4 * glow);
      m.position.y = -45 * smooth(0.74, 0.95, q);
    });
    trees.position.y = -14 * smooth(0.72, 0.86, q);
    U.uDrop.value = smooth(0.72, 0.85, q);
    treeU.uHaze.value.copy(scene.fog.color);
    treeU.uDark.value.copy(scene.fog.color).lerp(TREE_DARK, 0.82);
    treeU.uSunDir.value.copy(sunDir);
    // the tree line stays as faint grey shapes
    treeU.uSunCol.value.copy(skyU.uSunCol.value).multiplyScalar(sunW * (1 - P.smoke) + 0.5 * glow);
    treeU.uSmoke.value = 0.55 * P.smoke;

    const cool = smooth(0.42, 0.56, q) * (1 - sunW) * (1 - P.city);  // the clearing air after the smoke: blue-violet shade, warm only on the tips
    // shadows never go to mud
    hemi.color.copy(horizon).lerp(zenith, 0.35).lerp(MOON, 0.35 * (1 - sunW) + 0.3 * cool);
    hemi.intensity = 0.85 + 0.35 * sunW + 0.15 * glow + 0.25 * cool;
    sun.position.copy(sunDir).multiplyScalar(50);
    sun.color.copy(SUN_KEY).lerp(H_RED, 0.5 * red).lerp(AFTER, glow);
    sun.intensity = 1.9 * sunW + 0.9 * glow;  // the afterglow keeps raking the stubble tips after sunset
    // no front light into the low sun; none on the cafe floor
    fill.color.lerpColors(MOON, WARM_FILL, sunW);
    fill.intensity = (0.04 * sunW + 0.7 * (1 - sunW)) * (1 - 0.8 * P.city);
    const B = burnAt(q), fireOn = P.fire > 0.001;
    U.uBurn.value = B;
    fireLight.intensity = 7 * P.fire * Math.max(pileAmt(0, B), pileAmt(1, B));
    // the torch and his own line light him warmly from the front-left, so he reads against the smoke behind
    const tf = frontAt(FARMER, 0.04 + 0.3 * B, B);
    lineLight.position.set(tf[0] + 0.6, 1.6, tf[1] + 1.2);
    lineLight.intensity = (2.5 * smooth(0.16, 0.19, q) + 4 * P.fire) * (1 - smooth(0.45, 0.5, q));
    // smoke columns stand on the fronts and piles, each rising once its fire burns
    COL_U.forEach((u, j) => {
      const [x, z, age] = frontAt(j, u, B);
      U.uCol.value[j].set(x, groundH(x, z), z, smooth(0, 0.08, age));
    });
    PILES.forEach(([x, z], i) => {
      U.uCol.value[5 + i].set(x, groundH(x, z), z, pileAmt(i, B));
      const pu = piles[i].userData.u, a = B - PILE_T[i], k = 1 - smooth(0.5, 0.7, q);
      // the char lifts with the field's (uChar) and the embers are cold once the fire is out; then the heap sinks
      // away as the straw is gathered, gone before the packaging forms
      pu.uPChar.value = smooth(0, 0.6, a) * (1 - smooth(0.5, 0.6, q));
      pu.uPGlow.value = smooth(0, 0.1, a) * (0.3 + P.fire) * (1 - 0.6 * smooth(1, 2, a)) * (1 - smooth(0.42, 0.5, q));
      piles[i].scale.set(PILES[i][2] * (0.6 + 0.4 * k), PILES[i][3] * k, PILES[i][2] * (0.6 + 0.4 * k));
      piles[i].visible = k > 0.01;
    });
    bladeU.uPileK.value = 1 - smooth(0.5, 0.7, q);
    pileRim.value.copy(sun.color).multiplyScalar(0.8 * sunW * (1 - P.smoke));
    cafeLight.intensity = 5 * P.city;
    tableSpot.intensity = 0.3 * P.city;
    candle.intensity = 0.08 * P.city * flick;
    bladeU.uSunDir.value.copy(sunDir);
    bladeU.uSunCol.value.copy(sun.color).multiplyScalar(sun.intensity / Math.PI);
    // no lavender: the blade shader cools only the shade
    bladeU.uAmb.value.copy(horizon).lerp(zenith, 0.35).lerp(MOON, 0.2 * (1 - sunW)).multiplyScalar(hemi.intensity * (1 + 0.5 * cool) * (1 - 0.45 * sunW) / Math.PI).add(tc.copy(fill.color).multiplyScalar(fill.intensity * 0.3 / Math.PI));
    bladeU.uFireAmt.value = 0.9 * P.fire;
    U.uCityGround.value = smooth(0.6, 0.8, q);
    bladeU.uChar.value = smooth(0.19, 0.22, q) * (1 - smooth(0.5, 0.6, q));  // the char itself spreads with the fronts (FIRE)
    bladeU.uCool.value = cool;
    bladeU.uRows.value = 0.6 * sunW + 0.25 * glow;
    bladeU.uRimK.value = (post ? 1.7 : 1) * (small ? 0.5 : 1) * (1 + 0.8 * sunW);  // backlit gold stubble while the sun is up
    // the hut casts a long shadow toward the camera from the low sun (blades and ground)
    const shx = -sunDir.x, shz = -sunDir.z, shn = Math.hypot(shx, shz), shL = Math.min(30, 2.8 / Math.max(sunDir.y, 0.09)), shA = 0.6 * sunW * (1 - P.smoke);
    bladeU.uHutSh.value.set(HUT[0], HUT[2], shx / shn, shz / shn);
    bladeU.uHutL.value.set(shA > 0.01 ? shL : 0.001, 1.4);
    hutShadow.position.set(HUT[0] + shx / shn * shL * 0.45, 0.05, HUT[2] + shz / shn * shL * 0.45);
    hutShadow.rotation.y = Math.atan2(shx, shz);
    hutShadow.scale.set(2.8, 1, shL);
    hutShadow.material.opacity = shA;
    hutShadow.visible = shA > 0.01;

    U.uT.value = t;
    U.uDust.value = (1 - smooth(0.45, 0.6, q)) * (1 - 0.6 * P.smoke);
    U.uFire.value = P.fire;
    U.uS.value = Math.max(P.smoke, 0.5 * P.fire);
    U.uEmber.value = Math.max(P.fire, 0.5 * P.smoke);
    // HDR only where bloom and ACES can take it
    U.uClear.value = P.clear;
    U.uHot.value = post ? 2.5 : 1;
    // the ceiling: heavy grey-brown
    U.uSmokeHigh.value.copy(SMOKE_DARK).multiplyScalar(0.6).lerp(zenith, 0.35);
    U.uSmokeLow.value.lerpColors(SMOKE_DARK, SMOKE_LIT, 0.3 * P.fire);
    U.uSmokeFire.value.copy(SMOKE_LIT).multiplyScalar(1.5 * P.fire);  // the flames light the column bases (more bleaches the smoke to steam)
    U.uFibCol.value.setRGB(1, 0.68, 0.3).multiplyScalar(post ? 0.72 : 1);  // under the bloom edge: the long strands stay gold, not cream
    U.uFold.value = P.fold;
    const spine = camera.aspect < 1 ? SPINE_TALL : SPINE_WIDE;
    U.uSpine.value.forEach((q, i) => q.set(...spine[i]));
    U.uStartOff.value.set(spine[0][0] - SPINE_WIDE[0][0], 0, spine[0][2] - SPINE_WIDE[0][2]);
    U.uFibA.value = smooth(0.42, 0.52, q) * (small ? 1 : Math.min(1, 0.75 * (fibreN / 3000) ** -0.2));
    U.uSurf.value = smooth(0.85, 1, P.fold);
    U.uFibOut.value = smooth(0.72, 0.77, q);
    U.uLantern.value = (0.15 + 0.85 * (1 - sunW)) * (1 - smooth(0.6, 0.75, q));  // barely there in daylight: no orange halo over the backlit hut
    // after uLantern: nothing may read the last frame; faint by day
    hutWin.material.color.setRGB(1.1, 0.5, 0.16).multiplyScalar(U.uLantern.value * (0.3 + 0.7 * (1 - sunW)));
    hutRim.value.copy(sun.color).multiplyScalar(1.5 * sunW * (1 - P.smoke) + 0.3 * glow + 0.6 * P.fire);  // rim lit from behind (and by the fires)
    hutAmb.value.setScalar(1 - 0.7 * sunW * (1 - P.smoke)).add(fb.copy(FIRE_BOUNCE).multiplyScalar(P.fire));  // m4: the fires warm it
    U.uBulbs.value = P.city;
    U.uCity.value = P.city;
    U.uStars.value = Math.max(0.35 * smooth(0.45, 0.65, q) * P.clear, P.city);  // first stars at dusk, all of them as the city rises
    embers.visible = fireOn || P.smoke > 0.001;
    tongues.visible = fireOn;
    smoke.visible = U.uS.value > 0.001;
    fibres.visible = U.uFibA.value > 0.001 && U.uFibOut.value < 1;

    const form = smooth(0.8, 1, P.fold), liftK = smooth(0.62, 0.72, q) * form, lift = 0.42 * liftK;
    U.uLift.value = lift;
    U.uLiftK.value = liftK;
    // halo trimmed to half: it sat behind the caption text
    U.uHalo.value = 0.35 * form * (1 - smooth(0.72, 0.8, q));
    packLight.intensity = (1.2 * smooth(0.1, 0.6, P.fold) + 2.2 * form) * (1 - P.city);
    bladeU.uPack.value = form * (1 - P.fly) * 0.6;
    bladeU.uPackPos.value.set(C[0], 0.4, C[2] + 0.1);
    U.uRim.value.setRGB(1, 0.6, 0.3).multiplyScalar(0.6 * form * (1 - 0.8 * P.city));  // the afterglow behind them rims the pulp
    packMats.forEach((m) => { m.opacity = U.uSurf.value * (m.userData.op ?? 1); });  // the pulp surface fills in over the settled outline
    const s0 = packModel ? FIELD_S : FOLD_S, s1 = packModel ? 1 : LAND_S;
    pack.forEach((g, i) => {
      // slow start keeps them just ahead of the camera; the cutlery flies with the piece above it
      const o = OBJ[i], e = clamp01((P.fly - (i % 3) * 0.08) / 0.84) ** 2.2;
      const end = v.set(TABLE[0] + o.table[0], TABLE[1], TABLE[2] + o.table[1]), mid = (a, b) => (a + b) / 2;
      const m = [mid(o.at[0], end.x), mid(o.at[1], end.y) + 4, mid(o.at[2], end.z)];
      const b = (k) => (1 - e) ** 2 * o.at[k] + 2 * e * (1 - e) * m[k] + e * e * end.getComponent(k);
      // presented just above chest height once formed
      g.position.set(b(0), b(1) + lift * (1 - e) + 0.05 * Math.sin(t * 1.2 + i * 2) * (1 - e) * (1 - form), b(2));
      g.rotation.set(Math.sin(e * Math.PI) * 0.5, o.rot + (o.table[2] - o.rot) * e + (1 - e) * (i % 2 ? -6.28 : 6.28), 0);
      g.scale.setScalar(s0 + (s1 - s0) * e);
      inner[i].quaternion.slerpQuaternions(packModel ? qAir[i] : qFlat, qFlat, e);
      g.visible = form > 0.001 && (packModel || i < 3);
      if (i > 2) return;
      U.uFA.value[i].set(...o.at);
      U.uFM.value[i].set(...m);
      U.uFE.value[i].copy(end);
      U.uFP.value.setComponent(i, e);
      // contact shadow on the stubble while it rests low (none once it floats or flies)
      bladeU.uObj.value[i].set(g.position.x, g.position.y, g.position.z, form * (1 - smooth(0, 0.15, e)) * smooth(0.6, 0.1, g.position.y - groundH(g.position.x, g.position.z)));
    });
    trails.visible = P.fly > 0 && P.fly < 1;
    // below the terrace: it falls away past the railing
    city.visible = P.city > 0.001;
    city.position.y = -12 - ((1 - P.city) ** 2) * 16;
    cafe.visible = P.city > 0.001;
    cafeMats.forEach((m) => { m.opacity = P.city * (m.userData.op ?? 1); });
    // the farmer lights the field, walking along his line (p); his torch is lit as he arrives and flickers on t
    farmer.visible = q > 0.16 && q < 0.5;
    const fa = farmerAt(B);
    farmer.position.set(fa[0], groundH(fa[0], fa[1]), fa[1]);
    farmer.rotation.y = fa[2];
    farmer.scale.setScalar(FARMER_S);
    const torch = smooth(0.16, 0.19, q) * (1 - smooth(0.45, 0.5, q)) * (0.8 + 0.2 * Math.sin(t * 13.1 + 0.4) * Math.sin(t * 5.3));
    for (const [m, kind, k] of emit) {
      if (kind === 'bulb') m.emissiveIntensity = k * P.city;
      else if (kind === 'candle') m.emissiveIntensity = k * P.city * flick;
      else m.color.copy(k).multiplyScalar(kind === 'flame' ? P.city * flick : torch);
    }
    drawn = true;

    if (!post) return renderer.render(scene, camera);
    // The sun disc's direction projected with the camera (uv); facing fades the rays out when the sun is behind the view.
    camera.updateMatrixWorld();
    sv.copy(sunDir).multiplyScalar(50).add(camera.position).project(camera);
    post.render({
      sunScreen: [sv.x * 0.5 + 0.5, sv.y * 0.5 + 0.5], sun: P.sun, smoke: Math.max(P.smoke, 0.6 * P.fire),  // the grade goes grey-sepia with the fire
      glow: Math.max(P.fire, P.city, form), fire: P.fire, facing: smooth(0, 0.3, camera.getWorldDirection(fwd).dot(sunDir)),
    });
  }

  // Called once post.js has loaded (High/Ultra); the new pipeline takes over from the plain renderer.render.
  function attachPost(mod) {
    const next = mod.createPost(THREE, renderer, scene, camera, tier);
    post = next;
    try { resize(true); } catch (e) { post = null; next.dispose(); throw e; }  // never leave a half-attached post
  }

  function resize(force) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!force && w === camera.userData.w && h === camera.userData.h) return;  // phone URL bars fire resize; the 100lvh canvas stays put
    camera.userData = { w, h };
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = w < h ? 62 : 48; camera.updateProjectionMatrix();
    const b = renderer.getDrawingBufferSize(new THREE.Vector2());
    U.uScale.value = b.y / (2 * Math.tan(camera.fov * Math.PI / 360)); U.uPR.value = renderer.getPixelRatio();
    post?.resize(w, h, renderer.getPixelRatio());
  }
  resize();

  function dispose(keepRenderer) {
    post?.dispose(); post = null;
    shadowTex.dispose();
    scene.traverse((o) => {
      o.geometry?.dispose(); [].concat(o.material || []).forEach((m) => m.dispose());
      if (o.isInstancedMesh) o.dispose();  // frees instanceMatrix / instanceColor buffers
    });
    if (!keepRenderer) { renderer.dispose(); renderer.forceContextLoss(); }  // hand the GPU context back at once
  }
  return { render, dispose, resize, attachPost, attachModels, renderer };
}

// ---- page wiring ----------------------------------------------------------------------------
let clock = 0;
function fallback() {
  window.scStills(); root.classList.remove('film'); delete window.scFilm;
  if (!clock && counters.length) clock = setInterval(() => tick(performance.now() / 1000), 250);  // stills mode has no frame loop
}

async function boot() {
  const canvas = document.getElementById('film');
  const motion = matchMedia('(prefers-reduced-motion: reduce)'), reducedMotion = motion.matches;
  if (!canvas || !WEBGL || reducedMotion || root.classList.contains('no-film') || FLAGS.mode === 'off') return fallback();

  let film;
  try { THREE = await import('three'); film = start(canvas); } catch (e) { console.warn('film off:', e); film?.dispose(); return fallback(); }
  if (root.classList.contains('no-film')) return (film.dispose(), fallback());  // the 4 s failsafe already chose the stills
  // Post-processing (High/Ultra) loads after the first plain frame; if it fails, the film keeps plain rendering
  // with tone mapping. Video, bench and fixed renders wait for it so captures include it.
  let postWarned = false;
  const loadPost = () => !TIER.post ? 0 : import('./post.js').then((m) => film.attachPost(m)).catch((e) => {
    if (!postWarned) { postWarned = true; console.warn('film post off:', e); }
  });
  const postReady = (VIDEO || BENCH) ? loadPost() : new Promise((r) => requestAnimationFrame(() => r(loadPost())));
  // The models load after the first frame on every tier (small); any failure keeps v1's shapes. Fixed renders wait.
  // A hung request (CDN or Draco that never answers) leaves video mode waiting with no filmReady; after 20 s the page
  // says so for the capture harness.
  const attachModels = () => {
    const stall = setTimeout(() => { root.dataset.filmModels = 'stalled'; }, 20000);
    return loadModels().then((m) => film.attachModels(m)).catch((e) => console.warn('film models off:', e)).finally(() => clearTimeout(stall));
  };
  const modelsReady = (VIDEO || BENCH) ? attachModels() : new Promise((r) => requestAnimationFrame(() => r(attachModels())));

  const doors = document.getElementById('doors');
  const caps = [...document.querySelectorAll('.beat .caption')];
  let pts = [[0, 0.05], [1, 1]], raf = 0, last = 0, manual = false, shown = 0, frames = 0, step = TIER.name === 'low' ? 'low' : 'high';
  const frameMs = [], t0 = performance.now();
  // Scroll -> p through anchors: the top of the page is p 0.05 (the hero), each beat's caption reaches its key p when
  // it sits whole in the lower part of the screen, and the doors filling the screen are p 1. Any screen size keeps
  // every caption on screen at its beat.
  const docTop = (el) => { let y = 0; for (; el; el = el.offsetParent) y += el.offsetTop; return y; };
  // p at which beats 1-4 hold their caption: fire starting, smoke, fibres, packaging (extra captions reuse the last)
  const CAPTION_P = [0.2, 0.37, 0.6, 0.72];
  const measure = () => {
    const H = innerHeight, gap = Math.max(48, 0.08 * H);
    let x = 0; pts = [[0, 0.05]];
    caps.forEach((c, i) => { x = Math.max(x + 1, docTop(c) + c.offsetHeight - (H - gap)); pts.push([x, CAPTION_P[i] ?? CAPTION_P[CAPTION_P.length - 1]]); });
    pts.push([Math.max(x + 1, docTop(doors) + doors.offsetHeight / 2 - H / 2), 1]);
  };
  const target = () => through(pts, scrollY);
  const stop = () => {
    cancelAnimationFrame(raf); removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVis);
    canvas.removeEventListener('webglcontextlost', onLost); motion.removeEventListener('change', onMotion); film.dispose(); fallback();
  };
  // One step down the ladder (tiers.js STEPS); the last step is the stills. The caller resets frameMs.
  const degrade = () => {
    step = nextStep(step);
    if (step === 'high-dpr1' && film.renderer.getPixelRatio() <= 1) step = nextStep(step);  // nothing to drop
    if (step === 'stills') return stop();
    if (step === 'high-dpr1') { film.renderer.setPixelRatio(1); film.resize(true); }
    else { try { film.setTier(TIERS.low); } catch (e) { console.warn('film off:', e); return stop(); } }
    frames = 0;
  };
  function benchFrame(now) {  // ?film=bench: p runs 0..1 over 20 s, t is the clock; no frame skipping, no step-downs
    raf = requestAnimationFrame(benchFrame);
    const s = (now - t0) / 1000;
    if (last) frameMs.push(now - last);
    last = now;
    film.render(clamp01(s / 20), s);
    tick(s);
    if (s < 20) return;
    cancelAnimationFrame(raf);
    const a = frameMs.slice(5).sort((x, y) => x - y);  // skip shader-compile frames
    window.scBench = { median: a[a.length >> 1], p95: a[Math.floor(a.length * 0.95)], frames: a.length };
    console.log('scBench', JSON.stringify(window.scBench));
  }
  function frame(now) {
    if (manual) return;
    raf = requestAnimationFrame(frame);
    if (last && now - last < 12) return;  // 90/120 Hz screens draw every other frame (battery)
    const dt = last ? now - last : 16;
    last = now;
    shown += (target() - shown) * (1 - Math.exp(-dt / 120));  // a little damping on wheel steps
    const t = (now - t0) / 1000;
    film.render(shown, t);
    tick(t);
    if (VIDEO || BENCH) return;
    if (frameMs.length < 30 && ++frames > 5) {                  // skip shader-compile frames, then judge 30
      frameMs.push(dt);
      if (frameMs.length === 30) {
        if (shouldUse3D({ webgl: WEBGL, reducedMotion, frameMs })) root.classList.add('film');
        else {
          degrade();
          frameMs.length = 0;
        }
      }
    } else if (frameMs.length >= 30) {                // keep watching: the smoke beat is the heaviest
      frameMs.push(dt);
      if (frameMs.length > 90) frameMs.shift();
      if (tooSlow(frameMs)) { degrade(); frameMs.length = 30; }
    }
  }
  const onResize = () => { film.resize(); measure(); };
  const onVis = () => { if (VIDEO || BENCH) return; cancelAnimationFrame(raf); if (!document.hidden && !manual) { last = 0; raf = requestAnimationFrame(frame); } };
  const onLost = (e) => { e.preventDefault(); stop(); };
  const onMotion = (e) => { if (e.matches) stop(); };  // reduced motion switched on mid-visit: stills
  addEventListener('resize', onResize); document.addEventListener('visibilitychange', onVis);
  canvas.addEventListener('webglcontextlost', onLost); motion.addEventListener('change', onMotion);
  measure(); shown = target();
  if (VIDEO || BENCH) await Promise.all([postReady, modelsReady]);  // fixed renders and the bench must include post and the models
  if (root.classList.contains('no-film')) return stop();  // the 4 s failsafe fired meanwhile (slow GPU): stills, never a film on a hidden 0x0 canvas
  document.fonts?.ready.then(measure);  // caption heights change when the web fonts arrive
  // scFilm.render(p, t) draws exactly that frame (scene and counters) and stops the scroll loop; open the page
  // with ?film=video for capture (see VIDEO above).
  // console hooks for the step-down check, not on real visits
  window.scFilm = {
    get tier() { return film.tier.name; },
    ...(VIDEO || BENCH ? {
      _degrade: degrade,
      _memory: () => ({ ...film.renderer.info.memory }),
      // the scroll that shows p (captures)
      scrollFor: (p) => through(pts.map(([a, b]) => [b, a]), p),
    } : {}),
    render: (p, t) => {
      manual = true;
      cancelAnimationFrame(raf);
      film.render(p, t);
      tick(t);
    },
  };
  if (VIDEO || BENCH) root.classList.add('film');
  if (BENCH) raf = requestAnimationFrame(benchFrame);
  else if (VIDEO) {
    if (FLAGS.p !== null || FLAGS.t !== null) { window.scFilm.render(FLAGS.p ?? 0, FLAGS.t ?? 0); root.dataset.filmReady = '1'; }
  } else raf = requestAnimationFrame(frame);
}
boot();
