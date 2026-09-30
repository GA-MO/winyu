import MANIFEST from "~/data/booth-shots.json";

export type Rect = { x: number; y: number; w: number; h: number };

export type ShotId = keyof typeof MANIFEST.shots;

type Mark = Rect & { text: string };
type Shot = { src: string; role: string; marks: Record<string, Mark> };

/** A place on a real app screen: `"shot:mark"`, several of them framed together, or the whole screen. */
export type MarkRef = `${ShotId}:${string}` | "full";

const SHOTS = MANIFEST.shots as Record<ShotId, Shot>;

export const SHOT_WIDTH = MANIFEST.width;
export const SHOT_HEIGHT = MANIFEST.height;
export const FULL_RECT: Rect = { x: 0, y: 0, w: SHOT_WIDTH, h: SHOT_HEIGHT };
export const SHOT_IDS = Object.keys(SHOTS) as ShotId[];

/** The captured screen image and the role of the persona it was taken as. */
export function shotOf(id: ShotId): { src: string; role: string } {
  return SHOTS[id];
}

function markOf(ref: MarkRef): Mark {
  if (ref === "full") return { ...FULL_RECT, text: "" };
  const [shot, name] = ref.split(":") as [ShotId, string];
  const mark = SHOTS[shot]?.marks[name];
  if (!mark) throw new Error(`Unknown booth mark ${ref}`);
  return mark;
}

/** The rectangle around one or more marks, in the 1920×1080 space of the captured screens. */
export function rectOf(refs: MarkRef | MarkRef[]): Rect {
  const rects = (Array.isArray(refs) ? refs : [refs]).map(markOf);
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.w));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.h));
  return { x, y, w: right - x, h: bottom - y };
}

/** The text the app rendered inside a mark, so captions quote the screen instead of restating it. */
export function textOf(ref: MarkRef): string {
  return markOf(ref).text;
}
