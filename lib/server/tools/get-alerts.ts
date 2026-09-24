import type { z } from "zod";
import { alertRowOf } from "@/lib/cards/alert-row";
import { getAlertsInputSchema } from "@/lib/contracts";
import { allAlertsFor, openAlertsFor } from "@/lib/server/alerts";
import { actionsForAlert } from "@/lib/server/next-actions";
import { lessonFor } from "@/lib/server/outcomes";
import { loadDictionary } from "@/lib/server/master-data";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

const NO_ALERTS = "ไม่พบความผิดปกติที่เปิดอยู่ในขอบเขตของผู้ใช้คนนี้";
const DEFAULT_ALERT_LIMIT = 10;

export const getAlertsTool = defineTool({
  name: "get_alerts",
  connector: "cop",
  tier: "read",
  roles: "all",
  description: "Read the anomalies the detection engine raised for this user's scope, newest first, each with a hypothesis and two verify steps. Call it when the user asks what is wrong, what changed, or what needs attention.",
  input: getAlertsInputSchema,
  execute: async ({ status, limit }: z.infer<typeof getAlertsInputSchema>) => {
    const access = currentAccess();
    const found = status === "open" ? openAlertsFor(access) : allAlertsFor(access);
    const shown = found.slice(0, limit ?? DEFAULT_ALERT_LIMIT);
    const dictionary = await loadDictionary();
    const rows = shown.map((alert) => alertRowOf(alert, dictionary));
    if (rows.length === 0) return { ok: true as const, summary: NO_ALERTS, rows: [], lessons: [], nextActions: [] };
    const lessons = shown.flatMap((alert) => {
      const lesson = lessonFor(alert);
      return lesson ? [{ alertId: alert.id, lesson }] : [];
    });
    return {
      ok: true as const,
      summary: `มีความผิดปกติที่เปิดอยู่ ${rows.length} รายการในขอบเขตของคุณ`,
      rows,
      lessons,
      nextActions: actionsForAlert(access, found[0] ?? null, dictionary),
    };
  },
});
