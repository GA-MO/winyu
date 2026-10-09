import { describe, expect, test } from "bun:test";
import { lmsDemoEnv } from "./lms-demo-config";
import { reservedReasonOf } from "./reserved";

describe("a console connector cannot open a tool Winyu already has", () => {
  test("a remote tool named like a native tool is refused on any server", () => {
    expect(reservedReasonOf("https://lms.partner.example/mcp", "list_courses")).toBe("native_tool");
    expect(reservedReasonOf(lmsDemoEnv().url, "list_courses")).toBe("native_tool");
  });

  test("a tool a code connector opens on the same server is refused there, and a copy on another port may open it", () => {
    expect(reservedReasonOf(lmsDemoEnv().url, "training_history")).toBe("code_tool");
    expect(reservedReasonOf("http://127.0.0.1:3289/mcp", "training_history")).toBeNull();
  });
});
