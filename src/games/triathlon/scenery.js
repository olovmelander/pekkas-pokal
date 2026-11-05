import * as THREE from 'three';

/** The course is a little moving diorama: warm forest, turquoise water, red cottages. */
export function buildCourse(scene) {
  const world = new THREE.Group();
  scene.add(world);
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(245, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { zenith: { value: new THREE.Color(0x8ab4bf) }, horizon: { value: new THREE.Color(0xe7d9b9) } },
    vertexShader: 'varying vec3 direction; void main() { direction = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 zenith; uniform vec3 horizon; varying vec3 direction; void main() { float h = pow(max(0.0, direction.y), .55); gl_FragColor = vec4(mix(horizon, zenith, h), 1.0); #include <tonemapping_fragment>\n#include <colorspace_fragment> }'
  }));
  skyDome.material.fragmentShader = skyDome.material.fragmentShader.replace(' #include', '\n#include');
  scene.add(skyDome);
  const mat = (color, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
  const pine = mat(0x315f50), pineLight = mat(0x427c5d), trunk = mat(0x70533c);
  const grass = mat(0x789969), sand = mat(0xb6aa83), asphalt = mat(0x3b4b4e), trail = mat(0xb08d66);
  const cream = mat(0xf0e6ce), red = mat(0x973d38), roof = mat(0x36454b), gold = mat(0xf5c96b, 0.35);
  for (const [material, rgb] of [[asphalt, [64, 74, 73]], [trail, [170, 135, 91]]]) {
    const tile = document.createElement('canvas'); tile.width = tile.height = 128;
    const context = tile.getContext('2d'), pixels = context.createImageData(128, 128);
    for (let i = 0; i < 128 * 128; i++) {
      const grain = (Math.sin(i * 75.31) * 27837.73) % 1 * 13;
      pixels.data.set([rgb[0] + grain, rgb[1] + grain, rgb[2] + grain, 255], i * 4);
    }
    context.putImageData(pixels, 0, 0);
    const texture = new THREE.CanvasTexture(tile); texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 70); texture.colorSpace = THREE.SRGBColorSpace;
    material.map = texture; material.color.set(0xffffff);
  }
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1), sphere: new THREE.SphereGeometry(1, 14, 10),
    cone: new THREE.ConeGeometry(1, 1, 7), cylinder: new THREE.CylinderGeometry(1, 1, 1, 8)
  };
  function mesh(geometry, material, x, y, z, sx, sy, sz, parent = world) {
    const item = new THREE.Mesh(geometry, material);
    item.position.set(x, y, z); item.scale.set(sx, sy, sz);
    item.castShadow = sy > 0.2; item.receiveShadow = true; parent.add(item);
    return item;
  }
  const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x398e96, metalness: 0.22, roughness: 0.31 });
  waterMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.triTime = { value: 0 };
    waterMaterial.userData.shader = shader;
    shader.vertexShader = `uniform float triTime; varying vec2 triWater;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\ntriWater = position.xy; transformed.z += sin(position.x * 1.3 + triTime * 1.3) * .025 + sin(position.y * 1.8 + triTime) * .018;'
    ).replace(
      '#include <beginnormal_vertex>',
      '#include <beginnormal_vertex>\nobjectNormal = normalize(vec3(-cos(position.x * 1.3 + triTime * 1.3) * .085, -cos(position.y * 1.8 + triTime) * .08, 1.0));'
    );
    shader.fragmentShader = `uniform float triTime; varying vec2 triWater;\n${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\nfloat ripple = sin(triWater.x * 3.5 + triWater.y * 5.0 + triTime * 1.2) * sin(triWater.y * 4.0 - triTime * .8); diffuseColor.rgb *= .97 + .1 * ripple; float glint = pow(max(0., ripple), 18.) * exp(-pow((triWater.x + 10.) * .08, 2.)); diffuseColor.rgb += vec3(.8, .7, .45) * glint * .45;'
    );
  };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(200, 260, 40, 80), waterMaterial);
  water.rotation.x = -Math.PI / 2; water.position.set(0, -0.15, -80); water.receiveShadow = true;
  world.add(water);
  const banks = new THREE.Group(); world.add(banks);
  const grassCanvas = document.createElement('canvas'); grassCanvas.width = grassCanvas.height = 128;
  const grassContext = grassCanvas.getContext('2d'), grassPixels = grassContext.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) {
    const noise = (Math.sin(i * 127.1) * 43758.5453) % 1;
    grassPixels.data.set([116 + noise * 12, 145 + noise * 13, 91 + noise * 8, 255], i * 4);
  }
  grassContext.putImageData(grassPixels, 0, 0);
  const grassTexture = new THREE.CanvasTexture(grassCanvas); grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
  grassTexture.colorSpace = THREE.SRGBColorSpace; grass.map = grassTexture; grass.color.set(0xffffff);
  function bankStrip(side, innerOffset, width, material) {
    const vertices = [], indices = [], uv = [];
    for (let i = 0; i <= 65; i++) {
      const z = 40 - i * 4;
      const coast = 7.5 + Math.sin(z * 0.022 + side) * 1.7 + Math.sin(z * 0.075) * 0.55;
      vertices.push(side * (coast + innerOffset), -0.08, z, side * (coast + innerOffset + width), -0.04, z);
      uv.push((coast + innerOffset) / 6, z / 6, (coast + innerOffset + width) / 6, z / 6);
      if (i < 65) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(indices); geo.computeVertexNormals();
    const materialSide = material.clone(); materialSide.side = THREE.DoubleSide;
    const bank = new THREE.Mesh(geo, materialSide); bank.receiveShadow = true; banks.add(bank);
  }
  for (const side of [-1, 1]) { bankStrip(side, 0, 0.55, sand); bankStrip(side, 0.55, 80, grass); }
  const road = mesh(geometries.box, asphalt, 0, -0.23, -80, 9.5, 0.3, 230);
  const roadEdge = mesh(geometries.box, sand, 0, -0.3, -80, 12.5, 0.3, 230);
  road.visible = roadEdge.visible = false;
  const stripes = new THREE.Group(); world.add(stripes);
  for (let i = 0; i < 30; i++) {
    mesh(geometries.box, cream, -4.2, -0.065, -i * 7, 0.11, 0.02, 3, stripes);
    mesh(geometries.box, cream, 4.2, -0.065, -i * 7, 0.11, 0.02, 3, stripes);
  }
  stripes.visible = false;

  // Instanced forest: hundreds of trees, only five draw calls.
  const treeCount = 160;
  const trunks = new THREE.InstancedMesh(geometries.cylinder, trunk, treeCount);
  const tiers = [pine, pineLight, pine].map(material => new THREE.InstancedMesh(geometries.cone, material, treeCount));
  [trunks, ...tiers].forEach(item => { item.castShadow = true; world.add(item); });
  const dummy = new THREE.Object3D();
  let seed = 2017;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < treeCount; i++) {
    const side = i % 2 ? -1 : 1;
    const x = side * (11 + random() * 26), z = 30 - random() * 220, h = 2.4 + random() * 3.4;
    dummy.position.set(x, h * 0.25, z); dummy.scale.set(0.13, h * 0.55, 0.13); dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    tiers.forEach((item, n) => {
      dummy.position.set(x, h * (0.48 + n * 0.2), z);
      dummy.scale.set(h * (0.3 - n * 0.065), h * 0.55, h * (0.3 - n * 0.065));
      dummy.rotation.y = random() * Math.PI; dummy.updateMatrix(); item.setMatrixAt(i, dummy.matrix);
    });
  }
  const rockCount = 70;
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat(0x87928a), rockCount);
  rocks.receiveShadow = true; rocks.castShadow = true; world.add(rocks);
  for (let i = 0; i < rockCount; i++) {
    const side = i % 2 ? -1 : 1;
    const z = 15 - random() * 190;
    const coast = 7.5 + Math.sin(z * 0.022 + side) * 1.7 + Math.sin(z * 0.075) * 0.55;
    dummy.position.set(side * (coast + random() * 0.65), -0.02, z);
    const size = 0.12 + random() * 0.3;
    dummy.scale.set(size * 1.4, size * 0.7, size); dummy.rotation.set(random(), random(), random());
    dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  }
  const reeds = new THREE.InstancedMesh(new THREE.ConeGeometry(0.08, 0.8, 4), mat(0x6d8e5c), 150);
  world.add(reeds);
  for (let i = 0; i < 150; i++) {
    const side = i % 2 ? -1 : 1, z = 15 - random() * 190;
    const coast = 7.5 + Math.sin(z * 0.022 + side) * 1.7 + Math.sin(z * 0.075) * 0.55;
    dummy.position.set(side * (coast + random() * 0.4), 0.18, z);
    dummy.scale.setScalar(0.7 + random() * 0.8); dummy.rotation.set(0, random(), random() * 0.14);
    dummy.updateMatrix(); reeds.setMatrixAt(i, dummy.matrix);
  }
  // Layered distant hills make the horizon complete in wide screens too.
  for (let i = 0; i < 14; i++) {
    const mountain = mesh(geometries.sphere, mat(i % 2 ? 0x779b8e : 0x89a89a), -130 + i * 20, 1, -190 - i % 3 * 13, 30, 6 + i % 4 * 3.4, 27);
    mountain.castShadow = false;
  }
  const sun = mesh(geometries.sphere, new THREE.MeshBasicMaterial({ color: 0xffedc8, fog: false }), -45, 36, -160, 6, 6, 6);
  sun.castShadow = false;

  // A pair of red cottages with real window recesses, roof boards and a jetty.
  function cottage(x, z) {
    const house = new THREE.Group(); house.position.set(x, 0, z); world.add(house);
    mesh(geometries.box, red, 0, 1.3, 0, 4.4, 2.6, 3.5, house);
    for (const side of [-1, 1]) {
      const part = mesh(geometries.box, roof, side * 1.2, 3, 0, 2.8, 0.15, 4.2, house);
      part.rotation.z = side * -0.48;
      mesh(geometries.box, cream, side * 2.2, 1.3, 1.78, 0.16, 2.7, 0.12, house);
      mesh(geometries.box, cream, side * 1.2, 1.6, 1.78, 0.95, 1.05, 0.14, house);
      mesh(geometries.box, mat(0x688e9c), side * 1.2, 1.6, 1.88, 0.73, 0.83, 0.03, house);
    }
    mesh(geometries.box, cream, 0, 0.9, 1.8, 0.9, 1.8, 0.13, house);
    mesh(geometries.box, trunk, 0, 0.08, 4, 3.8, 0.2, 3, house);
    return house;
  }
  cottage(12, -33); cottage(-16, -105);
  for (let i = 0; i < 14; i++) mesh(geometries.box, trunk, 8.4, 0.04, -20 + i * 0.46, 4, 0.1, 0.4);

  const decorations = new THREE.Group(); world.add(decorations);
  for (let i = 0; i < 24; i++) {
    for (const side of [-1, 1]) {
      mesh(geometries.cylinder, cream, side * 5.8, 0.8, -i * 8, 0.045, 1.6, 0.045, decorations);
      mesh(geometries.box, i % 2 ? red : gold, side * 5.8 + 0.3, 1.4, -i * 8, 0.6, 0.38, 0.035, decorations);
    }
  }
  // The finish structure appears only near the end of each leg.
  const finish = new THREE.Group(); world.add(finish);
  mesh(geometries.box, gold, -4.8, 2.5, 0, 0.3, 5, 0.3, finish);
  mesh(geometries.box, gold, 4.8, 2.5, 0, 0.3, 5, 0.3, finish);
  mesh(geometries.box, red, 0, 4.85, 0, 10, 0.7, 0.2, finish);
  const bannerCanvas = document.createElement('canvas'); bannerCanvas.width = 768; bannerCanvas.height = 96;
  const ctx = bannerCanvas.getContext('2d');
  ctx.fillStyle = '#f8e8b7'; ctx.font = 'bold 45px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('LOMSJÖN  •  PEKKAS POKAL', 384, 65);
  const texture = new THREE.CanvasTexture(bannerCanvas); texture.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 1.15), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
  banner.position.set(0, 4.85, 0.13); finish.add(banner);
  let currentDiscipline = null;
  return {
    world,
    update(discipline, distance, remaining, time) {
      if (currentDiscipline !== discipline) {
        currentDiscipline = discipline;
        road.visible = roadEdge.visible = discipline !== 'swim'; stripes.visible = discipline === 'bike';
        road.material = discipline === 'run' ? trail : asphalt;
        water.position.x = discipline !== 'swim' ? -45 : 0;
        banks.position.x = discipline !== 'swim' ? 1 : 0;
      }
      if (waterMaterial.userData.shader) waterMaterial.userData.shader.uniforms.triTime.value = time;
      stripes.position.z = distance % 7;
      decorations.position.z = distance % 8;
      // Trees and roadside flags slide by, while distant hills remain stable.
      [trunks, ...tiers].forEach(item => { item.position.z = distance % 32; });
      finish.position.z = -remaining + 2;
      finish.visible = remaining < 120;
    }
  };
}

export function makeCourseItem(kind) {
  const group = new THREE.Group();
  const make = (geo, color, x, y, z) => {
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 }));
    mesh.position.set(x, y, z); mesh.castShadow = true; group.add(mesh); return mesh;
  };
  if (kind === 'gate') {
    const buoy = new THREE.ConeGeometry(0.3, 0.65, 16);
    make(buoy, 0xf0b85b, -0.85, 0.23, 0); make(buoy, 0xf0b85b, 0.85, 0.23, 0);
    const hoop = make(new THREE.TorusGeometry(0.7, 0.045, 7, 32), 0xffdb75, 0, 0.65, 0);
    hoop.material.emissive.set(0xb76521); hoop.material.emissiveIntensity = 0.3;
  } else if (kind === 'drink') {
    make(new THREE.CylinderGeometry(0.15, 0.14, 0.45, 14), 0x7cd6c6, 0, 0.9, 0);
    make(new THREE.CylinderGeometry(0.08, 0.09, 0.08, 10), 0xf8efd5, 0, 1.16, 0);
    const ring = make(new THREE.TorusGeometry(0.43, 0.025, 6, 22), 0xd9f6c0, 0, 0.9, 0);
    ring.material.emissive.set(0x92ba62);
  } else {
    make(new THREE.ConeGeometry(0.35, 0.85, 10), 0xdf7850, -0.4, 0.38, 0);
    make(new THREE.ConeGeometry(0.35, 0.85, 10), 0xdf7850, 0.4, 0.38, 0);
    make(new THREE.BoxGeometry(1.25, 0.2, 0.15), 0xf0e4bd, 0, 0.64, 0);
  }
  return group;
}
