"""The farmer for the burning scene: a northern Thai rice farmer leaning into his stride through the stubble,
reaching a burning bamboo torch forward and down to set the straw alight (as in the reference smoke-wide still).

blender --background --factory-startup --python blender/farmer.py -- [out.glb] [preview dir]

1.65 m tall standing (the forward lean and bent knees bring the crown to about 1.55 m; the hat's peak is about
1.64 m). Origin at the feet, facing glTF +Z. His right hand grips a noded bamboo pole; its lower end carries a tied
straw-bundle torch head, 30 cm long, resting on the stubble ahead of his leading foot. Seen as a silhouette at
20-40 m, so the detail goes into the outline: the lean, hat brim, torch line, loose cloth, hands and feet. No face.
Nodes: farmer, torch_flame (soft-edged flame cards with an orange to yellow-white alpha texture, emissive: film.js
renders them additively and adds embers and smoke).
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
MAX_BYTES = 200 * 1024
V = Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
SHIRT = common.pbr('cloth_shirt', common.srgb(118, 100, 76), rough=0.95)      # faded khaki, as in the reference
TROUSERS = common.pbr('cloth_trousers', common.srgb(80, 68, 54), rough=0.95)
CHECK = common.image('check_albedo', np.kron(np.array([[[0.2, 0.05, 0.045], [0.08, 0.065, 0.14]], [[0.08, 0.065, 0.14], [0.26, 0.22, 0.2]]]),
                                                np.ones((16, 16, 1))))       # dark, low-contrast: it merges at distance
SCARF = common.pbr('cloth_scarf', (1, 1, 1, 1), CHECK, rough=0.95)               # pha khao ma, red and indigo check
SKIN = common.pbr('skin', common.srgb(96, 64, 44), rough=0.7)
FEET = common.pbr('skin_dusty', common.srgb(62, 46, 34), rough=0.95)              # bare feet, dusty from the field
HAT = common.pbr('straw_hat', common.srgb(186, 156, 104), *common.weave_textures(256, 12, 'twill', (1, 1, 1)), strength=0.6, rough=0.9)
SANDAL = common.pbr('sandal', common.srgb(24, 21, 19), rough=0.95)               # matte black rubber, no sheen
BAMBOO = common.pbr('torch_bamboo', common.srgb(150, 140, 96), rough=0.7)
ST_ALB, ST_NRM = common.thatch_textures(256, seed=9)
BUNDLE = common.pbr('torch_straw', common.srgb(220, 200, 170), ST_ALB, ST_NRM, strength=1.0, rough=1.0)
CHAR = common.pbr('torch_char', common.srgb(30, 24, 20), rough=1.0)
EMBER = common.pbr('torch_ember', common.srgb(40, 14, 6), rough=1.0, emission=(0.9, 0.22, 0.03, 0.8))   # the glowing burning end
ROPE = common.pbr('torch_rope', common.srgb(110, 90, 60), rough=1.0)
FLAME = common.pbr('flame', (1, 1, 1, 1), common.flame_texture(256), rough=1.0, tex_alpha='blend', emit_tex=True,
                   emission=(1, 1, 1, 2.0), double=True)
parts = []
rng = random.Random(11)

# ------------------------------------------------------------ pose (Blender: z up, facing -Y); left foot leads
LEAN, PIVOT = math.radians(18), 0.88          # the upper body tips forward 18 degrees about the hips


def up(p, k=1.0):
    """Lean a point of the upper body: full lean above the waist, eased in through the hips."""
    p = V(p)
    w = k * min(1.0, max(0.0, (p.z - 0.7) / 0.32)) ** 1.3
    a = LEAN * w
    y, z = p.y, p.z - PIVOT
    return V((p.x, y * math.cos(a) - z * math.sin(a), PIVOT + y * math.sin(a) + z * math.cos(a)))


def tube(pts, radii, mat, sides=12, fil=0.05, folds=None, squash=1.0, amp=None):
    """A limb or sleeve through pts (filleted), with radii and fold amplitudes given per input point."""
    p = common.fillet(pts, fil, n=3) if len(pts) > 2 else pts
    d0 = np.cumsum([0] + [(V(pts[i + 1]) - V(pts[i])).length for i in range(len(pts) - 1)])
    d1 = np.cumsum([0] + [(V(p[i + 1]) - V(p[i])).length for i in range(len(p) - 1)])
    t0, t1 = d0 / d0[-1], d1 / d1[-1]
    f = None
    if folds:
        f = (list(np.interp(t1, t0, amp)) if amp is not None else folds[0], folds[1], folds[2])
    o = common.tube('limb', p, list(np.interp(t1, t0, radii)), mat, sides, folds=f, squash=squash)
    parts.append(o)
    return o


def ellipsoid(centre, r, mat, segs=12, scale=(1, 1, 1), rot=None):
    o = common.lathe('ell', [(r * math.sin(a), -r * math.cos(a)) for a in np.linspace(0, math.pi, 9)], segs, mat)
    o.data.transform(Matrix.Translation(centre) @ (rot.to_matrix().to_4x4() if rot else Matrix()) @ Matrix.Diagonal(V(scale)).to_4x4())
    parts.append(o)
    return o


HIP_L, HIP_R = V((-0.09, -0.045, 0.85)), V((0.09, 0.045, 0.85))
KNEE_L, KNEE_R = V((-0.1, -0.255, 0.465)), V((0.1, 0.16, 0.46))   # both knees bent, ahead of the hip-ankle line
ANK_L, ANK_R = V((-0.105, -0.335, 0.085)), V((0.11, 0.37, 0.13))
SH_L, SH_R = V((-0.175, 0.0, 1.375)), V((0.175, -0.01, 1.375))
EL_L, WR_L = V((-0.235, 0.06, 1.13)), V((-0.245, -0.02, 0.91))      # free arm: swinging a little, for balance
EL_R, WR_R = V((0.235, -0.2, 1.19)), V((0.245, -0.41, 1.02))        # torch arm reaching forward and down
NECK, HEAD = V((0, -0.015, 1.45)), V((0, -0.035, 1.55))

# ------------------------------------------------------------ legs: loose trousers rolled at mid-calf, bunched behind the knee
for hip, knee, ank, s, front in ((HIP_L, KNEE_L, ANK_L, -1, True), (HIP_R, KNEE_R, ANK_R, 1, False)):
    shin = (ank - knee).normalized()
    roll = knee + (ank - knee) * 0.45
    tube([up(hip + V((0, 0, 0.02))), (hip + knee) / 2 + V((s * 0.012, 0, 0)), knee, roll], [0.088, 0.08, 0.07, 0.068], TROUSERS, 14, 0.08,
         folds=(0, 5, 1.3 * s), amp=[0.03, 0.05, 0.12, 0.06])
    tube([roll - shin * 0.03, roll + shin * 0.03], [0.072, 0.074], TROUSERS, 14)                       # the rolled cuff
    tube([roll, knee + (ank - knee) * 0.8, ank + V((0, 0, 0.01))], [0.046, 0.04, 0.033], SKIN, 10)
    if front:  # flat on the ground
        heel, ball, toe = V((ank.x, ank.y + 0.05, 0.03)), V((ank.x - 0.005, ank.y - 0.1, 0.024)), V((ank.x - 0.008, ank.y - 0.155, 0.02))
    else:      # heel off, the toes bent flat at the ball
        ball, toe = V((ank.x, ank.y - 0.08, 0.025)), V((ank.x + 0.002, ank.y - 0.135, 0.02))
        heel = ank + (ank - ball).normalized() * 0.055 - V((0, 0, 0.03))
    tube([heel, ank - V((0, 0, 0.035)), ball, toe], [0.03, 0.036, 0.034, 0.024], FEET, 10, 0.02, squash=0.75)
    sole = [heel - V((0, 0, 0.026)) + (heel - ball).normalized() * 0.015, ball - V((0, 0, 0.022)), toe - V((0, 0, 0.014)) + (toe - ball).normalized() * 0.02]
    parts.append(common.strip('sole', sole, [0.036, 0.042, 0.034], 0.006, SANDAL))
    for side in (-1, 1):  # thong straps from between the toes to each side of the foot
        a = ball + (toe - ball) * 0.5 + V((0, 0, 0.01))
        b = (ball + heel) / 2 + V((side * 0.038, 0, -0.005))
        parts.append(common.tube('strap', [a, (a + b) / 2 + V((side * 0.015, 0, 0.022)), b], 0.0045, SANDAL, 6))

# the seat of the trousers: one rounded piece from the waist to the crotch, leaning with the hips (the thighs grow out
# of it, so no tube ends show behind the shirt)
seat = []
for z, hw, hd in ((0.97, 0.165, 0.12), (0.9, 0.175, 0.128), (0.84, 0.168, 0.122), (0.79, 0.13, 0.095), (0.765, 0.07, 0.055)):
    seat.append([tuple(up(V((hw * math.cos(a), hd * math.sin(a), z)))) for a in np.linspace(0, 2 * math.pi, 20, endpoint=False)])
parts.append(common.loft('seat', seat, TROUSERS, caps='pole'))

# ------------------------------------------------------------ loose shirt: one body from the flared hem to the collar,
# shoulders built in (the sleeves grow out of them, no joint), a fold band where it bunches at the waist
rings = []
for z, hw, hd, fold in ((0.74, 0.19, 0.165, 1.0), (0.8, 0.186, 0.155, 0.8), (0.88, 0.182, 0.142, 1.1), (0.94, 0.176, 0.132, 0.9),
                        (1.04, 0.175, 0.122, 0.4), (1.14, 0.18, 0.122, 0.35), (1.24, 0.19, 0.125, 0.2), (1.31, 0.205, 0.122, 0.1),
                        (1.355, 0.2, 0.112, 0.05), (1.39, 0.17, 0.1, 0), (1.42, 0.12, 0.085, 0), (1.45, 0.07, 0.06, 0)):
    ring = []
    for k in range(28):
        a = 2 * math.pi * k / 28
        f = 1 + fold * (0.03 * math.sin(7 * a + z * 9) + 0.015 * math.sin(13 * a + z * 4) + (rng.uniform(-0.02, 0.03) if z < 0.75 else 0))
        x, y = hw * f * math.cos(a), hd * f * math.sin(a)
        if z > 1.3:  # sloping shoulders: the top of the body narrows front to back and drops at the sides
            y *= 1 - 0.15 * abs(math.cos(a))
        ring.append(tuple(up(V((x, y, z + (rng.uniform(-0.02, 0.008) if z < 0.75 else 0))))))
    rings.append(ring)
parts.append(common.loft('shirt', rings, SHIRT))
for sh, el, wr, sd in ((SH_L, EL_L, WR_L, 0.7), (SH_R, EL_R, WR_R, 2.1)):  # loose sleeves, folds bunched at the elbow
    inner = V((sh.x * 0.45, sh.y, sh.z - 0.03))
    tube([up(inner), up(sh - V((0, 0, 0.025))), up(el), up(wr)], [0.07, 0.064, 0.056, 0.058], SHIRT, 12, 0.08,
         folds=(0, 4, sd), amp=[0.0, 0.04, 0.13, 0.05])
tube([up(NECK - V((0, 0, 0.04))), up(HEAD - V((0, 0, 0.06)), 1.15)], [0.052, 0.047], SKIN, 10)
HEAD_P = up(HEAD, 1.15)                                             # the head bows a little more: he watches the flame
ellipsoid(HEAD_P, 0.105, SKIN, 14, (0.84, 0.94, 1.02))

# pha khao ma round the neck, its ends close on the chest
neck_loop = [up(V((0.088 * math.cos(a), 0.072 * math.sin(a) - 0.005, 1.44 - 0.015 * math.sin(a)))) for a in np.linspace(0, 2 * math.pi, 18, endpoint=False)]
parts.append(common.tube('scarf_loop', neck_loop, 0.022, SCARF, 8, cyclic=True, squash=0.6))
for s in (-1, 1):
    path = [up(V((s * 0.045, -0.075, 1.435))), up(V((s * 0.055, -0.118, 1.34))), up(V((s * 0.058, -0.13, 1.24)))]
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
    o.data.transform(Matrix.Translation(HEAD_P + V((0, -0.01, 0.03))) @ Matrix.Rotation(LEAN * 1.15 + math.radians(4), 4, 'X'))
    common.uv_map(o, lambda cos, poly: [(c.x / 0.07, c.y / 0.07) for c in cos])
    parts.append(o)

# ------------------------------------------------------------ the torch: noded bamboo pole, tied straw bundle on the stubble
GRIP = up(WR_R) + (up(WR_R) - up(EL_R)).normalized() * 0.075
END = V((0.33, -1.33, 0.025))                                       # the bundle's burning end, on the ground ahead
AXIS = (END - GRIP).normalized()                                    # down the pole, toward the head
POLE_R, BUNDLE_L = 0.017, 0.3
NECK_P = END - AXIS * BUNDLE_L                                      # where the bundle is tied onto the pole
POLE_TOP = GRIP - AXIS * 0.13
frame = Matrix.Translation(POLE_TOP) @ V((0, 0, 1)).rotation_difference(AXIS).to_matrix().to_4x4()
L_POLE = (NECK_P - POLE_TOP).length + 0.12                          # runs on into the bundle's core
prof = [(0, 0), (POLE_R * 0.85, 0), (POLE_R, 0.006)]
t = 0.1
while t < L_POLE - 0.05:                                            # nodes every 30 cm
    prof += [(POLE_R, t - 0.012), (POLE_R * 1.12, t - 0.003), (POLE_R * 1.12, t + 0.003), (POLE_R, t + 0.012)]
    t += 0.3
prof += [(POLE_R, L_POLE), (0, L_POLE)]
pole = common.lathe('pole', prof, 8, BAMBOO)
pole.data.transform(frame)
parts.append(pole)
bf = Matrix.Translation(NECK_P) @ V((0, 0, 1)).rotation_difference(AXIS).to_matrix().to_4x4()   # bundle frame: z down the bundle
TIES = (0.03, 0.12, 0.21)


def bundle_r(t):
    """The bundle's radius t metres from its top: gathered at the pole, bellying out, pinched at each tie, splayed
    and ragged at the burning end."""
    r = 0.02 + 0.03 * min(1.0, t / 0.08) ** 0.7 + 0.012 * max(0.0, (t - 0.2) / 0.1) ** 1.5
    for ti in TIES:
        r -= 0.006 * math.exp(-((t - ti) / 0.008) ** 2)
    return r


bprof = [(0, -0.005)] + [(bundle_r(t) + 0.0015 * math.sin(t * 160), t) for t in np.linspace(0, BUNDLE_L, 34)] + [(0, BUNDLE_L + 0.01)]
bundle = common.lathe('bundle', bprof, 16, BUNDLE)
bundle.data.materials.append(CHAR)
bundle.data.materials.append(EMBER)
for poly in bundle.data.polygons:   # charred over its lower third, glowing at the very end
    tz = poly.center.z
    poly.material_index = 2 if tz > BUNDLE_L - 0.025 else (1 if tz > BUNDLE_L - 0.1 + 0.01 * math.sin(poly.center.x * 300) else 0)
common.uv_map(bundle, lambda cos, poly: [((math.atan2(c.y, c.x) + math.pi) / (2 * math.pi) * 0.5, c.z / BUNDLE_L) for c in cos])
bundle.data.transform(bf)
parts.append(bundle)
for ti in TIES:                     # rope ties, three turns each
    for k in (-1, 0, 1):
        r0 = bundle_r(ti + k * 0.005) + 0.002
        tie = common.lathe('tie', [(r0 + 0.0028 * math.cos(a), 0.0028 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 6, endpoint=False)], 14, ROPE, closed=True)
        tie.data.transform(bf @ Matrix.Translation((0, 0, ti + k * 0.0055)))
        parts.append(tie)
for k in range(14):                 # loose straws splaying out of the burning end
    a = 2 * math.pi * k / 14 + rng.uniform(-0.2, 0.2)
    r0 = bundle_r(BUNDLE_L - 0.06) * 0.8
    p0 = V((r0 * math.cos(a), r0 * math.sin(a), BUNDLE_L - 0.07))
    p1 = p0 + V((math.cos(a) * rng.uniform(0.02, 0.05), math.sin(a) * rng.uniform(0.02, 0.05), rng.uniform(0.06, 0.11)))
    parts.append(common.tube('loose', [bf @ p0, bf @ ((p0 + p1) / 2 + V((0, 0, 0.004))), bf @ p1], [0.0018, 0.0015, 0.0008], CHAR, 3))

# right hand: a mitten whose fingers wrap round the pole, the thumb over them; the wrist runs into the cuff
fore = (up(WR_R) - up(EL_R)).normalized()
side = AXIS.cross(fore).normalized()
tube([up(WR_R) - fore * 0.04, GRIP - fore * 0.035], [0.034, 0.036], SKIN, 10)
ellipsoid(GRIP - fore * 0.03 + side * 0.0, 0.045, SKIN, 12, (0.62, 0.95, 1.0), V((0, 0, 1)).rotation_difference(fore))  # back of the hand
radial0 = (fore - AXIS * fore.dot(AXIS)).normalized()               # from the pole toward the wrist
radial1 = AXIS.cross(radial0)
band_rings = []
for ang in np.linspace(-1.9, 2.4, 13):                              # the four fingers as one curled band round the pole
    rad = radial0 * math.cos(ang + math.pi) + radial1 * math.sin(ang + math.pi)
    ring = []
    for k in range(10):
        b = 2 * math.pi * k / 10
        ring.append(GRIP + rad * (POLE_R + 0.011 + 0.0105 * math.cos(b)) + AXIS * (0.036 * math.sin(b) + 0.004))
    band_rings.append(ring)
parts.append(common.loft('fingers', band_rings, SKIN, caps='pole'))
thumb_a = GRIP - fore * 0.03 + radial1 * 0.03
parts.append(common.tube('thumb', [thumb_a, GRIP + radial1 * (POLE_R + 0.012) - AXIS * 0.03, GRIP - radial0 * 0.012 + radial1 * 0.018 - AXIS * 0.045],
                         [0.013, 0.012, 0.01], SKIN, 8))
# left hand: a relaxed mitten, fingers curled loosely, thumb along the side
fl = (up(WR_L) - up(EL_L)).normalized()
lw = up(WR_L)
tube([lw - fl * 0.04, lw + fl * 0.03], [0.033, 0.034], SKIN, 10)
tube([lw + fl * 0.02, lw + fl * 0.07 + V((0, -0.012, 0)), lw + fl * 0.1 + V((0, -0.04, 0.0)), lw + fl * 0.09 + V((0, -0.06, 0.0))],
     [0.031, 0.029, 0.022, 0.016], SKIN, 10, 0.02, squash=0.8)                        # fingers curled loosely in
tube([lw + fl * 0.03 + V((0.0, -0.026, 0)), lw + fl * 0.062 + V((0.004, -0.038, 0))], [0.012, 0.01], SKIN, 8)

# ------------------------------------------------------------ flame: soft-edged alpha cards rising off the burning end
cards_v, cards_f, cards_uv = [], [], []
flame_base = END - AXIS * 0.06 + V((0, 0, 0.0))


def card(base, height, width, turn, half, lean=(0.0, 0.12)):
    """A vertical flame card (3 rows, bending back as it rises), turned about z; half picks the texture's flame."""
    d = V((math.cos(turn), math.sin(turn), 0))
    i0 = len(cards_v)
    for j in range(4):
        t = j / 3
        c = base + V((lean[0] * t * t, lean[1] * t * t, height * t))
        w = width * (1 - 0.2 * t)
        cards_v.extend([c - d * w / 2, c + d * w / 2])
    for j in range(3):
        a = i0 + 2 * j
        cards_f.append((a, a + 1, a + 3, a + 2))
        cards_uv.append([(0.5 * half, j / 3), (0.5 * half + 0.5, j / 3), (0.5 * half + 0.5, (j + 1) / 3), (0.5 * half, (j + 1) / 3)])


for k, (h, w, dx, dy) in enumerate(((0.58, 0.3, 0, 0), (0.5, 0.28, 0.02, 0.03), (0.44, 0.26, -0.02, 0.02), (0.52, 0.26, 0.01, -0.02), (0.4, 0.24, -0.01, 0.0))):
    card(flame_base + V((dx, dy, -0.03)), h, w, math.radians(36 * k + 8), k % 2, (0.02 * (k - 2), 0.1 + 0.02 * k))
for k, s in enumerate((0.1, 0.17)):  # smaller tongues licking up the bundle's lower end
    card(END - AXIS * s + V((0, 0, -0.02)), 0.24, 0.16, math.radians(70 * k + 20), (k + 1) % 2, (0.0, 0.06))
flame = common.build('torch_flame', cards_v, cards_f, FLAME, cards_uv)

farmer = common.join(parts, 'farmer')
common.smooth(farmer, 60, weighted=False)
common.bake_ao([farmer], 512, distance=0.25, name='farmer')
objs = [farmer, flame]
tris = common.triangles(objs)
size = common.export_glb(objs, GLB, pos_bits=13)
print(f'farmer: {GLB} {size / 1024:.1f} KB, {tris} triangles')
assert size <= MAX_BYTES, f'farmer.glb is {size} bytes, over the {MAX_BYTES} budget'
common.check_budget(os.path.dirname(GLB))

P = lambda n: os.path.join(OUT, n)
fire = [(tuple(END + V((0, 0.06, 0.3))), (1, 0.5, 0.15), 40, 0.1)]
common.render_previews(GLB, [(P('farmer-hero.png'), (2.4, -3.3, 1.4), (0.1, -0.45, 0.75), 45)], look='sunset',
                       ground=common.srgb(58, 48, 34), lights=fire)
# the silhouettes from his left side, walking toward screen right as in smoke-wide: the lean and the torch line read
common.render_previews(GLB, [(P('farmer-silhouette.png'), (-4.7, -1.9, 0.7), (0.1, -0.55, 0.8), 50),
                             (P('farmer-silhouette-30m.png'), (-28.0, -11.0, 1.6), (0.1, -0.55, 0.8), 50)],
                       look='backlit', ground=(0.015, 0.01, 0.008, 1), lights=fire)
