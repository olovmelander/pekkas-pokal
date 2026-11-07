"""Render previews of keramikern.glb on her reference body with Blender 5.2 (Cycles, CPU).

Usage: python tools/blender/preview.py [tag]  -> tools/blender/<tag>-front|side|back.png
"""
import math
import os
import sys

import bpy
import addon_utils
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
tag = sys.argv[1] if len(sys.argv) > 1 else 'preview'
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable('cycles', default_set=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 640, 720
scene.render.film_transparent = False
world = bpy.data.worlds.new('w'); scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.32, 0.28, 0.24, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 0.6


def to_blender(v):  # three (x, y, z) -> blender (x, -z, y)
    return (v[0], -v[2], v[1])


# Body
verts, faces = [], []
for line in open(os.path.join(HERE, 'ref', 'body.obj')):
    if line.startswith('v '):
        verts.append(to_blender(tuple(map(float, line.split()[1:4]))))
    elif line.startswith('f '):
        faces.append(tuple(int(t) - 1 for t in line.split()[1:4]))
me = bpy.data.meshes.new('body'); me.from_pydata(verts, [], faces); me.update()
for p in me.polygons: p.use_smooth = True
body = bpy.data.objects.new('body', me); scene.collection.objects.link(body)
skin = bpy.data.materials.new('skin'); skin.use_nodes = True
skin.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.62, 0.38, 0.27, 1)
skin.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.55
body.data.materials.append(skin)

# Hair and beret from the GLB (exported in three space: rotate to Blender's Z-up)
bpy.ops.import_scene.gltf(filepath=os.environ.get('KERAMIKER_GLB') or os.path.join(HERE, '..', '..', 'src', 'games', 'clay', 'keramikern.glb'))
vc = bpy.data.materials.new('vc'); vc.use_nodes = True
nt = vc.node_tree
attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Color'
bsdf = nt.nodes['Principled BSDF']
nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.5
for ob in list(scene.objects):
    if ob.type == 'MESH' and ob.name.startswith('Keramiker'):
        ob.data.materials.clear(); ob.data.materials.append(vc)
        for p in ob.data.polygons: p.use_smooth = True
# The importer converts glTF's Y-up to Z-up; we exported without conversion,
# so the data already is Y-up and the importer's turn puts it right.

target = Vector(to_blender((0, 1.78, 0.0)))
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 3.2; sun.rotation_euler = (math.radians(50), 0, math.radians(35))
fill = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'AREA')); scene.collection.objects.link(fill)
fill.data.energy = 60; fill.data.size = 2; fill.location = (-1.2, -1.4, 2.2)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam)
cam.data.lens = 70
scene.camera = cam
for name, az in (('front', 0.35), ('side', 1.45), ('back', 2.75)):
    d = 1.15
    pos = (math.sin(az) * d, -math.cos(az) * d, 0.03)
    cam.location = target + Vector(pos)
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(HERE, f'{tag}-{name}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', scene.render.filepath)
