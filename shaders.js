// GLSL sources for the Home film (moved out of film.js unchanged). Plain strings; film.js imports what it uses.
export const HEAD = /* glsl */`
uniform float uT, uScale;
attribute vec4 aSeed;
float psize(float s, vec4 mv) { return s * uScale / -mv.z; }
`;

export const SOFT = /* glsl */`
varying float vA; varying vec3 vC;
void main() { float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vC, vA * pow(max(1.0 - d, 0.0), 1.6)); }`;

// Dust: warm motes, brightest where they sit against the sun (backlit), dim elsewhere; size by depth, capped so the
// nearest ones stay motes instead of big bokeh circles.
export const DUST = /* glsl */`
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
export const FLAME = /* glsl */`
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

export const FLAME_F = /* glsl */`
varying float vA; varying vec3 vC;
void main() {  // a tongue: wide at the base, narrowing to the tip (point y runs down)
  vec2 c = gl_PointCoord - 0.5; c.x *= 1.8 + 2.0 * (0.5 - c.y);
  float d = length(c) * 2.0; gl_FragColor = vec4(vC, vA * pow(max(1.0 - d, 0.0), 1.2));
}`;

// sin-free value noise (cheap per fragment, same result for the same input)
export const NOISE = /* glsl */`
float h2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + 1.0), f.x), f.y); }
`;

// Fire fronts: one standing ribbon per fire line (aF: metres along, height 0..1, length, seed). Tongues of different
// heights drift along it and lick upward with t; a hot low core, dark red tips, edges that stay edges under bloom.
export const FRONT_V = /* glsl */`
attribute vec4 aF; attribute float aB; varying vec4 vF; varying float vB;
void main() { vF = aF; vB = aB; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export const FRONT_F = /* glsl */`
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
export const EMBER = /* glsl */`
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
export const BLADE_V = /* glsl */`
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

export const BLADE_F = /* glsl */`
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
export const SMOKE = /* glsl */`
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

export const SMOKE_F = /* glsl */`
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
export const FIBRE = /* glsl */`
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

export const FIBRE_F = /* glsl */`
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

export const TRAIL = /* glsl */`
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

export const GLOW = /* glsl */`
attribute vec3 aCol; uniform float uLantern, uBulbs, uHalo; varying float vSoft; varying float vA; varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = psize(aSeed.y, mv);
  vSoft = aSeed.w;
  vA = (aSeed.x < 0.33 ? uLantern : aSeed.x < 0.66 ? uBulbs : uHalo) * (0.85 + 0.15 * sin(uT * 2.0 + aSeed.z * 30.0));
  vC = aCol;
}`;

export const GLOW_F = /* glsl */`
varying float vA, vSoft; varying vec3 vC;
void main() { float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vC, vA * (exp(-d * d * 6.0) * 0.6 + smoothstep(0.22, 0.1, d) * (1.0 - vSoft))); }`;

// Windows on a grid per block; one tone per block (its front face z): mostly sodium, some warm white, a few cool
// fluorescent offices; some windows dark.
export const CITY = /* glsl */`
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

export const CITY_F = /* glsl */`
varying float vA; varying vec3 vC;
void main() { vec2 c = abs(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vC, vA * smoothstep(1.0, 0.55, max(c.x, c.y * 0.8))); }`;

// Street bokeh in front of the city: traffic, shop signs and lamps, out of focus; it hides the blocks' bases.
export const BOKEH = /* glsl */`
uniform float uCity; varying float vA; varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = psize(0.7 + aSeed.y * 1.6, mv);
  vA = uCity * (0.1 + 0.16 * aSeed.w) * (0.85 + 0.15 * sin(uT * (0.5 + aSeed.x) + aSeed.z * 30.0));
  vC = aSeed.x < 0.55 ? vec3(1.0, 0.58, 0.24) : aSeed.x < 0.8 ? vec3(1.0, 0.82, 0.58) : aSeed.x < 0.93 ? vec3(1.0, 0.28, 0.16) : vec3(0.5, 0.85, 0.8);
}`;

export const STARS = /* glsl */`
uniform float uStars, uPR; varying float vA; varying vec3 vC;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = (1.0 + aSeed.x * 1.8) * uPR;
  vA = uStars * (0.4 + 0.6 * aSeed.y) * (0.7 + 0.3 * sin(uT * (1.0 + aSeed.z * 2.0) + aSeed.w * 30.0));
  vC = vec3(0.9, 0.93, 1.0);
}`;

export const SKY_V = /* glsl */`
varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`;

// Sky: coral away from the sun, gold toward it, mauve, then dusk blue overhead. The broad glow hugs the horizon
// around the sun (kept narrow so the hero heading, left of it, sits on calmer sky); the disc is HDR so it blooms.
export const SKY_F = /* glsl */`
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

// Ridges: their colour by height, melting into the haze (fog colour) at the base so they meet the far field softly.
export const RIDGE_V = /* glsl */`attribute float aTop; varying float vY, vTop; varying vec3 vW;
void main() { vY = position.y; vTop = aTop; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

export const RIDGE_F = /* glsl */`
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
export const TREE_V = /* glsl */`
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

export const TREE_F = /* glsl */`
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
export const GROUND_FX = /* glsl */`
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

// Moulded straw pulp: soft mottling, a fine pressed grain and darker fibre flecks, from value noise in object space.
export const PULP = /* glsl */`
varying vec3 vObjP;
float ph(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float pn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ph(i), ph(i + vec3(1, 0, 0)), f.x), mix(ph(i + vec3(0, 1, 0)), ph(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(ph(i + vec3(0, 0, 1)), ph(i + vec3(1, 0, 1)), f.x), mix(ph(i + vec3(0, 1, 1)), ph(i + 1.0), f.x), f.y), f.z); }
`;
