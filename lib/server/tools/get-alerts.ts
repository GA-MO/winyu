import type { z } from "zod";
import { verifyStepsFor } from "@/lib/access/verify-steps";
import { alertRowOf } from "@/lib/cards/alert-row";
import { getAlertsInputSchema, type Dim } from "@/lib/contracts";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { namesOf, resolveFilters } from "@/lib/semantic/dictionary";
import { excludedIn, isExcluded } from "@/lib/semantic/exclusion";
import { sliceCovers } from "@/lib/semantic/geo";
import { filtersOfSlice } from "@/lib/semantic/resolved";
import { allAlertsFor, openAlertsFor } from "@/lib/server/alerts";
import { actionsForAlert } from "@/lib/server/next-actions";
import { lessonFor } from "@/lib/server/outcomes";
import { loadDictionary } from "@/lib/server/master-data";
import { currentAccess, currentTurn, turnSubjects } from "@/lib/server/request-context";
import { sameMeasure } from "@/lib/server/story-coverage";
import { TH } from "@/lib/i18n/th";
import { defineTool } from "./define";

const NO_ALERTS = "ไม่พบความผิดปกติที่เปิดอยู่ในขอบเขตของผู้ใช้คนนี้";
const DEFAULT_ALERT_LIMIT = 10;
const IN_SCOPE = "ในขอบเขตของคุณ";

/** With no slice given, the one record the turn resolved by name ("อีสานรุ่งโรจน์ค้าส่ง เกิดอะไรขึ้น") is the slice: the alerts of a single-agent question are that agent's, not every alert in scope. Several records, or none, leave the alerts whole. */
function subjectSlice(): Partial<Record<Dim, string>> {
  const subjects = turnSubjects();
  const [only] = subjects;
  if (!only || subjects.some((subject) => subject.dim !== only.dim || subject.id !== only.id)) return {};
  return { [only.dim]: only.id };
}

export const getAlertsTool = defineTool({
  name: "get_alerts",
  connector: "winyu",
  tier: "read",
  roles: "all",
  description: "Read the anomalies the detection engine raised for this user's scope, newest first, each with a hypothesis (a guess, not a finding) and the checks this user can run. Call it when the user asks what is wrong, what changed, or what needs attention. When the talk is about one metric or place (\"why did Ubon drop\"), pass metric and dims (region, province, agent and the like, by id or Thai name) so only the alerts on that slice come back. A sell-in metric finds the sell-in alerts in litres, baht or against target alike, each in its own unit.",
  input: getAlertsInputSchema,
  execute: async ({ status, limit, metric, dims }: z.infer<typeof getAlertsInputSchema>) => {
    const access = currentAccess();
    const dictionary = await loadDictionary();
    const slice = resolveFilters(dictionary, filtersOfSlice(dims ?? subjectSlice()));
    if (!slice.ok) return { ok: false as const, code: "BAD_QUERY", error: `ไม่รู้จักค่า "${slice.value}" ของมิติ ${slice.dim}` };
    const inScope = status === "open" ? openAlertsFor(access) : allAlertsFor(access);
    const excluded = excludedIn(currentTurn().question, dictionary);
    const found = inScope.filter((alert) => (!metric || sameMeasure(alert.metric, metric)) && sliceCovers(dictionary, slice.filters, alert.dims) && !isExcluded(dictionary, excluded, alert.dims));
    const shown = found.slice(0, limit ?? DEFAULT_ALERT_LIMIT);
    const rows = shown.map((alert) => ({ ...alertRowOf(alert, dictionary), verifySteps: verifyStepsFor(access, alert) }));
    if (rows.length === 0) return { ok: true as const, summary: NO_ALERTS, rows: [], lessons: [], nextActions: [] };
    const lessons = shown.flatMap((alert) => {
      const lesson = lessonFor(alert);
      return lesson ? [{ alertId: alert.id, lesson }] : [];
    });
    const setAside = Object.values(namesOf(dictionary, excluded)).flat().join(", ");
    const names = [...(metric ? [metricLabel(metric)] : []), ...Object.values(namesOf(dictionary, slice.filters)).flatMap((labels) => labels ?? [])];
    return {
      ok: true as const,
      summary: [`มีความผิดปกติที่เปิดอยู่ ${rows.length} รายการ${names.length > 0 ? `ใน ${names.join(" · ")}` : IN_SCOPE}`, ...(setAside ? [TH.quick.excludedApplied(setAside)] : [])].join(" · "),
      rows,
      lessons,
      nextActions: actionsForAlert(access, shown[0], dictionary),
    };
  },
});
