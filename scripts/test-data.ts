import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SOURCE_DIR = path.join(process.cwd(), ".data");
const ADMIN_FILES = new Set(["switches.json", "role-overrides.json", "killed-tools.json", "policy-rules.json"]);
const PAID_MODEL_KEYS = ["OPENROUTER_API_KEY", "ANTHROPIC_API_KEY"];

/** Drops the keys Bun loads from `.env.local`, so no test (nor the memory or digest job a chat turn starts) ever calls a paid model. */
export function withoutPaidModels(): void {
  for (const key of PAID_MODEL_KEYS) delete process.env[key];
}

/** Points the JSON store at a throwaway copy of `.data`, so tests never write packets or notifications to real personas. */
export function isolateTestData(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mascop-test-data-"));
  if (existsSync(SOURCE_DIR)) cpSync(SOURCE_DIR, dir, { recursive: true, filter: (source) => !ADMIN_FILES.has(path.basename(source)) });
  process.env.MASCOP_DATA_DIR = dir;
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
