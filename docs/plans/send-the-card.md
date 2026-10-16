# Send the card, not a message

Winyu has two ways to pass something to a colleague, and they do not meet.

- **Share** (`share_card`, `POST /api/shares`, `lib/server/share/*`) sends a card. The **ส่งต่อ** pill on every chat card (`components/ui/card-share.tsx`) opens a sheet (`components/share/share-sheet.tsx`). The sheet sends without a model call. The share stores the reads behind the card (`SharedCard` in `lib/share/card.ts`), never their results. The recipient opens `/s/[code]`, where `openShare` (`lib/server/share/view.ts`) re-runs the reads under the recipient's access. Rows the sender could see and the recipient cannot are listed by name, with no values (`lockedRowsOf`, `lib/server/share/locked.ts`). Nobody has to answer a share.
- **Handoff** (`create_handoff`, `lib/server/handoff.ts`) sends a `ContextPacket`: a title, an ask, an urgency, up to four metric queries as evidence, and a status that the recipient changes. Only the model can start one, which takes 25 to 40 seconds. The recipient never sees a card. The Inbox row (`HandoffRow` in `components/inbox/drawer.tsx`) shows the ask and one anomaly bar. **ตรวจในแชต** opens a chat that starts with a long generated user message (`TH.handoff.preloadPrompt`), and the model then decides which cards to draw.

The share has the right card and the handoff has the right workflow. This plan makes one thing out of them: a **matter** (เรื่อง). A matter is a share that can ask for an answer, can be passed on, and closes itself when its number recovers.

Delivery stays inside Winyu. The sheet stops offering email, Teams, and LINE. The demo runs on four Winyu windows, and a second app would make it harder to follow. The channel code stays where it is for later.

## สถานะ (2026-10-16)
ผู้ใช้รับทั้ง 4 ข้อตามที่แนะนำ (2026-10-16) phase 1 กับ phase 5 เสร็จและตรวจใน browser แล้ว: ส่งจากชีต 0.3 วินาที กระดิ่งผู้จัดการภาคขยับเองภายใน 12 วินาที phase 2 เสร็จและตรวจแล้ว (2026-10-16, HTTP ด้วย session จริง: ผู้จัดการภาคเห็นอีสานและอีก 5 ภาค "ซ่อน · ขอดู", ส่งต่อให้คุณกฤต, คุณกฤตรับ, หน้าของ CEO แสดงเส้นทางครบ, คนนอกเส้นทางได้ 404) เหลือ phase 3 กับ 4 ซึ่งอยู่ใน wave 3 ของ fix-root-causes.md

## What a user needs from sending work

These six rules come from one question: what makes a sales manager keep using this after the first week? Every phase serves one or more of them.

1. **The recipient finds it without looking for it.** The bell changes as soon as the recipient's window has focus (built in `c44a7e0`). While the window is visible, the bell also changes by itself within a few seconds.
2. **The card is the work.** The recipient sees the card the sender saw, re-run under the recipient's access. Rows outside that access show as hidden, with the person who can grant them. The ask is one line on the card, not a paragraph above it.
3. **Sending is faster than a screenshot.** **ส่งต่อ** opens a sheet that already names the right person and a draft ask. The sender checks and taps **ส่ง**. No model call and no wait.
4. **The recipient answers on the card.** There are three actions: **รับ**, **ขอข้อมูลเพิ่ม**, and **ไม่ใช่ของผม**. The last one finds the owner and passes the matter on, without sending it back to the sender.
5. **Nobody chases.** A matter is one record with a path of people. The CEO who started it sees that the RSM passed it to a sales rep and that the rep accepted, without asking anyone. When the card's number reaches its goal, Winyu tells everyone on the path once and closes the matter.
6. **No noise.** Each person gets one notification per matter event. Winyu sends no repeated reminders.

## The matter grows out of `Share`

`Share` (`lib/server/share/shares.ts`) already holds the card as reads, the title, the question, the note, the code, and who opened it. The matter adds the workflow fields to that record. `ContextPacket` goes away.

```ts
type Matter = {
	id: string;
	code: string;                      // the existing 12-character share code; /s/[code] becomes the matter page
	card: SharedCard;                  // unchanged: the reads behind the card, re-run for each viewer
	titleTh: string;
	question: string;                  // the question that produced the card
	ask: string;                       // one line; drafted from the card, confirmed or edited by the sender; fenced as data wherever a model reads it
	intent: "act" | "fyi";             // act: the holder must answer; fyi: for information only
	urgency: "now" | "today" | "this_week";
	goal: MatterGoal | null;           // when the live number meets it, the matter closes itself
	path: Hop[];                       // people in order; the last hop that is not "passed_on" holds the matter
	thread: MatterEvent[];
	status: "open" | "done" | "dropped";
	createdAt: string;
	updatedAt: string;
};

type Hop = { userId: string; fromUserId: string | null; at: string; state: "sent" | "seen" | "accepted" | "asked" | "passed_on" };

type MatterGoal = { read: number; field: string; atLeast: number } | { read: number; field: string; atMost: number };

type MatterEvent = { userId: string | null; at: string; kind: "note" | "accepted" | "asked" | "passed_on" | "goal_met" | "done"; text: string | null };
```

Three choices in this shape need a reason.

- **The card stays as reads, not numbers.** The share already works this way, and it is the reason a CEO can send an all-region card to an RSM safely. Stored numbers would put every region in the store for the RSM to read. With generated data, a read with a fixed date range returns the numbers the sender saw. With real data that can be restated, those numbers can drift. The card shows its as-of date, so the drift is visible.
- **One record for the whole path.** A pass-on adds a hop. It does not copy the matter. The status the CEO sees is the record itself, which is what rule 5 needs.
- **`intent` replaces the split between share and handoff.** A share today is a matter with `intent: "fyi"`. A handoff today is a matter with `intent: "act"`.

## Where it shows up

- **On every card:** the existing **ส่งต่อ** pill. The pill already reads the card from the tool result (`sharingOf` in `components/chat/exchange-view.tsx`).
- **The sheet:** the first recipient comes from `responsibleFor` (`lib/access/raci.ts`), with the region taken from the card's reads. The contact list stays under it. The sheet drafts the ask from the card title and headline, and the sender can edit it. A toggle switches between **ต้องตอบ** and **ให้ดู**. The channel choice goes away. **ส่ง** sends at once, and the tap is the approval.
- **The bell and Inbox:** a matter shows as its card at small size, with the ask, the sender, and the three actions.
- **The matter page (`/s/[code]`):** the card under the viewer's access, the path with each person's state, the thread, and the actions for the current holder. Anyone on the path can open it. The existing `mayOpen` rule decides who else can.
- **Chat:** "ส่งเรื่องนี้ให้ผู้จัดการขายภาคอีสาน" still works. The model calls one tool, `send_card`, and the reply shows the same sheet, filled in, for the sender to confirm. **ถาม Winyu ต่อ** on a matter opens a chat with the matter as fenced context. The generated user message goes away.

## Phases

Each phase ends with `bun run typecheck`, `bun run test`, and a walk through the four demo windows (`ceo.localhost`, `rsm.localhost`, `rep.localhost`, `it.localhost`) at phone width.

### Phase 1. The sheet sends a matter

- [x] Add the matter fields to the share record and its parser. Existing shares load as `intent: "fyi"` with a one-hop path.
- [x] In the sheet, suggest the first recipient from `responsibleFor`, draft the ask, add the **ต้องตอบ** and **ให้ดู** toggle, and remove the channel choice.
- [x] Gate the **ส่งต่อ** pill, `/api/shares`, and `share_card` on `handoffEnabled()`. Today the admin copy says the switch hides the button on every page, but the card pill stays (`lib/access/enforce.ts` gates only `create_handoff` and `send_email`).
- [x] Check: the CEO sends the northeast story card to the RSM from the sheet in under 5 seconds. The RSM's bell shows it. `.data/model-calls.json` gains no row.

### Phase 2. The recipient answers on the card

- [x] Show `act` matters in the bell and Inbox as small cards with the ask and the three actions.
- [x] **ไม่ใช่ของผม** passes the matter to the `responsibleFor` owner. If the owner is the holder, it asks the sender instead.
- [x] Turn `/s/[code]` into the matter page: the card, the path, the thread, and the holder's actions.
- [x] Check: the CEO sends an all-region sales card to the RSM. The RSM sees the northeast row and locked rows for the other regions. The RSM passes the matter to the Khon Kaen sales rep. The rep taps **รับ**. The CEO's matter page shows CEO, RSM (passed on), and sales rep (accepted).

### Phase 3. One tool for chat, and the handoff goes away

- [x] Add `send_card`. Its result renders the sheet, filled in, for the sender to confirm.
- [x] Move every caller of `ContextPacket` and the packet store to matters. The callers include `lib/server/inbox.ts`, `app/api/inbox/[id]/route.ts`, `persona.ts`, `lib/server/demo-story.ts`, and `app/(app)/c/new/page.tsx`. Then delete `ContextPacket`, `create_handoff`, `share_card`, `HandoffRow`, and `TH.handoff.preloadPrompt`.
- [ ] Re-record the eval cases that the tool change makes stale. Run `bun run eval --live --changed` first and read the estimate. A rename of one native tool once made 67 cases stale (about $0.36). On 2026-10-16 all 63 cases were stale (prompt and tools changed); the estimate was 63 × $0.0060 ≈ $0.38, over the default cap, and nothing was recorded. `share-card-chat` and `handoff-not-share` asked for the removed tools, so their `rightTool`, `askedApproval` and `rightRecipient` failures sit in `evals/known-failures.json` until they are re-recorded.
- [x] Check: "ส่งเรื่องนี้ให้ผู้จัดการขายภาคอีสาน ด่วน" in chat shows the sheet with the RSM filled in, and **ส่ง** creates the matter. (Scripted model, 2026-10-16: the approval asked for `send_card` with the RSM, nothing was stored before the yes, the yes was spent once, and one matter went out with urgency "now", the northeast card and its target goal.)

### Phase 4. The matter closes itself

- [x] Derive a goal when the card has one: the target for an attainment card, or the expected value for an anomaly card. The sender can clear it in the sheet. (An anomaly card's goal is the anomaly engine resolving its alert: the semantic layer's total and the engine's per-day mean are different numbers.)
- [x] Check open matters that have goals in the hourly watch job (`runWatchJob`, `lib/server/watches.ts`). Watches today notify only when a number goes from ok to triggered, so recovery is a new event. When the number meets the goal, add a `goal_met` event, close the matter, and notify each person on the path once.
- [x] Check: with a goal just below the current value, one watch run closes the matter, and each person on the path gets exactly one notification. (Over HTTP on 2026-10-16: attainment 92.0%, goal set to 91%, the first `POST /api/jobs/run {"job":"watches"}` closed it and told the CEO, the RSM and the rep once each; the second told nobody.)

### Phase 5. The bell moves by itself

- [x] While the window is visible, fetch the counts every 10 seconds in `components/inbox/counts.ts`, as well as on focus. Stop while the window is hidden.
- [x] Check: with the RSM window visible next to the CEO window, a matter the CEO sends shows on the RSM's bell within 10 seconds, with no click.

## The demo after this plan

1. The CEO opens the northeast story, taps **ส่งต่อ** on its card, checks that the sheet names ผู้จัดการขายภาคอีสาน, and taps **ส่ง**. This takes about 3 seconds instead of 25 to 40.
2. The RSM's bell changes by itself. The RSM opens the matter and sees the same card, the ask, and the three actions. The RSM passes it to the Khon Kaen sales rep.
3. The sales rep taps **รับ**.
4. On the CEO's window, the matter page shows the whole path.
5. IT opens **Audit** and sees each send, pass-on, and answer.

## Decisions for the user

1. **One feature, not two.** Share and handoff become one matter with `intent`. I recommend this. The cost is phase 3, which deletes the handoff code and re-records the stale eval cases.
2. **The sheet is the approval.** A send from chat still shows the sheet and waits for **ส่ง**. Nothing leaves without the sender's tap.
3. **No outside channels in the sheet.** Email, Teams, and LINE delivery stay in the code but leave the sheet. They can come back later and carry a link to `/s/[code]`, with no change to the matter.
4. **A goal closes the matter.** I recommend this, because it is what makes senders stop chasing. A sender who wants to close a matter by hand can still tap **เสร็จ**.
