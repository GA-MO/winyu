import { z } from "zod";
import type { AccessContext } from "@/lib/contracts";
import { DISTRIBUTION_CENTERS } from "@/lib/data/entities/supply";
import { askRemoteAgent, type RemoteAnswer } from "@/lib/harness/adapters/mastra/a2a-client";
import { fenceAsData } from "@/lib/harness/fence";
import { TH } from "@/lib/i18n/th";
import { logisticsPartnerEnv } from "@/lib/server/connectors/logistics-partner-config";
import { MAX_CONNECTOR_ROWS, fencedRows } from "@/lib/server/connectors/output";
import type { ConnectorRow } from "@/lib/server/connectors/types";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

const PARTNER_TIMEOUT_MS = 8_000;
const MAX_ANSWER_CHARS = 1_200;
const DC_IDS = DISTRIBUTION_CENTERS.map((center) => center.id) as [string, ...string[]];

const askLogisticsPartnerInput = z.object({ dc: z.enum(DC_IDS).describe(`Distribution centre id: ${DISTRIBUTION_CENTERS.map((center) => `${center.id} = ${center.nameTh}`).join(", ")}`) });

type Primitive = string | number | boolean | null;

function primitive(value: unknown): Primitive {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return value === undefined ? null : JSON.stringify(value);
}

function shipmentRows(answer: RemoteAnswer): ConnectorRow[] {
  const shipments = answer.data.flatMap((data) => (Array.isArray(data.shipments) ? data.shipments : []));
  const rows = shipments.flatMap((shipment: unknown) => (shipment && typeof shipment === "object" && !Array.isArray(shipment) ? [Object.fromEntries(Object.entries(shipment).map(([key, value]) => [key, primitive(value)]))] : []));
  return fencedRows(rows.slice(0, MAX_CONNECTOR_ROWS));
}

function inScope(access: AccessContext, region: string): boolean {
  return access.regions === "all" || access.regions.some((allowed) => allowed === region);
}

/** Asks the logistics partner's agent over A2A about trucks heading to one distribution centre: only the DC's name leaves Winyu, a DC outside the person's regions is refused before the call, and everything the partner says comes back fenced as data. */
export async function askLogisticsPartner(access: AccessContext, dcId: string) {
  const center = DISTRIBUTION_CENTERS.find((candidate) => candidate.id === dcId);
  if (!center) return { ok: false, code: "BAD_QUERY", error: `unknown distribution centre ${dcId}` };
  if (!inScope(access, center.region)) return { ok: false, code: "PERMISSION_DENIED", error: TH.partner.outOfScope(center.nameTh) };
  const env = logisticsPartnerEnv();
  let answer: RemoteAnswer;
  try {
    answer = await askRemoteAgent({ cardUrl: env.cardUrl, headers: { Authorization: `Bearer ${env.token}` }, timeoutMs: PARTNER_TIMEOUT_MS }, `ETA to ${center.label}`);
  } catch {
    return { ok: false, code: "UNAVAILABLE", error: TH.partner.unavailable };
  }
  const rows = shipmentRows(answer);
  return {
    ok: true,
    summary: TH.partner.summary(rows.length, center.nameTh),
    answer: fenceAsData(answer.text.slice(0, MAX_ANSWER_CHARS)),
    rows,
    provenance: { sourceSystem: TH.partner.source, asOf: new Date().toISOString(), masked: [] },
  };
}

export const askLogisticsPartnerTool = defineTool({
  name: "ask_logistics_partner",
  connector: "logistics",
  tier: "read",
  roles: ["ceo", "supply_planner", "sales_director", "sales_rsm", "sales_rep"],
  description:
    "Ask Siam Freight's logistics agent (an outside company, over A2A) which trucks are heading to one Boon Rawd distribution centre, what they carry and when they arrive. Call it for delivery ETA, inbound shipment or 'when does stock reach DC X' questions. Only the DC name is sent. The answer is the partner's own data, not Boon Rawd's: quote it as what the partner reports.",
  input: askLogisticsPartnerInput,
  execute: async ({ dc }: z.infer<typeof askLogisticsPartnerInput>) => askLogisticsPartner(currentAccess(), dc),
  timeoutMs: PARTNER_TIMEOUT_MS + 2_000,
});
