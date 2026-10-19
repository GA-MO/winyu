import { randomUUID } from "node:crypto";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { MastraServer, type HonoBindings, type HonoVariables } from "@mastra/hono";
import { MASTRA_RESOURCE_ID_KEY } from "@mastra/core/request-context";
import { z } from "zod";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { runAsInitiator } from "@/lib/harness/runtime";
import { TH } from "@/lib/i18n/th";
import { runWithAccess, runWithTurn, type TurnContext } from "@/lib/server/request-context";
import { AGENT_ID, USER_ID_KEY, studioResourceOf, winyuMastra } from "./agent";

const PRODUCTION = "production";
const SERVER_NAME = "Winyu Mastra API (development only)";
const NO_PERSONA_RESOURCE = studioResourceOf("");
const AGENTS_PATH = "/api/agents/";
const POST = "POST";
const THREAD_SUBSCRIBE_SUFFIX = "/threads/subscribe";
const JSON_TYPE = "application/json";

type StudioEnv = { Bindings: HonoBindings; Variables: HonoVariables };

const personaContext = z.object({ [USER_ID_KEY]: z.string() });

const studioBody = z.object({
  threadId: z.string().optional(),
  ifIdle: z.object({ streamOptions: z.object({ requestContext: personaContext.optional() }).optional() }).optional(),
});

type StudioBody = z.infer<typeof studioBody>;

async function bodyOf(request: Request): Promise<StudioBody> {
  if (request.method !== POST || !request.headers.get("content-type")?.includes(JSON_TYPE)) return {};
  const parsed = studioBody.safeParse(await request.clone().json().catch(() => null));
  return parsed.success ? parsed.data : {};
}

let personaInUse: string | null = null;

async function studioResourceOfThread(threadId: string): Promise<string | null> {
  const memory = await winyuMastra().getAgent(AGENT_ID).getMemory();
  const thread = await memory?.getThreadById({ threadId });
  return thread?.resourceId.startsWith(NO_PERSONA_RESOURCE) ? thread.resourceId : null;
}

async function subscriptionResource(threadId: string | undefined): Promise<string> {
  const owner = threadId ? await studioResourceOfThread(threadId) : null;
  if (owner) return owner;
  return personaInUse ? studioResourceOf(personaInUse) : NO_PERSONA_RESOURCE;
}

function isSubscription(c: Context<StudioEnv>): boolean {
  return c.req.method === POST && c.req.path.endsWith(THREAD_SUBSCRIBE_SUFFIX);
}

function isAgentCall(c: Context<StudioEnv>): boolean {
  return c.req.method === POST && c.req.path.startsWith(AGENTS_PATH);
}

const asPersona: MiddlewareHandler<StudioEnv> = async (c, next) => {
  const requestContext = c.get("requestContext");
  const body = await bodyOf(c.req.raw);
  const userId = requestContext.get(USER_ID_KEY) ?? body.ifIdle?.streamOptions?.requestContext?.[USER_ID_KEY];
  const user = typeof userId === "string" ? findUser(userId) : null;
  if (!user && isSubscription(c)) {
    requestContext.set(MASTRA_RESOURCE_ID_KEY, await subscriptionResource(body.threadId));
    return next();
  }
  if (!user) {
    if (isAgentCall(c)) return c.json({ error: TH.harness.studioPickPersona }, 400);
    requestContext.set(MASTRA_RESOURCE_ID_KEY, NO_PERSONA_RESOURCE);
    return next();
  }
  personaInUse = user.id;
  requestContext.set(USER_ID_KEY, user.id);
  requestContext.set(MASTRA_RESOURCE_ID_KEY, studioResourceOf(user.id));
  const turn: TurnContext = { turnId: randomUUID(), threadId: null, question: null, queries: [] };
  return runWithAccess(liveAccessFor(user), () => runWithTurn(turn, () => runAsInitiator("studio", next)));
};

class StudioServer extends MastraServer {
  override registerAuthMiddleware(): void {
    this.getApp<Hono<StudioEnv>>().use("*", asPersona);
  }
}

/** The Mastra API that Studio talks to, over this process's one Mastra instance (same storage and traces as the app); development only. Each request runs as the persona in its request context (Studio's chat sends it inside the message signal's stream options): inside that persona's access, initiated by `studio` under a turn id of its own (so the gateway, audit and spend ledger name it, and its audit and ledger rows share that id), with its memory under the persona's own Studio resource whatever resource the client sent. Studio subscribes to a thread's runs without a persona, so a subscription follows the Studio resource of the thread, or of the persona last seen for a thread not stored yet. Any other request without a persona is granted nothing: its agent calls (runs, tool executes) are refused before any model or tool, its memory resource is one no thread belongs to, and the agent it lists has no tools and instructions that say to pick a persona. */
export async function studioApi(studioOrigin: string): Promise<Hono<StudioEnv>> {
  if (process.env.NODE_ENV === PRODUCTION) throw new Error("Studio is for development only; it never runs in production");
  const app = new Hono<StudioEnv>();
  app.use("*", cors({ origin: studioOrigin, credentials: true }));
  app.get("/", (c) => c.text(SERVER_NAME));
  await new StudioServer({ app, mastra: winyuMastra() }).init();
  return app;
}
