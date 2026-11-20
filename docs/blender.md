# Rebuilding the film's models

The 3D models the film loads (`models/*.glb`) are made by Python scripts in `blender/`, run in Blender
without its window. The `.glb` files are committed, so you only need Blender to change a model.

| Script | Writes | Previews in `docs/film-renders/assets/` |
| --- | --- | --- |
| `blender/hut.py` | `models/hut.glb` | `hut-hero.png`, `hut-close.png` |
| `blender/packaging.py` | `models/packaging.glb` | `packaging-hero.png`, `-close`, `-cup`, `-bowl`, `-cutlery`, `-straw` |
| `blender/cafe.py` | `models/cafe.glb` | `cafe-hero.png`, `-close`, `-chair` (three angles), `-bulbs` |
| `blender/farmer.py` | `models/farmer.glb` | `farmer-hero.png`, `farmer-silhouette.png`, `farmer-silhouette-30m.png` |

## Setup

1. Get Blender 4.2 or newer (the models were made with 5.3.0). The installer or the portable zip both work.
2. Set `BLENDER` to your `blender.exe`. For example, with the portable build:

   ```powershell
   $env:BLENDER = "C:/path/to/blender.exe"
   ```

   ```sh
   export BLENDER="C:/path/to/blender.exe"
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
`models/*.glb` together go over **1.5 MB or 200,000 triangles**. A build takes one to three minutes (AO bakes and
preview renders run on the CPU).

## What the pipeline does (`blender/common.py`)

- `PALETTE`, `srgb()`: colours from the `styles.css` tokens (oklch to linear RGB) and from 0-255 sRGB.
- Textures, made with numpy and tileable by construction (periodic FFT blurs, wrapped strokes):
  `fibre_textures` (pressed straw pulp at 8 cm per tile: a near-white albedo with fibres set into it, specks to
  8 mm curved strands, mostly darker and some lighter, each at its own low contrast, clustered and half buried, over
  broad mottling, tinted per material through `baseColorFactor`; a normal map with a web of 0.5-2 mm fibres
  and the forming screen's plain weave, which only the rough inner-face material turns up), `teak_textures`
  (warm golden oiled teak, long grain, no joints: the planks are modelled), `thatch_textures` (one thatch course:
  clumped cogon strands from the cut butt to the tucked top, greyed by weather), `fringe_texture` (hanging straw
  ends with alpha, for clipped ribbon cards), `flame_texture` (two soft flame shapes with alpha, orange to
  yellow-white, for additive cards), `weave_textures` (rattan basket weave or split-bamboo herringbone),
  `cane_textures` (rattan cane).
- Geometry: `fillet` (round the corners of a profile), `rrect` (rounded rectangles with a fixed point count),
  `lathe`, `shell` (thin-walled lathe profiles with a rolled bead), `loft`, `sweep` (superellipse sections along
  X, for cutlery, chopsticks and feet), `strip` (flat bent strips: hinges, tabs, sandal soles), `tube` (limbs with
  cloth folds, wires, chair frames; UVs along the length), `boolean`, `bevel_mod`, `join`, `smooth` (smooth shading
  with hard edges only above an angle, plus weighted normals).
- UVs: `uv_smart` (smart projection, scaled to a texel density for tiling textures), `uv_planar`,
  `uv_along_x`, `uv_cylinder`, `uv_map` (any function).
- `pbr(...)`: a Principled material the glTF exporter maps to plain PBR (base colour x texture, roughness,
  normal map, emission, blended alpha), plus alpha from the albedo texture (`tex_alpha='blend'` or `'clip'`, the
  latter exported as alphaMode MASK), the albedo as emissive texture (`emit_tex`), `sheen`
  (KHR_materials_sheen), `coat` (KHR_materials_clearcoat) and `double` (doubleSided cards).
- `bake_ao(objs, size)`: bakes ambient occlusion for one or more objects into one shared atlas on a second
  UV map `AO` (glTF `TEXCOORD_1`), at twice the size and averaged down (so millimetre seams get their own texels),
  lightly blurred, and wires it to every material as the occlusion texture.
  The first UV map (`UVMap`, `TEXCOORD_0`) keeps the tiling detail textures.
- `export_glb(objs, path)`: GLB with Draco mesh compression (level 6, position and normal quantization per model)
  and WebP textures.
- `check_budget(models_dir)`: sums size and triangles over all the GLBs.
- `render_previews(glb, shots, look)`: re-imports the exported file into an empty scene and renders each shot,
  so the previews show what the film gets. Looks: `sunset` (low warm key, cool sky fill), `night` (dark blue
  sky with point lights), `backlit` (an orange background, for silhouettes).

## Model conventions

- Metres, front facing glTF +Z (the camera side in `film.js`), one node per named part.
- **hut.glb**: origin at the ground centre. Matches v1's hut in `film.js`: posts at x ±1.05, z ±0.85, floor at
  y 1.0, walls to y 1.84, the back-wall window centred on (0.2, 1.38, -0.76), eaves 3.3 × 2.7 m, ridge at y 3.0.
  The roof is a steep hip-and-gable (hips at both ends, a small woven gablet at the top of each, ridge along x) of
  12 overlapping thatch courses with thick cut butts, golden straw greyed by weather, and alpha-clipped fringe
  cards: short ragged ends under every course and a deep, drooping double fringe at the eave (material
  `thatch_fringe`, MASK, double-sided, no occlusion). Rafters, hip rafters, battens and a ridge pole show under the
  eaves; the ridge cap is bound. Woven split-bamboo walls framed by bamboo battens, a split-bamboo slat floor, a
  railing round the open front, pale bamboo posts on half-sunk flat stones. One node, `hut`.
- **packaging.glb** (real size, metres): nodes `box` (20 x 15 x 5.7 cm clamshell, lid and base about equal: a
  7 degree draft, large corner radii, a gently domed lid with a low raised panel, flanges meeting at a 0.7 mm
  parting line with the lid's lip right behind it, a folded hinge strip at the back, a snap tab hugging the base
  flange), `bowl` (16.9 cm, 5.6 cm deep, 1.8 mm wall, rolled rim, foot ring, one fillet from wall into floor, a
  1 mm debossed floor ring), `cup` (11 cm 12 oz cup with a snap-on lid and a snug straw hole), `fork` (four tapered
  tines with rounded tips, 40% of a dished head, a stiffening rib), `spoon` (16 cm, rib on the handle),
  `chopsticks` (23 cm, eased square butts tapering to 60% with round tips, parallel 2.5 mm apart),
  `drinking_straw` (15.5 cm x 7 mm, open ends, darker bore; in the cup it stands about 45% of the cup's height
  above the lid). No transforms; origin at each piece's table-contact centre; the small pieces lie flat with their
  length along X. The straw hole is at (0.010, 0.1112, 0.017) in the cup's glTF space. One shared pulp texture
  (1024, 8 cm per repeat): `pulp` (smooth outer faces, with sheen), `pulp_inner` (the bowl's rougher screen side),
  `pulp_cutlery`, `straw`, `straw_inner`.
- **cafe.glb** (real size, metres): origin on the floor under the table's centre. Nodes: `table` (a 0.70 m top of
  six oiled teak planks with fine seams and a worn rim at 0.75 m, on a cast-iron base), `chair_l`, `chair_r` (woven
  rattan bistro chairs, seat 0.45 m, legs splayed 2.5 degrees, the seat ring joined to every leg under wrapped cane
  bindings, a curved backrest; both nodes use one shared mesh, its weighted normals baked in, and each node carries
  its own translation and rotation round the table), `candle` (ribbed amber glass tumbler, wax burnt down to 47% with a
  melt pool, a short curled wick) at (-0.2, 0.75, 0.13), `candle_flame` (core, body, blue base; inside the glass,
  its tip below the rim), `string_wire` (a twisted pair of 4.8 mm cores with moulded clips), `bulb_00` to `bulb_13`
  (one shared mesh, each node translated to its clip: socket, thin clear S14 glass, glass stem, two lead wires and an
  emissive LED spiral filament), `string_posts` (round weighted planters with soil, poles, eye bolts). Emissive
  materials: `flame`, `flame_core`, `flame_blue`, `bulb`, a faint glow on `wax`. The glasses use
  KHR_materials_transmission. Material names are unique: `iron` (table base) and `post_iron` (string posts),
  `cable` (wire, sockets) and `chair_foot` (the chairs' rubber feet).
- **farmer.glb**: origin at the feet, 1.65 m tall standing; he leans 18 degrees into his stride with both knees
  bent (crown about 1.55 m). His right hand wraps round a noded bamboo pole reaching forward and down; its tied
  30 cm straw-bundle head (charred, glowing at the end) rests on the stubble ahead of his leading foot. Nodes
  `farmer` and `torch_flame` (seven soft-edged flame cards: material `flame`, alpha BLEND from an orange to
  yellow-white texture that is also its emissive texture, double-sided; film.js renders them additively and adds
  embers and smoke).
- Node transforms: the packaging and farmer nodes have none; `chair_l`, `chair_r` and `bulb_00`..`bulb_13` carry
  translations (and the chairs rotations), because each pair or set shares one mesh.
- Extensions: the flame cards use `KHR_materials_emissive_strength` (farmer `flame` 2.0, café `flame` 1.2), the
  pulp `KHR_materials_sheen`, the teak `KHR_materials_clearcoat`, the glass `KHR_materials_transmission`.
- `tests/models.test.mjs` (part of `node --test`) checks the committed GLBs: at most 1.5 MB and 200,000 triangles
  in total, and the node names film.js needs.
- The files need `KHR_draco_mesh_compression` and `EXT_texture_webp`, so load them with three.js's
  `GLTFLoader` plus a `DRACOLoader`. AO is each material's occlusion texture on UV set 1 (GLTFLoader sets
  `aoMap.channel` from `texCoord`).
