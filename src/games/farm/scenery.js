import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Hand-built rural objects, baked together by world.js after construction. */
export function buildHomestead(ctx, lake = false) {
  const { world, mesh, box, cylinder, material } = ctx;
  const owned = [];
  const groupAt = (x, y, z, parent = world) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const rounded = (w, h, d, color, x, y, z, parent = world, radius = 0.07) => mesh(new RoundedBoxGeometry(w, h, d, 2, radius), color, x, y, z, parent);
  function beam(a, b, width, color, parent = world) {
    const direction = new THREE.Vector3().subVectors(b, a);
    const part = box(width, direction.length(), width, color, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, parent);
    part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); return part;
  }
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  function gable(w, h, color, y, z, parent) {
    const shape = new THREE.Shape(); shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, h); shape.closePath();
    return mesh(new THREE.ShapeGeometry(shape), color, 0, y, z, parent);
  }
  function windowFrame(x, y, z, parent, scale = 1) {
    const pane = groupAt(x, y, z, parent); pane.scale.setScalar(scale);
    box(1.22, 1.42, 0.13, 0xe7ddbc, 0, 0, 0, pane);
    box(1.04, 1.23, 0.15, 0x4e6b70, 0, 0, 0.03, pane);
    for (const xx of [-0.52, 0, 0.52]) box(0.065, 1.27, 0.09, 0xe7ddbc, xx, 0, 0.13, pane);
    for (const yy of [-0.61, 0, 0.61]) box(1.08, 0.06, 0.09, 0xe7ddbc, 0, yy, 0.13, pane);
    box(1.36, 0.12, 0.3, 0xbfb695, 0, -0.74, 0.06, pane);
    const glint = box(0.035, 0.43, 0.008, 0x9cb8b5, -0.32, 0.19, 0.115, pane); glint.rotation.z = -0.35;
  }
  function roof(parent, halfWidth, depth, y, pitch = 0.45) {
    for (const side of [-1, 1]) {
      const slope = groupAt(side * halfWidth * 0.5, y, 0, parent); slope.rotation.z = -side * pitch;
      const w = halfWidth / Math.cos(pitch) + 0.45;
      box(w, 0.13, depth + 0.55, 0x424b49, 0, 0, 0, slope);
      // Raised standing seams catch the sun; this is profiled sheet metal, not a flat box.
      for (let z = -depth / 2; z <= depth / 2 + 0.01; z += 0.62) box(w, 0.045, 0.04, 0x68736c, 0, 0.09, z, slope);
      for (const z of [-depth / 2 - 0.26, depth / 2 + 0.26]) box(w + 0.05, 0.19, 0.13, 0xe0d6b4, 0, -0.035, z, slope);
      cylinder(0.08, depth + 0.8, 0x69736a, side * halfWidth * 1.04, y - Math.sin(pitch) * halfWidth * 0.5 - 0.15, 0, parent).rotation.x = Math.PI / 2;
    }
    cylinder(0.13, depth + 0.75, 0x606d65, 0, y + Math.sin(pitch) * halfWidth * 0.5 + 0.08, 0, parent).rotation.x = Math.PI / 2;
  }
  function sign(text, width, x, y, z, parent = world) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160;
    const c = canvas.getContext('2d'); c.fillStyle = '#b9a67c'; c.fillRect(0, 0, 512, 160);
    for (let i = 0; i < 18; i++) { c.strokeStyle = i % 2 ? '#74613d20' : '#fff1bf22'; c.beginPath(); c.moveTo(0, i * 9); c.bezierCurveTo(180, i * 9 + 8, 350, i * 9 - 6, 512, i * 9); c.stroke(); }
    c.strokeStyle = '#665237'; c.lineWidth = 3; c.strokeRect(9, 9, 494, 142); c.fillStyle = '#453a2a'; c.font = 'bold 52px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 256, 81, 470);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.85 }); owned.push(map, mat);
    const board = box(width, width * 160 / 512, 0.09, 0x8f7049, x, y, z, parent);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.97, width * 160 / 512 * 0.96), mat); face.position.z = 0.051; board.add(face);
    for (const sx of [-1, 1]) mesh(new THREE.SphereGeometry(0.025, 6, 4), 0x564f3e, sx * width * 0.43, 0, 0.065, board);
    return board;
  }
  function barrel(x, z, size = 1) {
    const g = groupAt(x, 0, z); g.scale.setScalar(size);
    const points = [new THREE.Vector2(0, 0), new THREE.Vector2(0.39, 0), new THREE.Vector2(0.44, 0.18), new THREE.Vector2(0.49, 0.55), new THREE.Vector2(0.44, 0.98), new THREE.Vector2(0.39, 1.11)];
    mesh(new THREE.LatheGeometry(points, 20), 0x97744a, 0, 0, 0, g);
    for (const y of [0.16, 0.54, 0.98]) { const band = mesh(new THREE.TorusGeometry(y === 0.54 ? 0.49 : 0.44, 0.028, 6, 24), 0x515b53, 0, y, 0, g); band.rotation.x = Math.PI / 2; }
    cylinder(0.38, 0.045, 0xb69a6a, 0, 1.1, 0, g);
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; beam(v(Math.cos(a) * 0.41, 0.03, Math.sin(a) * 0.41), v(Math.cos(a) * 0.43, 1.06, Math.sin(a) * 0.43), 0.018, 0x6e553a, g); }
    return g;
  }
  function churn(x, z) {
    const g = groupAt(x, 0, z);
    const profile = [[0, 0], [.27, 0], [.31, .08], [.31, .62], [.21, .82], [.21, .93]].map(([r, y]) => new THREE.Vector2(r, y));
    const body = mesh(new THREE.LatheGeometry(profile, 20), 0xa1afaa, 0, 0, 0, g); body.material = material(0xa1afaa, 0.65);
    cylinder(0.235, 0.055, 0xc0cac0, 0, .95, 0, g);
    for (const side of [-1, 1]) { const handle = mesh(new THREE.TorusGeometry(.12, .025, 6, 12, Math.PI), 0x798b83, side * .3, .74, 0, g); handle.rotation.z = side * -Math.PI / 2; }
    cylinder(.065, .035, 0x718078, 0, 1, 0, g);
  }
  function timberStack(x, z) {
    const g = groupAt(x, 0, z);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 5 - row; col++) {
      const xx = col * .43 + row * .21 - .85, yy = .24 + row * .38;
      cylinder(.22, 2.3, 0x705033, xx, yy, 0, g).rotation.x = Math.PI / 2;
      cylinder(.195, .025, 0xc9aa77, xx, yy, 1.16, g).rotation.x = Math.PI / 2;
      for (const r of [.07, .14]) mesh(new THREE.TorusGeometry(r, .009, 4, 12), 0x8e6c44, xx, yy, 1.18, g);
    }
    for (const x1 of [-1.2, 1.2]) box(.13, 1.7, .13, 0xa58a5e, x1, .85, 1, g);
  }
  function wheel(x, y, z, radius, parent) {
    const g = groupAt(x, y, z, parent); g.rotation.y = Math.PI / 2;
    mesh(new THREE.TorusGeometry(radius, .055, 6, 32), 0x3b453d, 0, 0, 0, g);
    mesh(new THREE.TorusGeometry(radius - .06, .055, 6, 32), 0xa18b5e, 0, 0, 0, g);
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; beam(v(0, 0, 0), v(Math.cos(a) * radius, Math.sin(a) * radius, 0), .045, 0x9e8051, g); }
    cylinder(.12, .25, 0x677260, 0, 0, 0, g).rotation.x = Math.PI / 2;
  }

  if (!lake) {
    const barn = groupAt(-12.4, 0, -8.4);
    box(7.8, 4.65, 9.2, 0x782e26, 0, 2.52, 0, barn);
    for (let i = 0; i < 18; i++) {
      const x = -3.69 + i * .435;
      box(.414, 4.6, .12, [0x993b2e, 0xa14030, 0x8e3329][i % 3], x, 2.53, 4.66, barn);
      for (const side of [-1, 1]) box(.12, 4.6, .49, [0x91362c, 0xa14030, 0x993b2e][i % 3], side * 3.94, 2.53, -4.4 + i * .52, barn);
      if (Math.abs(x) > 1.7) for (const y of [.45, 3.1]) mesh(new THREE.SphereGeometry(.02, 4, 3), 0x554c3c, x, y, 4.73, barn);
    }
    gable(7.8, 1.9, 0x993b2e, 4.85, 4.65, barn);
    const rearGable = gable(7.8, 1.9, 0x91362c, 4.85, -4.65, barn); rearGable.rotation.y = Math.PI;
    for (let i = -7; i <= 7; i++) box(.035, 1.8 - Math.abs(i) * .21, .05, 0xb34c35, i * .48, 5.7 - Math.abs(i) * .105, 4.69, barn);
    for (const side of [-1, 1]) {
      box(.19, 4.8, .22, 0xe2d7b8, side * 3.87, 2.6, 4.72, barn);
      box(.2, 4.8, .22, 0xe2d7b8, side * 3.87, 2.6, -4.6, barn);
      const door = groupAt(side * .82, 1.83, 4.82, barn);
      box(1.6, 3.25, .13, 0x624a32, 0, 0, 0, door);
      for (let i = 0; i < 6; i++) box(.24, 3.2, .06, i % 2 ? 0x8b623e : 0x785235, -.64 + i * .257, 0, .1, door);
      for (const y of [-1.3, 1.3]) box(1.5, .13, .13, 0xc7ac76, 0, y, .16, door);
      beam(v(-.7, -1.3, .16), v(.7, 1.3, .16), .13, 0xc7ac76, door);
      for (const y of [-1, 1]) box(.38, .07, .18, 0x454e43, side * .59, y, .15, door);
      mesh(new THREE.TorusGeometry(.065, .018, 5, 10), 0x777c68, -side * .59, .1, .22, door);
    }
    box(3.54, .2, .3, 0xe6dbb7, 0, 3.55, 4.84, barn);
    windowFrame(0, 5.48, 4.75, barn, .68);
    const sideWindow = groupAt(4.04, 2.75, -.9, barn); sideWindow.rotation.y = Math.PI / 2; windowFrame(0, 0, 0, sideWindow, 1.25);
    roof(barn, 4.1, 9.6, 5.77);
    for (let i = 0; i < 11; i++) rounded(.72, .31, .55, i % 2 ? 0x878c77 : 0xa0a48a, -3.8 + i * .76, .15, 4.63, barn, .11);
    for (const side of [-1, 1]) cylinder(.07, 4.55, 0x737c6c, side * 4.16, 2.3, 4.45, barn);
    sign('BILLSTA · 2015', 2.6, 0, 4.15, 4.83, barn);
    timberStack(-7.3, -10.7); barrel(-8.1, -2.6); barrel(-7.1, -3.5, .8);
    for (let i = 0; i < 3; i++) churn(-8.5 + i * .62, -.9 + i % 2 * .3);

    // A battered hay cart gives the bale pile a human scale and an uneven silhouette.
    const cart = groupAt(9, 0, -5.2); cart.rotation.y = -.22;
    for (const x of [-1.18, 1.18]) for (const z of [-1, 1]) wheel(x, .66, z, .64, cart);
    for (let i = 0; i < 7; i++) box(.32, .14, 3.3, i % 2 ? 0xa98b5a : 0x8d7047, -.99 + i * .33, 1.03, 0, cart);
    for (const x of [-1.14, 1.14]) { box(.1, .65, 3.2, 0xb69a64, x, 1.4, 0, cart); box(.12, .12, 3.25, 0xd2b57b, x, 1.77, 0, cart); }
    for (const x of [-.65, .65]) beam(v(x, .9, 1.5), v(x, .44, 3.8), .1, 0x9f8051, cart);
    for (let i = 0; i < 7; i++) {
      const bale = rounded(1.12, .69, .87, [0xc9a654, 0xd7b663, 0xd1ae58][i % 3], (i % 2) * 1.12 - .56, 1.44 + Math.floor(i / 4) * .69, -.83 + Math.floor(i % 4 / 2) * .9, cart, .09); bale.rotation.y = (i % 3 - 1) * .07;
      for (const x of [-.32, .32]) box(.035, .71, .89, 0x756342, x, 0, 0, bale);
    }
    // Close details at the verges remain visible around the phone's central play area.
    const trough = groupAt(-5.85, 0, -2.4); rounded(1.2, .55, 2.2, 0x747b69, 0, .45, 0, trough);
    box(1.03, .025, 2.02, 0x465d58, 0, .74, 0, trough);
    for (const z of [-.78, .78]) box(.95, .25, .25, 0x57583f, 0, .12, z, trough);
    const fork = groupAt(-5.55, .2, -1.8); fork.rotation.z = -.24; cylinder(.035, 1.8, 0xa58250, 0, 1, 0, fork);
    box(.5, .045, .07, 0x637062, 0, .25, 0, fork); for (const x of [-.22, -.07, .07, .22]) cylinder(.018, .42, 0x637062, x, .05, 0, fork);
  } else {
    const cottage = groupAt(-10.9, 0, -12);
    box(6, 3.4, 6, 0x914634, 0, 1.9, 0, cottage);
    for (let i = 0; i < 18; i++) {
      box(.31, 3.37, .09, [0xab5440, 0xb35c45, 0x9e4938][i % 3], -2.83 + i * .333, 1.9, 3.05, cottage);
      for (const side of [-1, 1]) box(.09, 3.37, .31, i % 2 ? 0xa34b39 : 0xb35c45, side * 3.05, 1.9, -2.83 + i * .333, cottage);
    }
    gable(6, 1.45, 0xa34b39, 3.6, 3.07, cottage); roof(cottage, 3.2, 6.2, 4.24, .44);
    for (const x of [-2.95, 2.95]) box(.18, 3.5, .2, 0xeadfbd, x, 1.93, 3.1, cottage);
    for (const x of [-1.9, 1.9]) windowFrame(x, 2.2, 3.14, cottage, .9);
    for (let i = 0; i < 5; i++) box(.19, 2.2, .12, i % 2 ? 0x4e6357 : 0x617562, -.39 + i * .195, 1.45, 3.13, cottage);
    box(1.17, .14, .22, 0xe7dbbb, 0, 2.61, 3.18, cottage);
    for (const x of [-.56, .56]) box(.12, 2.4, .22, 0xe7dbbb, x, 1.38, 3.18, cottage);
    rounded(1.8, .22, .65, 0x9c9f86, 0, .16, 3.47, cottage); rounded(1.35, .17, .38, 0xb3b39a, 0, .35, 3.3, cottage);
    const chimney = groupAt(1.6, 4.6, -1.2, cottage); box(.62, 1.65, .65, 0x9c735a, 0, 0, 0, chimney);
    for (let i = 0; i < 6; i++) box(.66, .035, .69, 0xc0a58a, 0, -.74 + i * .27, 0, chimney);
    box(.8, .15, .82, 0x626e62, 0, .84, 0, chimney);
    sign('IDBY', 1.2, 0, 3.05, 3.22, cottage);
    for (const x of [-1.9, 1.9]) { box(1.3, .25, .37, 0x6d5d3f, x, 1.27, 3.39, cottage); for (let i = 0; i < 7; i++) mesh(new THREE.SphereGeometry(.065, 6, 4), i % 2 ? 0xe4b5a6 : 0xe2d5a6, x - .48 + i * .16, 1.45 + (i % 3) * .04, 3.43, cottage); }
    for (let i = 0; i < 18; i++) box(2.65, .11, .42, i % 2 ? 0xa98b60 : 0xbda276, 13.1 + i * .41, .3, 2.4);
    for (const x of [12.7, 15.5, 18.5, 20.4]) for (const z of [1.28, 3.52]) cylinder(.12, 1, 0x6e634a, x, .08, z);
    const ladder = groupAt(20.15, 0, 3.72); for (const x of [-.32, .32]) cylinder(.035, 1.45, 0xa8b1a0, x, .25, 0, ladder);
    for (let i = 0; i < 4; i++) box(.65, .055, .08, 0xa8b1a0, 0, -.32 + i * .3, 0, ladder);
    cylinder(.06, 7.6, 0xe9e1c7, -6.8, 3.8, -9.8);
    box(1.5, .9, .025, 0x4986a3, -6.05, 6.9, -9.8);
    box(.15, .9, .03, 0xeecb67, -6.37, 6.9, -9.78); box(1.5, .15, .03, 0xeecb67, -6.05, 6.9, -9.78);
    barrel(-6.7, -7.8, .8); timberStack(-14.6, -9.2);
  }
  return { dispose: () => owned.forEach((resource) => resource.dispose()) };
}
