import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TH } from "@/lib/i18n/th";
import { MemoryCard } from "./reference";

const FACT = { id: "f1", type: "responsibility", value: "ดูแลภาคอีสานเป็นหลัก", status: "known" };
const CONVERSATION = { threadId: "t_past", title: "อัตราการลาออกแต่ละฝ่าย", at: "2026-09-20T03:00:00.000Z", question: `ลาออกเกิน ${TH.memory.maskedNumber}% ฝ่ายไหน`, reply: "ฝ่ายขาย", queries: [], score: 0.9 };

let root: Root | null = null;
let host: HTMLElement | null = null;

async function draw(result: unknown): Promise<HTMLElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<MemoryCard result={result} />));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("MemoryCard", () => {
  test("lists recalled conversations under the facts, each linking to its thread", async () => {
    const card = await draw({ ok: true, summary: "จำได้", data: [FACT], conversations: [CONVERSATION] });
    expect(card.textContent).toContain(FACT.value);
    expect(card.textContent).toContain(TH.memory.conversationsHeading);
    expect(card.textContent).toContain(CONVERSATION.question);
    expect(card.querySelector("a")?.getAttribute("href")).toBe("/c/t_past");
  });

  test("a result recorded before conversations existed still draws its facts", async () => {
    const card = await draw({ ok: true, summary: "จำได้", data: [FACT] });
    expect(card.textContent).toContain(FACT.value);
    expect(card.textContent).not.toContain(TH.memory.conversationsHeading);
  });
});
