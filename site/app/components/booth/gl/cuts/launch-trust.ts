import { BRAND, BRAND_GRADIENT, mark, overlayElement, type Mark } from "../kit";
import { ARCHITECTURE, BEAT, HEADINGS, principleCopy, proofCards, scopeDrawers, scopeSafeguard } from "./launch-data";
import { clamp01, ease, lerp, type Beat, type CardPlane, type Stage } from "./launch-rig";
import { checkMark, frosted, headingBlock, iconTile, ICONS, INK, logoTile, MUTED, setAlpha, showHeading, showMoving, SUCCESS, textElement } from "./launch-type";

const S = BEAT.scope;
const P = BEAT.proof;
const LABEL = 38;
const COLUMNS = { people: [120, 540], core: [600, 1040], doors: [1100, 1450], systems: [1520, 1824] } as const;
const DIAGRAM_TOP = 392;
const DOOR_TOPS = [420, 596, 772];
const DOOR_HEIGHT = 140;
const DRAWER_CENTERS = [400, 960, 1520];
const DRAWER_SCALE = 0.88;
const DRAWER_TOP = 470;
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const FLOW_SPEED = 0.55;
const BACK_OUT = ease("back.out(1.6)");

function svgLayer(parent: HTMLElement): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "1920");
  svg.setAttribute("height", "1080");
  Object.assign(svg.style, { position: "absolute", left: "0", top: "0", overflow: "visible" });
  svg.innerHTML = `<defs><linearGradient id="launch-flow" x1="0" x2="1"><stop offset="0" stop-color="${BRAND.indigo}"/><stop offset="0.55" stop-color="${BRAND.violet}"/><stop offset="1" stop-color="${BRAND.coral}"/></linearGradient></defs>`;
  parent.append(svg);
  return svg;
}

type Flow = { base: SVGPathElement; glow: SVGPathElement; dots: SVGCircleElement[]; length: number };

function flow(svg: SVGSVGElement, d: string, dots = 2): Flow {
  const base = document.createElementNS("http://www.w3.org/2000/svg", "path");
  base.setAttribute("d", d);
  base.setAttribute("fill", "none");
  base.setAttribute("stroke", "rgba(92,101,119,0.22)");
  base.setAttribute("stroke-width", "3");
  const glow = document.createElementNS("http://www.w3.org/2000/svg", "path");
  glow.setAttribute("d", d);
  glow.setAttribute("fill", "none");
  glow.setAttribute("stroke", "url(#launch-flow)");
  glow.setAttribute("stroke-width", "3.5");
  glow.setAttribute("stroke-linecap", "round");
  svg.append(base, glow);
  const circles = Array.from({ length: dots }, () => {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("r", "7");
    circle.setAttribute("fill", "#ffffff");
    circle.setAttribute("stroke", BRAND.violet);
    circle.setAttribute("stroke-width", "3.5");
    svg.append(circle);
    return circle;
  });
  return { base, glow, dots: circles, length: base.getTotalLength() };
}

function drawFlow(item: Flow, draw: number, alpha: number, time: number, offset: number) {
  item.base.setAttribute("opacity", alpha.toFixed(3));
  item.glow.setAttribute("opacity", alpha.toFixed(3));
  item.glow.setAttribute("stroke-dasharray", `${item.length}`);
  item.glow.setAttribute("stroke-dashoffset", `${(item.length * (1 - draw)).toFixed(1)}`);
  item.dots.forEach((dot, index) => {
    const phase = (((time * FLOW_SPEED + offset + index / item.dots.length) % 1) + 1) % 1;
    const point = item.base.getPointAtLength(phase * item.length);
    dot.setAttribute("cx", point.x.toFixed(1));
    dot.setAttribute("cy", point.y.toFixed(1));
    dot.setAttribute("opacity", (draw >= 1 ? alpha * Math.sin(phase * Math.PI) : 0).toFixed(3));
  });
}

function box(parent: HTMLElement, left: number, top: number, width: number, height: number, style: Partial<CSSStyleDeclaration> = {}): HTMLDivElement {
  return frosted(parent, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, boxSizing: "border-box", ...style });
}

function writeScript(stage: Stage) {
  const t = stage.tracks;
  t.to("arch.head", 1, S - 0.07, 0.9, "none");
  t.to("arch.headOut", 1, S + 4.3, 0.4, "power2.in");
  t.to("arch.tilt", 1, S + 0.05, 1.3, "expo.out");
  t.to("arch.people", 1, S + 0.2, 0.7, "expo.out");
  t.to("arch.core", 1, S + 0.45, 0.8, "expo.out");
  ARCHITECTURE.layers.forEach((_, index) => t.to(`arch.layer${index}`, 1, S + 0.7 + index * 0.12, 0.6, "expo.out"));
  ARCHITECTURE.doors.forEach((_, index) => t.to(`arch.door${index}`, 1, S + 1.0 + index * 0.12, 0.6, "expo.out"));
  ARCHITECTURE.systems.forEach((_, index) => t.to(`arch.system${index}`, 1, S + 1.3 + index * 0.12, 0.6, "expo.out"));
  t.to("arch.flow", 1, S + 1.1, 1.1, "power2.inOut");
  t.to("arch.enforce", 1, S + 2.6, 0.5, "power2.out");
  t.to("arch.out", 1, S + 4.35, 0.6, "power2.in");

  t.to("scope.head", 1, S + 4.7, 0.9, "none");
  scopeDrawers().forEach((_, index) => {
    t.to(`scope.col${index}`, 1, S + 4.85 + index * 0.16, 0.7, "expo.out");
    t.to(`scope.drawer${index}`, 1, S + 5.0 + index * 0.18, 0.9, "expo.out");
    t.to(`scope.value${index}`, 1, S + 5.55 + index * 0.16, 0.7, "expo.out");
  });
  t.to("scope.guard", 1, S + 6.3, 0.8, "expo.out");
  t.to("scope.textOut", 1, BEAT.act - 0.62, 0.48, "power2.in");
  t.to("scope.headOut", 1, BEAT.act - 0.45, 0.4, "power2.in");

  t.to("prin.head", 1, P + 0.05, 0.9, "none");
  t.to("prin.reads", 1, P + 0.1, 0.8, "expo.out");
  t.to("prin.hub", 1, P + 0.55, 0.7, "back.out(1.8)");
  t.to("prin.stores", 1, P + 0.8, 0.8, "expo.out");
  t.to("prin.flow", 1, P + 0.7, 0.9, "power2.inOut");
  t.to("prin.out", 1, P + 3.55, 0.5, "power2.in");
  t.to("prin.headOut", 1, P + 3.5, 0.4, "power2.in");
  t.to("proof.head", 1, P + 3.8, 0.9, "none");
  proofCards().forEach((_, index) => t.to(`proof.card${index}`, 1, P + 3.95 + index * 0.18, 0.8, "expo.out"));
  t.to("proof.gather", 1, BEAT.end - 0.75, 0.7, "power3.in");
  t.to("proof.headOut", 1, BEAT.end - 0.8, 0.4, "power2.in");
}

function drawerRegion(shot: Parameters<typeof mark>[0]): Mark {
  const story = mark(shot, "story");
  const badge = mark(shot, "badge");
  const hero = mark(shot, "hero");
  return { x: story.x - 12, y: badge.y - 12, w: story.w + 24, h: hero.y + 44 - badge.y + 12, text: "" };
}

/** Beats 06 and 11: where Winyu sits between people and systems, the same story in three scopes, then the principle and the safeguards. */
export async function buildTrust(stage: Stage): Promise<Beat> {
  writeScript(stage);
  const { tracks, overlay, camera, crops, shots, scene } = stage;
  const get = tracks.get;
  const layer = overlayElement(overlay, { inset: "0" });

  const archHeading = headingBlock(layer, HEADINGS.architecture);
  const diagram = overlayElement(layer, { inset: "0", transformOrigin: "50% 70%" });
  const flows = svgLayer(diagram);
  const [pl, pr] = COLUMNS.people;
  const people = box(diagram, pl, DIAGRAM_TOP + 64, pr - pl, 440, { padding: "26px 22px" });
  textElement(people, ARCHITECTURE.people, { position: "relative", fontSize: "40px", fontWeight: "700", marginBottom: "18px" });
  for (const role of ARCHITECTURE.roles) textElement(people, role, { position: "relative", fontSize: "36px", fontWeight: "600", color: "#1f2433", background: "#f7f8fc", border: "1px solid #e6e9f2", borderRadius: "16px", padding: "10px 20px 14px", marginBottom: "14px" });
  const [cl, cr] = COLUMNS.core;
  const coreGlow = overlayElement(diagram, { left: `${cl - 3}px`, top: `${DIAGRAM_TOP - 3}px`, width: `${cr - cl + 6}px`, height: "566px", borderRadius: "34px", background: BRAND_GRADIENT, opacity: "0", boxShadow: "0 40px 90px -40px rgba(124,58,237,0.6)" });
  const core = overlayElement(coreGlow, { left: "3px", top: "3px", right: "3px", bottom: "3px", borderRadius: "31px", background: "#ffffff", padding: "26px 26px", boxSizing: "border-box" });
  const coreHead = overlayElement(core, { position: "relative", display: "flex", alignItems: "center", gap: "16px" });
  logoTile(coreHead, 52, { position: "relative" });
  textElement(coreHead, ARCHITECTURE.core, { position: "relative", fontSize: "46px", fontWeight: "800", letterSpacing: "-0.03em" });
  textElement(core, ARCHITECTURE.coreNote, { position: "relative", fontSize: "28px", fontWeight: "400", color: MUTED, margin: "6px 0 18px" });
  const layers = ARCHITECTURE.layers.map((title) => {
    const row = overlayElement(core, { position: "relative", display: "flex", alignItems: "center", gap: "16px", height: "78px", padding: "0 20px", borderRadius: "18px", background: "#f7f8fc", border: "1px solid #e6e9f2", marginBottom: "12px", opacity: "0" });
    overlayElement(row, { position: "relative", width: "14px", height: "14px", borderRadius: "999px", background: BRAND_GRADIENT, flex: "none" });
    textElement(row, title, { position: "relative", fontSize: `${LABEL}px`, fontWeight: "600" });
    return row;
  });
  const [dl, dr] = COLUMNS.doors;
  const doors = ARCHITECTURE.doors.map((door, index) => {
    const card = box(diagram, dl, DOOR_TOPS[index], dr - dl, DOOR_HEIGHT, { padding: "24px 26px" });
    textElement(card, door.name, { position: "relative", fontSize: `${LABEL}px`, fontWeight: "700" });
    textElement(card, door.tech, { position: "relative", fontSize: "26px", fontWeight: "500", color: BRAND.indigo, fontFamily: MONO, marginTop: "6px" });
    return card;
  });
  const [sl, sr] = COLUMNS.systems;
  const systems = ARCHITECTURE.systems.map((title, index) => {
    const card = box(diagram, sl, DOOR_TOPS[index], sr - sl, DOOR_HEIGHT, { padding: "0 26px", display: "flex", alignItems: "center", background: "rgba(251,251,254,0.9)", border: "2px dashed #c9cee0", boxShadow: "none" });
    textElement(card, title, { position: "relative", fontSize: `${LABEL}px`, fontWeight: "700" });
    return card;
  });
  const coreMid = DIAGRAM_TOP + 280;
  const archFlows = [
    flow(flows, `M${pr} ${coreMid} L${cl} ${coreMid}`, 1),
    ...DOOR_TOPS.map((top) => flow(flows, `M${cr} ${coreMid} C ${cr + 50} ${coreMid}, ${dl - 50} ${top + DOOR_HEIGHT / 2}, ${dl} ${top + DOOR_HEIGHT / 2}`, 1)),
    ...DOOR_TOPS.map((top) => flow(flows, `M${dr} ${top + DOOR_HEIGHT / 2} L${sl} ${top + DOOR_HEIGHT / 2}`, 1)),
  ];

  const scopeHeading = headingBlock(layer, HEADINGS.scope);
  const drawers = scopeDrawers();
  const columns = drawers.map((drawer, index) => {
    const root = overlayElement(layer, { left: `${DRAWER_CENTERS[index] - 260}px`, top: "318px", width: "520px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", opacity: "0" });
    textElement(root, drawer.role, { position: "relative", fontSize: "40px", fontWeight: "700" });
    textElement(root, drawer.scope, { position: "relative", fontSize: "40px", fontWeight: "700", color: BRAND.indigo, background: "rgba(79,70,229,0.08)", border: "1px solid rgba(79,70,229,0.2)", borderRadius: "999px", padding: "4px 30px 8px" });
    const value = textElement(layer, drawer.value, { left: `${DRAWER_CENTERS[index] - 300}px`, width: "600px", textAlign: "center", top: "736px", fontSize: "60px", fontWeight: "800", letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", opacity: "0" });
    return { root, value };
  });
  const regions = drawers.map((drawer) => drawerRegion(drawer.shot));
  const drawerPlanes: CardPlane[] = await Promise.all(drawers.map((drawer, index) => crops.plane(shots[drawer.shot], regions[index], 16)));
  for (const plane of drawerPlanes) scene.add(plane.mesh);
  const guardCopy = scopeSafeguard();
  const guard = frosted(layer, { left: "120px", right: "120px", top: "836px", height: "148px", padding: "0 40px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "32px" });
  iconTile(guard, ICONS.shield, 84);
  const guardText = overlayElement(guard, { position: "relative", display: "flex", flexDirection: "column", gap: "2px" });
  textElement(guardText, guardCopy.title, { position: "relative", fontSize: "44px", fontWeight: "700" });
  textElement(guardText, guardCopy.body.join(" "), { position: "relative", fontSize: "40px", fontWeight: "400", color: MUTED });

  const principle = principleCopy();
  const prinHeading = headingBlock(layer, HEADINGS.principle);
  const prinGroup = overlayElement(layer, { inset: "0" });
  const prinFlows = svgLayer(prinGroup);
  const reads = box(prinGroup, 120, 356, 700, 610, { padding: "30px 36px" });
  const readsHead = overlayElement(reads, { position: "relative", display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" });
  overlayElement(readsHead, { position: "relative", width: "14px", height: "14px", borderRadius: "999px", background: SUCCESS, boxShadow: "0 0 0 6px rgba(5,150,105,0.15)" });
  textElement(readsHead, principle.readsLabel.toUpperCase(), { position: "relative", fontSize: "26px", fontWeight: "600", color: BRAND.indigo, letterSpacing: "0.12em", fontFamily: MONO });
  for (const item of principle.reads) {
    const row = overlayElement(reads, { position: "relative", display: "flex", flexDirection: "column", height: "104px", justifyContent: "center" });
    textElement(row, item.label, { position: "relative", fontSize: "40px", fontWeight: "600" });
    textElement(row, item.source, { position: "relative", fontSize: "30px", fontWeight: "400", color: MUTED });
  }
  const hub = overlayElement(prinGroup, { left: "860px", top: "560px", width: "200px", display: "flex", flexDirection: "column", alignItems: "center", gap: "18px", opacity: "0" });
  const hubTile = overlayElement(hub, { position: "relative", width: "120px", height: "120px", borderRadius: "34px", background: BRAND_GRADIENT, display: "grid", placeItems: "center", boxShadow: "0 24px 50px -16px rgba(124,58,237,0.75)" });
  overlayElement(hubTile, { position: "relative", width: "44px", height: "44px", borderRadius: "999px", border: "7px solid #ffffff", boxSizing: "border-box" });
  textElement(hub, principle.hub, { position: "relative", fontSize: "30px", fontWeight: "600", color: INK, fontFamily: MONO, background: "#ffffff", border: "1px solid rgba(79,70,229,0.2)", borderRadius: "999px", padding: "6px 20px 8px", boxShadow: "0 16px 30px -18px rgba(49,46,129,0.5)" });
  const stores = box(prinGroup, 1100, 356, 700, 610, { padding: "30px 36px", background: "linear-gradient(160deg, rgba(238,240,255,0.92), rgba(246,239,255,0.92) 60%, rgba(255,241,243,0.92))" });
  textElement(stores, principle.storesLabel.toUpperCase(), { position: "relative", fontSize: "26px", fontWeight: "600", color: BRAND.violet, letterSpacing: "0.12em", fontFamily: MONO, marginBottom: "16px" });
  for (const item of principle.stores) {
    const row = overlayElement(stores, { position: "relative", display: "flex", alignItems: "center", gap: "18px", height: "104px" });
    checkMark(row, 38, { background: BRAND.violet });
    textElement(row, item, { position: "relative", fontSize: "40px", fontWeight: "600" });
  }
  const readFlows = principle.reads.map((_, index) => {
    const y = 356 + 30 + 46 + index * 104 + 52;
    return flow(prinFlows, `M 820 ${y} C 860 ${y}, 880 620, 900 620`, 1);
  });

  const proofHeading = headingBlock(layer, HEADINGS.proof);
  const cards = proofCards();
  const icons = [ICONS.numbers, ICONS.identity, ICONS.audit];
  const proofCardsEls = cards.map((card, index) => {
    const root = frosted(layer, { left: `${120 + index * 573}px`, top: "356px", width: "534px", height: "500px", padding: "38px 40px 42px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "4px" });
    iconTile(root, icons[index], 84, { marginBottom: "26px" });
    textElement(root, card.title, { position: "relative", fontSize: "46px", fontWeight: "700", marginBottom: "12px" });
    for (const line of card.lines) textElement(root, line, { position: "relative", fontSize: "40px", fontWeight: "400", color: MUTED });
    return root;
  });

  function drawArchitecture(time: number) {
    const out = get("arch.out");
    showHeading(archHeading, get("arch.head"), get("arch.headOut"));
    const tilt = get("arch.tilt");
    diagram.style.opacity = String(1 - out);
    diagram.style.visibility = out < 0.999 && tilt > 0 ? "visible" : "hidden";
    diagram.style.transform = `perspective(2200px) translateY(${((1 - tilt) * 80 - out * 40).toFixed(1)}px) rotateX(${((1 - tilt) * 24).toFixed(2)}deg) scale(${(1 - out * 0.06).toFixed(3)})`;
    showMoving(people, get("arch.people"), 0, 30);
    showMoving(coreGlow, get("arch.core"), 0, 30);
    const enforce = get("arch.enforce");
    layers.forEach((row, index) => {
      showMoving(row, get(`arch.layer${index}`), 0, 16);
      if (index === 2) {
        row.style.background = enforce > 0 ? `linear-gradient(90deg, rgba(79,70,229,${(0.12 * enforce).toFixed(3)}), rgba(251,113,133,${(0.1 * enforce).toFixed(3)}))` : "#f7f8fc";
        row.style.borderColor = enforce > 0.5 ? "rgba(124,58,237,0.45)" : "#e6e9f2";
      }
    });
    doors.forEach((card, index) => showMoving(card, get(`arch.door${index}`), 0, 24));
    systems.forEach((card, index) => showMoving(card, get(`arch.system${index}`), 0, 24));
    const draw = get("arch.flow");
    archFlows.forEach((item, index) => drawFlow(item, draw, clamp01(draw * 3), time, index * 0.17));
  }

  function drawScope() {
    const textOut = get("scope.textOut");
    showHeading(scopeHeading, get("scope.head"), get("scope.headOut"));
    columns.forEach((column, index) => {
      showMoving(column.root, get(`scope.col${index}`), textOut, 24);
      showMoving(column.value, get(`scope.value${index}`), textOut, 24);
      const enter = get(`scope.drawer${index}`);
      const region = regions[index];
      const width = region.w * DRAWER_SCALE;
      const cy = DRAWER_TOP + (region.h * DRAWER_SCALE) / 2;
      const tilt = (index - 1) * -0.22;
      drawerPlanes[index].place(camera, { cx: DRAWER_CENTERS[index], cy: cy + (1 - enter) * 80 - textOut * 24, w: width * (0.9 + 0.1 * BACK_OUT(clamp01(enter))), alpha: clamp01(enter * 1.5) * (1 - textOut), rotY: tilt * clamp01(enter) });
    });
    showMoving(guard, get("scope.guard"), textOut, 30);
  }

  function drawProof(time: number) {
    const out = get("prin.out");
    showHeading(prinHeading, get("prin.head"), get("prin.headOut"));
    showMoving(reads, get("prin.reads"), out, 40, `translateX(${((1 - get("prin.reads")) * -60).toFixed(1)}px)`);
    showMoving(hub, get("prin.hub"), out, 20);
    showMoving(stores, get("prin.stores"), out, 40, `translateX(${((1 - get("prin.stores")) * 60).toFixed(1)}px)`);
    const draw = get("prin.flow");
    readFlows.forEach((item, index) => drawFlow(item, draw, clamp01(draw * 3) * (1 - out), time, index * 0.2));
    showHeading(proofHeading, get("proof.head"), get("proof.headOut"));
    const gather = get("proof.gather");
    proofCardsEls.forEach((card, index) => {
      const enter = get(`proof.card${index}`);
      const cx = 120 + index * 573 + 267;
      const dx = (960 - cx) * gather;
      const dy = (405 - 580) * gather;
      setAlpha(card, clamp01(enter * 1.4) * (1 - clamp01((gather - 0.4) / 0.6)));
      card.style.transform = `translate(${dx.toFixed(1)}px, ${((1 - enter) * 60 + dy).toFixed(1)}px) scale(${lerp(1, 0.3, gather).toFixed(3)})`;
    });
  }

  return {
    draw(time: number) {
      drawArchitecture(time);
      drawScope();
      drawProof(time);
    },
  };
}
