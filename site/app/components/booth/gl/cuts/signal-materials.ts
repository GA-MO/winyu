import { BRAND, SHOT_SIZE, SPARK_POINTS, THREE, type Mark } from "../kit";

/** The red the app uses for a value under target. */
export const DANGER = "#e11d48";

const RIBBON_SEGMENTS = 40;

const COLORSPACE = "#include <colorspace_fragment>";

const GRADIENT_GLSL = `
vec3 brandGradient(float x, vec3 a, vec3 b, vec3 c) {
  x = clamp(x, 0.0, 1.0);
  return x < 0.55 ? mix(a, b, x / 0.55) : mix(b, c, (x - 0.55) / 0.45);
}
vec4 over(vec4 top, vec4 bottom) {
  float alpha = top.a + bottom.a * (1.0 - top.a);
  vec3 color = top.rgb * top.a + bottom.rgb * bottom.a * (1.0 - top.a);
  return vec4(alpha > 0.0 ? color / alpha : vec3(0.0), alpha);
}
`;

function color(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

function brandUniforms() {
  return { uIndigo: { value: color(BRAND.indigo) }, uViolet: { value: color(BRAND.violet) }, uCoral: { value: color(BRAND.coral) } };
}

/** The off-white field with a slow indigo haze and a faint dot grid, drawn behind everything in screen space. */
export function createBackdrop(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  const material = new THREE.ShaderMaterial({
    uniforms: { ...brandUniforms(), uPaper: { value: color(BRAND.paper) }, uTime: { value: 0 }, uResolution: { value: new THREE.Vector2(1920, 1080) }, uGrid: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.9999, 1.0); }`,
    fragmentShader: `
      uniform vec3 uPaper; uniform vec3 uIndigo; uniform vec3 uViolet; uniform vec3 uCoral;
      uniform float uTime; uniform vec2 uResolution; uniform float uGrid;
      float blob(vec2 p, vec2 c, float r) { vec2 d = p - c; return exp(-dot(d, d) / (r * r)); }
      void main() {
        vec2 p = gl_FragCoord.xy / uResolution;
        p.x *= uResolution.x / uResolution.y;
        float a = uTime * 6.2831853 / 60.0;
        vec3 col = uPaper;
        col = mix(col, uIndigo, 0.10 * blob(p, vec2(0.35 + 0.08 * sin(a), 0.85 + 0.05 * cos(a)), 0.55));
        col = mix(col, uViolet, 0.07 * blob(p, vec2(1.45 + 0.07 * cos(a), 0.25 + 0.06 * sin(2.0 * a)), 0.5));
        col = mix(col, uCoral, 0.05 * blob(p, vec2(1.55 + 0.05 * sin(a), 0.95), 0.35));
        vec2 cell = mod(gl_FragCoord.xy, 40.0) - 20.0;
        float dotMask = 1.0 - smoothstep(0.7, 1.5, length(cell));
        float fade = 0.35 + 0.65 * smoothstep(1.2, 0.2, length(gl_FragCoord.xy / uResolution - vec2(0.5)));
        col = mix(col, uIndigo, dotMask * 0.07 * uGrid * fade);
        gl_FragColor = vec4(col, 1.0);
        ${COLORSPACE}
      }`,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return mesh;
}

/** Uniforms of one glass node: how lit, how red, how visible, its halo and its ripple. */
export type NodeUniforms = { uSize: { value: number }; uIgnite: { value: number }; uRed: { value: number }; uWhite: { value: number }; uAlpha: { value: number }; uHalo: { value: number }; uRing: { value: number }; uShadow: { value: number } };

const NODE_PAD = 4;

/** A camera-facing glass bead: white glass when idle, the brand gradient when lit, red when the data is red. */
export function createNode(diameter: number): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> & { userData: { uniforms: NodeUniforms } } {
  const uniforms: NodeUniforms = { uSize: { value: diameter }, uIgnite: { value: 0 }, uRed: { value: 0 }, uWhite: { value: 0 }, uAlpha: { value: 1 }, uHalo: { value: 0 }, uRing: { value: 0 }, uShadow: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, ...brandUniforms(), uDanger: { value: color(DANGER) } },
    vertexShader: `
      uniform float uSize; varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        center.xy += position.xy * uSize * ${NODE_PAD.toFixed(1)};
        gl_Position = projectionMatrix * center;
      }`,
    fragmentShader: `
      uniform float uIgnite; uniform float uRed; uniform float uWhite; uniform float uAlpha; uniform float uHalo; uniform float uRing; uniform float uShadow;
      uniform vec3 uIndigo; uniform vec3 uViolet; uniform vec3 uCoral; uniform vec3 uDanger;
      varying vec2 vUv;
      ${GRADIENT_GLSL}
      void main() {
        vec2 q = (vUv - 0.5) * ${(NODE_PAD * 2).toFixed(1)};
        float r = length(q);
        float aa = fwidth(r) * 1.2;
        vec4 acc = vec4(0.0);
        vec2 sq = q - vec2(0.0, -0.35);
        float shadow = exp(-dot(sq, sq) / 1.6) * 0.16 * uShadow * (1.0 - uWhite);
        acc = over(vec4(vec3(0.19, 0.18, 0.5), shadow), acc);
        vec3 lit = brandGradient(0.5 + 0.35 * (q.x - q.y) / 1.414, uIndigo, uViolet, uCoral);
        vec3 glowColor = mix(mix(uViolet, uDanger, uRed), vec3(1.0), uWhite);
        float halo = uHalo * exp(-max(r - 1.0, 0.0) * 1.6) * 0.32 * smoothstep(0.9, 1.1, r);
        acc = over(vec4(glowColor, halo), acc);
        float ringRadius = mix(1.0, ${NODE_PAD.toFixed(1)} * 0.95, uRing);
        float ring = (1.0 - smoothstep(0.0, 0.12 + 0.1 * uRing, abs(r - ringRadius))) * (1.0 - uRing) * step(0.001, uRing) * 0.8;
        acc = over(vec4(glowColor, ring), acc);
        if (r < 1.0 + aa) {
          vec3 n = vec3(q, sqrt(max(0.0, 1.0 - r * r)));
          vec3 light = normalize(vec3(-0.45, 0.6, 0.75));
          float diffuse = clamp(dot(n, light), 0.0, 1.0);
          float rim = pow(1.0 - n.z, 2.2);
          vec3 glass = mix(vec3(0.93, 0.93, 0.98), vec3(1.0), diffuse * 0.8);
          glass = mix(glass, uIndigo, rim * 0.55);
          vec3 fill = mix(lit * (0.82 + 0.3 * diffuse), mix(uDanger * (0.85 + 0.25 * diffuse), vec3(1.0), 0.0), uRed);
          vec3 body = mix(glass, fill, max(uIgnite, uRed));
          body = mix(body, vec3(1.0), uWhite);
          float spec = pow(clamp(dot(reflect(-light, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 24.0);
          body += spec * 0.55 * (1.0 - uWhite);
          float edge = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
          acc = over(vec4(body, edge), acc);
        }
        gl_FragColor = vec4(acc.rgb, acc.a * uAlpha);
        ${COLORSPACE}
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material) as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> & { userData: { uniforms: NodeUniforms } };
  mesh.userData = { uniforms: material.uniforms as unknown as NodeUniforms };
  mesh.frustumCulled = false;
  return mesh;
}

/** Uniforms of one ribbon: its ends, its bend, and how much of it is drawn, lit and dashed. */
export type RibbonUniforms = {
  uA: { value: THREE.Vector3 };
  uB: { value: THREE.Vector3 };
  uC: { value: THREE.Vector3 };
  uWidth: { value: number };
  uDraw: { value: number };
  uLit: { value: number };
  uLitReverse: { value: number };
  uHead: { value: number };
  uAlpha: { value: number };
  uBaseAlpha: { value: number };
  uRed: { value: number };
  uDash: { value: number };
  uBase: { value: THREE.Color };
  uSpanFrom: { value: number };
  uSpanTo: { value: number };
};

/** A screen-space ribbon along a quadratic curve A→C→B: a hairline when idle, a gradient stroke with a bright head where light travels. */
export function createRibbon(width: number): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> & { userData: { uniforms: RibbonUniforms } } {
  const along: number[] = [];
  const side: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= RIBBON_SEGMENTS; i += 1) {
    along.push(i / RIBBON_SEGMENTS, i / RIBBON_SEGMENTS);
    side.push(-1, 1);
    if (i < RIBBON_SEGMENTS) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Array(along.length * 3).fill(0), 3));
  geometry.setAttribute("aAlong", new THREE.Float32BufferAttribute(along, 1));
  geometry.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1));
  geometry.setIndex(index);
  const uniforms: RibbonUniforms = {
    uA: { value: new THREE.Vector3() },
    uB: { value: new THREE.Vector3() },
    uC: { value: new THREE.Vector3() },
    uWidth: { value: width },
    uDraw: { value: 1 },
    uLit: { value: 0 },
    uLitReverse: { value: 0 },
    uHead: { value: 0 },
    uAlpha: { value: 1 },
    uBaseAlpha: { value: 0.55 },
    uRed: { value: 0 },
    uDash: { value: 0 },
    uBase: { value: color("#b9bdd6") },
    uSpanFrom: { value: 0 },
    uSpanTo: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, ...brandUniforms(), uDanger: { value: color(DANGER) }, uResolution: { value: new THREE.Vector2(1920, 1080) } },
    vertexShader: `
      uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uWidth; uniform vec2 uResolution;
      attribute float aAlong; attribute float aSide;
      varying float vAlong; varying float vSide;
      vec3 curve(float s) { float u = 1.0 - s; return u * u * uA + 2.0 * u * s * uC + s * s * uB; }
      void main() {
        vAlong = aAlong; vSide = aSide;
        float s = aAlong;
        vec4 here = projectionMatrix * viewMatrix * vec4(curve(s), 1.0);
        vec4 ahead = projectionMatrix * viewMatrix * vec4(curve(clamp(s + 0.01, 0.0, 1.0)), 1.0);
        vec4 behind = projectionMatrix * viewMatrix * vec4(curve(clamp(s - 0.01, 0.0, 1.0)), 1.0);
        vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
        vec2 dir = (ahead.xy / ahead.w - behind.xy / behind.w) * aspect;
        dir = length(dir) > 1e-6 ? normalize(dir) : vec2(1.0, 0.0);
        vec2 normal = vec2(-dir.y, dir.x) / aspect;
        here.xy += normal * aSide * (uWidth * 0.5 + 1.0) * 2.0 / uResolution.y * here.w;
        gl_Position = here;
      }`,
    fragmentShader: `
      uniform float uWidth; uniform float uDraw; uniform float uLit; uniform float uLitReverse; uniform float uHead; uniform float uAlpha; uniform float uBaseAlpha; uniform float uRed; uniform float uDash;
      uniform float uSpanFrom; uniform float uSpanTo;
      uniform vec3 uBase; uniform vec3 uIndigo; uniform vec3 uViolet; uniform vec3 uCoral; uniform vec3 uDanger;
      varying float vAlong; varying float vSide;
      ${GRADIENT_GLSL}
      void main() {
        if (vAlong > uDraw) discard;
        float travel = uLitReverse > 0.5 ? 1.0 - vAlong : vAlong;
        float lit = 1.0 - smoothstep(uLit - 0.015, uLit + 0.015, travel);
        lit *= step(0.0001, uLit);
        vec3 gradient = mix(brandGradient(mix(uSpanFrom, uSpanTo, travel), uIndigo, uViolet, uCoral), uDanger, uRed);
        vec3 stroke = mix(uBase, gradient, lit);
        float alpha = mix(uBaseAlpha, 1.0, lit);
        float head = uHead * exp(-pow((travel - uLit) * 24.0, 2.0)) * step(0.0001, uLit) * step(uLit, 0.999);
        stroke = mix(stroke, vec3(1.0), head * 0.5);
        float distancePx = abs(vSide) * (uWidth * 0.5 + 1.0);
        alpha *= 1.0 - smoothstep(uWidth * 0.5 - 0.5, uWidth * 0.5 + 0.5, distancePx);
        if (uDash > 0.5) alpha *= step(0.45, fract(vAlong * 18.0));
        gl_FragColor = vec4(stroke, alpha * uAlpha);
        ${COLORSPACE}
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> & { userData: { uniforms: RibbonUniforms } };
  mesh.userData = { uniforms: material.uniforms as unknown as RibbonUniforms };
  mesh.frustumCulled = false;
  return mesh;
}

/** Uniforms of the Winyu tile: how formed the tile is, how drawn the W is, and how white its stroke. */
export type LogoUniforms = { uTile: { value: number }; uDraw: { value: number }; uRetract: { value: number }; uWhite: { value: number }; uDot: { value: number }; uAlpha: { value: number }; uShadow: { value: number } };

const LOGO_PAD = 1.5;

/** The Winyu logo as one plane: the rounded gradient tile, the sparkline W and its tip dot, drawn with distance fields so it stays crisp at any size. */
export function createLogo(tileWidth: number): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> & { userData: { uniforms: LogoUniforms } } {
  const points = SPARK_POINTS.map(([x, y]) => new THREE.Vector2(x, y));
  const uniforms: LogoUniforms = { uTile: { value: 1 }, uDraw: { value: 1 }, uRetract: { value: 0 }, uWhite: { value: 1 }, uDot: { value: 1 }, uAlpha: { value: 1 }, uShadow: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, ...brandUniforms(), uPoints: { value: points } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTile; uniform float uDraw; uniform float uRetract; uniform float uWhite; uniform float uDot; uniform float uAlpha; uniform float uShadow;
      uniform vec3 uIndigo; uniform vec3 uViolet; uniform vec3 uCoral; uniform vec2 uPoints[5];
      varying vec2 vUv;
      ${GRADIENT_GLSL}
      float roundedBox(vec2 p, vec2 halfSize, float radius) { vec2 d = abs(p) - halfSize + radius; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius; }
      float strokeDistance(vec2 p, float drawFrom, float drawTo) {
        float best = 1e5; float walked = 0.0;
        for (int i = 0; i < 4; i++) {
          vec2 a = uPoints[i]; vec2 b = uPoints[i + 1];
          float len = length(b - a);
          float s0 = clamp(drawFrom - walked, 0.0, len); float s1 = clamp(drawTo - walked, 0.0, len);
          if (s1 > s0) {
            vec2 dir = (b - a) / len; vec2 p0 = a + dir * s0; vec2 p1 = a + dir * s1;
            vec2 pa = p - p0; vec2 ba = p1 - p0;
            float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
            best = min(best, length(pa - ba * h));
          }
          walked += len;
        }
        return best;
      }
      void main() {
        vec2 p = vec2(vUv.x - 0.5, 0.5 - vUv.y) * 64.0 * ${LOGO_PAD.toFixed(2)} + 32.0;
        float px = fwidth(p.x);
        float total = 0.0;
        for (int i = 0; i < 4; i++) total += length(uPoints[i + 1] - uPoints[i]);
        vec4 acc = vec4(0.0);
        float scale = mix(0.55, 1.0, uTile);
        vec2 tp = (p - 32.0) / scale;
        float box = roundedBox(tp - vec2(0.0, -0.0), vec2(32.0), 14.0);
        float shadowBox = roundedBox((p - 32.0 - vec2(0.0, 5.0)) / scale, vec2(29.0), 14.0);
        acc = over(vec4(vec3(0.19, 0.16, 0.55), 0.26 * uTile * uShadow * exp(-max(shadowBox, 0.0) / 5.0) * step(0.0, shadowBox + 6.0)), acc);
        vec3 tile = brandGradient((tp.x + tp.y + 64.0) / 128.0, uIndigo, uViolet, uCoral);
        tile += 0.10 * smoothstep(8.0, -32.0, tp.y);
        float tileEdge = 1.0 - smoothstep(-px, px, box * scale);
        acc = over(vec4(tile, tileEdge * uTile), acc);
        float stroke = strokeDistance(p, uRetract * total, uDraw * total);
        vec3 strokeGradient = brandGradient((p.x - 9.0) / 46.0, uIndigo, uViolet, uCoral);
        vec3 strokeColor = mix(strokeGradient, vec3(1.0), uWhite);
        float strokeEdge = 1.0 - smoothstep(3.5 - px, 3.5 + px, stroke);
        acc = over(vec4(strokeColor, strokeEdge), acc);
        float dotEdge = 1.0 - smoothstep(5.0 - px, 5.0 + px, length(p - uPoints[4]));
        acc = over(vec4(mix(uCoral, vec3(1.0), uWhite), dotEdge * uDot), acc);
        gl_FragColor = vec4(acc.rgb, acc.a * uAlpha);
        ${COLORSPACE}
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const size = tileWidth * LOGO_PAD;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material) as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> & { userData: { uniforms: LogoUniforms } };
  mesh.userData = { uniforms: material.uniforms as unknown as LogoUniforms };
  mesh.frustumCulled = false;
  return mesh;
}

/** Where a point of the 64×64 logo box sits on a logo plane of `tileWidth`, in the plane's local space. */
export function logoPoint(x: number, y: number, tileWidth: number): THREE.Vector3 {
  return new THREE.Vector3(((x - 32) / 64) * tileWidth, ((32 - y) / 64) * tileWidth, 0);
}

/** Uniforms of a captured screen crop: its fade. */
export type ScreenUniforms = { uAlpha: { value: number } };

/** One region of a real captured screen on a plane with rounded corners and a soft shadow, `width` world units wide. */
export function createScreenCrop(texture: THREE.Texture, region: Mark, width: number, radiusPx = 16): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> & { userData: { uniforms: ScreenUniforms } } {
  const padPx = 64;
  const worldPerPx = width / region.w;
  const uniforms: ScreenUniforms = { uAlpha: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...uniforms,
      uMap: { value: texture },
      uOffset: { value: new THREE.Vector2(region.x / SHOT_SIZE.width, 1 - (region.y + region.h) / SHOT_SIZE.height) },
      uRepeat: { value: new THREE.Vector2(region.w / SHOT_SIZE.width, region.h / SHOT_SIZE.height) },
      uSizePx: { value: new THREE.Vector2(region.w, region.h) },
      uPadPx: { value: padPx },
      uRadius: { value: radiusPx },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform vec2 uOffset; uniform vec2 uRepeat; uniform vec2 uSizePx; uniform float uPadPx; uniform float uRadius; uniform float uAlpha;
      varying vec2 vUv;
      ${GRADIENT_GLSL}
      float roundedBox(vec2 p, vec2 halfSize, float radius) { vec2 d = abs(p) - halfSize + radius; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius; }
      void main() {
        vec2 px = (vUv - 0.5) * (uSizePx + 2.0 * uPadPx);
        vec2 local = px / uSizePx + 0.5;
        float box = roundedBox(px, uSizePx * 0.5, uRadius);
        float shadowBox = roundedBox(px - vec2(0.0, -14.0), uSizePx * 0.5 - 8.0, uRadius);
        float fade = 1.0 - smoothstep(uPadPx * 0.55, uPadPx, max(abs(px.x) - uSizePx.x * 0.5, abs(px.y) - uSizePx.y * 0.5));
        vec4 acc = vec4(vec3(0.12, 0.11, 0.36), 0.16 * exp(-max(shadowBox, 0.0) / 16.0) * fade);
        float aa = fwidth(box);
        float inside = 1.0 - smoothstep(-aa, aa, box);
        vec4 screen = texture2D(uMap, uOffset + clamp(local, 0.0, 1.0) * uRepeat);
        float border = (1.0 - smoothstep(0.0, 1.5 * aa + 0.6, abs(box + 0.6))) * 0.5;
        vec3 body = mix(screen.rgb, vec3(0.83, 0.84, 0.9), border);
        acc = over(vec4(body, inside), acc);
        gl_FragColor = vec4(acc.rgb, acc.a * uAlpha);
        ${COLORSPACE}
      }`,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry((region.w + 2 * padPx) * worldPerPx, (region.h + 2 * padPx) * worldPerPx), material) as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> & { userData: { uniforms: ScreenUniforms } };
  mesh.userData = { uniforms: material.uniforms as unknown as ScreenUniforms };
  mesh.frustumCulled = false;
  return mesh;
}

/** Uniforms of the daily line: how far it is drawn (in points), where the red data begins, and its fade. */
export type ChartUniforms = { uDraw: { value: number }; uCliff: { value: number }; uRed: { value: number }; uAlpha: { value: number } };

function chartUniforms(cliffIndex: number): ChartUniforms {
  return { uDraw: { value: 0 }, uCliff: { value: cliffIndex }, uRed: { value: 0 }, uAlpha: { value: 1 } };
}

/** The daily line as a mitred screen-space stroke through `points`: indigo to violet, red from the cliff on. */
export function createChartLine(points: THREE.Vector3[], cliffIndex: number, width: number): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> & { userData: { uniforms: ChartUniforms } } {
  const current: number[] = [];
  const previous: number[] = [];
  const next: number[] = [];
  const side: number[] = [];
  const order: number[] = [];
  const index: number[] = [];
  points.forEach((point, i) => {
    const before = points[Math.max(0, i - 1)];
    const after = points[Math.min(points.length - 1, i + 1)];
    for (const direction of [-1, 1]) {
      current.push(point.x, point.y, point.z);
      previous.push(before.x, before.y, before.z);
      next.push(after.x, after.y, after.z);
      side.push(direction);
      order.push(i);
    }
    if (i < points.length - 1) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(current, 3));
  geometry.setAttribute("aPrevious", new THREE.Float32BufferAttribute(previous, 3));
  geometry.setAttribute("aNext", new THREE.Float32BufferAttribute(next, 3));
  geometry.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1));
  geometry.setAttribute("aOrder", new THREE.Float32BufferAttribute(order, 1));
  geometry.setIndex(index);
  const uniforms = chartUniforms(cliffIndex);
  const material = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, ...brandUniforms(), uDanger: { value: color(DANGER) }, uWidth: { value: width }, uResolution: { value: new THREE.Vector2(1920, 1080) }, uCount: { value: points.length - 1 } },
    vertexShader: `
      uniform float uWidth; uniform vec2 uResolution;
      attribute vec3 aPrevious; attribute vec3 aNext; attribute float aSide; attribute float aOrder;
      varying float vOrder; varying float vSide;
      vec2 screen(vec3 p) { vec4 c = projectionMatrix * modelViewMatrix * vec4(p, 1.0); return c.xy / c.w * vec2(uResolution.x / uResolution.y, 1.0); }
      void main() {
        vOrder = aOrder; vSide = aSide;
        vec4 here = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec2 s = screen(position); vec2 sp = screen(aPrevious); vec2 sn = screen(aNext);
        vec2 d1 = length(s - sp) > 1e-6 ? normalize(s - sp) : normalize(sn - s);
        vec2 d2 = length(sn - s) > 1e-6 ? normalize(sn - s) : d1;
        vec2 n1 = vec2(-d1.y, d1.x); vec2 n2 = vec2(-d2.y, d2.x);
        vec2 miter = normalize(n1 + n2);
        float stretch = 1.0 / max(dot(miter, n1), 0.45);
        vec2 offset = miter * stretch * aSide * (uWidth * 0.5 + 1.0) * 2.0 / uResolution.y;
        offset.x /= uResolution.x / uResolution.y;
        here.xy += offset * here.w;
        gl_Position = here;
      }`,
    fragmentShader: `
      uniform float uDraw; uniform float uCliff; uniform float uRed; uniform float uAlpha; uniform float uWidth; uniform float uCount;
      uniform vec3 uIndigo; uniform vec3 uViolet; uniform vec3 uCoral; uniform vec3 uDanger;
      varying float vOrder; varying float vSide;
      ${GRADIENT_GLSL}
      void main() {
        if (vOrder > uDraw) discard;
        vec3 stroke = brandGradient(vOrder / uCount * 0.55, uIndigo, uViolet, uCoral);
        stroke = mix(stroke, uDanger, smoothstep(uCliff - 1.0, uCliff - 0.4, vOrder) * uRed);
        float distancePx = abs(vSide) * (uWidth * 0.5 + 1.0);
        float alpha = 1.0 - smoothstep(uWidth * 0.5 - 0.5, uWidth * 0.5 + 0.5, distancePx);
        gl_FragColor = vec4(stroke, alpha * uAlpha);
        ${COLORSPACE}
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> & { userData: { uniforms: ChartUniforms } };
  mesh.userData = { uniforms: material.uniforms as unknown as ChartUniforms };
  mesh.frustumCulled = false;
  return mesh;
}

/** The soft fill under the daily line down to zero litres, fading toward the baseline. */
export function createChartArea(points: THREE.Vector3[], baseline: number, cliffIndex: number): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> & { userData: { uniforms: ChartUniforms } } {
  const positions: number[] = [];
  const top: number[] = [];
  const order: number[] = [];
  const index: number[] = [];
  points.forEach((point, i) => {
    positions.push(point.x, point.y, point.z, point.x, baseline, point.z);
    top.push(1, 0);
    order.push(i, i);
    if (i < points.length - 1) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aTop", new THREE.Float32BufferAttribute(top, 1));
  geometry.setAttribute("aOrder", new THREE.Float32BufferAttribute(order, 1));
  geometry.setIndex(index);
  const uniforms = chartUniforms(cliffIndex);
  const material = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, ...brandUniforms(), uDanger: { value: color(DANGER) } },
    vertexShader: `attribute float aTop; attribute float aOrder; varying float vTop; varying float vOrder; void main() { vTop = aTop; vOrder = aOrder; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uDraw; uniform float uCliff; uniform float uRed; uniform float uAlpha;
      uniform vec3 uIndigo; uniform vec3 uDanger;
      varying float vTop; varying float vOrder;
      void main() {
        if (vOrder > uDraw) discard;
        vec3 fill = mix(uIndigo, uDanger, smoothstep(uCliff - 1.0, uCliff - 0.4, vOrder) * uRed);
        gl_FragColor = vec4(fill, 0.13 * pow(vTop, 1.6) * uAlpha);
        ${COLORSPACE}
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> & { userData: { uniforms: ChartUniforms } };
  mesh.userData = { uniforms: material.uniforms as unknown as ChartUniforms };
  mesh.frustumCulled = false;
  return mesh;
}
