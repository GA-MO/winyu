import { BrandMark } from "@/components/chrome/brand-mark";
import { TH } from "@/lib/i18n/th";
import { PointerGlyph, SceneCrop, ScreenLayers, Veil } from "./screen";
import { STAGE_HEIGHT, STAGE_WIDTH, clamp01, easeIn, easeInOut, mix } from "./sequence";
import { STORY_SEQUENCE, captionOpacity, focusAt, focusStepsAt, lineAt, pointerAt, sceneOf, type Scene } from "./story";
import { SHOT_HEIGHT, SHOT_WIDTH, type Rect } from "./shots";

const WINDOW_WIDTH = 1120;
const WINDOW_HEIGHT = (WINDOW_WIDTH * SHOT_HEIGHT) / SHOT_WIDTH;
const WINDOW_CENTER = { x: 1320, y: 560 };
const SHOT_SCALE = WINDOW_WIDTH / SHOT_WIDTH;
const PERSPECTIVE = 2200;
const LIFT_CENTER = { x: 1260, y: 600 };
const LIFT_PAD = 8;
const LIFT_MAX = { scale: 2.4, width: 1000, height: 380 };
const TEXT_LEFT = 110;
const TEXT_WIDTH = 660;
const LINE_SHIFT = 18;
const BRAND_TILE = "bg-[linear-gradient(135deg,var(--color-primary),var(--color-violet)_55%,var(--color-coral))] text-white";
const DEG = Math.PI / 180;

/** The launch-film cut's loop length. */
export const CANVAS_SEQUENCE = STORY_SEQUENCE;

type Tilt = { ry: number; rx: number };

function tiltAt(t: number, swing: number): Tilt {
  return { ry: 13 + 2 * Math.sin((2 * Math.PI * t) / 20) + 7 * swing, rx: 5 + Math.sin((2 * Math.PI * t) / 30) };
}

function project(u: number, v: number, tilt: Tilt): { x: number; y: number } {
  const x = u - WINDOW_WIDTH / 2;
  const y = v - WINDOW_HEIGHT / 2;
  const y1 = y * Math.cos(tilt.rx * DEG);
  const z1 = y * Math.sin(tilt.rx * DEG);
  const x2 = x * Math.cos(tilt.ry * DEG) + z1 * Math.sin(tilt.ry * DEG);
  const z2 = -x * Math.sin(tilt.ry * DEG) + z1 * Math.cos(tilt.ry * DEG);
  const f = PERSPECTIVE / (PERSPECTIVE - z2);
  return { x: WINDOW_CENTER.x + x2 * f, y: WINDOW_CENTER.y + y1 * f };
}

function projectRect(rect: Rect, tilt: Tilt): Rect {
  const corners = [
    project(rect.x * SHOT_SCALE, rect.y * SHOT_SCALE, tilt),
    project((rect.x + rect.w) * SHOT_SCALE, rect.y * SHOT_SCALE, tilt),
    project(rect.x * SHOT_SCALE, (rect.y + rect.h) * SHOT_SCALE, tilt),
    project((rect.x + rect.w) * SHOT_SCALE, (rect.y + rect.h) * SHOT_SCALE, tilt),
  ];
  const x = Math.min(...corners.map((corner) => corner.x));
  const y = Math.min(...corners.map((corner) => corner.y));
  return { x, y, w: Math.max(...corners.map((corner) => corner.x)) - x, h: Math.max(...corners.map((corner) => corner.y)) - y };
}

function endMotion(local: number): { window: number; lockup: number } {
  const leave = easeInOut(local, 0, 1);
  const back = easeInOut(local, 6.8, 0.9);
  return { window: 1 - leave + back, lockup: easeIn(local, 0.6, 1.1) * (1 - easeInOut(local, 6.3, 0.7)) };
}

function Backdrop({ t }: { t: number }) {
  const drift = (period: number, phase: number) => Math.sin((2 * Math.PI * t) / period + phase);
  return (
    <div className="absolute inset-0 overflow-hidden bg-linear-to-b from-[var(--cv-bg-top)] to-[var(--cv-bg-bottom)]">
      <div className="absolute size-[1100px] rounded-full bg-[radial-gradient(closest-side,var(--cv-glow-indigo),transparent)]" style={{ left: -260 + 60 * drift(30, 0), top: -420 + 40 * drift(20, 1) }} />
      <div className="absolute size-[1300px] rounded-full bg-[radial-gradient(closest-side,var(--cv-glow-violet),transparent)]" style={{ left: 900 + 80 * drift(20, 2), top: -200 + 60 * drift(30, 3) }} />
      <div className="absolute size-[1000px] rounded-full bg-[radial-gradient(closest-side,var(--cv-glow-coral),transparent)]" style={{ left: 300 + 90 * drift(60, 4), top: 640 + 50 * drift(20, 5) }} />
    </div>
  );
}

function WindowContent({ scene, local, opacity }: { scene: Scene; local: number; opacity: number }) {
  const focus = focusAt(scene, local);
  return (
    <div className="absolute inset-0" style={{ opacity }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${SHOT_SCALE})` }}>
        <ScreenLayers scene={scene} t={local} />
        <Veil rect={focus.rect} strength={focus.strength} tone="var(--cv-dim)" radius={16} spread={4} />
      </div>
    </div>
  );
}

function Lifts({ scene, local, opacity, tilt }: { scene: Scene; local: number; opacity: number; tilt: Tilt }) {
  return (
    <>
      {focusStepsAt(scene, local).map((step) => {
        if (step.enter <= 0 || step.leave >= 1) return null;
        const rect = { x: step.rect.x - LIFT_PAD, y: step.rect.y - LIFT_PAD, w: step.rect.w + LIFT_PAD * 2, h: step.rect.h + LIFT_PAD * 2 };
        const start = projectRect(rect, tilt);
        const target = Math.min(LIFT_MAX.scale, LIFT_MAX.width / rect.w, LIFT_MAX.height / rect.h);
        const scale = mix(start.w / rect.w, target, step.enter) * (1 - 0.04 * step.leave);
        const cx = mix(start.x + start.w / 2, LIFT_CENTER.x, step.enter);
        const cy = mix(start.y + start.h / 2, LIFT_CENTER.y, step.enter) - 30 * step.leave;
        const alpha = clamp01(step.enter * 3) * (1 - step.leave) * opacity;
        return (
          <div
            key={step.key}
            className="absolute left-0 top-0 overflow-hidden rounded-[18px] bg-white shadow-[var(--cv-lift-shadow)]"
            style={{ transform: `translate(${cx - (rect.w * scale) / 2}px, ${cy - (rect.h * scale) / 2}px)`, opacity: alpha }}
          >
            <SceneCrop scene={scene} t={local} rect={rect} scale={scale} />
          </div>
        );
      })}
    </>
  );
}

function ScenePointer({ scene, local, opacity, tilt }: { scene: Scene; local: number; opacity: number; tilt: Tilt }) {
  const pointer = pointerAt(scene, local);
  if (!pointer) return null;
  const at = project(pointer.x * SHOT_SCALE, pointer.y * SHOT_SCALE, tilt);
  return <PointerGlyph x={at.x} y={at.y} opacity={pointer.opacity * opacity} press={pointer.press} ripple={pointer.ripple} size={30} />;
}

function Lines({ text, opacity, shift }: { text: string; opacity: number; shift: number }) {
  return (
    <p className="absolute inset-x-0 top-0 text-[64px] font-bold leading-[1.25] tracking-tight text-[var(--cv-ink)]" style={{ opacity, transform: `translateY(${shift}px)` }}>
      {text.split(/ ?\n/).map((part) => (
        <span key={part} className="block whitespace-nowrap">
          {part}
        </span>
      ))}
    </p>
  );
}

function Headline({ scene, local, opacity }: { scene: Scene; local: number; opacity: number }) {
  const line = lineAt(scene, local);
  if (!line) return null;
  return (
    <div className="absolute flex flex-col gap-7" style={{ left: TEXT_LEFT, top: 400, width: TEXT_WIDTH, opacity }}>
      {scene.role ? (
        <span className="flex w-fit items-center gap-3 rounded-full bg-[var(--cv-chip)] px-5 py-2 text-[24px] font-medium text-[var(--cv-muted)] ring-1 ring-[var(--cv-chip-ring)]">
          <span className="size-2.5 rounded-full bg-coral" />
          {scene.role}
        </span>
      ) : null}
      <div className="relative h-[190px]">
        {line.previous ? <Lines text={line.previous} opacity={1 - line.p} shift={-LINE_SHIFT * line.p} /> : null}
        <Lines text={line.text} opacity={line.p} shift={LINE_SHIFT * (1 - line.p)} />
      </div>
    </div>
  );
}

function CornerBrand({ opacity }: { opacity: number }) {
  return (
    <div className="absolute flex items-center gap-3" style={{ left: TEXT_LEFT, top: 96, opacity }}>
      <span className={`grid size-[48px] place-items-center rounded-[13px] ${BRAND_TILE}`}>
        <BrandMark className="size-7" />
      </span>
      <span className="text-[32px] font-semibold tracking-tight text-[var(--cv-ink)]">Winyu</span>
    </div>
  );
}

function Lockup({ local, opacity }: { local: number; opacity: number }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ opacity }}>
      <span className={`grid size-[168px] place-items-center rounded-[44px] shadow-[0_40px_120px_-20px_rgb(124_58_237/70%)] ${BRAND_TILE}`}>
        <BrandMark className="size-[108px]" draw={easeInOut(local, 0.8, 1.4)} />
      </span>
      <p className="mt-10 text-[124px] font-bold leading-none tracking-tight text-[var(--cv-ink)]">Winyu</p>
      <p className="mt-6 text-[44px] font-medium text-[var(--cv-muted)]">{TH.app.tagline}</p>
    </div>
  );
}

/** The launch-film cut: real Winyu screens floating in depth on the brand colours, with each finding lifted out of the screen to read. */
export function CanvasStage({ t, scale }: { t: number; scale: number }) {
  const beats = STORY_SEQUENCE.at(t);
  const incoming = beats.length > 1 ? beats[1].opacity : 0;
  const tilt = tiltAt(t, Math.sin(Math.PI * incoming));
  const end = beats.find((beat) => beat.id === "end");
  const motion = end ? endMotion(end.local) : { window: 1, lockup: 0 };
  return (
    <div className="booth-canvas relative overflow-hidden font-sans" style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, transform: `scale(${scale})`, transformOrigin: "top left" }}>
      <Backdrop t={t} />
      <div className="absolute inset-0" style={{ perspective: PERSPECTIVE, perspectiveOrigin: `${WINDOW_CENTER.x}px ${WINDOW_CENTER.y}px`, opacity: motion.window }}>
        <div
          className="absolute overflow-hidden rounded-[22px] bg-white shadow-[var(--cv-window-shadow)] ring-1 ring-[var(--cv-window-ring)]"
          style={{
            left: WINDOW_CENTER.x - WINDOW_WIDTH / 2,
            top: WINDOW_CENTER.y - WINDOW_HEIGHT / 2 + 60 * (1 - motion.window),
            width: WINDOW_WIDTH,
            height: WINDOW_HEIGHT,
            transform: `rotateY(${tilt.ry}deg) rotateX(${tilt.rx}deg)`,
          }}
        >
          {beats.map((beat) => (
            <WindowContent key={beat.id} scene={sceneOf(beat.id)} local={beat.local} opacity={beat.opacity} />
          ))}
        </div>
      </div>
      {beats.map((beat) => (
        <ScenePointer key={beat.id} scene={sceneOf(beat.id)} local={beat.local} opacity={beat.opacity} tilt={tilt} />
      ))}
      {beats.map((beat) => (
        <Lifts key={beat.id} scene={sceneOf(beat.id)} local={beat.local} opacity={beat.opacity} tilt={tilt} />
      ))}
      {beats.map((beat) => (
        <Headline key={beat.id} scene={sceneOf(beat.id)} local={beat.local} opacity={captionOpacity(beats, beat)} />
      ))}
      <CornerBrand opacity={1 - Math.min(1, motion.lockup * 1.5)} />
      {end ? <Lockup local={end.local} opacity={motion.lockup} /> : null}
    </div>
  );
}
