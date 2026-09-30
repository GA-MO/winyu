import { THREE } from "../kit";

/** A 2D point in stage pixels (y grows downward), the space the type layer uses. */
export type Point = [number, number];

const STAGE = { width: 1920, height: 1080 };

/** An orthographic camera whose units are stage pixels with y down, so HUD geometry lines up with the type layer. */
export function hudCamera(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(0, STAGE.width, 0, STAGE.height, -100, 100);
  camera.position.set(0, 0, 10);
  return camera;
}

/** Linear-space colour of a hex string, ready for a shader uniform. */
export function linear(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

/** Points spaced evenly along a polyline by arc length, so two shapes can morph point for point. */
export function resample(points: Point[], count: number): Point[] {
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) {
    const [ax, ay] = points[index - 1];
    const [bx, by] = points[index];
    lengths.push(lengths[index - 1] + Math.hypot(bx - ax, by - ay));
  }
  const total = lengths[lengths.length - 1];
  const result: Point[] = [];
  let segment = 1;
  for (let step = 0; step < count; step += 1) {
    const at = (total * step) / (count - 1);
    while (segment < points.length - 1 && lengths[segment] < at) segment += 1;
    const span = lengths[segment] - lengths[segment - 1];
    const local = span > 0 ? (at - lengths[segment - 1]) / span : 0;
    const [ax, ay] = points[segment - 1];
    const [bx, by] = points[segment];
    result.push([ax + (bx - ax) * local, ay + (by - ay) * local]);
  }
  return result;
}

/** Point-for-point blend of two equally sampled shapes. */
export function blendShapes(from: Point[], to: Point[], amount: number): Point[] {
  return from.map(([ax, ay], index) => [ax + (to[index][0] - ax) * amount, ay + (to[index][1] - ay) * amount]);
}

const RIBBON_VERTEX = `
attribute float aS;
attribute float aSide;
attribute vec2 aNormal;
uniform float uHalf;
varying float vS;
varying float vEdge;
void main() {
  vS = aS;
  vEdge = aSide * (uHalf + 1.0);
  vec3 offset = vec3(aNormal * vEdge, 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + offset, 1.0);
}`;

const RIBBON_FRAGMENT = `
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform vec2 uStops;
uniform float uLength;
uniform float uFrom;
uniform float uTo;
uniform float uHalf;
uniform float uIntensity;
uniform float uHead;
uniform float uOpacity;
varying float vS;
varying float vEdge;
void main() {
  if (vS < uFrom || vS > uTo) discard;
  float u = vS / max(uLength, 0.001);
  vec3 color = u < uStops.x ? mix(uA, uB, u / uStops.x) : (u < uStops.y ? mix(uB, uC, (u - uStops.x) / max(uStops.y - uStops.x, 0.0001)) : uC);
  float edge = clamp(uHalf + 0.5 - abs(vEdge), 0.0, 1.0);
  float head = uHead * exp(-(uTo - vS) / 70.0);
  gl_FragColor = vec4(color * (uIntensity + head), edge * uOpacity);
}`;

/** A screen-space stroke of constant pixel width, drawn between two arc lengths with a three-stop gradient. */
export type Ribbon = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  length: number;
  setPath: (points: Point[]) => void;
  reveal: (from: number, to: number) => void;
  style: (options: { width?: number; intensity?: number; head?: number; opacity?: number }) => void;
  tint: (a: THREE.Color, b: THREE.Color, c: THREE.Color) => void;
  sample: (fraction: number) => Point;
};

/** A ribbon of `count` evenly spaced samples; call `setPath` with any polyline, then `reveal` a 0–1 range of it. */
export function createRibbon(count: number, colors: [string, string, string], stops: [number, number] = [0.55, 1]): Ribbon {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 2 * 3);
  const arc = new Float32Array(count * 2);
  const side = new Float32Array(count * 2);
  const normals = new Float32Array(count * 2 * 2);
  const indices: number[] = [];
  for (let index = 0; index < count; index += 1) {
    side[index * 2] = -1;
    side[index * 2 + 1] = 1;
    if (index < count - 1) {
      const a = index * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aS", new THREE.BufferAttribute(arc, 1));
  geometry.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
  geometry.setAttribute("aNormal", new THREE.BufferAttribute(normals, 2));
  geometry.setIndex(indices);
  const uniforms = {
    uA: { value: linear(colors[0]) },
    uB: { value: linear(colors[1]) },
    uC: { value: linear(colors[2]) },
    uStops: { value: new THREE.Vector2(stops[0], stops[1]) },
    uLength: { value: 1 },
    uFrom: { value: 0 },
    uTo: { value: 0 },
    uHalf: { value: 1.5 },
    uIntensity: { value: 1 },
    uHead: { value: 0 },
    uOpacity: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: RIBBON_VERTEX, fragmentShader: RIBBON_FRAGMENT, uniforms, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  let samples: Point[] = Array.from({ length: count }, () => [0, 0] as Point);
  const ribbon: Ribbon = {
    mesh,
    length: 1,
    setPath(points) {
      samples = resample(points, count);
      let travelled = 0;
      for (let index = 0; index < count; index += 1) {
        if (index > 0) travelled += Math.hypot(samples[index][0] - samples[index - 1][0], samples[index][1] - samples[index - 1][1]);
        const [px, py] = samples[index];
        const [ax, ay] = samples[Math.max(0, index - 1)];
        const [bx, by] = samples[Math.min(count - 1, index + 1)];
        const tangentLength = Math.hypot(bx - ax, by - ay) || 1;
        const nx = -(by - ay) / tangentLength;
        const ny = (bx - ax) / tangentLength;
        positions.set([px, py, 0, px, py, 0], index * 6);
        normals.set([nx, ny, nx, ny], index * 4);
        arc[index * 2] = travelled;
        arc[index * 2 + 1] = travelled;
      }
      ribbon.length = Math.max(travelled, 0.001);
      uniforms.uLength.value = ribbon.length;
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aS.needsUpdate = true;
      geometry.attributes.aNormal.needsUpdate = true;
    },
    reveal(from, to) {
      uniforms.uFrom.value = from * ribbon.length - 0.001;
      uniforms.uTo.value = to * ribbon.length + 0.001;
      mesh.visible = to > from;
    },
    tint(a, b, c) {
      uniforms.uA.value.copy(a);
      uniforms.uB.value.copy(b);
      uniforms.uC.value.copy(c);
    },
    sample(fraction) {
      const at = Math.min(1, Math.max(0, fraction)) * (count - 1);
      const index = Math.min(count - 2, Math.floor(at));
      const local = at - index;
      const [ax, ay] = samples[index];
      const [bx, by] = samples[index + 1];
      return [ax + (bx - ax) * local, ay + (by - ay) * local];
    },
    style({ width, intensity, head, opacity }) {
      if (width !== undefined) uniforms.uHalf.value = width / 2;
      if (intensity !== undefined) uniforms.uIntensity.value = intensity;
      if (head !== undefined) uniforms.uHead.value = head;
      if (opacity !== undefined) uniforms.uOpacity.value = opacity;
    },
  };
  return ribbon;
}

const QUAD_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const GLOW_FRAGMENT = `
uniform vec3 uColor;
uniform float uCore;
uniform float uHalo;
uniform float uIntensity;
uniform float uSize;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0 * uSize;
  float core = 1.0 - smoothstep(uCore - 1.0, uCore + 1.0, d);
  float halo = exp(-d * d / max(uHalo * uHalo, 0.001));
  gl_FragColor = vec4(uColor * (core * uIntensity + halo * uIntensity * 0.4), 1.0);
}`;

/** A glowing dot in HUD pixels: an HDR core that catches bloom and a soft halo, added onto the frame. */
export type GlowDot = { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; set: (x: number, y: number, core: number, halo: number, intensity: number) => void };

/** A glow dot whose quad is large enough for a halo of `maxHalo` pixels. */
export function createGlowDot(color: string, maxHalo = 160): GlowDot {
  const size = maxHalo * 6;
  const uniforms = { uColor: { value: linear(color) }, uCore: { value: 6 }, uHalo: { value: 30 }, uIntensity: { value: 1 }, uSize: { value: size / 2 } };
  const material = new THREE.ShaderMaterial({ vertexShader: QUAD_VERTEX, fragmentShader: GLOW_FRAGMENT, uniforms, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.frustumCulled = false;
  return {
    mesh,
    set(x, y, core, halo, intensity) {
      mesh.position.set(x, y, 0);
      uniforms.uCore.value = core;
      uniforms.uHalo.value = halo;
      uniforms.uIntensity.value = intensity;
      mesh.visible = intensity > 0.001;
    },
  };
}

const TILE_FRAGMENT = `
uniform vec2 uSize;
uniform float uRadius;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform float uOpacity;
uniform float uSheen;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  vec2 q = abs(p) - uSize * 0.5 + uRadius;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
  float inside = clamp(0.5 - d, 0.0, 1.0);
  float g = clamp((vUv.x + vUv.y) * 0.5, 0.0, 1.0);
  vec3 color = g < 0.55 ? mix(uA, uB, g / 0.55) : mix(uB, uC, (g - 0.55) / 0.45);
  float offset = (vUv.x - vUv.y * 0.4) - (uSheen * 1.6 - 0.3);
  float sheen = uSheen * (1.0 - uSheen) * 4.0 * exp(-offset * offset * 30.0);
  gl_FragColor = vec4(color * (1.0 + sheen), inside * uOpacity);
}`;

/** The logo's rounded gradient tile, drawn in HUD pixels. */
export type Tile = { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; set: (x: number, y: number, size: number, opacity: number, sheen: number) => void };

/** A rounded square with the brand gradient running from top-left to bottom-right. */
export function createTile(colors: [string, string, string]): Tile {
  const uniforms = { uSize: { value: new THREE.Vector2(1, 1) }, uRadius: { value: 1 }, uA: { value: linear(colors[0]) }, uB: { value: linear(colors[1]) }, uC: { value: linear(colors[2]) }, uOpacity: { value: 1 }, uSheen: { value: 0 } };
  const material = new THREE.ShaderMaterial({ vertexShader: QUAD_VERTEX, fragmentShader: TILE_FRAGMENT, uniforms, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.frustumCulled = false;
  return {
    mesh,
    set(x, y, size, opacity, sheen) {
      mesh.position.set(x, y, 0);
      mesh.scale.set(size, size, 1);
      uniforms.uSize.value.set(size, size);
      uniforms.uRadius.value = size * 0.24;
      uniforms.uOpacity.value = opacity;
      uniforms.uSheen.value = sheen;
      mesh.visible = opacity > 0.001 && size > 1;
    },
  };
}

const AREA_VERTEX = `
attribute float aTop;
varying float vTop;
varying float vX;
void main() {
  vTop = aTop;
  vX = position.x;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const AREA_FRAGMENT = `
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uHotFrom;
uniform float uReveal;
uniform float uOpacity;
varying float vTop;
varying float vX;
void main() {
  if (vX > uReveal) discard;
  vec3 color = mix(uColor, uHot, smoothstep(uHotFrom - 30.0, uHotFrom + 30.0, vX));
  gl_FragColor = vec4(color, vTop * vTop * uOpacity);
}`;

/** A filled area under a HUD polyline that fades toward its baseline and reveals left to right. */
export type Area = { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>; set: (revealX: number, opacity: number) => void };

/** The area between `points` and the horizontal `baseline`, coloured `hot` from `hotFromX` on. */
export function createArea(points: Point[], baseline: number, color: string, hot: string, hotFromX: number): Area {
  const positions: number[] = [];
  const top: number[] = [];
  const indices: number[] = [];
  points.forEach(([x, y], index) => {
    positions.push(x, y, 0, x, baseline, 0);
    top.push(1, 0);
    if (index < points.length - 1) {
      const a = index * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aTop", new THREE.Float32BufferAttribute(top, 1));
  geometry.setIndex(indices);
  const uniforms = { uColor: { value: linear(color) }, uHot: { value: linear(hot) }, uHotFrom: { value: hotFromX }, uReveal: { value: 0 }, uOpacity: { value: 0 } };
  const material = new THREE.ShaderMaterial({ vertexShader: AREA_VERTEX, fragmentShader: AREA_FRAGMENT, uniforms, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return {
    mesh,
    set(revealX, opacity) {
      uniforms.uReveal.value = revealX;
      uniforms.uOpacity.value = opacity;
      mesh.visible = opacity > 0.001;
    },
  };
}

const SKY_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}`;

const SKY_FRAGMENT = `
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec3 uHorizon;
uniform float uFlood;
uniform vec3 uGlow;
uniform vec2 uGlowAt;
uniform float uGlowSize;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 color = mix(uBottom, uTop, smoothstep(0.0, 1.0, vUv.y));
  float band = 1.0 - smoothstep(0.0, max(uFlood, 0.001), vUv.y);
  color = mix(color, uHorizon, band * band * step(0.0001, uFlood));
  vec2 d = (vUv - uGlowAt) * vec2(1.7778, 1.0);
  color += uGlow * exp(-dot(d, d) / max(uGlowSize * uGlowSize, 0.0001));
  color += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(color, 1.0);
}`;

/** The film's sky: a vertical gradient, a horizon that floods up from the bottom, and one soft light. */
export type Sky = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  set: (state: { top: THREE.Color; bottom: THREE.Color; horizon: THREE.Color; flood: number; glow: THREE.Color; glowX: number; glowY: number; glowSize: number }) => void;
};

/** A full-screen sky quad drawn behind everything. */
export function createSky(): Sky {
  const uniforms = {
    uTop: { value: new THREE.Color() },
    uBottom: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uFlood: { value: 0 },
    uGlow: { value: new THREE.Color() },
    uGlowAt: { value: new THREE.Vector2(0.5, 0.5) },
    uGlowSize: { value: 0.5 },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return {
    mesh,
    set(state) {
      uniforms.uTop.value.copy(state.top);
      uniforms.uBottom.value.copy(state.bottom);
      uniforms.uHorizon.value.copy(state.horizon);
      uniforms.uFlood.value = state.flood;
      uniforms.uGlow.value.copy(state.glow);
      uniforms.uGlowAt.value.set(state.glowX, state.glowY);
      uniforms.uGlowSize.value = state.glowSize;
    },
  };
}

const POINT_VERTEX = `
attribute vec3 aColor;
attribute float aSize;
attribute float aGlow;
uniform float uPixelScale;
varying vec3 vColor;
varying float vGlow;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = max(1.5, aSize * uPixelScale / max(-view.z, 0.1));
  vColor = aColor;
  vGlow = aGlow;
}`;

const POINT_FRAGMENT = `
varying vec3 vColor;
varying float vGlow;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = 1.0 - smoothstep(0.14, 0.22, d);
  float halo = exp(-d * d * 9.0);
  gl_FragColor = vec4(vColor * (core * vGlow + halo * 0.4 * vGlow), 1.0);
}`;

/** Glowing orbs in world space whose position, colour, size (world units) and glow are set every frame. */
export type Orbs = {
  points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  set: (index: number, position: THREE.Vector3, color: THREE.Color, size: number, glow: number) => void;
  commit: () => void;
};

/** `count` world-space orbs drawn additively, sized in world units. */
export function createOrbs(count: number, pixelScale: number): Orbs {
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  const color = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  const size = new THREE.BufferAttribute(new Float32Array(count), 1);
  const glow = new THREE.BufferAttribute(new Float32Array(count), 1);
  geometry.setAttribute("position", position);
  geometry.setAttribute("aColor", color);
  geometry.setAttribute("aSize", size);
  geometry.setAttribute("aGlow", glow);
  const material = new THREE.ShaderMaterial({ vertexShader: POINT_VERTEX, fragmentShader: POINT_FRAGMENT, uniforms: { uPixelScale: { value: pixelScale } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return {
    points,
    set(index, at, tint, diameter, amount) {
      position.setXYZ(index, at.x, at.y, at.z);
      color.setXYZ(index, tint.r, tint.g, tint.b);
      size.setX(index, diameter);
      glow.setX(index, amount);
    },
    commit() {
      position.needsUpdate = true;
      color.needsUpdate = true;
      size.needsUpdate = true;
      glow.needsUpdate = true;
    },
  };
}

const SPARK_VERTEX = `
attribute vec3 aDir;
attribute vec3 aColor;
attribute float aBirth;
attribute float aSpeed;
attribute float aSize;
uniform float uTime;
uniform float uPixelScale;
uniform float uAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float age = uTime - aBirth;
  if (age < 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    return;
  }
  float travel = aSpeed * (1.0 - exp(-age * 2.4)) / 2.4;
  vec3 world = position + aDir * travel + vec3(0.0, -0.06 * age, 0.0);
  vec4 view = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = max(1.2, aSize * uPixelScale / max(-view.z, 0.1));
  float heat = exp(-age * 3.0);
  vColor = aColor * (1.0 + 5.0 * heat);
  vAlpha = uAlpha * (0.18 + 0.82 * exp(-age * 1.1)) * smoothstep(2.0, 9.0, -view.z);
}`;

const SPARK_FRAGMENT = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float falloff = 1.0 - smoothstep(0.35, 1.0, d);
  gl_FragColor = vec4(vColor * falloff * vAlpha, 1.0);
}`;

/** One burst particle: where it starts, which way it flies, when it is born, how fast, its colour and size. */
export type Spark = { origin: THREE.Vector3; dir: THREE.Vector3; birth: number; speed: number; color: THREE.Color; size: number };

/** Particles whose whole flight is a function of the time uniform, so any frame renders the same. */
export function createSparks(sparks: Spark[], pixelScale: number): { points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>; set: (time: number, alpha: number) => void } {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(sparks.flatMap((spark) => spark.origin.toArray()), 3));
  geometry.setAttribute("aDir", new THREE.Float32BufferAttribute(sparks.flatMap((spark) => spark.dir.toArray()), 3));
  geometry.setAttribute("aColor", new THREE.Float32BufferAttribute(sparks.flatMap((spark) => [spark.color.r, spark.color.g, spark.color.b]), 3));
  geometry.setAttribute("aBirth", new THREE.Float32BufferAttribute(sparks.map((spark) => spark.birth), 1));
  geometry.setAttribute("aSpeed", new THREE.Float32BufferAttribute(sparks.map((spark) => spark.speed), 1));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sparks.map((spark) => spark.size), 1));
  const uniforms = { uTime: { value: 0 }, uPixelScale: { value: pixelScale }, uAlpha: { value: 1 } };
  const material = new THREE.ShaderMaterial({ vertexShader: SPARK_VERTEX, fragmentShader: SPARK_FRAGMENT, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return {
    points,
    set(time, alpha) {
      uniforms.uTime.value = time;
      uniforms.uAlpha.value = alpha;
      points.visible = alpha > 0.001;
    },
  };
}

const STAR_VERTEX = `
attribute float aBright;
attribute float aPhase;
attribute float aSize;
uniform float uTime;
uniform float uAlpha;
varying float vBright;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = aSize;
  float twinkle = 0.75 + 0.25 * sin(uTime * 0.20943951 * (1.0 + floor(aPhase * 4.0)) + aPhase * 6.2831853);
  vBright = aBright * twinkle * uAlpha;
}`;

const STAR_FRAGMENT = `
uniform vec3 uColor;
varying float vBright;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  gl_FragColor = vec4(uColor * vBright * (1.0 - smoothstep(0.2, 1.0, d)), 1.0);
}`;

/** A still field of faint stars in a box, twinkling on whole cycles of the loop so the seam never jumps. */
export function createStars(count: number, box: { min: THREE.Vector3; max: THREE.Vector3 }, random: () => number, color: string): { points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>; set: (time: number, alpha: number) => void } {
  const positions: number[] = [];
  const bright: number[] = [];
  const phase: number[] = [];
  const size: number[] = [];
  for (let index = 0; index < count; index += 1) {
    positions.push(box.min.x + random() * (box.max.x - box.min.x), box.min.y + random() * (box.max.y - box.min.y), box.min.z + random() * (box.max.z - box.min.z));
    bright.push(0.15 + random() ** 3 * 0.75);
    phase.push(random());
    size.push(1.4 + random() * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aBright", new THREE.Float32BufferAttribute(bright, 1));
  geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(phase, 1));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(size, 1));
  const uniforms = { uTime: { value: 0 }, uAlpha: { value: 1 }, uColor: { value: linear(color) } };
  const material = new THREE.ShaderMaterial({ vertexShader: STAR_VERTEX, fragmentShader: STAR_FRAGMENT, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return {
    points,
    set(time, alpha) {
      uniforms.uTime.value = time;
      uniforms.uAlpha.value = alpha;
    },
  };
}

const LINK_VERTEX = `
attribute float aAlpha;
varying float vAlpha;
void main() {
  vAlpha = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const LINK_FRAGMENT = `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor * vAlpha, 1.0);
}`;

/** Thin world-space lines between pairs of points, each with its own brightness. */
export type Links = { lines: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>; set: (index: number, a: THREE.Vector3, b: THREE.Vector3, alpha: number) => void; commit: () => void };

/** `count` additive line segments. */
export function createLinks(count: number, color: string): Links {
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(count * 6), 3);
  const alpha = new THREE.BufferAttribute(new Float32Array(count * 2), 1);
  geometry.setAttribute("position", position);
  geometry.setAttribute("aAlpha", alpha);
  const material = new THREE.ShaderMaterial({ vertexShader: LINK_VERTEX, fragmentShader: LINK_FRAGMENT, uniforms: { uColor: { value: linear(color) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  return {
    lines,
    set(index, a, b, amount) {
      position.setXYZ(index * 2, a.x, a.y, a.z);
      position.setXYZ(index * 2 + 1, b.x, b.y, b.z);
      alpha.setX(index * 2, amount);
      alpha.setX(index * 2 + 1, amount);
    },
    commit() {
      position.needsUpdate = true;
      alpha.needsUpdate = true;
    },
  };
}

const SWEEP_FRAGMENT = `
uniform float uAt;
uniform float uStrength;
varying vec2 vUv;
void main() {
  float offset = (vUv.x + (1.0 - vUv.y) * 0.25) - uAt;
  float band = exp(-offset * offset * 60.0);
  gl_FragColor = vec4(vec3(1.0, 0.96, 0.98) * band * uStrength, 1.0);
}`;

/** A diagonal band of light that slides across a world plane, added on top of it. */
export function createSweep(width: number, height: number): { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; set: (at: number, strength: number) => void } {
  const uniforms = { uAt: { value: -1 }, uStrength: { value: 0 } };
  const material = new THREE.ShaderMaterial({ vertexShader: QUAD_VERTEX, fragmentShader: SWEEP_FRAGMENT, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  return {
    mesh,
    set(at, strength) {
      uniforms.uAt.value = at;
      uniforms.uStrength.value = strength;
      mesh.visible = strength > 0.001;
    },
  };
}

const SHADOW_FRAGMENT = `
uniform vec2 uSize;
uniform float uSoft;
uniform float uOpacity;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * (uSize + uSoft * 2.0);
  vec2 q = abs(p) - uSize * 0.5;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  float a = 1.0 - smoothstep(-uSoft * 0.3, uSoft, d);
  gl_FragColor = vec4(uColor, a * uOpacity);
}`;

/** A soft rectangular shadow or glow behind a world plane of `width` × `height`. */
export function createSoftRect(width: number, height: number, soft: number, color: string, additive = false): { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; set: (opacity: number) => void } {
  const uniforms = { uSize: { value: new THREE.Vector2(width, height) }, uSoft: { value: soft }, uOpacity: { value: 0 }, uColor: { value: linear(color) } };
  const material = new THREE.ShaderMaterial({ vertexShader: QUAD_VERTEX, fragmentShader: SHADOW_FRAGMENT, uniforms, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width + soft * 2, height + soft * 2), material);
  return {
    mesh,
    set(opacity) {
      uniforms.uOpacity.value = opacity;
      mesh.visible = opacity > 0.001;
    },
  };
}
