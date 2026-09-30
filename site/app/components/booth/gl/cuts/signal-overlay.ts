import { BRAND, BRAND_GRADIENT, FACTS, overlayElement } from "../kit";
import { alertAgentSeries, barsCaption, burstCopy, filmCopy, grouped, heroCopy, HERO_SHOTS, RADIATE_ORDER, scopeOf, storyBars } from "./signal-data";
import { DANGER } from "./signal-materials";
import { glassCard, INK, kineticBlock, MUTED, paintGradient, roleLabel, scopePill, textElement, type Kinetic } from "./signal-type";

const LEFT = "120px";
const PEAK_SUBLINE = "แต่ละตำแหน่งได้ขั้นต่อไปของตัวเอง";
const PEAK_HEADLINE = "เรื่องเดียว ทุกตำแหน่ง";
const SCOPE_CAPTION = "เห็นเฉพาะข้อมูลในสิทธิ์ของตัวเอง";
const SPINE_CAPTION = "ตำแหน่ง เจอเรื่องเดียวกัน";

/** A hero role's panel: the frosted card with its title and its two action lines. */
export type HeroPanel = { id: keyof typeof HERO_SHOTS; card: HTMLDivElement; lines: Kinetic };

/** A small tag that follows a node on screen: a title, and a fragment or a scope pill under it. */
export type NodeTag = { id: string; root: HTMLDivElement };

function tabular(element: HTMLElement): HTMLElement {
  element.style.fontVariantNumeric = "tabular-nums";
  return element;
}

function hookLayer(parent: HTMLElement) {
  const copy = filmCopy();
  const series = alertAgentSeries();
  const label = textElement(parent, `เฉลี่ยต่อวัน ${series.firstDay}–${series.lastBeforeDay} → ${series.cliffDay}–${series.lastDay}`, { left: LEFT, top: "78px", fontSize: "40px", fontWeight: "500", color: MUTED, opacity: "0" });
  const counter = overlayElement(parent, { left: LEFT, top: "128px", display: "flex", alignItems: "baseline", gap: "28px", fontFamily: '"Inter","Noto Sans Thai",sans-serif', whiteSpace: "nowrap", lineHeight: "1.1" });
  const before = tabular(textElement(counter, grouped(series.beforeAverage), { position: "relative", fontSize: "120px", fontWeight: "700", letterSpacing: "-0.035em", opacity: "0" }));
  const arrow = textElement(counter, "→", { position: "relative", fontSize: "88px", fontWeight: "400", color: MUTED, opacity: "0" });
  const after = tabular(textElement(counter, grouped(series.sinceAverage), { position: "relative", fontSize: "120px", fontWeight: "700", letterSpacing: "-0.035em", color: DANGER, opacity: "0" }));
  const unit = textElement(counter, "ลิตร/วัน", { position: "relative", fontSize: "48px", fontWeight: "600", color: MUTED, opacity: "0" });
  const headline = kineticBlock(parent, [{ text: copy.hookHeadline, style: { fontSize: "64px", fontWeight: "700" } }], { left: LEFT, top: "292px" });
  const axisStyle = { fontSize: "40px", fontWeight: "500", color: MUTED, opacity: "0" };
  const days = [textElement(parent, series.firstDay, axisStyle), textElement(parent, series.cliffDay, { ...axisStyle, color: DANGER, fontWeight: "600" }), textElement(parent, series.lastDay, axisStyle)];
  const baseline = overlayElement(parent, { height: "2px", background: "rgba(92,101,119,0.22)", opacity: "0", transformOrigin: "0 50%" });
  const marker = overlayElement(parent, { width: "0px", borderLeft: `2px dashed ${DANGER}`, opacity: "0" });
  return { label, counter, before, arrow, after, unit, headline, days, baseline, marker, series };
}

function systemLayer(parent: HTMLElement) {
  const copy = filmCopy();
  const headline = kineticBlock(parent, [{ text: copy.systemHeadline, style: { fontSize: "72px", fontWeight: "700", letterSpacing: "-0.01em" } }], { left: LEFT, top: "392px" });
  const count = overlayElement(parent, { left: LEFT, top: "500px", display: "flex", alignItems: "baseline", gap: "18px", whiteSpace: "nowrap", opacity: "0" });
  textElement(count, "ดูข้อมูล", { position: "relative", fontSize: "56px", fontWeight: "600", color: MUTED });
  const number = tabular(textElement(count, "0", { position: "relative", fontSize: "56px", fontWeight: "800" }));
  paintGradient(number);
  textElement(count, "ครั้ง", { position: "relative", fontSize: "56px", fontWeight: "600", color: MUTED });
  return { headline, count, number };
}

function causeLayer(parent: HTMLElement) {
  const copy = filmCopy();
  const headOne = kineticBlock(parent, [{ text: copy.causeLines[0], style: { fontSize: "72px", fontWeight: "700" } }], { left: LEFT, top: "84px" });
  const headTwo = kineticBlock(parent, [{ text: copy.causeLines[1], style: { fontSize: "72px", fontWeight: "800" }, gradient: true }], { left: LEFT, top: "176px" });
  const caption = textElement(parent, barsCaption(), { fontSize: "40px", fontWeight: "600", color: MUTED, opacity: "0" });
  const bars = storyBars();
  const redLabels = bars.filter((bar) => bar.pct < 0 && Math.abs(bar.pct) > 10).map((bar) => {
    const root = overlayElement(parent, { display: "flex", flexDirection: "column", gap: "2px", opacity: "0", whiteSpace: "nowrap" });
    textElement(root, bar.name, { position: "relative", fontSize: "40px", fontWeight: "600" });
    const row = overlayElement(root, { position: "relative", display: "flex", alignItems: "baseline", gap: "16px" });
    tabular(textElement(row, bar.label, { position: "relative", fontSize: "60px", fontWeight: "800", color: DANGER, letterSpacing: "-0.02em" }));
    tabular(textElement(row, `${bar.litres} ลิตร`, { position: "relative", fontSize: "40px", fontWeight: "500", color: MUTED }));
    return { name: bar.name, root };
  });
  const tiles = copy.ruledOut.map((text) => {
    const card = glassCard(parent, { padding: "26px 44px 32px", borderRadius: "24px" });
    const label = textElement(card, text, { position: "relative", fontSize: "52px", fontWeight: "600" });
    const strike = overlayElement(label, { left: "-8px", right: "-8px", top: "54%", height: "5px", borderRadius: "3px", background: INK, transformOrigin: "0 50%", transform: "scaleX(0)" });
    const chip = textElement(card, copy.ruledOutChip, { top: "-30px", right: "28px", fontSize: "40px", fontWeight: "700", color: "#ffffff", background: INK, borderRadius: "999px", padding: "2px 24px 6px", opacity: "0" });
    return { card, label, strike, chip };
  });
  return { headOne, headTwo, caption, redLabels, tiles };
}

function spineLayer(parent: HTMLElement) {
  const white = overlayElement(parent, { inset: "0", background: `radial-gradient(1200px 700px at 30% 20%, rgba(79,70,229,0.07), transparent 70%), radial-gradient(900px 600px at 85% 90%, rgba(251,113,133,0.07), transparent 70%), ${BRAND.paper}`, opacity: "0" });
  const row = overlayElement(white, { left: "0", right: "0", top: "250px", display: "flex", justifyContent: "center", alignItems: "baseline", gap: "32px", whiteSpace: "nowrap" });
  const count = tabular(textElement(row, "1", { position: "relative", fontSize: "200px", fontWeight: "800", letterSpacing: "-0.04em", lineHeight: "1.1", minWidth: "260px", textAlign: "right" }));
  paintGradient(count);
  const total = tabular(textElement(row, `/ ${FACTS.totals.roles}`, { position: "relative", fontSize: "160px", fontWeight: "700", color: MUTED, letterSpacing: "-0.03em", opacity: "0" }));
  const caption = kineticBlock(white, [{ text: SPINE_CAPTION, style: { fontSize: "64px", fontWeight: "700" } }], { left: "0", right: "0", top: "540px", alignItems: "center" });
  const dotRow = overlayElement(white, { left: "0", right: "0", top: "720px", display: "flex", justifyContent: "center", gap: "18px" });
  const dots = Array.from({ length: FACTS.totals.roles }, () => overlayElement(dotRow, { position: "relative", width: "22px", height: "22px", borderRadius: "999px", background: "#dfe1ee" }));
  return { white, count, total, caption, dots };
}

function heroLayer(parent: HTMLElement) {
  const leader = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  leader.setAttribute("width", "1920");
  leader.setAttribute("height", "1080");
  Object.assign(leader.style, { position: "absolute", left: "0", top: "0", overflow: "visible", opacity: "0" });
  leader.innerHTML = `<defs><linearGradient id="signal-leader" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${BRAND.indigo}"/><stop offset="0.55" stop-color="${BRAND.violet}"/><stop offset="1" stop-color="${BRAND.coral}"/></linearGradient></defs><line x1="0" y1="0" x2="0" y2="0" stroke="url(#signal-leader)" stroke-width="3" stroke-linecap="round"/><circle r="7" fill="${BRAND.coral}"/>`;
  parent.append(leader);
  const heroes: HeroPanel[] = RADIATE_ORDER.filter((step) => step.hero).map((step) => {
    const id = step.id as keyof typeof HERO_SHOTS;
    const copy = heroCopy(id);
    const card = glassCard(parent, { left: "640px", top: "600px", padding: "30px 48px 38px", display: "flex", flexDirection: "column", gap: "18px" });
    roleLabel(card, copy.title, 40);
    const lines = kineticBlock(card, copy.lines.map((text) => ({ text, style: { fontSize: "56px", fontWeight: "700", letterSpacing: "-0.005em" } })), { position: "relative", gap: "4px" });
    return { id, card, lines };
  });
  const tags: NodeTag[] = RADIATE_ORDER.filter((step) => step.id === "u_prasit").map((step) => {
    const copy = burstCopy(step.id);
    const root = glassCard(parent, { padding: "16px 30px 20px", borderRadius: "22px", display: "flex", flexDirection: "column", gap: "2px" });
    textElement(root, copy.title, { position: "relative", fontSize: "40px", fontWeight: "700" });
    textElement(root, copy.fragment, { position: "relative", fontSize: "40px", fontWeight: "500", color: MUTED });
    return { id: step.id, root };
  });
  const rows: NodeTag[] = RADIATE_ORDER.filter((step) => !step.hero && step.id !== "u_prasit").map((step, index) => {
    const copy = burstCopy(step.id);
    const root = overlayElement(parent, { left: LEFT, top: `${236 + index * 128}px`, display: "flex", alignItems: "flex-start", gap: "22px", opacity: "0", whiteSpace: "nowrap" });
    overlayElement(root, { position: "relative", width: "18px", height: "18px", marginTop: "20px", borderRadius: "999px", background: BRAND_GRADIENT, flex: "none" });
    const text = overlayElement(root, { position: "relative", display: "flex", flexDirection: "column" });
    textElement(text, copy.title, { position: "relative", fontSize: "40px", fontWeight: "700" });
    textElement(text, copy.fragment, { position: "relative", fontSize: "40px", fontWeight: "500", color: MUTED });
    return { id: step.id, root };
  });
  const peak = kineticBlock(parent, [
    { text: PEAK_HEADLINE, style: { fontSize: "72px", fontWeight: "800" } },
    { text: PEAK_SUBLINE, style: { fontSize: "48px", fontWeight: "600", color: MUTED } },
  ], { left: LEFT, top: "84px", gap: "8px" });
  return { leader, heroes, tags, rows, peak };
}

function scopeTag(parent: HTMLElement, id: string, scope: string): NodeTag {
  const root = glassCard(parent, { padding: "18px 30px 22px", borderRadius: "24px", display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" });
  textElement(root, FACTS.roles.find((role) => role.userId === id)?.role ?? "", { position: "relative", fontSize: "40px", fontWeight: "700" });
  scopePill(root, scope);
  return { id, root };
}

function scopeLayer(parent: HTMLElement) {
  const copy = filmCopy();
  const divider = overlayElement(parent, { top: "0", bottom: "0", width: "3px", background: `linear-gradient(180deg, transparent, ${BRAND.indigo} 20%, ${BRAND.violet} 60%, ${BRAND.coral} 85%, transparent)`, opacity: "0" });
  const ceo = scopeTag(parent, "u_thana", scopeOf("u_thana"));
  const rep = scopeTag(parent, "u_krit", scopeOf("u_krit"));
  const rsm = glassCard(parent, { padding: "18px 30px 22px", borderRadius: "24px" });
  textElement(rsm, FACTS.roles.find((role) => role.userId === "u_anucha")?.role ?? "", { position: "relative", fontSize: "40px", fontWeight: "700" });
  const caption = glassCard(parent, { left: "0", right: "0", bottom: "70px", margin: "0 auto", width: "fit-content", padding: "22px 56px 30px", borderRadius: "999px" });
  textElement(caption, SCOPE_CAPTION, { position: "relative", fontSize: "64px", fontWeight: "700" });
  return { divider, ceo, rep, rsm, caption, scopeText: copy.dashboardScope };
}

function memoryLayer(parent: HTMLElement) {
  const copy = filmCopy();
  const lesson = kineticBlock(parent, [
    { text: copy.lessonLines[0], style: { fontSize: "72px", fontWeight: "800" } },
    { text: copy.lessonLines[1], style: { fontSize: "56px", fontWeight: "600", color: MUTED } },
  ], { left: LEFT, top: "400px", gap: "10px" });
  const date = scopePill(parent, copy.lessonDate, { position: "absolute", opacity: "0", background: "rgba(255,255,255,0.85)" });
  return { lesson, date };
}

function brandLayer(parent: HTMLElement) {
  const copy = filmCopy();
  const word = textElement(parent, "Winyu", { left: "0", right: "0", top: "566px", textAlign: "center", fontSize: "140px", fontWeight: "800", letterSpacing: "-0.045em", lineHeight: "1.1", opacity: "0" });
  const tagline = textElement(parent, copy.tagline, { left: "0", right: "0", top: "752px", textAlign: "center", fontSize: "60px", fontWeight: "600", color: MUTED, opacity: "0" });
  return { word, tagline };
}

/** Builds every piece of type the film shows, hidden, in the order they layer. */
export function buildOverlay(parent: HTMLElement) {
  Object.assign(parent.style, { fontFamily: '"Inter","Noto Sans Thai",sans-serif', color: INK });
  const scrim = overlayElement(parent, { inset: "0", background: `linear-gradient(90deg, ${BRAND.paper} 0%, rgba(247,247,251,0.9) 28%, rgba(247,247,251,0) 56%)`, opacity: "0" });
  return {
    scrim,
    hook: hookLayer(parent),
    system: systemLayer(parent),
    cause: causeLayer(parent),
    hero: heroLayer(parent),
    scope: scopeLayer(parent),
    memory: memoryLayer(parent),
    brand: brandLayer(parent),
    spine: spineLayer(parent),
    gradient: BRAND_GRADIENT,
  };
}

/** The overlay handles `buildOverlay` returns. */
export type Overlay = ReturnType<typeof buildOverlay>;
