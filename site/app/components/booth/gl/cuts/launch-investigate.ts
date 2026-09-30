import { BRAND, mark, overlayElement } from "../kit";
import { BEAT, HEADINGS, investigationCopy, TRACE_CARD } from "./launch-data";
import { clamp01, ease, lerp, padded, type Beat, type CardPlane, type Stage } from "./launch-rig";
import { checkMark, DANGER, frosted, headingBlock, INK, kineticBlock, logoTile, MUTED, roleText, setAlpha, showHeading, showKinetic, showMoving, textElement } from "./launch-type";
import { paintGradient } from "./signal-type";
import { storyBars } from "./signal-data";

const B = BEAT.investigate;
const ROW_HEIGHT = 100;
const VISIBLE_ROWS = 5;
const ROW_STEP = 0.4;
const ROWS_AT = B + 0.9;
const SCROLL_LEAD = 0.2;
const SCROLL_TIME = 0.22;
const SCROLL_EASE = ease("power2.inOut");
const RIGHT = 1230;
const DRAWER_SCALE = 1.05;
const DRAWER_ROT = 0.2;
const BARS_SCALE = 1.8;
const FINDING_TOP = 318;
const BARS_TOP = 632;
const NEXT_TOP = 836;
const PAN = 420;
const FINDING_LINES = ["อีสานจะปิดเดือนต่ำกว่าเป้า", "สองเอเย่นต์ใหญ่แทบหยุดสั่งเบียร์ตั้งแต่ 11 ก.ย.", "น่าจะติดวงเงิน"];

function splitNext(next: string): [string, string] {
  const cut = next.indexOf(" ");
  return [next.slice(0, cut), next.slice(cut + 1)];
}

function writeScript(stage: Stage, rows: number) {
  const t = stage.tracks;
  t.to("inv.head", 1, B - 0.1, 0.9, "none");
  t.to("inv.card", 1, B - 0.25, 0.7, "expo.out");
  t.to("inv.icon", 1, B + 0.2, 0.1, "none");
  t.to("inv.role", 1, B + 0.5, 0.6, "expo.out");
  for (let index = 0; index < rows; index += 1) t.to(`inv.row${index}`, 1, ROWS_AT + index * ROW_STEP, 0.5, "expo.out");
  t.to("inv.count", 1, ROWS_AT, rows * ROW_STEP + 0.3, "power1.inOut");
  t.to("inv.counter", 1, B + 0.7, 0.6, "expo.out");
  t.to("inv.counterOut", 1, B + 5.9, 0.35, "power2.in");
  t.to("inv.ruled", 1, B + 6.1, 0.5, "expo.out");
  t.to("inv.ruled0", 1, B + 6.3, 0.5, "expo.out");
  t.to("inv.ruled1", 1, B + 6.6, 0.5, "expo.out");
  t.to("inv.strike0", 1, B + 6.85, 0.35, "power2.inOut");
  t.to("inv.strike1", 1, B + 7.15, 0.35, "power2.inOut");
  t.to("inv.phase", 1, B + 7.6, 0.7, "power3.inOut");
  t.to("inv.drawer", 1, B + 7.7, 1.0, "expo.out");
  t.to("inv.finding", 1, B + 8.4, 0.8, "expo.out");
  t.to("inv.findingText", 1, B + 8.45, 0.9, "none");
  t.to("inv.bars", 1, B + 8.9, 0.9, "expo.out");
  t.to("inv.drawerOut", 1, B + 9.4, 0.9, "power2.inOut");
  t.to("inv.barLabels", 1, B + 9.5, 0.6, "expo.out");
  t.to("inv.next", 1, B + 9.8, 0.7, "expo.out");
  t.to("inv.pan", 1, BEAT.ask - 0.6, 0.6, "power3.in");
  t.to("inv.headOut", 1, BEAT.ask - 0.4, 0.4, "power2.in");
}

/** Beat 01: the overnight trace scrolls, the checks count up, two causes are struck out, and the real drawer gives up its finding. */
export async function buildInvestigate(stage: Stage): Promise<Beat> {
  const copy = investigationCopy();
  writeScript(stage, copy.trace.length);
  const { tracks, overlay, camera, crops, shots, scene } = stage;
  const get = tracks.get;
  const layer = overlayElement(overlay, { inset: "0" });
  const heading = headingBlock(layer, HEADINGS.investigate);

  const card = frosted(layer, { left: `${TRACE_CARD.left}px`, top: `${TRACE_CARD.top}px`, width: `${TRACE_CARD.width}px`, height: `${TRACE_CARD.height}px` });
  const icon = logoTile(card, TRACE_CARD.icon, { left: `${TRACE_CARD.pad - 1}px`, top: `${TRACE_CARD.pad - 1}px`, opacity: "0" });
  textElement(card, copy.ranAt, { left: `${TRACE_CARD.pad + TRACE_CARD.icon + 24}px`, top: `${TRACE_CARD.pad + 4}px`, fontSize: "40px", fontWeight: "600" });
  const live = overlayElement(card, { right: `${TRACE_CARD.pad}px`, top: `${TRACE_CARD.pad + 22}px`, width: "18px", height: "18px", borderRadius: "999px", background: "#059669", boxShadow: "0 0 0 8px rgba(5,150,105,0.14)" });
  const rowsTop = TRACE_CARD.pad + TRACE_CARD.icon + 30;
  const viewport = overlayElement(card, { left: `${TRACE_CARD.pad}px`, right: `${TRACE_CARD.pad}px`, top: `${rowsTop - 20}px`, height: `${VISIBLE_ROWS * ROW_HEIGHT + 20}px`, overflow: "hidden", maskImage: "linear-gradient(180deg, transparent 0, transparent 14px, #000 46px, #000 calc(100% - 26px), transparent)", webkitMaskImage: "linear-gradient(180deg, transparent 0, transparent 14px, #000 46px, #000 calc(100% - 26px), transparent)" });
  const list = overlayElement(viewport, { left: "0", right: "0", top: "20px" });
  const rows = copy.trace.map((step, index) => {
    const row = overlayElement(list, { left: "0", right: "0", top: `${index * ROW_HEIGHT}px`, height: `${ROW_HEIGHT}px`, opacity: "0" });
    checkMark(row, 34, { position: "absolute", left: "0", top: "8px" });
    textElement(row, step.label, { left: "58px", top: "0", fontSize: "36px", fontWeight: "700" });
    textElement(row, step.summary, { left: "58px", top: "46px", fontSize: "32px", fontWeight: "400", color: MUTED });
    return row;
  });

  const role = roleText(layer, copy.role, { left: `${RIGHT}px`, top: "336px" });
  const counter = overlayElement(layer, { left: `${RIGHT}px`, top: "420px", opacity: "0" });
  const number = textElement(counter, "0", { position: "relative", fontSize: "260px", fontWeight: "800", letterSpacing: "-0.05em", lineHeight: "1", fontVariantNumeric: "tabular-nums" });
  paintGradient(number);
  for (const line of copy.checksLines) textElement(counter, line, { position: "relative", fontSize: "44px", fontWeight: "400", color: MUTED });

  const ruled = overlayElement(layer, { left: `${RIGHT}px`, top: "450px", opacity: "0", display: "flex", flexDirection: "column", gap: "26px" });
  textElement(ruled, copy.ruledOutLabel, { position: "relative", fontSize: "40px", fontWeight: "700", color: "#ffffff", background: INK, borderRadius: "999px", padding: "4px 26px 8px", alignSelf: "flex-start" });
  const ruledLines = copy.ruledOut.map((text) => {
    const line = textElement(ruled, text, { position: "relative", fontSize: "52px", fontWeight: "600", alignSelf: "flex-start", opacity: "0" });
    const strike = overlayElement(line, { left: "-6px", right: "-6px", top: "54%", height: "5px", borderRadius: "3px", background: MUTED, transformOrigin: "0 50%", transform: "scaleX(0)" });
    return { line, strike };
  });

  const finding = frosted(layer, { left: `${TRACE_CARD.left}px`, top: `${FINDING_TOP}px`, width: "1060px", padding: "30px 44px 36px", boxSizing: "border-box", transformOrigin: "100% 0" });
  const badges = overlayElement(finding, { position: "relative", display: "flex", alignItems: "center", gap: "18px", marginBottom: "10px" });
  textElement(badges, copy.badge, { position: "relative", fontSize: "32px", fontWeight: "700", color: "#ffffff", background: DANGER, borderRadius: "999px", padding: "2px 20px 6px" });
  textElement(badges, copy.scope, { position: "relative", fontSize: "32px", fontWeight: "400", color: MUTED });
  const findingText = kineticBlock(finding, FINDING_LINES.map((text, index) => ({ text, style: { fontSize: "50px", fontWeight: "700", letterSpacing: "-0.01em" }, gradient: index === FINDING_LINES.length - 1 })), { position: "relative" });
  if (FINDING_LINES.join(" ") !== copy.finding) throw new Error("Finding lines must be the finding");

  const [nextHead, nextTail] = splitNext(copy.next);
  const next = overlayElement(layer, { left: `${TRACE_CARD.left}px`, top: `${NEXT_TOP}px`, opacity: "0", display: "flex", flexDirection: "column", gap: "4px" });
  const nextLabel = overlayElement(next, { position: "relative", display: "flex", alignItems: "center", gap: "14px" });
  textElement(nextLabel, copy.nextLabel, { position: "relative", fontSize: "32px", fontWeight: "700", color: BRAND.indigo });
  textElement(nextLabel, "→", { position: "relative", fontSize: "32px", fontWeight: "700", color: BRAND.indigo });
  textElement(next, nextHead, { position: "relative", fontSize: "40px", fontWeight: "600" });
  textElement(next, nextTail, { position: "relative", fontSize: "40px", fontWeight: "400", color: MUTED });

  const drawerRegion = padded(mark("story", "story"), 12);
  const topBars = mark("story", "topBars");
  const barsRegion = { ...padded(topBars, 12, 10), w: topBars.w - 30 };
  const [drawer, bars]: CardPlane[] = await Promise.all([crops.plane(shots.story, drawerRegion, 16), crops.plane(shots.story, barsRegion, 14)]);
  scene.add(drawer.mesh, bars.mesh);
  const barLabels = storyBars().slice(0, 2).map((bar, index) => {
    const rowY = BARS_TOP + (topBars.y + topBars.h * (index === 0 ? 0.27 : 0.76) - barsRegion.y) * BARS_SCALE;
    return textElement(layer, bar.label, { left: `${TRACE_CARD.left + barsRegion.w * BARS_SCALE + 26}px`, top: `${(rowY - 34).toFixed(0)}px`, fontSize: "54px", fontWeight: "800", color: DANGER, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", opacity: "0" });
  });
  bars.mesh.renderOrder = 22;
  const drawerWidth = drawerRegion.w * DRAWER_SCALE;
  const drawerCx = 1824 - drawerWidth / 2;
  const drawerCy = 540;

  function onDrawer(x: number, y: number): { x: number; y: number } {
    return { x: drawerCx + (x - (drawerRegion.x + drawerRegion.w / 2)) * DRAWER_SCALE * Math.cos(DRAWER_ROT), y: drawerCy + (y - (drawerRegion.y + drawerRegion.h / 2)) * DRAWER_SCALE };
  }

  function drawTrace(pan: number, time: number) {
    const phase = get("inv.phase");
    const cardIn = get("inv.card");
    setAlpha(card, clamp01(cardIn) * (1 - phase));
    card.style.transform = `translate(${(-phase * 160 - pan * PAN).toFixed(1)}px, ${((1 - cardIn) * 40).toFixed(1)}px)`;
    setAlpha(icon, get("inv.icon"));
    live.style.opacity = String(0.55 + 0.45 * Math.abs(Math.sin((get("inv.count") * 12) * Math.PI)));
    let scrolled = 0;
    rows.forEach((row, index) => {
      const enter = get(`inv.row${index}`);
      row.style.opacity = String(clamp01(enter * 1.4));
      if (index >= VISIBLE_ROWS) scrolled += SCROLL_EASE(clamp01((time - (ROWS_AT + index * ROW_STEP - SCROLL_LEAD)) / SCROLL_TIME));
    });
    list.style.transform = `translateY(${(-scrolled * ROW_HEIGHT).toFixed(1)}px)`;
  }

  function drawRight(pan: number) {
    const phase = get("inv.phase");
    showMoving(role, get("inv.role"), phase, 20, `translateX(${(-pan * PAN).toFixed(1)}px)`);
    showMoving(counter, get("inv.counter"), get("inv.counterOut"), 30);
    number.textContent = String(Math.round(copy.checks * get("inv.count")));
    showMoving(ruled, get("inv.ruled"), phase, 24);
    ruledLines.forEach((item, index) => {
      const enter = get(`inv.ruled${index}`);
      setAlpha(item.line, enter);
      item.line.style.transform = `translateX(${((1 - enter) * 40).toFixed(1)}px)`;
      const strike = get(`inv.strike${index}`);
      item.strike.style.transform = `scaleX(${strike.toFixed(3)})`;
      item.line.style.color = strike > 0.5 ? MUTED : INK;
    });
  }

  function drawStory(pan: number) {
    const drawerIn = get("inv.drawer");
    const drawerOut = get("inv.drawerOut");
    drawer.place(camera, { cx: drawerCx + (1 - drawerIn) * 320 + drawerOut * 90 - pan * PAN, cy: drawerCy, w: drawerWidth * (1 - 0.14 * drawerOut), alpha: clamp01(drawerIn * 1.6) * (1 - drawerOut) * (1 - pan), rotY: lerp(0.55, DRAWER_ROT, drawerIn) + 0.12 * drawerOut, depth: 10 + drawerOut * 2 });
    const findingIn = get("inv.finding");
    const from = onDrawer(mark("story", "finding").x, mark("story", "finding").y);
    setAlpha(finding, clamp01(findingIn * 1.5) * (1 - pan));
    finding.style.transform = `translate(${((1 - findingIn) * (from.x - 1180) - pan * PAN).toFixed(1)}px, ${((1 - findingIn) * (from.y - FINDING_TOP)).toFixed(1)}px) scale(${lerp(0.45, 1, findingIn).toFixed(3)})`;
    showKinetic(findingText, get("inv.findingText"), 0);
    const barsIn = get("inv.bars");
    const barsFrom = onDrawer(barsRegion.x + barsRegion.w / 2, barsRegion.y + barsRegion.h / 2);
    const barsWidth = barsRegion.w * BARS_SCALE;
    const barsTo = { x: TRACE_CARD.left + barsWidth / 2, y: BARS_TOP + (barsRegion.h * BARS_SCALE) / 2 };
    bars.place(camera, { cx: lerp(barsFrom.x, barsTo.x, barsIn) - pan * PAN, cy: lerp(barsFrom.y, barsTo.y, barsIn), w: lerp(barsRegion.w * DRAWER_SCALE, barsWidth, barsIn), alpha: clamp01(barsIn * 3) * (1 - pan), rotY: lerp(DRAWER_ROT, 0, barsIn), depth: 9 });
    showMoving(next, get("inv.next"), pan, 24, `translateX(${(-pan * PAN).toFixed(1)}px)`);
    for (const label of barLabels) showMoving(label, get("inv.barLabels"), pan, 16, `translateX(${(-pan * PAN).toFixed(1)}px)`);
  }

  return {
    draw(time: number) {
      const pan = get("inv.pan");
      showHeading(heading, get("inv.head"), get("inv.headOut"));
      drawTrace(pan, time);
      drawRight(pan);
      drawStory(pan);
    },
  };
}
