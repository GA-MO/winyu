import gsap from "gsap";
import { BloomEffect, EffectComposer, EffectPass, NoiseEffect, RenderPass, VignetteEffect, BlendFunction } from "postprocessing";
import * as THREE from "three";
import FACTS from "~/data/booth-facts.json";
import MANIFEST from "~/data/booth-shots.json";
import { STAGE_HEIGHT, STAGE_WIDTH } from "../sequence";

export { FACTS, gsap, THREE };

/** Brand colours of the Winyu site: primary indigo, violet, coral. */
export const BRAND = { indigo: "#4f46e5", violet: "#7c3aed", coral: "#fb7185", ink: "#0b0c14", paper: "#f7f7fb" } as const;

/** The CSS gradient every Winyu mark and accent uses. */
export const BRAND_GRADIENT = `linear-gradient(135deg, ${BRAND.indigo}, ${BRAND.violet} 55%, ${BRAND.coral})`;

/** The W sparkline of the logo in its 64×64 box; the last point carries the dot. */
export const SPARK_POINTS: readonly [number, number][] = [[9, 20], [20, 47], [32, 28], [44, 47], [55, 13]];

export type ShotId = keyof typeof MANIFEST.shots;
export type Mark = { x: number; y: number; w: number; h: number; text: string };
type Shot = { src: string; role: string; marks: Record<string, Mark> };

const SHOTS = MANIFEST.shots as Record<ShotId, Shot>;

/** The captured screen size every mark is measured in. */
export const SHOT_SIZE = { width: MANIFEST.width, height: MANIFEST.height };

/** A captured real screen: its image, the role it was taken as, and its measured regions. */
export function shotInfo(id: ShotId): Shot {
  return SHOTS[id];
}

/** One measured region of a captured screen, e.g. `mark("story", "finding")`. */
export function mark(id: ShotId, name: string): Mark {
  const found = SHOTS[id].marks[name];
  if (!found) throw new Error(`No mark ${id}:${name}`);
  return found;
}

/** A seeded random source, so particles land in the same place on every render. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** A renderer that draws the stage at exactly 1920×1080 and keeps the frame for the screenshot. */
export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(STAGE_WIDTH, STAGE_HEIGHT, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

/** A stage-sized perspective camera. */
export function createCamera(fov = 35): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(fov, STAGE_WIDTH / STAGE_HEIGHT, 0.1, 400);
}

type Post = { bloom?: { intensity: number; threshold?: number; radius?: number }; vignette?: number; grain?: number };

/** Render pass plus one effect pass: bloom that only catches HDR glow (threshold 1), a vignette and still film grain. */
export function createComposer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, post: Post = {}): EffectComposer {
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 4 });
  composer.addPass(new RenderPass(scene, camera));
  const effects = [];
  if (post.bloom) effects.push(new BloomEffect({ intensity: post.bloom.intensity, luminanceThreshold: post.bloom.threshold ?? 1, luminanceSmoothing: 0.2, mipmapBlur: true, radius: post.bloom.radius ?? 0.7 }));
  if (post.vignette) effects.push(new VignetteEffect({ darkness: post.vignette, offset: 0.3 }));
  if (post.grain) {
    const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
    grain.blendMode.opacity.value = post.grain;
    effects.push(grain);
  }
  if (effects.length > 0) composer.addPass(new EffectPass(camera, ...effects));
  return composer;
}

/** Loads a captured screen as a sharp texture: sRGB, mipmapped, full anisotropy. */
export async function loadShotTexture(renderer: THREE.WebGLRenderer, id: ShotId): Promise<THREE.Texture> {
  const texture = await new THREE.TextureLoader().loadAsync(SHOTS[id].src);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  renderer.initTexture(texture);
  return texture;
}

/** A flat plane showing a captured screen at `width` world units wide, unaffected by fog, tone mapping or lights. */
export function shotPlane(texture: THREE.Texture, width: number): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const height = (width * SHOT_SIZE.height) / SHOT_SIZE.width;
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: false, transparent: true });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
}

/** A plane showing only one region of a captured screen, sized `width` world units wide. */
export function cropPlane(texture: THREE.Texture, region: Mark, width: number): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const crop = texture.clone();
  crop.repeat.set(region.w / SHOT_SIZE.width, region.h / SHOT_SIZE.height);
  crop.offset.set(region.x / SHOT_SIZE.width, 1 - (region.y + region.h) / SHOT_SIZE.height);
  crop.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({ map: crop, toneMapped: false, fog: false, transparent: true });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, (width * region.h) / region.w), material);
}

/** Where a region's centre sits on a `shotPlane` of `width` world units, in the plane's local space. */
export function markOnPlane(region: Mark, width: number): { x: number; y: number; w: number; h: number } {
  const scale = width / SHOT_SIZE.width;
  return {
    x: (region.x + region.w / 2 - SHOT_SIZE.width / 2) * scale,
    y: (SHOT_SIZE.height / 2 - region.y - region.h / 2) * scale,
    w: region.w * scale,
    h: region.h * scale,
  };
}

/** A paused GSAP timeline pinned to `duration`, so seeking to t and to t + duration look the same. */
export function masterTimeline(duration: number): gsap.core.Timeline {
  const timeline = gsap.timeline({ paused: true, defaults: { ease: "power3.inOut" } });
  timeline.set({}, {}, duration);
  return timeline;
}

/** Thai text split into words (Thai has no spaces), for word-by-word type animation that never breaks stacked marks. */
export function thaiWords(text: string): string[] {
  const segmenter = new Intl.Segmenter("th", { granularity: "word" });
  return [...segmenter.segment(text)].map((part) => part.segment);
}

/** Creates an element in the type layer with inline styles; the overlay is plain DOM that GSAP animates. */
export function overlayElement(parent: HTMLElement, style: Partial<CSSStyleDeclaration>, text?: string): HTMLDivElement {
  const element = document.createElement("div");
  Object.assign(element.style, { position: "absolute", ...style });
  if (text !== undefined) element.textContent = text;
  parent.append(element);
  return element;
}

/** Every role title of the 26 people Winyu investigated for, keyed by user id. */
export function roleTitle(userId: string): string {
  const found = FACTS.roles.find((person) => person.userId === userId);
  if (!found) throw new Error(`No role ${userId}`);
  return found.role;
}
