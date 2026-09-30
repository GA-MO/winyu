import { BRAND, BRAND_GRADIENT, mark, overlayElement, type Mark } from "../kit";
import { BEAT, foreseeCopy, HEADINGS, learnCopy, suggestCopy } from "./launch-data";
import { clamp01, ease, lerp, padded, type Beat, type CardPlane, type Stage } from "./launch-rig";
import { checkMark, cursorElement, DANGER, frosted, headingBlock, MUTED, pill, roleText, setAlpha, showCursor, showHeading, showMoving, SUCCESS, textElement } from "./launch-type";
import { paintGradient } from "./signal-type";

const PAN = 520;
const CHIP_BIG = 1.9;
const CHIP_SMALL = 1.02;
const CHIPS_BIG_CY = 560;
const CHIPS_TOP = 410;
const MEMORY_LEFT = 1060;
const MEMORY_TOP = 410;
const MEMORY_SCALE = 2;
const SUGGEST_SCALE = 1.35;
const SUGGEST_CX = 1800 - (397 * SUGGEST_SCALE) / 2;
const SUGGEST_CY = 568;
const FORECAST_SCALE = 1.35;
const CHIP_SPANS: [number, number][] = [[650, 830], [840, 1004], [1014, 1154], [1164, 1318]];
const MOVE = ease("power2.inOut");

type Waypoint = { at: number; x: number; y: number };

function along(path: Waypoint[], time: number): { x: number; y: number } {
  const next = path.findIndex((point) => point.at > time);
  if (next === -1) return path[path.length - 1];
  if (next === 0) return path[0];
  const from = path[next - 1];
  const to = path[next];
  const p = MOVE(clamp01((time - from.at) / (to.at - from.at)));
  return { x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p) };
}

function pressAt(time: number, at: number): number {
  return time >= at && time < at + 0.5 ? (time - at) / 0.5 : 0;
}

function writeScript(stage: Stage, chips: number) {
  const t = stage.tracks;
  const L = BEAT.learn;
  t.to("learn.head", 1, L, 0.9, "none");
  t.to("learn.repRole", 1, L + 0.2, 0.6, "expo.out");
  t.to("learn.chipsCrop", 1, L - 0.1, 0.9, "expo.out");
  t.to("learn.chipsLift", 1, L + 1.35, 0.9, "power3.inOut");
  for (let index = 0; index < chips; index += 1) t.to(`learn.chip${index}`, 1, L + 1.35 + index * 0.16, 0.9, "expo.out");
  t.to("learn.reasons", 1, L + 2.1, 0.7, "expo.out");
  t.to("learn.memRole", 1, L + 1.8, 0.6, "expo.out");
  t.to("learn.memory", 1, L + 1.9, 0.9, "expo.out");
  t.to("learn.memoryOut", 1, L + 4.3, 0.3, "power2.in");
  t.to("learn.swap", 1, L + 4.45, 0.55, "expo.out");
  t.to("learn.known", 1, L + 4.8, 0.6, "back.out(1.8)");
  t.to("learn.pan", 1, BEAT.suggest - 0.6, 0.7, "power3.inOut");
  t.to("learn.headOut", 1, BEAT.suggest - 0.4, 0.4, "power2.in");

  const S = BEAT.suggest;
  t.to("sug.head", 1, S, 0.9, "none");
  t.to("sug.card", 1, S - 0.05, 1.1, "expo.out");
  t.to("sug.badge", 1, S + 0.55, 0.6, "back.out(1.8)");
  t.to("sug.value", 1, S + 0.95, 0.8, "expo.out");
  t.to("sug.reason", 1, S + 1.4, 0.7, "expo.out");
  t.to("sug.kept", 1, S + 3.3, 0.5, "power2.out");
  t.to("sug.lift", 1, S + 3.3, 0.45, "power2.out");
  t.to("sug.lift", 0, S + 3.9, 0.7, "power2.inOut");
  t.to("sug.textOut", 1, S + 4.9, 0.45, "power2.in");
  t.to("sug.headOut", 1, BEAT.foresee - 0.4, 0.4, "power2.in");
  t.to("screen.pan", 1, S + 5.0, 1.3, "power3.inOut");

  const F = BEAT.foresee;
  t.to("fore.head", 1, F, 0.9, "none");
  t.to("fore.anomaly", 1, F + 0.4, 0.8, "expo.out");
  t.to("fore.outline", 1, F + 0.25, 0.6, "power2.out");
  t.to("fore.lesson", 1, F + 2.0, 0.8, "expo.out");
  t.to("fore.panOut", 1, F + 4.4, 0.9, "power3.inOut");
  t.to("fore.forecast", 1, F + 4.7, 1.0, "expo.out");
  t.to("fore.forecastText", 1, F + 5.1, 0.8, "expo.out");
  t.to("fore.exit", 1, BEAT.scope - 0.62, 0.5, "power2.in");
}

/** Beats 03, 04 and 05: the rep's learned chips and a confirmed memory, the suggested card being pinned, then the anomaly, the lesson and the forecast. */
export async function buildProduct(stage: Stage): Promise<Beat> {
  const learn = learnCopy();
  const suggest = suggestCopy();
  const fore = foreseeCopy();
  const reasoned = learn.chips.map((chip, span) => ({ ...chip, span })).filter((chip) => chip.reason !== null);
  writeScript(stage, reasoned.length);
  const { tracks, overlay, camera, crops, shots, scene } = stage;
  const get = tracks.get;
  const layer = overlayElement(overlay, { inset: "0" });

  const learnHeading = headingBlock(layer, HEADINGS.learn);
  const learnGroup = overlayElement(layer, { inset: "0" });
  const repRole = roleText(learnGroup, learn.repRole, { left: "120px", top: "336px" });
  const chipsRegion = padded(mark("landing-rep", "chips"), 10, 10);
  const chipPills = reasoned.map((chip, index) => {
    const root = overlayElement(learnGroup, { left: "120px", top: "0", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "10px", opacity: "0" });
    const face = pill(root, chip.label, { position: "relative", fontSize: "40px", fontWeight: "600", ...(index === 0 ? { boxShadow: `0 0 0 3px ${BRAND.violet}, 0 18px 40px -18px rgba(124,58,237,0.6)` } : {}) });
    const reason = textElement(root, chip.reason ?? "", { position: "relative", fontSize: "30px", fontWeight: "400", color: MUTED, paddingLeft: "32px", opacity: "0" });
    return { root, face, reason, span: chip.span };
  });

  const memRole = roleText(learnGroup, learn.memoryRole, { left: `${MEMORY_LEFT}px`, top: "336px" });
  const known = overlayElement(learnGroup, { left: `${MEMORY_LEFT}px`, top: "690px", display: "flex", alignItems: "center", gap: "18px", opacity: "0" });
  checkMark(known, 50);
  textElement(known, learn.known, { position: "relative", fontSize: "48px", fontWeight: "700", color: SUCCESS });
  const learnCursor = cursorElement(layer);

  const memoryRegion: Mark = { x: 626, y: 120, w: 370, h: 186, text: "" };
  const memoryYesRegion: Mark = { x: 626, y: 318, w: 724, h: 236, text: "" };
  const suggestRegion: Mark = { x: 389, y: 76, w: 397, h: 600, text: "" };
  const anomaliesRegion: Mark = { x: 790, y: 98, w: 397, h: 570, text: "" };
  const forecastRegion: Mark = { x: 620, y: 185, w: 700, h: 352, text: "" };
  const planes: CardPlane[] = await Promise.all([
    crops.plane(shots["landing-rep"], chipsRegion, 16),
    crops.plane(shots.memory, memoryRegion, 18),
    crops.plane(shots["memory-yes"], memoryYesRegion, 18),
    crops.plane(shots["dashboard-suggest"], suggestRegion, 22),
    crops.plane(shots["dashboard-suggest"], anomaliesRegion, 22),
    crops.plane(shots["chat-forecast"], forecastRegion, 20),
  ]);
  const [chipsPlane, memoryPlane, memoryYesPlane, suggestPlane, anomaliesPlane, forecastPlane] = planes;
  for (const plane of planes) scene.add(plane.mesh);

  const suggestHeading = headingBlock(layer, HEADINGS.suggest);
  const sugGroup = overlayElement(layer, { inset: "0" });
  const sugHead = overlayElement(sugGroup, { left: "120px", top: "400px", display: "flex", alignItems: "center", gap: "20px", opacity: "0" });
  textElement(sugHead, suggest.badge, { position: "relative", fontSize: "32px", fontWeight: "700", color: "#ffffff", background: BRAND_GRADIENT, borderRadius: "999px", padding: "4px 22px 8px" });
  textElement(sugHead, suggest.title, { position: "relative", fontSize: "48px", fontWeight: "700" });
  const sugValue = textElement(sugGroup, suggest.value, { left: "120px", top: "480px", fontSize: "120px", fontWeight: "800", letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", opacity: "0" });
  const sugReason = textElement(sugGroup, suggest.reason, { left: "120px", top: "650px", fontSize: "40px", fontWeight: "500", color: BRAND.indigo, opacity: "0" });
  const pinRing = overlayElement(layer, { borderRadius: "30px", border: `4px solid ${BRAND.violet}`, boxShadow: "0 0 40px rgba(124,58,237,0.45)", opacity: "0" });
  const pinBadge = overlayElement(layer, { width: "76px", height: "76px", borderRadius: "999px", background: BRAND_GRADIENT, display: "grid", placeItems: "center", boxShadow: "0 16px 30px -10px rgba(124,58,237,0.7)", opacity: "0" });
  pinBadge.innerHTML = '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.8V4h6v6.8l3 3.2H6z"/></svg>';
  const sugCursor = cursorElement(layer);

  const foreHeading = headingBlock(layer, HEADINGS.foresee);
  const foreGroup = overlayElement(layer, { inset: "0" });
  const anomaly = overlayElement(foreGroup, { left: "120px", top: "318px", display: "flex", flexDirection: "column", gap: "0", opacity: "0" });
  const anomalyHead = overlayElement(anomaly, { position: "relative", display: "flex", alignItems: "center", gap: "18px" });
  textElement(anomalyHead, fore.severity, { position: "relative", fontSize: "32px", fontWeight: "700", color: "#ffffff", background: DANGER, borderRadius: "999px", padding: "2px 20px 6px" });
  textElement(anomalyHead, fore.agent, { position: "relative", fontSize: "48px", fontWeight: "700" });
  textElement(anomaly, fore.gap, { position: "relative", fontSize: "150px", fontWeight: "800", color: DANGER, letterSpacing: "-0.045em", lineHeight: "1.1", fontVariantNumeric: "tabular-nums" });
  textElement(anomaly, fore.actualExpected, { position: "relative", fontSize: "40px", fontWeight: "400", color: MUTED });
  const lesson = frosted(foreGroup, { left: "120px", top: "700px", padding: "26px 40px 32px", display: "flex", flexDirection: "column", gap: "6px" });
  const lessonHead = overlayElement(lesson, { position: "relative", display: "flex", alignItems: "center", gap: "16px" });
  textElement(lessonHead, "Winyu จำจากครั้งก่อน", { position: "relative", fontSize: "32px", fontWeight: "700", color: BRAND.indigo });
  textElement(lessonHead, fore.lessonDate, { position: "relative", fontSize: "30px", fontWeight: "400", color: MUTED });
  textElement(lesson, fore.lesson[0], { position: "relative", fontSize: "48px", fontWeight: "700" });
  textElement(lesson, fore.lesson[1], { position: "relative", fontSize: "44px", fontWeight: "400", color: MUTED });
  const outline = overlayElement(layer, { borderRadius: "18px", border: `4px solid ${DANGER}`, boxShadow: "0 0 36px rgba(225,29,72,0.35)", opacity: "0" });
  const forecastText = overlayElement(foreGroup, { left: "120px", top: "318px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "6px", opacity: "0" });
  roleText(forecastText, fore.forecastRole, { position: "relative", marginBottom: "40px", opacity: "1" });
  const forecastValue = textElement(forecastText, fore.forecastValue, { position: "relative", fontSize: "104px", fontWeight: "800", letterSpacing: "-0.04em", lineHeight: "1.1" });
  paintGradient(forecastValue);
  const [whatHead, whatTail] = [fore.forecastWhat.slice(0, fore.forecastWhat.indexOf(" ")), fore.forecastWhat.slice(fore.forecastWhat.indexOf(" ") + 1)];
  textElement(forecastText, whatHead, { position: "relative", fontSize: "44px", fontWeight: "700", marginTop: "12px" });
  textElement(forecastText, whatTail, { position: "relative", fontSize: "44px", fontWeight: "400", color: MUTED });

  const chipsCy = CHIPS_TOP + (chipsRegion.h * CHIP_SMALL) / 2;
  const memoryWidth = memoryRegion.w * MEMORY_SCALE;
  const memoryCy = MEMORY_TOP + (memoryRegion.h * MEMORY_SCALE) / 2;
  const memoryYesWidth = 1800 - MEMORY_LEFT;
  const memoryYesCy = MEMORY_TOP + (memoryYesRegion.h * memoryYesWidth) / memoryYesRegion.w / 2;
  const memoryCx = MEMORY_LEFT + memoryWidth / 2;
  const yesMark = mark("memory", "yes");
  const yesX = MEMORY_LEFT + (yesMark.x + yesMark.w / 2 - memoryRegion.x) * MEMORY_SCALE;
  const yesY = MEMORY_TOP + (yesMark.y + yesMark.h / 2 - memoryRegion.y) * MEMORY_SCALE;
  const keepMark = mark("dashboard-suggest", "keep");
  const suggestCenter = { x: suggestRegion.x + suggestRegion.w / 2, y: suggestRegion.y + suggestRegion.h / 2 };
  const keepX = SUGGEST_CX + (keepMark.x + keepMark.w / 2 - suggestCenter.x) * SUGGEST_SCALE;
  const keepY = SUGGEST_CY + (keepMark.y + keepMark.h / 2 - suggestCenter.y) * SUGGEST_SCALE;
  const screenShift = (anomaliesRegion.x + anomaliesRegion.w / 2 - suggestCenter.x) * SUGGEST_SCALE;
  const anomalyDy = (anomaliesRegion.y + anomaliesRegion.h / 2 - suggestCenter.y) * SUGGEST_SCALE;
  const topAnomaly = mark("dashboard-suggest", "topAnomaly");
  const L = BEAT.learn;
  const S = BEAT.suggest;
  const learnPath: Waypoint[] = [
    { at: L + 2.9, x: 1900, y: 1100 },
    { at: L + 3.8, x: yesX + 6, y: yesY + 4 },
    { at: L + 4.5, x: yesX + 6, y: yesY + 4 },
    { at: L + 5.5, x: 1950, y: 1150 },
  ];
  const sugPath: Waypoint[] = [
    { at: S + 1.9, x: 1100, y: 1150 },
    { at: S + 3.0, x: keepX + 4, y: keepY + 4 },
    { at: S + 4.0, x: keepX + 4, y: keepY + 4 },
    { at: S + 4.9, x: 1950, y: 1160 },
  ];

  function drawLearn(time: number) {
    const pan = get("learn.pan");
    const shift = -pan * PAN;
    showHeading(learnHeading, get("learn.head"), get("learn.headOut"));
    learnGroup.style.transform = `translateX(${shift.toFixed(1)}px)`;
    learnGroup.style.opacity = String(1 - pan);
    showMoving(repRole, get("learn.repRole"), 0, 20);
    const cropIn = get("learn.chipsCrop");
    const lift = get("learn.chipsLift");
    const cropScale = lerp(CHIP_BIG, CHIP_SMALL, lift);
    chipsPlane.place(camera, { cx: lerp(960, 120 + (chipsRegion.w * CHIP_SMALL) / 2, lift) + shift, cy: lerp(CHIPS_BIG_CY + (1 - cropIn) * 60, chipsCy, lift), w: chipsRegion.w * cropScale, alpha: clamp01(cropIn * 1.5) * (1 - clamp01(lift * 1.3)) * (1 - pan) });
    let top = 500;
    chipPills.forEach((chip, index) => {
      const enter = get(`learn.chip${index}`);
      const [from, to] = CHIP_SPANS[chip.span];
      const fromX = 960 + ((from + to) / 2 - (chipsRegion.x + chipsRegion.w / 2)) * CHIP_BIG;
      const width = chip.face.offsetWidth;
      const dx = lerp(fromX - width * 0.25 - 120, 0, enter);
      const dy = lerp(CHIPS_BIG_CY - top - 16, 0, enter);
      setAlpha(chip.root, clamp01(enter * 2.5));
      chip.root.style.top = `${top}px`;
      chip.root.style.transformOrigin = "0 0";
      chip.root.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${lerp(0.5, 1, enter).toFixed(3)})`;
      const reason = get("learn.reasons");
      setAlpha(chip.reason, reason);
      chip.reason.style.transform = `translateY(${((1 - reason) * -14).toFixed(1)}px)`;
      top += 170;
    });
    showMoving(memRole, get("learn.memRole"), 0, 20);
    const memoryIn = get("learn.memory");
    const swap = get("learn.swap");
    const memoryOut = get("learn.memoryOut");
    memoryPlane.place(camera, { cx: memoryCx + (1 - memoryIn) * 120 + shift, cy: memoryCy - memoryOut * 60, w: memoryWidth * (1 - 0.06 * memoryOut), alpha: clamp01(memoryIn * 1.5) * (1 - memoryOut) * (1 - pan), rotY: -0.08 * (1 - memoryIn) });
    memoryYesPlane.place(camera, { cx: MEMORY_LEFT + memoryYesWidth / 2 + shift, cy: memoryYesCy + (1 - swap) * 70, w: memoryYesWidth * (0.94 + 0.06 * swap), alpha: clamp01(swap * 1.4) * (1 - pan), depth: 9.8 });
    showMoving(known, get("learn.known"), 0, 24);
    const point = along(learnPath, time);
    const cursorAlpha = time > learnPath[0].at && time < learnPath[learnPath.length - 1].at ? 1 : 0;
    showCursor(learnCursor, point.x, point.y, cursorAlpha, pressAt(time, L + 3.95));
  }

  function drawSuggest(time: number) {
    const textOut = get("sug.textOut");
    showHeading(suggestHeading, get("sug.head"), get("sug.headOut"));
    showMoving(sugHead, get("sug.badge"), textOut, 20);
    showMoving(sugValue, get("sug.value"), textOut, 30);
    showMoving(sugReason, get("sug.reason"), textOut, 24);
    const cardIn = get("sug.card");
    const screenPan = get("screen.pan");
    const lift = get("sug.lift");
    const cx = SUGGEST_CX + (1 - cardIn) * PAN - screenPan * screenShift;
    const width = suggestRegion.w * SUGGEST_SCALE * (1 + 0.035 * lift);
    suggestPlane.place(camera, { cx, cy: SUGGEST_CY - lift * 12, w: width, alpha: clamp01(cardIn * 1.4) * (1 - clamp01(screenPan * 1.6)), depth: 10 - lift * 0.4 });
    const kept = get("sug.kept") * (1 - clamp01(screenPan * 2));
    const height = suggestRegion.h * SUGGEST_SCALE * (1 + 0.035 * lift);
    Object.assign(pinRing.style, { left: `${cx - width / 2 - 8}px`, top: `${SUGGEST_CY - lift * 12 - height / 2 - 8}px`, width: `${width + 16}px`, height: `${height + 16}px` });
    setAlpha(pinRing, kept * (1 - 0.6 * clamp01((time - S - 4.0) / 0.8)));
    Object.assign(pinBadge.style, { left: `${cx + width / 2 - 52}px`, top: `${SUGGEST_CY - height / 2 - 30}px`, transform: `scale(${lerp(0.3, 1, ease("back.out(2.2)")(kept)).toFixed(3)})` });
    setAlpha(pinBadge, kept);
    const point = along(sugPath, time);
    const cursorAlpha = time > sugPath[0].at && time < sugPath[sugPath.length - 1].at ? 1 : 0;
    showCursor(sugCursor, point.x, point.y, cursorAlpha, pressAt(time, S + 3.2));
    const anomalyCx = SUGGEST_CX + screenShift * (1 - screenPan) - get("fore.panOut") * PAN;
    const anomalyCy = SUGGEST_CY + anomalyDy;
    const panOut = get("fore.panOut");
    anomaliesPlane.place(camera, { cx: anomalyCx, cy: anomalyCy, w: anomaliesRegion.w * SUGGEST_SCALE, alpha: clamp01(screenPan * 1.5) * (1 - clamp01(panOut * 1.4)) });
    const outlineIn = get("fore.outline") * (1 - panOut);
    const ox = anomalyCx + (topAnomaly.x - (anomaliesRegion.x + anomaliesRegion.w / 2)) * SUGGEST_SCALE;
    const oy = anomalyCy + (topAnomaly.y - (anomaliesRegion.y + anomaliesRegion.h / 2)) * SUGGEST_SCALE;
    Object.assign(outline.style, { left: `${ox - 10}px`, top: `${oy - 10}px`, width: `${topAnomaly.w * SUGGEST_SCALE + 20}px`, height: `${topAnomaly.h * SUGGEST_SCALE + 20}px` });
    setAlpha(outline, outlineIn);
  }

  function drawForesee() {
    const panOut = get("fore.panOut");
    const exit = get("fore.exit");
    showHeading(foreHeading, get("fore.head"), exit);
    showMoving(anomaly, get("fore.anomaly"), panOut, 30, `translateX(${(-panOut * PAN).toFixed(1)}px)`);
    showMoving(lesson, get("fore.lesson"), panOut, 30, `translateX(${(-panOut * PAN).toFixed(1)}px)`);
    const enter = get("fore.forecast");
    const width = forecastRegion.w * FORECAST_SCALE;
    forecastPlane.place(camera, { cx: 1800 - width / 2 + (1 - enter) * PAN + exit * -60, cy: 318 + (forecastRegion.h * FORECAST_SCALE) / 2 + 40, w: width * (1 - exit * 0.25), alpha: clamp01(enter * 1.5) * (1 - exit) });
    showMoving(forecastText, get("fore.forecastText"), exit, 30);
  }

  return {
    draw(time: number) {
      drawLearn(time);
      drawSuggest(time);
      drawForesee();
    },
  };
}
