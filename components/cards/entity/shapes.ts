import { z } from "zod";

const tone = z.enum(["good", "bad", "neutral"]);
const badgeTone = z.enum(["neutral", "success", "warning", "danger"]);
const badge = z.object({ label: z.string(), tone: badgeTone.nullable().catch("neutral") });
const pair = z.object({ label: z.string(), value: z.string() });
const stat = z.object({ label: z.string(), value: z.string(), detail: z.string().nullable(), tone: tone.nullable().catch("neutral") });
const moment = z.object({ title: z.string(), detail: z.string().nullable(), time: z.string().nullable() });

export const personRow = z.object({
  is_you: z.boolean().optional(),
  id: z.string(),
  name: z.string(),
  title: z.string(),
  place: z.string(),
  photo: z.string().nullable(),
  tenure: z.string().nullable(),
  badges: z.array(badge),
});

export const peopleResult = z.object({
  summary: z.string(),
  data: z.array(personRow),
  open_positions: z.array(z.object({ title: z.string(), open_label: z.string() })).catch([]),
});

export const personResult = z.object({
  summary: z.string(),
  data: z.object({
    id: z.string(),
    name: z.string(),
    title: z.string(),
    photo: z.string().nullable(),
    badges: z.array(badge),
    facts: z.array(pair),
    history: z.array(moment),
    certificates: z.array(pair),
    risk_reasons: z.array(z.string()),
    reports: z.array(z.object({ id: z.string(), name: z.string(), title: z.string(), photo: z.string().nullable() })),
  }),
});

const siteRow = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  place: z.string(),
  photo: z.string().nullable(),
  trailing: z.object({ text: z.string(), tone }),
  note: z.string().nullable(),
  badges: z.array(badge),
});

const siteDetail = z.object({
  id: z.string(),
  name: z.string(),
  photo: z.string().nullable(),
  badges: z.array(badge),
  metrics: z.array(stat),
  facts: z.array(pair),
  open_actions: z.array(z.object({ title: z.string(), body: z.string(), date: z.string() })),
  incidents: z.array(moment),
  people: z.array(personRow),
});

export const sitesResult = z.object({ summary: z.string(), data: z.array(siteRow) });
export const siteResult = z.object({ summary: z.string(), data: siteDetail });

export const candidatesResult = z.object({
  summary: z.string(),
  data: z.object({
    metrics: z.array(stat),
    candidates: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        position: z.string(),
        stage: z.string(),
        score: z.number().nullable(),
        score_label: z.string().nullable(),
        experience: z.string(),
        strength: z.string().nullable(),
        concern: z.string().nullable(),
        badges: z.array(badge),
      }),
    ),
    positions: z.array(z.object({ id: z.string(), title: z.string(), candidates: z.string(), advanced: z.string(), open_label: z.string() })),
  }),
});

export const coursesResult = z.object({
  summary: z.string(),
  data: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      cover: z.string().nullable(),
      category: z.string(),
      when: z.string(),
      place: z.string(),
      seats: z.object({ label: z.string(), tone }),
      note: z.string().nullable(),
      badges: z.array(badge),
      can_enroll: z.boolean(),
    }),
  ),
});

export const policyResult = z.object({
  summary: z.string(),
  data: z.object({
    balances: z.array(stat),
    sections: z.array(z.object({ title: z.string(), content: z.string() })),
    form: z
      .object({
        kinds: z.array(z.object({ value: z.string(), label: z.string() })),
        approver: z.string().nullable(),
        earliest: z.string().nullable(),
        note: z.string().nullable(),
      })
      .nullable(),
  }),
});

export const calendarResult = z.object({
  summary: z.string(),
  data: z.array(
    z.object({ date: z.string(), date_label: z.string(), when_label: z.string(), name: z.string(), kind: z.string(), kind_label: z.string(), impact_label: z.string().nullable() }),
  ),
});

export const gapResult = z.object({
  summary: z.string(),
  period_label: z.string(),
  actual_label: z.string(),
  compare_label: z.string(),
  gap_label: z.string(),
  attainment_label: z.string().nullable(),
  contributors: z.array(z.object({ label: z.string(), gap_label: z.string(), share_label: z.string() })),
  rest: z.object({ label: z.string(), gap_label: z.string(), share_label: z.string() }).nullable(),
  offsetting: z.array(z.object({ label: z.string(), gap_label: z.string() })),
  projection: z
    .object({ label: z.string(), basis: z.string(), projected_label: z.string(), month_target_label: z.string(), attainment_label: z.string() })
    .nullable(),
});

export const entityResult = z.object({ summary: z.string(), data: z.record(z.string(), z.unknown()) });

export const ownerResult = z.object({
  summary: z.string(),
  data: z.object({ userId: z.string(), nameTh: z.string(), title: z.string(), reason: z.string() }),
});

export const memoryResult = z.object({
  summary: z.string(),
  data: z.array(z.object({ id: z.string(), type: z.string(), value: z.string(), status: z.string() })),
  conversations: z.array(z.object({ threadId: z.string(), title: z.string(), at: z.string(), question: z.string() })).default([]),
});

export const metricsResult = z.object({
  summary: z.string(),
  data: z.array(
    z.object({ id: z.string(), labelTh: z.string(), unit: z.string(), certified: z.boolean(), source: z.string(), refresh: z.string(), latest: z.string().nullable() }),
  ),
});

export const connectorResult = z.object({
  summary: z.string(),
  rows: z.array(z.record(z.string(), z.unknown())),
  provenance: z.object({ sourceSystem: z.string(), asOf: z.string(), masked: z.array(z.string()) }),
});

/** What a tool result turned out to be once parsed at the card boundary. */
export type Parsed<T> = { kind: "ok"; data: T } | { kind: "refused"; error: string } | { kind: "unreadable" };

const refusal = z.object({ ok: z.literal(false), error: z.string() });

/** Reads an untyped tool result against the shape its card draws; a refusal keeps the server's own words. */
export function parseResult<T>(schema: z.ZodType<T>, result: unknown): Parsed<T> {
  const refused = refusal.safeParse(result);
  if (refused.success) return { kind: "refused", error: refused.data.error };
  const parsed = schema.safeParse(result);
  return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "unreadable" };
}
