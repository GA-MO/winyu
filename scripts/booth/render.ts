import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { waitFor, withHeadlessPage } from "./chrome";

const PORT = Number(process.env.BOOTH_RENDER_PORT ?? 3231);
const FPS = 30;
const STAGE = { width: 1920, height: 1080, scale: 1 };
const JPEG_QUALITY = 92;
const CHUNK_BYTES = 4 * 1024 * 1024;
const LOG_EVERY = 150;
const CAPTURE_ENTRY = path.join(process.cwd(), "site", "film", "capture.ts");

const [filmPath, outPath] = process.argv.slice(2);
if (!filmPath || !outPath) throw new Error("Usage: bun run booth:render <film.html> <out.mp4>  (a film exposes window.film = { length, render(t), ready })");

async function encoderBundle(): Promise<string> {
  const built = await Bun.build({ entrypoints: [CAPTURE_ENTRY], target: "browser", format: "esm", minify: true });
  if (!built.success) throw new Error(built.logs.map(String).join("\n"));
  return built.outputs[0].text();
}

const film = readFileSync(filmPath, "utf8");
const encoder = await encoderBundle();
const server = Bun.serve({
  port: PORT,
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/encoder.js") return new Response(encoder, { headers: { "content-type": "text/javascript" } });
    return new Response(film, { headers: { "content-type": "text/html; charset=utf-8" } });
  },
});

try {
  await withHeadlessPage(STAGE, async ({ send, evaluate }) => {
    await send("Page.navigate", { url: `http://localhost:${PORT}/?capture` });
    await waitFor("the film", async () => ((await evaluate("Boolean(window.film && window.film.ready)")) ? true : null));
    await evaluate("document.fonts.ready.then(() => true)");
    await evaluate(`new Promise((resolve, reject) => { const s = document.createElement('script'); s.type = 'module'; s.src = '/encoder.js'; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); })`);
    await waitFor("the encoder", async () => ((await evaluate("typeof window.__encoder === 'object'")) ? true : null));

    const length = Number(await evaluate("window.film.length"));
    const frames = Math.round(length * FPS);
    console.log(`Rendering ${frames} frames (${length.toFixed(2)} s at ${FPS} fps) from ${filmPath}`);
    await evaluate("window.__encoder.startEncoder()");
    const startedAt = Date.now();
    for (let frame = 0; frame < frames; frame += 1) {
      await evaluate(`window.film.render(${frame / FPS})`);
      const { data } = (await send("Page.captureScreenshot", { format: "jpeg", quality: JPEG_QUALITY, optimizeForSpeed: true })) as { data: string };
      await evaluate(`window.__encoder.addFrame(${JSON.stringify(data)}, ${frame})`);
      if (frame % LOG_EVERY === 0) console.log(`  frame ${frame}/${frames} · ${((Date.now() - startedAt) / 1000).toFixed(0)} s`);
    }
    const size = Number(await evaluate("window.__encoder.finishEncoder()"));
    const parts: Buffer[] = [];
    for (let offset = 0; offset < size; offset += CHUNK_BYTES) {
      parts.push(Buffer.from(String(await evaluate(`window.__encoder.encodedChunk(${offset}, ${CHUNK_BYTES})`)), "base64"));
    }
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, Buffer.concat(parts));
    console.log(`Wrote ${outPath} · ${(size / 1024 / 1024).toFixed(1)} MB · ${((Date.now() - startedAt) / 1000).toFixed(0)} s`);
  });
} finally {
  server.stop(true);
}
