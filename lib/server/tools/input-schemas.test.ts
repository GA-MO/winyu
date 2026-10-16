import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { adminAuditInputSchema } from "@/lib/contracts";
import { toolSurface, winyuTool } from "./registry";

type JsonNode = { type?: string | string[]; anyOf?: JsonNode[]; properties?: Record<string, JsonNode>; required?: string[] };

function acceptsNull(node: JsonNode): boolean {
  if (node.type === "null") return true;
  if (Array.isArray(node.type) && node.type.includes("null")) return true;
  return node.anyOf?.some(acceptsNull) ?? false;
}

function objectOf(node: JsonNode): JsonNode {
  return node.anyOf?.find((variant) => variant.type === "object") ?? node;
}

function requiredNullable(node: JsonNode, at: string): string[] {
  const required = new Set(node.required ?? []);
  return Object.entries(node.properties ?? {}).flatMap(([key, child]) => {
    const own = required.has(key) && acceptsNull(child) ? [`${at}${key}`] : [];
    return [...own, ...requiredNullable(objectOf(child), `${at}${key}.`)];
  });
}

describe("tool inputs the model may leave a field out of", () => {
  test("a field that takes null is never required, so leaving it out is not a failed call", () => {
    const trapped = toolSurface().flatMap((entry) => {
      const tool = winyuTool(entry.name);
      if (!tool) return [];
      const schema = z.toJSONSchema(tool.inputSchema(), { io: "input" }) as JsonNode;
      return requiredNullable(schema, `${entry.name}.`);
    });
    expect(trapped).toEqual([]);
  });

  test("admin_audit takes denials and activity without a role, as the IT run-sheet question asks them", () => {
    for (const topic of ["denials", "activity"] as const) {
      const parsed = adminAuditInputSchema.safeParse({ days: 7, topic });
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual({ topic, days: 7, role: null });
    }
  });

  test("admin_audit with nothing but a topic reads the default window for every role", () => {
    expect(adminAuditInputSchema.parse({ topic: "user_usage" })).toEqual({ topic: "user_usage", days: null, role: null });
  });
});
