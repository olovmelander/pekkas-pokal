/**
 * Pekkas Fiske — the lake.
 *
 * Built once, procedurally, with no downloaded assets:
 *
 *  - a midnight-sun sky: one analytic gradient (low sun, peach horizon,
 *    lilac zenith) shared by the dome AND the water's reflection, so the
 *    lake mirrors exactly the sky above it, with drifting noise clouds
 *  - a water disc displaced on the GPU — dense near the boat, coarse at the
 *    horizon — shaded differently above and below the waterline: from
 *    underneath a physically placed Snell's window (GLSL refract() into air,
 *    total internal reflection outside the cone) with caustics crawling over
 *    the ceiling; from above a fresnel mix of sky reflection and lake body,
 *    the treeline mirrored in it, and a sun-glitter path
 *  - an underwater volume: a background dome graded up/level/down by depth
 *    with god rays fanning from the refracted sun, and a matching
 *    direction-aware fog patched into every lit material, so far fish and
 *    rock fade into exactly the colour behind them
 *  - the lake basin: terraced rock walls that frame the descent on wide
 *    screens, kelp that sways in the vertex shader, boulders, the bed, a
 *    sunken eka — and something golden next to it
 *  - light shafts with soft edges and a flicker
 *
 * The eka and the angler in it live in boat.js and angler.js.
 */

import * as THREE from 'three';

export const BOTTOM = 60;

/* ------------------------------------------------------------- procedural */

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

function canvasTex(size, draw) {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  draw(cv.getContext('2d'), size);
  return new THREE.CanvasTexture(cv);
}

/** Seamless caustic web from summed tiling waves, ridged to thin filaments. */
export function causticTexture(size = 256) {
  const tex = canvasTex(size, (ctx) => {
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
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Tileable value-noise fBm, two independent fields in R and G. One 128px
 * canvas feeds the clouds, the water's fine ripples, the shaft flicker and
 * the god rays — sampling a texture is far cheaper than noise in GLSL.
 */
export function noiseTexture(size = 128) {
  const rand = mulberry(41);
  const lattice = (n) => {
    const g = [];
    for (let i = 0; i < n * n; i++) g.push(rand());
    return g;
  };
  const field = (octaves) => {
    const out = new Float32Array(size * size);
    let amp = 0.5;
    let total = 0;
    octaves.forEach((cells) => {
      const g = lattice(cells);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const fx = (x / size) * cells;
          const fy = (y / size) * cells;
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          const tx = fx - x0;
          const ty = fy - y0;
          const sx = tx * tx * (3 - 2 * tx);
          const sy = ty * ty * (3 - 2 * ty);
          const at = (i, j) => g[((j % cells) * cells) + (i % cells)];
          const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
          const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
          out[y * size + x] += (a + (b - a) * sy) * amp;
        }
      }
      total += amp;
      amp *= 0.5;
    });
    for (let i = 0; i < out.length; i++) out[i] /= total;
    return out;
  };
  const r = field([4, 8, 16, 32]);
  const g = field([6, 12, 24, 48]);
  const tex = canvasTex(size, (ctx) => {
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      img.data[i * 4] = r[i] * 255;
      img.data[i * 4 + 1] = g[i] * 255;
      img.data[i * 4 + 2] = 0;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Particle atlas, 2×2: soft dot, bubble ring, four-point glint, droplet.
 * One texture, so every particle system shares it.
 */
export function particleAtlas(size = 128) {
  return canvasTex(size, (ctx) => {
    const h = size / 2;
    const c = h / 2;
    // 0: soft dot
    let g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, h, h);
    // 1: bubble — bright rim, clear middle, a highlight up-left
    ctx.save();
    ctx.translate(h, 0);
    g = ctx.createRadialGradient(c, c, c * 0.45, c, c, c * 0.92);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.8, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, h, h);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(c * 0.72, c * 0.68, c * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 2: four-point glint
    ctx.save();
    ctx.translate(0, h);
    g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, h, h);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    [[c * 0.96, 1.8], [1.8, c * 0.96]].forEach(([rx, ry]) => {
      ctx.beginPath();
      ctx.ellipse(c, c, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    // 3: droplet — dense core, crisp edge
    ctx.save();
    ctx.translate(h, h);
    g = ctx.createRadialGradient(c * 0.85, c * 0.8, 0, c, c, c * 0.7);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, h, h);
    ctx.restore();
  });
}

/* ------------------------------------------------------------- shared sky */

/** Low midnight sun, a little right of straight ahead. */
export const SUN_DIR = new THREE.Vector3(0.16, 0.125, -0.978).normalize();

/**
 * Refracted into the water (Snell: sin θt = sin θi / 1.33), the same sun
 * comes from much higher — this is where the underwater rays fan from.
 */
const SUN_UNDER = (() => {
  const h = new THREE.Vector2(SUN_DIR.x, SUN_DIR.z).normalize();
  const st = Math.sqrt(1 - SUN_DIR.y * SUN_DIR.y) / 1.333;
  return new THREE.Vector3(h.x * st, Math.sqrt(1 - st * st), h.y * st);
})();

/**
 * Lit materials fade toward a colour that depends on the view direction —
 * brighter looking up toward the surface, darker looking down — matching
 * the background dome, so silhouettes melt into the water instead of
 * standing out as flat-fogged cut-outs. Shared uniform objects, patched
 * into each material's fog chunk.
 */
export const WATER_FOG = {
  uFogMid: { value: new THREE.Color(0x1f8f96) },
  uFogUp: { value: new THREE.Color(0x3ec2c4) },
  uFogDown: { value: new THREE.Color(0x0b4667) }
};

const SKY_UNIFORMS = {
  uZenith: { value: new THREE.Color(0x213c7c) },
  uHorizon: { value: new THREE.Color(0xffa572) },
  uSunColor: { value: new THREE.Color(0xfff0c8) },
  uSunDir: { value: SUN_DIR }
};

/**
 * The sky as a function of direction. Shared verbatim by the dome and the
 * water, which is what makes the lake reflect *this* sky.
 */
const SKY_GLSL = `
  uniform vec3 uZenith, uHorizon, uSunColor, uSunDir;
  vec3 skyCol(vec3 d) {
    float h = clamp(d.y, 0.0, 1.0);
    // Almost all of the gradient happens in the first few degrees above
    // the horizon — that is what makes a low sun read as a low sun.
    // Gold at the horizon, a band of rose, then the clear blue of a
    // night that never gets dark
    vec3 c = mix(uHorizon, vec3(0.66, 0.36, 0.46), smoothstep(0.0, 0.14, h));
    c = mix(c, uZenith, pow(smoothstep(0.05, 0.6, h), 0.75));
    float s = max(dot(d, uSunDir), 0.0);
    // Warm the horizon toward the sun's azimuth, cool it away from it
    vec2 az = normalize(d.xz + 1e-4);
    float toward = dot(az, normalize(uSunDir.xz)) * 0.5 + 0.5;
    c = mix(c, c * vec3(0.86, 0.84, 1.02), (1.0 - toward) * (1.0 - h) * 0.6);
    c += vec3(1.0, 0.62, 0.34) * pow(toward, 6.0) * pow(1.0 - h, 6.0) * 0.35;
    // Pink band opposite the sun (the Belt of Venus)
    c = mix(c, vec3(0.92, 0.66, 0.74), smoothstep(0.02, 0.1, h) * (1.0 - smoothstep(0.1, 0.3, h)) * (1.0 - toward) * 0.35);
    // The disc, a hot corona, and the wide warm halo of a sun that never sets
    c += uSunColor * smoothstep(0.9985, 0.99935, s) * 4.0;
    c += vec3(1.0, 0.86, 0.6) * pow(s, 60.0) * 1.1;
    c += vec3(1.0, 0.66, 0.34) * pow(s, 12.0) * 0.55;
    c += vec3(1.0, 0.5, 0.26) * pow(s, 3.0) * 0.16 * (1.0 - h);
    return c;
  }
`;

export function buildSky(noise) {
  const uniforms = {
    ...SKY_UNIFORMS,
    uNoise: { value: noise },
    uTime: { value: 0 },
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
      ${SKY_GLSL}
      uniform sampler2D uNoise;
      uniform float uOpacity, uTime;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = skyCol(d);
        // Below the horizon the dome is only ever seen THROUGH the lake
        // surface (alpha 0.74 looking down), so it is the lake's own deep
        // green-teal, not the peach horizon — otherwise the water near the
        // boat goes milky pink.
        c = mix(c, vec3(0.006, 0.05, 0.062), 1.0 - smoothstep(-0.18, -0.005, d.y));
        // Clouds on a high plane, stretched along x into long summer streaks
        if (d.y > 0.0) {
          vec2 p = d.xz / (d.y + 0.06);
          p = vec2(p.x * 0.07, p.y * 0.16) + vec2(uTime * 0.0025, 0.0);
          float n = texture2D(uNoise, p).r * 0.65 + texture2D(uNoise, p * 2.7 + 0.37).g * 0.35;
          float cl = smoothstep(0.6, 0.82, n) * smoothstep(0.02, 0.12, d.y) * (1.0 - smoothstep(0.3, 0.7, d.y));
          float s = max(dot(d, uSunDir), 0.0);
          // Streaks lit from below by a sun under them: rose away from it,
          // molten gold toward it, violet in their shadowed bellies
          vec3 lit = mix(vec3(1.0, 0.56, 0.52), vec3(1.0, 0.78, 0.42), pow(s, 3.0));
          vec3 cc = mix(vec3(0.5, 0.4, 0.62), lit, 0.35 + 0.65 * n);
          c = mix(c, cc, cl * 0.75);
          c += vec3(1.0, 0.8, 0.5) * cl * pow(s, 14.0) * 1.6; // gilded edges
        }
        gl_FragColor = vec4(c, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
  dome.renderOrder = -10;
  return { dome, uniforms, material: mat };
}

/* ------------------------------------------------------------------ shore */

function mergeGeos(list, colors) {
  let total = 0;
  list.forEach((g) => {
    total += g.attributes.position.count;
  });
  const pos = new Float32Array(total * 3);
  const col = colors ? new Float32Array(total * 3) : null;
  let o = 0;
  list.forEach((g, i) => {
    pos.set(g.attributes.position.array, o);
    if (col) {
      const c = colors[i];
      for (let k = 0; k < g.attributes.position.count; k++) {
        col[o + k * 3] = c.r;
        col[o + k * 3 + 1] = c.g;
        col[o + k * 3 + 2] = c.b;
      }
    }
    o += g.attributes.position.count * 3;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeVertexNormals();
  return out;
}

/* ----------------------------------------------------------------- water */

/**
 * The lake's five waves in GLSL (and, below, in JS for things that float).
 * Waves die out toward the horizon, where the water's rings get coarse.
 */
export const WAVE_GLSL = `
  float waveH(vec2 p, float t) {
    float fade = 1.0 - smoothstep(60.0, 140.0, length(p));
    return (sin(p.x * 0.32 + t * 1.10) * 0.21
          + sin(p.y * 0.41 - t * 0.85) * 0.17
          + sin((p.x + p.y) * 0.19 + t * 1.60) * 0.12
          + sin(p.x * 1.70 + t * 2.60) * 0.026
          + sin(p.y * 1.90 - t * 2.20) * 0.022) * fade;
  }
`;

/** The same five waves the vertex shader uses — for things that float. */
export function waveHeight(x, z, t) {
  return Math.sin(x * 0.32 + t * 1.1) * 0.21 +
    Math.sin(z * 0.41 - t * 0.85) * 0.17 +
    Math.sin((x + z) * 0.19 + t * 1.6) * 0.12 +
    Math.sin(x * 1.7 + t * 2.6) * 0.026 +
    Math.sin(z * 1.9 - t * 2.2) * 0.022;
}

/**
 * A polar disc: rings spaced geometrically, so there is a vertex every
 * ~0.4 m around the boat and one every ~80 m at the horizon. It reaches
 * the far shore, which is what lets the lake meet the treeline.
 */
function waterGeometry() {
  const seg = 72;
  const rings = 52;
  const pos = [0, 0, 0];
  const idx = [];
  for (let r = 1; r <= rings; r++) {
    const rad = 0.45 * 1.152 ** r;
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
    }
  }
  for (let k = 0; k < seg; k++) idx.push(0, 1 + ((k + 1) % seg), 1 + k);
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * seg;
    const a1 = 1 + r * seg;
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      idx.push(a0 + k, a0 + k1, a1 + k, a0 + k1, a1 + k1, a1 + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  return g;
}

/**
 * The far shore mirrored in the lake: the reflected ray is cast against
 * each rank of land (scenery.js), farthest first, nearer ranks painting
 * over — every rank is a plane at its distance with its outline in one row
 * of a small height texture. Branch-free: every lookup always runs.
 */
function shoreGLSL(layers) {
  const n = layers.length;
  let body = '';
  for (let i = n - 1; i >= 0; i--) {
    body += `
    {
      vec4 L = uShoreL[${i}];
      float t = (L.x - P.z) / rz;
      float u = (P.x + R.x * t - L.y) * L.z;
      float y = R.y * t;
      float h = texture2D(uShoreH, vec2(clamp(u, 0.0, 1.0), ${((i + 0.5) / 8).toFixed(4)})).r * L.w;
      float e = 0.03 + t * 0.002;
      float hit = step(0.0, t) * step(0.0, u) * step(u, 1.0) * step(0.08, h) * (1.0 - smoothstep(h - e, h + e, y));
      vec3 c = mix(uShoreMist[${i}], uShoreTop[${i}], smoothstep(0.0, max(0.6, h * 0.35), y));
      res = mix(res, vec4(c, 1.0), hit);
    }`;
  }
  return `
    uniform sampler2D uShoreH;
    uniform vec4 uShoreL[${n}];
    uniform vec3 uShoreTop[${n}];
    uniform vec3 uShoreMist[${n}];
    vec4 shoreRefl(vec3 P, vec3 R) {
      float rz = min(R.z, -1e-3);
      vec4 res = vec4(0.0);
      ${body}
      return res;
    }
  `;
}

export function buildWater(caustics, noise, reflect) {
  const { layers } = reflect;
  const uniforms = {
    ...SKY_UNIFORMS,
    uTime: { value: 0 },
    uCaustics: { value: caustics },
    uNoise: { value: noise },
    uBody: { value: new THREE.Color(0x1b5868) },
    uDeepTint: { value: new THREE.Color(0x06202e) },
    uFogColor: { value: new THREE.Color(0x1d6b74) },
    uFogUp: WATER_FOG.uFogUp,
    uFogDensity: { value: 0.02 },
    uCausticStrength: { value: 1 },
    uShoreH: { value: reflect.texture },
    uShoreL: { value: layers.map((l) => new THREE.Vector4(l.z, l.x0, 1 / (l.x1 - l.x0), l.hmax)) },
    uShoreTop: { value: layers.map((l) => l.top) },
    uShoreMist: { value: layers.map((l) => l.mist) }
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
      ${WAVE_GLSL}

      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        float t = uTime;
        float fade = 1.0 - smoothstep(60.0, 140.0, length(w.xz));
        w.y += waveH(w.xz, t);
        float dx = cos(w.x * 0.32 + t * 1.10) * 0.21 * 0.32
                 + cos((w.x + w.z) * 0.19 + t * 1.60) * 0.12 * 0.19
                 + cos(w.x * 1.70 + t * 2.60) * 0.026 * 1.70;
        float dz = cos(w.z * 0.41 - t * 0.85) * 0.17 * 0.41
                 + cos((w.x + w.z) * 0.19 + t * 1.60) * 0.12 * 0.19
                 + cos(w.z * 1.90 - t * 2.20) * 0.022 * 1.90;
        vNrm = normalize(vec3(-dx * fade, 1.0, -dz * fade));
        vWorld = w.xyz;
        vec4 mv = viewMatrix * w;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      ${SKY_GLSL}
      ${shoreGLSL(layers)}
      uniform sampler2D uCaustics, uNoise;
      uniform vec3 uBody, uDeepTint, uFogColor, uFogUp;
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
        // The land strip on the far shore lies 6 cm over the water from
        // z = -118 m back. There the two would only be told apart by depth
        // precision — and the waves, still a few cm tall that far out, poke
        // through it — so the lake simply stops under the land.
        if (vWorld.z < -118.5) discard;
        vec3 N0 = normalize(vNrm);
        // Fine ripples from the noise field: this is what breaks the sun
        // into glitter instead of one smeared highlight
        float near = 1.0 - smoothstep(15.0, 70.0, vDepth);
        vec2 q = vWorld.xz;
        vec2 r1 = texture2D(uNoise, q * 0.31 + uTime * vec2(0.031, 0.017)).rg;
        vec2 r2 = texture2D(uNoise, q * 0.83 - uTime * vec2(0.023, 0.041)).rg;
        vec3 N = normalize(N0 + vec3(r1.x + r2.x - 1.0, 0.0, r1.y + r2.y - 1.0) * (0.04 + 0.09 * near));
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 col;
        float alpha;

        if (cameraPosition.y < vWorld.y) {
          // --- from underneath: Snell's window. Refract the view ray out
          // into the air; refract() returns zero beyond the critical angle
          // (48.6°), where the surface becomes a mirror of the deep.
          vec3 I = -V;
          vec3 T = refract(I, -N, 1.333);
          float caust = web(vWorld.xz) * uCausticStrength;
          if (dot(T, T) < 1e-4) {
            col = uDeepTint * 1.15 + vec3(0.2, 0.42, 0.42) * caust * 0.22;
          } else {
            float tr = smoothstep(0.0, 0.3, T.y);
            vec3 sky = skyCol(normalize(T)) * 1.15;
            col = mix(uDeepTint * 1.4, sky, tr);
            // A bright rim at the edge of the window
            col += vec3(0.55, 0.85, 0.95) * (1.0 - smoothstep(0.0, 0.12, T.y)) * 0.35;
            col += vec3(0.55, 0.85, 0.8) * caust * (0.2 + tr * 0.8);
          }
          // Far away the ceiling dissolves into the water volume behind it,
          // where the god rays are — no hard line where the two meet
          alpha = 0.95 * (1.0 - smoothstep(25.0, 85.0, vDepth));
        } else {
          // --- from above: fresnel between the lake body and the sky it
          // reflects, the treeline mirrored in it, and the glitter path
          float cosv = clamp(dot(N, V), 0.0, 1.0);
          float fres = 0.02 + 0.98 * pow(1.0 - cosv, 5.0);
          vec3 R = reflect(-V, N);
          R.y = abs(R.y);
          vec3 refl = skyCol(R);
          // The far shore mirrored in the lake, rank by rank. The ripples
          // bend it only part way, so the trees waver instead of shattering
          // At grazing angles a tilt of a few degrees throws the mirrored
          // ray clean off the shore, so far out the waves bend it less
          float calm = mix(0.5, 0.12, smoothstep(8.0, 70.0, vDepth));
          vec3 Ns = normalize(vec3(N0.x * calm, 1.0, N0.z * calm * 0.6) + (N - N0) * calm * 0.35);
          vec3 Rs = reflect(-V, Ns);
          Rs.y = abs(Rs.y);
          vec4 sh = shoreRefl(vWorld, Rs);
          sh.a *= smoothstep(3.0, 26.0, vDepth);
          refl = mix(refl, sh.rgb, sh.a);
          vec3 body = uBody * (0.75 + 0.5 * web(vWorld.xz) * uCausticStrength * 0.25);
          col = mix(body, refl, clamp(fres * 1.25, 0.0, 1.0));
          vec3 H = normalize(uSunDir + V);
          float nh = max(dot(N, H), 0.0);
          // The glitter path: a warm sheen running from under the sun to
          // the boat, and needle-sharp glints in it near the boat. Far away
          // a pixel covers many ripples, so the needle would only sparkle on
          // and off from frame to frame — there it widens and dims instead.
          // (Where the far shore is mirrored the sun is hidden behind it.)
          float open = 1.0 - sh.a * 0.85;
          col += vec3(1.0, 0.62, 0.3) * pow(nh, 36.0) * 0.42 * open;
          col += uSunColor * (pow(nh, mix(260.0, 900.0, near)) * mix(2.4, 9.0, near) + pow(nh, 90.0) * 0.7) * open;
          alpha = mix(0.74, 0.985, fres);
        }

        float f = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
        // Seen from below, the surface is always above: fog it toward the
        // brighter colour the volume shows looking up
        vec3 fogC = cameraPosition.y < vWorld.y
          ? mix(uFogColor, uFogUp, smoothstep(0.0, 0.8, normalize(vWorld - cameraPosition).y))
          : uFogColor;
        col = mix(col, fogC, f);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });

  const mesh = new THREE.Mesh(waterGeometry(), material);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return { mesh, uniforms, material };
}

/* ------------------------------------------------------ underwater volume */

export function patchWaterFog(shader, reach = 1) {
  shader.uniforms.uFogMid = WATER_FOG.uFogMid;
  shader.uniforms.uFogUp = WATER_FOG.uFogUp;
  shader.uniforms.uFogDown = WATER_FOG.uFogDown;
  shader.vertexShader = shader.vertexShader
    .replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\nvarying float vFogDirY;')
    .replace('#include <fog_vertex>', `#include <fog_vertex>
      vec4 fogWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        fogWorld = instanceMatrix * fogWorld;
      #endif
      fogWorld = modelMatrix * fogWorld;
      vFogDirY = normalize(fogWorld.xyz - cameraPosition).y;`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <fog_pars_fragment>',
      '#include <fog_pars_fragment>\nuniform vec3 uFogMid, uFogUp, uFogDown;\nvarying float vFogDirY;')
    .replace('#include <fog_fragment>', `
      #ifdef USE_FOG
        // All three colours are linear here. (three's own fogColor is not:
        // r187 uploads it pre-encoded, because fog runs AFTER tone mapping
        // and sRGB encoding.) So build the tint in linear and put it through
        // the same two steps the volume shader takes — then a fully fogged
        // rock is exactly the colour of the water behind it.
        vec3 fogTint = vFogDirY > 0.0
          ? mix(uFogMid, uFogUp, smoothstep(0.0, 0.8, vFogDirY))
          : mix(uFogMid, uFogDown, smoothstep(0.0, 0.7, -vFogDirY));
        #ifdef TONE_MAPPING
          fogTint = toneMapping(fogTint);
        #endif
        fogTint = linearToOutputTexel(vec4(fogTint, 1.0)).rgb;
        float fogD = vFogDepth * ${reach.toFixed(2)};
        float fogFactor = 1.0 - exp(-fogDensity * fogDensity * fogD * fogD);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogTint, fogFactor);
      #endif`);
}

/**
 * The same patch with a longer reach: the basin walls and the kelp on them
 * fog out faster than fish, so they frame the sides up close but melt into
 * the haze toward the back instead of standing there as a dark cut-out.
 */
export function fogWithReach(reach) {
  return (shader) => patchWaterFog(shader, reach);
}

/**
 * The water you are sinking through, as a background: a dome that follows
 * the camera, graded with the same three colours as the fog, and god rays
 * fanning down from the refracted sun. The rays are angular streaks of
 * the noise field around the sun direction — periodic in angle, so there
 * is no seam — scrolling slowly so they breathe.
 */
export function buildVolume(noise) {
  const uniforms = {
    uMid: WATER_FOG.uFogMid,
    uUp: WATER_FOG.uFogUp,
    uDown: WATER_FOG.uFogDown,
    uRay: { value: new THREE.Color(0xbfeee0) },
    uRayStr: { value: 0.5 },
    uSun: { value: SUN_UNDER },
    uNoise: { value: noise },
    uTime: { value: 0 }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uMid, uUp, uDown, uRay, uSun;
      uniform float uRayStr, uTime;
      uniform sampler2D uNoise;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = d.y > 0.0
          ? mix(uMid, uUp, smoothstep(0.0, 0.8, d.y))
          : mix(uMid, uDown, smoothstep(0.0, 0.7, -d.y));
        vec3 s = normalize(uSun);
        vec3 t1 = normalize(cross(s, vec3(0.0, 0.0, 1.0)));
        vec3 t2 = cross(s, t1);
        float ang = atan(dot(d, t2), dot(d, t1) + 1e-5) / 6.28318; // never atan(0, 0)
        float a = texture2D(uNoise, vec2(ang * 23.0, uTime * 0.012)).r;
        float b = texture2D(uNoise, vec2(ang * 11.0 + 0.5, -uTime * 0.017)).g;
        // Rays from above only: kept off the horizon band, where the fogged
        // basin walls have to melt into plain water colour
        float rays = smoothstep(0.42, 0.85, a * 0.6 + b * 0.55) * smoothstep(0.04, 0.35, d.y);
        float toward = max(dot(d, s), 0.0);
        c += uRay * rays * pow(toward, 2.2) * uRayStr;
        c += uRay * pow(toward, 12.0) * uRayStr * 0.6; // the glow where the sun is
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 20), mat);
  mesh.renderOrder = -20;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

/* ------------------------------------------------------------ environment */

/**
 * A tiny pre-filtered environment for the fish and the lure: warm light
 * from above, teal around, dark below. It is what makes a sik's flank
 * flash silver as it turns.
 */
export function makeEnvironment(renderer) {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: `
      varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = d.y > 0.0
          ? mix(vec3(0.32, 0.62, 0.66), vec3(1.6, 1.45, 1.15), pow(d.y, 1.6))
          : mix(vec3(0.32, 0.62, 0.66), vec3(0.03, 0.08, 0.12), pow(-d.y, 0.6));
        float s = max(dot(d, normalize(vec3(0.16, 0.6, -0.78))), 0.0);
        c += vec3(2.2, 1.9, 1.4) * pow(s, 40.0);
        gl_FragColor = vec4(c, 1.0);
      }
    `
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  scene.children[0].geometry.dispose();
  mat.dispose();
  return rt;
}

/* ----------------------------------------------------------- the basin */

const SPAN = Math.acos(0.35) - 0.1; // each side wall covers |cos θ| from ~1 down to 0.35
const BASIN = { R: 34, zc: 6, th0: Math.PI + 0.1, th1: Math.PI * 2 - 0.1, span: SPAN, top: -2.4, bottom: -64 };

/**
 * Radius of the rock wall at angle th, height y — terraced every 9 m. Only
 * the two sides are built: toward the back each wall bends away into the
 * haze, so the middle of the frame stays open water with the god rays in it.
 */
function wallRadius(th, y) {
  const d = -y;
  const terrace = 2.4 * smooth(0.62, 1, (d / 9) % 1);
  const open = 40 * (1 - smooth(0.35, 0.85, Math.abs(Math.cos(th))));
  return BASIN.R + open - d * 0.07 +
    Math.sin(th * 7 + d * 0.13) * 1.6 +
    Math.sin(th * 17 - d * 0.31) * 0.8 +
    Math.sin(d * 0.9 + th * 3) * 0.5 -
    terrace;
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** A wall angle on one of the two near sides, where kelp and boulders show. */
function sideAngle(rand) {
  const k = rand() * BASIN.span * 0.7;
  return rand() < 0.5 ? BASIN.th0 + k : BASIN.th1 - k;
}

function wallPoint(th, y, inset = 0) {
  const r = wallRadius(th, y) - inset;
  return new THREE.Vector3(Math.cos(th) * r, y, BASIN.zc + Math.sin(th) * r);
}

/**
 * The lake basin around the descent: a U of rock opening toward the
 * camera. On a phone you mostly see the back wall through the haze; on a
 * wide screen the side walls frame the shaft you are falling down.
 */
export function buildBasin() {
  const cols = 26;
  const rows = 46;
  const pos = [];
  const idx = [];
  // Two strips: the left wall sweeps from beside the camera toward the back,
  // the right wall mirrors it
  [BASIN.th0, BASIN.th1 - BASIN.span].forEach((start) => {
    const base = pos.length / 3;
    for (let r = 0; r <= rows; r++) {
      const y = BASIN.top + (BASIN.bottom - BASIN.top) * (r / rows);
      for (let c = 0; c <= cols; c++) {
        const p = wallPoint(start + BASIN.span * (c / cols), y);
        pos.push(p.x, p.y, p.z);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = base + r * (cols + 1) + c;
        const b = a + cols + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  });
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setIndex(idx);
  geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  // Colour by depth and by facing: ledges (normals up) collect pale silt,
  // the shallows grow moss, the deep is cold slate.
  const P = geo.attributes.position;
  const N = geo.attributes.normal;
  const col = new Float32Array(P.count * 4);
  const c = new THREE.Color();
  const moss = new THREE.Color(0x46603a);
  const rock = new THREE.Color(0x4c5866);
  const deep = new THREE.Color(0x283240);
  const silt = new THREE.Color(0x58584a);
  for (let i = 0; i < P.count; i++) {
    const d = -P.getY(i);
    c.copy(rock).lerp(deep, smooth(10, 50, d));
    c.lerp(moss, (1 - smooth(4, 18, d)) * 0.7);
    c.lerp(silt, smooth(0.35, 0.8, N.getY(i)) * 0.35);
    const v = 0.85 + Math.sin(P.getX(i) * 1.7 + P.getZ(i) * 2.3 + d) * 0.12;
    col[i * 4] = c.r * v;
    col[i * 4 + 1] = c.g * v;
    col[i * 4 + 2] = c.b * v;
    // Alpha: each wall thins out toward its far end and its top edge, so it
    // dissolves into the god rays behind it instead of ending on a line
    const across = Math.abs(P.getX(i)) / Math.hypot(P.getX(i), P.getZ(i) - BASIN.zc);
    col[i * 4 + 3] = smooth(0.38, 0.8, across) * smooth(2.4, 8, d);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false
  });
  mat.onBeforeCompile = fogWithReach(1.3);
  mat.customProgramCacheKey = () => 'fiske-wall';
  return new THREE.Mesh(geo, mat);
}

/* ------------------------------------------------------------------ kelp */

/**
 * Nate and slinga: a crossed ribbon, instanced, swaying in the vertex
 * shader with a phase taken from each instance's own position — no
 * per-frame CPU work at all. Some grow on the wall terraces, a few stand
 * right in front of the camera at the screen edges for parallax.
 */
export function buildKelp(count, timeUniform) {
  const rand = mulberry(23);
  const parts = [];
  [0, Math.PI / 2].forEach((ry) => {
    const p = new THREE.PlaneGeometry(0.4, 1, 1, 8);
    p.translate(0, 0.5, 0);
    const pa = p.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i);
      pa.setX(i, pa.getX(i) * (1 - y * 0.75) * (0.8 + Math.sin(y * 9) * 0.2));
    }
    p.rotateY(ry);
    parts.push(p.toNonIndexed());
    p.dispose();
  });
  const geo = mergeGeos(parts);
  const P = geo.attributes.position;
  const col = new Float32Array(P.count * 3);
  const base = new THREE.Color(0x173c2a);
  const tip = new THREE.Color(0x6f9a3e);
  const c = new THREE.Color();
  for (let i = 0; i < P.count; i++) {
    c.copy(base).lerp(tip, P.getY(i));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        float kPh = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.71 + instanceMatrix[3].y * 0.13;
        float kY = position.y * position.y;
        transformed.x += sin(uTime * 0.8 + kPh + position.y * 2.2) * kY * 0.22;
        transformed.z += cos(uTime * 0.6 + kPh * 1.3 + position.y * 1.7) * kY * 0.12;`);
    patchWaterFog(shader, 1.2);
  };
  mat.customProgramCacheKey = () => 'fiske-kelp';

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const e = new THREE.Euler();
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    let p;
    let h;
    const roll = rand();
    if (i < count * 0.14) {
      // Foreground: tall dark fronds just in front of the camera, out at
      // the sides — they slide past fast and sell the speed of the drop
      const side = rand() < 0.5 ? -1 : 1;
      p = new THREE.Vector3(side * (8.5 + rand() * 6), -(4 + rand() * 46), 3 + rand() * 2.5);
      h = 5 + rand() * 4;
      tint.setRGB(0.35, 0.4, 0.4);
    } else if (roll < 0.25) {
      // The bed: sparse, low, pale
      p = new THREE.Vector3(-30 + rand() * 60, -BOTTOM - 1.2, -14 + rand() * 16);
      h = 1.2 + rand() * 2.2;
      tint.setRGB(0.55, 0.55, 0.5);
    } else {
      // The terraces: thick in the shallows, thinning with depth
      const th = sideAngle(rand);
      const y = -3 - (rand() ** 1.8) * 40;
      p = wallPoint(th, y, 0.6);
      h = 2.2 + rand() * 4.5 * (1 - (-y) / 60);
      tint.setRGB(1, 1, 1);
    }
    e.set((rand() - 0.5) * 0.25, rand() * Math.PI, (rand() - 0.5) * 0.25);
    q.setFromEuler(e);
    s.set(1 + rand() * 0.8, h, 1);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, tint);
  }
  mesh.frustumCulled = false;
  return mesh;
}

/* --------------------------------------------------------------- seabed */

export function buildSeabed(hull) {
  const g = new THREE.Group();
  const rand = mulberry(19);

  const bed = new THREE.PlaneGeometry(200, 90, 44, 22);
  bed.rotateX(-Math.PI / 2);
  bed.translate(0, 0, -10);
  const bp = bed.attributes.position;
  const colors = new Float32Array(bp.count * 3);
  const c = new THREE.Color();
  const silt = new THREE.Color(0x1d2536);
  const sand = new THREE.Color(0x5c5a52);
  const bedH = (x, z) => Math.sin(x * 0.11) * 1.1 + Math.cos(z * 0.17 + 1.2) * 0.8 + Math.sin(x * 0.31 + z * 0.21) * 0.45;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i);
    const z = bp.getZ(i);
    const hgt = bedH(x, z);
    bp.setY(i, hgt);
    // Silt in the hollows, pale sand ripples on the crests
    const k = Math.min(1, Math.max(0, hgt * 0.3 + 0.45 + Math.sin(x * 1.3 + z * 0.4) * 0.12));
    c.copy(silt).lerp(sand, k);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  bed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  bed.computeVertexNormals();
  const bedMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  bedMat.onBeforeCompile = fogWithReach(1);
  bedMat.customProgramCacheKey = () => 'fiske-rock';
  g.add(new THREE.Mesh(bed, bedMat));

  // Boulders, one instanced draw: strewn on the bed and perched on terraces
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x4a5266, flatShading: true });
  stoneMat.onBeforeCompile = fogWithReach(1);
  stoneMat.customProgramCacheKey = () => 'fiske-rock-plain';
  const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), stoneMat, 46);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  for (let i = 0; i < 46; i++) {
    const r = 0.5 + rand() * 1.6;
    let p;
    if (i < 22) {
      const x = -32 + rand() * 64;
      const z = -14 + rand() * 18;
      // Bedded in the silt, and clear of the wreck and the pokal
      const clear = Math.hypot(x - 1.9, z + 1.4) < 2.6 || Math.hypot(x + 5.4, z + 4.4) < 3.4;
      p = new THREE.Vector3(clear ? x + 9 : x, 0, z);
      p.y = bedH(p.x, p.z) + r * 0.12;
    } else {
      const th = sideAngle(rand);
      const y = -6 - rand() * 50;
      p = wallPoint(th, y - (y % 9) - 0.5, 0.9);
      p.y += BOTTOM + 1.4; // the group sits at the bottom
    }
    e.set(rand() * 3, rand() * 3, rand() * 3);
    q.setFromEuler(e);
    s.set(r, r * (0.6 + rand() * 0.4), r);
    m.compose(p, q, s);
    stones.setMatrixAt(i, m);
  }
  g.add(stones);

  // A sunken eka on its side, half buried — the same clinker boat Erik
  // sits in, gone green with years down here: a landmark that says "you
  // made it down"
  if (hull) {
    const wreckMat = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x6a8270 });
    wreckMat.onBeforeCompile = fogWithReach(1);
    wreckMat.customProgramCacheKey = () => 'fiske-wreck';
    const wreck = new THREE.Mesh(hull, wreckMat);
    wreck.position.set(-5.4, bedH(-5.4, -4.4) + 0.42, -4.4);
    wreck.rotation.set(0.15, 0.55, 0.55);
    wreck.scale.setScalar(1.15);
    g.add(wreck);
    // A loose thwart and an oar beside it
    const plankMat = new THREE.MeshLambertMaterial({ color: 0x4a5a48, flatShading: true });
    plankMat.onBeforeCompile = fogWithReach(1);
    plankMat.customProgramCacheKey = () => 'fiske-rock-plain';
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.26), plankMat);
    plank.position.set(-2.6, bedH(-2.6, -2.2) + 0.05, -2.2);
    plank.rotation.set(0.05, -0.6, 0.12);
    g.add(plank);
    const oar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.08), plankMat);
    oar.position.set(-8.4, bedH(-8.4, -2.4) + 0.05, -2.4);
    oar.rotation.set(0, 0.35, 0.06);
    g.add(oar);
  }

  // …and next to it, something nobody expected to find down here
  const pts = [];
  const prof = [[0, 0], [0.32, 0], [0.32, 0.06], [0.1, 0.12], [0.07, 0.4], [0.12, 0.5],
    [0.3, 0.62], [0.42, 0.95], [0.44, 1.12], [0.4, 1.12]];
  prof.forEach(([x, y]) => pts.push(new THREE.Vector2(x, y)));
  const pokal = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 18),
    new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.85, roughness: 0.25, emissive: 0xb07a12, emissiveIntensity: 0.9 })
  );
  // Placed where a lure on the bottom has it in view, half sunk in the silt
  pokal.position.set(1.9, bedH(1.9, -1.4) - 0.12, -1.4);
  pokal.rotation.set(0.5, 0, -0.9);
  pokal.scale.setScalar(1.25);
  g.add(pokal);

  g.position.y = -BOTTOM - 1.4;
  g.userData.pokal = pokal;
  return g;
}

/* ---------------------------------------------------------- light shafts */

/**
 * Soft-edged shafts: brightness falls off as sin² across the width and
 * exponentially along the length, and a noise strip scrolls down each one
 * so they shimmer like light through moving waves. Most hang behind the
 * play plane; a few wide, faint ones hang in front for depth. One draw.
 */
export function buildShafts(noise, count = 22) {
  const rand = mulberry(3);
  const pos = [];
  const uv = [];
  const seed = [];
  const idx = [];
  for (let i = 0; i < count; i++) {
    const front = i >= count - 5;
    const x = front ? -14 + rand() * 28 : -38 + (i / (count - 5)) * 76 + rand() * 3;
    const wTop = front ? 1.6 + rand() * 1.6 : 0.6 + rand() * 1.1;
    const wBot = wTop * (0.3 + rand() * 0.3);
    const len = 36 + rand() * 24;
    const lean = 3 + rand() * 4; // all lean the same way: one sun
    const z = front ? 3 + rand() * 2.5 : -7 - rand() * 14;
    const b = pos.length / 3;
    pos.push(x - wTop, 0, z, x + wTop, 0, z, x + wBot + lean, -len, z + 2, x - wBot + lean, -len, z + 2);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    const sd = rand() * 10;
    const br = front ? 0.35 : 0.6 + rand() * 0.6;
    for (let k = 0; k < 4; k++) seed.push(sd, br);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(seed), 2));
  geo.setIndex(idx);
  const uniforms = {
    uNoise: { value: noise },
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0xbfeee0) },
    uStrength: { value: 0.3 }
  };
  // No depth test: the shafts are light scattered in the water between the
  // eye and everything else, so they lie over the rock walls and the fish
  // alike. Tested against depth, the walls hid the shafts behind them and
  // stood out as dark slabs next to the lit gap.
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    vertexShader: `
      attribute vec2 aSeed;
      varying vec2 vUv;
      varying vec2 vSeed;
      void main() {
        vUv = uv;
        vSeed = aSeed;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uNoise;
      uniform vec3 uColor;
      uniform float uTime, uStrength;
      varying vec2 vUv;
      varying vec2 vSeed;
      void main() {
        float s = sin(3.14159 * vUv.x);
        float across = s * s;
        float along = exp(-vUv.y * 2.6) * smoothstep(0.0, 0.08, vUv.y);
        float flick = 0.45 + 0.75 * texture2D(uNoise, vec2(vSeed.x + vUv.x * 0.15 + uTime * 0.02, vUv.y * 0.35 - uTime * 0.03)).r;
        vec3 c = uColor * across * along * flick * uStrength * vSeed.y;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }
    `
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

/* ------------------------------------------------------------ näckrosor */

/**
 * Water lilies in two sheltered patches. They ride the same five waves
 * the shader uses, tilted to the local slope, so they never sink through
 * the surface. From below they are dark coins against Snell's window.
 */
export function buildLilies() {
  const rand = mulberry(31);
  const pads = [];
  const patch = (cx, cz, n, r) => {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * r;
      pads.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, s: 0.5 + rand() * 0.55, rot: rand() * 6.28, flower: rand() < 0.28 });
    }
  };
  patch(-15, -9, 16, 5.5);
  patch(17, -16, 12, 4.5);
  patch(-4, -30, 8, 4);

  const padGeo = new THREE.CircleGeometry(1, 16, 0.35, Math.PI * 2 - 0.35);
  padGeo.rotateX(-Math.PI / 2);
  const padMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -6
  });
  const padMesh = new THREE.InstancedMesh(padGeo, padMat, pads.length);
  padMesh.renderOrder = 3;
  const tint = new THREE.Color();
  pads.forEach((p, i) => {
    tint.setHSL(0.24 + rand() * 0.06, 0.4, 0.11 + rand() * 0.06);
    padMesh.setColorAt(i, tint);
  });

  // Flowers: a little cup of pointed petals, white and blush
  const petal = [];
  for (let i = 0; i < 8; i++) {
    const c = new THREE.ConeGeometry(0.11, 0.42, 3);
    c.rotateZ(-0.9);
    c.translate(0.16, 0.12, 0);
    c.rotateY((i / 8) * Math.PI * 2);
    petal.push(c.toNonIndexed());
    c.dispose();
  }
  const heart = new THREE.SphereGeometry(0.08, 6, 4);
  heart.translate(0, 0.12, 0);
  petal.push(heart.toNonIndexed());
  heart.dispose();
  const flowerGeo = mergeGeos(petal, [...Array(8).fill(new THREE.Color(0xfbf4ee)), new THREE.Color(0xf5c242)]);
  const flowers = pads.filter((p) => p.flower);
  const flowerMesh = new THREE.InstancedMesh(
    flowerGeo,
    new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true }),
    Math.max(1, flowers.length)
  );
  flowerMesh.renderOrder = 3;
  flowers.forEach((p, i) => {
    tint.set(rand() < 0.5 ? 0xffffff : 0xffd0dc);
    flowerMesh.setColorAt(i, tint);
  });
  padMesh.frustumCulled = false;
  flowerMesh.frustumCulled = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  function update(t) {
    let fi = 0;
    pads.forEach((p, i) => {
      const y = waveHeight(p.x, p.z, t) + 0.2;
      const sx = (waveHeight(p.x + 0.4, p.z, t) - waveHeight(p.x - 0.4, p.z, t)) / 0.8;
      const sz = (waveHeight(p.x, p.z + 0.4, t) - waveHeight(p.x, p.z - 0.4, t)) / 0.8;
      e.set(sz, p.rot + Math.sin(t * 0.3 + i) * 0.05, -sx, 'YXZ');
      q.setFromEuler(e);
      v.set(p.x, y, p.z);
      sc.setScalar(p.s);
      m.compose(v, q, sc);
      padMesh.setMatrixAt(i, m);
      if (p.flower) {
        v.y += 0.02;
        sc.setScalar(p.s * 0.9);
        m.compose(v, q, sc);
        flowerMesh.setMatrixAt(fi++, m);
      }
    });
    padMesh.instanceMatrix.needsUpdate = true;
    flowerMesh.instanceMatrix.needsUpdate = true;
  }
  const group = new THREE.Group();
  group.add(padMesh, flowerMesh);
  group.userData.update = update;
  return group;
}

/* -------------------------------------------------------------- the lure */

export function buildLure() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.15, 0.34, 4, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8394d, roughness: 0.3, metalness: 0.1, emissive: 0x3a0a10 })
  );
  body.rotation.z = Math.PI / 2;
  g.add(body);
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.165, 0.165, 0.14, 10), // 1.5 cm proud: no z-fight with the body
    new THREE.MeshStandardMaterial({ color: 0xf4f0e2, roughness: 0.35 })
  );
  stripe.rotation.z = Math.PI / 2;
  g.add(stripe);
  const hook = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.035, 6, 12, Math.PI * 1.5),
    new THREE.MeshStandardMaterial({ color: 0xdfe6ff, metalness: 1, roughness: 0.25 })
  );
  hook.position.set(-0.28, -0.16, 0);
  hook.rotation.z = Math.PI * 0.75;
  g.add(hook);
  // The spoon: polished brass, so it flashes as it spins
  const spinner = new THREE.Mesh(
    new THREE.CircleGeometry(0.13, 10),
    new THREE.MeshStandardMaterial({ color: 0xffd98a, side: THREE.DoubleSide, metalness: 1, roughness: 0.18, emissive: 0x4a3200 })
  );
  spinner.position.set(0.22, 0.02, 0);
  spinner.scale.set(1, 1.45, 1);
  g.add(spinner);
  const glow = new THREE.PointLight(0xffd9a0, 1.1, 10, 2);
  g.add(glow);
  const parts = [body, stripe, hook, spinner];
  g.userData = {
    spinner,
    glow,
    /**
     * Show or hide the lure. The group itself always stays visible: three
     * counts only visible lights, and a light coming and going changes the
     * light count every lit material is compiled for — a burst of shader
     * compiles mid-game, exactly what stalls a D3D11 GPU. A dark light is free.
     */
    show(v, intensity) {
      parts.forEach((m) => {
        m.visible = v;
      });
      glow.intensity = v ? intensity : 0;
    }
  };
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
