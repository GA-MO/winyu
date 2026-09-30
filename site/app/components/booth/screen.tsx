import type { CSSProperties } from "react";
import { layersAt, type Scene } from "./story";
import { SHOT_HEIGHT, SHOT_WIDTH, shotOf, type Rect, type ShotId } from "./shots";

const WIPE_RISE = 18;
const POINTER_PATH = "M1 1 L1 23 L7 17.5 L11 26.5 L14.5 25 L10.5 16 L18 16 Z";

type Layer = ReturnType<typeof layersAt>[number];

function insetOf(region: Rect, bottomCut = 0): string {
  return `inset(${region.y}px ${SHOT_WIDTH - region.x - region.w}px ${SHOT_HEIGHT - region.y - region.h + bottomCut}px ${region.x}px)`;
}

function ShotImage({ shot, style }: { shot: ShotId; style?: CSSProperties }) {
  return <img src={shotOf(shot).src} alt="" width={SHOT_WIDTH} height={SHOT_HEIGHT} draggable={false} className="absolute left-0 top-0 max-w-none select-none" style={{ width: SHOT_WIDTH, height: SHOT_HEIGHT, ...style }} />;
}

function LayerView({ layer }: { layer: Layer }) {
  const { shot, style, region, p } = layer;
  if (style === "base") return <ShotImage shot={shot} />;
  if (style === "fade") return <ShotImage shot={shot} style={{ opacity: p, clipPath: region ? insetOf(region) : undefined }} />;
  if (style === "wipe" && region) {
    return <ShotImage shot={shot} style={{ opacity: Math.min(1, p * 2), clipPath: insetOf(region, region.h * (1 - p)), transform: `translateY(${(1 - p) * WIPE_RISE}px)` }} />;
  }
  if (!region) return <ShotImage shot={shot} style={{ opacity: p }} />;
  return (
    <>
      <ShotImage shot={shot} style={{ opacity: p, clipPath: `inset(0 ${SHOT_WIDTH - region.x}px 0 0)` }} />
      <ShotImage shot={shot} style={{ clipPath: insetOf(region), transform: `translateX(${(1 - p) * (region.w + 40)}px)` }} />
    </>
  );
}

/** The captured app screens of a scene at local time t, stacked in the 1920×1080 space they were taken in. */
export function ScreenLayers({ scene, t }: { scene: Scene; t: number }) {
  return (
    <div className="absolute left-0 top-0 overflow-hidden" style={{ width: SHOT_WIDTH, height: SHOT_HEIGHT }}>
      {layersAt(scene, t).map((layer, index) => (
        <LayerView key={`${layer.shot}-${index}`} layer={layer} />
      ))}
    </div>
  );
}

/** Part of a scene's stacked screens at local time t, drawn at `scale` times its captured size. */
export function SceneCrop({ scene, t, rect, scale }: { scene: Scene; t: number; rect: Rect; scale: number }) {
  return (
    <div className="relative overflow-hidden" style={{ width: rect.w * scale, height: rect.h * scale }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${scale}) translate(${-rect.x}px, ${-rect.y}px)` }}>
        <ScreenLayers scene={scene} t={t} />
      </div>
    </div>
  );
}

/** Holds back everything but one rectangle, in the screens' own space; `tone` is the colour laid over the rest. */
export function Veil({ rect, strength, tone, radius = 16, spread = 6 }: { rect: Rect | null; strength: number; tone: string; radius?: number; spread?: number }) {
  if (!rect || strength <= 0) return null;
  return (
    <div
      className="absolute"
      style={{
        left: rect.x - spread,
        top: rect.y - spread,
        width: rect.w + spread * 2,
        height: rect.h + spread * 2,
        borderRadius: radius,
        opacity: strength,
        boxShadow: `0 0 0 6000px ${tone}`,
      }}
    />
  );
}

/** A desktop pointer with a press dip and a click ripple, drawn in stage pixels. */
export function PointerGlyph({ x, y, opacity, press, ripple, size = 34 }: { x: number; y: number; opacity: number; press: number; ripple: number | null; size?: number }) {
  return (
    <div className="pointer-events-none absolute left-0 top-0" style={{ transform: `translate(${x}px, ${y}px)`, opacity }}>
      {ripple !== null ? (
        <span
          className="absolute rounded-full border-2 border-white bg-white/30"
          style={{ width: 90, height: 90, left: -45, top: -45, transform: `scale(${0.2 + ripple * 0.9})`, opacity: 1 - ripple, boxShadow: "0 0 0 1px rgb(15 23 42 / 18%)" }}
        />
      ) : null}
      <svg viewBox="0 0 20 28" width={size} height={size * 1.4} className="absolute -left-0.5 -top-0.5 origin-top-left drop-shadow-[0_3px_6px_rgb(15_23_42/35%)]" style={{ transform: `scale(${1 - press * 0.14})` }}>
        <path d={POINTER_PATH} fill="#0b0c0f" stroke="#ffffff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
