"""The rooftop café: a round dark-teak pedestal table, two bistro chairs, a candle in an amber glass and a bulb string.

blender --background --factory-startup --python blender/cafe.py -- [out.glb] [preview dir]

Coordinates are film.js's relative to the table: place the file at (TABLE[0], 0, TABLE[2]). The table top is at
y 0.915 (v1's TABLE[1]) with v1's 2.5 m top; the furniture stands on the deck surface at y 0.06 (v1's deck box);
the candle sits at v1's CANDLE offset and the bulbs hang where v1's glows are (14 along v1's catenary).
Nodes: table, chair_l, chair_r (one shared mesh), candle (glass, wax, wick), candle_flame, string_wire,
bulb_00 .. bulb_13, string_posts. Emissive materials: flame, bulb (film.js may drive them).
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
GLB = os.path.abspath(ARGS[0] if ARGS else os.path.join(ROOT, 'models', 'cafe.glb'))
OUT = os.path.abspath(ARGS[1] if len(ARGS) > 1 else os.path.join(ROOT, 'docs', 'film-renders', 'assets'))
MAX_BYTES = 600 * 1024
DECK, TOP = 0.06, 0.915
CANDLE = Vector((-0.85, -0.72, TOP))   # film (TABLE[0] - 0.85, TABLE[1], TABLE[2] + 0.72); film +z = Blender -Y
TILE = 2.6

bpy.ops.wm.read_factory_settings(use_empty=True)
ALB, NRM = common.teak_textures(1024)
TEAK = common.pbr('teak', (1, 1, 1, 1), ALB, NRM, strength=0.6, rough=0.5)
METAL = common.pbr('chair_metal', common.srgb(30, 29, 28), rough=0.38)
GLASS = common.pbr('glass', common.srgb(214, 120, 40), rough=0.08, alpha=0.45)
WAX = common.pbr('wax', common.srgb(240, 214, 170), rough=0.5, emission=(0.55, 0.26, 0.07, 1.0))
WICK = common.pbr('wick', common.srgb(25, 20, 18), rough=0.9)
FLAME = common.pbr('flame', (1, 0.75, 0.4, 1), rough=1.0, emission=(1.0, 0.6, 0.22, 1.0))
BULB = common.pbr('bulb', (1, 0.85, 0.6, 1), rough=0.2, emission=(1.0, 0.62, 0.3, 1.0))
CABLE = common.pbr('cable', common.srgb(22, 22, 24), rough=0.6)


def interp(x, xs, ys):
    return float(np.interp(x, xs, ys))


def sweep_x(name, x0, x1, n_st, sec, mat, n=16, ends=0.02, yoff=None):
    """sec(x) -> (hw, ht, zc, p); ends rounded with radius ends; yoff(x) bends the piece sideways (curved slats)."""
    st = []
    for i in range(n_st):
        x = x0 + (x1 - x0) * (0.5 - 0.5 * math.cos(math.pi * i / (n_st - 1)))
        d = min(x - x0, x1 - x)
        e = math.sqrt(max(0.0, 1 - (1 - min(d, ends) / ends) ** 2)) if ends else 1.0
        hw, ht, zc, p = sec(x)
        st.append((x, max(hw * e, 1e-4), max(hw * e, 1e-4), max(ht * e, 1e-4), zc, 0, p))
    o = common.sweep(name, st, n, mat)
    if yoff:
        for v in o.data.vertices:
            v.co.y += yoff(v.co.x)
    return o


# ------------------------------------------------------------ table
top = common.lathe('t_top', common.fillet([(0, TOP), (1.215, TOP), (1.25, 0.898), (1.25, 0.866), (1.236, 0.845), (0, 0.845)],
                                          [0, 0.02, 0.008, 0.008, 0.006, 0], n=4), 112, TEAK)
common.uv_map(top, common.uv_planar(TILE / 2))  # the top is seen closest: twice the texel density
col_p = [(0, 0.09), (0.12, 0.09), (0.13, 0.105), (0.13, 0.21), (0.115, 0.235), (0.085, 0.25), (0.075, 0.28),
         (0.071, 0.5), (0.075, 0.70), (0.09, 0.712), (0.09, 0.728), (0.11, 0.742), (0.12, 0.775), (0.12, 0.845), (0, 0.845)]
column = common.lathe('t_col', common.fillet(col_p, [0, .008, .01, .01, .02, .01, .03, 0, .01, .004, .004, .01, .01, 0, 0], n=4), 40, TEAK)
common.uv_map(column, common.uv_cylinder(TILE, 0.08))
parts = [top, column]
for k in range(2):  # crossed rails under the top
    rail = sweep_x(f't_rail{k}', -0.98, 0.98, 6, lambda x: (0.035, 0.035, 0.81, 8), TEAK, 16, 0.01)
    common.uv_map(rail, common.uv_along_x(TILE))
    rail.data.transform(Matrix.Rotation(math.radians(45 + 90 * k), 4, 'Z'))
    parts.append(rail)
for k in range(4):  # splayed feet
    def foot(x):
        t, b = interp(x, [0.05, 0.15, 0.45, 0.76], [0.235, 0.225, 0.15, 0.105]), interp(x, [0.05, 0.2, 0.5, 0.76], [0.11, 0.1, 0.065, DECK])
        hw = interp(x, [0.05, 0.76], [0.045, 0.03])
        return hw, (t - b) / 2, (t + b) / 2, 4
    f = sweep_x(f't_foot{k}', 0.05, 0.78, 18, foot, TEAK, 20, 0.03)
    common.uv_map(f, common.uv_along_x(TILE))
    f.data.transform(Matrix.Rotation(math.radians(45 + 90 * k), 4, 'Z'))
    parts.append(f)
table = common.join(parts, 'table')

# ------------------------------------------------------------ bistro chair (local: seat centre, front -Y, floor z 0)
SEAT = 0.535
FL, FT = Vector((0.215, -0.235, 0)), Vector((0.203, -0.193, SEAT + 0.013))
chair_parts = [common.tube('c_frame', [(x, y, SEAT) for x, y in common.rrect(0.235, 0.225, 0.11, na=8, nx=6, ny=6)],
                           0.012, METAL, 10, cyclic=True)]
for s in (-1, 1):
    chair_parts.append(common.tube(f'c_front{s}', [(s * FL.x, FL.y, 0.012), (s * FT.x, FT.y, FT.z)], 0.012, METAL, 10))
back = [(-0.22, 0.27, 0.012), (-0.203, 0.193, SEAT), (-0.19, 0.24, 0.80), (-0.175, 0.29, 1.0), (-0.09, 0.312, 1.04),
        (0, 0.316, 1.046), (0.09, 0.312, 1.04), (0.175, 0.29, 1.0), (0.19, 0.24, 0.80), (0.203, 0.193, SEAT), (0.22, 0.27, 0.012)]
chair_parts.append(common.tube('c_back', common.fillet(back, [0, 0.06, 0.05, 0.08, 0.08, 0.08, 0.08, 0.08, 0.05, 0.06, 0], n=5),
                               0.012, METAL, 10))
z = 0.2
ring = []
for x, y0, y1, zt in ((-1, -0.235, -0.193, FT.z), (-1, 0.27, 0.193, SEAT), (1, 0.27, 0.193, SEAT), (1, -0.235, -0.193, FT.z)):
    t = z / zt
    xa = 0.215 + (0.203 - 0.215) * t if y0 < 0 else 0.22 + (0.203 - 0.22) * t
    ring.append((x * xa, y0 + (y1 - y0) * t, z))
chair_parts.append(common.tube('c_ring', common.fillet(ring, 0.03, n=5, closed=True), 0.009, METAL, 10, cyclic=True))
for x, y in ((-FL.x, FL.y), (FL.x, FL.y), (-0.22, 0.27), (0.22, 0.27)):  # rubber feet
    f = common.lathe('c_foot', common.fillet([(0, 0), (0.016, 0), (0.016, 0.014), (0, 0.016)], [0, 0.004, 0.004, 0], n=2), 12, METAL)
    f.location = (x, y, 0)
    chair_parts.append(f)
for i in range(6):  # seat slats following the round-cornered seat
    y = -0.19 + i * 0.076
    hx = 0.235 + 0.012 - (0.11 - math.sqrt(max(0.0, 0.11 ** 2 - max(0.0, abs(y) - 0.115) ** 2)))
    sl = sweep_x(f'c_slat{i}', -hx, hx, 10, lambda x: (0.032, 0.011, SEAT + 0.023, 6), TEAK, 16, 0.025, lambda x, y=y: y)
    common.uv_map(sl, common.uv_along_x(TILE))
    chair_parts.append(sl)
for zb, yb in ((0.78, 0.236), (0.93, 0.2725)):  # curved back slats, ends bedded in the uprights
    sl = sweep_x(f'c_back{zb}', -0.192, 0.192, 12, lambda x: (0.04, 0.011, zb, 6), TEAK, 16, 0.006,
                 lambda x, yb=yb: yb + 0.03 * (1 - (x / 0.19) ** 2))
    for v in sl.data.vertices:  # the section stands upright: width up the back, thickness front to back
        y0 = yb + 0.03 * (1 - (v.co.x / 0.19) ** 2)
        dy, dz = v.co.y - y0, v.co.z - zb
        v.co.y, v.co.z = y0 + dz, zb + dy
    sl.data.flip_normals()  # swapping two axes mirrored the winding
    common.uv_map(sl, common.uv_along_x(TILE))
    chair_parts.append(sl)
bpy.context.view_layer.update()
for o in chair_parts:
    o.data.transform(o.matrix_world)
    o.matrix_world.identity()
chair = common.join(chair_parts, 'chair_l')


def place(o, x, y, turn=0.0):
    """Stand o on the deck at (x, y), facing the table centre (plus turn degrees)."""
    o.location = (x, y, DECK)
    o.rotation_euler = (0, 0, math.atan2(-y, -x) + math.pi / 2 + math.radians(turn))


place(chair, -1.12, 1.12, 6)

# ------------------------------------------------------------ candle in an amber glass, and its flame
glass = common.lathe('k_glass', common.fillet([(0, 0), (0.046, 0), (0.05, 0.006), (0.05, 0.096), (0.0485, 0.1), (0.0465, 0.097),
                                               (0.0465, 0.014), (0, 0.014)], [0, .004, .003, .002, .001, .002, .003, 0], n=3), 48, GLASS)
wax = common.lathe('k_wax', common.fillet([(0, 0.066), (0.03, 0.068), (0.0425, 0.072), (0.0455, 0.069), (0.0455, 0.015), (0, 0.015)],
                                          [0, 0.01, 0.002, 0.002, 0.001, 0], n=3), 40, WAX)
wick = common.tube('k_wick', [(0, 0, 0.064), (0.0005, 0, 0.074), (0.002, 0.001, 0.083)], 0.0016, WICK, 6)
candle = common.join([glass, wax, wick], 'candle')
candle.data.transform(Matrix.Translation(CANDLE))
flame = common.lathe('candle_flame', common.fillet([(0, 0.079), (0.006, 0.083), (0.0088, 0.092), (0.008, 0.103), (0.0055, 0.116),
                                                    (0.002, 0.129), (0, 0.137)], [0, .003, .004, .005, .005, .003, 0], n=3), 16, FLAME)
flame.data.transform(Matrix.Translation(CANDLE))

# ------------------------------------------------------------ bulb string: catenary wire, sockets, bulbs, two posts
wire_at = lambda k: Vector((-3.6 + 7.2 * k, 2.5 - 3 * k, 2.93 - 0.35 * math.sin(math.pi * k)))
wire = [common.tube('s_wire', [wire_at(k) for k in np.linspace(0, 1, 81)], 0.004, CABLE, 8)]
# a G45 globe on a short neck, sampled from a smooth curve so its outline stays round
bulb_p = [(0, 0)] + [(0.0085 + (0.0285 - 0.0085) * math.sin(min(1.0, t / 0.55) * math.pi / 2) ** 1.5 if t < 0.55 else
                      0.0285 * math.sqrt(max(0.0, 1 - ((t - 0.55) / 0.45) ** 2)), -0.0765 * t)
                     for t in np.sin(np.linspace(0, 1, 16) * math.pi / 2)]
sock_p = common.fillet([(0, 0), (0.008, 0), (0.0115, -0.004), (0.0115, -0.022), (0.009, -0.026), (0, -0.026)], [0, .002, .002, .002, .002, 0], n=1)
bulbs = []
for i in range(14):
    w = wire_at(i / 13)
    wire.append(common.tube('s_cord', [w + Vector((0, 0, 0.002)), w - Vector((0, 0, 0.016))], 0.002, CABLE, 6))
    s = common.lathe('s_sock', sock_p, 10, CABLE)
    s.data.transform(Matrix.Translation(w - Vector((0, 0, 0.012))))
    wire.append(s)
    b = common.lathe(f'bulb_{i:02d}', bulb_p, 16, BULB)
    b.data.transform(Matrix.Translation(w - Vector((0, 0, 0.035))))
    bulbs.append(b)
string_wire = common.join(wire, 'string_wire')
posts = []
for k in (0, 1):
    w = wire_at(k)
    posts.append(common.tube('p', [(w.x, w.y, DECK), (w.x, w.y, 3.0)], 0.03, CABLE, 12))
    cap = common.lathe('pc', common.fillet([(0, 0), (0.036, 0), (0.036, 0.02), (0, 0.045)], [0, .006, .01, 0], n=3), 16, CABLE)
    cap.location = (w.x, w.y, 2.99)
    posts.append(cap)
bpy.context.view_layer.update()
for o in posts:
    o.data.transform(o.matrix_world)
    o.matrix_world.identity()
string_posts = common.join(posts, 'string_posts')

for o in [table, chair, candle, string_wire, string_posts] + bulbs:
    common.smooth(o, 50, weighted=o in (table, chair))
common.smooth(flame, 80, weighted=False)

# ------------------------------------------------------------ AO, second chair, export
common.bake_ao([table, chair], 1024, distance=0.35, name='cafe', ground_z=DECK)
chair_r = bpy.data.objects.new('chair_r', chair.data)  # same mesh, so the file stores it once
bpy.context.scene.collection.objects.link(chair_r)
place(chair_r, 1.15, 1.1, -5)
for m in chair.modifiers:  # the weighted-normal modifier travels with the object, not the mesh
    chair_r.modifiers.new(m.name, m.type).keep_sharp = True
objs = [table, chair, chair_r, candle, flame, string_wire, string_posts] + bulbs
tris = common.triangles(objs)
size = common.export_glb(objs, GLB)
print(f'cafe: {GLB} {size / 1024:.1f} KB, {tris} triangles')
assert size <= MAX_BYTES, f'cafe.glb is {size} bytes, over the {MAX_BYTES} budget'
common.check_budget(os.path.dirname(GLB))

# ------------------------------------------------------------ previews: candle and bulbs against the night
lights = [(tuple(wire_at(i / 13) - Vector((0, 0, 0.08))), (1, 0.62, 0.3), 3.0, 0.03) for i in range(14)]
lights += [(tuple(CANDLE + Vector((0, 0, 0.11))), (1, 0.55, 0.2), 2.5, 0.01), ((0.3, -0.2, 2.8), (1, 0.82, 0.64), 110, 0.35), ((1.5, -2.5, 0.7), (1, 0.6, 0.35), 25, 0.5)]
P = lambda n: os.path.join(OUT, n)
common.render_previews(GLB, [
    (P('cafe-hero.png'), (3.3, -4.6, 2.3), (0, 0.25, 0.95), 32),
    (P('cafe-close.png'), (-0.3, -1.6, 1.22), (-0.82, -0.62, 0.95), 50),
    (P('cafe-chair.png'), (-0.2, -0.1, 1.35), (-1.1, 1.12, 0.6), 40),
    (P('cafe-bulbs.png'), (0.62, 0.18, 2.47), (0.86, 0.66, 2.55), 50),
], look='night', ground=common.srgb(96, 58, 44), ground_z=DECK, lights=lights, exposure=0.6)
