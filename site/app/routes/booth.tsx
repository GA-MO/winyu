import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { SAAS_SEQUENCE, SaasStage } from "~/components/booth/saas";
import { DemoStage } from "~/components/booth/scenes";
import { addFrame, encodedChunk, finishEncoder, startEncoder } from "~/components/booth/encoder";
import { FPS, STAGE_HEIGHT, STAGE_WIDTH } from "~/components/booth/sequence";
import { DEMO_SEQUENCE } from "~/components/booth/timeline";

const THAI_FONT_PROBE = '600 40px "Noto Sans Thai"';
const LATIN_FONT_PROBE = '600 40px "Inter"';
const FREEZE_ANIMATIONS = "*,*::before,*::after{animation:none!important;transition:none!important}";

const CUTS = {
  demo: { Stage: DemoStage, loopSeconds: DEMO_SEQUENCE.loopSeconds },
  saas: { Stage: SaasStage, loopSeconds: SAAS_SEQUENCE.loopSeconds },
};

type CutId = keyof typeof CUTS;

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
  return cut === "saas" ? "saas" : "demo";
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

async function fontsReady() {
  await Promise.all([document.fonts.load(THAI_FONT_PROBE, "ก"), document.fonts.load(LATIN_FONT_PROBE, "W")]);
  await document.fonts.ready;
}

async function imagesReady() {
  await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
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
      ready: fontsReady,
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
  const [cut, setCut] = useState<CutId>("demo");
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
