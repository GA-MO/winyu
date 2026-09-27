import type { DraftStory } from "@/lib/contracts";

const REMEMBERED = new Set(["recall_memory"]);

/** A check the model called confirmed or ruled out stands only when it names a data tool this run called; a memory note or nothing makes it likely or unknown. */
export function honestChecks(draft: DraftStory, calledTools: ReadonlySet<string>): DraftStory {
  const checked = draft.checked.map((check) => {
    if (check.verdict !== "confirmed" && check.verdict !== "ruled_out") return check;
    const shown = check.source !== null && calledTools.has(check.source) && !REMEMBERED.has(check.source);
    if (shown) return check;
    return { ...check, verdict: check.verdict === "confirmed" ? ("likely" as const) : ("unknown" as const) };
  });
  return { ...draft, checked };
}
