import { BRAND_GRADIENT, FACTS, gsap, mark, overlayElement, roleTitle, thaiWords } from "../kit";
import { CHART_BOX, CLIFF_INDEX, chartPixel } from "./dawn-chart";
import { BEAT, clockLabel, clockMinute, DOT, LOGO, NODES, sparkPoints, STOP_IDS, STORY_ID, storyOf } from "./dawn-plan";

const FONT = '"Inter","Noto Sans Thai",sans-serif';
const TEXT_GRADIENT = "linear-gradient(100deg, #8f8cff 0%, #b18cff 45%, #ff8fa3 100%)";
const LAVENDER = "#c9c3ff";
const SOFT_WHITE = "#f4f1ff";
const LEFT = 140;
const ACTION_WIDTH = 820;
const ACTION_FONT = `500 48px ${FONT}`;
const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const FEED_ROWS = 3;
const WORD_STAGGER = 0.07;
const WORD_RISE = 0.55;
const SHADOW = "0 2px 24px rgba(10,6,40,0.35)";

const easeOut = gsap.parseEase("power3.out");
const easeInOut = gsap.parseEase("power2.inOut");

type Words = { element: HTMLDivElement; words: HTMLSpanElement[] };

/** What the overlay stroke (the W and the flat line it unbends into) looks like at one instant. */
export type StrokeState = { bend: number; tail: number; opacity: number; dot: number; glow: number; tile: number; wordmark: number };

/** The HTML type layer: every Thai line of the film plus the logo stroke. */
export type TypeLayer = { update: (t: number, stroke: StrokeState) => void; dispose: () => void };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** 0 before `start`, eased to 1 over `span` seconds. */
function rise(t: number, start: number, span = 0.6): number {
  return easeOut(clamp01((t - start) / span));
}

/** 1 until `start`, eased down to 0 over `span` seconds. */
function fall(t: number, start: number, span = 0.45): number {
  return 1 - easeInOut(clamp01((t - start) / span));
}

function show(element: HTMLElement, opacity: number, dy = 0, blur = 0, scale = 1): void {
  element.style.opacity = opacity.toFixed(3);
  element.style.visibility = opacity > 0.001 ? "visible" : "hidden";
  element.style.transform = `translate3d(0, ${dy.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
  element.style.filter = blur > 0.05 ? `blur(${blur.toFixed(1)}px)` : "none";
}

function thaiDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${day} ${THAI_MONTHS[month - 1]}`;
}

function textBlock(parent: HTMLElement, style: Partial<CSSStyleDeclaration>, text: string): HTMLDivElement {
  return overlayElement(parent, { fontFamily: FONT, whiteSpace: "nowrap", color: "#ffffff", textShadow: SHADOW, willChange: "opacity, transform, filter", ...style }, text);
}

function gradientText(element: HTMLElement): void {
  Object.assign(element.style, { backgroundImage: TEXT_GRADIENT, webkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", textShadow: "none" });
}

function wordLine(parent: HTMLElement, style: Partial<CSSStyleDeclaration>, text: string): Words {
  const element = textBlock(parent, style, "");
  const words = thaiWords(text).map((word) => {
    const span = document.createElement("span");
    span.textContent = word;
    span.style.display = "inline-block";
    span.style.whiteSpace = "pre";
    element.append(span);
    return span;
  });
  return { element, words };
}

function revealWords(line: Words, elapsed: number): void {
  line.words.forEach((span, index) => {
    const p = easeOut(clamp01((elapsed - index * WORD_STAGGER) / WORD_RISE));
    span.style.opacity = p.toFixed(3);
    span.style.transform = `translateY(${((1 - p) * 26).toFixed(1)}px)`;
    span.style.filter = p < 0.99 ? `blur(${((1 - p) * 8).toFixed(1)}px)` : "none";
  });
}

function measureWidth(text: string, font: string): number {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return text.length * 24;
  context.font = font;
  return context.measureText(text).width;
}

const UNBREAKABLE = FACTS.dailyOrders.map((series) => series.agent.split(" ")[0]);

function wordsKeepingNames(text: string): string[] {
  const pattern = new RegExp(`(${UNBREAKABLE.join("|")})`);
  return text.split(pattern).filter((part) => part !== "").flatMap((part) => (UNBREAKABLE.includes(part) ? [part] : thaiWords(part)));
}

function wrapThai(text: string, width: number, font: string): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of wordsKeepingNames(text)) {
    const candidate = current + word;
    if (current.trim() !== "" && measureWidth(candidate.trim(), font) > width) {
      lines.push(current.trim());
      current = word;
      continue;
    }
    current = candidate;
  }
  if (current.trim() !== "") lines.push(current.trim());
  return lines;
}

/** A role's next step trimmed to whole clauses that fit two lines. */
export function actionLines(action: string): string[] {
  const clauses = action.split(" ");
  for (let count = clauses.length; count >= 1; count -= 1) {
    const lines = wrapThai(clauses.slice(0, count).join(" "), ACTION_WIDTH, ACTION_FONT);
    if (lines.length <= 2) return lines;
  }
  return wrapThai(clauses[0], ACTION_WIDTH, ACTION_FONT).slice(0, 2);
}

function headerPart(pattern: RegExp): string {
  const found = mark("story", "header").text.match(pattern);
  if (!found) throw new Error(`Header lacks ${pattern}`);
  return found[0];
}

function splitAt(text: string, marker: string): [string, string] {
  const at = text.indexOf(marker);
  if (at < 0) return [text, ""];
  return [text.slice(0, at).trim(), text.slice(at).trim()];
}

/** Builds every overlay element once; `update` only moves and fades them. */
export function createTypeLayer(host: HTMLElement): TypeLayer {
  const parent = overlayElement(host, { left: "0", top: "0", width: "1920px", height: "1080px", overflow: "hidden" });
  const story = storyOf(STORY_ID);
  const [findingGoal, findingRest] = splitAt(story.finding, " ");
  const [findingAgents, findingTail] = splitAt(findingRest, "น่าจะ");
  const [agentsWho, agentsSince] = splitAt(findingAgents, "ตั้งแต่");
  const [lessonCause, lessonResult] = splitAt(FACTS.lesson.outcome, " ");

  const scrim = overlayElement(parent, { left: "0", top: "0", width: "1920px", height: "1080px", backgroundImage: "linear-gradient(90deg, rgba(14,8,40,0.62) 0%, rgba(14,8,40,0.38) 34%, rgba(14,8,40,0) 58%)" });
  const tile = overlayElement(parent, { left: `${LOGO.cx - LOGO.size / 2}px`, top: `${LOGO.cy - LOGO.size / 2}px`, width: `${LOGO.size}px`, height: `${LOGO.size}px`, borderRadius: `${LOGO.size * 0.24}px`, backgroundImage: BRAND_GRADIENT, boxShadow: "0 30px 90px rgba(76,29,149,0.55), inset 0 1px 0 rgba(255,255,255,0.35)" });
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("width", "1920");
  svg.setAttribute("height", "1080");
  svg.setAttribute("viewBox", "0 0 1920 1080");
  Object.assign(svg.style, { position: "absolute", left: "0", top: "0", overflow: "visible" });
  const polyline = document.createElementNS(svgNs, "polyline");
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", "#ffffff");
  polyline.setAttribute("stroke-linecap", "round");
  polyline.setAttribute("stroke-linejoin", "round");
  polyline.setAttribute("pathLength", "1");
  const dot = document.createElementNS(svgNs, "circle");
  dot.setAttribute("fill", "#ffffff");
  dot.setAttribute("cx", DOT[0].toFixed(2));
  dot.setAttribute("cy", DOT[1].toFixed(2));
  svg.append(polyline, dot);
  parent.append(svg);

  const wordmark = textBlock(parent, { left: "0", width: "1920px", top: `${LOGO.cy + LOGO.size / 2 + 44}px`, textAlign: "center", fontSize: "150px", fontWeight: "800", letterSpacing: "-0.045em", lineHeight: "1" }, "Winyu");
  const tagline = textBlock(parent, { left: "0", width: "1920px", top: `${LOGO.cy + LOGO.size / 2 + 236}px`, textAlign: "center", fontSize: "60px", fontWeight: "500", color: SOFT_WHITE, lineHeight: "1.2" }, "ผู้ช่วยข้อมูลสำหรับทุกคนในองค์กร");

  const hookKicker = wordLine(parent, { left: "0", width: "1920px", top: "470px", textAlign: "center", fontSize: "68px", fontWeight: "600", color: LAVENDER, lineHeight: "1.2" }, "ก่อนคุณตื่น");
  const clock = textBlock(parent, { left: "0", top: "0", fontSize: "250px", fontWeight: "700", letterSpacing: "-0.04em", lineHeight: "1", fontVariantNumeric: "tabular-nums", transformOrigin: "0 0" }, FACTS.totals.firstRun);
  const hookLine = textBlock(parent, { left: "0", width: "1920px", top: "816px", textAlign: "center", fontSize: "72px", fontWeight: "700", lineHeight: "1.2" }, "");
  const hookBrand = document.createElement("span");
  hookBrand.textContent = "Winyu";
  gradientText(hookBrand);
  hookLine.append(hookBrand, document.createTextNode(" สืบให้แล้ว"));

  const counter = textBlock(parent, { left: `${LEFT}px`, top: "252px", fontSize: "48px", fontWeight: "600", color: LAVENDER, lineHeight: "1" }, "");
  const counterLabel = document.createTextNode("ดูข้อมูล ");
  const counterNumber = document.createElement("span");
  Object.assign(counterNumber.style, { fontSize: "96px", fontWeight: "700", color: "#ffffff", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em" });
  counter.append(counterLabel, counterNumber, document.createTextNode(" ครั้ง"));
  const firing = [...NODES].sort((a, b) => a.fireAt - b.fireAt);
  const feedRows = Array.from({ length: FEED_ROWS + 1 }, () => textBlock(parent, { left: `${LEFT}px`, top: "0", fontSize: "42px", fontWeight: "500", lineHeight: "1.2" }, ""));

  const spineCount = textBlock(parent, { left: `${LEFT}px`, top: "96px", fontSize: "76px", fontWeight: "600", lineHeight: "1", color: SOFT_WHITE }, "");
  const spineNumber = document.createElement("span");
  spineNumber.textContent = String(FACTS.totals.spineRoles);
  Object.assign(spineNumber.style, { fontSize: "220px", fontWeight: "800", letterSpacing: "-0.05em" });
  gradientText(spineNumber);
  const spineOf = document.createElement("span");
  spineOf.textContent = ` / ${FACTS.totals.roles}`;
  Object.assign(spineOf.style, { fontSize: "120px", fontWeight: "700", color: "rgba(255,255,255,0.55)", letterSpacing: "-0.03em" });
  spineCount.append(spineNumber, spineOf, document.createTextNode("  ตำแหน่ง"));
  const spineLine = wordLine(parent, { left: `${LEFT}px`, top: "350px", fontSize: "100px", fontWeight: "700", lineHeight: "1.2" }, "เจอเรื่องเดียวกัน");

  const causeGoal = wordLine(parent, { left: `${LEFT}px`, top: "150px", fontSize: "100px", fontWeight: "700", lineHeight: "1.2", transformOrigin: "0 0" }, findingGoal);
  const causeWho = wordLine(parent, { left: `${LEFT}px`, top: "250px", fontSize: "84px", fontWeight: "700", lineHeight: "1.2" }, agentsWho);
  const causeSince = textBlock(parent, { left: `${LEFT}px`, top: "360px", fontSize: "84px", fontWeight: "700", lineHeight: "1.2" }, agentsSince);
  gradientText(causeSince);
  const causeTail = textBlock(parent, { left: `${LEFT - 8}px`, top: "220px", fontSize: "200px", fontWeight: "700", lineHeight: "1.25", letterSpacing: "-0.01em" }, findingTail);
  gradientText(causeTail);
  const [cliffX] = chartPixel(CLIFF_INDEX, 0);
  const cliffLabel = textBlock(parent, { left: `${cliffX + 16}px`, top: `${CHART_BOX.top - 44}px`, fontSize: "40px", fontWeight: "600", color: SOFT_WHITE, lineHeight: "1" }, thaiDate(FACTS.dailyOrders[0].points[CLIFF_INDEX].date));
  const legend = FACTS.dailyOrders.map((series, index) => {
    const row = textBlock(parent, { left: `${cliffX + 250}px`, top: `${CHART_BOX.top + 30 + index * 58}px`, fontSize: "40px", fontWeight: "500", color: SOFT_WHITE, lineHeight: "1.2" }, "");
    const swatch = document.createElement("span");
    Object.assign(swatch.style, { display: "inline-block", width: "34px", height: "6px", borderRadius: "3px", marginRight: "18px", verticalAlign: "middle", background: index === 0 ? "#fb7185" : "#a78bfa", boxShadow: `0 0 12px ${index === 0 ? "#fb7185" : "#a78bfa"}` });
    row.append(swatch, document.createTextNode(series.agent));
    return row;
  });

  const ruledKicker = textBlock(parent, { left: `${LEFT}px`, top: "170px", fontSize: "48px", fontWeight: "600", color: LAVENDER, lineHeight: "1.2" }, "ตัดทิ้งแล้ว");
  const ruled = story.ruledOut.map((reason, index) => {
    const line = textBlock(parent, { left: `${LEFT}px`, top: `${250 + index * 118}px`, fontSize: "84px", fontWeight: "700", lineHeight: "1.2" }, reason);
    const strike = document.createElement("div");
    Object.assign(strike.style, { position: "absolute", left: "-6px", top: "54%", height: "7px", width: "0", borderRadius: "4px", background: "linear-gradient(90deg,#ffffff,#ff8fa3)", boxShadow: "0 0 18px rgba(255,143,163,0.8)" });
    line.append(strike);
    return { line, strike };
  });
  const lessonKicker = textBlock(parent, { left: `${LEFT}px`, top: "170px", fontSize: "48px", fontWeight: "600", color: LAVENDER, lineHeight: "1.2" }, `ครั้งก่อน · ${FACTS.lesson.date}`);
  const lessonCauseLine = textBlock(parent, { left: `${LEFT - 6}px`, top: "236px", fontSize: "150px", fontWeight: "700", lineHeight: "1.25" }, lessonCause);
  gradientText(lessonCauseLine);
  const lessonResultLine = wordLine(parent, { left: `${LEFT}px`, top: "450px", fontSize: "76px", fontWeight: "600", lineHeight: "1.2", color: SOFT_WHITE }, lessonResult);

  const chipTop = textBlock(parent, { left: `${LEFT}px`, top: "380px", fontSize: "76px", fontWeight: "700", lineHeight: "1.2" }, "");
  const chipBrand = document.createElement("span");
  chipBrand.textContent = "Winyu";
  gradientText(chipBrand);
  chipTop.append(chipBrand, document.createTextNode(headerPart(/ สืบให้เมื่อ \d\d:\d\d/)));
  const chipBottom = textBlock(parent, { left: `${LEFT}px`, top: "496px", fontSize: "56px", fontWeight: "600", lineHeight: "1.2", color: LAVENDER }, headerPart(/ดูข้อมูล \d+ ครั้ง/));

  const stops = STOP_IDS.map((id) => {
    const title = textBlock(parent, { left: `${LEFT}px`, top: "0", fontSize: "56px", fontWeight: "700", lineHeight: "1.2" }, roleTitle(id));
    const lines = actionLines(storyOf(id).action).map((text) => textBlock(parent, { left: `${LEFT}px`, top: "0", fontSize: "48px", fontWeight: "500", lineHeight: "1.3", color: SOFT_WHITE }, text));
    return { title, lines };
  });
  const slamTop = wordLine(parent, { left: `${LEFT}px`, top: "96px", fontSize: "120px", fontWeight: "700", lineHeight: "1.2" }, "เรื่องเดียว");
  const slamBottom = wordLine(parent, { left: `${LEFT}px`, top: "250px", fontSize: "80px", fontWeight: "700", lineHeight: "1.2" }, "ทุกตำแหน่งรู้ว่าต้องทำอะไรต่อ");

  const clockWidth = clock.offsetWidth || 620;
  const clockCentered = { x: 960 - clockWidth / 2, y: 548, scale: 1 };
  const clockCorner = { x: LEFT, y: 104, scale: 0.52 };

  const updateStroke = (stroke: StrokeState) => {
    const points = sparkPoints(stroke.bend).map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    polyline.setAttribute("points", points);
    polyline.setAttribute("stroke-width", lerp(6, (7 * LOGO.size) / 64, stroke.bend).toFixed(2));
    polyline.setAttribute("stroke-dasharray", `${Math.max(0, 1 - stroke.tail).toFixed(4)} 2`);
    polyline.setAttribute("stroke-dashoffset", (-stroke.tail).toFixed(4));
    polyline.style.opacity = stroke.tail >= 0.999 ? "0" : "1";
    dot.setAttribute("r", lerp(11, (5 * LOGO.size) / 64, stroke.bend).toFixed(2));
    dot.style.opacity = stroke.dot.toFixed(3);
    svg.style.opacity = stroke.opacity.toFixed(3);
    svg.style.visibility = stroke.opacity > 0.001 ? "visible" : "hidden";
    const glow = stroke.glow;
    svg.style.filter = glow > 0.01 ? `drop-shadow(0 0 ${(8 * glow).toFixed(1)}px rgba(214,204,255,${(0.95 * glow).toFixed(2)})) drop-shadow(0 0 ${(26 * glow).toFixed(1)}px rgba(139,92,246,${(0.85 * glow).toFixed(2)}))` : "none";
    show(tile, stroke.tile, 0, 0, lerp(0.82, 1, stroke.tile));
    show(wordmark, stroke.wordmark, (1 - stroke.wordmark) * 30, (1 - stroke.wordmark) * 10);
  };

  const updateHook = (t: number) => {
    const out = fall(t, 4.3, 0.6);
    revealWords(hookKicker, t - BEAT.hookTypeIn);
    show(hookKicker.element, out, -(1 - out) * 30);
    const lineIn = rise(t, 1.1, 0.7);
    show(hookLine, lineIn * out, (1 - lineIn) * 26 - (1 - out) * 30, (1 - lineIn) * 8);
    const move = easeInOut(clamp01((t - 4.6) / 1.2));
    const clockIn = rise(t, 0.6, 0.8);
    const clockOut = fall(t, 14.0, 0.5);
    clock.textContent = clockLabel(clockMinute(t));
    const x = lerp(clockCentered.x, clockCorner.x, move);
    const y = lerp(clockCentered.y, clockCorner.y, move);
    const scale = lerp(clockCentered.scale, clockCorner.scale, move);
    clock.style.opacity = (clockIn * clockOut).toFixed(3);
    clock.style.visibility = clockIn * clockOut > 0.001 ? "visible" : "hidden";
    clock.style.transform = `translate3d(${x.toFixed(1)}px, ${(y + (1 - clockIn) * 40).toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
    clock.style.filter = clockIn < 0.99 ? `blur(${((1 - clockIn) * 12).toFixed(1)}px)` : "none";
  };

  const updateNight = (t: number) => {
    const inLevel = rise(t, 5.7, 0.6) * fall(t, 14.0, 0.5);
    let checked = 0;
    for (const node of firing) checked += node.checked * easeOut(clamp01((t - node.fireAt) / 0.5));
    counterNumber.textContent = Math.round(checked).toLocaleString("en-US");
    show(counter, inLevel, (1 - rise(t, 5.7, 0.6)) * 24);
    const fired = firing.filter((node) => node.fireAt <= t);
    const newest = fired.length;
    const shift = newest > 0 ? easeOut(clamp01((t - fired[newest - 1].fireAt) / 0.35)) : 1;
    feedRows.forEach((row, slot) => {
      const node = fired[newest - 1 - slot];
      if (!node || inLevel <= 0.001) return show(row, 0);
      const position = slot - 1 + shift;
      row.textContent = "";
      const time = document.createElement("span");
      time.textContent = clockLabel(node.minute);
      Object.assign(time.style, { fontVariantNumeric: "tabular-nums", color: LAVENDER, marginRight: "24px", fontWeight: "600" });
      row.append(time, document.createTextNode(node.role));
      row.style.top = `${940 - position * 62}px`;
      const fade = slot === 0 ? shift : Math.max(0, 1 - position * 0.34);
      show(row, fade * inLevel);
    });
  };

  const updateSpine = (t: number) => {
    const inLevel = rise(t, 14.5, 0.7);
    const out = fall(t, 19.7, 0.5);
    show(spineCount, inLevel * out, (1 - inLevel) * 36 - (1 - out) * 24, (1 - inLevel) * 10);
    revealWords(spineLine, t - 15.2);
    show(spineLine.element, out, -(1 - out) * 24);
  };

  const updateCause = (t: number) => {
    revealWords(causeGoal, t - (BEAT.chartStart + 0.2));
    const shrink = easeInOut(clamp01((t - 22.5) / 0.7));
    const goalOut = fall(t, 26.8, 0.45);
    causeGoal.element.style.fontSize = `${lerp(100, 56, shrink).toFixed(1)}px`;
    causeGoal.element.style.color = shrink > 0.5 ? LAVENDER : "#ffffff";
    show(causeGoal.element, goalOut, lerp(0, -40, shrink));
    const whoIn = t - 22.75;
    revealWords(causeWho, whoIn);
    const whoOut = fall(t, 24.65, 0.4);
    show(causeWho.element, whoIn > 0 ? whoOut : 0, -(1 - whoOut) * 30);
    const sinceIn = rise(t, BEAT.chartCliff - 0.1, 0.5);
    show(causeSince, sinceIn * whoOut, (1 - sinceIn) * 20 - (1 - whoOut) * 30, (1 - sinceIn) * 8);
    const tailIn = rise(t, 25.05, 0.7);
    const tailOut = fall(t, 26.8, 0.45);
    show(causeTail, tailIn * tailOut, (1 - tailIn) * 40 - (1 - tailOut) * 30, (1 - tailIn) * 14, lerp(0.94, 1, tailIn));
    const labelLevel = rise(t, BEAT.chartCliff, 0.5) * fall(t, 29.8, 0.5);
    show(cliffLabel, labelLevel, (1 - labelLevel) * 12);
    legend.forEach((row, index) => {
      const level = rise(t, BEAT.chartEnd - 0.2 + index * 0.15, 0.6) * fall(t, 29.8, 0.5);
      show(row, level, (1 - level) * 16);
    });
  };

  const updateRuledOut = (t: number) => {
    const out = fall(t, 29.9, 0.45);
    const kickerIn = rise(t, BEAT.ruledOut, 0.5);
    show(ruledKicker, kickerIn * out, (1 - kickerIn) * 16);
    ruled.forEach(({ line, strike }, index) => {
      const start = BEAT.ruledOut + 0.3 + index * 0.35;
      const lineIn = rise(t, start, 0.6);
      const struck = easeInOut(clamp01((t - (28.1 + index * 0.55)) / 0.5));
      strike.style.width = `${(struck * (line.offsetWidth + 12)).toFixed(1)}px`;
      line.style.color = struck > 0.99 ? "rgba(255,255,255,0.6)" : "#ffffff";
      show(line, lineIn * out, (1 - lineIn) * 24 - (1 - out) * 20, (1 - lineIn) * 8);
    });
    const lessonOut = fall(t, 32.55, 0.5);
    const kicker = rise(t, BEAT.lesson + 0.15, 0.5);
    show(lessonKicker, kicker * lessonOut, (1 - kicker) * 16);
    const cause = rise(t, BEAT.lesson + 0.35, 0.7);
    show(lessonCauseLine, cause * lessonOut, (1 - cause) * 36 - (1 - lessonOut) * 24, (1 - cause) * 12);
    revealWords(lessonResultLine, t - (BEAT.lesson + 1.0));
    show(lessonResultLine.element, t > BEAT.lesson ? lessonOut : 0, -(1 - lessonOut) * 24);
  };

  const updateChip = (t: number) => {
    const out = fall(t, 37.35, 0.45);
    const top = rise(t, 34.95, 0.7);
    const bottom = rise(t, 35.25, 0.7);
    show(chipTop, top * out, (1 - top) * 28 - (1 - out) * 20, (1 - top) * 10);
    show(chipBottom, bottom * out, (1 - bottom) * 28 - (1 - out) * 20, (1 - bottom) * 10);
  };

  const updateStops = (t: number) => {
    show(scrim, rise(t, BEAT.stops[0], 0.8) * fall(t, BEAT.pullBack + 0.2, 0.8));
    stops.forEach(({ title, lines }, index) => {
      const start = BEAT.stops[index];
      const out = fall(t, start + BEAT.stopLength - 0.45, 0.35);
      const titleIn = rise(t, start + 0.45, 0.6);
      const top = 540 - (56 * 1.2 + lines.length * 48 * 1.3 + 24) / 2 - 20;
      title.style.top = `${top}px`;
      show(title, titleIn * out, (1 - titleIn) * 24 - (1 - out) * 18, (1 - titleIn) * 8);
      lines.forEach((line, lineIndex) => {
        const lineIn = rise(t, start + 0.7 + lineIndex * 0.18, 0.6);
        line.style.top = `${top + 56 * 1.2 + 24 + lineIndex * 48 * 1.3}px`;
        show(line, lineIn * out, (1 - lineIn) * 20 - (1 - out) * 18, (1 - lineIn) * 6);
      });
    });
    const slamOut = fall(t, 52.5, 0.45);
    revealWords(slamTop, t - (BEAT.pullBack + 0.2));
    show(slamTop.element, t > BEAT.pullBack ? slamOut : 0, -(1 - slamOut) * 24);
    revealWords(slamBottom, t - (BEAT.pullBack + 0.65));
    show(slamBottom.element, t > BEAT.pullBack ? slamOut : 0, -(1 - slamOut) * 24);
  };

  const updateLogoType = (t: number, stroke: StrokeState) => {
    const tagIn = rise(t, BEAT.logoTile + 0.9, 0.7) * fall(t, BEAT.logoOut, 0.5);
    show(tagline, tagIn * (stroke.wordmark > 0 ? 1 : 0), (1 - tagIn) * 20, (1 - tagIn) * 8);
  };

  return {
    update(t, stroke) {
      updateStroke(stroke);
      updateHook(t);
      updateNight(t);
      updateSpine(t);
      updateCause(t);
      updateRuledOut(t);
      updateChip(t);
      updateStops(t);
      updateLogoType(t, stroke);
    },
    dispose() {
      parent.remove();
    },
  };
}
