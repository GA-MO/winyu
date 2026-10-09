# Microsoft Teams and LINE channels

Teams and LINE are send-only. Winyu uses them for one thing: delivering a card that a colleague shared (title, sender, note and a **เปิดดูใน Winyu** button, no values). People do not ask Winyu questions in Teams or LINE. They ask on Winyu's web app, which works on mobile.

A message that someone writes to the bot gets a fixed reply. No model is called, no agent run starts, and nothing is audited. The reply says that the chat only receives shared cards, and it has a **เปิด Winyu** button to `WINYU_PUBLIC_URL`.

Until 2026-10-09, people could ask Winyu in both apps, with answer cards and approvals in the chat. That code is at commit `c3f586e`.

No Teams bot or LINE channel is registered yet. Everything below runs and is tested against a local simulator. This guide lists what the company must provide, how to configure and deploy, and how the channels behave.

## What the user must provide

### Microsoft Teams

An Azure administrator in the company tenant creates these once per environment.

1. An **Azure Bot** resource (Azure portal > **Create a resource** > **Azure Bot**). Choose **Single Tenant** and create a new Microsoft App ID.
2. The bot's credential. Use one of these:
   - a client secret (App registration > **Certificates & secrets** > **New client secret**), or
   - a user-assigned managed identity, when Winyu runs in Azure (App Service, AKS) and can reach the identity endpoint.
3. The **messaging endpoint**: `https://<winyu host>/api/channels/teams`. Set it in Azure Bot > **Configuration**.
4. The **Microsoft Teams** channel enabled on the bot (Azure Bot > **Channels** > **Microsoft Teams**).
5. A **Teams app package** (a zip of `manifest.json` and two icons) uploaded in the Teams admin center and made available to the people who use Winyu. The bot needs only the personal scope. A minimal manifest:

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/teams/v1.19/MicrosoftTeams.schema.json",
  "manifestVersion": "1.19",
  "version": "1.0.0",
  "id": "<Microsoft App ID>",
  "developer": { "name": "<company>", "websiteUrl": "https://<winyu host>", "privacyUrl": "https://<winyu host>", "termsOfUseUrl": "https://<winyu host>" },
  "name": { "short": "Winyu" },
  "description": { "short": "รับการ์ดที่เพื่อนร่วมงานแชร์ให้", "full": "Winyu ส่งการ์ดที่เพื่อนร่วมงานแชร์ให้คุณมาที่แชทนี้ ถามข้อมูลได้ที่ Winyu บนเว็บ" },
  "icons": { "color": "color.png", "outline": "outline.png" },
  "accentColor": "#4F46E5",
  "bots": [{ "botId": "<Microsoft App ID>", "scopes": ["personal"], "supportsFiles": false, "isNotificationOnly": false }],
  "validDomains": ["<winyu host>"]
}
```

Keep `isNotificationOnly` false. Teams lets Winyu post into a person's 1:1 chat only after that person has written to the bot once, so people must be able to write to it.

Send these values to the Winyu team. Send the secret through your secret store.

| Value | Setting in Winyu |
|---|---|
| Microsoft App ID | `TEAMS_APP_ID` |
| Client secret value (skip when using a managed identity) | `TEAMS_APP_PASSWORD` |
| Directory (tenant) ID | `TEAMS_APP_TENANT_ID` |

People need no extra step in Teams. Teams sends the sender's Entra object id with every message, and Winyu looks it up in the same identity links as web sign-in (`entra:<tenant>:<object id>`, see `docs/sso.md`). When a linked person writes to the bot, Winyu stores their 1:1 conversation, and shares to them go to Teams from then on. A person who is not linked gets a reply that says IT has to grant access, and their attempt appears on `/admin?tab=signin`, where IT grants or dismisses it.

### LINE

A LINE Official Account administrator creates a **Messaging API channel** in the LINE Developers console (one per environment) and sets it up as follows.

1. **Messaging API** tab > **Webhook URL**: `https://<winyu host>/api/channels/line`. Turn on **Use webhook**.
2. In the LINE Official Account Manager, turn off **Auto-reply messages** and **Greeting messages**, so that only Winyu answers.
3. **Messaging API** tab > **Channel access token (long-lived)** > **Issue**.

Send these values to the Winyu team.

| Value | Where | Setting in Winyu |
|---|---|---|
| Channel ID | **Basic settings** | `LINE_CHANNEL_ID` |
| Channel secret | **Basic settings** | `LINE_CHANNEL_SECRET` |
| Channel access token (long-lived) | **Messaging API** | `LINE_CHANNEL_ACCESS_TOKEN` |

LINE accounts carry no company identity, so each person links their LINE account once:

1. The person writes anything to the bot. Winyu replies with a **เชื่อมบัญชี LINE** button.
2. The button opens `https://<winyu host>/link/line/<link token>`. The person signs in to Winyu (Microsoft or demo) and confirms. The page names the LINE account and the Winyu user whose shared cards it will receive.
3. Winyu sends the browser to LINE's account-link dialog. LINE completes the link in the LINE user's own session and reports it to the webhook as an `accountLink` event from that LINE user, with the one-time nonce.
4. Winyu links `line:<channel id>:<LINE user id>` to that Winyu user and replies **เชื่อมบัญชี LINE กับ <name> แล้ว**.

The link token and the confirmation each work once and expire after 10 minutes. Winyu also checks that the LINE user in LINE's report is the user it issued the token to. IT sees every LINE link on `/admin?tab=signin` and can unlink it. Unlinking takes effect on the next share.

## Configure the server

| Variable | Value |
|---|---|
| `WINYU_PUBLIC_URL` | The address people open Winyu at, for example `https://winyu.example.com`. Used in the **เปิด Winyu** and **เปิดดูใน Winyu** buttons and the LINE link page. |
| `TEAMS_APP_ID`, `TEAMS_APP_PASSWORD`, `TEAMS_APP_TENANT_ID` | From the Teams table. Without `TEAMS_APP_ID`, `/api/channels/teams` answers 503 and the share sheet does not offer Teams. |
| `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` | From the LINE table. Without all three, `/api/channels/line` answers 503 and the share sheet does not offer LINE. |
| `TEAMS_SIMULATOR_URL`, `LINE_API_URL`, `LINE_ACCESS_URL` | Development only. They point the channels at the local simulator. Winyu ignores them when `NODE_ENV=production`. |

## Deploy

- Serve Winyu over HTTPS on a public host. Microsoft and LINE call the two webhook paths from the internet. `proxy.ts` lets `/api/channels/*` through without a session, because the webhooks authenticate themselves. Teams requests carry a Bot Framework JWT that the official adapter verifies against Microsoft's published keys. LINE requests carry an `X-Line-Signature` HMAC that Winyu checks against the channel secret before it reads the body. Anything else gets 401.
- Run one server instance. The Chat SDK state (duplicate-delivery checks) lives in memory, and Teams conversations, link tokens and nonces live in `.data`. Several instances need a shared store first: `@chat-adapter/state-redis` for the Chat SDK and a shared database for the JSON store.
- Outbound calls go to `smba.trafficmanager.net` (Teams messages, through the `serviceUrl` in each activity), `login.microsoftonline.com` and `login.botframework.com` (tokens and keys), and `api.line.me` and `access.line.me` (LINE). Allow them in the egress firewall.

## How a message is handled

The route verifies the request (Teams JWT or LINE signature) and refuses anything else with 401. Then the message gets one fixed reply (`lib/server/channels/reply.ts`):

| Who wrote | Teams | LINE |
|---|---|---|
| A linked person, in a private chat | **เปิด Winyu** card. Winyu stores the 1:1 conversation for shares. | **เปิด Winyu** bubble |
| An unlinked person, in a private chat | Text: IT has to grant access. The attempt appears on `/admin?tab=signin`. | **เชื่อมบัญชี LINE** button. The attempt appears on `/admin?tab=signin`. |
| Anyone, mentioning the bot in a group | **เปิด Winyu** card (only if the bot was added to a group despite the personal scope) | **เปิด Winyu** bubble |
| Anyone, in a group without mentioning the bot | Nothing (Teams does not deliver it) | Nothing |

The reply carries no data, so a group sees nothing that belongs to one person. A LINE postback or any other event that is not a message or an account link gets no reply.

## Shared cards

A person who presses ส่งต่อ under a card, or asks the chat to share it (`share_card`), can send it to a colleague in Teams or LINE (`lib/server/share/`). This is the only message a channel sends without being asked, and a person starts it, not Winyu. The message carries the card's title, who shared it, their note and a **เปิดดูใน Winyu** button to `https://<winyu host>/s/<code>`. It carries no value from the card. Opening the link re-runs the card's reads as the person who opens it.

- Teams posts an Adaptive Card with `Action.OpenUrl` into the person's 1:1 conversation with the bot. Winyu keeps that conversation (`.data/teams-conversations.json`) from the last private message the person sent the bot. A person who never wrote to the bot gets the share by email, and the share sheet says so before sending.
- LINE pushes a Flex bubble with a URI button to the linked LINE user. The notification text (`altText`) carries the short link for clients that cannot draw the bubble.
- Email always works and is the fallback for both. A failed Teams or LINE send also falls back to email.

Channels send no other notification. A handoff notice in Teams or LINE would ask the person to come back to the web inbox to act, which the handoff-closed product rule rules out.

## Choices

| Choice | Picked | Why |
|---|---|---|
| Asking in the chat apps | Not offered (2026-10-09) | Each chat app needed its own answer cards, approval buttons and thread handling next to the web chat, which works on mobile already. Keeping both in step cost more than the chat apps added. |
| Channel runtime | Chat SDK (`chat` 4.41.1) with the official `@chat-adapter/teams` 4.41.1, pinned exactly | The official adapter verifies Bot Framework JWTs and posts into stored conversations, which a share needs. |
| Teams card | Winyu's own Adaptive Card 1.5 JSON, posted through a subclass of the official adapter | The share card and the fixed reply are a few lines of JSON each. |
| LINE adapter | A small adapter on the official `@line/bot-sdk` 11.3.0 (`lib/server/channels/line.ts`) | `chat-adapter-line` 0.1.6 was one day old, had one maintainer, and shipped only minified output that cannot be reviewed line by line. Winyu needs signature checks, a fixed reply, accountLink events, push, and link-token issue. |
| LINE identity | LINE's account-link flow | LINE reports which LINE user finished the link, and Winyu links only when that user is the one it issued the token to. A plain one-time code would bind whichever LINE account sent the code to whoever signed in, so a forwarded link could send one person's shares to another person's LINE. |

## Run it locally

```bash
WINYU_DATA_DIR=/tmp/winyu-channels bun run seed
S=http://localhost:3295
WINYU_DATA_DIR=/tmp/winyu-channels WINYU_SCHEDULER=off WINYU_PUBLIC_URL=http://localhost:3218 \
  TEAMS_APP_ID=00000000-aaaa-4bbb-8ccc-000000000001 TEAMS_APP_TENANT_ID=11111111-2222-4333-8444-555555555555 TEAMS_SIMULATOR_URL=$S \
  LINE_CHANNEL_ID=2000000001 LINE_CHANNEL_SECRET=simulated-line-channel-secret LINE_CHANNEL_ACCESS_TOKEN=simulated-line-access-token \
  LINE_API_URL=$S LINE_ACCESS_URL=$S bunx next dev --port 3218
WINYU_DATA_DIR=/tmp/winyu-channels bun run channels:walk   # starts the simulator on :3295 and runs every step against the dev server; no model calls
```

The walk links u_krit's mock Entra account, then prints what Winyu sent for each step: an unlinked Teams sender, u_krit's Teams message, the LINE link flow, u_krit's LINE message, and a share from u_thana to u_krit by Teams, LINE and email. `WALK_STEPS=teams-linked,share-line` runs a subset, `WALK_APP` names the server and `WALK_SIM_PORT` the simulator port. Run it with the same `WINYU_DATA_DIR` as the server, because it writes the Entra link straight into the store.

The simulator (`scripts/channels-sim.ts`) stands in for both platforms. It signs Teams activities as the Bot Framework does (RS256 JWT with issuer `https://api.botframework.com`, audience = app id and a `serviceurl` claim) and publishes its keys. In development, Winyu checks those claims against the simulator's keys in place of Microsoft's. The simulator receives messages as the Bot Connector API, signs LINE webhooks with the channel secret, answers the LINE Messaging API, and plays LINE's account-link dialog.

## Demo mail inbox

`/dev/mail` shows the recipient's side of mail as an Outlook-style web client. Mail never leaves the machine: every message is an Outbox entry, and this page reads the same store. It exists only in development and needs a signed-in browser.

- Pick the mailbox owner in the header (กล่องจดหมายของ, u_krit by default). The URL keeps the owner, the folder and the open mail (`/dev/mail?as=u_krit&f=sent&m=<id>`), so a presenter can bookmark or reload it.
- กล่องจดหมายเข้า holds every entry addressed to the owner, of every kind: shares, `send_email` from colleagues, handoffs, watch alerts and the digest. ส่งแล้ว holds what the owner sent as a person. Winyu's watch alerts and digest are in no one's sent folder.
- The page refreshes from the server every 3 seconds, so new mail appears without a reload.
- The mail body renders in a sandboxed iframe that may only open popups. A link into this Winyu opens a new tab on the other loopback host through `/dev/as`, signed in as the mailbox owner (`app/dev/loopback-link.ts`). The browser keeps separate cookies per host, so the presenter's own tab keeps its session. `/dev/as` answers 404 in production and outside demo sign-in, and accepts only a path inside the app as `next`. Links to other origins stay as they are. `javascript:` and other non-web links lose their `href`.
- A mail's link points at `WINYU_PUBLIC_URL` (default `http://localhost:3100`). On another port, set `WINYU_PUBLIC_URL` to that origin, or the links open the server on :3100 instead.

Mail in the demo never leaves the machine: the generator's mail port writes to the in-app Outbox. Every receipt that says an email went out links to `/outbox` with **(เดโม ไม่ได้ส่งจริง)**.

## Tests

`bun test` runs both webhooks in-process against the simulator (`scripts/channel-harness.ts`). The model module is replaced by `scripts/scripted-model.ts`, and every channel test checks after each case that it served no model call, wrote no audit row and created no thread.

- `lib/server/channels/teams.test.ts` covers a linked sender (fixed card, conversation stored), an unlinked sender (ask-IT text, attempt recorded), group mentions (fixed card, private conversation kept, no attempt), a tampered or unsigned activity (401, nothing sent), and Microsoft's own validator refusing an unsigned activity when no simulator is set.
- `lib/server/channels/line.test.ts` covers a missing, wrong or stale signature (401, nothing sent), the unlinked prompt and attempt, the full link flow followed by the fixed reply, a spent link token, a cross-site confirm, LINE reporting a different user, and group behaviour.
- `lib/server/share/share.test.ts` covers a Teams share falling back to email until the person wrote to the bot, then an Adaptive Card with `Action.OpenUrl`, and a LINE share as a pushed Flex bubble. `app/dev/as/route.test.ts` covers the persona route's checks.
