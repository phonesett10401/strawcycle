"""The farmer's hut: a Thai field hut on short stilts, noded bamboo frame, a hip roof of layered thatch courses.

blender --background --factory-startup --python blender/hut.py -- [out.glb] [preview dir]

Authored in film coordinates (x right, y up, z toward the camera, metres) so the numbers match v1's hut in
film.js; P() maps them to Blender (z up, front = -Y), which the glTF exporter maps back. Origin = ground centre.
"""
import math
import os
import random
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
GLB = os.path.abspath(ARGS[0] if ARGS else os.path.join(ROOT, 'models', 'hut.glb'))
OUT = os.path.abspath(ARGS[1] if len(ARGS) > 1 else os.path.join(ROOT, 'docs', 'film-renders', 'assets'))
MAX_BYTES = 400 * 1024


def P(x, y, z):
    return Vector((x, -z, y))


bpy.ops.wm.read_factory_settings(use_empty=True)
WOOD = common.material('wood', common.PALETTE['dusk_field'])
BAMBOO = common.material('bamboo', common.PALETTE['field_muted'])
# weathered straw, mid-dark and desaturated (the film lights it live), strands along the slope
THATCH = common.pbr('thatch', (1, 1, 1, 1), *common.thatch_textures(512), strength=1.0, rough=0.95)
TT = 0.9                   # metres of thatch per texture repeat
parts = []


def box(size, centre, mat, bev=0.012):
    """size and centre in film coordinates (w, h, d)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=P(*centre))
    o = bpy.context.active_object
    o.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(scale=True)
    common.bevel(o, bev)
    o.data.materials.append(mat)
    parts.append(o)


def pole(a, b, r, mat, sides=None):
    """A bamboo pole from a to b with swollen nodes along it."""
    a, b = P(*a), P(*b)
    d = b - a
    L = d.length
    sides = sides or (10 if r > 0.04 else 7)
    gap = max(0.22, min(0.42, L / 3))
    prof = [(0, 0), (r * 0.9, 0), (r, 0.008)]
    t = gap * 0.6
    while t < L - 0.06:
        prof += [(r, t - 0.014), (r * 1.09, t - 0.004), (r * 1.09, t + 0.004), (r, t + 0.014)]
        t += gap
    prof += [(r, L - 0.008), (r * 0.9, L), (0, L)]
    o = common.lathe('pole', prof, sides, mat)
    o.data.transform(Matrix.Translation(a) @ Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4())
    parts.append(o)


X, Z = 1.05, 0.85          # post grid (v1: stilts at x +-1, z +-0.8)
FLOOR, TOP = 1.0, 1.84     # floor surface and wall-top plate heights (v1: floor 0.95, walls to 1.8)

# stilts and posts: corners run up to the wall plate, the middle pair stops under the floor
for x in (-X, X):
    for z in (-Z, Z):
        pole((x, 0, z), (x, TOP + 0.04, z), 0.06, WOOD)
for z in (-Z, Z):
    pole((0, 0, z), (0, FLOOR - 0.04, z), 0.055, WOOD)

# floor, joists and cross-bracing under it
box((2.4, 0.08, 2.0), (0, FLOOR - 0.04, 0), BAMBOO)
for z in (-Z, Z):
    box((2.4, 0.08, 0.08), (0, FLOOR - 0.12, z), WOOD)
for x in (-X, X):
    pole((x, 0.12, -Z), (x, FLOOR - 0.16, Z), 0.028, BAMBOO)
    pole((x, 0.12, Z), (x, FLOOR - 0.16, -Z), 0.028, BAMBOO)
pole((-X, 0.12, -Z), (X, FLOOR - 0.16, -Z), 0.028, BAMBOO)

# woven walls: back (with the window v1 lights at (0.2, 1.38, -0.76)) and both sides; the front stays open
WX0, WX1, WY0, WY1 = -0.11, 0.51, 1.18, 1.58
H = TOP - FLOOR
box((WX0 + X, H, 0.04), ((WX0 - X) / 2, FLOOR + H / 2, -Z), BAMBOO)
box((X - WX1, H, 0.04), ((WX1 + X) / 2, FLOOR + H / 2, -Z), BAMBOO)
box((WX1 - WX0, WY0 - FLOOR, 0.04), ((WX0 + WX1) / 2, (FLOOR + WY0) / 2, -Z), BAMBOO)
box((WX1 - WX0, TOP - WY1, 0.04), ((WX0 + WX1) / 2, (WY1 + TOP) / 2, -Z), BAMBOO)
pole((WX0 - 0.04, WY0, -Z + 0.04), (WX1 + 0.04, WY0, -Z + 0.04), 0.022, WOOD)
for x in (-X, X):
    box((0.04, H, 2 * Z), (x, FLOOR + H / 2, 0), BAMBOO)

# wall-top plates
for z in (-Z, Z):
    pole((-X - 0.1, TOP, z), (X + 0.1, TOP, z), 0.045, WOOD)
for x in (-X, X):
    pole((x, TOP, -Z - 0.1), (x, TOP, Z + 0.1), 0.045, WOOD)

# front rail on the left, ladder up the right
pole((-X, FLOOR + 0.32, Z), (0.3, FLOOR + 0.32, Z), 0.025, BAMBOO)
pole((-0.4, FLOOR, Z), (-0.4, FLOOR + 0.32, Z), 0.02, BAMBOO)
pole((0.3, FLOOR, Z), (0.3, FLOOR + 0.34, Z), 0.025, BAMBOO)
for x in (0.5, 0.85):
    pole((x, 0, Z + 0.6), (x, FLOOR + 0.12, Z + 0.1), 0.025, BAMBOO)
for t in (0.2, 0.4, 0.6, 0.8):
    pole((0.48, FLOOR * t, Z + 0.6 - 0.5 * t), (0.87, FLOOR * t, Z + 0.6 - 0.5 * t), 0.018, BAMBOO)

# thatch hip roof (v1: apex ~2.9, eaves ~3.25 x 2.55), laid in overlapping courses: each course is a wedge whose
# thick, ragged butt hangs over the top of the course below; the outer face stays inside the old roof plane
EX, EZ, EY, RX, RY = 1.65, 1.35, 1.72, 0.6, 3.0
NH, NV = 0.72, 0.69        # roughly the slope normal (horizontal, vertical)
COURSES, T, OV = 5, 0.13, 0.07
rng = random.Random(7)


def roof_ring(s, off):
    """The roof's rounded-hip outline at slope fraction s (0 eaves, 1 ridge), pushed off metres along the normal."""
    hx = EX + (RX - EX) * s + NH * off
    hy = max(EZ * (1 - s) + NH * off, 0.03)
    z = EY + (RY - EY) * s + NV * off
    r = min(0.35 * (1 - s) + 0.08, hy * 0.95, hx * 0.95)
    return [Vector((x, y, z)) for x, y in common.rrect(hx, hy, r, na=6, nx=48, ny=36)]


S = [0.97 * k / COURSES for k in range(COURSES + 1)]
for k in range(COURSES):
    s0, s1 = S[k], S[k + 1]
    sb = s0 - (OV if k else 0)
    r1, r2 = roof_ring(s0 + (OV if not k else 0), -T), roof_ring(sb, 0)
    r2b, r3, r4 = roof_ring(s0 + 0.3 * (s1 - s0), -0.2 * T), roof_ring(s1, -0.8 * T), roof_ring(s1, -T)
    flat = [v.copy() for v in r2]
    for j, v in enumerate(r2):  # ragged butt: straw ends hang unevenly
        out = Vector((v.x, v.y, 0)).normalized()
        v.z -= rng.uniform(0, 0.035 + (0.025 if not k else 0)) + 0.02 * (1 + math.sin(j * 0.31 + k)) * (0.5 + 0.5 * math.sin(j * 0.07))
        v += out * (rng.uniform(-0.004, 0.02) + 0.01 * math.sin(j * 0.13 + 2 * k))
    for j, v in enumerate(r2b):  # lumpy bundles
        v += Vector((v.x, v.y, 0)).normalized() * (0.014 * math.sin(j * 0.21 + 1.3 * k) + rng.uniform(-0.006, 0.006))
    rings = [r1, r2, r2b, r3, r4]
    u = [0.0]
    for j in range(len(flat)):
        u.append(u[-1] + (flat[(j + 1) % len(flat)] - flat[j]).length / TT)
    v = [0.0]
    for i in range(len(rings)):
        v.append(v[-1] + (rings[(i + 1) % len(rings)][0] - rings[i][0]).length / TT)
    parts.append(common.loft(f'course{k}', [[tuple(p) for p in ring] for ring in rings], THATCH, caps=None, cyclic=True, u=u, v=v))

# a rolled straw ridge over the top course, strands running over it and down both slopes
st = []
for x in 0.72 - 0.72 * np.cos(np.pi * np.linspace(0, 1, 16)) - 0.72:
    e = math.sqrt(max(0.0, 1 - (1 - min(0.72 - abs(x), 0.16) / 0.16) ** 2))
    st.append((x, 0.24 * e + 1e-4, 0.24 * e + 1e-4, 0.085 * e + 1e-4, RY - 0.075, 0, 2.2))
ridge = common.sweep('ridge', st, 20, THATCH)
common.uv_map(ridge, lambda cos, poly: [(c.x / TT, (abs(c.y) + RY - c.z) / TT) for c in cos])
parts.append(ridge)
pole((-RX - 0.05, RY + 0.02, 0), (RX + 0.05, RY + 0.02, 0), 0.05, WOOD)
for x in (-RX - 0.05, RX + 0.05):  # crossed ridge sticks
    pole((x, RY - 0.05, -0.18), (x, RY + 0.32, 0.18), 0.022, WOOD)
    pole((x, RY - 0.05, 0.18), (x, RY + 0.32, -0.18), 0.022, WOOD)

# one mesh, smooth shaded with hard edges over 40 degrees, AO baked, exported
for o in bpy.context.scene.objects:
    o.select_set(o in parts)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
hut = bpy.context.active_object
hut.name = hut.data.name = 'hut'
hut.data.transform(hut.matrix_world)  # join kept the first part's origin; put it back at ground centre
hut.matrix_world.identity()
common.smooth(hut, 40, weighted=False)

common.bake_ao(hut, 1024)  # one atlas for the whole hut, many islands: 1024 keeps the walls and roof courses crisp
tris = common.triangles([hut])
size = common.export_glb([hut], GLB)
print(f'hut: {GLB} {size / 1024:.1f} KB, {tris} triangles')
assert size <= MAX_BYTES, f'hut.glb is {size} bytes, over the {MAX_BYTES} budget'
common.check_budget(os.path.dirname(GLB))
P = lambda n: os.path.join(OUT, n)
common.render_previews(GLB, [
    (P('hut-hero.png'), (5.2, -6.4, 2.6), (0, 0, 1.4), 45),
    (P('hut-close.png'), (2.5, -3.0, 1.75), (1.15, -1.0, 2.15), 40),
], look='sunset', ground=common.srgb(58, 48, 34))
