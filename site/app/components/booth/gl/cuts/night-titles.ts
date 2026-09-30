import { BRAND } from "../kit";
import { CONVERGE, FIRE_TIMES, clockMinute } from "./night-corridor";
import { DAWN_DRAWERS, FINDING_BEATS, LESSON_DATE, LESSON_LINES, NIGHT_ROLES, NIGHT_SPAN, NIGHT_TOTALS, RULED_OUT, SPINE_ROLES, STORY_CARD_TITLE, STORY_HERO, STORY_TOP_AGENTS, clockOf } from "./night-data";
import { SCREENS } from "./night-screens";
import { cue, layer, span, track, wordReveal, type Layer } from "./night-type";

/** Beats of the type-led shots. */
export const TITLES = { hookOut: 4.5, beatOne: 19.35, beatTwo: 21.45, beatThree: 23.7, slamOut: 25.75, ruled: 26.1, slabs: [26.35, 26.85], strikes: [27.0, 27.45], fall: 28.2, memory: 28.95, memoryOut: 31.8, row: 49.9, rowOut: 50.9, logo: 52.9, logoOut: 57.0, returnIn: 58.6, returnFull: 59.6 };

const WHITE = "#f5f3ff";
const GLOW_GRADIENT = "linear-gradient(135deg, #9d9bff, #b98cff 55%, #ff8fa3)";
const MUTED = "rgba(226, 224, 255, 0.72)";
const LAVENDER = "#c4b5fd";
const CORAL = "#ff8fa3";
const SHADOW = "0 2px 30px rgba(8, 6, 30, 0.55)";
/** The ellipse the ten spine role titles ride on, in stage pixels. */
export const ORBIT = { x: 960, y: 560, rx: 480, ry: 330 };
const ORBIT_SLOTS = [-60, -120, 60, 120, -30, -150, 30, 150, 0, 180].map((degrees) => (degrees * Math.PI) / 180);
const LABEL_GAP = 22;
const SAFE = { left: 70, right: 1850 };

type Titles = { update: (t: number, rowFeet: () => [number, number][]) => void; orbitDots: () => { x: number; y: number; o: number }[] };

function gradientText(element: HTMLElement): void {
  Object.assign(element.style, { backgroundImage: GLOW_GRADIENT, backgroundClip: "text", webkitBackgroundClip: "text", color: "transparent", textShadow: "none", paddingBottom: "0.12em" });
}

function block(parent: HTMLElement, style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const element = document.createElement("div");
  Object.assign(element.style, { position: "absolute", inset: "0", ...style });
  parent.append(element);
  return element;
}

function hookLayers(root: HTMLElement, timeline: gsap.core.Timeline) {
  const clock = layer(root, { left: "150px", top: "170px", fontSize: "220px", fontWeight: "600", letterSpacing: "-0.045em", color: WHITE, fontVariantNumeric: "tabular-nums", transformOrigin: "0 0", textShadow: SHADOW }, clockOf(NIGHT_SPAN.first));
  track(timeline, clock, "o", [[0, 1], [CONVERGE.gather - 0.1, 1], [CONVERGE.gather + 0.4, 0, "power2.in"], [TITLES.returnIn, 0], [TITLES.returnFull, 1, "power2.out"]]);
  track(timeline, clock, "s", [[0, 1], [TITLES.hookOut, 1.03, "sine.inOut"], [5.4, 0.5, "power3.inOut"], [TITLES.returnIn, 0.5], [TITLES.returnIn + 0.01, 1, "none"]]);
  track(timeline, clock, "x", [[0, 0], [TITLES.hookOut, 0], [5.4, -30, "power3.inOut"], [TITLES.returnIn, -30], [TITLES.returnIn + 0.01, 0, "none"]]);
  track(timeline, clock, "y", [[0, 0], [TITLES.hookOut, 0], [5.4, -100, "power3.inOut"], [TITLES.returnIn, -100], [TITLES.returnIn + 0.01, 18, "none"], [TITLES.returnFull + 0.35, 0, "power3.out"]]);
  const before = layer(root, { left: "160px", top: "500px", fontSize: "72px", fontWeight: "600", color: WHITE, textShadow: SHADOW }, "ก่อนคุณตื่น");
  track(timeline, before, "o", [[0, 1], [TITLES.hookOut, 1], [TITLES.hookOut + 0.4, 0, "power2.in"], [TITLES.returnIn + 0.2, 0], [TITLES.returnFull, 1, "power2.out"]]);
  track(timeline, before, "y", [[0, 0], [TITLES.hookOut, 0], [TITLES.hookOut + 0.4, -20, "power2.in"], [TITLES.returnIn + 0.2, -20], [TITLES.returnIn + 0.21, 20, "none"], [TITLES.returnFull + 0.35, 0, "power3.out"]]);
  const solved = layer(root, { left: "160px", top: "592px", fontSize: "72px", fontWeight: "600", color: WHITE, textShadow: SHADOW });
  gradientText(span(solved.el, "Winyu"));
  span(solved.el, " สืบให้แล้ว");
  cue(timeline, solved, { at: 1.1, out: TITLES.hookOut + 0.05, fadeOut: 0.4 });
  return { clock, layers: [clock, before, solved] };
}

function shiftLayers(root: HTMLElement, timeline: gsap.core.Timeline) {
  const ticker = layer(root, { left: "120px", top: "924px", fontSize: "48px", fontWeight: "600", color: WHITE, textShadow: SHADOW });
  const tickerTime = span(ticker.el, "", { color: LAVENDER, fontVariantNumeric: "tabular-nums" });
  const tickerRole = span(ticker.el, "");
  cue(timeline, ticker, { at: 5.35, out: CONVERGE.gather - 0.1 });
  const counter = layer(root, { right: "120px", top: "74px", fontSize: "44px", fontWeight: "500", color: MUTED, textShadow: SHADOW, display: "flex", alignItems: "baseline", gap: "18px" });
  span(counter.el, "ดูข้อมูล");
  const count = span(counter.el, "0", { fontSize: "72px", fontWeight: "700", color: WHITE, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" });
  span(counter.el, "ครั้ง");
  cue(timeline, counter, { at: 5.35, out: CONVERGE.gather - 0.1 });

  function update(t: number) {
    const fired = FIRE_TIMES.reduce((last, time, index) => (t >= time ? index : last), -1);
    const current = NIGHT_ROLES[Math.max(0, fired)];
    tickerTime.textContent = `${current.ranAt} · `;
    tickerRole.textContent = current.role;
    const since = fired >= 0 ? t - FIRE_TIMES[fired] : 1;
    ticker.el.style.opacity = (ticker.o * (0.35 + 0.65 * Math.min(1, since / 0.12))).toFixed(3);
    const checked = NIGHT_ROLES.reduce((sum, person, index) => sum + person.checked * Math.min(1, Math.max(0, (t - FIRE_TIMES[index]) / 0.35)), 0);
    count.textContent = Math.round(checked).toLocaleString("en-US");
  }
  return { layers: [ticker, counter], update };
}

function convergeLayers(root: HTMLElement, timeline: gsap.core.Timeline) {
  const total = layer(root, { left: "0", width: "1920px", top: "300px", textAlign: "center", fontSize: "160px", fontWeight: "700", letterSpacing: "-0.03em", color: WHITE, fontVariantNumeric: "tabular-nums", textShadow: "0 0 40px rgba(20, 8, 50, 0.65)" });
  span(total.el, String(NIGHT_TOTALS.spineRoles));
  span(total.el, ` / ${NIGHT_TOTALS.roles}`, { color: "rgba(245, 243, 255, 0.55)" });
  cue(timeline, total, { at: CONVERGE.impact + 0.12, out: CONVERGE.fade, slam: true, fadeOut: 0.4 });
  const caption = layer(root, { left: "0", width: "1920px", top: "628px", textAlign: "center", fontSize: "64px", fontWeight: "600", color: WHITE, textShadow: SHADOW }, "ตำแหน่ง เจอเรื่องเดียวกัน");
  cue(timeline, caption, { at: CONVERGE.impact + 0.3, out: CONVERGE.fade, rise: 18 });
  const orbit = { drift: 0 };
  track(timeline, orbit, "drift", [[0, 0], [CONVERGE.impact + 0.3, 0], [CONVERGE.gone, 0.09, "none"]]);
  const labels = SPINE_ROLES.map((person, index) => {
    const label = layer(root, { left: "0", top: "0", fontSize: "40px", fontWeight: "500", color: "rgba(255, 236, 240, 0.92)", textShadow: SHADOW }, person.role);
    cue(timeline, label, { at: CONVERGE.impact + 0.55 + index * 0.08, out: CONVERGE.fade - 0.1 + index * 0.02, rise: 0, leave: 0, fadeIn: 0.5, fadeOut: 0.35 });
    return label;
  });
  const widths = labels.map((label) => label.el.getBoundingClientRect().width || label.el.scrollWidth);
  const byWidth = widths.map((width, index) => ({ width, index })).sort((a, b) => b.width - a.width);
  const angles = new Array<number>(labels.length);
  byWidth.forEach(({ index }, rank) => {
    angles[index] = ORBIT_SLOTS[rank];
  });

  function dot(index: number) {
    const angle = angles[index] + orbit.drift;
    return { x: ORBIT.x + Math.cos(angle) * ORBIT.rx, y: ORBIT.y + Math.sin(angle) * ORBIT.ry };
  }

  function update() {
    labels.forEach((label, index) => {
      const { x, y } = dot(index);
      const cos = Math.cos(angles[index] + orbit.drift);
      const width = widths[index];
      let left = cos >= 0 ? x + LABEL_GAP : x - LABEL_GAP - width;
      left = Math.min(SAFE.right - width, Math.max(SAFE.left, left));
      const top = y - 28;
      label.x = left;
      label.y = top;
    });
  }
  return {
    layers: [total, caption, ...labels],
    update,
    dots: () => labels.map((label, index) => ({ ...dot(index), o: label.o })),
  };
}

function slamLayers(root: HTMLElement, timeline: gsap.core.Timeline) {
  const first = layer(root, { left: "140px", top: "190px", fontSize: "112px", fontWeight: "700", letterSpacing: "-0.01em", color: WHITE, transformOrigin: "0 50%", textShadow: SHADOW }, FINDING_BEATS.first);
  cue(timeline, first, { at: TITLES.beatOne, out: TITLES.beatTwo - 0.12, slam: true });
  const second = layer(root, { left: "140px", top: "150px", fontSize: "104px", fontWeight: "700", color: WHITE, transformOrigin: "0 50%", textShadow: SHADOW }, FINDING_BEATS.second);
  cue(timeline, second, { at: TITLES.beatTwo, out: TITLES.beatThree - 0.12, slam: true });
  const since = layer(root, { left: "140px", top: "290px", fontSize: "104px", fontWeight: "700", color: CORAL, transformOrigin: "0 50%", textShadow: SHADOW }, FINDING_BEATS.since);
  cue(timeline, since, { at: TITLES.beatTwo + 0.35, out: TITLES.beatThree - 0.12, slam: true });
  const cause = layer(root, { left: "130px", top: "150px", fontSize: "184px", fontWeight: "700", letterSpacing: "-0.01em", color: WHITE, transformOrigin: "0 50%" });
  gradientText(span(cause.el, FINDING_BEATS.cause));
  cue(timeline, cause, { at: TITLES.beatThree, out: TITLES.slamOut, slam: true, fadeOut: 0.3 });
  return [first, second, since, cause];
}

function slab(parent: HTMLElement, text: string, top: number) {
  const row = layer(parent, { left: "0", width: "1920px", top: `${top}px`, display: "flex", justifyContent: "center", transformOrigin: "50% 100%" });
  const card = document.createElement("div");
  Object.assign(card.style, {
    position: "relative",
    padding: "34px 64px 40px",
    borderRadius: "28px",
    fontSize: "72px",
    fontWeight: "600",
    color: WHITE,
    background: "linear-gradient(160deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05))",
    border: "1.5px solid rgba(255,255,255,0.28)",
    boxShadow: "0 30px 80px rgba(5, 4, 25, 0.55), inset 0 1px 0 rgba(255,255,255,0.35)",
    backdropFilter: "blur(22px) saturate(140%)",
  } satisfies Partial<CSSStyleDeclaration>);
  card.textContent = text;
  const strike = document.createElement("div");
  Object.assign(strike.style, { position: "absolute", left: "48px", right: "48px", top: "52%", height: "7px", borderRadius: "4px", background: `linear-gradient(90deg, ${BRAND.coral}, #ffd1dc)`, transformOrigin: "0 50%", transform: "scaleX(0)", boxShadow: "0 0 18px rgba(251,113,133,0.8)" } satisfies Partial<CSSStyleDeclaration>);
  card.append(strike);
  row.el.append(card);
  return { row, card, strike };
}

function ruledLayers(root: HTMLElement, timeline: gsap.core.Timeline) {
  const stage = block(root, { perspective: "1500px", perspectiveOrigin: "50% 40%" });
  const header = layer(stage, { left: "0", width: "1920px", top: "150px", textAlign: "center", fontSize: "64px", fontWeight: "600", color: CORAL, letterSpacing: "0.01em", textShadow: SHADOW }, `✕  ตัดทิ้งแล้ว`);
  cue(timeline, header, { at: TITLES.ruled, out: TITLES.fall + 0.4 });
  const slabs = RULED_OUT.map((text, index) => {
    const piece = slab(stage, text, 310 + index * 230);
    const at = TITLES.slabs[index];
    track(timeline, piece.row, "o", [[0, 0], [at, 0], [at + 0.08, 1, "none"], [TITLES.fall + index * 0.14 + 0.35, 1], [TITLES.fall + index * 0.14 + 0.75, 0, "power2.in"]]);
    track(timeline, piece.row, "s", [[0, 1.35], [at, 1.35], [at + 0.22, 1, "power4.in"], [at + 0.3, 1.015, "power2.out"], [at + 0.42, 1, "power2.inOut"]]);
    track(timeline, piece.row, "rx", [[0, 0], [TITLES.fall + index * 0.14, 0], [TITLES.fall + index * 0.14 + 0.75, -78, "power2.in"]]);
    track(timeline, piece.row, "y", [[0, 0], [TITLES.fall + index * 0.14, 0], [TITLES.fall + index * 0.14 + 0.75, 260, "power2.in"]]);
    const cut = { p: 0 };
    track(timeline, cut, "p", [[0, 0], [TITLES.strikes[index], 0], [TITLES.strikes[index] + 0.3, 1, "power3.out"]]);
    return { piece, cut };
  });
  const memoryLabel = layer(root, { left: "0", width: "1920px", top: "330px", textAlign: "center", fontSize: "48px", fontWeight: "600", color: LAVENDER, textShadow: SHADOW }, "ครั้งก่อน");
  cue(timeline, memoryLabel, { at: TITLES.memory, out: TITLES.memoryOut });
  const memoryCause = layer(root, { left: "0", width: "1920px", top: "404px", textAlign: "center", fontSize: "112px", fontWeight: "700", color: WHITE, textShadow: SHADOW });
  const revealCause = wordReveal(memoryCause.el, LESSON_LINES[0]);
  cue(timeline, memoryCause, { at: TITLES.memory + 0.15, out: TITLES.memoryOut, rise: 0, fadeIn: 0.05 });
  const memoryOutcome = layer(root, { left: "0", width: "1920px", top: "574px", textAlign: "center", fontSize: "72px", fontWeight: "600", color: WHITE, textShadow: SHADOW });
  const revealOutcome = wordReveal(memoryOutcome.el, LESSON_LINES[1]);
  cue(timeline, memoryOutcome, { at: TITLES.memory + 0.8, out: TITLES.memoryOut, rise: 0, fadeIn: 0.05 });
  const memoryDate = layer(root, { left: "0", width: "1920px", top: "700px", textAlign: "center", fontSize: "40px", fontWeight: "500", color: MUTED, textShadow: SHADOW }, LESSON_DATE);
  cue(timeline, memoryDate, { at: TITLES.memory + 1.9, out: TITLES.memoryOut });
  const typing = { cause: 0, outcome: 0 };
  track(timeline, typing, "cause", [[0, 0], [TITLES.memory + 0.15, 0], [TITLES.memory + 0.85, 1, "none"]]);
  track(timeline, typing, "outcome", [[0, 0], [TITLES.memory + 0.8, 0], [TITLES.memory + 1.9, 1, "none"]]);
  function update() {
    slabs.forEach(({ piece, cut }) => {
      piece.strike.style.transform = `scaleX(${cut.p.toFixed(3)})`;
      piece.card.style.color = `rgba(245, 243, 255, ${(1 - 0.45 * cut.p).toFixed(3)})`;
    });
    revealCause(typing.cause);
    revealOutcome(typing.outcome);
  }
  return { layers: [header, ...slabs.map(({ piece }) => piece.row), memoryLabel, memoryCause, memoryOutcome, memoryDate], update };
}

function screenLayers(root: HTMLElement, timeline: gsap.core.Timeline) {
  const at = SCREENS.lifted - 0.5;
  const out = SCREENS.dawn - 0.5;
  const title = layer(root, { left: "140px", top: "236px", fontSize: "44px", fontWeight: "600", color: MUTED, textShadow: SHADOW }, STORY_CARD_TITLE);
  cue(timeline, title, { at, out });
  const hero = layer(root, { left: "132px", top: "290px", fontSize: "132px", fontWeight: "700", letterSpacing: "-0.02em", color: WHITE, textShadow: SHADOW }, STORY_HERO.value);
  cue(timeline, hero, { at: at + 0.1, out });
  const delta = layer(root, { left: "140px", top: "460px", fontSize: "96px", fontWeight: "700", color: CORAL, fontVariantNumeric: "tabular-nums", textShadow: SHADOW }, STORY_HERO.delta);
  cue(timeline, delta, { at: at + 0.25, out });
  const agents = STORY_TOP_AGENTS.map((agent, index) => {
    const row = layer(root, { left: "140px", top: `${660 + index * 124}px`, display: "flex", alignItems: "baseline", gap: "26px", textShadow: SHADOW });
    span(row.el, agent.delta, { fontSize: "88px", fontWeight: "700", color: CORAL, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" });
    span(row.el, agent.name, { fontSize: "44px", fontWeight: "600", color: WHITE });
    cue(timeline, row, { at: SCREENS.sweep + 0.3 + index * 0.25, out });
    return row;
  });
  return [title, hero, delta, ...agents];
}

function dawnLayers(root: HTMLElement, timeline: gsap.core.Timeline) {
  const layers: Layer[] = [];
  DAWN_DRAWERS.forEach((entry, index) => {
    const at = SCREENS.dawn + index * SCREENS.beat + 0.35;
    const out = SCREENS.dawn + (index + 1) * SCREENS.beat - 0.25;
    const role = layer(root, { left: "140px", top: "376px", fontSize: "56px", fontWeight: "700", color: WHITE, textShadow: SHADOW }, entry.role);
    cue(timeline, role, { at, out, fadeOut: 0.3 });
    layers.push(role);
    entry.actionLines.forEach((text, line) => {
      const action = layer(root, { left: "140px", top: `${478 + line * 68}px`, fontSize: "48px", fontWeight: "500", color: "rgba(255, 246, 248, 0.94)", textShadow: SHADOW }, text);
      cue(timeline, action, { at: at + 0.18 + line * 0.1, out, fadeOut: 0.3 });
      layers.push(action);
    });
  });
  const row = layer(root, { left: "0", width: "1920px", top: "96px", textAlign: "center", fontSize: "72px", fontWeight: "700", color: WHITE, textShadow: SHADOW }, "เรื่องเดียว ทุกตำแหน่งรู้ว่าต้องทำอะไรต่อ");
  cue(timeline, row, { at: TITLES.row, out: TITLES.rowOut, slam: true, fadeOut: 0.4 });
  layers.push(row);
  const feet = DAWN_DRAWERS.map((entry, index) => {
    const label = layer(root, { left: "0", top: "0", fontSize: "40px", fontWeight: "600", color: WHITE, textShadow: SHADOW }, entry.role);
    cue(timeline, label, { at: TITLES.row + 0.15 + index * 0.06, out: TITLES.rowOut, rise: 0, leave: 0, fadeIn: 0.4, fadeOut: 0.4 });
    return label;
  });
  const widths = feet.map((label) => label.el.getBoundingClientRect().width);
  function place(rowFeet: () => [number, number][]) {
    if (feet.every((label) => label.o <= 0.002)) return;
    rowFeet().forEach(([x, y], index) => {
      feet[index].x = x - widths[index] / 2;
      feet[index].y = y + 16;
    });
  }
  return { layers: [...layers, ...feet], place };
}

function logoLayers(root: HTMLElement, timeline: gsap.core.Timeline) {
  const name = layer(root, { left: "0", width: "1920px", top: "528px", textAlign: "center", fontSize: "140px", fontWeight: "700", letterSpacing: "-0.035em", color: "#ffffff", textShadow: "0 4px 40px rgba(60, 20, 90, 0.35)" }, "Winyu");
  cue(timeline, name, { at: TITLES.logo, out: TITLES.logoOut, fadeOut: 0.4 });
  const tagline = layer(root, { left: "0", width: "1920px", top: "722px", textAlign: "center", fontSize: "64px", fontWeight: "600", color: "rgba(255, 255, 255, 0.94)", textShadow: "0 3px 30px rgba(60, 20, 90, 0.35)" }, "ผู้ช่วยข้อมูลสำหรับทุกคนในองค์กร");
  cue(timeline, tagline, { at: TITLES.logo + 0.35, out: TITLES.logoOut + 0.1, fadeOut: 0.4 });
  return [name, tagline];
}

/** Every line of Thai type in the film, keyed on the master timeline. */
export function buildTitles(root: HTMLElement, timeline: gsap.core.Timeline): Titles {
  const hook = hookLayers(root, timeline);
  const shift = shiftLayers(root, timeline);
  const converge = convergeLayers(root, timeline);
  const ruled = ruledLayers(root, timeline);
  const dawn = dawnLayers(root, timeline);
  const layers: Layer[] = [...hook.layers, ...shift.layers, ...converge.layers, ...slamLayers(root, timeline), ...ruled.layers, ...screenLayers(root, timeline), ...dawn.layers, ...logoLayers(root, timeline)];
  return {
    update(t, rowFeet) {
      hook.clock.el.textContent = t < CONVERGE.impact ? clockOf(clockMinute(t)) : clockOf(NIGHT_SPAN.first);
      converge.update();
      ruled.update();
      dawn.place(rowFeet);
      layers.forEach((piece) => piece.apply());
      shift.update(t);
    },
    orbitDots: converge.dots,
  };
}
