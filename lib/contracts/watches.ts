import { z } from "zod";
import { metricQuerySchema, type MetricQuery } from "./semantic";

export const WATCH_CONDITIONS = ["below", "above", "change"] as const;

export const watchConditionSchema = z.object({ kind: z.enum(WATCH_CONDITIONS), value: z.number() });

export type WatchCondition = z.infer<typeof watchConditionSchema>;

/** A standing question the user asked once: the query and the line it must not cross; never a stored value. */
export type PersonalWatch = {
  id: string;
  userId: string;
  title: string;
  query: MetricQuery;
  windowDays: number;
  condition: WatchCondition;
  createdAt: string;
  state: "ok" | "triggered";
  lastCheckedAt: string | null;
  lastTriggeredAt: string | null;
};

export const watchMetricInputSchema = z.object({ title: z.string().min(1), query: metricQuerySchema, condition: watchConditionSchema });

/** A watch as the account sheet lists it. */
export type WatchItem = { id: string; title: string; condition: string; state: PersonalWatch["state"] };
