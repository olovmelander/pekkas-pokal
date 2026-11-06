/** Keep the athlete's full body inside narrow screens at both course edges. */
export function frameTriathlon(camera, { x, started, discipline }) {
  const portrait = camera.aspect < 0.8;
  const targetX = x * (portrait ? 0.6 : 0.35);
  camera.position.set(targetX + (started ? 0 : 2), portrait ? 6.6 : 5.7, portrait ? 12.5 : 10.5);
  camera.lookAt(targetX, discipline === 'swim' ? 0.2 : 0.9, portrait ? -8 : -10);
}
