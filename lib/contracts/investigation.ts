import { z } from "zod";
import { REGIONS } from "./identity";
import type { NextAction } from "./actions";
import { metricIdSchema, type MetricQuery, type MetricResult } from "./semantic";

export const STORY_KINDS = ["urgent", "watch", "ok"] as const;

export const storySchema = z.object({
  kind: z.enum(STORY_KINDS),
  finding: z.string(),
  scope: z.string(),
  subject: z.object({ metric: metricIdSchema.nullable(), region: z.enum(REGIONS).nullable() }),
  evidence: z.object({ call: z.number().int(), title: z.string() }).nullable(),
  ruledOut: z.array(z.object({ text: z.string(), source: z.string() })).max(2),
  action: z.string().nullable(),
});

export type StoryKind = (typeof STORY_KINDS)[number];
export type DraftStory = z.infer<typeof storySchema>;
/** The query a story's card draws: Cop runs it again for whoever opens the story, so the card follows their scope and today's data. */
export type StoryEvidence = { title: string; query: MetricQuery };
/** A story as it is kept: the model's words, and the query it chose as evidence resolved from its tool calls. */
export type Story = Omit<DraftStory, "evidence"> & { id: string; evidence: StoryEvidence | null };
export type Investigation = { id: string; userId: string; at: string; model: string; stories: Story[]; checkedCount: number; costUsd: number };
/** A story's evidence as the viewer's card draws it: the query's result, run again under the viewer's scope. */
export type EvidenceAnswer = Extract<MetricResult, { ok: true }> & { query: MetricQuery; nextActions: NextAction[] };
export type StoryCard = { story: Story; evidence: EvidenceAnswer | null };
/** What the stories drawer opens on: when Cop investigated, how much it looked at, and each story with its card. */
export type MorningBrief = { at: string; checkedCount: number; cards: StoryCard[] };
