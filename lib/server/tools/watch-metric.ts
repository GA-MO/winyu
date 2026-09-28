import type { z } from "zod";
import { watchMetricInputSchema } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { currentAccess } from "@/lib/server/request-context";
import { conditionLabel, createWatch } from "@/lib/server/watches";
import { defineTool } from "./define";
import { now } from "./shared";

export const watchMetricTool = defineTool({
  name: "watch_metric",
  connector: "winyu",
  tier: "write",
  roles: "all",
  description:
    "Keep watching a metric for the user and notify them when it crosses a line: condition.kind 'below' / 'above' compares each row's value with condition.value (in the metric's unit), 'change' fires when the change against the previous period reaches condition.value percent. Use it when the user says เตือน / แจ้งเมื่อ / คอยดู / ถ้า…ให้บอก. The query is checked every hour under the user's own scope, rolling to the latest data. The user approves it first.",
  input: watchMetricInputSchema,
  execute: async ({ title, query, condition }: z.infer<typeof watchMetricInputSchema>) => {
    const created = await createWatch(currentAccess(), { title, query, condition });
    if (!created.ok) return { ok: false as const, error: created.error };
    return {
      ok: true as const,
      summary: TH.watch.created(title, created.now),
      data: { watchId: created.watch.id, condition: conditionLabel(query, condition), state: created.watch.state, now: created.now },
    };
  },
});
