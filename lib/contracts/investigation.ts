import { z } from "zod";
import { REGIONS } from "./identity";
import { metricIdSchema } from "./semantic";

export const STORY_KINDS = ["urgent", "watch", "ok"] as const;
export const HEADLINE_TONES = ["bad", "good", "neutral"] as const;
export const CHECK_VERDICTS = ["confirmed", "likely", "ruled_out", "unknown"] as const;

const labelled = z.object({ label: z.string(), value: z.string() });

export const storySchema = z.object({
  kind: z.enum(STORY_KINDS),
  claim: z.string(),
  scope: z.string(),
  period: z.string(),
  subject: z.object({ metric: metricIdSchema.nullable(), region: z.enum(REGIONS).nullable() }),
  headline: labelled.extend({ tone: z.enum(HEADLINE_TONES).nullable() }),
  projection: labelled.nullable(),
  causes: z.array(z.object({ label: z.string(), detail: z.string(), value: z.string(), shareOfGap: z.string().nullable() })).max(4),
  checked: z.array(z.object({ text: z.string(), verdict: z.enum(CHECK_VERDICTS), source: z.string().nullable() })).max(5),
  recommendation: z.string().nullable(),
});

export type StoryKind = (typeof STORY_KINDS)[number];
export type CheckVerdict = (typeof CHECK_VERDICTS)[number];
export type DraftStory = z.infer<typeof storySchema>;
/** A story as the page shows it: the model's draft plus who owns it, decided in code. */
export type Story = DraftStory & { id: string; owner: { userId: string; nameTh: string; title: string } | null };
export type Investigation = { id: string; userId: string; at: string; model: string; stories: Story[]; checkedCount: number; costUsd: number };
