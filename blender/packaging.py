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
CREAM = common.srgb(226, 205, 166)   # x the ~0.96 albedo: about #D9C3A0 under neutral light, warm beige
PULP = common.pbr('pulp', CREAM, ALB, NRM, strength=0.4, rough=0.74, sheen=0.25)           # smooth pressed face
PULP_IN = common.pbr('pulp_inner', common.srgb(222, 199, 162), ALB, NRM, strength=1.0, rough=0.9, sheen=0.3)  # screen side
CUTLERY = common.pbr('pulp_cutlery', common.srgb(224, 200, 160), ALB, NRM, strength=0.45, rough=0.72, sheen=0.25)
STRAW = common.pbr('straw', common.srgb(228, 204, 158), ALB, NRM, strength=0.35, rough=0.85, sheen=0.2)
STRAW_IN = common.pbr('straw_inner', common.srgb(112, 94, 68), ALB, NRM, strength=0.6, rough=0.97)  # the bore, darker


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
HX, HY = 0.100, 0.075      # outer half extents of the flanges: 20 x 15 cm footprint
ZB = 0.026                 # top of the base flange; the lid flange sits 0.7 mm above it


def box_ring(d, z):
    return [(x, y, z) for x, y in common.rrect(HX - d, HY - d, max(0.034 - 0.55 * d, 0.004), na=12, nx=12, ny=10)]


# (inset from the flange edge, height). Base: recessed bottom, foot, tray wall with a 7 degree draft, base flange.
# Seam: a 0.7 mm parting line only 1.6 mm deep (the lid's inner lip sits right behind it, no cavity). Lid: flange,
# wall with the same draft, a soft rounded top edge and a gently domed top with a low raised panel.
D7 = math.tan(math.radians(7))
prof = [(0.040, 0.0016), (0.0195, 0.0016), (0.0172, 0.0), (0.0138, 0.0), (0.0138 - D7 * 0.0245, 0.0245),
        (0.0008, 0.0247), (0.0, 0.0253), (0.0008, ZB), (0.0016, ZB), (0.0016, ZB + 0.0007), (0.0008, ZB + 0.0007),
        (0.0, ZB + 0.0013), (0.0008, ZB + 0.002), (0.0102, ZB + 0.002), (0.0102 + D7 * 0.0245, ZB + 0.0265),
        (0.0185, 0.0548), (0.032, 0.0558), (0.045, 0.0563), (0.0482, 0.0565), (0.0498, 0.0571), (0.060, 0.0574),
        (0.069, 0.0575)]
prof = common.fillet(prof, [0, .002, .001, .004, .0012, .0004, .0004, .0003, .0002, .0002, .0003, .0004, .0004, .0012,
                            .006, .008, .01, .0015, .0015, .0015, .004, 0], n=2)
shell = common.loft('box_shell', [box_ring(d, z) for d, z in prof], PULP)
# hinge: a folded strip wrapping round both flanges' back edges, with a crease at the fold
hinge = common.strip('box_hinge', [(0, 0.0715, 0.0249), (0, 0.0762, 0.0249), (0, 0.0781, 0.0262), (0, 0.0784, 0.0273),
                                   (0, 0.0781, 0.0284), (0, 0.0762, 0.0298), (0, 0.0715, 0.0298)], 0.062, 0.0006, PULP)
# snap tab: the lid flange's front tongue folds down over the base flange's edge (0.9 mm clear) and hooks under it
tab_path = [(0, -0.0715, ZB + 0.0025), (0, -0.0754, ZB + 0.0025), (0, -0.0760, ZB + 0.0016), (0, -0.0761, 0.0252),
            (0, -0.0755, 0.0242), (0, -0.0712, 0.0241)]   # hugging the flange edges with 0.4 mm clear
tab = common.strip('box_tab', tab_path, [0.011, 0.011, 0.011, 0.0108, 0.0102, 0.009], 0.0005, PULP)
box = common.join([shell, hinge, tab], 'box')

# ------------------------------------------------------------ bowl: 16.9 cm, thin wall, rolled rim, foot ring, floor
H, RT, T = 0.054, 0.0845, 0.0018      # height (above the foot), rim radius, wall
FLOOR_R = [0.008, 0.016, 0.022, 0.0245, 0.027, 0.0295, 0.032, 0.0345, 0.037, 0.042]
outer = [(0, 0.0)] + [(r, 0.0) for r in FLOOR_R] + [(0.062, 0.0), (RT, H)]
outer = common.fillet(outer, [0] * (len(FLOOR_R) + 1) + [0.024, 0], n=8)
outer = [p for i, p in enumerate(outer) if i == 0 or abs(p[0] - outer[i - 1][0]) + abs(p[1] - outer[i - 1][1]) > 1e-6]
wall = common.shell(outer, T, bead=0.0022)   # one continuous fillet from wall into floor, inside and out
n_out = len(outer) + 15
bowl_p = []
for i, (r, z) in enumerate(wall):
    if i >= n_out and z < T + 1e-4:          # a soft debossed ring, 1 mm deep, in the inner floor
        z -= 0.001 * math.exp(-((r - 0.03) / 0.0028) ** 2)
    bowl_p.append((r, z + 0.0022))
foot = common.lathe('bowl_foot', common.fillet([(0.0445, 0.0026), (0.0455, 0.0), (0.0505, 0.0), (0.052, 0.0026)],
                                               [0, 0.0008, 0.0008, 0], n=2), 80, PULP)   # moulded foot ring
bowl = common.lathe('bowl', bowl_p, 80, PULP)
bowl = common.join([bowl, foot], 'bowl')
for poly in bowl.data.polygons:              # the screen (inner) side is rougher: inner wall and floor
    c = poly.center
    radial = Vector((c.x, c.y, 0)).normalized() if c.xy.length > 1e-6 else Vector()
    if (poly.normal.dot(radial) < -0.25 or poly.normal.z > 0.7) and c.z > 0.004 and c.z < H + 0.0005:
        poly.material_index = 1
bowl.data.materials.append(PULP_IN)

# ------------------------------------------------------------ 12 oz cup, snap-on lid with a straw hole (front = -Y)
body = common.fillet([(0, 0.007), (0.0285, 0.007), (0.0292, 0.0), (0.0302, 0.0), (0.0445, 0.106)], [0, .0012, .0006, .0008, 0], n=3)
cup_body = common.lathe('cup_body', common.shell(body, 0.0015, bead=0.0018), 88, PULP)
lid_p = [(0, 0.1112), (0.034, 0.1112), (0.0365, 0.1138), (0.0395, 0.1147), (0.0422, 0.1138), (0.0440, 0.1110),
         (0.0466, 0.1102), (0.0474, 0.1086), (0.0481, 0.1072), (0.0476, 0.1058), (0.0485, 0.1046)]
lid_p = common.fillet(lid_p, [0, .0012, .0012, .0014, .0012, .0012, .0008, .0006, .0008, .0006, 0], n=2)
lid = common.lathe('cup_lid', common.shell(lid_p, -0.0011), 88, PULP)
HOLE = Vector((0.010, -0.017, 0.1112))   # the straw hole, cup space
cut = common.lathe('hole', [(0, 0.104), (0.00375, 0.104), (0.00375, 0.12), (0, 0.12)], 32)   # a snug fit on the 7 mm straw
cut.data.transform(Matrix.Translation((HOLE.x, HOLE.y, 0)))
common.boolean(lid, cut)
common.bevel_mod(lid, 0.0003, 2, 35)
cup = common.join([cup_body, lid], 'cup')


# ------------------------------------------------------------ fork, spoon, chopsticks, straw
def utensil(name, L, hw, ht, zc, bowl, p, ends, mat, N=72, n=24):
    """A sweep along X; the width/thickness functions take t in 0..1 (handle end to head). An end radius of 0 leaves
    that end square and full size (to be shaped by booleans: a collapsed tip breaks the exact solver)."""
    t = 0.5 - 0.5 * np.cos(np.pi * np.linspace(0, 1, N))
    d = np.minimum(t, 1 - t) * L
    rnd = lambda r: end_round(d, r) if r else np.ones_like(d)
    e = np.where(t < 0.5, rnd(ends[0]), rnd(ends[1]))
    et = np.where(t < 0.5, end_round(d, 0.0012), end_round(d, 0.0012) if ends[1] else 1.0)
    st = [(float((ti - 0.5) * L), max(float(a * ei), 2e-4), max(float(a * ei), 2e-4), max(float(c * ej), 2e-4),
           float(z), float(bw), float(pp))
          for ti, a, c, z, bw, pp, ei, ej in zip(t, hw(t), ht(t), zc(t), bowl(t), p(t), e, et)]
    return common.sweep(name, st, n, mat)


def prism(name, pts, z0=-0.02, z1=0.03):
    """A cutter: the closed 2D outline pts extruded from z0 to z1."""
    return common.loft(name, [[(x, y, z) for x, y in pts] for z in (z0, z1)])


def rib(name, L, t0, t1, hw, ht, zc, thick, mat):
    """A stiffening rib along the top of a handle and neck, fading in and out at both ends."""
    t = np.linspace(t0, t1, 28)
    fade = np.sin(np.pi * (t - t0) / (t1 - t0)) ** 0.35
    st = [(float((ti - 0.5) * L), float(hw * f + 1e-5), float(hw * f + 1e-5), float(ht * f + 1e-5),
           float(zc(ti) + thick(ti) - 0.0002), 0.0, 2.5) for ti, f in zip(t, fade)]
    return common.sweep(name, st, 12, mat)


L = 0.16
handle = lambda t: curve(t, [0, 0.08, 0.3, 0.5, 0.56], [0.0062, 0.0062, 0.0055, 0.004, 0.0042])
# fork: a 7 cm head (t 0.56-1) whose four tines run its last 40%, tapering to rounded tips; the head dishes and curves up
fork_w = lambda t: curve(t, [0, 0.08, 0.3, 0.5, 0.56, 0.75, 1], [0.0062, 0.0062, 0.0055, 0.004, 0.0046, 0.0122, 0.0113], 0.02)
fork_t = lambda t: curve(t, [0, 0.5, 0.72, 0.84, 1], [0.0019, 0.0017, 0.0014, 0.0012, 0.0008])
fork_z = lambda t: 0.0042 * smoothstep(0.5, 0.82, t) + 0.0016 * smoothstep(0.84, 1.0, t)
fork = utensil('fork', L, fork_w, fork_t, fork_z, lambda t: 0.0016 * smoothstep(0.6, 0.8, t),
               lambda t: curve(t, [0, 0.55, 0.75], [3.5, 3.5, 3]), (0.0062, 0), CUTLERY, N=84)
X_ROOT, X_TIP = (0.835 - 0.5) * L, 0.5 * L
tip = [(X_TIP + 0.02, -0.02)]             # round every tine tip: cut away everything beyond four rounded ends
for tc, tw in ((-0.0094, 0.0018), (-0.00315, 0.00185), (0.00315, 0.00185), (0.0094, 0.0018)):
    tip += [(X_TIP - 0.004, tc - tw - 0.0004)]
    tip += [(X_TIP - tw + tw * math.cos(a), tc + tw * math.sin(a)) for a in np.linspace(-math.pi / 2, math.pi / 2, 9)]
    tip += [(X_TIP - 0.004, tc + tw + 0.0004)]
tip += [(X_TIP + 0.02, 0.02)]
common.boolean(fork, prism('tips', tip))  # first, while the sweep is still a clean closed solid
for yc in (-0.0063, 0.0, 0.0063):       # slots: round at the root, widening to the tip, so the tines taper
    w0, w1 = 0.0007, 0.0013
    pts = [(X_ROOT + w0 * math.cos(a), yc + w0 * math.sin(a)) for a in np.linspace(math.pi / 2, 3 * math.pi / 2, 9)]
    common.boolean(fork, prism('slot', pts + [(X_TIP + 0.01, yc - w1 - 0.0004), (X_TIP + 0.01, yc + w1 + 0.0004)]))
common.bevel_mod(fork, 0.0003, 2, 40)
fork = common.join([fork, rib('fork_rib', L, 0.04, 0.66, 0.0011, 0.0007, fork_z, fork_t, CUTLERY)], 'fork')

ell = lambda t: 0.0175 * np.sqrt(np.clip(1 - ((t - 0.79) / 0.21) ** 2, 0, 1))
spoon_w = lambda t: (handle(t) ** 6 + ell(t) ** 6) ** (1 / 6)
spoon_t = lambda t: curve(t, [0, 0.5, 0.7], [0.0019, 0.0017, 0.0014])
spoon_z = lambda t: -0.0045 * smoothstep(0.5, 0.72, t)
spoon = utensil('spoon', L, spoon_w, spoon_t, spoon_z, lambda t: 0.0068 * (ell(t) / 0.0175) ** 2,
                lambda t: curve(t, [0, 0.55, 0.72], [3.5, 3.5, 2.6]), (0.0062, 0.002), CUTLERY)
spoon = common.join([spoon, rib('spoon_rib', L, 0.04, 0.6, 0.0011, 0.0007, spoon_z, spoon_t, CUTLERY)], 'spoon')

sticks = []
for i, y in enumerate((-0.00475, 0.00475)):  # parallel, 2.5 mm apart: eased square butts tapering to 60%, round tips
    taper = lambda t: curve(t, [0, 0.35, 1], [0.0035, 0.0033, 0.0021], 0.05)
    s = utensil(f'stick{i}', 0.23, taper, taper, lambda t: 0 * t, lambda t: 0 * t,
                lambda t: curve(t, [0, 0.35, 0.9, 1], [4.5, 4.5, 2.2, 2.2]), (0.0012, 0.0019), CUTLERY, N=56, n=20)
    s.data.transform(Matrix.Translation((0.004 * i, y, 0)))
    sticks.append(s)
chopsticks = common.join(sticks, 'chopsticks')

SL, SR, SW = 0.0775, 0.0035, 0.0006   # straw: 15.5 cm (stands ~45% of the cup's height above the lid), 7 mm, 0.6 mm wall
sp = common.fillet([(SR - SW, -SL), (SR - SW, SL), (SR, SL), (SR, -SL)], 0.00022, n=4, closed=True)
sp = sp[:1] + [(SR - SW, z) for z in np.linspace(-SL * 0.92, SL * 0.92, 9)] + sp[1:]
straw = common.lathe('drinking_straw', sp, 32, STRAW, closed=True)
straw.data.materials.append(STRAW_IN)
for poly in straw.data.polygons:  # the bore wall, full length, takes the darker inner material
    if poly.center.xy.length < SR - SW * 0.5 and abs(poly.center.z) < SL - 0.0004:
        poly.material_index = 1
straw.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Y'))

small = [fork, spoon, chopsticks, straw]
for o in small:
    lay_flat(o)
pieces = [box, bowl, cup] + small
for o in pieces:
    common.smooth(o, 50 if o in small else 45)

# ------------------------------------------------------------ textures, AO, export
common.uv_smart([p for p in pieces if p is not straw], 'UVMap', tile=TILE)
common.uv_smart([straw], 'UVMap', tile=TILE * 0.5)
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
CUP_AT, CUP_TURN = Vector((0.215, 0.045, 0)), math.radians(-20)


def straw_matrix():
    """The straw standing in the cup through the lid's hole, leaning out of it by about 8 degrees."""
    rot = Matrix.Rotation(CUP_TURN, 4, 'Z')
    hole = CUP_AT + rot @ HOLE
    axis = (Vector((0, 0, 1)) + (rot @ Vector((HOLE.x, HOLE.y, 0))).normalized() * 0.14).normalized()
    centre = hole + axis * (SL - 0.1025)   # its foot just clear of the cup's floor
    return Matrix.Translation(centre) @ Vector((1, 0, 0)).rotation_difference(axis).to_matrix().to_4x4() @ Matrix.Translation((0, 0, -SR))


def arrange(obs):
    def put(name, x, y, rz=0.0):
        o = obs[name]
        o.rotation_mode = 'XYZ'
        o.location = (x, y, 0)
        o.rotation_euler = (0, 0, math.radians(rz))
    put('box', -0.15, 0.03, 4)
    put('bowl', 0.06, 0.065)
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
    (P('packaging-close.png'), (-0.065, -0.215, 0.095), (-0.145, 0.0, 0.028), 50),
    (P('packaging-cup.png'), (0.265, -0.13, 0.19), (0.215, 0.04, 0.1), 50),
    (P('packaging-bowl.png'), (0.13, -0.14, 0.2), (0.06, 0.065, 0.02), 45),
    (P('packaging-cutlery.png'), (0.07, -0.29, 0.13), (0.06, -0.1, 0.0), 45),
    (P('packaging-straw.png'), tuple(top + Vector((0.035, -0.06, 0.03))), tuple(top - Vector((0, 0, 0.01))), 70),
], look='sunset', arrange=arrange, ground=common.srgb(52, 34, 24))
