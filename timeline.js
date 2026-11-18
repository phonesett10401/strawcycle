// Pure film logic for the Home scroll film: scene state from scroll progress p (0..1) and time t (s).
// No DOM, no Three. Task 7 draws from params(); a video renderer can call it with any (p, t).

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

// Placeholder camera path (Task 7 retunes): x, y, z, lookX, lookY, lookZ, evenly spaced over p.
const KEYS = [
  [0, 6, 3, 0, 0, 1, -4],
  [4, 5, 2.5, 0, 1, 1.5, -4],
  [-4, 6, 4, 0, 2, 1, -4],
  [0, 3, 8, 0, 0, 2, -4],
  [0, 10, 12, 0, 0, 0, -4],
];

function catmull(a, b, c, d, u) {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (3 * b - a - 3 * c + d) * u3);
}

function cameraAt(p) {
  const f = clamp01(p) * (KEYS.length - 1);
  const i = Math.min(KEYS.length - 2, Math.floor(f)), u = f - i;
  const k = (j) => KEYS[Math.min(KEYS.length - 1, Math.max(0, j))];
  const [x, y, z, lookX, lookY, lookZ] = [0, 1, 2, 3, 4, 5].map((n) => catmull(k(i - 1)[n], k(i)[n], k(i + 1)[n], k(i + 2)[n], u));
  return { x, y, z, lookX, lookY, lookZ };
}

export function params(p, t) {
  const q = clamp01(p);
  const fire = smooth(0.2, 0.32, q) * (1 - smooth(0.32, 0.45, q));
  const smoke = smooth(0.3, 0.37, q) * (1 - smooth(0.37, 0.5, q));
  const cam = cameraAt(q);
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

export const counter = (base, perSecond, t) => Math.floor(base + perSecond * t);

export function shouldUse3D({ webgl, reducedMotion, frameMs }) {
  if (!webgl || reducedMotion) return false;
  const s = [...frameMs].sort((a, b) => a - b);
  return s.length === 0 || s[Math.floor((s.length - 1) / 2)] <= 40;
}
