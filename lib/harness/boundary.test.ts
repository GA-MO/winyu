import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const ADAPTER_DIR = "lib/harness/adapters/mastra/";
const ENGINE_IMPORT = /from "(@mastra\/[^"]+|@ag-ui\/[^"]+|@copilotkit\/runtime[^"]*)"/;
const CLIENT_DIRS = ["components/providers/", "components/chat/"];
const CLIENT_IMPORT = /from "(@copilotkit\/react-core[^"]*|@copilotkit\/a2ui-renderer|@a2ui\/[^"]+)"/;
const SOURCE_GLOB = new Bun.Glob("{app,components,lib,scripts,tests}/**/*.{ts,tsx}");

function sources(): string[] {
  return [...SOURCE_GLOB.scanSync({ cwd: process.cwd() })];
}

describe("the agent engine boundary", () => {
  test("only the Mastra adapter imports Mastra, AG-UI and the CopilotKit runtime", () => {
    const outside = sources().filter((file) => !file.startsWith(ADAPTER_DIR) && ENGINE_IMPORT.test(readFileSync(file, "utf8")));
    expect(outside).toEqual([]);
  });

  test("only the chat and its provider import the CopilotKit client and its A2UI renderer", () => {
    const outside = sources().filter((file) => !CLIENT_DIRS.some((dir) => file.startsWith(dir)) && CLIENT_IMPORT.test(readFileSync(file, "utf8")));
    expect(outside).toEqual([]);
  });

  test("the adapter is where the engine lives", () => {
    const inside = sources().filter((file) => file.startsWith(ADAPTER_DIR) && ENGINE_IMPORT.test(readFileSync(file, "utf8")));
    expect(inside.length).toBeGreaterThan(0);
  });
});
