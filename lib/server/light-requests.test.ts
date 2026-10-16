import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ENGINE_PACKAGES = /^(@mastra\/|@ag-ui\/|@copilotkit\/runtime|@ai-sdk\/|ai$|@openrouter\/|@opentelemetry\/)/;
const SOURCE_EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
const LIGHT_ENTRIES = [
  "lib/server/session.ts",
  "lib/access/enforce.ts",
  "lib/server/feed.ts",
  "app/api/labels/route.ts",
  "app/api/feed/route.ts",
  "app/(app)/page.tsx",
  "app/(app)/dashboard/page.tsx",
  "app/(app)/memory/page.tsx",
  "app/(app)/c/[threadId]/page.tsx",
];
const transpiler = new Bun.Transpiler({ loader: "tsx" });

function sourceOf(specifier: string, from: string): string | null {
  const base = specifier.startsWith("@/") ? path.join(ROOT, specifier.slice(2)) : path.resolve(path.dirname(from), specifier);
  return SOURCE_EXTENSIONS.map((extension) => base + extension).find((candidate) => existsSync(candidate) && candidate.match(/\.tsx?$/)) ?? null;
}

function isLocal(specifier: string): boolean {
  return specifier.startsWith("@/") || specifier.startsWith(".");
}

/** Every engine package the entry loads at module evaluation, with the file that imports it; dynamic imports and type-only imports are not followed. */
function engineImportsOf(entry: string): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  const queue = [path.join(ROOT, entry)];
  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    for (const { path: specifier, kind } of transpiler.scanImports(readFileSync(file, "utf8"))) {
      if (kind !== "import-statement") continue;
      if (!isLocal(specifier)) {
        if (ENGINE_PACKAGES.test(specifier)) found.push(`${specifier} <- ${path.relative(ROOT, file)}`);
        continue;
      }
      const next = sourceOf(specifier, file);
      if (next) queue.push(next);
    }
  }
  return found;
}

describe("requests that only read domain data", () => {
  test.each(LIGHT_ENTRIES)("%s loads no agent engine or model SDK until a tool needs one", (entry) => {
    expect(engineImportsOf(entry)).toEqual([]);
  });

  test("the walk does find the engine where it is loaded", () => {
    expect(engineImportsOf("lib/harness/adapters/mastra/agent.ts").length).toBeGreaterThan(0);
  });
});
