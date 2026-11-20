"""Shop photos: each product from models/packaging.glb (plus a carry bag modelled here, photo only) on its own, in a
soft studio three-quarter view, over a warm cream plate. Writes images/products/<id>.webp, 800 x 800.

blender --background --factory-startup --python blender/product_photos.py -- [out dir] [only,ids]

Each product is scaled to a unit bounding sphere so one light rig and one shadow softness fit them all, then the
camera is pulled back until the product fills the same share of the frame. Cycles renders it over a shadow catcher
with a transparent film; numpy lays that over the plate (a soft radial gradient) and Blender saves the WebP.
"""
import math
import os
import sys
import tempfile

import bmesh
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import common  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(ARGS[0] if ARGS else os.path.join(ROOT, 'images', 'products'))
ONLY = ARGS[1].split(',') if len(ARGS) > 1 else None
SIZE, RENDER, MAX_BYTES = 800, 1000, 80 * 1024
PLATE_IN, PLATE_OUT = (246, 239, 227), (232, 220, 200)   # centre and corner of the plate, warm cream (sRGB)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'models', 'packaging.glb'))
for m in bpy.data.materials:
    common._show_ao(m)
OBS = {o.name: o for o in bpy.context.scene.objects if o.type == 'MESH'}


# ------------------------------------------------------------ the carry bag (photo only, not in the film)
def carry_bag():
    """A 22 x 12 x 26 cm moulded-fibre carry bag: gently bowed faces, side gussets pinched in towards the open top,
    a thin wall, and two twisted fibre-cord handles glued inside the front and back walls."""
    alb, nrm = common.fibre_textures(1024)
    wall = common.pbr('bag', common.srgb(227, 205, 167), alb, nrm, strength=0.5, rough=0.8, sheen=0.25)
    cord = common.pbr('bag_cord', common.srgb(206, 178, 132), alb, nrm, strength=0.6, rough=0.85, sheen=0.2)
    W, D, H, G = 0.11, 0.06, 0.26, 0.022   # half width, half depth, height, gusset fold depth at the top
    rings = []
    for t in np.linspace(0, 1, 27):
        ring = []
        for x, y in common.rrect(W, D, 0.004, na=4, nx=16, ny=12):
            if abs(x) > W - 0.0045:                       # side gusset: a V crease folding in towards the top
                x -= math.copysign(G * t ** 1.5 * max(0.0, 1 - abs(y) / D), x)
            else:                                          # front and back bow out a little at mid height
                y *= 1 + 0.035 * math.sin(math.pi * t) * (1 - (x / W) ** 2)
            ring.append((x, y, H * t))
        rings.append(ring)
    bag = common.loft('bag', rings, wall)
    me = bag.data
    top = max(me.polygons, key=lambda p: p.center.z if len(p.vertices) > 4 else -1)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[top.index]], context='FACES_ONLY')
    bm.to_mesh(me)
    bm.free()
    sol = bag.modifiers.new('wall', 'SOLIDIFY')
    sol.thickness, sol.offset = 0.0014, -1
    common.apply_mods(bag)
    handles = []
    for side in (-1, 1):                                    # an arch from inside one wall, up over the rim
        y = side * (D - 0.005)
        pts = [(0.045 * math.cos(a), y, H - 0.045 + 0.13 * math.sin(a) ** 0.8)
               for a in np.linspace(0, math.pi, 41)]
        handles.append(common.tube(f'cord{side}', pts, 0.0028, cord, sides=10, folds=(0.18, 3, side), uv_tile=0.08))
    for o in [bag] + handles:
        common.smooth(o, 35)
    common.uv_smart([bag] + handles, 'UVMap', tile=0.08)
    return [bag] + handles


# ------------------------------------------------------------ what each photo shows
def dup(name, x, y, rz):
    o = OBS[name].copy()
    bpy.context.scene.collection.objects.link(o)
    o.location, o.rotation_euler = (x, y, 0), (0, 0, math.radians(rz))
    return o


def place(name, x=0.0, y=0.0, rz=0.0):
    o = OBS[name]
    o.location, o.rotation_euler = (x, y, 0), (0, 0, math.radians(rz))
    return o


# id: (objects, camera azimuth from the front towards +X, elevation, share of the frame the product fills)
SHOTS = {
    'meal-box': (lambda: [place('box', rz=-8)], 32, 30, 0.80),
    'bowl': (lambda: [place('bowl')], 30, 34, 0.80),
    'cup': (lambda: [place('cup', rz=-20)], 30, 18, 0.74),
    'bag': (carry_bag, 32, 16, 0.76),
    'cutlery': (lambda: [place('fork', -0.006, 0.021, 4), place('spoon', 0.006, -0.021, -4)], 20, 48, 0.82),
    'chopsticks': (lambda: [place('chopsticks', rz=0)], 30, 40, 0.86),
    'drinking-straw': (lambda: [place('drinking_straw', 0.0, 0.0, 0),
                                dup('drinking_straw', 0.012, 0.012, 5), dup('drinking_straw', -0.01, -0.012, -4)],
                       30, 40, 0.86),
}


# ------------------------------------------------------------ studio
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 128
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = RENDER
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Standard'
scene.view_settings.exposure = 0.0

scene.world = bpy.data.worlds.new('studio')
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = common.srgb(*PLATE_IN)
bg.inputs['Strength'].default_value = 0.7

bpy.ops.mesh.primitive_plane_add(size=40)
floor = bpy.context.active_object
floor.is_shadow_catcher = True

bpy.ops.object.camera_add()
cam = bpy.context.active_object
cam.data.lens, cam.data.sensor_width = 70, 36
scene.camera = cam


def light(name, size, watts, colour):
    bpy.ops.object.light_add(type='AREA')
    L = bpy.context.active_object
    L.name = name
    L.data.shape, L.data.size, L.data.energy, L.data.color = 'DISK', size, watts, colour
    return L


KEY = light('key', 3.0, 260, (1.0, 0.96, 0.9))     # big and soft, up and to the left of the camera
RIM = light('rim', 2.0, 110, (1.0, 0.93, 0.84))    # behind and to the right: lifts the far edges off the plate


def aim(obj, at, direction, dist):
    obj.location = at + direction * dist
    obj.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()


def unit(az, el):
    az, el = math.radians(az), math.radians(el)
    return Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))


def fit(points, az, el, fill):
    """Point the camera from (az, el) and move it until the points' projection is centred and fills `fill` of it."""
    d, at = 4.0, sum(points, Vector()) / len(points)
    half = cam.data.sensor_width / 2 / cam.data.lens
    for _ in range(6):
        aim(cam, at, unit(az, el), d)
        inv = (Matrix.Translation(cam.location) @ cam.rotation_euler.to_matrix().to_4x4()).inverted()
        q = np.array([tuple(inv @ p) for p in points])
        u, v = q[:, 0] / -q[:, 2], q[:, 1] / -q[:, 2]
        rot = cam.rotation_euler.to_matrix()
        at = at + (rot @ Vector((1, 0, 0))) * (u.max() + u.min()) / 2 * d + (rot @ Vector((0, 1, 0))) * (v.max() + v.min()) / 2 * d
        d *= max(u.max() - u.min(), v.max() - v.min()) / 2 / (half * fill)


def to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.clip(c, 0, None) ** (1 / 2.4) - 0.055)


def plate(n):
    """The cream plate in linear light: lighter just above the centre, warmer and a little darker to the corners."""
    y, x = np.mgrid[0:n, 0:n] / (n - 1)          # Blender images run bottom-up
    r = np.clip(np.hypot(x - 0.5, (y - 0.56) * 1.1) / 0.72, 0, 1) ** 1.6
    a, b = to_lin(np.array(PLATE_IN) / 255), to_lin(np.array(PLATE_OUT) / 255)
    return a * (1 - r[..., None]) + b * r[..., None]


def save_webp(png, path):
    img = bpy.data.images.load(png)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    a = px[..., 3:4]
    rgb = to_srgb(to_lin(px[..., :3]) * a + plate(w) * (1 - a))   # straight alpha; the catcher's shadow is black
    out = bpy.data.images.new('photo', w, h, alpha=False)
    out.pixels.foreach_set(np.concatenate([rgb, np.ones_like(a)], axis=2).astype(np.float32).ravel())
    out.scale(SIZE, SIZE)
    out.file_format = 'WEBP'
    out.filepath_raw = path
    for q in (82, 76, 70, 64):
        out.save(filepath=path, quality=q)
        if os.path.getsize(path) <= MAX_BYTES:
            break
    assert os.path.getsize(path) <= MAX_BYTES, f'{path} is over {MAX_BYTES} bytes'
    bpy.data.images.remove(img)
    bpy.data.images.remove(out)


os.makedirs(OUT, exist_ok=True)
tmp = tempfile.mkdtemp(prefix='sc-photos-')
for o in OBS.values():
    o.hide_render = True
for pid, (make, az, el, fill) in SHOTS.items():
    if ONLY and pid not in ONLY:
        continue
    objs = make()
    rig = bpy.data.objects.new(f'rig-{pid}', None)
    scene.collection.objects.link(rig)
    for o in objs:
        o.parent, o.hide_render = rig, False
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    lo = Vector(np.min(pts, axis=0)); hi = Vector(np.max(pts, axis=0))
    R = (hi - lo).length / 2
    rig.matrix_world = Matrix.Scale(1 / R, 4) @ Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    bpy.context.view_layer.update()
    fit([o.matrix_world @ v.co for o in objs for v in o.data.vertices], az, el, fill)
    centre = Vector((0, 0, (hi.z - lo.z) / 2 / R))
    aim(KEY, centre, unit(az - 65, 48), 5.0)
    aim(RIM, centre, unit(az + 150, 30), 5.0)
    png = os.path.join(tmp, pid + '.png')
    scene.render.filepath = png
    bpy.ops.render.render(write_still=True)
    path = os.path.join(OUT, pid + '.webp')
    save_webp(png, path)
    print(f'photo: {path} {os.path.getsize(path) / 1024:.1f} KB')
    for o in objs:
        o.hide_render = True
