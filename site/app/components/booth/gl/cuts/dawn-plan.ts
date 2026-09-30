import { FACTS, seededRandom, SPARK_POINTS, THREE } from "../kit";

/** Loop length of the dawn cut, in seconds. */
export const LOOP = 60;

/** When each beat of the film happens, in seconds. */
export const BEAT = {
  hookTypeIn: 0.35,
  wBend: [0.5, 2.3],
  wRetract: [3.7, 4.7],
  rootHandoff: [4.4, 5.3],
  nightStart: 5.6,
  nightEnd: 13.1,
  spine: 14.2,
  filaments: [14.9, 16.9],
  chartStart: 20.2,
  chartCliff: 23.1,
  chartEnd: 24.4,
  ruledOut: 27.2,
  lesson: 30.1,
  screenRise: 33.0,
  sunrise: [37.0, 50.5],
  stops: [38.5, 41.35, 44.2, 47.05],
  stopLength: 2.85,
  pullBack: 49.8,
  logoMorph: [52.8, 54.6],
  logoTile: 54.5,
  logoOut: 57.5,
  unbend: [58.0, 59.6],
} as const;

/** The logo tile in stage pixels; the loop's first and last frame keep its dot in the same place. */
export const LOGO = { cx: 960, cy: 300, size: 208 } as const;

const FLAT_POINTS: readonly [number, number][] = [[-58, 13], [-20, 13], [12, 13], [34, 13], [55, 13]];
const LEVEL_Y = [8.2, 3.4, -1.6, -6.4];
const LEVEL_RADIUS = [0, 5.2, 9.6, 12.6];
const ANGLE_OFFSET = -0.18;
const PULSE_SECONDS = 0.7;
const SAME_MINUTE_STAGGER = 0.06;
const RANK_WEIGHT = 0.55;

export type Role = (typeof FACTS.roles)[number];
export type Spine = NonNullable<Role["spine"]>;

/** One person in the 3D org tree, with when Winyu's night run for them lands on screen. */
export type TreeNode = {
  id: string;
  role: string;
  level: number;
  angle: number;
  position: THREE.Vector3;
  parentId: string | null;
  path: string[];
  spine: Spine | null;
  fireAt: number;
  minute: number;
  checked: number;
};

/** A reporting line of the tree and the window in which the first pulse draws it. */
export type TreeEdge = { from: string; to: string; drawFrom: number; drawTo: number };

/** Stage pixels of the W (or of the flat stroke it unbends into) at bend 1 (W) or 0 (flat). */
export function sparkPoints(bend: number): [number, number][] {
  const unit = LOGO.size / 64;
  return SPARK_POINTS.map(([wx, wy], index) => {
    const [fx, fy] = FLAT_POINTS[index];
    const x = fx + (wx - fx) * bend;
    const y = fy + (wy - fy) * bend;
    return [LOGO.cx - LOGO.size / 2 + x * unit, LOGO.cy - LOGO.size / 2 + y * unit];
  });
}

/** Where the dot at the stroke's tip sits in stage pixels (it never moves). */
export const DOT = sparkPoints(1)[4];

function minutesOf(clock: string): number {
  const [hours, minutes] = clock.split(":").map(Number);
  return hours * 60 + minutes;
}

/** "02:37" for a minute count. */
export function clockLabel(minute: number): string {
  const whole = Math.floor(minute);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

const FIRST_MINUTE = minutesOf(FACTS.totals.firstRun);
const LAST_MINUTE = minutesOf(FACTS.totals.lastRun);

function childrenOf(id: string): string[] {
  const children = FACTS.orgEdges.filter(([managerId]) => managerId === id).map(([, userId]) => userId);
  const isSpine = (userId: string) => FACTS.roles.some((person) => person.userId === userId && person.spine !== null);
  return [...children.filter(isSpine), ...children.filter((userId) => !isSpine(userId))];
}

function rootId(): string {
  const children = new Set(FACTS.orgEdges.map(([, userId]) => userId));
  const root = FACTS.roles.find((person) => !children.has(person.userId));
  if (!root) throw new Error("No root role");
  return root.userId;
}

/** The user id at the top of the org (the CEO). */
export const ROOT_ID = rootId();

function leafOrder(id: string): string[] {
  const children = childrenOf(id);
  return children.length === 0 ? [id] : children.flatMap(leafOrder);
}

function subtreeAngle(id: string, leafAngles: Map<string, number>): number {
  const leaves = leafOrder(id).map((leaf) => leafAngles.get(leaf) ?? 0);
  return (Math.min(...leaves) + Math.max(...leaves)) / 2;
}

function fireSchedule(): Map<string, number> {
  const minutes = [...new Set(FACTS.roles.map((person) => minutesOf(person.ranAt)))].sort((a, b) => a - b);
  const span = BEAT.nightEnd - BEAT.nightStart;
  const schedule = new Map<string, number>();
  const seenPerMinute = new Map<number, number>();
  const ordered = [...FACTS.roles].sort((a, b) => minutesOf(a.ranAt) - minutesOf(b.ranAt));
  for (const person of ordered) {
    const minute = minutesOf(person.ranAt);
    const rank = minutes.indexOf(minute) / (minutes.length - 1);
    const linear = (minute - FIRST_MINUTE) / (LAST_MINUTE - FIRST_MINUTE);
    const seen = seenPerMinute.get(minute) ?? 0;
    seenPerMinute.set(minute, seen + 1);
    schedule.set(person.userId, BEAT.nightStart + span * (RANK_WEIGHT * rank + (1 - RANK_WEIGHT) * linear) * 0.94 + seen * SAME_MINUTE_STAGGER);
  }
  return schedule;
}

function buildNodes(): TreeNode[] {
  const leaves = leafOrder(ROOT_ID);
  const leafAngles = new Map(leaves.map((leaf, index) => [leaf, ANGLE_OFFSET + ((index + 0.5) / leaves.length) * Math.PI * 2]));
  const schedule = fireSchedule();
  const random = seededRandom(26);
  const nodes: TreeNode[] = [];
  const visit = (id: string, level: number, path: string[]) => {
    const person = FACTS.roles.find((candidate) => candidate.userId === id);
    if (!person) throw new Error(`No role ${id}`);
    const angle = level === 0 ? 0 : subtreeAngle(id, leafAngles);
    const radius = LEVEL_RADIUS[level];
    const lift = level === 0 ? 0 : (random() - 0.5) * 0.9;
    nodes.push({
      id,
      role: person.role,
      level,
      angle,
      position: new THREE.Vector3(Math.sin(angle) * radius, LEVEL_Y[level] + lift, Math.cos(angle) * radius),
      parentId: path.at(-1) ?? null,
      path: [...path, id],
      spine: person.spine,
      fireAt: schedule.get(id) ?? BEAT.nightStart,
      minute: minutesOf(person.ranAt),
      checked: person.checked,
    });
    for (const child of childrenOf(id)) visit(child, level + 1, [...path, id]);
  };
  visit(ROOT_ID, 0, []);
  return nodes;
}

/** Every role placed in the 3D tree: CEO on the axis at the top, each reporting level lower and wider. */
export const NODES = buildNodes();

/** Looks up a tree node by user id. */
export function nodeOf(id: string): TreeNode {
  const found = NODES.find((node) => node.id === id);
  if (!found) throw new Error(`No node ${id}`);
  return found;
}

function buildEdges(): TreeEdge[] {
  return FACTS.orgEdges.map(([from, to]) => {
    let drawFrom = Infinity;
    let drawTo = Infinity;
    for (const node of NODES) {
      const hop = node.path.indexOf(to);
      if (hop < 1) continue;
      const hops = node.path.length - 1;
      const start = node.fireAt - PULSE_SECONDS;
      const enter = start + ((hop - 1) / hops) * PULSE_SECONDS;
      if (enter < drawFrom) {
        drawFrom = enter;
        drawTo = start + (hop / hops) * PULSE_SECONDS;
      }
    }
    return { from, to, drawFrom, drawTo };
  });
}

/** Every reporting line, drawn the first time a night pulse runs down it. */
export const EDGES = buildEdges();

/** How long a pulse takes to run from the CEO down to the role it lands on. */
export const PULSE_LENGTH = PULSE_SECONDS;

/** The minute the on-screen clock shows at film time t during the night run. */
export function clockMinute(t: number): number {
  const points = [...NODES].sort((a, b) => a.fireAt - b.fireAt).map((node) => [node.fireAt, node.minute] as const);
  const keys: (readonly [number, number])[] = [[BEAT.nightStart - 0.4, FIRST_MINUTE], ...points];
  if (t <= keys[0][0]) return FIRST_MINUTE;
  for (let index = 1; index < keys.length; index += 1) {
    const [time, minute] = keys[index];
    if (t > time) continue;
    const [previousTime, previousMinute] = keys[index - 1];
    const span = time - previousTime;
    return span <= 0 ? minute : previousMinute + ((t - previousTime) / span) * (minute - previousMinute);
  }
  return LAST_MINUTE;
}

/** The spine roles in tree order: the ten who found the same story. */
export const SPINE_NODES = NODES.filter((node) => node.spine !== null);

/** The four roles the sunrise travels through, from the top of the org down to the field. */
export const STOP_IDS = ["u_thana", "u_siriporn", "u_anucha", "u_krit"] as const;

/** The captured drawer of each stop, keyed like `STOP_IDS`. */
export const STOP_SHOTS = ["story-ceo", "story-cfo", "story-rsm", "story-rep"] as const;

/** The Sales Director, whose drawer carries the story told in type. */
export const STORY_ID = "u_prasit";

/** The Sales Director's spine story. */
export function storyOf(id: string): Spine {
  const spine = nodeOf(id).spine;
  if (!spine) throw new Error(`No spine story for ${id}`);
  return spine;
}
