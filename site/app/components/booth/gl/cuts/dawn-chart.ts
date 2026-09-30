import { FACTS, THREE } from "../kit";
import { hudPoint } from "./dawn-camera";
import { createStrand, smoothPath, type PathFn, type Strand } from "./dawn-strand";
import { lightSprite } from "./dawn-tree";

/** Where the orders chart sits on the stage, in pixels. */
export const CHART_BOX = { left: 150, right: 1640, top: 560, bottom: 930 } as const;

const SEGMENTS = 300;
const CLIFF_DATE = "2026-09-11";
const LINE_COLORS = [
  [new THREE.Color("#fb7185"), new THREE.Color(2.2, 1.35, 1.45)],
  [new THREE.Color("#a78bfa"), new THREE.Color(1.6, 1.4, 2.4)],
] as const;

const AREA_VERTEX = /* glsl */ `
attribute float aAlong;
attribute float aHeight;
varying float vAlong;
varying float vHeight;
void main() {
  vAlong = aAlong;
  vHeight = aHeight;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const AREA_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uReveal;
uniform float uOpacity;
varying float vAlong;
varying float vHeight;
void main() {
  if (vAlong > uReveal) discard;
  float edge = smoothstep(uReveal, uReveal - 0.02, vAlong);
  gl_FragColor = vec4(uColor, uOpacity * edge * pow(vHeight, 2.2) * 0.11);
}`;

type Series = { strand: Strand; path: PathFn; tip: THREE.Sprite; area: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> };

/** The daily orders of the two agents drawn in light on the HUD plane. */
export type Chart = { update: (draw: number, opacity: number, marker: number) => void; dispose: () => void };

const MAX_LITRES = Math.max(...FACTS.dailyOrders.flatMap((series) => series.points.map((point) => point.litres)));
const DAYS = FACTS.dailyOrders[0].points.length;

/** The stage pixel of day `index` at `litres`. */
export function chartPixel(index: number, litres: number): [number, number] {
  const x = CHART_BOX.left + (index / (DAYS - 1)) * (CHART_BOX.right - CHART_BOX.left);
  const y = CHART_BOX.bottom - (litres / MAX_LITRES) * (CHART_BOX.bottom - CHART_BOX.top);
  return [x, y];
}

/** Index of the day the orders fell off the cliff. */
export const CLIFF_INDEX = FACTS.dailyOrders[0].points.findIndex((point) => point.date === CLIFF_DATE);

/** Share of the chart's width before the cliff, for syncing type to the drawing head. */
export const CLIFF_SHARE = CLIFF_INDEX / (DAYS - 1);

/** The stage pixel where the first series starts: the filaments of the shared story converge here. */
export const CHART_ORIGIN = chartPixel(0, FACTS.dailyOrders[0].points[0].litres);

function areaMesh(path: PathFn, color: THREE.Color): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const positions: number[] = [];
  const along: number[] = [];
  const height: number[] = [];
  const base = hudPoint(0, CHART_BOX.bottom).y;
  const top = hudPoint(0, CHART_BOX.top).y;
  const point = new THREE.Vector3();
  for (let index = 0; index <= SEGMENTS; index += 1) {
    path(index / SEGMENTS, point);
    positions.push(point.x, point.y, point.z, point.x, base, point.z);
    along.push(index / SEGMENTS, index / SEGMENTS);
    height.push((point.y - base) / (top - base), 0);
  }
  const indices: number[] = [];
  for (let index = 0; index < SEGMENTS; index += 1) {
    const a = index * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aAlong", new THREE.Float32BufferAttribute(along, 1));
  geometry.setAttribute("aHeight", new THREE.Float32BufferAttribute(height, 1));
  geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({
    vertexShader: AREA_VERTEX,
    fragmentShader: AREA_FRAGMENT,
    uniforms: { uColor: { value: color.clone() }, uReveal: { value: 0 }, uOpacity: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

/** Adds the chart to the HUD group. */
export function createChart(hud: THREE.Group, glow: THREE.Texture): Chart {
  const group = new THREE.Group();
  hud.add(group);
  const series: Series[] = FACTS.dailyOrders.map((line, index) => {
    const points = line.points.map((point, day) => {
      const [x, y] = chartPixel(day, point.litres);
      return hudPoint(x, y);
    });
    const path = smoothPath(points);
    const [soft, bright] = LINE_COLORS[index];
    const strand = createStrand(SEGMENTS, 3, (s) => soft.clone().lerp(bright, 0.35 + 0.65 * s));
    const area = areaMesh(path, soft);
    const tip = lightSprite(glow);
    group.add(area, strand.line, tip);
    return { strand, path, tip, area };
  });
  const [markerX] = chartPixel(CLIFF_INDEX, 0);
  const markerTop = hudPoint(markerX, CHART_BOX.top - 40);
  const markerBottom = hudPoint(markerX, CHART_BOX.bottom);
  const marker = createStrand(1, 1.5, () => new THREE.Color(1, 1, 1));
  marker.material.dashed = true;
  marker.material.dashSize = 0.08;
  marker.material.gapSize = 0.08;
  marker.draw((s, out) => out.lerpVectors(markerBottom, markerTop, s), 0, 1);
  marker.line.computeLineDistances();
  group.add(marker.line);

  return {
    update(draw, opacity, markerLevel) {
      group.visible = opacity > 0.001;
      if (!group.visible) return;
      const reach = Math.max(0.0001, draw);
      series.forEach(({ strand, path, tip, area }, index) => {
        strand.draw(path, 0, reach);
        strand.material.opacity = opacity;
        area.material.uniforms.uReveal.value = reach;
        area.material.uniforms.uOpacity.value = opacity;
        path(reach, tip.position);
        const drawing = draw > 0 && draw < 1 ? 1 : 0.35;
        tip.scale.setScalar(0.55);
        tip.material.color.copy(LINE_COLORS[index][1]).multiplyScalar(opacity * drawing * (draw > 0 ? 1.4 : 0));
      });
      marker.material.opacity = 0.45 * markerLevel * opacity;
      marker.line.visible = markerLevel > 0.001;
    },
    dispose() {
      for (const { strand, area, tip } of series) {
        strand.dispose();
        area.geometry.dispose();
        area.material.dispose();
        tip.material.dispose();
      }
      marker.dispose();
    },
  };
}
