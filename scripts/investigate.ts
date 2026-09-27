import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { LanguageModel } from "ai";
import type { Story } from "@/lib/contracts";
import { USERS } from "@/lib/data/entities/users";
import { investigate, saveInvestigation } from "@/lib/server/investigate";
import { models } from "@/lib/server/models";

const DEFAULT_USERS = "u_prasit";
const DEFAULT_CONCURRENCY = 4;
const OUT_DIR = path.join(process.cwd(), "sim", "investigations");
const VERDICT_MARKS = { confirmed: "✓", likely: "~", ruled_out: "✗", unknown: "?" } as const;

function argOf(name: string, fallback: string): string {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function realModel(): { id: string; model: LanguageModel } {
  const [id, entry] = Object.entries(models())[0] ?? [];
  if (!id || id === "mock" || !entry || typeof entry !== "object" || !("model" in entry)) throw new Error("no real model configured (set OPENROUTER_API_KEY)");
  return { id, model: typeof entry.model === "function" ? entry.model() : entry.model };
}

function storyLines(story: Story): string[] {
  const owner = story.owner ? ` · เจ้าของ ${story.owner.nameTh}` : "";
  return [
    `  [${story.kind}] ${story.claim}`,
    `    ${story.scope} · ${story.period} · ${story.headline.label} ${story.headline.value}${story.projection ? ` → ${story.projection.label} ${story.projection.value}` : ""}${owner}`,
    ...story.causes.map((cause) => `    · ${cause.label} ${cause.value} (${cause.detail})${cause.shareOfGap ? ` ≈ ${cause.shareOfGap} ของช่องว่าง` : ""}`),
    ...story.checked.map((check) => `    ${VERDICT_MARKS[check.verdict]} ${check.text}`),
    ...(story.recommendation ? [`    → ${story.recommendation}`] : []),
  ];
}

async function runOne(userId: string, model: LanguageModel, modelId: string, save: boolean): Promise<string> {
  const started = Date.now();
  const run = await investigate(userId, model, modelId);
  writeFileSync(path.join(OUT_DIR, `${userId}.json`), JSON.stringify(run, null, 2));
  if (save) saveInvestigation(run.investigation);
  const { investigation } = run;
  const header = `\n== ${userId} · ${investigation.checkedCount} tool calls · $${investigation.costUsd.toFixed(4)} · ${((Date.now() - started) / 1000).toFixed(0)}s`;
  const dropped = run.dropped.map((entry) => `  ⚠ dropped "${entry.claim}": ${entry.ungrounded.join(", ")}`);
  return [header, ...investigation.stories.flatMap(storyLines), ...dropped].join("\n");
}

async function main() {
  const { id, model } = realModel();
  const requested = argOf("users", DEFAULT_USERS);
  const users = requested === "all" ? USERS.map((user) => user.id) : requested.split(",");
  const concurrency = Number(argOf("concurrency", String(DEFAULT_CONCURRENCY)));
  const save = process.argv.includes("--save");
  mkdirSync(OUT_DIR, { recursive: true });
  const queue = [...users];
  const workers = Array.from({ length: concurrency }, async () => {
    for (let userId = queue.shift(); userId; userId = queue.shift()) {
      console.log(await runOne(userId, model, id, save).catch((error: unknown) => `\n== ${userId} failed: ${String(error)}`));
    }
  });
  await Promise.all(workers);
}

await main();
