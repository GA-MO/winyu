import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const ADAPTER_DIR = "lib/harness/adapters/mastra/";
const ENGINE_IMPORT = /from "(@mastra\/[^"]+|@ag-ui\/[^"]+|@copilotkit\/runtime[^"]*)"/;
const SOURCE_GLOB = new Bun.Glob("{app,components,lib,scripts,tests}/**/*.{ts,tsx}");

function sources(): string[] {
  return [...SOURCE_GLOB.scanSync({ cwd: process.cwd() })];
}

describe("the agent engine boundary", () => {
  test("only the Mastra adapter imports Mastra, AG-UI and the CopilotKit runtime", () => {
    const outside = sources().filter((file) => !file.startsWith(ADAPTER_DIR) && ENGINE_IMPORT.test(readFileSync(file, "utf8")));
    expect(outside).toEqual([]);
  });

  test("the adapter is where the engine lives", () => {
    const inside = sources().filter((file) => file.startsWith(ADAPTER_DIR) && ENGINE_IMPORT.test(readFileSync(file, "utf8")));
    expect(inside.length).toBeGreaterThan(0);
  });
});
