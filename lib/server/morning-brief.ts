import type { AccessContext, EvidenceAnswer, MorningBrief, Story, StoryCard } from "@/lib/contracts";
import { openAlertsFor } from "@/lib/server/alerts";
import { latestInvestigation } from "@/lib/server/investigations";
import { runMetric } from "@/lib/server/metrics";
import { byUrgency } from "@/lib/server/story-coverage";

async function evidenceFor(story: Story, access: AccessContext): Promise<EvidenceAnswer | null> {
  if (!story.evidence) return null;
  const result = await runMetric(story.evidence.query, access);
  return result.ok ? { ...result, nextActions: [] } : null;
}

/** The last investigation for this viewer with every story's evidence drawn from today's data under their own scope, the stories its open alerts back most severely first; null before Winyu has investigated for them. */
export async function morningBriefFor(access: AccessContext): Promise<MorningBrief | null> {
  const investigation = latestInvestigation(access.userId);
  if (!investigation) return null;
  const open = openAlertsFor(access).map((alert) => ({ severity: alert.severity, metric: alert.metric, scope: alert.dims }));
  const stories = byUrgency(investigation.stories, open);
  const cards: StoryCard[] = await Promise.all(stories.map(async (story) => ({ story, evidence: await evidenceFor(story, access) })));
  return { at: investigation.at, checkedCount: investigation.checkedCount, cards };
}
