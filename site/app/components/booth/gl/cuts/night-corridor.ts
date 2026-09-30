import { BRAND, gsap, seededRandom, THREE } from "../kit";
import { NIGHT_ROLES, ORG_LINKS } from "./night-data";
import { createGlowDot, createLinks, createOrbs, createRibbon, createSparks, type Point, type Ribbon, type Spark } from "./night-gl";
import { track } from "./night-type";

/** When the night runs play, and how the corridor is laid out along z: one node per run, spaced evenly, fired on an accelerating schedule. */
export const CORRIDOR = {
  clockStart: 5.3,
  clockEnd: 12.7,
  clockEase: "power2.in",
  spacing: 7,
  lastNodeZ: 32,
  cameraLead: 14,
};

/** Where the ten spine runs converge, the centre of every later shot. */
export const CONVERGENCE = new THREE.Vector3(0, 0, 0);

/** Beats of the convergence shot. */
export const CONVERGE = { gather: 13.1, gathered: 14.5, flare: 14.5, filaments: 14.7, pull: 15.4, impact: 16.3, fade: 18.8, gone: 19.4 };

const LAST_RUN = NIGHT_ROLES.length - 1;
const SPARKS_PER_CHECK = 9;
const CONSTELLATION_SCALE = 1.3;
const NEAR_FADE = { from: 3, to: 11 };
const GATHER_BEHIND_Z = 35;
const GATHER_EDGE_Z = 30;
const LINK_NEAR_Z = -2.5;
const NODE_COLOR = new THREE.Color("#8b8cf8");
const FIRED_COLOR = new THREE.Color("#d9d4ff");
const SPINE_COLOR = new THREE.Color("#ffc2cf");
const SPARK_COLORS = [new THREE.Color(BRAND.indigo), new THREE.Color(BRAND.violet), new THREE.Color("#a5b4fc"), new THREE.Color(BRAND.coral)];
const FILAMENT_SAMPLES = 24;
const RING_SAMPLES = 160;
const STAGE = { width: 1920, height: 1080 };

const clockEase = gsap.parseEase(CORRIDOR.clockEase);
const gatherEase = gsap.parseEase("power2.inOut");

/** How far through the night's runs the film is at time t, as a fractional run index. */
export function runProgress(t: number): number {
  const progress = Math.min(1, Math.max(0, (t - CORRIDOR.clockStart) / (CORRIDOR.clockEnd - CORRIDOR.clockStart)));
  return LAST_RUN * clockEase(progress);
}

/** The night clock in minutes after midnight at film time t: it walks from run to run, so it races through the quiet stretches. */
export function clockMinute(t: number): number {
  const progress = runProgress(t);
  const index = Math.min(LAST_RUN - 1, Math.floor(progress));
  const local = progress - index;
  return NIGHT_ROLES[index].minute + (NIGHT_ROLES[index + 1].minute - NIGHT_ROLES[index].minute) * local;
}

function fireTime(index: number): number {
  let low = CORRIDOR.clockStart;
  let high = CORRIDOR.clockEnd;
  for (let step = 0; step < 40; step += 1) {
    const middle = (low + high) / 2;
    if (runProgress(middle) < index) low = middle;
    else high = middle;
  }
  return high;
}

/** Depth of the n-th run's node along the corridor. */
export function corridorZ(index: number): number {
  return CORRIDOR.lastNodeZ + (LAST_RUN - index) * CORRIDOR.spacing;
}

/** Index of the last run. */
export const LAST_RUN_INDEX = LAST_RUN;

/** Pixel position of a world point on the stage. */
export function project(point: THREE.Vector3, camera: THREE.Camera): Point {
  const ndc = point.clone().project(camera);
  return [((ndc.x + 1) / 2) * STAGE.width, ((1 - ndc.y) / 2) * STAGE.height];
}

/** Film times at which each role's run fires, in NIGHT_ROLES order. */
export const FIRE_TIMES = NIGHT_ROLES.map((_, index) => fireTime(index));

type Corridor = { update: (t: number, camera: THREE.PerspectiveCamera) => void; coreAt: (camera: THREE.PerspectiveCamera) => Point; dispose: () => void };

function viewDepth(point: THREE.Vector3, camera: THREE.Camera): number {
  return point.clone().applyMatrix4(camera.matrixWorldInverse).z;
}

function corridorPositions(random: () => number): THREE.Vector3[] {
  return NIGHT_ROLES.map((_, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    return new THREE.Vector3(side * (1.1 + random() * 2.1), (random() - 0.5) * 2.2, corridorZ(index) - random() * 1.5);
  });
}

function constellationPositions(random: () => number): THREE.Vector3[] {
  let spineIndex = 0;
  const spineCount = NIGHT_ROLES.filter((person) => person.spine).length;
  return NIGHT_ROLES.map((person) => {
    if (person.spine) {
      const angle = (spineIndex / spineCount) * Math.PI * 2 + 0.3 + (random() - 0.5) * 0.25;
      spineIndex += 1;
      const radius = (5.2 + random() * 2.2) * CONSTELLATION_SCALE;
      return new THREE.Vector3(Math.cos(angle) * radius * 1.35, Math.sin(angle) * radius * 0.85, (random() - 0.5) * 4);
    }
    const angle = random() * Math.PI * 2;
    const radius = (8.5 + random() * 4) * CONSTELLATION_SCALE;
    return new THREE.Vector3(Math.cos(angle) * radius * 1.3, Math.sin(angle) * radius * 0.62, -6 + random() * 8);
  });
}

function burst(origins: THREE.Vector3[], random: () => number): Spark[] {
  return NIGHT_ROLES.flatMap((person, index) =>
    Array.from({ length: person.checked * SPARKS_PER_CHECK }, () => {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta) * 0.8, Math.cos(phi));
      const pick = random();
      const color = SPARK_COLORS[pick < 0.45 ? 2 : pick < 0.75 ? 1 : pick < 0.93 ? 0 : 3];
      return { origin: origins[index], dir, birth: FIRE_TIMES[index] + random() * 0.15, speed: 1.0 + random() ** 2 * 4.2, color, size: 0.025 + random() * 0.05 };
    }),
  );
}

function ellipsePath(center: Point, radius: number, squash: number): Point[] {
  return Array.from({ length: RING_SAMPLES }, (_, step) => {
    const angle = (step / (RING_SAMPLES - 1)) * Math.PI * 2;
    return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius * squash] as Point;
  });
}

/** The night corridor and the convergence: 26 run nodes, their bursts, org links, spine filaments, the core light and its shock ring. */
export function buildCorridor(world: THREE.Scene, hud: THREE.Scene, timeline: gsap.core.Timeline, pixelScale: number): Corridor {
  const random = seededRandom(2611);
  const corridor = corridorPositions(random);
  const constellation = constellationPositions(random);
  const gatherStart = corridor.map((point) => (point.z > GATHER_BEHIND_Z ? new THREE.Vector3(point.x * 3.4, point.y * 3.4, GATHER_EDGE_Z) : point));
  const orbs = createOrbs(NIGHT_ROLES.length, pixelScale);
  const sparks = createSparks(burst(corridor, random), pixelScale);
  const links = createLinks(ORG_LINKS.length, "#8b8cf8");
  world.add(orbs.points, sparks.points, links.lines);
  const spineIndices = NIGHT_ROLES.flatMap((person, index) => (person.spine ? [index] : []));
  const filaments: Ribbon[] = spineIndices.map(() => {
    const ribbon = createRibbon(FILAMENT_SAMPLES, ["#ffd6de", BRAND.coral, "#ffffff"], [0.5, 1]);
    ribbon.style({ width: 2, intensity: 1.4 });
    hud.add(ribbon.mesh);
    return ribbon;
  });
  const core = createGlowDot("#ffc9d6", 180);
  const ring = createRibbon(RING_SAMPLES, ["#ffd6de", "#ffffff", "#ffd6de"], [0.5, 1]);
  hud.add(ring.mesh, core.mesh);

  const state = { appear: 0, sparks: 1, gather: 0, swirl: 0, flare: 0, dim: 0, links: 1, filaments: 0, pull: 0, core: 0, coreHalo: 40, ring: 0, fade: 1 };
  track(timeline, state, "appear", [[0, 0], [4.8, 0], [5.8, 1, "power2.out"]]);
  track(timeline, state, "sparks", [[0, 1], [CONVERGE.gather, 1], [CONVERGE.gather + 0.8, 0, "power2.in"]]);
  track(timeline, state, "gather", [[0, 0], [CONVERGE.gather, 0], [CONVERGE.gathered, 1, "power3.inOut"]]);
  track(timeline, state, "swirl", [[0, 0], [CONVERGE.gathered, 0], [CONVERGE.impact, 0.22, "none"]]);
  track(timeline, state, "flare", [[0, 0], [CONVERGE.flare, 0], [CONVERGE.flare + 0.5, 1, "power2.out"]]);
  track(timeline, state, "dim", [[0, 0], [CONVERGE.flare, 0], [CONVERGE.flare + 0.8, 1, "power2.inOut"]]);
  track(timeline, state, "links", [[0, 1], [CONVERGE.gather - 0.2, 1], [CONVERGE.gather + 0.2, 0, "power2.in"]]);
  track(timeline, state, "filaments", [[0, 0], [CONVERGE.filaments, 0], [CONVERGE.pull, 1, "power2.inOut"]]);
  track(timeline, state, "pull", [[0, 0], [CONVERGE.pull, 0], [CONVERGE.impact, 1, "power3.in"]]);
  track(timeline, state, "core", [[0, 0], [CONVERGE.pull, 0], [CONVERGE.impact - 0.01, 3.2, "power3.in"], [CONVERGE.impact, 9, "none"], [CONVERGE.impact + 0.45, 2.2, "power2.out"], [CONVERGE.fade, 1.8], [CONVERGE.gone + 0.2, 0, "power2.in"], [31.2, 0], [32.2, 1.6, "power2.out"], [34.2, 0, "power2.in"]]);
  track(timeline, state, "coreHalo", [[0, 30], [CONVERGE.pull, 30], [CONVERGE.impact - 0.01, 60, "power3.in"], [CONVERGE.impact, 170, "none"], [CONVERGE.impact + 0.6, 80, "power2.out"], [CONVERGE.gone + 0.6, 70]]);
  track(timeline, state, "ring", [[0, 0], [CONVERGE.impact, 0], [CONVERGE.impact + 0.9, 1, "power2.out"]]);
  track(timeline, state, "fade", [[0, 1], [CONVERGE.fade, 1], [CONVERGE.gone, 0, "power2.in"]]);

  const position = new THREE.Vector3();
  const tint = new THREE.Color();
  const swirl = new THREE.Euler();

  function nodePosition(index: number, out: THREE.Vector3): THREE.Vector3 {
    const stagger = Math.min(1, Math.max(0, state.gather * 1.35 - (index / NIGHT_ROLES.length) * 0.35));
    const eased = gatherEase(stagger);
    out.lerpVectors(state.gather > 0 ? gatherStart[index] : corridor[index], constellation[index], eased);
    swirl.set(0, 0, state.swirl * (NIGHT_ROLES[index].spine ? 1 : 0.6));
    if (state.gather > 0) out.applyEuler(swirl);
    if (NIGHT_ROLES[index].spine) out.lerp(CONVERGENCE, state.pull);
    return out;
  }

  return {
    coreAt(camera) {
      return project(CONVERGENCE, camera);
    },
    update(t, camera) {
      NIGHT_ROLES.forEach((person, index) => {
        const since = t - FIRE_TIMES[index];
        const fired = since >= 0 ? 1 : 0;
        const flash = fired ? Math.exp(-since * 3.2) : 0;
        nodePosition(index, position);
        tint.copy(fired ? FIRED_COLOR : NODE_COLOR).lerp(NODE_COLOR, 1 - fired);
        let size = 0.34 + 0.1 * fired + 0.45 * flash;
        let glow = (0.75 + 0.55 * fired + 2.2 * flash) * state.appear;
        if (person.spine) {
          tint.lerp(SPINE_COLOR, state.flare);
          size += state.flare * (0.35 + 0.2 * state.pull);
          glow += state.flare * (1.6 + 3.5 * state.pull);
          if (state.pull >= 1) glow = 0;
        } else {
          glow *= 1 - 0.72 * state.dim;
        }
        const near = THREE.MathUtils.smoothstep(position.distanceTo(camera.position), NEAR_FADE.from, NEAR_FADE.to);
        orbs.set(index, position, tint, size, glow * state.fade * near);
      });
      orbs.commit();
      sparks.set(t, state.sparks * state.appear);
      ORG_LINKS.forEach(([manager, report], index) => {
        const both = Math.min(t >= FIRE_TIMES[manager] ? 1 : 0, t >= FIRE_TIMES[report] ? 1 : 0);
        const a = nodePosition(manager, new THREE.Vector3());
        const b = nodePosition(report, new THREE.Vector3());
        const inFront = Math.max(viewDepth(a, camera), viewDepth(b, camera)) < LINK_NEAR_Z ? 1 : 0;
        links.set(index, a, b, both * inFront * 0.16 * state.links * state.appear);
      });
      links.commit();
      const [cx, cy] = project(CONVERGENCE, camera);
      spineIndices.forEach((nodeIndex, order) => {
        const ribbon = filaments[order];
        const local = Math.min(1, Math.max(0, state.filaments * 1.4 - order * 0.04));
        if (local <= 0 || state.pull >= 1) {
          ribbon.mesh.visible = false;
          return;
        }
        const from = project(nodePosition(nodeIndex, position), camera);
        ribbon.setPath([from, [cx, cy]]);
        ribbon.style({ intensity: 1.2 + state.pull * 2.2, opacity: 0.85 });
        ribbon.reveal(0, local);
      });
      core.set(cx, cy, 6 + state.core * 1.4, state.coreHalo, state.core);
      if (state.ring > 0 && state.ring < 1) {
        ring.setPath(ellipsePath([cx, cy], 30 + state.ring * 820, 0.55));
        ring.style({ width: 3 * (1 - state.ring) + 0.8, intensity: 1.6, opacity: (1 - state.ring) ** 1.5 });
        ring.reveal(0, 1);
      } else {
        ring.mesh.visible = false;
      }
    },
    dispose() {
      [orbs.points, sparks.points, links.lines, core.mesh, ring.mesh, ...filaments.map((ribbon) => ribbon.mesh)].forEach((object) => {
        object.geometry.dispose();
        object.material.dispose();
      });
    },
  };
}
