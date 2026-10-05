import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { USERS } from "@/lib/data/entities/users";
import { runEngineJobs } from "@/lib/server/alerts";
import { runDigestJob } from "@/lib/server/digest";
import { investigate, latestInvestigation, saveInvestigation } from "@/lib/server/investigate";
import { agentModel } from "@/lib/server/models";
import { runWatchJob } from "@/lib/server/watches";
import { winyuMastra } from "./agent";

const TIMEZONE = "Asia/Bangkok";
const JOBS_WORKFLOW = "winyu-jobs";
const INVESTIGATION_WORKFLOW = "morning-investigation";
const INVESTIGATION_CONCURRENCY = 3;
const INVESTIGATION_CRON = "0 6 * * *";

const JOB_NAMES = ["engine", "watches", "digest"] as const;

/** A batch job the schedule runs. */
export type JobName = (typeof JOB_NAMES)[number];

const JOBS: Record<JobName, { cron: string; run: () => Promise<unknown> }> = {
  engine: { cron: "0 0 * * *", run: async () => runEngineJobs() },
  watches: { cron: "0 * * * *", run: () => runWatchJob(new Date()) },
  digest: { cron: "0 7 * * *", run: () => runDigestJob(new Date()) },
};

const jobInput = z.object({ job: z.enum(JOB_NAMES) });
const personInput = z.object({ userId: z.string() });
const personOutput = z.object({ userId: z.string(), saved: z.boolean(), stories: z.number() });

const runJob = createStep({
  id: "run-job",
  inputSchema: jobInput,
  outputSchema: z.object({ job: z.enum(JOB_NAMES), result: z.unknown() }),
  execute: async ({ inputData }) => ({ job: inputData.job, result: await JOBS[inputData.job].run() }),
});

const investigatePerson = createStep({
  id: "investigate-person",
  inputSchema: personInput,
  outputSchema: personOutput,
  execute: async ({ inputData }) => {
    const configured = agentModel();
    if (!configured) return { userId: inputData.userId, saved: false, stories: 0 };
    const run = await investigate(inputData.userId, configured.model(), configured.id).catch((error: unknown) => {
      console.error(`[Winyu] investigation for ${inputData.userId} failed`, error);
      return null;
    });
    if (!run) return { userId: inputData.userId, saved: false, stories: 0 };
    saveInvestigation(run.investigation);
    return { userId: inputData.userId, saved: true, stories: run.investigation.stories.length };
  },
});

function jobsWorkflow() {
  return createWorkflow({
    id: JOBS_WORKFLOW,
    inputSchema: jobInput,
    outputSchema: z.object({ job: z.enum(JOB_NAMES), result: z.unknown() }),
    schedule: JOB_NAMES.map((job) => ({ id: job, cron: JOBS[job].cron, timezone: TIMEZONE, inputData: { job } })),
  })
    .then(runJob)
    .commit();
}

function investigationWorkflow() {
  const daily = process.env.INVESTIGATE_DAILY === "1" ? { schedule: { cron: INVESTIGATION_CRON, timezone: TIMEZONE, inputData: {} } } : {};
  return createWorkflow({
    id: INVESTIGATION_WORKFLOW,
    inputSchema: z.object({ userIds: z.array(z.string()).optional() }),
    outputSchema: z.array(personOutput),
    ...daily,
  })
    .map(async ({ inputData }) => (inputData.userIds ?? USERS.map((user) => user.id)).map((userId) => ({ userId })))
    .foreach(investigatePerson, { concurrency: INVESTIGATION_CONCURRENCY })
    .commit();
}

/** The workflows the Mastra instance registers: the batch jobs on their Bangkok cron (engine at midnight, watches hourly, digest at 07:00) and the morning investigation (06:00 when `INVESTIGATE_DAILY=1`, otherwise only when started). */
export function winyuWorkflows() {
  return { [JOBS_WORKFLOW]: jobsWorkflow(), [INVESTIGATION_WORKFLOW]: investigationWorkflow() };
}

/** Whether this process fires the schedules; `WINYU_SCHEDULER=off` keeps every job from starting on its own. */
export function schedulerEnabled(): boolean {
  return process.env.WINYU_SCHEDULER !== "off";
}

/** One person's progress in an investigation run: whether their stories were saved since the run started, and how many. */
export type PersonProgress = { userId: string; done: boolean; stories: number };

/** An investigation run as the jobs route reports it: Mastra's run status and each person's progress read from the saved investigations. */
export type InvestigationProgress = { runId: string; status: string; startedAt: string; people: PersonProgress[] };

function investigationRuns() {
  return winyuMastra().getWorkflow(INVESTIGATION_WORKFLOW);
}

/** Starts the morning investigation for some people in the background and returns its run id at once; each person is a traced run with its own tool budget, three at a time. */
export async function startInvestigation(userIds: readonly string[]): Promise<string> {
  const run = await investigationRuns().createRun();
  const { runId } = await run.startAsync({ inputData: { userIds: [...userIds] } });
  return runId;
}

function personInputs(payload: unknown): string[] {
  const parsed = z.object({ userIds: z.array(z.string()).optional() }).safeParse(payload);
  if (!parsed.success) return [];
  return parsed.data.userIds ?? USERS.map((user) => user.id);
}

/** How far an investigation run has got, or null for a run id Mastra does not know. */
export async function investigationProgress(runId: string): Promise<InvestigationProgress | null> {
  const state = await investigationRuns().getWorkflowRunById(runId);
  if (!state) return null;
  const startedAt = new Date(state.createdAt).toISOString();
  const input = personInputs(state.payload);
  const people = input.map((userId) => {
    const saved = latestInvestigation(userId);
    const done = saved !== null && saved.at >= startedAt;
    return { userId, done, stories: done ? saved.stories.length : 0 };
  });
  return { runId, status: state.status, startedAt, people };
}
