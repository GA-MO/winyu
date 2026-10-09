import { createMemoryState } from "@chat-adapter/state-memory";
import { TeamsAdapter, type TeamsAdapterConfig } from "@chat-adapter/teams";
import { Chat, ConsoleLogger, type Message, type Thread } from "chat";
import { TH } from "@/lib/i18n/th";
import type { ExternalIdentity } from "@/lib/server/identity";
import { channelWebOrigin } from "./config";
import { fixedReplyTo } from "./reply";
import { askOnWebCard, type AdaptiveCard } from "./teams-card";
import { rememberTeamsConversation } from "./teams-conversations";
import { botFrameworkVerifier } from "./teams-simulator-auth";

const BOT_NAME = "Winyu";
const ADAPTIVE_CARD = "application/vnd.microsoft.card.adaptive";
const SIMULATOR_TOKEN_SECONDS = 3600;

/** The parts of a Teams activity Winyu reads to know who wrote: the Entra object id and tenant of the sender. */
type TeamsActivity = {
  from?: { id?: string; name?: string; aadObjectId?: string };
  conversation?: { tenantId?: string };
  channelData?: { tenant?: { id?: string } };
};

/** How this server talks to Teams: the Azure Bot's app id and secret (or none when a managed identity signs), its tenant, and, in development only, a local Bot Framework simulator that signs inbound activities and receives the replies. */
export type TeamsSettings = { appId: string; appPassword: string | null; tenantId: string | null; simulator: string | null };

/** The Teams settings from the environment, or null when no bot is registered (`TEAMS_APP_ID` unset). `TEAMS_SIMULATOR_URL` is ignored in production. */
export function teamsSettings(env: NodeJS.ProcessEnv = process.env): TeamsSettings | null {
  const appId = env.TEAMS_APP_ID;
  if (!appId) return null;
  const simulator = env.NODE_ENV === "production" ? null : (env.TEAMS_SIMULATOR_URL ?? null);
  return { appId, appPassword: env.TEAMS_APP_PASSWORD ?? null, tenantId: env.TEAMS_APP_TENANT_ID ?? null, simulator };
}

/** The official Chat SDK Teams adapter, plus posting Winyu's own Adaptive Card JSON as it is. */
class WinyuTeamsAdapter extends TeamsAdapter {
  async postAdaptiveCard(threadId: string, card: AdaptiveCard): Promise<void> {
    await this.app.sendTo(this.decodeThreadId(threadId), { type: "message", attachments: [{ contentType: ADAPTIVE_CARD, content: card }] });
  }
}

function simulatorBotToken(): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none", typ: "JWT" })}.${part({ aud: "https://api.botframework.com", exp: Math.floor(Date.now() / 1000) + SIMULATOR_TOKEN_SECONDS })}.simulator`;
}

function adapterConfig(settings: TeamsSettings): TeamsAdapterConfig {
  const base: TeamsAdapterConfig = { appId: settings.appId, userName: BOT_NAME, logger: new ConsoleLogger("warn", "teams") };
  const tenant: TeamsAdapterConfig = settings.tenantId ? { appType: "SingleTenant", appTenantId: settings.tenantId } : { appType: "MultiTenant" };
  if (settings.simulator) return { ...base, ...tenant, token: simulatorBotToken, webhookVerifier: botFrameworkVerifier(settings.simulator, settings.appId) };
  return { ...base, ...tenant, ...(settings.appPassword ? { appPassword: settings.appPassword } : {}) };
}

function teamsSenderOf(raw: unknown, email: string | null): ExternalIdentity | null {
  const activity = (raw ?? {}) as TeamsActivity;
  const subject = activity.from?.aadObjectId;
  const tenant = activity.conversation?.tenantId ?? activity.channelData?.tenant?.id;
  if (!subject || !tenant) return null;
  return { provider: "entra", tenant, subject, email, name: activity.from?.name ?? null };
}

function onMessage(adapter: WinyuTeamsAdapter) {
  return async (thread: Thread, message: Message) => {
    const at = new Date().toISOString();
    const reply = fixedReplyTo(teamsSenderOf(message.raw, message.author.email ?? null), adapter.isDM(thread.id), at);
    if (reply.kind === "unlinked") {
      await adapter.postMessage(thread.id, { markdown: TH.channels.teamsUnlinked });
      return;
    }
    if (reply.user) rememberTeamsConversation(reply.user.id, thread.id, at);
    await adapter.postAdaptiveCard(thread.id, askOnWebCard(channelWebOrigin()));
  };
}

function buildBot(settings: TeamsSettings) {
  const adapter = new WinyuTeamsAdapter(adapterConfig(settings));
  const chat = new Chat({ userName: BOT_NAME, adapters: { teams: adapter }, state: createMemoryState(), concurrency: "queue", logger: new ConsoleLogger("warn", "chat") });
  chat.onDirectMessage(onMessage(adapter));
  chat.onNewMention(onMessage(adapter));
  return chat;
}

let bot: { key: string; chat: ReturnType<typeof buildBot> } | null = null;

function teamsBot(settings: TeamsSettings) {
  const key = JSON.stringify(settings);
  if (bot?.key !== key) bot = { key, chat: buildBot(settings) };
  return bot.chat;
}

/** Posts an Adaptive Card into a person's 1:1 Teams conversation (a share), through the same official adapter; false when no bot is configured. */
export async function postTeamsCard(threadId: string, card: AdaptiveCard): Promise<boolean> {
  const settings = teamsSettings();
  if (!settings) return false;
  const chat = teamsBot(settings);
  await chat.initialize();
  await (chat.getAdapter("teams") as WinyuTeamsAdapter).postAdaptiveCard(threadId, card);
  return true;
}

/** Answers one Bot Framework request at the Teams messaging endpoint: the adapter verifies it (Microsoft's JWT, or the simulator's in development), then a private message or a mention gets the fixed reply, with no model call. `waitUntil` keeps the reply running after the response. */
export async function handleTeamsWebhook(request: Request, waitUntil: (task: Promise<unknown>) => void): Promise<Response> {
  const settings = teamsSettings();
  if (!settings) return Response.json({ error: "Teams channel is not configured" }, { status: 503 });
  return teamsBot(settings).webhooks.teams(request, { waitUntil });
}
