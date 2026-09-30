import { BRAND, BRAND_GRADIENT, overlayElement, SPARK_POINTS } from "../kit";
import { DANGER } from "./signal-materials";
import { FONT, INK, kineticBlock, showKinetic, textElement, type Kinetic, type KineticLine } from "./signal-type";
import type { Heading } from "./launch-data";

export { FONT, INK, DANGER, showKinetic, textElement, kineticBlock, type Kinetic, type KineticLine };

/** Body and secondary text: regular weight in this one muted ink. */
export const MUTED = "#5b6178";

/** Left edge of every heading and left-aligned column. */
export const LEFT = 120;
/** The success green the app uses for confirmed and live. */
export const SUCCESS = "#059669";
/** The hairline border colour of the light theme. */
export const HAIRLINE = "rgba(79,70,229,0.14)";

const EYEBROW_TOP = 104;
const TITLE_TOP = 146;
const TITLE_SIZE_THAI = 84;
const TITLE_SIZE_LATIN = 76;
const EYEBROW_RISE = 18;

let tileSerial = 0;

/** An eyebrow and a kinetic title, the heading every numbered beat opens with. */
export type HeadingBlock = { eyebrow: HTMLDivElement; title: Kinetic };

/** Paints every word of a kinetic line with one gradient that runs across the whole line, not restarting per word. */
export function gradientAcross(block: Kinetic, lineIndex: number): void {
  const line = block.root.children[lineIndex] as HTMLDivElement | undefined;
  if (!line) return;
  const words = Array.from(line.children) as HTMLSpanElement[];
  if (words.length === 0) return;
  const first = words[0].offsetLeft;
  const last = words[words.length - 1];
  const width = last.offsetLeft + last.offsetWidth - first;
  for (const word of words) {
    Object.assign(word.style, { backgroundImage: BRAND_GRADIENT, backgroundRepeat: "no-repeat", backgroundSize: `${width}px 100%`, backgroundPosition: `${first - word.offsetLeft}px 0`, backgroundClip: "text", webkitBackgroundClip: "text", color: "transparent" });
  }
}

/** Builds a beat heading at the shared top-left slot. */
export function headingBlock(parent: HTMLElement, heading: Heading): HeadingBlock {
  const latin = /^[A-Za-z]/u.test(heading.lines[0]);
  const eyebrow = textElement(parent, heading.eyebrow, { left: `${LEFT}px`, top: `${EYEBROW_TOP}px`, fontSize: "30px", fontWeight: "600", color: BRAND.indigo, letterSpacing: "0.01em", opacity: "0" });
  const size = latin ? TITLE_SIZE_LATIN : TITLE_SIZE_THAI;
  const title = kineticBlock(parent, heading.lines.map((text) => ({ text, style: { fontSize: `${size}px`, fontWeight: "700", letterSpacing: latin ? "-0.035em" : "-0.01em", lineHeight: latin ? "1.12" : "1.25" } })), { left: `${LEFT}px`, top: `${TITLE_TOP}px` });
  if (heading.gradientLine !== undefined) gradientAcross(title, heading.gradientLine);
  return { eyebrow, title };
}

/** Shows a heading: the eyebrow slides in first, the title's words rise after it; both lift away on exit. */
export function showHeading(block: HeadingBlock, enter: number, exit: number): void {
  const visible = enter > 0.001 && exit < 0.999;
  block.eyebrow.style.visibility = visible ? "visible" : "hidden";
  block.eyebrow.style.opacity = visible ? String(Math.min(1, enter * 2) * (1 - exit)) : "0";
  block.eyebrow.style.transform = `translateY(${((1 - Math.min(1, enter * 2)) * EYEBROW_RISE - exit * 30).toFixed(1)}px)`;
  showKinetic(block.title, enter, exit);
}

/** The Winyu tile as crisp SVG: the gradient rounded square, the sparkline W and its tip dot. */
export function logoTile(parent: HTMLElement, size: number, style: Partial<CSSStyleDeclaration> = {}): HTMLDivElement {
  const holder = overlayElement(parent, { width: `${size}px`, height: `${size}px`, ...style });
  tileSerial += 1;
  const id = `launch-tile-${tileSerial}`;
  const points = SPARK_POINTS.map(([x, y]) => `${x},${y}`).join(" ");
  const [tipX, tipY] = SPARK_POINTS[SPARK_POINTS.length - 1];
  holder.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 64 64" style="display:block;overflow:visible"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${BRAND.indigo}"/><stop offset="0.55" stop-color="${BRAND.violet}"/><stop offset="1" stop-color="${BRAND.coral}"/></linearGradient></defs><rect x="0" y="0" width="64" height="64" rx="15" fill="url(#${id})"/><polyline points="${points}" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${tipX}" cy="${tipY}" r="5" fill="#fff"/></svg>`;
  holder.style.filter = "drop-shadow(0 10px 22px rgba(124,58,237,0.35))";
  return holder;
}

/** A frosted white surface in the light theme, the base of every overlay card. */
export function frosted(parent: HTMLElement, style: Partial<CSSStyleDeclaration> = {}): HTMLDivElement {
  return overlayElement(parent, {
    background: "rgba(255,255,255,0.8)",
    backdropFilter: "blur(20px) saturate(1.3)",
    border: `1px solid ${HAIRLINE}`,
    borderRadius: "28px",
    boxShadow: "0 1px 2px rgba(11,12,15,0.04), 0 30px 70px -34px rgba(49,46,129,0.38)",
    opacity: "0",
    ...style,
  });
}

/** A rounded pill of text, frosted or tinted. */
export function pill(parent: HTMLElement, text: string, style: Partial<CSSStyleDeclaration> = {}): HTMLDivElement {
  return textElement(parent, text, { display: "inline-block", fontSize: "40px", fontWeight: "600", color: INK, background: "rgba(255,255,255,0.86)", border: `1px solid ${HAIRLINE}`, borderRadius: "999px", padding: "8px 30px 12px", boxShadow: "0 18px 40px -26px rgba(49,46,129,0.45)", ...style });
}


/** A round check mark, green when done. */
export function checkMark(parent: HTMLElement, size: number, style: Partial<CSSStyleDeclaration> = {}): HTMLDivElement {
  const holder = overlayElement(parent, { position: "relative", width: `${size}px`, height: `${size}px`, borderRadius: "999px", background: SUCCESS, flex: "none", display: "grid", placeItems: "center", ...style });
  holder.innerHTML = `<svg width="${size * 0.56}" height="${size * 0.56}" viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return holder;
}

/** An SVG icon in a gradient tile, drawn from simple strokes. */
export function iconTile(parent: HTMLElement, path: string, size: number, style: Partial<CSSStyleDeclaration> = {}): HTMLDivElement {
  const holder = overlayElement(parent, { position: "relative", width: `${size}px`, height: `${size}px`, borderRadius: `${Math.round(size * 0.28)}px`, background: BRAND_GRADIENT, display: "grid", placeItems: "center", flex: "none", boxShadow: "0 16px 30px -14px rgba(124,58,237,0.7)", ...style });
  holder.innerHTML = `<svg width="${Math.round(size * 0.54)}" height="${Math.round(size * 0.54)}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  return holder;
}

/** Stroke paths for the icons the film draws. */
export const ICONS = {
  shield: '<path d="M12 3l7 3v5.5c0 4.4-3 8.1-7 9.5-4-1.4-7-5.1-7-9.5V6l7-3z"/><path d="M8.8 12.2l2.2 2.2 4.4-4.6"/>',
  numbers: '<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M21 19H3"/>',
  identity: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.9-3.6 3.7-5.6 7-5.6s6.1 2 7 5.6"/>',
  audit: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4"/><path d="M10 12h6"/><path d="M10 16h6"/>',
} as const;

/** The pointer the film clicks with: a white arrow and a ring that ripples on press. */
export function cursorElement(parent: HTMLElement): { root: HTMLDivElement; ring: HTMLDivElement; arrow: HTMLDivElement } {
  const root = overlayElement(parent, { left: "0", top: "0", width: "0", height: "0", opacity: "0" });
  const ring = overlayElement(root, { left: "-44px", top: "-44px", width: "88px", height: "88px", borderRadius: "999px", border: `3px solid ${BRAND.violet}`, opacity: "0" });
  const arrow = overlayElement(root, { left: "-6px", top: "-4px", width: "52px", height: "52px", transformOrigin: "6px 4px" });
  arrow.innerHTML = `<svg width="52" height="52" viewBox="0 0 24 24" style="filter:drop-shadow(0 8px 14px rgba(11,12,20,0.35))"><path d="M4 2.5 L4 19 L8.6 14.8 L11.6 21.5 L14.4 20.3 L11.5 13.7 L17.8 13.7 Z" fill="#fff" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
  return { root, ring, arrow };
}

/** Moves the pointer to (x, y) with opacity `alpha`; `press` 0→1 plays one click. */
export function showCursor(cursor: { root: HTMLDivElement; ring: HTMLDivElement; arrow: HTMLDivElement }, x: number, y: number, alpha: number, press: number): void {
  cursor.root.style.opacity = String(alpha);
  cursor.root.style.visibility = alpha > 0.001 ? "visible" : "hidden";
  cursor.root.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  const pressing = press > 0 && press < 1;
  cursor.ring.style.opacity = pressing ? String(1 - press) : "0";
  cursor.ring.style.transform = `scale(${(0.35 + press * 0.9).toFixed(3)})`;
  cursor.arrow.style.transform = `scale(${pressing && press < 0.4 ? 0.86 : 1})`;
}

/** Fades an element in with `enter` and out with `exit`, rising by `rise` pixels, with any extra transform after. */
export function showMoving(element: HTMLElement, enter: number, exit: number, rise = 24, extra = ""): void {
  const visible = enter > 0.001 && exit < 0.999;
  element.style.visibility = visible ? "visible" : "hidden";
  element.style.opacity = visible ? String(Math.min(1, enter) * (1 - exit)) : "0";
  if (!visible) return;
  element.style.transform = `translateY(${((1 - enter) * rise - exit * rise).toFixed(1)}px) ${extra}`;
}

/** Sets an element's opacity and visibility together. */
export function setAlpha(element: HTMLElement | SVGElement, alpha: number): void {
  element.style.opacity = String(Math.max(0, Math.min(1, alpha)));
  element.style.visibility = alpha > 0.001 ? "visible" : "hidden";
}



/** A role label: a small gradient dot and the role title in muted semibold, never a pill. */
export function roleText(parent: HTMLElement, title: string, style: Partial<CSSStyleDeclaration> = {}): HTMLDivElement {
  const row = overlayElement(parent, { display: "flex", alignItems: "center", gap: "14px", whiteSpace: "nowrap", opacity: "0", ...style });
  overlayElement(row, { position: "relative", width: "10px", height: "10px", borderRadius: "999px", background: BRAND_GRADIENT, flex: "none" });
  textElement(row, title, { position: "relative", fontSize: "32px", fontWeight: "400", color: MUTED });
  return row;
}
