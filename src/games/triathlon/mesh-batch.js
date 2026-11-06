import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Merge direct static children, leaving animated child groups independent. */
export function mergeStaticMeshes(parent) {
  const batches = new Map();
  for (const child of [...parent.children]) {
    if (!child.isMesh || child.isInstancedMesh) continue;
    child.updateMatrix();
    const geometry = child.geometry.clone().applyMatrix4(child.matrix);
    if (!batches.has(child.material)) batches.set(child.material, []);
    batches.get(child.material).push(geometry);
    parent.remove(child);
  }
  for (const [material, geometries] of batches) {
    const merged = new THREE.Mesh(mergeGeometries(geometries), material);
    merged.castShadow = merged.receiveShadow = true;
    parent.add(merged);
    geometries.forEach(geometry => geometry.dispose());
  }
}
