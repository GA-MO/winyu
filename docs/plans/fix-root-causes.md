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

**Card fit** (user, 2026-10-16): a card's form must fit the question and the data shape. The same layout for every answer makes Winyu look like a template.
- [x] **Card-fit audit** ($0) over the 63 recorded cases and the 75 sim screenshots; rules R1–R10 in [`card-fit.md`](card-fit.md).
- [ ] **Card-fit fix** from that rule set.

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

- [ ] **RC9 speed.** Measure baseline, low reasoning effort, and the standard provider tier on a production build, then set the winner.
- [ ] **Send-the-card phases 3 and 4** ([`send-the-card.md`](send-the-card.md)).
- [ ] **Final simulated-user round** on the four demo roles and the roles not yet tested, replaying every earlier failing turn.
