// Export the ceramicist's bind-pose body (with a buzz cut) for modelling her hair in Blender.
// Usage: node tools/blender/export-ref.mjs  (writes tools/blender/ref/body.obj and info.json)
import fs from 'node:fs';
import * as THREE from 'three';
import { createPerson } from '../../src/games/shared/people.js';
import { KERAMIKER_HEIGHT } from '../../src/games/clay/keramiker.js';
const src = fs.readFileSync(new URL('../../src/games/clay/keramiker.js', import.meta.url), 'utf8');
const lookSrc = src.slice(src.indexOf('const LOOK = {') + 'const LOOK = '.length, src.indexOf('};', src.indexOf('const LOOK = {')) + 1).replace('KERAMIKER_HEIGHT', String(KERAMIKER_HEIGHT));
const LOOK = Function(`return (${lookSrc});`)();
LOOK.hair = { style: 'buzz', color: LOOK.hair.color };
const person = createPerson(LOOK);
person.root.updateMatrixWorld(true);
const g = person.mesh.geometry;
const pos = g.attributes.position, idx = g.index, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
const bones = person.skeleton.bones;
const headI = bones.findIndex((b) => b.name === 'head'), neckI = bones.findIndex((b) => b.name === 'neck');
let obj = '# keramiker bind pose, metres, +Y up, facing +Z\n';
for (let i = 0; i < pos.count; i++) obj += `v ${pos.getX(i).toFixed(5)} ${pos.getY(i).toFixed(5)} ${pos.getZ(i).toFixed(5)}\n`;
for (let f = 0; f < idx.count; f += 3) obj += `f ${idx.getX(f) + 1} ${idx.getX(f + 1) + 1} ${idx.getX(f + 2) + 1}\n`;
fs.mkdirSync(new URL('./ref/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./ref/body.obj', import.meta.url), obj);
// Head-weighted vertices only, for the scalp
const headVerts = [];
for (let i = 0; i < pos.count; i++) {
  let w = 0;
  for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === headI) w += sw.getComponent(i, k);
  if (w > 0.5) headVerts.push(i);
}
const joints = {};
for (const name of ['head', 'neck', 'chest', 'spine', 'upperArmL', 'upperArmR', 'shoulderL', 'shoulderR']) {
  const b = bones.find((x) => x.name === name); const v = new THREE.Vector3(); b.getWorldPosition(v); joints[name] = v.toArray().map((n) => +n.toFixed(5));
}
const sockets = {};
for (const name of ['headTop', 'face']) { const v = new THREE.Vector3(); person.sockets[name].getWorldPosition(v); sockets[name] = v.toArray().map((n) => +n.toFixed(5)); }
const box = new THREE.Box3();
headVerts.forEach((i) => box.expandByPoint(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))));
fs.writeFileSync(new URL('./ref/info.json', import.meta.url), JSON.stringify({ height: KERAMIKER_HEIGHT, scale: person.scale, joints, sockets, headBox: { min: box.min.toArray(), max: box.max.toArray() }, headVertexCount: headVerts.length, vertexCount: pos.count, headBone: headI, neckBone: neckI, bones: bones.map((b) => b.name) }, null, 1));
console.log('ok', pos.count, idx.count / 3, headVerts.length, JSON.stringify({ joints, sockets, box: [box.min.toArray(), box.max.toArray()] }));
