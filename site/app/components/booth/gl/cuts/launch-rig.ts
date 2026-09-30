import { SHOT_SIZE, THREE, type Mark, type ShotId } from "../kit";
import { createScreenCrop } from "./signal-materials";
import { createTracks, ease, type Viewport } from "./signal-rig";

export { createTracks, ease };

/** The named animation channels of the film. */
export type Tracks = ReturnType<typeof createTracks>;

/** The whole 1920×1080 stage as one viewport. */
export const STAGE: Viewport = { x: 0, w: 1920, h: 1080 };

const CARD_DEPTH = 10;

/** Clamps x into [0, 1]. */
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Linear blend from a to b by p. */
export function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** Where a placed card sits: its centre and width in stage pixels, its turn, how deep, and how visible. */
export type CardPose = { cx: number; cy: number; w: number; alpha: number; rotY?: number; rotX?: number; rotZ?: number; depth?: number };

/** A real captured screen region on a plane that can be placed anywhere on the stage. */
export type CardPlane = { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; region: Mark; place: (camera: THREE.PerspectiveCamera, pose: CardPose) => void };

/** Puts a mesh `worldWidth` units wide so its content spans `widthPx` stage pixels around (cx, cy), turned about its own centre, `depth` units in front of the camera. */
export function placeFacing(mesh: THREE.Object3D, camera: THREE.PerspectiveCamera, cx: number, cy: number, widthPx: number, worldWidth: number, depth = CARD_DEPTH, rotY = 0, rotX = 0, rotZ = 0): void {
  const ndc = new THREE.Vector3((cx / STAGE.w) * 2 - 1, 1 - (cy / STAGE.h) * 2, 0.5).unproject(camera);
  const ray = ndc.sub(camera.position).normalize();
  const forward = camera.getWorldDirection(new THREE.Vector3());
  mesh.position.copy(camera.position).addScaledVector(ray, depth / ray.dot(forward));
  const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, "YXZ"));
  mesh.quaternion.copy(camera.quaternion).multiply(turn);
  const worldPerPixel = (2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / STAGE.h;
  mesh.scale.setScalar((widthPx * worldPerPixel) / worldWidth);
}

/** Where a world point lands on the stage, in pixels. */
export function project(point: THREE.Vector3, camera: THREE.Camera): { x: number; y: number; depth: number } {
  const projected = point.clone().project(camera);
  return { x: ((projected.x + 1) / 2) * STAGE.w, y: ((1 - projected.y) / 2) * STAGE.h, depth: projected.z };
}

/** The stage pixels per world unit at `distance` from a camera of vertical field `fov` degrees. */
export function pixelsPerUnit(distance: number, fov: number): number {
  return STAGE.h / (2 * distance * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
}

/** Pads a measured region by `x` pixels left and right and `y` pixels top and bottom. */
export function padded(region: Mark, x: number, y = x): Mark {
  return { ...region, x: region.x - x, y: region.y - y, w: region.w + 2 * x, h: region.h + 2 * y };
}


/** Loads each captured screen once and cuts regions of it into small sharp textures, so the GPU never holds a whole 4K screen. */
export function createCropStore(renderer: THREE.WebGLRenderer) {
  const images = new Map<string, Promise<HTMLImageElement>>();
  const textures: THREE.Texture[] = [];
  const load = (src: string) => {
    const known = images.get(src);
    if (known) return known;
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    const loaded = image.decode().then(() => image);
    images.set(src, loaded);
    return loaded;
  };
  const cut = async (src: string, region: Mark): Promise<THREE.Texture> => {
    const image = await load(src);
    const scale = image.naturalWidth / SHOT_SIZE.width;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(region.w * scale);
    canvas.height = Math.round(region.h * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D context");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, region.x * scale, region.y * scale, region.w * scale, region.h * scale, 0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    renderer.initTexture(texture);
    textures.push(texture);
    return texture;
  };
  return {
    async plane(shot: { src: string }, region: Mark, radiusPx = 18): Promise<CardPlane> {
      const texture = await cut(shot.src, region);
      const mesh = createScreenCrop(texture, region, 1, radiusPx);
      mesh.material.uniforms.uOffset.value.set(0, 0);
      mesh.material.uniforms.uRepeat.value.set(1, 1);
      mesh.material.depthTest = false;
      mesh.renderOrder = 20;
      mesh.visible = false;
      return {
        mesh,
        region,
        place(camera, pose) {
          mesh.visible = pose.alpha > 0.003;
          if (!mesh.visible) return;
          mesh.userData.uniforms.uAlpha.value = pose.alpha;
          placeFacing(mesh, camera, pose.cx, pose.cy, pose.w, 1, pose.depth ?? CARD_DEPTH, pose.rotY ?? 0, pose.rotX ?? 0, pose.rotZ ?? 0);
        },
      };
    },
    dispose() {
      for (const texture of textures) texture.dispose();
    },
  };
}

/** The shared world every beat draws into: the scene, the camera, the type layer, the channels, and a store of screen crops. */
export type Stage = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  overlay: HTMLDivElement;
  tracks: Tracks;
  crops: ReturnType<typeof createCropStore>;
  shots: Record<ShotId, { src: string }>;
};

/** One beat of the film: it writes its channels, builds its pieces, and draws itself from the channels at any time. */
export type Beat = { draw: (time: number) => void };
