"""The rooftop café, at real size in metres: a small round dark-teak bistro table on a cast-iron base, two rattan
bistro chairs, a candle in a ribbed amber glass tumbler, and a festoon string of clear S14 filament bulbs.

blender --background --factory-startup --python blender/cafe.py -- [out.glb] [preview dir]

Origin on the floor under the table's centre, front = glTF +Z. Table top 0.70 m across at 0.75 m; chair seats at
0.45 m. Film.js applies one group scale and places it. Nodes: table, chair_l, chair_r (one shared mesh), candle
(glass, wax, wick), candle_flame (core, body, blue base), string_wire, bulb_00 .. bulb_13 (glass shell and
filament), string_posts (planters, poles, eye bolts). Emissive materials: flame, flame_core, flame_blue, bulb
(filament), bulb_glass (faint), wax (faint).
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
TEAK = common.pbr('teak', (1, 1, 1, 1), *common.teak_textures(1024, planks=4), strength=0.7, rough=0.45)
IRON = common.pbr('iron', common.srgb(32, 30, 28), rough=0.45, metal=0.5)
FRAME = common.pbr('rattan_frame', (1, 1, 1, 1), *common.cane_textures(256), strength=0.8, rough=0.6)
WEAVE = common.pbr('rattan_weave', (1, 1, 1, 1), *common.weave_textures(512, 20, 'basket', (0.3, 0.19, 0.1)), strength=1.0, rough=0.75)
GLASS = common.pbr('glass', common.srgb(235, 125, 35), rough=0.06, transmission=1.0, ior=1.5)
WAX = common.pbr('wax', common.srgb(242, 222, 186), rough=0.45, emission=(0.3, 0.15, 0.04, 1.0))
WICK = common.pbr('wick', common.srgb(18, 15, 13), rough=0.9)
FLAME = common.pbr('flame', (1, 0.55, 0.15, 1), rough=1.0, emission=(1.0, 0.5, 0.12, 1.0), alpha=0.55)
CORE = common.pbr('flame_core', (1, 0.95, 0.8, 1), rough=1.0, emission=(1.0, 0.92, 0.7, 1.0))
BLUE = common.pbr('flame_blue', (0.3, 0.45, 1, 1), rough=1.0, emission=(0.25, 0.4, 1.0, 1.0), alpha=0.35)
BULB = common.pbr('bulb', (1, 0.7, 0.35, 1), rough=0.5, emission=(1.0, 0.6, 0.25, 1.0))
BULB_GLASS = common.pbr('bulb_glass', common.srgb(252, 240, 222), rough=0.04, transmission=1.0)  # clear glass
CABLE = common.pbr('cable', common.srgb(20, 20, 22), rough=0.55)
PLANTER = common.pbr('planter', common.srgb(48, 46, 44), rough=0.85)


def uv_box(tile):
    """Planar per dominant axis (woven panels and cushions)."""
    def fn(cos, poly):
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        a, b = ((1, 2), (0, 2), (0, 1))[ax]
        return [(c[a] / tile, c[b] / tile) for c in cos]
    return fn


def uv_top(tile):
    """Table top: planks seen from above; the edge band runs the grain around the rim (long grain, no stretch)."""
    def fn(cos, poly):
        if abs(poly.normal.z) > 0.8:
            return [(c.x / tile + 0.5, c.y / tile + 0.5) for c in cos]
        th = [math.atan2(c.y, c.x) for c in cos]
        if max(th) - min(th) > math.pi:
            th = [t + 2 * math.pi if t < 0 else t for t in th]
        return [(c.z / tile * 3, t * R / tile) for t, c in zip(th, cos)]
    return fn


def sweep_x(name, x0, x1, n_st, sec, mat, n=16, ends=0.02, yoff=None):
    """sec(x) -> (hw, ht, zc, p); ends rounded with radius ends; yoff(x) bends the piece sideways."""
    st = []
    for i in range(n_st):
        x = x0 + (x1 - x0) * (0.5 - 0.5 * math.cos(math.pi * i / (n_st - 1)))
        d = min(x - x0, x1 - x)
        e = math.sqrt(max(0.0, 1 - (1 - min(d, ends) / ends) ** 2)) if ends else 1.0
        hw, ht, zc, p = sec(x)
        st.append((x, max(hw * e, 1e-5), max(hw * e, 1e-5), max(ht * e, 1e-5), zc, 0, p))
    o = common.sweep(name, st, n, mat)
    if yoff:
        for v in o.data.vertices:
            v.co.y += yoff(v.co.x)
    return o


def bake_transforms(objs):
    bpy.context.view_layer.update()
    for o in objs:
        o.data.transform(o.matrix_world)
        o.matrix_world.identity()


# ------------------------------------------------------------ table: plank top on a cast-iron bistro base
top = common.lathe('t_top', common.fillet([(0, TOP), (0.338, TOP), (R, TOP - 0.008), (R, TOP - 0.02), (R - 0.005, TOP - 0.028), (0, TOP - 0.028)],
                                          [0, 0.008, 0.004, 0.004, 0.003, 0], n=3), 112, TEAK)
common.uv_map(top, uv_top(0.35))  # 8 planks of about 9 cm across the top
base_p = [(0, 0.0), (0.2, 0.0), (0.21, 0.006), (0.205, 0.014), (0.17, 0.024), (0.08, 0.04), (0.045, 0.058), (0.032, 0.075),
          (0.034, 0.09), (0.022, 0.105), (0.019, 0.4), (0.026, 0.44), (0.026, 0.455), (0.019, 0.49), (0.02, 0.68), (0.034, 0.69),
          (0.06, 0.702), (0.06, TOP - 0.028), (0, TOP - 0.028)]
base = common.lathe('t_base', common.fillet(base_p, [0, .003, .003, .004, .02, .02, .01, .004, .004, .005, .01, .003, .003, .01, .008, .005, .003, 0, 0], n=2), 40, IRON)
parts = [top, base]
for k in range(4):  # a cast spider under the top
    arm = sweep_x(f't_arm{k}', 0.04, 0.25, 8, lambda x: (0.011, 0.006 + 0.006 * (1 - x / 0.25), TOP - 0.035 - 0.006 * (1 - x / 0.25), 4), IRON, 12, 0.008)
    arm.data.transform(Matrix.Rotation(math.radians(45 + 90 * k), 4, 'Z'))
    parts.append(arm)
table = common.join(parts, 'table')

# ------------------------------------------------------------ rattan bistro chair (local: seat centre, front -Y, floor z 0)
SEAT = 0.43
chair_parts = [common.tube('c_seatring', [(x, y, SEAT) for x, y in common.rrect(0.215, 0.205, 0.14, na=10, nx=4, ny=4)], 0.012, FRAME, 10, cyclic=True, uv_tile=0.25)]
for s in (-1, 1):
    chair_parts.append(common.tube('c_front', [(s * 0.205, -0.215, 0.006), (s * 0.19, -0.178, SEAT + 0.01)], [0.0125, 0.012], FRAME, 10))
back = [(-0.205, 0.235, 0.006), (-0.19, 0.178, SEAT), (-0.182, 0.225, 0.62), (-0.172, 0.268, 0.84), (-0.09, 0.292, 0.875),
        (0, 0.298, 0.882), (0.09, 0.292, 0.875), (0.172, 0.268, 0.84), (0.182, 0.225, 0.62), (0.19, 0.178, SEAT), (0.205, 0.235, 0.006)]
chair_parts.append(common.tube('c_back', common.fillet(back, [0, 0.05, 0.04, 0.07, 0.07, 0.07, 0.07, 0.07, 0.04, 0.05, 0], n=5), 0.012, FRAME, 10))
ring = [(-0.2, -0.2, 0.16), (-0.199, 0.214, 0.16), (0.199, 0.214, 0.16), (0.2, -0.2, 0.16)]
chair_parts.append(common.tube('c_ring', common.fillet(ring, 0.03, n=5, closed=True), 0.0085, FRAME, 8, cyclic=True))
for x, y, z in ((-0.193, -0.185, SEAT - 0.012), (0.193, -0.185, SEAT - 0.012), (-0.191, 0.185, SEAT - 0.012), (0.191, 0.185, SEAT - 0.012),
                (-0.2, -0.2, 0.16), (0.2, -0.2, 0.16), (-0.199, 0.214, 0.16), (0.199, 0.214, 0.16)):  # cane bindings at the joints
    w = common.lathe('c_wrap', common.fillet([(0.0122, -0.012), (0.0148, -0.009), (0.0148, 0.009), (0.0122, 0.012)], 0.003, n=2) + [(0.011, 0.012), (0.011, -0.012)], 12, FRAME, closed=True)
    w.location = (x, y, z)
    chair_parts.append(w)
for x, y in ((-0.205, -0.215), (0.205, -0.215), (-0.205, 0.235), (0.205, 0.235)):
    f = common.lathe('c_foot', common.fillet([(0, 0), (0.014, 0), (0.014, 0.01), (0, 0.012)], [0, 0.003, 0.003, 0], n=2), 10, CABLE)
    f.location = (x, y, 0)
    chair_parts.append(f)
# woven seat cushion and curved woven back panel
cushion = []
for inset, z in ((0.03, SEAT - 0.004), (0.006, SEAT - 0.002), (0.0, SEAT + 0.004), (0.0, SEAT + 0.01), (0.006, SEAT + 0.014), (0.03, SEAT + 0.015)):
    cushion.append([(x, y, z) for x, y in common.rrect(0.205 - inset, 0.196 - inset, 0.135 - inset, na=10, nx=6, ny=6)])  # woven into the frame
seat = common.loft('c_seat', cushion, WEAVE)
common.uv_map(seat, uv_box(0.11))
chair_parts.append(seat)
yb = lambda x: 0.232 + 0.03 * (1 - (x / 0.18) ** 2)
arch = lambda x: 1 - (x / 0.18) ** 2
panel = sweep_x('c_panel', -0.181, 0.181, 14, lambda x: (0.125 + 0.025 * arch(x), 0.007, 0.715 + 0.025 * arch(x), 6), WEAVE, 16, 0.004, yb)
for v in panel.data.vertices:  # stand the section up: height along z, thickness front to back
    y0 = yb(v.co.x)
    zc = 0.715 + 0.025 * arch(v.co.x)
    dy, dz = v.co.y - y0, v.co.z - zc
    v.co.y, v.co.z = y0 + dz, zc + dy
panel.data.flip_normals()
common.uv_map(panel, lambda cos, poly: [(c.x / 0.11, c.z / 0.11) for c in cos])
chair_parts.append(panel)
bake_transforms(chair_parts)
chair = common.join(chair_parts, 'chair_l')


def place(o, x, y, turn=0.0):
    """Stand o on the floor at (x, y), facing the table centre (plus turn degrees)."""
    o.location = (x, y, 0)
    o.rotation_euler = (0, 0, math.atan2(-y, -x) + math.pi / 2 + math.radians(turn))


place(chair, -0.5, 0.24, 8)

# ------------------------------------------------------------ candle: ribbed amber tumbler, wax with a melt pool, flame
N = 96
rings = []
outer_z = [0.0, 0.0012, 0.0035] + list(np.linspace(0.007, 0.078, 12)) + [0.0805]
for z in outer_z:
    rib = 0 if z < 0.002 else min(1.0, (z - 0.001) / 0.003)
    base_r = 0.0338 + 0.0022 * min(1.0, z / 0.0035) ** 0.5
    rings.append([(CANDLE.x + (base_r + rib * 0.0013 * (0.5 + 0.5 * math.cos(24 * a)) ** 0.7) * math.cos(a),
                   CANDLE.y + (base_r + rib * 0.0013 * (0.5 + 0.5 * math.cos(24 * a)) ** 0.7) * math.sin(a), CANDLE.z + z)
                  for a in np.linspace(0, 2 * math.pi, N, endpoint=False)])
for r, z in ((0.0356, 0.0818), (0.0343, 0.0826), (0.0331, 0.0818), (0.0326, 0.0795), (0.0326, 0.012), (0.031, 0.0095)):
    rings.append([(CANDLE.x + r * math.cos(a), CANDLE.y + r * math.sin(a), CANDLE.z + z) for a in np.linspace(0, 2 * math.pi, N, endpoint=False)])
glass = common.loft('k_glass', rings, GLASS, caps='pole')
wax = common.lathe('k_wax', common.fillet([(0, 0.0575), (0.012, 0.058), (0.026, 0.0605), (0.0312, 0.0632), (0.0318, 0.0615), (0.0318, 0.0102), (0, 0.0102)],
                                          [0, 0.006, 0.004, 0.0012, 0.001, 0.001, 0], n=3), 48, WAX)
wax.data.transform(Matrix.Translation(CANDLE))
wick = common.tube('k_wick', [CANDLE + V((0, 0, 0.056)), CANDLE + V((0.0003, 0, 0.0625)), CANDLE + V((0.0016, 0.0004, 0.0685))], [0.0011, 0.001, 0.0008], WICK, 6)
candle = common.join([glass, wax, wick], 'candle')
fl = []
for name, mat, sc, prof in (('f_body', FLAME, 1.0, [(0, 0.0645), (0.0034, 0.0665), (0.0057, 0.0715), (0.0059, 0.0775), (0.0047, 0.0875), (0.0028, 0.098), (0.0012, 0.1035), (0, 0.105)]),
                            ('f_core', CORE, 1.0, [(0, 0.067), (0.0022, 0.0685), (0.0036, 0.0725), (0.0036, 0.078), (0.0026, 0.0845), (0.0012, 0.0885), (0, 0.0895)]),
                            ('f_blue', BLUE, 1.0, [(0, 0.0642), (0.0038, 0.065), (0.0052, 0.068), (0.0046, 0.0705), (0, 0.069)])):
    o = common.lathe(name, common.fillet(prof, [0] + [0.0015] * (len(prof) - 2) + [0], n=3), 20, mat)
    for v in o.data.vertices:  # a slight lean and wobble so it is not a perfect teardrop
        h = max(0.0, v.co.z - 0.066) / 0.04
        v.co.x += 0.0012 * h ** 2
    o.data.transform(Matrix.Translation(CANDLE))
    fl.append(o)
flame = common.join(fl, 'candle_flame')

# ------------------------------------------------------------ festoon: 8 mm cable sagging between two planter posts
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


samples = sorted(set(list(np.linspace(0, 1, 140)) + ks))
wire = [common.tube('s_wire', [wire_at(k) for k in samples], 0.004, CABLE, 8)]
bulb_glass_p = [(0, 0)] + [(0.0085 + (0.0225 - 0.0085) * math.sin(min(1.0, t / 0.55) * math.pi / 2) ** 1.6 if t < 0.55 else
                            0.0225 * math.sqrt(max(0.0, 1 - ((t - 0.55) / 0.45) ** 2)), -0.075 * t) for t in np.sin(np.linspace(0, 1, 16) * math.pi / 2)]
sock_p = ([(0, 0), (0.0062, 0), (0.0075, -0.003), (0.0075, -0.007), (0.0086, -0.0085), (0.0086, -0.0125), (0.0075, -0.014),
                        (0.0086, -0.0155), (0.0086, -0.0195), (0.0075, -0.021), (0.0086, -0.0225), (0.0086, -0.03), (0.0078, -0.032), (0, -0.032)])
bulbs = []
for i, k in enumerate(ks):
    w = wire_at(k)
    tg = (wire_at(min(1, k + 0.002)) - wire_at(max(0, k - 0.002))).normalized()
    clip = common.lathe('s_clip', common.fillet([(0, -0.011), (0.0045, -0.011), (0.006, -0.008), (0.006, 0.008), (0.0045, 0.011), (0, 0.011)],
                                                [0, 0.0015, 0.002, 0.002, 0.0015, 0], n=2), 10, CABLE)  # moulded clip round the cable
    clip.data.transform(Matrix.Translation(w) @ V((0, 0, 1)).rotation_difference(tg).to_matrix().to_4x4())
    stem = common.tube('s_stem', [w, w - V((0, 0, 0.022))], 0.003, CABLE, 8)
    sock = common.lathe('s_sock', sock_p, 10, CABLE)
    sock.data.transform(Matrix.Translation(w - V((0, 0, 0.02))))
    wire += [clip, stem, sock]
    shell_o = common.lathe(f'b_glass{i}', bulb_glass_p, 14, BULB_GLASS)
    fil = [w - V((0, 0, 0.062)) + V((0.004 * math.sin(a * 3), 0.004 * math.cos(a * 3), 0.022 * a / (2 * math.pi))) for a in np.linspace(0, 2 * math.pi, 16)]
    filament = common.tube(f'b_fil{i}', fil, 0.0007, BULB, 4)
    post = common.tube(f'b_post{i}', [w - V((0, 0, 0.05)), w - V((0, 0, 0.066))], 0.0012, BULB_GLASS, 5)
    shell_o.data.transform(Matrix.Translation(w - V((0, 0, 0.049))))
    bulbs.append(common.join([shell_o, filament, post], f'bulb_{i:02d}'))
string_wire = common.join(wire, 'string_wire')
posts = []
for P in (P0, P1):
    plant = common.loft('pl', [[(P.x + x, P.y + y, z) for x, y in common.rrect(0.18 - e, 0.18 - e, 0.03, na=4, nx=4, ny=4)]
                               for e, z in ((0.012, 0.0), (0.0, 0.01), (0.0, 0.39), (0.006, 0.4), (0.03, 0.4), (0.03, 0.37))], PLANTER)
    pole = common.tube('pp', [(P.x, P.y, 0.37), (P.x, P.y, P.z + 0.08)], 0.02, IRON, 12)
    cap = common.lathe('pc', common.fillet([(0, 0), (0.024, 0), (0.024, 0.012), (0, 0.022)], [0, .004, .006, 0], n=2), 12, IRON)
    cap.location = (P.x, P.y, P.z + 0.08)
    other = P1 if P is P0 else P0
    to = V((other.x - P.x, other.y - P.y, 0)).normalized()
    eye = common.lathe('pe', [(0.006 + 0.0025 * math.cos(a), 0.0025 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 10, endpoint=False)], 14, IRON, closed=True)
    eye.data.transform(Matrix.Translation(V((P.x, P.y, P.z)) + to * 0.03) @ V((0, 0, 1)).rotation_difference(to).to_matrix().to_4x4())
    wrap = common.tube('pw', [(P.x + 0.0235 * math.cos(a), P.y + 0.0235 * math.sin(a), P.z - 0.03 + 0.006 * a / (2 * math.pi)) for a in np.linspace(0, 6 * math.pi, 40)], 0.0035, CABLE, 6)
    posts += [plant, pole, cap, eye, wrap]
bake_transforms(posts)
string_posts = common.join(posts, 'string_posts')

for o in [table, chair, candle, string_wire, string_posts] + bulbs:
    common.smooth(o, 50, weighted=o in (table, chair))
common.smooth(flame, 89, weighted=False)

# ------------------------------------------------------------ AO, second chair, export
common.bake_ao([table, chair], 1024, distance=0.12, name='cafe')
chair_r = bpy.data.objects.new('chair_r', chair.data)  # same mesh, so the file stores it once
bpy.context.scene.collection.objects.link(chair_r)
place(chair_r, 0.52, 0.2, -6)
for m in chair.modifiers:  # the weighted-normal modifier travels with the object, not the mesh
    chair_r.modifiers.new(m.name, m.type).keep_sharp = True
objs = [table, chair, chair_r, candle, flame, string_wire, string_posts] + bulbs
tris = common.triangles(objs)
size = common.export_glb(objs, GLB)
print(f'cafe: {GLB} {size / 1024:.1f} KB, {tris} triangles')
assert size <= MAX_BYTES, f'cafe.glb is {size} bytes, over the {MAX_BYTES} budget'
common.check_budget(os.path.dirname(GLB))

# ------------------------------------------------------------ previews: candle and bulbs against the night
B = [wire_at(k) - V((0, 0, 0.075)) for k in ks]
lights = [(tuple(b), (1, 0.6, 0.28), 1.6, 0.015) for b in B]
lights += [(tuple(CANDLE + V((0, 0, 0.08))), (1, 0.55, 0.2), 1.2, 0.006), ((0.05, -0.1, 2.0), (1, 0.8, 0.6), 30, 0.25),
           ((0.9, -1.4, 0.7), (1, 0.6, 0.35), 5, 0.4)]
P = lambda n: os.path.join(OUT, n)
b6 = B[6]
common.render_previews(GLB, [
    (P('cafe-hero.png'), (1.25, -1.85, 1.35), (0, 0.15, 0.95), 26),
    (P('cafe-close.png'), (-0.06, -0.5, 0.9), (-0.19, -0.12, 0.79), 50),
    (P('cafe-bulbs.png'), tuple(b6 + V((-0.1, -0.22, -0.03))), tuple(b6 + V((0, 0, 0.02))), 50),
], look='night', ground=common.srgb(96, 58, 44), lights=lights, exposure=0.6)


def chair_alone(obs):
    for name, o in obs.items():
        if name != 'chair_l' and o.type == 'MESH':
            o.hide_render = True
    c = obs['chair_l']
    c.location = (0, 0, 0)
    c.rotation_euler = (0, 0, math.radians(200))


common.render_previews(GLB, [(P('cafe-chair.png'), (0.95, -1.05, 0.85), (0, 0, 0.42), 40)], look='night', arrange=chair_alone,
                       ground=common.srgb(96, 58, 44), lights=[((0.9, -0.9, 1.6), (1, 0.75, 0.5), 60, 0.5), ((-0.8, 0.5, 1.0), (0.6, 0.65, 1.0), 10, 0.5)],
                       exposure=0.6)
