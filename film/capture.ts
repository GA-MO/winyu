import { addFrame, encodedChunk, finishEncoder, startEncoder } from "./encoder";

declare global {
  interface Window {
    __encoder: { startEncoder: typeof startEncoder; addFrame: typeof addFrame; finishEncoder: typeof finishEncoder; encodedChunk: typeof encodedChunk };
  }
}

window.__encoder = { startEncoder, addFrame, finishEncoder, encodedChunk };
