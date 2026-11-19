"""The farmer's hut: a northern Thai field hut on bamboo stilts with woven split-bamboo walls and a steep gable roof
of thick, weathered rice-straw thatch.

blender --background --factory-startup --python blender/hut.py -- [out.glb] [preview dir]

Authored in film coordinates (x right, y up, z toward the camera, metres) so the numbers match v1's hut in
film.js; P() maps them to Blender (z up, front = -Y), which the glTF exporter maps back. Origin = ground centre.
Same footprint and envelope as v1: posts at x +-1.05, z +-0.85, floor at y 1.0, walls to 1.84, back-wall window
round (0.2, 1.38, -0.76), eaves 3.3 x 2.7 at y 1.72, ridge at y 3.0 (now a gable running along x).
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
WOOD = common.pbr('wood', common.srgb(66, 50, 36), rough=0.85)                 # beams, joists, plates, rafters
BAMBOO = common.pbr('bamboo', common.srgb(146, 146, 108), rough=0.6)           # pale green-grey poles with nodes
DECK = common.pbr('deck', common.srgb(84, 62, 44), rough=0.85)                  # split-bamboo floor strips
WALL = common.pbr('fak', (1, 1, 1, 1), *common.weave_textures(512, 24, 'twill', (0.66, 0.53, 0.34)), strength=0.9, rough=0.9)
THATCH = common.pbr('thatch', (1, 1, 1, 1), *common.thatch_textures(512), strength=1.0, rough=0.95)
ROPE = common.pbr('lashing', common.srgb(96, 78, 52), rough=1.0)
STONE = common.pbr('stone', common.srgb(92, 88, 82), rough=0.9)
TT = 0.9                   # metres of thatch per texture repeat across the roof (v runs eave to ridge once)
parts = []
rng = random.Random(7)


def wall_uv(cos, poly):
    """Box projection for the woven panels, 0.35 m per repeat."""
    n = poly.normal
    ax = max(range(3), key=lambda i: abs(n[i]))
    a, b = ((1, 2), (0, 2), (0, 1))[ax]
    return [(c[a] / 0.35, c[b] / 0.35) for c in cos]


def box(size, centre, mat, bev=0.012):
    """size and centre in film coordinates (w, h, d)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=P(*centre))
    o = bpy.context.active_object
    o.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(scale=True)
    common.bevel(o, bev)
    o.data.materials.append(mat)
    if mat is WALL:
        o.data.transform(o.matrix_world)
        o.matrix_world.identity()
        common.uv_map(o, wall_uv)
    parts.append(o)
    return o


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


def lash(at, axis, r):
    """A rattan lashing: a few turns round a pole at a joint (at, axis in film coordinates)."""
    o = common.lathe('lash', common.fillet([(r + 0.004, -0.03), (r + 0.011, -0.022), (r + 0.011, 0.022), (r + 0.004, 0.03)], 0.004, n=2)
                     + [(r - 0.002, 0.03), (r - 0.002, -0.03)], 10, ROPE, closed=True)
    o.data.transform(Matrix.Translation(P(*at)) @ Vector((0, 0, 1)).rotation_difference(P(*axis)).to_matrix().to_4x4())
    parts.append(o)


X, Z = 1.05, 0.85          # post grid (v1: stilts at x +-1, z +-0.8)
FLOOR, TOP = 1.0, 1.84     # floor surface and wall-top plate heights (v1: floor 0.95, walls to 1.8)

# stilts on flat footing stones; corners run up to the wall plate, the middle pair stops under the floor
for x in (-X, X):
    for z in (-Z, Z):
        pole((x, 0.03, z), (x, TOP + 0.04, z), 0.06, BAMBOO)
for z in (-Z, Z):
    pole((0, 0.03, z), (0, FLOOR - 0.04, z), 0.055, BAMBOO)
for x in (-X, 0, X):
    for z in (-Z, Z):
        st = common.lathe('stone', [(0.14 * math.sin(a) * (1 + 0.08 * math.sin(3 * a + x)), 0.045 * (1 - math.cos(a))) for a in np.linspace(0, math.pi, 7)], 9, STONE)
        st.data.transform(Matrix.Translation(P(x, -0.01, z)) @ Matrix.Diagonal((1.15, 0.9, 1.0)).to_4x4() @ Matrix.Rotation(rng.uniform(0, 3), 4, 'Z'))
        parts.append(st)

# floor of split-bamboo strips on joists, cross-bracing under it, lashed where braces cross posts
for i in range(14):
    x = -1.2 + 0.0865 + i * (2.4 / 14)
    box((2.4 / 14 - 0.014, 0.05, 2.0), (x, FLOOR - 0.025, 0), DECK, 0.008)
for z in (-Z, Z):
    box((2.4, 0.08, 0.08), (0, FLOOR - 0.09, z), WOOD)
for x in (-X, X):
    pole((x + math.copysign(0.065, -x), 0.12, -Z), (x + math.copysign(0.065, -x), FLOOR - 0.16, Z), 0.028, BAMBOO)   # on the post's inner face
    pole((x + math.copysign(0.065, -x), 0.12, Z), (x + math.copysign(0.065, -x), FLOOR - 0.16, -Z), 0.028, BAMBOO)
    for z, y in ((-Z, 0.14), (Z, 0.14), (-Z, FLOOR - 0.18), (Z, FLOOR - 0.18)):
        lash((x, y, z), (0, 1, 0), 0.06)
pole((-X, 0.12, -Z - 0.065), (X, FLOOR - 0.16, -Z - 0.065), 0.028, BAMBOO)
for x in (-X, X):
    for z in (-Z, Z):
        lash((x, FLOOR - 0.09, z), (0, 1, 0), 0.06)

# woven split-bamboo (fak) walls: back (window where v1 lights it at (0.2, 1.38, -0.76)) and both sides; front open
WX0, WX1, WY0, WY1 = -0.11, 0.51, 1.18, 1.58
H = TOP - FLOOR
box((WX0 + X, H, 0.04), ((WX0 - X) / 2, FLOOR + H / 2, -Z), WALL)
box((X - WX1, H, 0.04), ((WX1 + X) / 2, FLOOR + H / 2, -Z), WALL)
box((WX1 - WX0, WY0 - FLOOR, 0.04), ((WX0 + WX1) / 2, (FLOOR + WY0) / 2, -Z), WALL)
box((WX1 - WX0, TOP - WY1, 0.04), ((WX0 + WX1) / 2, (WY1 + TOP) / 2, -Z), WALL)
for y in (WY0, WY1):  # window frame
    pole((WX0 - 0.04, y, -Z + 0.04), (WX1 + 0.04, y, -Z + 0.04), 0.022, BAMBOO)
for x in (WX0, WX1):
    pole((x, WY0 - 0.04, -Z + 0.04), (x, WY1 + 0.04, -Z + 0.04), 0.022, BAMBOO)
for x in (-X, X):
    box((0.04, H, 2 * Z), (x, FLOOR + H / 2, 0), WALL)
    # gable triangle above the side wall, woven too
    tri = [P(x - 0.02, TOP, -Z - 0.1), P(x - 0.02, TOP, Z + 0.1), P(x - 0.02, 2.82, 0), P(x + 0.02, TOP, -Z - 0.1), P(x + 0.02, TOP, Z + 0.1), P(x + 0.02, 2.82, 0)]
    g = common.build('gable', tri, [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], WALL)
    common.uv_map(g, wall_uv)
    parts.append(g)

# wall-top plates, rafters and a ridge pole under the thatch
for z in (-Z, Z):
    pole((-X - 0.1, TOP, z), (X + 0.1, TOP, z), 0.045, WOOD)
for x in (-X, X):
    pole((x, TOP, -Z - 0.1), (x, TOP, Z + 0.1), 0.045, WOOD)
for x in (-1.3, -0.65, 0, 0.65, 1.3):
    for s in (-1, 1):
        pole((x, TOP - 0.02, s * (Z + 0.2)), (x, 2.78, 0), 0.028, WOOD)
pole((-1.6, 2.76, 0), (1.6, 2.76, 0), 0.045, WOOD)

# front rail on the left, ladder up the right with lashed rungs
pole((-X, FLOOR + 0.32, Z), (0.3, FLOOR + 0.32, Z), 0.025, BAMBOO)
pole((-0.4, FLOOR, Z), (-0.4, FLOOR + 0.32, Z), 0.02, BAMBOO)
pole((0.3, FLOOR, Z), (0.3, FLOOR + 0.34, Z), 0.025, BAMBOO)
for x in (0.5, 0.85):
    pole((x, 0, Z + 0.6), (x, FLOOR + 0.12, Z + 0.1), 0.025, BAMBOO)
for t in (0.2, 0.4, 0.6, 0.8):
    y, z = FLOOR * t, Z + 0.6 - 0.5 * t
    pole((0.47, y + 0.03, z), (0.88, y + 0.03, z), 0.018, BAMBOO)  # rungs rest on the rails
    for x in (0.5, 0.85):
        lash((x, y + 0.02, z), (0, 1, -0.5), 0.026)

# ------------------------------------------------------------ the gable roof: two thick thatch slabs
EX, EZ, EY, RY = 1.65, 1.35, 1.72, 3.0
NU, NV = 44, 10
run, rise = EZ, RY - EY
L = math.hypot(run, rise)


def thick(s):
    return 0.2 * (1 - s) + 0.1 * s


for side in (1, -1):  # front (film +z) then back
    nrm = Vector((0, run, side * rise)) / L                       # film coordinates: outward, up the slope's normal
    lump = [[0.025 * math.sin(i * 0.7 + side) * math.sin(j * 1.3 + 2 * side) + rng.uniform(-0.01, 0.01) for j in range(NV + 1)] for i in range(NU + 1)]
    verts, faces, uvs = [], [], []
    grid = {}
    for layer in (0, 1):                                          # 0 outer, 1 inner
        for i in range(NU + 1):
            for j in range(NV + 1):
                s, x = j / NV, -EX + 2 * EX * i / NU
                p = Vector((x, EY + rise * s, side * run * (1 - s)))
                bands = sum(-0.035 * math.exp(-((s - b) / 0.035) ** 2) for b in (0.36, 0.68))   # batten lines
                off = (lump[i][j] + bands) if layer == 0 else -thick(s)
                if j == 0:                                        # a ragged, wind-frayed eave
                    p.y -= rng.uniform(0.0, 0.07)
                    p += Vector((0, 0, side)) * rng.uniform(0, 0.04)
                if i in (0, NU):                                  # ragged gable edges
                    p.x += math.copysign(rng.uniform(0.0, 0.05), x)
                grid[layer, i, j] = len(verts)
                verts.append(P(*(p + nrm * off)))
    q = lambda l, i, j: grid[l, i, j]
    for i in range(NU):
        for j in range(NV):
            uv = [(i / NU * 2 * EX / TT, j / NV), ((i + 1) / NU * 2 * EX / TT, j / NV), ((i + 1) / NU * 2 * EX / TT, (j + 1) / NV), (i / NU * 2 * EX / TT, (j + 1) / NV)]
            faces.append((q(0, i, j), q(0, i + 1, j), q(0, i + 1, j + 1), q(0, i, j + 1)))
            uvs.append(uv)
            faces.append((q(1, i, j + 1), q(1, i + 1, j + 1), q(1, i + 1, j), q(1, i, j)))
            uvs.append([uv[3], uv[2], uv[1], uv[0]])
    for i in range(NU):                                           # the cut-straw butt at the eave, and the ridge edge
        for j, v0 in ((0, 0.0), (NV, 0.95)):
            faces.append((q(0, i, j), q(1, i, j), q(1, i + 1, j), q(0, i + 1, j)))
            uvs.append([(i / NU * 2 * EX / TT, v0), (i / NU * 2 * EX / TT, v0 + 0.05), ((i + 1) / NU * 2 * EX / TT, v0 + 0.05), ((i + 1) / NU * 2 * EX / TT, v0)])
    for i in (0, NU):                                             # gable ends
        for j in range(NV):
            faces.append((q(0, i, j), q(0, i, j + 1), q(1, i, j + 1), q(1, i, j)))
            uvs.append([(0, j / NV), (0, (j + 1) / NV), (0.2, (j + 1) / NV), (0.2, j / NV)])
    slab = common.build('thatch', verts, faces, THATCH, uvs)
    parts.append(slab)
    # loose straws hanging from the eave
    for k in range(120):
        x = -EX + 2 * EX * (k + rng.random()) / 120
        base = Vector((x, EY - 0.02 - rng.uniform(0, 0.05), side * (run - 0.03))) - nrm * rng.uniform(0.02, 0.15)
        d = (Vector((0, -rise, side * run)) / L * 0.7 + Vector((0, -1, 0)) * 0.3).normalized()
        ln = rng.uniform(0.07, 0.2)
        mid = base + d * ln * 0.5 + Vector((rng.uniform(-0.02, 0.02), -0.01, 0))
        tip = base + d * ln + Vector((rng.uniform(-0.03, 0.03), -ln * 0.25, 0))
        parts.append(common.tube('straw', [P(*base), P(*mid), P(*tip)], [0.007, 0.005, 0.002], THATCH, 3, uv_tile=0.9))

# ridge cap of folded thatch, bound every 40 cm; crossed finials (kalae) lashed at each gable apex
st = []
for x in np.linspace(-EX - 0.06, EX + 0.06, 20):
    e = math.sqrt(max(0.0, 1 - (1 - min(EX + 0.06 - abs(x), 0.12) / 0.12) ** 2))
    st.append((x, 0.23 * e + 1e-4, 0.23 * e + 1e-4, 0.09 * e + 1e-4, RY + 0.0, 0, 2.2))
cap = common.sweep('ridge', st, 20, THATCH)
common.uv_map(cap, lambda cos, poly: [(c.x / TT, 0.9 + 0.1 * (RY + 0.09 - c.z) / 0.18) for c in cos])
parts.append(cap)
for x in np.arange(-1.4, 1.41, 0.4):
    ring = [(x, 0.236 * math.cos(a), RY + 0.095 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 16, endpoint=False)]
    parts.append(common.tube('bind', ring, 0.011, ROPE, 6, cyclic=True))
for x in (-EX - 0.02, EX + 0.02):
    pole((x, RY - 0.18, -0.3), (x, RY + 0.36, 0.2), 0.024, WOOD)
    pole((x, RY - 0.18, 0.3), (x, RY + 0.36, -0.2), 0.024, WOOD)
    lash((x, RY + 0.06, 0.0), (1, 0, 0), 0.034)

# ------------------------------------------------------------ one mesh, smooth shaded, AO baked, exported
for o in bpy.context.scene.objects:
    o.select_set(o in parts)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
hut = bpy.context.active_object
hut.name = hut.data.name = 'hut'
hut.data.transform(hut.matrix_world)  # join kept the first part's origin; put it back at ground centre
hut.matrix_world.identity()
common.smooth(hut, 40, weighted=False)

common.bake_ao(hut, 1024)  # one atlas for the whole hut, many islands: 1024 keeps the walls and thatch crisp
tris = common.triangles([hut])
size = common.export_glb([hut], GLB)
print(f'hut: {GLB} {size / 1024:.1f} KB, {tris} triangles')
assert size <= MAX_BYTES, f'hut.glb is {size} bytes, over the {MAX_BYTES} budget'
common.check_budget(os.path.dirname(GLB))
Pn = lambda n: os.path.join(OUT, n)
common.render_previews(GLB, [
    (Pn('hut-hero.png'), (5.2, -6.4, 2.6), (0, 0, 1.5), 45),
    (Pn('hut-close.png'), (2.6, -3.1, 1.6), (1.1, -1.0, 2.0), 40),
], look='sunset', ground=common.srgb(58, 48, 34))
