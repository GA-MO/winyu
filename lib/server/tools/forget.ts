import type { z } from "zod";
import { forgetInputSchema } from "@/lib/contracts";
import { forgetAbout, memoryAbout } from "@/lib/engine/memory";
import { TH } from "@/lib/i18n/th";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";
import { forgetHolds } from "./verify";

type ForgetInput = z.infer<typeof forgetInputSchema>;

export const forgetTool = defineTool({
  name: "forget",
  connector: "winyu",
  tier: "write",
  roles: "all",
  description:
    "Forget something about the current user when they ask (ลืม… / ไม่ต้องจำ… / เลิกเรียก…): about = the word or topic in their words, such as ด้ามขวาน. Every remembered fact about it, trusted or still being learned, is removed and is not learned again unless they ask to remember it. The user approves first; until this tool returns ok, nothing is forgotten.",
  input: forgetInputSchema,
  redact: ["about"],
  ready: (input) => memoryAbout(currentAccess().userId, (input as ForgetInput).about).length > 0,
  verify: forgetHolds,
  execute: async ({ about }: ForgetInput) => {
    const forgotten = forgetAbout(currentAccess().userId, about);
    return {
      ok: true as const,
      summary: forgotten.length > 0 ? TH.memory.forgotSummary(forgotten.length) : TH.memory.nothingToForget,
      data: { about, forgotten: forgotten.map((fact) => ({ type: fact.type, value: fact.value })) },
    };
  },
});
