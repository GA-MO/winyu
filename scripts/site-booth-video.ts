import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { waitFor, withHeadlessPage } from "./booth/chrome";

const SITE_URL = "http://localhost:3200";
const OUT_DIR = path.join(process.cwd(), "site", "out");
const STAGE = { width: 1920, height: 1080, scale: 1 };
const JPEG_QUALITY = 92;
const CHUNK_BYTES = 4 * 1024 * 1024;
const LOG_EVERY = 60;
const DEFAULT_CUT = "studio";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const cut = argValue("cut") ?? DEFAULT_CUT;
  const url = argValue("url") ?? `${SITE_URL}/booth?cut=${cut}&capture`;
  const out = argValue("out") ?? path.join(OUT_DIR, `winyu-booth-${cut}.mp4`);
  const frameLimit = argValue("frames");

  await withHeadlessPage(STAGE, async ({ send, evaluate }) => {
    await send("Page.navigate", { url });
    await waitFor("the booth capture API", async () => ((await evaluate("typeof window.__booth === 'object'")) ? true : null));
    await evaluate("window.__booth.ready()");

    const totalFrames = Number(await evaluate("window.__booth.totalFrames"));
    const frames = frameLimit ? Math.min(totalFrames, Number(frameLimit)) : totalFrames;
    const fps = Number(await evaluate("window.__booth.fps"));
    console.log(`Rendering ${frames} frames at ${fps} fps (${(frames / fps).toFixed(1)} s) from ${url}`);

    await evaluate("window.__booth.startEncoder()");
    const startedAt = Date.now();
    for (let frame = 0; frame < frames; frame += 1) {
      await evaluate(`window.__booth.render(${frame})`);
      const { data } = (await send("Page.captureScreenshot", { format: "jpeg", quality: JPEG_QUALITY, optimizeForSpeed: true })) as { data: string };
      await evaluate(`window.__booth.addFrame(${JSON.stringify(data)}, ${frame})`);
      if (frame % LOG_EVERY === 0) console.log(`  frame ${frame}/${frames} · ${((Date.now() - startedAt) / 1000).toFixed(0)} s`);
    }

    const size = Number(await evaluate("window.__booth.finishEncoder()"));
    const parts: Buffer[] = [];
    for (let offset = 0; offset < size; offset += CHUNK_BYTES) {
      const chunk = String(await evaluate(`window.__booth.encodedChunk(${offset}, ${CHUNK_BYTES})`));
      parts.push(Buffer.from(chunk, "base64"));
    }
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, Buffer.concat(parts));
    console.log(`Wrote ${out} · ${(size / 1024 / 1024).toFixed(1)} MB · ${((Date.now() - startedAt) / 1000).toFixed(0)} s`);
  });
}

await main();
