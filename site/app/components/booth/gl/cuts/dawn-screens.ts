import { cropPlane, mark, THREE, type Mark, type ShotId } from "../kit";
import { HUD_DEPTH, HUD_PX, hudPoint, poseQuaternion, unitsPerPixel, worldAt, type Pose } from "./dawn-camera";

const CORNER_PX = 22;
const STORY_PADDING = 12;
const PANEL_MAX_HEIGHT = 820;
const PANEL_MAX_WIDTH = 660;
const PANEL_MAX_SCALE = 1.6;
const FOLDED_ANGLE = -1.45;

const SWEEP_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SWEEP_FRAGMENT = /* glsl */ `
uniform float uSweep;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float band = vUv.x - (uSweep * 1.6 - 0.3) + (vUv.y - 0.5) * 0.25;
  float light = exp(-band * band * 90.0);
  gl_FragColor = vec4(vec3(1.0, 0.96, 1.0) * light * 0.45 * uOpacity, 1.0);
}`;

type Plane = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

/** A region of a captured screen widened by `pad` pixels on every side, kept inside the screen. */
export function padded(region: Mark, pad: number): Mark {
  const x = Math.max(0, region.x - pad);
  const y = Math.max(0, region.y - pad);
  return { x, y, w: Math.min(1920 - x, region.w + pad * 2), h: Math.min(1080 - y, region.h + pad * 2), text: region.text };
}

function roundedMask(aspect: number, radiusShare: number): THREE.CanvasTexture {
  const width = 512;
  const height = Math.max(8, Math.round(width / aspect));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D context");
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#fff";
  context.beginPath();
  context.roundRect(0, 0, width, height, radiusShare * width);
  context.fill();
  return new THREE.CanvasTexture(canvas);
}

function shadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D context");
  context.filter = "blur(22px)";
  context.fillStyle = "rgba(6,4,24,0.85)";
  context.beginPath();
  context.roundRect(48, 48, 160, 160, 16);
  context.fill();
  return new THREE.CanvasTexture(canvas);
}

function unitCrop(texture: THREE.Texture, region: Mark): Plane {
  const plane = cropPlane(texture, region, 1);
  plane.material.alphaMap = roundedMask(region.w / region.h, CORNER_PX / region.w);
  plane.material.depthWrite = false;
  return plane;
}

function shadowPlane(texture: THREE.Texture): Plane {
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, fog: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
}

function placeOnHud(plane: THREE.Object3D, x: number, y: number, widthPx: number, depth: number, aspect: number): void {
  plane.position.copy(hudPoint(x, y, depth));
  const width = widthPx * HUD_PX * (depth / HUD_DEPTH);
  plane.scale.set(width, width / aspect, 1);
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** How far the story screen has come on in shot 6. */
export type StoryState = { rise: number; lift: number; bars: number; sweep: number; exit: number };

/** The Sales Director's real morning drawer as floating layers: the screen, its drawer, and the top bars lifted out. */
export type StoryScreens = { update: (state: StoryState) => void; dispose: () => void };

/** Builds the shot-6 layers on the HUD. */
export function createStoryScreens(hud: THREE.Group, texture: THREE.Texture): StoryScreens {
  const group = new THREE.Group();
  hud.add(group);
  const next = mark("story", "next");
  const drawerRegion: Mark = { x: 1344, y: 0, w: 576, h: Math.min(1080, next.y + next.h + 18), text: "" };
  const barsRegion = padded(mark("story", "topBars"), 10);
  const full: Mark = { x: 0, y: 0, w: 1920, h: 1080, text: "" };

  const base = unitCrop(texture, full);
  const drawer = unitCrop(texture, drawerRegion);
  const bars = unitCrop(texture, barsRegion);
  const shadowMap = shadowTexture();
  const drawerShadow = shadowPlane(shadowMap);
  const barsShadow = shadowPlane(shadowMap);
  const sweepMaterial = new THREE.ShaderMaterial({
    vertexShader: SWEEP_VERTEX,
    fragmentShader: SWEEP_FRAGMENT,
    uniforms: { uSweep: { value: 0 }, uOpacity: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sweepMaterial);
  base.renderOrder = 1;
  drawerShadow.renderOrder = 2;
  drawer.renderOrder = 3;
  barsShadow.renderOrder = 4;
  bars.renderOrder = 5;
  sweep.renderOrder = 6;
  group.add(base, drawerShadow, drawer, barsShadow, bars, sweep);

  const BASE_WIDTH = 1480;
  const baseScale = BASE_WIDTH / 1920;
  const DRAWER_SCALE = 1.1;
  const drawerHome = { x: 960 + (drawerRegion.x + drawerRegion.w / 2 - 960) * baseScale, y: 540 + (drawerRegion.y + drawerRegion.h / 2 - 540) * baseScale };
  const drawerLifted = { x: 1400, y: 540 };
  const barsInDrawer = (drawerX: number, drawerY: number, scale: number) => ({
    x: drawerX + (barsRegion.x + barsRegion.w / 2 - (drawerRegion.x + drawerRegion.w / 2)) * scale,
    y: drawerY + (barsRegion.y + barsRegion.h / 2 - (drawerRegion.y + drawerRegion.h / 2)) * scale,
  });

  return {
    update({ rise, lift, bars: barsLevel, sweep: sweepLevel, exit }) {
      group.visible = rise > 0.001 && exit < 0.999;
      if (!group.visible) return;
      const exitShift = exit * exit * 900;
      const exitFade = 1 - exit;

      const baseY = lerp(1180, 540, rise) - exitShift;
      const baseDepth = HUD_DEPTH + lift * 7;
      placeOnHud(base, 960 - lift * 260, baseY, BASE_WIDTH * (1 + 0.1 * (1 - rise)), baseDepth, 1);
      base.rotation.set(-0.85 * (1 - rise), 0.32 * (1 - rise), 0.04 * (1 - rise));
      base.material.opacity = Math.min(1, rise * 1.6) * Math.max(0, 1 - lift * 1.7) * exitFade;
      base.material.color.setScalar(1 - 0.55 * lift);

      const drawerScale = lerp(baseScale, DRAWER_SCALE, lift);
      const drawerX = lerp(drawerHome.x, drawerLifted.x, lift);
      const drawerY = lerp(baseY + (drawerHome.y - 540), drawerLifted.y, lift) - exitShift * 0.2;
      const drawerDepth = HUD_DEPTH - lift * 1.2;
      const drawerOn = lift > 0.001 ? exitFade : 0;
      placeOnHud(drawer, drawerX, drawerY, drawerRegion.w * drawerScale, drawerDepth, 1);
      drawer.rotation.set(base.rotation.x, base.rotation.y, base.rotation.z);
      drawer.material.opacity = drawerOn;
      drawer.material.color.setScalar(1 - 0.1 * barsLevel);
      placeOnHud(drawerShadow, drawerX + 10, drawerY + 34, drawerRegion.w * drawerScale * 1.3, drawerDepth + 0.05, (drawerRegion.w * 1.3) / (drawerRegion.h * 1.12));
      drawerShadow.material.opacity = 0.9 * lift * exitFade;

      const home = barsInDrawer(drawerX, drawerY, drawerScale);
      const barsScale = drawerScale * lerp(1, 1.22, barsLevel);
      const barsDepth = drawerDepth - barsLevel * 1.6;
      const barsX = home.x - barsLevel * 40;
      const barsY = home.y - barsLevel * 12;
      placeOnHud(bars, barsX, barsY, barsRegion.w * barsScale, barsDepth, 1);
      bars.material.opacity = barsLevel > 0.001 ? exitFade : 0;
      placeOnHud(barsShadow, barsX + 6, barsY + 26, barsRegion.w * barsScale * 1.25, barsDepth + 0.05, (barsRegion.w * 1.25) / (barsRegion.h * 2.2));
      barsShadow.material.opacity = 0.85 * barsLevel * exitFade;
      placeOnHud(sweep, barsX, barsY, barsRegion.w * barsScale, barsDepth - 0.01, barsRegion.w / barsRegion.h);
      sweepMaterial.uniforms.uSweep.value = sweepLevel;
      sweepMaterial.uniforms.uOpacity.value = sweepLevel > 0 && sweepLevel < 1 ? exitFade : 0;
    },
    dispose() {
      for (const plane of [base, drawer, bars, drawerShadow, barsShadow]) {
        plane.geometry.dispose();
        plane.material.alphaMap?.dispose();
        if (plane.material.map !== texture) plane.material.map?.dispose();
        plane.material.dispose();
      }
      shadowMap.dispose();
      sweep.geometry.dispose();
      sweepMaterial.dispose();
    },
  };
}

/** One role's real drawer hanging beside its node, hinged on its left edge. */
export type StopPanel = { update: (open: number, fade: number) => void; dispose: () => void };

/** Builds the drawer panel of `shot`, placed so the pose shows its hinge at stage pixel `hinge`. */
export function createStopPanel(scene: THREE.Scene, texture: THREE.Texture, shot: ShotId, pose: Pose, hinge: readonly [number, number]): StopPanel {
  const story = mark(shot, "story");
  const next = mark(shot, "next");
  const region = padded({ x: story.x, y: story.y, w: story.w, h: next.y + next.h - story.y, text: "" }, STORY_PADDING);
  const scale = Math.min(PANEL_MAX_HEIGHT / region.h, PANEL_MAX_WIDTH / region.w, PANEL_MAX_SCALE);
  const unit = unitsPerPixel(pose);
  const width = region.w * scale * unit;
  const height = region.h * scale * unit;

  const pivot = new THREE.Group();
  pivot.position.copy(worldAt(pose, hinge));
  const facing = poseQuaternion(pose);
  const panel = unitCrop(texture, region);
  panel.scale.set(width, width, 1);
  panel.position.set(width / 2, 0, 0);
  panel.material.depthTest = false;
  panel.renderOrder = 20;
  const shadowMap = shadowTexture();
  const shadow = shadowPlane(shadowMap);
  shadow.scale.set(width * 1.35, height * 1.18, 1);
  shadow.position.set(width / 2 + width * 0.03, -height * 0.035, -0.05);
  shadow.material.depthTest = false;
  shadow.renderOrder = 19;
  pivot.add(shadow, panel);
  scene.add(pivot);
  const turn = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 1, 0);

  return {
    update(open, fade) {
      pivot.visible = open > 0.001 && fade > 0.001;
      if (!pivot.visible) return;
      turn.setFromAxisAngle(axis, lerp(FOLDED_ANGLE, 0, open));
      pivot.quaternion.copy(facing).multiply(turn);
      panel.material.opacity = Math.min(1, open * 1.8) * fade;
      shadow.material.opacity = 0.75 * open * fade;
    },
    dispose() {
      panel.geometry.dispose();
      panel.material.alphaMap?.dispose();
      panel.material.map?.dispose();
      panel.material.dispose();
      shadow.geometry.dispose();
      shadow.material.dispose();
      shadowMap.dispose();
    },
  };
}
