# Winyu on Mastra + CopilotKit: what is left

Winyu now runs on Mastra (agent) + CopilotKit (chat over AG-UI). Branch `winyu-mastra` holds it (merge 8ea0e62 keeps both histories; the Vexa build is tag `winyu-vexa-final`). The full feature record is `docs/plan.md` (phases M0–M5, F1–F15, S). This file holds only the phases still to do.

## สถานะ (updated 2026-10-06)
ทำแล้ว: Phase F ทั้งหมด (F1–F11, F14, F15) + merge เข้า Cop (8ea0e62) · การ์ดแชร์ปุ่ม/ลิงก์ (099a47d) · ปุ่มส่งต่อแบบ B ทุกการ์ดและ dashboard (0311a51) · `share_card` จากแชทพร้อมยืนยัน, find_people ไม่แนบตำแหน่งว่างเมื่อค้นด้วยชื่อ (4f8effa) · Phase 1 สิทธิ์ชั่วคราว (584e29e) · test 867 pass, eval 66/67 (line-under-target known), 0 stale
ค้าง:
- merge `winyu-mastra` เข้า main และ push origin แล้ว (2026-10-06, 87d673a) พร้อม tag `winyu-vexa-final`
- untracked จาก build เดิม: `site/`, `.sim-backup/`, `.eval-cards.json` (ไม่ได้อยู่ใน .gitignore ใหม่) — ลบหรือ ignore ตามที่ผู้ใช้เลือก
- งบ model ของโปรแกรม: ใช้ไป $3.36 จากเพดาน $4 (มิเตอร์ใน scratchpad เดิม); การ re-record eval ทั้งชุด ~$0.45 จะเกินเพดาน → ขอผู้ใช้ก่อน
- รอ credential จริง: Entra (tenant/client/secret), Azure Bot (Teams), LINE Messaging API — ดู docs/sso.md, docs/channels.md
ค้นพบ:
- ทุกเจ้า (Power BI, M365 Copilot, Salesforce dynamic, Looker run-as-recipient) ให้ผู้ดูเห็นตามสิทธิ์ตัวเองเป็นค่าเริ่มต้น; ข้อมูลข้ามสิทธิ์ไปได้แค่ภาพนิ่งหรือใช้สิทธิ์ผู้ส่งแบบสด (เสี่ยงสุด) → Phase 1 ใช้แบบ PIM: สิทธิ์ชั่วคราวเฉพาะเรื่องที่ต้องมีผู้มีอำนาจอนุมัติ
- ผู้ใช้ตัดสินแล้ว (2026-10-06 "เรื่องสิทธิ์เอาตามที่แนะนำ"): ผู้ให้สิทธิ์ได้ = CEO, CFO, Sales Director สำหรับข้อมูลในสายตัวเอง, IT ปรับได้
- `share_card` ต้อง import `lib/server/share/deliver.ts` แบบ lazy เท่านั้น (Teams SDK ทำ bun script ล่ม)
- Phase 1: สิทธิ์ของ IT อนุมัติคำขอไม่ได้ (ปฏิเสธ/เพิกถอนได้) เพราะ IT ไม่มีอำนาจเหนือข้อมูลขาย/การเงิน; share_card จากแชทยังไม่มีตัวเลือกให้สิทธิ์ (ต้อง re-record eval ถ้าเพิ่ม)
ถัดไป: /go phase 2 ตาม docs/plans/winyu-mastra.md

## Phase 1. สิทธิ์ชั่วคราวเฉพาะเรื่อง (temporary scoped grants) — done 2026-10-06 (dc31fde…584e29e)
- Default unchanged: the recipient sees a shared card in their own scope; when it hides what the sender saw, the card says so.
- "ขอสิทธิ์ชั่วคราว" on that card: a request to whoever may grant that slice (the metric + regions/brands of the card), 24–72 h, audited; approver sees who/why/what.
- Fast path for urgent shares: a sender who may grant that slice (CEO, CFO, Sales Director within their own line; IT can change who) can grant at share time ("ให้สิทธิ์ 1/3/7 วัน", default 3). The recipient can open the live card, press its next actions, drill within that metric's slice and ask the agent about it.
- Guardrails in code: never beyond the grantor's own scope; never salary/personal data/masked fields; CEL deny rules can block grants; grants bound to the recipient, not re-shareable; revocable by grantor and IT; every use goes through the gateway and is audited with "ใช้สิทธิ์ที่ <grantor> ให้ ถึง <date>"; IT sees active grants on /admin.
- Do not build live delegation with the sender's credentials.
- Verify: tests (grant never exceeds grantor scope, expiry, revoke, sensitive classes refused, CEL deny), browser walk CEO → u_krit urgent share with grant and u_krit drilling; budget ≤ $0.2 (ask before any full eval re-record).

## Phase 2. Booth demo without a key
- Port the scripted keyless model from tag `winyu-vexa-final` (lib/server/mock-*.ts, vexa/mock) to the Mastra build so the booth runs offline; decide whether the booth/site video scripts (`site/`, scripts/site-*) come back.

## Phase 3. Small fixes
- After enroll_course the reply promises "ระบบจะแจ้งเตือน", which breaks the handoff-closed rule: fix the wording rule (prompt change → eval re-record, ask first).
- Share rows in the admin audit say "predates run tracing" (no run attached); give share and grant events a run or a proper label.
