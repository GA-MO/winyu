import type { Investigation } from "@/lib/contracts";
import { investigations } from "@/lib/server/agent/collections";

/** The last investigation stored for this person, or null before the first run. */
export function latestInvestigation(userId: string): Investigation | null {
  return investigations().get(userId) ?? null;
}

export function saveInvestigation(investigation: Investigation): void {
  investigations().put(investigation);
}
