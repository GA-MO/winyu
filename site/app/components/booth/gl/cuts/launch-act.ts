import { BRAND, BRAND_GRADIENT, overlayElement } from "../kit";
import { actCards, actFrame, BEAT, HEADINGS, LAUNCH_LENGTH } from "./launch-data";
import { hookPose, SEAM_LEAD, seamPose } from "./launch-intro";
import { clamp01, lerp, type Beat, type Stage } from "./launch-rig";
import { DANGER, frosted, headingBlock, INK, MUTED, setAlpha, showHeading, textElement } from "./launch-type";

const A = BEAT.act;
const CARD_WIDTH = 520;
const CARD_HEIGHT = 230;
const STAIRS = [{ left: 160, top: 400 }, { left: 720, top: 550 }, { left: 1280, top: 700 }];
const LEVELS = ["ผู้บริหาร", "ผู้จัดการ", "หน้างาน"];
const CONTEXT = { left: 120, top: 312 };
const DOT = { x: 128, y: 336 };
const CLOSING = { left: 160, top: 868 };
const TIP = { x: 1772, y: 946 };
const THREAD_AT = A + 0.35;
const STEP = 0.4;
const RISE = 30;
const PULSE_PERIOD = 3.6;
const PUSH = 0.012;

function nodeOf(index: number): { x: number; y: number } {
  return { x: STAIRS[index].left, y: STAIRS[index].top + CARD_HEIGHT / 2 };
}

function threadSegments(): string[] {
  const [a, b, c] = [nodeOf(0), nodeOf(1), nodeOf(2)];
  const below = (index: number) => STAIRS[index].top + CARD_HEIGHT + 38;
  return [
    `M${DOT.x} ${DOT.y} C${DOT.x} ${DOT.y + 90}, ${a.x - 30} ${a.y - 70}, ${a.x} ${a.y}`,
    `M${a.x} ${a.y} C${a.x - 42} ${a.y + 60}, ${a.x + 10} ${below(0)}, ${a.x + 170} ${below(0)} C${b.x - 200} ${below(0)}, ${b.x - 60} ${b.y}, ${b.x} ${b.y}`,
    `M${b.x} ${b.y} C${b.x - 42} ${b.y + 60}, ${b.x + 10} ${below(1)}, ${b.x + 170} ${below(1)} C${c.x - 200} ${below(1)}, ${c.x - 60} ${c.y}, ${c.x} ${c.y}`,
    `M${c.x} ${c.y} C${c.x - 42} ${c.y + 60}, ${c.x + 10} ${below(2) - 4}, ${c.x + 200} ${below(2) - 4} C${TIP.x - 240} ${below(2) - 4}, ${TIP.x - 40} ${TIP.y + 40}, ${TIP.x} ${TIP.y}`,
  ];
}

function joined(segments: string[]): string {
  return segments.map((segment, index) => (index === 0 ? segment : segment.replace(/^M[^C]+/u, ""))).join(" ");
}

/** Beat 07: the finding runs down the organisation as one gradient thread, through three levels, each with its own next step. */
export function buildAct(stage: Stage): Beat {
  const { tracks, overlay } = stage;
  const get = tracks.get;
  const cards = actCards();
  const frame = actFrame();
  if (cards.length !== STAIRS.length) throw new Error("Beat 07 shows one card per stair");

  const layer = overlayElement(overlay, { inset: "0" });
  const glow = overlayElement(layer, { left: "260px", top: "220px", width: "1400px", height: "900px", borderRadius: "50%", background: `radial-gradient(closest-side, rgba(124,58,237,0.075), rgba(79,70,229,0.035) 55%, rgba(247,247,251,0) 100%)`, opacity: "0" });
  const heading = headingBlock(layer, HEADINGS.act);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "1920");
  svg.setAttribute("height", "1080");
  Object.assign(svg.style, { position: "absolute", left: "0", top: "0", overflow: "visible" });
  svg.innerHTML = `<defs><linearGradient id="act-thread" gradientUnits="userSpaceOnUse" x1="${DOT.x}" y1="${DOT.y}" x2="${TIP.x}" y2="${TIP.y}"><stop offset="0" stop-color="${BRAND.indigo}"/><stop offset="0.55" stop-color="${BRAND.violet}"/><stop offset="1" stop-color="${BRAND.coral}"/></linearGradient><radialGradient id="act-pulse"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset="0.35" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="1" stop-color="${BRAND.violet}" stop-opacity="0"/></radialGradient></defs>`;
  layer.append(svg);
  const segments = threadSegments();
  const lengths = segments.map((d) => {
    const probe = document.createElementNS("http://www.w3.org/2000/svg", "path");
    probe.setAttribute("d", d);
    svg.append(probe);
    const length = probe.getTotalLength();
    probe.remove();
    return length;
  });
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const thread = document.createElementNS("http://www.w3.org/2000/svg", "path");
  thread.setAttribute("d", joined(segments));
  Object.entries({ fill: "none", stroke: "url(#act-thread)", "stroke-width": "4", "stroke-linecap": "round", "stroke-dasharray": `${total}` }).forEach(([key, value]) => thread.setAttribute(key, value));
  svg.append(thread);
  const nodes = STAIRS.map((_, index) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    const point = nodeOf(index);
    Object.entries({ cx: String(point.x), cy: String(point.y), r: "10", fill: "#ffffff", stroke: "url(#act-thread)", "stroke-width": "4" }).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  });
  const tip = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  Object.entries({ cx: String(TIP.x), cy: String(TIP.y), r: "11", fill: BRAND.coral }).forEach(([key, value]) => tip.setAttribute(key, value));
  const pulse = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  Object.entries({ r: "16", fill: "url(#act-pulse)" }).forEach(([key, value]) => pulse.setAttribute(key, value));

  const context = overlayElement(layer, { left: `${CONTEXT.left}px`, top: `${CONTEXT.top}px`, display: "flex", alignItems: "center", gap: "18px", whiteSpace: "nowrap", opacity: "0" });
  const dot = overlayElement(context, { position: "relative", width: "16px", height: "16px", borderRadius: "999px", background: DANGER, flex: "none", boxShadow: "0 0 0 6px rgba(225,29,72,0.12)" });
  const dotGradient = overlayElement(dot, { inset: "0", borderRadius: "999px", background: BRAND_GRADIENT, opacity: "0" });
  textElement(context, frame.context, { position: "relative", fontSize: "34px", fontWeight: "400", color: MUTED });

  const stairs = overlayElement(layer, { inset: "0", transformOrigin: "55% 60%" });
  const cardEls = cards.map((card, index) => {
    const root = frosted(stairs, { left: `${STAIRS[index].left}px`, top: `${STAIRS[index].top}px`, width: `${CARD_WIDTH}px`, height: `${CARD_HEIGHT}px`, boxSizing: "border-box", padding: "30px 32px 32px 40px", borderRadius: "26px", display: "flex", flexDirection: "column", boxShadow: "0 2px 6px rgba(11,12,15,0.04), 0 40px 80px -40px rgba(67,56,202,0.45)" });
    textElement(root, LEVELS[index], { position: "relative", fontSize: "24px", fontWeight: "500", color: MUTED, letterSpacing: "0.02em", marginBottom: "6px" });
    textElement(root, card.role, { position: "relative", fontSize: "36px", fontWeight: "600", color: INK, marginBottom: "12px" });
    for (const line of card.lines) textElement(root, line, { position: "relative", fontSize: "32px", fontWeight: "400", color: MUTED, lineHeight: "1.42" });
    return root;
  });
  stairs.append(svg);
  for (const node of nodes) svg.append(node);
  svg.append(tip, pulse);

  const closing = overlayElement(layer, { left: `${CLOSING.left}px`, top: `${CLOSING.top}px`, display: "flex", alignItems: "baseline", gap: "18px", whiteSpace: "nowrap", opacity: "0" });
  textElement(closing, frame.closingLead, { position: "relative", fontSize: "34px", fontWeight: "600", color: BRAND.violet });
  textElement(closing, "·", { position: "relative", fontSize: "34px", fontWeight: "400", color: MUTED });
  textElement(closing, frame.closingTail, { position: "relative", fontSize: "34px", fontWeight: "600", color: INK });

  const t = tracks;
  t.poseTo("cam", seamPose(), BEAT.end, 0.01, "none");
  t.poseTo("cam", hookPose(), LAUNCH_LENGTH - SEAM_LEAD, SEAM_LEAD, "none");
  t.to("act.head", 1, A - 0.1, 0.9, "none");
  t.to("act.context", 1, A - 0.12, 0.7, "power2.out");
  t.to("act.glow", 1, A, 1.4, "power2.out");
  let drawn = 0;
  lengths.forEach((length, index) => {
    drawn += length;
    t.to("act.thread", drawn / total, THREAD_AT + index * STEP, STEP, index === 0 ? "power2.in" : "power1.inOut");
    if (index < STAIRS.length) t.to(`act.card${index}`, 1, THREAD_AT + index * STEP + 0.2, 0.9, "power3.out");
  });
  const threadDone = THREAD_AT + lengths.length * STEP;
  t.to("act.tip", 1, threadDone - 0.05, 0.4, "back.out(2)");
  t.to("act.closing", 1, threadDone + 0.25, 0.8, "power2.out");
  t.to("act.pulse", 1, threadDone + 0.6, 0.8, "power2.out");
  t.to("act.push", 1, A, BEAT.proof - A, "none");
  t.to("act.out", 1, BEAT.proof - 0.4, 0.5, "power2.in");
  t.to("act.headOut", 1, BEAT.proof - 0.45, 0.4, "power2.in");

  function rise(element: HTMLElement, enter: number, out: number) {
    setAlpha(element, clamp01(enter) * (1 - out));
    element.style.transform = `translateY(${((1 - enter) * RISE - out * 20).toFixed(1)}px)`;
  }

  return {
    draw(time: number) {
      const out = get("act.out");
      showHeading(heading, get("act.head"), get("act.headOut"));
      setAlpha(glow, get("act.glow") * (1 - out));
      rise(context, get("act.context"), out);
      const progress = get("act.thread");
      dotGradient.style.opacity = clamp01(progress * 12).toFixed(3);
      stairs.style.transform = `scale(${(lerp(1, 1 + PUSH, get("act.push")) * (1 - 0.03 * out)).toFixed(4)})`;
      stairs.style.opacity = String(1 - out);
      thread.setAttribute("stroke-dashoffset", (total * (1 - progress)).toFixed(1));
      thread.setAttribute("opacity", progress > 0 ? "1" : "0");
      let reached = 0;
      nodes.forEach((node, index) => {
        reached += lengths[index];
        node.setAttribute("opacity", clamp01((progress * total - reached + 4) / 12).toFixed(3));
      });
      const tipIn = get("act.tip");
      tip.setAttribute("opacity", clamp01(tipIn).toFixed(3));
      tip.setAttribute("r", (11 * tipIn).toFixed(2));
      cardEls.forEach((card, index) => rise(card, get(`act.card${index}`), 0));
      rise(closing, get("act.closing"), out);
      const pulseOn = get("act.pulse");
      const phase = (((time - (threadDone + 0.6)) / PULSE_PERIOD) % 1 + 1) % 1;
      const point = thread.getPointAtLength(phase * total);
      pulse.setAttribute("cx", point.x.toFixed(1));
      pulse.setAttribute("cy", point.y.toFixed(1));
      pulse.setAttribute("opacity", (pulseOn * Math.sin(phase * Math.PI) * 0.95).toFixed(3));
    },
  };
}
