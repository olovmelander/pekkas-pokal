import * as THREE from 'three';

/** A small procedural light probe, authored in linear light. Metals and wet
 * surfaces reflect a sky/window instead of turning into unlit grey plastic.
 * It is baked once; there is no reflection pass during gameplay.
 */
export function arcadeEnvironment(renderer, interior = false) {
  const probe = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { indoor: { value: interior ? 1 : 0 } },
    vertexShader: `varying vec3 vDirection;
      void main() { vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `varying vec3 vDirection; uniform float indoor;
      void main() {
        vec3 d = normalize(vDirection);
        vec3 sky = mix(vec3(.66,.75,.79), vec3(.25,.43,.64), pow(max(d.y, 0.), .55));
        vec3 ground = mix(vec3(.11,.14,.075), vec3(.43,.47,.32), pow(1. + min(d.y, 0.), 3.));
        vec3 outdoor = d.y > 0. ? sky : ground;
        float sun = pow(max(dot(d, normalize(vec3(-.46,.79,.40))), 0.), 96.);
        outdoor += vec3(4.2,3.2,1.9) * sun;
        vec3 room = mix(vec3(.08,.045,.024), vec3(.30,.22,.14), max(d.y,0.));
        float window = smoothstep(.86,.91, d.z) * (1. - smoothstep(.35,.55,abs(d.x))) * (1. - smoothstep(.36,.58,abs(d.y-.12)));
        room += vec3(1.9,2.15,2.5) * window;
        room += vec3(2.4,1.5,.66) * pow(max(dot(d, normalize(vec3(-.3,.9,.1))),0.),28.);
        gl_FragColor = vec4(mix(outdoor,room,indoor),1.);
      }`
  });
  const geometry = new THREE.SphereGeometry(10, 24, 12);
  probe.add(new THREE.Mesh(geometry, material));
  const generator = new THREE.PMREMGenerator(renderer);
  try {
    return generator.fromScene(probe, 0.04, 0.1, 30, { size: 128 });
  } finally {
    generator.dispose();
    geometry.dispose();
    material.dispose();
    probe.clear();
  }
}
