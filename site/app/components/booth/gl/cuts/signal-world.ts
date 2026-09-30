import { THREE } from "../kit";
import { AGENT_LINKS, agentNodes, alertAgentSeries, orgLayout, type OrgNode } from "./signal-data";
import { createChartArea, createChartLine, createLogo, createNode, createRibbon, type NodeUniforms, type RibbonUniforms } from "./signal-materials";

/** Radius of the organisation sphere in world units. */
export const SPHERE_RADIUS = 8;
/** World width of the Winyu tile at the core. */
export const CORE_TILE = 2.2;

const ALERT_AGENT_DIRECTION = new THREE.Vector3(0.93, -0.3, 0.2).normalize();
const CEO_DIRECTION = new THREE.Vector3(-0.3, 0.72, 0.62).normalize();
const ROLE_DIAMETER = 0.46;
const AGENT_DIAMETER = 0.62;
const CHART_WIDTH = 14;
const LITRES_TO_WORLD = 1.2e-4;
const EDGE_BEND = 1;

/** A glass node of the constellation with its resting place on the sphere. */
export type WorldNode = OrgNode & { home: THREE.Vector3; position: THREE.Vector3; mesh: THREE.Mesh; uniforms: NodeUniforms; diameter: number };

/** A ribbon between two nodes: a real reporting line, or an agent's link to the roles that own it. */
export type WorldEdge = { key: string; from: string; to: string; kind: "org" | "agent"; mesh: THREE.Mesh; uniforms: RibbonUniforms };

/** A ribbon from the core to one node: Winyu reaching that role overnight. */
export type WorldSpoke = { id: string; mesh: THREE.Mesh; uniforms: RibbonUniforms };

function basis(first: THREE.Vector3, hint: THREE.Vector3): THREE.Matrix4 {
  const e1 = first.clone().normalize();
  const e2 = hint.clone().sub(e1.clone().multiplyScalar(hint.dot(e1))).normalize();
  const e3 = e1.clone().cross(e2);
  return new THREE.Matrix4().makeBasis(e1, e2, e3);
}

function orientation(layoutAgent: THREE.Vector3, layoutCeo: THREE.Vector3): THREE.Matrix4 {
  const from = basis(layoutAgent, layoutCeo);
  const to = basis(ALERT_AGENT_DIRECTION, CEO_DIRECTION);
  return to.multiply(from.transpose());
}

/** The alert agent's node id: the agent whose daily line the film opens on. */
export function alertAgentId(): string {
  const series = alertAgentSeries();
  const found = agentNodes().find((agent) => agent.name === series.agent);
  if (!found) throw new Error("Alert agent is not a node");
  return found.id;
}

/** Builds the 28 nodes on the sphere, turned so the alert agent sits on the right rim and the CEO toward the upper left. */
export function buildNodes(): WorldNode[] {
  const layout = orgLayout();
  const agentId = alertAgentId();
  const agent = layout.find((node) => node.id === agentId);
  const ceo = layout.find((node) => node.depth === 0 && node.kind === "role");
  if (!agent || !ceo) throw new Error("Layout is missing the agent or the CEO");
  const turn = orientation(new THREE.Vector3(...agent.direction), new THREE.Vector3(...ceo.direction));
  return layout.map((node) => {
    const home = new THREE.Vector3(...node.direction).applyMatrix4(turn).multiplyScalar(SPHERE_RADIUS);
    const diameter = node.kind === "agent" ? AGENT_DIAMETER : ROLE_DIAMETER;
    const mesh = createNode(diameter);
    mesh.renderOrder = 2;
    return { ...node, home, position: home.clone(), mesh, uniforms: mesh.userData.uniforms, diameter };
  });
}

/** Builds a ribbon for every reporting line and every agent link. */
export function buildEdges(): WorldEdge[] {
  const toEdge = (from: string, to: string, kind: "org" | "agent"): WorldEdge => {
    const mesh = createRibbon(kind === "org" ? 2.2 : 2.6);
    mesh.renderOrder = 1;
    return { key: `${from}>${to}`, from, to, kind, mesh, uniforms: mesh.userData.uniforms };
  };
  return [...orgLayoutEdges().map(([from, to]) => toEdge(from, to, "org")), ...AGENT_LINKS.map(([from, to]) => toEdge(from, to, "agent"))];
}

function orgLayoutEdges(): [string, string][] {
  return orgLayout()
    .filter((node) => node.parentId !== null)
    .map((node) => [node.parentId as string, node.id]);
}

/** Builds one spoke from the core to every node. */
export function buildSpokes(nodes: WorldNode[]): WorldSpoke[] {
  return nodes.map((node) => {
    const mesh = createRibbon(1.6);
    mesh.renderOrder = 1;
    const spoke = { id: node.id, mesh, uniforms: mesh.userData.uniforms };
    spoke.uniforms.uBaseAlpha.value = 0;
    return spoke;
  });
}

/** Sets a ribbon to run from a to b, bent outward onto the sphere by `bend` (0 is a straight line). */
export function laceRibbon(uniforms: RibbonUniforms, a: THREE.Vector3, b: THREE.Vector3, bend = EDGE_BEND): void {
  uniforms.uA.value.copy(a);
  uniforms.uB.value.copy(b);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const radius = (a.length() + b.length()) / 2;
  const onSphere = mid.length() > 1e-3 ? mid.clone().setLength(radius) : mid.clone();
  const apex = mid.clone().lerp(onSphere, bend);
  uniforms.uC.value.copy(apex.multiplyScalar(2).sub(mid));
}

/** The alert agent's daily line placed in world space so its last point is the agent's node. */
export function buildChart(end: THREE.Vector3) {
  const series = alertAgentSeries();
  const last = series.points[series.points.length - 1].litres;
  const count = series.points.length - 1;
  const points = series.points.map((point, index) => new THREE.Vector3(end.x - CHART_WIDTH + (CHART_WIDTH * index) / count, end.y + (point.litres - last) * LITRES_TO_WORLD, end.z));
  const baseline = end.y - last * LITRES_TO_WORLD;
  const line = createChartLine(points, series.cliffIndex, 5);
  const area = createChartArea(points, baseline, series.cliffIndex);
  line.renderOrder = 3;
  area.renderOrder = 1;
  const top = Math.max(...points.map((point) => point.y));
  return { series, points, baseline, top, line, area, center: new THREE.Vector3(end.x - CHART_WIDTH / 2, (baseline + top) / 2, end.z) };
}

/** The point `drawn` (a fractional point index) along the daily line. */
export function pointAlong(points: THREE.Vector3[], drawn: number): THREE.Vector3 {
  const clamped = Math.min(points.length - 1, Math.max(0, drawn));
  const index = Math.min(points.length - 2, Math.floor(clamped));
  return points[index].clone().lerp(points[index + 1], clamped - index);
}

/** The Winyu tile at the core of the constellation. */
export function buildCore() {
  const mesh = createLogo(CORE_TILE);
  mesh.renderOrder = 2;
  return { mesh, uniforms: mesh.userData.uniforms };
}

/** A node's path home to the core along its reporting lines: itself, each manager up to the CEO, then the core. */
export function pathToCore(node: WorldNode, byId: Map<string, WorldNode>): THREE.Vector3[] {
  const path = [node.home.clone()];
  let parentId = node.kind === "agent" ? "u_anucha" : node.parentId;
  while (parentId) {
    const parent = byId.get(parentId);
    if (!parent) break;
    path.push(parent.home.clone());
    parentId = parent.parentId;
  }
  path.push(new THREE.Vector3());
  return path;
}

/** The point a fraction `progress` of the way along a polyline. */
export function alongPath(path: THREE.Vector3[], progress: number): THREE.Vector3 {
  const lengths = path.slice(1).map((point, index) => point.distanceTo(path[index]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = Math.min(1, Math.max(0, progress)) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index] || index === lengths.length - 1) return path[index].clone().lerp(path[index + 1], lengths[index] > 0 ? Math.min(1, remaining / lengths[index]) : 1);
    remaining -= lengths[index];
  }
  return path[path.length - 1].clone();
}
