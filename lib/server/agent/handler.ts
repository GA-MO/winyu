import { stepCountIs } from "ai";
import { createVexaHandler, type PersonaContext } from "vexa/server";
import type { AccessContext, RoleId } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { models } from "@/lib/server/models";
import { currentAccess } from "@/lib/server/request-context";
import { COP_RULES, personaFor } from "./persona";
import { toolTiers, toolsForAccess } from "./tools";

const MAX_STEPS = 6;

type ChatHandler = ReturnType<typeof createVexaHandler>;

const handlers = new Map<RoleId, ChatHandler>();

function build(access: AccessContext): ChatHandler {
  return createVexaHandler({
    models,
    persona: (ctx: PersonaContext) => {
      const current = currentAccess();
      return personaFor(current, findUser(current.userId), ctx);
    },
    rules: COP_RULES,
    tools: toolsForAccess(access),
    toolTiers,
    stopWhen: stepCountIs(MAX_STEPS),
  });
}

/** The chat handler of one role, memoized: the tool set depends on the role, the persona on the request context. */
export function handlerFor(access: AccessContext): ChatHandler {
  const cached = handlers.get(access.role);
  if (cached) return cached;
  const handler = build(access);
  handlers.set(access.role, handler);
  return handler;
}

export function resetHandlers(): void {
  handlers.clear();
}
