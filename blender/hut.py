"""The farmer's hut: a northern Thai field hut on bamboo stilts, with woven split-bamboo walls framed in bamboo
battens, a split-bamboo floor with a railing round the open front, and a steep hip-and-gable roof of coursed,
weathered cogon-grass thatch.

blender --background --factory-startup --python blender/hut.py -- [out.glb] [preview dir]

Authored in film coordinates (x right, y up, z toward the camera, metres) so the numbers match v1's hut in
film.js; P() maps them to Blender (z up, front = -Y), which the glTF exporter maps back. Origin = ground centre.
Same footprint and envelope as v1: posts at x +-1.05, z +-0.85, floor at y 1.0, walls to 1.84, back-wall window
round (0.2, 1.38, -0.76), eaves 3.3 x 2.7 at y 1.72, ridge at y 3.0 (running along x).
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
WOOD = common.pbr('wood', common.srgb(70, 54, 38), rough=0.85)                 # beams, plates, rafters
BAMBOO = common.pbr('bamboo', common.srgb(146, 146, 108), rough=0.6)           # pale green-grey poles with nodes
DECK = common.pbr('deck', common.srgb(152, 132, 92), rough=0.75)                # aged split-bamboo floor slats
WALL = common.pbr('fak', (1, 1, 1, 1), *common.weave_textures(256, 24, 'twill', (0.66, 0.53, 0.34)), strength=0.9, rough=0.9)
TH_ALB, TH_NRM = common.thatch_textures(512)
THATCH = common.pbr('thatch', (1, 1, 1, 1), TH_ALB, TH_NRM, strength=1.2, rough=0.95)
UNDER = common.pbr('thatch_under', common.srgb(150, 130, 100), TH_ALB, TH_NRM, strength=1.0, rough=1.0)   # the shaded underside
FRINGE = common.pbr('thatch_fringe', (1, 1, 1, 1), common.fringe_texture(), rough=0.95, tex_alpha='clip', double=True)
ROPE = common.pbr('lashing', common.srgb(96, 78, 52), rough=1.0)
STONE = common.pbr('stone', common.srgb(96, 92, 86), rough=0.9)
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
    parts.append(o)
    return o


def pole(a, b, r, mat, sides=None, nodes=True):
    """A bamboo pole from a to b with swollen nodes along it."""
    a, b = P(*a), P(*b)
    d = b - a
    L = d.length
    sides = sides or (10 if r > 0.04 else 7)
    gap = max(0.22, min(0.42, L / 3))
    prof = [(0, 0), (r * 0.9, 0), (r, 0.008)]
    t = gap * 0.6
    while nodes and t < L - 0.06:
        prof += [(r, t - 0.014), (r * 1.09, t - 0.004), (r * 1.09, t + 0.004), (r, t + 0.014)]
        t += gap
    prof += [(r, L - 0.008), (r * 0.9, L), (0, L)]
    o = common.lathe('pole', prof, sides, mat)
    o.data.transform(Matrix.Translation(a) @ Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4())
    parts.append(o)


def lash(at, axis, r):
    """A rattan lashing: a few turns round a pole at a joint (at, axis in film coordinates)."""
    o = common.lathe('lash', common.fillet([(r + 0.004, -0.03), (r + 0.011, -0.022), (r + 0.011, 0.022), (r + 0.004, 0.03)], 0.004, n=1)
                     + [(r - 0.002, 0.03), (r - 0.002, -0.03)], 7, ROPE, closed=True)
    o.data.transform(Matrix.Translation(P(*at)) @ Vector((0, 0, 1)).rotation_difference(P(*axis)).to_matrix().to_4x4())
    parts.append(o)


X, Z = 1.05, 0.85          # post grid (v1: stilts at x +-1, z +-0.8)
FLOOR, TOP = 1.0, 1.84     # floor surface and wall-top plate heights (v1: floor 0.95, walls to 1.8)

# stilts set on flat field stones half sunk in the ground; corners run up to the wall plate, the middle pair stops under the floor
for x in (-X, X):
    for z in (-Z, Z):
        pole((x, 0.0, z), (x, TOP + 0.04, z), 0.06, BAMBOO)
for z in (-Z, Z):
    pole((0, 0.0, z), (0, FLOOR - 0.04, z), 0.055, BAMBOO)
for x in (-X, 0, X):
    for z in (-Z, Z):
        lumps = [rng.uniform(0.75, 1.2) for _ in range(9)]
        st = common.lathe('stone', common.fillet([(0, 0.03), (0.1, 0.028), (0.16, 0.012), (0.17, -0.02), (0, -0.04)], [0, 0.03, 0.02, 0.01, 0], n=2), 9, STONE)
        for v in st.data.vertices:  # an irregular outline, not a turned pad
            a = math.atan2(v.co.y, v.co.x) % (2 * math.pi)
            i = int(a / (2 * math.pi) * 9) % 9
            f = lumps[i] + (lumps[(i + 1) % 9] - lumps[i]) * ((a / (2 * math.pi) * 9) % 1)
            v.co.x *= f
            v.co.y *= f
            v.co.z += 0.008 * math.sin(3 * a + x)
        st.data.transform(Matrix.Translation(P(x, 0.0, z)) @ Matrix.Diagonal((rng.uniform(1.0, 1.35), rng.uniform(0.8, 1.0), 1.0)).to_4x4()
                          @ Matrix.Rotation(rng.uniform(0, 3), 4, 'Z'))
        parts.append(st)

# floor of split-bamboo slats on joists, cross-bracing under it, lashed where braces cross posts
for i in range(30):
    x = -1.2 + 0.04 + i * (2.32 / 29) + rng.uniform(-0.006, 0.006)
    r = 0.017 + rng.uniform(-0.002, 0.002)
    slat = common.tube('slat', [P(x, FLOOR - r, z) for z in np.linspace(-1.0, 1.0, 5)],
                       [r * 0.9, r * 1.08, r, r * 1.08, r * 0.9], DECK, 6, squash=2.1, uv_tile=0.4)   # convex face up, node bumps
    parts.append(slat)
for z in (-Z, Z):
    box((2.4, 0.08, 0.08), (0, FLOOR - 0.075, z), WOOD)
for x in (-X, X):
    pole((x + math.copysign(0.065, -x), 0.12, -Z), (x + math.copysign(0.065, -x), FLOOR - 0.16, Z), 0.028, BAMBOO)   # on the post's inner face
    pole((x + math.copysign(0.065, -x), 0.12, Z), (x + math.copysign(0.065, -x), FLOOR - 0.16, -Z), 0.028, BAMBOO)
    for z, y in ((-Z, 0.14), (Z, 0.14), (-Z, FLOOR - 0.18), (Z, FLOOR - 0.18)):
        lash((x, y, z), (0, 1, 0), 0.06)
pole((-X, 0.12, -Z - 0.065), (X, FLOOR - 0.16, -Z - 0.065), 0.028, BAMBOO)
for x in (-X, X):
    for z in (-Z, Z):
        lash((x, FLOOR - 0.075, z), (0, 1, 0), 0.06)


# woven split-bamboo (fak) walls: gently bellied panels between bamboo batten trims; back wall (window where v1
# lights it at (0.2, 1.38, -0.76)) and both sides; the front is open
def panel(c0, c1, y0, y1, axis, at):
    """A woven panel on the plane axis = at ('z' back wall, 'x' side walls) from c0 to c1 along it and y0 to y1,
    two faces 3 cm apart, bellied up to 1 cm between its edges; trimmed with bamboo battens round the edge and
    across the middle, both faces."""
    nu, nv = max(3, int((c1 - c0) / 0.14)), max(3, int((y1 - y0) / 0.14))
    verts, faces, uvs = [], [], []
    for side in (-1, 1):
        base = len(verts)
        for j in range(nv + 1):
            for i in range(nu + 1):
                u, v = i / nu, j / nv
                bulge = 0.01 * math.sin(math.pi * u) * math.sin(math.pi * v) + 0.003 * math.sin(7 * u + 3 * v + at)
                c, y, n = c0 + (c1 - c0) * u, y0 + (y1 - y0) * v, at + side * (0.015 + bulge)
                verts.append(P(c, y, n) if axis == 'z' else P(n, y, c))
        for j in range(nv):
            for i in range(nu):
                a = base + j * (nu + 1) + i
                q = (a, a + 1, a + nu + 2, a + nu + 1)
                faces.append(q if side > 0 else q[::-1])
                uvs.append([((c0 + (c1 - c0) * ((k - base) % (nu + 1)) / nu) / 0.35, (y0 + (y1 - y0) * ((k - base) // (nu + 1)) / nv) / 0.35) for k in faces[-1]])
    parts.append(common.build('fak', verts, faces, WALL, uvs))
    for side in (-1, 1):
        off = at + side * 0.03
        q = (lambda c, y: (c, y, off)) if axis == 'z' else (lambda c, y: (off, y, c))
        for y in ((y0 + 0.03, y1 - 0.03, (y0 + y1) / 2) if side > 0 else ((y0 + y1) / 2,)):
            pole(q(c0, y), q(c1, y), 0.016, BAMBOO, 5, nodes=False)
        for c in ((c0 + 0.03, c1 - 0.03) if side > 0 else ()):
            pole(q(c, y0), q(c, y1), 0.016, BAMBOO, 5, nodes=False)


WX0, WX1, WY0, WY1 = -0.11, 0.51, 1.18, 1.58
panel(-X + 0.05, WX0, FLOOR, TOP, 'z', -Z)
panel(WX1, X - 0.05, FLOOR, TOP, 'z', -Z)
panel(WX0, WX1, FLOOR, WY0, 'z', -Z)
panel(WX0, WX1, WY1, TOP, 'z', -Z)
for y in (WY0, WY1):  # window frame
    pole((WX0 - 0.04, y, -Z + 0.05), (WX1 + 0.04, y, -Z + 0.05), 0.022, BAMBOO)
for x in (WX0, WX1):
    pole((x, WY0 - 0.04, -Z + 0.05), (x, WY1 + 0.04, -Z + 0.05), 0.022, BAMBOO)
for x in (-X, X):
    panel(-Z + 0.05, Z - 0.05, FLOOR, TOP, 'x', x)

# wall-top plates
for z in (-Z, Z):
    pole((-X - 0.1, TOP, z), (X + 0.1, TOP, z), 0.045, WOOD, nodes=False)
for x in (-X, X):
    pole((x, TOP, -Z - 0.1), (x, TOP, Z + 0.1), 0.045, WOOD, nodes=False)

# railing round the open front (a gap for the ladder): bamboo posts, top and middle rails, close balusters
RZ = Z + 0.09
for x0, x1 in ((-X, 0.38), (0.97, X)):
    for x in (x0, x1):
        pole((x, FLOOR - 0.02, RZ), (x, FLOOR + 0.62, RZ), 0.026, BAMBOO)
    pole((x0 - 0.04, FLOOR + 0.6, RZ), (x1 + 0.04, FLOOR + 0.6, RZ), 0.022, BAMBOO)
    pole((x0, FLOOR + 0.3, RZ), (x1, FLOOR + 0.3, RZ), 0.017, BAMBOO, 6)
    n = max(1, round((x1 - x0) / 0.13))
    for k in range(1, n):
        x = x0 + (x1 - x0) * k / n
        pole((x, FLOOR, RZ), (x, FLOOR + 0.6, RZ), 0.011, BAMBOO, 5, nodes=False)
    for x in (x0, x1):
        lash((x, FLOOR + 0.6, RZ), (0, 1, 0), 0.026)

# ladder up the right with lashed rungs
for x in (0.5, 0.85):
    pole((x, 0, Z + 0.6), (x, FLOOR + 0.12, Z + 0.1), 0.025, BAMBOO)
for t in (0.2, 0.4, 0.6, 0.8):
    y, z = FLOOR * t, Z + 0.6 - 0.5 * t
    pole((0.47, y + 0.03, z), (0.88, y + 0.03, z), 0.018, BAMBOO)  # rungs rest on the rails
    for x in (0.5, 0.85):
        lash((x, y + 0.02, z), (0, 1, -0.5), 0.026)

# ------------------------------------------------------------ the hip-and-gable roof
# Hips come down at both ends; a small woven gablet closes the top of each end. The thatch is laid in courses of
# cogon-grass panels: every course is a thick wedge whose butt (the cut lower edge) overhangs the course below.
EX, EZ, EY, RY = 1.65, 1.35, 1.72, 3.0
RISE, RUN = RY - EY, EZ
TH = math.atan2(RISE, RUN)
CT, ST = math.cos(TH), math.sin(TH)
YG = 2.5                                     # gablet base: hips below, front and back slopes only above
DG = (YG - EY) / math.tan(TH)
GX = EX - DG                                 # gablet plane x (0.827)
RC = 0.3                                     # rounded hips
TT = 0.5                                     # metres of thatch texture across a course


def contour(y, n_pts=None):
    """The roof plane's horizontal outline at height y below the gablet: a rounded rectangle, as (point, outward)
    pairs in film xz."""
    d = (y - EY) / math.tan(TH)
    hx, hz = EX - d, EZ - d
    pts = common.rrect(hx, hz, min(RC, hz * 0.9), na=5, nx=12, ny=10)
    out = []
    for i, (a, b) in enumerate(pts):
        pa, pb = pts[i - 1], pts[(i + 1) % len(pts)]
        t = Vector((pb[0] - pa[0], pb[1] - pa[1]))
        out.append((Vector((a, b)), Vector((t.y, -t.x)).normalized()))
    return out


def lines(y, n=26):
    """Above the gablet: the front and back slopes' outlines at height y, overhanging the gablets by 10 cm."""
    hz = EZ - (y - EY) / math.tan(TH)
    return [[(Vector((x, s * hz)), Vector((0, s))) for x in np.linspace(-GX - 0.1, GX + 0.1, n)] for s in (1, -1)]


def at(p2, o2, y, u, n):
    """A point u up the slope and n out from the roof plane, from the plane point at outline p2 (height y)."""
    w = -u * CT + n * ST
    return P(p2.x + o2.x * w, y + u * ST + n * CT, p2.y + o2.y * w)


# course cross-section (u up the slope, n out of the plane, v texture): a cut butt standing proud, thinning upward
SECTION = [(0.0, 0.0, 0.0), (-0.012, 0.05, 0.02), (0.0, 0.088, 0.06), (0.04, 0.085, 0.13), (0.15, 0.04, 0.42), (0.33, 0.018, 1.0),
           (0.33, -0.01, 1.0), (0.1, -0.012, 0.5)]


def course(outline, y, closed, thick=1.0, seed=0):
    """One course along an outline at butt height y; ragged: each station's butt jitters up and down the slope."""
    r = random.Random(seed)
    rings, us = [], [0.0]
    for i, (p2, o2) in enumerate(outline):
        if i:
            us.append(us[-1] + (p2 - outline[i - 1][0]).length / TT)
        du, dn = r.uniform(-0.025, 0.02), r.uniform(-0.008, 0.012)
        th = thick if closed else thick * min(1.0, 0.3 + 0.35 * min(i, len(outline) - 1 - i))   # thin, ragged ends at the gablets
        rings.append([at(p2, o2, y, u + (du if k < 4 else 0), (n + (dn if 0 < k < 4 else 0)) * (th if k < 5 else 1)) for k, (u, n, _) in enumerate(SECTION)])
    if closed:
        us.append(us[-1] + (outline[0][0] - outline[-1][0]).length / TT)
    # loft across the section (u around the course, v across the section)
    n_s, n_r = len(SECTION), len(rings)
    verts = [p for ring in rings for p in ring]
    faces, uvs = [], []
    off = r.uniform(0, 1)
    for i in range(n_r if closed else n_r - 1):
        a, b = i * n_s, ((i + 1) % n_r) * n_s
        for k in range(n_s):
            k2 = (k + 1) % n_s
            faces.append((a + k, b + k, b + k2, a + k2))
            uvs.append([(us[i] + off, SECTION[k][2]), (us[i + 1] + off, SECTION[k][2]), (us[i + 1] + off, SECTION[k2][2]), (us[i] + off, SECTION[k2][2])])
    if not closed:  # end caps at the gablets
        for i in (0, n_r - 1):
            faces.append(tuple(i * n_s + k for k in (range(n_s) if i else reversed(range(n_s)))))
            uvs.append([(0.0, SECTION[k][2]) for k in range(n_s)])
    return common.build('course', verts, faces, THATCH, uvs)


def fringe(outline, y, closed, length, seed, lift=0.0):
    """Straw ends hanging from under a course's butt: an alpha-clipped ribbon that droops and curls a little."""
    r = random.Random(seed)
    verts, faces, uvs = [], [], []
    us = [0.0]
    ph = [r.uniform(0, 6.3) for _ in range(4)]
    for i, (p2, o2) in enumerate(outline):
        if i:
            us.append(us[-1] + (p2 - outline[i - 1][0]).length / 0.3)
        sm = lambda a, b: math.sin(i * a + ph[b]) * 0.65 + math.sin(i * a * 2.3 + ph[b + 1]) * 0.35   # smooth along the eave
        ln = length * (1 + 0.18 * sm(0.45, 0))
        wob, curl = 0.22 * ln * sm(0.3, 1), (0.15 + 0.12 * sm(0.55, 2)) * ln   # clumps lean in and out, ends curl
        top = at(p2, o2, y, 0.03, 0.05 + lift)
        mid = at(p2, o2, y, -0.02 - 0.25 * ln, 0.055 + lift + 0.5 * wob) - Vector((0, 0, 0.35 * ln))
        end = at(p2, o2, y, -0.05 - 0.35 * ln - curl, 0.07 + lift + wob + curl) - Vector((0, 0, 0.8 * ln))
        verts += [top, mid, end]
    if closed:
        us.append(us[-1] + (outline[0][0] - outline[-1][0]).length / 0.3)   # 30 cm of fringe texture per repeat
    n = len(outline)
    off = r.uniform(0, 1)
    for i in range(n if closed else n - 1):
        a, b = i * 3, ((i + 1) % n) * 3
        for k, (v0, v1) in enumerate(((0.98, 0.55), (0.55, 0.02))):   # off the edges: v wraps in a repeating texture
            faces.append((a + k, a + k + 1, b + k + 1, b + k))
            uvs.append([(us[i] + off, v0), (us[i] + off, v1), (us[i + 1] + off, v1), (us[i + 1] + off, v0)])
    return common.build('fringe', verts, faces, FRINGE, uvs)


roof, cards = [], []
N_HIP, N_TOP = 8, 4
for k in range(N_HIP):                                   # hip courses, closed round the roof
    y = EY + (YG - EY) * k / N_HIP
    roof.append(course(contour(y), y, True, 1.6 if k == 0 else 1.0, seed=k))
    cards.append(fringe(contour(y), y, True, 0.1 if k else 0.17, 100 + k, 0.03 if k == 0 else 0.0))
    if k == 0:                                           # the eave: a second, longer layer of drooping ends
        cards.append(fringe(contour(y), y, True, 0.22, 99, 0.065))
for j in range(N_TOP):                                   # upper courses, front and back
    y = YG + (RY - 0.1 - YG) * j / N_TOP
    for s, ln in enumerate(lines(y)):
        roof.append(course(ln, y, False, seed=20 + 2 * j + s))
        cards.append(fringe(ln, y, False, 0.1, 120 + 2 * j + s))
# the underside seen from below the eaves: the plane just under the courses, facing down
rings = [[at(p2, o2, y, 0.0, -0.012) for p2, o2 in contour(y)] for y in np.linspace(EY, YG + 0.08, 6)]
under = common.loft('under', rings, UNDER, caps=None)
common.uv_map(under, lambda cos, poly: [(c.x / TT, c.z / TT) for c in cos])
roof.append(under)
for s in (1, -1):
    ln = [[at(p2, o2, y, 0.0, -0.012) for p2, o2 in lines(y, 8)[0 if s > 0 else 1]] for y in np.linspace(YG, RY - 0.05, 4)]
    o = common.loft('under_top', ln, UNDER, caps=None)
    common.uv_map(o, lambda cos, poly: [(c.x / TT, c.z / TT) for c in cos])
    roof.append(o)
for o in roof:  # the underside must face down and out of the roof: point every face away from the hut's core
    me = o.data
    centre = Vector((0, 0, 2.2))
    if o.name.startswith('under'):
        for poly in me.polygons:
            if poly.normal.dot(poly.center - centre) > 0:
                poly.flip()
parts += roof

# gablets: woven triangles closing the top of each hip end, with a bamboo trim along the foot
for x in (-GX, GX):
    s = math.copysign(1, x)
    xi = x - s * 0.02
    hz0 = EZ - (YG - 0.08 - EY) / math.tan(TH)
    tri = [P(xi - 0.015, YG - 0.08, -hz0), P(xi - 0.015, YG - 0.08, hz0), P(xi - 0.015, RY - 0.03, 0),
           P(xi + 0.015, YG - 0.08, -hz0), P(xi + 0.015, YG - 0.08, hz0), P(xi + 0.015, RY - 0.03, 0)]
    g = common.build('gablet', tri, [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], WALL)
    common.uv_map(g, wall_uv)
    parts.append(g)
    pole((xi + s * 0.02, YG + 0.02, -hz0 + 0.12), (xi + s * 0.02, YG + 0.02, hz0 - 0.12), 0.02, BAMBOO, 6)

# frame under the thatch: rafters, hip rafters, battens and the ridge pole (seen from below the eaves)
DROP = -0.045
for x in (-1.3, -0.65, 0.0, 0.65, 1.3):
    for s in (1, -1):
        if abs(x) <= GX:
            a = at(Vector((x, s * EZ)), Vector((0, s)), EY, 0.04, DROP)
            b = at(Vector((x, s * EZ)), Vector((0, s)), EY, RISE / ST - 0.06, DROP)
            pole((a.x, a.z, -a.y), (b.x, b.z, -b.y), 0.024, WOOD, 6, nodes=False)   # at() gives Blender coordinates
for z in (-0.45, 0.0, 0.45):
    for s in (1, -1):
        a = at(Vector((s * EX, z)), Vector((s, 0)), EY, 0.04, DROP)
        b = at(Vector((s * EX, z)), Vector((s, 0)), EY, (YG - EY) / ST - 0.04, DROP)
        pole((a.x, a.z, -a.y), (b.x, b.z, -b.y), 0.024, WOOD, 6, nodes=False)
for sx in (1, -1):
    for sz in (1, -1):
        a = P(sx * (EX - 0.1), EY + 0.02, sz * (EZ - 0.1))
        b = P(sx * GX, YG - 0.03, sz * (EZ - DG - 0.02))
        pole((a.x, a.z, -a.y), (b.x, b.z, -b.y), 0.03, WOOD, 6, nodes=False)
for y in (1.9, 2.1, 2.3):
    pts = [at(p2, o2, y, 0.0, DROP - 0.03) for p2, o2 in contour(y)][::3]
    parts.append(common.tube('batten', pts, 0.014, BAMBOO, 6, cyclic=True, uv_tile=0.5))
pole((-GX - 0.1, RY - 0.1, 0), (GX + 0.1, RY - 0.1, 0), 0.045, WOOD, nodes=False)

# ridge cap of folded thatch over the top courses, bound every 40 cm
st = []
RX = GX + 0.13
for x in np.linspace(-RX, RX, 18):
    e = math.sqrt(max(0.0, 1 - (1 - min(RX - abs(x), 0.1) / 0.1) ** 2))
    st.append((x, 0.25 * e + 1e-4, 0.25 * e + 1e-4, 0.1 * e + 1e-4, RY - 0.01, 0, 2.2))
cap = common.sweep('ridge', st, 20, THATCH)
common.uv_map(cap, lambda cos, poly: [(c.x / TT, 0.3 + 0.7 * min(1.0, abs(c.y) / 0.25)) for c in cos])
parts.append(cap)
for x in np.arange(-0.8, 0.81, 0.4):
    ring = [(x, 0.256 * math.cos(a), RY - 0.01 + 0.105 * math.sin(a)) for a in np.linspace(0, math.pi, 9)]
    parts.append(common.tube('bind', ring, 0.011, ROPE, 6))

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
common.bake_ao(hut, 512)  # the fringe cards stay out of the bake (as solids they would blacken the eaves)
fr = common.join(cards, 'hut_fringe')
fr.data.uv_layers.new(name='AO')
hut = common.join([hut, fr], 'hut')
tris = common.triangles([hut])
size = common.export_glb([hut], GLB, pos_bits=12, norm_bits=8)   # seen from 5 m out: 1 mm, 8-bit normals are plenty
print(f'hut: {GLB} {size / 1024:.1f} KB, {tris} triangles')
assert size <= MAX_BYTES, f'hut.glb is {size} bytes, over the {MAX_BYTES} budget'
common.check_budget(os.path.dirname(GLB))
Pn = lambda n: os.path.join(OUT, n)
common.render_previews(GLB, [
    (Pn('hut-hero.png'), (5.2, -6.4, 2.6), (0, 0, 1.5), 45),
    (Pn('hut-close.png'), (2.6, -3.1, 1.6), (1.1, -1.0, 2.0), 40),
], look='sunset', ground=common.srgb(58, 48, 34))
