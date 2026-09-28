# Winyu site — เว็บขาย + docs (site/)

เป้าหมาย: เว็บ static แยกจากแอป (`site/`, Vite 8 + React 19 + Tailwind v4 + React Router 8 + fumadocs แบบเดียวกับเว็บ Vexa) ใช้ขาย Winyu และตอบลูกค้าว่า Winyu ต่อระบบเดิมได้แบบไหน (Metrics port / REST / MCP) โดยทุก UI ที่โชว์ต้องเป็นสิ่งที่ Winyu render ได้จริง (user decision 2026-09-24)

## Phases
1. โครง site + หน้าแรก + /docs 8 หน้า (light theme สลับ dark 2 จุดแบบ CopilotKit, หัวข้อ English ปนไทย)
2. Hero demo ใช้การ์ดจริงของ Winyu (`CardPartsView` / `SpecView` จาก `bun run site:cards`)
3. ~~เปลี่ยน visual ใน bento "What Winyu does" (`site/app/components/home/bento.tsx`) เป็น component จริงของ Winyu (การ์ด metric, AlertsCard/SignalList, handoff) — ตอนนี้วาดเอง~~ ยกเลิก: user พอใจ bento ที่วาดเองแล้ว (2026-09-24)
4. QA มือถือ (4 tabs + การ์ดจริงที่ ~375px) และหน้า docs, แล้ว deploy/แชร์ build/client — QA เสร็จ, deploy ยังไม่ทำ (user 2026-09-24: เอาแค่ build ผ่าน)

## สถานะ (updated 2026-09-24)
ทำแล้ว: phase 1 (`site/`), phase 2 (`scripts/site-hero-cards.ts` → `site/app/data/hero-cards.json` + รูปใน `site/public/img/people`; 4 tabs = share/line/rank/people spec) · typecheck Winyu+site ผ่าน, `site: bun run build` prerender 10 หน้า
ค้าง: ยังไม่ commit (`site/`, `scripts/site-hero-cards.ts`, `package.json` script `site:cards`, root `tsconfig.json` exclude `site`, `.gitignore`)
ตัดสินใจ: bento.tsx คงแบบวาดเอง ไม่เปลี่ยนเป็น component จริง (user decision 2026-09-24) → phase 3 ยกเลิก
ทำแล้ว: phase 4 QA — emulate 375×812 ผ่าน chrome-devtools: หน้าแรก 4 tabs + docs 9 หน้า scrollWidth = 375, ไม่มี console error · build prerender 11 หน้า
ค้นพบ: `vite preview` ไม่เสิร์ฟ `dir/index.html` ให้ path ไม่มี `/` ท้าย → เปิด /docs แล้วได้หน้าแรก; แก้ด้วย plugin `prerenderedIndex` ใน `site/vite.config.ts` (host จริงต้อง redirect/serve directory index เหมือนกัน)
ค้นพบ: `presentCard` วาด `rank` ให้คำถามมิติเดียวทุกอัน — ต้องเลือก data shape ต่างกันถึงได้ body ต่างกัน; share ได้เฉพาะ dim channel/business_unit/maker/pack
ค้นพบ: market_share × maker โชว์ชื่อคู่แข่งจริงกับตัวเลขสมมติ — ห้ามใช้ในเว็บ; market_share ว่างถ้าเดือนยังไม่ครบ (audit รายเดือน)
ค้นพบ: directory ไม่มีคนไอทีติด flag risk → HR ใช้ dept_production; department เป็นส่วนของคำถาม ไม่ใช่ scope ที่ Winyu ใส่
ค้นพบ: site ใช้ `~/` = site/app, `@/` = Winyu root, `vexa/*` = ../agentic-ui/src; `text-muted` ของ site เปลี่ยนเป็น `text-muted-foreground` เพราะชน token `muted` ของ Vexa; dev ต้องมี `optimizeDeps.include` ของ fumadocs ไม่งั้น jsx-runtime พัง
ถัดไป: commit งาน site; deploy เมื่อ user เลือก host
