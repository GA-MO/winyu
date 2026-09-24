import type { z } from "zod";
import { resolveOwnerInputSchema, type Dim, type Region } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { suggestOwner } from "@/lib/server/handoff";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

function regionOf(dims: Partial<Record<Dim, string>>): Region | null {
  return (dims.region as Region | undefined) ?? null;
}

export const resolveOwnerTool = defineTool({
  name: "resolve_owner",
  connector: "cop",
  tier: "read",
  roles: "all",
  description: "Find the person accountable for a metric in a region (the RACI table) before handing work over or asking for access. Returns the user id, name, title and the reason they own it.",
  input: resolveOwnerInputSchema,
  execute: async ({ metric, dims }: z.infer<typeof resolveOwnerInputSchema>) => {
    const region = regionOf(dims);
    const suggestion = suggestOwner(metric, region, currentAccess().userId);
    const target = suggestion ? findUser(suggestion.userId) : null;
    if (!suggestion || !target) return { ok: false as const, error: `ยังไม่มีผู้รับผิดชอบสำหรับ ${metric}` };
    return {
      ok: true as const,
      summary: `ผู้รับผิดชอบคือ ${target.nameTh}`,
      data: {
        userId: target.id,
        nameTh: target.nameTh,
        title: target.title,
        role: target.role,
        region: target.region,
        reason: suggestion.reason,
        openLoad: suggestion.openLoad,
        handledBefore: suggestion.handledBefore,
      },
    };
  },
});
