// Detail tiers and URL flags for the Home film. Pure: no DOM, no Three.
// density multiplies v1's particle/instance counts; dpr is the pixel-ratio cap (null = set by capture size).
const tier = (name, dpr, post, msaa, density) => Object.freeze({ name, dpr, post, msaa, density });
export const TIERS = Object.freeze({
  low: tier('low', 1, false, false, 1),
  high: tier('high', 1.5, true, true, 10),
  ultra: tier('ultra', null, true, false, 30),
});

// PCs and laptops start on High, integrated GPUs too (the slow-frame ladder below still steps down); phones and
// tablets start on Low.
export const pickTier = ({ width, coarse, deviceMemory, video }) => {
  if (video) return 'ultra';
  return width < 768 || coarse || (deviceMemory != null && deviceMemory <= 4) ? 'low' : 'high';
};

// Live slow-frame ladder. A low start begins at 'low'.
export const STEPS = ['high', 'high-dpr1', 'low', 'stills'];
export const nextStep = (step) => STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(step) + 1)];

export function parseFilmFlags(search) {
  const q = new URLSearchParams(search), mode = q.get('film');
  const num = (k) => { const s = q.get(k); return s === null || s.trim() === '' ? NaN : Number(s); };
  const p = num('p'), t = num('t'), m = ['video', 'off', 'bench', 'on'].includes(mode) ? mode : null;
  return {
    mode: m,
    p: Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : null,
    t: Number.isFinite(t) && t >= 0 ? t : null,
    tier: m === 'video' && q.get('tier') === 'low' ? 'low' : q.get('tier') === 'high' ? 'high' : null,  // ?tier=high: test High on any PC
  };
}
