# Fix the 10 root causes before the demo

The simulated-user round on 2026-10-16 found 40 problems. They come from 10 root causes, listed with evidence and fix points in [`docs/issues/ai-answers.md`](../issues/ai-answers.md#สาเหตุจริง-จำแนก-2026-10-16). This plan fixes all of them before the demo on Friday 2026-11-27, together with three UI changes the user asked for.

## สถานะ (2026-10-16)
เริ่ม wave 1

## Decisions taken

- **User (2026-10-16): "ทำให้ถูกต้องให้หมด".** Every root cause gets fixed, not only the demo path.
- **No paid eval.** Verify each fix with `bun test` ($0, recordings included) and with simulated users: agents that play real roles in the browser and replay only the turns that failed. Do not run `bun run eval --live`.
- **RC2 dates.** The generated data ends on 2026-11-26. Winyu's "today" is 2026-11-27, the demo day. Both live in one module and can be set by environment variable, so a rehearsal shows the same numbers as the demo. The planted anomalies count back from the last data day instead of using fixed dates. Grant expiry keeps the real clock.
- **RC10 suppression.** Small-cell suppression protects people. It applies only to metrics about people (HR metrics). Business metrics such as overdue AR are not suppressed at any grain. "Hidden by the small-cell rule" gets its own provenance field, separate from "masked by role", so no one is offered a request-access button for data they already have.
- **RC10 agent owner.** Each agent gets one assigned sales rep in master data. The CRM visit generator draws the visiting rep from that assignment. "My agents" means the agents assigned to the signed-in rep.
- **RC9 speed.** Reasoning effort and the provider tier are chosen by measurement on a production build on an idle machine, with simulated users replaying the slow turns.

## UI changes the user asked for

- Remove the persona switcher (**สลับผู้ใช้ (โหมดสาธิต)**) from the account sheet and any sidebar entry. People switch by signing out.
- On the home page, put the prompt input at the bottom, near the thumb, and the mini dashboard above it. Remove the **ดู Dashboard** button.

## The loop until it is excellent

User (2026-10-16): "ตรวจสอบทดลองปรับแก้ไปจนกว่าทุกอย่างใช้งานได้เยี่ยมไม่มีจุดที่แปลกๆ … loop ทำไปแต่ช่วยประหยัดค่า api". Each round:

1. Fix: merge the work packages, each checked by the lead (diff against report, one mutation, `bun test`).
2. Check for $0 first: `bun test` (recordings included), `/dev/replay` of recorded cases, the card-fit audit over saved tool results and screenshots, HTTP checks with real sessions.
3. Check with the model only where nothing else can: simulated users replay only the turns that failed last round, plus a few new turns per demo role. Say the estimated cost before each round.
4. Review with separate agents, write new findings into `docs/issues/ai-answers.md`, group by root cause, fix.

Stop when a round on the four demo roles (CEO, RSM อีสาน, sales rep ขอนแก่น, IT) finds no medium or high finding, every card fits its question, and the run sheet walk in four windows passes.

**Scope from round 4 on** (user, 2026-10-17: "รอบ 4 เน้นแค่เส้นทางเดโม"): a round tests only the run-sheet path in four windows and the questions a visitor or the presenter is likely to ask on demo day for those four roles, plus the turns that failed on that path before. Findings off that path are logged in the issues file but do not block the stop condition.

**Card fit** (user, 2026-10-16): a card's form must fit the question and the data shape. The same layout for every answer makes Winyu look like a template.
- [x] **Card-fit audit** ($0) over the 63 recorded cases and the 75 sim screenshots; rules R1–R10 in [`card-fit.md`](card-fit.md).
- [x] **Card-fit fix** from that rule set.

## Round 8 fixes (after round 7, 2026-10-17)

Round 7 walked the run sheet and replayed the 13 round-6 failures ($0.25 plus $0.28 for the morning investigation): 19 fixed, 12 still broken, 17 new. The one high (AI-234) was a bug in the lead's own AI-207 follow-up, a fraction printed as a percent, fixed in `d340cf6` with a pinned value. 11 medium findings remain on the demo path. Packages, by files:
- [x] **K1 one base on every surface** (`c0605cd` `e11444b` `d1b5af9` `9b61251` `fdd0413` `42d9f80`) (AI-235, AI-238, AI-239, AI-240, AI-248, AI-249, AI-254, AI-257): a focused row reads on its card's base in the approval, the inbox and the matter headline; an overall row over a subset names the subset; "ขาดอีก" says from when to what; story headlines carry no unbased share; signs and colours.
- [x] **K2 month-close card and dashboard** (`da9b02b`) (AI-236, AI-237, AI-241, AI-246, AI-251, AI-253): a month-close question draws the month-end view in chat; a pinned projection that misses stays in view; a balance trend for a why; the pin receipt names what it replaced; one card per point in a why answer.
- [x] **K3 IT and presenter friction** (AI-242, AI-243, AI-244, AI-245, AI-252, AI-256, AI-259, AI-260): folded IT activity rows keep action and card; spend per person; titles of two sends of one card; the forward picker and its busy state on a phone; approval header and button; bell and drawer friction.
- [x] then the run sheet against the screens (AI-244 wording, AI-255, AI-258; walked again in round 8).

## Round 7 fixes (after round 6, 2026-10-17)

Round 6 walked the production-build run sheet in four windows and replayed the round-5 failures ($0.42 plus $0.21 for the morning investigation): 20 fixed, 8 still broken, 22 new. No high is open and every run-sheet step passes; 17 medium findings remain on the demo path, mostly one figure shown two ways. Packages, by files:
- [x] **J1 matter and share state** (AI-203, AI-208, AI-209, AI-210, AI-215, AI-220, AI-224, AI-230): a matter shows its receiver one number everywhere; a send about one agent opens on that agent with a goal that follows it; "ส่งแล้ว" survives navigation; an open bell panel refreshes; a pin says what it replaces; approval warnings follow the final ask.
- [x] **J2 cards and tiles** (AI-204 card part, AI-205, AI-206, AI-212, AI-213, AI-221, AI-222, AI-223, AI-228, AI-229, AI-231): month-end tiles carry the month-end shortfall, the landing tile names a forecast, balance metrics keep the running month, visit priority shows its basis, a year-target question gets the year-end answer, labels and signs.
- [x] **J3 what the model reads, and speed** (AI-204 text part, AI-207, AI-211, AI-214, AI-216, AI-217, AI-218): one base for multi-row target answers, the projection's own shortfall, no reference to a hidden button, a checked reason for a weekly drop, demo turns under 40 s.
- [x] **J4 IT** (AI-225, AI-226, AI-232): Thai reasons for blocked sends in the denials card, the tab row at phone width before Audit is chosen, one usage count across surfaces.
- [x] then the run sheet against the screens (AI-219, AI-227; walked again in round 7).

## Round 6 fixes (after round 5, 2026-10-17)

Round 5 replayed the round-4 failures per role and walked the rewritten run sheet in four windows on a production build at medium reasoning ($0.37 plus $0.40 for two morning investigations): 17 fixed, 16 still broken, 18 new. Run-sheet steps 1 to 5 pass end to end. The stop condition does not hold: one high on the demo path (AI-167, a chat send about one agent attaches the region card with a deictic ask, so the matter never names the agent) and 15 medium. Packages, by files:
- [x] **I1 send and matter** (AI-167 high, AI-168, AI-183, AI-184, AI-194, AI-197, AI-198): a send about one entity names it in the title and ask, two matters never share a title, a false claim in the user's message is answered before the approval, pins keep the rep's own agents and show the card's number, the sender's page reads as the sender's, actions confirm on screen.
- [x] **I2 alerts and grounded answers** (AI-169, AI-170, AI-172, AI-175, AI-176, AI-179, AI-182, AI-186, AI-190, AI-191, AI-192): get_alerts matches the metric family, an exclusion in the question carries into the reads, the alert's figure is the agent's own, text agrees with the alert card, hypotheses stay hedged, the story card title follows its query, visit priority shows its numbers.
- [x] **I3 cards** (AI-171, AI-173, AI-174, AI-185, AI-187, AI-188, AI-189): the row that answers carries its value, time series lead with what the question asks (year target, the step change), a forecast card that can be pinned, one base on the landing tile and in chat, correct labels.
- [x] **I4 speed, IT and receipts** (AI-178, AI-180, AI-181, AI-196, AI-199, AI-200): admin_audit takes no required role, the rep opener under 40 s, the live cancelled receipt matches the restored one, the IT screen fits and refreshes, activity names pinned cards.
- [x] then the run sheet against the screens again (AI-177, AI-193, AI-195; walked again in round 6).

## Round 5 fixes (after round 4, 2026-10-17)

Round 4 walked the run sheet in four windows and asked 26 likely demo-day questions ($0.62, plus $0.23 for the morning investigation): 21 fixed, 13 still broken, 21 new. The stop condition does not hold: one high on the demo path (AI-132, an approved send refused because the card read in the same step was not on screen when the run resumed) and 18 medium. Packages, by files:
- [x] **H1 approval and send** (AI-132 high, AI-138, AI-139, AI-152, AI-164): the resumed run sees the paused step's cards; the approval preview shows the card's hero; a new question does not re-raise an abandoned send; the pin accepts a period; denied cards draw no actions; rejoining a run does not repeat its steps.
- [x] **H2 matter and share sheet** (AI-137, AI-154, AI-155, AI-159): a matter's title and ask name its subject; the inbox row carries it; story pages do not offer to send to people already on the path; the sheet's owner group lists owners only.
- [x] **H3 cards** (AI-140, AI-141, AI-142, AI-144, AI-156, AI-157): one base per breakdown card; a verdict on the gap card, with the forecast first for month-end questions; R10 pairs only related results; verdict counts every row that meets it; scorecards and one-row cards follow the card rules; the landing tile labels the bucket it shows.
- [x] **H4 prompt, scope, story metric** (AI-134, AI-136, AI-143, AI-145, AI-146, AI-147, AI-158, AI-161, AI-162, AI-163): a rep's "ผม" is the agents he owns; the morning story uses the sales measure chat uses; whole-company asks outside scope are refused, not narrowed; "why" answers say when no contributor dominates.
- [x] **H5 IT answers** (AI-148, AI-149, AI-150, AI-151, AI-160): phone-width audit cards, `role_access` filtered by visibility, usage per person, console permission changes audited, Thai labels.
- [x] then speed (AI-133, measured on a production build): chat reasoning effort medium (`d8236c3`), demo turns 38.8 s worst over 35 turns; lookups still about 23 s, and low effort (8 s) waits on two answer fixes.
- [x] the run sheet rewritten against the screens (AI-135, walked again in round 5).

## Round 4 fixes (after round 3, 2026-10-17)

Round 3 replayed the 38 turns still broken after round 2 ($0.75): 20 fixed, 17 still broken, 22 new, stop condition not met. The high one: a chat send attached the wrong card, including an HR profile, and one was sent (AI-93). Packages, by files:
- [x] **G1 send the right card** (AI-93 high, AI-94, AI-100, AI-115, AI-120)
- [x] **G2 chat durability and the bell** (AI-96, AI-97, AI-99, AI-116, AI-117, AI-118, AI-123)
- [x] **G3 numbers and card wording** (AI-101 to AI-110, AI-113, AI-114, AI-121, AI-122, AI-124, AI-125, AI-130)
- [x] **G4 admin, memory, clock** (AI-95, AI-98, AI-111, AI-119, AI-126 to AI-129)
- [ ] then speed (AI-112, measured on a production build) and the run sheet again (AI-131)

## Round 3 fixes (after round 2, 2026-10-16)

Round 2 replayed the 72 round-1 problem turns ($1.10): 22 fixed, 18 still broken, 23 new; the stop condition does not hold. Groups, by the files they touch:
- [ ] **F1 approval fails closed** (AI-52 high, AI-54, AI-55, AI-79): a write runs only after a recorded yes; a not-ready write returns its fix and does nothing; resumed runs raise their approvals; a pending approval does not break the next message.
- [ ] **F2 one way to send** (after F1): send-the-card phase 3, `send_card` replaces `share_card` and `create_handoff` (AI-59), the current turn's card is the one sent (AI-56), Thai honorifics resolve (AI-57), a contradicting note is flagged (AI-58), the sender's own team first in the sheet (AI-62), the originator hears about pass-on and accept (AI-85).
- [ ] **F3 numbers and cards** (after the card-style package): AI-53 high (month-to-date attainment on one base), AI-63, AI-66 to AI-73, AI-76, AI-77, AI-78, AI-83, AI-87, AI-88, AI-89.
- [ ] **F4 prompt, memory, guardrail** (AI-61, AI-74, AI-75, AI-80, AI-81, AI-82, AI-84, AI-86, AI-90, AI-92).
- [ ] **F5 demo beats** : the IT step shows the chain's activity, not only denials (AI-60, done `1861c64`); the demo clock covers inbox, share and audit labels on rehearsal days (AI-65); speed (AI-64, RC9).

## Waves

Each wave runs its work packages in parallel, one agent per package in its own worktree, with disjoint files. The lead reviews every diff against the report, checks one mutation per package, merges, and walks the four demo windows before the next wave.

### Wave 1

- [x] **RC2 dates.** One clock module, data end 2026-11-26, relative anomalies, code-resolved periods with a "ข้อมูลถึง…" line, `get_forecast` by month, regenerate the data.
- [x] **RC3 + RC5 resolved query and focus.** The engine returns the resolved query (ids, full scope including `scopeApplied`, labels). Next actions, alert matching, RACI, the scope line and `get_alerts` slices use it. One focus function feeds card titles, handoff asks and follow-up chips.
- [x] **RC8 approval.** The resumed run after an approval carries the asking run's tool results and queries. `request_leave` validates before the approval card. A sender is told when a recipient would see the card masked. Urgency comes from the user's words.
- [x] **UI.** Persona switcher out; home input at the bottom; mini dashboard above it; **ดู Dashboard** button gone.
- [x] **Memory test.** Simulated users test memory for real: learning a fact, confirming it, using it in a later session, forgetting it, and isolation between users.

### Wave 2

- [x] **RC1 + RC4 tools and prompt.** Read tools `inbox`, `visit_plan`, `admin_audit`. Invitations (prompt lines, quick actions, admin chips, verify steps) derived from the role's tools and metric access. Rewrite rule 99, add the literal-answer and unverified-claims rules, reword the lesson line.
- [x] **RC6 + RC7 cards and tool shapes.** Share pill matches the server rule, masked cards keep their request action, empty and failed results are not drawn as cards, points for percent metrics, remaining-to-target, readable gap shares, Thai labels instead of ids. The masking of the user's own words (AI-39) moved to RC11.
- [x] **RC11 memory.** `remember` and `forget` tools through the gateway with a tombstone for rejected facts; answer-format preferences become confirmed answer guidance, not fenced data; a prompt rule that memory holds no figures; `recall_memory` returns trusted facts only; meaning-based fact matching; repeats count only across conversations; dated responsibilities keep their date; no masked numbers in the person's own recalled words; one memory card per reply.
- [x] **RC10 data facts.** Agent-to-rep assignment, suppression for people only, metric list narrowed per role, investigation prompt without the campaign nudge.

### Wave 3

- [x] **RC9 speed.** Measure baseline, low reasoning effort, and the standard provider tier on a production build, then set the winner: medium effort on the flex tier (AI-133, `d8236c3`).
- [ ] **Send-the-card phases 3 and 4** ([`send-the-card.md`](send-the-card.md)).
- [ ] **Final simulated-user round** on the four demo roles and the roles not yet tested, replaying every earlier failing turn.
