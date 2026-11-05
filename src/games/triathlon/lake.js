import * as THREE from 'three';

/** One continuous lake: crossing ripples, a reflected sky and a broken sun path. */
export function createLake() {
  const size = 128, data = new Uint8Array(size * size * 4);
  let seed = 71217;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    data[i] = (seed >>> 24) & 255;
  }
  const noise = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
  noise.magFilter = noise.minFilter = THREE.LinearFilter; noise.needsUpdate = true;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uNoise: { value: noise }, uLand: { value: 0 },
    uSky: { value: new THREE.Color(0x8bb5c2) }, uHorizon: { value: new THREE.Color(0xe4ddc5) },
    uDeep: { value: new THREE.Color(0x235b62) }, uShallow: { value: new THREE.Color(0x64867a) }
  }]);
  const material = new THREE.ShaderMaterial({
    uniforms, fog: true,
    vertexShader: `
      uniform float uTime;
      varying vec3 lakeWorld;
      varying vec2 lakeLocal;
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position;
        lakeLocal = p.xz;
        p.y += sin(p.x*.47 + p.z*.22 + uTime*1.05)*.025
             + sin(p.x*-.31 + p.z*.54 - uTime*.76)*.021
             + sin(p.x*1.4 + p.z*.9 + uTime*1.9)*.009;
        vec4 world = modelMatrix * vec4(p,1.0);
        lakeWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime, uLand;
      uniform sampler2D uNoise;
      uniform vec3 uSky, uHorizon, uDeep, uShallow;
      varying vec3 lakeWorld;
      varying vec2 lakeLocal;
      #include <fog_pars_fragment>
      float noise(vec2 p) { return texture2D(uNoise,p/128.0).r; }
      float coast(float z, float side) { return 23.0+sin(z*.019+side)*5.5+sin(z*.063+side*.8)*1.8; }
      void main() {
        vec2 p=lakeLocal;
        vec2 a=texture2D(uNoise,p*.11+vec2(uTime*.008,uTime*.004)).rg-.5;
        vec2 b=texture2D(uNoise,p*.27+vec2(-uTime*.006,uTime*.009)).gb-.5;
        vec2 flow=a*.12+b*.052;
        flow += vec2(cos(p.x*.47+p.y*.22+uTime*1.05)*.018,
                     cos(p.x*-.31+p.y*.54-uTime*.76)*.021);
        vec3 N=normalize(vec3(flow.x,1.0,flow.y));
        vec3 V=normalize(cameraPosition-lakeWorld);
        vec3 R=reflect(-V,N);
        float fresnel=.09+.91*pow(1.0-max(0.,dot(V,N)),4.0);
        float bank=coast(p.y,sign(p.x));
        float shore=bank-abs(p.x);
        float leftShore=-18.0+sin(p.y*.023)*2.3;
        shore=mix(shore,min(leftShore-p.x,p.x+80.0),uLand);
        float shallow=1.0-smoothstep(0.0,4.0,shore);
        vec3 bottom=mix(uDeep,uShallow,shallow*.82);
        vec3 sky=mix(uHorizon,uSky,smoothstep(.0,.65,R.y));
        float cloud=noise(R.xz*75.0+vec2(uTime*.06,4.0));
        sky=mix(sky,vec3(.77,.79,.73),smoothstep(.57,.82,cloud)*.28);
        // Broken dark silhouettes below the horizon reflect the wooded shore.
        float wooded=(1.0-smoothstep(.025,.19,R.y))*(.6+noise(R.xz*130.0)*.4);
        sky=mix(sky,vec3(.075,.135,.10),wooded*.65);
        vec3 color=mix(bottom,sky,fresnel*.76+.12);
        vec3 sun=normalize(vec3(-.48,.38,-.79));
        float sunDot=max(0.0,dot(R,sun));
        float glitter=pow(sunDot,210.0)*(1.0+noise(p*24.0+uTime)*1.7);
        color += vec3(1.0,.80,.47)*glitter*.72;
        color += vec3(.19,.23,.18)*pow(sunDot,12.0)*.17;
        // Small shore foam follows the same coast as the mesh; it never becomes a tiled stripe.
        float edge=(1.0-smoothstep(.12,.56,abs(shore)))*smoothstep(.57,.8,noise(p*12.0+uTime*.12));
        color=mix(color,vec3(.56,.64,.54),edge*.35);
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
  const geometry = new THREE.PlaneGeometry(220, 820, 70, 205);
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, -0.15, -350);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'lomsjon-reflected-water';
  return { mesh, update(time, land) { uniforms.uTime.value = time; uniforms.uLand.value = land ? 1 : 0; } };
}
