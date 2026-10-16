import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess } from "@/lib/server/request-context";
import { GapCard } from "./reference";

type GapAnswer = { contributors: { share_label: string }[] };

async function explainGapAs(userId: string, compare: "prev_year" | "target"): Promise<GapAnswer> {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  const input = { metric: "net_sales_volume", split: "agent", filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, compare };
  return runWithAccess(accessFor(user), () => winyuTools().explain_gap.execute(input) as Promise<GapAnswer>);
}

function overWhole(answer: GapAnswer): boolean {
  return answer.contributors.some((row) => Number.parseFloat(row.share_label) > 100);
}

describe("explain_gap shares above 100%", () => {
  test("say on the card why they can pass 100%, and only when one does", async () => {
    const over = await explainGapAs("u_anucha", "prev_year");
    expect(overWhole(over)).toBe(true);
    expect(renderToStaticMarkup(<GapCard result={over} />)).toContain(TH.cards.gap.overHundred);
    const answers = await Promise.all([explainGapAs("u_thana", "prev_year"), explainGapAs("u_thana", "target"), explainGapAs("u_anucha", "target")]);
    const within = answers.find((answer) => !overWhole(answer));
    if (!within) throw new Error("every fixture is over 100%");
    expect(renderToStaticMarkup(<GapCard result={within} />)).not.toContain(TH.cards.gap.overHundred);
  });
});
