import type { AccessContext, StoreVisit } from "@/lib/contracts";
import { REGION_LABELS_TH } from "@/lib/data/entities/org";
import { formatCurrency, formatDateTh } from "@/lib/i18n/format";
import { businessToday } from "@/lib/data/dates";
import { TH } from "@/lib/i18n/th";
import { fencedRows, maskedRows, MAX_CONNECTOR_ROWS } from "./connectors/output";
import type { ConnectorRow } from "./connectors/types";
import { findUser } from "@/lib/data/entities/users";
import type { Dictionary } from "@/lib/semantic/dictionary";
import { loadDictionary } from "./master-data";
import { ports } from "./ports";
import { ORDER_VALUE_FIELD } from "./tools/native-fields";

const T = TH.admin.tools.store_visits;

function inRegions(access: AccessContext, visit: StoreVisit): boolean {
  return access.regions === "all" || access.regions.includes(visit.region);
}

function ownerOf(dictionary: Dictionary, agentId: string): { owner_id: string | null; owner_name: string | null } {
  const ownerId = dictionary.master.agents.find((agent) => agent.id === agentId)?.ownerId ?? null;
  return { owner_id: ownerId, owner_name: ownerId ? (findUser(ownerId)?.nameTh ?? null) : null };
}

function rowOf(visit: StoreVisit, dictionary: Dictionary): ConnectorRow {
  return {
    agent_id: visit.agentId,
    agent_name: dictionary.entityLabel("agent", visit.agentId),
    ...ownerOf(dictionary, visit.agentId),
    region: visit.region,
    region_label: REGION_LABELS_TH[visit.region],
    visited_on: visit.visitedOn,
    visited_label: formatDateTh(visit.visitedOn),
    rep_name: visit.repName,
    outcome_label: visit.outcome,
    note: visit.note,
    order_value: visit.orderValueThb,
    order_value_label: visit.orderValueThb > 0 ? formatCurrency(visit.orderValueThb) : "-",
  };
}

/** Store visits from the CRM, each row naming the agent's assigned rep beside who went, for one agent or all, only in the regions the caller covers (asked of the CRM and checked again on every row), newest first, the order value shown by role. */
export async function storeVisitsFor(access: AccessContext, agentId: string | null) {
  const [visits, dictionary] = await Promise.all([ports().crm.visits({ agentId, regions: access.regions }), loadDictionary()]);
  const kept = visits.filter((visit) => inRegions(access, visit)).sort((left, right) => right.visitedOn.localeCompare(left.visitedOn));
  const provenance = { sourceSystem: TH.cards.failed.systems.crm, asOf: businessToday() };
  if (kept.length === 0) return { ok: true as const, summary: TH.admin.connectors.noneInScope(T.label), code: "NONE_IN_SCOPE" as const, rows: [], provenance: { ...provenance, masked: [] } };
  const shown = maskedRows(kept.map((visit) => rowOf(visit, dictionary)), [ORDER_VALUE_FIELD], access);
  const summary = kept.length > MAX_CONNECTOR_ROWS ? TH.admin.connectors.rowsCapped(T.label, MAX_CONNECTOR_ROWS, kept.length) : TH.admin.connectors.rows(T.label, kept.length);
  return { ok: true as const, summary, rows: fencedRows(shown.rows.slice(0, MAX_CONNECTOR_ROWS)), provenance: { ...provenance, masked: shown.masked } };
}
