import { describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { shareTitle, type ShareReceipt, type ShareTarget } from "@/lib/share/card";
import { ShareProvider, ShareSent, useShareCard } from "./share-sheet";

const BY_LINE: ShareReceipt = { userId: "u_krit", name: "คุณกฤต จันทร์เสน", asked: "line", via: "line", fallback: null };
const BY_EMAIL: ShareReceipt = { userId: "u_may", name: "คุณเมย์ กิตติศักดิ์", asked: "email", via: "email", fallback: null };
const FELL_BACK: ShareReceipt = { userId: "u_anucha", name: "คุณอนุชา พรหมศรี", asked: "teams", via: "email", fallback: "no-teams-conversation" };

function sent(receipts: ShareReceipt[]): string {
  return renderToStaticMarkup(<ShareSent receipts={receipts} grants={[]} days={null} path="/s/abc" close={() => undefined} />);
}

describe("the share sheet's receipts", () => {
  test("say the mail is in the demo Outbox when someone was reached by email, picked or fallen back to", () => {
    for (const receipts of [[BY_EMAIL], [BY_LINE, FELL_BACK]]) {
      const html = sent(receipts);
      expect(html).toContain('href="/outbox"');
      expect(html).toContain(TH.outbox.viewLink);
      expect(html).toContain(TH.outbox.demoNote);
    }
  });

  test("say nothing about the Outbox when no mail went out", () => {
    expect(sent([BY_LINE])).not.toContain(TH.outbox.viewLink);
  });
});

describe("the sheet's drafted ask", () => {
  const CARD = { kind: "tool" as const, reads: [{ tool: "query_metric", input: { metric: "net_sales_volume" } }] };

  async function openedAsk(target: ShareTarget): Promise<string | undefined> {
    const spy = spyOn(globalThis, "fetch").mockImplementation((async () => Response.json({ contacts: [], mayGrant: false, userId: null })) as unknown as typeof fetch);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    function Opener() {
      const share = useShareCard();
      return (
        <button type="button" data-open onClick={() => share?.(target)}>
          open
        </button>
      );
    }
    await act(async () =>
      root.render(
        <ShareProvider open>
          <Opener />
        </ShareProvider>,
      ),
    );
    await act(async () => host.querySelector<HTMLButtonElement>("[data-open]")?.click());
    const value = host.querySelector<HTMLInputElement>("[data-share-ask]")?.value;
    await act(async () => root.unmount());
    host.remove();
    spy.mockRestore();
    return value;
  }

  test("is the story's headline when the card comes from a morning story, and the generic line otherwise", async () => {
    const headline = "ยอดขายเข้าภาคอีสานต่ำกว่าเป้า 18%";
    expect(await openedAsk({ card: CARD, question: null, draftAsk: headline })).toBe(headline);
    expect(await openedAsk({ card: CARD, question: null })).toBe(TH.share.askDraft(shareTitle(CARD)));
  });
});

describe("the sheet before sending", () => {
  const AR_CARD = { kind: "tool" as const, reads: [{ tool: "query_metric", input: { metric: "ar_overdue", dims: ["region"] } }] };
  const KRIT = { id: "u_krit", nameTh: "คุณกฤต จันทร์เสน", title: "พนักงานขาย ขอนแก่น", role: "sales_rep" as const, region: "northeast" as const, photo: null, name: "Krit Jansen", channels: [{ channel: "email" as const, ready: true }] };
  const MASKED = { userId: "u_krit", name: KRIT.nameTh, metric: "ar_overdue", hidden: "masked", grantable: false };

  type Sent = { url: string; body: Record<string, unknown> };
  type Sheet = { host: HTMLElement; sent: Sent[]; root: Root; close: () => Promise<void> };

  function reply(url: string, scopes: unknown[]): unknown {
    if (url.endsWith("/contacts")) return { contacts: [KRIT], mayGrant: true };
    if (url.endsWith("/suggestion")) return { userId: "u_krit" };
    if (url.endsWith("/scopes")) return { scopes };
    return { receipts: [], grants: [], hidden: [], path: "/s/abc" };
  }

  async function settle(): Promise<void> {
    for (let tick = 0; tick < 5; tick += 1) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }

  async function openSheet(scopes: unknown[]): Promise<Sheet> {
    const sent: Sent[] = [];
    const spy = spyOn(globalThis, "fetch").mockImplementation((async (input: string, init?: RequestInit) => {
      sent.push({ url: input, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {} });
      return Response.json(reply(input, scopes));
    }) as unknown as typeof fetch);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    function Opener() {
      const share = useShareCard();
      return (
        <button type="button" data-open onClick={() => share?.({ card: AR_CARD, question: null })}>
          open
        </button>
      );
    }
    await act(async () =>
      root.render(
        <ShareProvider open>
          <Opener />
        </ShareProvider>,
      ),
    );
    await act(async () => host.querySelector<HTMLButtonElement>("[data-open]")?.click());
    await settle();
    const close = async () => {
      await act(async () => root.unmount());
      host.remove();
      spy.mockRestore();
    };
    return { host, sent, root, close };
  }

  test("warns, per recipient, when the card would reach them masked", async () => {
    const sheet = await openSheet([MASKED]);
    expect(sheet.host.querySelector("[data-share-hidden]")?.textContent).toContain(TH.share.recipientHidden.masked(KRIT.nameTh, metricLabel("ar_overdue")));
    expect(sheet.sent.find((call) => call.url.endsWith("/scopes"))?.body.recipients).toEqual(["u_krit"]);
    await sheet.close();
  });

  test("sends the urgency the sender chose, today by default for an ask", async () => {
    const sheet = await openSheet([]);
    const checked = () => sheet.host.querySelector('[data-share-urgency] [aria-checked="true"]')?.getAttribute("data-urgency");
    expect(checked()).toBe("today");
    await act(async () => sheet.host.querySelector<HTMLButtonElement>('[data-urgency="this_week"]')?.click());
    expect(checked()).toBe("this_week");
    await act(async () => sheet.host.querySelector<HTMLButtonElement>("[data-share-send]")?.click());
    await settle();
    expect(sheet.sent.find((call) => call.url === "/api/shares")?.body.urgency).toBe("this_week");
    await sheet.close();
  });

  test("offers the grant when the sender may open what is hidden, and says nothing when nothing is", async () => {
    const grantable = await openSheet([{ ...MASKED, hidden: "rows", grantable: true }]);
    expect(grantable.host.querySelector("[data-share-grant]")?.textContent).toBe(TH.share.grantToShow);
    await grantable.close();
    const clear = await openSheet([]);
    expect(clear.host.querySelector("[data-share-hidden]")).toBeNull();
    await clear.close();
  });
});
