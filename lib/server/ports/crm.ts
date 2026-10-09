import type { Region, StoreVisit } from "@/lib/contracts";

/** Which visits to read: one agent or every agent, in the regions Winyu scoped the caller to. */
export type VisitQuery = { agentId: string | null; regions: readonly Region[] | "all" };

/** The CRM: the sales team's store visits per agent. */
export type CrmPort = { visits(query: VisitQuery): Promise<readonly StoreVisit[]> };
