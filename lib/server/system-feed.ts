import type { AccessContext, FeedItem, FeedTone } from "@/lib/contracts";
import { handoffSwitch, killedTools } from "@/lib/access/enforce";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { remoteConnectors } from "@/lib/server/connectors";
import { offlineSince } from "@/lib/server/connectors/catalog";

const DAY_MS = 86_400_000;
const SYSTEM_ROLES: ReadonlySet<string> = new Set(["it_admin"]);
const RANK = { offline: 820, switchedOff: 520, killed: 500 } as const;

function daysSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY_MS));
}

function systemItem(key: string, tone: FeedTone, rank: number, label: string, reason: string, detail: string, prompt: string): FeedItem {
  return { key, source: "system", kind: "system", story: null, rank, tone, label, reason, detail, prompt, alertId: null, packetId: null, canFinish: true, actions: [], because: null };
}

/** What in Cop itself needs the administrator: a connector that stopped answering, a switch left off, a tool taken out of service. */
export function systemFeedFor(access: AccessContext, now = Date.now()): FeedItem[] {
  if (!SYSTEM_ROLES.has(access.role)) return [];
  const offline = remoteConnectors().flatMap(({ def }) => {
    const since = offlineSince(def.id);
    return since
      ? [systemItem(`system:offline:${def.id}:${since}`, "danger", RANK.offline, def.labelTh, TH.feed.system.offline, TH.feed.system.since(formatDateTh(since)), TH.feed.system.offlinePrompt(def.labelTh))]
      : [];
  });
  const handoff = handoffSwitch();
  const switchedOff = handoff && !handoff.enabled
    ? [systemItem(`system:switch:handoff:${handoff.at}`, "warning", RANK.switchedOff, TH.feed.system.handoffOff, TH.feed.system.days(daysSince(handoff.at, now)), TH.feed.system.since(formatDateTh(handoff.at)), TH.feed.system.handoffPrompt)]
    : [];
  const killed = killedTools().map((tool) => systemItem(`system:killed:${tool}`, "warning", RANK.killed, tool, TH.feed.system.killed, TH.feed.system.killedDetail, TH.feed.system.killedPrompt(tool)));
  return [...offline, ...switchedOff, ...killed];
}
