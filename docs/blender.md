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
  `thatch_textures` (weathered straw strands, one slope from eave to ridge), `weave_textures` (rattan basket weave
  or split-bamboo herringbone), `cane_textures` (rattan cane).
- Geometry: `fillet` (round the corners of a profile), `rrect` (rounded rectangles with a fixed point count),
  `lathe`, `shell` (thin-walled lathe profiles with a rolled bead), `loft`, `sweep` (superellipse sections along
  X, for cutlery, chopsticks and feet), `strip` (flat bent strips: hinges, tabs, sandal soles), `tube` (limbs with
  cloth folds, wires, chair frames; UVs along the length), `boolean`, `bevel_mod`, `join`, `smooth` (smooth shading
  with hard edges only above an angle, plus weighted normals).
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
  y 1.0, walls to y 1.84, the back-wall window centred on (0.2, 1.38, -0.76), eaves 3.3 × 2.7 m, ridge at y 3.0.
  The roof is a steep gable along x of thick weathered thatch (darker and greyer toward the eaves), with a bound
  ridge cap and crossed finials on the gable apexes; woven split-bamboo walls, pale bamboo posts on stones.
- **packaging.glb** (real size, metres): nodes `box` (20 x 15 x 7.6 cm clamshell: thin flanges with a parting
  seam, a folded hinge strip at the back, a snap tab hooked under the base flange), `bowl` (15 cm, 1.8 mm wall,
  rolled rim, foot ring, inner floor), `cup` (11 cm 12 oz cup with a snap-on lid and a straw hole), `fork`, `spoon`
  (16 cm), `chopsticks` (23 cm), `drinking_straw` (21 cm x 7 mm, open ends). No transforms; origin at each piece's
  table-contact centre; the small pieces lie flat with their length along X. The straw hole is at
  (0.010, 0.1112, 0.017) in the cup's glTF space. One shared pulp texture (1024, about 8 cm per repeat), tinted cream
  per material.
- **cafe.glb** (real size, metres): origin on the floor under the table's centre. Nodes: `table` (0.70 m teak plank
  top at 0.75 m, cast-iron base), `chair_l`, `chair_r` (rattan bistro chairs, seat 0.45 m, one shared mesh),
  `candle` (ribbed amber glass tumbler, wax with a melt pool, wick) at (-0.2, 0.75, 0.13), `candle_flame` (core,
  body, blue base), `string_wire` (8 mm cable with clips and drop sockets), `bulb_00` to `bulb_13` (clear S14 glass
  and an emissive filament), `string_posts` (planters, poles, eye bolts). Emissive materials: `flame`,
  `flame_core`, `flame_blue`, `bulb`, a faint glow on `wax`. The glasses use KHR_materials_transmission.
- **farmer.glb**: origin at the feet, 1.65 m tall (hat peak about 1.73 m). He holds the top of a bamboo torch;
  the bound straw head (charred, lashed into split bamboo) is at the pole's lower end near the ground ahead.
  Nodes `farmer` and `torch_flame` (emissive `flame` and `flame_core`).
- The files need `KHR_draco_mesh_compression` and `EXT_texture_webp`, so load them with three.js's
  `GLTFLoader` plus a `DRACOLoader`. AO is each material's occlusion texture on UV set 1 (GLTFLoader sets
  `aoMap.channel` from `texCoord`).
