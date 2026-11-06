import * as THREE from 'three';

/** Digitised centreline of VKRC's official aerial photograph (960 × 720).
 * Source and the limits of the 2012 reconstruction are in research.md.
 * No source photograph is bundled or used as a game texture.
 */
export const TRACK_SOURCE = 'https://vkrc.se/klubben/banan/';
export const TRACK_LENGTH = 665;
export const ROAD_HALF_WIDTH = 3.5;
export const TRACK_PLAN = [
  [440, 294], [500, 287], [555, 268], [609, 230], [660, 182],
  [715, 142], [758, 122], [787, 129], [809, 151], [818, 182],
  [814, 216], [808, 260], [810, 310], [813, 363], [817, 418],
  [822, 477], [825, 538], [825, 563], [825, 576], [822.87, 586.72],
  [816.8, 595.8], [807.72, 601.87], [797, 604], [786.28, 601.87],
  [777.2, 595.8], [771.13, 586.72], [769, 576], [769, 546], [775, 513], [774, 475],
  [762, 434], [738, 401], [713, 378], [686, 370], [650, 375],
  [600, 376], [550, 374], [500, 373], [467, 377], [445, 395],
  [429, 421], [427, 443], [438, 463], [460, 474], [490, 474],
  [530, 465], [577, 452], [619, 442], [648, 441], [671, 454],
  [687, 476], [689, 496], [678, 518], [654, 532], [615, 542],
  [575, 553], [532, 561], [489, 565], [446, 558], [403, 542],
  [358, 520], [309, 504], [257, 493], [211, 481], [167, 462],
  [136, 440], [119, 414], [112, 390], [115, 367], [127, 343],
  [146, 325], [172, 315], [204, 310], [250, 309], [300, 307],
  [350, 304], [400, 299]
];

// The club documents undulating terrain, but no surveyed elevation profile was
// found. These gentle grades are a visual interpretation, not measured heights.
export function terrainHeight(x, z) {
  return 1.25 * Math.sin(x * 0.017) + 1.1 * Math.cos(z * 0.022) + 0.45 * Math.sin((x + z) * 0.024);
}

export function createRoute() {
  const source = new THREE.CatmullRomCurve3(TRACK_PLAN.map(([x, y]) => new THREE.Vector3(x - 470, 0, y - 364)), true, 'centripetal');
  source.arcLengthDivisions = 4096;
  const scale = TRACK_LENGTH / source.getLength();
  const planToWorld = (x, y) => {
    const point = new THREE.Vector3((x - 470) * scale, 0, (y - 364) * scale);
    point.y = terrainHeight(point.x, point.z);
    return point;
  };
  const curve = new THREE.CatmullRomCurve3(TRACK_PLAN.map(([x, y]) => new THREE.Vector3((x - 470) * scale, 0, (y - 364) * scale)), true, 'centripetal');
  curve.arcLengthDivisions = 4096;
  const length = curve.getLength();
  const wrap = distance => ((distance / length) % 1 + 1) % 1;
  function sample(distance, lane = 0) {
    const u = wrap(distance), position = curve.getPointAt(u), tangent = curve.getTangentAt(u).normalize();
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x);
    position.addScaledVector(right, lane);
    position.y = terrainHeight(position.x, position.z);
    const gradient = (terrainHeight(position.x + tangent.x, position.z + tangent.z) - terrainHeight(position.x - tangent.x, position.z - tangent.z)) / 2;
    const crossSlope = (terrainHeight(position.x + right.x, position.z + right.z) - terrainHeight(position.x - right.x, position.z - right.z)) / 2;
    return { position, tangent, right, angle: Math.atan2(tangent.x, tangent.z), pitch: -Math.atan(gradient), roll: Math.atan(crossSlope) };
  }
  function curvature(distance) {
    const a = sample(distance - 0.8).angle, b = sample(distance + 0.8).angle;
    return Math.atan2(Math.sin(b - a), Math.cos(b - a)) / 1.6;
  }
  const samples = Array.from({ length: 800 }, (_, i) => sample(i / 800 * length).position);
  const bounds = new THREE.Box3().setFromPoints(samples);
  function distanceToRoad(x, z) {
    let square = Infinity;
    for (const point of samples) square = Math.min(square, (x - point.x) ** 2 + (z - point.z) ** 2);
    return Math.sqrt(square);
  }
  return { sample, curvature, length, curve, scale, planToWorld, bounds, distanceToRoad, terrainHeight };
}
