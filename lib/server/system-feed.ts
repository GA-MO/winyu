import type { AccessContext, FeedItem, FeedTone } from "@/lib/contracts";
import { killedTools } from "@/lib/access/enforce";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { remoteConnectors } from "@/lib/server/connectors";
import { offlineSince } from "@/lib/server/connectors/catalog";
import type { PortUnavailable } from "@/lib/server/ports/unavailable";

const SYSTEM_ROLES: ReadonlySet<string> = new Set(["it_admin"]);
const RANK = { offline: 820, portDown: 700, killed: 500 } as const;

function systemItem(key: string, tone: FeedTone, rank: number, label: string, reason: string, detail: string, prompt: string): FeedItem {
  return { key, source: "system", kind: "system", story: null, rank, tone, label, reason, detail, prompt, alertId: null, packetId: null, canFinish: true, actions: [], because: null };
}

/** What in Winyu itself needs the administrator: a connector that stopped answering, a tool taken out of service. Switches are policy, not matters. */
export function systemFeedFor(access: AccessContext): FeedItem[] {
  if (!SYSTEM_ROLES.has(access.role)) return [];
  const offline = remoteConnectors().flatMap(({ def }) => {
    const since = offlineSince(def.id);
    return since
      ? [systemItem(`system:offline:${def.id}:${since}`, "danger", RANK.offline, def.labelTh, TH.feed.system.offline, TH.feed.system.since(formatDateTh(since)), TH.feed.system.offlinePrompt(def.labelTh))]
      : [];
  });
  const killed = killedTools().map((tool) => systemItem(`system:killed:${tool}`, "warning", RANK.killed, tool, TH.feed.system.killed, TH.feed.system.killedDetail, TH.feed.system.killedPrompt(tool)));
  return [...offline, ...killed];
}

/** What stands in a feed for the matters a system would have raised while it does not answer, so the feed never reads as if there were none. */
export function portDownItem(error: PortUnavailable): FeedItem {
  const system = TH.cards.failed.systems[error.port];
  return systemItem(`system:down:${error.port}`, "warning", RANK.portDown, system, TH.feed.system.portDown, TH.feed.system.portDownDetail, TH.feed.system.portDownPrompt(system));
}
