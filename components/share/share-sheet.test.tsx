import { describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
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
