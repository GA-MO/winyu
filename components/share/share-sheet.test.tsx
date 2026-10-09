import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TH } from "@/lib/i18n/th";
import type { ShareReceipt } from "@/lib/share/card";
import { ShareSent } from "./share-sheet";

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
