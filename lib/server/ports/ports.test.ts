import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["app", "components", "lib", "scripts"];
const SYSTEM_OF_RECORD = /from "@\/lib\/data\/entities\/(people|recruiting|courses|sites|calendar|policies)"/;
const ALLOWED = [
  /^lib\/data\//,
  /^lib\/server\/ports\/generator\.ts$/,
  /^lib\/server\/mock-[a-z-]+\.ts$/,
  /^lib\/engine\/series\.ts$/,
  /\.test\.tsx?$/,
];

function sourcesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourcesUnder(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("systems of record", () => {
  test("only the generator adapter reads HR, learning, leave, site and calendar records directly; everything else goes through a port", () => {
    const offenders = ROOTS.flatMap((root) => sourcesUnder(join(process.cwd(), root)))
      .map((path) => relative(process.cwd(), path))
      .filter((path) => !ALLOWED.some((allowed) => allowed.test(path)))
      .filter((path) => SYSTEM_OF_RECORD.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});
