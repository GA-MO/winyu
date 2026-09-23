import { consolidateMemory, reviewMemory } from "@/lib/engine/memory";
import { memoryFacts } from "@/lib/server/agent/collections";

const REVIEW_FLAG = "--review";

const review = process.argv.includes(REVIEW_FLAG);
const userIds = [...new Set(memoryFacts().all().map((fact) => fact.userId))].sort();
for (const userId of userIds) {
  const result = review ? ((await reviewMemory(userId)) ?? consolidateMemory(userId)) : consolidateMemory(userId);
  console.log(`${userId.padEnd(12)} ${String(result.before).padStart(4)} → ${result.after}`);
}
