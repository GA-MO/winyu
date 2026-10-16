import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const SOURCE_GLOB = new Bun.Glob("{app,components,lib,scripts,tests}/**/*.{ts,tsx}");
const THIS_FILE = "lib/share/one-way-to-send.test.ts";
const RETIRED = ["Context" + "Packet", "create" + "_handoff", "share" + "_card", "Handoff" + "Row", "preload" + "Prompt", "packets" + "()", "Packet" + "Reply", "HandoffReply" + "Note"];

describe("one way to send", () => {
  test("no source names the handoff packet, its tools or its store: every send is a matter", () => {
    const found = [...SOURCE_GLOB.scanSync({ cwd: process.cwd() })]
      .filter((file) => file !== THIS_FILE)
      .flatMap((file) => {
        const text = readFileSync(file, "utf8");
        return RETIRED.filter((name) => text.includes(name)).map((name) => `${file}: ${name}`);
      });
    expect(found).toEqual([]);
  });
});
