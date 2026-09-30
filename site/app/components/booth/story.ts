import { blendFraming, framingOf, type Framing, type View } from "./camera";
import { createSequence, easeIn, easeInOut } from "./sequence";
import { rectOf, shotOf, textOf, type MarkRef, type Rect, type ShotId } from "./shots";

const MOVE_SECONDS = 1.2;
const FOCUS_SECONDS = 0.6;
const POINTER_SECONDS = 1;
const PRESS_SECONDS = 0.35;
const RIPPLE_SECONDS = 0.7;
const LINE_SECONDS = 0.5;
const CROSSFADE_SECONDS = 0.7;
const DEFAULT_PAD = 40;

type Target = MarkRef | MarkRef[];

type Move = { at: number; to: Target; pad?: number };
type Focus = { at: number; on: Target | null };
type Stop = { at: number; on: MarkRef; dx?: number; dy?: number };
type Pointer = { show: number; hide: number; stops: Stop[]; clicks: number[] };
/** A caption; `\n` marks where it breaks when a cut sets it on two lines, and ` \n` a break that reads as a space on one line. */
type Line = { at: number; text: string };

/** How a later screen takes over: a crossfade, a panel sliding in from the right, or an answer revealed top to bottom. */
export type SwapStyle = "fade" | "drawer" | "wipe";
type Swap = { at: number; shot: ShotId; style: SwapStyle; region?: MarkRef; span: number };

export type SceneId = "investigate" | "ask" | "learn" | "scope" | "end";

/** One stretch of the film on real screens: where the camera goes, what it points at, what it clicks and what the caption says. */
export type Scene = { id: SceneId; duration: number; shot: ShotId; role: string | null; moves: Move[]; focus: Focus[]; swaps: Swap[]; pointer: Pointer | null; lines: Line[] };

function investigationFacts() {
  const header = textOf("story:header");
  const ranAt = header.match(/(\d{1,2}:\d{2})/)?.[1];
  const looked = header.match(/ดูข้อมูล (\d+) ครั้ง/)?.[1];
  if (!ranAt || !looked) throw new Error(`Cannot read the investigation header: ${header}`);
  return { ranAt, looked };
}

const FACTS = investigationFacts();

const SCENES: Scene[] = [
  {
    id: "investigate",
    duration: 21,
    shot: "landing",
    role: shotOf("landing").role,
    moves: [
      { at: 0, to: "full" },
      { at: 0.8, to: ["landing:heading", "landing:composer"], pad: 70 },
      { at: 3.6, to: "landing:pill", pad: 150 },
      { at: 5.9, to: "full" },
      { at: 7.4, to: "story:header", pad: 36 },
      { at: 9.8, to: ["story:badge", "story:finding"], pad: 36 },
      { at: 12.6, to: "story:ruledOut", pad: 40 },
      { at: 15.2, to: ["story:hero", "story:topBars"], pad: 30 },
      { at: 18.2, to: "story:next", pad: 40 },
    ],
    focus: [
      { at: 0, on: null },
      { at: 3.6, on: "landing:pill" },
      { at: 5.9, on: null },
      { at: 9.8, on: ["story:badge", "story:finding"] },
      { at: 12.6, on: "story:ruledOut" },
      { at: 15.2, on: "story:topBars" },
      { at: 18.2, on: "story:next" },
      { at: 20.2, on: null },
    ],
    swaps: [{ at: 6, shot: "story", style: "drawer", region: "story:drawer", span: 0.9 }],
    pointer: {
      show: 3.2,
      hide: 6.4,
      stops: [
        { at: 3.2, on: "landing:pill", dx: 260, dy: 170 },
        { at: 4.4, on: "landing:pill", dx: 70, dy: 13 },
      ],
      clicks: [5.6],
    },
    lines: [
      { at: 0, text: "ทุกเช้า Winyu \nสืบข้อมูลให้ก่อนคุณถาม" },
      { at: 7.4, text: `เริ่มสืบตั้งแต่ ${FACTS.ranAt} น. \nดูข้อมูลไป ${FACTS.looked} ครั้ง` },
      { at: 9.8, text: "สรุปเรื่องที่ต้องตัดสินใจ\nเป็นประโยคเดียว" },
      { at: 12.6, text: "ตัดสาเหตุที่ไม่ใช่\nทิ้งให้แล้ว" },
      { at: 15.2, text: "ชี้ต้นเหตุด้วย\nตัวเลขจริงจากระบบ" },
      { at: 18.2, text: "และบอกว่า\nควรทำอะไรต่อ" },
    ],
  },
  {
    id: "ask",
    duration: 11,
    shot: "chat-ask",
    role: shotOf("chat").role,
    moves: [
      { at: 0, to: "chat:question", pad: 70 },
      { at: 2.1, to: ["chat:question", "chat:answer"], pad: 30 },
      { at: 4, to: ["chat:cardTitle", "chat:hero"], pad: 40 },
      { at: 6.2, to: "chat:card", pad: 30 },
      { at: 8.4, to: ["chat:hero", "chat:next"], pad: 30 },
    ],
    focus: [
      { at: 0, on: "chat:question" },
      { at: 2.1, on: null },
      { at: 4, on: "chat:hero" },
      { at: 6.2, on: null },
      { at: 8.4, on: "chat:next" },
      { at: 10.3, on: null },
    ],
    swaps: [
      { at: 2.4, shot: "chat", style: "wipe", region: "chat:answer", span: 1.3 },
      { at: 3.4, shot: "chat", style: "fade", region: "chat:followUps", span: 0.5 },
    ],
    pointer: null,
    lines: [
      { at: 0, text: "ถามด้วยภาษา\nที่พูดกันจริงๆ" },
      { at: 4, text: "ได้คำตอบเป็นตัวเลข\nที่ตัดสินใจได้เลย" },
      { at: 8.4, text: "พร้อมทางไปต่อ \nไม่ต้องคิดคำถามเอง" },
    ],
  },
  {
    id: "learn",
    duration: 11.5,
    shot: "memory",
    role: shotOf("memory").role,
    moves: [
      { at: 0, to: ["memory:title", "memory:firstFact"], pad: 50 },
      { at: 4.2, to: "memory:firstFact", pad: 40 },
      { at: 7.8, to: ["memory-yes:known", "memory-yes:confirmed"], pad: 40 },
    ],
    focus: [
      { at: 0, on: null },
      { at: 4.2, on: "memory:firstFact" },
      { at: 7, on: null },
      { at: 7.8, on: "memory-yes:confirmed" },
      { at: 10.8, on: null },
    ],
    swaps: [{ at: 7, shot: "memory-yes", style: "fade", span: 0.6 }],
    pointer: {
      show: 4.6,
      hide: 7.6,
      stops: [
        { at: 4.6, on: "memory:yes", dx: 200, dy: 120 },
        { at: 5.6, on: "memory:yes", dx: 14, dy: 10 },
      ],
      clicks: [6.6],
    },
    lines: [
      { at: 0, text: "Winyu เรียนรู้\nวิธีทำงานของแต่ละคน" },
      { at: 4.2, text: "แต่ถามคุณก่อนทุกครั้ง \nก่อนจะจำ" },
      { at: 7.8, text: "ยืนยันแล้ว \nใช้ตอบครั้งต่อไปทันที" },
    ],
  },
  {
    id: "scope",
    duration: 8.5,
    shot: "dashboard",
    role: shotOf("dashboard").role,
    moves: [
      { at: 0, to: "full" },
      { at: 2.4, to: "dashboard:firstCard", pad: 30 },
      { at: 5, to: "dashboard:scope", pad: 50 },
    ],
    focus: [
      { at: 0, on: null },
      { at: 5, on: "dashboard:scope" },
      { at: 7.9, on: null },
    ],
    swaps: [],
    pointer: null,
    lines: [
      { at: 0, text: "การ์ดที่ใช้ประจำ \nปักไว้ใน Dashboard" },
      { at: 5, text: "แต่เห็นเฉพาะข้อมูล\nในสิทธิ์ของตัวเอง" },
    ],
  },
  { id: "end", duration: 8, shot: "landing", role: null, moves: [{ at: 0, to: "full" }], focus: [{ at: 0, on: null }], swaps: [], pointer: null, lines: [] },
];

const SCENE_BY_ID = new Map(SCENES.map((scene) => [scene.id, scene]));

/** The film's scenes as one loop; the last one hands back to the first on the same screen. */
export const STORY_SEQUENCE = createSequence(SCENES.map((scene) => ({ id: scene.id, duration: scene.duration })), CROSSFADE_SECONDS);

export function sceneOf(id: SceneId): Scene {
  const scene = SCENE_BY_ID.get(id);
  if (!scene) throw new Error(`Unknown scene ${id}`);
  return scene;
}

/** A caption's opacity while scenes cross: the outgoing one clears in the first half, the incoming one arrives in the second, so two lines never overlap. */
export function captionOpacity(beats: { id: SceneId; opacity: number }[], beat: { id: SceneId; opacity: number }): number {
  const incoming = beats.length > 1 ? beats[1].opacity : 0;
  if (beat === beats[0]) return Math.max(0, 1 - incoming * 2);
  return Math.max(0, incoming * 2 - 1);
}

function lastIndexAt<T extends { at: number }>(items: T[], t: number): number {
  let index = 0;
  for (let position = 0; position < items.length; position += 1) if (items[position].at <= t) index = position;
  return index;
}

/** Where the camera looks at local time t: each move eases from the previous framing into its own. */
export function framingAt(scene: Scene, t: number, view: View): Framing {
  const index = lastIndexAt(scene.moves, t);
  const move = scene.moves[index];
  const target = framingOf(rectOf(move.to), view, move.pad ?? DEFAULT_PAD);
  if (index === 0) return target;
  const previous = scene.moves[index - 1];
  const from = framingOf(rectOf(previous.to), view, previous.pad ?? DEFAULT_PAD);
  return blendFraming(from, target, easeInOut(t, move.at, MOVE_SECONDS));
}

/** The highlighted area at local time t and how strongly the rest is held back (0 = not at all). */
export function focusAt(scene: Scene, t: number): { rect: Rect | null; strength: number } {
  const index = lastIndexAt(scene.focus, t);
  const current = scene.focus[index];
  const previous = index > 0 ? scene.focus[index - 1] : null;
  const p = easeInOut(t, current.at, FOCUS_SECONDS);
  if (current.on === null) return previous?.on ? { rect: rectOf(previous.on), strength: 1 - p } : { rect: null, strength: 0 };
  const to = rectOf(current.on);
  if (!previous?.on) return { rect: to, strength: t < current.at ? 0 : p };
  const from = rectOf(previous.on);
  return { rect: { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p, w: from.w + (to.w - from.w) * p, h: from.h + (to.h - from.h) * p }, strength: 1 };
}

/** Every highlight in the scene with how far it has come in (0–1) and gone out (0–1) at local time t, for cuts that lift each one separately. */
export function focusStepsAt(scene: Scene, t: number): { rect: Rect; enter: number; leave: number; key: number }[] {
  return scene.focus.flatMap((step, index) => {
    if (step.on === null) return [];
    const next = scene.focus[index + 1];
    return [{ rect: rectOf(step.on), enter: easeIn(t, step.at, FOCUS_SECONDS + 0.2), leave: next ? easeIn(t, next.at, FOCUS_SECONDS) : 0, key: index }];
  });
}

/** The captured screens on top of the scene's first one, each with its takeover progress at local time t. */
export function layersAt(scene: Scene, t: number): { shot: ShotId; style: SwapStyle | "base"; region: Rect | null; p: number }[] {
  const swaps = scene.swaps.filter((swap) => t >= swap.at).map((swap) => ({ shot: swap.shot, style: swap.style, region: swap.region ? rectOf(swap.region) : null, p: easeInOut(t, swap.at, swap.span) }));
  return [{ shot: scene.shot, style: "base" as const, region: null, p: 1 }, ...swaps];
}

/** The pointer on the captured screen at local time t: position, visibility, how pressed it is, and the ripple of the last click. */
export function pointerAt(scene: Scene, t: number): { x: number; y: number; opacity: number; press: number; ripple: number | null } | null {
  const pointer = scene.pointer;
  if (!pointer || t < pointer.show - 0.3 || t > pointer.hide + 0.3) return null;
  const pointOf = (stop: Stop) => {
    const rect = rectOf(stop.on);
    return { x: rect.x + rect.w / 2 + (stop.dx ?? 0), y: rect.y + rect.h / 2 + (stop.dy ?? 0) };
  };
  const index = lastIndexAt(pointer.stops, t);
  const to = pointOf(pointer.stops[index]);
  const from = index > 0 ? pointOf(pointer.stops[index - 1]) : to;
  const p = easeInOut(t, pointer.stops[index].at, POINTER_SECONDS);
  const opacity = easeIn(t, pointer.show - 0.3, 0.3) * (1 - easeIn(t, pointer.hide, 0.3));
  const click = [...pointer.clicks].reverse().find((at) => at <= t);
  const since = click === undefined ? Infinity : t - click;
  const press = since < PRESS_SECONDS ? Math.sin((since / PRESS_SECONDS) * Math.PI) : 0;
  return { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p, opacity, press, ripple: since < RIPPLE_SECONDS ? since / RIPPLE_SECONDS : null };
}

/** The caption on screen at local time t and the one it replaces while the change is under way. */
export function lineAt(scene: Scene, t: number): { text: string; previous: string | null; p: number } | null {
  if (scene.lines.length === 0) return null;
  const index = lastIndexAt(scene.lines, t);
  const line = scene.lines[index];
  const p = index === 0 ? 1 : easeInOut(t, line.at, LINE_SECONDS);
  return { text: line.text, previous: index > 0 && p < 1 ? scene.lines[index - 1].text : null, p };
}
