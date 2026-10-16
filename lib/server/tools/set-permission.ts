import type { z } from "zod";
import { setPermissionInputSchema } from "@/lib/contracts";
import { applyPermissionChange } from "@/lib/server/permissions";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";
import { permissionHolds } from "./verify";
import { connectorFields, toolSurface } from "./registry";

const BASE_DESCRIPTION =
  "Change what one role may see or do, for every user in that role, effective on their next question. kind 'metric': key is a metric id from list_metrics, value 'full' (sees all), 'masked' (values shown as ***) or 'none' (cannot see it). kind 'tool': key is one of the tool names listed below (the tool's Thai name is in brackets; every one of them exists, whether or not this admin can call it), value 'allow' or 'deny'. kind 'field': key is one of the connector fields listed below, value 'full', 'masked' or 'none'. Roles: ceo, cfo, sales_director, sales_rsm (ผู้จัดการขายภาค), sales_rep (พนักงานขาย), marketing_lead, supply_planner, finance_analyst, hr_manager, it_admin. One change per call; call it once per role when the admin names several. IT administrators only; the admin approves it first.";

/** The set_permission description with every tool and connector field it can change, each by key with its Thai name. */
export function describeSetPermission(): string {
  const tools = toolSurface().map((entry) => `${entry.name} (${entry.labelTh})`);
  const fields = connectorFields().map((field) => `${field.key} (${field.labelTh})`);
  return [BASE_DESCRIPTION, `Tools: ${tools.join(", ")}.`, ...(fields.length > 0 ? [`Connector fields: ${fields.join(", ")}.`] : [])].join(" ");
}

export const setPermissionTool = defineTool({
  name: "set_permission",
  connector: "winyu",
  tier: "destructive",
  roles: ["it_admin"],
  description: describeSetPermission,
  input: setPermissionInputSchema,
  verify: permissionHolds,
  execute: async (input: z.infer<typeof setPermissionInputSchema>) => {
    const change = applyPermissionChange(input, currentAccess().userId);
    if (!change.ok) return { ok: false as const, error: change.error };
    return { ok: true as const, summary: change.summary, data: change.data };
  },
});
