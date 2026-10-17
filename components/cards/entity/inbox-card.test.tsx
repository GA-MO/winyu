import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { connectorCard } from "./reference";

const InboxCard = connectorCard("inbox");
const MATTER_ROW = { kind_label: "เรื่องที่ส่งมา", title: "ความผิดปกติที่ต้องดู · อีสานรุ่งโรจน์ ค้าส่ง", hero: "อีสานรุ่งโรจน์ ค้าส่ง · ปริมาณขายเข้า −89%", from_name: "คุณอนุชา พรหมศรี", ask: "ช่วยเข้าตรวจเยี่ยมร้าน", path: "/s/77wd11SpRUjK" };
const LEAVE_ROW = { kind_label: "ใบลา", title: "ลาพักร้อน", from_name: "คุณนก สุขสวัสดิ์", path: "https://example.com/phish" };

let root: Root | null = null;
let host: HTMLElement | null = null;

async function draw(rows: unknown[]): Promise<HTMLElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<InboxCard result={{ ok: true, summary: "มี 2 รายการ", rows, provenance: { sourceSystem: "Inbox", asOf: "2026-11-26", masked: [] } }} />));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("the inbox card (AI-297)", () => {
  test("a matter's row opens the matter, shows its figure, and never prints its path as a column; a path that is not a matter's page is no link", async () => {
    const card = await draw([MATTER_ROW, LEAVE_ROW]);
    const links = [...card.querySelectorAll("a")].map((link) => link.getAttribute("href"));
    expect(links).toEqual(["/s/77wd11SpRUjK"]);
    expect(card.textContent).toContain("−89%");
    expect(card.textContent).not.toContain("/s/77wd11SpRUjK");
    expect(card.textContent).not.toContain("example.com");
  });
});
