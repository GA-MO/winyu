import { glStage } from "../stage";
import { createComposer, createRenderer, loadShotTexture, masterTimeline, THREE, type ShotId } from "../kit";
import type { FilmHost } from "../film";
import { applyPose, DAWN_FOV, framing, hudPoint, type Pose } from "./dawn-camera";
import { CHART_ORIGIN, CLIFF_SHARE, createChart } from "./dawn-chart";
import { BEAT, DOT, LOOP, nodeOf, ROOT_ID, STOP_IDS, STOP_SHOTS } from "./dawn-plan";
import { createStopPanel, createStoryScreens } from "./dawn-screens";
import { createSky } from "./dawn-sky";
import { createTree, discTexture, glowTexture } from "./dawn-tree";
import { createTypeLayer, type StrokeState } from "./dawn-type";

/** Loop length of the dawn cut, in seconds. */
export const DAWN_SECONDS = LOOP;

const HOOK_AZ = 0.5;
const HOOK_DIST = 30;
const HOOK_EL = -0.14;
const TREE_CENTER = new THREE.Vector3(0, 0.9, 0);
const NODE_SCREEN = [990, 540] as const;
const HINGE_SCREEN = [1068, 540] as const;
const STOP_VIEWS = [
  { az: 0.62, el: 0.1, dist: 12.5 },
  { az: 0.1, el: 0.12, dist: 10.5 },
  { az: 0.9, el: 0.1, dist: 10.5 },
  { az: 0.7, el: 0.06, dist: 10 },
] as const;
const FONT_PROBES = ['700 100px "Noto Sans Thai"', '600 48px "Noto Sans Thai"', '500 48px "Noto Sans Thai"', "800 150px Inter", "700 250px Inter", "600 48px Inter"];

type Key = readonly [time: number, value: number, ease?: string];
type Proxy = Record<string, number>;

function track(timeline: gsap.core.Timeline, target: Proxy, key: string, keys: Key[]): void {
  target[key] = keys[0][1];
  for (let index = 1; index < keys.length; index += 1) {
    const [from, start] = [keys[index - 1][1], keys[index - 1][0]];
    const [end, value, ease] = keys[index];
    timeline.fromTo(target, { [key]: from }, { [key]: value, duration: Math.max(0.001, end - start), ease: ease ?? "power2.inOut", immediateRender: false }, start);
  }
}

function poseTrack(timeline: gsap.core.Timeline, target: Proxy, keys: readonly (readonly [number, Pose, string?])[]): void {
  for (const field of ["az", "el", "dist", "tx", "ty", "tz"] as const) {
    track(timeline, target, field, keys.map(([time, pose, ease]) => [time, pose[field], ease] as const));
  }
}

function hookPose(): Pose {
  return framing(nodeOf(ROOT_ID).position, DOT, HOOK_AZ, HOOK_EL, HOOK_DIST);
}

function stopPoses(): Pose[] {
  return STOP_IDS.map((id, index) => {
    const view = STOP_VIEWS[index];
    return framing(nodeOf(id).position, NODE_SCREEN, view.az, view.el, view.dist);
  });
}

function cameraKeys(stops: Pose[]): (readonly [number, Pose, string?])[] {
  const hook = hookPose();
  const keys: (readonly [number, Pose, string?])[] = [
    [0, hook],
    [4.9, hook],
    [7.4, framing(TREE_CENTER, [1180, 560], 0.15, 0.22, 50), "power2.inOut"],
    [14.0, framing(TREE_CENTER, [1200, 540], 0.95, 0.3, 48), "sine.inOut"],
    [20.0, framing(TREE_CENTER, [1240, 560], 1.45, 0.22, 38), "sine.inOut"],
    [27.0, framing(TREE_CENTER, [1300, 500], 1.9, 0.14, 46), "sine.inOut"],
    [33.0, framing(TREE_CENTER, [1240, 460], 2.3, 0.1, 50), "sine.inOut"],
    [37.4, framing(TREE_CENTER, [760, 520], 2.6, 0.12, 52), "sine.inOut"],
  ];
  stops.forEach((pose, index) => {
    const start = BEAT.stops[index];
    const arrive = index === 0 ? start + 0.3 : start + 0.2;
    const leave = start + BEAT.stopLength - 0.45;
    keys.push([arrive, pose, index === 0 ? "power3.inOut" : "power2.inOut"]);
    keys.push([leave, { ...pose, dist: pose.dist * 0.94 }, "sine.inOut"]);
  });
  keys.push([BEAT.pullBack + 1.5, framing(TREE_CENTER, [1200, 660], 1.3, 0.24, 52), "power3.inOut"]);
  keys.push([BEAT.logoMorph[0] + 0.9, hook, "power2.inOut"]);
  keys.push([LOOP, hook]);
  return keys;
}

async function loadFonts(): Promise<void> {
  await Promise.all(FONT_PROBES.map((probe) => document.fonts.load(probe, "กW0")));
  await document.fonts.ready;
}

async function createDawn(host: FilmHost) {
  await loadFonts();
  const renderer = createRenderer(host.canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(DAWN_FOV, 1920 / 1080, 0.1, 400);
  scene.add(camera);
  const hud = new THREE.Group();
  camera.add(hud);

  const glow = glowTexture();
  const disc = discTexture();
  const sky = createSky(scene);
  const tree = createTree(scene, glow, disc);
  const chart = createChart(hud, glow);
  const [storyTexture, ...stopTextures] = await Promise.all((["story", ...STOP_SHOTS] as ShotId[]).map((id) => loadShotTexture(renderer, id)));
  const storyScreens = createStoryScreens(hud, storyTexture);
  const stops = stopPoses();
  const panels = STOP_SHOTS.map((shot, index) => createStopPanel(scene, stopTextures[index], shot, stops[index], HINGE_SCREEN));
  const type = createTypeLayer(host.overlay);
  const composer = createComposer(renderer, scene, camera, { bloom: { intensity: 1.35, threshold: 1, radius: 0.72 }, vignette: 0.42, grain: 0.05 });

  const cam: Proxy = {};
  const world: Proxy = {};
  const story: Proxy = {};
  const stroke: Proxy = {};
  const panelState: Proxy[] = STOP_IDS.map(() => ({}));
  const timeline = masterTimeline(LOOP);
  poseTrack(timeline, cam, cameraKeys(stops));

  track(timeline, world, "dawn", [[0, 0], [BEAT.sunrise[0], 0], [BEAT.sunrise[1], 1, "sine.inOut"], [57.8, 1], [59.6, 0, "sine.inOut"]]);
  track(timeline, world, "tree", [[0, 0], [4.4, 0], [5.0, 1], [20.0, 1], [20.8, 0.05], [37.4, 0.05], [38.6, 1], [54.3, 1], [55.2, 0]]);
  track(timeline, world, "spine", [[0, 0], [BEAT.spine, 0], [BEAT.spine + 0.7, 1], [20.2, 1], [21.0, 0.35], [37.4, 0.35], [38.4, 0]]);
  track(timeline, world, "warm", [[0, 0], [37.6, 0], [39.0, 1], [55.0, 1], [55.5, 0]]);
  track(timeline, world, "filamentTo", [[0, 0], [BEAT.filaments[0], 0], [BEAT.filaments[1], 1, "power2.inOut"]]);
  track(timeline, world, "filamentFrom", [[0, 0], [19.3, 0], [20.3, 1, "power2.in"], [21, 0]]);
  track(timeline, world, "filamentAlpha", [[0, 0], [BEAT.filaments[0] - 0.1, 0], [BEAT.filaments[0], 1], [20.2, 1], [20.4, 0]]);
  track(timeline, world, "chartDraw", [[0, 0], [BEAT.chartStart, 0], [BEAT.chartCliff, CLIFF_SHARE, "power1.in"], [BEAT.chartEnd, 1, "power2.out"]]);
  track(timeline, world, "chartOpacity", [[0, 0], [BEAT.chartStart - 0.1, 0], [BEAT.chartStart + 0.2, 1], [27.0, 1], [27.8, 0.38], [29.9, 0.38], [30.5, 0]]);
  track(timeline, world, "marker", [[0, 0], [BEAT.chartCliff - 0.1, 0], [BEAT.chartCliff + 0.4, 1], [29.8, 1], [30.3, 0]]);
  track(timeline, world, "morph", [[0, 0], [BEAT.logoMorph[0], 0], [BEAT.logoMorph[1], 1, "power2.inOut"]]);

  track(timeline, story, "rise", [[0, 0], [BEAT.screenRise, 0], [34.5, 1, "power3.out"]]);
  track(timeline, story, "lift", [[0, 0], [34.3, 0], [35.4, 1, "power3.inOut"]]);
  track(timeline, story, "bars", [[0, 0], [35.5, 0], [36.4, 1, "power3.out"]]);
  track(timeline, story, "sweep", [[0, 0], [36.0, 0], [37.1, 1, "power1.inOut"]]);
  track(timeline, story, "exit", [[0, 0], [37.35, 0], [38.1, 1, "power2.in"]]);

  panelState.forEach((state, index) => {
    const start = BEAT.stops[index];
    const end = start + BEAT.stopLength;
    track(timeline, state, "open", [[0, 0], [start + 0.3, 0], [start + 1.0, 1, "power3.out"], [end - 0.45, 1], [end - 0.05, 0.55, "power2.in"]]);
    track(timeline, state, "fade", [[0, 1], [end - 0.4, 1], [end - 0.05, 0, "power2.in"]]);
    track(timeline, state, "focus", [[0, 0], [start + 0.2, 0], [start + 0.7, 1], [end - 0.4, 1], [end, 0]]);
  });

  track(timeline, stroke, "bend", [[0, 0], [BEAT.wBend[0], 0], [BEAT.wBend[1], 1, "power3.inOut"], [BEAT.unbend[0], 1], [BEAT.unbend[1], 0, "power3.inOut"]]);
  track(timeline, stroke, "tail", [[0, 0], [BEAT.wRetract[0], 0], [BEAT.wRetract[1], 1, "power2.inOut"], [BEAT.logoMorph[1] - 0.9, 1], [BEAT.logoMorph[1], 0, "power2.inOut"]]);
  track(timeline, stroke, "opacity", [[0, 1], [BEAT.rootHandoff[0], 1], [BEAT.rootHandoff[1], 0], [BEAT.logoMorph[1] - 1.1, 0], [BEAT.logoMorph[1] - 0.8, 1]]);
  track(timeline, stroke, "dot", [[0, 1]]);
  track(timeline, stroke, "glow", [[0, 1], [BEAT.logoTile, 1], [BEAT.logoTile + 0.8, 0.3], [BEAT.logoOut, 0.3], [BEAT.logoOut + 0.7, 1]]);
  track(timeline, stroke, "tile", [[0, 0], [BEAT.logoTile, 0], [BEAT.logoTile + 0.8, 1, "power3.out"], [BEAT.logoOut, 1], [BEAT.logoOut + 0.6, 0, "power2.in"]]);
  track(timeline, stroke, "wordmark", [[0, 0], [BEAT.logoTile + 0.5, 0], [BEAT.logoTile + 1.2, 1, "power3.out"], [BEAT.logoOut, 1], [BEAT.logoOut + 0.5, 0, "power2.in"]]);

  const convergenceLocal = hudPoint(CHART_ORIGIN[0], CHART_ORIGIN[1]);
  const convergence = new THREE.Vector3();

  return {
    render(t: number) {
      const time = ((t % LOOP) + LOOP) % LOOP;
      timeline.seek(time, false);
      applyPose(camera, cam as Pose);
      camera.updateMatrixWorld(true);
      convergence.copy(convergenceLocal).applyMatrix4(camera.matrixWorld);
      const stopIndex = panelState.findIndex((state) => state.focus > 0.001);
      sky.update(time, world.dawn, 1);
      tree.update({
        t: time,
        alpha: world.tree,
        spine: world.spine,
        warm: world.warm,
        pulse: 1,
        filamentFrom: world.filamentFrom,
        filamentTo: world.filamentTo,
        filamentAlpha: world.filamentAlpha,
        convergence,
        morph: world.morph,
        focus: stopIndex >= 0 ? STOP_IDS[stopIndex] : null,
        focusLevel: stopIndex >= 0 ? panelState[stopIndex].focus : 0,
      });
      chart.update(world.chartDraw, world.chartOpacity, world.marker);
      storyScreens.update({ rise: story.rise, lift: story.lift, bars: story.bars, sweep: story.sweep, exit: story.exit });
      panels.forEach((panel, index) => panel.update(panelState[index].open, panelState[index].fade));
      type.update(time, stroke as StrokeState & Proxy);
      composer.render(0);
    },
    dispose() {
      timeline.kill();
      type.dispose();
      sky.dispose();
      tree.dispose();
      chart.dispose();
      storyScreens.dispose();
      for (const panel of panels) panel.dispose();
      for (const texture of [storyTexture, ...stopTextures, glow, disc]) texture.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}

/** The dawn film: the org wakes up overnight, finds one story ten times, and every role knows its next step by sunrise. */
export const DawnStage = glStage(createDawn);
