// Home scroll film: one Three.js scene drawn only from params(p, t) (timeline.js), so any frame can be
// rendered again exactly. The page passes scroll and the clock; video tools call window.scFilm.render(p, t).
// Falls back to the still images (html.no-film) when WebGL, speed, the CDN or reduced motion say so.
import { params, rng, counter, shouldUse3D, tooSlow } from './timeline.js';
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

// Flames: tongues along each fire line. Height per spot and per particle flicker are layered sines of t, so a
// fixed (p, t) gives the same fire. uHot lifts the colour above the bloom threshold when post is on.
const FLAME = /* glsl */`
uniform float uFire, uFlameA, uHot; varying float vA; varying vec3 vC;
void main() {
  float life = fract(aSeed.w + uT * (0.9 + aSeed.x * 0.8));
  vec3 p = position;
  float tongue = 0.5 + 0.5 * sin(p.x * 4.3 + p.z * 3.1 + uT * 2.3) * sin(p.x * 1.7 - p.z * 1.3 - uT * 3.9);
  p.y += 0.12 + life * (0.3 + (0.3 + 1.8 * tongue) * aSeed.y) * uFire;  // base just above the stubble, or the blades hide it
  p.x += sin(uT * 4.0 + aSeed.z * 20.0 + life * 5.0) * 0.1 * life + life * life * 0.35;  // licks, leaning with the wind
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = psize((0.42 - 0.3 * life) * (0.5 + 0.5 * uFire), mv);
  float flick = 0.72 + 0.16 * sin(uT * 13.0 + aSeed.x * 50.0) + 0.12 * sin(uT * 29.0 + aSeed.y * 70.0);
  vA = uFire * uFlameA * pow(1.0 - life, 1.3) * smoothstep(0.0, 0.06, life) * flick * (0.45 + 0.75 * tongue);
  vC = mix(mix(vec3(1.0, 0.72, 0.38), vec3(1.0, 0.42, 0.08), smoothstep(0.05, 0.4, life)), vec3(0.55, 0.1, 0.02), smoothstep(0.45, 0.9, life)) * uHot;
}`;

// Embers: sparks that leave the fire lines, rise and drift downwind on t; as the air clears they sink back.
const EMBER = /* glsl */`
uniform float uEmber, uClear, uHot; varying float vA; varying vec3 vC;
void main() {
  float life = fract(aSeed.w + uT * (0.05 + aSeed.x * 0.07));
  vec3 p = position;
  p.y += 0.2 + life * (2.0 + aSeed.y * aSeed.y * 9.0) * (1.0 - 0.85 * uClear);
  p.x += life * (1.5 + aSeed.z * 3.0) + sin(uT * (0.6 + aSeed.x) + aSeed.z * 6.28) * (0.15 + life);
  p.z += cos(uT * 0.5 + aSeed.y * 6.28) * life * 1.2;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(psize(0.06 + aSeed.y * 0.06, mv), 1.5);
  float flick = 0.55 + 0.45 * sin(uT * (5.0 + aSeed.x * 7.0) + aSeed.z * 40.0);
  vA = uEmber * smoothstep(0.0, 0.05, life) * (1.0 - life) * (1.0 - life) * flick * (0.3 + 0.9 * pow(fract(aSeed.x * 13.7), 2.0));  // a few bright sparks
  vC = mix(vec3(1.0, 0.72, 0.32), vec3(1.0, 0.32, 0.06), life) * uHot;
}`;

// Straw blades (InstancedMesh, local blade 0..1 tall): wind bend from a rolling gust and a per-blade flutter, both
// pure in t and position. Lit by the sun (backlit tips glow), the fire lines, the packaging glow; haze far away.
const BLADE_V = /* glsl */`
uniform float uT, uFireAmt, uPack; uniform vec3 uSunDir, uSunCol, uAmb, uPackPos; uniform vec4 uFires[5];
varying vec3 vCol; varying float vHaze;
#include <fog_pars_vertex>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec3 base = m[3].xyz, w = (m * vec4(position, 1.0)).xyz;
  float h = position.y, H = length(m[1].xyz), s = hash(base.xz), s2 = hash(base.zx + 7.0);
  float gust = 0.5 + 0.5 * sin(uT * 0.9 - base.x * 0.18 + base.z * 0.11);
  float sway = (0.08 + 0.26 * gust) + 0.07 * sin(uT * 3.1 + s * 6.28 + base.x * 0.7);
  w.x += h * h * H * sway; w.z -= h * h * H * sway * 0.3; w.y -= h * h * H * sway * sway * 0.5;
  vec3 n = normalize(mat3(m) * vec3(0.0, 0.0, 1.0)), v = normalize(cameraPosition - w);
  float diff = 0.35 + 0.65 * abs(dot(n, uSunDir)), back = pow(max(dot(-v, uSunDir), 0.0), 4.0);
  vec3 straw = mix(vec3(0.4, 0.25, 0.12), vec3(0.98, 0.72, 0.36), s) * (0.85 + 0.3 * s2);
  vec3 light = uAmb * (0.35 + 0.65 * h) + uSunCol * (0.25 + 0.75 * h) * (diff * 0.75 + back * h * 2.6);
  float fg = 0.0;
  for (int i = 0; i < 5; i++) {
    vec2 a = uFires[i].xy, b = uFires[i].zw, ab = b - a;
    vec2 d = base.xz - (a + ab * clamp(dot(base.xz - a, ab) / dot(ab, ab), 0.0, 1.0));
    fg += 1.0 / (1.0 + dot(d, d) * 0.6);
  }
  light += vec3(1.0, 0.45, 0.14) * uFireAmt * fg * (0.4 + 0.6 * h);
  vec3 pd = w - uPackPos;
  light += vec3(1.0, 0.72, 0.4) * uPack * 1.8 * exp(-dot(pd, pd) * 0.12);  // a warm pool under the packaging, not a wash
  vCol = straw * light;
  float dist = length(cameraPosition - w);
  vHaze = smoothstep(8.0, 46.0, dist) * 0.55;
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
uniform float uS, uSmokeA, uSmokeCap, uClear; uniform vec3 uSmokeLow, uSmokeHigh, uSmokeFire; varying float vA, vRot; varying vec3 vC, vF;
void main() {
  float hf = aSeed.w, h = hf * uS;  // height follows the smoke amount, so the fall is the rise run backwards
  vec3 p = position;
  p.y += 0.3 + h * 19.0 + sin(uT * 0.35 + aSeed.z * 6.28) * 0.4 * uS;
  float wide = 0.5 + hf * 1.4 + h * h * 5.5 + uClear * (1.0 + hf * 5.0);  // billows out as it climbs, leaning with the wind; drifts apart as the air clears
  p.x += (aSeed.x - 0.5) * wide + h * h * 8.0 + sin(uT * 0.22 + aSeed.y * 6.28 + hf * 4.0) * 0.5 * uS;
  p.z += (aSeed.y - 0.5) * wide * 0.6;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(psize((1.2 + 1.2 * fract(aSeed.y * 5.3 + aSeed.z)) * (1.0 + h * 5.5), mv), uSmokeCap * uScale * (0.55 + 0.45 * aSeed.z));
  // clear at the base (flames show through), thinning as it climbs, and faded right at the lens (the costliest puffs)
  vA = uS * (1.0 - 0.55 * uClear) * uSmokeA * smoothstep(0.0, 0.12, hf) * (1.0 - 0.8 * hf) * smoothstep(2.0, 7.0, -mv.z);
  vC = mix(uSmokeLow, uSmokeHigh, smoothstep(0.05, 0.5, hf));
  vF = uSmokeFire * (1.0 - smoothstep(0.05, 0.5, hf));
  vRot = aSeed.z * 6.28 + uT * (0.04 + 0.06 * aSeed.x) * (aSeed.y > 0.5 ? 1.0 : -1.0);
}`;
const SMOKE_F = /* glsl */`
varying float vA, vRot; varying vec3 vC, vF;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + 1.0), f.x), f.y); }
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float s = sin(vRot), k = cos(vRot);
  vec2 q = mat2(k, -s, s, k) * c * 4.5 + vRot * 3.0;
  float n = n2(q) * 0.55 + n2(q * 2.1 + 3.7) * 0.3 + n2(q * 4.3 + 9.1) * 0.15;
  float r = length(c) * 2.0, m = smoothstep(1.0, 0.15, r + (n - 0.5) * 1.1) * smoothstep(1.0, 0.6, r);  // billowed edge, kept inside the sprite (no square cut-offs)
  float a = vA * m * (0.4 + 0.6 * n);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vC * (0.8 + 0.4 * n) + vF * smoothstep(-0.15, 0.45, c.y), a);  // point y runs down: the underside is fire-lit
}`;

// Fibres: each one is a short straw piece plus a glowing trail from where it was a moment ago (same curve at an
// earlier fold and t). Normal blending, so thousands of overlapping fibres stay straw gold instead of adding up to white.
const FIBRE = /* glsl */`
attribute vec3 aStart; uniform float uFold, uFibA, uFibOut, uFibSize, uSurf; uniform vec3 uC;
varying float vA, vAng, vMot, vTail, vBody, vShade;
vec3 at(float fold, float t) {
  float u = clamp((fold - aSeed.x * 0.3) / 0.55, 0.0, 1.0), e = u * u * (3.0 - 2.0 * u);
  float a = aSeed.z * 6.28 + e * 9.0 + t * 0.8;  // the vortex keeps turning while the scroll rests
  float rad = 1.2 + aSeed.y * 2.4;  // a hollow funnel, wider at the top
  vec3 mid = uC + vec3(cos(a) * rad, (aSeed.y - 0.5) * 2.6 + 0.6, sin(a) * rad);
  mid = 2.0 * mid - 0.5 * (aStart + position);  // the curve passes through the vortex at e = 0.5
  vec3 p = mix(mix(aStart, mid, e), mix(mid, position, e), e);
  p.y += (1.0 - e) * 0.04 * sin(t * 1.5 + aSeed.w * 30.0);
  return p;
}
void main() {
  float u = clamp((uFold - aSeed.x * 0.3) / 0.55, 0.0, 1.0), e = u * u * (3.0 - 2.0 * u), w = 4.0 * e * (1.0 - e);
  mat4 pm = projectionMatrix * modelViewMatrix;
  vec4 c1 = pm * vec4(at(uFold, uT), 1.0), c0 = pm * vec4(at(uFold - 0.02, uT - 0.1), 1.0);
  gl_Position = c1;
  float body = (0.3 - 0.14 * e + 0.15 * w) * uFibSize * uScale / c1.w;
  vec2 d = c0.w > 0.0 ? (c1.xy / c1.w - c0.xy / c0.w) * vec2(projectionMatrix[1][1] / projectionMatrix[0][0], 1.0) * uScale / projectionMatrix[1][1] : vec2(0.0);
  float L = min(length(d), 0.03 * uScale), S = max(body, 2.0 * L + 2.0);  // the trail fits behind the centre; capped (fill cost)
  gl_PointSize = S;
  vBody = body / S; vTail = L / S; vMot = atan(-d.y, d.x);  // point y runs down
  vA = uFibA * (0.4 + 0.35 * w) * (1.0 - 0.55 * e) * (1.0 - 0.8 * uSurf) * (1.0 - uFibOut);  // settled fibres: a fine outline that gives way to the surface
  vShade = 0.6 + 0.55 * fract(aSeed.w * 7.13);
  vAng = aSeed.w * 6.28 + e * 4.0 + uT * 0.6 * w;
}`;
const FIBRE_F = /* glsl */`
uniform vec3 uFibCol; varying float vA, vAng, vMot, vTail, vBody, vShade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float s = sin(vAng), k = cos(vAng), th = 0.1 * vBody;
  vec2 r = mat2(k, -s, s, k) * c;
  float body = smoothstep(th, 0.0, abs(r.y)) * smoothstep(0.42 * vBody, 0.22 * vBody, abs(r.x));
  s = sin(vMot); k = cos(vMot);
  vec2 m = mat2(k, -s, s, k) * c;  // m.x along the motion; the trail lies behind (m.x < 0)
  float g = clamp(-m.x / max(vTail, 1e-3), 0.0, 1.0);
  float tail = vTail > 0.02 ? (1.0 - g) * (1.0 - g) * step(m.x, 0.0) * step(g, 0.999) * smoothstep(th * 0.9, 0.0, abs(m.y)) : 0.0;
  float a = vA * max(body, tail * 0.7);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uFibCol * vShade, a);
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
  bool red = aSeed.x > 0.99;
  gl_PointSize = max(psize(red ? 0.5 : 0.2 + aSeed.y * 0.14, mv), 1.0);
  vA = uCity * (red ? 0.5 + 0.5 * sin(uT * 3.0 + aSeed.z * 20.0) : 0.6 + 0.4 * aSeed.w) * (1.0 - 0.55 * smoothstep(80.0, 135.0, -mv.z));  // far windows sink into the haze
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
// Sky: coral away from the sun, gold toward it, mauve, then dusk blue overhead. The broad glow hugs the horizon
// around the sun (kept narrow so the hero heading, left of it, sits on calmer sky); the disc is HDR so it blooms.
const SKY_F = /* glsl */`
uniform vec3 uHorizon, uCoral, uMid, uZenith, uSunDir, uSunCol, uGlow; uniform float uSunAmt, uDisc, uCity; varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float e = max(d.y, 0.0), s = max(dot(d, uSunDir), 0.0);
  float near = pow(max(dot(normalize(d.xz + 1e-5), normalize(uSunDir.xz)), 0.0), 30.0);
  vec3 col = mix(uCoral, uHorizon, near);
  col = mix(col, uMid, smoothstep(0.0, 0.14, e));
  col = mix(col, uZenith, pow(smoothstep(0.04, 0.6, e), 0.75));
  col += uSunCol * uSunAmt * (near * exp(-abs(d.y - uSunDir.y * 0.6) * 16.0) * 0.45 + pow(s, 60.0) * 0.4 + pow(s, 900.0) * 1.4);
  col += uSunCol * uDisc * smoothstep(0.99991, 0.99993, s);
  col += uGlow * uCity * exp(-e * 12.0) * smoothstep(0.2, 1.0, -d.z);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
}`;

// ---- the world ------------------------------------------------------------------------------
const groundH = (x, z) => (z < -36 ? 0 : (0.1 * Math.sin(x * 0.9) * Math.cos(z * 0.7) + 0.05 * Math.sin(x * 2.3 + z * 1.7)) * smooth(-36, -31, z));
const SMOKE_CAP = { low: 0.22, high: 0.28, ultra: 0.35 };  // largest smoke puff, x uScale (screen overdraw)
const BLADES = 24000;                                // field blades at density 1 (High x10, Ultra x30)
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
    const c = Math.cos(OBJ[0].rot), s = Math.sin(OBJ[0].rot); p = [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];  // as rotation.y
  } else if (o === 1) { const y = r() < 0.35 ? 0.4 : 0.4 * r() ** 0.7, rr = bowlR(y); p = [Math.cos(a) * rr, y, Math.sin(a) * rr]; }
  else if (r() < 0.3) { const rr = r() < 0.6 ? 0.34 : Math.sqrt(r()) * 0.34; p = [Math.cos(a) * rr, 0.78, Math.sin(a) * rr]; }
  else { const y = 0.75 * r(), rr = cupR(y); p = [Math.cos(a) * rr, y, Math.sin(a) * rr]; }
  return p.map((v, i) => v + OBJ[o].at[i]);
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
function pulp(mat) {
  mat.onBeforeCompile = (s) => {
    s.vertexShader = 'varying vec3 vObjP;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjP = position;');
    s.fragmentShader = PULP + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float mot = pn(vObjP * 9.0) * 0.5 + pn(vObjP * 24.0) * 0.3 + pn(vObjP * vec3(80.0, 240.0, 80.0)) * 0.2;
      diffuseColor.rgb *= 0.8 + 0.36 * mot;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.58, 0.42, 0.22), smoothstep(0.78, 0.9, pn(vObjP * 150.0 + 3.1)) * 0.35);`);
  };
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
    uClear: { value: 0 }, uHot: { value: 1 }, uFlameA: { value: small ? 1.5 : 1 / Math.sqrt(tier.density) }, uCityGround: { value: 0 }, uS: { value: 0 }, uFold: { value: 0 }, uFibA: { value: 0 }, uFibOut: { value: 0 }, uFibSize: { value: small ? 1 : tier.density ** -0.25 }, uSurf: { value: 0 }, uC: { value: new THREE.Vector3(...C) },
    uLantern: { value: 0 }, uBulbs: { value: 0 }, uHalo: { value: 0 }, uCity: { value: 0 }, uStars: { value: 0 },
    uFA: { value: OBJ.map(() => new THREE.Vector3()) }, uFM: { value: OBJ.map(() => new THREE.Vector3()) }, uFE: { value: OBJ.map(() => new THREE.Vector3()) }, uFP: { value: new THREE.Vector3() },
    uSmokeLow: { value: col(0.5, 0.3, 0.2) }, uSmokeHigh: { value: col(0.5, 0.48, 0.48) }, uSmokeFire: { value: col(0, 0, 0) },
    uSmokeA: { value: 0 }, uSmokeCap: { value: SMOKE_CAP[tier.name] }, uFibCol: { value: col(1, 0.7, 0.32) },
  };
  const bladeU = {
    uT: U.uT, uFireAmt: { value: 0 }, uPack: { value: 0 }, uSunDir: { value: new THREE.Vector3() },
    uSunCol: { value: col(1, 0.6, 0.3) }, uAmb: { value: col(0, 0, 0) }, uPackPos: { value: new THREE.Vector3(...C) },
    uFires: { value: FIRES.map((q) => new THREE.Vector4(...q)) },
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
    uHorizon: { value: col(0, 0, 0) }, uCoral: { value: col(0, 0, 0) }, uMid: { value: col(0, 0, 0) }, uZenith: { value: col(0, 0, 0) },
    uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: col(1, 0.62, 0.3) }, uSunAmt: { value: 0 }, uDisc: { value: 0 },
    uGlow: { value: col(0.9, 0.48, 0.22) }, uCity: U.uCity,
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
    const r = rng(2), P = g.attributes.position, cols = [], field = [];
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i), k = smooth(-30, -37, z), v = 0.85 + r() * 0.3;
      P.setY(i, groundH(x, z) + r() * 0.06);
      cols.push((0.72 * (1 - k) + 0.09 * k) * v, (0.5 * (1 - k) + 0.1 * k) * v, (0.24 * (1 - k) + 0.14 * k) * v);
      field.push(0.7 * v, 0.48 * v, 0.24 * v);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.setAttribute('aField', new THREE.Float32BufferAttribute(field, 3));
    g.computeVertexNormals();
    // The field runs on to the hazy horizon; the dark city ground only fades in for the flight to the cafe.
    const gm = lambert(0xffffff, { vertexColors: true, flatShading: true });
    gm.onBeforeCompile = (s) => {
      s.uniforms.uCityGround = U.uCityGround;
      s.vertexShader = 'attribute vec3 aField; uniform float uCityGround; varying float vGH;\n' + s.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = mix(aField, vColor.rgb, uCityGround);')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvGH = mix(smoothstep(8.0, 46.0, -mvPosition.z) * 0.55 + smoothstep(36.0, 80.0, -mvPosition.z) * 0.4, smoothstep(4.0, 45.0, -mvPosition.z) * 0.9, uCityGround);');
      // the bare ground past the blades fades to the same haze as the far blades
      s.fragmentShader = 'varying float vGH;\n' + s.fragmentShader.replace('#include <fog_fragment>', 'gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, vGH);\n#include <fog_fragment>');
    };
    mesh(g, gm);
  }

  // Field: thin tapered straw blades, BLADES x density, placed from rng(3); sway and light are in BLADE_V.
  {
    const count = n(BLADES), r = rng(3), d = new THREE.Object3D();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.32, 0.5, 0, 0.32, 0.5, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...bladeU }, vertexShader: BLADE_V, fragmentShader: BLADE_F,
      side: THREE.DoubleSide, fog: true,
    });
    const im = new THREE.InstancedMesh(g, mat, count);
    for (let i = 0; i < count; i++) {
      let x, z;
      // phones (portrait, narrow view) get their blades where the camera looks, so the field stays full
      do { z = 10 - r() * 44; x = (r() - 0.5) * (small ? 6 + 0.7 * (10 - z) : 52); } while (Math.abs(x - HUT[0]) < 1.6 && Math.abs(z - HUT[2]) < 1.4);
      d.position.set(x, groundH(x, z) - 0.02, z);
      d.rotation.set((r() - 0.5) * 0.45, r() * 6.28, (r() - 0.5) * 0.45);
      d.scale.set(0.025 + r() * 0.03, 0.3 + r() * r() * 0.55, 1);
      d.updateMatrix(); im.setMatrixAt(i, d.matrix);
    }
    im.frustumCulled = false;                         // blades bend in the shader
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
  points(small ? 450 : Math.round(900 * tier.density ** 0.35), 4,  // dust: a full x10 reads as snow
    (r) => [(r() - 0.5) * 44, 0.2 + r() ** 2 * 4, 6 - r() * 36], DUST);
  const onFire = (r) => { const f = FIRES[Math.floor(r() * FIRES.length)], k = r(); return [f[0] + (f[2] - f[0]) * k, 0, f[1] + (f[3] - f[1]) * k]; };
  const flames = points(n(1400), 5, (r) => { const p = onFire(r); p[1] = groundH(p[0], p[2]); return p; }, FLAME);
  const embers = points(n(700), 6, onFire, EMBER);
  flames.renderOrder = embers.renderOrder = 1;        // drawn after the smoke, so they glow through it
  const COLS = (() => { const r = rng(13); return FIRES.flatMap((f) => [0.3, 0.75].map((k) => { k += (r() - 0.5) * 0.2; return [f[0] + (f[2] - f[0]) * k, 0, f[1] + (f[3] - f[1]) * k]; })); })();
  // ten columns; fewer, bigger puffs than x density (overdraw), each thinner the more there are
  const smokeN = small ? 180 : Math.round(360 * Math.sqrt(tier.density));
  U.uSmokeA.value = 0.75 * Math.min(1, Math.sqrt(360 / smokeN));
  const smoke = points(smokeN, 7, (r) => { const c = COLS[Math.floor(r() * COLS.length)]; return [c[0] + (r() - 0.5) * 0.8, 0, c[2] + (r() - 0.5) * 0.8]; }, SMOKE, SMOKE_F, THREE.NormalBlending);

  // Straw fibres: scattered on the field (rng(1)), swirl up, fold into the box, bowl and cup
  const fibres = points(n(3000), 8, (r) => sampleSurface(r), FIBRE, FIBRE_F, THREE.NormalBlending);
  fibres.renderOrder = 1;                             // after the packaging, so its surface hides only the fibres behind it
  {
    const r = rng(1), cnt = fibres.geometry.attributes.position.count, s = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) { const x = (r() - 0.5) * 16, z = C[2] + (r() - 0.5) * 14; s.set([x, groundH(x, z) + 0.05, z], i * 3); }
    fibres.geometry.setAttribute('aStart', new THREE.BufferAttribute(s, 3));
  }

  // The packaging itself, faded in as the fibres settle
  const paper = pulp(lambert(0xe2cc98, { emissive: 0x24180a, transparent: true }));
  const lathe = (f, h, top) => new THREE.LatheGeometry(Array.from({ length: 11 }, (_, k) => new THREE.Vector2(f(h * k / 10), h * k / 10)).concat(top || []), 28);
  const pack = OBJ.map(() => new THREE.Group());
  mesh(new THREE.BoxGeometry(1.1, 0.45, 0.8).translate(0, 0.225, 0), paper, 0, 0, 0, pack[0]);
  mesh(new THREE.BoxGeometry(1.15, 0.035, 0.85), paper, 0, 0.3, 0, pack[0]);
  mesh(lathe(bowlR, 0.4), pulp(lambert(0xe2cc98, { emissive: 0x24180a, transparent: true, side: THREE.DoubleSide })), 0, 0, 0, pack[1]);
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
    for (let i = 0; i < 50; i++) { const s = r() < 0.5 ? -1 : 1; blds.push([s * (22 + r() * 80), -66 - r() * 40, 3 + r() * 4, 3 + r() * 3, 2 + r() * 5]); }  // nearer, lower, off the avenue
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0x0b1222 }), blds.length);  // scene fog: farther blocks are hazier
    blds.forEach(([x, z, w, dd, h], i) => { d.position.set(x, 0, z); d.scale.set(w, h, dd); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    city.add(im);
    // windows by height: tall blocks get more than the low ones
    return (rr) => { let b; do b = blds[Math.floor(rr() * blds.length)]; while (rr() * 15 > b[4]); const [x, z, w, dd, h] = b; return [x + (rr() - 0.5) * w * 0.9, 1 + rr() * (h - 1.5), z + dd / 2 + 0.05]; };
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
  cafe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 21 }, (_, i) => { const k = i / 20; return new THREE.Vector3(-3.6 + 7.2 * k, 2.93 - Math.sin(k * Math.PI) * 0.35, TABLE[2] - 2.5 + 3 * k); })), wire));
  const cafeMats = [wood, deck, wire];

  // Glows: the hut lantern and the café bulbs (aSeed.x picks which, aSeed.y is size)
  {
    const pos = [HUT[0] - 0.2, 1.6, HUT[2] + 0.3, C[0], C[1] - 0.1, C[2] - 0.6], sd = [0.2, 0.9, 0, 0, 0.8, 7, 0, 1], cl = [1, 0.62, 0.25, 0.55, 0.36, 0.16];
    for (let i = 0; i < 14; i++) { const k = i / 13; pos.push(-3.6 + 7.2 * k, 2.85 - Math.sin(k * Math.PI) * 0.35, TABLE[2] - 2.5 + 3 * k); sd.push(0.5, 0.34, i, 0); cl.push(1, 0.62, 0.3); }
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
  const packLight = new THREE.PointLight(0xffc27a, 0, 9, 1); packLight.position.set(C[0] - 1, C[1] + 2.5, C[2] + 3); scene.add(packLight);
  const cafeLight = new THREE.PointLight(0xffb060, 0, 12, 1); cafeLight.position.set(0, 2.8, TABLE[2]); scene.add(cafeLight);
  // a warm pool on the table from the bulb overhead; it falls off to the deck
  const tableSpot = new THREE.SpotLight(0xffb468, 0, 7, 0.62, 0.85, 1); tableSpot.position.set(0.3, 2.7, TABLE[2] + 0.4);
  tableSpot.target.position.set(TABLE[0], TABLE[1], TABLE[2]); scene.add(tableSpot, tableSpot.target);

  // Colours of the evening
  const H_WARM = col(1, 0.56, 0.26), H_DUSK = col(0.3, 0.4, 0.54), H_NIGHT = col(0.09, 0.12, 0.2);
  const CORAL = col(0.86, 0.43, 0.36), MID_WARM = col(0.8, 0.5, 0.42), coral = col(0, 0, 0), mid = col(0, 0, 0), tc = col(0, 0, 0);
  const Z_DUSK = col(0.12, 0.21, 0.46), Z_NIGHT = col(0.03, 0.055, 0.12), WARM_FILL = col(1, 0.7, 0.4), SMOKE_DARK = col(0.4, 0.35, 0.33), SMOKE_LIT = col(0.85, 0.45, 0.22), MOON = col(0.4, 0.5, 0.8), HAZE = col(0.46, 0.42, 0.4), CITYGLOW = col(0.9, 0.5, 0.22);
  const horizon = col(0, 0, 0), zenith = col(0, 0, 0), sunDir = new THREE.Vector3(), v = new THREE.Vector3(), sv = new THREE.Vector3(), fwd = new THREE.Vector3();

  function render(p, t) {
    const q = clamp01(p), P = params(q, t), sunW = smooth(0.35, 1, P.sun), night = smooth(0.55, 0.9, q);
    camera.position.set(P.camera.x, P.camera.y, P.camera.z);
    camera.lookAt(P.camera.lookX, P.camera.lookY, P.camera.lookZ);
    sky.position.copy(camera.position);

    horizon.lerpColors(H_DUSK, H_WARM, sunW).lerp(H_NIGHT, night).lerp(HAZE, P.smoke * 0.45).lerp(CITYGLOW, P.city * 0.12);
    zenith.lerpColors(Z_DUSK, Z_NIGHT, night).lerp(HAZE, P.smoke * 0.35);
    coral.lerpColors(H_DUSK, CORAL, sunW).lerp(H_NIGHT, night).lerp(HAZE, P.smoke * 0.45);
    mid.lerpColors(zenith, MID_WARM, sunW * (1 - P.smoke * 0.6));
    skyU.uHorizon.value.copy(horizon); skyU.uCoral.value.copy(coral); skyU.uMid.value.copy(mid); skyU.uZenith.value.copy(zenith);
    // Right of centre (less on portrait screens, so it stays in frame) high enough at the hero to sit above the heading band, behind the ridges by p 0.45; the disc blooms while sun > 0.2.
    sunDir.set(camera.aspect < 1 ? 0.2 : 0.32, -0.06 + 0.3 * P.sun ** 1.5, -1).normalize();
    skyU.uSunDir.value.copy(sunDir); skyU.uSunAmt.value = sunW * (1 - P.smoke * 0.7);
    skyU.uDisc.value = 7 * smooth(0.2, 0.3, P.sun) * (1 - P.smoke * 0.8);
    scene.fog.color.copy(horizon).lerp(Z_NIGHT, 0.35).lerp(CITYGLOW, 0.22 * P.city); scene.fog.far = 90 + 50 * smooth(0.6, 0.8, q);  // thicker haze over the field
    ridges[0].material.color.copy(horizon).lerp(Z_NIGHT, 0.5);
    ridges[1].material.color.copy(horizon).lerp(Z_NIGHT, 0.28);

    hemi.color.copy(horizon).lerp(zenith, 0.35).lerp(MOON, 0.35 * (1 - sunW)); hemi.intensity = 0.7 + 0.5 * sunW;
    sun.position.copy(sunDir).multiplyScalar(50); sun.color.copy(H_WARM); sun.intensity = 1.4 * sunW;
    fill.color.lerpColors(MOON, WARM_FILL, sunW); fill.intensity = 0.55 * sunW + 0.7 * (1 - sunW);
    fireLight.intensity = 9 * P.fire; cafeLight.intensity = 1.8 * P.city; tableSpot.intensity = 9 * P.city;
    bladeU.uSunDir.value.copy(sunDir); bladeU.uSunCol.value.copy(sun.color).multiplyScalar(sun.intensity / Math.PI);
    bladeU.uAmb.value.copy(hemi.color).multiplyScalar(hemi.intensity / Math.PI).add(tc.copy(fill.color).multiplyScalar(fill.intensity * 0.3 / Math.PI));
    bladeU.uFireAmt.value = 0.9 * P.fire; U.uCityGround.value = smooth(0.6, 0.8, q);

    U.uT.value = t;
    U.uDust.value = (1 - smooth(0.45, 0.6, q)) * (1 - 0.6 * P.smoke);
    U.uFire.value = P.fire; U.uS.value = Math.max(P.smoke, 0.5 * P.fire); U.uEmber.value = Math.max(P.fire, 0.8 * P.smoke);
    U.uClear.value = P.clear; U.uHot.value = post ? 2.5 : 1;  // HDR only where bloom and ACES can take it
    U.uSmokeHigh.value.copy(SMOKE_DARK).multiplyScalar(0.75).lerp(horizon, 0.3); U.uSmokeLow.value.lerpColors(SMOKE_DARK, SMOKE_LIT, 0.5 * P.fire).multiplyScalar(0.8);
    U.uSmokeFire.value.copy(SMOKE_LIT).multiplyScalar(1.6 * P.fire);  // the flames light the smoke from below
    U.uFibCol.value.setRGB(1, 0.68, 0.3).multiplyScalar(post ? 1.25 : 1);  // a little HDR so dense fibres bloom gold
    U.uFold.value = P.fold; U.uFibA.value = smooth(0.42, 0.52, q) * (small ? 1 : tier.density ** -0.3); U.uSurf.value = smooth(0.85, 1, P.fold); U.uFibOut.value = smooth(0.72, 0.77, q);
    U.uLantern.value = (0.5 + 0.5 * (1 - sunW)) * (1 - smooth(0.6, 0.75, q));
    U.uBulbs.value = P.city; U.uCity.value = P.city;
    U.uStars.value = Math.max(0.35 * smooth(0.45, 0.65, q) * P.clear, P.city);  // first stars at dusk, all of them as the city rises
    flames.visible = embers.visible = P.fire > 0.001 || P.smoke > 0.001;
    smoke.visible = U.uS.value > 0.001; fibres.visible = U.uFibA.value > 0.001 && U.uFibOut.value < 1;

    const form = smooth(0.8, 1, P.fold);
    // halo trimmed to half: it sat behind the caption text
    U.uHalo.value = 0.5 * form * (1 - smooth(0.72, 0.8, q)); packLight.intensity = (2.5 * smooth(0.1, 0.6, P.fold) + 2.5 * form) * (1 - P.city);
    bladeU.uPack.value = packLight.intensity * 0.12;
    packMats.forEach((m) => { m.opacity = U.uSurf.value; });  // the pulp surface fills in over the settled outline
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

    if (!post) return renderer.render(scene, camera);
    // The sun disc's direction projected with the camera (uv); facing fades the rays out when the sun is behind the view.
    camera.updateMatrixWorld();
    sv.copy(sunDir).multiplyScalar(50).add(camera.position).project(camera);
    post.render({
      sunScreen: [sv.x * 0.5 + 0.5, sv.y * 0.5 + 0.5], sun: P.sun, smoke: P.smoke,
      glow: Math.max(P.fire, P.city, form), facing: smooth(0, 0.3, camera.getWorldDirection(fwd).dot(sunDir)),
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
  let end = 1, raf = 0, last = 0, manual = false, shown = 0, frames = 0, step = TIER.name === 'low' ? 'low' : 'high';
  const frameMs = [], t0 = performance.now();
  const measure = () => { end = Math.max(1, doors.offsetTop + doors.offsetHeight / 2 - innerHeight / 2); };
  const target = () => clamp01(scrollY / end);
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
  document.fonts?.ready.then(measure);  // caption heights change when the web fonts arrive
  // scFilm.render(p, t) draws exactly that frame (scene and counters) and stops the scroll loop; open the page
  // with ?film=video for capture (see VIDEO above).
  window.scFilm = { get tier() { return film.tier.name; }, ...(VIDEO || BENCH ? { _degrade: degrade, _memory: () => ({ ...film.renderer.info.memory }) } : {}),  // console hooks for the step-down check, not on real visits
     render: (p, t) => { manual = true; cancelAnimationFrame(raf); film.render(p, t); tick(t); } };
  if (VIDEO || BENCH) root.classList.add('film');
  if (BENCH) raf = requestAnimationFrame(benchFrame);
  else if (VIDEO) {
    if (FLAGS.p !== null || FLAGS.t !== null) { window.scFilm.render(FLAGS.p ?? 0, FLAGS.t ?? 0); root.dataset.filmReady = '1'; }
  } else raf = requestAnimationFrame(frame);
}
boot();
