import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { THREE } from "../kit";
import { storyBars, type AgentBar } from "./signal-data";
import { DANGER } from "./signal-materials";

const BAR_SPACING = 1.45;
const BAR_WIDTH = 0.78;
const BAR_DEPTH = 0.78;
const WORLD_PER_PERCENT = 0.17;
const MIN_HEIGHT = 0.1;
const SLAB_THICKNESS = 0.07;

/** One extruded agent bar: its data, its mesh, and where its far end (tip) sits in the group. */
export type Bar3D = { data: AgentBar; mesh: THREE.Mesh; tip: THREE.Vector3; red: boolean };

function barMaterial(red: boolean): THREE.MeshPhysicalMaterial {
  return red
    ? new THREE.MeshPhysicalMaterial({ color: DANGER, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.18, transparent: true })
    : new THREE.MeshPhysicalMaterial({ color: "#e9e8fb", roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12, transparent: true });
}

/** The Sales Director's eight agent bars, extruded from the % against target on a glass slab at zero. */
export function buildBars() {
  const group = new THREE.Group();
  const data = storyBars();
  const offset = ((data.length - 1) * BAR_SPACING) / 2;
  const bars: Bar3D[] = data.map((bar, index) => {
    const height = Math.max(MIN_HEIGHT, Math.abs(bar.pct) * WORLD_PER_PERCENT);
    const geometry = new RoundedBoxGeometry(BAR_WIDTH, height, BAR_DEPTH, 4, Math.min(0.12, height / 2.2));
    const down = bar.pct < 0;
    geometry.translate(0, down ? -height / 2 : height / 2, 0);
    const red = down;
    const mesh = new THREE.Mesh(geometry, barMaterial(red));
    const x = index * BAR_SPACING - offset;
    mesh.position.set(x, 0, 0);
    group.add(mesh);
    return { data: bar, mesh, tip: new THREE.Vector3(x, down ? -height : height, 0), red };
  });
  const slabGeometry = new RoundedBoxGeometry(data.length * BAR_SPACING + 0.6, SLAB_THICKNESS, BAR_DEPTH + 0.9, 4, 0.03);
  const slabMaterial = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.55 });
  const slab = new THREE.Mesh(slabGeometry, slabMaterial);
  group.add(slab);
  const left = new THREE.Vector3(-offset - BAR_SPACING / 2 - 0.3, 0, 0);
  return { group, bars, slab, left, right: new THREE.Vector3(offset + BAR_SPACING / 2 + 0.3, 0, 0) };
}

/** Soft studio light for the bars: a room environment for reflections plus one key light; returns its disposer. */
export function studioLight(renderer: THREE.WebGLRenderer, scene: THREE.Scene): () => void {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.9;
  const key = new THREE.DirectionalLight("#ffffff", 1.4);
  key.position.set(-4, 10, 8);
  const fill = new THREE.HemisphereLight("#ffffff", "#c7c4f5", 0.6);
  scene.add(key, fill);
  return () => {
    environment.dispose();
    room.dispose();
    pmrem.dispose();
  };
}
