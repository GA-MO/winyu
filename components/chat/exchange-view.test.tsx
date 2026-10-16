import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), usePathname: () => "/" }));

const { ShareProvider } = await import("@/components/share/share-sheet");
const { liveAccessFor } = await import("@/lib/access/enforce");
const { findUser } = await import("@/lib/data/entities/users");
const { TH } = await import("@/lib/i18n/th");
const { winyuTools } = await import("@/lib/server/agent/tools");
const { runWithAccess } = await import("@/lib/server/request-context");
const { screenCardsEach } = await import("./card-to-share");
const { ExchangeView } = await import("./exchange-view");

const SOUTH = { metric: "net_sales_value", dims: ["region"], grain: "month", range: { from: "2026-11-01", to: "2026-11-26" }, compare: "none", filters: { region: ["south"] }, sort: null, limit: null };
const CARD_TOOLS: ReadonlySet<string> = new Set(["query_metric"]);

async function deniedForRsm(): Promise<unknown> {
  const rsm = findUser("u_anucha");
  if (!rsm) throw new Error("no u_anucha");
  return runWithAccess(liveAccessFor(rsm), () => winyuTools().query_metric.execute(SOUTH, { toolCallId: "denied-south" }));
}

function live(isLast: boolean) {
  return { isLast, running: false, asked: [], waiting: new Set<string>(), decisions: {}, decide: () => {}, stopped: false, error: null, requestedCourses: new Set<string>(), onScreen: null, toolLabels: {}, durationMs: null };
}

describe("a card for a read the person may not see", () => {
  test("offers the request-access action only: no ส่งต่อ, and it is not a card a send can name", async () => {
    const result = await deniedForRsm();
    expect(result).toMatchObject({ ok: false, nextActions: [expect.anything()] });
    const exchange = { id: "q1", question: { kind: "typed" as const, text: "ยอดภาคใต้เดือนนี้" }, steps: [{ kind: "tool" as const, toolCallId: "denied-south", name: "query_metric", args: SOUTH, outcome: { state: "returned" as const, result } }] };
    const html = renderToStaticMarkup(
      <ShareProvider open>
        <ExchangeView exchange={exchange} live={live(true)} />
      </ShareProvider>,
    );
    expect(html).toContain("นอกขอบเขตสิทธิ์");
    expect(html).not.toContain(TH.share.button);
    expect(screenCardsEach([exchange], CARD_TOOLS)[0]?.cards).toEqual([]);
  });
});
