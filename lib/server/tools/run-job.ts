import type { z } from "zod";
import { runJobInputSchema } from "@/lib/contracts";
import { runAnomalyJob, runEngineJobs, runForecastJob } from "@/lib/server/alerts";
import { runDigestJob } from "@/lib/server/digest";
import { runWatchJob } from "@/lib/server/watches";
import { defineTool } from "./define";

export const runJobTool = defineTool({
  name: "run_job",
  connector: "cop",
  tier: "destructive",
  roles: ["it_admin"],
  description: "Run one batch job of the analytics plane: anomaly detection, forecasting or dashboard composition. IT administrators only; the user approves it first.",
  input: runJobInputSchema,
  execute: async ({ job }: z.infer<typeof runJobInputSchema>) => {
    if (job === "anomaly") return { ok: true as const, summary: "รันการตรวจจับความผิดปกติแล้ว", data: runAnomalyJob() };
    if (job === "forecast") return { ok: true as const, summary: "รันการพยากรณ์แล้ว", data: runForecastJob() };
    if (job === "watches") return { ok: true as const, summary: "ตรวจเรื่องที่ผู้ใช้เฝ้าดูแล้ว", data: await runWatchJob() };
    if (job === "digest") return { ok: true as const, summary: "ส่งสรุปตอนเช้าแล้ว", data: await runDigestJob() };
    return { ok: true as const, summary: "รันงานเบื้องหลังทั้งหมดแล้ว", data: runEngineJobs() };
  },
});
