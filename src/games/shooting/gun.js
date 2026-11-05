/**
 * Pekkas Lerduvor — the over-under shotgun, seen from the shoulder.
 *
 * It is on screen every frame of the game, so it gets the PBR treatment
 * the rest of the low-poly range doesn't need: blued steel and an engraved
 * silver action that reflect the evening sky (an environment map baked
 * from sky.js), and oiled walnut with a clear-coat that catches the low
 * sun along the comb. The stock is an extruded side profile — comb, toe,
 * half-pistol grip — rather than a box, because its silhouette sits right
 * in the lower corner of the frame.
 *
 * Everything is built in the old model's units and the caller scales the
 * group (0.55), so recoil and placement numbers stay comparable.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry } from './range.js';

/** Walnut: warm base, dark wavy grain, a few figure flecks. */
function walnutTexture() {
  const w = 512;
  const h = 128;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const rand = mulberry(77);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#7a4524');
  g.addColorStop(0.5, '#8d5430');
  g.addColorStop(1, '#6a3a1e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const y0 = rand() * h;
    const amp = 2 + rand() * 7;
    const f = 0.006 + rand() * 0.012;
    const ph = rand() * 6.28;
    ctx.strokeStyle = rand() < 0.7
      ? `rgba(48,22,10,${0.18 + rand() * 0.3})`
      : `rgba(176,112,62,${0.15 + rand() * 0.2})`;
    ctx.lineWidth = 0.6 + rand() * 1.8;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph) * amp * 0.25;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Scroll engraving on bright steel — the mark of a good bockbössa. */
function engravingTexture() {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = s;
  cv.height = s;
  const ctx = cv.getContext('2d');
  const rand = mulberry(31);
  ctx.fillStyle = '#d4d8de';
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(70,74,82,0.65)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const cx = rand() * s;
    const cy = rand() * s;
    let r = 4 + rand() * 18;
    let a = rand() * 6.28;
    ctx.lineWidth = 0.8 + rand() * 0.8;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    for (let k = 0; k < 40; k++) {
      a += 0.32;
      r *= 0.965;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.stroke();
  }
  // A border line, like the frame around the scroll panel
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, s - 20, s - 20);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function stockShape() {
  // Side profile in (z, y): receiver at z = 0.06, butt at z ≈ 0.64
  const sh = new THREE.Shape();
  sh.moveTo(0.05, 0.034);
  sh.lineTo(0.2, 0.026);
  sh.quadraticCurveTo(0.42, 0.012, 0.62, 0.006);
  sh.lineTo(0.645, -0.004);
  sh.lineTo(0.665, -0.2);
  sh.lineTo(0.64, -0.214);
  sh.quadraticCurveTo(0.42, -0.165, 0.24, -0.118);
  sh.quadraticCurveTo(0.17, -0.1, 0.15, -0.125);
  sh.quadraticCurveTo(0.12, -0.13, 0.1, -0.085);
  sh.lineTo(0.05, -0.045);
  sh.closePath();
  return sh;
}

export function buildShotgun({ envMap, glow, star }) {
  const g = new THREE.Group();
  const textures = [];

  const blued = new THREE.MeshStandardMaterial({
    color: 0x1c2129, metalness: 0.88, roughness: 0.3, envMap, envMapIntensity: 1.25
  });
  const engraving = engravingTexture();
  textures.push(engraving);
  const silver = new THREE.MeshStandardMaterial({
    color: 0xaab0b8, map: engraving, metalness: 1, roughness: 0.3, envMap, envMapIntensity: 0.75
  });
  const wood = walnutTexture();
  textures.push(wood);
  const walnut = new THREE.MeshPhysicalMaterial({
    map: wood, roughness: 0.48, clearcoat: 0.75, clearcoatRoughness: 0.22, envMap, envMapIntensity: 0.7
  });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x17171a, roughness: 0.92 });
  const brass = new THREE.MeshStandardMaterial({
    color: 0xffd27a, metalness: 1, roughness: 0.2, emissive: 0x3a2a08, envMap
  });

  /* Barrels: over-under, tapering to the muzzle, with choke rings */
  [0.028, -0.028].forEach((y) => {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0235, 0.029, 1.07, 18), blued);
    barrel.rotation.x = -Math.PI / 2;
    barrel.position.set(0, y, -0.715);
    g.add(barrel);
    const choke = new THREE.Mesh(new THREE.CylinderGeometry(0.0245, 0.0245, 0.03, 18), silver);
    choke.rotation.x = -Math.PI / 2;
    choke.position.set(0, y, -1.24);
    g.add(choke);
  });
  // Side ribs filling the gap between the tubes
  [-1, 1].forEach((s) => {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.022, 1.02), blued);
    side.position.set(s * 0.02, 0, -0.71);
    g.add(side);
  });
  // Ventilated top rib on its posts, with the mid bead and the gold front bead
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.005, 1.06), blued);
  rib.position.set(0, 0.07, -0.7);
  g.add(rib);
  for (let i = 0; i < 9; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.016, 0.014), blued);
    post.position.set(0, 0.06, -0.24 - i * 0.115);
    g.add(post);
  }
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 10, 8), brass);
  bead.position.set(0, 0.078, -1.22);
  g.add(bead);
  const midBead = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), silver);
  midBead.position.set(0, 0.075, -0.72);
  g.add(midBead);

  /* Action: engraved silver box, top lever, trigger guard */
  const action = new THREE.Mesh(new RoundedBoxGeometry(0.084, 0.118, 0.25, 2, 0.014), silver);
  action.position.set(0, 0.002, -0.06);
  g.add(action);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.01, 0.07), blued);
  lever.position.set(0.012, 0.063, 0.04);
  lever.rotation.y = 0.35;
  g.add(lever);
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0065, 6, 14, Math.PI), blued);
  guard.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  guard.position.set(0, -0.06, 0.02);
  g.add(guard);
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.034, 0.008), silver);
  trigger.position.set(0, -0.07, 0.025);
  trigger.rotation.x = 0.3;
  g.add(trigger);

  /* Forend: rounded walnut under the barrels */
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.052, 0.36, 18), walnut);
  fore.rotation.x = -Math.PI / 2;
  fore.scale.set(1.08, 1, 1);
  fore.position.set(0, -0.042, -0.4);
  g.add(fore);

  /* Stock: the extruded side profile, beveled so its edges catch light */
  const stockGeo = new THREE.ExtrudeGeometry(stockShape(), {
    depth: 0.05, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3, curveSegments: 10
  });
  stockGeo.rotateY(-Math.PI / 2);
  stockGeo.translate(0.025, 0, 0);
  wood.repeat.set(1.6, 6);
  const stock = new THREE.Mesh(stockGeo, walnut);
  g.add(stock);
  const pad = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.21, 0.02, 2, 0.008), rubber);
  pad.position.set(0, -0.1, 0.662);
  pad.rotation.x = 0.12;
  g.add(pad);

  /* Grip frames for the shooter's hands (index.js poses a people-system
     shooter with holdWith). hold() convention: origin = the grip centre,
     +Y along the handle toward its business end, +Z the way the palm
     faces. The left hand cradles the forend from below and to the near
     side, palm up and in; the right hand wraps the pistol grip, palm
     facing in (−x), its +Y running up the grip toward the tang. */
  const forendGrip = new THREE.Object3D();
  forendGrip.position.set(0, -0.042, -0.49);
  forendGrip.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0.8, -0.6, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0.6, 0.8, 0)
  ));
  g.add(forendGrip);
  const pistolGrip = new THREE.Object3D();
  pistolGrip.position.set(0, -0.05, 0.155);
  {
    const y = new THREE.Vector3(0, 0.8, -0.6).normalize();
    const z = new THREE.Vector3(-1, 0, 0);
    const x = new THREE.Vector3().crossVectors(y, z);
    pistolGrip.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }
  g.add(pistolGrip);

  /* Muzzle flash: glow + star petals + a real point light */
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.028, -1.27);
  g.add(muzzle);
  const flashMat = new THREE.SpriteMaterial({
    map: glow, color: 0xffd58a, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  });
  const flash = new THREE.Sprite(flashMat);
  flash.position.set(0, 0.02, -1.36);
  flash.scale.setScalar(0.6);
  g.add(flash);
  const starMat = new THREE.SpriteMaterial({
    map: star, color: 0xfff0c8, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  });
  const starSprite = new THREE.Sprite(starMat);
  starSprite.position.set(0, 0.02, -1.42);
  starSprite.scale.setScalar(0.9);
  g.add(starSprite);
  // The flash lights the gun itself for two frames: a warm emissive pulse
  // on its own materials (setFlash). A real point light would do the same
  // but add a light to every shader in the scene for the whole game — and
  // toggling it with the gun's visibility would recompile them all.
  const glowMats = [blued, silver, walnut];
  glowMats.forEach((m) => m.emissive.set(0xffa955));
  function setFlash(k) {
    glowMats.forEach((m) => {
      m.emissiveIntensity = k * (m === walnut ? 0.5 : 0.9);
    });
  }
  setFlash(0);

  return { group: g, flashMat, starMat, starSprite, flash, setFlash, muzzle, textures, forendGrip, pistolGrip };
}
