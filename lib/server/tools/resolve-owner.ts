import type { z } from "zod";
import { resolveOwnerInputSchema, type Dim, type Region } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { AGENTS } from "@/lib/data/entities/agents";
import { PROVINCES } from "@/lib/data/entities/org";
import { DISTRIBUTION_CENTERS, PLANTS } from "@/lib/data/entities/supply";
import { suggestOwner } from "@/lib/server/handoff";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

const REGION_OF_PLACE: Partial<Record<Dim, ReadonlyMap<string, Region>>> = {
  agent: new Map(AGENTS.map((agent) => [agent.id, agent.region])),
  province: new Map(PROVINCES.map((province) => [province.id, province.region])),
  dc: new Map(DISTRIBUTION_CENTERS.map((dc) => [dc.id, dc.region])),
  plant: new Map(PLANTS.map((plant) => [plant.id, plant.region])),
};

function regionOf(dims: Partial<Record<Dim, string>>): Region | null {
  if (dims.region) return dims.region as Region;
  for (const [dim, regions] of Object.entries(REGION_OF_PLACE) as [Dim, ReadonlyMap<string, Region>][]) {
    const place = dims[dim];
    const region = place ? regions.get(place) : undefined;
    if (region) return region;
  }
  return null;
}

export const resolveOwnerTool = defineTool({
  name: "resolve_owner",
  connector: "winyu",
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
