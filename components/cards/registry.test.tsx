import { describe, expect, test } from "bun:test";
import { toolSurface } from "@/lib/server/tools/registry";
import { renderApproval } from "./approval-card";
import { COMPOSE_TOOL } from "@/lib/compose/catalog";
import { TOOL_CARDS } from "./registry";

const READ_TIER = "read";

describe("every tool has a way to be drawn", () => {
  test("each read tool on the surface has a card; compose_card's result is the card the model composed, drawn by the chat", () => {
    const reads = toolSurface().filter((entry) => entry.tier === READ_TIER && entry.name !== COMPOSE_TOOL).map((entry) => entry.name);
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.filter((name) => !(name in TOOL_CARDS))).toEqual([]);
  });

  test("each write tool draws an approval decision", () => {
    const writes = toolSurface().filter((entry) => entry.tier !== READ_TIER).map((entry) => entry.name);
    const undrawn = writes.filter((tool) => renderApproval({ tool, input: {}, approved: null, approve: () => undefined, reject: () => undefined }) === null);
    expect(undrawn).toEqual([]);
  });
});
