import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

setDefaultTimeout(90_000);

const FIXTURE = "./lib/harness/adapters/mastra/restart.fixture.ts";
const MARKER = "RESTART_FIXTURE_CHECKPOINTED";
const KILLED = 9;

type Finished = { code: number; log: string };

async function untilPrinted(stream: ReadableStream<Uint8Array>, marker: string): Promise<string> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let seen = "";
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    seen += decoder.decode(chunk.value, { stream: true });
    if (seen.includes(marker)) break;
  }
  reader.releaseLock();
  return seen;
}

function fixture(phase: string, env: Record<string, string>) {
  return Bun.spawn(["bun", "test", FIXTURE], { cwd: process.cwd(), env: { ...process.env, ...env, RESTART_PHASE: phase }, stdout: "pipe", stderr: "pipe" });
}

/** Starts a chat run in one server process, kills that process once Mastra has checkpointed the run, then boots a second process on the same data that runs `phase` of the fixture. */
async function afterRestart(phase: string): Promise<Finished> {
  const dir = mkdtempSync(path.join(tmpdir(), "winyu-restart-"));
  const env = { WINYU_TEST_DATA_DIR: dir, WINYU_SCHEDULER: "off", RESTART_THREAD: `restart-${crypto.randomUUID()}`, RESTART_RUN: crypto.randomUUID(), RESTART_MESSAGE: crypto.randomUUID(), RESTART_MARKER: MARKER };
  try {
    const first = fixture("start", env);
    const printed = await untilPrinted(first.stdout, MARKER);
    first.kill(KILLED);
    await first.exited;
    if (!printed.includes(MARKER)) return { code: -1, log: `the first process never checkpointed the run:\n${printed}` };
    const second = fixture(phase, env);
    const [code, out, err] = await Promise.all([second.exited, new Response(second.stdout).text(), new Response(second.stderr).text()]);
    return { code, log: code === 0 ? "" : `${out}\n${err}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("a server restart in the middle of a chat run", () => {
  test("the resumed run raises the approval for the write it reaches and ends; the yes carries it out and the thread takes the next message", async () => {
    expect(await afterRestart("recover")).toEqual({ code: 0, log: "" });
  });

  test("a resumed run that never finishes does not block its thread", async () => {
    expect(await afterRestart("orphan")).toEqual({ code: 0, log: "" });
  });
});
