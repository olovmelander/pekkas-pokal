"""Model the ceramicist's long brown hair and black beret in Blender 5.2.

Run with the bpy module (Blender 5.2.3 LTS), see tools/blender/README.md:
    python tools/blender/keramiker_hair.py
Reads ref/body.obj + ref/info.json (her bind-pose body from people.js, made
by export-ref.mjs) and writes src/games/clay/keramikern.glb with two meshes in her model space (metres, +Y up,
facing +Z, exported without axis conversion so three.js reads it as is):
  KeramikerHair  - a scalp cap plus layered, tapering locks with a centre part
  KeramikerBeret - a soft felt beret with a rolled band and a stalk
Vertex colours carry all colour (COLOR_0); the game uses its own materials.
"""
import json
import math
import os
import random

import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, 'ref')
OUT = os.environ.get('KERAMIKER_GLB') or os.path.join(HERE, '..', '..', 'src', 'games', 'clay', 'keramikern.glb')
random.seed(2014)
bpy.ops.wm.read_factory_settings(use_empty=True)

info = json.load(open(os.path.join(REF, 'info.json')))
S = info['scale']

# --- reference body ---------------------------------------------------------
verts, faces = [], []
for line in open(os.path.join(REF, 'body.obj')):
    if line.startswith('v '):
        verts.append(Vector(tuple(map(float, line.split()[1:4]))))
    elif line.startswith('f '):
        faces.append(tuple(int(t.split('/')[0]) - 1 for t in line.split()[1:4]))
body = BVHTree.FromPolygons(verts, faces)
hb = info['headBox']
# Cranium centre: the middle of the head box in x/y, set back from the nose in z.
C = Vector((0.0, (hb['min'][1] + hb['max'][1]) / 2 + 0.005, (hb['min'][2] + hb['max'][2]) / 2 - 0.022))
HEAD_TOP = hb['max'][1]


def direction(az, el):
    return Vector((math.sin(az) * math.cos(el), math.sin(el), math.cos(az) * math.cos(el)))


def scalp_radius(d):
    """Distance from C to the outer skin along unit direction d."""
    hit = body.ray_cast(C + d * 0.6, -d, 0.7)
    if hit[0] is None:
        return 0.11
    return (hit[0] - C).length


def hairline(az):
    """Lowest elevation the cap covers at azimuth az (0 = front)."""
    a = abs(math.atan2(math.sin(az), math.cos(az)))
    front, side, back = 0.6, 0.12, -0.72
    if a < math.pi / 2:
        k = (1 - math.cos(a * 2)) / 2
        return front + (side - front) * k
    k = (1 - math.cos((a - math.pi / 2) * 2)) / 2
    return side + (back - side) * k


def cap_offset(el):
    return 0.0045 + 0.0055 * max(0.0, math.sin(el)) ** 1.5


# --- colours ----------------------------------------------------------------
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexcol(h, k=1.0):
    r, g, b = ((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255
    return tuple(min(1.0, srgb_to_linear(min(1.0, c * k))) for c in (r, g, b))


BROWN = 0x5a3820


class MeshBuilder:
    def __init__(self):
        self.v, self.f, self.c = [], [], []

    def vert(self, p, col):
        self.v.append(Vector(p))
        self.c.append(col)
        return len(self.v) - 1

    def object(self, name):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(p) for p in self.v], [], self.f)
        attr = me.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
        for i, col in enumerate(self.c):
            attr.data[i].color = (*col, 1.0)
        me.color_attributes.active_color = attr
        me.validate()
        me.update()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        for poly in me.polygons:
            poly.use_smooth = True
        return ob


hair = MeshBuilder()

# --- the hair volume ---------------------------------------------------------
# One sculpted shell, like the shared people's hair: a column per azimuth runs
# from the crown down over the scalp and, below the widest part of the head,
# falls straight to its length. Above the face the columns stop at the
# forehead hairline (a centre part); either side they frame the face to the
# chin, and towards the back they reach the shoulder blades. Ridges across the
# columns read as locks, and a zigzag hem gives pointed ends.
N_PHI, N_V = 128, 30
CLUMPS = 22
FACE = 0.9                     # half-angle of the opening for the face (rad)
FRAME = 0.55                   # how far round the hem sweeps from forehead to chin
NECK_Y = info['joints']['neck'][1]
SHOULDER_Y = info['joints']['upperArmL'][1]


def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def ridge(phi):
    return math.cos(phi * CLUMPS)


def tri(x):
    f = x - math.floor(x)
    return 1 - abs(f * 2 - 1)


def face_half(y):
    """Half-width of the face at height y, from the reference skin."""
    hit = body.ray_cast(Vector((0.3, y, 0.07)), Vector((-1, 0, 0)), 0.4)
    return hit[0].x if hit[0] is not None else 0.1


HAIRLINE_Y = C.y + 0.071


def column(phi):
    """Base points (on the scalp) and outward normals down one column."""
    a = abs(math.atan2(math.sin(phi), math.cos(phi)))
    frame = smoothstep(FACE, FACE + FRAME, a)          # 0 over the face, 1 beside and behind it
    back = smoothstep(math.pi / 2, math.pi, a)
    el_release = 0.1 - 0.42 * back                    # where hair leaves the head
    el_hairline = 0.6 - 0.12 * (a / FACE) ** 2         # forehead hairline over the face
    # A long bob: to the jaw beside the face, the top of the shoulders behind.
    y_end = (NECK_Y + 0.0) * (1 - back) + (SHOULDER_Y + 0.015) * back
    y_end -= 0.011 * (1 - tri(phi * CLUMPS / (2 * math.pi) + 0.5)) * frame
    head_len = 0.62                                    # share of rows on the head when it falls
    pts, nrm = [], []
    el_top = math.pi / 2 - 0.12
    el_low = el_hairline * (1 - frame) + el_release * frame
    rows_head = int(N_V * (1 - (1 - head_len) * frame))
    for j in range(N_V):
        if j < rows_head:
            u = j / max(1, rows_head - 1)
            el = el_top + (el_low - el_top) * u
            d = direction(phi, el)
            pts.append(C + d * (scalp_radius(d) + 0.004))
            nrm.append(d)
        else:
            # Falling: straight down from where it leaves the head, draping over
            # the collar and shoulders along the body's silhouette, never tucking
            # back under once it has rested on something.
            r0 = pts[rows_head - 1]
            out = Vector((r0.x - C.x, 0, r0.z - C.z)).normalized()
            if j == rows_head:
                # Stop above a shoulder rather than draping far out over it.
                base_r = Vector((r0.x - C.x, 0, r0.z - C.z)).length + 0.012
                y = r0.y
                while y > y_end:
                    y -= 0.005
                    hit = body.ray_cast(Vector((C.x, y, C.z)) + out * 0.5, -out, 0.5)
                    if hit[0] is not None and Vector((hit[0].x - C.x, 0, hit[0].z - C.z)).length + 0.012 > base_r + 0.03:
                        y_end = max(y_end, y + 0.012)
                        break
            u = (j - rows_head + 1) / max(1, N_V - rows_head)
            y = r0.y + (y_end - r0.y) * u
            radius = Vector((r0.x - C.x, 0, r0.z - C.z)).length + 0.012 * u ** 0.8
            hit = body.ray_cast(Vector((C.x, y, C.z)) + out * 0.5, -out, 0.5)
            if hit[0] is not None:
                radius = max(radius, Vector((hit[0].x - C.x, 0, hit[0].z - C.z)).length + 0.012)
            if len(pts) > rows_head:
                prev = pts[-1]
                radius = max(radius, Vector((prev.x - C.x, 0, prev.z - C.z)).length - 0.002)
            pts.append(Vector((C.x, y, C.z)) + out * radius)
            nrm.append(out)
    return pts, nrm, frame


def place_point(p, n, offset, side):
    q = p + n * offset
    # Never inside the head (the scalp plus the cap) ...
    if q.y > C.y - 0.15:
        d = (q - C).normalized()
        r = scalp_radius(d) + 0.004 + offset * 0.6
        if (q - C).length < r:
            q = C + d * r
    # ... never over the face: the hair frames it from the sides ...
    if q.z > 0.0 and q.y < HAIRLINE_Y and q.y > C.y - 0.21:
        lim = face_half(q.y) + 0.012 + offset
        if abs(q.x) < lim:
            q.x = math.copysign(lim, q.x if abs(q.x) > 1e-4 else side)
    # ... and clear of the neck, shoulders and back.
    if q.y < C.y - 0.05:
        loc, nrm_b, _, dist = body.find_nearest(q, 0.1)
        if loc is not None:
            margin = 0.01 + offset * 0.5
            if (q - loc).dot(nrm_b) < 0 or dist < margin:
                q = loc + nrm_b * margin
    return q


I, T, OC = [], [], []
for i in range(N_PHI):
    phi = -math.pi + 2 * math.pi * (i + 0.5) / N_PHI
    side = 1 if math.sin(phi) >= 0 else -1
    pts, nrm, frame = column(phi)
    rid = ridge(phi)
    part = math.exp(-(phi / 0.05) ** 2)                # the centre part, a soft groove at the front
    i_col, t_col, c_col = [], [], []
    for j, (p, n) in enumerate(zip(pts, nrm)):
        v = j / (N_V - 1)
        thick = (0.011 + 0.006 * (1 - v)) * (0.35 + 0.65 * frame) + 0.0015 * rid * smoothstep(0.15, 0.6, v)
        thick -= 0.004 * part * (1 - v)
        thick *= 1 - 0.55 * smoothstep(0.85, 1.0, v)   # thinner towards the ends
        i_col.append(place_point(p, n, 0.0015, side))
        t_col.append(max(0.0035, thick))
        c_col.append((0.82 + 0.08 * rid + 0.1 * v) * (1 - 0.15 * part))
    I.append(i_col)
    T.append(t_col)
    OC.append(c_col)


def relax(grid, passes, keep_top=2):
    for _ in range(passes):
        nxt = [col[:] for col in grid]
        for i in range(N_PHI):
            for j in range(keep_top, N_V):
                a, b = grid[(i - 1) % N_PHI][j], grid[(i + 1) % N_PHI][j]
                up = grid[i][j - 1]
                dn = grid[i][j + 1] if j + 1 < N_V else grid[i][j]
                nxt[i][j] = grid[i][j] * 0.4 + (a + b) * 0.2 + (up + dn) * 0.1
        grid[:] = nxt


def side_of(i):
    return 1 if math.sin(-math.pi + 2 * math.pi * (i + 0.5) / N_PHI) >= 0 else -1


# The inner layer: smooth away kinks from the ears and shoulders, then make
# sure nothing sank back into the head, over the face or into the body.
for _ in range(3):
    relax(I, 3)
    for i in range(N_PHI):
        for j in range(N_V):
            I[i][j] = place_point(I[i][j], Vector((0, 0, 0)), 0.0015, side_of(i))
# The outer layer follows the inner one along its surface normal.
O = []
for i in range(N_PHI):
    col = []
    for j in range(N_V):
        a, b = I[(i - 1) % N_PHI][j], I[(i + 1) % N_PHI][j]
        up, dn = I[i][max(0, j - 1)], I[i][min(N_V - 1, j + 1)]
        n = (b - a).cross(dn - up)
        radial = I[i][j] - C if I[i][j].y > C.y - 0.06 else Vector((I[i][j].x - C.x, 0, I[i][j].z - C.z))
        if n.length < 1e-9:
            n = radial
        n = n.normalized()
        if n.dot(radial) < 0:
            n = -n
        q = I[i][j] + n * T[i][j]
        # The face stays clear on the outside too.
        if q.z > 0.0 and q.y < HAIRLINE_Y and q.y > C.y - 0.21:
            lim = face_half(q.y) + 0.012 + T[i][j]
            if abs(q.x) < lim:
                q.x = math.copysign(lim, q.x if abs(q.x) > 1e-4 else side_of(i))
        col.append(q)
    O.append(col)
outer = [[hair.vert(O[i][j], hexcol(BROWN, OC[i][j])) for j in range(N_V)] for i in range(N_PHI)]
inner = [[hair.vert(I[i][j], hexcol(BROWN, 0.7)) for j in range(N_V)] for i in range(N_PHI)]
for i in range(N_PHI):
    i2 = (i + 1) % N_PHI
    for j in range(N_V - 1):
        hair.f.append((outer[i][j], outer[i2][j], outer[i2][j + 1], outer[i][j + 1]))
        hair.f.append((inner[i][j], inner[i][j + 1], inner[i2][j + 1], inner[i2][j]))
    # The hem: close outer to inner along the bottom row.
    hair.f.append((outer[i][-1], outer[i2][-1], inner[i2][-1], inner[i][-1]))
# The crown: fan both layers to a pole.
pole_d = Vector((0, 1, 0))
po = hair.vert(C + pole_d * (scalp_radius(pole_d) + 0.004 + 0.017), hexcol(BROWN, 0.9))
pi_ = hair.vert(C + pole_d * (scalp_radius(pole_d) + 0.0055), hexcol(BROWN, 0.7))
for i in range(N_PHI):
    i2 = (i + 1) % N_PHI
    hair.f.append((outer[i2][0], outer[i][0], po))
    hair.f.append((inner[i][0], inner[i2][0], pi_))

cap_bvh = BVHTree.FromPolygons(hair.v, hair.f)   # the finished hair, for the beret
hair_ob = hair.object('KeramikerHair')

# --- beret ------------------------------------------------------------------
# Worn like the game's beret (headTop socket, tilted back and slouched to her
# left). The band hugs the head like elastic: round each angle it sits just
# outside the hair (or the forehead skin, where the beret covers it), and the
# felt crown above follows the band's shape.
beret = MeshBuilder()
k = 1.15 * S                              # the head is drawn 1.15x life size
socket = Vector(info['sockets']['headTop'])
place = Matrix.Translation(socket + Vector((-0.006 * S, -0.018 * S, -0.012 * S))) @ Matrix.Rotation(-0.26, 4, 'Z') @ Matrix.Rotation(-0.34, 4, 'X')
rot = place.to_3x3()
BAND_Y = -0.05 * k
band_centre = place @ Vector((0, BAND_Y, 0))
SEG = 44
CLEAR = 0.012      # felt over the outer lock layer on the scalp


def band_radius(a):
    d = rot @ Vector((math.cos(a), 0, math.sin(a)))
    best = 0.0
    hit = cap_bvh.ray_cast(band_centre + d * 0.4, -d, 0.45)
    if hit[0] is not None:
        best = max(best, (hit[0] - band_centre).length + CLEAR)
    hit = body.ray_cast(band_centre + d * 0.4, -d, 0.45)
    if hit[0] is not None:
        best = max(best, (hit[0] - band_centre).length + 0.006)
    return best or 0.084 * k


radii = [band_radius(2 * math.pi * i / SEG) for i in range(SEG)]
# Soften the band shape so it reads as cloth, not a cast of the skull.
for _ in range(3):
    radii = [(radii[i - 1] + radii[i] * 2 + radii[(i + 1) % SEG]) / 4 for i in range(SEG)]
BASE = 0.082 * k
profile = [(0.082, -0.05), (0.09, -0.046), (0.106, -0.036), (0.122, -0.022), (0.13, -0.01), (0.132, 0.0),
           (0.124, 0.012), (0.104, 0.022), (0.084, 0.027), (0.062, 0.03), (0.042, 0.032), (0.024, 0.033), (0.01, 0.0335), (0.0, 0.0337)]
FELT = 0x1d1d24
ring_ids = []
for (r, y) in profile:
    ring = []
    for i in range(SEG):
        a = 2 * math.pi * i / SEG
        # The band radius plus the profile's overhang; the top rounds off to the stalk.
        # The band radius plus the profile's overhang, easing into a round top.
        over = radii[i] + (r - 0.082) * k * 0.5
        top = r * k * 1.5
        rr = over if r >= 0.062 else top + (over - top) * max(0.0, (r - 0.0) / 0.062) ** 2
        sag = 0.012 * max(0.0, math.cos(a - 0.5)) ** 2 * (r / 0.136)
        p = Vector((math.cos(a) * rr, (y - sag) * k, math.sin(a) * rr))
        ring.append(beret.vert(p, hexcol(FELT, 0.95 + 0.08 * (y + 0.05) / 0.1)))
    ring_ids.append(ring)
for j in range(len(ring_ids) - 1):
    for i in range(SEG):
        a, b = ring_ids[j][i], ring_ids[j][(i + 1) % SEG]
        c, d = ring_ids[j + 1][(i + 1) % SEG], ring_ids[j + 1][i]
        beret.f.append((a, d, c, b))
# Rolled band round the opening (a flattened tube on the band line).
TR = 0.0065 * k
band = []
for i in range(SEG):
    a = 2 * math.pi * i / SEG
    ring = []
    for sdx in range(6):
        b = 2 * math.pi * sdx / 6
        rr = radii[i] + TR * 0.6 + math.cos(b) * TR
        p = Vector((math.cos(a) * rr, BAND_Y + math.sin(b) * TR * 0.8, math.sin(a) * rr))
        ring.append(beret.vert(p, hexcol(FELT, 0.85)))
    band.append(ring)
for i in range(SEG):
    for sdx in range(6):
        a, b = band[i][sdx], band[i][(sdx + 1) % 6]
        c, d = band[(i + 1) % SEG][(sdx + 1) % 6], band[(i + 1) % SEG][sdx]
        beret.f.append((a, b, c, d))
# The stalk on top.
stalk = []
for y, r in ((0.031, 0.008), (0.053, 0.006)):
    stalk.append([beret.vert((math.cos(2 * math.pi * i / 6) * r * k, y * k, math.sin(2 * math.pi * i / 6) * r * k), hexcol(FELT, 0.9)) for i in range(6)])
for i in range(6):
    beret.f.append((stalk[0][i], stalk[1][i], stalk[1][(i + 1) % 6], stalk[0][(i + 1) % 6]))
beret.f.append(tuple(stalk[1][::-1]))
beret.v = [place @ p for p in beret.v]
# The felt always lies over the hair: lift each crown ring (and the stalk with
# the top) along the beret's up axis until it clears the hair, keeping the
# shape smooth.
up_axis = (rot @ Vector((0, 1, 0))).normalized()


def deficit(p):
    d = (p - C).normalized()
    hit = cap_bvh.ray_cast(C + d * 0.6, -d, 0.7)
    return ((hit[0] - C).length + 0.012) - (p - C).length if hit[0] is not None else 0.0


ring_lift = []
for j, ring in enumerate(ring_ids):
    if j < 2:
        ring_lift.append(0.0)
        continue
    need = 0.0
    for _ in range(30):
        worst = max(deficit(beret.v[vid] + up_axis * need) for vid in ring)
        if worst <= 0:
            break
        need += max(0.001, worst * 0.7)
    ring_lift.append(need)
for j in range(1, len(ring_lift)):
    ring_lift[j] = max(ring_lift[j], ring_lift[j - 1] * 0.92)
for j, ring in enumerate(ring_ids):
    for vid in ring:
        beret.v[vid] = beret.v[vid] + up_axis * ring_lift[j]
for ring in stalk:
    for vid in ring:
        beret.v[vid] = beret.v[vid] + up_axis * ring_lift[-1]
beret_ob = beret.object('KeramikerBeret')

# --- export -----------------------------------------------------------------
for ob in (hair_ob, beret_ob):
    ob.select_set(True)
bpy.context.view_layer.objects.active = hair_ob
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=False, export_materials='NONE',
                          export_vertex_color='ACTIVE', export_normals=True, export_texcoords=False, export_animations=False,
                          export_skins=False, export_morph=False, export_extras=False)
tris = lambda ob: sum(len(p.vertices) - 2 for p in ob.data.polygons)
print(json.dumps({'hairTris': tris(hair_ob), 'beretTris': tris(beret_ob), 'band': [round(min(radii), 4), round(max(radii), 4)],
                  'bytes': os.path.getsize(OUT), 'centre': [round(x, 4) for x in C]}))
