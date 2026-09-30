import type { FilmHost } from "../film";
import { createCamera, createRenderer, FACTS, loadShotTexture, mark, SPARK_POINTS, THREE, type Mark } from "../kit";
import { glStage } from "../stage";
import { grouped, HERO_SHOTS, overnightRuns } from "./signal-data";
import { buildBars, studioLight } from "./signal-bars";
import { createBackdrop, createNode, createRibbon, createScreenCrop, logoPoint } from "./signal-materials";
import { buildOverlay, type Overlay } from "./signal-overlay";
import { applyPose, ease, placeOnStage, toStage, type Viewport } from "./signal-rig";
import { buildPoses, writeScript, type Tracks } from "./signal-script";
import { showElement, showKinetic } from "./signal-type";
import { alertAgentId, alongPath, buildChart, buildCore, buildEdges, buildNodes, buildSpokes, CORE_TILE, laceRibbon, pathToCore, pointAlong, SPHERE_RADIUS, type WorldEdge, type WorldNode } from "./signal-world";

/** Loop length of the signal cut, in seconds. */
export const SIGNAL_SECONDS = 60;

const STAGE: Viewport = { x: 0, w: 1920, h: 1080 };
const SHAKE_PIXELS = 4;
const BARS_OFFSET = new THREE.Vector3(-3.0, 1.0, 6.0);
const CARD_WIDTH_PX = 600;
const HERO_SHOT_WIDTH_PX = 540;
const HERO_SHOT_LEFT = 1250;
const HERO_SHOT_TOP = 110;
const SCREEN_DEPTH = 9;
const CROP_WORLD_WIDTH = 1;
const S1_DOT = 0.3;
const STROKE_PIXELS = 26;
const BASE_EDGE = new THREE.Color("#b9bdd6");
const DANGER_EDGE = new THREE.Color("#f3a3b5");
const REP_SCOPE = new Set(["u_krit", "agent_1"]);
const RSM_SCOPE = new Set(["u_anucha", "u_krit", "u_nok", "agent_0", "agent_1"]);
const BACK_OUT = ease("back.out(1.7)");
const CORE_HIDE_NEAR = 27.2;
const CORE_HIDE_FAR = 29.2;
const RSM_CROP_SCALE = 2.1;

type Pass = "full" | "left" | "main";

function padded(region: Mark, pad: number, padY = pad): Mark {
  return { ...region, x: region.x - pad, y: region.y - padY, w: region.w + pad * 2, h: region.h + padY * 2 };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

async function createSignal(host: FilmHost) {
  const renderer = createRenderer(host.canvas);
  renderer.setClearColor("#f7f7fb", 1);
  const scene = new THREE.Scene();
  const camera = createCamera(35);
  const leftCamera = createCamera(35);
  const disposeLight = studioLight(renderer, scene);

  const nodes = buildNodes();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const alertId = alertAgentId();
  const alertNode = byId.get(alertId) as WorldNode;
  const edges = buildEdges();
  const spokes = buildSpokes(nodes);
  const core = buildCore();
  const chart = buildChart(alertNode.home);
  const bars = buildBars();
  bars.group.position.copy(alertNode.home).add(BARS_OFFSET);
  const dot = createNode(1);
  dot.renderOrder = 4;
  const echo = createNode(alertNode.diameter);
  echo.renderOrder = 3;
  const echoLink = createRibbon(2.4);
  echoLink.renderOrder = 1;
  const backdrop = createBackdrop();
  const paths = new Map(nodes.map((node) => [node.id, pathToCore(node, byId)]));

  const [storyTexture, dashboardTexture, ...heroTextures] = await Promise.all([loadShotTexture(renderer, "story"), loadShotTexture(renderer, "dashboard"), ...Object.values(HERO_SHOTS).map((id) => loadShotTexture(renderer, id))]);
  const causeCard = createScreenCrop(storyTexture, mark("story", "card"), CROP_WORLD_WIDTH, 16);
  const rsmCrop = createScreenCrop(dashboardTexture, padded(mark("dashboard", "scope"), 14, 5), CROP_WORLD_WIDTH, 12);
  const heroShots = Object.entries(HERO_SHOTS).map(([id, shot], index) => ({ id, region: mark(shot, "story"), mesh: createScreenCrop(heroTextures[index], padded(mark(shot, "story"), 14), CROP_WORLD_WIDTH, 18) }));
  for (const crop of [causeCard, rsmCrop, ...heroShots.map((shot) => shot.mesh)]) {
    crop.renderOrder = 10;
    crop.material.depthTest = false;
  }

  scene.add(backdrop, chart.area, chart.line, core.mesh, dot, echo, echoLink, bars.group, causeCard, rsmCrop, ...heroShots.map((shot) => shot.mesh));
  for (const node of nodes) scene.add(node.mesh);
  for (const edge of edges) scene.add(edge.mesh);
  for (const spoke of spokes) {
    spoke.uniforms.uLitReverse.value = byId.get(spoke.id)?.kind === "agent" ? 1 : 0;
    spoke.uniforms.uRed.value = byId.get(spoke.id)?.kind === "agent" ? 1 : 0;
    scene.add(spoke.mesh);
  }

  const poses = buildPoses(byId, chart, bars.group.position);
  const tracks: Tracks = writeScript(SIGNAL_SECONDS, { nodes, edges, poses, barCount: bars.bars.length }, chart.series.cliffIndex, chart.points.length - 1);
  const overlay = buildOverlay(host.overlay);
  const brandCamera = createCamera(35);
  applyPose(brandCamera, poses.brand, 1920, 1080);
  const brandFacing = brandCamera.quaternion.clone();
  const runs = overnightRuns();
  const spineRuns = runs.map((run) => FACTS.roles.find((role) => role.userId === run.id)?.spine !== null);

  const get = (key: string) => tracks.get(key);
  applyPose(camera, poses.system, 1920, 1080);
  renderer.compile(scene, camera);

  function logoWorld(x: number, y: number): THREE.Vector3 {
    return logoPoint(x, y, CORE_TILE).applyMatrix4(core.mesh.matrixWorld);
  }

  function depthFade(point: THREE.Vector3, view: THREE.Camera): number {
    const centreDistance = view.position.length();
    const distance = point.distanceTo(view.position);
    return 1 - 0.62 * clamp01((distance - (centreDistance - SPHERE_RADIUS)) / (2 * SPHERE_RADIUS));
  }

  function scopeWeight(id: string, pass: Pass): number {
    if (pass !== "main") return 1;
    const on = get("scope.on");
    if (on <= 0) return 1;
    const rsm = get("scope.rsm");
    const inside = REP_SCOPE.has(id) ? 1 : RSM_SCOPE.has(id) ? rsm : 0;
    return 1 - on * (1 - Math.max(inside, 0.1));
  }

  function placeNodes(time: number) {
    const contract = get("contract");
    for (const node of nodes) {
      const path = paths.get(node.id) as THREE.Vector3[];
      node.position.copy(contract > 0 ? alongPath(path, contract) : node.home);
      node.mesh.position.copy(node.position);
    }
    core.mesh.position.set(0, 0, 0);
    core.mesh.scale.setScalar(get("core.scale") * (1 + 0.14 * get("core.flare")));
    if (time > 51) core.mesh.quaternion.copy(brandFacing);
    core.mesh.updateMatrixWorld();
  }

  function paintNodes(view: THREE.Camera, pass: Pass) {
    const world = get("world.alpha") * get("nodes.alpha");
    const contract = get("contract");
    for (const node of nodes) {
      const appear = get(`appear:${node.id}`);
      const ignite = get(`ignite:${node.id}`);
      const red = node.kind === "agent" ? get(`red:${node.id}`) : 0;
      const alpha = clamp01(appear) * world * depthFade(node.position, view) * scopeWeight(node.id, pass);
      const u = node.uniforms;
      u.uSize.value = node.diameter * Math.max(0, appear) * (1 + 0.3 * ignite * (node.kind === "role" ? 1 : 0)) * (1 - 0.45 * contract);
      u.uAlpha.value = alpha;
      u.uIgnite.value = ignite;
      u.uRed.value = red;
      u.uHalo.value = Math.max(ignite * 0.9, red * 0.7);
      u.uRing.value = get(`ring:${node.id}`);
      node.mesh.visible = alpha > 0.003;
    }
    if (pass !== "left") core.mesh.quaternion.copy(get("contract") > 0 ? brandFacing : view.quaternion);
    else core.mesh.quaternion.copy(view.quaternion);
    core.mesh.updateMatrixWorld();
  }

  function wSlot(index: number, count: number): { a: THREE.Vector3; b: THREE.Vector3; from: number; to: number } {
    const perSegment = count / (SPARK_POINTS.length - 1);
    const segment = Math.min(SPARK_POINTS.length - 2, Math.floor(index / perSegment));
    const local = index - segment * perSegment;
    const [x0, y0] = SPARK_POINTS[segment];
    const [x1, y1] = SPARK_POINTS[segment + 1];
    const f0 = local / perSegment;
    const f1 = (local + 1) / perSegment;
    const ax = x0 + (x1 - x0) * f0;
    const bx = x0 + (x1 - x0) * f1;
    return { a: logoWorld(ax, y0 + (y1 - y0) * f0), b: logoWorld(bx, y0 + (y1 - y0) * f1), from: (ax - 9) / 46, to: (bx - 9) / 46 };
  }

  function paintEdges(view: THREE.Camera, pass: Pass, viewport: Viewport) {
    const world = get("world.alpha") * get("edges.alpha");
    const straighten = get("straighten");
    const bend = get("bend");
    const edgesLit = get("edges.lit");
    const heal = get("links.heal");
    edges.forEach((edge, index) => {
      const from = byId.get(edge.from) as WorldNode;
      const to = byId.get(edge.to) as WorldNode;
      const u = edge.uniforms;
      let a = from.position;
      let b = to.position;
      let width = edge.kind === "org" ? 2.2 : 2.6;
      if (straighten > 0) {
        const slot = wSlot(index, edges.length);
        a = a.clone().lerp(slot.a, straighten);
        b = b.clone().lerp(slot.b, straighten);
        width += (STROKE_PIXELS - width) * straighten;
        u.uSpanFrom.value = slot.from * straighten;
        u.uSpanTo.value = 1 + (slot.to - 1) * straighten;
        u.uLitReverse.value = 0;
      }
      laceRibbon(u, a, b, straighten > 0 ? 0 : bend);
      const litNow = get(`lit:${edge.key}`);
      u.uWidth.value = width + (straighten > 0 ? 0 : 1.6 * litNow);
      u.uDraw.value = get(`draw:${edge.key}`);
      u.uLit.value = Math.max(litNow, edgesLit);
      u.uHead.value = get(`head:${edge.key}`);
      const agentLink = edge.kind === "agent";
      u.uBase.value.copy(agentLink ? DANGER_EDGE.clone().lerp(BASE_EDGE, heal) : BASE_EDGE);
      u.uBaseAlpha.value = agentLink ? 0.85 : 0.6;
      u.uDash.value = agentLink && heal < 0.5 && straighten === 0 ? 1 : 0;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const weight = Math.min(scopeWeight(edge.from, pass), scopeWeight(edge.to, pass));
      const reveal = Math.min(clamp01(get(`appear:${edge.from}`)), clamp01(get(`appear:${edge.to}`)));
      u.uAlpha.value = world * weight * reveal * (straighten > 0 ? 1 : depthFade(mid, view));
      edge.mesh.visible = u.uAlpha.value > 0.003 && u.uDraw.value > 0;
      (edge.mesh.material as THREE.ShaderMaterial).uniforms.uResolution.value.set(viewport.w, viewport.h);
    });
    for (const spoke of spokes) {
      const node = byId.get(spoke.id) as WorldNode;
      laceRibbon(spoke.uniforms, new THREE.Vector3(), node.position, 0);
      spoke.uniforms.uLit.value = get(`spoke:${spoke.id}`);
      spoke.uniforms.uHead.value = spoke.uniforms.uLit.value > 0 && spoke.uniforms.uLit.value < 1 ? 1 : 0;
      spoke.uniforms.uAlpha.value = get(`spokeAlpha:${spoke.id}`) * get("world.alpha") * scopeWeight(spoke.id, pass);
      spoke.mesh.visible = spoke.uniforms.uAlpha.value > 0.003;
      (spoke.mesh.material as THREE.ShaderMaterial).uniforms.uResolution.value.set(viewport.w, viewport.h);
    }
  }

  function paintCore(view: THREE.Camera, time: number, pass: Pass) {
    const u = core.uniforms;
    const brandOn = get("logo.alpha");
    if (brandOn > 0) {
      u.uAlpha.value = brandOn;
      u.uTile.value = get("logo.tile");
      u.uWhite.value = get("logo.white");
      u.uDraw.value = 1;
      u.uRetract.value = get("logo.retract");
      u.uDot.value = 0;
      u.uShadow.value = 1;
      return;
    }
    const closeness = time < 51.3 ? THREE.MathUtils.smoothstep(view.position.length(), CORE_HIDE_NEAR, CORE_HIDE_FAR) : 1;
    const scoped = pass === "main" ? 1 - get("scope.on") : 1;
    u.uAlpha.value = get("core.alpha") * get("world.alpha") * closeness * scoped;
    u.uTile.value = 1;
    u.uWhite.value = 1;
    u.uDraw.value = 1;
    u.uRetract.value = 0;
    u.uDot.value = 1;
  }

  function paintChart(viewport: Viewport) {
    const draw = get("line.draw");
    for (const mesh of [chart.line, chart.area]) {
      const u = mesh.userData.uniforms;
      u.uDraw.value = draw;
      u.uRed.value = get("line.red");
      u.uAlpha.value = get("chart.alpha");
      mesh.visible = u.uAlpha.value > 0.003;
    }
    (chart.line.material as THREE.ShaderMaterial).uniforms.uResolution.value.set(viewport.w, viewport.h);
  }

  function paintDot(time: number) {
    const u = dot.userData.uniforms;
    const alpha = get("dot.alpha");
    dot.visible = alpha > 0.003;
    u.uAlpha.value = alpha;
    u.uIgnite.value = 1;
    u.uShadow.value = 1;
    if (time < 20) {
      dot.position.copy(pointAlong(chart.points, get("line.draw")));
      u.uSize.value = get("dot.size");
      u.uRed.value = get("dot.red");
      u.uWhite.value = 0;
      u.uHalo.value = 0.6;
      return;
    }
    const tipScale = get("core.scale");
    const tip = logoWorld(SPARK_POINTS[4][0], SPARK_POINTS[4][1]);
    const drop = new THREE.Vector3(0, 1, 0).applyQuaternion(brandFacing).multiplyScalar((1 - get("dot.land")) * 1.6);
    const tipSize = (10 / 64) * CORE_TILE * tipScale;
    const home = get("home");
    dot.position.copy(tip.add(drop).lerp(chart.points[0], home));
    u.uSize.value = tipSize + (S1_DOT - tipSize) * home;
    u.uRed.value = 0;
    u.uWhite.value = get("logo.white");
    u.uHalo.value = 0.6 * (1 - get("logo.white"));
  }

  function paintBars() {
    const alpha = get("bars.alpha");
    bars.group.visible = alpha > 0.003;
    bars.bars.forEach((bar, index) => {
      bar.mesh.scale.y = Math.max(0.001, get(`bar:${index}`));
      (bar.mesh.material as THREE.MeshPhysicalMaterial).opacity = alpha;
    });
    (bars.slab.material as THREE.MeshPhysicalMaterial).opacity = 0.55 * alpha;
  }

  function paintEcho(view: THREE.Camera, viewport: Viewport) {
    const rise = get("echo.rise");
    const out = get("echo.out");
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(view.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(view.quaternion);
    echo.position.copy(alertNode.home).addScaledVector(right, 0.8 * rise).addScaledVector(up, 3.1 * rise);
    const u = echo.userData.uniforms;
    u.uSize.value = alertNode.diameter * 0.9;
    u.uAlpha.value = 0.55 * clamp01(rise * 3) * (1 - out);
    u.uRed.value = 1 - get("echo.heal");
    u.uIgnite.value = get("echo.heal");
    u.uHalo.value = 0.4;
    echo.visible = u.uAlpha.value > 0.003;
    const link = echoLink.userData.uniforms;
    laceRibbon(link, echo.position, alertNode.home, 0);
    link.uDraw.value = get("echo.link");
    link.uDash.value = 1;
    link.uBaseAlpha.value = 0.9;
    link.uBase.value.copy(DANGER_EDGE.clone().lerp(BASE_EDGE, get("echo.heal")));
    link.uAlpha.value = 1 - out;
    echoLink.visible = link.uDraw.value > 0 && out < 1;
    (echoLink.material as THREE.ShaderMaterial).uniforms.uResolution.value.set(viewport.w, viewport.h);
  }

  function paintScreens(view: THREE.PerspectiveCamera, viewport: Viewport) {
    const cardIn = get("card.in");
    const cardAlpha = clamp01(cardIn) * (1 - get("cause.out"));
    causeCard.visible = cardAlpha > 0.003;
    if (causeCard.visible) {
      placeOnStage(causeCard, view, viewport, 1490, 585, CARD_WIDTH_PX * (0.92 + 0.08 * cardIn), SCREEN_DEPTH, CROP_WORLD_WIDTH, -0.08);
      causeCard.userData.uniforms.uAlpha.value = cardAlpha;
    }
    for (const shot of heroShots) {
      const enter = get(`shot:${shot.id}`);
      const alpha = clamp01(enter) * (1 - get(`heroOut:${shot.id}`));
      shot.mesh.visible = alpha > 0.003;
      if (!shot.mesh.visible) continue;
      const height = (HERO_SHOT_WIDTH_PX * shot.region.h) / shot.region.w;
      placeOnStage(shot.mesh, view, viewport, HERO_SHOT_LEFT + HERO_SHOT_WIDTH_PX / 2 + (1 - enter) * 80, HERO_SHOT_TOP + height / 2, HERO_SHOT_WIDTH_PX, SCREEN_DEPTH, CROP_WORLD_WIDTH, -0.14);
      shot.mesh.userData.uniforms.uAlpha.value = alpha;
    }
  }

  function paintRsmCrop(pass: Pass, view: THREE.PerspectiveCamera, viewport: Viewport) {
    const enter = get("crop.rsm");
    const alpha = clamp01(enter) * (1 - get("scope.out"));
    rsmCrop.visible = pass === "main" && alpha > 0.003;
    if (!rsmCrop.visible) return;
    const tag = overlay.scope.rsm;
    const region = padded(mark("dashboard", "scope"), 14, 5);
    const width = region.w * RSM_CROP_SCALE;
    const height = region.h * RSM_CROP_SCALE;
    const left = Math.min(1880 - width, tag.offsetLeft);
    placeOnStage(rsmCrop, view, viewport, left + width / 2, tag.offsetTop + tag.offsetHeight + 24 + height / 2, width * (0.9 + 0.1 * enter), 6, CROP_WORLD_WIDTH);
    rsmCrop.userData.uniforms.uAlpha.value = alpha;
  }

  function prepare(pass: Pass, view: THREE.PerspectiveCamera, viewport: Viewport, time: number) {
    paintNodes(view, pass);
    paintEdges(view, pass, viewport);
    paintCore(view, time, pass);
    paintChart(viewport);
    paintDot(time);
    paintBars();
    paintEcho(view, viewport);
    const screensVisible = pass !== "left";
    if (screensVisible) paintScreens(view, viewport);
    else for (const mesh of [causeCard, ...heroShots.map((shot) => shot.mesh)]) mesh.visible = false;
    paintRsmCrop(pass, view, viewport);
  }

  function drawHook(o: Overlay, view: THREE.Camera) {
    const hook = o.hook;
    const out = get("hook.out");
    showElement(hook.label, get("hook.label"), out, 20);
    showElement(hook.before, get("hook.before"), out, 40);
    showElement(hook.arrow, get("hook.after"), out, 20);
    showElement(hook.after, get("hook.after"), out, 40);
    showElement(hook.unit, get("hook.before"), out, 20);
    const count = get("hook.count");
    hook.after.textContent = grouped(hook.series.beforeAverage + (hook.series.sinceAverage - hook.series.beforeAverage) * count);
    showKinetic(hook.headline, get("hook.headline"), out);
    const axis = get("hook.axis") * (1 - out) * get("chart.alpha");
    const first = toStage(new THREE.Vector3(chart.points[0].x, chart.baseline, chart.points[0].z), view, STAGE);
    const last = toStage(new THREE.Vector3(chart.points[chart.points.length - 1].x, chart.baseline, chart.points[0].z), view, STAGE);
    const cliff = toStage(new THREE.Vector3(chart.points[chart.series.cliffIndex].x, chart.baseline, chart.points[0].z), view, STAGE);
    const top = toStage(new THREE.Vector3(chart.points[chart.series.cliffIndex].x, chart.top, chart.points[0].z), view, STAGE);
    const drawn = clamp01(get("line.draw") / (chart.points.length - 1));
    Object.assign(hook.baseline.style, { left: `${first.x}px`, top: `${first.y}px`, width: `${(last.x - first.x) * drawn}px`, opacity: String(axis) });
    const labelY = first.y + 18;
    const days = [first.x, cliff.x, last.x];
    hook.days.forEach((label, index) => {
      const visible = index === 1 ? get("hook.marker") : index === 2 ? clamp01((get("line.draw") - (chart.points.length - 1.5)) * 2) : 1;
      Object.assign(label.style, { left: `${days[index]}px`, top: `${labelY}px`, transform: `translateX(${index === 0 ? "0" : index === 2 ? "-100%" : "-50%"})`, opacity: String(axis * visible) });
    });
    Object.assign(hook.marker.style, { left: `${cliff.x - 1}px`, top: `${top.y}px`, height: `${first.y - top.y}px`, opacity: String(0.55 * get("hook.marker") * (1 - out) * get("chart.alpha")) });
  }

  function drawSystem(o: Overlay) {
    const out = get("sys.out");
    showKinetic(o.system.headline, get("sys.head"), out);
    showElement(o.system.count, get("sys.count"), out, 20);
    let checked = 0;
    for (const run of runs) if (get(`appear:${run.id}`) > 0.3) checked = run.checkedSoFar;
    o.system.number.textContent = grouped(checked);
  }

  function drawCause(o: Overlay, view: THREE.Camera) {
    const cause = o.cause;
    const out = get("cause.out");
    showKinetic(cause.headOne, get("cause.head1"), out);
    showKinetic(cause.headTwo, get("cause.head2"), out);
    bars.group.updateMatrixWorld();
    const slabLeft = toStage(bars.group.localToWorld(bars.left.clone()), view, STAGE);
    Object.assign(cause.caption.style, { left: `${slabLeft.x}px`, top: `${slabLeft.y - 86}px` });
    showElement(cause.caption, get("cause.caption"), 0, 16);
    const labels = get("cause.labels");
    cause.redLabels.forEach((label, index) => {
      const bar = bars.bars.find((candidate) => candidate.data.name === label.name);
      if (!bar) return;
      const tip = toStage(bars.group.localToWorld(bar.tip.clone()), view, STAGE);
      const style = index === 0 ? { left: "auto", right: `${1920 - tip.x + 84}px`, top: `${tip.y - 150}px`, textAlign: "right", alignItems: "flex-end" } : { right: "auto", left: `${tip.x + 84}px`, top: `${tip.y - 150}px`, alignItems: "flex-start" };
      Object.assign(label.root.style, style);
      showElement(label.root, labels, 0, 16);
    });
    cause.tiles.forEach((tile, index) => {
      const enter = get(`tile${index}.in`);
      const exit = get(`tile${index}.out`);
      const visible = enter > 0.001 && exit < 0.999;
      tile.card.style.visibility = visible ? "visible" : "hidden";
      if (!visible) return;
      Object.assign(tile.card.style, { left: "1190px", top: "470px", opacity: String(clamp01(enter * 2) * (1 - exit)), transform: `translate(${((1 - enter) * 520).toFixed(1)}px, ${(exit * 140).toFixed(1)}px) rotate(${((1 - enter) * -5 + exit * 5).toFixed(2)}deg)` });
      const strike = get(`tile${index}.strike`);
      tile.strike.style.transform = `scaleX(${strike})`;
      tile.label.style.color = strike > 0.5 ? "#8a90a2" : "#0b0c0f";
      const chip = get(`tile${index}.chip`);
      tile.chip.style.opacity = String(clamp01(chip));
      tile.chip.style.transform = `scale(${(0.6 + 0.4 * chip).toFixed(3)})`;
    });
  }

  function drawSpine(o: Overlay) {
    const spine = o.spine;
    const white = get("white");
    const wipe = get("white.out");
    spine.white.style.opacity = String(white);
    spine.white.style.clipPath = `inset(0 0 ${(wipe * 100).toFixed(2)}% 0)`;
    spine.white.style.visibility = white > 0.001 && wipe < 0.999 ? "visible" : "hidden";
    if (white <= 0.001) return;
    const count = get("spine.count");
    const shown = Math.max(1, Math.ceil(count * FACTS.totals.spineRoles - 1e-6));
    spine.count.textContent = String(shown);
    const total = get("spine.total");
    spine.total.style.opacity = String(clamp01(total));
    spine.total.style.transform = `translateY(${((1 - total) * -70).toFixed(1)}px)`;
    showKinetic(spine.caption, get("spine.caption"), 0);
    let lit = 0;
    spine.dots.forEach((element, index) => {
      const isSpine = spineRuns[index];
      if (isSpine) lit += 1;
      const on = isSpine && lit <= (count > 0 ? shown : 0);
      element.style.background = on ? o.gradient : "#dfe1ee";
      element.style.transform = on ? "scale(1.25)" : "scale(1)";
    });
  }

  function tagAt(element: HTMLElement, point: { x: number; y: number }, offsetY = -48, minX = 40, maxX = 1880) {
    const width = element.offsetWidth;
    const preferRight = point.x + 40 + width <= maxX;
    const left = preferRight ? point.x + 40 : Math.max(minX, point.x - 40 - width);
    Object.assign(element.style, { right: "auto", left: `${left}px`, top: `${point.y + offsetY}px` });
  }

  function drawRadiate(o: Overlay, view: THREE.Camera) {
    const hero = o.hero;
    let leaderShown = false;
    for (const panel of hero.heroes) {
      const enter = get(`hero:${panel.id}`);
      const exit = get(`heroOut:${panel.id}`);
      showElement(panel.card, clamp01(enter * 3), exit, 30);
      showKinetic(panel.lines, enter, 0);
      if (enter <= 0 || exit >= 1) continue;
      const node = toStage((byId.get(panel.id) as WorldNode).position, view, STAGE);
      const alpha = clamp01(enter * 3) * (1 - exit);
      const line = hero.leader.querySelector("line") as SVGLineElement;
      const circle = hero.leader.querySelector("circle") as SVGCircleElement;
      const gradient = hero.leader.querySelector("linearGradient") as SVGLinearGradientElement;
      const endX = 640 + 60;
      const endY = 600;
      const reach = BACK_OUT(clamp01(enter * 2.5));
      const x2 = node.x + (endX - node.x) * reach;
      const y2 = node.y + (endY - node.y) * reach;
      for (const [name, value] of Object.entries({ x1: node.x, y1: node.y, x2, y2 })) line.setAttribute(name, value.toFixed(1));
      for (const [name, value] of Object.entries({ x1: node.x, y1: node.y, x2: endX, y2: endY })) gradient.setAttribute(name, value.toFixed(1));
      circle.setAttribute("cx", x2.toFixed(1));
      circle.setAttribute("cy", y2.toFixed(1));
      hero.leader.style.opacity = String(alpha);
      leaderShown = true;
    }
    if (!leaderShown) hero.leader.style.opacity = "0";
    for (const tag of hero.tags) {
      const enter = get(`tag:${tag.id}`);
      const exit = get(`tagOut:${tag.id}`);
      showElement(tag.root, enter, exit, 12);
      if (enter <= 0 || exit >= 1) continue;
      tagAt(tag.root, toStage((byId.get(tag.id) as WorldNode).position, view, STAGE));
    }
    const rowsOut = get("rows.out");
    for (const row of hero.rows) showElement(row.root, get(`row:${row.id}`), rowsOut, 28);
    showKinetic(hero.peak, get("peak.in"), get("peak.out"));
  }

  function drawScope(o: Overlay, leftWidth: number, mainViewport: Viewport) {
    const scope = o.scope;
    const out = get("scope.out");
    scope.divider.style.left = `${leftWidth - 1.5}px`;
    scope.divider.style.opacity = leftWidth > 2 && leftWidth < 1918 ? "1" : "0";
    const leftViewport = { x: 0, w: Math.max(1, leftWidth), h: 1080 };
    const ceo = toStage((byId.get("u_thana") as WorldNode).position, leftCamera, leftViewport);
    Object.assign(scope.ceo.root.style, { left: `${Math.max(40, Math.min(leftWidth - 520, ceo.x - 120))}px`, top: `${ceo.y + 60}px` });
    showElement(scope.ceo.root, get("tag.ceo"), out, 16);
    const rep = toStage((byId.get("u_krit") as WorldNode).position, camera, mainViewport);
    Object.assign(scope.rep.root.style, { right: "auto", left: `${Math.max(leftWidth + 40, Math.min(1880 - scope.rep.root.offsetWidth, rep.x - 60))}px`, top: `${rep.y + 46}px` });
    showElement(scope.rep.root, get("tag.rep"), out, 16);
    const rsm = toStage((byId.get("u_anucha") as WorldNode).position, camera, mainViewport);
    tagAt(scope.rsm, rsm, -50, leftWidth + 40, 1880);
    showElement(scope.rsm, get("tag.rsm"), out, 16);
    showElement(scope.caption, get("scope.caption"), out, 20);
  }

  function drawMemory(o: Overlay, view: THREE.Camera) {
    showKinetic(o.memory.lesson, get("lesson.in"), get("lesson.out"));
    const echoPoint = toStage(echo.position, view, STAGE);
    Object.assign(o.memory.date.style, { left: `${echoPoint.x}px`, top: `${echoPoint.y - 96}px` });
    showElement(o.memory.date, get("echo.date"), get("echo.out"), 12, "translateX(-50%)");
  }

  function drawBrand(o: Overlay) {
    const out = get("brand.out");
    showElement(o.brand.word, get("brand.word"), out, 40);
    showElement(o.brand.tagline, get("brand.tagline"), out, 30);
  }

  function drawScrim(o: Overlay) {
    const system = get("sys.head") * (1 - get("sys.out"));
    const peak = get("peak.in") * (1 - get("peak.out"));
    const lesson = get("lesson.in") * (1 - get("lesson.out"));
    const rows = Math.max(...overlay.hero.rows.map((row) => get(`row:${row.id}`))) * (1 - get("rows.out"));
    o.scrim.style.opacity = String(Math.min(1, Math.max(system, peak, lesson, rows) * 1.6));
  }

  function renderPass(view: THREE.PerspectiveCamera, x: number, width: number) {
    renderer.setViewport(x, 0, width, 1080);
    renderer.setScissor(x, 0, width, 1080);
    renderer.render(scene, view);
  }

  return {
    render(t: number) {
      const time = ((t % SIGNAL_SECONDS) + SIGNAL_SECONDS) % SIGNAL_SECONDS;
      tracks.seek(time);
      (backdrop.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
      const leftWidth = Math.round(960 * get("split"));
      const mainViewport: Viewport = { x: leftWidth, w: 1920 - leftWidth, h: 1080 };
      const pose = tracks.pose("cam");
      const shake = get("shake") * SHAKE_PIXELS;
      pose.sx += shake * Math.sin(time * 97);
      pose.sy += shake * Math.cos(time * 83);
      applyPose(camera, pose, mainViewport.w, 1080);
      placeNodes(time);
      if (leftWidth >= 2) applyPose(leftCamera, tracks.pose("left"), leftWidth, 1080);
      paintEcho(camera, mainViewport);
      drawHook(overlay, camera);
      drawSystem(overlay);
      drawCause(overlay, camera);
      drawSpine(overlay);
      drawRadiate(overlay, camera);
      drawScope(overlay, leftWidth, mainViewport);
      drawMemory(overlay, camera);
      drawBrand(overlay);
      drawScrim(overlay);
      if (leftWidth >= 2) {
        renderer.setScissorTest(true);
        prepare("left", leftCamera, { x: 0, w: leftWidth, h: 1080 }, time);
        renderPass(leftCamera, 0, leftWidth);
        prepare("main", camera, mainViewport, time);
        renderPass(camera, leftWidth, mainViewport.w);
        renderer.setScissorTest(false);
        return;
      }
      renderer.setViewport(0, 0, 1920, 1080);
      prepare("full", camera, STAGE, time);
      renderer.render(scene, camera);
    },
    dispose() {
      tracks.kill();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
      for (const texture of [storyTexture, dashboardTexture, ...heroTextures]) texture.dispose();
      disposeLight();
      renderer.dispose();
    },
  };
}

/** The "signal" film: one anomaly enters the organisation, Winyu traces it to its cause, and every role lights up with its own next step. */
export const SignalStage = glStage(createSignal);
