import * as THREE from 'three';
import { createPerson, appearanceFor, POSES } from '../shared/people.js';
import { buildStadiumArt } from './stadium-art.js';
import { buildNature } from '../shared/scenic.js';

export function buildStadium(scene, { reducedMotion = false } = {}) {
  const stadium = buildStadiumArt(scene);
  const trees = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) trees.push({ y: -0.35, x: side * (42 + i % 3 * 3), z: -46 + i * 12, height: 8 + i % 4 * 1.5, type: i % 3 ? 'spruce' : 'birch' });
    for (let i = 0; i < 6; i++) trees.push({ y: -0.35, x: -31 + i * 12, z: side * (48 + i % 2 * 4), height: 8 + i % 3 * 2, type: 'spruce' });
  }
  const nature = buildNature({ trees, seed: 2011, reducedMotion });
  scene.add(nature.group);
  const root = new THREE.Group();
  scene.add(root);
  const add = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  const skyCanvas = document.createElement('canvas'); skyCanvas.width = 4; skyCanvas.height = 256;
  const skyContext = skyCanvas.getContext('2d');
  const skyGradient = skyContext.createLinearGradient(0, 0, 0, 256);
  skyGradient.addColorStop(0, '#0b162b'); skyGradient.addColorStop(0.35, '#243749');
  skyGradient.addColorStop(0.5, '#84736c'); skyGradient.addColorStop(0.65, '#303d49'); skyGradient.addColorStop(1, '#18252d');
  skyContext.fillStyle = skyGradient; skyContext.fillRect(0, 0, 4, 256);
  const skyTexture = new THREE.CanvasTexture(skyCanvas); skyTexture.colorSpace = THREE.SRGBColorSpace;
  const sky = add(new THREE.SphereGeometry(200, 24, 16), new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, depthWrite: false, fog: false }), 0, 0, 0);
  sky.renderOrder = -10;
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
  const shadowContext = shadowCanvas.getContext('2d');
  const shadowGradient = shadowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  shadowGradient.addColorStop(0, '#0c191bb3'); shadowGradient.addColorStop(0.45, '#0c191b55'); shadowGradient.addColorStop(1, '#0c191b00');
  shadowContext.fillStyle = shadowGradient; shadowContext.fillRect(0, 0, 64, 64);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: 0.7 });
  const ballCanvas = document.createElement('canvas'); ballCanvas.width = 512; ballCanvas.height = 256;
  const ballContext = ballCanvas.getContext('2d'); ballContext.fillStyle = '#eee9d8'; ballContext.fillRect(0, 0, 512, 256);
  ballContext.strokeStyle = '#9daba7'; ballContext.lineWidth = 2;
  for (let row = 0; row < 3; row++) for (let col = -1; col < 7; col++) {
    const x = col * 85 + row % 2 * 42, y = 34 + row * 94;
    ballContext.fillStyle = '#152735'; ballContext.beginPath();
    for (let corner = 0; corner < 5; corner++) {
      const angle = corner * Math.PI * 2 / 5 - Math.PI / 2;
      const px = x + Math.cos(angle) * 23, py = y + Math.sin(angle) * 23;
      if (corner) ballContext.lineTo(px, py); else ballContext.moveTo(px, py);
    }
    ballContext.closePath(); ballContext.fill(); ballContext.stroke();
  }
  const ballTexture = new THREE.CanvasTexture(ballCanvas); ballTexture.colorSpace = THREE.SRGBColorSpace;
  const ball = add(new THREE.SphereGeometry(0.35, 24, 16), new THREE.MeshStandardMaterial({ map: ballTexture, roughness: 0.62 }), 0, 0.45, 0);
  ball.castShadow = true;
  const people = [];
  const positions = [[0, 21], [-4, 11], [6, 3], [-6, 1], [0, -10]];
  for (let i = 0; i < 10; i++) {
    const home = i < 5;
    const person = createPerson(appearanceFor(['Elliot Holt', 'Theo Ward', 'Milo Hart', 'Arlo Cole', 'Max Brook'][i % 5], {
      detail: 'high',
      outfit: { top: 'jersey', topColor: i % 5 === 0 ? (home ? 0xc65c50 : 0x63a68d) : home ? 0xf1c357 : 0x497cc9, bottom: 'shorts', bottomColor: home ? 0x18273a : 0xf3e9d6, shoes: 'sneakers', accent: 0xf5eee0 }
    }));
    const pos = positions[i % 5];
    person.root.position.set(pos[0] * (home ? 1 : -1), 0.12, pos[1] * (home ? 1 : -1));
    person.root.rotation.y = home ? Math.PI : 0;
    root.add(person.root);
    const shadow = add(new THREE.PlaneGeometry(2.1, 1.35), shadowMaterial, person.root.position.x, 0.055, person.root.position.z);
    shadow.rotation.x = -Math.PI / 2;
    people.push({ person, shadow, x: person.root.position.x, z: person.root.position.z, i });
  }
  const marker = add(new THREE.RingGeometry(0.65, 0.85, 48), new THREE.MeshBasicMaterial({ color: 0xffd47b, transparent: true, opacity: 0.9, depthWrite: false }), 0, 0.12, 0);
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  const trailPoints = new Float32Array(45);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPoints, 3));
  const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: 0xffdf9e, transparent: true, opacity: 0.55 }));
  trail.frustumCulled = false;
  trail.visible = false;
  root.add(trail);
  let highlight = null;
  let highlightTime = 0;
  const setBall = (t) => {
    const source = people[highlight.slot];
    const isSave = !highlight.goals && highlight.saves >= 3;
    const startX = isSave ? -5 : source.x;
    const startZ = isSave ? 10 : source.z;
    const endX = Math.sin(highlight.slot * 2.3) * 2.3;
    const endZ = isSave ? 22 : -24;
    return [startX + (endX - startX) * t, 0.42 + Math.sin(Math.PI * t) * (isSave ? 1.2 : 2.7), startZ + (endZ - startZ) * t];
  };
  return {
    ball,
    highlight(row, slot) {
      highlight = { ...row, slot };
      highlightTime = 0;
      stadium.highlight(row);
    },
    update(dt, time, live, celebration) {
      if (highlight) highlightTime += dt;
      const highlightActive = highlight && highlightTime < 2.25;
      stadium.update(dt, time, reducedMotion);
      nature.update(time);
      people.forEach(({ person, shadow, x, z, i }) => {
        const move = live ? 1 : 0.12;
        person.root.position.x = x + Math.sin(time * 0.8 + i * 2) * 3.1 * move;
        person.root.position.z = z + Math.sin(time * 0.53 + i) * 4.2 * move;
        shadow.position.set(person.root.position.x, 0.055, person.root.position.z);
        const hero = highlightActive && i === highlight.slot;
        person.setPose(hero && highlightTime > 1.2 && highlight.goals ? POSES.cheer(time) : live ? POSES.walk(time * 6 + i) : POSES.stand(time), 0.2);
        person.setExpression(celebration > 0 ? 'grin' : 'focus', 0.6);
        person.update(dt, time);
      });
      marker.visible = !!highlightActive;
      trail.visible = !!highlightActive && (highlight.goals || highlight.assists || highlight.saves >= 3);
      if (highlightActive) {
        const source = people[highlight.slot].person.root.position;
        marker.position.set(source.x, 0.14, source.z);
        marker.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(highlightTime * 5) * 0.12);
      }
      if (trail.visible) {
        const progress = Math.min(1, highlightTime / 1.4);
        ball.position.set(...setBall(progress));
        for (let i = 0; i < 15; i++) {
          const p = setBall(Math.max(0, progress - (14 - i) * 0.018));
          trailPoints.set(p, i * 3);
        }
        trailGeometry.attributes.position.needsUpdate = true;
      } else ball.position.set(Math.sin(time * 0.75) * 8, 0.45, Math.sin(time * 0.5) * 15);
      ball.rotation.x = time;
      ball.rotation.z = time * 0.7;
    },
    dispose() { stadium.dispose(); people.forEach(({ person }) => person.dispose()); }
  };
}
