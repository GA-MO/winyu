import { addFrame, encodedChunk, finishEncoder, startEncoder } from "./encoder";

type Encoder = { startEncoder: () => Promise<void>; addFrame: typeof addFrame; finishEncoder: typeof finishEncoder; encodedChunk: typeof encodedChunk };

declare global {
  interface Window {
    __encoder: Encoder;
    film: { length: number; render: (t: number) => void; ready: boolean; audio?: () => Promise<AudioBuffer> };
  }
}

window.__encoder = { startEncoder: async () => startEncoder(window.film.audio ? await window.film.audio() : null), addFrame, finishEncoder, encodedChunk };
