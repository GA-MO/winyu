import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEBUG_PORT = Number(process.env.BOOTH_DEBUG_PORT ?? 9444);
const BOOT_TIMEOUT_MS = 30_000;

type CdpMessage = { id?: number; result?: Record<string, unknown>; error?: { message: string } };
type Viewport = { width: number; height: number; scale: number };

/** A headless Chrome tab driven over the DevTools protocol, with nothing but Bun's WebSocket. */
export type HeadlessPage = {
  send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  evaluate: (expression: string) => Promise<unknown>;
  navigate: (url: string) => Promise<void>;
  close: () => void;
};

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls until the probe returns a value, or fails after the boot timeout. */
export async function waitFor<T>(label: string, probe: () => Promise<T | null>): Promise<T> {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = await probe().catch(() => null);
    if (value !== null) return value;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function launchChrome(chromePath: string, profileDir: string, viewport: Viewport) {
  return spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`,
    `--window-size=${viewport.width},${viewport.height}`,
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

/** Launches Chrome, opens one tab at the given viewport and light colour scheme, and runs `work` against it. */
export async function withHeadlessPage<T>(viewport: Viewport, work: (page: HeadlessPage) => Promise<T>): Promise<T> {
  const profileDir = mkdtempSync(path.join(tmpdir(), "winyu-booth-"));
  const chrome = launchChrome(process.env.CHROME_PATH ?? DEFAULT_CHROME, profileDir, viewport);
  try {
    const cdp = connect(await browserSocketUrl());
    await cdp.opened;
    const { targetId } = (await cdp.send("Target.createTarget", { url: "about:blank" })) as { targetId: string };
    const { sessionId } = (await cdp.send("Target.attachToTarget", { targetId, flatten: true })) as { sessionId: string };
    const send = (method: string, params: Record<string, unknown> = {}) => cdp.send(method, params, sessionId);
    const evaluate = async (expression: string) => {
      const reply = (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })) as { result: { value?: unknown }; exceptionDetails?: { text: string; exception?: { description?: string } } };
      if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
      return reply.result.value;
    };
    const navigate = async (url: string) => {
      await send("Page.navigate", { url });
      await waitFor(`load of ${url}`, async () => ((await evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === "complete"`)) ? true : null));
    };
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: viewport.scale, mobile: false });
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
    const result = await work({ send, evaluate, navigate, close: () => cdp.close() });
    cdp.close();
    return result;
  } finally {
    chrome.kill();
    rmSync(profileDir, { recursive: true, force: true });
  }
}
