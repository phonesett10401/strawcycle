"""The packaging: moulded pressed-straw-fibre meal box, bowl and hot cup with lid, plus a fork and spoon, chopsticks and a straw.

blender --background --factory-startup --python blender/packaging.py -- [out.glb] [preview dir]

Box, bowl and cup are sized to v1's OBJ shapes in film.js (box 1.1 x 0.45 x 0.8 with a 1.14 x 0.84 lid, bowl
r = 0.32 + 0.3 sqrt(y / 0.4) to 0.4 high, cup r 0.21 -> 0.32 over 0.75 with a 0.34 lid); film.js scales them by
FOLD_S / 0.62. The small pieces use the same model scale: real sizes x K (K = 6, so the 21 cm straw stands through
the cup's sip hole). Every piece is its own node with no transform, origin at its table-contact centre; the small
pieces lie flat with their length along glTF X.
"""
import math
import os
import sys

import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import common  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
GLB = os.path.abspath(ARGS[0] if ARGS else os.path.join(ROOT, 'models', 'packaging.glb'))
OUT = os.path.abspath(ARGS[1] if len(ARGS) > 1 else os.path.join(ROOT, 'docs', 'film-renders', 'assets'))
MAX_BYTES = 700 * 1024
K = 6.0                    # model units per real metre for the small pieces
TILE = 0.6                 # metres of surface per repeat of the fibre texture

bpy.ops.wm.read_factory_settings(use_empty=True)
ALB, NRM = common.fibre_textures(1024)
PULP = common.pbr('pulp', common.srgb(222, 200, 160), ALB, NRM, strength=0.8, rough=0.86)
CUTLERY = common.pbr('pulp_cutlery', common.srgb(205, 174, 128), ALB, NRM, strength=0.8, rough=0.74)
STRAW = common.pbr('straw', common.srgb(218, 178, 96), ALB, NRM, strength=0.35, rough=0.6)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def curve(t, ts, vs, soft=0.025):
    """A smooth curve through (ts, vs): linear interpolation, then a gaussian blur along t."""
    g = np.linspace(-0.2, 1.2, 1401)
    y = np.interp(g, ts, vs)
    k = np.exp(-0.5 * (np.arange(-120, 121) * 0.001 / soft) ** 2)
    y = np.convolve(np.pad(y, 120, mode='edge'), k / k.sum(), 'valid')
    return np.interp(t, g, y)


def end_round(d, re):
    """Shrink towards a rounded end: d is the distance from the end, re the end radius."""
    return np.sqrt(np.clip(1 - (1 - np.minimum(d, re) / re) ** 2, 0, 1))


def lay_flat(o):
    """Origin at the centre of the footprint, resting on z = 0."""
    vs = [v.co for v in o.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs)))
    o.data.transform(Matrix.Translation(-Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))))
    return o


# ------------------------------------------------------------ meal box (front = -Y, hinge at the back)
HX, HY = 0.57, 0.42        # outermost half extents: the lid's skirt (v1 lid 1.14 x 0.84)


def box_ring(d, z):
    return [(x, y, z) for x, y in common.rrect(HX - d, HY - d, max(0.17 - 0.5 * d, 0.05), na=12, nx=10, ny=8)]


# (inset from the skirt, height): recessed bottom panel, foot, tapered tray wall, a groove under the lid's skirt,
# the skirt, its shoulder, the tapered lid wall, the rounded top edge and a recessed panel on the lid
prof = [(0.20, 0.010), (0.135, 0.010), (0.125, 0.0), (0.105, 0.0), (0.048, 0.236), (0.053, 0.246), (0.0, 0.246),
        (0.0, 0.292), (0.018, 0.300), (0.03, 0.306), (0.098, 0.446), (0.118, 0.455), (0.16, 0.455), (0.172, 0.447),
        (0.24, 0.447)]
prof = common.fillet(prof, [0, .004, .003, .012, .004, .003, .004, .006, .004, .008, .02, .02, .004, .004, 0], n=4)
shell = common.loft('box_shell', [box_ring(d, z) for d, z in prof], PULP)


def wall_y(z):  # the tray's front wall, -Y side
    return -(HY - (0.105 - 0.057 * z / 0.236))


# hinge: a folded strip along the back with a crease, bedded into the tray wall and the lid skirt
hinge = [(0.395, 0.298), (0.428, 0.288), (0.447, 0.271), (0.451, 0.265), (0.445, 0.261), (0.451, 0.257),
         (0.447, 0.249), (0.43, 0.234), (0.405, 0.224), (0.355, 0.222), (0.36, 0.29)]
hinge = common.fillet(hinge, [.004, .006, .004, .002, .0015, .002, .004, .006, .004, 0, 0], n=3, closed=True)
rings = []
for x in np.concatenate([[-0.37, -0.362, -0.352], np.linspace(-0.34, 0.34, 9), [0.352, 0.362, 0.37]]):
    f = float(np.interp(abs(x), [0.34, 0.352, 0.362, 0.37], [1, 0.85, 0.55, 0.2]))
    rings.append([(x, 0.38 + (y - 0.38) * f, 0.262 + (z - 0.262) * f) for y, z in hinge])
hinge_o = common.loft('box_hinge', rings, PULP, caps='pole')

# snap tab: hangs from the lid's front skirt over the tray wall, with a press button
tab_rings = []
for inset, off in ((0.004, -0.002), (0.0, 0.003), (0.0, 0.010), (0.004, 0.0135)):
    pts = common.rrect(0.075 - inset, 0.05 - inset, 0.03 - inset, na=8, nx=8, ny=4)
    tab_rings.append([(x, wall_y(0.21 + zz) - off, 0.21 + zz) for x, zz in pts])
tab = common.loft('box_tab', tab_rings, PULP)
btn = common.lathe('box_btn', common.fillet([(0, 0), (0.016, 0), (0.014, 0.004), (0.008, 0.008), (0, 0.009)],
                                            [0, .002, .003, .003, 0], n=3), 24, PULP)
nrm = Vector((0, -1, -0.057 / 0.236)).normalized()
btn.data.transform(Matrix.Translation((0, wall_y(0.2) - 0.012, 0.2)) @ Vector((0, 0, 1)).rotation_difference(nrm).to_matrix().to_4x4())
box = common.join([shell, hinge_o, tab, btn], 'box')

# ------------------------------------------------------------ bowl (v1 profile, rolled rim, foot ring, inner floor)
bowlR = lambda z: 0.32 + 0.3 * math.sqrt(z / 0.4)
outer = [(bowlR(z), z) for z in 0.36 * np.linspace(0.05, 1, 28) ** 2]
foot = common.fillet([(0, 0.008), (0.255, 0.008), (0.27, 0.0), (0.305, 0.0), outer[0]], [0, .004, .003, .006, 0], n=3)
rim = [(0.594 + 0.018 * math.cos(math.radians(a)), 0.384 + 0.018 * math.sin(math.radians(a))) for a in np.linspace(-15, 200, 16)]
inner = []
for i in range(len(outer) - 1, 0, -1):
    (r0, z0), (r1, z1) = outer[i - 1], outer[min(i + 1, len(outer) - 1)]
    tl = math.hypot(r1 - r0, z1 - z0)
    r, z = outer[i][0] - 0.022 * (z1 - z0) / tl, outer[i][1] + 0.022 * (r1 - r0) / tl
    if z < 0.06:
        break
    inner.append((r, z))
floor = common.fillet([inner[-1], (inner[-1][0] - 0.02, 0.04), (0, 0.04)], [0, 0.03, 0], n=5)
bowl = common.lathe('bowl', foot + outer[1:] + rim + inner + floor[1:], 96, PULP)

# ------------------------------------------------------------ hot cup and its lid with a sip hole (front = -Y)
body = common.fillet([(0, 0.028), (0.19, 0.028), (0.199, 0.0), (0.2136, 0.0), (0.3127, 0.70)], [0, .004, .003, .004, 0], n=3)
bead = [(0.316 + 0.011 * math.cos(math.radians(a)), 0.718 + 0.011 * math.sin(math.radians(a))) for a in np.linspace(-100, 180, 12)]
cup_body = common.lathe('cup_body', body + bead + [(0.296, 0.712), (0, 0.712)], 80, PULP)
lid_p = [(0, 0.735), (0.295, 0.735), (0.305, 0.712), (0.318, 0.70), (0.334, 0.700), (0.338, 0.712), (0.342, 0.724),
         (0.338, 0.745), (0.336, 0.768), (0.326, 0.782), (0.318, 0.79), (0.31, 0.812), (0.296, 0.826), (0.252, 0.826),
         (0.238, 0.81), (0.228, 0.796), (0.215, 0.79), (0, 0.79)]
lid_p = common.fillet(lid_p, [0, .004, .006, .004, .004, .004, .006, .004, .006, .004, .004, .006, .008, .008, .006, .004, .004, 0], n=3)
lid = common.lathe('cup_lid', lid_p, 80, PULP)
SIP = Vector((0, -0.274, 0.826))   # top of the sip hole, cup space
hole = [(x, y - 0.274) for x, y in common.rrect(0.04, 0.025, 0.0249, na=10, nx=4, ny=2)]
common.boolean(lid, common.loft('sip', [[(x, y, z) for x, y in hole] for z in (0.70, 0.9)]))
common.bevel_mod(lid, 0.003, 2, 35)
cup = common.join([cup_body, lid], 'cup')


# ------------------------------------------------------------ cutlery, chopsticks and straw (real size x K)
def utensil(name, L, hwn, hwp, ht, zc, bowl, p, ends, mat, N=96, n=28):
    """A sweep along X; the width/thickness functions take t in 0..1 (handle end to head)."""
    t = 0.5 - 0.5 * np.cos(np.pi * np.linspace(0, 1, N))
    d = np.minimum(t, 1 - t) * L
    e = np.where(t < 0.5, end_round(d, ends[0]), end_round(d, ends[1]))
    et = end_round(d, 0.008)
    st = [(float((ti - 0.5) * L), max(float(a * ei), 1e-4), max(float(b * ei), 1e-4), max(float(c * ej), 1e-4),
           float(z), float(bw), float(pp))
          for ti, a, b, c, z, bw, pp, ei, ej in zip(t, hwn(t), hwp(t), ht(t), zc(t), bowl(t), p(t), e, et)]
    return common.sweep(name, st, n, mat)


def slot_cut(o, xs, xe, yc, w):
    pts = [(x + (xs + xe) / 2, y + yc) for x, y in common.rrect((xe - xs) / 2, w / 2, w / 2 - 1e-4, na=8, nx=2, ny=2)]
    common.boolean(o, common.loft('slot', [[(x, y, z) for x, y in pts] for z in (-0.3, 0.3)]))


L = 0.16 * K
handle = lambda t: curve(t, [0, 0.08, 0.3, 0.5, 0.6], [0.034, 0.034, 0.03, 0.021, 0.024])
fork_w = lambda t: curve(t, [0, 0.08, 0.3, 0.5, 0.6, 0.73, 1], [0.034, 0.034, 0.03, 0.021, 0.03, 0.075, 0.076])
fork = utensil('fork', L, fork_w, fork_w, lambda t: curve(t, [0, 0.5, 0.75], [0.011, 0.0105, 0.0085]),
               lambda t: 0.035 * smoothstep(0.5, 0.78, t), lambda t: 0.012 * smoothstep(0.62, 0.78, t),
               lambda t: curve(t, [0, 0.55, 0.75], [4, 4, 3]), (0.034, 0.03), CUTLERY)
for yc in (-0.0405, 0.0, 0.0405):
    slot_cut(fork, (0.8 - 0.5) * L, 0.7, yc, 0.018)
common.bevel_mod(fork, 0.0025, 2, 40)

ell = lambda t: 0.1 * np.sqrt(np.clip(1 - ((t - 0.81) / 0.19) ** 2, 0, 1))
spoon_w = lambda t: (handle(t) ** 6 + ell(t) ** 6) ** (1 / 6)
spoon = utensil('spoon', L, spoon_w, spoon_w, lambda t: curve(t, [0, 0.5, 0.7], [0.011, 0.0105, 0.009]),
                lambda t: -0.03 * smoothstep(0.5, 0.72, t), lambda t: 0.042 * (ell(t) / 0.1) ** 2,
                lambda t: curve(t, [0, 0.55, 0.72], [4, 4, 2.6]), (0.034, 0.012), CUTLERY)

sticks = []
for i, (y, turn) in enumerate(((-0.03, 0.0), (0.03, 0.045))):
    cs = 0.23 * K
    taper = lambda t: curve(t, [0, 1], [0.021, 0.0105], 0.01)
    s = utensil(f'stick{i}', cs, taper, taper, taper, lambda t: 0 * t, lambda t: 0 * t,
                lambda t: curve(t, [0, 0.55, 0.92, 1], [8, 8, 2.2, 2.2]), (0.006, 0.006), CUTLERY, N=70, n=20)
    s.data.transform(Matrix.Translation((0.02 * i, y, 0)) @ Matrix.Rotation(turn, 4, 'Z'))
    sticks.append(s)
chopsticks = common.join(sticks, 'chopsticks')

# drinking straw: a tube with open ends, 21 cm x 7 mm
SL, SR, SW = 0.21 * K / 2, 0.0035 * K, 0.0006 * K
sp = common.fillet([(SR - SW, -SL), (SR - SW, SL), (SR, SL), (SR, -SL)], 0.0012, n=3, closed=True)
sp = sp[:1] + [(SR - SW, z) for z in np.linspace(-SL * 0.9, SL * 0.9, 7)] + sp[1:]
straw = common.lathe('drinking_straw', sp, 28, STRAW, closed=True)
straw.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Y'))

small = [fork, spoon, chopsticks, straw]
for o in small:
    lay_flat(o)
pieces = [box, bowl, cup] + small
for o in pieces:
    common.smooth(o, 50 if o in small else 45)

# ------------------------------------------------------------ textures, AO, export
common.uv_smart(pieces, 'UVMap', tile=TILE)
spread = [(-2.2, 0), (0, 0), (2.0, 0), (-2.0, 1.6), (-2.0, 2.2), (0.2, 2.0), (1.8, 2.0)]
for o, (x, y) in zip(pieces, spread):  # apart while baking so they do not shade each other
    o.location = (x, y, 0)
common.bake_ao(pieces, 1024, distance=0.12, name='packaging')
for o in pieces:
    o.location = (0, 0, 0)
tris = common.triangles(pieces)
size = common.export_glb(pieces, GLB)
print(f'packaging: {GLB} {size / 1024:.1f} KB, {tris} triangles')
assert size <= MAX_BYTES, f'packaging.glb is {size} bytes, over the {MAX_BYTES} budget'
common.check_budget(os.path.dirname(GLB))


# ------------------------------------------------------------ previews
def arrange(obs):
    def put(name, x, y, rz=0.0):
        o = obs[name]
        o.rotation_mode = 'XYZ'
        o.location = (x, y, 0)
        o.rotation_euler = (0, 0, rz)
    put('box', -0.6, 0.35, math.radians(18))
    put('bowl', 0.95, 0.55)
    put('cup', 0.22, -0.42, math.radians(28))
    put('fork', 1.3, -0.72, math.radians(84))
    put('spoon', 1.52, -0.74, math.radians(88))
    put('chopsticks', -0.72, -0.78, math.radians(12))
    cup = obs['cup']  # the straw stands in the cup through the sip hole, leaning out of it
    rot = Matrix.Rotation(cup.rotation_euler.z, 4, 'Z')
    hole = Vector(cup.location) + rot @ SIP
    out = (rot @ Vector((0, -1, 0))).normalized()
    axis = (Vector((0, 0, 1)) + out * 0.2).normalized()
    centre = hole + axis * (SL - 0.42)
    st = obs['drinking_straw']
    st.rotation_mode = 'QUATERNION'
    st.matrix_world = (Matrix.Translation(centre) @ Vector((1, 0, 0)).rotation_difference(axis).to_matrix().to_4x4()
                       @ Matrix.Translation((0, 0, -SR)))


P = lambda n: os.path.join(OUT, n)
common.render_previews(GLB, [
    (P('packaging-hero.png'), (2.3, -3.9, 2.1), (0.35, -0.1, 0.25), 38),
    (P('packaging-close.png'), (-0.05, -1.55, 0.72), (-0.55, 0.05, 0.24), 50),
    (P('packaging-cup.png'), (0.75, -1.45, 1.25), (0.3, -0.35, 0.72), 50),
    (P('packaging-bowl.png'), (1.75, -0.75, 1.45), (0.95, 0.5, 0.15), 42),
    (P('packaging-cutlery.png'), (1.1, -1.75, 0.75), (1.4, -0.75, 0.02), 55),
    (P('packaging-straw.png'), (0.78, -1.22, 1.84), (0.426, -0.807, 1.6), 70),  # the straw's open top end, standing in the cup
], look='sunset', arrange=arrange, ground=(0.06, 0.035, 0.022, 1))
