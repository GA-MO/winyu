import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TH } from "@/lib/i18n/th";
import type { ShareContact, ShareTarget } from "@/lib/share/card";
import { PeoplePicker, ShareProvider, useShareCard } from "./share-sheet";

const OWNER = "u_anucha";
const LINE = ["u_somsak", "u_prasit", "u_wee"];
const LONG_TITLE = "ปริมาณขายเข้า (Sell-in) · รายเอเย่นต์ · ภาคอีสาน";
const LONG_ASK = "ยอดขายเข้าจะปิดเดือนต่ำกว่าเป้า ช่องว่างส่วนใหญ่เกิดจากเอเย่นต์หลัก 2 รายที่น่าจะติดปัญหาเครดิต";
const TARGET: ShareTarget = { card: { kind: "tool", reads: [{ tool: "query_metric", input: { metric: "net_sales_volume", dims: ["agent"], filters: { region: ["northeast"] } } }] }, question: null, draftAsk: LONG_ASK };

let mounted: { root: Root; host: HTMLElement } | null = null;

function contact(id: string): ShareContact {
  return { id, nameTh: `คุณ ${id}`, title: "ตำแหน่ง", role: "sales_rsm", region: null, photo: null, name: id, channels: [{ channel: "email", ready: true }] };
}

async function mount(node: React.ReactNode): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted = { root, host };
  await act(async () => root.render(node));
  return host;
}

function groupHeaded(host: HTMLElement, heading: string): string[] {
  const section = [...host.querySelectorAll("section")].find((candidate) => candidate.querySelector("h3")?.textContent === heading);
  return section ? [...section.querySelectorAll("li")].map((item) => item.textContent ?? "") : [];
}

function Opener({ target }: { target: ShareTarget }) {
  const share = useShareCard();
  return <button type="button" data-open-sheet onClick={() => share?.(target)} />;
}

afterEach(async () => {
  if (!mounted) return;
  const { root, host } = mounted;
  await act(async () => root.unmount());
  host.remove();
  mounted = null;
});

describe("the share sheet (AI-155)", () => {
  test("'ผู้รับผิดชอบเรื่องนี้' lists the card's owner only; the sender's line has its own heading", async () => {
    const contacts = [OWNER, ...LINE, "u_krit"].map(contact);
    const host = await mount(<PeoplePicker contacts={contacts} suggested={{ ownerId: OWNER, line: LINE }} chosen={[OWNER]} onToggle={() => undefined} />);
    expect(groupHeaded(host, TH.share.suggested)).toEqual([expect.stringContaining(OWNER)]);
    const line = groupHeaded(host, TH.share.yourLine);
    expect(line).toHaveLength(LINE.length);
    for (const id of LINE) expect(line.some((text) => text.includes(id))).toBe(true);
  });

  test("the card's title and the drafted ask are shown whole on a phone: neither is cut to one line", async () => {
    const spy = spyOn(globalThis, "fetch").mockImplementation((async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/preview")) return Response.json({ ownerId: OWNER, line: [], title: LONG_TITLE, figures: null, goal: null });
      return Response.json({ contacts: [contact(OWNER)], mayGrant: false });
    }) as typeof fetch);
    const host = await mount(
      <ShareProvider open>
        <Opener target={TARGET} />
      </ShareProvider>,
    );
    await act(async () => host.querySelector<HTMLButtonElement>("[data-open-sheet]")?.click());
    await act(async () => undefined);
    spy.mockRestore();

    const ask = host.querySelector<HTMLTextAreaElement | HTMLInputElement>("[data-share-ask]");
    expect(ask?.tagName).toBe("TEXTAREA");
    expect(ask?.value).toBe(LONG_ASK);
    const title = [...host.querySelectorAll("[data-share-sheet] header p")].find((node) => node.textContent === LONG_TITLE);
    expect(title).toBeDefined();
    expect(title?.className ?? "").not.toContain("truncate");
  });
});
