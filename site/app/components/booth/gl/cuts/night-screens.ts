import { cropPlane, loadShotTexture, mark, THREE, type Mark, type ShotId } from "../kit";
import { project } from "./night-corridor";
import { DAWN_DRAWERS } from "./night-data";
import { createSoftRect, createSweep, type Point } from "./night-gl";
import { track } from "./night-type";

/** The gallery arc every drawer stands on: its pivot (where the camera stands), radius and slot spacing. */
export const ARC = { pivot: new THREE.Vector3(0, 0, 20), radius: 20, step: THREE.MathUtils.degToRad(55), frameOffset: THREE.MathUtils.degToRad(14.4) };

/** The row the four dawn drawers snap into, seen from the arc pivot. */
export const ROW = { yaw: THREE.MathUtils.degToRad(220), distance: 28.5, gap: 2.2, drop: -0.4 };

/** Beats of the real-screen shots. */
export const SCREENS = { rise: 32.0, risen: 34.6, lift: 34.9, lifted: 35.9, sweep: 35.7, dawn: 39.3, beat: 2.5, snap: 49.0, snapped: 49.7, recede: 51.0, receded: 52.1 };

const DRAWER_WIDTH = 5.2;
const LIFT_PADDING = { x: 14, y: 6 };

/** Look direction for a yaw around the vertical axis (0 looks down −z, positive turns right). */
export function yawDirection(yaw: number): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
}

/** Arc slot angle of the n-th drawer (0 is the Sales Director's). */
export function slotYaw(slot: number): number {
  return slot * ARC.step;
}

/** Camera yaw that frames the drawer in `slot` on the right half of the stage. */
export function framingYaw(slot: number): number {
  return slotYaw(slot) - ARC.frameOffset;
}

function slotPosition(yaw: number, radius = ARC.radius): THREE.Vector3 {
  return ARC.pivot.clone().addScaledVector(yawDirection(yaw), radius);
}

function rowPosition(index: number, count: number, distance: number): THREE.Vector3 {
  const right = new THREE.Vector3(Math.cos(ROW.yaw), 0, Math.sin(ROW.yaw));
  const offset = (index - (count - 1) / 2) * (DRAWER_WIDTH + ROW.gap);
  return slotPosition(ROW.yaw, distance).addScaledVector(right, offset).add(new THREE.Vector3(0, ROW.drop, 0));
}

function regionOnDrawer(drawer: Mark, region: Mark): { x: number; y: number } {
  const scale = DRAWER_WIDTH / drawer.w;
  return { x: (region.x + region.w / 2 - (drawer.x + drawer.w / 2)) * scale, y: (drawer.y + drawer.h / 2 - (region.y + region.h / 2)) * scale };
}

type Lifted = { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; shadow: ReturnType<typeof createSoftRect>; sweep: ReturnType<typeof createSweep>; rest: { x: number; y: number } };

function padded(region: Mark, x: number, y: number): Mark {
  return { ...region, x: region.x - x, y: region.y - y, w: region.w + x * 2, h: region.h + y * 2 };
}

function lifted(texture: THREE.Texture, drawer: Mark, tight: Mark, parent: THREE.Object3D): Lifted {
  const region = padded(tight, LIFT_PADDING.x, LIFT_PADDING.y);
  const width = (region.w / drawer.w) * DRAWER_WIDTH;
  const mesh = cropPlane(texture, region, width);
  const height = mesh.geometry.parameters.height;
  const shadow = createSoftRect(width, height, 0.5, "#0b0620");
  const sweep = createSweep(width, height);
  sweep.mesh.position.z = 0.004;
  mesh.add(sweep.mesh);
  parent.add(shadow.mesh, mesh);
  return { mesh, shadow, sweep, rest: regionOnDrawer(drawer, region) };
}

type Drawer = { group: THREE.Group; plane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; glow: ReturnType<typeof createSoftRect>; sweep: ReturnType<typeof createSweep>; texture: THREE.Texture; next: { x: number; y: number }; height: number };

async function drawer(renderer: THREE.WebGLRenderer, shot: ShotId): Promise<Drawer> {
  const texture = await loadShotTexture(renderer, shot);
  const region = mark(shot, "drawer");
  const plane = cropPlane(texture, region, DRAWER_WIDTH);
  if (plane.material.map) renderer.initTexture(plane.material.map);
  const glow = createSoftRect(DRAWER_WIDTH, plane.geometry.parameters.height, 2.4, "#a78bfa", true);
  glow.mesh.position.z = -0.05;
  const nextRegion = mark(shot, "next");
  const next = regionOnDrawer(region, nextRegion);
  const scale = DRAWER_WIDTH / region.w;
  const sweep = createSweep(nextRegion.w * scale, nextRegion.h * scale);
  sweep.mesh.position.set(next.x, next.y, 0.01);
  const group = new THREE.Group();
  group.add(glow.mesh, plane, sweep.mesh);
  return { group, plane, glow, sweep, texture, next, height: plane.geometry.parameters.height };
}

type Screens = { update: (t: number) => void; threadPoints: (camera: THREE.PerspectiveCamera) => Point[]; rowFeet: (camera: THREE.PerspectiveCamera) => Point[]; dispose: () => void };

/** The real captured screens: the Sales Director's drawer with its lifted card rows, and the four dawn drawers on the arc. */
export async function buildScreens(renderer: THREE.WebGLRenderer, world: THREE.Scene, timeline: gsap.core.Timeline): Promise<Screens> {
  const story = await drawer(renderer, "story");
  const storyRegion = mark("story", "drawer");
  const header = lifted(story.texture, storyRegion, mark("story", "header"), story.group);
  const bars = lifted(story.texture, storyRegion, mark("story", "topBars"), story.group);
  [header, bars].forEach((piece) => {
    if (piece.mesh.material.map) renderer.initTexture(piece.mesh.material.map);
  });
  const dawn = await Promise.all(DAWN_DRAWERS.map((entry) => drawer(renderer, entry.shot)));
  world.add(story.group, ...dawn.map((entry) => entry.group));

  const storyState = { rise: 0, lift: 0, sweepBars: -0.4, sweepHeader: -0.4, dim: 0, out: 0 };
  track(timeline, storyState, "rise", [[0, 0], [SCREENS.rise, 0], [SCREENS.risen, 1, "power3.out"]]);
  track(timeline, storyState, "lift", [[0, 0], [SCREENS.lift, 0], [SCREENS.lifted, 1, "power3.inOut"]]);
  track(timeline, storyState, "sweepBars", [[0, -0.4], [SCREENS.sweep, -0.4], [SCREENS.sweep + 1.1, 1.5, "power1.inOut"]]);
  track(timeline, storyState, "sweepHeader", [[0, -0.4], [SCREENS.sweep + 0.35, -0.4], [SCREENS.sweep + 1.45, 1.5, "power1.inOut"]]);
  track(timeline, storyState, "dim", [[0, 0], [SCREENS.dawn, 0], [SCREENS.dawn + 0.8, 1, "power2.inOut"]]);
  track(timeline, storyState, "out", [[0, 0], [SCREENS.snap, 0], [SCREENS.snap + 0.5, 1, "power2.in"]]);

  const dawnStates = dawn.map((_, index) => {
    const state = { rise: 0, passed: 0, lineUp: 0, recede: 0, sweep: -0.4 };
    const start = SCREENS.dawn + index * SCREENS.beat;
    track(timeline, state, "sweep", [[0, -0.4], [start + 0.7, -0.4], [start + 1.8, 1.5, "power1.inOut"]]);
    track(timeline, state, "rise", [[0, 0], [start - 0.3, 0], [start + 0.9, 1, "power3.out"]]);
    if (index < dawn.length - 1) track(timeline, state, "passed", [[0, 0], [start + SCREENS.beat - 0.2, 0], [start + SCREENS.beat + 0.6, 1, "power2.inOut"]]);
    track(timeline, state, "lineUp", [[0, 0], [SCREENS.snap + index * 0.05, 0], [SCREENS.snapped + index * 0.05, 1, "expo.inOut"]]);
    track(timeline, state, "recede", [[0, 0], [SCREENS.recede, 0], [SCREENS.receded, 1, "power2.in"]]);
    return state;
  });

  const storySlot = slotPosition(slotYaw(0));
  const riseFrom = storySlot.clone().add(new THREE.Vector3(0, -9, -5));
  const slotPlace = new THREE.Vector3();
  const rowPlace = new THREE.Vector3();

  function placeStory() {
    const { rise, lift, dim, out } = storyState;
    story.group.position.lerpVectors(riseFrom, storySlot, rise);
    story.group.rotation.set(-1.15 * (1 - rise), -slotYaw(0), 0);
    story.group.scale.setScalar(0.45 + 0.55 * rise);
    const visible = Math.min(1, rise * 1.6) * (1 - 0.72 * dim) * (1 - out);
    story.group.visible = visible > 0.002;
    story.plane.material.opacity = visible;
    story.plane.material.color.setScalar(1 - 0.38 * lift);
    story.glow.set(0.55 * visible * (1 - dim));
    [header, bars].forEach((piece, index) => {
      const depth = index === 0 ? 1.2 : 3.2;
      const grow = index === 0 ? 0.1 : 0.55;
      piece.mesh.position.set(piece.rest.x - index * lift * 1.4, piece.rest.y, 0.02 + depth * lift);
      piece.mesh.scale.setScalar(1 + grow * lift);
      piece.mesh.material.opacity = visible;
      piece.mesh.visible = lift > 0.001 && visible > 0.002;
      piece.shadow.mesh.position.set(piece.mesh.position.x + 0.12, piece.mesh.position.y - 0.18, 0.015 + depth * lift * 0.5);
      piece.shadow.mesh.scale.setScalar(1 + grow * lift);
      piece.shadow.set(0.55 * lift * visible);
      piece.sweep.set(index === 0 ? storyState.sweepHeader : storyState.sweepBars, 0.9 * lift * visible);
    });
  }

  function placeDawn() {
    dawn.forEach((entry, index) => {
      const state = dawnStates[index];
      const yaw = slotYaw(index + 1);
      slotPlace.copy(slotPosition(yaw)).add(new THREE.Vector3(0, -13 * (1 - state.rise), 0));
      rowPlace.copy(rowPosition(index, dawn.length, ROW.distance + state.recede * 46));
      entry.group.position.lerpVectors(slotPlace, rowPlace, state.lineUp);
      entry.group.rotation.set(0.5 * (1 - state.rise), -THREE.MathUtils.lerp(yaw, ROW.yaw, state.lineUp), 0);
      const shown = Math.min(1, state.rise * 1.5) * (1 - 0.7 * state.passed * (1 - state.lineUp)) * (1 - state.recede);
      entry.group.visible = shown > 0.002;
      entry.plane.material.opacity = shown;
      entry.plane.material.color.setScalar(1 + state.recede * 1.8);
      entry.glow.set(0.5 * shown * (1 - 0.8 * state.passed * (1 - state.lineUp)));
      entry.sweep.set(state.sweep, 0.8 * shown * (1 - state.passed));
    });
  }

  return {
    update() {
      placeStory();
      placeDawn();
    },
    threadPoints(camera) {
      const points: Point[] = [];
      dawn.forEach((entry) => {
        entry.group.updateMatrixWorld();
        const half = DRAWER_WIDTH / 2;
        const left = entry.group.localToWorld(new THREE.Vector3(-half, entry.next.y, 0.05));
        const right = entry.group.localToWorld(new THREE.Vector3(half, entry.next.y, 0.05));
        points.push(project(left, camera), project(right, camera));
      });
      const [firstX, firstY] = points[0];
      const [lastX, lastY] = points[points.length - 1];
      return [[firstX - 150, firstY], ...points, [lastX + 110, lastY - 60]];
    },
    rowFeet(camera) {
      return dawn.map((entry) => {
        entry.group.updateMatrixWorld();
        return project(entry.group.localToWorld(new THREE.Vector3(0, -entry.height / 2, 0)), camera);
      });
    },
    dispose() {
      [story, ...dawn].forEach((entry) => {
        entry.group.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            const material = object.material as THREE.Material & { map?: THREE.Texture | null };
            material.map?.dispose();
            material.dispose();
          }
        });
        entry.texture.dispose();
      });
    },
  };
}
