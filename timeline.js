// Pure film logic for the Home scroll film: scene state from scroll progress p (0..1) and time t (s).
// No DOM, no Three. film.js draws from params(); a video renderer can call it with any (p, t).

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sceneAt(p) {
  const q = clamp01(p);
  const index = Math.min(3, Math.floor(q * 4));
  return { index, local: Math.min(1, q * 4 - index) };
}

// Camera path: x, y, z, lookX, lookY, lookZ, evenly spaced over p (one unbroken move through the four beats).
const KEYS = [
  [0, 1.7, 9, 1.5, 2.4, -30],       // low in the stubble, facing the sunset
  [-2.5, 3.2, 2, 1, 2.2, -24],      // rising as the fires start
  [1.2, 3.66, -3.5, 4.36, 2.39, -15.7],  // above the field, smoke gone, straw lifting; turned right so the hut sits whole in the frame at p 0.6
  [-0.43, 0.78, -12.31, -1.11, 0.86, -14.54], // (re-solved with keys 2 and 4 so p 0.72 is unchanged) low in the stubble, the packaging floating just above chest height, up and right of the caption
  [0, 1.1, -41.15, 0, 0.86, -42.65],  // seated, pulled back: the whole table setting (candle and cutlery too) in the lower half, the city and the festoon above
];
// Portrait screens see a narrow slice: the hut turned into the right third, the packaging and the whole café table
// pulled back so they fit, the table low in the frame under the doors.
const KEYS_TALL = [
  [2.30, 1.43, 5.84, 6.82, 4.90, -22.19], // close on the hut (a third of the width) with the big sun over the hills; horizon at 57%
  [2.56, 2.59, 4.17, 10.55, 0.68, -27.14], // pulled back: the farmer, the piles and the hut in one narrow frame
  [0.88, 3.05, -1.39, 4.30, 0.24, -19.03],
  [0.04, 0.96, -10.29, -0.37, 1.12, -12.58], // low, the pieces across the middle third with the ribbon on their left (keys 0-3 solved together, p 0.05-0.6 kept)
  [-0.02, 1.22, -40.7, -0.02, 0.86, -42.6], // pulled back over the table (lower half): candle to cup in the width, the lit skyline between the buttons and the railing
];

function catmull(a, b, c, d, u) {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (3 * b - a - 3 * c + d) * u3);
}

function cameraAt(p, keys) {
  const f = clamp01(p) * (keys.length - 1);
  const i = Math.min(keys.length - 2, Math.floor(f)), u = f - i;
  const k = (j) => keys[Math.min(keys.length - 1, Math.max(0, j))];
  const [x, y, z, lookX, lookY, lookZ] = [0, 1, 2, 3, 4, 5].map((n) => catmull(k(i - 1)[n], k(i)[n], k(i + 1)[n], k(i + 2)[n], u));
  return { x, y, z, lookX, lookY, lookZ };
}

export function params(p, t, tall = false) {
  const q = clamp01(p);
  const fire = smooth(0.2, 0.32, q) * (1 - smooth(0.32, 0.45, q));
  const smoke = smooth(0.3, 0.37, q) * (1 - smooth(0.37, 0.5, q));
  const cam = cameraAt(q, tall ? KEYS_TALL : KEYS);
  const flicker = 1 - 0.05 * (0.5 + 0.5 * Math.sin(t * 9)); // idle: small, keeps fire in 0..1
  // the idle sway settles at the café: its look point is close, so a sway there tilts the whole frame (one framing for every visit)
  const sway = 0.05 * (1 - 0.85 * smooth(0.75, 1, q));
  return {
    camera: { ...cam, x: cam.x + sway * Math.sin(t * 0.6), y: cam.y + sway * Math.sin(t * 0.45 + 1) },
    sun: 1 - q,
    fire: fire * flicker,
    smoke,
    clear: q < 0.37 ? 0 : 1 - smoke,
    fold: smooth(0.5, 0.72, q),
    fly: smooth(0.72, 0.9, q),
    city: smooth(0.75, 1, q),
  };
}

// Piecewise-linear through [x, y] points with ascending x, clamped at both ends (scroll -> p, and p -> scroll swapped).
export function through(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  }
  return pts[pts.length - 1][1];
}

export const counter = (base, perSecond, t) => Math.floor(base + perSecond * t);

export const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };

export function shouldUse3D({ webgl, reducedMotion, frameMs }) {
  if (!webgl || reducedMotion) return false;
  return frameMs.length === 0 || median(frameMs) <= 40;
}

// Rolling check for the whole visit: true once a full window of recent frames has a median over 40 ms.
export const tooSlow = (frameMs, window = 60) => frameMs.length >= window && median(frameMs.slice(-window)) > 40;
