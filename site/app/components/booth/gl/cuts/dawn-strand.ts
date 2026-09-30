import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { THREE } from "../kit";

const STAGE = new THREE.Vector2(1920, 1080);
const scratch = new THREE.Vector3();

/** A point on a path at parameter s in [0, 1]. */
export type PathFn = (s: number, target: THREE.Vector3) => THREE.Vector3;

/** A fat line with a fixed number of segments whose drawn span is rewritten in place every frame. */
export type Strand = {
  line: Line2;
  material: LineMaterial;
  draw: (path: PathFn, from: number, to: number) => void;
  dispose: () => void;
};

/** Builds a strand of `segments` pieces, `width` pixels thick, coloured along its length by `colorAt`. */
export function createStrand(segments: number, width: number, colorAt: (s: number) => THREE.Color): Strand {
  const geometry = new LineGeometry();
  geometry.setPositions(new Float32Array((segments + 1) * 3));
  const colors: number[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const color = colorAt(index / segments);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setColors(colors);
  const material = new LineMaterial({ linewidth: width, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false });
  material.resolution.copy(STAGE);
  const line = new Line2(geometry, material);
  line.frustumCulled = false;
  const start = geometry.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute;
  const buffer = start.data;
  const array = buffer.array as Float32Array;

  const draw = (path: PathFn, from: number, to: number) => {
    for (let index = 0; index <= segments; index += 1) {
      path(from + ((to - from) * index) / segments, scratch);
      if (index < segments) array.set([scratch.x, scratch.y, scratch.z], index * 6);
      if (index > 0) array.set([scratch.x, scratch.y, scratch.z], (index - 1) * 6 + 3);
    }
    buffer.needsUpdate = true;
  };

  return { line, material, draw, dispose: () => { geometry.dispose(); material.dispose(); } };
}

/** A path through points, smoothed by a centripetal Catmull-Rom curve. */
export function smoothPath(points: THREE.Vector3[]): PathFn {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  return (s, target) => curve.getPoint(Math.min(1, Math.max(0, s)), target);
}

/** A cubic Bézier path. */
export function bezierPath(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): PathFn {
  const curve = new THREE.CubicBezierCurve3(a, b, c, d);
  return (s, target) => curve.getPoint(Math.min(1, Math.max(0, s)), target);
}
