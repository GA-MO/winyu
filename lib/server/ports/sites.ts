import type { Incident, Site } from "@/lib/contracts";

export type SiteRecords = { sites: readonly Site[]; incidents: readonly Incident[] };

/** The safety system: plants, distribution centres and offices with their incident log. */
export type SitesPort = { load(): Promise<SiteRecords> };
