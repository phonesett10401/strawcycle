"""Shared helpers for the film's Blender models. Run through hut.py etc., never on its own.

Geometry is built in Blender coordinates (Z up, front = -Y); the glTF exporter turns that into y up, front = +Z.
"""
import json
import math
import os
import struct

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector


def oklch(L, C, h):
    """CSS oklch(L% C h) to linear sRGB, which is what Blender and glTF colour factors expect."""
    L /= 100
    a = C * math.cos(math.radians(h))
    b = C * math.sin(math.radians(h))
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    rgb = (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
           -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
           -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    return tuple(min(1.0, max(0.0, c)) for c in rgb) + (1.0,)


assert all(abs(c - 1) < 1e-3 for c in oklch(100, 0, 0))


def srgb(r, g, b):
    """0-255 sRGB to a linear colour factor."""
    f = lambda c: (c / 255 / 12.92) if c / 255 <= 0.04045 else ((c / 255 + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), 1.0)


# The styles.css tokens the models use (keep in step with :root there).
PALETTE = {
    'field': oklch(86, 0.11, 88),          # --color-field, straw gold
    'field_muted': oklch(36, 0.05, 75),    # --color-field-muted: bamboo
    'dusk_field': oklch(29, 0.045, 70),    # --dusk-field: posts and beams
    'ink': oklch(25, 0.05, 262),           # --color-ink
    'accent': oklch(56, 0.17, 42),         # --color-accent, ember orange
    'paper': oklch(96.5, 0.006, 250),      # --color-paper, smoke-grey sky
}


# ---------------------------------------------------------------- materials

def material(name, colour):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True  # closed meshes: export single-sided
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = colour
    bsdf.inputs['Roughness'].default_value = 1.0
    bsdf.inputs['Metallic'].default_value = 0.0
    return mat


def pbr(name, colour=(1, 1, 1, 1), albedo=None, normal=None, strength=1.0, rough=0.8, metal=0.0,
        emission=None, alpha=None):
    """A glTF-friendly Principled material: colour (x albedo texture), tangent normal map, emission, blended alpha."""
    mat = material(name, colour)
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if albedo or normal:
        uv = nt.nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'UVMap'
    if albedo:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = albedo
        nt.links.new(uv.outputs['UV'], tex.inputs['Vector'])
        if tuple(colour[:3]) != (1, 1, 1):  # exported as baseColorFactor x texture
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            nt.links.new(tex.outputs['Color'], mix.inputs[6])
            mix.inputs[7].default_value = colour
            nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
        else:
            nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if normal:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = normal
        nt.links.new(uv.outputs['UV'], tex.inputs['Vector'])
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.uv_map = 'UVMap'
        nm.inputs['Strength'].default_value = strength
        nt.links.new(tex.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if emission:
        bsdf.inputs['Emission Color'].default_value = tuple(emission[:3]) + (1.0,)
        bsdf.inputs['Emission Strength'].default_value = emission[3] if len(emission) > 3 else 1.0
    if alpha is not None:
        bsdf.inputs['Alpha'].default_value = alpha
        mat.surface_render_method = 'BLENDED'
    return mat


# ---------------------------------------------------------------- textures (numpy, tileable by construction)

def _gauss(a, sx, sy=None):
    """Periodic gaussian blur via FFT (so every texture tiles without seams)."""
    sy = sx if sy is None else sy
    h, w = a.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    k = np.exp(-2 * np.pi ** 2 * ((fx * sx) ** 2 + (fy * sy) ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * k))


def noise(size, sx, sy=None, seed=0):
    """Tileable smooth noise, zero mean, unit std; sx, sy are the blur in pixels along u and v."""
    a = _gauss(np.random.default_rng(seed).standard_normal((size, size)), sx, sy)
    return (a - a.mean()) / a.std()


def strokes(size, n, length, seed, angle=None, spread=math.pi, bend=0.0, width=0.7, values=None):
    """Tileable fibre strokes splatted into a size x size map: returns (coverage, mean value under the strokes).

    length is a (min, max) in pixels, angle the mean direction in radians (None: any), bend the curl along a stroke,
    values a per-stroke value array (e.g. brightness) averaged where strokes overlap.
    """
    rng = np.random.default_rng(seed)
    L = rng.uniform(*length, n)
    th = rng.uniform(0, math.pi, n) if angle is None else angle + rng.uniform(-spread, spread, n)
    M = int(length[1] * 2) + 2
    t = np.linspace(-0.5, 0.5, M)[None, :]
    a = th[:, None] + bend * rng.standard_normal(n)[:, None] * t
    ds = (L / (M - 1))[:, None]
    x = np.cumsum(np.cos(a) * ds, 1)
    y = np.cumsum(np.sin(a) * ds, 1)
    x += rng.uniform(0, size, n)[:, None] - x.mean(1, keepdims=True)
    y += rng.uniform(0, size, n)[:, None] - y.mean(1, keepdims=True)
    ix = np.mod(np.round(x).astype(np.int64), size).ravel()
    iy = np.mod(np.round(y).astype(np.int64), size).ravel()
    cov = np.zeros((size, size))
    np.add.at(cov, (iy, ix), 0.5)
    val = None
    if values is not None:
        acc = np.zeros((size, size))
        np.add.at(acc, (iy, ix), 0.5 * np.repeat(values, M))
        val = _gauss(acc, width) / np.maximum(_gauss(cov, width), 1e-4)
    return _gauss(cov, width), val


def normal_map(h, strength):
    """Tangent-space normal map (OpenGL / glTF convention, rows run up v) from a height map in pixels."""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    n = np.stack([-dx, -dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def image(name, rgb, data=False):
    """A packed Blender image from an (h, w, 3) array in 0..1 (sRGB-encoded for colour, raw for data)."""
    h, w = rgb.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    if data:
        img.colorspace_settings.name = 'Non-Color'
    px = np.ones((h, w, 4), np.float32)
    px[..., :3] = np.clip(rgb, 0, 1)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def fibre_textures(size=1024, seed=1):
    """Moulded pressed-straw pulp: near-white albedo with brown and pale flecks (tint it per material) and its normal map."""
    fine, _ = strokes(size, int(size * size * 0.055), (4, 22), seed, bend=0.6, width=0.6)
    fine /= np.percentile(fine, 99.5)
    dark, _ = strokes(size, int(size * size * 0.0022), (6, 28), seed + 1, bend=1.0, width=0.7)
    pale, _ = strokes(size, int(size * size * 0.003), (5, 20), seed + 2, bend=0.8, width=0.6)
    dark = np.clip(dark / np.percentile(dark, 99.7), 0, 1)
    pale = np.clip(pale / np.percentile(pale, 99.7), 0, 1)
    mottle = noise(size, 26, seed=seed + 3)
    grain = noise(size, 5, seed=seed + 4)
    pores = noise(size, 1.2, seed=seed + 5)
    v = 0.9 + 0.03 * mottle + 0.018 * grain - 0.05 * np.clip(fine, 0, 1)
    rgb = np.repeat(v[..., None], 3, -1)
    fleck = np.array([0.52, 0.38, 0.24])
    rgb = rgb * (1 - 0.75 * dark[..., None]) + fleck * 0.75 * dark[..., None]
    rgb = rgb * (1 - 0.35 * pale[..., None]) + 1.0 * 0.35 * pale[..., None]
    height = _gauss(np.clip(fine, 0, 1.4) + 0.4 * dark, 0.5) + 0.06 * pores
    return image('pulp_albedo', rgb), image('pulp_normal', normal_map(height, 0.9), data=True)


def teak_textures(size=1024, seed=3, planks=8):
    """Dark teak: glued boards along v with ring figure and pores; albedo and normal map."""
    rng = np.random.default_rng(seed)
    u = (np.arange(size) + 0.5) / size
    U = np.broadcast_to(u[None, :], (size, size))
    pid = np.floor(U * planks).astype(int)
    tone = rng.uniform(0.88, 1.1, planks)[pid]
    freq = rng.integers(5, 12, planks)[pid]
    phase = rng.uniform(0, 1, planks)[pid]
    warp = noise(size, 14, 160, seed) * 0.55 + noise(size, 40, 400, seed + 1) * 0.9
    ring = 0.5 + 0.5 * np.sin(2 * np.pi * ((U * planks) % 1 * freq * 0.35 + warp + phase))
    ring = ring ** 6
    pores = noise(size, 0.8, 22, seed + 2)
    streak = noise(size, 3, 90, seed + 3)
    light, dark = np.array([0.48, 0.3, 0.17]), np.array([0.2, 0.115, 0.065])
    fine = 0.5 + 0.5 * np.sin(2 * np.pi * ((U * planks) % 1 * freq * 1.7 + warp * 1.3 + 0.37 * phase))
    k = np.clip(0.3 + 0.28 * ring + 0.12 * fine ** 4 + 0.22 * np.clip(pores, 0, 3) + 0.1 * streak, 0, 1)
    rgb = (light * (1 - k[..., None]) + dark * k[..., None]) * tone[..., None]
    joint = (np.abs(((U * planks) + 0.5) % 1 - 0.5) * size / planks < 0.7).astype(float)
    rgb *= (1 - 0.35 * joint)[..., None]
    height = -1.0 * ring - 0.4 * fine ** 4 - 0.9 * np.clip(pores, 0, 3) - 2.0 * joint + 0.3 * streak
    return image('teak_albedo', rgb), image('teak_normal', normal_map(height, 0.9), data=True)


def thatch_textures(size=512, seed=5):
    """Weathered rice-straw thatch: strands along v, dark gaps between them; albedo and normal map."""
    rng = np.random.default_rng(seed)
    n = int(size * size * 0.014)
    bright = rng.uniform(0.55, 1.25, n)
    cov, val = strokes(size, n, (60, 220), seed, angle=math.pi / 2, spread=0.07, bend=0.12, width=0.9, values=bright)
    cov /= np.percentile(cov, 98)
    gaps = np.clip(cov, 0, 1)
    straw = np.array([0.50, 0.42, 0.29])
    grey = np.array([0.40, 0.385, 0.35])
    weather = np.clip(0.5 + 0.35 * noise(size, 30, 60, seed + 1), 0, 1)
    base = straw * (1 - 0.55 * weather[..., None]) + grey * 0.55 * weather[..., None]
    rgb = base * np.clip(val, 0.4, 1.4)[..., None] * (0.35 + 0.65 * gaps[..., None])
    height = 2.2 * np.clip(cov, 0, 1.3)
    return image('thatch_albedo', rgb), image('thatch_normal', normal_map(height, 1.6), data=True)


# ---------------------------------------------------------------- geometry

def fillet(pts, r, n=4, closed=False):
    """Round each corner of a 2D or 3D polyline with an n-segment arc of radius r (scalar or per point; 0 keeps it)."""
    dim = len(pts[0])
    P = [Vector(p).to_3d() if dim == 2 else Vector(p) for p in pts]
    rs = list(r) if isinstance(r, (list, tuple)) else [r] * len(P)
    out = []
    N = len(P)
    for i, p in enumerate(P):
        if (not closed and i in (0, N - 1)) or rs[i] <= 0:
            out.append(p)
            continue
        d1, d2 = P[i - 1] - p, P[(i + 1) % N] - p
        l1, l2 = d1.length, d2.length
        if l1 < 1e-9 or l2 < 1e-9:
            out.append(p)
            continue
        d1.normalize()
        d2.normalize()
        ang = math.acos(max(-1.0, min(1.0, d1.dot(d2))))
        if ang > math.pi - 1e-3 or ang < 1e-3:
            out.append(p)
            continue
        t = min(rs[i] / math.tan(ang / 2), 0.45 * l1, 0.45 * l2)
        rr = t * math.tan(ang / 2)
        c = p + (d1 + d2).normalized() * (rr / math.sin(ang / 2))
        u, w = (p + d1 * t - c).normalized(), (p + d2 * t - c).normalized()
        for k in range(n + 1):
            out.append(c + u.slerp(w, k / n) * rr)
    return [tuple(v[:dim]) for v in out]


def rrect(hx, hy, r, na=8, nx=8, ny=6):
    """A rounded rectangle as a closed CCW loop starting at the +Y middle, with a fixed point count for lofting."""
    r = max(1e-4, min(r, hx * 0.98, hy * 0.98))
    sx, sy = hx - r, hy - r
    pts = []

    def seg(a, b, n):
        for k in range(n):
            pts.append((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))

    def arc(cx, cy, a0):
        for k in range(na):
            a = math.radians(a0 + 90 * k / na)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    seg((0, hy), (-sx, hy), nx // 2)
    arc(-sx, sy, 90)
    seg((-hx, sy), (-hx, -sy), ny)
    arc(-sx, -sy, 180)
    seg((-sx, -hy), (sx, -hy), nx)
    arc(sx, -sy, 270)
    seg((hx, -sy), (hx, sy), ny)
    arc(sx, sy, 0)
    seg((sx, hy), (0, hy), nx // 2)
    return pts


def build(name, verts, faces, mat=None, uvs=None):
    """A mesh object from vertices and faces (normals made consistent); uvs: per-face lists of (u, v) per corner."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    lay = bm.loops.layers.uv.new('UVMap')
    if uvs:
        for f, fuv in zip(bm.faces, uvs):
            for loop, uv in zip(f.loops, fuv):
                loop[lay].uv = uv
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    if mat:
        me.materials.append(mat)
    return obj


def loft(name, rings, mat=None, caps='ngon', cyclic=False, u=None, v=None):
    """Skin closed rings of equal point count into quads. caps: 'ngon', 'pole' or None; cyclic joins last to first.

    u (len n+1) and v (len rings, +1 if cyclic) give UVs per ring column and row.
    """
    n, R = len(rings[0]), len(rings)
    verts = [Vector(p) for ring in rings for p in ring]
    faces, uvs = [], []
    for i in range(R - 1 + (1 if cyclic else 0)):
        a, b = i * n, ((i + 1) % R) * n
        for j in range(n):
            k = (j + 1) % n
            faces.append((a + j, a + k, b + k, b + j))
            if u is not None:
                uvs.append([(u[j], v[i]), (u[j + 1], v[i]), (u[j + 1], v[i + 1]), (u[j], v[i + 1])])
    if not cyclic and caps:
        for ri in (0, R - 1):
            ring = list(range(ri * n, ri * n + n))
            if caps == 'pole':
                c = sum((verts[i] for i in ring), Vector()) / n
                verts.append(c)
                for j in range(n):
                    faces.append((ring[j], ring[(j + 1) % n], len(verts) - 1))
                    if u is not None:
                        uvs.append([(0, 0)] * 3)
            else:
                faces.append(tuple(ring))
                if u is not None:
                    uvs.append([(0, 0)] * n)
    return build(name, verts, faces, mat, uvs if u is not None else None)


def lathe(name, prof, segs=64, mat=None, closed=False):
    """Revolve a (r, z) profile about Z; points on the axis become single poles. closed joins the last point to the first."""
    clean = [prof[0]]
    for p in prof[1:]:
        if abs(p[0] - clean[-1][0]) + abs(p[1] - clean[-1][1]) > 1e-7:
            clean.append(p)
    verts, faces, idx = [], [], []
    for r, z in clean:
        if r < 1e-6:
            idx.append([len(verts)])
            verts.append((0, 0, z))
        else:
            idx.append(list(range(len(verts), len(verts) + segs)))
            verts += [(r * math.cos(2 * math.pi * s / segs), r * math.sin(2 * math.pi * s / segs), z) for s in range(segs)]
    pairs = list(zip(idx, idx[1:])) + ([(idx[-1], idx[0])] if closed else [])
    for A, B in pairs:
        if len(A) == 1 and len(B) == 1:
            continue
        for s in range(segs):
            t = (s + 1) % segs
            if len(A) == 1:
                faces.append((A[0], B[s], B[t]))
            elif len(B) == 1:
                faces.append((A[s], A[t], B[0]))
            else:
                faces.append((A[s], A[t], B[t], B[s]))
    return build(name, verts, faces, mat)


def sweep(name, stations, n=24, mat=None):
    """Loft superellipse cross-sections along X (cutlery, chopsticks, table feet), pole-capped at both ends.

    Each station is (x, hw_neg, hw_pos, ht, zc, bowl, p): half widths to -Y and +Y, half thickness, centre height,
    a dish depth that lowers the middle of the section (spoon bowls), and the superellipse exponent (2 round, 8 square).
    """
    rings = []
    for x, hwn, hwp, ht, zc, bowl, p in stations:
        hw, mid = (hwn + hwp) / 2, (hwp - hwn) / 2
        ring = []
        for k in range(n):
            a = 2 * math.pi * k / n
            c, s = math.cos(a), math.sin(a)
            y = (hwp if c >= 0 else hwn) * math.copysign(abs(c) ** (2 / p), c)
            z = ht * math.copysign(abs(s) ** (2 / p), s)
            q = (y - mid) / hw if hw > 0 else 0
            ring.append((x, y, z + zc - bowl * (1 - q * q)))
        rings.append(ring)
    return loft(name, rings, mat, caps='pole')


def tube(name, pts, r, mat=None, sides=12, cyclic=False, caps=True, squash=1.0):
    """A tube along a 3D polyline (parallel-transport frames); r is a radius or one per point; squash flattens it."""
    P = [Vector(p) for p in pts]
    N = len(P)
    rs = list(r) if isinstance(r, (list, tuple)) else [r] * N
    tang = []
    for i in range(N):
        a = P[i] - P[i - 1] if (i > 0 or cyclic) else P[1] - P[0]
        b = P[(i + 1) % N] - P[i] if (i < N - 1 or cyclic) else P[-1] - P[-2]
        tang.append((a.normalized() + b.normalized()).normalized())
    ref = Vector((0, 0, 1)) if abs(tang[0].z) < 0.9 else Vector((1, 0, 0))
    nrm = tang[0].cross(ref).normalized()
    rings = []
    for i in range(N):
        if i:
            nrm = tang[i - 1].rotation_difference(tang[i]) @ nrm
            nrm = (nrm - tang[i] * nrm.dot(tang[i])).normalized()
        bi = tang[i].cross(nrm)
        rings.append([P[i] + (nrm * math.cos(2 * math.pi * k / sides) * squash + bi * math.sin(2 * math.pi * k / sides)) * rs[i]
                      for k in range(sides)])
    return loft(name, rings, mat, caps=('pole' if caps else None), cyclic=cyclic)


def join(objs, name):
    """Join objs into one object called name, with its origin at the world origin."""
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = o.data.name = name
    o.data.transform(o.matrix_world)
    o.matrix_world.identity()
    return o


def apply_mods(obj):
    """Bake obj's modifier stack into its mesh."""
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    obj.modifiers.clear()
    obj.data = me
    return obj


def boolean(obj, cutter, op='DIFFERENCE'):
    if obj.data.materials and not cutter.data.materials:  # cut faces take the object's material, not an empty slot
        cutter.data.materials.append(obj.data.materials[0])
    m = obj.modifiers.new('bool', 'BOOLEAN')
    m.operation = op
    m.solver = 'EXACT'
    m.object = cutter
    apply_mods(obj)
    bpy.data.objects.remove(cutter)
    return obj


def bevel_mod(obj, width, segments=2, angle=30):
    """Round only the edges sharper than angle (after booleans), then bake it in."""
    m = obj.modifiers.new('bevel', 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(angle)
    apply_mods(obj)
    return obj


def bevel(obj, w):
    """Bevel every edge of obj's mesh by w metres, one segment (catches light on low-poly edges)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=w, segments=1, affect='EDGES', clamp_overlap=True)
    bm.to_mesh(obj.data)
    bm.free()


def smooth(obj, angle=40, weighted=True):
    """Smooth shading, hard only above angle; weighted normals keep big flat faces flat next to small fillets."""
    obj.data.shade_smooth()
    obj.data.set_sharp_from_angle(angle=math.radians(angle))
    if weighted:
        m = obj.modifiers.new('wn', 'WEIGHTED_NORMAL')
        m.keep_sharp = True
        m.mode = 'FACE_AREA'
    return obj


# ---------------------------------------------------------------- UVs

def uv_layer(obj, name):
    return obj.data.uv_layers.get(name) or obj.data.uv_layers.new(name=name)


def uv_map(obj, fn, name='UVMap'):
    """Set UVs per face corner from fn(co, face) in object space."""
    me = obj.data
    lay = uv_layer(obj, name)
    for poly in me.polygons:
        uvs = fn([me.vertices[me.loops[li].vertex_index].co for li in poly.loop_indices], poly)
        for li, uv in zip(poly.loop_indices, uvs):
            lay.data[li].uv = uv


def uv_planar(tile):
    """Top-down projection (table tops: the grain carries over the rounded edge with no seam)."""
    return lambda cos, poly: [(c.x / tile, c.y / tile) for c in cos]


def uv_along_x(tile):
    """Box projection with X on v (grain along the length of a slat, foot or rail)."""
    def fn(cos, poly):
        n = poly.normal
        return [((c.y if abs(n.z) >= abs(n.y) else c.z) / tile, c.x / tile) for c in cos]
    return fn


def uv_cylinder(tile, r0):
    """Cylindrical about Z (turned parts, grain along Z); faces looking up or down project flat."""
    def fn(cos, poly):
        if abs(poly.normal.z) > 0.8:
            return [(c.x / tile, c.y / tile) for c in cos]
        th = [math.atan2(c.y, c.x) for c in cos]
        if max(th) - min(th) > math.pi:
            th = [t + 2 * math.pi if t < 0 else t for t in th]
        return [(t * r0 / tile, c.z / tile) for t, c in zip(th, cos)]
    return fn


def _uv_rescale(o, name, tile):
    me = o.data
    lay = me.uv_layers[name]
    a3 = a2 = 0.0
    for p in me.polygons:
        a3 += p.area
        uv = [lay.data[i].uv for i in p.loop_indices]
        a2 += abs(sum(uv[i].x * uv[i - 1].y - uv[i - 1].x * uv[i].y for i in range(len(uv)))) / 2
    k = math.sqrt(a3 / max(a2, 1e-12)) / tile
    for d in lay.data:
        d.uv = d.uv * k


def uv_smart(objs, name='UVMap', tile=None, margin=0.004):
    """Smart-UV-project objs together into one UV map; with tile, scale each so one UV unit spans tile metres."""
    for o in objs:
        o.data.uv_layers.active = uv_layer(o, name)
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')
    if tile:
        for o in objs:
            _uv_rescale(o, name, tile)


# ---------------------------------------------------------------- AO, export, budgets

def _gltf_output(tree):
    """The node group the glTF exporter reads for occlusion."""
    group = bpy.data.node_groups.get('glTF Material Output')
    if group is None:
        group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        group.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    node = tree.nodes.new('ShaderNodeGroup')
    node.node_tree = group
    return node


def bake_ao(objs, size=512, ground=True, distance=0.8, samples=128, margin=0.004, name=None, ground_z=0.0):
    """Bake ambient occlusion for objs into one shared atlas on a second UV map 'AO' (glTF TEXCOORD_1), wired to every
    material as glTF occlusion. UV map 'UVMap' (texture detail) is kept; objects without one get a smart projection."""
    objs = list(objs) if isinstance(objs, (list, tuple)) else [objs]
    scene = bpy.context.scene
    for o in objs:
        if not o.data.uv_layers:
            uv_smart([o], 'UVMap', tile=1.0)
    uv_smart(objs, 'AO', margin=margin)

    floor = None
    if ground:  # temporary ground so undersides darken where they meet the earth
        bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, ground_z))
        floor = bpy.context.active_object

    img = bpy.data.images.new((name or objs[0].name) + '_ao', size, size)
    mats = []
    for o in objs:
        for m in o.data.materials:
            if m and m not in mats:
                mats.append(m)
    for mat in mats:
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        uv = nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'AO'
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = img
        links.new(uv.outputs['UV'], tex.inputs['Vector'])
        nodes.active = tex
        sep = nodes.new('ShaderNodeSeparateColor')
        links.new(tex.outputs['Color'], sep.inputs['Color'])
        links.new(sep.outputs['Red'], _gltf_output(mat.node_tree).inputs['Occlusion'])

    for o in scene.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = objs[0]
    if scene.world is None:
        scene.world = bpy.data.worlds.new('World')
    scene.world.light_settings.distance = distance
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    bpy.ops.object.bake(type='AO', margin=4, uv_layer='AO')
    px = np.array(img.pixels[:], np.float32).reshape(size, size, 4)  # a light blur takes out the bake noise (it also
    px[..., :3] = _gauss(px[..., 0], 0.9)[..., None]                  # shrinks the WebP); the 4 px margin absorbs it
    img.pixels.foreach_set(px.ravel())
    img.pack()
    if floor:
        bpy.data.objects.remove(floor)
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers['UVMap']
    return img


def export_glb(objs, path, quality=75):
    """Export objs as a Draco-compressed (level 6) GLB with WebP textures; returns the file size in bytes."""
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_image_format='WEBP', export_image_quality=quality, export_cameras=False, export_lights=False)
    return os.path.getsize(path)


def triangles(objs):
    deps = bpy.context.evaluated_depsgraph_get()
    n = 0
    for o in objs:
        mesh = o.evaluated_get(deps).to_mesh()
        mesh.calc_loop_triangles()
        n += len(mesh.loop_triangles)
        o.evaluated_get(deps).to_mesh_clear()
    return n


def glb_triangles(path):
    """Triangles a GLB draws (each mesh counted once per node that uses it), read from its JSON chunk."""
    with open(path, 'rb') as f:
        f.read(12)
        n, _ = struct.unpack('<II', f.read(8))
        doc = json.loads(f.read(n))
    acc = doc['accessors']
    return sum(acc[p['indices']]['count'] // 3
               for node in doc.get('nodes', []) if 'mesh' in node for p in doc['meshes'][node['mesh']]['primitives'])


MAX_TOTAL_BYTES, MAX_TOTAL_TRIS = int(1.5 * 1024 * 1024), 150_000


def check_budget(models_dir):
    """All models/*.glb together: at most 1.5 MB and 150k triangles."""
    files = sorted(f for f in os.listdir(models_dir) if f.endswith('.glb'))
    size = sum(os.path.getsize(os.path.join(models_dir, f)) for f in files)
    tris = sum(glb_triangles(os.path.join(models_dir, f)) for f in files)
    print(f'models total: {len(files)} files, {size / 1024:.1f} KB, {tris} triangles')
    assert size <= MAX_TOTAL_BYTES, f'models total {size} bytes, over {MAX_TOTAL_BYTES}'
    assert tris <= MAX_TOTAL_TRIS, f'models total {tris} triangles, over {MAX_TOTAL_TRIS}'


# ---------------------------------------------------------------- previews

def _show_ao(mat):
    """Cycles ignores glTF occlusion, so multiply it into the base colour for the preview."""
    tree = mat.node_tree
    if tree is None or 'Principled BSDF' not in tree.nodes:
        return
    for node in tree.nodes:
        sock = node.inputs.get('Occlusion') if node.type == 'GROUP' else None
        if sock is None or not sock.is_linked:
            continue
        src = sock.links[0].from_node
        while src.type != 'TEX_IMAGE' and src.inputs and src.inputs[0].is_linked:
            src = src.inputs[0].links[0].from_node
        base = tree.nodes['Principled BSDF'].inputs['Base Color']
        mix = tree.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        if base.is_linked:
            tree.links.new(base.links[0].from_socket, mix.inputs[6])
        else:
            mix.inputs[6].default_value = base.default_value
        tree.links.new(src.outputs['Color'], mix.inputs[7])
        tree.links.new(mix.outputs[2], base)


def render_previews(glb, shots, look='sunset', arrange=None, ground=(0.05, 0.04, 0.03, 1), ground_z=0.0,
                    lights=(), exposure=0.0, samples=64):
    """Re-import the exported GLB into an empty scene (so the previews show what the film gets) and render each shot.

    shots: (png, camera location, target, lens mm[, (w, h)]). look 'sunset': a low warm sun with a cool sky fill;
    'night': a dark blue sky and the given point lights (location, colour, watts, radius); 'backlit': a warm orange
    background behind the subject. arrange(objects by name) may move things for the shot.
    """
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    scene = bpy.context.scene
    assert any(o.type == 'MESH' for o in scene.objects), 're-imported GLB has no mesh'
    for mat in bpy.data.materials:
        _show_ao(mat)
    if arrange:
        arrange({o.name: o for o in scene.objects})

    if ground:
        bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, ground_z))
        g = pbr('preview_ground', ground, rough=0.85)
        g.use_backface_culling = False
        bpy.context.active_object.data.materials.append(g)

    scene.world = bpy.data.worlds.new('sky')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes['Background']
    if look == 'sunset':
        bpy.ops.object.light_add(type='SUN', rotation=(math.radians(79), 0, math.radians(-48)))
        sun = bpy.context.active_object.data
        sun.energy = 5.0
        sun.color = (1.0, 0.52, 0.24)
        sun.angle = math.radians(2)
        bg.inputs['Color'].default_value = (0.13, 0.17, 0.32, 1)
        bg.inputs['Strength'].default_value = 0.9
    elif look == 'night':
        bg.inputs['Color'].default_value = (0.006, 0.009, 0.026, 1)
        bg.inputs['Strength'].default_value = 1.0
        bpy.ops.object.light_add(type='SUN', rotation=(math.radians(60), 0, math.radians(150)))
        moon = bpy.context.active_object.data
        moon.energy = 0.08
        moon.color = (0.42, 0.45, 0.78)
    elif look == 'backlit':  # orange behind the subject for the camera only; a dim warm rim lights it from behind
        nt = scene.world.node_tree
        bg.inputs['Color'].default_value = (0.02, 0.012, 0.01, 1)
        sky = nt.nodes.new('ShaderNodeBackground')
        sky.inputs['Color'].default_value = (1.0, 0.26, 0.04, 1)
        sky.inputs['Strength'].default_value = 0.9
        path, mix = nt.nodes.new('ShaderNodeLightPath'), nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(path.outputs['Is Camera Ray'], mix.inputs[0])
        nt.links.new(bg.outputs[0], mix.inputs[1])
        nt.links.new(sky.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], nt.nodes['World Output'].inputs['Surface'])
        bpy.ops.object.light_add(type='SUN', rotation=(math.radians(-80), 0, math.radians(20)))
        rim = bpy.context.active_object.data
        rim.energy = 3.0
        rim.color = (1.0, 0.45, 0.15)
    for loc, colour, watts, radius in lights:
        bpy.ops.object.light_add(type='POINT', location=loc)
        L = bpy.context.active_object.data
        L.energy = watts
        L.color = colour[:3]
        L.shadow_soft_size = radius

    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    aim = bpy.data.objects.new('aim', None)
    scene.collection.objects.link(aim)
    track = cam.constraints.new('TRACK_TO')
    track.target = aim
    scene.camera = cam
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.view_settings.exposure = exposure
    for shot in shots:
        png, loc, target, lens = shot[:4]
        w, h = shot[4] if len(shot) > 4 else (1280, 960)
        cam.location = loc
        aim.location = target
        cam.data.lens = lens
        cam.data.clip_start = 0.01
        scene.render.resolution_x, scene.render.resolution_y = w, h
        scene.render.filepath = png
        os.makedirs(os.path.dirname(png), exist_ok=True)
        bpy.ops.render.render(write_still=True)
        print('preview:', png)
