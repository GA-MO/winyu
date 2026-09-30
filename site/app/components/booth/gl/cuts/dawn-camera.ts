import { THREE } from "../kit";

const FOV = 35;
const HALF_TAN = Math.tan((FOV / 2) * (Math.PI / 180));
const UP = new THREE.Vector3(0, 1, 0);

/** Field of view of the dawn camera, in degrees. */
export const DAWN_FOV = FOV;

/** Distance in front of the camera where HUD objects sit; one stage pixel there is `HUD_PX` world units. */
export const HUD_DEPTH = 20;

/** World units per stage pixel on the HUD plane. */
export const HUD_PX = (2 * HUD_DEPTH * HALF_TAN) / 1080;

/** An orbit camera: a target point, and where the camera sits around it. */
export type Pose = { az: number; el: number; dist: number; tx: number; ty: number; tz: number };

type Basis = { offset: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3 };

function basis(az: number, el: number): Basis {
  const offset = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  const forward = offset.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, UP).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  return { offset, right, up };
}

function pixelsPerUnit(dist: number): number {
  return 540 / (dist * HALF_TAN);
}

/** Puts the camera at a pose. */
export function applyPose(camera: THREE.PerspectiveCamera, pose: Pose): void {
  const { offset } = basis(pose.az, pose.el);
  camera.position.set(pose.tx, pose.ty, pose.tz).addScaledVector(offset, pose.dist);
  camera.up.copy(UP);
  camera.lookAt(pose.tx, pose.ty, pose.tz);
}

/** A pose that shows `point` at stage pixel `screen`, seen from azimuth `az`, elevation `el`, `dist` away. */
export function framing(point: THREE.Vector3, screen: readonly [number, number], az: number, el: number, dist: number): Pose {
  const { right, up } = basis(az, el);
  const scale = pixelsPerUnit(dist);
  const target = point.clone().addScaledVector(right, -(screen[0] - 960) / scale).addScaledVector(up, -(540 - screen[1]) / scale);
  return { az, el, dist, tx: target.x, ty: target.y, tz: target.z };
}

/** The world point that a pose shows at stage pixel `screen`, on the plane through its target. */
export function worldAt(pose: Pose, screen: readonly [number, number]): THREE.Vector3 {
  const { right, up } = basis(pose.az, pose.el);
  const scale = pixelsPerUnit(pose.dist);
  return new THREE.Vector3(pose.tx, pose.ty, pose.tz).addScaledVector(right, (screen[0] - 960) / scale).addScaledVector(up, (540 - screen[1]) / scale);
}

/** World units per stage pixel on a pose's target plane. */
export function unitsPerPixel(pose: Pose): number {
  return 1 / pixelsPerUnit(pose.dist);
}

/** The rotation a camera at this pose has, so a plane can face it. */
export function poseQuaternion(pose: Pose): THREE.Quaternion {
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 10);
  applyPose(camera, pose);
  return camera.quaternion.clone();
}

/** A stage pixel as a point on the HUD plane in camera space. */
export function hudPoint(x: number, y: number, depth = HUD_DEPTH): THREE.Vector3 {
  const scale = (depth / HUD_DEPTH) * HUD_PX;
  return new THREE.Vector3((x - 960) * scale, (540 - y) * scale, -depth);
}
