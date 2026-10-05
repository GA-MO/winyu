import { describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { accessFor } from "@/lib/access/policies";
import type { MetricQuery } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess } from "@/lib/server/request-context";
import { DataCard } from "./data-card";

const QUERY: MetricQuery = {
  metric: "net_sales_value",
  dims: ["region"],
  filters: {},
  range: { from: "2026-09-01", to: "2026-09-22" },
  grain: "month",
  compare: "prev_period",
  limit: null,
};

async function queryMetricAs(userId: string): Promise<Record<string, unknown>> {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  const tool = winyuTools().query_metric;
  return runWithAccess(accessFor(user), () => tool.execute(tool.inputSchema().parse(QUERY)) as Promise<Record<string, unknown>>);
}

function numbersIn(text: string): string[] {
  return text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
}

function decimalsOf(token: string): number {
  return token.split(".")[1]?.length ?? 0;
}

/** A shown number is grounded when the result carries it as text or as a value that rounds to it. */
function groundedIn(source: string): (token: string) => boolean {
  const values = numbersIn(source).map((token) => Number(token.replaceAll(",", "")));
  return (token) => {
    if (source.includes(token)) return true;
    const shown = Number(token.replaceAll(",", ""));
    const decimals = decimalsOf(token);
    return values.some((value) => Number(value.toFixed(decimals)) === shown);
  };
}

async function render(node: React.ReactNode): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  await act(async () => createRoot(host).render(node));
  return host;
}

describe("DataCard from a real query_metric result", () => {
  test("shows the headline first and no number the result does not carry", async () => {
    const result = await queryMetricAs("u_thana");
    const headline = (result.headline as { value: string }).value;
    const card = await render(<DataCard title="ยอดขายเป็นเงินแยกตามภาค" source={result} />);
    const text = card.textContent ?? "";
    expect(text).toContain(headline);
    const grounded = groundedIn(JSON.stringify(result));
    const strange = numbersIn(text).filter((token) => !grounded(token));
    expect(strange).toEqual([]);
  });
});
