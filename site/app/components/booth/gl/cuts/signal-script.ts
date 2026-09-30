import { THREE } from "../kit";
import { HERO_SHOTS, overnightRuns, RADIATE_ORDER } from "./signal-data";
import { createTracks, poseLooking, poseOrbit } from "./signal-rig";
import { SPHERE_RADIUS, type WorldEdge, type WorldNode } from "./signal-world";

/** Every camera pose the film moves between. */
export type Poses = ReturnType<typeof buildPoses>;

/** The tracks object the script writes and the renderer reads. */
export type Tracks = ReturnType<typeof createTracks>;

const S1_DISTANCE = 16;
const S1_BASELINE_Y = 880;
const HERO_SHIFT = { sx: -400, sy: -70 };
const HERO_DISTANCE = 16;
const HERO_TURN = { az: 0.24, el: 0.12 };
const HERO_DRIFT = 0.07;
const HERO_STARTS: Record<keyof typeof HERO_SHOTS, number> = { u_krit: 21.3, u_anucha: 23.9, u_thana: 27.2, u_siriporn: 29.8 };
const DIRECTOR_AT = 26.5;
const BURST_START = 32.75;
const BURST_STEP = 0.48;

/** When each spine role is reached by the light in the radiate beat. */
export function radiateTimes(): Map<string, number> {
  const times = new Map<string, number>();
  let burst = 0;
  for (const step of RADIATE_ORDER) {
    if (step.hero) times.set(step.id, HERO_STARTS[step.id as keyof typeof HERO_SHOTS]);
    else if (step.id === "u_prasit") times.set(step.id, DIRECTOR_AT);
    else times.set(step.id, BURST_START + BURST_STEP * burst++);
  }
  return times;
}

function pixelsPerUnit(distance: number): number {
  return 1080 / (2 * distance * Math.tan(THREE.MathUtils.degToRad(17.5)));
}

function centroid(points: THREE.Vector3[]): THREE.Vector3 {
  return points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);
}

/** Computes every pose from where the nodes and the chart ended up. */
export function buildPoses(byId: Map<string, WorldNode>, chart: { center: THREE.Vector3; baseline: number }, barsAt: THREE.Vector3) {
  const node = (id: string) => {
    const found = byId.get(id);
    if (!found) throw new Error(`No node ${id}`);
    return found.home;
  };
  const origin = new THREE.Vector3();
  const s1Target = new THREE.Vector3(chart.center.x, chart.baseline + (S1_BASELINE_Y - 540) / pixelsPerUnit(S1_DISTANCE), chart.center.z);
  const hero = (id: string, drift = 0) => poseOrbit(node(id), HERO_TURN.az + drift, HERO_TURN.el, SPHERE_RADIUS + HERO_DISTANCE, node(id), HERO_SHIFT.sx, HERO_SHIFT.sy);
  const burstIds = RADIATE_ORDER.filter((step) => !step.hero && step.id !== "u_prasit").map((step) => node(step.id));
  const burstDirection = centroid(burstIds);
  const rsmGroup = centroid([node("u_anucha"), node("u_krit"), node("agent_0"), node("agent_1")]);
  const alert = node("agent_0");
  return {
    hook: poseLooking(s1Target.clone().add(new THREE.Vector3(0, 0, S1_DISTANCE)), s1Target),
    system: poseLooking(new THREE.Vector3(0, 1.2, 36), origin, 250, 10),
    cause: poseLooking(barsAt.clone().add(new THREE.Vector3(2.4, 3.8, 15.5)), barsAt.clone().add(new THREE.Vector3(0.6, -2.4, 0)), 80, 20),
    causeCard: poseLooking(barsAt.clone().add(new THREE.Vector3(2.9, 3.8, 15.9)), barsAt.clone().add(new THREE.Vector3(0.6, -2.4, 0)), -110, 20),
    overview: poseOrbit(node("u_krit"), 0.5, 0.25, 31, origin, 0, 20),
    hero,
    burst: poseOrbit(burstDirection, -0.2, 0.05, 31, origin, 300, 30),
    peak: poseOrbit(burstDirection, 0.45, 0.12, 30, origin, 180, 40),
    ceoSide: poseOrbit(node("u_thana"), 0.2, -0.55, 40, origin, 0, 30),
    rsmSide: poseOrbit(rsmGroup, 0.15, 0.1, SPHERE_RADIUS + 19, rsmGroup, -20, -20),
    memory: poseOrbit(alert, -0.2, 0.1, SPHERE_RADIUS + 12, alert, 290, 80),
    brand: poseOrbit(alert, -0.7, 0.28, 22.6, origin, 0, -150),
    brandWide: poseOrbit(alert, -0.55, 0.22, 36, origin, 0, -60),
  };
}

type Scene = { nodes: WorldNode[]; edges: WorldEdge[]; poses: Poses; barCount: number };

function edgeBetween(edges: WorldEdge[], a: string, b: string): { edge: WorldEdge; reverse: boolean } {
  const forward = edges.find((edge) => edge.from === a && edge.to === b);
  if (forward) return { edge: forward, reverse: false };
  const backward = edges.find((edge) => edge.from === b && edge.to === a);
  if (!backward) throw new Error(`No edge between ${a} and ${b}`);
  return { edge: backward, reverse: true };
}

function ripple(tracks: Tracks, id: string, at: number) {
  tracks.to(`ring:${id}`, 0, at, 0.001, "none");
  tracks.to(`ring:${id}`, 1, at + 0.002, 0.9, "power2.out");
}

function hook(tracks: Tracks, poses: Poses, cliffIndex: number, lastIndex: number) {
  tracks.to("line.draw", cliffIndex - 1, 0.05, 1.6, "power1.inOut");
  tracks.to("line.draw", cliffIndex, 1.65, 0.3, "expo.in");
  tracks.to("line.draw", lastIndex, 1.95, 0.95, "power2.out");
  tracks.to("line.red", 1, 1.88, 0.12, "none");
  tracks.to("dot.red", 1, 1.88, 0.12, "none");
  tracks.to("shake", 1, 1.95, 0.02, "none");
  tracks.to("shake", 0, 1.97, 0.4, "power2.out");
  tracks.to("hook.axis", 1, 0.15, 0.6, "power2.out");
  tracks.to("hook.label", 1, 0.3, 0.6, "power2.out");
  tracks.to("hook.before", 1, 0.45, 0.7, "expo.out");
  tracks.to("hook.marker", 1, 1.95, 0.3, "power2.out");
  tracks.to("hook.after", 1, 1.98, 0.4, "expo.out");
  tracks.to("hook.count", 1, 1.98, 0.8, "expo.out");
  tracks.to("hook.headline", 1, 2.3, 0.9, "none");
  tracks.to("hook.out", 1, 4.0, 0.45, "power2.in");
  tracks.to("chart.alpha", 0, 4.15, 0.8, "power2.inOut");
  tracks.poseTo("cam", poses.system, 4.0, 2.3, "power3.inOut");
  tracks.to("dot.size", 0.62, 4.0, 1.4, "power2.inOut");
  tracks.to("dot.alpha", 0, 5.0, 0.3, "none");
}

function system(tracks: Tracks, nodes: WorldNode[], edges: WorldEdge[]) {
  const runs = overnightRuns();
  const appearAt = new Map<string, number>();
  runs.forEach((run, index) => appearAt.set(run.id, 4.75 + index * 0.1));
  for (const node of nodes) if (node.kind === "agent") appearAt.set(node.id, 4.95);
  for (const node of nodes) {
    const at = appearAt.get(node.id) ?? 5;
    tracks.to(`appear:${node.id}`, 1, at, 0.5, "back.out(2)");
    ripple(tracks, node.id, at);
    tracks.to(`spoke:${node.id}`, 1, at - 0.25, 0.3, "power2.in");
    tracks.to(`spokeAlpha:${node.id}`, node.kind === "agent" ? 0.9 : 0.8, at - 0.25, 0.05, "none");
    if (node.kind === "role") tracks.to(`spokeAlpha:${node.id}`, 0, at + 0.1, 0.7, "power2.out");
  }
  for (const edge of edges) {
    const at = Math.max(appearAt.get(edge.from) ?? 5, appearAt.get(edge.to) ?? 5) + (edge.kind === "agent" ? 0.4 : 0.1);
    tracks.to(`draw:${edge.key}`, 1, at, 0.45, "power2.out");
  }
  tracks.to("core.alpha", 1, 4.8, 0.6, "power2.out");
  tracks.to("sys.head", 1, 4.75, 0.8, "none");
  tracks.to("sys.count", 1, 5.05, 0.5, "power2.out");
  for (const node of nodes.filter((candidate) => candidate.kind === "agent")) {
    tracks.to(`spoke:${node.id}`, 0, 7.2, 0.001, "none");
    tracks.to(`spoke:${node.id}`, 1, 7.25, 0.85, "power2.in");
    tracks.to(`spokeAlpha:${node.id}`, 0, 8.5, 0.5, "power2.out");
    ripple(tracks, node.id, 7.25);
  }
  tracks.to("core.flare", 1, 8.1, 0.12, "power2.out");
  tracks.to("core.flare", 0, 8.22, 0.7, "power2.out");
  tracks.to("sys.out", 1, 8.55, 0.4, "power2.in");
}

function cause(tracks: Tracks, poses: Poses, barCount: number) {
  tracks.poseTo("cam", poses.cause, 9.0, 1.4, "power3.inOut");
  tracks.to("world.alpha", 0, 9.45, 0.7, "power2.inOut");
  tracks.to("bars.alpha", 1, 9.65, 0.3, "none");
  for (let index = 0; index < barCount; index += 1) tracks.to(`bar:${index}`, 1, 9.8 + index * 0.06, index < 2 ? 1.3 : 0.9, "expo.out");
  tracks.to("cause.caption", 1, 10.3, 0.5, "power2.out");
  tracks.to("cause.head1", 1, 10.15, 0.8, "none");
  tracks.to("cause.labels", 1, 10.85, 0.5, "power2.out");
  [11.75, 13.5].forEach((at, index) => {
    tracks.to(`tile${index}.in`, 1, at, 0.7, "expo.out");
    tracks.to(`tile${index}.strike`, 1, at + 0.7, 0.3, "power2.inOut");
    tracks.to(`tile${index}.chip`, 1, at + 0.9, 0.3, "back.out(2)");
    tracks.to(`tile${index}.out`, 1, at + 1.35, 0.35, "power2.in");
  });
  tracks.to("cause.labels", 0, 15.0, 0.35, "power2.in");
  tracks.to("cause.caption", 0, 15.0, 0.35, "power2.in");
  tracks.poseTo("cam", poses.causeCard, 15.0, 1.1, "power3.inOut");
  tracks.to("card.in", 1, 15.35, 0.6, "back.out(1.4)");
  tracks.to("cause.head2", 1, 15.8, 0.6, "none");
  tracks.to("cause.out", 1, 17.45, 0.35, "power2.in");
}

function spine(tracks: Tracks, poses: Poses) {
  tracks.to("white", 1, 17.7, 0.35, "power2.in");
  tracks.to("bars.alpha", 0, 18.1, 0.05, "none");
  tracks.poseTo("cam", poses.overview, 18.2, 0.05, "none");
  tracks.to("world.alpha", 1, 18.2, 0.05, "none");
  tracks.to("spine.count", 1, 18.2, 1.15, "power1.inOut");
  tracks.to("spine.total", 1, 19.35, 0.45, "back.out(1.6)");
  tracks.to("spine.caption", 1, 19.6, 0.7, "none");
  tracks.to("white.out", 1, 20.75, 0.5, "power2.inOut");
}

function light(tracks: Tracks, edges: WorldEdge[], from: string, to: string, at: number, travel: number) {
  const { edge, reverse } = edgeBetween(edges, from, to);
  edge.uniforms.uLitReverse.value = reverse ? 1 : 0;
  tracks.to(`lit:${edge.key}`, 1, at, travel, "power2.inOut");
  tracks.to(`head:${edge.key}`, 1, at, 0.05, "none");
  tracks.to(`head:${edge.key}`, 0, at + travel, 0.25, "power2.out");
  tracks.to(`ignite:${to}`, 1, at + travel - 0.05, 0.3, "power2.out");
  ripple(tracks, to, at + travel - 0.05);
}

function radiate(tracks: Tracks, poses: Poses, edges: WorldEdge[]) {
  const times = radiateTimes();
  tracks.poseTo("cam", poses.hero("u_krit"), 21.0, 1.1, "power3.inOut");
  for (const step of RADIATE_ORDER) {
    const at = times.get(step.id) ?? 0;
    if (step.hero) {
      if (step.id !== "u_krit") tracks.poseTo("cam", poses.hero(step.id), at - 0.3, 1.1, "power3.inOut");
      tracks.poseTo("cam", poses.hero(step.id, HERO_DRIFT), at + 0.8, 1.4, "none");
      light(tracks, edges, step.from, step.id, at + 0.05, 0.5);
      tracks.to(`shot:${step.id}`, 1, at + 0.35, 0.55, "expo.out");
      tracks.to(`hero:${step.id}`, 1, at + 0.5, 0.95, "none");
      tracks.to(`heroOut:${step.id}`, 1, at + 2.4, 0.25, "power2.in");
      continue;
    }
    const travel = step.id === "u_prasit" ? 0.45 : 0.3;
    light(tracks, edges, step.from, step.id, at, travel);
    if (step.id === "u_prasit") {
      tracks.to(`tag:${step.id}`, 1, at + travel, 0.2, "power2.out");
      tracks.to(`tagOut:${step.id}`, 1, at + travel + 0.6, 0.18, "power2.in");
      continue;
    }
    tracks.to(`row:${step.id}`, 1, at + travel - 0.05, 0.35, "expo.out");
  }
  tracks.poseTo("cam", poses.burst, 32.3, 1.0, "power3.inOut");
  tracks.poseTo("cam", poses.peak, 33.35, 4.65, "power1.inOut");
  tracks.to("rows.out", 1, 35.2, 0.3, "power2.in");
  tracks.to("peak.in", 1, 35.4, 1.1, "none");
  RADIATE_ORDER.forEach((step, index) => {
    const at = 36.1 + index * 0.04;
    tracks.to(`spoke:${step.id}`, 0, at, 0.001, "none");
    tracks.to(`spoke:${step.id}`, 1, at + 0.002, 0.55, "power2.out");
    tracks.to(`spokeAlpha:${step.id}`, 0.85, at, 0.1, "none");
    tracks.to(`spokeAlpha:${step.id}`, 0, 37.65, 0.35, "power2.in");
    ripple(tracks, step.id, at + 0.45);
  });
  tracks.to("peak.out", 1, 37.7, 0.3, "power2.in");
}

function scope(tracks: Tracks, poses: Poses) {
  tracks.definePose("left", poses.ceoSide);
  tracks.poseTo("left", { ...poses.ceoSide, az: poses.ceoSide.az + 0.12 }, 38.0, 7.0, "none");
  tracks.to("split", 1, 38.0, 0.85, "expo.inOut");
  tracks.to("scope.on", 1, 38.3, 0.6, "power2.inOut");
  tracks.poseTo("cam", poses.rsmSide, 38.0, 1.2, "power3.inOut");
  tracks.to("tag.ceo", 1, 38.9, 0.5, "power2.out");
  tracks.to("tag.rep", 1, 39.15, 0.5, "power2.out");
  tracks.to("scope.rsm", 1, 40.9, 0.6, "power2.inOut");
  tracks.to("tag.rsm", 1, 41.35, 0.5, "power2.out");
  tracks.to("crop.rsm", 1, 41.5, 0.55, "back.out(1.5)");
  tracks.to("scope.caption", 1, 42.0, 0.6, "power2.out");
  tracks.to("scope.out", 1, 44.15, 0.35, "power2.in");
  tracks.to("split", 0, 44.35, 0.75, "expo.inOut");
  tracks.to("scope.on", 0, 44.4, 0.6, "power2.inOut");
  tracks.poseTo("cam", poses.memory, 44.35, 1.3, "power3.inOut");
}

function memory(tracks: Tracks, agents: string[], links: WorldEdge[]) {
  ripple(tracks, "agent_0", 45.4);
  ripple(tracks, "agent_0", 46.4);
  tracks.to("echo.rise", 1, 45.75, 1.3, "power3.out");
  tracks.to("echo.link", 1, 46.5, 0.6, "power2.out");
  tracks.to("echo.date", 1, 46.75, 0.45, "power2.out");
  tracks.to("lesson.in", 1, 46.9, 0.9, "none");
  tracks.to("echo.heal", 1, 48.8, 0.6, "power2.inOut");
  for (const id of agents) {
    tracks.to(`red:${id}`, 0, 49.6, 0.8, "power2.inOut");
    tracks.to(`ignite:${id}`, 1, 49.6, 0.8, "power2.inOut");
    ripple(tracks, id, 49.75);
  }
  tracks.to("links.heal", 1, 49.6, 0.8, "power2.inOut");
  for (const link of links) tracks.to(`lit:${link.key}`, 1, 49.6, 0.8, "power2.inOut");
  tracks.to("lesson.out", 1, 51.15, 0.4, "power2.in");
  tracks.to("echo.out", 1, 51.0, 0.6, "power2.in");
}

function brand(tracks: Tracks, poses: Poses) {
  tracks.poseTo("cam", poses.brandWide, 51.3, 1.5, "power3.inOut");
  tracks.poseTo("cam", poses.brand, 52.85, 1.4, "power3.inOut");
  tracks.to("contract", 1, 52.2, 1.5, "power3.inOut");
  tracks.to("bend", 0, 52.3, 1.2, "power2.inOut");
  tracks.to("core.scale", 1.5, 52.3, 1.4, "power3.inOut");
  tracks.to("edges.lit", 1, 52.4, 0.8, "power2.inOut");
  tracks.to("straighten", 1, 53.3, 1.15, "power3.inOut");
  tracks.to("core.alpha", 0, 53.55, 0.35, "power2.in");
  tracks.to("nodes.alpha", 0, 53.7, 0.4, "power2.in");
  tracks.to("logo.alpha", 1, 54.15, 0.3, "power1.in");
  tracks.to("edges.alpha", 0, 54.3, 0.2, "none");
  tracks.to("dot.alpha", 1, 54.65, 0.1, "none");
  tracks.to("dot.land", 1, 54.65, 0.45, "back.out(2.2)");
  tracks.to("logo.tile", 1, 55.05, 0.6, "expo.out");
  tracks.to("logo.white", 1, 55.1, 0.4, "power2.out");
  tracks.to("brand.word", 1, 55.45, 0.6, "expo.out");
  tracks.to("brand.tagline", 1, 55.75, 0.6, "expo.out");
  tracks.to("brand.out", 1, 58.55, 0.4, "power2.in");
  tracks.to("logo.tile", 0, 58.7, 0.55, "power3.in");
  tracks.to("logo.retract", 1, 58.7, 0.55, "power2.inOut");
  tracks.to("logo.white", 0, 58.75, 0.4, "power2.inOut");
  tracks.to("logo.alpha", 0, 59.25, 0.05, "none");
  tracks.to("home", 1, 59.3, 0.7, "power3.inOut");
  tracks.poseTo("cam", poses.hook, 59.3, 0.7, "power3.inOut");
}

/** The whole film as channel tweens on one master timeline. */
export function writeScript(duration: number, scene: Scene, cliffIndex: number, lastIndex: number): Tracks {
  const tracks = createTracks(duration);
  tracks.definePose("cam", scene.poses.hook);
  for (const [key, value] of Object.entries({ "dot.size": 0.3, "dot.alpha": 1, "chart.alpha": 1, "world.alpha": 1, "core.scale": 1, bend: 1, "nodes.alpha": 1, "edges.alpha": 1 })) tracks.define(key, value);
  const agents = scene.nodes.filter((node) => node.kind === "agent").map((node) => node.id);
  for (const id of agents) tracks.define(`red:${id}`, 1);
  hook(tracks, scene.poses, cliffIndex, lastIndex);
  system(tracks, scene.nodes, scene.edges);
  cause(tracks, scene.poses, scene.barCount);
  spine(tracks, scene.poses);
  radiate(tracks, scene.poses, scene.edges);
  scope(tracks, scene.poses);
  memory(tracks, agents, scene.edges.filter((edge) => edge.kind === "agent"));
  brand(tracks, scene.poses);
  return tracks;
}
