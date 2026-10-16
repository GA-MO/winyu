import type { z } from "zod";
import { rememberInputSchema } from "@/lib/contracts";
import { holdsFigure, rememberStated } from "@/lib/engine/memory";
import { TH } from "@/lib/i18n/th";
import { currentAccess, currentTurn } from "@/lib/server/request-context";
import { defineTool } from "./define";
import { rememberHolds } from "./verify";

type RememberInput = z.infer<typeof rememberInputSchema>;

export const rememberTool = defineTool({
  name: "remember",
  connector: "winyu",
  tier: "write",
  roles: "all",
  description:
    "Remember something about the current user that they ask you to remember (จำไว้ว่า… / ต่อไปให้…), for every later conversation. type: style = how they want answers written (length, bullet points, numbers first, no lead-in), vocabulary = a word they define and what it means, interest = a topic they follow, preference = a view of the data they like, responsibility = something they look after (a one-off occasion gets until = its last day, YYYY-MM-DD; otherwise until = null). value: one short Thai statement in their terms, such as ตอบสั้น ไม่เกิน 3 ข้อ ตัวเลขก่อน or เรียกภาคใต้ว่า \"ด้ามขวาน\". Memory holds no figures: a number, target or result is refused, because every number comes from the tools. The user approves the wording first; until this tool returns ok, nothing is remembered.",
  input: rememberInputSchema,
  redact: ["value"],
  ready: (input) => !holdsFigure((input as RememberInput).value),
  verify: rememberHolds,
  execute: async (input: RememberInput) => {
    const fact = rememberStated(currentAccess().userId, input, currentTurn().threadId);
    if (!fact) return { ok: false as const, error: TH.memory.figureRefused };
    return {
      ok: true as const,
      summary: fact.until ? TH.memory.rememberedUntil(fact.value, fact.until) : TH.memory.rememberedSummary(fact.value),
      data: { id: fact.id, type: fact.type, value: fact.value, until: fact.until ?? null },
    };
  },
});
