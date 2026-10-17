import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TH } from "@/lib/i18n/th";
import type { MatterActionKind, MatterBrief } from "@/lib/share/matter-actions";
import { MatterActions } from "./matter-actions";

type Brief = Pick<MatterBrief, "code" | "actions" | "suggested" | "judges" | "sent">;

let mounted: { root: Root; host: HTMLElement } | null = null;

afterEach(() => {
  if (mounted) act(() => mounted?.root.unmount());
  mounted?.host.remove();
  mounted = null;
});

function briefOf(actions: MatterActionKind[], sent: boolean): Brief {
  return { code: "M1", actions, suggested: { ownerId: null, line: [] }, judges: false, sent };
}

function buttonNamed(host: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll("button")].find((button) => button.textContent?.trim() === name);
}

async function drawn(brief: Brief, onActed: (kind: MatterActionKind) => void = () => undefined): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted = { root, host };
  await act(async () => root.render(<MatterActions brief={brief} onActed={onActed} />));
  return host;
}

describe("matter actions", () => {
  test("the sender closes their own matter with a secondary ปิดเรื่อง that asks once before it closes it for everyone (AI-194)", async () => {
    const posted: string[] = [];
    const spy = spyOn(globalThis, "fetch").mockImplementation((async (_url: string, init?: RequestInit) => {
      posted.push(String(init?.body ?? ""));
      return Response.json({ ok: true });
    }) as unknown as typeof fetch);
    const host = await drawn(briefOf(["done"], true));
    expect(buttonNamed(host, TH.matter.actions.done)).toBeUndefined();
    const close = buttonNamed(host, TH.matter.closeMatter);
    expect(close).toBeDefined();
    expect(close?.className ?? "").not.toContain("bg-ink");
    await act(async () => close?.click());
    expect(posted).toHaveLength(0);
    expect(host.textContent).toContain(TH.matter.closeConfirm);
    await act(async () => buttonNamed(host, TH.matter.closeMatter)?.click());
    spy.mockRestore();
    expect(posted).toEqual([JSON.stringify({ kind: "done" })]);
  });

  test("ส่งต่อ brings the picker and its button into view, and the button says it is working until the press lands (AI-245)", async () => {
    let answer: (response: Response) => void = () => undefined;
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (url: string) => {
      if (String(url).includes("/contacts")) return Response.json({ contacts: [{ id: "u_krit", nameTh: "คุณกฤต จันทร์เสน", title: "พนักงานขาย", role: "sales_rep", region: "northeast", photo: null, name: "Krit", channels: [] }], mayGrant: false });
      return new Promise<Response>((resolve) => (answer = resolve));
    }) as unknown as typeof fetch);
    const scrolled: string[] = [];
    const scrollSpy = spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) {
      scrolled.push(this.textContent ?? "");
    });
    const brief = { ...briefOf(["accept", "pass_on"], false), suggested: { ownerId: "u_krit", line: [] } };
    const host = await drawn(brief);
    await act(async () => buttonNamed(host, TH.matter.actions.pass_on)?.click());
    for (let tick = 0; tick < 3; tick += 1) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(scrolled.some((text) => text.includes("คุณกฤต จันทร์เสน") && text.includes(TH.matter.actions.pass_on))).toBe(true);
    await act(async () => buttonNamed(host, TH.matter.actions.pass_on)?.click());
    const working = buttonNamed(host, TH.matter.passingOn);
    expect(working?.disabled).toBe(true);
    await act(async () => answer(Response.json({ ok: true })));
    fetchSpy.mockRestore();
    scrollSpy.mockRestore();
  });
});
