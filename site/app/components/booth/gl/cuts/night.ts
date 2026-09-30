import { BlendFunction, BloomEffect, EffectComposer, EffectPass, NoiseEffect, RenderPass, VignetteEffect } from "postprocessing";
import { glStage } from "../stage";
import { createCamera, createRenderer, masterTimeline, seededRandom, THREE } from "../kit";
import type { FilmHost } from "../film";
import { buildCorridor, CONVERGE, CORRIDOR, corridorZ, LAST_RUN_INDEX } from "./night-corridor";
import { createGlowDot, createRibbon, createSky, createStars, hudCamera, type Point } from "./night-gl";
import { buildHud, HUD_BEATS } from "./night-hud";
import { ARC, buildScreens, framingYaw, ROW, SCREENS, yawDirection } from "./night-screens";
import { buildTitles, ORBIT, TITLES } from "./night-titles";
import { FONT, track, type Key } from "./night-type";

/** Loop length of the night cut, in seconds. */
export const NIGHT_SECONDS = 60;

const FOV = 35;
const PIXEL_SCALE = 1080 / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
const LOOK_AHEAD = 30;
const FONT_PROBES = ['600 72px "Noto Sans Thai"', '700 72px "Noto Sans Thai"', '500 40px "Noto Sans Thai"', '600 72px "Inter"', '700 72px "Inter"'];

type Sky = { top: string; bottom: string; horizon: string; flood: number; glow: string; glowX: number; glowY: number; glowSize: number };

const SKIES: Sky[] = [
  { top: "#020312", bottom: "#070822", horizon: "#070822", flood: 0, glow: "#14124a", glowX: 0.72, glowY: 0.6, glowSize: 0.5 },
  { top: "#0a0724", bottom: "#2a1466", horizon: "#4c1d95", flood: 0.28, glow: "#3a1a80", glowX: 0.5, glowY: 0.42, glowSize: 0.6 },
  { top: "#120a36", bottom: "#4a1f96", horizon: "#f0607e", flood: 0.42, glow: "#4a1846", glowX: 0.5, glowY: 0.05, glowSize: 0.6 },
  { top: "#1a0d45", bottom: "#6b2382", horizon: "#e35d8a", flood: 0.5, glow: "#8a2f6e", glowX: 0.5, glowY: 0.62, glowSize: 0.38 },
];

type Pose = { at: number; position: [number, number, number]; target: [number, number, number]; ease?: string };

function arcTarget(yaw: number, distance = ARC.radius): [number, number, number] {
  return ARC.pivot.clone().addScaledVector(yawDirection(yaw), distance).toArray() as [number, number, number];
}

function cameraPoses(): Pose[] {
  const start = corridorZ(0) + CORRIDOR.cameraLead;
  const end = corridorZ(LAST_RUN_INDEX) + CORRIDOR.cameraLead;
  const pivot = ARC.pivot.toArray() as [number, number, number];
  const origin: [number, number, number] = [0, 0, 0];
  const poses: Pose[] = [
    { at: 0, position: [0, 0.5, start + 5.5], target: [0, 0, start + 5.5 - LOOK_AHEAD] },
    { at: CORRIDOR.clockStart, position: [0, 0, start], target: [0, 0, start - LOOK_AHEAD], ease: "sine.inOut" },
    { at: CORRIDOR.clockEnd, position: [0, 0, end], target: [0, 0, end - LOOK_AHEAD], ease: CORRIDOR.clockEase },
    { at: 14.2, position: [0, 0, 40], target: origin, ease: "expo.out" },
    { at: CONVERGE.impact, position: [0, 0, 36.5], target: origin, ease: "none" },
    { at: 19.0, position: [0, 0, 36.5], target: origin },
    { at: 25.5, position: [12, 3.5, 28], target: origin, ease: "sine.in" },
    { at: SCREENS.rise, position: [18, 6, 16], target: origin, ease: "sine.out" },
    { at: 35.8, position: pivot, target: arcTarget(framingYaw(0)), ease: "power3.inOut" },
  ];
  [1, 2, 3, 4].forEach((slot) => {
    const beat = SCREENS.dawn + (slot - 1) * SCREENS.beat;
    poses.push({ at: beat - 0.35, position: pivot, target: arcTarget(framingYaw(slot - 1)) });
    poses.push({ at: beat + 0.55, position: pivot, target: arcTarget(framingYaw(slot)), ease: "power3.inOut" });
  });
  poses.push({ at: SCREENS.snap, position: pivot, target: arcTarget(framingYaw(4)) });
  poses.push({ at: SCREENS.snapped, position: pivot, target: arcTarget(ROW.yaw, ROW.distance), ease: "expo.inOut" });
  poses.push({ at: 57.4, position: pivot, target: arcTarget(ROW.yaw, ROW.distance) });
  poses.push({ at: 57.41, position: poses[0].position, target: poses[0].target, ease: "none" });
  return poses;
}

function trackPoses(timeline: gsap.core.Timeline, rig: Record<"px" | "py" | "pz" | "tx" | "ty" | "tz", number>, poses: Pose[]) {
  const props = ["px", "py", "pz", "tx", "ty", "tz"] as const;
  props.forEach((prop, index) => {
    const keys: Key[] = poses.map((pose) => [pose.at, index < 3 ? pose.position[index] : pose.target[index - 3], pose.ease]);
    track(timeline, rig, prop, keys);
  });
}

function skyAt(phase: number): Sky {
  const from = SKIES[Math.min(SKIES.length - 1, Math.floor(phase))];
  const to = SKIES[Math.min(SKIES.length - 1, Math.floor(phase) + 1)];
  const mix = phase - Math.floor(phase);
  const lerpHex = (a: string, b: string) => `#${new THREE.Color(a).lerp(new THREE.Color(b), mix).getHexString()}`;
  return {
    top: lerpHex(from.top, to.top),
    bottom: lerpHex(from.bottom, to.bottom),
    horizon: lerpHex(from.horizon, to.horizon),
    flood: THREE.MathUtils.lerp(from.flood, to.flood, mix),
    glow: lerpHex(from.glow, to.glow),
    glowX: THREE.MathUtils.lerp(from.glowX, to.glowX, mix),
    glowY: THREE.MathUtils.lerp(from.glowY, to.glowY, mix),
    glowSize: THREE.MathUtils.lerp(from.glowSize, to.glowSize, mix),
  };
}

function linearSky(phase: number) {
  const sky = skyAt(phase);
  return { top: new THREE.Color(sky.top), bottom: new THREE.Color(sky.bottom), horizon: new THREE.Color(sky.horizon), flood: sky.flood, glow: new THREE.Color(sky.glow), glowX: sky.glowX, glowY: sky.glowY, glowSize: sky.glowSize };
}

async function fontsReady() {
  await Promise.all(FONT_PROBES.map((probe) => document.fonts.load(probe, "กW0")));
  await document.fonts.ready;
}

function createPost(renderer: THREE.WebGLRenderer, world: THREE.Scene, hud: THREE.Scene, camera: THREE.PerspectiveCamera, flat: THREE.OrthographicCamera) {
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 4 });
  composer.addPass(new RenderPass(world, camera));
  const overlay = new RenderPass(hud, flat);
  overlay.clearPass.enabled = false;
  overlay.ignoreBackground = true;
  composer.addPass(overlay);
  const bloom = new BloomEffect({ intensity: 1.1, luminanceThreshold: 1, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.72 });
  const vignette = new VignetteEffect({ darkness: 0.42, offset: 0.32 });
  const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
  grain.blendMode.opacity.value = 0.05;
  const effects = new EffectPass(camera, bloom, vignette, grain);
  composer.addPass(effects);
  return { composer, bloom };
}

async function createNight(host: FilmHost) {
  await fontsReady();
  const renderer = createRenderer(host.canvas);
  const world = new THREE.Scene();
  const hud = new THREE.Scene();
  const camera = createCamera(FOV);
  const flat = hudCamera();
  const { composer, bloom } = createPost(renderer, world, hud, camera, flat);
  const timeline = masterTimeline(NIGHT_SECONDS);
  host.overlay.style.fontFamily = FONT;

  const sky = createSky();
  const stars = createStars(2400, { min: new THREE.Vector3(-110, -60, -110), max: new THREE.Vector3(110, 60, 250) }, seededRandom(77), "#dcd8ff");
  world.add(sky.mesh, stars.points);
  const corridor = buildCorridor(world, hud, timeline, PIXEL_SCALE);
  const screens = await buildScreens(renderer, world, timeline);
  const graphics = buildHud(hud, timeline);
  const titles = buildTitles(host.overlay, timeline);

  const ring = createRibbon(200, ["#ffd6de", "#c4b5fd", "#ffd6de"], [0.5, 1]);
  const ringDots = titles.orbitDots().map(() => createGlowDot("#ffe1e8", 40));
  hud.add(ring.mesh, ...ringDots.map((dot) => dot.mesh));
  const ringPath: Point[] = Array.from({ length: 200 }, (_, step) => {
    const angle = (step / 199) * Math.PI * 2;
    return [ORBIT.x + Math.cos(angle) * ORBIT.rx, ORBIT.y + Math.sin(angle) * ORBIT.ry];
  });
  ring.setPath(ringPath);

  const rig = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0 };
  trackPoses(timeline, rig, cameraPoses());
  const look = { phase: 0, stars: 1, bloom: 1.1, ring: 0 };
  track(timeline, look, "phase", [[0, 0], [31.4, 0], [34.2, 1, "sine.inOut"], [SCREENS.dawn - 0.3, 1], [SCREENS.dawn + 2.2, 2, "sine.inOut"], [SCREENS.recede, 2], [SCREENS.receded, 3, "sine.inOut"], [HUD_BEATS.unbend - 0.2, 3], [58.2, 1.4, "sine.in"], [59.5, 0, "sine.out"]]);
  track(timeline, look, "stars", [[0, 1], [SCREENS.dawn, 1], [SCREENS.dawn + 2, 0.2, "power2.inOut"], [SCREENS.recede, 0.2], [SCREENS.receded, 0, "power2.in"], [57.6, 0], [59.5, 1, "sine.inOut"]]);
  track(timeline, look, "bloom", [[0, 1.1], [CONVERGE.pull, 1.1], [CONVERGE.impact - 0.01, 2.6, "power2.in"], [CONVERGE.impact, 1.7, "none"], [CONVERGE.fade, 1.1, "power2.out"], [SCREENS.recede, 1.1], [SCREENS.receded, 1.5], [TITLES.logoOut, 1.5], [58.5, 1.1]]);
  track(timeline, look, "ring", [[0, 0], [CONVERGE.impact + 0.45, 0], [CONVERGE.impact + 1.3, 1, "power2.inOut"], [CONVERGE.fade - 0.2, 1], [CONVERGE.gone, 0, "power2.in"]]);

  await renderer.compileAsync(world, camera);
  const target = new THREE.Vector3();
  const thread = () => screens.threadPoints(camera);

  function placeCamera(t: number) {
    const sway = t > CORRIDOR.clockStart && t < 14.4 ? Math.sin((t - CORRIDOR.clockStart) * 0.8) * Math.sin(Math.PI * Math.min(1, (t - CORRIDOR.clockStart) / (14.4 - CORRIDOR.clockStart))) : 0;
    camera.position.set(rig.px + sway * 0.9, rig.py + sway * 0.4, rig.pz);
    target.set(rig.tx - sway * 0.6, rig.ty, rig.tz);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  function drawRing() {
    ring.style({ width: 1.5, intensity: 0.9, opacity: 0.32 * look.ring });
    ring.reveal(0, look.ring);
    titles.orbitDots().forEach((dot, index) => ringDots[index].set(dot.x, dot.y, 4, 16, 2.4 * dot.o));
  }

  return {
    render(t: number) {
      const time = ((t % NIGHT_SECONDS) + NIGHT_SECONDS) % NIGHT_SECONDS;
      timeline.seek(time, false);
      placeCamera(time);
      sky.set(linearSky(look.phase));
      stars.set(time, look.stars);
      bloom.intensity = look.bloom;
      corridor.update(time, camera);
      screens.update(time);
      graphics.update(time, thread);
      titles.update(time, () => screens.rowFeet(camera));
      drawRing();
      composer.render(0);
    },
    dispose() {
      corridor.dispose();
      screens.dispose();
      graphics.dispose();
      [sky.mesh, stars.points, ring.mesh, ...ringDots.map((dot) => dot.mesh)].forEach((object) => {
        object.geometry.dispose();
        object.material.dispose();
      });
      composer.dispose();
      renderer.dispose();
    },
  };
}

/** Night shift: while the company sleeps Winyu investigates for all 26 roles, ten find the same story, and by dawn every role wakes to its own next step. */
export const NightStage = glStage(createNight);
