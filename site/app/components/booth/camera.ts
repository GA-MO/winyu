import { SHOT_HEIGHT, SHOT_WIDTH, type Rect } from "./shots";

const MAX_ZOOM = 2.4;

/** The size of the window the camera looks through, in stage pixels. */
export type View = { width: number; height: number };

/** Where the camera looks on a captured screen: the point at the centre of the view and how much it enlarges. */
export type Framing = { cx: number; cy: number; zoom: number };

function clamp(value: number, low: number, high: number): number {
  return low > high ? (low + high) / 2 : Math.min(high, Math.max(low, value));
}

/** The framing that fits a rectangle (plus padding) in the view without showing anything beyond the screen's edges. */
export function framingOf(rect: Rect, view: View, pad: number): Framing {
  const fit = Math.min(view.width / SHOT_WIDTH, view.height / SHOT_HEIGHT);
  const zoom = Math.max(fit, Math.min(view.width / (rect.w + pad * 2), view.height / (rect.h + pad * 2), MAX_ZOOM));
  const halfWidth = view.width / zoom / 2;
  const halfHeight = view.height / zoom / 2;
  return {
    cx: clamp(rect.x + rect.w / 2, halfWidth, SHOT_WIDTH - halfWidth),
    cy: clamp(rect.y + rect.h / 2, halfHeight, SHOT_HEIGHT - halfHeight),
    zoom,
  };
}

/** A framing part way from a to b; zoom blends geometrically so pushes in and pulls out feel even. */
export function blendFraming(a: Framing, b: Framing, p: number): Framing {
  return { cx: a.cx + (b.cx - a.cx) * p, cy: a.cy + (b.cy - a.cy) * p, zoom: a.zoom * (b.zoom / a.zoom) ** p };
}

/** A rectangle on the captured screen as it lands in the view under this framing. */
export function rectInView(rect: Rect, framing: Framing, view: View): Rect {
  return {
    x: (rect.x - framing.cx) * framing.zoom + view.width / 2,
    y: (rect.y - framing.cy) * framing.zoom + view.height / 2,
    w: rect.w * framing.zoom,
    h: rect.h * framing.zoom,
  };
}

/** The CSS transform that puts the captured screen under the camera. */
export function screenTransform(framing: Framing, view: View): string {
  return `translate(${view.width / 2}px, ${view.height / 2}px) scale(${framing.zoom}) translate(${-framing.cx}px, ${-framing.cy}px)`;
}
