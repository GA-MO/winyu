import { createMemoryState } from "@chat-adapter/state-memory";
import { TeamsAdapter, type TeamsAdapterConfig } from "@chat-adapter/teams";
import { Chat, ConsoleLogger, type Message, type Thread } from "chat";
import { TH } from "@/lib/i18n/th";
import type { ExternalIdentity } from "@/lib/server/identity";
import { answerChannel } from "./answer";
import { channelWebOrigin } from "./config";
import { adaptiveCardOf, TEAMS_APPROVE, TEAMS_REJECT, type AdaptiveCard } from "./teams-card";
import { botFrameworkVerifier } from "./teams-simulator-auth";
import type { ChannelInbound, ChannelReply } from "./types";

const BOT_NAME = "mascop";
const ADAPTIVE_CARD = "application/vnd.microsoft.card.adaptive";
const SIMULATOR_TOKEN_SECONDS = 3600;

/** The parts of a Teams activity mascop reads to know who wrote: the Entra object id and tenant of the sender. */
type TeamsActivity = {
  from?: { id?: string; name?: string; aadObjectId?: string };
  conversation?: { id?: string; tenantId?: string };
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

/** The official Chat SDK Teams adapter, plus posting mascop's own Adaptive Card as it is (the SDK's card model has no colour, and the change must show red or green). */
class MascopTeamsAdapter extends TeamsAdapter {
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

/** Who wrote a Teams activity, as the Entra identity web sign-in uses (`entra:<tenant>:<object id>`); null when Teams did not say. */
export function teamsSenderOf(raw: unknown, email: string | null = null): ExternalIdentity | null {
  const activity = (raw ?? {}) as TeamsActivity;
  const subject = activity.from?.aadObjectId;
  const tenant = activity.conversation?.tenantId ?? activity.channelData?.tenant?.id;
  if (!subject || !tenant) return null;
  return { provider: "entra", tenant, subject, email, name: activity.from?.name ?? null };
}

function conversationOf(raw: unknown, threadId: string): string {
  return ((raw ?? {}) as TeamsActivity).conversation?.id ?? threadId;
}

async function post(adapter: MascopTeamsAdapter, threadId: string, reply: ChannelReply): Promise<void> {
  if (reply.kind === "answer") return adapter.postAdaptiveCard(threadId, adaptiveCardOf(reply));
  await adapter.postMessage(threadId, { markdown: reply.kind === "notice" ? reply.text : TH.channels.teamsUnlinked });
}

async function answerAndPost(adapter: MascopTeamsAdapter, threadId: string, inbound: ChannelInbound | null): Promise<void> {
  const reply = inbound ? await answerChannel(inbound, channelWebOrigin()) : ({ kind: "unlinked" } as const);
  await post(adapter, threadId, reply);
}

function onMessage(adapter: MascopTeamsAdapter) {
  return async (thread: Thread, message: Message) => {
    await thread.startTyping().catch(() => undefined);
    const sender = teamsSenderOf(message.raw, message.author.email ?? null);
    const place = { conversation: conversationOf(message.raw, thread.id), private: adapter.isDM(thread.id) };
    await answerAndPost(adapter, thread.id, sender ? { kind: "ask", channel: "teams", sender, place, text: message.text } : null);
  };
}

function buildBot(settings: TeamsSettings) {
  const adapter = new MascopTeamsAdapter(adapterConfig(settings));
  const chat = new Chat({ userName: BOT_NAME, adapters: { teams: adapter }, state: createMemoryState(), concurrency: "queue", logger: new ConsoleLogger("warn", "chat") });
  chat.onDirectMessage(onMessage(adapter));
  chat.onNewMention(onMessage(adapter));
  chat.onAction([TEAMS_APPROVE, TEAMS_REJECT], async (event) => {
    const sender = teamsSenderOf(event.raw);
    const place = { conversation: conversationOf(event.raw, event.threadId), private: adapter.isDM(event.threadId) };
    const approved = event.actionId === TEAMS_APPROVE;
    await answerAndPost(adapter, event.threadId, sender ? { kind: "decide", channel: "teams", sender, place, approvalId: event.value ?? "", approved } : null);
  });
  return chat;
}

let bot: { key: string; chat: ReturnType<typeof buildBot> } | null = null;

function teamsBot(settings: TeamsSettings) {
  const key = JSON.stringify(settings);
  if (bot?.key !== key) bot = { key, chat: buildBot(settings) };
  return bot.chat;
}

/** Answers one Bot Framework request at the Teams messaging endpoint: the adapter verifies it (Microsoft's JWT, or the simulator's in development), and each private message or approval press is answered as the linked mascop user. `waitUntil` keeps the answer running after the response. */
export async function handleTeamsWebhook(request: Request, waitUntil: (task: Promise<unknown>) => void): Promise<Response> {
  const settings = teamsSettings();
  if (!settings) return Response.json({ error: "Teams channel is not configured" }, { status: 503 });
  return teamsBot(settings).webhooks.teams(request, { waitUntil });
}
