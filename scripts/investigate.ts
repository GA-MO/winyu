import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { LanguageModel } from "ai";
import { accessFor } from "@/lib/access/policies";
import { presentCard } from "@/lib/cards/present";
import type { AccessContext, DraftStory, Investigation, Story } from "@/lib/contracts";
import { USERS, findUser } from "@/lib/data/entities/users";
import { toolsForAccess } from "@/lib/server/agent/tools";
import { evidenceIndexOf, investigate, reviewDrafts, saveInvestigation, storiesFrom, type EvidenceIndex, type InvestigationRun, type ReviewedDraft, type ToolCall } from "@/lib/server/investigate";
import { models } from "@/lib/server/models";
import { runWithAccess } from "@/lib/server/request-context";

const DEFAULT_USERS = "u_prasit";
const DEFAULT_CONCURRENCY = 4;
const OUT_DIR = path.join(process.cwd(), "sim", "investigations");
const SHOWN_TEXT = 400;

type SavedRun = Omit<InvestigationRun, "investigation"> & { investigation: Investigation; replayedAt?: string; drafts?: DraftStory[] };

function argOf(name: string, fallback: string): string {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function usersOf(requested: string): string[] {
  return requested === "all" ? USERS.map((user) => user.id) : requested.split(",");
}

function runPath(userId: string): string {
  return path.join(OUT_DIR, `${userId}.json`);
}

function readRun(userId: string): SavedRun {
  return JSON.parse(readFileSync(runPath(userId), "utf8")) as SavedRun;
}

function writeRun(userId: string, run: SavedRun): void {
  writeFileSync(runPath(userId), JSON.stringify(run, null, 2));
}

function realModel(): { id: string; model: LanguageModel } {
  const [id, entry] = Object.entries(models())[0] ?? [];
  if (!id || id === "mock" || !entry || typeof entry !== "object" || !("model" in entry)) throw new Error("no real model configured (set OPENROUTER_API_KEY)");
  return { id, model: typeof entry.model === "function" ? entry.model() : entry.model };
}

function storyLines(story: Story): string[] {
  const evidence = story.evidence ? `    ▣ ${story.evidence.title} · ${story.evidence.query.metric} ${JSON.stringify(story.evidence.query.dims)} ${JSON.stringify(story.evidence.query.filters)} ${story.evidence.query.compare}` : "    (no card)";
  return [
    `  [${story.kind}] ${story.scope} · ${story.finding}`,
    evidence,
    ...story.ruledOut.map((item) => `    ✗ ${item.text} (${item.source})`),
    ...(story.action ? [`    → ${story.action}`] : []),
  ];
}

async function runOne(userId: string, model: LanguageModel, modelId: string, save: boolean): Promise<string> {
  const started = Date.now();
  const run = await investigate(userId, model, modelId);
  writeRun(userId, run);
  if (save) saveInvestigation(run.investigation);
  const { investigation } = run;
  const header = `\n== ${userId} · ${investigation.checkedCount} tool calls · $${investigation.costUsd.toFixed(4)} · ${((Date.now() - started) / 1000).toFixed(0)}s`;
  const dropped = run.dropped.map((entry) => `  ⚠ dropped "${entry.finding}": ${[...entry.ungrounded, ...entry.names].join(", ")}`);
  return [header, ...investigation.stories.flatMap(storyLines), ...dropped].join("\n");
}

async function runModel(users: string[], save: boolean): Promise<void> {
  const { id, model } = realModel();
  const concurrency = Number(argOf("concurrency", String(DEFAULT_CONCURRENCY)));
  mkdirSync(OUT_DIR, { recursive: true });
  const queue = [...users];
  const workers = Array.from({ length: concurrency }, async () => {
    for (let userId = queue.shift(); userId; userId = queue.shift()) {
      console.log(await runOne(userId, model, id, save).catch((error: unknown) => `\n== ${userId} failed: ${String(error)}`));
    }
  });
  await Promise.all(workers);
}

async function replayCall(userId: string, call: ToolCall): Promise<{ call: ToolCall; replayed: boolean }> {
  const access = accessOf(userId);
  const definition = toolsForAccess(access)[call.tool] as { execute?: (args: unknown, options: unknown) => Promise<unknown> } | undefined;
  if (!definition?.execute) return { call, replayed: false };
  const execute = definition.execute;
  const output = await runWithAccess(access, () => execute(call.input, {})).catch(() => null);
  return output === null ? { call, replayed: false } : { call: { ...call, output }, replayed: true };
}

async function replay(users: string[]): Promise<void> {
  for (const userId of users) {
    if (!existsSync(runPath(userId))) continue;
    const run = readRun(userId);
    const results = await Promise.all(run.calls.map((call) => replayCall(userId, call)));
    const kept = results.filter((result) => !result.replayed).map((result) => result.call.tool);
    writeRun(userId, { ...run, calls: results.map((result) => result.call), replayedAt: new Date().toISOString() });
    console.log(`${userId}: replayed ${results.length - kept.length}/${results.length}${kept.length > 0 ? ` · kept saved output of ${kept.join(", ")}` : ""}`);
  }
}

function clip(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > SHOWN_TEXT ? `${text.slice(0, SHOWN_TEXT)}…` : text;
}

function accessOf(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  return accessFor(user);
}

function cardLine(evidence: EvidenceIndex, index: number): string | null {
  const answer = evidence.get(index);
  if (!answer) return null;
  const hero = presentCard({ title: "", query: answer.query, result: answer }).hero;
  const shown = hero ? `${hero.value}${hero.delta ? ` ${hero.delta}` : ""}` : "no headline";
  const monthEnd = answer.headline.projection ? ` · month end ${answer.headline.projection.attainment}` : "";
  return `     ▣ can be evidence · card: ${answer.query.metric} by ${answer.query.dims.join(",") || "total"} · shows ${shown}${monthEnd}`;
}

function callLine(call: ToolCall, index: number, evidence: EvidenceIndex): string {
  const summary = (call.output as { summary?: unknown } | null)?.summary;
  const card = cardLine(evidence, index);
  return [`#${index} ${call.tool} ${clip(call.input)}`, ...(card ? [card] : []), `     ${clip(summary ?? call.output)}`].join("\n");
}

async function show(users: string[]): Promise<void> {
  for (const userId of users) {
    const user = findUser(userId);
    const run = readRun(userId);
    const evidence = await evidenceIndexOf(run.calls, accessOf(userId));
    console.log(`\n==== ${userId} · ${user?.title} (${user?.role})`);
    console.log("-- stories written before:");
    for (const story of run.investigation.stories) console.log(`   ${JSON.stringify(story)}`);
    console.log("-- analyst notes:");
    console.log(run.notes);
    console.log(`-- tool calls (full outputs: .calls[<index>].output in ${path.relative(process.cwd(), runPath(userId))}):`);
    run.calls.forEach((call, index) => console.log(callLine(call, index, evidence)));
  }
}

function reviewLines(userId: string, reviewed: readonly ReviewedDraft[]): string[] {
  return reviewed.flatMap((entry, index) => {
    const issues = [...entry.ungrounded.map((number) => `ungrounded ${number}`), ...entry.names.map((name) => `names ${name}`), ...entry.problems];
    return issues.length === 0 ? [] : [`${userId} story ${index} "${entry.draft.finding}": ${issues.join(" · ")}`];
  });
}

async function applyDrafts(file: string, save: boolean): Promise<void> {
  const drafts = JSON.parse(readFileSync(file, "utf8")) as Record<string, DraftStory[]>;
  let failing = 0;
  for (const [userId, stories] of Object.entries(drafts)) {
    const run = readRun(userId);
    const evidence = await evidenceIndexOf(run.calls, accessOf(userId));
    const reviewed = reviewDrafts(stories, run.calls, evidence);
    const lines = reviewLines(userId, reviewed);
    lines.forEach((line) => console.log(line));
    if (lines.length > 0) {
      failing += 1;
      continue;
    }
    const kept = storiesFrom(userId, reviewed, run.calls, evidence);
    const investigation: Investigation = { ...run.investigation, stories: kept.stories };
    console.log(`${userId}: ${kept.stories.length} stories pass${save ? " · saved" : ""}`);
    if (!save) continue;
    saveInvestigation(investigation);
    writeRun(userId, { ...run, investigation, drafts: stories, dropped: kept.dropped });
  }
  if (failing > 0) process.exitCode = 1;
}

async function main() {
  const users = usersOf(argOf("users", DEFAULT_USERS));
  const save = process.argv.includes("--save");
  const drafts = argOf("drafts", "");
  if (drafts) return applyDrafts(drafts, save);
  if (process.argv.includes("--replay")) return replay(users);
  if (process.argv.includes("--show")) return show(users);
  await runModel(users, save);
}

await main();
