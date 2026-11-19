"""The packaging, at real size in metres: thin moulded pressed-straw-fibre clamshell meal box, bowl, and a 12 oz cup
with a snap-on lid and straw hole, plus fork, spoon, chopsticks and a drinking straw.

blender --background --factory-startup --python blender/packaging.py -- [out.glb] [preview dir]

Real sizes: box 20 x 15 x 7.6 cm, bowl 15 cm across, cup 11 cm tall, fork and spoon 16 cm, chopsticks 23 cm, straw
21 cm x 7 mm. Walls 1.5-1.8 mm with thin rolled rims. Film.js applies one group scale. Every piece is its own node
with no transform and its origin at its table-contact centre, front = glTF +Z; the small pieces lie flat with their
length along glTF X.
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
MAX_BYTES = 600 * 1024
TILE = 0.08                # metres of surface per repeat of the fibre texture (fibres 0.2-1 mm)

bpy.ops.wm.read_factory_settings(use_empty=True)
ALB, NRM = common.fibre_textures(1024)
CREAM = common.srgb(236, 214, 172)   # the reference's light cream-beige
PULP = common.pbr('pulp', CREAM, ALB, NRM, strength=0.5, rough=0.8)
CUTLERY = common.pbr('pulp_cutlery', common.srgb(234, 210, 166), ALB, NRM, strength=0.45, rough=0.76)
STRAW = common.pbr('straw', common.srgb(232, 204, 150), ALB, NRM, strength=0.3, rough=0.9)


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


# ------------------------------------------------------------ clamshell meal box (front = -Y, hinge at the back)
HX, HY = 0.100, 0.075      # outer half extents of the base flange


def box_ring(d, z):
    return [(x, y, z) for x, y in common.rrect(HX - d, HY - d, max(0.024 - 0.5 * d, 0.012), na=12, nx=10, ny=8)]


# (inset from the base flange's edge, height): recessed base, foot, tray wall with a 5 degree draft, the base flange,
# the parting seam, the lid flange sitting just over it, the lid wall, rounded top edge and a raised top panel
prof = [(0.032, 0.0018), (0.016, 0.0018), (0.0145, 0.0), (0.0118, 0.0), (0.0088, 0.0352), (0.0016, 0.0352),
        (0.0, 0.0360), (0.0016, 0.0368), (0.0026, 0.0372), (0.0008, 0.0376), (-0.0008, 0.0384), (0.0008, 0.0392),
        (0.0072, 0.0394), (0.0098, 0.0398), (0.0128, 0.0720), (0.0165, 0.0750), (0.0215, 0.0750), (0.0235, 0.0762),
        (0.060, 0.0762)]
prof = common.fillet(prof, [0, .002, .001, .003, .0012, .0004, .0006, .0004, .0002, .0004, .0006, .0004, .0008, .0006,
                            .004, .004, .0008, .0006, 0], n=2)
shell = common.loft('box_shell', [box_ring(d, z) for d, z in prof], PULP)
# hinge: the two flanges joined at the back by a folded strip with a crease
hinge = common.strip('box_hinge', [(0, 0.072, 0.0360), (0, 0.0775, 0.0360), (0, 0.0805, 0.0367), (0, 0.0816, 0.0376),
                                   (0, 0.0805, 0.0386), (0, 0.0775, 0.0391), (0, 0.072, 0.0391)], 0.072, 0.0007, PULP)
# snap tab: the lid flange's front tongue folds down over the base flange's edge
tab_path = [(0, -0.072, 0.0384), (0, -0.0805, 0.0387), (0, -0.0818, 0.0372), (0, -0.0805, 0.0345), (0, -0.0735, 0.031),
            (0, -0.0675, 0.0288)]  # over the base flange's edge and hooked in under it, against the tray wall
tab = common.strip('box_tab', tab_path, [0.012, 0.012, 0.012, 0.0118, 0.011, 0.0092], 0.0008, PULP)
box = common.join([shell, hinge, tab], 'box')

# ------------------------------------------------------------ bowl: 15 cm, thin wall, rolled rim, foot ring, floor
H = 0.062
outer = [(0.047 + 0.028 * (z / H) ** 0.55, z) for z in H * np.linspace(0.04, 1, 18) ** 1.25]
foot = common.fillet([(0, 0.0032), (0.040, 0.0032), (0.0415, 0.0), (0.0445, 0.0), outer[0]], [0, .0012, .0006, .001, 0], n=3)
bowl = common.lathe('bowl', common.shell(foot + outer[1:], 0.0018, bead=0.0021), 96, PULP)

# ------------------------------------------------------------ 12 oz cup, snap-on lid with a straw hole (front = -Y)
body = common.fillet([(0, 0.007), (0.0285, 0.007), (0.0292, 0.0), (0.0302, 0.0), (0.0445, 0.106)], [0, .0012, .0006, .0008, 0], n=3)
cup_body = common.lathe('cup_body', common.shell(body, 0.0015, bead=0.0018), 96, PULP)
lid_p = [(0, 0.1112), (0.034, 0.1112), (0.0365, 0.1138), (0.0395, 0.1147), (0.0422, 0.1138), (0.0440, 0.1110),
         (0.0466, 0.1102), (0.0474, 0.1086), (0.0481, 0.1072), (0.0476, 0.1058), (0.0485, 0.1046)]
lid_p = common.fillet(lid_p, [0, .0012, .0012, .0014, .0012, .0012, .0008, .0006, .0008, .0006, 0], n=2)
lid = common.lathe('cup_lid', common.shell(lid_p, -0.0011), 96, PULP)
HOLE = Vector((0.010, -0.017, 0.1112))   # the straw hole, cup space
cut = common.lathe('hole', [(0, 0.104), (0.0042, 0.104), (0.0042, 0.12), (0, 0.12)], 32)
cut.data.transform(Matrix.Translation((HOLE.x, HOLE.y, 0)))
common.boolean(lid, cut)
common.bevel_mod(lid, 0.0003, 2, 35)
cup = common.join([cup_body, lid], 'cup')


# ------------------------------------------------------------ fork, spoon, chopsticks, straw
def utensil(name, L, hw, ht, zc, bowl, p, ends, mat, N=72, n=24):
    """A sweep along X; the width/thickness functions take t in 0..1 (handle end to head)."""
    t = 0.5 - 0.5 * np.cos(np.pi * np.linspace(0, 1, N))
    d = np.minimum(t, 1 - t) * L
    e = np.where(t < 0.5, end_round(d, ends[0]), end_round(d, ends[1]))
    et = end_round(d, 0.0012)
    st = [(float((ti - 0.5) * L), max(float(a * ei), 1e-5), max(float(a * ei), 1e-5), max(float(c * ej), 1e-5),
           float(z), float(bw), float(pp))
          for ti, a, c, z, bw, pp, ei, ej in zip(t, hw(t), ht(t), zc(t), bowl(t), p(t), e, et)]
    return common.sweep(name, st, n, mat)


def tine_slot(o, x0, x1, yc, w0, w1):
    """Cut a slot that is narrow and round at the root (x0) and widens to the tip: the tines taper."""
    pts = [(x0 + w0 * math.cos(a), yc + w0 * math.sin(a)) for a in np.linspace(math.pi / 2, 3 * math.pi / 2, 9)]
    pts += [(x1, yc - w1), (x1, yc + w1)]
    common.boolean(o, common.loft('slot', [[(x, y, z) for x, y in pts] for z in (-0.02, 0.03)]))


L = 0.16
handle = lambda t: curve(t, [0, 0.08, 0.3, 0.5, 0.6], [0.0062, 0.0062, 0.0055, 0.0042, 0.0046])
crown = lambda t: -0.0005 * (1 - smoothstep(0.45, 0.6, t))   # a raised spine along the handle
fork_w = lambda t: curve(t, [0, 0.08, 0.3, 0.5, 0.6, 0.72, 1], [0.0062, 0.0062, 0.0055, 0.0042, 0.0058, 0.0125, 0.0128])
fork = utensil('fork', L, fork_w, lambda t: curve(t, [0, 0.5, 0.75], [0.0019, 0.0017, 0.0012]),
               lambda t: 0.004 * smoothstep(0.5, 0.8, t) + 0.0015 * smoothstep(0.85, 1.0, t),
               lambda t: 0.0012 * smoothstep(0.6, 0.8, t) + crown(t),
               lambda t: curve(t, [0, 0.55, 0.75], [4, 4, 3]), (0.0062, 0.0045), CUTLERY)
for yc in (-0.0064, 0.0, 0.0064):
    tine_slot(fork, (0.79 - 0.5) * L, 0.1, yc, 0.0007, 0.0017)
common.bevel_mod(fork, 0.0004, 2, 40)

ell = lambda t: 0.0175 * np.sqrt(np.clip(1 - ((t - 0.79) / 0.21) ** 2, 0, 1))
spoon_w = lambda t: (handle(t) ** 6 + ell(t) ** 6) ** (1 / 6)
spoon = utensil('spoon', L, spoon_w, lambda t: curve(t, [0, 0.5, 0.7], [0.0019, 0.0017, 0.0014]),
                lambda t: -0.0045 * smoothstep(0.5, 0.72, t), lambda t: 0.0068 * (ell(t) / 0.0175) ** 2 + crown(t),
                lambda t: curve(t, [0, 0.55, 0.72], [4, 4, 2.6]), (0.0062, 0.002), CUTLERY)

sticks = []
for i, (y, turn) in enumerate(((-0.0055, 0.0), (0.0055, 0.03))):
    taper = lambda t: curve(t, [0, 1], [0.0036, 0.0017], 0.01)
    s = utensil(f'stick{i}', 0.23, taper, taper, lambda t: 0 * t, lambda t: 0 * t,
                lambda t: curve(t, [0, 0.35, 0.9, 1], [8, 8, 2.2, 2.2]), (0.0012, 0.0012), CUTLERY, N=56, n=16)
    s.data.transform(Matrix.Translation((0.003 * i, y, 0)) @ Matrix.Rotation(turn, 4, 'Z'))
    sticks.append(s)
chopsticks = common.join(sticks, 'chopsticks')

SL, SR, SW = 0.105, 0.0035, 0.0006   # straw: half length, outer radius, wall
sp = common.fillet([(SR - SW, -SL), (SR - SW, SL), (SR, SL), (SR, -SL)], 0.00025, n=3, closed=True)
sp = sp[:1] + [(SR - SW, z) for z in np.linspace(-SL * 0.9, SL * 0.9, 7)] + sp[1:]
straw = common.lathe('drinking_straw', sp, 24, STRAW, closed=True)
straw.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Y'))

small = [fork, spoon, chopsticks, straw]
for o in small:
    lay_flat(o)
pieces = [box, bowl, cup] + small
for o in pieces:
    common.smooth(o, 50 if o in small else 45)

# ------------------------------------------------------------ textures, AO, export
common.uv_smart(pieces, 'UVMap', tile=TILE)
for i, o in enumerate(pieces):  # apart while baking so they do not shade each other
    o.location = ((i % 4) * 0.3, (i // 4) * 0.3, 0)
common.bake_ao(pieces, 1024, distance=0.02, name='packaging')
for o in pieces:
    o.location = (0, 0, 0)
tris = common.triangles(pieces)
size = common.export_glb(pieces, GLB)
print(f'packaging: {GLB} {size / 1024:.1f} KB, {tris} triangles')
assert size <= MAX_BYTES, f'packaging.glb is {size} bytes, over the {MAX_BYTES} budget'
common.check_budget(os.path.dirname(GLB))


# ------------------------------------------------------------ previews (set out as on the café table)
CUP_AT, CUP_TURN = Vector((0.2, 0.045, 0)), math.radians(-20)


def straw_matrix():
    """The straw standing in the cup through the lid's hole, leaning out of it by about 8 degrees."""
    rot = Matrix.Rotation(CUP_TURN, 4, 'Z')
    hole = CUP_AT + rot @ HOLE
    axis = (Vector((0, 0, 1)) + (rot @ Vector((HOLE.x, HOLE.y, 0))).normalized() * 0.14).normalized()
    centre = hole + axis * (SL - 0.1)
    return Matrix.Translation(centre) @ Vector((1, 0, 0)).rotation_difference(axis).to_matrix().to_4x4() @ Matrix.Translation((0, 0, -SR))


def arrange(obs):
    def put(name, x, y, rz=0.0):
        o = obs[name]
        o.rotation_mode = 'XYZ'
        o.location = (x, y, 0)
        o.rotation_euler = (0, 0, math.radians(rz))
    put('box', -0.135, 0.03, 4)
    put('bowl', 0.06, 0.06)
    put('cup', CUP_AT.x, CUP_AT.y, math.degrees(CUP_TURN))
    put('fork', -0.01, -0.105, 52)
    put('spoon', 0.045, -0.11, 54)
    put('chopsticks', 0.14, -0.1, 56)
    st = obs['drinking_straw']
    st.rotation_mode = 'QUATERNION'
    st.matrix_world = straw_matrix()


top = straw_matrix() @ Vector((SL, 0, SR))
P = lambda n: os.path.join(OUT, n)
common.render_previews(GLB, [
    (P('packaging-hero.png'), (0.12, -0.5, 0.28), (0.02, -0.01, 0.035), 42),
    (P('packaging-close.png'), (-0.05, -0.215, 0.105), (-0.13, 0.0, 0.034), 50),
    (P('packaging-cup.png'), (0.25, -0.13, 0.19), (0.2, 0.04, 0.1), 50),
    (P('packaging-bowl.png'), (0.13, -0.13, 0.2), (0.06, 0.06, 0.025), 45),
    (P('packaging-cutlery.png'), (0.07, -0.29, 0.13), (0.06, -0.1, 0.0), 45),
    (P('packaging-straw.png'), tuple(top + Vector((0.035, -0.06, 0.03))), tuple(top - Vector((0, 0, 0.01))), 70),
], look='sunset', arrange=arrange, ground=common.srgb(52, 34, 24))
