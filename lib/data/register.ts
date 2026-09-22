import type { DataPort } from "@/lib/server/agent/data-port";
import { describeEntity, listMetrics, runMetric } from "./query";

export const realDataPort: DataPort = { runMetric, listMetrics, describeEntity };
