import { z } from "zod";
import type { AccessContext } from "@/lib/contracts";
import { CRM_DEMO_ID, CRM_DEMO_TOOL, crmDemoEnv } from "./crm-demo-config";
import { defineRestConnector } from "./define";
import { signedIdentityHeaders } from "./signed-identity";
import type { ConnectorOutput, ConnectorRow } from "./types";

const TIMEOUT_MS = 4000;

const VISITS_BODY = z.object({ items: z.array(z.record(z.string(), z.unknown())), as_of: z.string().optional() });

function visitsOutput(body: unknown): ConnectorOutput {
  const parsed = VISITS_BODY.parse(body);
  return { rows: parsed.items, asOf: parsed.as_of };
}

function onlyOwnRegions(rows: ConnectorRow[], access: AccessContext): ConnectorRow[] {
  if (access.regions === "all") return rows;
  const regions: readonly string[] = access.regions;
  return rows.filter((row) => regions.includes(String(row.region)));
}

/** The demo CRM behind REST: store visits per agent, asked as the signed-in user, kept to the regions Cop says they cover. */
export const crmDemoConnector = defineRestConnector({
  id: CRM_DEMO_ID,
  labelTh: "CRM (REST)",
  sourceSystemTh: "CRM ภายนอกผ่าน REST (เดโม)",
  baseUrl: crmDemoEnv().url,
  auth: (access) => signedIdentityHeaders(access, crmDemoEnv().secret),
  timeoutMs: TIMEOUT_MS,
  tools: {
    [CRM_DEMO_TOOL]: {
      method: "GET",
      path: "/visits",
      labelTh: "ดูบันทึกการเยี่ยมร้าน",
      bodyTh: "การเยี่ยมเอเย่นต์จากระบบ CRM: วันที่ ผู้ไปเยี่ยม ผลการเยี่ยม และยอดสั่งซื้อ เห็นเฉพาะภาคที่รับผิดชอบ",
      description:
        "Store visits from the CRM: one row per visit with agent, region, date, the rep who went, the outcome and the order value, all with Thai labels. agentId narrows to one agent (an agent id such as ag_ne_01); null lists every visit in the viewer's regions. Call it for เยี่ยมร้าน / ไปเยี่ยมเอเย่นต์ล่าสุดเมื่อไร / ใครไปเยี่ยม questions. Not for sales numbers (query_metric) and not for which agents to visit next (the landing page's visit list).",
      tier: "read",
      roles: ["ceo", "sales_director", "sales_rsm", "sales_rep", "marketing_lead"],
      input: z.object({ agentId: z.string().nullable(), regions: z.string().nullable() }),
      output: visitsOutput,
      scope: [
        { kind: "inject", args: (access) => ({ regions: access.regions === "all" ? null : access.regions.join(",") }) },
        { kind: "filter", rows: onlyOwnRegions },
      ],
      sensitive: [{ field: "order_value", labelTh: "ยอดสั่งซื้อจากการเยี่ยมร้าน", full: ["ceo", "sales_director", "sales_rsm"], masked: ["sales_rep"] }],
    },
  },
});
