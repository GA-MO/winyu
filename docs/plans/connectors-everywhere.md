# Native tools where they belong, systems of record behind ports

## สถานะ (updated 2026-10-09)
ทำแล้ว: units 1-4 (`92d40b0` describe_entity scope, `4725ff2` engines ผ่าน metrics port, `4d576b0` ระบบลาเป็นเจ้าของยอด/ใบลา, `227e845` LMS เป็นเจ้าของที่นั่ง, ลบ `staff-requests`)
ทำแล้ว: เดโมทุก port = generator ไม่ใช่ MCP (`73620f0` คลังข้อมูล, `f0d541c` port อื่น, ลบ `WINYU_PORTS`); LMS ประวัติอบรม + CRM เป็น native `training_history`/`store_visits` บน learning/`crm` port, ลบ code connector (`b97fc58`); health ของ console connector ไม่ค้าง (`0e659ed`); push `winyu-mastra` แล้ว
ค้าง: eval stale 56/67 (`bun run eval --stale`) อัดแล้วแค่ 9 case เสี่ยง + admin-tool/admin-field; อัดที่เหลือ ≈ $0.30 รอผู้ใช้ตัดสิน
ค้าง: ยังไม่ได้พิสูจน์ใน browser: การ์ด `store_visits` (CrmVisitsCard) และ `training_history` (LmsTrainingCard) ในแชตจริงทุกบทบาท ตรวจแค่ `bun run call-tool` + หน้า admin
ค้าง: ผู้อนุมัติยังเลือกโดย Winyu (`approverOf` ใน `lib/server/staff-requests.ts`) แล้วส่งให้ระบบลา/LMS; Inbox ยังไม่ดึงคำขอที่ยื่นนอก Winyu (รอ HRIS จริง)
ค้าง: dev ที่รันอยู่ต้อง `make stop && make up` ให้ probe ใหม่ใน `instrumentation.ts` มีผล
ค้นพบ: หลักของผู้ใช้ = Winyu ไม่ถือข้อมูลของใคร มีแค่ tool ที่เรียกระบบเจ้าของ; generator คือตัวจำลองระบบเหล่านั้น เดโมจึงไม่ควรมี MCP ซ้อนอีกชั้น
ค้นพบ: connector = ระบบรองที่ IT เพิ่มจาก console เท่านั้น ระบบที่ Winyu มีความสามารถรองรับ (คลังข้อมูล HRIS LMS CRM EHS ปฏิทิน อีเมล) อยู่หลัง port + native tool
ค้นพบ: เปลี่ยนชื่อ/คำอธิบาย native tool ตัวไหนก็ stale ทั้ง 67 case เพราะเกือบทุก tool เปิดให้ทุกบทบาท; อัดเฉพาะ case เสี่ยงแล้ว model เลือก tool เดิมทุกข้อ (policy-leave แปรปรวนครั้งเดียว อัดซ้ำผ่าน)
ถัดไป: /go ตรวจ การ์ด store_visits และ training_history ในแชตทุกบทบาทที่เห็น ตาม docs/plans/connectors-everywhere.md

Decided 2026-10-09. Winyu's capabilities stay native tools: code reviewed in git, permission in `lib/access`, covered by the recorded eval. Every outside system is reached through a port; a deployment fills each port with an adapter for the customer's system, and the demo fills them with the generator. The console connectors from `connector-ui.md` remain the way for a customer's IT to add a secondary system Winyu does not know. They are not the way to move a native tool out of code.

The units below fixed four things that were wrong around the ports:

- The engines bypass the metrics port.
- `describe_entity` has no scope.
- Winyu owns leave and course data that belongs to the HRIS and the LMS.
- The leave balance counts a request the approver returned.

## Survey of the 27 native tools

The table below rates each tool against this rule: a tool earns native status by enforcing a permission rule presets cannot express, computing numbers people act on, joining sources, or owning Winyu's own state. Winyu must not own a business rule whose source of truth is another system.

| Group | Tools | Verdict |
|---|---|---|
| Native, right as they are | `query_metric`, `explain_gap`, `list_metrics`, `get_alerts`, `get_forecast`, `get_calendar`, `find_people`, `get_person`, `recall_memory`, `resolve_owner`, `create_handoff`, `share_card`, `pin_widget`, `watch_metric`, `set_permission`, `run_job` | Keep. |
| Native, but owning the wrong data | `get_policy`, `request_leave`, `list_courses`, `enroll_course`, `describe_entity` | Fix in this plan. |
| Native, with the source not yet real | `search_documents` (corpus in the repo), `send_email` (mail only reaches `outbox`) | Later, when a document store and a mail system are chosen. |
| Could be connectors | `list_candidates`, `get_site`, `ask_logistics_partner` | Stay native: the eval covers them, and moving gains nothing until a customer needs to swap them. |
| Code connectors | `crm_demo`, `lms_demo` | Stay as the reference implementations of the console path. |

## Units, in order, each ending in a check

### 1. `describe_entity` is scoped by Winyu

The tool keeps calling the warehouse's reference lookup, because master data does not carry grade, credit, price or campaign budget. Winyu then checks the result against the caller's scope. An agent or DC whose region (from `masterData()`) is outside `access.regions` is refused as out of scope. Campaigns, SKUs and users carry no region and stay open. The tool's description and schema do not change, so no recording goes stale.

Check: a unit test as the northeast rep refuses a Bangkok agent, answers a northeast one, and the CEO gets both.

### 2. The engines read through the metrics port

`runSeries` (`lib/data/query.ts:138`) reads `readGeneratorFacts` directly. It is used by anomaly detection, forecasts, watches and hypotheses. It becomes async and reads `ports().metrics.readFacts`, so the engines see the same warehouse as `query_metric`.

Check: the existing engine tests still pass on the generator. A test registers a metrics port that counts calls and sees `buildForecasts` reach it.

### 3. The leave system owns balances and requests

`LeavePort` grows from `policy()` and `usedThisYear()` to the leave system's real surface:

- `balances(employeeId)` gives entitled, used, pending and left per kind. The leave system computes these.
- `requests(employeeId)` lists that employee's leave requests.
- `submit({ employeeId, kind, from, to, days, reason, approverId, idempotencyKey })` creates a pending request.
- `decide(requestId, approverId, approved)` records the approver's decision.

The generator port plays the HRIS. The entitlement rules (tenure steps, probation) move from `lib/server/leave.ts` into it, and its requests live in its own collection. Winyu keeps what is Winyu's: input checks before asking (dates, working days from the calendar, notice), the approval card, the Inbox packet that tells the approver, and the answer's wording. Accepting or returning the packet calls `decide`. Only pending requests count against the balance, which fixes the returned-request bug.

The HRIS MCP contract gains `leave_balances`, `list_leave_requests`, `submit_leave_request` and `decide_leave_request`, and the demo HRIS serves them from the generator port. `usedThisYear` leaves the contract, because `balances` carries `used`.

Check: `get_policy` and `request_leave` answer as before for the demo personas. A returned request no longer reduces the balance. The verify post-condition reads the request from the leave port. A port test runs the same flow against the demo HRIS over MCP.

### 4. The LMS owns seats and enrollments

`LearningPort` grows from `courses()` to:

- `courses()`, where each course carries `seatsLeft` as the LMS counts them, holds included.
- `enrollments(employeeId)`.
- `requestSeat({ courseId, employeeId, approverId, idempotencyKey })`.
- `decide(enrollmentId, approverId, approved)`.

The generator plays the LMS. Winyu keeps the relevance order (renews my certificate, then my team's), the approval card and the Inbox packet. `staff-requests`, Winyu's shadow store for both, is deleted once units 3 and 4 have moved off it.

The learning MCP contract gains `list_enrollments`, `request_seat` and `decide_enrollment`.

Check: `list_courses` and `enroll_course` answer as before. Seats come from the port. A duplicate request is refused by the LMS, not by Winyu's own count.

## Eval

Units 1 and 2 change no tool description or schema. Units 3 and 4 change results, not descriptions. The recordings keep the old results, so scoring them still exercises the cards. `bun run eval --stale` is run after each unit. If any recording is stale, the cost is stated and the recordings are re-recorded once at the end, not per unit.

## Later, when a real system is chosen

- Contracts become a versioned spec (`hris.v1`), with a JSON schema generated from zod for whoever writes the wrapper.
- `load_directory` returning the whole company with pay is reconsidered for the first real customer.
- Port connections become configurable in the admin console, if a customer's IT needs to set them without a deploy.
- The documents corpus and the mail system get real ports.
