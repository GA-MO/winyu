import type { z } from "zod";
import { resolveOwnerInputSchema } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { resolveFilters } from "@/lib/semantic/dictionary";
import { regionOfSlice } from "@/lib/semantic/geo";
import { filtersOfSlice, pinnedSlice } from "@/lib/semantic/resolved";
import { suggestOwner } from "@/lib/server/share/owner";
import { loadDictionary } from "@/lib/server/master-data";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

export const resolveOwnerTool = defineTool({
  name: "resolve_owner",
  connector: "winyu",
  tier: "read",
  roles: "all",
  description: "Find the person accountable for a metric in a region (the RACI table), or for one agent's overdue debt the rep assigned to that agent, before sending a card to them or asking for access. Returns the user id, name, title and the reason they own it.",
  input: resolveOwnerInputSchema,
  execute: async ({ metric, dims }: z.infer<typeof resolveOwnerInputSchema>) => {
    const dictionary = await loadDictionary();
    const slice = resolveFilters(dictionary, filtersOfSlice(dims));
    if (!slice.ok) return { ok: false as const, code: "BAD_QUERY", error: `ไม่รู้จักค่า "${slice.value}" ของมิติ ${slice.dim}` };
    const pinned = pinnedSlice(slice.filters);
    const suggestion = suggestOwner(metric, regionOfSlice(dictionary, pinned), currentAccess().userId, pinned.agent ?? null);
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
