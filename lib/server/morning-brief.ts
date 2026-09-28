import type { AccessContext, EvidenceAnswer, MorningBrief, Story, StoryCard } from "@/lib/contracts";
import { latestInvestigation } from "@/lib/server/investigate";
import { runMetric } from "@/lib/server/metrics";

async function evidenceFor(story: Story, access: AccessContext): Promise<EvidenceAnswer | null> {
  if (!story.evidence) return null;
  const result = await runMetric(story.evidence.query, access);
  return result.ok ? { ...result, query: story.evidence.query, nextActions: [] } : null;
}

/** The last investigation for this viewer with every story's evidence drawn from today's data under their own scope; null before Winyu has investigated for them. */
export async function morningBriefFor(access: AccessContext): Promise<MorningBrief | null> {
  const investigation = latestInvestigation(access.userId);
  if (!investigation) return null;
  const cards: StoryCard[] = await Promise.all(investigation.stories.map(async (story) => ({ story, evidence: await evidenceFor(story, access) })));
  return { at: investigation.at, checkedCount: investigation.checkedCount, cards };
}
