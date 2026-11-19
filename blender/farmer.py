"""The farmer for the burning scene: a northern Thai rice farmer striding through the stubble, lowering a burning
bamboo torch to light it (as in the reference smoke-wide still).

blender --background --factory-startup --python blender/farmer.py -- [out.glb] [preview dir]

1.65 m tall (the lean brings the crown to about 1.62 m; the hat's peak is about 1.73 m). Origin at the feet,
facing glTF +Z. He holds the top of a 1.25 m bamboo pole in his right hand; the bound straw torch head is at the
pole's lower end, near the ground ahead of him, and the flame sits on it. Seen as a silhouette at 20-40 m, so the
detail goes into the outline: hat brim, torch line, loose cloth, hands and sandalled feet. No face.
Nodes: farmer, torch_flame (materials 'flame' and 'flame_core', both emissive).
"""
import math
import os
import random
import sys

import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import common  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
GLB = os.path.abspath(ARGS[0] if ARGS else os.path.join(ROOT, 'models', 'farmer.glb'))
OUT = os.path.abspath(ARGS[1] if len(ARGS) > 1 else os.path.join(ROOT, 'docs', 'film-renders', 'assets'))
MAX_BYTES = 160 * 1024
V = Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
SHIRT = common.pbr('cloth_shirt', common.srgb(118, 100, 76), rough=0.95)      # faded khaki, as in the reference
TROUSERS = common.pbr('cloth_trousers', common.srgb(80, 68, 54), rough=0.95)
CHECK = common.image('check_albedo', np.kron(np.array([[[0.45, 0.07, 0.06], [0.16, 0.12, 0.3]], [[0.16, 0.12, 0.3], [0.62, 0.55, 0.5]]]),
                                                np.ones((16, 16, 1))))
SCARF = common.pbr('cloth_scarf', (1, 1, 1, 1), CHECK, rough=0.9)                # pha khao ma, red and indigo check
SKIN = common.pbr('skin', common.srgb(96, 64, 44), rough=0.7)
HAT = common.pbr('straw_hat', common.srgb(186, 156, 104), *common.weave_textures(256, 12, 'twill', (1, 1, 1)), strength=0.6, rough=0.9)
SANDAL = common.pbr('sandal', common.srgb(36, 30, 26), rough=0.8)
BAMBOO = common.pbr('torch_bamboo', common.srgb(150, 140, 96), rough=0.7)
BUNDLE = common.pbr('torch_straw', common.srgb(150, 118, 66), rough=1.0)
CHAR = common.pbr('torch_char', common.srgb(28, 22, 18), rough=1.0)
ROPE = common.pbr('torch_rope', common.srgb(110, 90, 60), rough=1.0)
FLAME = common.pbr('flame', (1, 0.42, 0.08, 1), rough=1.0, emission=(1.0, 0.36, 0.05, 1.0), alpha=0.85)
CORE = common.pbr('flame_core', (1, 0.85, 0.5, 1), rough=1.0, emission=(1.0, 0.78, 0.35, 1.0))
parts = []
rng = random.Random(11)


def limb(pts, radii, mat, sides=10, fil=0.05, folds=None, squash=1.0):
    p = common.fillet(pts, fil, n=3) if len(pts) > 2 else pts
    d0 = np.cumsum([0] + [(V(pts[i + 1]) - V(pts[i])).length for i in range(len(pts) - 1)])
    d1 = np.cumsum([0] + [(V(p[i + 1]) - V(p[i])).length for i in range(len(p) - 1)])
    o = common.tube('limb', p, list(np.interp(d1 / d1[-1], d0 / d0[-1], radii)), mat, sides, folds=folds, squash=squash)
    parts.append(o)
    return o


def blob(centre, r, mat, segs=12, scale=(1, 1, 1), rot=None):
    o = common.lathe('blob', [(r * math.sin(a), -r * math.cos(a)) for a in np.linspace(0, math.pi, 8)], segs, mat)
    m = Matrix.Translation(centre) @ (rot.to_matrix().to_4x4() if rot else Matrix()) @ Matrix.Diagonal(V(scale)).to_4x4()
    o.data.transform(m)
    parts.append(o)
    return o


def lean(p, k=0.16):
    """Lean into the stride: everything above the hips shears forward (-Y)."""
    p = V(p)
    if p.z > 0.86:
        p.y -= k * (p.z - 0.86)
    return p


# ------------------------------------------------------------ skeleton (Blender: z up, facing -Y); left foot forward
HIP_L, HIP_R = V((-0.09, -0.025, 0.87)), V((0.09, 0.025, 0.87))   # pelvis turned a little with the left leg forward
KNEE_L, KNEE_R = V((-0.1, -0.2, 0.48)), V((0.1, 0.13, 0.47))
ANK_L, ANK_R = V((-0.105, -0.32, 0.085)), V((0.11, 0.33, 0.13))
TWIST = math.radians(-9)                                          # shoulders counter-rotate: right shoulder forward
SHO = lambda s: lean(Matrix.Rotation(TWIST, 3, 'Z') @ V((s * 0.175, -0.01, 1.38)))
SH_L, SH_R = SHO(-1), SHO(1)
NECK, HEAD = lean((0, -0.02, 1.47)), lean((0, -0.03, 1.545))
EL_L, WR_L = lean((-0.235, 0.07, 1.12)), lean((-0.25, 0.13, 0.9))
EL_R, WR_R = lean((0.24, -0.14, 1.12)), V((0.25, -0.33, 0.9))
GRIP = WR_R + (WR_R - EL_R).normalized() * 0.06

# ------------------------------------------------------------ legs: loose trousers rolled at mid-calf, sandals
for hip, knee, ank, s, front in ((HIP_L, KNEE_L, ANK_L, -1, True), (HIP_R, KNEE_R, ANK_R, 1, False)):
    shin = (ank - knee).normalized()
    roll = knee + (ank - knee) * 0.42
    limb([hip + V((0, 0, 0.05)), (hip + knee) / 2 + V((s * 0.012, 0, 0)), knee, roll], [0.095, 0.08, 0.068, 0.066], TROUSERS, 14, 0.08,
         folds=(0.07, 5, 1.3 * s))
    limb([roll - shin * 0.03, roll + shin * 0.028], [0.07, 0.072], TROUSERS, 14)
    limb([roll, ank + V((0, 0, 0.01))], [0.045, 0.033], SKIN, 10)
    if front:  # flat on the ground
        heel, ball, toe = V((ank.x, ank.y + 0.05, 0.03)), V((ank.x - 0.005, ank.y - 0.1, 0.024)), V((ank.x - 0.008, ank.y - 0.155, 0.02))
    else:      # heel off, the toes bent flat at the ball
        ball, toe = V((ank.x, ank.y - 0.08, 0.025)), V((ank.x + 0.002, ank.y - 0.135, 0.02))
        heel = ank + (ank - ball).normalized() * 0.055 - V((0, 0, 0.03))
    limb([heel, ank - V((0, 0, 0.035)), ball, toe], [0.03, 0.036, 0.034, 0.024], SKIN, 10, 0.02, squash=0.75)
    sole = [heel - V((0, 0, 0.026)) + (heel - ball).normalized() * 0.015, ball - V((0, 0, 0.022)), toe - V((0, 0, 0.014)) + (toe - ball).normalized() * 0.02]
    parts.append(common.strip('sole', sole, [0.036, 0.042, 0.034], 0.006, SANDAL))
    for side in (-1, 1):  # thong straps from between the toes to each side of the foot
        a = ball + (toe - ball) * 0.5 + V((0, 0, 0.01))
        b = (ball + heel) / 2 + V((side * 0.038, 0, -0.005))
        parts.append(common.tube('strap', [a, (a + b) / 2 + V((side * 0.015, 0, 0.022)), b], 0.0045, SANDAL, 6))
blob(lean((0, 0.0, 0.88)), 0.15, TROUSERS, 14, (1.0, 0.82, 0.72))  # seat of the trousers

# ------------------------------------------------------------ loose shirt: twisted, leaning rings, sloped shoulders, a soft ragged hem
rings = []
for z, hw, hd, fold in ((0.78, 0.205, 0.15, 1.0), (0.86, 0.19, 0.135, 0.8), (0.98, 0.172, 0.118, 0.5), (1.1, 0.172, 0.115, 0.4),
                        (1.22, 0.185, 0.12, 0.2), (1.3, 0.19, 0.115, 0.1), (1.35, 0.175, 0.105, 0), (1.39, 0.145, 0.094, 0),
                        (1.425, 0.105, 0.08, 0), (1.46, 0.062, 0.056, 0)):
    tw = TWIST * min(1.0, max(0.0, (z - 0.9) / 0.48)) + math.radians(5) * (1 - min(1.0, (z - 0.78) / 0.3))
    ring = []
    for k in range(24):
        a = 2 * math.pi * k / 24
        f = 1 + fold * (0.035 * math.sin(7 * a + z * 9) + (rng.uniform(-0.02, 0.03) if z < 0.8 else 0))
        x, y = hw * f * math.cos(a), hd * f * math.sin(a)  # round sections: no boxy torso
        p = Matrix.Rotation(tw, 3, 'Z') @ V((x, y, z + (rng.uniform(-0.02, 0.008) if z < 0.8 else 0)))
        ring.append(tuple(lean(p)))
    rings.append(ring)
parts.append(common.loft('shirt', rings, SHIRT))
for sh, el, wr, sd in ((SH_L, EL_L, WR_L, 0.7), (SH_R, EL_R, WR_R, 2.1)):  # loose sleeves with folds, a little flare at the cuff
    inner = sh + (V((0, sh.y, sh.z)) - sh) * 0.35 - V((0, 0, 0.035))  # start inside the torso so the shoulder slopes into the arm
    limb([inner, sh - V((0, 0, 0.03)), el, wr], [0.05, 0.06, 0.054, 0.058], SHIRT, 12, 0.07, folds=(0.08, 4, sd))
for sh in (SH_L, SH_R):  # rounded deltoids under the shirt: the shoulder slopes into the sleeve
    blob(sh - V((0, 0, 0.025)) + (V((0, sh.y, sh.z)) - sh) * 0.15, 0.07, SHIRT, 12, (0.95, 1.0, 0.8))
limb([NECK - V((0, 0, 0.04)), HEAD - V((0, 0, 0.06))], [0.05, 0.046], SKIN, 10)
blob(HEAD, 0.105, SKIN, 14, (0.84, 0.94, 1.02))

# hands: a fist round the pole (right), a relaxed mitten with a thumb (left)
axis = (V((0.36, -1.18, 0.1)) - GRIP).normalized()            # the pole runs from the grip down to the torch head
blob(GRIP, 0.05, SKIN, 12, (0.95, 0.85, 0.75), V((0, 0, 1)).rotation_difference(axis))
limb([GRIP + V((0.02, 0.02, 0.03)), GRIP + V((0.01, -0.02, 0.04))], [0.016, 0.013], SKIN, 8)  # thumb over the top
lh = WR_L + (WR_L - EL_L).normalized() * 0.07
blob(lh, 0.048, SKIN, 12, (0.55, 0.85, 1.0), V((0, 0, 1)).rotation_difference((WR_L - EL_L).normalized()))
limb([WR_L + V((0.02, -0.025, -0.02)), lh + V((0.022, -0.035, -0.01))], [0.014, 0.011], SKIN, 8)

# pha khao ma round the neck, its ends hanging down the chest, close to the body (no loose flaps in the outline)
neck_loop = [lean(Matrix.Rotation(TWIST, 3, 'Z') @ V((0.085 * math.cos(a), 0.07 * math.sin(a) - 0.005, 1.44 - 0.015 * math.sin(a))))
             for a in np.linspace(0, 2 * math.pi, 18, endpoint=False)]
parts.append(common.tube('scarf_loop', neck_loop, 0.022, SCARF, 8, cyclic=True, squash=0.6))
for s in (-1, 1):
    path = [lean(V((s * 0.045, -0.07, 1.435))), lean(V((s * 0.055, -0.112, 1.34))), lean(V((s * 0.058, -0.124, 1.24)))]
    parts.append(common.strip('scarf_end', path, [0.022, 0.026, 0.024], 0.004, SCARF, wdir=(1, 0, 0), p=3))
for o in parts[-3:]:
    common.uv_smart([o], 'UVMap', tile=0.035)  # checks about 1.5 cm

# ngob: a wide shallow woven cone with a bound rim, a crown band and a chin cord, tilted forward with the head
hat_p = common.fillet([(0, 0.155), (0.27, 0.012), (0.276, 0.006), (0.26, 0.004), (0.08, 0.1), (0, 0.13)], [0, 0.006, 0.004, 0.006, 0.02, 0], n=2)
hat = common.lathe('hat', hat_p, 40, HAT)
binding = common.lathe('binding', [(0.272 + 0.0055 * math.cos(a), 0.008 + 0.0055 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 8, endpoint=False)], 40, HAT, closed=True)
band = common.lathe('band', common.fillet([(0.085, 0.05), (0.09, 0.05), (0.095, 0.1), (0.07, 0.1)], 0.005, n=2, closed=True), 20, HAT, closed=True)
cord = common.tube('cord', [(-0.08, 0.0, 0.045), (-0.075, -0.03, -0.05), (-0.03, -0.075, -0.12), (0.03, -0.075, -0.12), (0.075, -0.03, -0.05), (0.08, 0.0, 0.045)], 0.0025, ROPE, 5)
for o in (hat, binding, band, cord):
    o.data.transform(Matrix.Translation(HEAD + V((0, -0.01, 0.03))) @ Matrix.Rotation(math.radians(13), 4, 'X'))
    common.uv_map(o, lambda cos, poly: [(c.x / 0.07, c.y / 0.07) for c in cos])
    parts.append(o)

# ------------------------------------------------------------ the torch: pole held at the top, bound straw head at the lower end
POLE_TOP = GRIP - axis * 0.09
HEAD_END = V((0.36, -1.18, 0.1))
neck = HEAD_END - axis * 0.2                                      # where the split bamboo grips the bundle
parts.append(common.tube('pole', [POLE_TOP, neck], [0.016, 0.017], BAMBOO, 8))
orient = Matrix.Translation(neck) @ V((0, 0, 1)).rotation_difference(axis).to_matrix().to_4x4()
for k in range(4):  # split bamboo fingers flaring round the bundle
    a = math.pi / 2 * k + 0.4
    d = V((math.cos(a), math.sin(a), 0))
    finger = [orient @ (d * 0.012 + V((0, 0, -0.02))), orient @ (d * 0.03 + V((0, 0, 0.05))), orient @ (d * 0.042 + V((0, 0, 0.11)))]
    parts.append(common.strip('finger', finger, 0.007, 0.0022, BAMBOO, wdir=tuple(orient.to_3x3() @ V((-math.sin(a), math.cos(a), 0)))))
straw_p = [(0, 0.0)] + [(0.04 * math.sin(math.pi * min(1, t / 0.9)) ** 0.6 + 0.004 * math.sin(t * 40), 0.2 * t) for t in np.linspace(0.04, 1, 12)] + [(0, 0.205)]
upper = common.lathe('bundle', [p for p in straw_p if p[1] <= 0.1] + [(0, 0.1)], 12, BUNDLE)
lower = common.lathe('char', [(0, 0.1)] + [p for p in straw_p if p[1] > 0.1], 12, CHAR)   # the burning half is charred
for o in (upper, lower):
    o.data.transform(orient)
    parts.append(o)
for t in (0.035, 0.085):  # rope lashings
    lash = common.lathe('lash', [(0.034 + 0.004 * math.cos(a), 0.004 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 8, endpoint=False)], 12, ROPE, closed=True)
    lash.data.transform(orient @ Matrix.Translation((0, 0, t)))
    parts.append(lash)

# soft flame on the head: a body with rounded tongues curling up and drifting, and a hot core inside
fl = []
seat = orient @ V((0, 0, 0.13))
for k, (dx, dy, h, r, drift, mat) in enumerate((
        (0.0, 0.0, 0.42, 0.075, 0.1, FLAME), (0.05, -0.02, 0.28, 0.05, 0.22, FLAME), (-0.045, 0.02, 0.32, 0.055, -0.05, FLAME),
        (0.02, -0.05, 0.22, 0.042, 0.15, FLAME), (-0.02, 0.05, 0.25, 0.045, 0.02, FLAME),
        (0.0, 0.0, 0.26, 0.045, 0.08, CORE), (0.025, -0.015, 0.16, 0.03, 0.15, CORE))):
    prof = [(0, -0.02)] + [(r * (math.sin(math.pi * min(1.0, t / 0.35) / 2) ** 0.7) * (1 - t) ** 0.85 + 0.004 * (1 - t), h * t)
                           for t in np.linspace(0.02, 0.97, 10)] + [(0, h)]
    o = common.lathe(f'tongue{k}', prof, 12, mat)
    ph = rng.uniform(0, 6.28)
    for v in o.data.vertices:  # curl and wobble so no two tongues are alike and none is a straight spike
        f = max(0.0, v.co.z) / h
        v.co.x += drift * h * f ** 1.7 + 0.012 * math.sin(f * 7 + ph) * f
        v.co.y += 0.25 * h * f ** 2 + 0.01 * math.cos(f * 6 + ph) * f
    o.data.transform(Matrix.Translation(seat + V((dx, dy, 0))))
    fl.append(o)
flame = common.join(fl, 'torch_flame')

farmer = common.join(parts, 'farmer')
common.smooth(farmer, 60, weighted=False)
common.smooth(flame, 89, weighted=False)
common.bake_ao([farmer], 512, distance=0.25, name='farmer')
objs = [farmer, flame]
tris = common.triangles(objs)
size = common.export_glb(objs, GLB)
print(f'farmer: {GLB} {size / 1024:.1f} KB, {tris} triangles')
assert size <= MAX_BYTES, f'farmer.glb is {size} bytes, over the {MAX_BYTES} budget'
common.check_budget(os.path.dirname(GLB))

P = lambda n: os.path.join(OUT, n)
fire = [(tuple(seat + V((0, 0, 0.15))), (1, 0.5, 0.15), 40, 0.1)]
common.render_previews(GLB, [(P('farmer-hero.png'), (2.4, -3.3, 1.4), (0.1, -0.35, 0.8), 45)], look='sunset',
                       ground=common.srgb(58, 48, 34), lights=fire)
common.render_previews(GLB, [(P('farmer-silhouette.png'), (-1.0, -5.0, 0.7), (0.1, -0.35, 0.85), 50),
                             (P('farmer-silhouette-30m.png'), (-6.0, -29.5, 1.6), (0.1, -0.35, 0.85), 50)],
                       look='backlit', ground=(0.015, 0.01, 0.008, 1), lights=fire)
