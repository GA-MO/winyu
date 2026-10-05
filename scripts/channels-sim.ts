import { createHmac, generateKeyPairSync, randomBytes, randomUUID, sign, type KeyObject } from "node:crypto";

const BOT_FRAMEWORK_ISSUER = "https://api.botframework.com";
const KEY_ID = "teams-simulator-key";
const TOKEN_LIFETIME_SECONDS = 600;
const DEFAULT_REPLY_WAIT_MS = 120_000;
const POLL_MS = 200;
const TEAMS_SERVICE_PATH = "/teams/";
const ACTIVITIES = /^\/teams\/v3\/conversations\/([^/]+)\/activities(?:\/[^/]+)?$/;
const MEMBER = /^\/teams\/v3\/conversations\/([^/]+)\/members\/([^/]+)$/;
const LINE_PROFILE = /^\/v2\/bot\/profile\/([^/]+)$/;
const LINE_LINK_TOKEN = /^\/v2\/bot\/user\/([^/]+)\/linkToken$/;

/** Who the simulator stands in for: the Teams bot (app id, tenant) and the LINE channel (secret, the bot's own user id), where mascop's webhooks are, and how long to wait for a reply after a webhook answered (0 when mascop finishes before it answers, as in tests). */
export type ChannelSimulatorOptions = { port: number; mascop: string; replyWaitMs?: number; teams: { appId: string; tenantId: string }; line: { channelSecret: string; botUserId: string } };

/** One thing mascop sent to a chat app, as the simulator received it. */
export type Sent = { seq: number; channel: "teams" | "line"; to: string; kind: string; body: unknown };

/** A Teams person the simulator writes as: their Entra object id and name, and whether they write in a private chat with the bot or in a group chat. */
export type TeamsPerson = { oid: string; name: string; email?: string; group?: boolean };

type Delivery = { status: number; sent: Sent[] };

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function signJwt(claims: Record<string, unknown>, privateKey: KeyObject): string {
  const input = `${base64url(JSON.stringify({ alg: "RS256", kid: KEY_ID, typ: "JWT" }))}.${base64url(JSON.stringify(claims))}`;
  return `${input}.${base64url(sign("sha256", Buffer.from(input), privateKey))}`;
}

/** The X-Line-Signature LINE puts on a webhook body: base64 HMAC-SHA256 under the channel secret. */
export function lineSignature(body: string, channelSecret: string): string {
  return createHmac("sha256", channelSecret).update(body).digest("base64");
}

function teamsConversation(person: TeamsPerson): string {
  return person.group ? "19:group-sales@thread.v2" : `a:dm-${person.oid}`;
}

const CORS_HEADERS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS" };

function withCors(response: Response): Response {
  for (const [name, value] of Object.entries(CORS_HEADERS)) response.headers.set(name, value);
  return response;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A local stand-in for both chat apps, for tests and the live walk: it signs Teams activities as the Bot Framework would (RS256 JWT, published keys) and LINE webhooks with the channel secret, posts them to mascop, and records every reply mascop sends to the Bot Connector API and the LINE Messaging API. It also plays LINE's account-link dialog. */
export function startChannelSimulator(options: ChannelSimulatorOptions) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: KEY_ID, use: "sig", alg: "RS256" };
  const sent: Sent[] = [];
  const linkTokens = new Map<string, string>();
  const people = new Map<string, TeamsPerson>();
  const lineNames = new Map<string, string>();
  const server = Bun.serve({ port: options.port, idleTimeout: 0, fetch: async (request) => withCors(request.method === "OPTIONS" ? new Response(null, { status: 204 }) : await route(request)) });
  const origin = `http://localhost:${server.port}`;
  const serviceUrl = `${origin}${TEAMS_SERVICE_PATH}`;

  function record(channel: Sent["channel"], to: string, kind: string, body: unknown): Sent {
    const entry = { seq: sent.length + 1, channel, to, kind, body };
    sent.push(entry);
    return entry;
  }

  async function route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/botframework/keys") return Response.json({ keys: [jwk] });
    const activity = path.match(ACTIVITIES);
    if (activity && request.method === "POST") {
      const body = (await request.json()) as { type?: string };
      record("teams", decodeURIComponent(activity[1]), body.type ?? "message", body);
      return Response.json({ id: randomUUID() });
    }
    const member = path.match(MEMBER);
    if (member) {
      const oid = decodeURIComponent(member[2]).replace(/^29:/, "");
      const person = people.get(oid);
      return Response.json({ id: `29:${oid}`, name: person?.name ?? oid, aadObjectId: oid, email: person?.email, userPrincipalName: person?.email });
    }
    if (request.method === "POST" && (path === "/v2/bot/message/reply" || path === "/v2/bot/message/push")) {
      const body = (await request.json()) as { replyToken?: string; to?: string };
      record("line", body.to ?? body.replyToken ?? "", path.endsWith("reply") ? "reply" : "push", body);
      return Response.json({ sentMessages: [{ id: randomUUID() }] });
    }
    if (request.method === "POST" && path === "/v2/bot/chat/loading/start") {
      record("line", String(((await request.json()) as { chatId?: string }).chatId ?? ""), "loading", null);
      return Response.json({});
    }
    const profile = path.match(LINE_PROFILE);
    if (profile) {
      const userId = decodeURIComponent(profile[1]);
      return Response.json({ userId, displayName: lineNames.get(userId) ?? userId });
    }
    const linkToken = path.match(LINE_LINK_TOKEN);
    if (linkToken && request.method === "POST") {
      const token = randomBytes(24).toString("base64url");
      linkTokens.set(token, decodeURIComponent(linkToken[1]));
      return Response.json({ linkToken: token });
    }
    if (path === "/dialog/bot/accountLink") return accountLinkDialog(url);
    return Response.json({ error: `simulator has no ${request.method} ${path}` }, { status: 404 });
  }

  async function accountLinkDialog(url: URL): Promise<Response> {
    const userId = linkTokens.get(url.searchParams.get("linkToken") ?? "");
    linkTokens.delete(url.searchParams.get("linkToken") ?? "");
    const nonce = url.searchParams.get("nonce") ?? "";
    const result = userId ? "ok" : "failed";
    if (userId) await postLine(userId, { type: "accountLink", replyToken: randomUUID(), link: { result, nonce } });
    const html = `<!doctype html><meta charset="utf-8"><title>LINE account link (simulator)</title><body style="font:16px system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#06c755;color:#fff"><main><h1>${result === "ok" ? "เชื่อมบัญชีแล้ว" : "เชื่อมไม่สำเร็จ"}</h1><p>LINE account-link dialog (simulator). กลับไปที่แชท LINE ได้เลย</p></main>`;
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  async function settle(channel: Sent["channel"], to: string, after: number, until: (fresh: Sent[]) => boolean): Promise<Sent[]> {
    const deadline = Date.now() + (options.replyWaitMs ?? DEFAULT_REPLY_WAIT_MS);
    for (;;) {
      const fresh = sent.filter((entry) => entry.seq > after && entry.channel === channel && entry.to === to);
      if (until(fresh) || Date.now() > deadline) return fresh;
      await sleep(POLL_MS);
    }
  }

  function signedTeams(person: TeamsPerson, extra: Record<string, unknown>): { activity: Record<string, unknown>; token: string } {
    people.set(person.oid, person);
    const activity = {
      type: "message",
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      channelId: "msteams",
      serviceUrl,
      from: { id: `29:${person.oid}`, name: person.name, aadObjectId: person.oid },
      conversation: { id: teamsConversation(person), conversationType: person.group ? "groupChat" : "personal", tenantId: options.teams.tenantId, ...(person.group ? { isGroup: true } : {}) },
      recipient: { id: `28:${options.teams.appId}`, name: "mascop" },
      channelData: { tenant: { id: options.teams.tenantId } },
      locale: "th-TH",
      ...extra,
    };
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ iss: BOT_FRAMEWORK_ISSUER, aud: options.teams.appId, nbf: now, exp: now + TOKEN_LIFETIME_SECONDS, serviceurl: serviceUrl }, privateKey);
    return { activity, token };
  }

  async function postTeams(person: TeamsPerson, extra: Record<string, unknown>): Promise<Delivery> {
    const { activity, token } = signedTeams(person, extra);
    const conversation = teamsConversation(person);
    const before = sent.length;
    const response = await fetch(`${options.mascop}/api/channels/teams`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(activity) });
    const replies = response.ok ? await settle("teams", conversation, before, (fresh) => fresh.some((entry) => entry.kind === "message")) : [];
    return { status: response.status, sent: replies };
  }

  async function postLine(userId: string, event: Record<string, unknown>, sourceOverride: Record<string, unknown> | null = null): Promise<Delivery> {
    const body = JSON.stringify({
      destination: options.line.botUserId,
      events: [{ mode: "active", timestamp: Date.now(), webhookEventId: randomUUID(), deliveryContext: { isRedelivery: false }, source: sourceOverride ?? { type: "user", userId }, ...event }],
    });
    const before = sent.length;
    const response = await fetch(`${options.mascop}/api/channels/line`, { method: "POST", headers: { "content-type": "application/json", "x-line-signature": lineSignature(body, options.line.channelSecret) }, body });
    const replyToken = typeof event.replyToken === "string" ? event.replyToken : "";
    const replies = response.ok ? await settle("line", replyToken, before, (fresh) => fresh.some((entry) => entry.kind === "reply")) : [];
    return { status: response.status, sent: replies };
  }

  return {
    origin,
    serviceUrl,
    sent,
    /** A person writes `text` to the bot in Teams; resolves with the webhook status and what mascop posted back. */
    teamsSay: (person: TeamsPerson, text: string) => postTeams(person, { text, textFormat: "plain", ...(person.group ? { text: `<at>mascop</at> ${text}`, entities: [{ type: "mention", text: "<at>mascop</at>", mentioned: { id: `28:${options.teams.appId}`, name: "mascop" } }] } : {}) }),
    /** A person presses an Adaptive Card Action.Submit button (`actionId` and `value` as the card set them). */
    teamsPress: (person: TeamsPerson, actionId: string, value: string) => postTeams(person, { value: { actionId, value }, replyToId: randomUUID() }),
    /** A LINE user writes `text` to the bot in a 1:1 chat. */
    lineSay: (userId: string, text: string, displayName = userId) => {
      lineNames.set(userId, displayName);
      return postLine(userId, { type: "message", replyToken: randomUUID(), message: { id: randomUUID(), type: "text", quoteToken: randomUUID(), text } });
    },
    /** A LINE user writes in a group chat, mentioning the bot or not. */
    lineSayInGroup: (userId: string, text: string, mentioned = true) =>
      postLine(userId, { type: "message", replyToken: randomUUID(), message: { id: randomUUID(), type: "text", quoteToken: randomUUID(), text, ...(mentioned ? { mention: { mentionees: [{ index: 0, length: 7, type: "user", isSelf: true }] } } : {}) } }, { type: "group", groupId: "Cgroup-sales", userId }),
    /** LINE reports a finished account link for `userId` with `nonce`, as its dialog would. */
    linePressAccountLink: (userId: string, nonce: string) => postLine(userId, { type: "accountLink", replyToken: randomUUID(), link: { result: "ok", nonce } }),
    /** A LINE user presses a postback button. */
    linePress: (userId: string, data: string) => postLine(userId, { type: "postback", replyToken: randomUUID(), postback: { data } }),
    /** A signed Teams activity and its Bearer token, for tests that tamper with one of them. */
    signedTeams,
    /** The JWKS URL mascop's simulator verifier reads. */
    keysUrl: `${origin}/botframework/keys`,
    stop: () => server.stop(true),
  };
}

export type ChannelSimulator = ReturnType<typeof startChannelSimulator>;
