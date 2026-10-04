import { stepCountIs } from "ai";
import { wrapUpAtLimit, type AgentEngine } from "@/lib/harness/adapters/vexa/agent";
import { vexaEngine, type PersonaContext } from "@/lib/harness/adapters/vexa/server";
import { LIMITS } from "@/lib/harness/limits";
import { approvalSecret } from "@/lib/server/approval-secret";
import type { AccessContext } from "@/lib/contracts";
import { toolsFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { models } from "@/lib/server/models";
import { currentAccess } from "@/lib/server/request-context";
import { winyuCatalog } from "@/lib/cards/catalog";
import { WINYU_RULES, personaFor } from "./persona";
import { toolTiers, toolsForAccess } from "./tools";

const handlers = new Map<string, AgentEngine>();

function keyOf(access: AccessContext): string {
  return `${access.role}|${toolsFor(access).join(",")}`;
}

function build(access: AccessContext): AgentEngine {
  return vexaEngine({
    catalog: winyuCatalog,
    models,
    persona: (ctx: PersonaContext) => {
      const current = currentAccess();
      return personaFor(current, findUser(current.userId), ctx);
    },
    rules: WINYU_RULES,
    tools: toolsForAccess(access),
    toolTiers: toolTiers(),
    stopWhen: stepCountIs(LIMITS.maxSteps),
    prepareStep: wrapUpAtLimit(),
  }, approvalSecret());
}

/** The chat handler of one role and its live tool set, memoized: an admin override, kill or connector switch builds a new one on the next question. */
export function handlerFor(access: AccessContext): AgentEngine {
  const key = keyOf(access);
  const cached = handlers.get(key);
  if (cached) return cached;
  const handler = build(access);
  handlers.set(key, handler);
  return handler;
}

export function resetHandlers(): void {
  handlers.clear();
}
