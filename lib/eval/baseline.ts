import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Failures a recording is known to have, by case id then check id: the model's real mistakes at record time, accepted so a gate fails only on new ones. */
export type KnownFailures = Record<string, string[]>;

/** Where the accepted failures are committed beside the recordings. */
export const KNOWN_FAILURES_FILE = path.join(process.cwd(), "evals", "known-failures.json");

/** The accepted failures, or none when the file does not exist. */
export function readKnownFailures(): KnownFailures {
  return existsSync(KNOWN_FAILURES_FILE) ? (JSON.parse(readFileSync(KNOWN_FAILURES_FILE, "utf8")) as KnownFailures) : {};
}

/** Accepts these failures as the baseline. */
export function writeKnownFailures(known: KnownFailures): void {
  writeFileSync(KNOWN_FAILURES_FILE, `${JSON.stringify(known, null, 2)}\n`);
}

/** The failed checks of one case that the baseline does not accept. */
export function unexpectedFailures(caseId: string, failed: readonly string[], known: KnownFailures): string[] {
  const accepted = known[caseId] ?? [];
  return failed.filter((id) => !accepted.includes(id));
}
