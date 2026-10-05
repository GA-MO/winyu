import { Hono } from "hono";
import { cors } from "hono/cors";
import { MastraServer, type HonoBindings, type HonoVariables } from "@mastra/hono";
import { winyuMastra } from "./agent";

const PRODUCTION = "production";
const SERVER_NAME = "Winyu Mastra API (development only)";

type StudioEnv = { Bindings: HonoBindings; Variables: HonoVariables };

/** The Mastra API that Studio talks to, over this process's one Mastra instance (same storage and traces as the app); development only. The agent resolves its instructions and tools from the persona in the request context, so a Studio run passes the same gateway, scope and audit as the chat, and a request without a persona is granted nothing. */
export async function studioApi(studioOrigin: string): Promise<Hono<StudioEnv>> {
  if (process.env.NODE_ENV === PRODUCTION) throw new Error("Studio is for development only; it never runs in production");
  const app = new Hono<StudioEnv>();
  app.use("*", cors({ origin: studioOrigin, credentials: true }));
  app.get("/", (c) => c.text(SERVER_NAME));
  await new MastraServer({ app, mastra: winyuMastra() }).init();
  return app;
}
