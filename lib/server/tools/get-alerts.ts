import type { z } from "zod";
import { alertRowOf } from "@/lib/cards/alert-row";
import { getAlertsInputSchema } from "@/lib/contracts";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { namesOf, resolveFilters } from "@/lib/semantic/dictionary";
import { sliceCovers } from "@/lib/semantic/geo";
import { filtersOfSlice } from "@/lib/semantic/resolved";
import { allAlertsFor, openAlertsFor } from "@/lib/server/alerts";
import { actionsForAlert } from "@/lib/server/next-actions";
import { lessonFor } from "@/lib/server/outcomes";
import { loadDictionary } from "@/lib/server/master-data";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

const NO_ALERTS = "ไม่พบความผิดปกติที่เปิดอยู่ในขอบเขตของผู้ใช้คนนี้";
const DEFAULT_ALERT_LIMIT = 10;
const IN_SCOPE = "ในขอบเขตของคุณ";

export const getAlertsTool = defineTool({
  name: "get_alerts",
  connector: "winyu",
  tier: "read",
  roles: "all",
  description: "Read the anomalies the detection engine raised for this user's scope, newest first, each with a hypothesis and two verify steps. Call it when the user asks what is wrong, what changed, or what needs attention. When the talk is about one metric or place (\"why did Ubon drop\"), pass metric and dims (region, province, agent and the like, by id or Thai name) so only the alerts on that slice come back.",
  input: getAlertsInputSchema,
  execute: async ({ status, limit, metric, dims }: z.infer<typeof getAlertsInputSchema>) => {
    const access = currentAccess();
    const dictionary = await loadDictionary();
    const slice = resolveFilters(dictionary, filtersOfSlice(dims ?? {}));
    if (!slice.ok) return { ok: false as const, code: "BAD_QUERY", error: `ไม่รู้จักค่า "${slice.value}" ของมิติ ${slice.dim}` };
    const inScope = status === "open" ? openAlertsFor(access) : allAlertsFor(access);
    const found = inScope.filter((alert) => (!metric || alert.metric === metric) && sliceCovers(dictionary, slice.filters, alert.dims));
    const shown = found.slice(0, limit ?? DEFAULT_ALERT_LIMIT);
    const rows = shown.map((alert) => alertRowOf(alert, dictionary));
    if (rows.length === 0) return { ok: true as const, summary: NO_ALERTS, rows: [], lessons: [], nextActions: [] };
    const lessons = shown.flatMap((alert) => {
      const lesson = lessonFor(alert);
      return lesson ? [{ alertId: alert.id, lesson }] : [];
    });
    const names = [...(metric ? [metricLabel(metric)] : []), ...Object.values(namesOf(dictionary, slice.filters)).flatMap((labels) => labels ?? [])];
    return {
      ok: true as const,
      summary: `มีความผิดปกติที่เปิดอยู่ ${rows.length} รายการ${names.length > 0 ? `ใน ${names.join(" · ")}` : IN_SCOPE}`,
      rows,
      lessons,
      nextActions: actionsForAlert(access, shown[0], dictionary),
    };
  },
});
