# Rebuilding the film's models

The 3D models the film loads (`models/*.glb`) are made by Python scripts in `blender/`, run in Blender
without its window. The `.glb` files are committed, so you only need Blender to change a model.

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

From the repo root:

```powershell
& $env:BLENDER --background --factory-startup --python blender/hut.py
```

```sh
"$BLENDER" --background --factory-startup --python blender/hut.py
```

This writes `models/hut.glb` and renders a preview to `docs/film-renders/assets/hut.png`. To write
somewhere else, pass the paths after `--`:

```sh
"$BLENDER" --background --factory-startup --python blender/hut.py -- out/hut.glb out/hut.png
```

The script prints the file size and triangle count, and fails if the model is over its 400 KB budget.
It takes about 20 seconds (the AO bake and preview render on the CPU).

## What the pipeline does (`blender/common.py`)

- `PALETTE`: colours from the `styles.css` tokens, converted from oklch to linear RGB. Change a token
  there, change it here.
- `bevel(obj, w)`: a one-segment bevel on every edge, so low-poly edges catch the light.
- `bake_ao(obj, size=512)`: UV-unwraps the mesh, bakes ambient occlusion (with a temporary ground plane)
  into one texture and wires it to every material as the glTF occlusion texture.
- `export_glb(objs, path)`: GLB with Draco mesh compression (level 6) and WebP textures.
- `render_preview(glb, png)`: re-imports the exported file into an empty scene and renders it, so the
  preview shows what the film actually gets.

## Model conventions

- Metres, origin at the model's ground centre, front facing glTF +Z (the camera side in `film.js`).
- The hut matches v1's hut in `film.js`: posts at x ±1.05, z ±0.85, floor at y 1.0, walls to y 1.84,
  the back-wall window centred on (0.2, 1.38, -0.85), roof ridge at y 3.0, eaves 3.3 × 2.7 m.
- The file needs `KHR_draco_mesh_compression` and `EXT_texture_webp`, so load it with three.js's
  `GLTFLoader` plus a `DRACOLoader`. The AO is in each material's occlusion texture (`aoMap`, UV set 0).
