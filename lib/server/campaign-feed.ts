import type { AccessContext, FeedItem } from "@/lib/contracts";
import { TODAY, addDays } from "@/lib/data/dates";
import { CAMPAIGNS, type Campaign } from "@/lib/data/entities/marketing";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { runMetric } from "@/lib/server/metrics";

const RECENT_DAYS = 14;
const PERCENT = 100;
const BELOW_TARGET_RANK = 560;
const MET_TARGET_RANK = 300;

function isCurrent(campaign: Campaign): boolean {
  return campaign.from <= TODAY && campaign.to >= addDays(TODAY, -RECENT_DAYS);
}

async function upliftOf(campaign: Campaign, access: AccessContext): Promise<number | null> {
  const to = campaign.to < TODAY ? campaign.to : TODAY;
  const result = await runMetric({ metric: "campaign_uplift", dims: [], filters: { campaign: [campaign.id] }, range: { from: campaign.from, to }, grain: "day", compare: "none", limit: null }, access);
  const value = result.ok ? result.rows[0]?.value : null;
  return typeof value === "number" ? value : null;
}

async function itemOf(campaign: Campaign, access: AccessContext): Promise<FeedItem | null> {
  const uplift = await upliftOf(campaign, access);
  if (uplift === null) return null;
  const target = campaign.upliftTarget * PERCENT;
  const met = uplift >= target;
  const ended = campaign.to < TODAY;
  return {
    key: `campaign:${campaign.id}:${ended ? "ended" : "running"}:${met ? "met" : "below"}`,
    source: "campaign",
    kind: "campaign",
    story: `campaign:${campaign.id}`,
    rank: met ? MET_TARGET_RANK : BELOW_TARGET_RANK,
    tone: met ? "success" : "warning",
    label: campaign.nameTh,
    reason: `+${uplift.toFixed(1)}%`,
    detail: TH.feed.campaignDetail(`${target.toFixed(0)}%`, met, ended, formatDateTh(campaign.to)),
    prompt: TH.feed.campaignPrompt(campaign.nameTh),
    alertId: null,
    packetId: null,
    canFinish: true,
    actions: [],
    because: null,
  };
}

/** How the user's own campaigns are doing against their uplift target, while they run and for two weeks after: under target is a task, at or over is good news. */
export async function campaignFeedFor(access: AccessContext): Promise<FeedItem[]> {
  if (access.metricAcl.campaign_uplift !== "full") return [];
  const mine = CAMPAIGNS.filter((campaign) => campaign.ownerUserId === access.userId && isCurrent(campaign));
  const items = await Promise.all(mine.map((campaign) => itemOf(campaign, access)));
  return items.filter((item): item is FeedItem => item !== null);
}
