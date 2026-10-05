import { messagingApi, validateSignature } from "@line/bot-sdk";
import { TH } from "@/lib/i18n/th";
import { linkedUser, type ExternalIdentity } from "@/lib/server/identity";
import { answerChannel } from "./answer";
import { channelWebOrigin } from "./config";
import { flexOf, decisionOfPostback, lineNoticeOf, type LineMessage } from "./line-flex";
import { finishLink, holdLinkRequest } from "./line-link";
import type { ChannelInbound, ChannelReply } from "./types";

const DEFAULT_ACCESS_URL = "https://access.line.me";
const ACCOUNT_LINK_PATH = "/dialog/bot/accountLink";
const LOADING_SECONDS = 30;
const SEEN_EVENTS_MAX = 1000;
const MARKDOWN_EMPHASIS = /\*\*|__/g;
const MARKDOWN_HEADING = /^#{1,6}\s+/gm;
const MARKDOWN_BULLET = /^\s*[-*]\s+/gm;

/** How this server talks to LINE: the Messaging API channel's id, secret and access token, and, in development only, the local simulator that stands in for api.line.me and access.line.me. */
export type LineSettings = { channelId: string; channelSecret: string; accessToken: string; apiUrl: string | null; accessUrl: string };

type LineSource = { type?: string; userId?: string; groupId?: string; roomId?: string };
type LineEvent = {
  type?: string;
  webhookEventId?: string;
  replyToken?: string;
  source?: LineSource;
  message?: { type?: string; text?: string; mention?: { mentionees?: { isSelf?: boolean }[] } };
  postback?: { data?: string };
  link?: { result?: string; nonce?: string };
};

/** The LINE settings from the environment, or null when no Messaging API channel is configured. `LINE_API_URL` and `LINE_ACCESS_URL` are ignored in production. */
export function lineSettings(env: NodeJS.ProcessEnv = process.env): LineSettings | null {
  const { LINE_CHANNEL_ID: channelId, LINE_CHANNEL_SECRET: channelSecret, LINE_CHANNEL_ACCESS_TOKEN: accessToken } = env;
  if (!channelId || !channelSecret || !accessToken) return null;
  const development = env.NODE_ENV !== "production";
  return { channelId, channelSecret, accessToken, apiUrl: development ? (env.LINE_API_URL ?? null) : null, accessUrl: (development ? env.LINE_ACCESS_URL : null) ?? DEFAULT_ACCESS_URL };
}

/** Where the web page sends a person who confirmed a link: LINE's account-link dialog, which proves they are the LINE user the token was issued to and reports back with the nonce. */
export function accountLinkUrl(settings: LineSettings, linkToken: string, nonce: string): string {
  const url = new URL(ACCOUNT_LINK_PATH, settings.accessUrl);
  url.searchParams.set("linkToken", linkToken);
  url.searchParams.set("nonce", nonce);
  return url.href;
}

/** The web page that confirms a LINE link request. */
export function linkPageUrl(linkToken: string): string {
  return `${channelWebOrigin()}/link/line/${encodeURIComponent(linkToken)}`;
}

function clientOf(settings: LineSettings): messagingApi.MessagingApiClient {
  return new messagingApi.MessagingApiClient({ channelAccessToken: settings.accessToken, ...(settings.apiUrl ? { baseURL: settings.apiUrl } : {}) });
}

/** Plain text for LINE, which shows markdown marks literally. */
export function plainText(markdown: string): string {
  return markdown.replace(MARKDOWN_EMPHASIS, "").replace(MARKDOWN_HEADING, "").replace(MARKDOWN_BULLET, "• ");
}

const profileNames = new Map<string, string | null>();

async function displayName(client: messagingApi.MessagingApiClient, userId: string): Promise<string | null> {
  if (profileNames.has(userId)) return profileNames.get(userId) ?? null;
  const name = await client.getProfile(userId).then((profile) => profile.displayName, () => null);
  profileNames.set(userId, name);
  return name;
}

async function send(client: messagingApi.MessagingApiClient, event: LineEvent, messages: LineMessage[]): Promise<void> {
  const to = event.source?.userId ?? event.source?.groupId ?? event.source?.roomId;
  const pushed = () => (to ? client.pushMessage({ to, messages }).then(() => undefined) : Promise.resolve());
  if (!event.replyToken) return pushed();
  await client.replyMessage({ replyToken: event.replyToken, messages }).catch(pushed);
}

async function linkPrompt(client: messagingApi.MessagingApiClient, sender: ExternalIdentity): Promise<LineMessage> {
  const issued = await client.issueLinkToken(sender.subject);
  holdLinkRequest(issued.linkToken, sender);
  return lineNoticeOf(TH.channels.lineUnlinked, { label: TH.channels.linkButton, uri: linkPageUrl(issued.linkToken) });
}

async function messagesOf(client: messagingApi.MessagingApiClient, reply: ChannelReply, sender: ExternalIdentity): Promise<LineMessage[]> {
  if (reply.kind === "unlinked") return [await linkPrompt(client, sender)];
  if (reply.kind === "notice") return [lineNoticeOf(reply.text)];
  return [flexOf({ ...reply, text: plainText(reply.text) })];
}

function mentionsBot(event: LineEvent): boolean {
  return event.message?.mention?.mentionees?.some((mentionee) => mentionee.isSelf === true) ?? false;
}

function inboundOf(event: LineEvent, sender: ExternalIdentity): ChannelInbound | null {
  const source = event.source ?? {};
  const place = { conversation: source.groupId ?? source.roomId ?? sender.subject, private: source.type === "user" };
  if (event.type === "message" && event.message?.type === "text" && event.message.text) {
    if (!place.private && !mentionsBot(event)) return null;
    return { kind: "ask", channel: "line", sender, place, text: event.message.text };
  }
  const decision = event.type === "postback" ? decisionOfPostback(event.postback?.data ?? "") : null;
  return decision ? { kind: "decide", channel: "line", sender, place, ...decision } : null;
}

async function linked(client: messagingApi.MessagingApiClient, event: LineEvent, lineUserId: string): Promise<void> {
  const nonce = event.link?.result === "ok" ? event.link.nonce : undefined;
  const finished = nonce ? finishLink(nonce, lineUserId) : null;
  await send(client, event, [lineNoticeOf(finished ? TH.channels.linked(finished.user.nameTh) : TH.channels.linkFailed)]);
}

async function handleEvent(settings: LineSettings, event: LineEvent): Promise<void> {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return;
  const client = clientOf(settings);
  if (event.type === "accountLink") return linked(client, event, lineUserId);
  const identity: ExternalIdentity = { provider: "line", tenant: settings.channelId, subject: lineUserId, email: null, name: null };
  const sender = linkedUser(identity) ? identity : { ...identity, name: await displayName(client, lineUserId) };
  const inbound = inboundOf(event, sender);
  if (!inbound) return;
  if (inbound.place.private) await client.showLoadingAnimation({ chatId: lineUserId, loadingSeconds: LOADING_SECONDS }).catch(() => undefined);
  const reply = await answerChannel(inbound, channelWebOrigin());
  await send(client, event, await messagesOf(client, reply, sender));
}

const seenEvents = new Set<string>();

function firstDelivery(event: LineEvent): boolean {
  const id = event.webhookEventId;
  if (!id) return true;
  if (seenEvents.has(id)) return false;
  if (seenEvents.size >= SEEN_EVENTS_MAX) seenEvents.clear();
  seenEvents.add(id);
  return true;
}

function eventsOf(body: string): LineEvent[] | null {
  try {
    const parsed = JSON.parse(body) as { events?: unknown };
    return Array.isArray(parsed.events) ? (parsed.events as LineEvent[]) : [];
  } catch {
    return null;
  }
}

/** Answers one LINE webhook: a body whose X-Line-Signature is not the channel secret's HMAC is refused before anything is read; each event then runs after the 200 (LINE wants a quick answer), as the mascop user its LINE account is linked to. */
export async function handleLineWebhook(request: Request, waitUntil: (task: Promise<unknown>) => void): Promise<Response> {
  const settings = lineSettings();
  if (!settings) return Response.json({ error: "LINE channel is not configured" }, { status: 503 });
  const body = await request.text();
  const signature = request.headers.get("x-line-signature");
  if (!signature || !validateSignature(body, settings.channelSecret, signature)) return Response.json({ error: "Invalid signature" }, { status: 401 });
  const events = eventsOf(body);
  if (!events) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  for (const event of events.filter(firstDelivery)) {
    waitUntil(handleEvent(settings, event).catch((error: unknown) => console.error("LINE event failed", error)));
  }
  return Response.json({ ok: true });
}
