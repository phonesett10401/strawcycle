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
  [1.2, 3.6, -3.5, 0, 2.4, -16],    // above the field, smoke gone, straw lifting; low enough to keep the horizon
  [-0.4, 1.45, -10.5, 0, 0.7, -14], // close on the box, bowl and cup, resting on the straw
  [0, 1.95, -39.4, 0, 0.95, -44.5],  // the café table, city lights beyond
];
// Portrait screens see a narrow slice: the hut turned into the right third, the packaging and the whole café table
// pulled back so they fit, the table low in the frame under the doors.
const KEYS_TALL = [
  [0, 1.7, 9, 9, 18.5, -30],     // tilted up: sunset sky behind the hero text, sun, hut and field low in the frame
  KEYS[1], KEYS[2],
  [-0.4, 2.0, -8.6, 0, 0.7, -14],
  [0, 2.85, -36.8, 0, 2.3, -42],
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
  return {
    camera: { ...cam, x: cam.x + 0.05 * Math.sin(t * 0.6), y: cam.y + 0.05 * Math.sin(t * 0.45 + 1) },
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
