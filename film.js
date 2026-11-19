// Home scroll film: one Three.js scene drawn only from params(p, t) (timeline.js), so any frame can be
// rendered again exactly. The page passes scroll and the clock; video tools call window.scFilm.render(p, t).
// Falls back to the still images (html.no-film) when WebGL, speed, the CDN or reduced motion say so.
import { params, rng, counter, shouldUse3D, tooSlow, through } from './timeline.js';
import { HEAD, SOFT, DUST, FLAME, FLAME_F, NOISE, FRONT_V, FRONT_F, EMBER, BLADE_V, BLADE_F, SMOKE, SMOKE_F, FIBRE, FIBRE_F, TRAIL, GLOW, GLOW_F, CITY, CITY_F, BOKEH, STARS, SKY_V, SKY_F, RIDGE_V, RIDGE_F, TREE_V, TREE_F, GROUND_FX, PULP } from './shaders.js';
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
const SMOKE_CAP = { low: 0.26, high: 0.17, ultra: 0.2 };  // largest smoke puff, x uScale (screen overdraw)
const BLADES = 24000;                                // field blades at density 1 (High x10, Ultra x30)
const C = [0, 2.4, -14];                              // where the straw swirls and folds
const ROW = 0.3, HILL = 0.22;                         // harvest rows (along z) and the hill spacing along a row
const HUT = [9.5, 0, -16];                            // right of the hero text, the sun setting behind it
const TABLE = [0, 0.915, -42];
const CANDLE = [TABLE[0] - 0.85, TABLE[1], TABLE[2] + 0.72];  // front left of the table, in view (not behind the box)
const FIRES = [[-9, -12, -3, -13], [2, -11, 8, -12.5], [-6, -19, 1, -20], [4, -22, 11, -21], [-12, -25, -5, -27]];
// box, bowl, cup: where they fold (world), where they land on the table (offset), resting turn
// (folded at FOLD_S scale, bedded at the stubble roots, so they read as packaging, not furniture)
const FOLD_S = 0.6;
const OBJ = [
  { at: [-0.82, groundH(-0.82, -14), -14], land: [-0.42, 0, 0.1], rot: 0.35 },
  { at: [0.05, groundH(0.05, -13.7), -13.7], land: [0.5, 0, -0.15], rot: 0 },
  { at: [0.78, groundH(0.78, -14.05), -14.05], land: [0.12, 0, -0.55], rot: 0 },
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

export function start(canvas, tier = TIER) {
  // colours below are written as they should look
  THREE.ColorManagement.enabled = false;
  // MSAA is fixed when the context is made, so a High start keeps it after a step down to low.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier.msaa && !VIDEO, powerPreference: 'high-performance' });
  try {
    let cur = build(canvas, renderer, tier);
    const film = {
      renderer, tier,
      render: (p, t) => cur.render(p, t),
      resize: (force) => cur.resize(force),
      // a late import must not attach after a step down
      attachPost: (m) => { if (film.tier.post) cur.attachPost(m); },
      // Step down to another tier: rebuild the scene with that tier's counts on the same renderer (one-time hitch).
      setTier(next) { cur.dispose(true); cur = build(canvas, renderer, next); film.tier = next; },
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
    uClear: { value: 0 }, uHot: { value: 1 }, uFlameA: { value: 1 }, uFlameS: { value: 1 }, uCityGround: { value: 0 }, uS: { value: 0 }, uFold: { value: 0 }, uFibA: { value: 0 }, uFibOut: { value: 0 }, uFibSize: { value: small ? 1 : tier.density ** -0.25 }, uSurf: { value: 0 }, uC: { value: new THREE.Vector3(...C) },
    uLantern: { value: 0 }, uBulbs: { value: 0 }, uHalo: { value: 0 }, uCity: { value: 0 }, uStars: { value: 0 }, uWin: { value: small ? 2.4 : 1 }, uLift: { value: 0 }, uLiftK: { value: 0 }, uLitF: { value: small ? 0.8 : 0.45 },
    uFA: { value: OBJ.map(() => new THREE.Vector3()) }, uFM: { value: OBJ.map(() => new THREE.Vector3()) }, uFE: { value: OBJ.map(() => new THREE.Vector3()) }, uFP: { value: new THREE.Vector3() },
    uSmokeLow: { value: col(0.5, 0.3, 0.2) }, uSmokeHigh: { value: col(0.5, 0.48, 0.48) }, uSmokeFire: { value: col(0, 0, 0) },
    uSmokeA: { value: 0 }, uSmokeCap: { value: SMOKE_CAP[tier.name] }, uFoot: { value: small ? 0.04 : 0.13 }, uHfPow: { value: small ? 1.5 : 1 }, uPuff: { value: small ? 1.8 : 1 }, uFibCol: { value: col(1, 0.7, 0.32) },
    uSunDirW: { value: new THREE.Vector3() }, uRim: { value: col(0, 0, 0) }, uDrop: { value: 0 },
  };
  const bladeU = {
    uT: U.uT, uFireAmt: { value: 0 }, uPack: { value: 0 }, uSunDir: { value: new THREE.Vector3() },
    uSunCol: { value: col(1, 0.6, 0.3) }, uAmb: { value: col(0, 0, 0) }, uChar: { value: 0 }, uCool: { value: 0 }, uRows: { value: 0 }, uRimK: { value: 1 }, uSmall: { value: small ? 1 : 0 }, uHutSh: { value: new THREE.Vector4() }, uHutL: { value: new THREE.Vector2(1, 1) }, uPackPos: { value: new THREE.Vector3(...C) },
    uFires: { value: FIRES.map((q) => new THREE.Vector4(...q)) }, uObj: { value: OBJ.map(() => new THREE.Vector4()) },
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
    uGlow: { value: col(0.9, 0.48, 0.22) }, uCity: U.uCity, uCloud: { value: 0 }, uCloudCol: { value: col(0, 0, 0) }, uCityGlow: { value: 0 }, uSmother: { value: 0 }, uSmokeSky: { value: 0 }, uT: { value: 0 },
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
      Object.assign(s.uniforms, { uCityGround: U.uCityGround, uDrop: U.uDrop, uHaze: { value: scene.fog.color }, uFires: bladeU.uFires, uChar: bladeU.uChar, uFireAmt: bladeU.uFireAmt, uRows: bladeU.uRows, uT: U.uT });
      s.vertexShader = 'attribute vec3 aField; uniform float uCityGround, uDrop; varying float vGH; varying vec3 vWP;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y -= uDrop * 12.0 * (1.0 - smoothstep(-50.0, -46.0, transformed.z));\nvWP = transformed;').replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = mix(aField, vColor.rgb, uCityGround);')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvGH = mix(min(0.95, smoothstep(8.0, 46.0, -mvPosition.z) * 0.55 + smoothstep(36.0, 80.0, -mvPosition.z) * 0.4 + smoothstep(-26.0, -40.0, transformed.z) * 0.45), smoothstep(2.0, 32.0, -mvPosition.z) * 0.92, uCityGround);');
      // the bare ground past the blades fades to the same haze as the far blades
      // before tone mapping, like the ridges and blades
      s.fragmentShader = 'varying float vGH; varying vec3 vWP; uniform vec3 uHaze; uniform vec4 uFires[5]; uniform float uChar, uFireAmt, uRows, uCityGround, uT;\n' + NOISE + s.fragmentShader.replace('#include <tonemapping_fragment>', GROUND_FX + 'gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, vGH);\n#include <tonemapping_fragment>');
    };
    mesh(g, gm);
  }

  // Field: thin tapered straw blades, BLADES x density, placed from rng(3); sway and light are in BLADE_V.
  {
    const count = small ? 18000 : n(BLADES), r = rng(3), d = new THREE.Object3D();
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
    for (let i = 0; i < count; i++) {
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
    im.frustumCulled = false;                         // blades bend in the shader
    scene.add(im);
  }

  // A broken tree line at the far edge of the field, hazed by the fog; it sinks away before the cafe.
  const treeU = { uHaze: { value: col(0, 0, 0) }, uDark: { value: col(0, 0, 0) }, uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: col(0, 0, 0) }, uSmoke: { value: 0 } };
  const trees = (() => {
    const r = rng(16), d = new THREE.Object3D(), list = [], palms = [], grp = new THREE.Group();
    for (let i = 0; i < 1000; i++) {  // canopies of many sizes with real gaps
      const back = i >= 680, x = (r() - 0.5) * 240, z = back ? -72 - r() * 10 : -58 - r() * 12, big = r() < 0.12;
      const sx = big ? 1.3 + r() * 0.7 : 0.6 + r() * 0.8, sy = big ? 1.1 + r() * 0.6 : 0.6 + r() * r() * 1.1, sz = sx * (0.7 + r() * 0.4);
      if (!back && Math.sin(x * 0.11) + Math.sin(x * 0.047 + 1) < -0.9) continue;
      list.push([x, sy * 0.7, z, sx * (back ? 1.3 : 1), sy * (back ? 1.2 : 1), sz]);
    }
    // a few sugar palms over the canopy, at the trees' scale
    for (let i = 0; i < 32; i++) palms.push([(r() - 0.5) * 230, -56 - r() * 10, 3.6 + r() * 2.2]);
    const mat = new THREE.ShaderMaterial({ uniforms: treeU, vertexShader: TREE_V, fragmentShader: TREE_F });
    const crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), mat, list.length);
    list.forEach(([x, y, z, sx, sy, sz], i) => { d.position.set(x, y, z); d.scale.set(sx, sy, sz); d.updateMatrix(); crowns.setMatrixAt(i, d.matrix); });
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.16, 1, 5).translate(0, 0.5, 0), mat, palms.length);
    const fronds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 6), new THREE.ShaderMaterial({ uniforms: treeU, vertexShader: '#define PALM\n' + TREE_V, fragmentShader: TREE_F }), palms.length);
    palms.forEach(([x, z, h], i) => {
      d.rotation.set(0, 0, 0); d.position.set(x, 0, z); d.scale.set(1, h, 1); d.updateMatrix(); trunks.setMatrixAt(i, d.matrix);
      d.position.set(x, h, z); d.scale.set(1.0, 0.55, 1.0); d.rotation.y = i; d.updateMatrix(); fronds.setMatrixAt(i, d.matrix);
    });
    d.rotation.set(0, 0, 0);
    const dykes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, 3);  // field bunds between the stubble and the trees
    [[-44, 0.45, 1.2], [-48.5, 0.7, 1.6], [-53, 0.55, 1.4]].forEach(([z, h, w], i) => { d.position.set(0, h / 2 - 0.05, z); d.scale.set(260, h, w); d.updateMatrix(); dykes.setMatrixAt(i, d.matrix); });
    grp.add(crowns, trunks, fronds, dykes); scene.add(grp);
    return grp;
  })();

  // Farmer's hut on stilts, with a lantern
  let hutWin; const hutRim = { value: col(0, 0, 0) };
  {
    // backlit: dark, the rim does the work
    const hut = new THREE.Group(), wood = lambert(0x24170e), thatch = lambert(0x2a1c10, { flatShading: true });
    for (const [x, z] of [[-1, -0.8], [1, -0.8], [-1, 0.8], [1, 0.8]]) mesh(new THREE.BoxGeometry(0.12, 1.9, 0.12), wood, x, 0.95, z, hut);
    mesh(new THREE.BoxGeometry(2.3, 0.12, 1.9), wood, 0, 0.95, 0, hut);
    mesh(new THREE.BoxGeometry(2.1, 0.8, 0.06), wood, 0, 1.4, -0.8, hut);
    for (const x of [-1.03, 1.03]) mesh(new THREE.BoxGeometry(0.06, 0.8, 1.6), wood, x, 1.4, 0, hut);  // side walls: a room, not a panel
    // lamplight on the back wall: a small soft warm patch, not a lit panel
    hutWin = mesh(new THREE.PlaneGeometry(0.62, 0.4), new THREE.MeshBasicMaterial({ color: 0xffffff, alphaMap: shadowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 0.2, 1.38, -0.76, hut);
    thatch.onBeforeCompile = (sh) => {  // a warm rim where the low sun or the afterglow catches the roof edges
      sh.uniforms.uHutRim = hutRim;
      sh.fragmentShader = 'uniform vec3 uHutRim;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uHutRim * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 6.0);');
    };
    const roof = mesh(new THREE.ConeGeometry(2.0, 1.1, 4), thatch, 0, 2.35, 0, hut); roof.rotation.y = Math.PI / 4; roof.scale.set(1.15, 1, 0.9);
    // its shade on the ground
    mesh(new THREE.PlaneGeometry(3.6, 3.0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shadowTex, transparent: true, opacity: 0.55, depthWrite: false }), 0, 0.04, 0, hut);
    hut.position.set(...HUT); hut.rotation.y = -0.5; scene.add(hut);
  }
  const hutShadow = mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x140904, alphaMap: shadowTex, transparent: true, depthWrite: false }), 0, 0.05, 0);

  // Out-of-focus straw tufts in the bottom corners of the opening (landscape only), backlit gold at their tips
  const tufts = (() => {
    const g = new THREE.Group();
    const mat = new THREE.ShaderMaterial({ uniforms: { uT: U.uT, uA: { value: 0 }, uRim: { value: col(0, 0, 0) } }, transparent: true, depthWrite: false, vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uT, uA; uniform vec3 uRim; varying vec2 vUv;
      void main() {
        float a = 0.0, top = 0.0;
        for (int k = 0; k < 7; k++) {
          float fk = float(k), x0 = fract(fk * 0.618 + 0.13), hk = 0.45 + 0.5 * fract(fk * 0.37 + 0.5), bend = (fract(fk * 0.73) - 0.5) * 0.5 + 0.03 * sin(uT * 0.9 + fk);
          float y = vUv.y / hk, x = x0 + bend * y * y, w = 0.035 * (1.0 - 0.8 * y) + 0.008;
          float m = smoothstep(w + 0.05, w - 0.02, abs(vUv.x - x)) * step(y, 1.0) * smoothstep(1.0, 0.85, y);
          if (m > a) { a = m; top = y; }
        }
        gl_FragColor = vec4(mix(vec3(0.07, 0.04, 0.02), uRim, smoothstep(0.75, 1.0, top) * 0.6), a * uA);  // dark, only the tips catch the sun
      }` });
    // in camera space: they ride in the corners
    for (const [x, y, z] of [[-1.02, -0.68, -1.3], [1.05, -0.72, -1.3]]) mesh(new THREE.PlaneGeometry(0.75, 0.7), mat, x, y, z, g);
    g.children.forEach((m) => { m.renderOrder = 2; m.frustumCulled = false; }); scene.add(camera); camera.add(g);
    return { g, mat };
  })();

  // Particles: dust, flames, embers, smoke
  points(small ? 450 : Math.round(1300 * tier.density ** 0.35), 4,  // dust: a full x10 reads as snow
    (r) => [(r() - 0.3) * 44, 0.15 + r() ** 2 * 1.5, 6 - r() * 36], DUST);  // low (below the ridges), thicker toward the sun
  const onFire = (r) => { const f = FIRES[Math.floor(r() * FIRES.length)], k = r(); return [f[0] + (f[2] - f[0]) * k, 0, f[1] + (f[3] - f[1]) * k]; };
  // the fronts: one standing ribbon per fire line carries the fire; the sprite flames add licks and sparks over it
  const fronts = (() => {
    const pos = [], f4 = [], br = [], idx = [], M = 60;
    FIRES.forEach(([x0, z0, x1, z1], j) => {
      const L = Math.hypot(x1 - x0, z1 - z0), nx = -(z1 - z0) / L, nz = (x1 - x0) / L;  // n points ahead (+z, unburnt)
      // three strips: taller and dimmer behind, short and hot in front
      [[-0.32, 1.25, 0.45], [0, 1.0, 0.7], [0.22, 0.7, 0.85]].forEach(([off, hs, b], k) => {
        const o = pos.length / 3, HM = 1.5 * hs;
        for (let i = 0; i <= M; i++) {
          const u = i / M, x = x0 + (x1 - x0) * u + nx * off, z = z0 + (z1 - z0) * u + nz * off, y = groundH(x, z) + 0.1;
          pos.push(x, y, z, x, y + HM, z); f4.push(u * L, 0, L, j / 5 + 0.13 + k * 0.31, u * L, 1, L, j / 5 + 0.13 + k * 0.31); br.push(b, b);
          if (i < M) idx.push(o + 2 * i, o + 2 * i + 2, o + 2 * i + 1, o + 2 * i + 1, o + 2 * i + 2, o + 2 * i + 3);
        }
      });
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aF', new THREE.Float32BufferAttribute(f4, 4)); g.setAttribute('aB', new THREE.Float32BufferAttribute(br, 1)); g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: FRONT_V, fragmentShader: FRONT_F, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.renderOrder = 1; scene.add(m); return m;
  })();
  const flameN = small ? 260 : Math.round(500 * tier.density ** 0.7);  // High 2,500 over the ribbons: additive sprites, fill-bound
  U.uFlameA.value = small ? 1.1 : 0.6 / Math.sqrt(flameN / 1400); U.uFlameS.value = small ? 1.5 : 0.8;
  const flames = points(flameN, 5, (r) => { const p = onFire(r); p[1] = groundH(p[0], p[2]); return p; }, FLAME, FLAME_F);
  const embers = points(small ? 120 : Math.round(500 * Math.sqrt(tier.density)), 6, onFire, EMBER);  // x density reads as glitter
  flames.renderOrder = embers.renderOrder = 1;        // drawn after the smoke, so they glow through it
  const COLS = (() => { const r = rng(13); return FIRES.map((f) => { const k = 0.5 + (r() - 0.5) * 0.3; return [f[0] + (f[2] - f[0]) * k, 0, f[1] + (f[3] - f[1]) * k]; }); })();
  // five tall plumes, one per front; fewer, bigger puffs than x density (overdraw), each thinner the more there are
  const smokeN = small ? 360 : tier.name === 'ultra' ? 640 : 420;  // fill-bound (big blended sprites into a 4x MSAA target): High is held at 420
  U.uSmokeA.value = small ? 0.95 : 0.75 * Math.min(1, Math.sqrt(360 / smokeN));  // phones: fewer, clearer columns
  // the foot sits on the fire line
  const smoke = points(smokeN, 7, (r) => { const c = COLS[Math.floor(r() * COLS.length)]; return [c[0] + (r() - 0.5) * 1.6, 0, c[2] + (r() - 0.5) * 0.4]; }, SMOKE, SMOKE_F, THREE.NormalBlending);

  // Straw fibres: scattered on the field (rng(1)), swirl up, fold into the box, bowl and cup
  const fibreN = small ? 1500 : Math.round(3000 * tier.density ** 0.25);  // High 5,300; Ultra 7,000: few enough that single straws read
  const fibres = points(fibreN, 8, (r) => sampleSurface(r), FIBRE, FIBRE_F, THREE.NormalBlending);
  fibres.renderOrder = 1;                             // after the packaging, so its surface hides only the fibres behind it
  {
    const r = rng(1), cnt = fibres.geometry.attributes.position.count, s = new Float32Array(cnt * 3);
    // a soft patch where the ribbon leaves the stubble
    for (let i = 0; i < cnt; i++) { const x = C[0] - 2.4 + (r() + r() + r() - 1.5) * 2.0, z = C[2] + 2.0 + (r() + r() + r() - 1.5) * 1.8; s.set([x, groundH(x, z) + 0.05, z], i * 3); }
    fibres.geometry.setAttribute('aStart', new THREE.BufferAttribute(s, 3));
  }

  // The packaging itself, faded in as the fibres settle
  const paper = pulp(lambert(0xe2cc98, { emissive: 0x24180a, transparent: true }), U.uRim);
  // the profile starts with a flat floor (rings from the axis out to f(0)) raised 2.5 cm, so the bowl is solid from above and clear of the table top
  const lathe = (f, h, floor) => new THREE.LatheGeometry(Array.from({ length: floor }, (_, k) => new THREE.Vector2(f(0) * k / floor, 0.025))
    .concat(Array.from({ length: 11 }, (_, k) => new THREE.Vector2(f(h * k / 10), h * k / 10))), 28);
  const pack = OBJ.map(() => new THREE.Group());
  mesh(new THREE.BoxGeometry(1.1, 0.45, 0.8).translate(0, 0.225, 0), paper, 0, 0, 0, pack[0]);
  mesh(new THREE.BoxGeometry(1.14, 0.1, 0.84), paper, 0, 0.405, 0, pack[0]);  // the lid: a shallow overhang over the top
  const bowlGeo = lathe(bowlR, 0.4, 4), bp = bowlGeo.attributes.position;
  // floor darkens softly toward the centre
  bowlGeo.setAttribute('color', new THREE.BufferAttribute(Float32Array.from({ length: bp.count * 3 }, (_, i) => {
    const v = Math.floor(i / 3), r = Math.hypot(bp.getX(v), bp.getZ(v)) / bowlR(0);
    return bp.getY(v) < 0.02 || bp.getY(v) > 0.03 ? 1 : 0.68 + 0.32 * Math.min(1, r) ** 1.5;
  }), 3));
  mesh(bowlGeo, pulp(lambert(0xe2cc98, { emissive: 0x24180a, transparent: true, side: THREE.DoubleSide, vertexColors: true }), U.uRim), 0, 0, 0, pack[1]);
  mesh(new THREE.CylinderGeometry(0.32, 0.21, 0.75, 24).translate(0, 0.375, 0), paper, 0, 0, 0, pack[2]);
  mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 24), paper, 0, 0.78, 0, pack[2]);
  const shadows = pack.map((g, i) => {
    const m = mesh(new THREE.PlaneGeometry(...[[1.6, 1.25], [1.0, 1.0], [0.65, 0.65]][i]).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shadowTex, transparent: true, depthWrite: false }), 0, -OBJ[i].at[1] + 0.03, 0, g);
    return m;
  });
  pack.forEach((g) => scene.add(g));
  const trails = points(n(240), 12, () => [0, 0, 0], TRAIL);  // gold sparks behind each flying piece
  const packMats = [paper, pack[1].children[0].material];

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
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 16), jar, CANDLE[0], CANDLE[1] + 0.05, CANDLE[2], cafe);  // the candle
  mesh(new THREE.CylinderGeometry(1.25, 1.23, 0.07, 96), wood, TABLE[0], 0.88, TABLE[2], cafe);
  mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.85, 12), wood, TABLE[0], 0.45, TABLE[2], cafe);
  mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.05, 32), wood, TABLE[0], 0.06, TABLE[2], cafe);
  {  // a potted plant: a café cue (chairs come with the Blender models)
    mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.42, 20), pot, TABLE[0] - 2.3, 0.21, TABLE[2] - 1.3, cafe);
    const r = rng(15);
    const blade = new THREE.ConeGeometry(0.07, 0.95, 6).translate(0, 0.47, 0);  // tall leaves fanning out of the pot
    for (let i = 0; i < 11; i++) { const l = mesh(blade, leaf, TABLE[0] - 2.3, 0.38, TABLE[2] - 1.3, cafe); l.rotation.set((r() - 0.5) * 0.9, r() * 6.28, (r() - 0.5) * 0.9); l.scale.set(1, 0.7 + r() * 0.6, 0.35); }
  }
  const wire = new THREE.LineBasicMaterial({ color: 0x6a5038, transparent: true });  // the catenary reads against the night
  cafe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 21 }, (_, i) => { const k = i / 20; return new THREE.Vector3(-3.6 + 7.2 * k, 2.93 - Math.sin(k * Math.PI) * 0.35, TABLE[2] - 2.5 + 3 * k); })), wire));
  const cafeMats = [wood, deck, wire, leaf, pot, rail, jar];

  // Glows: the hut lantern and the café bulbs (aSeed.x picks which, aSeed.y is size)
  {
    const pos = [HUT[0] - 0.2, 1.6, HUT[2] + 0.3, HUT[0] - 0.2, 1.6, HUT[2] + 0.3, C[0], 0.7, C[2] - 0.7], sd = [0.2, 1.4, 0, 1, 0.2, 5.5, 1, 1, 0.8, 6, 0, 1], cl = [1, 0.62, 0.25, 0.5, 0.28, 0.1, 0.45, 0.3, 0.14];
    // candle flame and its halo
    pos.push(CANDLE[0], CANDLE[1] + 0.14, CANDLE[2], CANDLE[0], CANDLE[1] + 0.14, CANDLE[2]);
    sd.push(0.5, 0.05, 3, 0, 0.5, 0.7, 5, 1);
    cl.push(1, 0.7, 0.35, 0.5, 0.26, 0.1);
    // tight warm points with a small halo
    for (let i = 0; i < 14; i++) { const k = i / 13; pos.push(-3.6 + 7.2 * k, 2.85 - Math.sin(k * Math.PI) * 0.35, TABLE[2] - 2.5 + 3 * k); sd.push(0.5, 0.15, i, 0.3); cl.push(1, 0.62, 0.3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 4)); g.setAttribute('aCol', new THREE.Float32BufferAttribute(cl, 3));
    const m = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: HEAD + GLOW, fragmentShader: GLOW_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.frustumCulled = false; scene.add(m);
  }

  // Lights
  // a warm ground bounce: undersides are not black
  const hemi = new THREE.HemisphereLight(0xffffff, 0x4a3222, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1); scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8090c0, 0.25); fill.position.set(0, 10, 30); scene.add(fill);
  // the fires light the hut and the stubble around them
  const fireLight = new THREE.PointLight(0xff6a20, 0, 18, 1.5);
  fireLight.position.set(4, 1.5, -15);
  scene.add(fireLight);
  // warm key from the sun side; the cool fill comes from the sky
  const packLight = new THREE.PointLight(0xffb070, 0, 9, 1);
  packLight.position.set(C[0] + 2.6, 1.8, C[2] + 0.6);
  scene.add(packLight);
  // a warm overhead pool; the floor falls into darkness beyond it
  const cafeLight = new THREE.PointLight(0xffb060, 0, 6, 2);
  cafeLight.position.set(0, 2.8, TABLE[2]);
  scene.add(cafeLight);
  // a warm pool on the table from the bulb overhead; it falls off to the deck
  const candle = new THREE.PointLight(0xffa04a, 0, 4, 1.4); candle.position.set(CANDLE[0], CANDLE[1] + 0.2, CANDLE[2]); scene.add(candle);
  // the table only, not the floor by the lens
  const tableSpot = new THREE.SpotLight(0xffd2a4, 0, 7, 0.42, 1, 1);
  tableSpot.position.set(0.3, 2.8, TABLE[2] + 0.2);
  tableSpot.target.position.set(TABLE[0], TABLE[1], TABLE[2]); scene.add(tableSpot, tableSpot.target);

  // Colours of the evening
  // sunset: amber-apricot horizon under dusty rose, deepening to orange-red as the sun touches the ridges; after the
  // smoke a golden/blue hour: a strong warm horizon glow under blue; then night.
  const H_WARM = col(1, 0.55, 0.22), H_RED = col(1, 0.36, 0.12), H_DUSK = col(0.8, 0.46, 0.28), H_NIGHT = col(0.09, 0.11, 0.19);
  const CORAL = col(0.95, 0.55, 0.32), MID_WARM = col(0.72, 0.42, 0.4), coral = col(0, 0, 0), mid = col(0, 0, 0), tc = col(0, 0, 0);
  const TREE_DARK = col(0.06, 0.05, 0.045), Z_WARM = col(0.3, 0.2, 0.3), SMOKE_CEIL = col(0.2, 0.175, 0.16), SMOKE_HZ = col(0.42, 0.37, 0.33), AFTER = col(1, 0.48, 0.2);
  const Z_DUSK = col(0.2, 0.2, 0.31), Z_NIGHT = col(0.035, 0.04, 0.12), CITY_FOG = col(0.07, 0.065, 0.13), CLOUD = col(0.2, 0.13, 0.17), WARM_FILL = col(1, 0.7, 0.4), SMOKE_DARK = col(0.4, 0.35, 0.33), SMOKE_LIT = col(0.85, 0.45, 0.22), MOON = col(0.42, 0.45, 0.78), HAZE = col(0.46, 0.42, 0.4), CITYGLOW = col(0.9, 0.5, 0.22);
  const horizon = col(0, 0, 0), zenith = col(0, 0, 0), sunDir = new THREE.Vector3(), v = new THREE.Vector3(), sv = new THREE.Vector3(), fwd = new THREE.Vector3();

  function render(p, t) {
    const q = clamp01(p), P = params(q, t, camera.aspect < 1), sunW = smooth(0.45, 1, P.sun), night = smooth(0.6, 0.95, q);
    camera.position.set(P.camera.x, P.camera.y, P.camera.z);
    camera.lookAt(P.camera.lookX, P.camera.lookY, P.camera.lookZ);
    sky.position.copy(camera.position);

    // afterglow once the smoke clears
    const red = smooth(0.95, 0.78, P.sun) * sunW, glow = (1 - sunW) * smooth(0.42, 0.55, q) * (1 - smooth(0.68, 0.9, q));
    horizon.lerpColors(H_DUSK, H_WARM, sunW).lerp(H_RED, 0.55 * red).lerp(H_NIGHT, night).lerp(SMOKE_HZ, P.smoke * 0.7).lerp(CITYGLOW, P.city * 0.06);
    zenith.lerpColors(Z_DUSK, Z_WARM, sunW * sunW).lerp(Z_NIGHT, night).lerp(SMOKE_CEIL, P.smoke * 0.85);  // the smoke closes the sky
    coral.lerpColors(H_DUSK, CORAL, sunW).lerp(H_RED, 0.4 * red).lerp(H_NIGHT, night).lerp(SMOKE_HZ, P.smoke * 0.7);
    mid.lerpColors(zenith, MID_WARM, sunW * (1 - P.smoke * 0.8));
    skyU.uHorizon.value.copy(horizon);
    skyU.uCoral.value.copy(coral);
    skyU.uMid.value.copy(mid);
    skyU.uZenith.value.copy(zenith);
    // Low behind the hut (its azimuth), just above the ridges at the hero, setting into them by p 0.35; blooms while sun > 0.2.
    sunDir.set(0.38, -0.04 + 0.2 * P.sun ** 4, -1).normalize();  // touching the hills by p 0.2
    skyU.uSunDir.value.copy(sunDir);
    skyU.uSunAmt.value = sunW * (1 - P.smoke * 0.85);
    U.uSunDirW.value.copy(sunDir);
    skyU.uDisc.value = smooth(0.68, 0.8, P.sun) * (1 - P.smoke);  // fades in the haze as it sets: no half-dome on the ridge
    skyU.uSmother.value = 0.8 * P.smoke * (1 - P.city);
    skyU.uSmokeSky.value = P.smoke;
    skyU.uT.value = t;
    skyU.uCloud.value = (1 - smooth(0.25, 0.34, q)) * (1 - P.smoke);
    skyU.uCloudCol.value.copy(CLOUD).lerp(zenith, 0.3);
    skyU.uCityGlow.value = 0.6 * P.city;
    skyU.uSunCol.value.setRGB(1, 0.62, 0.3).lerp(H_RED, 0.5 * red);
    scene.fog.color.copy(horizon).lerp(Z_NIGHT, 0.35).lerp(CITY_FOG, 0.85 * P.city);  // night over the city is blue-violet, not smog
    // thicker haze in the smoke; distant blocks lighten in the night haze
    scene.fog.far = (90 + 50 * smooth(0.6, 0.8, q)) * (1 - 0.35 * P.smoke) + 80 * P.city;
    // aerial perspective: each farther ridge paler and bluer, all melting into the haze at their base and catching the
    // sun on their crests; they sink away before the city (Bangkok is flat)
    ridges.forEach((m, i) => {
      const u = m.material.uniforms;
      // nearly lost in the smoke
      u.uCol.value.copy(horizon).lerp(Z_NIGHT, 0.5 - 0.13 * i).lerp(zenith, 0.1 * i).lerp(scene.fog.color, 0.75 * P.smoke);
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
    sun.color.copy(H_WARM).lerp(H_RED, 0.5 * red).lerp(AFTER, glow);
    sun.intensity = 1.4 * sunW + 0.9 * glow;  // the afterglow keeps raking the stubble tips after sunset
    // no front light into the low sun; none on the cafe floor
    fill.color.lerpColors(MOON, WARM_FILL, sunW);
    fill.intensity = (0.04 * sunW + 0.7 * (1 - sunW)) * (1 - 0.8 * P.city);
    fireLight.intensity = 9 * P.fire;
    cafeLight.intensity = 5 * P.city;
    tableSpot.intensity = 1.2 * P.city;
    candle.intensity = 1.6 * P.city;
    bladeU.uSunDir.value.copy(sunDir);
    bladeU.uSunCol.value.copy(sun.color).multiplyScalar(sun.intensity / Math.PI);
    // no lavender: the blade shader cools only the shade
    bladeU.uAmb.value.copy(horizon).lerp(zenith, 0.35).lerp(MOON, 0.2 * (1 - sunW)).multiplyScalar(hemi.intensity * (1 + 0.5 * cool) / Math.PI).add(tc.copy(fill.color).multiplyScalar(fill.intensity * 0.3 / Math.PI));
    bladeU.uFireAmt.value = 0.9 * P.fire;
    U.uCityGround.value = smooth(0.6, 0.8, q);
    bladeU.uChar.value = smooth(0.24, 0.34, q) * (1 - smooth(0.5, 0.6, q));
    bladeU.uCool.value = cool;
    bladeU.uRows.value = 0.6 * sunW + 0.25 * glow;
    bladeU.uRimK.value = (post ? 1.7 : 1) * (small ? 0.5 : 1);
    // the hut casts a long shadow toward the camera from the low sun (blades and ground)
    const shx = -sunDir.x, shz = -sunDir.z, shn = Math.hypot(shx, shz), shL = Math.min(30, 2.8 / Math.max(sunDir.y, 0.09)), shA = 0.6 * sunW * (1 - P.smoke);
    bladeU.uHutSh.value.set(HUT[0], HUT[2], shx / shn, shz / shn);
    bladeU.uHutL.value.set(shA > 0.01 ? shL : 0.001, 1.4);
    hutShadow.position.set(HUT[0] + shx / shn * shL * 0.45, 0.05, HUT[2] + shz / shn * shL * 0.45);
    hutShadow.rotation.y = Math.atan2(shx, shz);
    hutShadow.scale.set(2.8, 1, shL);
    hutShadow.material.opacity = shA;
    hutShadow.visible = shA > 0.01;
    tufts.g.visible = camera.aspect >= 1 && q < 0.25;
    tufts.mat.uniforms.uA.value = 1 - smooth(0.1, 0.22, q);
    tufts.mat.uniforms.uRim.value.copy(sun.color).multiplyScalar(0.9 * sunW);

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
    U.uSmokeLow.value.lerpColors(SMOKE_DARK, SMOKE_LIT, 0.55 * P.fire);
    U.uSmokeFire.value.copy(SMOKE_LIT).multiplyScalar(3.6 * P.fire);  // the flames light the column bases
    U.uFibCol.value.setRGB(1, 0.68, 0.3).multiplyScalar(post ? 1.05 : 1);  // just at the bloom edge: dense stretches glow, no blow-out
    U.uFold.value = P.fold;
    U.uFibA.value = smooth(0.42, 0.52, q) * (small ? 1 : Math.min(1, 0.75 * (fibreN / 3000) ** -0.2));
    U.uSurf.value = smooth(0.85, 1, P.fold);
    U.uFibOut.value = smooth(0.72, 0.77, q);
    U.uLantern.value = (0.15 + 0.85 * (1 - sunW)) * (1 - smooth(0.6, 0.75, q));  // barely there in daylight: no orange halo over the backlit hut
    // after uLantern: nothing may read the last frame; faint by day
    hutWin.material.color.setRGB(1.1, 0.5, 0.16).multiplyScalar(U.uLantern.value * (0.3 + 0.7 * (1 - sunW)));
    hutRim.value.copy(sun.color).multiplyScalar(0.9 * sunW * (1 - P.smoke) + 0.3 * glow + 0.6 * P.fire);  // rim lit from behind (and by the fires)
    U.uBulbs.value = P.city;
    U.uCity.value = P.city;
    U.uStars.value = Math.max(0.35 * smooth(0.45, 0.65, q) * P.clear, P.city);  // first stars at dusk, all of them as the city rises
    flames.visible = embers.visible = P.fire > 0.001 || P.smoke > 0.001;
    fronts.visible = P.fire > 0.001;
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
    packMats.forEach((m) => { m.opacity = U.uSurf.value; });  // the pulp surface fills in over the settled outline
    pack.forEach((g, i) => {
      const o = OBJ[i], e = clamp01((P.fly - i * 0.08) / 0.84) ** 2.2;  // slow start keeps them just ahead of the camera
      const end = v.set(TABLE[0] + o.land[0], TABLE[1], TABLE[2] + o.land[2]), mid = (a, b) => (a + b) / 2;
      const m = [mid(o.at[0], end.x), mid(o.at[1], end.y) + 4, mid(o.at[2], end.z)];
      const b = (k) => (1 - e) ** 2 * o.at[k] + 2 * e * (1 - e) * m[k] + e * e * end.getComponent(k);
      U.uFA.value[i].set(...o.at);
      U.uFM.value[i].set(...m);
      U.uFE.value[i].copy(end);
      U.uFP.value.setComponent(i, e);
      // presented just above the stubble once formed
      g.position.set(b(0), b(1) + lift * (1 - e) + 0.05 * Math.sin(t * 1.2 + i * 2) * (1 - e) * (1 - form), b(2));
      g.rotation.set(Math.sin(e * Math.PI) * 0.5, o.rot + (1 - e) * (i % 2 ? -6.28 : 6.28), 0);
      g.scale.setScalar(FOLD_S + (0.62 - FOLD_S) * e);  // 0.62 on the table, as before
      g.visible = form > 0.001;
      bladeU.uObj.value[i].set(g.position.x, g.position.y, g.position.z, form * (1 - smooth(0, 0.15, e)));  // contact shadow while it rests
      const sh = shadows[i];
      sh.material.opacity = 0.85 * U.uSurf.value * (1 - smooth(0, 0.1, e)) * (1 - 0.3 * liftK);
      // the soft shadow stays on the stubble
      sh.position.y = (o.at[1] + 0.03 - g.position.y) / g.scale.y;
      sh.scale.setScalar(1 + 0.5 * liftK);
    });
    trails.visible = P.fly > 0 && P.fly < 1;
    // below the terrace: it falls away past the railing
    city.visible = P.city > 0.001;
    city.position.y = -12 - ((1 - P.city) ** 2) * 16;
    cafe.visible = P.city > 0.001;
    cafeMats.forEach((m) => { m.opacity = P.city; });

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
  return { render, dispose, resize, attachPost, renderer };
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
  if (VIDEO || BENCH) await postReady;  // fixed renders and the bench must include post
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
