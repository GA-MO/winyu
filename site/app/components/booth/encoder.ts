import type { BufferTarget, Output, VideoSampleSource } from "mediabunny";
import { FPS } from "./sequence";

const BITRATE = 12_000_000;
const KEYFRAME_EVERY_S = 2;
const BASE64_SLICE = 0x8000;

type Session = { output: Output<never, BufferTarget>; source: VideoSampleSource; buffer: ArrayBuffer | null };

let session: Session | null = null;

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += BASE64_SLICE) binary += String.fromCharCode(...bytes.subarray(index, index + BASE64_SLICE));
  return btoa(binary);
}

/** Opens an in-memory H.264 MP4 at the booth frame rate. */
export async function startEncoder(): Promise<void> {
  const { BufferTarget, Mp4OutputFormat, Output, VideoSampleSource } = await import("mediabunny");
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const source = new VideoSampleSource({ codec: "avc", bitrate: BITRATE });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();
  session = { output: output as Output<never, BufferTarget>, source, buffer: null };
}

/** Encodes one captured JPEG frame at its place in the timeline. */
export async function addFrame(jpegBase64: string, frame: number): Promise<void> {
  if (!session) throw new Error("Encoder not started");
  const { VideoSample } = await import("mediabunny");
  const bitmap = await createImageBitmap(base64ToBlob(jpegBase64, "image/jpeg"));
  const sample = new VideoSample(bitmap, { timestamp: frame / FPS, duration: 1 / FPS });
  await session.source.add(sample, { keyFrame: frame % (FPS * KEYFRAME_EVERY_S) === 0 });
  sample.close();
  bitmap.close();
}

/** Finalizes the MP4 and returns its size in bytes. */
export async function finishEncoder(): Promise<number> {
  if (!session) throw new Error("Encoder not started");
  await session.output.finalize();
  session.buffer = session.output.target.buffer;
  return session.buffer?.byteLength ?? 0;
}

/** A base64 slice of the finished MP4, so the exporter can read it in pieces. */
export function encodedChunk(offset: number, length: number): string {
  if (!session?.buffer) throw new Error("Encoder not finished");
  return bytesToBase64(new Uint8Array(session.buffer, offset, Math.min(length, session.buffer.byteLength - offset)));
}
