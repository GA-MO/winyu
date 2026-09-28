import { ArrowRight, BarChart3, Blocks, CalendarDays, Check, Database, Eye, FileLock2, GraduationCap, KeyRound, Network, Plug, Power, ScrollText, ShieldCheck, Sparkles, Users, Wallet, Webhook, X } from "lucide-react";
import { CapabilitiesBento } from "./bento";
import { ArchitectureDiagram } from "./architecture";
import { DOORS, FAQ, LANDSCAPE, PREPARE, QUESTIONS, READS, ROADMAP, SAFEGUARDS, STORES } from "./content";
import { JourneyDiagram } from "./journey";
import { DotGrid, GlowBlobs, Logo, Section, SectionHeader, StatusBadge } from "./ui";

const SAFEGUARD_ICONS = [ShieldCheck, Sparkles, KeyRound, Eye, Power, ScrollText];
const READ_ICONS = [BarChart3, Wallet, Users, GraduationCap, CalendarDays];
const DOOR_ICONS = [Database, Webhook, Plug];
const PREPARE_ICONS = [Database, Blocks, KeyRound, Network];

const MCP_SNIPPET = `defineMcpConnector({
  id: "lms",
  labelTh: "ระบบอบรม",
  transport: { type: "http", url: env.LMS_MCP_URL },
  auth: (access) => signedIdentity(access),
  tools: {
    training_history: {
      labelTh: "ดูประวัติการอบรม",
      roles: "all",
      scope: [
        { kind: "inject", args: (access) => ({ regions: access.regions }) },
        { kind: "filter", rows: onlyPeopleInView },
      ],
      sensitive: [
        { field: "score", full: ["ceo", "hr_manager"], masked: ["sales_rsm"] },
      ],
    },
  },
});`;

export function Capabilities() {
  return (
    <Section tone="light">
      <CapabilitiesBento />
    </Section>
  );
}

export function Principle() {
  return (
    <Section id="principle" tone="light" className="pt-0 sm:pt-0">
      <SectionHeader
        eyebrow="Principle"
        title={<>Winyu never keeps <span className="gradient-text">your business data.</span></>}
        lead="ตัวเลขทุกตัวถูกอ่านจากระบบต้นทาง ณ วินาทีที่มีคนถามหรือเปิดแดชบอร์ด ข้อมูลอยู่ที่เดิม เจ้าของเดิม นโยบายเดิม Winyu เก็บแค่สิ่งที่เป็นของ Winyu เอง"
      />
      <div className="mt-14 grid items-stretch gap-5 lg:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-[28px] border border-hairline bg-surface p-7 shadow-lift">
          <p className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-primary">
            <span className="relative flex size-2"><span className="absolute inset-0 animate-ping rounded-full bg-success/60" /><span className="relative size-2 rounded-full bg-success" /></span>
            Read live from your systems
          </p>
          <ul className="mt-6 flex flex-col gap-4">
            {READS.map((item, index) => {
              const Icon = READ_ICONS[index] ?? Database;
              return (
                <li key={item.label} className="flex items-center gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/8 text-primary"><Icon className="size-5" aria-hidden /></span>
                  <span className="flex flex-col">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-sm text-muted-foreground">{item.source}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex flex-row items-center justify-center gap-3 lg:flex-col">
          <span className="hidden h-16 w-px bg-[linear-gradient(to_bottom,transparent,#a5b4fc)] lg:block" />
          <span className="grid size-16 place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--color-primary),var(--color-violet)_55%,var(--color-coral))] shadow-[0_18px_40px_-14px_rgb(124_58_237/70%)]">
            <span className="size-6 rounded-full border-[4px] border-white" />
          </span>
          <span className="rounded-full bg-foreground px-3 py-1 font-mono text-[11px] text-white">0 rows stored</span>
          <span className="hidden h-16 w-px bg-[linear-gradient(to_bottom,#f9a8d4,transparent)] lg:block" />
        </div>
        <div className="flex flex-col rounded-[28px] border border-primary/15 bg-[linear-gradient(160deg,#eef0ff,#f6efff_60%,#fff1f3)] p-7 shadow-lift">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-violet">Kept by Winyu · app state only</p>
          <ul className="mt-6 flex flex-col gap-4">
            {STORES.map((item) => (
              <li key={item} className="flex items-center gap-3 leading-6">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-violet text-white"><Check className="size-3.5" strokeWidth={3} aria-hidden /></span>
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-8 border-t border-violet/15 pt-5 text-sm leading-6 text-muted-foreground">ไม่มีตัวเลขธุรกิจสักแถว ถ้าวันหนึ่งเลิกใช้ Winyu ข้อมูลขององค์กรยังอยู่ที่เดิมครบ</p>
        </div>
      </div>
    </Section>
  );
}

export function Architecture() {
  return (
    <Section id="architecture" tone="dark">
      <GlowBlobs intensity="night" />
      <DotGrid />
      <SectionHeader
        dark
        eyebrow="Architecture"
        title={<>Between your people <span className="gradient-text-night">and the systems you already run.</span></>}
        lead="ตัวตนเข้ามาจาก SSO คำถามผ่านชั้นสิทธิ์และ semantic layer ของ Winyu แล้วออกไปหาระบบเดิมผ่านสามทางเท่านั้น ทุกทางใช้กลไกสิทธิ์และ audit ชุดเดียวกัน"
      />
      <div className="mt-14">
        <ArchitectureDiagram tone="dark" />
      </div>
      <div className="mt-20 grid items-center gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="flex flex-col gap-4">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-indigo-300">Real code from Winyu</p>
          <h3 className="font-display text-3xl font-medium leading-snug tracking-[-0.02em]">
            One new system. <span className="gradient-text-night">One config file.</span>
          </h3>
          <p className="leading-7 text-night-muted">
            ไม่แก้หน้าจอ ไม่แก้ prompt ไม่แก้สัญญากลาง tool ใหม่ขึ้นในตารางสิทธิ์ของหน้า admin ทันที และถูกปิดทั้ง connector ได้ในคลิกเดียว
          </p>
          <a href="/docs/connect/mcp" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-white">
            อ่านวิธีต่อ MCP connector <ArrowRight className="size-4" aria-hidden />
          </a>
        </div>
        <div className="overflow-hidden rounded-2xl border border-night-line bg-night-raised shadow-[0_40px_80px_-40px_rgb(124_58_237/60%)]">
          <div className="flex items-center gap-2 border-b border-night-line px-5 py-3">
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="ml-3 font-mono text-xs text-night-muted">lib/server/connectors/lms.ts</span>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-6 text-indigo-100">
            <code>{MCP_SNIPPET}</code>
          </pre>
        </div>
      </div>
    </Section>
  );
}

export function Connect() {
  return (
    <Section id="connect" tone="light">
      <SectionHeader
        eyebrow="Connections"
        title={<>MCP, REST or plain SQL. <span className="gradient-text">Winyu meets your systems where they are.</span></>}
        lead="เลือกทางตามสิ่งที่ระบบเดิมมีอยู่ ไม่ต้องให้ระบบเดิมเปลี่ยนเพื่อ Winyu งานที่เหลือต่อระบบคือการกำหนดสิทธิ์ ซึ่งเป็นการตัดสินใจทางธุรกิจ ไม่ใช่งานเชื่อมต่อ"
      />
      <div className="mt-14 grid gap-5 lg:grid-cols-3">
        {DOORS.map((door, index) => {
          const Icon = DOOR_ICONS[index] ?? Database;
          const ready = door.status === "ready";
          return (
            <article key={door.id} className={`relative flex flex-col gap-6 rounded-[28px] bg-surface p-7 shadow-lift ${ready ? "ring-2 ring-primary/50" : "border border-hairline"}`}>
              {ready ? <span className="absolute -top-3 left-7 rounded-full bg-foreground px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white">Live in the demo</span> : null}
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-14 place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--color-primary),var(--color-violet)_60%,var(--color-coral))] text-white shadow-[0_14px_30px_-12px_rgb(124_58_237/70%)]">
                  <Icon className="size-6" aria-hidden />
                </span>
                <StatusBadge status={door.status} />
              </div>
              <div>
                <h3 className="font-display text-2xl font-medium tracking-[-0.02em]">{door.name}</h3>
                <p className="mt-1 font-mono text-xs text-primary">{door.tech}</p>
              </div>
              <dl className="grid gap-4 rounded-2xl bg-paper p-4 text-sm">
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Use for</dt>
                  <dd className="mt-1 font-medium leading-6">{door.forWhat}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Effort per system</dt>
                  <dd className="mt-1 font-medium leading-6">{door.effort}</dd>
                </div>
              </dl>
              <ul className="flex flex-col gap-2.5">
                {door.points.map((point) => (
                  <li key={point} className="flex gap-2.5 text-sm leading-6 text-muted-foreground">
                    <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap gap-1.5 border-t border-hairline pt-5">
                {door.examples.map((example) => (
                  <span key={example} className="rounded-full bg-paper px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-hairline">{example}</span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </Section>
  );
}

export function Journey() {
  return (
    <Section tone="light" className="pt-0 sm:pt-0">
      <SectionHeader
        eyebrow="The life of a number"
        title={<>From question to card, <span className="gradient-text">every number traced to its source.</span></>}
        lead="AI ช่วยเข้าใจคำถามและเลือก metric แต่ตัวเลขที่แสดงมาจากระบบต้นทางเสมอ และผ่านการตรวจสิทธิ์ก่อนถึงหน้าจอ"
      />
      <div className="mt-12">
        <JourneyDiagram />
      </div>
    </Section>
  );
}

export function Security() {
  return (
    <Section id="security" tone="tint">
      <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="flex flex-col gap-10 lg:sticky lg:top-28 lg:self-start">
          <SectionHeader
            eyebrow="Security"
            title={<>Permissions enforced in code, <span className="gradient-text">not left to the AI.</span></>}
            lead="ขอบเขตของแต่ละคนถูกเขียนลงใน query ก่อนออกจาก Winyu ต่อให้มีคนพยายามสั่ง AI ให้ดูข้อมูลภาคอื่น คำขอนั้นก็ไม่เคยออกไปถึงระบบต้นทาง"
          />
          <div className="rounded-2xl border border-hairline bg-surface p-6 shadow-lift">
            <p className="gradient-text w-fit font-display text-5xl font-semibold tracking-tight">0 แถว</p>
            <p className="mt-2 leading-7 text-muted-foreground">
              ข้อมูลที่รั่วใน red-team test: พนักงานขายทุกคนถามประวัติของพนักงาน 40 คนผ่าน connector ทั้งแบบตรงและแบบสั่งให้ AI ขยายขอบเขต
            </p>
          </div>
        </div>
        <ul className="flex flex-col gap-10">
          {SAFEGUARDS.map((item, index) => {
            const Icon = SAFEGUARD_ICONS[index] ?? ShieldCheck;
            return (
              <li key={item.title} className="grid grid-cols-[2.5rem_1fr] gap-x-4 gap-y-2">
                <span className="grid size-10 place-items-center rounded-xl bg-foreground text-white">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="self-center font-display text-xl font-medium tracking-[-0.01em] sm:text-2xl">{item.title}</h3>
                <p className="col-start-2 leading-7 text-muted-foreground">{item.body}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}

export function Prepare() {
  return (
    <Section id="prepare" tone="light">
      <SectionHeader
        eyebrow="What you prepare"
        title={<>Almost nothing changes. <span className="gradient-text">Just open a read path.</span></>}
        lead="สิ่งเดียวที่ต้องมีเพิ่มจริงคือข้อมูลว่าใครดูแลภาคหรือแบรนด์ไหน เพราะ Winyu ตัดสินสิทธิ์จากตรงนี้"
      />
      <div className="mt-14 overflow-hidden rounded-[28px] border border-hairline bg-surface shadow-lift">
        <div className="hidden grid-cols-[1fr_1.6fr_1.2fr] border-b border-hairline bg-paper/60 px-7 py-4 font-mono text-[11px] uppercase tracking-[0.14em] md:grid">
          <span className="text-muted-foreground">System</span>
          <span className="text-primary">You provide</span>
          <span className="text-muted-foreground">You don&apos;t need to</span>
        </div>
        <ul className="divide-y divide-hairline">
          {PREPARE.map((item, index) => {
            const Icon = PREPARE_ICONS[index] ?? Database;
            return (
              <li key={item.system} className="grid gap-4 px-7 py-6 md:grid-cols-[1fr_1.6fr_1.2fr] md:gap-6">
                <span className="flex items-center gap-3 font-display text-lg font-medium">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/8 text-primary"><Icon className="size-5" aria-hidden /></span>
                  {item.system}
                </span>
                <ul className="flex flex-wrap content-start gap-2">
                  {item.need.map((need) => (
                    <li key={need} className="inline-flex items-center gap-1.5 rounded-full bg-primary/8 px-3 py-1.5 text-sm text-foreground">
                      <Check className="size-3.5 shrink-0 text-primary" strokeWidth={3} aria-hidden />
                      {need}
                    </li>
                  ))}
                </ul>
                <p className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
                  <X className="mt-1 size-4 shrink-0 text-muted-foreground/70" aria-hidden />
                  {item.noNeed}
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-20 grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div className="flex flex-col gap-3">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-primary">Typical landscape</p>
          <h3 className="font-display text-3xl font-medium tracking-[-0.03em]">The enterprise stack <span className="gradient-text">Winyu is built for.</span></h3>
          <p className="leading-7 text-muted-foreground">สมมติฐานสำหรับเริ่มคุย เรายืนยันกับทีมของคุณในวันแรก ตัวเลขอ่านผ่านคลังข้อมูลเสมอ เพื่อให้ตรงกับรายงานที่ผู้บริหารใช้อยู่</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {LANDSCAPE.map((row) => (
            <li key={row.group} className="flex flex-col gap-2 rounded-2xl border border-hairline bg-surface p-5">
              <span className="text-xs font-medium text-muted-foreground">{row.group}</span>
              <span className="font-medium leading-6">{row.typical}</span>
              <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary"><ArrowRight className="size-3.5" aria-hidden />{row.via}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

export function Roadmap() {
  return (
    <Section tone="light" className="pt-0 sm:pt-0">
      <SectionHeader
        eyebrow="Rollout"
        title={<>Start with identity. <span className="gradient-text">Open data layer by layer.</span></>}
        lead="แต่ละขั้นใช้งานได้จริงด้วยตัวเอง ไม่ต้องรอต่อครบทุกระบบ"
      />
      <ol className="relative mt-16 grid gap-12 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
        <span aria-hidden className="absolute left-0 right-0 top-[7px] hidden h-px bg-[linear-gradient(90deg,#818cf8,#c084fc,#fb7185)] lg:block" />
        {ROADMAP.map((phase, index) => (
          <li key={phase.title} className="relative flex flex-col gap-4">
            <span aria-hidden className="relative hidden size-3.5 rounded-full bg-white ring-4 ring-primary/30 lg:block" />
            <span className="gradient-text w-fit font-display text-7xl font-semibold leading-none tracking-[-0.05em] lg:mt-4">{String(index + 1).padStart(2, "0")}</span>
            <h3 className="font-display text-xl font-medium tracking-[-0.02em]">{phase.title}</h3>
            <p className="leading-7 text-muted-foreground">{phase.body}</p>
            <p className="mt-auto w-fit rounded-full bg-surface px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-hairline">{phase.from}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function Start() {
  return (
    <section id="start" className="relative scroll-mt-16 overflow-hidden bg-night px-4 pb-24 pt-28 text-white sm:px-8 sm:pt-36">
      <GlowBlobs intensity="night" />
      <DotGrid />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-20">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-7 text-center">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-indigo-300">Get started</p>
          <h2 className="font-display text-4xl font-medium leading-[1.15] tracking-[-0.03em] sm:text-6xl">
            One hour together. <span className="gradient-text-night">Know exactly what connects.</span>
          </h2>
          <p className="text-lg leading-8 text-night-muted">
            ถ้าทีมของคุณตอบคำถามด้านล่างได้ครบ เราบอกได้ทันทีว่าระบบไหนต่อได้เลย และระบบไหนต้องเตรียมอะไร
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a href="/docs" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-foreground transition-transform hover:-translate-y-0.5">
              อ่านเอกสารฉบับเต็ม <ArrowRight className="size-4" aria-hidden />
            </a>
            <a href="/docs/prepare" className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5">
              ดูสิ่งที่ต้องเตรียม
            </a>
          </div>
        </div>
        <div className="grid gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h3 className="font-display text-xl font-medium">Day-one questions</h3>
            <ol className="flex flex-col gap-3">
              {QUESTIONS.map((question, index) => (
                <li key={question} className="flex gap-4 rounded-xl border border-night-line bg-night-raised/80 p-4 text-sm leading-6 backdrop-blur">
                  <span className="font-mono font-medium text-indigo-300 tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                  {question}
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-col gap-4">
            <h3 className="font-display text-xl font-medium">FAQ</h3>
            {FAQ.map((item) => (
              <details key={item.q} className="group rounded-xl border border-night-line bg-night-raised/80 p-5 backdrop-blur">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {item.q}
                  <span className="text-night-muted transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-3 text-sm leading-7 text-night-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-night-line bg-night px-4 py-10 text-sm text-night-muted sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4">
        <span className="text-white"><Logo /></span>
        <div className="flex flex-wrap items-center gap-6">
          <a href="/docs" className="hover:text-white">เอกสาร</a>
          <a href="/docs/connect" className="hover:text-white">การเชื่อมต่อ</a>
          <a href="/docs/security" className="hover:text-white">ความปลอดภัย</a>
          <span className="inline-flex items-center gap-1.5"><FileLock2 className="size-4" aria-hidden />ข้อมูลในเดโมเป็นข้อมูลสมมติทั้งหมด</span>
        </div>
      </div>
    </footer>
  );
}
