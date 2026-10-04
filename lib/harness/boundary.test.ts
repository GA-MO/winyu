import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const ADAPTER_DIR = "lib/harness/adapters/vexa/";
const ENGINE_IMPORT = /from "vexa\/(server|mock)"/;
const SOURCE_GLOB = new Bun.Glob("{app,components,lib,scripts,tests}/**/*.{ts,tsx}");
const FORBIDDEN_COPIES = ["lib/vexa", "lib/vendor/vexa", "vendor/vexa"];

function sources(): string[] {
  return [...SOURCE_GLOB.scanSync({ cwd: process.cwd() })];
}

describe("the Vexa boundary", () => {
  test("only the Vexa adapter imports Vexa's engine packages (vexa/server, vexa/mock)", () => {
    const outside = sources().filter((file) => !file.startsWith(ADAPTER_DIR) && ENGINE_IMPORT.test(readFileSync(file, "utf8")));
    expect(outside).toEqual([]);
  });

  test("Vexa is consumed from its sibling checkout, never copied into Winyu", () => {
    expect(FORBIDDEN_COPIES.filter((dir) => existsSync(dir))).toEqual([]);
  });
});
