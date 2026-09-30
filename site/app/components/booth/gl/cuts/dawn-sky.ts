import { seededRandom, THREE } from "../kit";
import { LOOP } from "./dawn-plan";

const SKY_RADIUS = 190;
const STAR_RADIUS = 175;
const STAR_COUNT = 900;
const DUST_COUNT = 260;

const SKY_VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform float uDawn;
uniform vec3 uSun;
varying vec3 vDirection;

vec3 night(float h) {
  vec3 floorColor = vec3(0.020, 0.020, 0.058);
  vec3 horizon = vec3(0.105, 0.078, 0.290);
  vec3 middle = vec3(0.047, 0.043, 0.160);
  vec3 zenith = vec3(0.016, 0.018, 0.070);
  vec3 below = mix(horizon, floorColor, smoothstep(0.0, -0.45, h));
  vec3 above = mix(horizon, middle, smoothstep(0.0, 0.22, h));
  above = mix(above, zenith, smoothstep(0.22, 0.75, h));
  return h < 0.0 ? below : above;
}

vec3 dawn(float h) {
  vec3 floorColor = vec3(0.110, 0.050, 0.150);
  vec3 horizon = vec3(0.985, 0.520, 0.470);
  vec3 low = vec3(0.780, 0.330, 0.560);
  vec3 middle = vec3(0.400, 0.200, 0.640);
  vec3 zenith = vec3(0.120, 0.090, 0.330);
  vec3 below = mix(horizon, vec3(0.560, 0.220, 0.400), smoothstep(0.0, -0.08, h));
  below = mix(below, floorColor, smoothstep(-0.08, -0.6, h));
  vec3 above = mix(horizon, low, smoothstep(0.0, 0.12, h));
  above = mix(above, middle, smoothstep(0.12, 0.34, h));
  above = mix(above, zenith, smoothstep(0.34, 0.85, h));
  return h < 0.0 ? below : above;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec3 direction = normalize(vDirection);
  float h = direction.y;
  vec3 color = mix(night(h), dawn(h), uDawn);
  float sun = pow(max(dot(direction, normalize(uSun)), 0.0), 6.0);
  color += vec3(1.0, 0.62, 0.45) * sun * 0.45 * uDawn;
  color += vec3(0.30, 0.22, 0.80) * pow(max(dot(direction, normalize(uSun)), 0.0), 3.0) * 0.10 * (1.0 - uDawn);
  color = pow(max(color, vec3(0.0)), vec3(2.2));
  color += (hash(gl_FragCoord.xy) - 0.5) / 1024.0;
  gl_FragColor = vec4(color, 1.0);
}`;

const STAR_VERTEX = /* glsl */ `
attribute float aSize;
attribute float aPhase;
uniform float uTime;
varying float vTwinkle;
void main() {
  float cycles = floor(4.0 + aPhase * 12.0);
  vTwinkle = 0.65 + 0.35 * sin(uTime * 0.10471976 * cycles + aPhase * 30.0);
  gl_PointSize = aSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const STAR_FRAGMENT = /* glsl */ `
uniform float uOpacity;
uniform vec3 uColor;
varying float vTwinkle;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float alpha = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(uColor, alpha * vTwinkle * uOpacity);
}`;

/** The sky dome, its stars and the dust drifting through the tree, all driven by `dawn` (0 night, 1 sunrise). */
export type Sky = { update: (t: number, dawn: number, dust: number) => void; dispose: () => void };

function starField(count: number, radius: number, seed: number, sizeRange: [number, number], upperOnly: boolean) {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const theta = random() * Math.PI * 2;
    const y = upperOnly ? 0.02 + random() * 0.98 : random() * 2 - 1;
    const ring = Math.sqrt(1 - y * y);
    const distance = upperOnly ? radius : radius * (0.25 + random() * 0.75);
    positions.set([Math.cos(theta) * ring * distance, y * distance * (upperOnly ? 1 : 0.6), Math.sin(theta) * ring * distance], index * 3);
    sizes[index] = sizeRange[0] + random() ** 3 * (sizeRange[1] - sizeRange[0]);
    phases[index] = random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  return geometry;
}

function pointsMaterial(color: THREE.Color) {
  return new THREE.ShaderMaterial({
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uColor: { value: color } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Adds the sky, stars and dust to the scene. */
export function createSky(scene: THREE.Scene): Sky {
  const domeGeometry = new THREE.SphereGeometry(SKY_RADIUS, 48, 32);
  const domeMaterial = new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms: { uDawn: { value: 0 }, uSun: { value: new THREE.Vector3(0.35, -0.05, 1) } },
    side: THREE.BackSide,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(domeGeometry, domeMaterial);
  dome.renderOrder = -10;
  scene.add(dome);

  const starGeometry = starField(STAR_COUNT, STAR_RADIUS, 11, [1.2, 3.4], true);
  const starMaterial = pointsMaterial(new THREE.Color(0.85, 0.86, 1));
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.renderOrder = -9;
  scene.add(stars);

  const dustGeometry = starField(DUST_COUNT, 30, 29, [1.5, 4.5], false);
  const dustMaterial = pointsMaterial(new THREE.Color(0.7, 0.66, 1));
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  scene.add(dust);

  return {
    update(t, dawn, dustLevel) {
      domeMaterial.uniforms.uDawn.value = dawn;
      starMaterial.uniforms.uTime.value = t;
      starMaterial.uniforms.uOpacity.value = Math.max(0, 1 - dawn * 1.4);
      dustMaterial.uniforms.uTime.value = t;
      dustMaterial.uniforms.uOpacity.value = 0.55 * dustLevel;
      dustMaterial.uniforms.uColor.value.setRGB(0.7 + 0.3 * dawn, 0.66 + 0.1 * dawn, 1 - 0.3 * dawn);
      dust.rotation.y = 0.18 * Math.sin((t / LOOP) * Math.PI * 2);
    },
    dispose() {
      domeGeometry.dispose();
      domeMaterial.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      dustGeometry.dispose();
      dustMaterial.dispose();
    },
  };
}
