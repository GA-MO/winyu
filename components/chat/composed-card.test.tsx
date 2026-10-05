import { describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CardActionsProvider, type CardAction } from "@/components/cards/card-actions";
import { accessFor } from "@/lib/access/policies";
import { GEMINI_TEAM_CARD } from "@/lib/compose/gemini-team-card";
import { findUser } from "@/lib/data/entities/users";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess, runWithTurn, type TurnContext } from "@/lib/server/request-context";
import { ComposedCardView } from "./composed-card";

const PEOPLE_INPUT = { manager: "u_anucha", region: null, department: null, query: null, flag: null };
const PERSON_INPUT = { id: "u_anucha", name: "" };

/** One CEO chat turn: the two people reads, then compose_card with the given components, all through the gateway. */
async function composeAsCeo(components: unknown[]): Promise<unknown> {
  const user = findUser("u_thana");
  if (!user) throw new Error("no CEO");
  const tools = winyuTools();
  const turn: TurnContext = { turnId: "turn-test", threadId: null, preloadPacketId: null, question: "ใครดูแลภาคอีสาน", queries: [] };
  const call = (name: string, input: unknown) => tools[name].execute(tools[name].inputSchema().parse(input));
  return runWithAccess(accessFor(user), () =>
    runWithTurn(turn, async () => {
      await call("find_people", PEOPLE_INPUT);
      await call("get_person", PERSON_INPUT);
      return call("compose_card", { components });
    }),
  );
}

async function draw(result: unknown): Promise<{ host: HTMLElement; pressed: CardAction[] }> {
  const pressed: CardAction[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  await act(async () => {
    createRoot(host).render(
      <CardActionsProvider value={{ runAction: (action) => pressed.push(action) }}>
        <ComposedCardView result={result} />
      </CardActionsProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return { host, pressed };
}

describe("a card the model composes", () => {
  test("draws the leader and his five reports from the turn's results, and a row press asks for that person's profile", async () => {
    const { host, pressed } = await draw(await composeAsCeo(GEMINI_TEAM_CARD));
    const text = host.textContent ?? "";
    expect(text).toContain("ผู้ดูแลและทีมขายภาคอีสาน");
    for (const name of ["คุณอนุชา พรหมศรี", "คุณกฤต จันทร์เสน", "คุณนก สุขสวัสดิ์", "คุณป้อง แสนสุข", "คุณท็อป บุญยืน", "คุณแนน ภูมิพัฒน์"]) expect(text).toContain(name);
    expect(text).not.toContain("คุณจอย");
    const row = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("คุณป้อง แสนสุข"));
    await act(async () => row?.click());
    expect(pressed).toEqual([expect.objectContaining({ kind: "ask", prompt: "ขอดูโปรไฟล์ คุณป้อง แสนสุข" })]);
  });

  test("a composition with an invented number is refused by the tool and draws nothing", async () => {
    const invented = GEMINI_TEAM_CARD.map((component) => (component.id === "root" ? { ...component, meta: "ทีม 4821 คน" } : component));
    const result = await composeAsCeo(invented);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("4821") });
    const { host } = await draw(result);
    expect(host.textContent).not.toContain("4821");
  });
});
