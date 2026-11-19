"""The farmer for the burning scene: a northern Thai rice farmer striding, lighting the stubble with a bamboo torch.

blender --background --factory-startup --python blender/farmer.py -- [out.glb] [preview dir]

1.65 m tall standing (the stride and lean bring the crown to about 1.6 m; the hat's peak is about 1.73 m).
Origin at the feet, facing glTF +Z. Seen as a silhouette at 20-40 m, so the detail goes into the outline:
the ngob hat's brim, the torch line, the loose shirt, rolled trousers and the cloth over the shoulder. No face.
Nodes: farmer (body, clothes, hat, torch) and torch_flame (emissive material 'flame').
"""
import math
import os
import random
import sys

from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import common  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
GLB = os.path.abspath(ARGS[0] if ARGS else os.path.join(ROOT, 'models', 'farmer.glb'))
OUT = os.path.abspath(ARGS[1] if len(ARGS) > 1 else os.path.join(ROOT, 'docs', 'film-renders', 'assets'))
MAX_BYTES = 120 * 1024
V = Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
SHIRT = common.pbr('cloth_indigo', common.srgb(34, 38, 58), rough=0.95)        # mor hom indigo
TROUSERS = common.pbr('cloth_dark', common.srgb(28, 27, 30), rough=0.95)
SCARF = common.pbr('cloth_red', common.srgb(110, 38, 30), rough=0.9)           # pha khao ma over the shoulder
SKIN = common.pbr('skin', common.srgb(92, 62, 44), rough=0.7)
HAT = common.pbr('straw_hat', common.srgb(176, 146, 96), rough=0.9)
BAMBOO = common.pbr('torch_bamboo', common.PALETTE['field_muted'], rough=0.8)
BUNDLE = common.pbr('torch_straw', common.srgb(120, 92, 52), rough=1.0)
FLAME = common.pbr('flame', (1, 0.7, 0.35, 1), rough=1.0, emission=(1.0, 0.5, 0.15, 1.0))
parts = []


def limb(pts, radii, mat, sides=10, fil=0.05):
    p = common.fillet(pts, fil, n=3) if len(pts) > 2 else pts
    # radii follow the filleted points by nearest original point along the path
    import numpy as np
    d0 = np.cumsum([0] + [(V(pts[i + 1]) - V(pts[i])).length for i in range(len(pts) - 1)])
    d1 = np.cumsum([0] + [(V(p[i + 1]) - V(p[i])).length for i in range(len(p) - 1)])
    rr = list(np.interp(d1 / d1[-1], d0 / d0[-1], radii))
    o = common.tube('limb', p, rr, mat, sides)
    parts.append(o)
    return o


def blob(centre, r, mat, segs=14, squash=(1, 1, 1)):
    prof = [(r * math.sin(a), -r * math.cos(a)) for a in [math.pi * k / 8 for k in range(9)]]
    o = common.lathe('blob', prof, segs, mat)
    o.data.transform(Matrix.Translation(centre) @ Matrix.Diagonal(V(squash)).to_4x4())
    parts.append(o)
    return o


# skeleton (Blender: z up, the figure faces -Y); the left leg strides forward, the body leans into the step
HIP_L, HIP_R = V((-0.095, -0.02, 0.9)), V((0.095, 0.03, 0.9))
KNEE_L, KNEE_R = V((-0.11, -0.21, 0.49)), V((0.105, 0.15, 0.48))
ANK_L, ANK_R = V((-0.115, -0.33, 0.085)), V((0.115, 0.32, 0.12))
SPINE = [V((0, 0, 0.9)), V((0, -0.04, 1.1)), V((0, -0.085, 1.3)), V((0, -0.12, 1.43))]
HEAD = V((0, -0.165, 1.53))
SH_L, SH_R = V((-0.17, -0.1, 1.38)), V((0.17, -0.09, 1.37))
EL_L, WR_L = V((-0.235, 0.0, 1.13)), V((-0.255, 0.06, 0.9))
EL_R, WR_R = V((0.245, -0.13, 1.13)), V((0.262, -0.31, 0.92))

# legs: trousers to mid-calf with a rolled cuff, bare calves and feet
for hip, knee, ank, toe, s in ((HIP_L, KNEE_L, ANK_L, V((-0.12, -0.5, 0.03)), -1), (HIP_R, KNEE_R, ANK_R, V((0.12, 0.17, 0.025)), 1)):
    roll = knee + (ank - knee) * 0.42
    limb([hip + V((0, 0, 0.04)), knee, roll], [0.1, 0.075, 0.068], TROUSERS, 12, 0.08)
    cuff = roll + (ank - knee).normalized() * 0.01
    limb([roll - (ank - knee).normalized() * 0.035, cuff + (ank - knee).normalized() * 0.03], [0.074, 0.076], TROUSERS, 12)
    limb([roll, ank], [0.047, 0.034], SKIN, 8)
    heel = ank + (ank - toe).normalized() * 0.05 + V((0, 0, -0.04))
    limb([heel, ank + V((0, 0, -0.03)), toe], [0.032, 0.04, 0.026], SKIN, 8, 0.03)
blob(V((0, 0.0, 0.9)), 0.15, TROUSERS, squash=(1.0, 0.8, 0.75))  # seat of the trousers

# loose long shirt: rings along the spine, flared at the hem, which hangs over the trousers
rng = random.Random(3)
rings = []
for z, hw, hd, fl in ((0.76, 0.215, 0.16, 1), (0.84, 0.205, 0.15, 0), (0.95, 0.19, 0.135, 0), (1.12, 0.19, 0.13, 0),
                      (1.27, 0.2, 0.125, 0), (1.35, 0.2, 0.115, 0), (1.40, 0.175, 0.1, 0), (1.44, 0.12, 0.085, 0),
                      (1.47, 0.065, 0.06, 0)):  # sloping shoulders, not a box
    c = SPINE[0] + (SPINE[-1] - SPINE[0]) * ((z - 0.76) / 0.7)
    c.z = z
    ring = []
    for k in range(24):
        a = 2 * math.pi * k / 24
        j = 1 + (rng.uniform(-0.04, 0.05) if fl else 0)
        ring.append((c.x + hw * j * math.cos(a), c.y + hd * j * math.sin(a), z + (rng.uniform(-0.025, 0.01) if fl else 0)))
    rings.append(ring)
parts.append(common.loft('shirt', rings, SHIRT))
for sh, el, wr in ((SH_L, EL_L, WR_L), (SH_R, EL_R, WR_R)):  # loose sleeves, flared a little at the cuff
    limb([sh + (sh - el).normalized() * 0.03, el, wr], [0.068, 0.058, 0.064], SHIRT, 10, 0.06)
    hand = wr + (wr - el).normalized() * 0.07
    limb([wr, hand], [0.034, 0.03], SKIN, 8)
limb([SPINE[-1], HEAD + V((0, 0.01, -0.06))], [0.05, 0.045], SKIN, 8)
blob(HEAD, 0.105, SKIN, 16, (0.9, 1.0, 1.08))

# cloth over the left shoulder, ends hanging loose in front and behind, with a fringe
path = [V((-0.115, -0.24, 0.98)), V((-0.13, -0.225, 1.2)), V((-0.155, -0.16, 1.4)), V((-0.17, -0.07, 1.47)),
        V((-0.16, 0.03, 1.42)), V((-0.145, 0.09, 1.25)), V((-0.13, 0.12, 1.02))]
path = [V(p) for p in common.fillet([tuple(p) for p in path], 0.06, n=3)]
rings = []
for i, p in enumerate(path):
    t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
    w = (V((1, 0.15, 0)) - t * V((1, 0.15, 0)).dot(t)).normalized()
    th = t.cross(w)
    hw = 0.065 + 0.012 * (1 - abs(2 * i / (len(path) - 1) - 1))
    rings.append([p + w * hw * math.copysign(abs(math.cos(a)) ** 0.33, math.cos(a)) + th * 0.009 * math.copysign(abs(math.sin(a)) ** 0.33, math.sin(a))
                  for a in [2 * math.pi * k / 12 for k in range(12)]])
parts.append(common.loft('scarf', [[tuple(v) for v in r] for r in rings], SCARF))
for end, d in ((0, -1), (len(path) - 1, 1)):
    p, t = path[end], (path[end] - path[end - d]).normalized()
    w = (V((1, 0.15, 0)) - t * V((1, 0.15, 0)).dot(t)).normalized()
    for f in range(5):
        a = p + w * (-0.05 + 0.025 * f)
        limb([a, a + t * (0.05 + 0.02 * (f % 2)) + V((0, 0, -0.01))], [0.006, 0.004], SCARF, 5)

# ngob: a wide shallow woven cone with a rolled rim and a crown band, tilted forward with the head
hat_p = common.fillet([(0, 0.155), (0.27, 0.012), (0.285, 0.004), (0.29, -0.006), (0.278, -0.008), (0.26, 0.0), (0.08, 0.1), (0, 0.13)],
                      [0, 0.01, 0.006, 0.006, 0.004, 0.006, 0.02, 0], n=2)
hat = common.lathe('hat', hat_p, 40, HAT)
band = common.lathe('band', common.fillet([(0.085, 0.05), (0.09, 0.05), (0.095, 0.1), (0.07, 0.1)], 0.005, n=2, closed=True), 24, HAT, closed=True)
for o in (hat, band):
    o.data.transform(Matrix.Translation(HEAD + V((0, -0.01, 0.025))) @ Matrix.Rotation(math.radians(14), 4, 'X'))
    parts.append(o)

# bamboo torch held low in the right hand, angled down to the stubble ahead; a straw bundle bound at the tip
grip = WR_R + (WR_R - EL_R).normalized() * 0.05
TIP = V((0.36, -1.02, 0.24))
axis = (TIP - grip).normalized()
butt = grip - axis * 0.2
pole = common.tube('torch', [butt, TIP - axis * 0.12], [0.017, 0.015], BAMBOO, 8)
parts.append(pole)
bun = common.lathe('bundle', common.fillet([(0, 0), (0.03, 0.01), (0.048, 0.07), (0.05, 0.15), (0.038, 0.21), (0, 0.225)],
                                           [0, 0.01, 0.02, 0.02, 0.01, 0], n=2), 10, BUNDLE)
bun.data.transform(Matrix.Translation(TIP - axis * 0.2) @ V((0, 0, 1)).rotation_difference(axis).to_matrix().to_4x4())
parts.append(bun)
for k, t in enumerate((0.04, 0.12)):  # bindings
    b = common.lathe('bind', common.fillet([(0.05, -0.008), (0.054, 0), (0.05, 0.008)], 0.003, n=2) + [(0.03, 0.008), (0.03, -0.008)], 10, BAMBOO, closed=True)
    b.data.transform(Matrix.Translation(TIP - axis * (0.2 - t)) @ V((0, 0, 1)).rotation_difference(axis).to_matrix().to_4x4())
    parts.append(b)

# flame tongues rising from the bundle (flames go up whatever the torch angle)
tongues = []
for k, (dx, dy, h, r, lean) in enumerate(((0, 0, 0.44, 0.06, 0.12), (0.05, -0.02, 0.24, 0.035, 0.35), (-0.04, 0.02, 0.3, 0.04, 0.05),
                                          (0.015, -0.05, 0.17, 0.03, 0.3), (-0.025, 0.05, 0.21, 0.03, 0.2))):  # one drift, uneven heights
    r *= 1.3
    prof = common.fillet([(0, 0), (r * 0.8, h * 0.06), (r, h * 0.2), (r * 0.75, h * 0.45), (r * 0.35, h * 0.75), (0, h)],
                         [0, r * 0.4, r * 0.8, r, r * 0.6, 0], n=2)
    t = common.lathe(f'tongue{k}', prof, 10, FLAME)
    for v in t.data.vertices:  # curl: the tip drifts sideways and back with height
        f = (v.co.z / h) ** 1.6
        v.co.x += lean * h * f
        v.co.y += 0.25 * h * f
    t.data.transform(Matrix.Translation(TIP + V((dx, dy, -0.05))))
    tongues.append(t)
flame = common.join(tongues, 'torch_flame')

farmer = common.join(parts, 'farmer')
for v in farmer.data.vertices:  # lean into the stride: the upper body shears forward (the hand and torch barely move)
    if v.co.z > 0.85:
        v.co.y -= 0.2 * (v.co.z - 0.85)
common.smooth(farmer, 60, weighted=False)
common.smooth(flame, 80, weighted=False)
common.bake_ao([farmer], 512, distance=0.3, name='farmer')
objs = [farmer, flame]
tris = common.triangles(objs)
size = common.export_glb(objs, GLB)
print(f'farmer: {GLB} {size / 1024:.1f} KB, {tris} triangles')
assert size <= MAX_BYTES, f'farmer.glb is {size} bytes, over the {MAX_BYTES} budget'
common.check_budget(os.path.dirname(GLB))

P = lambda n: os.path.join(OUT, n)
common.render_previews(GLB, [(P('farmer-hero.png'), (2.6, -3.2, 1.5), (0.05, -0.25, 0.85), 50)],
                       look='sunset', ground=common.srgb(58, 48, 34))
common.render_previews(GLB, [(P('farmer-silhouette.png'), (-0.8, -4.6, 0.55), (0.05, -0.2, 0.95), 50)],
                       look='backlit', ground=(0.015, 0.01, 0.008, 1),
                       lights=[((0.36, -1.0, 0.45), (1, 0.5, 0.15), 30, 0.1)])
