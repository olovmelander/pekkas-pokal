import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Collects static pieces and merges them into one mesh per material, so a
 * whole kind of trackside furniture costs one draw call (plus its shadow). */
export function createBatch() {
  const buckets = new Map();
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  const batch = {
    /** Adds a copy of `geometry` transformed by position/rotation(YXZ)/scale, tinted `color`. */
    add(geometry, material, at = [0, 0, 0], rotation = [0, 0, 0], size = [1, 1, 1], color = null, parent = null) {
      position.fromArray(at); euler.set(rotation[0], rotation[1], rotation[2], 'YXZ'); quaternion.setFromEuler(euler);
      scale.fromArray(typeof size === 'number' ? [size, size, size] : size);
      matrix.compose(position, quaternion, scale);
      if (parent) matrix.premultiply(parent);
      return batch.addMatrix(geometry, material, matrix, color);
    },
    addMatrix(geometry, material, m, color = null) {
      const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      g.applyMatrix4(m);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
      if (material.vertexColors) {
        if (!g.attributes.color || color !== null) {
          const c = new THREE.Color(color ?? 0xffffff), n = g.attributes.position.count, data = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) { data[i * 3] = c.r; data[i * 3 + 1] = c.g; data[i * 3 + 2] = c.b; }
          g.setAttribute('color', new THREE.Float32BufferAttribute(data, 3));
        }
      } else if (g.attributes.color) g.deleteAttribute('color');
      g.morphAttributes = {};
      if (!buckets.has(material)) buckets.set(material, []);
      buckets.get(material).push(g);
      return batch;
    },
    /** Builds the merged meshes into `parent`. */
    build(parent, { castShadow = true, receiveShadow = true, name = 'batch' } = {}) {
      const meshes = [];
      for (const [material, geometries] of buckets) {
        if (!geometries.length) continue;
        const merged = mergeGeometries(geometries);
        geometries.forEach(g => g.dispose());
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, material);
        mesh.name = `${name}:${material.name || material.type}`;
        mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
        parent.add(mesh); meshes.push(mesh);
      }
      buckets.clear();
      return meshes;
    }
  };
  return batch;
}

/** Ribbon in track space: columns across [from, to] lanes, rows every `step`
 * metres from start to end; `lift(distance, lane)` raises it off the terrain. */
export function trackRibbon(route, { from, to, start = 0, end = route.length, step = 0.65, columns = 1, lift = 0.04, track = null, color = null }) {
  const positions = [], uv = [], colors = [], trackData = [], indices = [];
  const steps = Math.max(1, Math.ceil((end - start) / step));
  const lifted = typeof lift === 'function' ? lift : () => lift;
  for (let i = 0; i <= steps; i++) {
    const distance = start + (end - start) * i / steps;
    for (let j = 0; j <= columns; j++) {
      const lane = from + (to - from) * j / columns;
      const p = route.sample(distance, lane).position;
      positions.push(p.x, p.y + lifted(distance, lane), p.z);
      uv.push(p.x / 3, p.z / 3);
      const c = color ? color(distance, lane) : 1;
      if (typeof c === 'number') colors.push(c, c, c); else colors.push(c.r, c.g, c.b);
      if (track) trackData.push(distance, lane, track(distance, lane));
    }
    if (i < steps) for (let j = 0; j < columns; j++) {
      const a = i * (columns + 1) + j, b = a + columns + 1;
      // Winding gives an upward normal for from < to (left-hand lanes are +).
      if (to > from) indices.push(a, b, a + 1, a + 1, b, b + 1); else indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (track) geometry.setAttribute('aTrack', new THREE.Float32BufferAttribute(trackData, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Points along the centreline with their distance, for "is this spot clear
 * of every other part of the course" checks. */
export function createClearance(route) {
  const points = Array.from({ length: Math.ceil(route.length / 1.5) }, (_, i) => {
    const distance = i * 1.5;
    const p = route.sample(distance).position;
    return { distance, x: p.x, z: p.z };
  });
  /** True when (x, z) is at least `min` metres from the centreline of every
   * part of the track more than `skip` metres (along the track) from `distance`. */
  return function clear(x, z, distance, min, skip = 22) {
    for (const p of points) {
      let gap = Math.abs(p.distance - distance) % route.length;
      gap = Math.min(gap, route.length - gap);
      if (gap < skip) continue;
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < min * min) return false;
    }
    return true;
  };
}

/** Rotation that makes a +Z-facing object at `lane` face the track. */
export function faceTrack(sample, lane) {
  return sample.angle - Math.sign(lane || 1) * Math.PI / 2;
}

export function canvasTexture(width, height, draw, { anisotropy = 4, srgb = true } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/** A plane whose UVs cover one rectangle [u0, v0, u1, v1] of an atlas. */
export function atlasPlane(width, height, [u0, v0, u1, v1]) {
  const geometry = new THREE.PlaneGeometry(width, height);
  const { uv } = geometry.attributes;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v0 + (v1 - v0) * uv.getY(i));
  return geometry;
}
