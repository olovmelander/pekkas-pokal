import * as THREE from 'three';
import { buildNature, sceneryRandom } from '../shared/scenic.js';
import { createLake } from './lake.js';

export const shoreAt = (z, side = 1) => 23 + Math.sin(z * .019 + side) * 5.5 + Math.sin(z * .063 + side * .8) * 1.8;
const landShore = z => -18 + Math.sin(z * .023) * 2.3;
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
function groundHeight(x, z, land) {
  const undulation = (Math.sin(x * .21 + z * .033) * .25 + Math.sin(z * .08 - x * .12) * .17) * smooth(5, 15, Math.abs(x));
  if (!land) return -.21 + smooth(shoreAt(z, Math.sign(x)), shoreAt(z, Math.sign(x)) + 4, Math.abs(x)) * (.55 + undulation);
  const water = smooth(landShore(z), landShore(z) - 3, x) * (1 - smooth(-78, -83, x));
  return -.22 + smooth(4.8, 7.5, Math.abs(x)) * (.48 + undulation) - water * 1.4;
}

/** Fine grain lives in the texture; big damp/dry patches live in world coordinates. */
export function surfaceMaterial(kind) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'), random = sceneryRandom(kind === 'asphalt' ? 274 : kind === 'trail' ? 337 : 991);
  const base = kind === 'asphalt' ? [76, 79, 74] : kind === 'trail' ? [154, 133, 99] : [170, 177, 151];
  const pixels = ctx.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const grain = (random() - .5) * (kind === 'asphalt' ? 23 : 34);
    pixels.data.set([base[0] + grain, base[1] + grain, base[2] + grain * .7, 255], i * 4);
  }
  ctx.putImageData(pixels, 0, 0);
  for (let i = 0; i < 900; i++) {
    const x = random() * 256, y = random() * 256;
    ctx.fillStyle = kind === 'asphalt' ? (i % 2 ? '#a6aaa22b' : '#212a2633') : kind === 'trail' ? (i % 3 ? '#d7c5a34a' : '#4a463c45') : (i % 2 ? '#b5bc6233' : '#2e512845');
    ctx.beginPath(); ctx.ellipse(x, y, .3 + random() * 1.5, .3 + random() * 2.5, random() * 6.28, 0, Math.PI * 2); ctx.fill();
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({ map, roughness: kind === 'asphalt' ? .96 : .93 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec2 groundLocal;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\ngroundLocal=position.xz;');
    shader.fragmentShader = `varying vec2 groundLocal;\n${shader.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>
      float groundVariation=sin(groundLocal.x*.13+sin(groundLocal.y*.025))*sin(groundLocal.y*.081+groundLocal.x*.27);
      diffuseColor.rgb *= .91+groundVariation*.13;
      ${kind === 'trail' ? 'float rut=exp(-pow((abs(groundLocal.x)-1.9)*2.1,2.0)); diffuseColor.rgb*=1.0-rut*.09;' : ''}
    `);
  };
  material.customProgramCacheKey = () => `tri-ground-${kind}-2`;
  return material;
}

function terrain(material, land) {
  const geometry = new THREE.PlaneGeometry(220, 820, 80, 205); geometry.rotateX(-Math.PI / 2); geometry.translate(0, 0, -350);
  const pos = geometry.attributes.position, { uv } = geometry.attributes;
  const color = new Float32Array(pos.count * 3), a = new THREE.Color(0x6a7c49), b = new THREE.Color(0xa3956d), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, groundHeight(x, z, land)); uv.setXY(i, x / 5, z / 5);
    const edge = land ? Math.min(Math.abs(x - landShore(z)), Math.abs(x + 80)) : Math.abs(Math.abs(x) - shoreAt(z, Math.sign(x)));
    c.copy(a).lerp(b, 1 - smooth(0, 2.4, edge)); c.multiplyScalar(.91 + .12 * Math.sin(x * .4 + z * .12)); c.toArray(color, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3)); geometry.computeVertexNormals();
  const mat = material.clone(); mat.vertexColors = true; mat.color.set(0xffffff); mat.onBeforeCompile = material.onBeforeCompile; mat.customProgramCacheKey = material.customProgramCacheKey;
  const mesh = new THREE.Mesh(geometry, mat); mesh.receiveShadow = true; return mesh;
}

export function buildLandscape(scene, world, sunDirection) {
  const lake = createLake(); world.add(lake.mesh);
  const swim = new THREE.Group(), land = new THREE.Group(); world.add(swim, land);
  const ground = surfaceMaterial('grass'); swim.add(terrain(ground, false)); land.add(terrain(ground, true));
  const random = sceneryRandom(201714), dummy = new THREE.Object3D();
  const stoneGeo = new THREE.DodecahedronGeometry(1, 1), stoneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .95, vertexColors: false });
  const naturals = [];
  for (const [parent, onLand] of [[swim, false], [land, true]]) {
    const trees = [], bushes = [], grass = [];
    // Clumps leave openings toward the lake and cottages instead of a uniform picket fence.
    for (let i = 0; i < 285; i++) {
      const z = 36 - random() * 790, side = i % 2 ? -1 : 1;
      let x;
      if (onLand) x = side > 0 ? 10 + random() * 40 : (i % 5 === 0 ? -86 - random() * 18 : -9 - random() * 4);
      else x = side * (shoreAt(z, side) + 3 + random() * 33);
      if (Math.sin(z * .11 + x * .2) < -.78) continue;
      const near = onLand ? Math.abs(x) < 20 : Math.abs(x) < 37;
      trees.push({ x, z, y: groundHeight(x, z, onLand), height: (near ? 5.2 : 7) + random() * (near ? 4.5 : 7), type: i % 4 === 0 ? 'birch' : 'spruce', details: near ? {} : i % 4 === 0 ? { clumps: 7, detail: 0 } : { tiers: 6, arms: 6, elbow: false, twigs: 0 }, haze: near ? 0 : .07 });
    }
    for (let i = 0; i < 200; i++) {
      const z = 35 - random() * 790, side = i % 2 ? -1 : 1;
      const x = onLand ? side * (6.5 + random() * 5) : side * (shoreAt(z, side) + 1.2 + random() * 4);
      const y = groundHeight(x, z, onLand);
      if (i % 3 === 0)bushes.push({ x, y, z, radius: .35 + random() * .75, color: i % 2 ? 0x657a3d : 0x536e46 });
      grass.push({ x, y, z, radius: .6 + random() * 1.1, height: .25 + random() * .4, count: 32 });
    }
    const nature = buildNature({ trees, bushes, grass, seed: onLand ? 184 : 731, sunDirection, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }); parent.add(nature.group); naturals.push(nature);
    const rocks = new THREE.InstancedMesh(stoneGeo, stoneMat, 260); rocks.castShadow = rocks.receiveShadow = true; parent.add(rocks);
    for (let i = 0; i < 260; i++) {
      const z = 34 - random() * 790, side = i % 2 ? -1 : 1;
      const x = onLand ? (i % 3 ? side * (6.2 + random() * 2) : landShore(z) - random() * .5) : side * (shoreAt(z, side) + random() * 2.2);
      const size = .17 + Math.pow(random(), 3) * 1.25;
      dummy.position.set(x, groundHeight(x, z, onLand) + size * .15, z); dummy.scale.set(size * (1 + random() * .7), size * .6, size); dummy.rotation.set(random() * .3, random() * 6.28, random() * .2); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
      rocks.setColorAt(i, new THREE.Color().setHSL(.08 + random() * .06, .08 + random() * .1, .36 + random() * .18));
    }
  }
  // The airy ridge behind the route is independent of course translation.
  for (let layer = 0; layer < 3; layer++) {
    const p = [], colors = [], idx = [], tint = new THREE.Color([0xaebfba, 0x91a89e, 0x79958a][layer]);
    for (let i = 0; i <= 80; i++) {
      const x = -350 + i * 8.75, y = 10 + Math.sin(x * .022 + layer) * 9 + Math.sin(x * .055 + layer * 2) * 3;
      p.push(x, -4, -245 + layer * 23, x, y, -245 + layer * 23);
      tint.toArray(colors, i * 6); tint.clone().multiplyScalar(1.05).toArray(colors, i * 6 + 3);
      if (i < 80) { const n = i * 2; idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(idx);
    scene.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false })));
  }
  return { update(discipline, time) { const onLand = discipline !== 'swim'; swim.visible = !onLand; land.visible = onLand; lake.update(time, onLand); naturals[onLand ? 1 : 0].update(time); } };
}
