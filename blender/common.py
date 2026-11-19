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
        emission=None, alpha=None, transmission=0.0, ior=1.5, tex_alpha=None, emit_tex=False, sheen=0.0,
        coat=0.0, double=False):
    """A glTF-friendly Principled material: colour (x albedo texture), tangent normal map, emission, blended alpha.

    tex_alpha 'blend' or 'clip' takes alpha from the albedo texture (glTF BLEND, or MASK at 0.5); emit_tex uses the
    albedo texture as the emissive texture too (times emission); sheen and coat export as KHR_materials_sheen and
    _clearcoat; double exports doubleSided (cards).
    """
    mat = material(name, colour)
    mat.use_backface_culling = not double
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
        if tex_alpha:
            src = tex.outputs['Alpha']
            if tex_alpha == 'clip':  # Math Round: the exporter writes alphaMode MASK, cutoff 0.5
                rnd = nt.nodes.new('ShaderNodeMath')
                rnd.operation = 'ROUND'
                nt.links.new(src, rnd.inputs[0])
                src = rnd.outputs[0]
            nt.links.new(src, bsdf.inputs['Alpha'])
            mat.surface_render_method = 'BLENDED' if tex_alpha == 'blend' else 'DITHERED'
        if emit_tex:
            nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
            bsdf.inputs['Emission Strength'].default_value = emission[3] if emission and len(emission) > 3 else 1.0
    if normal:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = normal
        nt.links.new(uv.outputs['UV'], tex.inputs['Vector'])
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.uv_map = 'UVMap'
        nm.inputs['Strength'].default_value = strength
        nt.links.new(tex.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if emission and not emit_tex:
        bsdf.inputs['Emission Color'].default_value = tuple(emission[:3]) + (1.0,)
        bsdf.inputs['Emission Strength'].default_value = emission[3] if len(emission) > 3 else 1.0
    if alpha is not None:
        bsdf.inputs['Alpha'].default_value = alpha
        mat.surface_render_method = 'BLENDED'
    if transmission:  # exported as KHR_materials_transmission / _ior
        bsdf.inputs['Transmission Weight'].default_value = transmission
        bsdf.inputs['IOR'].default_value = ior
    if sheen:  # a faint fibre fuzz at grazing angles
        bsdf.inputs['Sheen Weight'].default_value = sheen
        bsdf.inputs['Sheen Roughness'].default_value = 0.6
        bsdf.inputs['Sheen Tint'].default_value = tuple(colour[:3]) + (1.0,)
    if coat:  # oiled satin finish
        bsdf.inputs['Coat Weight'].default_value = coat
        bsdf.inputs['Coat Roughness'].default_value = 0.3
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


def image(name, rgb, data=False, alpha=None):
    """A packed Blender image from an (h, w, 3) array in 0..1 (sRGB-encoded for colour, raw for data), with an
    optional (h, w) alpha channel."""
    h, w = rgb.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=alpha is not None)
    if data:
        img.colorspace_settings.name = 'Non-Color'
    px = np.ones((h, w, 4), np.float32)
    px[..., :3] = np.clip(rgb, 0, 1)
    if alpha is not None:
        px[..., 3] = np.clip(alpha, 0, 1)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def fibre_textures(size=1024, seed=1, mesh=96):
    """Moulded pressed-straw pulp at real scale (one tile ~ 8 cm, 1 px ~ 0.08 mm). Albedo: near white (tint it per
    material) with fibres set into the pulp, not on it: specks, short chips and a few long curved strands (0.2-8 mm),
    some darker and some lighter than the pulp, each at its own low contrast, clustered and half buried (faded by a
    soft mask), over broad soft mottling. Normal: a web of short random fibres (0.5-2 mm, low amplitude), the larger
    fibres raised a little, and the forming screen's plain-weave mesh (~0.8 mm pitch; strong only where a material
    turns the normal map up, i.e. the rough inner faces). Most of the fibre read is in the normal map."""
    rng = np.random.default_rng(seed + 10)
    fib, _ = strokes(size, int(size * size * 0.035), (6, 26), seed, bend=0.7, width=0.55)
    fib = np.clip(fib / np.percentile(fib, 99.5), 0, 1.3)

    def fibres(n, length, s, bend, width):
        """n strokes, each with its own signed contrast (mostly darker, some lighter): coverage and signed value."""
        vals = np.where(rng.random(n) < 0.7, -1.0, 0.8) * rng.uniform(0.25, 1.0, n)
        cov, val = strokes(size, n, length, s, bend=bend, width=width, values=vals)
        return np.clip(cov / np.percentile(cov, 99.8), 0, 1) ** 0.8, val, cov

    specks = fibres(int(size * size * 0.0012), (2, 6), seed + 6, 0.3, 0.8)
    chips = fibres(int(size * size * 0.00025), (8, 34), seed + 1, 0.7, 1.1)
    strands = fibres(int(size * size * 0.000012), (40, 100), seed + 2, 1.6, 0.9)   # a few long curved strands
    cluster = np.clip(0.55 + 0.45 * noise(size, 40, seed=seed + 7), 0, 1)           # uneven density
    buried = np.clip(0.6 + 0.4 * noise(size, 3, seed=seed + 8), 0.15, 1)            # parts of a fibre sink in
    d = sum(a * c * v for a, (c, v, _) in zip((0.12, 0.16, 0.14), (specks, chips, strands))) * cluster * buried
    broad = noise(size, 110, seed=seed + 3)
    mid = noise(size, 22, seed=seed + 4)
    grain = noise(size, 1.2, seed=seed + 5)
    v = 0.962 + 0.02 * broad + 0.012 * mid + 0.008 * grain - 0.03 * fib
    # darker fibres go warm straw brown (blue drops most), lighter ones toward pale straw
    k = np.where(d[..., None] < 0, np.array([0.8, 1.0, 1.35]), np.array([1.0, 1.0, 0.85]))
    rgb = v[..., None] * (1 + d[..., None] * k)
    U = (np.arange(size) + 0.5) / size * mesh
    fu, cu = U % 1, np.floor(U).astype(int)
    hu = np.clip(1 - ((fu - 0.5) / 0.32) ** 2, 0, 1)            # a wire's round profile across it
    top = ((cu[None, :] + cu[:, None]) % 2) == 0                # plain weave: wires alternate over and under
    wv, wu = hu[None, :] * np.ones((size, 1)), hu[:, None] * np.ones((1, size))
    screen = np.where(top, np.maximum(wu, 0.55 * wv), np.maximum(0.55 * wu, wv))
    raised = sum(c for c, _, _ in (specks, chips, strands)) * buried
    height = 1.1 * _gauss(fib, 0.5) + 0.6 * raised + 0.3 * screen + 0.25 * mid + 0.15 * grain
    return image('pulp_albedo', rgb), image('pulp_normal', normal_map(height, 0.9), data=True)


def weave_textures(size=512, strands=16, kind='basket', colour=(0.55, 0.37, 0.21), seed=7, contrast=0.5):
    """Tileable woven strands: 'basket' (rattan over-under) or 'twill' (split-bamboo herringbone, fak); contrast is
    how dark the gaps between strands go. Returns albedo and normal map."""
    u = (np.arange(size) + 0.5) / size * strands
    U, Vv = np.meshgrid(u, u)
    fu, fv = U % 1, Vv % 1
    across = np.sin(np.pi * fv) ** 0.6                      # a strand running along u: its profile across v
    along = np.sin(np.pi * fu) ** 0.6
    cu, cv = np.floor(U).astype(int), np.floor(Vv).astype(int)
    if kind == 'twill':  # 2-over-2 diagonal, flipped every 4 columns into a herringbone
        flip = (cu // 4) % 2
        top = (((cu + np.where(flip == 1, -cv, cv)) // 2) % 2) == 0
    else:
        top = ((cu + cv) % 2) == 0
    height = np.where(top, (across + 0.15) * (0.75 + 0.25 * np.sin(np.pi * fu) ** 2),
                      (along + 0.15) * (0.75 + 0.25 * np.sin(np.pi * fv) ** 2))
    rng = np.random.default_rng(seed)
    tone = 0.85 + 0.3 * rng.random((strands, strands))
    t = np.where(top, tone[cv % strands, 0], tone[0, cu % strands])
    streak = noise(size, 0.7, 12, seed) * 0.05
    rgb = np.array(colour) * (t * (1 - contrast + contrast * np.clip(height, 0, 1.1)) + streak)[..., None]
    return image(f'{kind}_albedo', rgb), image(f'{kind}_normal', normal_map(height * 3.0, 1.0), data=True)


def teak_textures(size=1024, seed=3, nsize=512):
    """Oiled teak, long grain along v (the planks are modelled, so no joints): warm golden brown with darker streaks,
    a soft flat-sawn figure, fine dark grain lines and pores. Albedo at size, normal map at nsize."""
    u = (np.arange(size) + 0.5) / size
    U = np.broadcast_to(u[None, :], (size, size))
    warp = noise(size, 18, 220, seed) * 0.6 + noise(size, 60, 500, seed + 1) * 1.1
    ring = (0.5 + 0.5 * np.sin(2 * np.pi * (U * 9 + warp))) ** 5          # growth rings, gently wandering
    fine = (0.5 + 0.5 * np.sin(2 * np.pi * (U * 23 + warp * 1.4 + 0.3))) ** 3
    pores = np.clip(noise(size, 0.6, 26, seed + 2), 0, 3)
    streak = noise(size, 5, 160, seed + 3)
    band = noise(size, 40, 900, seed + 5)                                  # broad colour bands along the board
    lines = (np.abs(noise(size, 0.9, 80, seed + 4)) < 0.05).astype(float)
    light, dark = np.array([0.74, 0.5, 0.27]), np.array([0.42, 0.25, 0.12])
    k = np.clip(0.3 + 0.28 * ring + 0.1 * fine + 0.22 * pores + 0.12 * streak + 0.1 * band + 0.3 * lines, 0, 1)
    rgb = (light * (1 - k[..., None]) + dark * k[..., None]) * (1 + 0.04 * band)[..., None]
    height = -1.0 * ring - 0.3 * fine - 1.1 * pores + 0.3 * streak - 0.7 * lines
    if nsize != size:  # box-downsample the height before the normal map
        f = size // nsize
        height = height.reshape(nsize, f, nsize, f).mean((1, 3))
    return image('teak_albedo', rgb), image('teak_normal', normal_map(height, 0.9 * nsize / size * 1.6), data=True)


def cane_textures(size=256, colour=(0.36, 0.23, 0.13), seed=9):
    """Rattan cane along v: long fibre streaks and a darker node band once per tile. Albedo and normal map."""
    streak = noise(size, 0.8, 40, seed)
    wide = noise(size, 6, 80, seed + 1)
    v = (np.arange(size) + 0.5) / size
    band = np.exp(-((v - 0.5) / 0.02) ** 2)[:, None] * np.ones((1, size))
    k = np.clip(0.9 + 0.08 * streak + 0.08 * wide - 0.35 * band, 0.3, 1.3)
    rgb = np.array(colour) * k[..., None]
    return image('cane_albedo', rgb), image('cane_normal', normal_map(0.4 * streak + 3.0 * band, 0.6), data=True)


STRAW_GOLD, STRAW_GREY = np.array([0.80, 0.66, 0.42]), np.array([0.58, 0.56, 0.51])   # sRGB: dry cogon, weathered


def thatch_textures(size=512, seed=5):
    """One thatch course (a cogon-grass panel): straw strands along v, clumped across u, from the cut butt (v = 0:
    darker cut ends, most weathered) to the tucked top (v = 1); u tiles. Desaturated golden straw greyed by weather."""
    rng = np.random.default_rng(seed)
    n = int(size * size * 0.02)
    bright = rng.uniform(0.6, 1.25, n)
    cov, val = strokes(size, n, (60, 260), seed, angle=math.pi / 2, spread=0.1, bend=0.25, width=0.8, values=bright)
    cov = np.clip(cov / np.percentile(cov, 97), 0, 1.2)
    clump = noise(size, 7, 400, seed + 1)                                    # bunches across the panel
    v = ((np.arange(size) + 0.5) / size)[:, None] * np.ones((1, size))
    ends, _ = strokes(size, int(size * size * 0.004), (2, 6), seed + 2, width=0.7)  # cut ends at the butt
    ends = np.clip(ends / np.percentile(ends, 99), 0, 1) * np.clip(1 - v / 0.12, 0, 1)
    weather = np.clip(0.45 - 0.35 * v + 0.2 * noise(size, 30, 80, seed + 3), 0, 1)
    base = STRAW_GOLD * (1 - weather[..., None]) + STRAW_GREY * weather[..., None]
    shade = (0.55 + 0.45 * cov) * np.clip(val, 0.5, 1.3) * (0.9 + 0.1 * clump) * (0.8 + 0.2 * np.clip(v / 0.1, 0, 1))
    rgb = base * shade[..., None] * (1 - 0.35 * ends[..., None])
    height = 2.0 * cov + 0.8 * clump - 1.2 * ends
    return image('thatch_albedo', rgb), image('thatch_normal', normal_map(height, 1.4), data=True)


def fringe_texture(w=512, h=256, seed=8, clumps=90):
    """Hanging straw ends for alpha-clipped ribbon cards: v = 1 is the top edge (tucked under the course), the
    strands hang down in clumps and stop at a roughly trimmed, uneven edge. RGBA (alpha = strand coverage)."""
    rng = np.random.default_rng(seed)
    cov = np.zeros((h, w))
    acc = np.zeros((h, w))
    rows = np.arange(h)
    for c in range(clumps):
        cx, clen, lean = rng.uniform(0, w), rng.uniform(0.55, 0.95), rng.uniform(-14, 14)
        for _ in range(rng.integers(12, 30)):
            x0 = cx + rng.normal(0, w / clumps * 0.45)
            ln = int(h * min(0.99, clen + rng.normal(0, 0.06)))
            t = rows[:ln] / h                                     # 0 at the top, down the strand
            x = x0 + lean * t ** 2 + rng.normal(0, 1.5) * t
            ix = np.mod(np.round(x).astype(int), w)
            iy = h - 1 - rows[:ln]
            b = rng.uniform(0.45, 1.35)
            np.add.at(cov, (iy, ix), 1.0)
            np.add.at(acc, (iy, ix), b)
    soft = _gauss(cov, 0.6)
    val = _gauss(acc, 0.6) / np.maximum(soft, 1e-4)
    alpha = np.clip(soft * 1.6, 0, 1)
    v = (np.arange(h)[:, None] + 0.5) / h
    weather = np.clip(0.55 - 0.3 * v, 0, 1)
    base = STRAW_GOLD * (1 - weather[..., None]) + STRAW_GREY * weather[..., None]
    rgb = base * (np.clip(val, 0.5, 1.3) * (0.6 + 0.4 * v))[..., None]
    return image('fringe_albedo', rgb, alpha=alpha)


def flame_texture(size=256, seed=12):
    """Two soft flame shapes side by side (u 0-0.5 a tall licking flame, 0.5-1 a forked one), for additive cards:
    alpha falls off softly at every edge; colour runs yellow-white in the core to orange and a deeper orange at the
    tongue tips. RGBA, size wide, 2 * size tall; v = 0 is the flame's base."""
    rng = np.random.default_rng(seed)
    W, H = size, 2 * size
    x = (np.arange(W) + 0.5) / W
    v = ((np.arange(H) + 0.5) / H)[:, None] * np.ones((1, W))
    rgb = np.zeros((H, W, 3))
    alpha = np.zeros((H, W))
    orange, white, tip = np.array([1.0, 0.5, 0.1]), np.array([1.0, 0.93, 0.72]), np.array([0.95, 0.3, 0.04])
    # each half: tongues of (x centre, height, half width at the base, lean); the first is the body
    for half, tongues in ((0, ((0.5, 0.95, 0.36, 0.08), (0.36, 0.55, 0.16, -0.1), (0.66, 0.68, 0.15, 0.16))),
                          (1, ((0.5, 0.72, 0.4, -0.04), (0.33, 0.9, 0.18, -0.12), (0.68, 0.82, 0.17, 0.1), (0.52, 0.6, 0.12, 0.2)))):
        X = np.broadcast_to(((x - 0.5 * half) * 2)[None, :], (H, W))   # 0..1 within this half
        sel = (X[0] >= 0) & (X[0] < 1)
        a = np.zeros((H, W))
        for i, (cx, ht, w0, lean) in enumerate(tongues):
            t = np.clip(v / ht, 0, 1.2)
            sway = lean * t ** 1.6 + 0.025 * np.sin(t * 9 + rng.uniform(0, 6)) * t
            width = w0 * np.sin(np.pi / 2 * np.clip(t / 0.25, 0, 1)) ** 0.6 * np.clip(1 - t, 0, 1) ** 0.8 + 0.004
            k = np.clip(1 - np.abs(X - cx - sway) / width, 0, 1) * (t < 1)
            a = np.maximum(a, k ** 0.7)
            if i == 0:
                core = np.clip((k - 0.3) / 0.5, 0, 1) * np.clip(1.1 - t / 0.65, 0, 1)
        a = _gauss(a * np.clip(v / 0.06, 0, 1), 2.2)
        c = orange * (1 - core[..., None]) + white * core[..., None]
        hi = np.clip((v - 0.45) * 2, 0, 1)[..., None]
        c = c * (1 - hi) + tip * hi
        rgb[:, sel] = c[:, sel]
        alpha[:, sel] = a[:, sel]
    return image('flame_albedo', rgb, alpha=alpha)


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


def shell(pts, t, bead=0.0):
    """A thin-walled lathe profile: pts (r, z) run from the axis outwards; the wall is offset by t to their left
    (inside a bowl or cup; negative t for the other side) and closed at the end by a rolled bead of radius bead,
    or by a rounded thin edge when bead is 0."""
    P = [Vector(q) for q in pts]
    off = []
    for i in range(len(P)):
        a = (P[i] - P[i - 1]) if i else (P[1] - P[0])
        b = (P[i + 1] - P[i]) if i < len(P) - 1 else (P[-1] - P[-2])
        d = (a.normalized() + b.normalized()).normalized()
        off.append(P[i] + Vector((-d.y, d.x)) * t)
    off[0].x = 0.0
    end, inner = P[-1], off[-1]
    d = (end - P[-2]).normalized()
    if bead:  # outer side, over the top, down the inner side
        c = (end + inner) / 2 + d * (bead * 0.4)
        arc = [c + Vector((math.cos(math.radians(a)), math.sin(math.radians(a)))) * bead for a in np.linspace(-80, 260, 15)]
    else:
        c = (end + inner) / 2
        arc = [c + (end - c) * math.cos(a) + d * abs(t) * 0.5 * math.sin(a) for a in np.linspace(0.45, math.pi - 0.45, 4)]
    return [tuple(q) for q in P] + [tuple(q) for q in arc] + [tuple(q) for q in reversed(off)]


def strip(name, path, hw, ht, mat=None, wdir=(1, 0, 0), p=8):
    """A flat strip along a 3D path: half width hw (scalar or per point) along wdir, half thickness ht (hinges, tabs)."""
    P = [Vector(q) for q in path]
    hws = list(hw) if isinstance(hw, (list, tuple)) else [hw] * len(P)
    W = Vector(wdir)
    rings = []
    for i, q in enumerate(P):
        tg = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        w = (W - tg * W.dot(tg)).normalized()
        n = tg.cross(w)
        ring = []
        for k in range(16):
            a = 2 * math.pi * k / 16
            c, s_ = math.cos(a), math.sin(a)
            ring.append(q + w * hws[i] * math.copysign(abs(c) ** (2 / p), c) + n * ht * math.copysign(abs(s_) ** (2 / p), s_))
        rings.append(ring)
    return loft(name, rings, mat)


def tube(name, pts, r, mat=None, sides=12, cyclic=False, caps=True, squash=1.0, folds=None, uv_tile=0.28):
    """A tube along a 3D polyline (parallel-transport frames); r is a radius or one per point; squash flattens it;
    folds=(amplitude or one per point, count, seed) ripples the radius around and along it (loose cloth). UVs: u around, v along
    the length, uv_tile metres per repeat (cane, bamboo grain)."""
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
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            f = 1.0
            if folds:
                amp, cnt, sd = folds
                amp = amp[i] if isinstance(amp, (list, tuple)) else amp   # per point: folds bunch at a joint
                f += amp * math.sin(cnt * a + sd + 1.7 * math.sin(i * 0.9 + sd)) * (0.6 + 0.4 * math.sin(i * 1.3 + 2 * sd))
            ring.append(P[i] + (nrm * math.cos(a) * squash + bi * math.sin(a)) * rs[i] * f)
        rings.append(ring)
    circ = 2 * math.pi * sum(rs) / N
    u = [k / sides * max(1, round(circ / uv_tile * 4)) / 4 for k in range(sides + 1)]
    v = [0.0]
    for i in range(1, N + (1 if cyclic else 0)):
        v.append(v[-1] + (P[i % N] - P[i - 1]).length / uv_tile)
    return loft(name, rings, mat, caps=('pole' if caps else None), cyclic=cyclic, u=u, v=v)


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


def bake_ao(objs, size=512, ground=True, distance=0.8, samples=128, margin=0.004, name=None, ground_z=0.0, ss=2):
    """Bake ambient occlusion for objs into one shared atlas on a second UV map 'AO' (glTF TEXCOORD_1), wired to every
    material as glTF occlusion. UV map 'UVMap' (texture detail) is kept; objects without one get a smart projection.
    The bake runs at ss x size and is averaged down, so islands only a pixel or two wide (a 0.7 mm seam) still get
    their own texels instead of a margin fill from a neighbouring island."""
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

    img = bpy.data.images.new((name or objs[0].name) + '_ao', size * ss, size * ss)
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
    bpy.ops.object.bake(type='AO', margin=4 * ss, uv_layer='AO')
    big = np.array(img.pixels[:], np.float32).reshape(size * ss, size * ss, 4)[..., 0]
    ao = big.reshape(size, ss, size, ss).mean((1, 3))
    img.scale(size, size)
    px = np.ones((size, size, 4), np.float32)   # a light blur takes out the bake noise (it also shrinks the WebP)
    px[..., :3] = _gauss(ao, 0.9)[..., None]
    img.pixels.foreach_set(px.ravel())
    img.pack()
    if floor:
        bpy.data.objects.remove(floor)
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers['UVMap']
    return img


def export_glb(objs, path, quality=75, pos_bits=14, norm_bits=10):
    """Export objs as a Draco-compressed (level 6) GLB with WebP textures; returns the file size in bytes.
    pos_bits, norm_bits: Draco quantization of positions (per primitive bounding box) and normals."""
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=pos_bits, export_draco_normal_quantization=norm_bits,
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


MAX_TOTAL_BYTES, MAX_TOTAL_TRIS = int(1.5 * 1024 * 1024), 200_000


def check_budget(models_dir):
    """All models/*.glb together: at most 1.5 MB and 200k triangles."""
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


def _thin_glass(mat):
    """glTF transmission without KHR_materials_volume is thin-walled: three.js tints what is behind the glass but does
    not bend it. Cycles would refract through the modelled wall like a lens, so for the preview the glass becomes a
    tinted transparent surface plus a Fresnel-weighted gloss at its glTF IOR."""
    tree = mat.node_tree
    bsdf = tree.nodes.get('Principled BSDF') if tree else None
    if bsdf is None or bsdf.inputs['Transmission Weight'].default_value <= 0:
        return
    out = next(n for n in tree.nodes if n.type == 'OUTPUT_MATERIAL')
    tr, gl = tree.nodes.new('ShaderNodeBsdfTransparent'), tree.nodes.new('ShaderNodeBsdfGlossy')
    fr, mix = tree.nodes.new('ShaderNodeFresnel'), tree.nodes.new('ShaderNodeMixShader')
    tr.inputs['Color'].default_value = [c ** 0.5 for c in bsdf.inputs['Base Color'].default_value]   # a ray crosses two walls
    gl.inputs['Roughness'].default_value = bsdf.inputs['Roughness'].default_value
    fr.inputs['IOR'].default_value = bsdf.inputs['IOR'].default_value
    tree.links.new(fr.outputs[0], mix.inputs[0])
    tree.links.new(tr.outputs[0], mix.inputs[1])
    tree.links.new(gl.outputs[0], mix.inputs[2])
    tree.links.new(mix.outputs[0], out.inputs['Surface'])


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
        _thin_glass(mat)
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
        lo = bpy.context.active_object  # stand-in lights must not show as discs, even through glass
        lo.visible_camera = lo.visible_glossy = lo.visible_transmission = False

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
