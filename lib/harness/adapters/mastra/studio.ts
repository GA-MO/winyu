import { randomUUID } from "node:crypto";
import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { MastraServer, type HonoBindings, type HonoVariables } from "@mastra/hono";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { runAsInitiator } from "@/lib/harness/runtime";
import { runWithAccess, runWithTurn, type TurnContext } from "@/lib/server/request-context";
import { USER_ID_KEY, winyuMastra } from "./agent";

const PRODUCTION = "production";
const SERVER_NAME = "Winyu Mastra API (development only)";

type StudioEnv = { Bindings: HonoBindings; Variables: HonoVariables };

const asPersona: MiddlewareHandler<StudioEnv> = async (c, next) => {
  const userId = c.get("requestContext").get(USER_ID_KEY);
  const user = typeof userId === "string" ? findUser(userId) : null;
  if (!user) return next();
  const turn: TurnContext = { turnId: randomUUID(), threadId: null, question: null, queries: [] };
  return runWithAccess(liveAccessFor(user), () => runWithTurn(turn, () => runAsInitiator("studio", next)));
};

class StudioServer extends MastraServer {
  override registerAuthMiddleware(): void {
    this.getApp<Hono<StudioEnv>>().use("*", asPersona);
  }
}

/** The Mastra API that Studio talks to, over this process's one Mastra instance (same storage and traces as the app); development only. Each request runs as the persona in its request context: inside that persona's access, initiated by `studio` under a turn id of its own (so the gateway, audit and spend ledger name it, and its audit and ledger rows share that id). A request without a persona is granted nothing. */
export async function studioApi(studioOrigin: string): Promise<Hono<StudioEnv>> {
  if (process.env.NODE_ENV === PRODUCTION) throw new Error("Studio is for development only; it never runs in production");
  const app = new Hono<StudioEnv>();
  app.use("*", cors({ origin: studioOrigin, credentials: true }));
  app.get("/", (c) => c.text(SERVER_NAME));
  await new StudioServer({ app, mastra: winyuMastra() }).init();
  return app;
}
