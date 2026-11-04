/**
 * Pekkas Lerduvor — the grass.
 *
 * The single biggest thing an outdoor scene can have. Built the way the
 * mobile-friendly recipe says to build it:
 *
 *  - ONE InstancedMesh of tapered three-segment blades (7 vertices each),
 *    so the whole meadow is a single draw call
 *  - all wind lives in the VERTEX SHADER — no per-frame JavaScript loop
 *    ever touches a blade
 *  - the wind is three layered frequencies rather than one sine, plus a
 *    slow gust travelling across the field, which is what stops it
 *    reading as a mechanical shimmer
 *  - blades bend quadratically from a planted base, so the roots stay put
 *  - no shadow CASTING from the grass: that is the expensive part, and at
 *    this density it buys nothing (it does receive the sun's shadows)
 *  - backlit translucency, the look that makes golden hour golden: with
 *    the sun low in front of the shooter, blades seen against it glow
 *    warm at the tips. It costs one dot product per vertex — the term is
 *    computed in the vertex shader and only added in the fragment
 *
 * Density falls off with distance from the shooting station, so the frame
 * is dense where the camera actually looks and cheap out at the treeline.
 */

import * as THREE from 'three';

const BLADE_H = 0.26;

/** A tapered blade: three quads narrowing to a tip. 7 verts, 5 tris. */
function bladeGeometry() {
  const w0 = 0.032;
  const rows = [
    { y: 0, w: w0 },
    { y: BLADE_H * 0.38, w: w0 * 0.78 },
    { y: BLADE_H * 0.72, w: w0 * 0.46 }
  ];
  const pos = [];
  const uvy = [];
  const push = (x, y, z, v) => {
    pos.push(x, y, z);
    uvy.push(v);
  };
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    const va = a.y / BLADE_H;
    const vb = b.y / BLADE_H;
    push(-a.w, a.y, 0, va); push(a.w, a.y, 0, va); push(-b.w, b.y, 0, vb);
    push(a.w, a.y, 0, va); push(b.w, b.y, 0, vb); push(-b.w, b.y, 0, vb);
  }
  // Tip
  const last = rows[rows.length - 1];
  const vl = last.y / BLADE_H;
  push(-last.w, last.y, 0, vl); push(last.w, last.y, 0, vl); push(0, BLADE_H, 0, 1);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aHeight', new THREE.BufferAttribute(new Float32Array(uvy), 1));
  // Straight-up normals on every blade. A blade's real normal faces
  // sideways, which under a low sun leaves the whole meadow unlit and
  // black; the up-facing card normal is what stylized grass shaders use
  // and it makes the field read as one lit surface.
  const n = new Float32Array(pos.length);
  for (let i = 0; i < pos.length / 3; i++) {
    n[i * 3 + 1] = 1;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));

  // A white-ish vertex colour is REQUIRED, not optional: the material needs
  // vertexColors:true for per-instance tinting to reach the fragment stage,
  // and with that define set three multiplies by the geometry's `color`
  // attribute — which, if absent, reads as black and kills the whole field.
  // Baking a root-to-tip ramp into it also gives free occlusion at the base.
  const vcol = new Float32Array(pos.length);
  for (let i = 0; i < pos.length / 3; i++) {
    const shade = 0.52 + 0.48 * uvy[i];
    vcol[i * 3] = shade;
    vcol[i * 3 + 1] = shade;
    vcol[i * 3 + 2] = shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(vcol, 3));
  return g;
}

/**
 * Scatter blades over a disc, densest near the station.
 * `rand` is the caller's seeded RNG so the field is stable between runs.
 */
export function buildGrass(rand, { count = 23000, inner = 0.3, outer = 30, sunDir, sunColor } = {}) {
  const geo = bladeGeometry();

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide
  });

  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: sunDir.clone() },
    uSunColor: { value: new THREE.Color(sunColor) }
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        uniform float uTime;
        uniform vec3 uSunDir;
        attribute float aHeight;
        varying float vTrans;
      `)
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        // Where in the world this blade is planted (the meadow mesh sits at the origin)
        vec3 blade = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        // Far blades get wider. A blade a few centimetres across is under a
        // pixel at 20 m, and sub-pixel geometry swaying in the wind is what
        // shimmers; the outer field is sparse anyway, so wider blades there
        // also close the gaps.
        transformed.x *= clamp(distance(blade, cameraPosition) / 11.0, 1.0, 2.3);
        // Three layered frequencies — one sine alone reads as a machine
        float w = sin(uTime * 1.6 + blade.x * 0.42 + blade.z * 0.31)
                + sin(uTime * 2.9 + blade.x * 0.83) * 0.45
                + sin(uTime * 0.7 + blade.z * 0.17) * 0.75;
        // …and a slow gust that travels across the meadow
        float gust = 0.55 + 0.45 * sin(uTime * 0.55 - blade.x * 0.055 - blade.z * 0.03);
        // Quadratic bend keeps the root planted and throws the tip
        float bend = aHeight * aHeight * gust;
        transformed.x += w * bend * 0.20;
        transformed.z += w * bend * 0.11;
        transformed.y -= abs(w) * bend * 0.035;
      `)
      .replace('#include <fog_vertex>', `
        #include <fog_vertex>
        // Translucency: how directly this blade stands between eye and sun.
        // Tips transmit, roots don't (they're shaded by the sward anyway).
        vec4 gWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        vec3 gView = normalize(gWorld.xyz - cameraPosition);
        float back = max(dot(gView, uSunDir), 0.0);
        vTrans = back * back * back * aHeight * aHeight;
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        uniform vec3 uSunColor;
        varying float vTrans;
      `)
      .replace('#include <opaque_fragment>', `
        outgoingLight += diffuseColor.rgb * uSunColor * vTrans * 1.6;
        #include <opaque_fragment>
      `);
  };
  material.customProgramCacheKey = () => 'pp-grass';

  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const lean = new THREE.Quaternion();
  const leanAxis = new THREE.Vector3();
  const colour = new THREE.Color();

  // Two greens plus a straw tone — the straw is what makes it read as
  // an August field rather than a golf course.
  const GREEN_DARK = new THREE.Color(0x6d8a34);
  const GREEN_LIGHT = new THREE.Color(0xa2bd48);
  const STRAW = new THREE.Color(0xd6c268);

  let placed = 0;
  let guard = 0;
  // The trap house's berm gets its own share: at 15 m the main scatter is
  // too thin to read as turf on a slope that faces the camera
  const BERM = Math.round(count * 0.04);
  while (placed < count && guard < count * 6) {
    guard++;
    const bermPass = placed >= count - BERM;
    // Very heavily biased inward. Grass is deceptive: at 20 m you look at
    // it edge-on and blades stack into a mat, but at 4 m you look DOWN on
    // it and the same density reads as bald ground. Beating that needs
    // roughly 200 blades/m² underfoot, which means most of the budget
    // lives inside the first few metres.
    const r = inner + (outer - inner) * (rand() ** 3.5);
    const a = rand() * Math.PI * 2;
    const x = bermPass ? (rand() - 0.5) * 4.3 : Math.cos(a) * r;
    const z = bermPass ? -15.7 + rand() * 2.4 : Math.sin(a) * r;

    // Keep the mat, the rail and the crowd's feet clear
    if (Math.abs(x) < 0.95 && Math.abs(z) < 1.2) continue;
    if (Math.abs(x) < 3.4 && z > 1.8 && z < 3.2) continue;
    // And the trap house itself (its berm, in front, grows grass)
    if (Math.abs(x) < 2.3 && z < -15.7 && z > -18.9) continue;
    // On the berm, plant at its surface (range.js: 0.78 m high at the
    // bunker, falling to the field 2.6 m out)
    const onBerm = Math.abs(x) < 2.15 && z <= -13.3 && z >= -15.7;
    const bermY = onBerm ? 0.78 * Math.max(0, 1 - (z + 15.92) / 2.6) ** 1.6 : 0;

    pos.set(x, 0.02 + bermY, z); // clear of the ground plane, out of z-fight range
    // Yaw, then a real lean. Bolt-upright blades vanish when you look down
    // on them from standing height — a leaning blade always shows a face.
    q.setFromAxisAngle(up, rand() * Math.PI);
    lean.setFromAxisAngle(
      leanAxis.set(rand() - 0.5, 0, rand() - 0.5).normalize(),
      (0.12 + rand() * 0.42)
    );
    q.multiply(lean);
    const s = 0.72 + rand() * 0.6;
    // Trodden down around the station: a shooter stands on a worn pad, and
    // waist-high grass right under the muzzle would just block the view.
    const mow = bermPass ? 1 : 0.34 + 0.66 * Math.min(1, Math.max(0, (r - 1.6) / 5.5));
    scl.set(s, s * (0.75 + rand() * 0.45) * mow, s);
    m.compose(pos, q, scl);
    mesh.setMatrixAt(placed, m);

    const k = rand();
    colour.copy(GREEN_DARK).lerp(GREEN_LIGHT, rand());
    if (k > 0.78) colour.lerp(STRAW, 0.35 + rand() * 0.45);
    // Slight darkening far out helps the aerial perspective read
    colour.multiplyScalar(0.88 + rand() * 0.26);
    mesh.setColorAt(placed, colour);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return { mesh, uniforms };
}

export default buildGrass;
