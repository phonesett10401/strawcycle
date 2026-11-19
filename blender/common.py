"""Shared helpers for the film's Blender models. Run through hut.py etc., never on its own."""
import math
import os

import bmesh
import bpy


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

# The styles.css tokens the models use (keep in step with :root there).
PALETTE = {
    'field': oklch(86, 0.11, 88),          # --color-field, straw gold: thatch
    'field_muted': oklch(36, 0.05, 75),    # --color-field-muted: bamboo
    'dusk_field': oklch(29, 0.045, 70),    # --dusk-field: posts and beams
    'ink': oklch(25, 0.05, 262),           # --color-ink
    'accent': oklch(56, 0.17, 42),         # --color-accent, ember orange
    'paper': oklch(96.5, 0.006, 250),      # --color-paper, smoke-grey sky
}


def material(name, colour):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True  # closed meshes: export single-sided
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = colour
    bsdf.inputs['Roughness'].default_value = 1.0
    bsdf.inputs['Metallic'].default_value = 0.0
    return mat


def bevel(obj, w):
    """Bevel every edge of obj's mesh by w metres, one segment (catches light on low-poly edges)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=w, segments=1, affect='EDGES', clamp_overlap=True)
    bm.to_mesh(obj.data)
    bm.free()


def _gltf_output(tree):
    """The node group the glTF exporter reads for occlusion."""
    group = bpy.data.node_groups.get('glTF Material Output')
    if group is None:
        group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        group.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    node = tree.nodes.new('ShaderNodeGroup')
    node.node_tree = group
    return node


def bake_ao(obj, size=512, ground=True):
    """UV-unwrap obj, bake ambient occlusion into one size x size image and wire it to every material as glTF occlusion."""
    scene = bpy.context.scene
    for o in scene.objects:
        o.select_set(o is obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')

    floor = None
    if ground:  # temporary ground so the stilts and underside darken where they meet the earth
        bpy.ops.mesh.primitive_plane_add(size=40)
        floor = bpy.context.active_object
        for o in scene.objects:
            o.select_set(o is obj)
        bpy.context.view_layer.objects.active = obj

    img = bpy.data.images.new(obj.name + '_ao', size, size)
    for mat in obj.data.materials:
        nodes = mat.node_tree.nodes
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = img
        nodes.active = tex
        sep = nodes.new('ShaderNodeSeparateColor')
        mat.node_tree.links.new(tex.outputs['Color'], sep.inputs['Color'])
        mat.node_tree.links.new(sep.outputs['Red'], _gltf_output(mat.node_tree).inputs['Occlusion'])

    if scene.world is None:
        scene.world = bpy.data.worlds.new('World')
    scene.world.light_settings.distance = 0.8
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 128
    bpy.ops.object.bake(type='AO', margin=4)
    img.pack()
    if floor:
        bpy.data.objects.remove(floor)
    return img


def export_glb(objs, path):
    """Export objs as a Draco-compressed (level 6) GLB with WebP textures; returns the file size in bytes."""
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_image_format='WEBP', export_cameras=False, export_lights=False)
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


def render_preview(glb, png, cam_loc=(5.2, -6.4, 2.6), target=(0, 0, 1.4)):
    """Re-import the exported GLB into an empty scene (so the preview shows what the film gets) and render it."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    scene = bpy.context.scene
    assert any(o.type == 'MESH' for o in scene.objects), 're-imported GLB has no mesh'
    for mat in bpy.data.materials:  # Cycles ignores glTF occlusion, so multiply it into the colour to show it
        tree = mat.node_tree
        tex = next((n for n in tree.nodes if n.type == 'TEX_IMAGE'), None)
        if tex:
            base = tree.nodes['Principled BSDF'].inputs['Base Color']
            mix = tree.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            mix.inputs[6].default_value = base.default_value
            tree.links.new(tex.outputs['Color'], mix.inputs[7])
            tree.links.new(mix.outputs[2], base)

    bpy.ops.mesh.primitive_plane_add(size=40)
    bpy.context.active_object.data.materials.append(material('ground', PALETTE['field_muted']))

    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(62), 0, math.radians(35)))
    sun = bpy.context.active_object.data
    sun.energy = 3.5
    sun.color = PALETTE['accent'][:3]
    sun.angle = math.radians(4)

    scene.world = bpy.data.worlds.new('sky')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = PALETTE['paper']
    bg.inputs['Strength'].default_value = 0.6

    bpy.ops.object.camera_add(location=cam_loc)
    cam = bpy.context.active_object
    aim = bpy.data.objects.new('aim', None)
    aim.location = target
    scene.collection.objects.link(aim)
    track = cam.constraints.new('TRACK_TO')
    track.target = aim
    cam.data.lens = 45
    scene.camera = cam

    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 96
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 960
    scene.render.resolution_y = 720
    scene.render.filepath = png
    os.makedirs(os.path.dirname(png), exist_ok=True)
    bpy.ops.render.render(write_still=True)
