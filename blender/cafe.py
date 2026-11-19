"""The rooftop café, at real size in metres: a small round bistro table with a planked oiled-teak top on a cast-iron
base, two woven rattan bistro chairs, a candle burning low in a ribbed amber glass tumbler, and a festoon string of
clear S14 LED-filament bulbs on a twisted-pair cable.

blender --background --factory-startup --python blender/cafe.py -- [out.glb] [preview dir]

Origin on the floor under the table's centre, front = glTF +Z. Table top 0.70 m across at 0.75 m; chair seats at
0.45 m. Film.js applies one group scale and places it. Nodes: table, chair_l, chair_r (one shared mesh), candle
(glass, wax, wick), candle_flame (core, body, blue base), string_wire, bulb_00 .. bulb_13 (glass shell, stem, lead
wires and spiral filament), string_posts (round planters, poles, eye bolts). Emissive materials: flame, flame_core,
flame_blue, bulb (filament), wax (faint).
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
GLB = os.path.abspath(ARGS[0] if ARGS else os.path.join(ROOT, 'models', 'cafe.glb'))
OUT = os.path.abspath(ARGS[1] if len(ARGS) > 1 else os.path.join(ROOT, 'docs', 'film-renders', 'assets'))
MAX_BYTES = 600 * 1024
TOP, R = 0.75, 0.35
CANDLE = Vector((-0.2, -0.13, TOP))   # front left on the top, as in the reference
V = Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
TEAK_ALB, TEAK_NRM = common.teak_textures(1024, nsize=512)
TEAK = common.pbr('teak', (1, 1, 1, 1), TEAK_ALB, TEAK_NRM, strength=0.8, rough=0.42, coat=0.35)   # oiled, satin
TEAK_EDGE = common.pbr('teak_worn', common.srgb(255, 236, 212), TEAK_ALB, TEAK_NRM, strength=0.9, rough=0.6)  # worn rim
IRON = common.pbr('iron', common.srgb(32, 30, 28), rough=0.45, metal=0.5)
FRAME = common.pbr('rattan_frame', (1, 1, 1, 1), *common.cane_textures(256), strength=0.8, rough=0.55)
WEAVE = common.pbr('rattan_weave', (1, 1, 1, 1), *common.weave_textures(512, 14, 'basket', (0.36, 0.22, 0.11), contrast=0.85),
                   strength=2.0, rough=0.7)   # ~8 mm strands
GLASS = common.pbr('glass', common.srgb(200, 120, 30), rough=0.05, transmission=1.0, ior=1.5)   # deep amber
WAX = common.pbr('wax', common.srgb(242, 224, 192), rough=0.45, emission=(0.3, 0.15, 0.04, 1.0))
WICK = common.pbr('wick', common.srgb(14, 12, 11), rough=0.9)
FLAME = common.pbr('flame', (1, 0.55, 0.15, 1), rough=1.0, emission=(1.0, 0.5, 0.12, 1.2), alpha=0.75)
CORE = common.pbr('flame_core', (1, 0.95, 0.8, 1), rough=1.0, emission=(1.0, 0.92, 0.7, 1.0))
BLUE = common.pbr('flame_blue', (0.3, 0.45, 1, 1), rough=1.0, emission=(0.25, 0.4, 1.0, 1.0), alpha=0.35)
BULB = common.pbr('bulb', (1, 0.7, 0.35, 1), rough=0.5, emission=(1.0, 0.6, 0.25, 1.0))
BULB_GLASS = common.pbr('bulb_glass', common.srgb(252, 244, 232), rough=0.03, transmission=1.0)  # clear glass
LEAD = common.pbr('lead_wire', common.srgb(150, 140, 125), rough=0.3, metal=1.0)
CABLE = common.pbr('cable', common.srgb(11, 11, 12), rough=0.55)                  # matte-satin black rubber
FOOT = common.pbr('chair_foot', common.srgb(11, 11, 12), rough=0.55)   # the cable's rubber, but AO-baked with the chair
POST_IRON = common.pbr('post_iron', common.srgb(32, 30, 28), rough=0.45, metal=0.5)   # iron without the table's AO
PLANTER = common.pbr('planter', common.srgb(78, 74, 70), rough=0.9)           # weighted fibre-cement pot
SOIL = common.pbr('soil', common.srgb(38, 28, 20), rough=1.0)


def uv_box(tile):
    """Planar per dominant axis (woven panels)."""
    def fn(cos, poly):
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        a, b = ((1, 2), (0, 2), (0, 1))[ax]
        return [(c[a] / tile, c[b] / tile) for c in cos]
    return fn


def sweep_x(name, x0, x1, n_st, sec, mat, n=16, ends=0.02):
    """sec(x) -> (hw, ht, zc, p); ends rounded with radius ends."""
    st = []
    for i in range(n_st):
        x = x0 + (x1 - x0) * (0.5 - 0.5 * math.cos(math.pi * i / (n_st - 1)))
        d = min(x - x0, x1 - x)
        e = math.sqrt(max(0.0, 1 - (1 - min(d, ends) / ends) ** 2)) if ends else 1.0
        hw, ht, zc, p = sec(x)
        st.append((x, max(hw * e, 1e-4), max(hw * e, 1e-4), max(ht * e, 1e-4), zc, 0, p))
    return common.sweep(name, st, n, mat)


def bake_transforms(objs):
    bpy.context.view_layer.update()
    for o in objs:
        o.data.transform(o.matrix_world)
        o.matrix_world.identity()


def orient(at, axis):
    """A matrix putting local Z along axis at the point at."""
    return Matrix.Translation(at) @ V((0, 0, 1)).rotation_difference(V(axis).normalized()).to_matrix().to_4x4()


# ------------------------------------------------------------ table: six oiled teak planks on a cast-iron base
TT = 0.35                     # metres of teak texture per repeat
NPL, GAP, THK = 6, 0.0012, 0.028
rng = random.Random(3)
# (inset at the round ends, inset along the long seams, height): a bullnose rim and a fine 1 mm bevel at each seam
RINGS = [(0.006, 0.0008, TOP - THK), (0.0015, 0.0, TOP - THK + 0.003), (0.0, 0.0, TOP - 0.019), (0.0, 0.0, TOP - 0.008),
         (0.0012, 0.0002, TOP - 0.0018), (0.0032, 0.0009, TOP - 0.0002), (0.0045, 0.0012, TOP)]


def plank_ring(ya, yb, da, dl, z, nl=10, na=10):
    """The outline of one plank (a strip of the round top between y = ya and yb), inset da at its round ends and dl
    along its straight seams; CCW, a fixed point count."""
    r = R - da
    y0, y1 = ya + dl, yb - dl
    x0, x1 = math.sqrt(max(r * r - y0 * y0, 0)), math.sqrt(max(r * r - y1 * y1, 0))
    a0, a1 = math.atan2(y0, x0), math.atan2(y1, x1)
    pts = [(-x0 + 2 * x0 * k / nl, y0) for k in range(nl)]
    pts += [(r * math.cos(a0 + (a1 - a0) * k / na), r * math.sin(a0 + (a1 - a0) * k / na)) for k in range(na)]
    pts += [(x1 - 2 * x1 * k / nl, y1) for k in range(nl)]
    pts += [(r * math.cos(math.pi - a1 + (a1 - a0) * k / na), r * math.sin(math.pi - a1 + (a1 - a0) * k / na)) for k in range(na)]
    return [(x, y, z) for x, y in pts]


def plank_uv(ou, ov):
    """Grain along the plank (x). Top and underside: planar; long sides: long grain; round ends: end grain."""
    def fn(cos, poly):
        n = poly.normal
        if abs(n.z) > 0.6 or abs(n.y) >= abs(n.x):
            return [((c.y if abs(n.z) > 0.6 else c.z) / TT + ou, c.x / TT + ov) for c in cos]
        return [(c.y / TT + ou, c.z / TT * 0.25 + ov) for c in cos]   # end grain: the board's fibres cut across
    return fn


parts = []
for k in range(NPL):
    ya = -R + 2 * R * k / NPL + GAP / 2 if k else -(R - 0.0065)            # the edge planks are cut round:
    yb = -R + 2 * R * (k + 1) / NPL - GAP / 2 if k < NPL - 1 else R - 0.0065  # only a 6 mm flat at the rim
    pl = common.loft(f't_plank{k}', [plank_ring(ya, yb, da, dl, z) for da, dl, z in RINGS], TEAK)
    pl.data.materials.append(TEAK_EDGE)
    for poly in pl.data.polygons:   # the rim and its roundover are worn lighter
        if poly.center.xy.length > R - 0.0048 and poly.center.z < TOP - 0.0003:
            poly.material_index = 1
    common.uv_map(pl, plank_uv(rng.uniform(0, 1), rng.uniform(0, 1)))
    parts.append(pl)
under = common.lathe('t_under', [(0, TOP - THK - 0.012), (R - 0.03, TOP - THK - 0.012), (R - 0.03, TOP - THK + 0.002), (0, TOP - THK + 0.002)], 48, IRON)
parts.append(under)   # a steel plate under the planks: nothing shows through the seams
base_p = [(0, 0.0), (0.2, 0.0), (0.21, 0.006), (0.205, 0.014), (0.17, 0.024), (0.08, 0.04), (0.045, 0.058), (0.032, 0.075),
          (0.034, 0.09), (0.022, 0.105), (0.019, 0.4), (0.026, 0.44), (0.026, 0.455), (0.019, 0.49), (0.02, 0.68), (0.034, 0.69),
          (0.06, 0.702), (0.06, TOP - THK - 0.012), (0, TOP - THK - 0.012)]
base = common.lathe('t_base', common.fillet(base_p, [0, .003, .003, .004, .02, .02, .01, .004, .004, .005, .01, .003, .003, .01, .008, .005, .003, 0, 0], n=2), 40, IRON)
parts.append(base)
for k in range(4):  # a cast spider under the plate
    arm = sweep_x(f't_arm{k}', 0.04, 0.25, 8, lambda x: (0.011, 0.006 + 0.006 * (1 - x / 0.25), TOP - THK - 0.018 - 0.006 * (1 - x / 0.25), 4), IRON, 12, 0.008)
    arm.data.transform(Matrix.Rotation(math.radians(45 + 90 * k), 4, 'Z'))
    parts.append(arm)
table = common.join(parts, 'table')

# ------------------------------------------------------------ rattan bistro chair (local: seat centre, front -Y, floor z 0)
SEAT, RING_R, LEG_R = 0.45, 0.012, 0.0125
ZR = SEAT - RING_R - 0.002                 # the seat ring's centre line
SPLAY = math.tan(math.radians(2.5))        # legs splay out 2.5 degrees
SX, SY, SC = 0.212, 0.2, 0.065             # seat ring: half extents and corner radius
CORNER = [(sx * (SX - SC + SC * math.cos(math.radians(45))), sy * (SY - SC + SC * math.sin(math.radians(45))))
          for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1))]   # mid-arc of each ring corner: where the legs join


def leg_at(c, z):
    """A leg's centre at height z: it passes through the ring corner c at ZR and splays out below."""
    d = V((c[0], c[1], 0)).normalized()
    return V((c[0], c[1], z)) + d * (ZR - z) * SPLAY


def bind(at, axis, r, turns=5, length=0.03):
    """A wrapped cane binding: turns of split cane round a joint (a ridged collar)."""
    prof = [(r + 0.0012, -length / 2 - 0.002), (r + 0.003, -length / 2)]
    for k in range(turns * 2 + 1):
        t = -length / 2 + length * k / (turns * 2)
        prof.append((r + (0.0042 if k % 2 else 0.0032), t))
    prof += [(r + 0.003, length / 2), (r + 0.0012, length / 2 + 0.002), (r - 0.002, length / 2), (r - 0.002, -length / 2)]
    o = common.lathe('c_bind', prof, 8, FRAME, closed=True)
    o.data.transform(orient(at, axis))
    return o


ring = common.tube('c_seatring', [(x, y, ZR) for x, y in common.rrect(SX, SY, SC, na=10, nx=8, ny=8)], RING_R, FRAME, 10, cyclic=True, uv_tile=0.25)
chair_parts = [ring]
for c in CORNER[:2]:                       # front legs: floor to the ring, ending inside it (flush, no stub)
    chair_parts.append(common.tube('c_front', [leg_at(c, 0.008), leg_at(c, ZR)], LEG_R, FRAME, 10, uv_tile=0.25))
# back legs run on up as the uprights and the curved top hoop: one continuous bent cane
HOOP_Z, HOOP_Y = 0.86, 0.3
bl, br = CORNER[2], CORNER[3]
back = [leg_at(bl, 0.008), leg_at(bl, ZR), (bl[0] - 0.004, bl[1] + 0.03, 0.56), (-0.205, 0.255, 0.74), (-0.19, 0.285, 0.835),
        (-0.1, 0.31, HOOP_Z + 0.008), (0, 0.318, HOOP_Z + 0.012), (0.1, 0.31, HOOP_Z + 0.008), (0.19, 0.285, 0.835), (0.205, 0.255, 0.74),
        (br[0] + 0.004, br[1] + 0.03, 0.56), leg_at(br, ZR), leg_at(br, 0.008)]
chair_parts.append(common.tube('c_back', common.fillet(back, [0, 0.0, 0.08, 0.06, 0.06, 0.08, 0.08, 0.08, 0.06, 0.06, 0.08, 0.0, 0], n=6),
                               LEG_R, FRAME, 10, uv_tile=0.25))


def upright(s, z):
    """The back upright's centre at height z (linear between its control points)."""
    pts = [(ZR, V((s * abs(bl[0]), bl[1], ZR))), (0.56, V((s * (abs(bl[0]) + 0.004), bl[1] + 0.03, 0.56))), (0.74, V((s * 0.205, 0.255, 0.74)))]
    for (z0, p0), (z1, p1) in zip(pts, pts[1:]):
        if z <= z1:
            return p0.lerp(p1, (z - z0) / (z1 - z0))
    return pts[-1][1]


# lower back rail, curved like the hoop, and the woven back panel between rail and hoop
RAIL_Z = 0.6
ul, ur = upright(-1, RAIL_Z), upright(1, RAIL_Z)
rail = [ul, V((-0.1, ul.y + 0.042, RAIL_Z)), V((0, ul.y + 0.05, RAIL_Z)), V((0.1, ul.y + 0.042, RAIL_Z)), ur]
chair_parts.append(common.tube('c_rail', common.fillet(rail, 0.08, n=4), 0.0095, FRAME, 8, uv_tile=0.25))
def at_x(poly, x):
    """The point on a polyline (running along x) at the given x."""
    pts = sorted(poly, key=lambda p: p.x)
    for p0, p1 in zip(pts, pts[1:]):
        if p0.x <= x <= p1.x:
            return p0.lerp(p1, (x - p0.x) / max(p1.x - p0.x, 1e-9))
    return pts[0] if x < pts[0].x else pts[-1]


rail_line = [V(p) for p in common.fillet(rail, 0.08, n=4)]
hoop_line = [V(p) for p in common.fillet(back, [0, 0.0, 0.08, 0.06, 0.06, 0.08, 0.08, 0.08, 0.06, 0.06, 0.08, 0.0, 0], n=6) if p[2] > 0.8]
NU, NV = 18, 8
pv, pf, puv = [], [], []
for j in range(NV + 1):                    # from just above the rail to just under the hoop, bowed back a little
    t = j / NV
    for i in range(NU + 1):
        x = -0.186 + 0.372 * i / NU
        lo, hi = at_x(rail_line, x) + V((0, -0.0035, 0.004)), at_x(hoop_line, x) + V((0, -0.0035, -0.006))
        pv.append(lo.lerp(hi, t) + V((0, 0.012 * math.sin(math.pi * t), 0)))
for side in (0, 1):                                                      # two faces, 7 mm apart: a woven slab
    base_i = len(pv) if side else 0
    if side:
        pv += [p + V((0, 0.007, 0)) for p in pv[:(NU + 1) * (NV + 1)]]
    for j in range(NV):
        for i in range(NU):
            a = base_i + j * (NU + 1) + i
            q = (a, a + 1, a + NU + 2, a + NU + 1)
            pf.append(q if side else q[::-1])
            puv.append([(pv[k].x / 0.11, pv[k].z / 0.11) for k in pf[-1]])
panel = common.build('c_panel', pv, pf, WEAVE, puv)
chair_parts.append(panel)
# woven seat, gently domed, its edge tucked into the ring
cushion = []
for inset, z in ((0.012, ZR - 0.004), (0.0, ZR + 0.002), (0.004, SEAT - 0.003), (0.03, SEAT + 0.001), (0.08, SEAT + 0.004), (0.14, SEAT + 0.005)):
    cushion.append([(x, y, z) for x, y in common.rrect(SX - inset, SY - inset, max(SC - inset, 0.01), na=10, nx=8, ny=8)])
seat = common.loft('c_seat', cushion, WEAVE)
common.uv_map(seat, uv_box(0.11))
chair_parts.append(seat)
# skirt ring under the seat and a stretcher ring low down, both through all four legs
for z, rr in ((0.375, 0.0085), (0.16, 0.0085)):
    pts = [leg_at(c, z) for c in (CORNER[0], CORNER[2], CORNER[3], CORNER[1])]
    chair_parts.append(common.tube('c_hring', common.fillet([tuple(p) for p in pts], 0.015, n=4, closed=True), rr, FRAME, 8, cyclic=True, uv_tile=0.25))
    for c in CORNER:
        chair_parts.append(bind(leg_at(c, z), leg_at(c, z + 0.1) - leg_at(c, z), LEG_R, 4, 0.026))
for c in CORNER:                           # bindings where the seat ring meets each leg
    chair_parts.append(bind(leg_at(c, ZR - 0.004), leg_at(c, ZR + 0.1) - leg_at(c, ZR), LEG_R, 5, 0.034))
for s in (-1, 1):                          # and where the back rail meets the uprights
    chair_parts.append(bind(upright(s, RAIL_Z), upright(s, RAIL_Z + 0.05) - upright(s, RAIL_Z - 0.05), LEG_R, 4, 0.03))
for c in CORNER:                           # rubber feet
    f = common.lathe('c_foot', common.fillet([(0, 0), (0.0145, 0), (0.0145, 0.01), (0, 0.012)], [0, 0.003, 0.003, 0], n=2), 10, FOOT)
    f.data.transform(orient(leg_at(c, 0.0), leg_at(c, 0.1) - leg_at(c, 0.0)))
    chair_parts.append(f)
bake_transforms(chair_parts)
chair = common.join(chair_parts, 'chair_l')


def place(o, x, y, turn=0.0):
    """Stand o on the floor at (x, y), facing the table centre (plus turn degrees)."""
    o.location = (x, y, 0)
    o.rotation_euler = (0, 0, math.atan2(-y, -x) + math.pi / 2 + math.radians(turn))


place(chair, -0.5, 0.24, 8)

# ------------------------------------------------------------ candle: low in a ribbed amber tumbler, flame inside the glass
N = 72
rings = []
outer_z = [0.0, 0.0012, 0.0035] + list(np.linspace(0.007, 0.078, 12)) + [0.0805]
for z in outer_z:
    rib = 0 if z < 0.002 else min(1.0, (z - 0.001) / 0.003)
    base_r = 0.0338 + 0.0022 * min(1.0, z / 0.0035) ** 0.5
    rings.append([(CANDLE.x + (base_r + rib * 0.0013 * (0.5 + 0.5 * math.cos(18 * a)) ** 0.7) * math.cos(a),
                   CANDLE.y + (base_r + rib * 0.0013 * (0.5 + 0.5 * math.cos(18 * a)) ** 0.7) * math.sin(a), CANDLE.z + z)
                  for a in np.linspace(0, 2 * math.pi, N, endpoint=False)])
for r, z in ((0.0356, 0.0818), (0.0343, 0.0826), (0.0331, 0.0818), (0.0326, 0.0795), (0.0326, 0.012), (0.031, 0.0095)):
    rings.append([(CANDLE.x + r * math.cos(a), CANDLE.y + r * math.sin(a), CANDLE.z + z) for a in np.linspace(0, 2 * math.pi, N, endpoint=False)])
glass = common.loft('k_glass', rings, GLASS, caps='pole')
WAX_TOP = 0.0385                           # 47% of the glass: burnt down, with a concave melt pool
wax = common.lathe('k_wax', common.fillet([(0, WAX_TOP - 0.0032), (0.01, WAX_TOP - 0.0028), (0.022, WAX_TOP - 0.0016), (0.029, WAX_TOP - 0.0002),
                                           (0.0312, WAX_TOP + 0.0006), (0.0318, WAX_TOP - 0.0006), (0.0318, 0.0102), (0, 0.0102)],
                                          [0, 0.006, 0.006, 0.003, 0.0008, 0.0008, 0.001, 0], n=3), 48, WAX)
wax.data.transform(Matrix.Translation(CANDLE))
W0 = CANDLE + V((0, 0, WAX_TOP - 0.0034))
wick = common.tube('k_wick', [W0, W0 + V((0.0001, 0, 0.003)), W0 + V((0.0004, 0, 0.0055)), W0 + V((0.0011, 0.0002, 0.0068)), W0 + V((0.0018, 0.0004, 0.0066))],
                   [0.00065, 0.0006, 0.00055, 0.0005, 0.0004], WICK, 6)   # 7 mm, its charred tip curling over
candle = common.join([glass, wax, wick], 'candle')
fl = []
F0 = WAX_TOP - 0.001                       # the flame starts at the wick and its tip stays below the rim (0.0826)
for name, mat, prof in (('f_body', FLAME, [(0, 0), (0.0031, 0.0018), (0.0052, 0.0063), (0.0054, 0.0117), (0.0043, 0.0207), (0.0025, 0.0302), (0.0011, 0.0351), (0, 0.0365)]),
                        ('f_core', CORE, [(0, 0.0023), (0.002, 0.0036), (0.0033, 0.0072), (0.0033, 0.0122), (0.0024, 0.018), (0.0011, 0.0216), (0, 0.0225)]),
                        ('f_blue', BLUE, [(0, -0.0003), (0.0035, 0.0004), (0.0047, 0.0031), (0.0042, 0.0054), (0, 0.0045)])):
    o = common.lathe(name, common.fillet([(r * 1.25, z + F0) for r, z in prof], [0] + [0.0014] * (len(prof) - 2) + [0], n=3), 20, mat)   # full-bodied
    for v in o.data.vertices:  # a slight lean so it is not a perfect teardrop
        h = max(0.0, v.co.z - F0 - 0.002) / 0.036
        v.co.x += 0.0011 * h ** 2
    o.data.transform(Matrix.Translation(CANDLE))
    fl.append(o)
flame = common.join(fl, 'candle_flame')
assert max(v.co.z for v in flame.data.vertices) < CANDLE.z + 0.0826, 'candle flame pokes above the glass rim'

# ------------------------------------------------------------ festoon: a twisted-pair cable sagging between two planter posts
rng = random.Random(4)
P0, P1, SAG = V((-1.9, 1.25, 2.36)), V((1.7, -0.5, 2.36)), 0.3
ks = sorted(min(0.97, max(0.03, (i + 0.5) / 14 + rng.uniform(-0.05, 0.05) / 14)) for i in range(14))


def wire_at(k):
    """The catenary, kinked a little under each bulb's weight."""
    p = P0.lerp(P1, k)
    p.z -= SAG * math.sin(math.pi * k)
    near = min(abs(k - b) for b in ks)
    p.z -= 0.012 * max(0.0, 1 - near / 0.035)
    return p


# two 4.8 mm rubber cores twisted round each other (6 cm lay), centred on the catenary
PITCH, CORE_R, OFF = 0.07, 0.0024, 0.0022
fine = np.linspace(0, 1, 4000)
pts = [wire_at(k) for k in fine]
arc_len = np.concatenate([[0], np.cumsum([(pts[i + 1] - pts[i]).length for i in range(len(pts) - 1)])])
n_s = int(arc_len[-1] / PITCH * 8)
cores = [[], []]
for s in np.linspace(0, arc_len[-1], n_s):
    k = float(np.interp(s, arc_len, fine))
    p = wire_at(k)
    tg = (wire_at(min(1, k + 0.0005)) - wire_at(max(0, k - 0.0005))).normalized()
    nz = (V((0, 0, 1)) - tg * tg.z).normalized()
    bz = tg.cross(nz)
    ph = 2 * math.pi * s / PITCH
    for c in (0, 1):
        cores[c].append(p + (nz * math.cos(ph + math.pi * c) + bz * math.sin(ph + math.pi * c)) * OFF)
wire = [common.tube(f's_core{c}', cores[c], CORE_R, CABLE, 5) for c in (0, 1)]
bulb_glass_p = [(0, 0)] + [(0.0085 + (0.0225 - 0.0085) * math.sin(min(1.0, t / 0.55) * math.pi / 2) ** 1.6 if t < 0.55 else
                            0.0225 * math.sqrt(max(0.0, 1 - ((t - 0.55) / 0.45) ** 2)), -0.075 * t) for t in np.sin(np.linspace(0, 1, 16) * math.pi / 2)]
sock_p = ([(0, 0), (0.0062, 0), (0.0075, -0.003), (0.0075, -0.007), (0.0086, -0.0085), (0.0086, -0.0125), (0.0075, -0.014),
           (0.0086, -0.0155), (0.0086, -0.0195), (0.0075, -0.021), (0.0086, -0.0225), (0.0086, -0.03), (0.0078, -0.032), (0, -0.032)])
stem_p = [(0, -0.0495), (0.0036, -0.0495), (0.0022, -0.053), (0.0017, -0.058), (0.0016, -0.0715), (0.0023, -0.0735), (0.0012, -0.0752), (0, -0.0755)]
HZ0, HZ1, HR, TURNS = -0.08, -0.1, 0.0034, 5   # the LED spiral filament: centred at the bulb's widest point
# one bulb mesh (socket, clear glass with a thin wall, glass stem, lead wires, LED spiral filament), hung at each clip
glass_out = common.lathe('b_glass', bulb_glass_p[::-1], 14, BULB_GLASS)
glass_in = common.lathe('b_glass_in', [(max(r - 0.0006, 0.0), z - 0.0003) for r, z in bulb_glass_p], 14, BULB_GLASS)  # 0.6 mm wall
glass_in.data.flip_normals()          # the inner surface faces the hollow: light passes a thin wall, not a lens
for o in (glass_out, glass_in):
    o.data.transform(Matrix.Translation((0, 0, -0.049)))
sock = common.lathe('s_sock', sock_p, 10, CABLE)
sock.data.transform(Matrix.Translation((0, 0, -0.02)))
drop = common.tube('s_drop', [(0, 0, 0), (0, 0, -0.022)], 0.003, CABLE, 8)
glass_stem = common.lathe('b_stem', stem_p, 8, BULB_GLASS)   # the glass stem pressed into the neck
hel = [V((HR * math.cos(a), HR * math.sin(a), HZ0 + (HZ1 - HZ0) * a / (2 * math.pi * TURNS))) for a in np.linspace(0, 2 * math.pi * TURNS, 46)]
filament = common.tube('b_fil', hel, 0.00045, BULB, 5)
tip = V((0, 0, -0.0752))
leads = [common.tube('b_lead_a', [tip + V((0.0008, 0, 0)), hel[0] + V((0, 0, 0.0015)), hel[0]], 0.00028, LEAD, 4),
         common.tube('b_lead_b', [tip + V((-0.0008, 0, 0)), V((-0.0004, 0, HZ1 + 0.002)), hel[-1]], 0.00028, LEAD, 4)]
bulb_mesh = common.join([glass_out, glass_in, sock, drop, glass_stem, filament] + leads, 'bulb_00')
common.smooth(bulb_mesh, 50, weighted=False)
bulbs = [bulb_mesh]
for i in range(1, len(ks)):            # the others share its mesh, so the file stores it once
    o = bpy.data.objects.new(f'bulb_{i:02d}', bulb_mesh.data)
    bpy.context.scene.collection.objects.link(o)
    bulbs.append(o)
for o, k in zip(bulbs, ks):
    o.location = wire_at(k)
for k in ks:                           # moulded clips round the pair, along the cable
    w = wire_at(k)
    tg = (wire_at(min(1, k + 0.002)) - wire_at(max(0, k - 0.002))).normalized()
    clip = common.lathe('s_clip', common.fillet([(0, -0.011), (0.006, -0.011), (0.0075, -0.008), (0.0075, 0.008), (0.006, 0.011), (0, 0.011)],
                                                [0, 0.0015, 0.002, 0.002, 0.0015, 0], n=2), 12, CABLE)
    clip.data.transform(Matrix.Translation(w) @ V((0, 0, 1)).rotation_difference(tg).to_matrix().to_4x4())
    wire.append(clip)
string_wire = common.join(wire, 'string_wire')
posts = []
for P in (P0, P1):   # round weighted planters, soil topped, the pole set into them
    pot = common.lathe('pl', common.fillet([(0, 0.0), (0.15, 0.0), (0.152, 0.004), (0.19, 0.38), (0.2, 0.385), (0.2, 0.4), (0.19, 0.405),
                                            (0.182, 0.39), (0.18, 0.37), (0, 0.37)], [0, 0.004, 0.003, 0.004, 0.003, 0.005, 0.003, 0.003, 0.003, 0], n=2), 32, PLANTER)
    pot.data.materials.append(SOIL)
    for poly in pot.data.polygons:
        if poly.center.z > 0.365 and poly.center.xy.length < 0.179:
            poly.material_index = 1
    pot.data.transform(Matrix.Translation((P.x, P.y, 0)))
    pole = common.tube('pp', [(P.x, P.y, 0.3), (P.x, P.y, P.z + 0.08)], 0.02, POST_IRON, 12)
    cap = common.lathe('pc', common.fillet([(0, 0), (0.024, 0), (0.024, 0.012), (0, 0.022)], [0, .004, .006, 0], n=2), 12, POST_IRON)
    cap.location = (P.x, P.y, P.z + 0.08)
    other = P1 if P is P0 else P0
    to = V((other.x - P.x, other.y - P.y, 0)).normalized()
    eye = common.lathe('pe', [(0.006 + 0.0025 * math.cos(a), 0.0025 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 10, endpoint=False)], 14, POST_IRON, closed=True)
    eye.data.transform(Matrix.Translation(V((P.x, P.y, P.z)) + to * 0.03) @ V((0, 0, 1)).rotation_difference(to).to_matrix().to_4x4())
    wrap = common.tube('pw', [(P.x + 0.0235 * math.cos(a), P.y + 0.0235 * math.sin(a), P.z - 0.03 + 0.006 * a / (2 * math.pi)) for a in np.linspace(0, 6 * math.pi, 40)], 0.0035, CABLE, 6)
    posts += [pot, pole, cap, eye, wrap]
bake_transforms(posts)
string_posts = common.join(posts, 'string_posts')

for o in [table, chair, candle, string_posts]:
    common.smooth(o, 50, weighted=o in (table, chair))
common.smooth(string_wire, 85, weighted=False)    # round cable: no hard edges at the kinks
common.smooth(flame, 89, weighted=False)

# ------------------------------------------------------------ AO, second chair, export
common.bake_ao([table, chair], 1024, distance=0.12, name='cafe')
common.apply_mods(chair)   # bake the weighted normals into the mesh, so both chair nodes can use it unmodified
chair_r = bpy.data.objects.new('chair_r', chair.data)  # same mesh, so the file stores it once
bpy.context.scene.collection.objects.link(chair_r)
place(chair_r, 0.52, 0.2, -6)
objs = [table, chair, chair_r, candle, flame, string_wire, string_posts] + bulbs
tris = common.triangles(objs)
size = common.export_glb(objs, GLB)
print(f'cafe: {GLB} {size / 1024:.1f} KB, {tris} triangles')
assert size <= MAX_BYTES, f'cafe.glb is {size} bytes, over the {MAX_BYTES} budget'
common.check_budget(os.path.dirname(GLB))

# ------------------------------------------------------------ previews: candle and bulbs against the night
B = [wire_at(k) - V((0, 0, 0.09)) for k in ks]
lights = [(tuple(b), (1, 0.6, 0.28), 1.6, 0.015) for b in B]
lights += [(tuple(CANDLE + V((0, 0, 0.052))), (1, 0.55, 0.2), 1.2, 0.006), ((0.05, -0.1, 2.0), (1, 0.8, 0.6), 30, 0.25),
           ((0.9, -1.4, 0.7), (1, 0.6, 0.35), 5, 0.4)]
P = lambda n: os.path.join(OUT, n)
b6 = wire_at(ks[6])
common.render_previews(GLB, [
    (P('cafe-hero.png'), (1.25, -1.85, 1.35), (0, 0.15, 0.95), 26),
    (P('cafe-close.png'), (-0.06, -0.5, 0.9), (-0.19, -0.12, 0.79), 50),
    (P('cafe-bulbs.png'), tuple(b6 + V((-0.1, -0.22, -0.105))), tuple(b6 + V((0, 0, -0.055))), 50),
], look='night', ground=common.srgb(96, 58, 44), lights=lights, exposure=0.6)


def chair_alone(obs):
    """The chair three times, turned to show all four seat corners: front three-quarter, side, back three-quarter."""
    for name, o in obs.items():
        if name != 'chair_l' and o.type == 'MESH':
            o.hide_render = True
    c = obs['chair_l']
    c.location, c.rotation_euler = (-0.62, 0.1, 0), (0, 0, math.radians(200))
    for x, turn in ((0.0, 110), (0.62, 340)):
        o = bpy.data.objects.new('chair_view', c.data)
        bpy.context.scene.collection.objects.link(o)
        o.location, o.rotation_euler = (x, 0.1 if x else 0, 0), (0, 0, math.radians(turn))


common.render_previews(GLB, [(P('cafe-chair.png'), (0.35, -2.3, 1.2), (0, 0.05, 0.45), 40)], look='night', arrange=chair_alone,
                       ground=common.srgb(96, 58, 44), lights=[((0.9, -1.4, 1.6), (1, 0.75, 0.5), 90, 0.6), ((-0.9, -0.6, 1.2), (1, 0.7, 0.45), 45, 0.5),
                                                               ((-0.8, 0.8, 1.0), (0.6, 0.65, 1.0), 10, 0.5)],
                       exposure=0.6)
