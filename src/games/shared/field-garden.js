/** Architectural and hand-made garden details for the two field tournaments.
 * Static parts are authored separately, then merged by field-events at build time.
 */
export function buildFieldGarden({ THREE, world, mesh, box, pole, ball, mat, random, theme }) {
  const park = theme === 'park';
  const maps = [];
  function masonryTexture() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const c = canvas.getContext('2d'); c.fillStyle = '#a99f88'; c.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 16; row++) for (let col = -1; col < 9; col++) {
      const x = col * 64 + row % 2 * 32, y = row * 32;
      const v = 172 + Math.floor(random() * 54);
      c.fillStyle = `rgb(${v},${v - 6},${v - 17})`; c.fillRect(x + 1, y + 1, 62, 30);
      c.fillStyle = '#ffffff12'; c.fillRect(x + 3, y + 2, 58, 2);
      c.fillStyle = '#382e2618'; c.fillRect(x + 2, y + 28, 60, 2);
      for (let j = 0; j < 18; j++) { c.fillStyle = j % 2 ? '#ffffff15' : '#332e2419'; c.fillRect(x + random() * 62, y + random() * 30, 1 + random() * 3, 1); }
    }
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(3, 2); maps.push(map); return map;
  }
  const stoneMap = masonryTexture();
  for (const color of ['#aa8274', '#a2786c', '#8a6d58', '#b5a48d', '#c5bca6', '#c0b69a']) {
    mat(color).map = stoneMap; mat(color).bumpMap = stoneMap; mat(color).bumpScale = 0.018;
  }
  function beam(a, b, radius, color, parent = world) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const m = pole(radius, delta.length(), color, ...start.add(end).multiplyScalar(0.5).toArray(), parent);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return m;
  }
  function arch(width, height, x, y, z, color, parent = world) {
    const shape = new THREE.Shape(); shape.moveTo(-width / 2, 0); shape.lineTo(width / 2, 0);
    shape.lineTo(width / 2, height - width / 2); shape.absarc(0, height - width / 2, width / 2, 0, Math.PI, false); shape.closePath();
    return mesh(new THREE.ShapeGeometry(shape, 16), color, x, y, z, parent);
  }
  function wallStone(x, y, z, w, h, d, n) {
    const m = mesh(new THREE.IcosahedronGeometry(1, 0), ['#a5a68d', '#8e967f', '#b5b09a', '#a49f89'][n % 4], x, y, z);
    m.scale.set(w, h, d); m.rotation.y = (n * 2.399) % Math.PI; return m;
  }
  // Individual weathered setts, a shadowed mortar bed and rounded coping give
  // the walking paths a readable edge even from the high tournament camera.
  for (const side of [-1, 1]) {
    box(0.32, 0.09, 35.2, '#777b62', side * 4.27, 0.035, -4);
    for (let i = 0; i < 74; i++) {
      const z = 13.3 - i * 0.47;
      const curb = box(0.25 + random() * 0.025, 0.13, 0.43, ['#b5a48d', '#c5bca6', '#c0b69a'][i % 3], side * 4.27, 0.08, z);
      curb.rotation.y = (random() - 0.5) * 0.055;
      if (i % 3 === 0) box(1.42, 0.026, 0.024, '#918e74', side * 5.2, 0.033, z);
    }
    for (const z of [6.5, -2.4, -11.4]) {
      // Low garden walls leave all throws, running lanes and targets unobstructed.
      box(1.65, 0.28, 4, park ? '#8a6d58' : '#777c67', side * 7.2, 0.14, z);
      box(1.42, 0.04, 3.74, '#534f39', side * 7.2, 0.3, z);
      for (let i = 0; i < 9; i++) for (const edge of [-1, 1]) {
        if (park) box(0.24, 0.11, 0.43, '#c5bca6', side * 7.2 + edge * 0.81, 0.33, z - 1.78 + i * 0.44);
        else wallStone(side * 7.2 + edge * 0.76, 0.24, z - 1.75 + i * 0.44, 0.26, 0.19, 0.24, i);
      }
    }
  }
  // A small, fully built greenhouse/orangery is visible beyond the Uppsala
  // beds: repeated mullions, pitched glazed bays and terracotta pots inside.
  if (park) {
    for (const color of ['#92b7a9', '#9ebaae', '#88ad9f']) {
      const glass = mat(color); glass.roughness = 0.22; glass.metalness = 0.12;
      glass.transparent = true; glass.opacity = 0.48; glass.depthWrite = false;
    }
    const house = new THREE.Group(); house.position.set(-11.6, 0, -15.2); house.rotation.y = 0.14; world.add(house);
    box(5.7, 0.48, 5.3, '#8a6d58', 0, 0.24, 0, house);
    box(5.9, 0.12, 5.5, '#c5bca6', 0, 0.52, 0, house);
    for (const side of [-1, 1]) {
      box(0.035, 2.6, 5.2, '#92b7a9', side * 2.8, 1.85, 0, house);
      for (let z = -2.6; z <= 2.7; z += 0.65) {
        box(0.075, 2.75, 0.075, '#e3dfbd', side * 2.82, 1.85, z, house);
        beam([side * 2.82, 3.23, z], [0, 4.4, z], 0.045, '#e3dfbd', house);
      }
      const roof = box(3.05, 0.035, 5.2, '#9ebaae', side * 1.41, 3.81, 0, house); roof.rotation.z = -side * 0.39;
      for (const y of [0.66, 1.75, 3.18]) box(0.085, 0.07, 5.4, '#d8d4b4', side * 2.82, y, 0, house);
      for (const z of [-2.62, 2.62]) {
        box(2.75, 2.52, 0.035, '#88ad9f', side * 1.4, 1.85, z, house);
        for (let x = 0.7; x < 2.9; x += 0.7) box(0.075, 2.7, 0.075, '#e3dfbd', side * x, 1.85, z + 0.03, house);
      }
    }
    box(5.7, 0.08, 0.08, '#e3dfbd', 0, 3.18, 2.69, house);
    box(0.13, 0.14, 5.7, '#e3dfbd', 0, 4.4, 0, house);
    for (let i = 0; i < 5; i++) {
      const pot = mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.48, 12), '#af765b', -1.7 + i * 0.85, 0.8, 2.9, house);
      pole(0.31, 0.06, '#bf8b66', 0, 0.22, 0, pot);
      pole(0.03, 0.65, '#657b49', 0, 0.5, 0, pot);
      for (let j = 0; j < 5; j++) {
        const leaf = ball(0.12, '#77995a', Math.sin(j * 2.4) * 0.13, 0.45 + j * 0.07, Math.cos(j * 2.4) * 0.13, pot);
        leaf.scale.set(0.65, 0.55, 1.3); leaf.rotation.y = j * 2.4;
      }
    }
    for (const x of [-1.8, 1.8]) {
      box(0.8, 0.08, 4.3, '#b49b73', x, 0.9, 0, house);
      for (let i = 0; i < 6; i++) {
        mesh(new THREE.CylinderGeometry(0.21, 0.16, 0.32, 10), '#af765b', x, 1.1, -1.8 + i * 0.65, house);
        pole(0.022, 1, '#657b49', x, 1.6, -1.8 + i * 0.65, house);
        for (let j = 0; j < 4; j++) { const leaf = ball(0.18, '#77995a', x + Math.sin(j * 2.4) * 0.14, 1.4 + j * 0.16, -1.8 + i * 0.65 + Math.cos(j * 2.4) * 0.12, house); leaf.scale.set(1.4, 0.45, 0.8); }
      }
    }
    // Historic-city silhouette: buttresses, a rose window and warm brick
    // relief distinguish this invented park from the rural 2013 setting.
    for (const x of [-3.8, -1.5, 1.5, 3.8]) {
      box(0.38, 3.8, 0.65, '#8a6d58', x, 1.9, -29.35);
      box(0.56, 0.18, 0.85, '#c0b69a', x, 3.65, -29.3);
    }
    arch(1.8, 2.6, 0, 0.1, -29.44, '#d2b494'); arch(1.4, 2.3, 0, 0.1, -29.4, '#4c564e');
    for (const x of [-2.8, 2.8]) {
      for (const y of [2.4, 3.8, 5.2]) {
        arch(0.64, 1.05, x, y - 0.45, -29.64, '#cbb79a'); arch(0.42, 0.87, x, y - 0.41, -29.61, '#4d6361');
        box(0.035, 0.8, 0.035, '#b7ab91', x, y, -29.58);
      }
      for (const y of [0.35, 1.4, 6.6, 7]) box(1.75, 0.13, 1.75, '#b9a28b', x, y, -30.5);
      for (const sx of [-0.9, 0.9]) box(0.18, 6.8, 0.22, '#8b675b', x + sx, 3.4, -29.65);
      const finial = pole(0.035, 1.1, '#bca579', x, 12.5, -30.5); finial.castShadow = false;
    }
    const rose = mesh(new THREE.CircleGeometry(0.7, 32), '#788f85', 0, 3.65, -29.44);
    const frame = mesh(new THREE.TorusGeometry(0.72, 0.09, 6, 32), '#cbb79a', 0, 3.65, -29.4);
    for (let i = 0; i < 8; i++) { const bar = box(0.035, 1.3, 0.035, '#ccbca0', 0, 3.65, -29.34); bar.rotation.z = i * Math.PI / 8; }
    rose.castShadow = frame.castShadow = false;
    for (const side of [-1, 1]) { const roof = box(4.1, 0.18, 3.8, '#4b6862', side * 1.7, 5.35, -31); roof.rotation.z = -side * 0.37; }
  } else {
    // The old cottage gets a welcoming porch, shutters and its own garden.
    box(3.2, 0.17, 1.9, '#8b6a49', -10, 0.2, -21.45);
    for (let i = 0; i < 12; i++) box(0.24, 0.06, 1.9, '#ba9871', -11.43 + i * 0.26, 0.31, -21.45);
    for (const x of [-11.45, -8.55]) {
      pole(0.075, 2.7, '#f0dfb8', x, 1.5, -20.66);
      box(0.13, 0.13, 1.7, '#f0dfb8', x, 1.05, -21.38);
      for (let i = 0; i < 6; i++) pole(0.035, 0.7, '#dbccb0', x, 0.72, -20.76 - i * 0.25);
    }
    const roof = box(3.5, 0.12, 2.15, '#56665e', -10, 3, -21.35); roof.rotation.x = 0.12;
    box(1.15, 2.15, 0.12, '#d0b67d', -10, 1.35, -22.28);
    for (let y = 0.6; y < 2.4; y += 0.45) box(0.87, 0.28, 0.04, '#b69564', -10, y, -22.2);
    ball(0.045, '#d9b462', -9.6, 1.35, -22.12);
    for (const x of [-12, -8]) {
      box(1.4, 0.13, 0.36, '#f1dfb4', x, 1.13, -22.2);
      for (const side of [-1, 1]) {
        box(0.42, 1.48, 0.08, '#75836a', x + side * 0.9, 1.8, -22.32);
        for (let i = 0; i < 6; i++) box(0.39, 0.06, 0.05, '#a6ad87', x + side * 0.9, 1.25 + i * 0.22, -22.26);
      }
      box(1.35, 0.3, 0.38, '#805c41', x, 1, -22.03);
    }
    for (let i = 0; i < 4; i++) box(2.3 + i * 0.2, 0.13, 0.38, '#969a83', -10, 0.08 + i * 0.055, -19.8 - i * 0.34);
    // Orchard tool stand: handles, rake tines, a steel watering can and barrel.
    const tool = new THREE.Group(); tool.position.set(7.7, 0, -15); tool.rotation.y = -0.35; world.add(tool);
    for (const x of [-0.6, 0.6]) pole(0.07, 1.7, '#8b6a49', x, 0.85, 0, tool);
    box(1.4, 0.16, 0.14, '#a38050', 0, 1.5, 0, tool);
    for (let i = 0; i < 3; i++) {
      const x = -0.45 + i * 0.45; pole(0.028, 1.7, '#c1a47a', x, 0.95, 0.15, tool);
      if (i === 1) box(0.28, 0.35, 0.045, '#7b8c87', x, 0.15, 0.15, tool);
      else { box(0.4, 0.05, 0.07, '#6d7c76', x, 0.15, 0.15, tool); for (let j = 0; j < 5; j++) pole(0.014, 0.16, '#6d7c76', x - 0.16 + j * 0.08, 0.07, 0.15, tool); }
    }
    mesh(new THREE.CylinderGeometry(0.35, 0.34, 0.55, 14), '#88a0a0', 1.1, 0.3, 0.3, tool);
    const spout = pole(0.07, 0.65, '#88a0a0', 1.5, 0.47, 0.3, tool); spout.rotation.z = -0.8;
    const handle = mesh(new THREE.TorusGeometry(0.29, 0.035, 6, 24, Math.PI), '#688580', 1.1, 0.55, 0.3, tool);
    handle.castShadow = false;
  }
  // An open timber pergola frames the back garden without crossing the view
  // down the competition lawn. Trellis diamonds catch light between leaves.
  const pergola = new THREE.Group(); pergola.position.set(park ? 8.9 : -9.8, 0, park ? -16.6 : -13.8); world.add(pergola);
  for (const x of [-1.8, 1.8]) for (const z of [-1.3, 1.3]) {
    box(0.13, 2.8, 0.13, '#d5c39c', x, 1.4, z, pergola);
    box(0.3, 0.16, 0.3, '#b5a48d', x, 0.08, z, pergola);
    for (let i = 0; i < 4; i++) {
      const bar = box(0.045, 1.7, 0.045, '#aeb493', x, 0.9 + i * 0.18, -0.65 + i * 0.34, pergola); bar.rotation.x = 0.65;
      const cross = box(0.045, 1.7, 0.045, '#aeb493', x, 0.9 + i * 0.18, 0.65 - i * 0.34, pergola); cross.rotation.x = -0.65;
    }
  }
  for (const z of [-1.35, 1.35]) box(4.3, 0.18, 0.15, '#d5c39c', 0, 2.8, z, pergola);
  for (let i = 0; i < 10; i++) box(0.09, 0.12, 3.1, '#c1ad86', -2 + i * 0.445, 2.95, 0, pergola);
  // A low circular fountain is reserved for the formal park; a hand pump and
  // stone trough establish the rural garden's working character instead.
  if (park) {
    const basin = mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.35, 36), '#b5a48d', 9, 0.22, 3);
    pole(1.27, 0.02, '#84a6a0', 0, 0.19, 0, basin);
    const rim = mesh(new THREE.TorusGeometry(1.37, 0.11, 8, 48), '#c5bca6', 0, 0.2, 0, basin); rim.rotation.x = Math.PI / 2;
    pole(0.18, 1.1, '#b5a48d', 0, 0.75, 0, basin);
    const bowl = mesh(new THREE.CylinderGeometry(0.62, 0.15, 0.23, 24), '#c5bca6', 0, 1.35, 0, basin);
    pole(0.54, 0.015, '#91b3ac', 0, 0.13, 0, bowl);
    for (let i = 0; i < 8; i++) pole(0.014, 0.84, '#bbd7cf', Math.sin(i * Math.PI / 4) * 0.48, 0.78, Math.cos(i * Math.PI / 4) * 0.48, basin);
  } else {
    box(1.8, 0.55, 0.9, '#777d6c', 9, 0.3, 1.8); box(1.5, 0.03, 0.64, '#749b94', 9, 0.58, 1.8);
    pole(0.12, 1.25, '#496c62', 9.8, 0.9, 1.8);
    box(0.45, 0.13, 0.13, '#496c62', 9.56, 1.42, 1.8);
    const pump = box(0.06, 0.8, 0.07, '#394f46', 10.02, 1.5, 1.8); pump.rotation.z = -0.34;
  }
  return { dispose: () => maps.forEach((map) => map.dispose()) };
}

/** Dense perennial drifts, built from leaves and petal whorls rather than dots. */
export function buildFlowerBorders(THREE, { seed = 2013, park = false } = {}) {
  let value = seed;
  const random = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
  const group = new THREE.Group(), transform = new THREE.Object3D();
  const wind = { value: 0 };
  function batch(geometry, color, count) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.93 });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.gardenWind = wind;
      shader.vertexShader = `uniform float gardenWind;\n${shader.vertexShader}`.replace('#include <project_vertex>', `
        #ifdef USE_INSTANCING
          vec4 plantPosition = instanceMatrix * vec4(transformed, 1.);
          float sway = sin(gardenWind + plantPosition.x * .7 + plantPosition.z * .35);
          plantPosition.x += sway * max(0., plantPosition.y - .3) * .035;
          mvPosition = modelViewMatrix * plantPosition;
          gl_Position = projectionMatrix * mvPosition;
        #else
          #include <project_vertex>
        #endif`);
      // project_vertex normally declares this variable itself.
      shader.vertexShader = shader.vertexShader.replace('vec4 plantPosition =', 'vec4 mvPosition; vec4 plantPosition =');
    };
    material.customProgramCacheKey = () => 'field-perennials-v1';
    const instanced = new THREE.InstancedMesh(geometry, material, count);
    instanced.castShadow = false; instanced.receiveShadow = true; group.add(instanced); return instanced;
  }
  const plantCount = 384;
  const stems = batch(new THREE.CylinderGeometry(0.012, 0.018, 1, 5), '#567549', plantCount);
  const leaves = batch(new THREE.SphereGeometry(1, 6, 4), '#77995a', plantCount * 3);
  const petals = [batch(new THREE.SphereGeometry(1, 6, 4), '#eee6bb', 128 * 7), batch(new THREE.SphereGeometry(1, 6, 4), '#b7a0c9', 128 * 7), batch(new THREE.SphereGeometry(1, 6, 4), '#db9a9b', 128 * 7)];
  const centers = batch(new THREE.SphereGeometry(1, 6, 4), '#d9b45c', plantCount);
  const counts = [0, 0, 0];
  function place(mesh, index, x, y, z, sx, sy, sz, ry = 0, rz = 0) {
    transform.position.set(x, y, z); transform.scale.set(sx, sy, sz); transform.rotation.set(0, ry, rz); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
  }
  for (let i = 0; i < plantCount; i++) {
    const border = i >= 288, species = i % 3, bed = Math.floor(border ? (i - 288) / 16 : i / 48), side = bed % 2 ? -1 : 1, row = Math.floor(bed / 2);
    const x = side * (border ? 3.92 + random() * 0.14 : 6.6 + random() * 1.18), z = [6.5, -2.4, -11.4][row] - 1.7 + random() * 3.4;
    const base = border ? 0.04 : 0.32, height = (border ? 0.35 : 1) * (0.34 + random() * (species === 1 ? 0.65 : 0.42)), angle = random() * Math.PI * 2;
    place(stems, i, x, base + height / 2, z, 1, height, 1, 0, Math.sin(angle) * 0.07);
    for (let j = 0; j < 3; j++) {
      const a = angle + j * 2.399;
      place(leaves, i * 3 + j, x + Math.sin(a) * 0.07, base + height * (0.2 + j * 0.18), z + Math.cos(a) * 0.07, 0.045, 0.09, 0.15, a, 0.7);
    }
    for (let j = 0; j < 7; j++) {
      const a = j * Math.PI * 2 / 7 + angle, lavender = species === 1;
      const r = lavender ? 0.035 : 0.075;
      place(petals[species], counts[species]++, x + Math.sin(a) * r, base + height + (lavender ? j * 0.035 : Math.cos(j * 3) * 0.01), z + Math.cos(a) * r, lavender ? 0.04 : 0.048, lavender ? 0.06 : 0.025, lavender ? 0.04 : 0.09, a);
    }
    place(centers, i, x, base + height + 0.02, z, species === 1 ? 0.018 : 0.043, 0.027, species === 1 ? 0.018 : 0.043);
  }
  if (park) group.rotation.y = 0;
  return { group, update: (time) => { wind.value = time % (Math.PI * 2); } };
}
