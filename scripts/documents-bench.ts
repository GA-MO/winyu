import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RoleId } from "@/lib/contracts";

const USAGE = `usage: bun run docs:bench [--embedder=local|trigram] [--show-misses]
  Measures document retrieval with no model call ($0), on a fresh index in a temporary folder:
  recall      for each benchmark question, whether the expected section is the first passage and among the first 3, per retrieval mode (vector, keyword, hybrid)
  forbidden   for questions about documents the asker may not read, how many returned passages come from such documents (must be 0)
  separation  the top score of answerable against unanswerable questions, to see whether a threshold could say "not in the documents"`;

const QUESTIONS_FILE = path.join(process.cwd(), "evals", "documents-bench.json");
const MODES = ["vector", "keyword", "hybrid"] as const;
const TOP_K = 3;
const VECTOR_PROBE_K = 12;

type Kind = "everyday" | "reworded" | "unanswerable" | "forbidden";
type Question = { q: string; role: RoleId; expect: { doc: string; section: string }[]; kind: Kind };

if (process.argv.includes("--help")) {
  console.log(USAGE);
  process.exit(0);
}

const dataDir = mkdtempSync(path.join(tmpdir(), "winyu-docs-bench-"));
process.env.WINYU_DATA_DIR = dataDir;
process.on("exit", () => rmSync(dataDir, { recursive: true, force: true }));

const { useEmbedder } = await import("@/lib/server/recall/embedder");
const { TRIGRAM_EMBEDDER } = await import("@/lib/server/recall/trigram-embedder");
const { indexDocuments } = await import("@/lib/server/documents/index-documents");
const { searchDocuments } = await import("@/lib/server/documents/search");
const { readableChunks } = await import("@/lib/server/documents/corpus");
const { documentVectorSearch } = await import("@/lib/harness/adapters/mastra/documents-index");

if (process.argv.includes("--embedder=trigram")) useEmbedder(TRIGRAM_EMBEDDER);
const showMisses = process.argv.includes("--show-misses");
const questions = JSON.parse(readFileSync(QUESTIONS_FILE, "utf8")) as Question[];

const indexStarted = performance.now();
const report = await indexDocuments();
console.log(`index: ${report.total} sections with ${report.embedder} in ${((performance.now() - indexStarted) / 1000).toFixed(1)} s`);

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? 0;
}

function matches(found: { chunk: { docId: string; section: string } }, expected: Question["expect"]): boolean {
  return expected.some((wanted) => found.chunk.docId === wanted.doc && (found.chunk.section === wanted.section || found.chunk.section.endsWith(` › ${wanted.section}`) || found.chunk.section.startsWith(`${wanted.section} › `)));
}

const answerable = questions.filter((question) => question.kind === "everyday" || question.kind === "reworded");
const kinds: Kind[] = ["everyday", "reworded"];

console.log(`\nrecall (${answerable.length} questions): first passage / in top ${TOP_K}`);
for (const mode of MODES) {
  const timings: number[] = [];
  const line: string[] = [];
  const misses: string[] = [];
  for (const kind of kinds) {
    const asked = answerable.filter((question) => question.kind === kind);
    let first = 0;
    let top = 0;
    for (const question of asked) {
      const started = performance.now();
      const found = await searchDocuments(question.role, question.q, { limit: TOP_K, mode });
      timings.push(performance.now() - started);
      if (found[0] && matches(found[0], question.expect)) first += 1;
      if (found.some((hit) => matches(hit, question.expect))) top += 1;
      else misses.push(`  ${kind} "${question.q}" → ${found.map((hit) => `${hit.chunk.docId}:${hit.chunk.section}`).join(" | ") || "nothing"}`);
    }
    line.push(`${kind} ${first}/${asked.length} · ${top}/${asked.length}`);
  }
  console.log(`  ${mode.padEnd(7)} ${line.join("   ")}   query p50 ${percentile(timings, 0.5).toFixed(1)} ms`);
  if (showMisses) for (const miss of misses) console.log(miss);
}

const forbidden = questions.filter((question) => question.kind === "forbidden");
let leaked = 0;
let vectorShort = 0;
for (const question of forbidden) {
  const readable = new Set(readableChunks(question.role).map((chunk) => chunk.id));
  for (const mode of MODES) leaked += (await searchDocuments(question.role, question.q, { mode })).filter((hit) => !readable.has(hit.chunk.id)).length;
  const vector = await documentVectorSearch(question.role, question.q, VECTOR_PROBE_K);
  if (vector.length < VECTOR_PROBE_K || vector.some((hit) => !readable.has(hit.id))) vectorShort += 1;
}
console.log(`\nforbidden (${forbidden.length} questions, every mode): ${leaked} passages from documents the asker may not read; vector query short or leaking on ${vectorShort}`);

const unanswerable = questions.filter((question) => question.kind === "unanswerable");
console.log(`\nseparation: top-1 score, answerable (${answerable.length}) against unanswerable (${unanswerable.length}), p10 / p50 / p90`);
for (const mode of ["vector", "keyword"] as const) {
  const topScore = async (question: Question) => (await searchDocuments(question.role, question.q, { limit: 1, mode }))[0]?.score ?? 0;
  const answered = await Promise.all(answerable.map(topScore));
  const unanswered = await Promise.all(unanswerable.map(topScore));
  const show = (values: number[]) => [0.1, 0.5, 0.9].map((fraction) => percentile(values, fraction).toFixed(3)).join(" / ");
  console.log(`  ${mode.padEnd(7)} answerable ${show(answered)}   unanswerable ${show(unanswered)}   answerable below the best unanswerable: ${answered.filter((score) => score <= Math.max(...unanswered)).length}`);
}
process.exit(leaked > 0 ? 1 : 0);
