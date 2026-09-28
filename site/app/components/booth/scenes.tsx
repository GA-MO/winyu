import { Check } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { BrandMark } from "@/components/chrome/brand-mark";
import { CardPartsView } from "@/components/cards/card-parts";
import { SpecView } from "vexa/react";
import { DEMO_ROLES, SYSTEMS, roleTitleOf, scopeLabel, scopeText, stepsOf, type DemoRole } from "../home/hero-demo";
import { STAGE_HEIGHT, STAGE_WIDTH, clamp01, easeIn } from "./sequence";
import { DEMO_SEQUENCE, rolePhaseAt, type ActiveScene } from "./timeline";

const WINDOW_SCALE = 1.25;
const WINDOW_WIDTH = 1390;
const WINDOW_HEIGHT = 572;
const GRID_STAGGER_S = 0.25;

const BRAND_GRADIENT = "bg-[linear-gradient(135deg,#4338ca_0%,#6d28d9_45%,#db2777_85%,#fb7185_100%)]";

const ROLE_STORY: Record<string, { headline: string; takeaway: string }> = {
  exec: { headline: "ภาพรวมทั้งบริษัท ในคำถามเดียว", takeaway: "ตัวเลขอ่านสดจาก SAP SD ไม่มีตัวไหนที่ AI แต่งขึ้นเอง" },
  rsm: { headline: "เห็นเฉพาะภาคที่ตัวเองดูแล", takeaway: "ขอบเขต “ภาคเหนือ” ถูกใส่ลงใน query โดยระบบ ไม่ได้ฝากให้ AI ระวังเอง" },
  rep: { headline: "รู้ว่าวันนี้ควรไปเยี่ยมเอเย่นต์ไหนก่อน", takeaway: "เรียงจากยอดที่ตกมากที่สุด แล้วกดตรวจสาเหตุต่อได้จากการ์ด" },
  hr: { headline: "รู้ก่อนว่าใครกำลังจะเสียไป", takeaway: "HR เห็นข้อมูลคนจาก HRIS ตามสิทธิ์ของ HR เท่านั้น" },
};

const OUTRO_STATS = [
  { label: "ข้อมูลธุรกิจที่ Winyu เก็บเอง", value: "0 แถว" },
  { label: "ทางเชื่อมต่อระบบเดิม", value: "SQL · REST · MCP" },
  { label: "ตัวเลขที่ AI แต่งเอง", value: "ไม่มี" },
];

function rise(progress: number, distance = 18): CSSProperties {
  return { opacity: progress, transform: `translateY(${(1 - progress) * distance}px)` };
}

function drift(t: number, period: number, phase: number) {
  const angle = (t / period) * Math.PI * 2 + phase;
  return `translate3d(${Math.sin(angle) * 80}px, ${Math.cos(angle) * 48}px, 0)`;
}

function Blobs({ t, tone }: { t: number; tone: "paper" | "night" }) {
  const alpha = tone === "night" ? ["bg-primary/30", "bg-violet/28", "bg-coral/12"] : ["bg-primary/14", "bg-violet/12", "bg-coral/12"];
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <div className={`absolute -left-40 -top-40 size-[44rem] rounded-full blur-[120px] ${alpha[0]}`} style={{ transform: drift(t, 22, 0) }} />
      <div className={`absolute -right-40 top-10 size-[40rem] rounded-full blur-[120px] ${alpha[1]}`} style={{ transform: drift(t, 30, 2) }} />
      <div className={`absolute bottom-[-16rem] left-1/3 size-[36rem] rounded-full blur-[120px] ${alpha[2]}`} style={{ transform: drift(t, 26, 4) }} />
    </div>
  );
}

function Lockup({ size, draw = 1, className = "" }: { size: number; draw?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center font-display font-bold tracking-[-0.03em] ${className}`} style={{ fontSize: size, gap: size * 0.2 }}>
      <BrandMark draw={draw} className="shrink-0" />
      <span style={{ opacity: easeIn(draw, 0.5, 0.5) }}>Winyu</span>
    </span>
  );
}

function HeaderLockup() {
  return (
    <span className="inline-flex items-center gap-3 font-display text-[30px] font-bold tracking-tight">
      <span className="grid size-12 place-items-center rounded-[14px] bg-[linear-gradient(135deg,var(--color-primary),var(--color-violet)_55%,var(--color-coral))] text-white shadow-[0_8px_24px_-8px_rgb(124_58_237/70%)]">
        <BrandMark className="size-8" />
      </span>
      Winyu
    </span>
  );
}

function IntroScene({ t }: { t: number }) {
  const draw = easeIn(t, 0.2, 1.4);
  return (
    <div className={`absolute inset-0 flex flex-col items-center justify-center gap-10 text-white ${BRAND_GRADIENT}`}>
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/18%)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <div aria-hidden className="absolute -left-24 -top-32 size-[40rem] rounded-full bg-white/20 blur-[110px]" style={{ transform: drift(t, 20, 0) }} />
      <Lockup size={150} draw={draw} className="relative [&_svg]:size-[1.3em]" />
      <div className="relative flex flex-col items-center gap-5 text-center">
        <p className="font-display text-[64px] font-medium leading-[1.05] tracking-[-0.04em]" style={rise(easeIn(t, 2.0, 0.8))}>
          One question. The right answer for every role.
        </p>
        <p className="text-[34px] font-medium text-white/85" style={rise(easeIn(t, 2.8, 0.8))}>
          ตั้งแต่ CEO ถึงพนักงานขาย ถามเป็นภาษาคน ได้คำตอบตามขอบเขตของตัวเอง
        </p>
      </div>
    </div>
  );
}

function RoleChips({ active }: { active: number }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/70 p-1.5 ring-1 ring-hairline backdrop-blur">
      {DEMO_ROLES.map((role, index) => (
        <span key={role.id} className={`rounded-full px-6 py-2.5 text-[22px] font-medium ${index === active ? "bg-foreground text-white" : "text-muted-foreground"}`}>
          {role.tab}
        </span>
      ))}
    </div>
  );
}

function SystemPills({ role, reading }: { role: DemoRole; reading: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="mr-1 text-xs font-medium text-muted-foreground">Winyu อ่านสดจาก</span>
      {SYSTEMS.map((system) => {
        const live = reading && system === role.card.source;
        return (
          <span key={system} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] ring-1 ${live ? "bg-success/10 text-success ring-success/40 shadow-[0_0_24px_rgb(5_150_105/35%)]" : "bg-white text-muted-foreground ring-hairline"}`}>
            <span className={`size-1.5 rounded-full ${live ? "bg-success" : "bg-muted-foreground/50"}`} />
            {system}
          </span>
        );
      })}
    </div>
  );
}

function AnswerCard({ role }: { role: DemoRole }) {
  return role.card.view.kind === "parts" ? <CardPartsView parts={role.card.view.parts} /> : <SpecView spec={role.card.view.spec} showDevtools={false} />;
}

function AppWindow({ role, t }: { role: DemoRole; t: number }) {
  const phase = rolePhaseAt(role, t);
  const reading = phase.steps >= 3 && phase.card < 1;
  const steps = stepsOf(role, roleTitleOf(role));
  const typing = phase.typed < role.question.length;
  const caretOn = Math.floor(t * 2) % 2 === 0;
  return (
    <div className="origin-top-left overflow-hidden rounded-[22px] border border-white/60 bg-paper text-left shadow-[0_30px_80px_-30px_rgb(17_18_24/55%)]" style={{ width: WINDOW_WIDTH, height: WINDOW_HEIGHT, transform: `scale(${WINDOW_SCALE})` }}>
      <div className="flex items-center gap-3 border-b border-hairline bg-white/80 px-4 py-3">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="font-mono text-xs text-muted-foreground">winyu.app</span>
        <span className="rounded-full bg-primary/8 px-3 py-1 text-xs font-medium text-primary">{roleTitleOf(role)}</span>
        <span className="ml-auto">
          <SystemPills role={role} reading={reading} />
        </span>
      </div>
      <div className="grid h-full grid-cols-[0.82fr_1.18fr]">
        <div className="flex flex-col gap-5 p-6">
          <div className="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-[linear-gradient(135deg,var(--color-primary),var(--color-violet))] px-4 py-3 text-[15px] leading-6 text-white shadow-lift" style={{ opacity: phase.typed > 0 ? 1 : 0 }}>
            {role.question.slice(0, phase.typed)}
            {typing && caretOn ? <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-white" /> : null}
          </div>
          <div className="flex flex-col gap-3" style={{ opacity: phase.steps > 0 ? 1 : 0 }}>
            <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span className="grid size-5 place-items-center rounded-md bg-[linear-gradient(135deg,var(--color-primary),var(--color-violet)_55%,var(--color-coral))] text-white">
                <BrandMark compact className="size-3.5" />
              </span>
              Winyu กำลังตรวจก่อนตอบ
            </p>
            <ol className="flex flex-col gap-2.5">
              {steps.map((step, index) => {
                const done = index < phase.steps;
                return (
                  <li key={step} className={`flex items-center gap-2.5 text-sm ${done ? "opacity-100" : "translate-x-1 opacity-25"}`}>
                    <span className={`grid size-5 shrink-0 place-items-center rounded-full ${done ? "bg-success text-white" : "bg-hairline text-transparent"}`}>
                      <Check className="size-3" strokeWidth={3} aria-hidden />
                    </span>
                    {step}
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="overflow-hidden rounded-xl bg-foreground p-4 font-mono text-[12px] leading-6 text-white/75" style={{ opacity: phase.query }}>
            <p className="mb-1 font-sans text-[11px] font-medium text-white/50">query ที่ Winyu ส่งออกไป</p>
            {role.card.request.map((line) => (
              <p key={line.key}>
                {line.key}: <span className="text-white">{line.value}</span>
              </p>
            ))}
            <p className="-mx-2 flex flex-wrap items-center justify-between gap-x-3 rounded-md bg-white/10 px-2">
              <span>
                scope: <span className="text-emerald-300">{scopeText(role)}</span>
              </span>
              <span className="font-sans text-[11px] text-emerald-300">ใส่โดย Winyu</span>
            </p>
          </div>
        </div>
        <div className="relative">
          <div aria-hidden className="absolute inset-4 flex flex-col gap-4 rounded-[20px] border border-dashed border-primary/25 bg-white/50 p-6" style={{ opacity: 1 - phase.card }}>
            <span className="h-3 w-1/2 rounded-full bg-primary/10" />
            <span className="h-9 w-1/3 rounded-lg bg-primary/10" />
            {[88, 72, 64, 52, 40].map((width) => (
              <span key={width} className="h-2 rounded-full bg-primary/10" style={{ width: `${width}%` }} />
            ))}
          </div>
          <div className="m-4 [&>section]:shadow-[0_1px_2px_rgb(79_70_229/6%),0_30px_60px_-34px_rgb(79_70_229/45%)]" style={rise(phase.card, 14)}>
            <AnswerCard role={role} />
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleScene({ t, roleIndex }: { t: number; roleIndex: number }) {
  const role = DEMO_ROLES[roleIndex];
  const story = ROLE_STORY[role.id];
  const phase = rolePhaseAt(role, t);
  return (
    <div className="absolute inset-0 overflow-hidden bg-paper text-foreground">
      <Blobs t={t + roleIndex * 7} tone="paper" />
      <div aria-hidden className="grid-fade absolute inset-0" />
      <div className="absolute inset-x-[72px] top-[44px] flex items-center justify-between">
        <HeaderLockup />
        <RoleChips active={roleIndex} />
      </div>
      <div className="absolute inset-x-[80px] top-[132px] flex flex-col gap-2">
        <h2 className="font-display text-[60px] font-semibold leading-[1.1] tracking-[-0.03em]" style={rise(phase.caption)}>
          {story.headline}
        </h2>
        <p className="text-[30px] font-medium text-muted-foreground" style={rise(phase.takeaway, 10)}>
          {story.takeaway}
        </p>
      </div>
      <div className={`absolute inset-x-[72px] bottom-[36px] top-[292px] overflow-hidden rounded-[40px] p-[16px] shadow-[0_50px_100px_-40px_rgb(109_40_217/60%)] ${BRAND_GRADIENT}`}>
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/18%)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div className="relative mx-auto" style={{ width: WINDOW_WIDTH * WINDOW_SCALE }}>
          <AppWindow role={role} t={t} />
        </div>
      </div>
    </div>
  );
}

type Headline = { label: string; value: string; delta: string | null; tone: "good" | "bad" | "neutral"; detail: string };

function headlineOf(role: DemoRole): Headline {
  const view = role.card.view;
  if (view.kind === "parts" && view.parts.hero) {
    const hero = view.parts.hero;
    const tone = hero.tone === "good" || hero.tone === "bad" ? hero.tone : "neutral";
    return { label: hero.label, value: hero.value, delta: hero.delta ?? null, tone, detail: hero.detail ?? "" };
  }
  const title = view.kind === "parts" ? view.parts.title : String(view.spec.elements[view.spec.root]?.props?.title ?? "");
  const meta = view.kind === "parts" ? (view.parts.meta ?? "") : String(view.spec.elements[view.spec.root]?.props?.meta ?? "");
  const [value = meta, ...rest] = meta.split(" · ");
  return { label: title, value, delta: null, tone: "neutral", detail: rest.join(" · ") };
}

const TONE_CLASS: Record<Headline["tone"], string> = {
  good: "bg-success/10 text-success",
  bad: "bg-danger/10 text-danger",
  neutral: "bg-hairline text-muted-foreground",
};

function GridCell({ role, progress }: { role: DemoRole; progress: number }) {
  const headline = headlineOf(role);
  return (
    <div className="flex h-full flex-col justify-between overflow-hidden rounded-[32px] bg-white/80 px-10 py-8 shadow-lift ring-1 ring-hairline" style={rise(progress, 24)}>
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-foreground px-5 py-1.5 text-[24px] font-medium text-white">{role.tab}</span>
        <span className="rounded-full bg-primary/8 px-4 py-1.5 text-[20px] font-medium text-primary">ขอบเขต: {scopeLabel(role)}</span>
        <span className="ml-auto font-mono text-[16px] text-muted-foreground">อ่านจาก {role.card.source}</span>
      </div>
      <p className="text-[26px] leading-[1.4] text-muted-foreground">“{role.question}”</p>
      <div className="flex flex-col gap-1">
        <span className="text-[22px] text-muted-foreground">{headline.label}</span>
        <div className="flex items-baseline gap-4">
          <span className="font-display text-[64px] font-semibold leading-none tracking-[-0.03em]">{headline.value}</span>
          {headline.delta ? <span className={`rounded-full px-3 py-1 text-[24px] font-semibold ${TONE_CLASS[headline.tone]}`}>{headline.delta}</span> : null}
          <span className="text-[22px] text-muted-foreground">{headline.detail}</span>
        </div>
      </div>
    </div>
  );
}

function GridScene({ t }: { t: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-paper text-foreground">
      <Blobs t={t + 40} tone="paper" />
      <div className="absolute inset-x-[80px] top-[56px] flex flex-col items-center gap-3 text-center">
        <h2 className="font-display text-[66px] font-medium leading-[1.05] tracking-[-0.04em]" style={rise(easeIn(t, 0.2, 0.8))}>
          One question. <span className="gradient-text">The right answer for every role.</span>
        </h2>
        <p className="text-[30px] font-medium text-muted-foreground" style={rise(easeIn(t, 0.7, 0.8), 10)}>
          ทุกบทบาทได้คำตอบของตัวเอง จากระบบเดิมขององค์กร ตามสิทธิ์ที่แต่ละคนมี
        </p>
      </div>
      <div className="absolute inset-x-[72px] bottom-[40px] top-[250px] grid grid-cols-2 grid-rows-2 gap-6">
        {DEMO_ROLES.map((role, index) => (
          <GridCell key={role.id} role={role} progress={easeIn(t, 1.2 + index * GRID_STAGGER_S, 0.7)} />
        ))}
      </div>
    </div>
  );
}

function OutroScene({ t }: { t: number }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-14 overflow-hidden bg-night text-white">
      <Blobs t={t + 80} tone="night" />
      <Lockup size={128} draw={easeIn(t, 0.2, 1.2)} className="relative [&_svg]:size-[1.3em] [&_svg]:text-[#c4b5fd]" />
      <p className="relative text-[46px] font-semibold" style={rise(easeIn(t, 1.4, 0.8))}>
        ถามเป็นภาษาคน <span className="gradient-text-night">ได้คำตอบเป็นตัวเลขจริง</span>
      </p>
      <dl className="relative grid grid-cols-3 divide-x divide-night-line rounded-[28px] border border-night-line bg-night-raised/70" style={rise(easeIn(t, 2.2, 0.8))}>
        {OUTRO_STATS.map((stat) => (
          <div key={stat.label} className="flex flex-col items-center gap-2 px-16 py-8">
            <dt className="text-[22px] text-night-muted">{stat.label}</dt>
            <dd className="font-display text-[46px] font-medium">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SceneView({ scene }: { scene: ActiveScene }) {
  if (scene.id === "intro") return <IntroScene t={scene.local} />;
  if (scene.id === "role") return <RoleScene t={scene.local} roleIndex={scene.index} />;
  if (scene.id === "grid") return <GridScene t={scene.local} />;
  return <OutroScene t={scene.local} />;
}

/** The demo cut at time t on a fixed 1920×1080 stage, scaled by `scale` to fit the screen. */
export function DemoStage({ t, scale }: { t: number; scale: number }): ReactNode {
  return (
    <div className="relative origin-top-left overflow-hidden" style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, transform: `scale(${scale})` }}>
      {DEMO_SEQUENCE.at(t).map((scene) => (
        <div key={`${scene.id}-${scene.index}`} className="absolute inset-0" style={{ opacity: clamp01(scene.opacity) }}>
          <SceneView scene={scene} />
        </div>
      ))}
    </div>
  );
}
