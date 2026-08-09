/**
 * Pekkas Fiske — the lake.
 *
 * Built once, procedurally, with no downloaded assets:
 *
 *  - a gradient sky dome with a real midnight sun and its glow
 *  - a water sheet displaced on the GPU, shaded differently above and
 *    below the waterline: from underneath you get Snell's window (bright
 *    straight up, mirrored at grazing angles) with caustics crawling
 *    across it, from above a sun-glitter path
 *  - a caustics texture generated from tiling wave interference, so it
 *    loops seamlessly and costs one 256px canvas
 *  - a rowboat with a tunna, an oar and a fisherman whose rod actually
 *    bends when the reel turns
 *  - light shafts that fade with vertex colour instead of alpha, so they
 *    additively blend without sorting artefacts
 *  - marine snow in a box that follows the camera, which is what sells
 *    the sense of sinking
 */

import * as THREE from 'three';

export const BOTTOM = 60;

/* ------------------------------------------------------------- procedural */

/** Seamless caustic web from summed tiling waves, ridged to thin filaments. */
export function causticTexture(size = 256) {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const waves = [
    [3, 1, 0.0], [1, 3, 1.1], [4, -2, 2.3],
    [-2, 4, 3.7], [5, 3, 0.6], [3, -5, 4.2], [6, -1, 5.1]
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (let i = 0; i < waves.length; i++) {
        const [m, n, ph] = waves[i];
        v += Math.sin(2 * Math.PI * ((m * x) / size + (n * y) / size) + ph);
      }
      v /= waves.length;
      const ridge = (1 - Math.abs(v)) ** 7;
      const c = Math.min(255, ridge * 300);
      const o = (y * size + x) * 4;
      img.data[o] = c;
      img.data[o + 1] = c;
      img.data[o + 2] = c;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Soft round sprite for drifting particles. */
export function sparkTexture(size = 64) {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}

/* ------------------------------------------------------------------- sky */

export function buildSky() {
  const uniforms = {
    uZenith: { value: new THREE.Color(0x1d5b96) },
    uHorizon: { value: new THREE.Color(0xffbe7d) },
    uSunColor: { value: new THREE.Color(0xfff0c8) },
    uSunDir: { value: new THREE.Vector3(0.16, 0.125, -0.978).normalize() },
    uOpacity: { value: 1 }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    transparent: true,
    fog: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uZenith, uHorizon, uSunColor, uSunDir;
      uniform float uOpacity;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        // Almost all of the gradient happens in the first few degrees above
        // the horizon — that is what makes a low sun read as a low sun.
        float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(uHorizon, uZenith, pow(h, 0.42));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        c += uSunColor * smoothstep(0.9986, 0.9994, s) * 3.2;
        c += uSunColor * pow(s, 26.0) * 0.75;
        c += uSunColor * pow(s, 3.0) * 0.22;
        gl_FragColor = vec4(c, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), mat);
  dome.renderOrder = -10;
  return { dome, uniforms, material: mat };
}

/** Ridge line, two ranks of spruce and a few clouds — the composition. */
export function buildShore() {
  const g = new THREE.Group();
  const rand = mulberry(7);

  const ridge = (z, color, hScale, count, spread) => {
    const parts = [];
    for (let i = 0; i < count; i++) {
      const h = (1.4 + rand() * 2.8) * hScale;
      const w = (0.6 + rand() * 0.5) * hScale;
      const tree = new THREE.ConeGeometry(w, h, 5);
      tree.translate(-spread / 2 + (i / count) * spread + rand() * 3, h / 2, z + rand() * 6);
      parts.push(tree.toNonIndexed());
    }
    const merged = mergeGeos(parts);
    const m = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color, fog: false }));
    m.renderOrder = -8;
    return m;
  };

  // Far range washed out by aerial perspective, near range darker
  const hills = new THREE.Mesh(
    hillGeometry(rand),
    new THREE.MeshBasicMaterial({ color: 0x6d7f96, fog: false })
  );
  hills.position.set(0, 0, -260);
  hills.renderOrder = -9;
  g.add(hills);
  // Three ranks, each paler than the one in front: distance is sold by
  // colour, not by detail.
  g.add(ridge(-240, 0x7d8fa4, 4.0, 34, 560));
  g.add(ridge(-180, 0x4a5c6e, 3.4, 40, 420));
  g.add(ridge(-120, 0x22303c, 2.4, 48, 320));

  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffdcb0, fog: false, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 7; i++) {
    const cloud = new THREE.Group();
    const n = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const s = 6 + rand() * 9;
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), cloudMat);
      puff.position.set(k * s * 1.1 - n * 3, rand() * s * 0.4, rand() * 6);
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(-220 + rand() * 440, 40 + rand() * 50, -220 - rand() * 90);
    cloud.renderOrder = -9;
    g.add(cloud);
  }
  return g;
}

function hillGeometry(rand) {
  const pts = [];
  const span = 900;
  const n = 26;
  const heights = [];
  for (let i = 0; i <= n; i++) heights.push(14 + Math.sin(i * 0.7) * 10 + rand() * 16);
  for (let i = 0; i < n; i++) {
    const x0 = -span / 2 + (i / n) * span;
    const x1 = -span / 2 + ((i + 1) / n) * span;
    pts.push(x0, 0, 0, x1, 0, 0, x0, heights[i], 0);
    pts.push(x1, 0, 0, x1, heights[i + 1], 0, x0, heights[i], 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  g.computeVertexNormals();
  return g;
}

function mulberry(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mergeGeos(list) {
  let total = 0;
  list.forEach((g) => {
    total += g.attributes.position.count;
  });
  const pos = new Float32Array(total * 3);
  let o = 0;
  list.forEach((g) => {
    pos.set(g.attributes.position.array, o);
    o += g.attributes.position.count * 3;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}

/* ----------------------------------------------------------------- water */

export function buildWater(caustics) {
  const uniforms = {
    uTime: { value: 0 },
    uCaustics: { value: caustics },
    uSky: { value: new THREE.Color(0xffe0b4) },
    uSkyRefl: { value: new THREE.Color(0x7ea8c6) },
    uShallow: { value: new THREE.Color(0x2f9fa8) },
    uDeepTint: { value: new THREE.Color(0x06202e) },
    uSunDir: { value: new THREE.Vector3(0.16, 0.125, -0.978).normalize() },
    uFogColor: { value: new THREE.Color(0x1d6b74) },
    uFogDensity: { value: 0.02 },
    uCausticStrength: { value: 1 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    transparent: true,
    fog: false,
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNrm;
      varying float vDepth;

      float h(vec2 p, float t) {
        return sin(p.x * 0.32 + t * 1.10) * 0.30
             + sin(p.y * 0.41 - t * 0.85) * 0.24
             + sin((p.x + p.y) * 0.19 + t * 1.60) * 0.16
             + sin(p.x * 1.70 + t * 2.60) * 0.045
             + sin(p.y * 1.90 - t * 2.20) * 0.040;
      }

      void main() {
        vec3 p = position;
        vec4 w = modelMatrix * vec4(p, 1.0);
        float t = uTime;
        w.y += h(w.xz, t);
        // Analytic normal from the same three waves
        float dx = cos(w.x * 0.32 + t * 1.10) * 0.30 * 0.32
                 + cos((w.x + w.z) * 0.19 + t * 1.60) * 0.16 * 0.19
                 + cos(w.x * 1.70 + t * 2.60) * 0.045 * 1.70;
        float dz = cos(w.z * 0.41 - t * 0.85) * 0.24 * 0.41
                 + cos((w.x + w.z) * 0.19 + t * 1.60) * 0.16 * 0.19
                 + cos(w.z * 1.90 - t * 2.20) * 0.040 * 1.90;
        vNrm = normalize(vec3(-dx, 1.0, -dz));
        vWorld = w.xyz;
        vec4 mv = viewMatrix * w;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uCaustics;
      uniform vec3 uSky, uSkyRefl, uShallow, uDeepTint, uSunDir, uFogColor;
      uniform float uFogDensity, uTime, uCausticStrength;
      varying vec3 vWorld;
      varying vec3 vNrm;
      varying float vDepth;

      float web(vec2 p) {
        float a = texture2D(uCaustics, p * 0.045 + vec2(uTime * 0.012, uTime * 0.008)).r;
        float b = texture2D(uCaustics, p * 0.031 - vec2(uTime * 0.009, uTime * 0.014)).r;
        return a * b * 2.4;
      }

      void main() {
        vec3 N = normalize(vNrm);
        vec3 V = normalize(cameraPosition - vWorld);
        float facing = dot(N, V);
        vec3 col;
        float alpha;

        if (facing < 0.0) {
          // --- seen from underneath: Snell's window straight up, mirror at
          // grazing angles, caustics crawling over the ceiling ---
          float up = clamp(-facing, 0.0, 1.0);
          float window = smoothstep(0.12, 0.62, up);
          float caust = web(vWorld.xz) * uCausticStrength;
          vec3 ceiling = mix(uDeepTint, uSky, window);
          ceiling += vec3(0.55, 0.85, 0.8) * caust * (0.25 + window * 0.9);
          col = ceiling;
          alpha = 0.94;
        } else {
          // --- seen from above: sky tint, fresnel rim and a sun glitter path ---
          float fres = pow(1.0 - clamp(facing, 0.0, 1.0), 5.0);
          col = mix(uShallow, uSkyRefl, fres * 0.8);
          vec3 H = normalize(normalize(uSunDir) + V);
          float spec = pow(max(dot(N, H), 0.0), 160.0);
          col += uSky * spec * 2.1;                       // the glitter path
          col += vec3(0.45, 0.72, 0.7) * web(vWorld.xz) * 0.1 * uCausticStrength;
          alpha = 0.82;
        }

        float f = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
        col = mix(col, uFogColor, f);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });

  const geo = new THREE.PlaneGeometry(220, 150, 72, 44);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 2;
  return { mesh, uniforms, material };
}

/* ------------------------------------------------------------------ boat */

function woodMat(color) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

export function buildBoat() {
  const g = new THREE.Group();

  /* Hull: a side profile extruded across the beam, then pinched at bow
     and stern so it stops being a slab and becomes a boat. */
  const shape = new THREE.Shape();
  shape.moveTo(-2.35, 0.62);
  shape.lineTo(2.5, 0.86);
  shape.lineTo(2.78, 0.18);
  shape.quadraticCurveTo(1.4, -0.62, 0.1, -0.66);
  shape.quadraticCurveTo(-1.5, -0.62, -2.35, -0.12);
  shape.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.9, bevelEnabled: false, curveSegments: 4 });
  hullGeo.translate(0, 0, -0.95);
  const hp = hullGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i);
    const k = Math.min(1, Math.max(0, (Math.abs(x) - 1.1) / 1.7));
    hp.setZ(i, hp.getZ(i) * (1 - 0.72 * k * k));
  }
  hullGeo.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeo, woodMat(0x9c5f2c));
  g.add(hull);

  // Dark interior so the boat reads as open, not solid
  const inner = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 0.5, 1.35),
    new THREE.MeshLambertMaterial({ color: 0x3d2413, flatShading: true })
  );
  inner.position.set(0.1, 0.5, 0);
  g.add(inner);

  // Gunwale
  const rimMat = woodMat(0xc98a4b);
  [1, -1].forEach((s) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.16, 0.17), rimMat);
    rail.position.set(0.1, 0.74, s * 0.72);
    rail.rotation.y = s * 0.04;
    g.add(rail);
  });

  // Thwarts
  [-0.9, 0.9].forEach((x) => {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.11, 1.5), rimMat);
    seat.position.set(x, 0.72, 0);
    g.add(seat);
  });

  /* The tunna — the target every tapped fish flies into */
  const barrel = new THREE.Group();
  const staves = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.4, 0.95, 12, 1), woodMat(0x8a5a30));
  barrel.add(staves);
  [-0.3, 0.3].forEach((y) => {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.455, 0.045, 4, 14), woodMat(0x4a4f5c));
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    barrel.add(hoop);
  });
  barrel.position.set(1.75, 1.05, 0);
  g.add(barrel);

  /* Oar resting across the gunwale */
  const oar = new THREE.Group();
  const shaftMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.1, 6), woodMat(0xb07b40));
  shaftMesh.rotation.z = Math.PI / 2;
  oar.add(shaftMesh);
  const bladeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.3), woodMat(0xb07b40));
  bladeMesh.position.x = -1.75;
  oar.add(bladeMesh);
  oar.position.set(-0.4, 0.86, -0.55);
  oar.rotation.y = 0.22;
  g.add(oar);

  /* Fisherman */
  const guy = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xe6b184, flatShading: true });
  const coat = new THREE.MeshLambertMaterial({ color: 0xf2c14e, flatShading: true });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c4a72, flatShading: true });

  [-0.22, 0.22].forEach((z) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.62, 6), pants);
    leg.position.set(0.12, 0.42, z);
    guy.add(leg);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.24), new THREE.MeshLambertMaterial({ color: 0x22303c, flatShading: true }));
    boot.position.set(0.2, 0.12, z);
    guy.add(boot);
  });

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.86, 7), coat);
  torso.position.y = 1.14;
  guy.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), skin);
  head.position.y = 1.76;
  guy.add(head);
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 5), new THREE.MeshLambertMaterial({ color: 0xcbb59a, flatShading: true }));
  beard.position.set(0.09, 1.66, 0);
  beard.scale.set(0.9, 0.75, 0.85);
  guy.add(beard);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.29, 0.2, 8), new THREE.MeshLambertMaterial({ color: 0xb23a48, flatShading: true }));
  cap.position.y = 1.95;
  guy.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.42), new THREE.MeshLambertMaterial({ color: 0x8e2c38, flatShading: true }));
  brim.position.set(0.26, 1.88, 0);
  guy.add(brim);
  const bobble = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshLambertMaterial({ color: 0xf6f1e4, flatShading: true }));
  bobble.position.y = 2.09;
  guy.add(bobble);

  // Arms + rod live in their own pivot so the cast can be animated
  const arms = new THREE.Group();
  arms.position.set(0.12, 1.42, 0);
  [-0.34, 0.34].forEach((z) => {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.72, 6), coat);
    arm.position.set(0.2, -0.16, z);
    arm.rotation.z = -0.95;
    arms.add(arm);
  });
  const rod = new THREE.Group();
  const rodMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.055, 3.0, 5), woodMat(0x2f2418));
  rodMesh.position.x = 1.5;
  rodMesh.rotation.z = Math.PI / 2;
  rod.add(rodMesh);
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 8), new THREE.MeshLambertMaterial({ color: 0x9aa4b8, flatShading: true }));
  reel.position.set(0.34, -0.16, 0);
  rod.add(reel);
  rod.position.set(0.38, -0.28, 0.1);
  rod.rotation.z = 0.5;
  arms.add(rod);
  guy.add(arms);

  guy.position.set(-0.55, 0.5, 0);
  guy.rotation.y = -0.12;
  g.add(guy);

  /* Foam ring where the hull meets the water */
  const foam = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.0, 20),
    new THREE.MeshBasicMaterial({
      color: 0xdff5f2,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    })
  );
  foam.rotation.x = -Math.PI / 2;
  foam.scale.z = 0.62;
  foam.position.y = 0.02;

  g.userData = { guy, arms, rod, rodTip: new THREE.Vector3(2.9, 0, 0), barrel, foam, oar };
  return g;
}

/* --------------------------------------------------------------- seabed */

export function buildSeabed() {
  const g = new THREE.Group();
  const rand = mulberry(19);

  const bed = new THREE.PlaneGeometry(180, 70, 34, 16);
  bed.rotateX(-Math.PI / 2);
  const bp = bed.attributes.position;
  const colors = new Float32Array(bp.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i);
    const z = bp.getZ(i);
    const hgt =
      Math.sin(x * 0.11) * 1.1 +
      Math.cos(z * 0.17 + 1.2) * 0.8 +
      Math.sin(x * 0.31 + z * 0.21) * 0.45;
    bp.setY(i, hgt);
    // Silt in the hollows, paler crests
    c.set(0x1d2536).lerp(new THREE.Color(0x4b5468), Math.min(1, Math.max(0, hgt * 0.28 + 0.5)));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  bed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  bed.computeVertexNormals();
  g.add(new THREE.Mesh(bed, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));

  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x39415a, flatShading: true });
  for (let i = 0; i < 16; i++) {
    const s = 0.5 + rand() * 1.5;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), stoneMat);
    stone.position.set(-30 + rand() * 60, s * 0.35, -8 + rand() * 14);
    stone.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    stone.scale.y = 0.6 + rand() * 0.4;
    g.add(stone);
  }

  // A sunken rowboat, half buried — a landmark that says "you made it down"
  const wreck = new THREE.Group();
  const wshape = new THREE.Shape();
  wshape.moveTo(-1.8, 0.4);
  wshape.lineTo(1.9, 0.5);
  wshape.lineTo(2.1, 0.1);
  wshape.quadraticCurveTo(0, -0.5, -1.8, -0.05);
  wshape.closePath();
  const wg = new THREE.ExtrudeGeometry(wshape, { depth: 1.4, bevelEnabled: false, curveSegments: 3 });
  wg.translate(0, 0, -0.7);
  wreck.add(new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: 0x2b3a3a, flatShading: true })));
  wreck.position.set(-13, 0.5, -3);
  wreck.rotation.set(0.2, 0.5, 0.35);
  g.add(wreck);

  const weeds = [];
  const weedMat = new THREE.MeshLambertMaterial({ color: 0x1d5c46, flatShading: true, side: THREE.DoubleSide });
  for (let i = 0; i < 26; i++) {
    const h = 2.4 + rand() * 3.4;
    const weed = new THREE.Mesh(new THREE.ConeGeometry(0.13, h, 4, 3), weedMat);
    weed.position.set(-34 + rand() * 68, h / 2, -8 + rand() * 15);
    weed.userData.phase = rand() * 6.28;
    g.add(weed);
    weeds.push(weed);
  }

  g.position.y = -BOTTOM - 1.4;
  g.userData.weeds = weeds;
  return g;
}

/* ---------------------------------------------------------- light shafts */

export function buildShafts() {
  const verts = [];
  const cols = [];
  const rand = mulberry(3);
  const top = new THREE.Color(0xbfeee0);
  const bottom = new THREE.Color(0x000000);
  for (let i = 0; i < 16; i++) {
    const x = -30 + i * 3.9 + rand() * 2.4;
    const wTop = 0.55 + rand() * 0.7;
    const wBot = wTop * 0.25;
    const len = 34 + rand() * 22;
    const lean = (rand() - 0.5) * 5;
    const z = -9 - rand() * 12;
    const quad = [
      [x - wTop, 0, z], [x + wTop, 0, z],
      [x + wBot + lean, -len, z], [x - wBot + lean, -len, z]
    ];
    const tri = [[0, 1, 2], [0, 2, 3]];
    tri.forEach((t) => {
      t.forEach((idx) => {
        const p = quad[idx];
        verts.push(p[0], p[1], p[2]);
        const c = idx <= 1 ? top : bottom;
        const fade = idx <= 1 ? 0.42 + rand() * 0.28 : 0;
        cols.push(c.r * fade, c.g * fade, c.b * fade);
      });
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 3;
  return mesh;
}

/* ------------------------------------------------------------- particles */

/**
 * Marine snow inside a box that follows the camera, wrapped modulo the box
 * size — there is always something drifting past, at any depth.
 */
export function buildSnow(spark, count = 260, box = 30) {
  const pos = new Float32Array(count * 3);
  const rand = mulberry(11);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rand() - 0.5) * box;
    pos[i * 3 + 1] = (rand() - 0.5) * box;
    pos[i * 3 + 2] = (rand() - 0.5) * box * 0.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: spark,
    color: 0xcfeee6,
    size: 0.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData = { box, count };
  return points;
}

/** Reusable burst: catch sparkles, splashes, bubbles off the lure. */
export function buildBurst(spark, count = 160) {
  const pos = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: spark,
    color: 0xffe9b8,
    size: 0.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const parts = [];
  for (let i = 0; i < count; i++) parts.push({ life: 0, vx: 0, vy: 0, vz: 0 });
  points.userData = { parts, next: 0, count };
  // Park unused particles far away rather than at the origin
  for (let i = 0; i < count; i++) pos[i * 3 + 1] = 9999;
  return points;
}

export function emitBurst(points, x, y, z, n, speed, spread = 1) {
  const { parts, count } = points.userData;
  const arr = points.geometry.attributes.position.array;
  for (let i = 0; i < n; i++) {
    const idx = points.userData.next % count;
    points.userData.next++;
    const p = parts[idx];
    p.life = 0.5 + Math.random() * 0.5;
    const a = Math.random() * Math.PI * 2;
    const e = Math.random() * Math.PI - Math.PI / 2;
    p.vx = Math.cos(a) * Math.cos(e) * speed * (0.4 + Math.random());
    p.vy = Math.sin(e) * speed * (0.4 + Math.random()) + speed * 0.35;
    p.vz = Math.sin(a) * Math.cos(e) * speed * 0.4;
    arr[idx * 3] = x + (Math.random() - 0.5) * spread;
    arr[idx * 3 + 1] = y + (Math.random() - 0.5) * spread;
    arr[idx * 3 + 2] = z + (Math.random() - 0.5) * spread * 0.5;
  }
  points.geometry.attributes.position.needsUpdate = true;
}

export function updateBurst(points, dt, gravity = -3) {
  const { parts, count } = points.userData;
  const arr = points.geometry.attributes.position.array;
  let alive = false;
  for (let i = 0; i < count; i++) {
    const p = parts[i];
    if (p.life <= 0) continue;
    alive = true;
    p.life -= dt;
    p.vy += gravity * dt;
    arr[i * 3] += p.vx * dt;
    arr[i * 3 + 1] += p.vy * dt;
    arr[i * 3 + 2] += p.vz * dt;
    if (p.life <= 0) arr[i * 3 + 1] = 9999;
  }
  if (alive) points.geometry.attributes.position.needsUpdate = true;
}

/* -------------------------------------------------------------- the lure */

export function buildLure() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.15, 0.34, 3, 7),
    new THREE.MeshLambertMaterial({ color: 0xd8394d, flatShading: true, emissive: 0x3a0a10 })
  );
  body.rotation.z = Math.PI / 2;
  g.add(body);
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.155, 0.155, 0.14, 7),
    new THREE.MeshLambertMaterial({ color: 0xf4f0e2, flatShading: true })
  );
  stripe.rotation.z = Math.PI / 2;
  g.add(stripe);
  const hook = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.035, 5, 9, Math.PI * 1.5),
    new THREE.MeshLambertMaterial({ color: 0xdfe6ff })
  );
  hook.position.set(-0.28, -0.16, 0);
  hook.rotation.z = Math.PI * 0.75;
  g.add(hook);
  const spinner = new THREE.Mesh(
    new THREE.CircleGeometry(0.13, 5),
    new THREE.MeshLambertMaterial({ color: 0xffd98a, side: THREE.DoubleSide, emissive: 0x4a3200 })
  );
  spinner.position.set(0.22, 0.02, 0);
  g.add(spinner);
  const glow = new THREE.PointLight(0xffd9a0, 1.1, 9, 2);
  g.add(glow);
  g.userData = { spinner, glow };
  return g;
}

/** Fishing line as a sagging polyline that lags behind the lure. */
export function buildLine(segments = 14) {
  const pts = [];
  for (let i = 0; i <= segments; i++) pts.push(new THREE.Vector3());
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0xeaf1fb, transparent: true, opacity: 0.55 });
  const line = new THREE.Line(geo, mat);
  line.userData = { segments, nodes: pts.map((p) => p.clone()) };
  line.frustumCulled = false;
  return line;
}
