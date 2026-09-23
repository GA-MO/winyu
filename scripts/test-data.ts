import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SOURCE_DIR = path.join(process.cwd(), ".data");
const ADMIN_FILES = new Set(["switches.json", "role-overrides.json", "killed-tools.json"]);

/** Points the JSON store at a throwaway copy of `.data`, so tests never write packets or notifications to real personas. */
export function isolateTestData(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "cop-test-data-"));
  if (existsSync(SOURCE_DIR)) cpSync(SOURCE_DIR, dir, { recursive: true, filter: (source) => !ADMIN_FILES.has(path.basename(source)) });
  process.env.COP_DATA_DIR = dir;
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
