import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { CANVAS_SEQUENCE, CanvasStage } from "~/components/booth/canvas";
import { DAWN_SECONDS, DawnStage } from "~/components/booth/gl/cuts/dawn";
import { LAUNCH_SECONDS, LaunchStage } from "~/components/booth/gl/cuts/launch";
import { NIGHT_SECONDS, NightStage } from "~/components/booth/gl/cuts/night";
import { SIGNAL_SECONDS, SignalStage } from "~/components/booth/gl/cuts/signal";
import { captureHolds } from "~/components/booth/gl/film";
import { addFrame, encodedChunk, finishEncoder, startEncoder } from "~/components/booth/encoder";
import { FPS, STAGE_HEIGHT, STAGE_WIDTH } from "~/components/booth/sequence";
import { SHOT_IDS, shotOf } from "~/components/booth/shots";
import { STUDIO_SEQUENCE, StudioStage } from "~/components/booth/studio";

const THAI_FONT_PROBE = '600 40px "Noto Sans Thai"';
const LATIN_FONT_PROBE = '600 40px "Inter"';
const FREEZE_ANIMATIONS = "*,*::before,*::after{animation:none!important;transition:none!important}";

const CUTS = {
  studio: { Stage: StudioStage, loopSeconds: STUDIO_SEQUENCE.loopSeconds },
  canvas: { Stage: CanvasStage, loopSeconds: CANVAS_SEQUENCE.loopSeconds },
  night: { Stage: NightStage, loopSeconds: NIGHT_SECONDS },
  signal: { Stage: SignalStage, loopSeconds: SIGNAL_SECONDS },
  dawn: { Stage: DawnStage, loopSeconds: DAWN_SECONDS },
  launch: { Stage: LaunchStage, loopSeconds: LAUNCH_SECONDS },
};

type CutId = keyof typeof CUTS;

const DEFAULT_CUT: CutId = "studio";

type Mode = { kind: "live" } | { kind: "still"; t: number } | { kind: "capture" };

type BoothApi = {
  fps: number;
  totalFrames: number;
  ready: () => Promise<void>;
  render: (frame: number) => Promise<void>;
  startEncoder: typeof startEncoder;
  addFrame: typeof addFrame;
  finishEncoder: typeof finishEncoder;
  encodedChunk: typeof encodedChunk;
};

declare global {
  interface Window {
    __booth?: BoothApi;
  }
}

export function meta() {
  return [{ title: "Winyu · Booth" }];
}

function cutFromUrl(): CutId {
  const cut = new URLSearchParams(window.location.search).get("cut");
  return cut !== null && cut in CUTS ? (cut as CutId) : DEFAULT_CUT;
}

function modeFromUrl(): Mode {
  const params = new URLSearchParams(window.location.search);
  if (params.has("capture")) return { kind: "capture" };
  const still = params.get("t");
  if (still !== null && Number.isFinite(Number(still))) return { kind: "still", t: Number(still) };
  return { kind: "live" };
}

function fitScale() {
  return Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

async function assetsReady() {
  await Promise.all([document.fonts.load(THAI_FONT_PROBE, "ก"), document.fonts.load(LATIN_FONT_PROBE, "W")]);
  await document.fonts.ready;
  await preloadShots();
  await captureHolds();
}

async function imagesReady() {
  await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
}

async function preloadShots() {
  await Promise.all(SHOT_IDS.map((id) => {
    const image = new Image();
    image.src = shotOf(id).src;
    return image.decode().catch(() => undefined);
  }));
}

function useLiveClock(enabled: boolean, loopSeconds: number, setT: (t: number) => void) {
  useEffect(() => {
    if (!enabled) return;
    const startedAt = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      setT(((now - startedAt) / 1000) % loopSeconds);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [enabled, loopSeconds, setT]);
}

function useCaptureApi(enabled: boolean, loopSeconds: number, setT: (t: number) => void) {
  useEffect(() => {
    if (!enabled) return;
    const freeze = document.createElement("style");
    freeze.textContent = FREEZE_ANIMATIONS;
    document.head.append(freeze);
    window.__booth = {
      fps: FPS,
      totalFrames: Math.round(loopSeconds * FPS),
      ready: assetsReady,
      render: async (frame) => {
        flushSync(() => setT(frame / FPS));
        await imagesReady();
        await nextPaint();
      },
      startEncoder,
      addFrame,
      finishEncoder,
      encodedChunk,
    };
    return () => {
      freeze.remove();
      delete window.__booth;
    };
  }, [enabled, loopSeconds, setT]);
}

export default function Booth() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [cut, setCut] = useState<CutId>(DEFAULT_CUT);
  const [t, setT] = useState(0);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const initial = modeFromUrl();
    setCut(cutFromUrl());
    setMode(initial);
    if (initial.kind === "still") setT(initial.t);
    const resize = () => setScale(fitScale());
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const { Stage, loopSeconds } = CUTS[cut];
  useLiveClock(mode?.kind === "live", loopSeconds, setT);
  useCaptureApi(mode?.kind === "capture", loopSeconds, setT);

  if (!mode) return <main className="fixed inset-0 bg-black" />;
  return (
    <main className="fixed inset-0 grid cursor-none place-items-center overflow-hidden bg-black">
      <div style={{ width: STAGE_WIDTH * scale, height: STAGE_HEIGHT * scale }}>
        <Stage t={t} scale={scale} />
      </div>
    </main>
  );
}
