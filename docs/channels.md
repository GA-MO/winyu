# Microsoft Teams and LINE channels

Employees can ask Winyu from a private chat in Microsoft Teams or LINE. Each message runs as the Winyu user the sender is linked to, with the same role, data scope, masking, admin rules, kill switches, tool budget and audit as the web chat. The audit records the initiator as `teams` or `line`, and `/admin?tab=audit` labels those runs **ผ่าน Teams** or **ผ่าน LINE**.

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
5. A **Teams app package** (a zip of `manifest.json` and two icons) uploaded in the Teams admin center and made available to the people who use Winyu. A minimal manifest:

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/teams/v1.19/MicrosoftTeams.schema.json",
  "manifestVersion": "1.19",
  "version": "1.0.0",
  "id": "<Microsoft App ID>",
  "developer": { "name": "<company>", "websiteUrl": "https://<winyu host>", "privacyUrl": "https://<winyu host>", "termsOfUseUrl": "https://<winyu host>" },
  "name": { "short": "Winyu" },
  "description": { "short": "ถามข้อมูลธุรกิจด้วยสิทธิ์ของคุณ", "full": "Winyu ตอบคำถามข้อมูลธุรกิจด้วยสิทธิ์เดียวกับในเว็บ" },
  "icons": { "color": "color.png", "outline": "outline.png" },
  "accentColor": "#4F46E5",
  "bots": [{ "botId": "<Microsoft App ID>", "scopes": ["personal", "team", "groupChat"], "supportsFiles": false, "isNotificationOnly": false }],
  "validDomains": ["<winyu host>"]
}
```

Send these values to the Winyu team. Send the secret through your secret store.

| Value | Setting in Winyu |
|---|---|
| Microsoft App ID | `TEAMS_APP_ID` |
| Client secret value (skip when using a managed identity) | `TEAMS_APP_PASSWORD` |
| Directory (tenant) ID | `TEAMS_APP_TENANT_ID` |

People need no extra step in Teams. Teams sends the sender's Entra object id with every message, and Winyu looks it up in the same identity links as web sign-in (`entra:<tenant>:<object id>`, see `docs/sso.md`). A person whom IT has linked for the web can ask in Teams at once. A person who is not linked gets a reply that says IT has to grant access, and their attempt appears on `/admin?tab=signin`, where IT grants or dismisses it.

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
2. The button opens `https://<winyu host>/link/line/<link token>`. The person signs in to Winyu (Microsoft or demo) and confirms. The page names the LINE account and the Winyu user it will act as.
3. Winyu sends the browser to LINE's account-link dialog. LINE completes the link in the LINE user's own session and reports it to the webhook as an `accountLink` event from that LINE user, with the one-time nonce.
4. Winyu links `line:<channel id>:<LINE user id>` to that Winyu user and replies **เชื่อมบัญชี LINE กับ <name> แล้ว**.

The link token and the confirmation each work once and expire after 10 minutes. Winyu also checks that the LINE user in LINE's report is the user it issued the token to. IT sees every LINE link on `/admin?tab=signin` and can unlink it. Unlinking takes effect on the next message.

## Configure the server

| Variable | Value |
|---|---|
| `WINYU_PUBLIC_URL` | The address people open Winyu at, for example `https://winyu.example.com`. Used in the **ดูต่อในเว็บ** buttons and the LINE link page. |
| `TEAMS_APP_ID`, `TEAMS_APP_PASSWORD`, `TEAMS_APP_TENANT_ID` | From the Teams table. Without `TEAMS_APP_ID`, `/api/channels/teams` answers 503. |
| `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` | From the LINE table. Without all three, `/api/channels/line` answers 503. |
| `TEAMS_SIMULATOR_URL`, `LINE_API_URL`, `LINE_ACCESS_URL` | Development only. They point the channels at the local simulator. Winyu ignores them when `NODE_ENV=production`. |

## Deploy

- Serve Winyu over HTTPS on a public host. Microsoft and LINE call the two webhook paths from the internet. `proxy.ts` lets `/api/channels/*` through without a session, because the webhooks authenticate themselves. Teams requests carry a Bot Framework JWT that the official adapter verifies against Microsoft's published keys. LINE requests carry an `X-Line-Signature` HMAC that Winyu checks against the channel secret before it reads the body.
- Run one server instance. The Chat SDK state (duplicate-delivery checks, per-conversation queue) lives in memory, and held approvals, link tokens and nonces live in `.data`. Several instances need a shared store first: `@chat-adapter/state-redis` for the Chat SDK and a shared database for the JSON store.
- The webhook routes allow 60 seconds (`maxDuration`). LINE events are answered after the 200 through Next's `after()`. For Teams private chats the official adapter keeps the request open until the answer is posted. An answer that takes longer than Teams' 15-second limit may arrive twice from Teams, and the adapter's duplicate check drops the second copy.
- Outbound calls go to `smba.trafficmanager.net` (Teams replies, through the `serviceUrl` in each activity), `login.microsoftonline.com` and `login.botframework.com` (tokens and keys), and `api.line.me` and `access.line.me` (LINE). Allow them in the egress firewall.

## How a message is handled

1. The route verifies the request (Teams JWT or LINE signature) and refuses anything else with 401.
2. A message in a group chat or a Teams channel gets no data. The bot replies that it answers only in a private chat, because the answer uses one person's permissions and the whole group would read it. In LINE groups the bot replies only when someone mentions it.
3. The sender's identity is looked up in `lib/server/identity.ts`. An unlinked sender gets the way to get linked and nothing else, and IT sees the attempt.
4. The turn runs through `serveCopilot`, the same code path as the web chat, as the linked user, with `initiator` set to the channel. That one path covers the harness run and trace, the gateway (scope, masking, CEL rules, kill switches, budget, audit), the approvals ledger, the thread record, the card stream and memory extraction.
5. The reply has the model's words and one compact card per bound result (`query_metric`, `get_alerts`, `get_forecast`), built from the same `present.ts` decision table as the chat card. A card shows the headline label and value, the change in red or green, the comparison, up to 5 rows, and **และอีก N รายการ ดูต่อในเว็บ** for the rest. Composed cards (people, sites, courses) show their title and rows. Every reply ends with **ดูต่อในเว็บ**, which opens the same thread in the web app.
6. Each private chat is one Winyu thread per person (`teams-<hash>` or `line-<hash>`). The web rail lists it with a **Teams** or **LINE** label.

## Approvals

A write tool (handoff, email, pin, watch, leave, enrolment, permission change, job) stops at an approval, as in the web. Teams shows **อนุมัติ** and **ไม่อนุมัติ** as Adaptive Card `Action.Submit` buttons. LINE shows them as Flex postback buttons. The buttons carry only a short id of the held approval. Pressing one resumes the run through `serveCopilot` with the original interrupt, so the spent-once ledger decides. An answer counts once, only from the person who was asked, and only in the channel that asked. A second press gets **การอนุมัตินี้ใช้ไปแล้ว**. The same approval also shows in the web thread, and whichever answer comes first wins.

Interactive approval beats a read-only channel with a link to the web. The ledger is the security boundary, and a chat button is one more client of it. A link to the web would ask people to switch apps for a yes or no.

## Notifications

Channels never message anyone unprompted, except a card a colleague shared with them (see Shared cards). A handoff notice in Teams or LINE would ask the person to come back to the web inbox to act, which the handoff-closed product rule rules out. Notifications are therefore not built. Adding them later needs a message that is complete in the chat app, and a setting that is off by default.

## Shared cards

A person who presses ส่งต่อ under a card can send it to a colleague in Teams or LINE (`lib/server/share/`). This is the one message a channel sends without being asked, and a person starts it, not Winyu. The message carries the card's title, who shared it, their note and a **เปิดดูใน Winyu** button to `https://<winyu host>/s/<code>`. It carries no value from the card. Opening the link re-runs the card's reads as the person who opens it.

- Teams posts an Adaptive Card with `Action.OpenUrl` into the person's 1:1 conversation with the bot. Winyu keeps that conversation (`.data/teams-conversations.json`) from the last private message the person sent the bot, so a person who never wrote to the bot gets the share by email, and the share sheet says so before sending.
- LINE pushes a Flex bubble with a URI button to the linked LINE user. The notification text (`altText`) carries the short link for clients that cannot draw the bubble.
- Email always works and is the fallback for both. A failed Teams or LINE send also falls back to email.

## Choices

| Choice | Picked | Why |
|---|---|---|
| Channel runtime | Chat SDK (`chat` 4.41.1) with the official `@chat-adapter/teams` 4.41.1, pinned exactly | Mastra's `Agent.channels` runs the agent through its own signal pipeline. That pipeline skips `serveCopilot`, so it would lose the harness run, the approvals ledger, the thread record and the card stream, and its approval card would resume the tool outside the ledger. Mastra uses the same Chat SDK adapters underneath. |
| Teams card | Winyu's own Adaptive Card 1.5 JSON, posted through a subclass of the official adapter | The Chat SDK card model has no text colour, and the change must show red or green. |
| LINE adapter | A small adapter on the official `@line/bot-sdk` 11.3.0 (`lib/server/channels/line.ts`) | `chat-adapter-line` 0.1.6 was one day old, had one maintainer, and shipped only minified output (27 KB) that cannot be reviewed line by line. Winyu needs signature checks, text, postback and accountLink events, reply with push fallback, and link-token issue, which is about 330 lines in three files on the official SDK. |
| LINE identity | LINE's account-link flow | LINE reports which LINE user finished the link, and Winyu links only when that user is the one it issued the token to. A plain one-time code would bind whichever LINE account sent the code to whoever signed in, so a forwarded link could hand one person's data to another person's LINE. |

## Run it locally

```bash
bun run seed
S=http://localhost:3295
WINYU_SCHEDULER=off WINYU_PUBLIC_URL=http://localhost:3218 \
  TEAMS_APP_ID=00000000-aaaa-4bbb-8ccc-000000000001 TEAMS_APP_TENANT_ID=11111111-2222-4333-8444-555555555555 TEAMS_SIMULATOR_URL=$S \
  LINE_CHANNEL_ID=2000000001 LINE_CHANNEL_SECRET=simulated-line-channel-secret LINE_CHANNEL_ACCESS_TOKEN=simulated-line-access-token \
  LINE_API_URL=$S LINE_ACCESS_URL=$S bunx next dev --port 3218
bun run channels:walk      # starts the simulator on :3295 and runs every scenario against the dev server (real model calls)
bun run channels:view      # writes .shots/f11-view.html and one JSON file per card from the walk's transcript
```

`WALK_STEPS=teams-ceo,line-link,...` runs a subset. The steps `teams-stranger`, `teams-group`, `line-link` and `line-prompt` call no model.

The simulator (`scripts/channels-sim.ts`) stands in for both platforms. It signs Teams activities as the Bot Framework does (RS256 JWT with issuer `https://api.botframework.com`, audience = app id and a `serviceurl` claim) and publishes its keys. In development, Winyu checks those claims against the simulator's keys in place of Microsoft's. The simulator receives replies as the Bot Connector API, signs LINE webhooks with the channel secret, answers the LINE Messaging API, and plays LINE's account-link dialog.

## Demo screen

`/dev/channels` shows Winyu as people see it in the chat apps: a Microsoft Teams desktop chat on the left and a LINE phone on the right. It exists only in development and needs the simulator.

```bash
make up CHANNELS=on    # connectors, the channel simulator on :3295, and dev on :3100 pointed at it
```

Open `http://localhost:3100/dev/channels` while signed in. Each pane has its own persona picker (Teams starts as u_thana, LINE as u_krit). On start, `bun run channels:sim` (`scripts/channels-demo-sim.ts`) links every persona to a mock Entra account (`mockObjectId`) and a fixed LINE user id with `linkedBy: "channels-demo"`, so anyone can write from either pane without the LINE link flow. It skips links that already exist.

- Each pane draws what Winyu really sent: the Adaptive Cards and Flex bubbles Winyu builds, with working buttons. Approve and reject go back to Winyu as a Teams `Action.Submit` or a LINE postback.
- A card someone shares from the web (ส่งต่อ) appears in the recipient's pane when that persona is picked. Teams can reach a person only after they have written to the bot once, so write from the Teams pane first.
- A button that opens Winyu (ดูต่อในเว็บ, เปิดดูใน Winyu) opens a new tab on the other loopback host (`127.0.0.1` when the page runs on `localhost`, and the reverse) through `/dev/as?user=<persona>&next=<path>`. The browser keeps separate cookies per host, so the new tab is the pane's persona and the presenter's own tab keeps its session. `/dev/as` answers 404 in production and outside demo sign-in, and accepts only a path inside the app as `next`.
- The simulator keeps its chat log in memory. Restarting it clears the panes but not Winyu's stored Teams conversations.

The page talks to the simulator's control API, which any script can also use:

| Route | Does |
|---|---|
| `GET /ui/people` | The personas with their `oid` and `lineUserId` (served by `channels:sim`) |
| `GET /ui/feed?after=<seq>` | Every entry after the cursor: what people sent (`inbound`), what Winyu sent (`message`, `reply`, `push`), and typing signals (`typing`, `loading`). `thread` names the chat: the Teams conversation id or the LINE user id. |
| `POST /ui/teams/say` `{oid,name,text}` | A person writes in their private Teams chat; answers 202 at once |
| `POST /ui/teams/press` `{oid,name,actionId,value,label?}` | A person presses an `Action.Submit` button |
| `POST /ui/line/say` `{lineUserId,name,text}` | A LINE user writes to the bot |
| `POST /ui/line/press` `{lineUserId,data,label?}` | A LINE user presses a postback button |

## Demo mail inbox

`/dev/mail` shows the recipient's side of mail as an Outlook-style web client. Mail never leaves the machine: every message is an Outbox entry, and this page reads the same store. It exists only in development, needs a signed-in browser like `/dev/channels`, and does not need the simulator.

- Pick the mailbox owner in the header (กล่องจดหมายของ, u_krit by default). The URL keeps the owner, the folder and the open mail (`/dev/mail?as=u_krit&f=sent&m=<id>`), so a presenter can bookmark or reload it.
- กล่องจดหมายเข้า holds every entry addressed to the owner, of every kind: shares, `send_email` from colleagues, handoffs, watch alerts and the digest. ส่งแล้ว holds what the owner sent as a person. Winyu's watch alerts and digest are in no one's sent folder.
- The page refreshes from the server every 3 seconds, so new mail appears without a reload.
- The mail body renders in a sandboxed iframe that may only open popups. A link into this Winyu opens a new tab on the other loopback host through `/dev/as`, signed in as the mailbox owner, the same way the channel panes open links (`app/dev/loopback-link.ts`). Links to other origins stay as they are. `javascript:` and other non-web links lose their `href`.
- A mail's link points at `WINYU_PUBLIC_URL` (default `http://localhost:3100`). On another port, set `WINYU_PUBLIC_URL` to that origin, or the links open the server on :3100 instead.

Mail in the demo never leaves the machine: the generator's mail port writes to the in-app Outbox. Every receipt that says an email went out links to `/outbox` with **(เดโม ไม่ได้ส่งจริง)**.

## Tests

`bun test` runs both channels end to end with a scripted model in place of Gemini, so no test calls a paid model. `scripts/scripted-model.ts` lets any test drive the real agent, gateway and harness.

- `lib/server/channels/answer.test.ts` covers the CEO's six regions against u_krit's ภาคอีสาน only, audit initiator `teams`, the unlinked sender, the shared conversation, and approve, replay, another person's press and reject through the ledger.
- `lib/server/channels/teams.test.ts` covers signed activities through the official adapter, the Adaptive Card content, scope, the unlinked sender, the group mention, approvals, a tampered or unsigned activity (401), and Microsoft's own validator refusing an unsigned activity when no simulator is set.
- `lib/server/channels/line.test.ts` covers a missing, wrong or stale signature (401, nothing sent), the unlinked prompt, the full link flow followed by u_krit's scope, a spent link token, a cross-site confirm, LINE reporting a different user, postback approvals, and group behaviour.
- `lib/server/channels/render.test.ts` covers colours, buttons, postback round trips, plain text for LINE and composed-card rows.
- `scripts/channels-sim.test.ts` covers the control API: a say answers 202, and the feed then holds the inbound entry and the reply on the sender's thread. `app/dev/as/route.test.ts` covers the persona route's checks.
