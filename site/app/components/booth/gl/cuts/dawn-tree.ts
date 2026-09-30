import { THREE } from "../kit";
import { EDGES, NODES, PULSE_LENGTH, ROOT_ID, SPINE_NODES, nodeOf, type TreeNode } from "./dawn-plan";
import { bezierPath, createStrand, type PathFn, type Strand } from "./dawn-strand";

const EDGE_SEGMENTS = 40;
const FILAMENT_SEGMENTS = 64;
const CORE_SIZE = 0.2;
const HALO_SIZE = 1.25;
const ROOT_SCALE = 1.6;
const FLASH_DECAY = 3.2;

const DIM = new THREE.Color(0.36, 0.38, 0.86);
const LIT = new THREE.Color(0.9, 0.86, 1.0);
const WARM = new THREE.Color(1.0, 0.64, 0.46);
const WARM_SOFT = new THREE.Color(0.95, 0.72, 0.82);
const SPINE_RAMP = [new THREE.Color("#6366f1"), new THREE.Color("#8b5cf6"), new THREE.Color("#fb7185")];

/** What the tree should look like at one instant. */
export type TreeState = {
  t: number;
  alpha: number;
  spine: number;
  warm: number;
  pulse: number;
  filamentFrom: number;
  filamentTo: number;
  filamentAlpha: number;
  convergence: THREE.Vector3;
  morph: number;
  focus: string | null;
  focusLevel: number;
};

/** The 3D org tree: glowing role nodes, reporting lines drawn by night pulses, and the filaments of the shared story. */
export type Tree = { update: (state: TreeState) => void; dispose: () => void };

type NodeSprites = { node: TreeNode; core: THREE.Sprite; halo: THREE.Sprite; pulse: THREE.Sprite; spineIndex: number };
type EdgeStrand = { strand: Strand; path: PathFn; drawFrom: number; drawTo: number; spine: boolean; order: number };
type Filament = { strand: Strand; path: PathFn; head: THREE.Sprite; color: THREE.Color };

/** A soft round glow drawn once into a canvas, shared by every sprite. */
export function glowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D context");
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.18, "rgba(255,255,255,0.55)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0.12)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A round disc texture with a crisp edge, for node cores. */
export function discTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D context");
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.6, "rgba(255,255,255,1)");
  gradient.addColorStop(0.8, "rgba(255,255,255,0.35)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A sprite that adds light: additive, never depth-writing, never tone-mapped. */
export function lightSprite(map: THREE.Texture): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  sprite.frustumCulled = false;
  return sprite;
}

function edgePath(from: THREE.Vector3, to: THREE.Vector3): PathFn {
  const drop = from.y - to.y;
  const out = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
  const b = from.clone().add(out.clone().multiplyScalar(0.25)).add(new THREE.Vector3(0, -drop * 0.55, 0));
  const c = to.clone().add(out.clone().multiplyScalar(-0.1)).add(new THREE.Vector3(0, drop * 0.5, 0));
  return bezierPath(from.clone(), b, c, to.clone());
}

function spineColor(index: number): THREE.Color {
  const along = (index / Math.max(1, SPINE_NODES.length - 1)) * (SPINE_RAMP.length - 1);
  const low = Math.floor(along);
  const high = Math.min(SPINE_RAMP.length - 1, low + 1);
  return SPINE_RAMP[low].clone().lerp(SPINE_RAMP[high], along - low);
}

function retraction(morph: number, level: number): number {
  return smooth((morph - (3 - level) * 0.24) / 0.42);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smooth(value: number): number {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

/** Adds the org tree to the scene. */
export function createTree(scene: THREE.Scene, glow: THREE.Texture, disc: THREE.Texture): Tree {
  const group = new THREE.Group();
  scene.add(group);
  const paths = new Map<string, PathFn>();

  const edges: EdgeStrand[] = EDGES.map((edge, order) => {
    const path = edgePath(nodeOf(edge.from).position, nodeOf(edge.to).position);
    paths.set(edge.to, path);
    const strand = createStrand(EDGE_SEGMENTS, 1.6, (s) => new THREE.Color(0.75, 0.74, 1).lerp(new THREE.Color(0.95, 0.9, 1), s));
    group.add(strand.line);
    const spine = nodeOf(edge.from).spine !== null && nodeOf(edge.to).spine !== null;
    return { strand, path, drawFrom: edge.drawFrom, drawTo: edge.drawTo, spine, order };
  });

  const sprites: NodeSprites[] = NODES.map((node) => {
    const halo = lightSprite(glow);
    const core = lightSprite(disc);
    const pulse = lightSprite(glow);
    group.add(halo, core, pulse);
    return { node, core, halo, pulse, spineIndex: SPINE_NODES.indexOf(node) };
  });

  const filaments: Filament[] = SPINE_NODES.map((node, index) => {
    const color = spineColor(index);
    const strand = createStrand(FILAMENT_SEGMENTS, 2.4, (s) => color.clone().multiplyScalar(1.3).lerp(new THREE.Color(2.2, 2, 2.4), s * s));
    const head = lightSprite(glow);
    group.add(strand.line, head);
    return { strand, path: bezierPath(node.position, node.position, node.position, node.position), head, color };
  });
  const convergenceGlow = lightSprite(glow);
  group.add(convergenceGlow);

  const reachedAt = new Map(EDGES.map((edge) => [edge.to, edge.drawTo]));
  const nodeColor = new THREE.Color();
  const scratch = new THREE.Vector3();
  const target = new THREE.Vector3();

  const pulsePosition = (node: TreeNode, progress: number, out: THREE.Vector3) => {
    const hops = node.path.length - 1;
    const along = clamp01(progress) * hops;
    const hop = Math.min(hops - 1, Math.floor(along));
    const path = paths.get(node.path[hop + 1]);
    if (!path) return out.copy(node.position);
    return path(along - hop, out);
  };

  const updateEdges = (state: TreeState) => {
    for (const edge of edges) {
      const drawn = smooth((state.t - edge.drawFrom) / Math.max(0.05, edge.drawTo - edge.drawFrom));
      const retract = retraction(state.morph, nodeOf(EDGES[edge.order].to).level);
      const reach = drawn * (1 - retract);
      edge.strand.draw(edge.path, 0, Math.max(0.0001, reach));
      const base = 0.3 + 0.15 * clamp01((state.t - edge.drawTo) / 0.6);
      const spineLift = edge.spine ? 0.55 : -0.24;
      const opacity = (base + spineLift * state.spine + (edge.spine ? 0.3 : 0.1) * state.warm) * state.alpha;
      edge.strand.material.opacity = clamp01(reach > 0.001 ? opacity : 0);
      const tint = edge.spine ? 1 + 0.9 * state.spine + 0.6 * state.warm : 1;
      edge.strand.material.color.setRGB(tint, tint * (1 - 0.18 * state.warm), tint * (1 - 0.3 * state.warm));
      edge.strand.material.linewidth = 1.6 + (edge.spine ? 1.4 * Math.max(state.spine, state.warm) : 0);
    }
  };

  const updateNode = (entry: NodeSprites, state: TreeState) => {
    const { node, core, halo, pulse } = entry;
    const isRoot = node.id === ROOT_ID;
    const reached = isRoot ? 1 : smooth((state.t - (reachedAt.get(node.id) ?? 0)) / 0.25);
    const since = state.t - node.fireAt;
    const lit = smooth(since / 0.3);
    const flash = since > 0 ? Math.exp(-since * FLASH_DECAY) : 0;

    nodeColor.copy(DIM).lerp(LIT, lit);
    let intensity = 0.55 + 0.9 * lit + 2.6 * flash;
    let size = 1 + 0.35 * lit + 0.8 * flash;
    if (isRoot) intensity = Math.max(intensity, 1.1);

    if (entry.spineIndex >= 0) {
      const beat = 0.75 + 0.25 * Math.sin(state.t * 5 + entry.spineIndex * 0.55);
      nodeColor.lerp(spineColor(entry.spineIndex), state.spine);
      intensity += state.spine * (1.6 * beat);
      size += state.spine * 0.55 * beat;
      nodeColor.lerp(WARM, state.warm);
      intensity += state.warm * 1.2;
      size += state.warm * 0.4;
    } else {
      intensity *= 1 - 0.62 * state.spine;
      nodeColor.lerp(WARM_SOFT, state.warm);
      intensity *= 1 - 0.5 * state.warm;
    }
    if (state.focus === node.id) {
      intensity += 1.2 * state.focusLevel;
      size += 0.25 * state.focusLevel;
    }

    const position = node.position;
    const fade = isRoot ? 1 : 1 - smooth(retraction(state.morph, node.level) * 4);
    const visible = reached * state.alpha * fade;
    const scale = (isRoot ? ROOT_SCALE : 1) * size;

    core.position.copy(position);
    halo.position.copy(position);
    core.scale.setScalar(CORE_SIZE * scale);
    halo.scale.setScalar(HALO_SIZE * scale * (0.8 + 0.2 * lit));
    core.material.color.copy(nodeColor).multiplyScalar(intensity * visible);
    halo.material.color.copy(nodeColor).multiplyScalar(0.55 * intensity * visible);

    const traveled = (state.t - (node.fireAt - PULSE_LENGTH)) / PULSE_LENGTH;
    const pulseOn = !isRoot && traveled > 0 && traveled < 1.15 ? Math.min(1, (1.15 - traveled) / 0.15) : 0;
    pulse.visible = pulseOn > 0 && state.pulse > 0;
    if (!pulse.visible) return;
    pulsePosition(node, traveled, pulse.position);
    pulse.scale.setScalar(0.7);
    pulse.material.color.setRGB(2.2, 2.1, 3.2).multiplyScalar(pulseOn * state.pulse * state.alpha);
  };

  const updateFilaments = (state: TreeState) => {
    const draw = state.filamentTo > state.filamentFrom + 0.0005 && state.filamentAlpha > 0;
    filaments.forEach((filament, index) => {
      filament.strand.line.visible = draw;
      filament.head.visible = draw;
      if (!draw) return;
      const node = SPINE_NODES[index].position;
      const toward = target.copy(state.convergence).sub(node);
      const b = node.clone().add(toward.clone().multiplyScalar(0.25)).add(new THREE.Vector3(0, 2.4 + index * 0.25, 0));
      const c = state.convergence.clone().sub(toward.clone().multiplyScalar(0.3)).add(new THREE.Vector3(0, 1.2 - index * 0.2, 0));
      filament.path = bezierPath(node.clone(), b, c, state.convergence.clone());
      const lag = index * 0.025;
      const to = clamp01(state.filamentTo - lag);
      const from = Math.min(to, state.filamentFrom);
      filament.strand.draw(filament.path, from, Math.max(from + 0.0001, to));
      filament.strand.material.opacity = state.filamentAlpha;
      filament.path(to, filament.head.position);
      filament.head.scale.setScalar(0.9);
      filament.head.material.color.copy(filament.color).multiplyScalar(2.6 * state.filamentAlpha * (to < 1 ? 1 : 0.4));
    });
    convergenceGlow.visible = draw;
    if (!draw) return;
    const gathered = smooth((state.filamentTo - 0.8) / 0.2);
    convergenceGlow.position.copy(state.convergence);
    convergenceGlow.scale.setScalar(0.5 + 0.7 * gathered);
    convergenceGlow.material.color.setRGB(2.4, 2.1, 2.6).multiplyScalar(gathered * state.filamentAlpha);
  };

  return {
    update(state) {
      group.visible = state.alpha > 0.001 || state.filamentAlpha > 0.001;
      updateEdges(state);
      for (const entry of sprites) updateNode(entry, state);
      updateFilaments(state);
    },
    dispose() {
      for (const edge of edges) edge.strand.dispose();
      for (const filament of filaments) filament.strand.dispose();
      for (const entry of sprites) for (const sprite of [entry.core, entry.halo, entry.pulse]) sprite.material.dispose();
      for (const filament of filaments) filament.head.material.dispose();
      convergenceGlow.material.dispose();
    },
  };
}
