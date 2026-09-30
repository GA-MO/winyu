import { BRAND, THREE } from "../kit";

const COLORSPACE = "#include <colorspace_fragment>";

/** The off-white field with a slow indigo haze and a faint dot grid; the haze drifts once per loop so the seam is invisible. */
export function createLaunchBackdrop(period: number): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPaper: { value: new THREE.Color(BRAND.paper) },
      uIndigo: { value: new THREE.Color(BRAND.indigo) },
      uViolet: { value: new THREE.Color(BRAND.violet) },
      uCoral: { value: new THREE.Color(BRAND.coral) },
      uTime: { value: 0 },
      uPeriod: { value: period },
      uGrid: { value: 1 },
      uShift: { value: new THREE.Vector2(0, 0) },
      uResolution: { value: new THREE.Vector2(1920, 1080) },
    },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.9999, 1.0); }",
    fragmentShader: `
      uniform vec3 uPaper; uniform vec3 uIndigo; uniform vec3 uViolet; uniform vec3 uCoral;
      uniform float uTime; uniform float uPeriod; uniform float uGrid; uniform vec2 uShift; uniform vec2 uResolution;
      float blob(vec2 p, vec2 c, float r) { vec2 d = p - c; return exp(-dot(d, d) / (r * r)); }
      void main() {
        vec2 p = gl_FragCoord.xy / uResolution;
        p.x *= uResolution.x / uResolution.y;
        float a = uTime * 6.2831853 / uPeriod;
        vec3 col = uPaper;
        col = mix(col, uIndigo, 0.10 * blob(p, vec2(0.35 + 0.12 * sin(a), 0.85 + 0.06 * cos(a)), 0.58));
        col = mix(col, uViolet, 0.075 * blob(p, vec2(1.45 + 0.1 * cos(a), 0.25 + 0.08 * sin(2.0 * a)), 0.52));
        col = mix(col, uCoral, 0.055 * blob(p, vec2(1.5 + 0.08 * sin(a + 1.3), 0.95 + 0.05 * cos(a)), 0.38));
        vec2 cell = mod(gl_FragCoord.xy + uShift, 40.0) - 20.0;
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
