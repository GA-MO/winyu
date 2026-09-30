import { BrandMark } from "@/components/chrome/brand-mark";
import { TH } from "@/lib/i18n/th";
import { rectInView, screenTransform, type View } from "./camera";
import { PointerGlyph, ScreenLayers, Veil } from "./screen";
import { STAGE_HEIGHT, STAGE_WIDTH, easeIn, easeInOut } from "./sequence";
import { STORY_SEQUENCE, captionOpacity, focusAt, framingAt, lineAt, pointerAt, sceneOf, type Scene } from "./story";

const WINDOW = { x: 200, y: 48, width: 1520, height: 855 };
const VIEW: View = { width: WINDOW.width, height: WINDOW.height };
const CAPTION_TOP = 928;
const LINE_SHIFT = 14;
const BRAND_TILE = "bg-[linear-gradient(135deg,var(--color-primary),var(--color-violet)_55%,var(--color-coral))] text-white";

/** The Apple-style cut's loop length. */
export const STUDIO_SEQUENCE = STORY_SEQUENCE;

function oneLine(text: string): string {
  return text.replace(/( ?)\n/g, "$1");
}

function endWindow(local: number): { opacity: number; scale: number; lockup: number } {
  const leave = easeInOut(local, 0, 1);
  const back = easeInOut(local, 6.8, 0.9);
  const lockup = easeIn(local, 0.6, 1.1) * (1 - easeInOut(local, 6.3, 0.7));
  return { opacity: 1 - leave + back, scale: 1 - 0.08 * leave + 0.08 * back, lockup };
}

function SceneScreen({ scene, local, opacity }: { scene: Scene; local: number; opacity: number }) {
  const framing = framingAt(scene, local, VIEW);
  const focus = focusAt(scene, local);
  const pointer = pointerAt(scene, local);
  const at = pointer ? rectInView({ x: pointer.x, y: pointer.y, w: 0, h: 0 }, framing, VIEW) : null;
  return (
    <div className="absolute inset-0" style={{ opacity }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: screenTransform(framing, VIEW) }}>
        <ScreenLayers scene={scene} t={local} />
        <Veil rect={focus.rect} strength={focus.strength} tone="var(--st-veil)" />
      </div>
      {pointer && at ? <PointerGlyph x={at.x} y={at.y} opacity={pointer.opacity} press={pointer.press} ripple={pointer.ripple} /> : null}
    </div>
  );
}

function Caption({ scene, local, opacity }: { scene: Scene; local: number; opacity: number }) {
  const line = lineAt(scene, local);
  if (!line) return null;
  return (
    <div className="absolute" style={{ left: WINDOW.x, top: CAPTION_TOP, width: 1180, opacity }}>
      <p className="text-[26px] font-medium text-[var(--st-muted)]">{scene.role}</p>
      <div className="relative mt-1 h-[80px]">
        {line.previous ? (
          <p className="absolute inset-x-0 top-0 text-[60px] font-semibold leading-[1.25] tracking-tight text-[var(--st-ink)]" style={{ opacity: 1 - line.p, transform: `translateY(${-LINE_SHIFT * line.p}px)` }}>
            {oneLine(line.previous)}
          </p>
        ) : null}
        <p className="absolute inset-x-0 top-0 text-[60px] font-semibold leading-[1.25] tracking-tight text-[var(--st-ink)]" style={{ opacity: line.p, transform: `translateY(${LINE_SHIFT * (1 - line.p)}px)` }}>
          {oneLine(line.text)}
        </p>
      </div>
    </div>
  );
}

function CornerBrand({ opacity }: { opacity: number }) {
  return (
    <div className="absolute flex items-center gap-3" style={{ right: STAGE_WIDTH - WINDOW.x - WINDOW.width, top: CAPTION_TOP + 44, opacity }}>
      <span className={`grid size-[52px] place-items-center rounded-[14px] ${BRAND_TILE}`}>
        <BrandMark className="size-8" />
      </span>
      <span className="text-[34px] font-semibold tracking-tight text-[var(--st-ink)]">Winyu</span>
    </div>
  );
}

function Lockup({ local, opacity }: { local: number; opacity: number }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ opacity }}>
      <span className={`grid size-[168px] place-items-center rounded-[44px] shadow-[0_30px_60px_-34px_rgb(79_70_229/50%)] ${BRAND_TILE}`}>
        <BrandMark className="size-[108px]" draw={easeInOut(local, 0.8, 1.4)} />
      </span>
      <p className="mt-10 text-[120px] font-bold leading-none tracking-tight text-[var(--st-ink)]">Winyu</p>
      <p className="mt-6 text-[44px] font-medium text-[var(--st-muted)]">{TH.app.tagline}</p>
    </div>
  );
}

/** The Apple-style cut: real Winyu screens in one quiet window, a camera that pushes in on what matters, one caption at a time. */
export function StudioStage({ t, scale }: { t: number; scale: number }) {
  const beats = STORY_SEQUENCE.at(t);
  const end = beats.find((beat) => beat.id === "end");
  const frame = end ? endWindow(end.local) : { opacity: 1, scale: 1, lockup: 0 };
  const endWeight = end ? end.opacity : 0;
  const lockup = frame.lockup * endWeight;
  return (
    <div className="booth-studio relative overflow-hidden bg-[var(--st-bg)] font-sans" style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, transform: `scale(${scale})`, transformOrigin: "top left" }}>
      <div
        className="absolute overflow-hidden rounded-[26px] bg-white shadow-[var(--st-window-shadow)] ring-1 ring-[var(--st-window-ring)]"
        style={{ left: WINDOW.x, top: WINDOW.y, width: WINDOW.width, height: WINDOW.height, opacity: frame.opacity, transform: `scale(${frame.scale})` }}
      >
        {beats.map((beat) => (
          <SceneScreen key={beat.id} scene={sceneOf(beat.id)} local={beat.local} opacity={beat.opacity} />
        ))}
      </div>
      {beats.map((beat) => (
        <Caption key={beat.id} scene={sceneOf(beat.id)} local={beat.local} opacity={captionOpacity(beats, beat)} />
      ))}
      <CornerBrand opacity={1 - Math.min(1, lockup * 1.5)} />
      {end ? <Lockup local={end.local} opacity={lockup} /> : null}
    </div>
  );
}
