"""The farmer's hut: a low-poly Thai field hut on short stilts, bamboo frame, thatch hip roof.

blender --background --python blender/hut.py -- [out.glb] [preview.png]

Authored in film coordinates (x right, y up, z toward the camera, metres) so the numbers match v1's hut in
film.js; P() maps them to Blender (z up, front = -Y), which the glTF exporter maps back. Origin = ground centre.
"""
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
GLB = os.path.abspath(ARGS[0] if ARGS else os.path.join(ROOT, 'models', 'hut.glb'))
PNG = os.path.abspath(ARGS[1] if len(ARGS) > 1 else os.path.join(ROOT, 'docs', 'film-renders', 'assets', 'hut.png'))
MAX_BYTES = 400 * 1024


def P(x, y, z):
    return Vector((x, -z, y))


bpy.ops.wm.read_factory_settings(use_empty=True)
WOOD = common.material('wood', common.PALETTE['dusk_field'])
BAMBOO = common.material('bamboo', common.PALETTE['field_muted'])
THATCH = common.material('thatch', common.PALETTE['field'])
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


def pole(a, b, r, mat, sides=6):
    a, b = P(*a), P(*b)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=r, depth=d.length, location=(a + b) / 2,
                                        rotation=Vector((0, 0, 1)).rotation_difference(d).to_euler())
    o = bpy.context.active_object
    o.data.materials.append(mat)
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

# thatch hip roof (v1: apex ~2.9, eaves ~3.25 x 2.55), a little lumpy so it reads hand-laid
EX, EZ, EY, RX, RY = 1.65, 1.35, 1.72, 0.6, 3.0
bm = bmesh.new()
v = [bm.verts.new(P(*c)) for c in ((-EX, EY, EZ), (EX, EY, EZ), (EX, EY, -EZ), (-EX, EY, -EZ), (-RX, RY, 0), (RX, RY, 0))]
for f in ((0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)):
    bm.faces.new([v[i] for i in f])
bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2, use_grid_fill=True)
rng = random.Random(7)
for vert in bm.verts:
    if vert.co.z > EY + 0.05:  # leave the eave line straight
        vert.co.z += rng.uniform(-0.06, 0.06)
bmesh.ops.triangulate(bm, faces=bm.faces[:])
bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.14)
roof = bpy.data.objects.new('roof', bpy.data.meshes.new('roof'))
bm.to_mesh(roof.data)
bm.free()
roof.data.materials.append(THATCH)
bpy.context.scene.collection.objects.link(roof)
parts.append(roof)
pole((-RX - 0.12, RY + 0.04, 0), (RX + 0.12, RY + 0.04, 0), 0.07, WOOD)
for x in (-RX - 0.05, RX + 0.05):  # crossed ridge sticks
    pole((x, RY - 0.05, -0.18), (x, RY + 0.32, 0.18), 0.022, WOOD)
    pole((x, RY - 0.05, 0.18), (x, RY + 0.32, -0.18), 0.022, WOOD)

# one mesh, flat shaded, AO baked, exported
for o in bpy.context.scene.objects:
    o.select_set(o in parts)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
hut = bpy.context.active_object
hut.name = hut.data.name = 'hut'
hut.data.transform(hut.matrix_world)  # join kept the first part's origin; put it back at ground centre
hut.matrix_world.identity()
for poly in hut.data.polygons:
    poly.use_smooth = False

common.bake_ao(hut, 512)
tris = common.triangles([hut])
size = common.export_glb([hut], GLB)
print(f'hut: {GLB} {size / 1024:.1f} KB, {tris} triangles')
assert size <= MAX_BYTES, f'hut.glb is {size} bytes, over the {MAX_BYTES} budget'
common.render_preview(GLB, PNG)
print(f'hut preview: {PNG}')
