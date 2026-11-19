# StrawCycle film v2: design

Date: 2026-11-19. Status: draft for approval. Builds on `2026-11-19-strawcycle-design.md` (the site design), which still binds everything this doc does not change.

## Intent and the why

The Home film works and tells the story, but it does not look like the Abyssal Garden demo that inspired it. The user wants it at that level: it is the opening of the projector video and the first thing classmates see on their phones.

The gap is not missing 3D models (Abyssal Garden uses none). It comes from three choices in v1:

1. **Phones were the hard limit for everyone.** v1 banned post-processing and kept particle counts low, so laptops and the video got the phone look.
2. **No glow, light or atmosphere.** No bloom, no tone mapping, no light rays, no haze: those carry most of Abyssal Garden's look.
3. **One polish round.** Abyssal Garden iterated against a separate visual critic, which saw only renders, until nothing above "minor" was left.

v2 fixes all three in code (Phase A), then adds hand-modelled hero objects made in Blender (Phase B).

## Goals

- On a laptop and in the projector video, the film looks cinematic: glowing fire and embers, warm sunset light rays, haze, a dense field moving in the wind, full smoke, crisp packaging, a rich café.
- On phones it still runs smoothly and degrades gracefully, as it does now.
- The video can be rendered at a quality no device runs live.
- A separate critic, seeing only renders, reports nothing above "minor" at the fixed viewpoints.

## Non-goals

- No change to the story, the beats, the captions, the doors or any other page.
- No raw-WebGPU rewrite (approach C, declined): older iPhones must still run the film.
- The video itself stays a separate project; v2 only makes the film ready for it.
- No sound.

## Anti-goals

- A film that stutters or heats phones (the v1 anti-goal still holds).
- Breaking determinism: `window.scFilm.render(p, t)` must still give identical frames for identical inputs under `?film=video`.
- "Tech demo" look: neon, oversaturated bloom, lens-flare clichés. The look is a warm, natural dusk.
- A heavy first load: the page must show captions and doors before any 3D or models arrive.

## Constraints

- Three.js stays, pinned at `0.170.0` from jsdelivr. Post-processing comes from the same version's addons (`three/addons/` mapped to `https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/`). No build step, no npm installs in the site.
- `timeline.js` stays the single source of story timing. Its tests stay green; new pure logic gets tests.
- The fallback to stills (no WebGL, reduced motion, too slow, CDN failure, context loss) keeps working.
- Global constraints of the site plan still apply (light/dark, 375 px, reduced motion, no innerHTML for user text).

## Approaches considered

- **A. Visual quality pass in code (chosen first).** Detail tiers, post-processing, denser instanced geometry, better smoke and light, then a critic loop.
- **B. Blender hero objects (chosen second).** Model the hut, packaging and café in Blender with baked lighting, export compressed glTF, load them after the first frame.
- C. Raw WebGPU rewrite. Highest ceiling, but loses older iPhones and is a big rewrite. Declined.

The user picked "A, then Blender".

## Phase A: visual quality pass

### Detail tiers

One `tier` chosen at start, then adjusted live:

| Tier | Who gets it | Pixel ratio | Post-processing | Density (roughly) |
|---|---|---|---|---|
| **Low** | Phones, weak devices, after a slow-frame step-down | 1 | Tone mapping only (no full-screen passes) | today's counts |
| **High** | Laptops and desktops (the live projector demo) | up to 1.5 | Bloom, tone mapping, light rays, haze | about 10× today's field and fibres |
| **Ultra** | Only under `?film=video` | set by the capture tool (target 3840×2160) | Everything, heavier bloom and more samples | about 3× High |

- Start tier: Low when the screen is narrow (under 768 px) or `navigator.deviceMemory` is 4 or less; otherwise High. Ultra only from the flag.
- The existing rolling slow-frame check steps down in small stages: High → High at pixel ratio 1 → Low → stills. It never steps up during a visit.
- A tier is a plain object of numbers (counts, pixel ratio, which passes are on), defined in one place and unit-tested for the selection rules.

### What gets better

- **Post-processing (High, Ultra):** bloom tuned so only fire, embers, sun, packaging glow and city lights bloom; ACES filmic tone mapping with a warm grade; a cheap sunset light-ray pass (screen-space radial blur from the sun's screen position, faded by `sun`); height haze that thickens with `smoke`.
- **Field:** instanced straw blades (hundreds of thousands on High) with wind sway in the vertex shader as a function of `t`, colour varied per blade, lit by the sun then the fires then the packaging glow.
- **Smoke:** soft, noise-shaped puffs (procedural noise in the shader, no image files), lit from below by the fires, rising in columns and reversing with `clear`. Overdraw capped per tier.
- **Fire and embers:** more embers, flame flicker as a function of `t`, embers that bloom.
- **Straw into packaging:** many more fibres with short glowing trails; they settle into crisp box, bowl and cup outlines, then a solid straw-fibre surface fades in so the objects read as real packaging.
- **Café:** warm bulb string, table light pooling, city depth with haze, the packaging catching light.
- **Sky:** a richer sunset gradient into dusk, a sun disc that blooms, stars at the end.

All new values are pure functions of `p`, `t` and seeded randoms, so determinism holds.

### The critic loop (the quality gate)

- Six fixed viewpoints: p = 0.05, 0.2, 0.37, 0.6, 0.72, 1.0, at t = 2.
- Render each at 1920×1080 on High, plus p = 0.05, 0.37, 1.0 at 390×844 on Low (phone check).
- A separate critic subagent sees only these images (never code or reasoning) plus the spec's description of each beat, and returns prioritised, concrete visual defects (banding, aliasing, muddy colour, unreadable shapes, empty frame areas, tech-demo look).
- The builder fixes and re-renders until the critic reports nothing above "minor", capped at five rounds; anything left is reported to the user.

### Performance gate

- High: median frame time ≤ 16.7 ms at 1920×1080 on this laptop during a scripted scroll through the film.
- Low: the existing check still steps down to stills on slow devices; phone screenshots stay readable.
- Ultra has no live budget (offline video only).

## Phase B: Blender hero objects

- Install Blender (4.2 or newer, about 400 MB) and the `cli-anything-blender` connector through `cli-hub` at the start of Phase B. The user's choice of "A, then Blender" is the go-ahead; the CLI connector gets a SkillSpector scan and a read of its SKILL.md first, as the global CLAUDE.md requires.
- Model, as Blender Python scripts kept in the repo (`blender/*.py`) so the assets can be rebuilt:
  - the farmer's hut (bamboo and thatch);
  - the meal box, bowl and cup with a pressed-straw-fibre look;
  - the café table, two chairs and a bulb string.
- Bake lighting into textures so they look rich at no live cost.
- Export glTF binary (`models/*.glb`) with meshopt compression and WebP textures. Budget: all models together under 1.5 MB.
- The film loads them after its first frame. Until they arrive, or if they fail, the current procedural shapes stay. The fibre fold targets come from the same packaging shapes so straw folds into the real boxes.
- Phase B re-runs the critic loop at the same viewpoints.

## Settled details (from the builder check)

- **Load cost.** Captions and doors appear before any 3D, as now. The post-processing addons are imported only on High and Ultra, lazily after the first plain frame, with their imports pinned to the same `0.170.0` addons path. Extra JavaScript for High stays under about 150 KB gzipped. Models (Phase B) load after the first frame and never block it.
- **Performance measurement.** The laptop is an RTX 5060 Laptop GPU (with an AMD Radeon 610M integrated GPU as well). A dev flag `?film=bench` runs a scripted scroll through the whole film in the real browser (not headless) and logs median and 95th-percentile frame times. Gate: High median ≤ 16.7 ms at 1920×1080 on the RTX 5060. If the gate is missed, High counts come down; the budget does not move. On the integrated GPU, the slow-frame check must step down smoothly (checked once by forcing the browser onto it, if possible, or by simulated slow frames).
- **Determinism.** Under `?film=video`, frames must be **byte-identical** for identical `(p, t)`, as in v1. All passes are pure in `p` and `t`: no temporal anti-aliasing, no frame accumulation, no feedback buffers, no unseeded noise. MSAA stays off under `?film=video`; a deterministic post-process anti-aliasing pass (FXAA or SMAA) handles edges there. Visitors keep MSAA.
- **Fixed renders.** `?film=video&p=<p>&t=<t>` renders one frame at that point, so the builder (and later the video tool) can capture exact frames in the real browser pane on the real GPU.
- **Critic loop.** The builder captures the renders. The controller dispatches the critic as a separate subagent that receives only the image files and the spec's one-line description of each beat. "Five rounds" means five render, critique and fix cycles at most.
- **Start tier.** Low when the screen is under 768 px wide, **or** the primary pointer is coarse (`matchMedia('(pointer: coarse)')`, which covers phones and tablets), **or** `navigator.deviceMemory` is 4 or less where the browser reports it. Otherwise High.
- **Stills.** After Phase A, Ultra renders at the four beats become the fallback stills (`images/scene-N.jpg` at 16:9 and `scene-N-tall.jpg` at 9:16), replacing the SVG placeholders. The user's ChatGPT images are then needed only for the video's transitions. No other page uses the stills.
- **Phase B models.** Modelled from scratch as Blender Python scripts, stylised low-poly with soft bevels, matching the site palette (straw gold, ember, smoke grey, dusk blue). Moderate detail: recognisable silhouettes and pleasing close-ups, not photoreal. Each asset gets a Blender preview render for the critic before it goes into the film.
- **Baked versus live light.** Models get baked ambient occlusion only; the film's live lighting (sun, fire, packaging glow, café bulbs) lights them on top, so they look right in every beat.
- **Branch.** `feat/site` exists in `C:\strawcycle` (v1, 15 commits, unmerged). `feat/film-v2` branches from its tip.

## Branching and order

- Work on a new branch `feat/film-v2` from `feat/site`, so v1 stays safe and can still be merged on its own.
- Phase A is built and reviewed first and is useful alone. Phase B follows.

## Decided by the user

- Upgrade path "A, then Blender"; no WebGPU rewrite.
- Blender may be installed for Phase B.

## My calls (the user can change any)

- Three tiers (Low, High, Ultra) and how the start tier is picked.
- Post-processing from three.js addons at the pinned version; cheap screen-space light rays instead of volumetric lighting.
- Six critic viewpoints, five-round cap, and the 16.7 ms High budget.
- Assets built from Blender Python scripts kept in the repo; 1.5 MB budget; meshopt + WebP.
- Branch `feat/film-v2`.
- Everything under "Settled details": the load and performance budgets, byte-exact determinism with FXAA/SMAA for video, the start-tier rule, Ultra renders as the new stills, the Phase B modelling style, and baked AO plus live light.

## Left to the builder

Exact shader code, bloom and grade values, blade and particle counts within each tier, the light-ray technique details, Blender modelling details, and test cases beyond tier selection and determinism.
