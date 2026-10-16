import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { liveAccessFor } from "@/lib/access/enforce";
import { runWithTurn } from "@/lib/server/request-context";
import { shares } from "@/lib/server/share/shares";
import { approvedCallId } from "@/scripts/approved-call";
import { renderToStaticMarkup } from "react-dom/server";
import { accessFor } from "@/lib/access/policies";
import type { NextAction } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess } from "@/lib/server/request-context";
import { drawsNoCard } from "@/components/chat/tool-view";
import { DataCard } from "./data-card";

setDefaultTimeout(60_000);

type Refusal = { ok: false; code: string; error: string; nextActions?: NextAction[] };

async function askAs(userId: string, filters: Record<string, string[]>): Promise<Refusal> {
  const user = findUser(userId);
  if (!user) throw new Error(`no ${userId}`);
  const input = { metric: "net_sales_volume", dims: ["region"], filters, range: null, grain: "month", compare: "none", limit: 10, period: "this_month" };
  return runWithAccess(accessFor(user), () => winyuTools().query_metric.execute(input) as Promise<Refusal>);
}

describe("a refusal for another region", () => {
  test("offers to ask whoever may grant it for a temporary grant, even with no lapsed grant, and the card draws that button", async () => {
    const refused = await askAs("u_krit", { region: ["north"] });
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe("PERMISSION_DENIED");
    const [request] = refused.nextActions ?? [];
    expect(request?.kind).toBe("request_access");
    expect(request?.tool).toBe("send_card");
    expect(String((request?.input as { ask?: string } | null)?.ask)).toContain(TH.region.north);
    expect(drawsNoCard(refused)).toBe(false);
    const html = renderToStaticMarkup(<DataCard title="ยอดขายเข้าภาคเหนือ" source={refused} />);
    expect(html).toContain(refused.error);
    expect(html).toContain(request?.label ?? "missing");
  });

  test("pressing it and approving the send sheet lands the refused question in the approver's bell as a matter", async () => {
    const refused = await askAs("u_krit", { region: ["north"] });
    const [request] = refused.nextActions ?? [];
    const krit = findUser("u_krit");
    if (!krit || !request) throw new Error("no request offered");
    const turn = { turnId: randomUUID(), threadId: null, question: "ขอสิทธิ์", queries: [], cardToSend: async () => null };
    const sent = (await runWithAccess(liveAccessFor(krit), () => runWithTurn(turn, () => winyuTools().send_card.execute(request.input, { toolCallId: approvedCallId(krit.id, "send_card") })))) as { ok: boolean; error?: string; data?: { code: string } };
    expect(sent.error).toBeUndefined();
    const matter = sent.data ? shares().get(sent.data.code) : null;
    expect(matter?.senderId).toBe("u_krit");
    expect(matter?.ask).toContain(TH.region.north);
    if (sent.data) shares().remove(sent.data.code);
  });
});
