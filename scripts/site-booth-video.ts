import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SITE_URL = "http://localhost:3200";
const OUT_DIR = path.join(process.cwd(), "site", "out");
const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEBUG_PORT = 9444;
const STAGE = { width: 1920, height: 1080 };
const JPEG_QUALITY = 92;
const CHUNK_BYTES = 4 * 1024 * 1024;
const LOG_EVERY = 60;
const BOOT_TIMEOUT_MS = 30_000;

type CdpMessage = { id?: number; method?: string; result?: Record<string, unknown>; error?: { message: string }; sessionId?: string };

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(label: string, probe: () => Promise<T | null>): Promise<T> {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = await probe().catch(() => null);
    if (value !== null) return value;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function launchChrome(chromePath: string, profileDir: string) {
  return spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`,
    `--window-size=${STAGE.width},${STAGE.height}`,
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ], { stdio: "ignore" });
}

async function browserSocketUrl(): Promise<string> {
  return waitFor("Chrome DevTools endpoint", async () => {
    const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const body = (await response.json()) as { webSocketDebuggerUrl?: string };
    return body.webSocketDebuggerUrl ?? null;
  });
}

function connect(url: string) {
  const socket = new WebSocket(url);
  const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  let nextId = 1;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as CdpMessage;
    if (message.id === undefined) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result ?? {});
  });
  const opened = new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error("DevTools socket failed")));
  });
  function send(method: string, params: Record<string, unknown> = {}, sessionId?: string) {
    const id = nextId++;
    socket.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise<Record<string, unknown>>((resolve, reject) => pending.set(id, { resolve, reject }));
  }
  return { opened, send, close: () => socket.close() };
}

async function main() {
  const cut = argValue("cut") ?? "demo";
  const url = argValue("url") ?? `${SITE_URL}/booth?cut=${cut}&capture`;
  const out = argValue("out") ?? path.join(OUT_DIR, cut === "demo" ? "winyu-booth.mp4" : `winyu-booth-${cut}.mp4`);
  const frameLimit = argValue("frames");
  const chromePath = process.env.CHROME_PATH ?? DEFAULT_CHROME;
  const profileDir = mkdtempSync(path.join(tmpdir(), "winyu-booth-"));
  const chrome = launchChrome(chromePath, profileDir);

  try {
    const cdp = connect(await browserSocketUrl());
    await cdp.opened;
    const { targetId } = (await cdp.send("Target.createTarget", { url: "about:blank" })) as { targetId: string };
    const { sessionId } = (await cdp.send("Target.attachToTarget", { targetId, flatten: true })) as { sessionId: string };
    const page = (method: string, params: Record<string, unknown> = {}) => cdp.send(method, params, sessionId);
    const evaluate = async (expression: string) => {
      const reply = (await page("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })) as { result: { value?: unknown }; exceptionDetails?: { text: string; exception?: { description?: string } } };
      if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
      return reply.result.value;
    };

    await page("Emulation.setDeviceMetricsOverride", { width: STAGE.width, height: STAGE.height, deviceScaleFactor: 1, mobile: false });
    await page("Page.navigate", { url });
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
      const { data } = (await page("Page.captureScreenshot", { format: "jpeg", quality: JPEG_QUALITY, optimizeForSpeed: true })) as { data: string };
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
    cdp.close();
  } finally {
    chrome.kill();
    rmSync(profileDir, { recursive: true, force: true });
  }
}

await main();
