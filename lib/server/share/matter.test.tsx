import { afterEach, describe, expect, mock, setDefaultTimeout, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { metricQuerySchema, type EvidenceAnswer } from "@/lib/contracts";

setDefaultTimeout(30_000);

let signedIn: string | null = null;

const { sessionCookie } = await import("@/lib/server/auth/session-token");
mock.module("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (signedIn ? { name, value: sessionCookie({ via: "demo", userId: signedIn }).value } : undefined) }),
}));

const { POST } = await import("@/app/api/shares/route");
const { liveAccessFor, setHandoffEnabled, toolsFor } = await import("@/lib/access/enforce");
const { findUser } = await import("@/lib/data/entities/users");
const { inboxCountsFor } = await import("@/lib/server/inbox");
const { notificationsOf } = await import("@/lib/server/notify");
const { outbox } = await import("@/lib/server/agent/collections");
const { MODEL_CALLS_COLLECTION } = await import("@/lib/server/model-ledger");
const { collection } = await import("@/lib/server/store/json-store");
const { runWithAccess } = await import("@/lib/server/request-context");
const { winyuTools } = await import("@/lib/server/agent/tools");
const { SHARES_COLLECTION, shares } = await import("./shares");
const { createShare } = await import("./deliver");
const { suggestedRecipient, suggestionsFor } = await import("./suggest");
const { AGENTS } = await import("@/lib/data/entities/agents");
const { ShareChrome, ShareProvider } = await import("@/components/share/share-sheet");
const { StoryItem } = await import("@/components/stories/story-list");
const { Card } = await import("@/components/ui/primitives");
const { TH } = await import("@/lib/i18n/th");
const { shareTitle } = await import("@/lib/share/card");

const NORTHEAST_QUERY = { metric: "net_sales_volume", dims: ["agent"], filters: { region: ["northeast"] }, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "day", compare: "target", limit: null, sort: "delta_asc", where: null };
const AGENT_QUERY = { metric: "net_sales_value", dims: ["week"], filters: { agent: ["ag_nea_05"] }, range: { from: "2026-06-30", to: "2026-09-22" }, grain: "week", compare: "none", limit: 12, sort: null };
const NORTHEAST_CARD = { kind: "tool" as const, reads: [{ tool: "query_metric", input: NORTHEAST_QUERY }] };
const ASK = "ช่วยดูยอดขายเข้าภาคอีสานหน่อย";
const SHARE_URL = "http://localhost/api/shares";

function user(id: string) {
  const found = findUser(id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

function postShare(body: unknown) {
  return POST(new Request(SHARE_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}

function actBody(recipient: string) {
  return { card: NORTHEAST_CARD, question: null, ask: ASK, intent: "act", recipients: [{ userId: recipient, channel: "winyu" }] };
}

function cardWithPill(open: boolean): string {
  const target = { card: NORTHEAST_CARD, question: null };
  return renderToStaticMarkup(
    <ShareProvider open={open}>
      <ShareChrome target={target}>
        <Card props={{ title: "ยอดขาย" }} />
      </ShareChrome>
    </ShareProvider>,
  );
}

afterEach(() => {
  signedIn = null;
  setHandoffEnabled(true, "test");
});

describe("a share stored before matters loads as a matter", () => {
  test("an older record reads as for information, open, one hop to its recipient, an empty thread, and its note as the ask", () => {
    const legacy = { id: "legacyshare1", at: "2026-10-01T03:00:00.000Z", senderId: "u_thana", title: "ยอดขาย", question: null, note: "ดูหน่อย", card: NORTHEAST_CARD, deliveries: [{ userId: "u_anucha", asked: "email", via: "email", fallback: null }], openedBy: [], lastViewedAt: null };
    collection<typeof legacy>(SHARES_COLLECTION).put(legacy);

    expect(shares().get(legacy.id)).toMatchObject({
      intent: "fyi",
      status: "open",
      ask: "ดูหน่อย",
      goal: null,
      thread: [],
      path: [{ userId: "u_anucha", fromUserId: "u_thana", at: legacy.at, state: "sent" }],
      updatedAt: legacy.at,
    });
  });
});

describe("a matter that asks for an answer waits on its recipient", () => {
  test("sending one raises the recipient's decisions by one, leaves the sender's as they were, and tells the recipient in Winyu only", async () => {
    const recipientBefore = inboxCountsFor("u_anucha");
    const senderBefore = inboxCountsFor("u_thana");
    const mailBefore = outbox().all().length;

    const outcome = await createShare(user("u_thana"), { card: NORTHEAST_CARD, question: null, ask: ASK, intent: "act", recipients: [{ userId: "u_anucha", channel: "winyu" }] });
    if (!outcome.ok) throw new Error(outcome.error);

    expect(inboxCountsFor("u_anucha")).toEqual({ ...recipientBefore, decisions: recipientBefore.decisions + 1 });
    expect(inboxCountsFor("u_thana")).toEqual(senderBefore);
    expect(outbox().all().length).toBe(mailBefore);
    expect(notificationsOf("u_anucha")[0]).toMatchObject({ kind: "matter", refId: outcome.share.id, fromUserId: "u_thana", read: false });
    expect(outcome.share).toMatchObject({ intent: "act", status: "open", ask: ASK, path: [{ userId: "u_anucha", fromUserId: "u_thana", state: "sent" }] });
  });

  test("one for information counts on Shared, not in decisions", async () => {
    const before = inboxCountsFor("u_krit");
    const outcome = await createShare(user("u_thana"), { card: NORTHEAST_CARD, question: null, ask: "", intent: "fyi", recipients: [{ userId: "u_krit", channel: "winyu" }] });
    if (!outcome.ok) throw new Error(outcome.error);

    expect(inboxCountsFor("u_krit")).toEqual({ decisions: before.decisions, sharedUnread: before.sharedUnread + 1 });
  });

  test("sending from the sheet's route makes no model call", async () => {
    const calls = collection(MODEL_CALLS_COLLECTION);
    const before = calls.all().length;
    signedIn = "u_thana";

    const response = await postShare(actBody("u_anucha"));

    expect(response.status).toBe(200);
    expect(calls.all().length).toBe(before);
  });
});

describe("the sheet puts the card's owner first", () => {
  test("a northeast card goes to the northeast RSM, and so does a card about one northeast agent", () => {
    expect(suggestedRecipient(NORTHEAST_CARD, "u_thana")?.userId).toBe("u_anucha");
    expect(suggestedRecipient({ kind: "tool", reads: [{ tool: "query_metric", input: AGENT_QUERY }] }, "u_thana")?.userId).toBe("u_anucha");
  });

  test("the owner is never suggested to themselves", () => {
    expect(suggestedRecipient(NORTHEAST_CARD, "u_anucha")).toBeNull();
  });

  test("a rep's card about four northeast agents goes to the northeast RSM, not the national director", () => {
    const fourAgents = { metric: "net_sales_volume", dims: ["agent"], filters: { agent: ["ขอนแก่นมหาชัย", "อีสานรุ่งโรจน์ ค้าส่ง", "โคราชสหภัณฑ์", "อุบลศรีสุข เทรดดิ้ง"] }, range: { from: "2026-11-01", to: "2026-11-26" }, grain: "month", compare: "target", limit: null };
    const card = { kind: "tool" as const, reads: [{ tool: "query_metric", input: fourAgents }] };
    expect(suggestedRecipient(card, "u_krit")?.userId).toBe("u_anucha");
    const suggestions = suggestionsFor(card, "u_krit");
    expect(suggestions.ownerId).toBe("u_anucha");
    expect(suggestions.line).not.toContain("u_prasit");
  });

  test("a card on one agent's overdue debt goes to the rep who holds that agent", () => {
    const debt = { metric: "ar_overdue", dims: ["agent"], filters: { agent: "ag_nea_05" }, period: "this_month", grain: "month", compare: "none", limit: 1, range: null };
    const holder = AGENTS.find((agent) => agent.id === "ag_nea_05")?.ownerId;
    expect(suggestedRecipient({ kind: "tool", reads: [{ tool: "query_metric", input: debt }] }, "u_anucha")?.userId).toBe(holder ?? "missing");
  });

  test("when the card is the sender's own, the sheet offers their own team first and preselects nobody", () => {
    const suggestions = suggestionsFor(NORTHEAST_CARD, "u_anucha");
    expect(suggestions.ownerId).toBeNull();
    expect(suggestions.line.slice(0, 2).sort()).toEqual(["u_krit", "u_nok"]);
    expect(suggestions.line).toContain("u_prasit");
    expect(suggestions.line.indexOf("u_prasit")).toBeGreaterThan(suggestions.line.indexOf("u_nok"));
  });

  test("a regional sender's card that names no region is the sender's region", () => {
    const noRegion = { ...NORTHEAST_QUERY, filters: {} };
    expect(suggestionsFor({ kind: "tool", reads: [{ tool: "query_metric", input: noRegion }] }, "u_krit").ownerId).toBe("u_anucha");
  });
});

describe("the admin's switch closes every way to send", () => {
  test("with sending work off, the card has no ส่งต่อ pill, the route refuses, and the chat has no share_card", async () => {
    expect(cardWithPill(true)).toContain(TH.share.button);
    expect(toolsFor(liveAccessFor(user("u_thana")))).toContain("share_card");

    setHandoffEnabled(false, "test");
    signedIn = "u_thana";
    const stored = shares().all().length;

    expect(cardWithPill(false)).not.toContain(TH.share.button);
    expect((await postShare(actBody("u_anucha"))).status).toBe(403);
    expect(shares().all().length).toBe(stored);
    expect(toolsFor(liveAccessFor(user("u_thana")))).not.toContain("share_card");
  });
});

describe("the morning story card offers ส่งต่อ", () => {
  test("an opened story's evidence card carries the pill, labelled with the card it sends", async () => {
    const queryMetric = winyuTools().query_metric;
    const evidence = await runWithAccess(liveAccessFor(user("u_thana")), () => queryMetric.execute(queryMetric.inputSchema().parse(NORTHEAST_QUERY)));
    const story = { id: "st_northeast", kind: "urgent" as const, finding: "ยอดขายเข้าภาคอีสานต่ำกว่าเป้า", scope: "ภาคอีสาน", subject: { metric: "net_sales_volume" as const, region: "northeast" as const }, evidence: { title: "ช่องว่างยอดขายเข้าภาคอีสานแยกตามเอเย่นต์", query: metricQuerySchema.parse(NORTHEAST_QUERY) }, ruledOut: [], action: null };

    const html = renderToStaticMarkup(
      <ShareProvider open>
        <StoryItem card={{ story, evidence: evidence as EvidenceAnswer }} defaultOpen />
      </ShareProvider>,
    );

    expect(html).toContain(`aria-label="${TH.share.buttonLabel(shareTitle(NORTHEAST_CARD))}"`);
    expect(html).toContain(TH.share.button);
  });

  test("its pill opens the sheet with the story's headline as the drafted ask", async () => {
    const queryMetric = winyuTools().query_metric;
    const evidence = await runWithAccess(liveAccessFor(user("u_thana")), () => queryMetric.execute(queryMetric.inputSchema().parse(NORTHEAST_QUERY)));
    const story = { id: "st_northeast", kind: "urgent" as const, finding: "ยอดขายเข้าภาคอีสานต่ำกว่าเป้า", scope: "ภาคอีสาน", subject: { metric: "net_sales_volume" as const, region: "northeast" as const }, evidence: { title: "ช่องว่างยอดขายเข้าภาคอีสานแยกตามเอเย่นต์", query: metricQuerySchema.parse(NORTHEAST_QUERY) }, ruledOut: [], action: null };
    const spy = spyOn(globalThis, "fetch").mockImplementation((async () => Response.json({ contacts: [], mayGrant: false, userId: null })) as unknown as typeof fetch);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(async () =>
      root.render(
        <ShareProvider open>
          <StoryItem card={{ story, evidence: evidence as EvidenceAnswer }} defaultOpen />
        </ShareProvider>,
      ),
    );
    await act(async () => host.querySelector<HTMLButtonElement>(`button[aria-label="${TH.share.buttonLabel(shareTitle(NORTHEAST_CARD))}"]`)?.click());
    const ask = host.querySelector<HTMLInputElement>("[data-share-ask]")?.value;
    await act(async () => root.unmount());
    host.remove();
    spy.mockRestore();

    expect(ask).toBe(story.finding);
  });
});
