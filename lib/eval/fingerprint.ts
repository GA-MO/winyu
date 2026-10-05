import { createHash } from "node:crypto";
import { z } from "zod";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import type { ContextKind } from "@/lib/harness/types";
import { WINYU_RULES, contextFor } from "@/lib/server/agent/persona";
import { toolsForAccess } from "@/lib/server/agent/tools";

const HASH_CHARS = 16;
const ANY_DAY = "2000-01-01";

/** Context that changes with the day or with what people did (memory, a repeated question, a preloaded packet or story), not with the code: left out so a recording goes stale only when the prompt itself changes. */
const VOLATILE_KINDS: ReadonlySet<ContextKind> = new Set(["date", "memory", "suggestion", "packet", "story"]);

function hashOf(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, HASH_CHARS);
}

function accessOf(userId: string) {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  return { user, access: liveAccessFor(user) };
}

/** The prompt one person's agent runs under, minus the parts that move with the day or with use: the rules and the persona lines the code writes. */
export function promptHash(userId: string): string {
  const { user, access } = accessOf(userId);
  const persona = contextFor(access, user, { today: ANY_DAY, context: {} }, null).filter((item) => !VOLATILE_KINDS.has(item.kind)).map((item) => item.content);
  return hashOf([WINYU_RULES, persona]);
}

/** The tools one person's agent is offered: names, descriptions and input schemas, as the model reads them. */
export function toolsHash(userId: string): string {
  const { access } = accessOf(userId);
  const surface = toolsForAccess(access).map((tool) => ({
    name: tool.entry.name,
    description: tool.description(),
    input: z.toJSONSchema(tool.inputSchema(), { unrepresentable: "any", io: "input" }),
  }));
  return hashOf(surface);
}
