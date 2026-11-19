// Home scroll film: one Three.js scene drawn only from params(p, t) (timeline.js), so any frame can be
// rendered again exactly. The page passes scroll and the clock; video tools call window.scFilm.render(p, t).
// Falls back to the still images (html.no-film) when WebGL, speed, the CDN or reduced motion say so.
import { params, rng, counter, shouldUse3D, tooSlow, through } from './timeline.js';
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
const TIER = TIERS[FLAGS.tier || pickTier({
  width: innerWidth, coarse: matchMedia('(pointer: coarse)').matches, deviceMemory: navigator.deviceMemory, video: VIDEO,
})];

// Counters: illustrative story figures that follow the same t as the scene (film loop, scFilm.render, or the
// stills-mode clock), so a captured frame shows the counters for its own t.
const CAPTION_P = [0.2, 0.37, 0.6, 0.72];  // p at which beats 1-4 hold their caption: fire starting, smoke, fibres, packaging
const LOW_EXPOSURE = 1.25, POST_EXPOSURE = 1.25;
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

// Dust: warm motes, brightest where they sit against the sun (backlit), dim elsewhere; size by depth, capped so the
// nearest ones stay motes instead of big bokeh circles.
const DUST = /* glsl */`
uniform float uDust, uPR; uniform vec3 uSunDirW; varying float vA; varying vec3 vC;
void main() {
  vec3 p = position;
  p.x = mod(p.x + uT * (0.12 + aSeed.x * 0.1) + sin(uT * 0.4 + aSeed.y * 6.28) * 0.5 + 22.0, 44.0) - 22.0;
  p.y += sin(uT * 0.3 + aSeed.z * 6.28) * 0.35;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  bool soft = aSeed.y > 0.9;  // one in ten: big, faint, out of focus
  gl_PointSize = soft ? min(psize(0.12 + aSeed.w * 0.1, mv), 16.0 * uPR) : min(psize(0.025 + aSeed.w * 0.045, mv), 5.0 * uPR);
  float back = pow(max(dot(normalize((modelMatrix * vec4(p, 1.0)).xyz - cameraPosition), uSunDirW), 0.0), 6.0);
  vA = uDust * (0.04 + 2.0 * back) * (soft ? 0.25 : 1.0) * (0.35 + 0.65 * (0.5 + 0.5 * sin(uT * 1.3 + aSeed.x * 40.0))) * smoothstep(1.5, 5.0, -mv.z);
  vC = mix(vec3(0.9, 0.5, 0.22), vec3(1.0, 0.68, 0.36), back);  // only where it catches the sun
}`;

// Flames: tongues along each fire line. Height per spot and per particle flicker are layered sines of t, so a
// fixed (p, t) gives the same fire. uHot lifts the colour above the bloom threshold when post is on.
const FLAME = /* glsl */`
uniform float uFire, uFlameA, uFlameS, uHot; varying float vA; varying vec3 vC;
void main() {
  float life = fract(aSeed.w + uT * (0.9 + aSeed.x * 0.8));
  vec3 p = position;
  float tongue = 0.5 + 0.5 * sin(p.x * 4.3 + p.z * 3.1 + uT * 2.3) * sin(p.x * 1.7 - p.z * 1.3 - uT * 3.9);
  p.z += (fract(aSeed.z * 7.7) - 0.5) * 0.7; p.x += (fract(aSeed.w * 3.3) - 0.5) * 0.3;  // a band of fire, not a line
  p.y += 0.08 + life * (0.55 + 0.9 * tongue) * (0.5 + 0.5 * aSeed.y) * uFire;  // tongues 0.3-1.4 m, taller where the front flares
  p.x += sin(uT * 4.0 + aSeed.z * 20.0 + life * 5.0) * 0.1 * life + life * life * 0.35;  // licks, leaning with the wind
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = psize((0.6 - 0.32 * life) * (0.5 + 0.5 * uFire) * uFlameS, mv);
  float flick = 0.72 + 0.16 * sin(uT * 13.0 + aSeed.x * 50.0) + 0.12 * sin(uT * 29.0 + aSeed.y * 70.0);
  vA = uFire * uFlameA * (1.0 - life) * smoothstep(0.0, 0.3, life) * flick * (0.35 + 0.85 * tongue);  // brightest up in the tongue, so fronts read as flames, not a glowing seam
  vC = mix(mix(vec3(1.0, 0.52, 0.2), vec3(1.0, 0.3, 0.05), smoothstep(0.0, 0.16, life)), vec3(0.45, 0.06, 0.01), smoothstep(0.3, 0.8, life)) * uHot * 0.6;  // orange-red; only the densest core clips
}`;

const FLAME_F = /* glsl */`
varying float vA; varying vec3 vC;
void main() {  // a tongue: wide at the base, narrowing to the tip (point y runs down)
  vec2 c = gl_PointCoord - 0.5; c.x *= 1.8 + 2.0 * (0.5 - c.y);
  float d = length(c) * 2.0; gl_FragColor = vec4(vC, vA * pow(max(1.0 - d, 0.0), 1.2));
}`;

// sin-free value noise (cheap per fragment, same result for the same input)
const NOISE = /* glsl */`
float h2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + 1.0), f.x), f.y); }
`;

// Fire fronts: one standing ribbon per fire line (aF: metres along, height 0..1, length, seed). Tongues of different
// heights drift along it and lick upward with t; a hot low core, dark red tips, edges that stay edges under bloom.
const FRONT_V = /* glsl */`
attribute vec4 aF; attribute float aB; varying vec4 vF; varying float vB;
void main() { vF = aF; vB = aB; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRONT_F = /* glsl */`
uniform float uT, uFire, uHot; varying vec4 vF; varying float vB;
${NOISE}
void main() {
  float x = vF.x, y = vF.y, s = vF.w * 17.0;
  // a turbulent flame field rising with t: tall where the front flares, breaking into licks and wisps toward the top
  float H = (0.18 + 0.6 * n2(vec2(x * 1.1 + s, uT * 0.5))) * (0.7 + 0.3 * n2(vec2(x * 2.8 - s, uT * 1.6)));
  H *= uFire * smoothstep(-0.2, 0.9, x) * smoothstep(-0.2, 0.9, vF.z - x);  // the ends die down
  float v = y / max(H, 0.03);
  float nz = n2(vec2(x * 6.5, y * 4.5 - uT * 3.2)) * 0.6 + n2(vec2(x * 14.0 + s, y * 9.0 - uT * 5.2)) * 0.4;  // many small tongues
  float dens = (1.0 - v) * 1.35 + (nz - 0.5) * 1.6;  // > 0 inside the fire
  float bot = 0.03 + 0.05 * n2(vec2(x * 3.0, uT));
  float a = smoothstep(0.0, 0.3, dens) * smoothstep(bot, bot + 0.06, y);
  if (a < 0.004) discard;
  vec3 c = mix(vec3(1.0, 0.88, 0.58), vec3(1.0, 0.45, 0.08), smoothstep(0.05, 0.3, v) * (1.0 - smoothstep(1.1, 1.8, dens)));  // white-yellow at the hot base
  c = mix(c, vec3(0.42, 0.05, 0.01), smoothstep(0.6, 1.05, v));  // dark red tips
  a *= 1.0 - 0.4 * smoothstep(0.6, 1.0, v);
  gl_FragColor = vec4(c * uHot * 0.6 * vB, a * min(uFire * 2.0, 1.0));
}`;

// Embers: sparks that leave the fire lines, rise and drift downwind on t; as the air clears they sink back.
const EMBER = /* glsl */`
uniform float uEmber, uClear, uHot; varying float vA; varying vec3 vC;
void main() {
  float life = fract(aSeed.w + uT * (0.05 + aSeed.x * 0.07));
  vec3 p = position;
  p.y += 0.2 + life * (1.0 + aSeed.y * aSeed.y * 5.0) * (1.0 - 0.85 * uClear);
  p.x += life * (0.8 + aSeed.z * 1.6) + sin(uT * (0.6 + aSeed.x) + aSeed.z * 6.28) * (0.1 + 0.6 * life);
  p.z += cos(uT * 0.5 + aSeed.y * 6.28) * life * 0.8;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(psize(0.04 + aSeed.y * 0.05, mv), 1.2);
  float flick = 0.55 + 0.45 * sin(uT * (5.0 + aSeed.x * 7.0) + aSeed.z * 40.0);
  vA = uEmber * smoothstep(0.0, 0.05, life) * (1.0 - life) * (1.0 - life) * flick * (0.3 + 0.9 * pow(fract(aSeed.x * 13.7), 2.0));  // a few bright sparks
  vC = mix(vec3(1.0, 0.5, 0.14), vec3(0.9, 0.2, 0.03), life) * uHot * 1.1;
}`;

// Straw blades (InstancedMesh, local blade 0..1 tall): wind bend from a rolling gust and a per-blade flutter, both
// pure in t and position. Lit by the sun (backlit tips glow), the fire lines, the packaging glow; haze far away.
const BLADE_V = /* glsl */`
uniform float uT, uFireAmt, uPack, uChar, uCool, uRimK, uSmall; uniform vec3 uSunDir, uSunCol, uAmb, uPackPos; uniform vec4 uFires[5], uObj[3], uHutSh; uniform vec2 uHutL;
varying vec3 vCol; varying float vHaze;
#include <fog_pars_vertex>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec3 base = m[3].xyz, w = (m * vec4(position, 1.0)).xyz;
  float h = position.y, H = length(m[1].xyz), s = hash(base.xz), s2 = hash(base.zx + 7.0), s3 = hash(base.xz * 1.7 + 3.1);
  // fire first: behind each front the straw is burnt down to black stubs; just ahead of it the stubble glows
  float fg = 0.0, burnt = 0.0;
  for (int i = 0; i < 5; i++) {
    vec2 a = uFires[i].xy, b = uFires[i].zw, ab = b - a;
    float along = dot(base.xz - a, ab);
    vec2 d = base.xz - (a + ab * clamp(along / dot(ab, ab), 0.0, 1.0));
    float sd = dot(base.xz - a, normalize(vec2(-ab.y, ab.x)));  // the fronts run toward +z (the camera); behind them is burnt
    fg += mix(0.3, 1.0, step(0.0, sd)) / (1.0 + dot(d, d) * 0.9);
    burnt = max(burnt, step(0.0, along) * step(along, dot(ab, ab)) * smoothstep(-5.4, -4.4, sd + s * 0.6) * smoothstep(0.1, -0.5, sd));
  }
  float dist = length(cameraPosition - base);
  w = base + (w - base) * (1.0 - 0.8 * uChar * burnt) * smoothstep(1.2, 3.6, dist);  // burnt to stubs; none right at the lens
  float gust = 0.5 + 0.5 * sin(uT * 0.9 - base.x * 0.18 + base.z * 0.11);
  float sway = ((0.08 + 0.26 * gust) + 0.07 * sin(uT * 3.1 + s * 6.28 + base.x * 0.7)) * pow(max(normalize(m[1].xyz).y, 0.0), 2.0);  // lying straw stays put
  w.x += h * h * H * sway; w.z -= h * h * H * sway * 0.3; w.y -= h * h * H * sway * sway * 0.5;
  vec3 n = normalize(mat3(m) * vec3(0.0, 0.0, 1.0)), v = normalize(cameraPosition - w);
  n *= dot(n, v) < 0.0 ? -1.0 : 1.0;  // the face we see
  // low sun: the faces turned to it are lit, the rest glow only through (thin straw) and on the tips against the sun
  float lit = max(dot(n, uSunDir), 0.0), through = max(-dot(n, uSunDir), 0.0), back = pow(max(dot(-v, uSunDir), 0.0), 4.0);
  vec3 grey = vec3(0.46, 0.39, 0.32), tan = vec3(0.7, 0.52, 0.33), gold = vec3(0.92, 0.66, 0.32);  // per blade: grey-brown, tan, gold
  vec3 straw = (s < 0.45 ? mix(grey, tan, s / 0.45) : mix(tan, gold, (s - 0.45) / 0.55)) * (0.82 + 0.3 * s2);
  straw *= 0.5 + 0.5 * smoothstep(0.0, 0.7, h);  // darker bases, deep in the row
  straw = mix(straw, dot(straw, vec3(0.3, 0.55, 0.15)) * vec3(1.12, 0.96, 0.72), 0.45 * uCool);  // after sunset: desaturated ochre, still straw
  float tip = h * h, rim = back * tip * (1.6 + 4.0 * s3 * s3) * uRimK;  // some tips flare gold against the sun
  vec2 hp = base.xz - uHutSh.xy; float al = dot(hp, uHutSh.zw), ac = abs(dot(hp, vec2(-uHutSh.w, uHutSh.z)));
  float hutSh = smoothstep(-0.6, 0.8, al) * smoothstep(uHutL.x, uHutL.x * 0.55, al) * smoothstep(uHutL.y, uHutL.y * 0.35, ac);  // the hut's long shadow toward the camera
  vec3 amb = uAmb * mix(vec3(1.0), mix(vec3(0.72, 0.76, 1.0), vec3(1.08, 0.96, 0.8), h), uCool);  // after sunset only the shade goes blue
  vec3 light = amb * (mix(0.22, 0.45, uSmall) + mix(0.78, 0.55, uSmall) * h) + uSunCol * mix(lit * (0.25 + 0.75 * h) + through * 0.3 * h + rim, (lit + rim) * tip * 1.3, uCool) * (1.0 - 0.85 * hutSh);
  straw = mix(straw, vec3(0.05, 0.04, 0.035), uChar * burnt);  // charred
  light += vec3(1.0, 0.45, 0.14) * uFireAmt * fg * (0.6 + 0.9 * h);
  vec3 pd = w - uPackPos;
  light += vec3(1.0, 0.72, 0.4) * uPack * 0.9 * exp(-dot(pd, pd) * 0.35);  // a soft warm spill from the packaging itself
  for (int i = 0; i < 3; i++) {  // contact shadow: the straw right under each piece is darker
    vec3 od = w - uObj[i].xyz;
    light *= 1.0 - 0.85 * uObj[i].w * exp(-dot(od.xz, od.xz) * 2.2) * smoothstep(0.6, -0.1, od.y);
  }
  vCol = straw * light;
  vHaze = max(smoothstep(8.0, 46.0, length(cameraPosition - w)) * 0.55, smoothstep(-22.0, -34.0, base.z));  // the field's far edge melts into the haze
  vec4 mvPosition = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const BLADE_F = /* glsl */`
varying vec3 vCol; varying float vHaze;
#include <fog_pars_fragment>
void main() {
  gl_FragColor = vec4(mix(vCol, fogColor, vHaze), 1.0);
  #include <fog_fragment>
  #include <tonemapping_fragment>
}`;

// Smoke: fewer, larger puffs (count and screen size capped per tier, so overdraw stays bounded). Each puff's
// outline is value noise in the fragment shader, turning slowly with t; the lower part of each column and the
// underside of each puff take the fire colour. The column base is clear so the flames show beneath it.
const SMOKE = /* glsl */`
uniform float uS, uSmokeA, uSmokeCap, uClear, uFoot, uHfPow, uPuff; uniform vec3 uSmokeLow, uSmokeHigh, uSmokeFire; varying float vA, vRot; varying vec3 vC, vF;
void main() {
  float hf = pow(aSeed.w, uHfPow), h = hf * uS;  // height follows the smoke amount, so the fall is the rise run backwards (phones: more puffs low, so each column stands on its fire)
  float top = smoothstep(0.55, 1.0, hf) * uS;  // up high the plume flattens and spreads into a ceiling
  vec3 p = position;
  float y = h * 26.0;
  p.y += 0.15 + y - max(y - 15.0, 0.0) * 0.65 + sin(uT * 0.35 + aSeed.z * 6.28) * 0.4 * uS;
  float wide = 0.25 + hf * 0.9 + h * h * 4.5 + top * 13.0 + uClear * (1.0 + hf * 5.0);  // a narrow foot on the fire line, billowing as it climbs
  // triangular spread (two seeds) so a column thins out at its sides instead of stopping on a straight edge
  float jx = aSeed.x + fract(aSeed.y * 7.31 + aSeed.w * 3.7) - 1.0, jz = aSeed.y + fract(aSeed.x * 5.17 + aSeed.w * 1.3) - 1.0;
  p.x += jx * wide * 0.75 + h * h * 15.0 + sin(uT * 0.22 + aSeed.y * 6.28 + hf * 4.0) * 0.5 * uS + sin(h * 0.5 + aSeed.z * 2.0) * h * 0.25;  // leaning downwind
  p.z += jz * wide * (0.5 + 0.6 * top);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(psize((0.55 + 0.9 * fract(aSeed.y * 5.3 + aSeed.z)) * (uPuff + h * 8.0 + top * 4.0), mv), uSmokeCap * uScale * (0.55 + 0.45 * aSeed.z));
  // thin right at the fire line, densest a little above it, thinning as it climbs, faded right at the lens
  vA = uS * (1.0 - 0.55 * uClear) * uSmokeA * smoothstep(-0.02, uFoot, hf) * (1.0 - 0.6 * hf) * smoothstep(2.0, 7.0, -mv.z);
  vC = mix(uSmokeLow, uSmokeHigh, smoothstep(0.05, 0.5, hf));
  vF = uSmokeFire * (1.0 - smoothstep(0.02, 0.5, hf));
  vA *= 0.45 + 0.9 * fract(aSeed.w * 7.7 + aSeed.x * 3.1);  // some puffs dense, some thin
  vRot = aSeed.z * 6.28 + uT * (0.04 + 0.06 * aSeed.x) * (aSeed.y > 0.5 ? 1.0 : -1.0);
}`;
const SMOKE_F = /* glsl */`
varying float vA, vRot; varying vec3 vC, vF;
${NOISE}
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;  // the sprite's corners never show: skip the noise there
  float s = sin(vRot), k = cos(vRot);
  vec2 q = mat2(k, -s, s, k) * c * 4.5 + vRot * 3.0;
  float n = n2(q) * 0.62 + n2(q * 2.3 + 3.7) * 0.38;  // two octaves: the puffs are large and many, every ALU counts
  float r = length(c) * 2.0, m = smoothstep(1.0, 0.15, r + (n - 0.5) * 1.1) * smoothstep(1.0, 0.6, r);  // billowed edge, kept inside the sprite (no square cut-offs)
  float a = vA * m * clamp(0.15 + 1.3 * n * n, 0.0, 1.2);  // billows: dense cores, thin gaps
  if (a < 0.003) discard;
  gl_FragColor = vec4(vC * (0.8 + 0.4 * n) + vF * (0.35 + 0.65 * smoothstep(-0.15, 0.45, c.y)), a);  // point y runs down: the underside is fire-lit most
  #include <tonemapping_fragment>
}`;

// Fibres: each one is a thin straw piece plus a short trail from where it was a moment ago (same curve at an earlier
// fold and t), both lying along its motion. They lift off the stubble and are drawn up one S-curved ribbon toward the
// spot where the packaging forms, then settle into the box, bowl and cup. Normal blending, so they stay straw gold.
const FIBRE = /* glsl */`
attribute vec3 aStart; uniform float uFold, uFibA, uFibOut, uFibSize, uSurf, uLift, uLiftK; uniform vec3 uC;
varying float vA, vAng, vMot, vTail, vBody, vShade, vNear, vPx, vTh; varying vec3 vFC;
vec3 bez(vec3 a, vec3 b, vec3 c, vec3 d, float k) { float m = 1.0 - k; return m * m * m * a + 3.0 * m * m * k * b + 3.0 * m * k * k * c + k * k * k * d; }
vec3 at(float fold, float t) {
  float u = clamp((fold - aSeed.x * 0.6) / 0.4, 0.0, 1.0), k = clamp((u - 0.12) / 0.7, 0.0, 1.0);  // staggered: some still lifting while others land
  // the ribbon: from the stubble front-left, up and across, back over to above the forming spot
  vec3 s = bez(uC + vec3(-2.4, -2.35, 2.0), uC + vec3(-4.4, 1.7, -0.8), uC + vec3(3.4, 1.5, 0.6), uC + vec3(0.0, -1.3, -0.1), k);  // it leaves the stubble itself
  float wid = 0.22 + 0.66 * smoothstep(0.0, 0.55, k) * (1.0 - 0.7 * smoothstep(0.7, 1.0, k));  // a patch lifting off the field, full in the middle, gathering at the end
  vec3 j = vec3(fract(aSeed.z * 13.1) + fract(aSeed.y * 3.7), fract(aSeed.z * 7.9) + fract(aSeed.w * 5.1), fract(aSeed.z * 5.3) + fract(aSeed.x * 9.3)) - 1.0;  // denser at the core
  s += j * wid * (1.0 + 1.0 * step(fract(aSeed.z * 31.7), 0.06)) + vec3(0.0, sin(k * 9.0 - t * 1.2 + aSeed.y * 6.28) * 0.06, 0.0);  // a few strays; a slow ripple
  float lift = smoothstep(0.0, 0.14, u), land = smoothstep(0.82, 1.0, u);
  vec3 p = mix(mix(aStart, s, lift), position, land);
  p.y += uLift * (0.15 + 0.85 * fract(aSeed.w * 9.7));  // with the lifted pieces: the trailing straws hang below them
  p.y += (1.0 - lift) * 0.03 * sin(t * 1.5 + aSeed.w * 30.0);
  return p;
}
void main() {
  float u = clamp((uFold - aSeed.x * 0.6) / 0.4, 0.0, 1.0), e = u * u * (3.0 - 2.0 * u), w = 4.0 * e * (1.0 - e);
  mat4 pm = projectionMatrix * modelViewMatrix;
  vec4 c1 = pm * vec4(at(uFold, uT), 1.0), c0 = pm * vec4(at(uFold - 0.02, uT - 0.1), 1.0);
  if (c1.w < 0.05) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }  // at or behind the lens
  gl_Position = c1;
  vNear = smoothstep(5.0, 1.5, c1.w);  // the closest fibres go soft, like a shallow focus
  float r1 = fract(aSeed.w * 13.7 + aSeed.x * 3.1), r2 = fract(aSeed.y * 9.1 + aSeed.w * 2.3), r3 = fract(aSeed.z * 5.9 + aSeed.y * 1.7);
  float body = (0.5 - 0.2 * e + 0.15 * w) * (0.55 + 0.9 * r1) * uFibSize * uScale / c1.w;  // straws of many lengths
  vec2 d = c0.w > 0.0 ? (c1.xy / c1.w - c0.xy / c0.w) * vec2(projectionMatrix[1][1] / projectionMatrix[0][0], 1.0) * uScale / projectionMatrix[1][1] : vec2(0.0);
  float L = min(length(d), 0.018 * uScale), S = max(body, 2.0 * L + 2.0);  // the trail fits behind the centre; capped (each fibre is an S x S quad: fill cost)
  gl_PointSize = S;
  vPx = 1.0 / S; vTh = 0.6 + 0.8 * r2;
  vFC = r3 < 0.5 ? mix(vec3(1.0, 0.68, 0.3), vec3(0.78, 0.56, 0.34), r3 * 2.0) : mix(vec3(0.78, 0.56, 0.34), vec3(0.95, 0.86, 0.64), r3 * 2.0 - 1.0);  // gold, tan, bleached
  vBody = body / S; vTail = L / S; vMot = atan(-d.y, d.x);  // point y runs down
  float tr = step(fract(aSeed.y * 17.3), 0.03);  // a few straws trail the presented pieces
  vec4 wp = modelMatrix * vec4(at(uFold, uT), 1.0);
  vA = uFibA * smoothstep(0.0, 0.05, u) * (0.6 + 0.4 * smoothstep(0.02, 0.25, e)) * (1.0 - 0.75 * smoothstep(0.86, 1.0, u) * (1.0 - tr)) * (0.75 + 0.25 * w) * (1.0 - uSurf * (1.0 - tr * uLiftK)) * (1.0 - uFibOut) * (1.0 - 0.6 * vNear) * (1.0 - 0.55 * step(fract(aSeed.z * 31.7), 0.06));  // near opaque in flight (strays fainter), faint on the ground, gone once the surface fills in
  vShade = (0.7 + 0.45 * fract(aSeed.w * 7.13)) * (0.72 + 0.4 * smoothstep(0.2, 3.0, wp.y));  // darker low by the stubble, brighter up toward the sky
  vAng = aSeed.w * 6.28 + e * 4.0;
}`;
const FIBRE_F = /* glsl */`
uniform vec3 uFibCol; varying float vA, vAng, vMot, vTail, vBody, vShade, vNear, vPx, vTh; varying vec3 vFC;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float ang = vTail > 0.02 ? vMot : vAng;  // in flight a straw lies along its path (no crossing jacks)
  float s = sin(ang), k = cos(ang), th = max(0.04 * vBody * vTh * (1.0 + 1.5 * vNear), 0.6 * vPx);  // thin, but never under a pixel (no jaggies)
  vec2 r = mat2(k, -s, s, k) * c;
  float body = smoothstep(th + vPx, max(th - vPx, 0.0), abs(r.y)) * smoothstep(0.48 * vBody, 0.3 * vBody, abs(r.x));
  s = sin(vMot); k = cos(vMot);
  vec2 m = mat2(k, -s, s, k) * c;  // m.x along the motion; the trail lies behind (m.x < 0)
  float g = clamp(-m.x / max(vTail, 1e-3), 0.0, 1.0);
  float tail = vTail > 0.02 ? (1.0 - g) * (1.0 - g) * step(m.x, 0.0) * step(g, 0.999) * smoothstep(th * 0.9, 0.0, abs(m.y)) : 0.0;
  float a = vA * max(body, tail * 0.5);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vFC * uFibCol.r * vShade * (0.7 + 0.5 * smoothstep(th, -th, r.y)), a);  // lit on top, darker underneath
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

// Windows on a grid per block; one tone per block (its front face z): mostly sodium, some warm white, a few cool
// fluorescent offices; some windows dark.
const CITY = /* glsl */`
uniform float uCity, uWin, uLitF; varying float vA; varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(psize((0.12 + aSeed.y * 0.05) * uWin, mv), uWin);
  float b = fract(sin(position.z * 91.7) * 43758.5453);
  if (aSeed.z > 0.85) b = fract(b + 0.5);  // a few windows in another tone
  float floorLit = fract(sin(floor(position.y / 0.9) * 17.3 + position.z * 7.1) * 43758.5453);  // whole floors on or off
  vA = uCity * step(floorLit < uLitF ? 0.3 : 0.93, aSeed.w) * (0.25 + 0.75 * aSeed.w * aSeed.w) * (1.0 - 0.5 * smoothstep(70.0, 150.0, -mv.z)) * (0.6 + 0.4 * uWin);  // phones: bigger, brighter windows
  vC = (b < 0.62 ? vec3(1.0, 0.58, 0.26) : b < 0.88 ? vec3(1.0, 0.78, 0.55) : vec3(0.7, 0.82, 1.0)) * (0.75 + 0.5 * fract(aSeed.x * 7.3));
  vC *= (fract(floorLit * 7.0) < 0.3 ? vec3(1.0, 0.86, 0.72) : vec3(1.0)) * (0.55 + 0.45 * fract(floorLit * 13.0));  // floors differ in warmth and brightness
}`;
const CITY_F = /* glsl */`
varying float vA; varying vec3 vC;
void main() { vec2 c = abs(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vC, vA * smoothstep(1.0, 0.55, max(c.x, c.y * 0.8))); }`;

// Street bokeh in front of the city: traffic, shop signs and lamps, out of focus; it hides the blocks' bases.
const BOKEH = /* glsl */`
uniform float uCity; varying float vA; varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = psize(0.7 + aSeed.y * 1.6, mv);
  vA = uCity * (0.1 + 0.16 * aSeed.w) * (0.85 + 0.15 * sin(uT * (0.5 + aSeed.x) + aSeed.z * 30.0));
  vC = aSeed.x < 0.55 ? vec3(1.0, 0.58, 0.24) : aSeed.x < 0.8 ? vec3(1.0, 0.82, 0.58) : aSeed.x < 0.93 ? vec3(1.0, 0.28, 0.16) : vec3(0.5, 0.85, 0.8);
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
// Sky: coral away from the sun, gold toward it, mauve, then dusk blue overhead. The broad glow hugs the horizon
// around the sun (kept narrow so the hero heading, left of it, sits on calmer sky); the disc is HDR so it blooms.
const SKY_F = /* glsl */`
uniform vec3 uHorizon, uCoral, uMid, uZenith, uSunDir, uSunCol, uGlow, uCloudCol; uniform float uSunAmt, uDisc, uCity, uCloud, uCityGlow, uSmother, uSmokeSky, uT; varying vec3 vDir;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  float e = max(d.y, 0.0), s = max(dot(d, uSunDir), 0.0);
  float near = pow(max(dot(normalize(d.xz + 1e-5), normalize(uSunDir.xz)), 0.0), 30.0);
  vec3 col = mix(uCoral, uHorizon, near);
  col = mix(col, uMid, smoothstep(0.0, 0.14, e));
  col = mix(col, uZenith, pow(smoothstep(0.04, 0.6, e), 0.75));
  col += uSunCol * uSunAmt * (near * exp(-abs(d.y - uSunDir.y * 0.6) * 16.0) * 0.5 + pow(s, 12.0) * 0.16 + pow(s, 60.0) * 0.4 + pow(s, 900.0) * 1.1);
  // in the smoke: the sun smothered to a dim warm patch low in the haze, and slow billows in the ceiling
  col += vec3(1.0, 0.5, 0.2) * uSmother * (pow(s, 5.0) * 0.18 + pow(s, 40.0) * 0.35);
  float az0 = atan(d.x, -d.z), bill = n2(vec2(az0 * 3.0, e * 9.0 + uT * 0.02)) * 0.6 + n2(vec2(az0 * 8.0, e * 24.0)) * 0.4;
  col *= 1.0 + (bill - 0.5) * 0.4 * uSmokeSky * smoothstep(0.04, 0.3, e);
  // a few thin streaks of cloud: dusky away from the sun, their undersides gold toward it
  float az = atan(d.x, -d.z), band = smoothstep(0.07, 0.12, e) * smoothstep(0.34, 0.2, e);
  float cl = smoothstep(0.5, 0.85, n2(vec2(az * 2.2, e * 26.0)) * 0.7 + n2(vec2(az * 9.0, e * 70.0)) * 0.3) * band * uCloud;
  col = mix(col, uCloudCol + uSunCol * uSunAmt * pow(s, 8.0) * 1.6, cl * 0.75);
  col = mix(col, mix(vec3(2.4, 1.2, 0.42), vec3(5.2, 4.3, 3.2), smoothstep(0.99976, 0.99993, s)) * uDisc, smoothstep(0.99972, 0.99978, s));  // the brightest point: near white, a warm edge
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.006;  // dither: no banding in the long gradient
  col += uGlow * uCityGlow * exp(-e * 28.0) * smoothstep(0.2, 1.0, -d.z);  // the city's warm glow, only low over the skyline
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
}`;

// ---- the world ------------------------------------------------------------------------------
// Ridges: their colour by height, melting into the haze (fog colour) at the base so they meet the far field softly.
const RIDGE_V = /* glsl */`attribute float aTop; varying float vY, vTop; varying vec3 vW;
void main() { vY = position.y; vTop = aTop; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const RIDGE_F = /* glsl */`
uniform vec3 uCol, uHaze, uSunDir, uSunCol; uniform float uTop; varying float vY, vTop; varying vec3 vW;
${NOISE}
void main() {
  vec3 c = mix(uHaze, uCol, pow(smoothstep(-2.0, uTop, vY), 0.6));
  c *= 0.9 + 0.2 * n2(vec2(vW.x * 0.12, vY * 0.5)) * smoothstep(-2.0, vTop, vY);  // forest and folds on the slopes
  float toward = max(dot(normalize(vW - cameraPosition), uSunDir), 0.0);
  float crest = smoothstep(vTop - 3.0, vTop, vY);
  c += uSunCol * crest * crest * 0.4 * pow(toward, 8.0);  // a soft glow on the crests toward the sun, no outline
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
}`;

// Tree line: lumpy crowns (each instance its own lobes), dark and backlit: rims and tops catch the low light on the
// sun side, the farther trees fade into the haze, low mist at their feet.
const TREE_V = /* glsl */`
varying vec3 vN, vW; varying float vZ;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec3 c = m[3].xyz, p = position;
  float id = fract(sin(dot(c.xz, vec2(12.9898, 78.233))) * 43758.5453);
#ifdef PALM
  float az = atan(p.z, p.x);
  p.xz *= 0.25 + 0.95 * pow(abs(sin(az * 4.5 + id * 6.0)), 4.0);  // a star of fronds
  p.y = p.y * 0.35 - 0.45 * dot(p.xz, p.xz);  // drooping
#else
  p *= 1.0 + 0.24 * sin(p.x * 3.1 + id * 20.0) * sin(p.y * 2.6 + id * 11.0) + 0.14 * sin(p.z * 4.3 + id * 7.0) + 0.06 * sin(p.x * 9.0 + p.y * 7.0 + id * 40.0);  // lobes and leafy clumps
#endif
  vec4 w = m * vec4(p, 1.0);
  vW = w.xyz; vN = normalize(mat3(m) * normal); vZ = c.z;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const TREE_F = /* glsl */`
uniform vec3 uHaze, uDark, uSunDir, uSunCol; uniform float uSmoke; varying vec3 vN, vW; varying float vZ;
${NOISE}
void main() {
  float far = smoothstep(-60.0, -82.0, vZ);
  vec3 c = mix(uDark, uHaze, 0.12 + 0.55 * far) * (0.8 + 0.35 * n2(vW.xy * 2.2 + vZ)), v = normalize(cameraPosition - vW);  // foliage, not stone
  float rim = pow(1.0 - max(dot(vN, v), 0.0), 4.0) * smoothstep(0.2, 0.8, vN.y);  // only the upper edges of the crowns
  float toward = pow(max(dot(-v, uSunDir), 0.0), 16.0);
  c += uSunCol * rim * (0.05 + 0.9 * toward) * (1.0 - 0.6 * far);
  c = mix(c, uHaze, smoothstep(1.8, -0.3, vW.y) * 0.75);  // low ground mist
  gl_FragColor = vec4(mix(c, uHaze, uSmoke), 1.0);
  #include <tonemapping_fragment>
}`;

// Field ground under the blades: furrows between the harvest rows (long shadows toward the low sun), a black
// smouldering strip behind each fire front and a warm glow on the stubble just ahead of it.
const GROUND_FX = /* glsl */`
  if (uCityGround < 0.99) {
    float rw = abs(fract(vWP.x / 0.3) - 0.5) * 2.0, fade = 1.0 - smoothstep(0.15, 0.5, fwidth(vWP.x / 0.3));
    gl_FragColor.rgb *= 1.0 - uRows * (1.0 - rw) * fade * (1.0 - uCityGround);
    float burnt = 0.0, ahead = 0.0, smoulder = 0.0, rim = 0.0;
    if (uChar + uFireAmt > 0.001) for (int i = 0; i < 5; i++) {  // only while the fields burn
      vec2 a = uFires[i].xy, ab = uFires[i].zw - a;
      float L = length(ab), k = dot(vWP.xz - a, ab) / (L * L), e = min(k, 1.0 - k) * L;
      float sd = dot(vWP.xz - a, vec2(-ab.y, ab.x) / L) + (n2(vWP.xz * 0.9) - 0.5) * 1.2;
      float sd0 = dot(vWP.xz - a, vec2(-ab.y, ab.x) / L) + (n2(vWP.xz * 4.0) - 0.5) * 0.16, inside = smoothstep(-0.6, 0.4, e);
      float b = smoothstep(-0.9, 0.3, e) * smoothstep(-5.6, -4.2, sd) * smoothstep(0.15, -0.35, sd0);
      burnt = max(burnt, b); smoulder = max(smoulder, b * smoothstep(-1.6, -0.3, sd0) * n2(vWP.xz * 3.0 + uT * 0.3));
      rim = max(rim, inside * exp(-abs(sd0 + 0.05) * 10.0));
      ahead += inside * smoothstep(-0.3, 0.0, sd0) * exp(-max(sd0, 0.0) * 0.8);
    }
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.018, 0.016, 0.015) + vec3(0.8, 0.15, 0.02) * uFireAmt * smoulder, uChar * burnt * 0.96);
    gl_FragColor.rgb += vec3(1.0, 0.42, 0.12) * uFireAmt * min(ahead, 1.2) * 0.9 + vec3(1.0, 0.6, 0.2) * uFireAmt * rim * 2.2;  // lit stubble ahead; a hot rim on the line
  }
`;

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
    const c = Math.cos(OBJ[0].rot), s = Math.sin(OBJ[0].rot); p = [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];  // as rotation.y
  } else if (o === 1) { const y = r() < 0.35 ? 0.4 : 0.4 * r() ** 0.7, rr = bowlR(y); p = [Math.cos(a) * rr, y, Math.sin(a) * rr]; }
  else if (r() < 0.3) { const rr = r() < 0.6 ? 0.34 : Math.sqrt(r()) * 0.34; p = [Math.cos(a) * rr, 0.78, Math.sin(a) * rr]; }
  else { const y = 0.75 * r(), rr = cupR(y); p = [Math.cos(a) * rr, y, Math.sin(a) * rr]; }
  return p.map((v, i) => v * FOLD_S + OBJ[o].at[i]);
}

const col = (r, g, b) => new THREE.Color(r, g, b);

// Moulded straw pulp: soft mottling, a fine pressed grain and darker fibre flecks, from value noise in object space.
const PULP = /* glsl */`
varying vec3 vObjP;
float ph(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float pn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ph(i), ph(i + vec3(1, 0, 0)), f.x), mix(ph(i + vec3(0, 1, 0)), ph(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(ph(i + vec3(0, 0, 1)), ph(i + vec3(1, 0, 1)), f.x), mix(ph(i + vec3(0, 1, 1)), ph(i + 1.0), f.x), f.y), f.z); }
`;
function pulp(mat, rim) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uRim = rim;
    s.fragmentShader = 'uniform vec3 uRim;\n' + s.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uRim * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);');  // soft warm rim
    s.vertexShader = 'varying vec3 vObjP;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjP = position;');
    s.fragmentShader = PULP + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float mot = pn(vObjP * 9.0) * 0.5 + pn(vObjP * 24.0) * 0.3 + pn(vObjP * vec3(80.0, 240.0, 80.0)) * 0.2;
      diffuseColor.rgb *= 0.8 + 0.36 * mot;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.58, 0.42, 0.22), smoothstep(0.78, 0.9, pn(vObjP * 150.0 + 3.1)) * 0.35);`);
  };
  return mat;
}

// Adds an object-space position varying and a colour snippet (tiles, wood grain) to a built-in material.
function pattern(mat, glsl) {
  mat.onBeforeCompile = (s) => {
    s.vertexShader = 'varying vec3 vTP;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTP = position;');
    s.fragmentShader = 'varying vec3 vTP;\n' + s.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + glsl);
  };
  mat.customProgramCacheKey = () => glsl;  // same onBeforeCompile source, different pattern: keep the programs apart
  return mat;
}

export function start(canvas, tier = TIER) {
  THREE.ColorManagement.enabled = false;             // colours below are written as they should look
  // MSAA is fixed when the context is made, so a High start keeps it after a step down to low.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier.msaa && !VIDEO, powerPreference: 'high-performance' });
  try {
    let cur = build(canvas, renderer, tier);
    const film = {
      renderer, tier,
      render: (p, t) => cur.render(p, t), resize: (force) => cur.resize(force), attachPost: (m) => { if (film.tier.post) cur.attachPost(m); },  // a late import must not attach after a step down
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = tier.post ? POST_EXPOSURE : LOW_EXPOSURE;
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
    const t = new THREE.DataTexture(a, N, N); t.needsUpdate = true; return t;
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
      const c = lo + (y - lo) * (0.55 + 0.45 * Math.sin(i * 0.045 + ph) * Math.sin(i * 0.017 + ph * 2)) + (r() - 0.5) * 0.8;  // big massifs and saddles, not one even saw
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
    const gm = lambert(0xffffff, { vertexColors: true, flatShading: true, fog: false });  // own haze below: on Low three fogs after tone mapping (a dark band under the ridges)
    gm.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, { uCityGround: U.uCityGround, uDrop: U.uDrop, uHaze: { value: scene.fog.color }, uFires: bladeU.uFires, uChar: bladeU.uChar, uFireAmt: bladeU.uFireAmt, uRows: bladeU.uRows, uT: U.uT });
      s.vertexShader = 'attribute vec3 aField; uniform float uCityGround, uDrop; varying float vGH; varying vec3 vWP;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y -= uDrop * 12.0 * (1.0 - smoothstep(-50.0, -46.0, transformed.z));\nvWP = transformed;').replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = mix(aField, vColor.rgb, uCityGround);')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvGH = mix(min(0.95, smoothstep(8.0, 46.0, -mvPosition.z) * 0.55 + smoothstep(36.0, 80.0, -mvPosition.z) * 0.4 + smoothstep(-26.0, -40.0, transformed.z) * 0.45), smoothstep(2.0, 32.0, -mvPosition.z) * 0.92, uCityGround);');
      // the bare ground past the blades fades to the same haze as the far blades
      s.fragmentShader = 'varying float vGH; varying vec3 vWP; uniform vec3 uHaze; uniform vec4 uFires[5]; uniform float uChar, uFireAmt, uRows, uCityGround, uT;\n' + NOISE + s.fragmentShader.replace('#include <tonemapping_fragment>', GROUND_FX + 'gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, vGH);\n#include <tonemapping_fragment>');  // before tone mapping, like the ridges and blades
    };
    mesh(g, gm);
  }

  // Field: thin tapered straw blades, BLADES x density, placed from rng(3); sway and light are in BLADE_V.
  {
    const count = small ? 18000 : n(BLADES), r = rng(3), d = new THREE.Object3D();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.24, 0.55, 0, 0.24, 0.55, 0, 0, 1, 0], 3));  // thin, tapering
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
      } else { lie = true; h = 0.3 + r() * 0.45; wd = (small ? 0.045 : 0.025) + r() * 0.02; tilt = Math.PI / 2 - 0.12 + (r() - 0.5) * 0.2; }  // loose straw lying between the rows
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
    for (let i = 0; i < 32; i++) palms.push([(r() - 0.5) * 230, -56 - r() * 10, 3.6 + r() * 2.2]);  // a few sugar palms over the canopy, at the trees' scale
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
    const hut = new THREE.Group(), wood = lambert(0x24170e), thatch = lambert(0x2a1c10, { flatShading: true });  // backlit: dark, the rim does the work
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
    mesh(new THREE.PlaneGeometry(3.6, 3.0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shadowTex, transparent: true, opacity: 0.55, depthWrite: false }), 0, 0.04, 0, hut);  // its shade on the ground
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
    for (const [x, y, z] of [[-1.02, -0.68, -1.3], [1.05, -0.72, -1.3]]) mesh(new THREE.PlaneGeometry(0.75, 0.7), mat, x, y, z, g);  // in camera space: they ride in the corners
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
      [[-0.32, 1.25, 0.45], [0, 1.0, 0.7], [0.22, 0.7, 0.85]].forEach(([off, hs, b], k) => {  // three strips: taller and dimmer behind, short and hot in front
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
  const smoke = points(smokeN, 7, (r) => { const c = COLS[Math.floor(r() * COLS.length)]; return [c[0] + (r() - 0.5) * 1.6, 0, c[2] + (r() - 0.5) * 0.4]; }, SMOKE, SMOKE_F, THREE.NormalBlending);  // the foot sits on the fire line

  // Straw fibres: scattered on the field (rng(1)), swirl up, fold into the box, bowl and cup
  const fibreN = small ? 1500 : Math.round(3000 * tier.density ** 0.25);  // High 5,300; Ultra 7,000: few enough that single straws read
  const fibres = points(fibreN, 8, (r) => sampleSurface(r), FIBRE, FIBRE_F, THREE.NormalBlending);
  fibres.renderOrder = 1;                             // after the packaging, so its surface hides only the fibres behind it
  {
    const r = rng(1), cnt = fibres.geometry.attributes.position.count, s = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) { const x = C[0] - 2.4 + (r() + r() + r() - 1.5) * 2.0, z = C[2] + 2.0 + (r() + r() + r() - 1.5) * 1.8; s.set([x, groundH(x, z) + 0.05, z], i * 3); }  // a soft patch where the ribbon leaves the stubble
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
  bowlGeo.setAttribute('color', new THREE.BufferAttribute(Float32Array.from({ length: bp.count * 3 }, (_, i) => {  // floor darkens softly toward the centre
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
    for (let i = 0; i < 50; i++) { const s = r() < 0.5 ? -1 : 1; blds.push([s * (30 + r() * 75), -75 - r() * 35, 3 + r() * 4, 3 + r() * 3, 2 + r() * 5]); }  // nearer, lower, off the avenue and clear of the frame edge
    for (let i = 0; i < 24; i++) { const s = r() < 0.5 ? -1 : 1; blds.push([s * (3 + r() * 24), -92 - r() * 28, 3 + r() * 3, 3 + r() * 2, 4 + r() * 6]); }  // mid blocks behind the table: a phone's narrow view sees lit windows, not an empty avenue
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0x05060c }), blds.length);  // near-black silhouettes; scene fog: farther blocks are hazier
    blds.forEach(([x, z, w, dd, h], i) => { d.position.set(x, 0, z); d.scale.set(w, h, dd); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    city.add(im);
    const signs = blds.filter((b, i) => b[4] > 7 && i % 9 === 0), SIGN = [[1.4, 0.75, 0.3], [1.2, 0.5, 0.25], [1.1, 0.9, 0.6], [1.3, 1.0, 0.7]];  // warm, not neon  // rooftop signs
    const sm = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), signs.length);
    signs.forEach(([x, z, w, dd, h], i) => { d.position.set(x, h + 0.6, z + dd / 2 + 0.1); d.scale.set(w * 0.7, 0.8, 1); d.updateMatrix(); sm.setMatrixAt(i, d.matrix); sm.setColorAt(i, new THREE.Color(...SIGN[i % 4])); });
    city.add(sm);
    // windows by height (tall blocks get more), snapped to a floor and column grid; about one floor in five is dark
    return (rr) => {
      let b; do b = blds[Math.floor(rr() * blds.length)]; while (rr() * 15 > b[4] + 4);  // tall blocks get more, the low near ones still read lit
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
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2a20, emissive: 0x120a06, roughness: 0.55, metalness: 0, transparent: true });  // plain: the grain read as stripes; the Blender table brings its own
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
    pos.push(CANDLE[0], CANDLE[1] + 0.14, CANDLE[2], CANDLE[0], CANDLE[1] + 0.14, CANDLE[2]); sd.push(0.5, 0.05, 3, 0, 0.5, 0.7, 5, 1); cl.push(1, 0.7, 0.35, 0.5, 0.26, 0.1);  // candle flame and its halo
    for (let i = 0; i < 14; i++) { const k = i / 13; pos.push(-3.6 + 7.2 * k, 2.85 - Math.sin(k * Math.PI) * 0.35, TABLE[2] - 2.5 + 3 * k); sd.push(0.5, 0.15, i, 0.3); cl.push(1, 0.62, 0.3); }  // tight warm points with a small halo
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 4)); g.setAttribute('aCol', new THREE.Float32BufferAttribute(cl, 3));
    const m = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: HEAD + GLOW, fragmentShader: GLOW_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.frustumCulled = false; scene.add(m);
  }

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x4a3222, 1); scene.add(hemi);  // a warm ground bounce: undersides are not black
  const sun = new THREE.DirectionalLight(0xffffff, 1); scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8090c0, 0.25); fill.position.set(0, 10, 30); scene.add(fill);
  const fireLight = new THREE.PointLight(0xff6a20, 0, 18, 1.5); fireLight.position.set(4, 1.5, -15); scene.add(fireLight);  // the fires light the hut and the stubble around them
  const packLight = new THREE.PointLight(0xffb070, 0, 9, 1); packLight.position.set(C[0] + 2.6, 1.8, C[2] + 0.6); scene.add(packLight);  // warm key from the sun side; the cool fill comes from the sky
  const cafeLight = new THREE.PointLight(0xffb060, 0, 6, 2); cafeLight.position.set(0, 2.8, TABLE[2]); scene.add(cafeLight);  // a warm overhead pool; the floor falls into darkness beyond it
  // a warm pool on the table from the bulb overhead; it falls off to the deck
  const candle = new THREE.PointLight(0xffa04a, 0, 4, 1.4); candle.position.set(CANDLE[0], CANDLE[1] + 0.2, CANDLE[2]); scene.add(candle);
  const tableSpot = new THREE.SpotLight(0xffd2a4, 0, 7, 0.42, 1, 1); tableSpot.position.set(0.3, 2.8, TABLE[2] + 0.2);  // the table only, not the floor by the lens
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

    const red = smooth(0.95, 0.78, P.sun) * sunW, glow = (1 - sunW) * smooth(0.42, 0.55, q) * (1 - smooth(0.68, 0.9, q));  // afterglow once the smoke clears
    horizon.lerpColors(H_DUSK, H_WARM, sunW).lerp(H_RED, 0.55 * red).lerp(H_NIGHT, night).lerp(SMOKE_HZ, P.smoke * 0.7).lerp(CITYGLOW, P.city * 0.06);
    zenith.lerpColors(Z_DUSK, Z_WARM, sunW * sunW).lerp(Z_NIGHT, night).lerp(SMOKE_CEIL, P.smoke * 0.85);  // the smoke closes the sky
    coral.lerpColors(H_DUSK, CORAL, sunW).lerp(H_RED, 0.4 * red).lerp(H_NIGHT, night).lerp(SMOKE_HZ, P.smoke * 0.7);
    mid.lerpColors(zenith, MID_WARM, sunW * (1 - P.smoke * 0.8));
    skyU.uHorizon.value.copy(horizon); skyU.uCoral.value.copy(coral); skyU.uMid.value.copy(mid); skyU.uZenith.value.copy(zenith);
    // Low behind the hut (its azimuth), just above the ridges at the hero, setting into them by p 0.35; blooms while sun > 0.2.
    sunDir.set(0.38, -0.04 + 0.2 * P.sun ** 4, -1).normalize();  // touching the hills by p 0.2
    skyU.uSunDir.value.copy(sunDir); skyU.uSunAmt.value = sunW * (1 - P.smoke * 0.85); U.uSunDirW.value.copy(sunDir);
    skyU.uDisc.value = smooth(0.68, 0.8, P.sun) * (1 - P.smoke);  // fades in the haze as it sets: no half-dome on the ridge
    skyU.uSmother.value = 0.8 * P.smoke * (1 - P.city); skyU.uSmokeSky.value = P.smoke; skyU.uT.value = t;
    skyU.uCloud.value = (1 - smooth(0.25, 0.34, q)) * (1 - P.smoke); skyU.uCloudCol.value.copy(CLOUD).lerp(zenith, 0.3); skyU.uCityGlow.value = 0.6 * P.city;
    skyU.uSunCol.value.setRGB(1, 0.62, 0.3).lerp(H_RED, 0.5 * red);
    scene.fog.color.copy(horizon).lerp(Z_NIGHT, 0.35).lerp(CITY_FOG, 0.85 * P.city);  // night over the city is blue-violet, not smog
    scene.fog.far = (90 + 50 * smooth(0.6, 0.8, q)) * (1 - 0.35 * P.smoke) + 80 * P.city;  // thicker haze in the smoke; distant blocks lighten in the night haze
    // aerial perspective: each farther ridge paler and bluer, all melting into the haze at their base and catching the
    // sun on their crests; they sink away before the city (Bangkok is flat)
    ridges.forEach((m, i) => {
      const u = m.material.uniforms;
      u.uCol.value.copy(horizon).lerp(Z_NIGHT, 0.5 - 0.13 * i).lerp(zenith, 0.1 * i).lerp(scene.fog.color, 0.75 * P.smoke);  // nearly lost in the smoke
      u.uHaze.value.copy(scene.fog.color); u.uSunDir.value.copy(sunDir);
      u.uSunCol.value.copy(skyU.uSunCol.value).multiplyScalar(sunW * (1 - P.smoke) + 0.4 * glow);
      m.position.y = -45 * smooth(0.74, 0.95, q);
    });
    trees.position.y = -14 * smooth(0.72, 0.86, q); U.uDrop.value = smooth(0.72, 0.85, q);
    treeU.uHaze.value.copy(scene.fog.color); treeU.uDark.value.copy(scene.fog.color).lerp(TREE_DARK, 0.82); treeU.uSunDir.value.copy(sunDir);
    treeU.uSunCol.value.copy(skyU.uSunCol.value).multiplyScalar(sunW * (1 - P.smoke) + 0.5 * glow); treeU.uSmoke.value = 0.55 * P.smoke;  // the tree line stays as faint grey shapes

    const cool = smooth(0.42, 0.56, q) * (1 - sunW) * (1 - P.city);  // the clearing air after the smoke: blue-violet shade, warm only on the tips
    hemi.color.copy(horizon).lerp(zenith, 0.35).lerp(MOON, 0.35 * (1 - sunW) + 0.3 * cool); hemi.intensity = 0.85 + 0.35 * sunW + 0.15 * glow + 0.25 * cool;  // shadows never go to mud
    sun.position.copy(sunDir).multiplyScalar(50); sun.color.copy(H_WARM).lerp(H_RED, 0.5 * red).lerp(AFTER, glow);
    sun.intensity = 1.4 * sunW + 0.9 * glow;  // the afterglow keeps raking the stubble tips after sunset
    fill.color.lerpColors(MOON, WARM_FILL, sunW); fill.intensity = (0.04 * sunW + 0.7 * (1 - sunW)) * (1 - 0.8 * P.city);  // no front light into the low sun; none on the cafe floor
    fireLight.intensity = 9 * P.fire; cafeLight.intensity = 5 * P.city; tableSpot.intensity = 1.2 * P.city; candle.intensity = 1.6 * P.city;
    bladeU.uSunDir.value.copy(sunDir); bladeU.uSunCol.value.copy(sun.color).multiplyScalar(sun.intensity / Math.PI);
    bladeU.uAmb.value.copy(horizon).lerp(zenith, 0.35).lerp(MOON, 0.2 * (1 - sunW)).multiplyScalar(hemi.intensity * (1 + 0.5 * cool) / Math.PI).add(tc.copy(fill.color).multiplyScalar(fill.intensity * 0.3 / Math.PI));  // no lavender: the blade shader cools only the shade
    bladeU.uFireAmt.value = 0.9 * P.fire; U.uCityGround.value = smooth(0.6, 0.8, q);
    bladeU.uChar.value = smooth(0.24, 0.34, q) * (1 - smooth(0.5, 0.6, q)); bladeU.uCool.value = cool; bladeU.uRows.value = 0.6 * sunW + 0.25 * glow; bladeU.uRimK.value = (post ? 1.7 : 1) * (small ? 0.5 : 1);
    // the hut casts a long shadow toward the camera from the low sun (blades and ground)
    const shx = -sunDir.x, shz = -sunDir.z, shn = Math.hypot(shx, shz), shL = Math.min(30, 2.8 / Math.max(sunDir.y, 0.09)), shA = 0.6 * sunW * (1 - P.smoke);
    bladeU.uHutSh.value.set(HUT[0], HUT[2], shx / shn, shz / shn); bladeU.uHutL.value.set(shA > 0.01 ? shL : 0.001, 1.4);
    hutShadow.position.set(HUT[0] + shx / shn * shL * 0.45, 0.05, HUT[2] + shz / shn * shL * 0.45); hutShadow.rotation.y = Math.atan2(shx, shz); hutShadow.scale.set(2.8, 1, shL); hutShadow.material.opacity = shA; hutShadow.visible = shA > 0.01;
    tufts.g.visible = camera.aspect >= 1 && q < 0.25; tufts.mat.uniforms.uA.value = 1 - smooth(0.1, 0.22, q); tufts.mat.uniforms.uRim.value.copy(sun.color).multiplyScalar(0.9 * sunW);

    U.uT.value = t;
    U.uDust.value = (1 - smooth(0.45, 0.6, q)) * (1 - 0.6 * P.smoke);
    U.uFire.value = P.fire; U.uS.value = Math.max(P.smoke, 0.5 * P.fire); U.uEmber.value = Math.max(P.fire, 0.5 * P.smoke);
    U.uClear.value = P.clear; U.uHot.value = post ? 2.5 : 1;  // HDR only where bloom and ACES can take it
    U.uSmokeHigh.value.copy(SMOKE_DARK).multiplyScalar(0.6).lerp(zenith, 0.35); U.uSmokeLow.value.lerpColors(SMOKE_DARK, SMOKE_LIT, 0.55 * P.fire);  // the ceiling: heavy grey-brown
    U.uSmokeFire.value.copy(SMOKE_LIT).multiplyScalar(3.6 * P.fire);  // the flames light the column bases
    U.uFibCol.value.setRGB(1, 0.68, 0.3).multiplyScalar(post ? 1.05 : 1);  // just at the bloom edge: dense stretches glow, no blow-out
    U.uFold.value = P.fold; U.uFibA.value = smooth(0.42, 0.52, q) * (small ? 1 : Math.min(1, 0.75 * (fibreN / 3000) ** -0.2)); U.uSurf.value = smooth(0.85, 1, P.fold); U.uFibOut.value = smooth(0.72, 0.77, q);
    U.uLantern.value = (0.15 + 0.85 * (1 - sunW)) * (1 - smooth(0.6, 0.75, q));  // barely there in daylight: no orange halo over the backlit hut
    hutWin.material.color.setRGB(1.1, 0.5, 0.16).multiplyScalar(U.uLantern.value * (0.3 + 0.7 * (1 - sunW)));  // after uLantern: nothing may read the last frame; faint by day
    hutRim.value.copy(sun.color).multiplyScalar(0.9 * sunW * (1 - P.smoke) + 0.3 * glow + 0.6 * P.fire);  // rim lit from behind (and by the fires)
    U.uBulbs.value = P.city; U.uCity.value = P.city;
    U.uStars.value = Math.max(0.35 * smooth(0.45, 0.65, q) * P.clear, P.city);  // first stars at dusk, all of them as the city rises
    flames.visible = embers.visible = P.fire > 0.001 || P.smoke > 0.001; fronts.visible = P.fire > 0.001;
    smoke.visible = U.uS.value > 0.001; fibres.visible = U.uFibA.value > 0.001 && U.uFibOut.value < 1;

    const form = smooth(0.8, 1, P.fold), liftK = smooth(0.62, 0.72, q) * form, lift = 0.42 * liftK;
    U.uLift.value = lift; U.uLiftK.value = liftK;
    // halo trimmed to half: it sat behind the caption text
    U.uHalo.value = 0.35 * form * (1 - smooth(0.72, 0.8, q)); packLight.intensity = (1.2 * smooth(0.1, 0.6, P.fold) + 2.2 * form) * (1 - P.city);
    bladeU.uPack.value = form * (1 - P.fly) * 0.6; bladeU.uPackPos.value.set(C[0], 0.4, C[2] + 0.1);
    U.uRim.value.setRGB(1, 0.6, 0.3).multiplyScalar(0.6 * form * (1 - 0.8 * P.city));  // the afterglow behind them rims the pulp
    packMats.forEach((m) => { m.opacity = U.uSurf.value; });  // the pulp surface fills in over the settled outline
    pack.forEach((g, i) => {
      const o = OBJ[i], e = clamp01((P.fly - i * 0.08) / 0.84) ** 2.2;  // slow start keeps them just ahead of the camera
      const end = v.set(TABLE[0] + o.land[0], TABLE[1], TABLE[2] + o.land[2]), mid = (a, b) => (a + b) / 2;
      const m = [mid(o.at[0], end.x), mid(o.at[1], end.y) + 4, mid(o.at[2], end.z)];
      const b = (k) => (1 - e) ** 2 * o.at[k] + 2 * e * (1 - e) * m[k] + e * e * end.getComponent(k);
      U.uFA.value[i].set(...o.at); U.uFM.value[i].set(...m); U.uFE.value[i].copy(end); U.uFP.value.setComponent(i, e);
      g.position.set(b(0), b(1) + lift * (1 - e) + 0.05 * Math.sin(t * 1.2 + i * 2) * (1 - e) * (1 - form), b(2));  // presented just above the stubble once formed
      g.rotation.set(Math.sin(e * Math.PI) * 0.5, o.rot + (1 - e) * (i % 2 ? -6.28 : 6.28), 0);
      g.scale.setScalar(FOLD_S + (0.62 - FOLD_S) * e);  // 0.62 on the table, as before
      g.visible = form > 0.001;
      bladeU.uObj.value[i].set(g.position.x, g.position.y, g.position.z, form * (1 - smooth(0, 0.15, e)));  // contact shadow while it rests
      const sh = shadows[i]; sh.material.opacity = 0.85 * U.uSurf.value * (1 - smooth(0, 0.1, e)) * (1 - 0.3 * liftK);
      sh.position.y = (o.at[1] + 0.03 - g.position.y) / g.scale.y; sh.scale.setScalar(1 + 0.5 * liftK);  // the soft shadow stays on the stubble
    });
    trails.visible = P.fly > 0 && P.fly < 1;
    city.visible = P.city > 0.001; city.position.y = -12 - ((1 - P.city) ** 2) * 16;  // below the terrace: it falls away past the railing
    cafe.visible = P.city > 0.001; cafeMats.forEach((m) => { m.opacity = P.city; });

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
  const probe = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
  const webgl = !!probe;
  probe?.getExtension('WEBGL_lose_context')?.loseContext();  // free the probe's context at once
  const motion = matchMedia('(prefers-reduced-motion: reduce)'), reducedMotion = motion.matches;
  if (!canvas || !webgl || reducedMotion || root.classList.contains('no-film') || FLAGS.mode === 'off') return fallback();

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
  const measure = () => {
    const H = innerHeight, gap = Math.max(48, 0.08 * H);
    let x = 0; pts = [[0, 0.05]];
    caps.forEach((c, i) => { x = Math.max(x + 1, docTop(c) + c.offsetHeight - (H - gap)); pts.push([x, CAPTION_P[i]]); });
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
    film.render(clamp01(s / 20), s); tick(s);
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
    const dt = last ? now - last : 16; last = now;
    shown += (target() - shown) * (1 - Math.exp(-dt / 120));  // a little damping on wheel steps
    const t = (now - t0) / 1000;
    film.render(shown, t); tick(t);
    if (VIDEO || BENCH) return;
    if (frameMs.length < 30 && ++frames > 5) {                  // skip shader-compile frames, then judge 30
      frameMs.push(dt);
      if (frameMs.length === 30) { if (shouldUse3D({ webgl, reducedMotion, frameMs })) root.classList.add('film'); else { degrade(); frameMs.length = 0; } }
    } else if (frameMs.length >= 30) {                // keep watching: the smoke beat is the heaviest
      frameMs.push(dt); if (frameMs.length > 90) frameMs.shift();
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
  window.scFilm = { get tier() { return film.tier.name; }, ...(VIDEO || BENCH ? { _degrade: degrade, _memory: () => ({ ...film.renderer.info.memory }) } : {}),  // console hooks for the step-down check, not on real visits
     scrollFor: (p) => through(pts.map(([a, b]) => [b, a]), p),  // the scroll that shows p (captures)
     render: (p, t) => { manual = true; cancelAnimationFrame(raf); film.render(p, t); tick(t); } };
  if (VIDEO || BENCH) root.classList.add('film');
  if (BENCH) raf = requestAnimationFrame(benchFrame);
  else if (VIDEO) {
    if (FLAGS.p !== null || FLAGS.t !== null) { window.scFilm.render(FLAGS.p ?? 0, FLAGS.t ?? 0); root.dataset.filmReady = '1'; }
  } else raf = requestAnimationFrame(frame);
}
boot();
