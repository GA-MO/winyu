import { overlayElement, thaiWords } from "../kit";

/** Font stack of the site: Inter for Latin and figures, Noto Sans Thai for Thai. */
export const FONT = '"Inter","Noto Sans Thai",sans-serif';

/** A piece of the type layer and the animated values that place it; `apply` writes them to the element. */
export type Layer = { el: HTMLDivElement; o: number; x: number; y: number; s: number; rx: number; blur: number; apply: () => void };

/** A keyframe: at `time`, `prop` reaches `value`, easing in with `ease`. */
export type Key = [time: number, value: number, ease?: string];

/** How a layer enters and leaves: a soft rise or a hard slam. */
export type Cue = { at: number; out: number; slam?: boolean; rise?: number; leave?: number; fadeIn?: number; fadeOut?: number };

const DEFAULT_EASE = "power3.inOut";
const GSAP_RESERVED = new Set(["snap", "data", "id", "delay", "duration", "ease", "stagger", "repeat", "yoyo", "paused", "reversed", "lazy", "overwrite", "keyframes", "inherit", "startAt", "immediateRender", "runBackwards"]);

/** Adds tweens so `target[prop]` passes through every key; before the first key it holds the first value. */
export function track<T extends object>(timeline: gsap.core.Timeline, target: T, prop: keyof T & string, list: Key[]): void {
  if (GSAP_RESERVED.has(prop)) throw new Error(`"${prop}" is a GSAP keyword, not a tweenable property`);
  Object.assign(target, { [prop]: list[0][1] });
  for (let index = 1; index < list.length; index += 1) {
    const [from, start] = list[index - 1];
    const [to, end, ease] = list[index];
    if (to <= from) throw new Error(`Keys for ${prop} must move forward in time (${from} → ${to})`);
    timeline.fromTo(target, { [prop]: start }, { [prop]: end, duration: to - from, ease: ease ?? DEFAULT_EASE, immediateRender: false }, from);
  }
}

/** A type layer element, invisible until its keys say otherwise. */
export function layer(parent: HTMLElement, style: Partial<CSSStyleDeclaration>, text?: string): Layer {
  const el = overlayElement(parent, { whiteSpace: "nowrap", fontFamily: FONT, willChange: "transform, opacity", opacity: "0", ...style }, text);
  const state: Layer = {
    el,
    o: 0,
    x: 0,
    y: 0,
    s: 1,
    rx: 0,
    blur: 0,
    apply() {
      el.style.opacity = state.o.toFixed(3);
      el.style.visibility = state.o > 0.002 ? "visible" : "hidden";
      el.style.transform = `translate3d(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px, 0) rotateX(${state.rx.toFixed(2)}deg) scale(${state.s.toFixed(4)})`;
      el.style.filter = state.blur > 0.05 ? `blur(${state.blur.toFixed(2)}px)` : "";
    },
  };
  return state;
}

/** Keys a layer in at `cue.at` and out at `cue.out`: a soft rise by default, or a near-instant slam that settles from a larger scale. */
export function cue(timeline: gsap.core.Timeline, target: Layer, { at, out, slam = false, rise = 28, leave = -18, fadeIn, fadeOut }: Cue): void {
  const inSpan = fadeIn ?? (slam ? 0.07 : 0.7);
  const outSpan = fadeOut ?? (slam ? 0.08 : 0.45);
  track(timeline, target, "o", [[0, 0], [at, 0], [at + inSpan, 1, slam ? "none" : "power2.out"], [out, 1], [out + outSpan, 0, slam ? "none" : "power2.in"]]);
  if (slam) {
    track(timeline, target, "s", [[0, 1.12], [at, 1.12], [at + 0.55, 1, "power4.out"]]);
    return;
  }
  const settled = Math.min(at + 0.9, out - 0.02);
  track(timeline, target, "y", [[0, rise], [at, rise], [settled, 0, "power3.out"], [out, 0], [out + outSpan, leave, "power2.in"]]);
}

/** Splits a line into word spans for word-by-word reveal; returns a setter for the 0–1 reveal. */
export function wordReveal(el: HTMLElement, text: string): (progress: number) => void {
  el.textContent = "";
  const spans = thaiWords(text).map((word) => {
    const span = document.createElement("span");
    span.textContent = word;
    span.style.opacity = "0";
    el.append(span);
    return span;
  });
  return (progress) => {
    const shown = progress * spans.length;
    spans.forEach((span, index) => {
      span.style.opacity = Math.min(1, Math.max(0, shown - index)).toFixed(3);
    });
  };
}

/** Appends a styled inline span. */
export function span(parent: HTMLElement, text: string, style: Partial<CSSStyleDeclaration> = {}): HTMLSpanElement {
  const element = document.createElement("span");
  element.textContent = text;
  Object.assign(element.style, style);
  parent.append(element);
  return element;
}
