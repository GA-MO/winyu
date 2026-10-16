import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { NextAction, User } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { actOnMatter } from "./act";
import { createShare } from "./deliver";
import { shares } from "./shares";
import { openShare } from "./view";

setDefaultTimeout(60_000);

const CEO = "u_thana";
const RSM = "u_anucha";
const REP = "u_krit";
const ISAN_CARD = { kind: "tool" as const, reads: [{ tool: "query_metric", input: { metric: "net_sales_volume", dims: ["agent"], filters: { region: ["northeast"] }, range: { from: "2026-11-01", to: "2026-11-26" }, grain: "month", compare: "target", limit: null } }] };
const made: string[] = [];

function user(id: string): User {
  const found = findUser(id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

function sendTargets(result: unknown): string[] {
  const actions = (result as { nextActions?: NextAction[] } | null)?.nextActions ?? [];
  return actions.filter((action) => action.kind === "send").flatMap((action) => {
    const to = action.input?.to;
    return Array.isArray(to) ? to.filter((id): id is string => typeof id === "string") : [];
  });
}

async function chainMatter() {
  const outcome = await createShare(user(CEO), { card: ISAN_CARD, question: null, ask: "ยอดขายเข้าอีสานจะหลุดเป้า", intent: "act", urgency: "now", recipients: [{ userId: RSM, channel: "winyu" }] });
  if (!outcome.ok) throw new Error(outcome.error);
  made.push(outcome.share.id);
  actOnMatter(user(RSM), outcome.share.id, { kind: "pass_on", toUserId: REP });
  actOnMatter(user(REP), outcome.share.id, { kind: "accept" });
  const matter = shares().get(outcome.share.id);
  if (!matter) throw new Error("matter not stored");
  return matter;
}

afterEach(() => {
  for (const id of made) shares().remove(id);
  made.length = 0;
});

describe("a matter page never offers to send the card to someone already on its path (AI-154)", () => {
  test("the CEO who sent it and the rep who took it are not offered 'send to the RSM' on the card", async () => {
    const matter = await chainMatter();
    for (const viewer of [CEO, REP, RSM]) {
      const view = await openShare(matter, user(viewer));
      const targets = view.reads.flatMap((read) => sendTargets(read.result));
      expect({ viewer, targets: targets.filter((id) => [CEO, RSM, REP].includes(id)) }).toEqual({ viewer, targets: [] });
    }
  });
});
