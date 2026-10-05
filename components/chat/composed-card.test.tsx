import { describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CardActionsProvider, type CardAction } from "@/components/cards/card-actions";
import { accessFor } from "@/lib/access/policies";
import type { ComposedSurface } from "@/lib/compose/catalog";
import { CardComposer } from "@/lib/compose/composer";
import { GEMINI_TEAM_CARD } from "@/lib/compose/gemini-team-card";
import type { TurnResult } from "@/lib/compose/ground";
import { findUser } from "@/lib/data/entities/users";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess } from "@/lib/server/request-context";
import { ComposedCardView } from "./composed-card";

const PEOPLE_INPUT = { manager: "u_anucha", region: null, department: null, query: null, flag: null };
const PERSON_INPUT = { id: "u_anucha", name: "" };
const SURFACE_ID = "card-test";
const TEAM = ["คุณกฤต จันทร์เสน", "คุณนก สุขสวัสดิ์", "คุณป้อง แสนสุข", "คุณท็อป บุญยืน", "คุณแนน ภูมิพัฒน์"];

/** The CEO's two people reads, run through the gateway as the chat would. */
async function ceoReads(): Promise<TurnResult[]> {
  const user = findUser("u_thana");
  if (!user) throw new Error("no CEO");
  const tools = winyuTools();
  const call = (name: string, input: unknown) => tools[name].execute(tools[name].inputSchema().parse(input));
  return runWithAccess(accessFor(user), async () => [
    { tool: "find_people", output: await call("find_people", PEOPLE_INPUT) },
    { tool: "get_person", output: await call("get_person", PERSON_INPUT) },
  ]);
}

function surfaceAfter(composer: CardComposer, components: readonly unknown[], done: boolean): ComposedSurface {
  for (const component of components) composer.read(JSON.stringify(component));
  const surface = composer.surface();
  if (!surface) throw new Error("no card");
  return { surfaceId: SURFACE_ID, ...surface, done };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function draw(root: Root, surface: ComposedSurface, pressed: CardAction[]): Promise<void> {
  await act(async () => {
    root.render(
      <CardActionsProvider value={{ runAction: (action) => pressed.push(action) }}>
        <ComposedCardView surface={surface} />
      </CardActionsProvider>,
    );
  });
  await settle();
}

describe("a card the model composes", () => {
  test("grows as checked lines arrive: the leader first, then his five reports, and a row press asks for that person's profile", async () => {
    const composer = new CardComposer(await ceoReads());
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const pressed: CardAction[] = [];
    await draw(root, surfaceAfter(composer, GEMINI_TEAM_CARD.slice(0, 3), false), pressed);
    expect(host.textContent).toContain("ผู้ดูแลและทีมขายภาคอีสาน");
    expect(host.textContent).toContain("คุณอนุชา พรหมศรี");
    expect(host.textContent).not.toContain("คุณกฤต จันทร์เสน");
    await draw(root, surfaceAfter(composer, GEMINI_TEAM_CARD.slice(3), true), pressed);
    const text = host.textContent ?? "";
    for (const name of TEAM) expect(text).toContain(name);
    expect(text).not.toContain("คุณจอย");
    const row = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("คุณป้อง แสนสุข"));
    await act(async () => row?.click());
    expect(pressed).toEqual([expect.objectContaining({ kind: "ask", prompt: "ขอดูโปรไฟล์ คุณป้อง แสนสุข" })]);
  });

  test("a card whose block held nothing beyond its root draws nothing", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    await draw(createRoot(host), { surfaceId: SURFACE_ID, components: [], dataModel: {}, done: true }, []);
    expect(host.textContent).toBe("");
  });
});
