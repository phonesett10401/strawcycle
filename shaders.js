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
  gl_PointSize = soft ? min(psize(0.12 + aSeed.w * 0.1, mv), 16.0 * uPR) : min(psize(0.05 + aSeed.w * 0.07, mv), 9.0 * uPR);
  float back = pow(max(dot(normalize((modelMatrix * vec4(p, 1.0)).xyz - cameraPosition), uSunDirW), 0.0), 6.0);
  vA = uDust * (0.04 + 2.0 * back) * (soft ? 0.25 : 1.0) * (0.35 + 0.65 * (0.5 + 0.5 * sin(uT * 1.3 + aSeed.x * 40.0))) * smoothstep(1.5, 5.0, -mv.z);
  vC = mix(vec3(0.9, 0.5, 0.22), vec3(1.0, 0.68, 0.36), back);  // only where it catches the sun
}`;

// sin-free value noise (cheap per fragment, same result for the same input)
export const NOISE = /* glsl */`
float h2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + 1.0), f.x), f.y); }
`;

// The burning, shared by the flames, embers, blades and ground. Each fire line runs a to b (uFires); uFireT is
// (ignition start, run time, 1 = lit from b, front speed) in burn units (uBurn: 0..1 over the burn beat, from p only).
// The ignition line wobbles; once lit, a spot's front moves back (away from the camera, -n) with its age, curving as
// it goes, and leaves char behind. Piles (uPiles: x, z, radius, height) catch at uPileT.
export const FIRE = /* glsl */`
uniform vec4 uFires[5], uFireT[5], uPiles[2];
uniform vec2 uPileT;
uniform float uBurn;
float gH(vec2 p) { return (0.1 * sin(p.x * 0.9) * cos(p.y * 0.7) + 0.05 * sin(p.x * 2.3 + p.y * 1.7)) * smoothstep(-36.0, -31.0, p.y); }
float fWob(float j, float s) { return 0.6 * sin(s * 0.55 + j * 1.7) + 0.3 * sin(s * 1.37 + j * 4.3) + 0.12 * sin(s * 3.1 + j * 2.0); }
float fAge(int j, float u) {
  vec4 T = uFireT[j];
  return uBurn - T.x - T.y * mix(u, 1.0 - u, T.z);
}
float fOff(int j, float s, float L, float age) {
  float endk = smoothstep(0.0, 1.5, min(s, L - s));
  return fWob(float(j), s) - uFireT[j].w * max(age, 0.0) * (0.45 + 0.55 * endk) * (1.0 + 0.3 * sin(s * 0.8 + float(j) * 2.3));
}
vec2 fPoint(int j, float u, out float age, out float amt) {
  vec2 a = uFires[j].xy, ab = uFires[j].zw - a;
  float L = length(ab), s = u * L;
  age = fAge(j, u);
  amt = smoothstep(0.0, 0.03, age) * (0.35 + 0.65 * smoothstep(0.0, 1.2, min(s, L - s)));
  return a + ab * u + vec2(-ab.y, ab.x) / L * fOff(j, s, L, age);
}
float pAmt(int i) {
  float a = uBurn - uPileT[i];
  return smoothstep(0.0, 0.08, a) * (1.0 - 0.45 * smoothstep(0.6, 1.4, a));
}
`;

// Flame tongues: camera-facing cards (upright) standing on the fronts and piles. aT: line 0-4 or pile 5-6, u along
// the line (or angle on the pile), size, seed. Height flickers on t; each card's shape is drawn in TONGUE_F.
export const TONGUE_V = /* glsl */`
uniform float uT, uFire, uTW, uTH;
attribute vec4 aT;
varying vec2 vUv;
varying float vS, vA, vK;
${FIRE}
void main() {
  int j = int(aT.x + 0.5);
  float age = 0.0, amt, H, W;
  vec3 b;
  vK = step(4.5, aT.x);
  if (j < 5) {
    vec2 xz = fPoint(j, aT.y, age, amt);
    b = vec3(xz.x, gH(xz) - 0.05, xz.y);
    float sL = aT.y * length(uFires[j].zw - uFires[j].xy), env = 0.45 + 0.75 * (0.5 + 0.5 * sin(sL * 0.9 + float(j) * 2.1)) * (0.6 + 0.4 * sin(sL * 0.31 + float(j)));  // the line rises and falls 2-3x along its length
    H = uTH * env * (0.3 + 0.7 * aT.z * aT.z) * (1.0 - 0.3 * smoothstep(0.3, 1.2, age));  // many small tongues, a few tall
    W = uTW * (0.7 + 0.6 * aT.w);
  } else {
    int i = j - 5;
    vec4 P = uPiles[i];
    float r = sqrt(fract(aT.w * 7.31)) * 0.8, an = aT.y * 6.2832;
    amt = pAmt(i);
    b = vec3(P.x + cos(an) * r * P.z, gH(P.xy) + P.w * sqrt(max(1.0 - r * r, 0.0)) * 0.85, P.y + sin(an) * r * P.z);
    H = uTH * (0.7 + 1.0 * aT.z * aT.z) * (1.2 - 0.5 * r);  // taller over the pile's crown
    W = uTW * (1.0 + 0.8 * aT.w);
  }
  float fl = 0.72 + 0.28 * sin(uT * (6.0 + 6.0 * aT.w) + aT.z * 40.0) * sin(uT * (2.3 + 3.0 * aT.z) + aT.w * 25.0);
  H *= fl * (0.35 + 0.65 * uFire);
  vec3 tc = cameraPosition - b, rt = normalize(vec3(tc.z, 0.0, -tc.x));
  vec3 p = b + rt * position.x * W + vec3(0.0, position.y * H, 0.0);
  p.x += position.y * position.y * H * 0.3;  // leaning with the wind
  vUv = vec2(position.x + 0.5, position.y);
  vS = aT.w * 17.0 + aT.z * 5.0;
  vA = amt * min(uFire * 2.0, 1.0) * step(0.001, H);
  gl_Position = vA > 0.0 ? projectionMatrix * viewMatrix * vec4(p, 1.0) : vec4(0.0, 0.0, 2.0, 1.0);  // unlit or burnt out: off clip space, no fragments
}`;

export const TONGUE_F = /* glsl */`
uniform float uT, uHot, uTA;
varying vec2 vUv;
varying float vS, vA, vK;
${NOISE}
void main() {
  float y = vUv.y, x = vUv.x - 0.5;
  x += (n2(vec2(y * 2.5 - uT * 3.5, vS)) - 0.5) * 0.5 * y;  // the tongue wavers, most at the tip
  float wd = 0.46 * pow(max(1.0 - y, 0.0), 0.75) * smoothstep(-0.05, 0.2, y);  // y can run past 1 at a card's edge (MSAA): no pow of a negative
  float n = n2(vec2(vUv.x * 4.0 + vS, y * 3.0 - uT * 4.5));
  float d = 1.0 - abs(x) / max(wd, 0.001) + (n - 0.5) * 0.8 * y;
  float a = smoothstep(0.0, 0.5, d) * smoothstep(0.0, 0.08, y) * vA * uTA * (1.0 - 0.55 * vK);  // the pile's tongues overlap many deep
  if (a < 0.004) discard;
  float heat = clamp((1.0 - y) * (0.5 + 0.5 * d) * (1.0 - 0.25 * vK), 0.0, 1.0);
  vec3 c = mix(vec3(0.32, 0.03, 0.01), vec3(1.0, 0.36, 0.05), smoothstep(0.08, 0.45, heat));  // dark red tips, orange body
  c = mix(c, vec3(1.0, 0.82, 0.5), smoothstep(0.55, 0.85, heat));  // white-yellow base
  c *= mix(0.55, 0.55 * uHot + 0.2, smoothstep(0.72, 0.95, heat));  // only the hot core goes past the bloom threshold
  gl_FragColor = vec4(c, a * (1.0 - 0.45 * smoothstep(0.55, 1.0, y)));
}`;

// Embers: sparks that leave the fronts and the piles (position: u or angle, line 0-4 or pile 5-6), rise and drift
// downwind on t; as the air clears they sink back.
export const EMBER = /* glsl */`
uniform float uEmber, uClear, uHot;
varying float vA;
varying vec3 vC;
${FIRE}
void main() {
  float life = fract(aSeed.w + uT * (0.05 + aSeed.x * 0.07)), amt, age;
  int j = int(position.y + 0.5);
  vec3 p;
  if (j < 5) {
    vec2 xz = fPoint(j, position.x, age, amt);
    p = vec3(xz.x, gH(xz), xz.y);
  } else {
    vec4 P = uPiles[j - 5];
    float an = position.x * 6.2832;
    amt = pAmt(j - 5) * 1.5;
    p = vec3(P.x + cos(an) * P.z * 0.5, gH(P.xy) + P.w * 0.8, P.y + sin(an) * P.z * 0.5);
  }
  p.y += 0.2 + life * (1.0 + aSeed.y * aSeed.y * 5.0) * (1.0 - 0.85 * uClear);
  p.x += life * (0.8 + aSeed.z * 1.6) + sin(uT * (0.6 + aSeed.x) + aSeed.z * 6.28) * (0.1 + 0.6 * life);
  p.z += cos(uT * 0.5 + aSeed.y * 6.28) * life * 0.8;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(psize(0.04 + aSeed.y * 0.05, mv), 1.2);
  float flick = 0.55 + 0.45 * sin(uT * (5.0 + aSeed.x * 7.0) + aSeed.z * 40.0);
  vA = uEmber * min(amt, 1.0) * smoothstep(0.0, 0.05, life) * (1.0 - life) * (1.0 - life) * flick * (0.3 + 0.9 * pow(fract(aSeed.x * 13.7), 2.0));  // a few bright sparks
  vC = mix(vec3(1.0, 0.5, 0.14), vec3(0.9, 0.2, 0.03), life) * uHot * 1.1;
}`;

// Straw blades (InstancedMesh, local blade 0..1 tall): wind bend from a rolling gust and a per-blade flutter, both
// pure in t and position. Lit by the sun (backlit tips glow), the fire lines, the packaging glow; haze far away.
export const BLADE_V = /* glsl */`
uniform float uT, uFireAmt, uPack, uChar, uCool, uRimK, uPileK, uFieldN, uSink;
uniform vec3 uSunDir, uSunCol, uAmb, uPackPos;
uniform vec4 uObj[3], uHutSh;
uniform vec2 uHutL;
varying vec3 vCol; varying float vHaze;
${FIRE}
#include <fog_pars_vertex>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec3 base = m[3].xyz, w = (m * vec4(position, 1.0)).xyz;
  float h = position.y, H = length(m[1].xyz), s = hash(base.xz), s2 = hash(base.zx + 7.0), s3 = hash(base.xz * 1.7 + 3.1);
  // fire first: between each ignition line and its front the straw is burnt down to black stubs; near the front and
  // around a burning pile the stubble is lit; none grows through a pile
  float fg = 0.0, burnt = 0.0, heat = 0.0, inPile = 0.0, field = step(float(gl_InstanceID), uFieldN - 0.5);  // 1 for field blades, 0 for the piles' straw
  if (uFireAmt + uChar > 0.001) {
    for (int i = 0; i < 5; i++) {
      vec2 a = uFires[i].xy, ab = uFires[i].zw - a;
      float L = length(ab), k = dot(base.xz - a, ab) / (L * L), sl = k * L, sd = dot(base.xz - a, vec2(-ab.y, ab.x) / L) + (s - 0.5) * 0.3;
      float age = fAge(i, clamp(k, 0.0, 1.0)), off = fOff(i, sl, L, age), w0 = fWob(float(i), sl), de = max(abs(k - 0.5) - 0.5, 0.0) * L;
      burnt = max(burnt, step(0.0, age) * step(0.0, k) * step(k, 1.0) * smoothstep(off - 0.15, off + 0.15, sd) * smoothstep(w0 + 0.5, w0 + 0.2, sd));
      fg += smoothstep(0.0, 0.03, age) / (1.0 + ((sd - off) * (sd - off) + de * de) * 0.9);
      heat = max(heat, smoothstep(0.0, 0.03, age) * step(0.0, k) * step(k, 1.0) * exp(-max(off - sd, 0.0) * 0.9));  // the straw ahead of a front is licked down, so the flames and char show over the tall field
    }
    for (int i = 0; i < 2; i++) {
      vec2 d = base.xz - uPiles[i].xy;
      float r2 = dot(d, d), R = uPiles[i].z;
      fg += pAmt(i) * 2.5 / (1.0 + r2 * 0.25);
      inPile = max(inPile, step(r2, R * R * 0.8) * field);
      burnt = max(burnt, smoothstep(0.0, 0.5, uBurn - uPileT[i]) * step(r2, (R + 0.5) * (R + 0.5)));
    }
  }
  float dist = length(cameraPosition - base);
  w = base + (w - base) * (1.0 - 0.8 * uChar * max(burnt, 0.7 * heat) * field) * (1.0 - inPile) * (1.0 - uSink) * smoothstep(1.2, 3.6, dist);  // burnt to stubs; none right at the lens
  if (field < 0.5) w.y = gH(base.xz) + (w.y - gH(base.xz)) * uPileK;  // the piles' straw sinks with them
  float gust = 0.5 + 0.5 * sin(uT * 0.9 - base.x * 0.18 + base.z * 0.11);
  float sway = ((0.08 + 0.26 * gust) + 0.07 * sin(uT * 3.1 + s * 6.28 + base.x * 0.7)) * pow(max(normalize(m[1].xyz).y, 0.0), 2.0);  // lying straw stays put
  w.x += h * h * H * sway;
  w.z -= h * h * H * sway * 0.3;
  w.y -= h * h * H * sway * sway * 0.5;
  vec3 n = normalize(mat3(m) * vec3(0.0, 0.0, 1.0)), v = normalize(cameraPosition - w);
  n *= dot(n, v) < 0.0 ? -1.0 : 1.0;  // the face we see
  // v1's straw: umber to gold per blade, soft light on both faces, and the tips glowing gold against the low sun
  float diff = 0.35 + 0.65 * abs(dot(n, uSunDir)), back = pow(max(dot(-v, uSunDir), 0.0), 4.0);
  vec3 straw = mix(vec3(0.4, 0.25, 0.12), vec3(0.98, 0.72, 0.36), s) * (0.85 + 0.3 * s2);
  straw *= 0.55 + 0.45 * h;  // darker down in the straw, so the blades read against each other
  straw = mix(straw, dot(straw, vec3(0.3, 0.55, 0.15)) * vec3(1.12, 0.96, 0.72), 0.45 * uCool);  // after sunset: desaturated ochre, still straw
  float tip = h * h, rim = back * tip * (1.6 + 4.0 * s3 * s3) * uRimK;  // some tips flare gold against the sun
  vec2 hp = base.xz - uHutSh.xy;
  float al = dot(hp, uHutSh.zw), ac = abs(dot(hp, vec2(-uHutSh.w, uHutSh.z)));
  float hutSh = smoothstep(-0.6, 0.8, al) * smoothstep(uHutL.x, uHutL.x * 0.55, al) * smoothstep(uHutL.y, uHutL.y * 0.35, ac);  // the hut's long shadow toward the camera
  vec3 amb = uAmb * mix(vec3(1.0), mix(vec3(0.72, 0.76, 1.0), vec3(1.08, 0.96, 0.8), h), uCool);  // after sunset only the shade goes blue
  vec3 sunL = uSunCol * mix((0.25 + 0.75 * h) * (diff * 0.75 + back * h * 2.6) + rim * 0.5, (diff + rim) * tip * 1.3, uCool);
  vec3 light = amb * (0.35 + 0.65 * h) + sunL * (1.0 - 0.85 * hutSh);
  light = mix(light, vec3(dot(light, vec3(0.3, 0.55, 0.15))) * vec3(1.32, 0.95, 0.5), 0.65 * (1.0 - uCool));  // the red sunset lights the straw gold, not red
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
uniform float uS, uSmokeA, uSmokeCap, uClear, uFoot, uHfPow, uPuff; uniform vec3 uSmokeLow, uSmokeHigh, uSmokeFire; uniform vec4 uCol[7]; varying float vA, vRot; varying vec3 vC, vF;
void main() {
  float hf = pow(aSeed.w, uHfPow), h = hf * uS;  // height follows the smoke amount, so the fall is the rise run backwards (phones: more puffs low, so each column stands on its fire)
  float top = smoothstep(0.55, 1.0, hf) * uS;  // up high the plume flattens and spreads into a ceiling
  vec4 col = uCol[int(position.y + 0.5)];  // each column stands on its front or pile (y carries its index) and rises once that burns
  vec3 p = vec3(position.x, 0.0, position.z) + col.xyz;
  float y = h * 26.0;
  p.y += 0.15 + y - max(y - 15.0, 0.0) * 0.65 + sin(uT * 0.35 + aSeed.z * 6.28) * 0.4 * uS;
  float wide = 0.25 + hf * 0.9 + h * h * 4.5 + top * 13.0 + uClear * (1.0 + hf * 5.0);  // a narrow foot on the fire line, billowing as it climbs
  // triangular spread (two seeds) so a column thins out at its sides instead of stopping on a straight edge
  float jx = aSeed.x + fract(aSeed.y * 7.31 + aSeed.w * 3.7) - 1.0, jz = aSeed.y + fract(aSeed.x * 5.17 + aSeed.w * 1.3) - 1.0;
  p.x += jx * wide * 0.75 + h * h * 15.0 + sin(uT * 0.22 + aSeed.y * 6.28 + hf * 4.0) * 0.5 * uS + sin(h * 0.5 + aSeed.z * 2.0) * h * 0.25;  // leaning downwind
  p.z += jz * wide * (0.5 + 0.6 * top);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = col.w > 0.0 ? min(psize((0.55 + 0.9 * fract(aSeed.y * 5.3 + aSeed.z)) * (uPuff + h * 8.0 + top * 4.0), mv), uSmokeCap * uScale * (0.55 + 0.45 * aSeed.z)) : 0.0;  // a column not lit yet draws nothing
  // thin right at the fire line, densest a little above it, thinning as it climbs, faded right at the lens
  vA = uS * (1.0 - 0.55 * uClear) * uSmokeA * smoothstep(-0.02, uFoot, hf) * (1.0 - 0.6 * hf) * smoothstep(2.0, 7.0, -mv.z);
  vC = mix(uSmokeLow, uSmokeHigh, smoothstep(0.05, 0.5, hf));
  vF = uSmokeFire * (1.0 - smoothstep(0.02, 0.25, hf)) * col.w;
  vA *= (0.45 + 0.9 * fract(aSeed.w * 7.7 + aSeed.x * 3.1)) * col.w;  // some puffs dense, some thin
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

// Fibres: each one is a long thin strip (position.x: side -1/1, position.y: 0 at its head to 1 at its tail) traced back
// along its own path: the tail is where the head was a little earlier in its flow, so a straw follows the flow and bends
// with it. They lift off the stubble, rise along the ribbon's spine (uSpine: an S, moved per beat), leave it for their
// own piece (aPiece; the cutlery branches off lower down) and arc into it. Each piece has its own flow (uFlow), so at
// the forming beat the box nearest the ribbon is still being woven while the cup is done. Width in pixels, tapered.
export const FIBRE = /* glsl */`
attribute vec3 aStart, aEnd;
attribute vec4 aSeed;
attribute float aPiece;
uniform float uT, uScale, uFibA, uFibOut, uSurf, uLift, uLiftK, uSpan, uWid, uStartK, uBranch, uAbs;
uniform float uFlow[6];
uniform vec3 uSpine[5], uStartOff, uStartRef;
varying float vA, vSide, vW, vShade, vTail;
varying vec3 vFC;
const float KOUT[6] = float[6](1.0, 1.0, 1.0, 0.27, 0.25, 0.23);  // where each piece's straws leave the spine (forming beat): the cutlery's at its own height
const float BEND[6] = float[6](0.1, 0.22, 0.3, 0.06, 0.05, 0.04);  // how high their last arc rises (over the box to the bowl and cup)
float gH(vec2 p) { return (0.1 * sin(p.x * 0.9) * cos(p.y * 0.7) + 0.05 * sin(p.x * 2.3 + p.y * 1.7)) * smoothstep(-36.0, -31.0, p.y); }
vec3 cr(vec3 a, vec3 b, vec3 c, vec3 d, float t) { return 0.5 * (2.0 * b + (c - a) * t + (2.0 * a - 5.0 * b + 4.0 * c - d) * t * t + (3.0 * b - a - 3.0 * c + d) * t * t * t); }
// the ribbon's spine through uSpine (world, set per beat and screen shape)
vec3 spine(float k) {
  float f = clamp(k, 0.0, 1.0) * 4.0;
  int i = int(min(floor(f), 3.0));
  return cr(uSpine[max(i - 1, 0)], uSpine[i], uSpine[i + 1], uSpine[min(i + 2, 4)], f - float(i));
}
vec3 at(float fold, float t, float ko, float bend) {
  float u = clamp((fold - aSeed.x * 0.6) / 0.4, 0.0, 1.0), kn = clamp((u - 0.12) / 0.7, 0.0, 1.0), k = kn * ko;  // staggered: some still lifting while others land
  vec3 s = spine(k);
  float wid = (0.14 + 0.3 * smoothstep(0.0, 0.4, kn) * (1.0 - 0.7 * smoothstep(0.7, 1.0, kn))) * uWid;  // loose where it leaves the ground, a sheaf in the middle, gathered at the end
  vec3 j = vec3(fract(aSeed.z * 13.1) + fract(aSeed.y * 3.7), fract(aSeed.z * 7.9) + fract(aSeed.w * 5.1), fract(aSeed.z * 5.3) + fract(aSeed.x * 9.3)) - 1.0;  // denser at the core
  s += j * wid * (1.0 + 1.2 * step(fract(aSeed.z * 31.7), 0.06)) + vec3(0.0, sin(k * 9.0 - t * 1.2 + aSeed.y * 6.28) * 0.07, 0.0);  // a few strays; a slow ripple
  float lift = smoothstep(0.0, 0.14, u), land = smoothstep(0.82, 1.0, u);
  vec3 st = uStartRef + uStartOff + (aStart - uStartRef) * vec3(uStartK, 1.0, uStartK);  // the patch it lifts from, gathered in for the forming beat
  st.y = mix(aStart.y, gH(st.xz) + 0.05, uBranch);
  vec3 e = aEnd + vec3(0.0, uLift, 0.0);  // its spot on the piece, which has risen to chest height
  vec3 c = mix(s, e, 0.5) + vec3(0.0, bend * distance(s, e), 0.0);  // the last arc (straight while bend is 0)
  vec3 q = mix(st, s, lift);
  q.y += (1.0 - lift) * 0.03 * sin(t * 1.5 + aSeed.w * 30.0);
  return (1.0 - land) * (1.0 - land) * q + 2.0 * land * (1.0 - land) * c + land * land * e;  // landing starts once it has lifted (q is s by then)
}
void main() {
  int pc = int(aPiece + 0.5);
  float fold = uFlow[pc], ko = mix(1.0, KOUT[pc], uBranch), bend = BEND[pc] * uBranch;
  float r1 = fract(aSeed.w * 13.7 + aSeed.x * 3.1), r2 = fract(aSeed.y * 9.1 + aSeed.w * 2.3), r3 = fract(aSeed.z * 5.9 + aSeed.y * 1.7);
  float a = position.y, span = (0.012 + 0.02 * r1) * uSpan;  // straws of many lengths, about 0.5 to 1.4 m in flight (longer as they wrap the pieces)
  float uRaw = (fold - aSeed.x * 0.6) / 0.4, u = clamp(uRaw, 0.0, 1.0), lift = smoothstep(0.0, 0.14, u), e = u * u * (3.0 - 2.0 * u), w = 4.0 * e * (1.0 - e);
  vec3 lie = vec3(cos(aSeed.w * 6.28), 0.0, sin(aSeed.w * 6.28)) * 0.3 * (1.0 - lift);  // before it lifts: a short straw lying in the stubble
  vec3 p0 = at(fold - a * span, uT - a * 0.25, ko, bend) + lie * a;
  vec3 p1 = at(fold - (a + 0.05) * span, uT - (a + 0.05) * 0.25, ko, bend) + lie * (a + 0.05);
  mat4 pm = projectionMatrix * modelViewMatrix;
  vec4 c0 = pm * vec4(p0, 1.0), c1 = pm * vec4(p1, 1.0);
  float tr = step(fract(aSeed.y * 17.3), 0.03);  // a few straws trail the presented pieces
  float landOld = (1.0 - 0.75 * smoothstep(0.86, 1.0, u) * (1.0 - tr)) * (1.0 - uSurf * (1.0 - tr * uLiftK));
  float landNew = 1.0 - smoothstep(1.0, 1.0 + span / 0.4, uRaw);  // the forming beat: a straw stays until its tail has gone into the piece
  float alpha = uFibA * smoothstep(0.0, 0.05, u) * (0.6 + 0.4 * smoothstep(0.02, 0.25, e)) * mix(landOld, landNew, uAbs) * (0.75 + 0.25 * w) * (1.0 - uFibOut);
  if (pc > 2) alpha *= 1.0 - uBranch * smoothstep(0.3, 0.8, distance(p0, aEnd + vec3(0.0, uLift, 0.0)));  // the cutlery's straws show only as short wisps trailing into the handles
  if (c0.w < 0.05 || c1.w < 0.05 || alpha <= 0.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);  // at or behind the lens, or not drawn: off clip space
    vA = 0.0;
    return;
  }
  vec2 px = vec2(projectionMatrix[0][0], projectionMatrix[1][1]) / uScale;  // one pixel in NDC
  vec2 dir = (c1.xy / c1.w - c0.xy / c0.w) / px;
  vec2 nrm = length(dir) > 1e-4 ? normalize(vec2(-dir.y, dir.x)) : vec2(0.0, 1.0);
  float wpx = 0.016 * (0.7 + 0.6 * r2) * uScale / c0.w * pow(1.0 - a, 0.8) * (0.55 + 0.45 * smoothstep(0.0, 0.1, a));  // tapered, blunt at the head
  vW = wpx;
  vSide = position.x;
  gl_Position = c0 + vec4(nrm * position.x * (0.5 * max(wpx, 1.0) + 0.75) * px * c0.w, 0.0, 0.0);  // never under a pixel; a little more for soft edges
  vTail = a;
  vFC = r3 < 0.6 ? mix(vec3(1.0, 0.6, 0.22), vec3(0.8, 0.5, 0.24), r3 / 0.6) : mix(vec3(0.8, 0.5, 0.24), vec3(0.95, 0.76, 0.46), (r3 - 0.6) / 0.4);  // gold, tan, pale gold
  vA = alpha * (1.0 - 0.55 * step(fract(aSeed.z * 31.7), 0.06)) * min(wpx, 1.0);  // strays fainter; thinner than a pixel fades
  vShade = (0.7 + 0.4 * fract(aSeed.w * 7.13)) * (0.7 + 0.35 * smoothstep(0.2, 3.0, (modelMatrix * vec4(p0, 1.0)).y));  // darker low by the stubble, brighter up against the sky
}`;

export const FIBRE_F = /* glsl */`
uniform vec3 uFibCol; varying float vA, vSide, vW, vShade, vTail; varying vec3 vFC;
void main() {
  float d = abs(vSide) * (0.5 * max(vW, 1.0) + 0.75);
  float a = vA * clamp(0.5 * max(vW, 1.0) + 0.5 - d, 0.0, 1.0);  // pixel coverage across the strand
  if (a < 0.003) discard;
  gl_FragColor = vec4(vFC * uFibCol.r * vShade * (0.8 + 0.35 * (1.0 - vTail)), a);  // the head catches the light, the tail trails darker
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
  vA *= smoothstep(1.5, 4.0, -mv.z);  // none right at the lens (they bloomed into a white cloud as the camera passed the pieces)
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
  vA *= 0.3 + 0.7 * pow(fract(aSeed.x * 31.7 + aSeed.y * 3.3), 1.5);  // many dim, a few bright
  vC = (b < 0.62 ? vec3(1.0, 0.58, 0.26) : b < 0.88 ? vec3(1.0, 0.78, 0.55) : vec3(0.7, 0.82, 1.0)) * (0.75 + 0.5 * fract(aSeed.x * 7.3));
  vC *= (fract(floorLit * 7.0) < 0.3 ? vec3(1.0, 0.86, 0.72) : vec3(1.0)) * (0.55 + 0.45 * fract(floorLit * 13.0));  // floors differ in warmth and brightness
}`;

export const CITY_F = /* glsl */`
varying float vA; varying vec3 vC;
void main() {
  vec2 c = abs(gl_PointCoord - 0.5) * 2.0;
  gl_FragColor = vec4(vC, vA * smoothstep(1.0, 0.3, max(c.x, c.y * 0.8)));  // soft edges: the city sits a little out of focus
}`;

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
uniform float uStars, uPR, uCity; varying float vA; varying vec3 vC;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = (1.0 + aSeed.x * 1.8) * uPR;
  vA = uStars * (0.4 + 0.6 * aSeed.y) * (0.7 + 0.3 * sin(uT * (1.0 + aSeed.z * 2.0) + aSeed.w * 30.0)) * mix(step(0.97, aSeed.y) * 1.6, 1.0, uCity);  // at dusk only a few clear stars, not a speckle
  vC = vec3(0.9, 0.93, 1.0);
}`;

export const SKY_V = /* glsl */`
varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`;

// Sky: coral away from the sun, gold toward it, mauve, then dusk blue overhead. The broad glow hugs the horizon
// around the sun (kept narrow so the hero heading, left of it, sits on calmer sky); the disc is HDR so it blooms.
export const SKY_F = /* glsl */`
uniform vec3 uHorizon, uCoral, uMid, uZenith, uSunDir, uSunCol, uGlow, uCloudCol; uniform float uSunAmt, uDisc, uCity, uCloud, uCityGlow, uSmokeSky, uT; uniform vec3 uSmokeSun, uSmokeDark; varying vec3 vDir;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  float e = max(d.y, 0.0), s = max(dot(d, uSunDir), 0.0);
  float near = pow(max(dot(normalize(d.xz + 1e-5), normalize(uSunDir.xz)), 0.0), 30.0);
  vec3 col = mix(uCoral, uHorizon, near);
  col = mix(col, uMid, smoothstep(0.0, 0.14, e));
  col = mix(col, uZenith, pow(smoothstep(0.04, 0.6, e), 0.75));
  col += uSunCol * uSunAmt * (near * exp(-abs(d.y - uSunDir.y * 0.6) * 16.0) * 0.5 + pow(s, 12.0) * 0.12);
  col += vec3(1.0, 0.4, 0.09) * uSunAmt * (pow(s, 60.0) * 0.45 + pow(s, 300.0) * 0.8);  // a saturated orange glow right round the disc, not a white haze
  // in the smoke: the sun smothered to a dim warm patch low in the haze, and slow billows in the ceiling
  // in the smoke: dense, dark, warped billows drifting sideways over the upper sky, and a red sun burning through them
  float az0 = atan(d.x, -d.z);
  vec2 bq = vec2(az0 * 2.4 - uT * 0.012, e * 7.0);
  bq += vec2(n2(bq * 1.7 + 4.1), n2(bq * 1.7 + 9.3)) * 0.8 - 0.4;
  float bill = n2(bq) * 0.55 + n2(bq * 2.3 + 1.3) * 0.3 + n2(bq * 5.1 + 7.7) * 0.15;
  float thick = uSmokeSky * smoothstep(0.0, 0.1, e) * smoothstep(0.2, 0.6, bill + 0.15);
  col = mix(col, uSmokeDark * (0.7 + 0.6 * bill), thick * 0.85);
  float ss = max(dot(d, uSmokeSun), 0.0), veil = 1.0 - 0.55 * thick;
  col += vec3(1.0, 0.28, 0.04) * uSmokeSky * veil * (pow(ss, 20.0) * 0.4 + pow(ss, 200.0) * 1.0);
  col = mix(col, vec3(2.4, 0.62, 0.1), uSmokeSky * veil * smoothstep(0.99991, 0.99994, ss));
  // a few thin streaks of cloud: dusky away from the sun, their undersides gold toward it
  float az = atan(d.x, -d.z), band = smoothstep(0.07, 0.12, e) * smoothstep(0.34, 0.2, e);
  float cl = smoothstep(0.5, 0.85, n2(vec2(az * 2.2, e * 26.0)) * 0.7 + n2(vec2(az * 9.0, e * 70.0)) * 0.3) * band * uCloud;
  col = mix(col, uCloudCol + uSunCol * uSunAmt * pow(s, 8.0) * 1.6, cl * 0.75);
  col = mix(col, mix(vec3(3.0, 1.7, 0.6), vec3(5.2, 4.3, 3.2), smoothstep(0.99845, 0.99905, s)), smoothstep(0.99822, 0.99858, s) * uDisc);  // a big low disc (about 3.3 degrees across): near white, a warm edge
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
#ifndef PALM
  p *= 1.0 + 0.24 * sin(p.x * 3.1 + id * 20.0) * sin(p.y * 2.6 + id * 11.0) + 0.14 * sin(p.z * 4.3 + id * 7.0) + 0.06 * sin(p.x * 9.0 + p.y * 7.0 + id * 40.0);  // lobes
  p *= 1.0 + 0.11 * sin(p.x * 14.0 + id * 5.0) * sin(p.y * 12.0 + p.z * 11.0 + id * 3.0) + 0.05 * sin(p.x * 31.0 + p.z * 27.0 + id * 9.0);  // leafy clumps on the silhouette
#endif
  vec4 w = m * vec4(p, 1.0);
  vW = w.xyz; vN = normalize(mat3(m) * normal); vZ = c.z;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const TREE_F = /* glsl */`
uniform vec3 uHaze, uDark, uSunDir, uSunCol; uniform float uSmoke; varying vec3 vN, vW; varying float vZ;
${NOISE}
void main() {
  float far = smoothstep(-50.0, -74.0, vZ);
  vec3 c = mix(uDark, uHaze, 0.08 + 0.45 * far) * (0.8 + 0.3 * n2(vW.xy * 16.0 + vZ) + 0.1 * n2(vW.xy * 4.0)), v = normalize(cameraPosition - vW);  // fine leafy speckle, not stone
  float rim = pow(1.0 - abs(dot(vN, v)), 4.0) * smoothstep(0.2, 0.8, abs(vN.y)) * smoothstep(0.45, 0.9, n2(vW.xy * 22.0));  // leaves catching light on the upper edges, broken up
  float toward = pow(max(dot(-v, uSunDir), 0.0), 16.0);
  c += uSunCol * rim * (0.03 + 0.45 * toward) * (1.0 - 0.6 * far);
  c = mix(c, uHaze, smoothstep(1.8, -0.3, vW.y) * 0.75);  // low ground mist
  gl_FragColor = vec4(mix(c, uHaze, uSmoke), 1.0);
  #include <tonemapping_fragment>
}`;

// Field ground under the blades: furrows between the harvest rows (long shadows toward the low sun), a black
// charred band between each ignition line and its front with faint embers in it, a hot rim on the front and warm
// light on the stubble around it; the same around the burning piles.
export const GROUND_FX = /* glsl */`
  if (uCityGround < 0.99) {
    float burnt = 0.0, smoulder = 0.0, rim = 0.0, glow = 0.0;
    if (uChar + uFireAmt > 0.001) {  // only while the fields burn
      float j1 = (n2(vWP.xz * 3.5) - 0.5) * 0.3 + (n2(vWP.xz * 0.8) - 0.5) * 0.4;
      for (int i = 0; i < 5; i++) {
        vec2 a = uFires[i].xy, ab = uFires[i].zw - a;
        float L = length(ab), k = dot(vWP.xz - a, ab) / (L * L), sl = k * L, sd = dot(vWP.xz - a, vec2(-ab.y, ab.x) / L) + j1;
        float age = fAge(i, clamp(k, 0.0, 1.0)), lit = smoothstep(0.0, 0.02, age), ends = smoothstep(-0.3, 0.4, min(sl, L - sl) + j1 * 2.0);
        float off = fOff(i, sl, L, age), w0 = fWob(float(i), sl), df = sd - off;
        float b = lit * ends * smoothstep(-0.12, 0.12, df) * smoothstep(w0 + 0.55, w0 + 0.2, sd);
        burnt = max(burnt, b);
        smoulder = max(smoulder, b * smoothstep(1.8, 0.1, df) * pow(smoothstep(0.6, 0.95, n2(vWP.xz * 11.0 + uT * 0.15)), 2.0));  // sparse embers
        rim = max(rim, lit * ends * exp(-abs(df) * 14.0));
        glow += lit * ends * exp(-abs(df) * 0.9);
      }
      for (int i = 0; i < 2; i++) {
        float d = length(vWP.xz - uPiles[i].xy) + j1 * 2.0, R = uPiles[i].z, am = pAmt(i);
        burnt = max(burnt, step(0.0, uBurn - uPileT[i]) * smoothstep(R + 0.9, R + 0.4, d));
        glow += am * exp(-max(d - R, 0.0) * 0.6);
      }
    }
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(dot(gl_FragColor.rgb, vec3(0.3, 0.55, 0.15))) * vec3(1.32, 0.95, 0.5), 0.65 * (1.0 - uCityGround));  // straw-gold soil under the red sunset, like the blades
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.018, 0.016, 0.015) + vec3(0.9, 0.2, 0.03) * smoulder * (0.2 + 0.8 * uFireAmt), uChar * burnt * 0.96);
    gl_FragColor.rgb += vec3(1.0, 0.42, 0.12) * uFireAmt * min(glow, 1.5) * 0.22 * (1.0 - 0.8 * burnt) + vec3(1.0, 0.55, 0.18) * uFireAmt * rim * 0.9;  // lit stubble; a hot rim on the front
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

// The packaging models as they form (film.js pulpForm): the side away from the ribbon is pressed first; the rest is still
// a weave of straw (a criss-cross of strands, sparser away from the front) that the incoming fibres fill. Once pressed:
// soft dimples and fibre streaks in the normal, uneven roughness, a warm rim against the sky.
export const FORM = /* glsl */`
uniform vec3 uRim, uWipeC, uWipeD;
uniform float uForm, uLat;
varying vec3 vFormW, vFormO;
float fh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float fn(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fh(i), fh(i + vec3(1, 0, 0)), f.x), mix(fh(i + vec3(0, 1, 0)), fh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(fh(i + vec3(0, 0, 1)), fh(i + vec3(1, 0, 1)), f.x), mix(fh(i + vec3(0, 1, 1)), fh(i + 1.0), f.x), f.y), f.z);
}
`;
export const FORM_MASK = /* glsl */`
  float front = mix(-1.6, 1.5, uForm), fib = 0.0, hgt = fn(vFormO * vec3(160.0, 110.0, 160.0));  // hgt: the pressed pulp's soft dimples (bump and roughness)
  if (uForm < 1.5) fib = step(front, dot(vFormW - uWipeC, uWipeD) + (fn(vFormO * 90.0) - 0.5) * 0.5);  // -1 on the far side .. 1 where the straws come in, a ragged edge (none once pressed)
  if (fib > 0.5) {
    float fw = dot(vFormW - uWipeC, uWipeD);
    vec3 o = vFormO * 120.0;
    float wv = fn(o * 0.35) * 0.6;
    float l1 = abs(fract(o.x + o.y * 0.7 + o.z * 0.9 + wv) - 0.5);
    float l2 = abs(fract(o.x * 0.9 - o.y * 0.6 - o.z + wv * 1.3) - 0.5);
    if (min(l1, l2) > 0.15 - 0.09 * smoothstep(0.0, 1.5, fw - front)) discard;
  }
`;
export const FORM_BUMP = /* glsl */`
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  vec3 br1 = cross(dpy, normal), br2 = cross(normal, dpx);
  float bdet = dot(dpx, br1);
  vec3 nb = abs(bdet) * normal - sign(bdet) * (dFdx(hgt) * br1 + dFdy(hgt) * br2) * 0.0008 * (1.0 - fib);
  normal = dot(nb, nb) > 1e-30 ? normalize(nb) : normal;  // degenerate derivatives: keep the normal (a NaN would spread through the bloom)
`;
