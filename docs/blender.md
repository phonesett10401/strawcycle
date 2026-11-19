# Rebuilding the film's models

The 3D models the film loads (`models/*.glb`) are made by Python scripts in `blender/`, run in Blender
without its window. The `.glb` files are committed, so you only need Blender to change a model.

| Script | Writes | Previews in `docs/film-renders/assets/` |
| --- | --- | --- |
| `blender/hut.py` | `models/hut.glb` | `hut-hero.png`, `hut-close.png` |
| `blender/packaging.py` | `models/packaging.glb` | `packaging-hero.png`, `-close`, `-cup`, `-bowl`, `-cutlery`, `-straw` |
| `blender/cafe.py` | `models/cafe.glb` | `cafe-hero.png`, `-close`, `-chair`, `-bulbs` |
| `blender/farmer.py` | `models/farmer.glb` | `farmer-hero.png`, `farmer-silhouette.png` |

## Setup

1. Get Blender 4.2 or newer (the models were made with 5.3.0). The installer or the portable zip both work.
2. Set `BLENDER` to your `blender.exe`. For example, with the portable build:

   ```powershell
   $env:BLENDER = "C:/Users/phone/blender/blender-5.3.0-windows-x64/blender.exe"
   ```

   ```sh
   export BLENDER="C:/Users/phone/blender/blender-5.3.0-windows-x64/blender.exe"
   ```

## Build a model

From the repo root (any of the scripts above):

```powershell
& $env:BLENDER --background --factory-startup --python blender/hut.py
```

```sh
"$BLENDER" --background --factory-startup --python blender/hut.py
```

This writes the model and renders its previews. To write somewhere else, pass the paths after `--`
(the model file, then a folder for the previews):

```sh
"$BLENDER" --background --factory-startup --python blender/hut.py -- out/hut.glb out/
```

Each script prints the file size and triangle count, and fails if its model is over its own budget or if all
`models/*.glb` together go over **1.5 MB or 150,000 triangles**. A build takes one to three minutes (AO bakes and
preview renders run on the CPU).

## What the pipeline does (`blender/common.py`)

- `PALETTE`, `srgb()`: colours from the `styles.css` tokens (oklch to linear RGB) and from 0-255 sRGB.
- Textures, made with numpy and tileable by construction (periodic FFT blurs, wrapped strokes):
  `fibre_textures` (pressed straw pulp: a near-white albedo with fibre flecks, tinted per material through
  `baseColorFactor`, and its normal map), `teak_textures` (glued boards with ring figure and pores),
  `thatch_textures` (weathered straw strands along v).
- Geometry: `fillet` (round the corners of a profile), `rrect` (rounded rectangles with a fixed point count),
  `lathe`, `loft`, `sweep` (superellipse sections along X, for cutlery, chopsticks and feet), `tube` (limbs,
  wires, chair frames), `boolean`, `bevel_mod`, `join`, `smooth` (smooth shading with hard edges only above an
  angle, plus weighted normals).
- UVs: `uv_smart` (smart projection, scaled to a texel density for tiling textures), `uv_planar`,
  `uv_along_x`, `uv_cylinder`, `uv_map` (any function).
- `pbr(...)`: a Principled material the glTF exporter maps to plain PBR (base colour x texture, roughness,
  normal map, emission, blended alpha).
- `bake_ao(objs, size)`: bakes ambient occlusion for one or more objects into one shared atlas on a second
  UV map `AO` (glTF `TEXCOORD_1`), lightly blurred, and wires it to every material as the occlusion texture.
  The first UV map (`UVMap`, `TEXCOORD_0`) keeps the tiling detail textures.
- `export_glb(objs, path)`: GLB with Draco mesh compression (level 6) and WebP textures.
- `check_budget(models_dir)`: sums size and triangles over all the GLBs.
- `render_previews(glb, shots, look)`: re-imports the exported file into an empty scene and renders each shot,
  so the previews show what the film gets. Looks: `sunset` (low warm key, cool sky fill), `night` (dark blue
  sky with point lights), `backlit` (an orange background, for silhouettes).

## Model conventions

- Metres, front facing glTF +Z (the camera side in `film.js`), one node per named part.
- **hut.glb**: origin at the ground centre. Matches v1's hut in `film.js`: posts at x ±1.05, z ±0.85, floor at
  y 1.0, walls to y 1.84, the back-wall window centred on (0.2, 1.38, -0.76), roof ridge at y 3.0, eaves
  3.3 × 2.7 m (five layered thatch courses and a rolled straw ridge inside that outline).
- **packaging.glb**: nodes `box`, `bowl`, `cup` (v1's OBJ shapes, model units as in `film.js`; the film scales
  them by FOLD_S / 0.62), `fork`, `spoon`, `chopsticks`, `drinking_straw` (real sizes x 6, the same model scale,
  so the straw stands through the cup lid's sip hole). Every node has no transform and its origin at its
  table-contact centre; the small pieces lie flat with their length along X. The cup's sip hole is at
  (0, 0.826, 0.274) in the cup's glTF space (front, +Z).
- **cafe.glb**: place it at `(TABLE[0], 0, TABLE[2])`. The table top is at y 0.915 (`TABLE[1]`), the furniture
  stands on the deck surface at y 0.06. Nodes: `table`, `chair_l`, `chair_r` (one shared mesh), `candle`
  (glass, wax, wick) at the `CANDLE` offset, `candle_flame`, `string_wire`, `bulb_00` to `bulb_13` (where v1's
  bulb glows are), `string_posts`. Emissive materials: `flame`, `bulb`, and a faint glow on `wax`.
- **farmer.glb**: origin at the feet, 1.65 m tall standing (the hat's peak about 1.73 m). Nodes `farmer` and
  `torch_flame` (emissive `flame`).
- The files need `KHR_draco_mesh_compression` and `EXT_texture_webp`, so load them with three.js's
  `GLTFLoader` plus a `DRACOLoader`. AO is each material's occlusion texture on UV set 1 (GLTFLoader sets
  `aoMap.channel` from `texCoord`).
