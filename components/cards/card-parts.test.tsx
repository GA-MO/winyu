import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CardParts } from "@/lib/cards/present";
import { CardPartsView } from "./card-parts";

const mounted: Root[] = [];

const RSM_CLOSE: CardParts = {
  title: "มูลค่าขายเข้า",
  style: "scorecard",
  verdict: "คาดปิดเดือนไม่ถึงเป้า",
  hero: { label: "คาดปิดเดือน", value: "87.5%", unit: "ของเป้าทั้งเดือน", delta: null, trend: "down", tone: "bad", detail: null },
  tiles: [
    { label: "ทำได้แล้ว", value: "77.3%", delta: null, tone: "neutral", sub: "ของเป้าทั้งเดือน" },
    { label: "คาดว่าขาด", value: "52.9 ล้านบาท", delta: null, tone: "neutral", sub: "ณ สิ้นเดือน" },
  ],
  body: { kind: "none" },
  primary: null,
  more: [],
  footer: null,
  denied: null,
};

function render(parts: CardParts): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => root.render(<CardPartsView parts={parts} />));
  return host;
}

afterEach(() => {
  for (const root of mounted.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("a money tile keeps its number and unit on one line (AI-306)", () => {
  test("the RSM's 52.9 ล้านบาท shortfall is one unbreakable run: the number, then its unit set smaller beside it", () => {
    const host = render(RSM_CLOSE);
    const value = [...host.querySelectorAll("dd")].find((node) => node.textContent === "52.9 ล้านบาท");
    if (!value) throw new Error("no tile value");
    expect(value.className).toContain("whitespace-nowrap");
    expect(value.className).not.toContain("break-words");
    expect([...value.querySelectorAll("span")].map((span) => span.textContent)).toEqual(["ล้านบาท"]);
  });

  test("a percent tile has no unit to set apart", () => {
    const host = render(RSM_CLOSE);
    const value = [...host.querySelectorAll("dd")].find((node) => node.textContent === "77.3%");
    expect(value?.querySelectorAll("span").length).toBe(0);
  });
});
