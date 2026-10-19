import { describe, expect, test } from "bun:test";
import type { Tool, ToolExecutionContext } from "@mastra/core/tools";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { toolsForAccess } from "@/lib/server/agent/tools";
import { mastraTools } from "./tools";

const SALES_BY_REGION = { metric: "net_sales_volume", dims: ["region"], filters: {}, range: { from: "2026-09-01", to: "2026-09-30" }, grain: "month", compare: "none", limit: 10 };

type SpanMetadata = { gateway?: { type: string }[] };

describe("a Mastra tool call outside any harness run", () => {
  test("writes the gateway's decisions on its span", async () => {
    const user = findUser("u_thana");
    if (!user) throw new Error("missing u_thana");
    const access = liveAccessFor(user);
    const queryMetric = mastraTools(toolsForAccess(access), access).query_metric as Tool;
    const updates: SpanMetadata[] = [];
    const currentSpan = { update: ({ metadata }: { metadata: SpanMetadata }) => updates.push(metadata) };
    const context = { agent: { toolCallId: "studio-call-1" }, tracingContext: { currentSpan } } as unknown as ToolExecutionContext;
    await queryMetric.execute?.(SALES_BY_REGION, context);
    expect(updates.flatMap((metadata) => metadata.gateway ?? []).map((step) => step.type)).toEqual(["tool.authorized", "tool.started", "tool.completed", "observation.created", "verification.passed"]);
  });
});
