import type { AccessContext, Alert, EvidenceAnswer, MorningBrief, Story, StoryCard } from "@/lib/contracts";
import { openAlertsFor } from "@/lib/server/alerts";
import { latestInvestigation } from "@/lib/server/investigations";
import { runMetric } from "@/lib/server/metrics";

const SEVERITIES: readonly Alert["severity"][] = ["P1", "P2", "P3"];

async function evidenceFor(story: Story, access: AccessContext): Promise<EvidenceAnswer | null> {
  if (!story.evidence) return null;
  const result = await runMetric(story.evidence.query, access);
  return result.ok ? { ...result, nextActions: [] } : null;
}

function backs(story: Story, alert: Alert): boolean {
  const { metric, region } = story.subject;
  return alert.metric === metric && (region === null || alert.dims.region === region);
}

/** How strongly the viewer's open alerts back a story: how many it has at each severity, most severe first. */
function urgencyOf(story: Story, open: readonly Alert[]): number[] {
  const backing = open.filter((alert) => backs(story, alert));
  return SEVERITIES.map((severity) => backing.filter((alert) => alert.severity === severity).length);
}

function moreUrgent(left: readonly number[], right: readonly number[]): number {
  const at = left.findIndex((count, index) => count !== right[index]);
  return at === -1 ? 0 : right[at] - left[at];
}

/** The stories in the order the drawer opens them: the one the most severe open alerts back first (more P1 alerts, then P2, then P3); stories backed equally keep the order Winyu wrote them in. */
function byUrgency(stories: readonly Story[], open: readonly Alert[]): Story[] {
  return stories
    .map((story) => ({ story, urgency: urgencyOf(story, open) }))
    .sort((left, right) => moreUrgent(left.urgency, right.urgency))
    .map(({ story }) => story);
}

/** The last investigation for this viewer with every story's evidence drawn from today's data under their own scope, the stories its open alerts back most severely first; null before Winyu has investigated for them. */
export async function morningBriefFor(access: AccessContext): Promise<MorningBrief | null> {
  const investigation = latestInvestigation(access.userId);
  if (!investigation) return null;
  const stories = byUrgency(investigation.stories, openAlertsFor(access));
  const cards: StoryCard[] = await Promise.all(stories.map(async (story) => ({ story, evidence: await evidenceFor(story, access) })));
  return { at: investigation.at, checkedCount: investigation.checkedCount, cards };
}
