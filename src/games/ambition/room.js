import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPerson, appearanceFor, POSES } from '../shared/people.js';
import { makeRoomMaterials, stockholmTexture } from './materials.js';

/** A furnished Kungsholmen salon. The playing surface is deliberately quiet;
 * richer furniture and contrasting window light frame it around the edges. */
export function buildRoom(scene, { reducedMotion = false } = {}) {
  const root = new THREE.Group();
  root.name = 'Kungsholmens kortsalong';
  scene.add(root);
  const m = makeRoomMaterials();
  const coarse = matchMedia('(pointer: coarse)').matches;
  const staticObjects = [];
  const detail = coarse ? 24 : 40;
  function mesh(geometry, material, x, y, z, dynamic = false) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = !material.transparent && !material.isMeshBasicMaterial;
    object.receiveShadow = true;
    root.add(object);
    if (!dynamic) staticObjects.push(object);
    return object;
  }
  const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const cylinder = (r, h, mat, x, y, z) => mesh(new THREE.CylinderGeometry(r, r, h, detail), mat, x, y, z);
  const sphere = (r, mat, x, y, z) => mesh(new THREE.SphereGeometry(r, 16, 10), mat, x, y, z);
  const lathe = (profile, mat, x, y, z) => mesh(new THREE.LatheGeometry(profile.map(([r, height]) => new THREE.Vector2(r, height)), detail), mat, x, y, z);
  const ring = (radius, tube, mat, x, y, z, horizontal = true) => {
    const object = mesh(new THREE.TorusGeometry(radius, tube, 6, detail * 2), mat, x, y, z);
    if (horizontal) object.rotation.x = -Math.PI / 2;
    return object;
  };
  const curve = (points, radius, mat) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), 24, radius, 6, false), mat, 0, 0, 0);
  const oval = (radius, height, mat, y, ratio = .76) => {
    const object = cylinder(radius, height, mat, 0, y, 0);
    object.scale.z = ratio;
    return object;
  };
  function frame(x, y, z, width, height, depth, mat = m.wood, thickness = .055) {
    box(width, thickness, depth, mat, x, y - height / 2, z);
    box(width, thickness, depth, mat, x, y + height / 2, z);
    box(thickness, height, depth, mat, x - width / 2, y, z);
    box(thickness, height, depth, mat, x + width / 2, y, z);
  }

  // Parquet, inset rug and layered joinery ground the furniture in a real room.
  box(19, .12, 18, m.floor, 0, -.07, 0);
  const rug = mesh(new THREE.PlaneGeometry(7.5, 5.8), m.rug, 0, .005, 0);
  rug.rotation.x = -Math.PI / 2;
  box(19, 6.8, .24, m.wall, 0, 3.35, -5.8);
  for (const side of [-1, 1]) box(.24, 6.8, 12, m.wall, side * 8.8, 3.35, -.1);
  box(18, 1.55, .3, m.darkWood, 0, .76, -5.57);
  for (let x = -8.2; x < 8.5; x += 1.18) {
    box(1.04, 1.14, .035, m.wood, x, .74, -5.39);
    frame(x, .74, -5.35, .91, 1.01, .045, m.darkWood, .045);
    frame(x, .74, -5.31, .81, .91, .03, m.agedGold, .012);
  }
  [.13, 1.43, 1.52, 6.22, 6.32, 6.44].forEach((y, i) => box(18, i < 3 ? .065 : .11, i < 3 ? .38 : .52, i % 2 ? m.wood : m.darkWood, 0, y, -5.43));
  box(18, .025, .43, m.gold, 0, 1.54, -5.4);

  // Three mullioned windows share a continuous, hand-drawn Stockholm panorama.
  const city = stockholmTexture();
  [-3.55, 0, 3.55].forEach((x, index) => {
    const view = city.clone(); view.repeat.set(1 / 3, 1); view.offset.x = index / 3;
    const sky = new THREE.MeshBasicMaterial({ map: view, color: '#c6d2e7', toneMapped: false });
    box(2.55, 3.75, .05, m.darkWood, x, 3.72, -5.42);
    const pane = mesh(new THREE.PlaneGeometry(2.43, 3.62), sky, x, 3.72, -5.37);
    pane.castShadow = false;
    frame(x, 3.72, -5.29, 2.58, 3.8, .15, m.wood, .095);
    frame(x, 3.72, -5.18, 2.42, 3.64, .04, m.agedGold, .018);
    box(.045, 3.65, .11, m.darkWood, x, 3.72, -5.24);
    box(2.42, .06, .11, m.darkWood, x, 3.55, -5.24);
    box(2.42, .035, .08, m.agedGold, x, 4.68, -5.23);
    box(2.83, .12, .5, m.wood, x, 1.82, -5.2);
    box(2.83, .025, .52, m.gold, x, 1.89, -5.2);
    cylinder(.026, .24, m.gold, x + .1, 3.27, -5.14);
    const rail = cylinder(.034, 3.5, m.gold, x, 5.94, -4.99); rail.rotation.z = Math.PI / 2;
    for (const side of [-1, 1]) {
      sphere(.09, m.gold, x + side * 1.78, 5.94, -4.99);
      const curtainGeometry = new THREE.PlaneGeometry(.85, 4.2, 24, 24);
      const positions = curtainGeometry.attributes.position;
      for (let n = 0; n < positions.count; n++) {
        const py = positions.getY(n), px = positions.getX(n);
        const gather = .6 + .4 * Math.abs(py) / 2.1;
        positions.setX(n, px * gather + side * Math.sin((py + 2.1) / 4.2 * Math.PI) * .13);
        positions.setZ(n, .12 * Math.cos(px * 42) * (.75 + .25 * Math.abs(py) / 2.1));
      }
      curtainGeometry.computeVertexNormals();
      mesh(curtainGeometry, m.velvet, x + side * 1.42, 3.64, -5.0);
      for (let n = 0; n < 5; n++) ring(.052, .013, m.gold, x + side * 1.42 - .32 + n * .16, 5.78, -4.99, false).rotation.y = Math.PI / 2;
      curve([[x + side * 1.08, 2.76, -5.02], [x + side * 1.39, 2.65, -4.82], [x + side * 1.71, 2.76, -5.02]], .026, m.gold);
      cylinder(.018, .28, m.gold, x + side * 1.6, 2.47, -4.88);
      lathe([[.015, 0], [.045, .1], [.025, .14], [.018, .18]], m.agedGold, x + side * 1.6, 2.2, -4.88);
    }
    curve([[x - 1.6, 5.7, -5.01], [x - .8, 5.43, -5.06], [x, 5.33, -5.06], [x + .8, 5.43, -5.06], [x + 1.6, 5.7, -5.01]], .115, m.velvet);
  });
  city.dispose(); // Only its three clones are attached to materials.

  function bookcase(x) {
    box(1.92, 3.47, .3, m.darkWood, x, 1.84, -5.13);
    for (const side of [-1, 1]) box(.13, 3.55, .58, m.wood, x + side * .95, 1.84, -4.98);
    [.17, .8, 1.48, 2.16, 2.84, 3.55].forEach((y) => { box(2.08, .075, .65, m.wood, x, y, -4.94); box(2.08, .018, .02, m.gold, x, y + .013, -4.61); });
    const bookColors = ['#683e35', '#385451', '#b4a07a', '#2e3545', '#7b5a36'];
    const bookMaterials = bookColors.map((color) => new THREE.MeshStandardMaterial({ color, roughness: .81 }));
    for (let row = 0; row < 4; row++) for (let i = 0; i < 10; i++) {
      const bx = x - .77 + i * .16, by = .85 + row * .68, height = .37 + ((i * 7 + row * 3) % 5) * .037;
      box(.126, height, .34, bookMaterials[(i + row) % 5], bx, by + height / 2, -4.88);
      box(.115, .015, .004, m.gold, bx, by + height - .055, -4.704);
      box(.115, .009, .004, m.agedGold, bx, by + .055, -4.704);
      box(.067, .032, .006, m.paper, bx, by + height * .59, -4.7);
    }
    box(2.21, .12, .75, m.wood, x, 3.64, -4.97);
    box(2.16, .026, .71, m.gold, x, 3.72, -4.97);
  }
  bookcase(-6.42);
  bookcase(6.42);

  // A mantel clock and the cup are quiet landmarks above the shelves.
  box(.65, .56, .28, m.darkWood, -6.42, 4.03, -4.95);
  const clock = cylinder(.25, .04, m.gold, -6.42, 4.13, -4.77); clock.rotation.x = Math.PI / 2;
  const face = cylinder(.219, .045, m.porcelain, -6.42, 4.13, -4.74); face.rotation.x = Math.PI / 2;
  ring(.206, .006, m.agedGold, -6.42, 4.13, -4.71, false);
  for (let n = 0; n < 12; n++) {
    const angle = n * Math.PI / 6;
    const tick = box(.012, .028, .006, m.darkWood, -6.42 + Math.sin(angle) * .18, 4.13 + Math.cos(angle) * .18, -4.704); tick.rotation.z = -angle;
  }
  const hand = box(.014, .14, .01, m.black, -6.45, 4.18, -4.696); hand.rotation.z = .6;
  const minute = box(.011, .19, .012, m.black, -6.37, 4.15, -4.686); minute.rotation.z = -1.15;
  lathe([[.21, 0], [.21, .06], [.11, .09], [.08, .17], [.055, .27], [.11, .33], [.22, .4], [.28, .59], [.26, .65]], m.gold, 6.42, 3.75, -4.95);
  for (const side of [-1, 1]) curve([[6.42 + side * .23, 4.33, -4.95], [6.42 + side * .39, 4.32, -4.95], [6.42 + side * .35, 4.12, -4.95], [6.42 + side * .15, 4.1, -4.95]], .027, m.gold);
  box(.33, .1, .25, m.darkWood, 6.42, 3.75, -4.95);

  // Sconces, ornamental escutcheons and warm pools around the window reveals.
  for (const x of [-5.29, 5.29]) {
    const plate = sphere(.17, m.agedGold, x, 3.25, -5.28); plate.scale.set(.6, 1.4, .24);
    curve([[x, 3.2, -5.15], [x, 3.06, -4.98], [x, 3.22, -4.83]], .027, m.gold);
    lathe([[.14, 0], [.18, .025], [.16, .04]], m.gold, x, 3.25, -4.83);
    lathe([[.12, 0], [.1, .28], [.075, .34]], m.porcelain, x, 3.28, -4.83);
    sphere(.055, m.light, x, 3.64, -4.83);
    const light = new THREE.PointLight('#ffc17d', 4, 3.2, 2); light.position.set(x, 3.6, -4.65); root.add(light);
  }

  // Turned walnut pedestal, leather rail and fine brass piping.
  oval(2.43, .18, m.wood, 1.06);
  oval(2.4, .034, m.agedGold, 1.164);
  oval(2.34, .095, m.leather, 1.205);
  oval(2.18, .027, m.green, 1.264);
  const outerPipe = ring(2.365, .018, m.gold, 0, 1.243, 0); outerPipe.scale.y = .76;
  const innerPipe = ring(2.19, .012, m.agedGold, 0, 1.28, 0); innerPipe.scale.y = .76;
  const stitched = ring(2.27, .003, m.gold, 0, 1.257, 0); stitched.scale.y = .76;
  for (let n = 0; n < 80; n++) {
    const a = n * Math.PI * 2 / 80;
    const pin = sphere(.008, m.gold, Math.cos(a) * 2.285, 1.256, Math.sin(a) * 2.285 * .76); pin.scale.y = .4;
  }
  const innerRing = ring(1.42, .0035, m.gold, 0, 1.282, 0); innerRing.scale.y = .72;
  for (const x of [-1.3, 1.3]) {
    lathe([[.16, 0], [.2, .07], [.12, .12], [.09, .28], [.14, .38], [.12, .45], [.09, .68], [.16, .85]], m.wood, x, .05, 0);
    for (const side of [-1, 1]) {
      const foot = box(.24, .13, 1.05, m.wood, x, .11, side * .4); foot.rotation.y = side * .2;
      sphere(.095, m.agedGold, x + side * .07, .1, side * .89);
    }
  }
  box(2.6, .13, .13, m.wood, 0, .38, 0);

  // Lamp, wax, porcelain and glass use different roughness and silhouettes.
  lathe([[.19, 0], [.24, .02], [.23, .05], [.16, .08], [.11, .11], [.06, .14], [.035, .18], [.035, .58], [.065, .62]], m.gold, -1.64, 1.28, -.65);
  lathe([[.34, 0], [.35, .025], [.29, .08], [.22, .17], [.12, .28], [.06, .3]], m.lampshade, -1.64, 1.92, -.65);
  ring(.345, .011, m.gold, -1.64, 1.94, -.65);
  cylinder(.17, .012, m.light, -1.64, 1.945, -.65);
  sphere(.045, m.gold, -1.64, 2.24, -.65);
  const lamp = new THREE.PointLight('#ffd79a', 7, 4.5, 2); lamp.position.set(-1.64, 1.87, -.65); root.add(lamp);
  const flames = [];
  for (const [x, z] of [[1.65, -.6], [-1.35, .83]]) {
    lathe([[.14, 0], [.15, .025], [.1, .06], [.045, .09], [.032, .19], [.07, .23], [.055, .26], [.035, .34], [.1, .37], [.11, .4]], m.gold, x, 1.28, z);
    cylinder(.057, .29, m.wax, x, 1.81, z);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7;
      const drop = sphere(.015, m.wax, x + Math.sin(a) * .053, 1.87 - i * .018, z + Math.cos(a) * .053); drop.scale.y = 2.8;
    }
    cylinder(.005, .026, m.black, x, 1.968, z);
    const flame = mesh(new THREE.SphereGeometry(.025, 10, 8), m.flame, x, 2.01, z, true); flame.scale.y = 2;
    flames.push(flame);
    const light = new THREE.PointLight('#ffc375', 1.1, 2.7, 2); light.position.set(x, 2.04, z); root.add(light);
  }
  for (const [x, z, angle] of [[1.49, .66, -.4], [-.64, -1.17, 1.7], [.7, -1.12, 2.4]]) {
    lathe([[0, 0], [.13, 0], [.16, .018], [.165, .026], [.14, .031], [.085, .02]], m.porcelain, x, 1.284, z);
    ring(.15, .002, m.gold, x, 1.313, z);
    lathe([[.05, 0], [.055, .02], [.07, .035], [.085, .12], [.083, .145], [.075, .145], [.072, .12]], m.porcelain, x, 1.31, z);
    ring(.081, .003, m.gold, x, 1.455, z);
    cylinder(.072, .003, m.coffee, x, 1.444, z);
    const handle = ring(.051, .011, m.porcelain, x + Math.cos(angle) * .087, 1.396, z + Math.sin(angle) * .087, false); handle.rotation.y = -angle + Math.PI / 2;
    const spoon = box(.014, .009, .15, m.silver, x + .15, 1.325, z + .05); spoon.rotation.y = .35;
    const spoonBowl = sphere(.025, m.silver, x + .176, 1.325, z + .117); spoonBowl.scale.set(.7, .18, 1);
  }
  lathe([[.06, 0], [.071, .025], [.078, .25], [.081, .27], [.075, .27], [.07, .04]], m.glass, 1.11, 1.29, -1.08);
  ring(.079, .004, m.glass, 1.11, 1.56, -1.08);
  cylinder(.066, .09, new THREE.MeshStandardMaterial({ color: '#d1ac69', transparent: true, opacity: .43, roughness: .14 }), 1.11, 1.37, -1.08);

  // A real score pad, pencil, biscuits, stacked chips and bordered card backs.
  const pad = box(.31, .018, .43, m.paper, .06, 1.293, -1.18); pad.rotation.y = -.12;
  for (let n = 0; n < 6; n++) box(.23, .001, .0015, m.agedGold, .06, 1.303, -1.33 + n * .055);
  const pencil = cylinder(.007, .36, m.agedGold, .3, 1.31, -1.16); pencil.rotation.z = Math.PI / 2; pencil.rotation.y = .8;
  const biscuits = new THREE.MeshStandardMaterial({ color: '#b68043', roughness: .92 });
  cylinder(.19, .013, m.porcelain, -.9, 1.291, -.3);
  for (let i = 0; i < 3; i++) {
    const biscuit = cylinder(.068, .025, biscuits, -.95 + i * .06, 1.318 + i * .018, -.32 + i * .035); biscuit.rotation.y = i;
    for (let n = 0; n < 5; n++) sphere(.005, m.coffee, -.95 + i * .06 + Math.sin(n * 2.4) * .04, 1.335 + i * .018, -.32 + i * .035 + Math.cos(n * 2.4) * .04);
  }
  for (let n = 0; n < 5; n++) box(.18, .008, .26, m.paper, -.98, 1.29 + n * .009, -.77);
  box(.164, .003, .242, m.cardBack, -.98, 1.333, -.77);
  for (let stack = 0; stack < 5; stack++) {
    for (let n = 0; n < 3 + stack; n++) {
      const x = .88 + (stack % 3) * .11, z = -.56 + Math.floor(stack / 3) * .12;
      cylinder(.049, .016, stack % 2 ? m.paper : m.agedGold, x, 1.294 + n * .018, z);
      ring(.039, .002, m.gold, x, 1.303 + n * .018, z);
    }
  }

  // Small side table and tea service, visible beyond the players' shoulders.
  const sideTop = cylinder(.52, .075, m.wood, 3.65, .91, -2.87);
  sideTop.scale.z = .82;
  lathe([[.2, 0], [.24, .05], [.08, .13], [.045, .58], [.16, .76]], m.wood, 3.65, .1, -2.87);
  cylinder(.36, .015, m.silver, 3.65, .96, -2.87);
  lathe([[.08, 0], [.12, .035], [.15, .13], [.13, .24], [.08, .28], [.075, .35]], m.silver, 3.62, .98, -2.87);
  sphere(.033, m.agedGold, 3.62, 1.36, -2.87);
  curve([[3.72, 1.07, -2.87], [3.87, 1.17, -2.87], [3.87, 1.27, -2.87]], .035, m.silver);
  curve([[3.53, 1.3, -2.87], [3.36, 1.3, -2.87], [3.35, 1.07, -2.87], [3.52, 1.03, -2.87]], .022, m.darkWood);

  const pendant = new THREE.PointLight('#ffc78b', 21, 11, 2); pendant.position.set(.1, 4.1, -.1); root.add(pendant);
  const windowFill = new THREE.PointLight('#9dbed8', 13, 11, 2); windowFill.position.set(1.5, 3.8, -4.7); root.add(windowFill);
  const people = [];
  [['Niklas Norberg', -2.75, 0, Math.PI / 2], ['Erik Vallgren', 0, -2.25, 0], ['Mikael Hägglund', 2.75, 0, -Math.PI / 2]].forEach(([name, x, z, angle]) => {
    const seat = box(.65, .12, .63, m.wood, x, .51, z); seat.rotation.y = angle;
    const cushion = box(.56, .1, .55, m.leather, x, .61, z); cushion.rotation.y = angle;
    const bx = x - Math.sin(angle) * .28, bz = z - Math.cos(angle) * .28;
    const back = box(.64, .79, .1, m.wood, bx, 1.0, bz); back.rotation.y = angle;
    const inset = box(.49, .58, .11, m.leather, bx + Math.sin(angle) * .025, 1.05, bz + Math.cos(angle) * .025); inset.rotation.y = angle;
    for (const side of [-1, 1]) for (const front of [-1, 1]) {
      const lx = x + Math.cos(angle) * side * .25 + Math.sin(angle) * front * .23;
      const lz = z - Math.sin(angle) * side * .25 + Math.cos(angle) * front * .23;
      lathe([[.025, 0], [.04, .04], [.029, .14], [.037, .3], [.042, .5]], m.wood, lx, .02, lz);
    }
    const person = createPerson(appearanceFor(name, { detail: coarse ? 'low' : 'high', outfit: { top: 'shirt', bottom: 'trousers' } }));
    person.root.position.set(x, .08, z); person.root.rotation.y = angle;
    person.setPose(POSES.sit()); person.setExpression('focus', .4); root.add(person.root); people.push(person);
    for (let c = 0; c < 5; c++) {
      const fan = (c - 2) * .08;
      const cx = x * .61 + Math.cos(angle) * fan, cz = z * .59 - Math.sin(angle) * fan;
      const paper = box(.18, .008, .27, m.paper, cx, 1.29 + c * .006, cz); paper.rotation.y = angle + (c - 2) * -.15;
      const backCard = box(.158, .003, .245, m.cardBack, cx, 1.297 + c * .006, cz); backCard.rotation.y = paper.rotation.y;
      ring(.033, .002, m.gold, cx, 1.3 + c * .006, cz);
    }
  });

  // Merge immutable props by material, keeping people, flames and rewards live.
  root.updateMatrixWorld(true);
  const batches = new Map();
  for (const object of staticObjects) {
    const key = object.material;
    if (!batches.has(key)) batches.set(key, []);
    const geometry = object.geometry.clone(); geometry.applyMatrix4(object.matrixWorld);
    batches.get(key).push(geometry); root.remove(object); object.geometry.dispose();
  }
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((part) => part.dispose());
    const merged = new THREE.Mesh(geometry, material);
    merged.castShadow = !material.transparent && !material.isMeshBasicMaterial;
    merged.receiveShadow = true; root.add(merged);
  }
  staticObjects.length = 0;
  batches.clear();
  const prizeCoins = Array.from({ length: 10 }, (_, i) => {
    const coin = mesh(new THREE.CylinderGeometry(.055, .055, .018, 16), m.gold, 0, 1.3, 0, true);
    coin.visible = false; return { coin, delay: i * .06 };
  });
  let reaction = 0, winner = 0, rewardCount = 0;
  return {
    react(player, points) {
      winner = player; reaction = 1.8; rewardCount = Math.min(10, Math.max(1, points));
      people.forEach((person, i) => person.setExpression(i + 1 === player ? 'grin' : 'focus', .7));
    },
    update(dt, t) {
      reaction = Math.max(0, reaction - dt);
      flames.forEach((flame, i) => { flame.scale.y = reducedMotion ? 1.9 : 1.9 + Math.sin(t * 6.1 + i * 3) * .15; });
      people.forEach((person, i) => {
        person.setPose(!reducedMotion && reaction > .8 && i + 1 === winner ? POSES.sitClap(t) : POSES.sit(t), .16); person.update(dt, t);
      });
      const destinations = [[0, 1.25], [-1.7, 0], [0, -1.2], [1.7, 0]];
      prizeCoins.forEach(({ coin, delay }, i) => {
        const progress = Math.max(0, Math.min(1, (1.8 - reaction - delay) / .85));
        coin.visible = !reducedMotion && reaction > 0 && progress < 1 && i < rewardCount;
        const [x, z] = destinations[winner];
        coin.position.set(x * progress + Math.sin(i * 2.4) * .12, 1.3 + Math.sin(progress * Math.PI) * .55, z * progress); coin.rotation.z = progress * Math.PI * 2;
      });
    },
    dispose() { people.forEach((person) => person.dispose()); }
  };
}
