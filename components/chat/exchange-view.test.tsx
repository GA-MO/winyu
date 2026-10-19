import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ExchangeLive } from "./exchange-view";

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
const NORTHEAST = { metric: "net_sales_value", dims: ["agent"], grain: "month", range: { from: "2026-11-01", to: "2026-11-26" }, compare: "target", filters: { region: ["northeast"] }, sort: null, limit: null };

async function deniedForRsm(): Promise<unknown> {
  const rsm = findUser("u_anucha");
  if (!rsm) throw new Error("no u_anucha");
  return runWithAccess(liveAccessFor(rsm), () => winyuTools().query_metric.execute(SOUTH, { toolCallId: "denied-south" }));
}

function live(isLast: boolean): ExchangeLive {
  return { isLast, running: false, asked: [], waiting: new Set<string>(), decisions: {}, left: new Set<string>(), decide: () => {}, stopped: false, error: null, slow: false, retry: null, requestedCourses: new Set<string>(), onScreen: null, toolLabels: {}, durationMs: null };
}

describe("a card in an exchange that is already sending", () => {
  test("drops its own send button while the reply raises a send, so no rival recipient is offered beside the approval (AI-252)", async () => {
    const ceo = findUser("u_thana");
    if (!ceo) throw new Error("no u_thana");
    const result = await runWithAccess(liveAccessFor(ceo), () => winyuTools().query_metric.execute(NORTHEAST, { toolCallId: "isan" }));
    const sendLabel = (result as { nextActions: { kind: string; label: string }[] }).nextActions.find((action) => action.kind === "send")?.label ?? "missing";
    expect(sendLabel).toBe("ส่งให้คุณอนุชา");
    const read = { kind: "tool" as const, toolCallId: "isan", name: "query_metric", args: NORTHEAST, outcome: { state: "returned" as const, result } };
    const send = { kind: "tool" as const, toolCallId: "send", name: "send_card", args: { to: ["u_saranya"], ask: "ช่วยตามเรื่องนี้" }, outcome: { state: "pending" as const } };
    const drawn = (steps: (typeof read | typeof send)[]) =>
      renderToStaticMarkup(
        <ShareProvider open>
          <ExchangeView exchange={{ id: "q2", question: { kind: "typed", text: "ส่งเรื่องนี้ให้ผู้จัดการขายภาคใต้" }, steps }} live={{ ...live(true), waiting: new Set(["send"]) }} />
        </ShareProvider>,
      );
    expect(drawn([read])).toContain(sendLabel);
    expect(drawn([read, send])).not.toContain(sendLabel);
  });
});

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

describe("a reply that takes long or fails", () => {
  const asked = { id: "q-slow", question: { kind: "typed" as const, text: "ยอดขายเดือนนี้" }, steps: [] };

  function drawn(live: ExchangeLive) {
    return renderToStaticMarkup(
      <ShareProvider open>
        <ExchangeView exchange={asked} live={live} />
      </ShareProvider>,
    );
  }

  function liveOf(overrides: Partial<ExchangeLive>): ExchangeLive {
    return { ...live(true), ...overrides };
  }

  test("while it runs with nothing new on screen, the trail says calmly that it is taking longer than usual", () => {
    expect(drawn(liveOf({ running: true, slow: true }))).toContain(TH.trail.slow);
    expect(drawn(liveOf({ running: true, slow: false }))).not.toContain(TH.trail.slow);
  });

  test("once the server gives up, a clear failure line with an ask-again button; none when asking again cannot help", () => {
    const failed = drawn(liveOf({ error: TH.conversation.timedOut, retry: () => {} }));
    expect(failed).toContain(TH.conversation.timedOut);
    expect(failed).toContain(TH.conversation.retry);
    const signedOut = drawn(liveOf({ error: TH.conversation.signedOut, retry: null }));
    expect(signedOut).toContain(TH.conversation.signedOut);
    expect(signedOut).not.toContain(TH.conversation.retry);
  });

  test("a question a reload finds without an answer can be asked again in place", () => {
    const unanswered = drawn(liveOf({ retry: () => {} }));
    expect(unanswered).toContain(TH.chat.unanswered);
    expect(unanswered).toContain(TH.conversation.retry);
  });
});
