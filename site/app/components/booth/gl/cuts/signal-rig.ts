import { THREE, gsap, masterTimeline } from "../kit";

/** A camera orbiting the sphere centre: azimuth, elevation and radius, a look-at target, and a pixel shift of the frame. */
export type Pose = { az: number; el: number; r: number; tx: number; ty: number; tz: number; sx: number; sy: number };

/** A region of the 1920×1080 stage a camera draws into, in pixels from the top left. */
export type Viewport = { x: number; w: number; h: number };

const POSE_KEYS = ["az", "el", "r", "tx", "ty", "tz", "sx", "sy"] as const;

/** A pose that puts the camera at `position` looking at `target`, with the target drawn `sx`,`sy` pixels off centre. */
export function poseLooking(position: THREE.Vector3, target: THREE.Vector3, sx = 0, sy = 0): Pose {
  const r = position.length();
  return { az: Math.atan2(position.x, position.z), el: Math.asin(position.y / r), r, tx: target.x, ty: target.y, tz: target.z, sx, sy };
}

/** A pose on the orbit through `direction` turned by `turnAz`/`turnEl` radians, `radius` from the centre, looking at `target`. */
export function poseOrbit(direction: THREE.Vector3, turnAz: number, turnEl: number, radius: number, target: THREE.Vector3, sx = 0, sy = 0): Pose {
  const unit = direction.clone().normalize();
  return { az: Math.atan2(unit.x, unit.z) + turnAz, el: Math.asin(unit.y) + turnEl, r: radius, tx: target.x, ty: target.y, tz: target.z, sx, sy };
}

/** Puts a camera at a pose for a viewport of `w`×`h` pixels. */
export function applyPose(camera: THREE.PerspectiveCamera, pose: Pose, w: number, h: number): void {
  const flat = Math.cos(pose.el);
  camera.position.set(pose.r * flat * Math.sin(pose.az), pose.r * Math.sin(pose.el), pose.r * flat * Math.cos(pose.az));
  camera.up.set(0, 1, 0);
  camera.lookAt(pose.tx, pose.ty, pose.tz);
  camera.aspect = w / h;
  camera.setViewOffset(w, h, -pose.sx, -pose.sy, w, h);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

/** Where a world point lands on the stage, in pixels, for a camera drawing into `viewport`. */
export function toStage(point: THREE.Vector3, camera: THREE.Camera, viewport: Viewport): { x: number; y: number; front: boolean } {
  const projected = point.clone().project(camera);
  return { x: viewport.x + ((projected.x + 1) / 2) * viewport.w, y: ((1 - projected.y) / 2) * viewport.h, front: projected.z < 1 };
}

/** Places a plane `regionWidth` world units wide so it covers `widthPx` stage pixels centred at (cx, cy), `depth` units in front of the camera. */
export function placeOnStage(mesh: THREE.Object3D, camera: THREE.PerspectiveCamera, viewport: Viewport, cx: number, cy: number, widthPx: number, depth: number, regionWidth: number, tilt = 0): void {
  const ndc = new THREE.Vector3(((cx - viewport.x) / viewport.w) * 2 - 1, 1 - (cy / viewport.h) * 2, 0.5).unproject(camera);
  const ray = ndc.sub(camera.position).normalize();
  const forward = camera.getWorldDirection(new THREE.Vector3());
  mesh.position.copy(camera.position).addScaledVector(ray, depth / ray.dot(forward));
  mesh.quaternion.copy(camera.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tilt));
  const worldPerPixel = (2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / viewport.h;
  mesh.scale.setScalar((widthPx * worldPerPixel) / regionWidth);
}

/** Named animation channels on one paused master timeline; each channel is tweened in time order from its previous value. */
export function createTracks(duration: number) {
  const timeline = masterTimeline(duration);
  const values: Record<string, number> = {};
  const settled: Record<string, { value: number; until: number }> = {};
  const define = (key: string, initial: number) => {
    values[key] = initial;
    settled[key] = { value: initial, until: 0 };
  };
  const to = (key: string, value: number, at: number, length: number, ease = "power3.inOut") => {
    if (!(key in values)) define(key, 0);
    const previous = settled[key];
    if (at < previous.until - 1e-6) throw new Error(`Channel ${key} tweened at ${at} before ${previous.until}`);
    timeline.fromTo(values, { [key]: previous.value }, { [key]: value, duration: length, ease, immediateRender: false, lazy: false }, at);
    settled[key] = { value, until: at + length };
  };
  const get = (key: string) => values[key] ?? 0;
  const pose = (prefix: string): Pose => {
    const read = (name: (typeof POSE_KEYS)[number]) => get(`${prefix}.${name}`);
    return { az: read("az"), el: read("el"), r: read("r"), tx: read("tx"), ty: read("ty"), tz: read("tz"), sx: read("sx"), sy: read("sy") };
  };
  const definePose = (prefix: string, initial: Pose) => {
    for (const name of POSE_KEYS) define(`${prefix}.${name}`, initial[name]);
  };
  const poseTo = (prefix: string, target: Pose, at: number, length: number, ease = "power3.inOut") => {
    const lastAz = settled[`${prefix}.az`].value;
    const turns = Math.round((lastAz - target.az) / (Math.PI * 2));
    const unwrapped = { ...target, az: target.az + turns * Math.PI * 2 };
    for (const name of POSE_KEYS) to(`${prefix}.${name}`, unwrapped[name], at, length, ease);
  };
  const seek = (t: number) => timeline.seek(t, false);
  const kill = () => timeline.kill();
  return { define, to, get, pose, definePose, poseTo, seek, kill };
}

/** The easing curve GSAP uses under a name, for values computed outside the timeline. */
export function ease(name: string): (x: number) => number {
  return gsap.parseEase(name);
}
