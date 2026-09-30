import { BRAND, BRAND_GRADIENT, gsap, overlayElement, thaiWords } from "../kit";
import { DANGER } from "./signal-materials";

/** The site's type stack: Inter for Latin and numbers, Noto Sans Thai for Thai. */
export const FONT = '"Inter","Noto Sans Thai",sans-serif';
/** Foreground ink of the light theme. */
export const INK = "#0b0c0f";
/** Muted foreground of the light theme. */
export const MUTED = "#5c6577";

const RISE_EASE = gsap.parseEase("expo.out");
const WORD_STAGGER = 0.28;

/** A block of lines whose words rise out of a mask one after another. */
export type Kinetic = { root: HTMLDivElement; words: HTMLSpanElement[] };

/** One line of a kinetic block with its own type style. */
export type KineticLine = { text: string; style: Partial<CSSStyleDeclaration>; gradient?: boolean };

/** A plain nowrap text element in the site font. */
export function textElement(parent: HTMLElement, text: string, style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  return overlayElement(parent, { fontFamily: FONT, whiteSpace: "nowrap", color: INK, lineHeight: "1.25", ...style }, text);
}

/** Paints text with the brand gradient. */
export function paintGradient(element: HTMLElement): void {
  Object.assign(element.style, { backgroundImage: BRAND_GRADIENT, backgroundClip: "text", webkitBackgroundClip: "text", color: "transparent" });
}

function maskedLine(parent: HTMLElement, line: KineticLine, words: HTMLSpanElement[]): void {
  const mask = document.createElement("div");
  Object.assign(mask.style, { overflow: "hidden", whiteSpace: "nowrap", padding: "0.22em 0.08em 0.3em", margin: "-0.22em -0.08em -0.3em", fontFamily: FONT, lineHeight: "1.25", ...line.style });
  for (const word of thaiWords(line.text)) {
    const span = document.createElement("span");
    span.textContent = word;
    Object.assign(span.style, { display: "inline-block", whiteSpace: "pre", willChange: "transform" });
    if (line.gradient) paintGradient(span);
    mask.append(span);
    words.push(span);
  }
  parent.append(mask);
}

/** Builds a kinetic block of lines at an absolute spot in the type layer. */
export function kineticBlock(parent: HTMLElement, lines: KineticLine[], style: Partial<CSSStyleDeclaration>): Kinetic {
  const root = overlayElement(parent, { display: "flex", flexDirection: "column", color: INK, opacity: "0", ...style });
  const words: HTMLSpanElement[] = [];
  for (const line of lines) maskedLine(root, line, words);
  return { root, words };
}

/** Shows a kinetic block: `enter` 0→1 raises its words in order, `exit` 0→1 lifts the whole block away. */
export function showKinetic(block: Kinetic, enter: number, exit: number): void {
  const visible = enter > 0 && exit < 1;
  block.root.style.opacity = visible ? String(1 - exit) : "0";
  if (!visible) return;
  block.root.style.transform = `translateY(${(-exit * 36).toFixed(1)}px)`;
  const span = 1 + WORD_STAGGER * (block.words.length - 1);
  block.words.forEach((word, index) => {
    const local = Math.min(1, Math.max(0, enter * span - index * WORD_STAGGER));
    const eased = RISE_EASE(local);
    word.style.transform = `translateY(${((1 - eased) * 165).toFixed(1)}%)`;
  });
}

/** Fades and lifts any element in with `enter` and out with `exit`. */
export function showElement(element: HTMLElement, enter: number, exit: number, rise = 24, extra = ""): void {
  const visible = enter > 0.001 && exit < 0.999;
  element.style.opacity = visible ? String(Math.min(1, enter) * (1 - exit)) : "0";
  element.style.visibility = visible ? "visible" : "hidden";
  if (!visible) return;
  element.style.transform = `translateY(${((1 - enter) * rise - exit * rise).toFixed(1)}px) ${extra}`;
}

/** A frosted white card, the surface every overlay panel sits on. */
export function glassCard(parent: HTMLElement, style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  return overlayElement(parent, {
    background: "rgba(255,255,255,0.78)",
    backdropFilter: "blur(22px) saturate(1.3)",
    border: "1px solid rgba(79,70,229,0.12)",
    borderRadius: "28px",
    boxShadow: "0 2px 6px rgba(11,12,15,0.05), 0 40px 80px -36px rgba(49,46,129,0.35)",
    opacity: "0",
    ...style,
  });
}

/** A role label: a small gradient bead and the role title. */
export function roleLabel(parent: HTMLElement, title: string, size = 40): HTMLDivElement {
  const row = overlayElement(parent, { position: "relative", display: "flex", alignItems: "center", gap: "16px" });
  overlayElement(row, { position: "relative", width: `${Math.round(size * 0.42)}px`, height: `${Math.round(size * 0.42)}px`, borderRadius: "999px", background: BRAND_GRADIENT, flex: "none" });
  textElement(row, title, { position: "relative", fontSize: `${size}px`, fontWeight: "600", color: MUTED });
  return row;
}

/** A scope pill, the way the app tags whose data a card shows. */
export function scopePill(parent: HTMLElement, text: string, style: Partial<CSSStyleDeclaration> = {}): HTMLDivElement {
  return textElement(parent, text, {
    position: "relative",
    display: "inline-block",
    fontSize: "40px",
    fontWeight: "600",
    color: BRAND.indigo,
    background: "rgba(79,70,229,0.08)",
    border: "1px solid rgba(79,70,229,0.18)",
    borderRadius: "999px",
    padding: "6px 26px 10px",
    ...style,
  });
}

/** Colours text as the app does for a value under target. */
export function paintDanger(element: HTMLElement): void {
  element.style.color = DANGER;
}
