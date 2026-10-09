import { describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ShareScope } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { GRANT_REQUEST_ANCHOR } from "@/lib/share/grant-label";
import { ShareScopeNotice, type SentRequest } from "./share-scope-notice";
import { readsForScope, scopeAfterRequest } from "./shared-body";
import type { FreshReadView } from "./shared-card-view";

const SCOPE: ShareScope = { hidden: { metric: "net_sales_value", regions: ["bkk"], brands: "all" }, grant: null, pendingRequest: null, requestable: true };
const LOCKED_READ: FreshReadView = { toolCallId: "t1", tool: "query_metric", input: {}, result: null, locked: { dim: "region", labels: ["กรุงเทพฯ"], askHref: `#${GRANT_REQUEST_ANCHOR}` } };
const PLAIN_READ: FreshReadView = { toolCallId: "t2", tool: "get_person", input: {}, result: null, locked: null };
const SENT: SentRequest = { id: "req1", approverName: "คุณธนา วงศ์สกุล" };

describe("asking for what a shared card hides updates the page in place", () => {
  test("while a request can be made the locked rows keep ขอดู; once asked they lose it and the notice says who approves", () => {
    expect(readsForScope([LOCKED_READ, PLAIN_READ], SCOPE)[0].locked?.askHref).toBe(`#${GRANT_REQUEST_ANCHOR}`);
    const asked = scopeAfterRequest(SCOPE, SENT);
    expect(asked).toMatchObject({ pendingRequest: SENT, requestable: false });
    expect(readsForScope([LOCKED_READ, PLAIN_READ], asked)).toEqual([{ ...LOCKED_READ, locked: { ...LOCKED_READ.locked, askHref: null } as FreshReadView["locked"] }, PLAIN_READ]);
  });

  test("the request button hands the sent request up and the notice then shows it pending, with no button left", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let scope = SCOPE;
    const render = () => root.render(<ShareScopeNotice scope={scope} shareCode="code1" senderName="คุณธนา" onRequested={(request) => { scope = scopeAfterRequest(scope, request); render(); }} />);
    const post = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(SENT));
    await act(async () => render());
    const open = [...host.querySelectorAll("button")].find((button) => button.textContent === TH.grant.request);
    await act(async () => open?.click());
    const send = [...host.querySelectorAll("button")].find((button) => button.textContent === TH.grant.request);
    await act(async () => send?.click());
    post.mockRestore();
    expect(host.textContent).toContain(TH.grant.pending(SENT.approverName));
    expect([...host.querySelectorAll("button")].some((button) => button.textContent === TH.grant.request)).toBe(false);
    await act(async () => root.unmount());
    host.remove();
  });
});
