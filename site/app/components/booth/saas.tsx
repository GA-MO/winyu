import { Check, ShieldCheck } from "lucide-react";
import { Fragment, createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { BrandMark } from "@/components/chrome/brand-mark";
import { CardPartsView } from "@/components/cards/card-parts";
import type { CardParts } from "@/lib/cards/present";
import { LANDSCAPE, SAFEGUARDS } from "../home/content";
import { BOOTH } from "./data";
import { DEMO_ROLES, scopeLabel, type DemoRole } from "../home/hero-demo";
import { STAGE_HEIGHT, STAGE_WIDTH, clamp01, createSequence, easeIn, easeInOut, mix } from "./sequence";

type BeatId = "hook" | "problem" | "reveal" | "investigate" | "ask" | "learn" | "suggest" | "foresee" | "scope" | "act" | "proof" | "end";

const CROSSFADE_S = 0.45;
const TYPE_CHAR_S = 0.045;
const WORD_STAGGER_S = 0.09;
const WORD_RISE_S = 0.55;

/** The SaaS launch cut: kinetic statements on a dark stage with floating product UI. */
export const SAAS_SEQUENCE = createSequence<BeatId>(
  [
    { id: "hook", duration: 5 },
    { id: "problem", duration: 6 },
    { id: "reveal", duration: 5 },
    { id: "investigate", duration: 12 },
    { id: "ask", duration: 8.5 },
    { id: "learn", duration: 9 },
    { id: "suggest", duration: 7 },
    { id: "foresee", duration: 10 },
    { id: "scope", duration: 8 },
    { id: "act", duration: 7.5 },
    { id: "proof", duration: 5.5 },
    { id: "end", duration: 6 },
  ],
  CROSSFADE_S,
);

const ROLE_BY_ID = Object.fromEntries(DEMO_ROLES.map((role) => [role.id, role])) as Record<string, DemoRole>;
const EXEC = ROLE_BY_ID.exec;
const REP = ROLE_BY_ID.rep;
const FAN_ROLES = [ROLE_BY_ID.exec, ROLE_BY_ID.rsm, ROLE_BY_ID.rep];

const SHOWN_CHIPS = 4;
const TRACE_STEP_S = 0.42;
const TRACE_START_S = 1.0;

const SYSTEM_CHIPS = LANDSCAPE.flatMap((row) => row.typical.split(/, | · /));

const CHIP_SPOTS = SYSTEM_CHIPS.map((_, index) => {
  const angle = (index / SYSTEM_CHIPS.length) * Math.PI * 2 + 0.4;
  const ring = index % 2 === 0 ? 1 : 0.72;
  return { x: Math.cos(angle) * 700 * ring, y: Math.sin(angle) * 300 * ring + 60, depth: (index % 3) * 0.18 };
});

const GLOW = "shadow-[0_40px_120px_-30px_rgb(124_58_237/55%)]";
const GRADIENT_TILE = "bg-[linear-gradient(135deg,var(--color-primary),var(--color-violet)_55%,var(--color-coral))]";

function partsOf(role: DemoRole) {
  if (role.card.view.kind !== "parts") throw new Error(`Card ${role.id} has no parts`);
  return role.card.view.parts;
}

function Words({ text, t, start, className = "", gradient = false }: { text: string; t: number; start: number; className?: string; gradient?: boolean }) {
  const words = gradient ? [text] : text.split(" ");
  const gradientClass = useContext(ThemeContext) === "light" ? "gradient-text" : "gradient-text-night";
  return (
    <span className={className}>
      {words.map((word, index) => {
        const p = easeIn(t, start + index * WORD_STAGGER_S, WORD_RISE_S);
        return (
          <Fragment key={`${word}-${index}`}>
            <span className="inline-block overflow-hidden pb-[0.12em] align-bottom">
              <span className={`inline-block ${gradient ? gradientClass : ""}`} style={{ transform: `translateY(${(1 - p) * 110}%)`, opacity: p }}>
                {word}
              </span>
            </span>
            {index < words.length - 1 ? " " : null}
          </Fragment>
        );
      })}
    </span>
  );
}

function Eyebrow({ children, t }: { children: ReactNode; t: number }) {
  return (
    <p className="text-[28px] font-medium text-[var(--bt-accent)]" style={{ opacity: easeIn(t, 0.1, 0.5) }}>
      {children}
    </p>
  );
}

function Heading({ eyebrow, title, t }: { eyebrow: string; title: string; t: number }) {
  return (
    <div className="absolute left-[120px] top-[96px] flex max-w-[1500px] flex-col gap-4">
      <Eyebrow t={t}>{eyebrow}</Eyebrow>
      <h2 className="font-display text-[68px] font-semibold leading-[1.08] tracking-[-0.035em]">
        <Words text={title} t={t} start={0.25} />
      </h2>
    </div>
  );
}

const AURORA = [
  { color: "rgb(79 70 229 / 26%)", radius: 520, orbit: 260, period: 26, phase: 0 },
  { color: "rgb(124 58 237 / 22%)", radius: 460, orbit: 320, period: 32, phase: 2.1 },
  { color: "rgb(251 113 133 / 22%)", radius: 420, orbit: 280, period: 22, phase: 4.2 },
  { color: "rgb(56 189 248 / 16%)", radius: 380, orbit: 360, period: 38, phase: 1.1 },
];

const BOKEH = Array.from({ length: 14 }, (_, index) => ({ x: (index * 137) % 1920, y: (index * 229) % 1080, size: 6 + ((index * 7) % 14), speed: 10 + ((index * 5) % 18) }));

const GRAIN = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.55 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>')}")`;

const SHEEN_PERIOD_S = 9;

const ThemeContext = createContext<"dark" | "light">("dark");

function DarkGlow({ t, x, y, hue }: { t: number; x: string; y: string; hue: "violet" | "coral" }) {
  const pulse = 0.85 + Math.sin(t * 1.3) * 0.15;
  const color = hue === "violet" ? "rgb(124 58 237 / 38%)" : "rgb(251 113 133 / 26%)";
  return <div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(40% 45% at ${x} ${y}, ${color}, transparent 70%)`, opacity: pulse }} />;
}

function Aurora({ t, x, y }: { t: number; x: string; y: string }) {
  const cx = (Number.parseFloat(x) / 100) * 1920;
  const cy = (Number.parseFloat(y) / 100) * 1080;
  const sheen = ((t % SHEEN_PERIOD_S) / SHEEN_PERIOD_S) * 3200 - 1200;
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {AURORA.map((blob) => {
        const angle = (t / blob.period) * Math.PI * 2 + blob.phase;
        const left = cx + Math.cos(angle) * blob.orbit - blob.radius;
        const top = cy + Math.sin(angle) * blob.orbit * 0.6 - blob.radius;
        return <div key={blob.phase} className="absolute rounded-full blur-[90px]" style={{ left, top, width: blob.radius * 2, height: blob.radius * 2, background: blob.color }} />;
      })}
      {BOKEH.map((dot) => (
        <span
          key={`${dot.x}-${dot.y}`}
          className="absolute rounded-full bg-white/80 blur-[1.5px]"
          style={{ left: dot.x + Math.sin(t * 0.4 + dot.y) * 30, top: ((dot.y - t * dot.speed) % 1080 + 1080) % 1080, width: dot.size, height: dot.size, opacity: 0.55 }}
        />
      ))}
      <div className="absolute inset-y-0 w-[900px] -skew-x-12" style={{ left: sheen, background: "linear-gradient(90deg, transparent, rgb(255 255 255 / 45%), transparent)" }} />
      <div className="absolute inset-0 opacity-[0.07] mix-blend-multiply" style={{ backgroundImage: GRAIN }} />
    </div>
  );
}

function Glow({ t, x = "50%", y = "40%", hue = "violet" }: { t: number; x?: string; y?: string; hue?: "violet" | "coral" }) {
  const theme = useContext(ThemeContext);
  return theme === "light" ? <Aurora t={t} x={x} y={y} /> : <DarkGlow t={t} x={x} y={y} hue={hue} />;
}

function GridFloor() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 [background-image:linear-gradient(to_right,var(--bt-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--bt-grid)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_50%_60%,black_20%,transparent_70%)]"
    />
  );
}

function Halo({ t, radius, children }: { t: number; radius: number; children: ReactNode }) {
  const theme = useContext(ThemeContext);
  if (theme !== "light") return <>{children}</>;
  return (
    <div className="p-[2px] shadow-[0_30px_80px_-30px_rgb(124_58_237/45%)]" style={{ borderRadius: radius + 2, background: `conic-gradient(from ${t * 70}deg, var(--color-primary), var(--color-violet), var(--color-coral), #38bdf8, var(--color-primary))` }}>
      <div className="bg-[var(--bt-bg)]" style={{ borderRadius: radius }}>
        {children}
      </div>
    </div>
  );
}

function Cursor({ x, y, press }: { x: number; y: number; press: number }) {
  const ripple = press > 0 && press < 1;
  return (
    <div className="pointer-events-none absolute left-0 top-0 z-50" style={{ transform: `translate(${x}px, ${y}px)` }}>
      {ripple ? <span className="absolute -left-10 -top-10 size-20 rounded-full border-2 border-[var(--bt-accent)]" style={{ transform: `scale(${0.3 + press})`, opacity: 1 - press }} /> : null}
      <svg width="40" height="40" viewBox="0 0 24 24" style={{ transform: `scale(${press > 0 && press < 0.5 ? 0.88 : 1})` }} className="drop-shadow-[0_6px_14px_rgb(0_0_0/55%)]">
        <path d="M4 2.5 L4 19 L8.6 14.8 L11.6 21.5 L14.4 20.3 L11.5 13.7 L17.8 13.7 Z" fill="white" stroke="#0b0c14" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function cursorAlong(t: number, path: { at: number; x: number; y: number }[]) {
  const nextIndex = path.findIndex((point) => point.at > t);
  if (nextIndex === -1) return path[path.length - 1];
  if (nextIndex === 0) return path[0];
  const from = path[nextIndex - 1];
  const to = path[nextIndex];
  const p = easeInOut(t, from.at, to.at - from.at);
  return { x: mix(from.x, to.x, p), y: mix(from.y, to.y, p) };
}

function PartsCard({ parts, width, className = "", style }: { parts: CardParts; width: number; className?: string; style?: CSSProperties }) {
  return (
    <div className={`text-left text-foreground [&>section]:shadow-[0_50px_120px_-40px_rgb(124_58_237/70%)] ${className}`} style={{ width, ...style }}>
      <CardPartsView parts={parts} />
    </div>
  );
}

function Card({ role, width, className = "", style }: { role: DemoRole; width: number; className?: string; style?: CSSProperties }) {
  return <PartsCard parts={partsOf(role)} width={width} className={className} style={style} />;
}

function HookBeat({ t }: { t: number }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[var(--bt-bg)] text-[var(--bt-ink)]">
      <div className="absolute inset-0" style={{ opacity: easeIn(t, 0, 1.2) }}>
        <Glow t={t} y="55%" />
      </div>
      <h1 className="relative text-center font-display text-[120px] font-semibold leading-[1.1] tracking-[-0.045em]" style={{ transform: `scale(${mix(1, 1.05, t / 5)})` }}>
        <Words text="ทุกคนในองค์กร" t={t} start={0.3} />
        <br />
        <Words text="มีคำถามเรื่องตัวเลข" t={t} start={1.0} gradient />
      </h1>
    </div>
  );
}

function ProblemBeat({ t }: { t: number }) {
  const gather = easeInOut(t, 4.6, 1.3);
  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--bt-bg)] text-[var(--bt-ink)]" style={{ perspective: 1600 }}>
      <Glow t={t} y="50%" hue="coral" />
      <div className="absolute inset-0 grid place-items-center">
        {SYSTEM_CHIPS.map((chip, index) => {
          const spot = CHIP_SPOTS[index];
          const appear = easeIn(t, 0.7 + index * 0.08, 0.6);
          const driftX = Math.sin(t * 0.6 + index) * 14;
          const driftY = Math.cos(t * 0.5 + index) * 10;
          const x = mix(spot.x + driftX, 0, gather);
          const y = mix(spot.y + driftY, 40, gather);
          const scale = mix(1 - spot.depth, 0.2, gather) * mix(0.6, 1, appear);
          return (
            <span
              key={chip}
              className="absolute whitespace-nowrap bt-glass rounded-full px-6 py-3 text-[26px] font-medium text-[var(--bt-ink-soft)]"
              style={{ transform: `translate(${x}px, ${y}px) scale(${scale})`, opacity: appear * (1 - gather * 0.9) }}
            >
              {chip}
            </span>
          );
        })}
      </div>
      <h2 className="absolute inset-x-0 top-[120px] text-center font-display text-[72px] font-semibold tracking-[-0.035em]" style={{ opacity: 1 - gather }}>
        <Words text="แต่คำตอบ กระจายอยู่ในหลายระบบ" t={t} start={0.2} />
      </h2>
    </div>
  );
}

function RevealBeat({ t }: { t: number }) {
  const burst = easeIn(t, 0, 1.2);
  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden bg-[var(--bt-bg)] text-[var(--bt-ink)]">
      <Glow t={t} y="50%" />
      <div aria-hidden className="absolute left-1/2 top-1/2 size-[1400px] rounded-full" style={{ transform: `translate(-50%, -50%) scale(${mix(0.1, 1, burst)})`, opacity: mix(0.9, 0.35, burst), background: "radial-gradient(circle, rgb(124 58 237 / 45%), rgb(251 113 133 / 12%) 40%, transparent 70%)" }} />
      <div className="relative flex flex-col items-center gap-12">
        <span className="inline-flex items-center gap-[0.22em] font-display text-[150px] font-bold leading-none tracking-[-0.04em]">
          <span
            className={`grid size-[1.2em] place-items-center rounded-[0.3em] text-white ${GRADIENT_TILE} ${GLOW}`}
            style={{ transform: `scale(${mix(0.6, 1, easeIn(t, 0.1, 0.8))})`, opacity: easeIn(t, 0.1, 0.5) }}
          >
            <BrandMark draw={easeIn(t, 0.5, 1.1)} className="size-[0.8em]" />
          </span>
          <span style={{ opacity: easeIn(t, 1.0, 0.6), transform: `translateX(${(1 - easeIn(t, 1.0, 0.8)) * -24}px)` }}>Winyu</span>
        </span>
        <p className="text-[40px] font-medium text-[var(--bt-ink-soft)]" style={{ opacity: easeIn(t, 1.8, 0.7) }}>
          ผู้ช่วยข้อมูลสำหรับทุกคนในองค์กร
        </p>
      </div>
    </div>
  );
}

function Composer({ t, text, typing, caret }: { t: number; text: string; typing: boolean; caret: boolean }) {
  return (
    <Halo t={t} radius={32}>
      <div className={`flex h-[104px] w-[1120px] items-center gap-5 bt-glass rounded-[32px] pl-10 pr-4 ${GLOW}`}>
        <span className={`flex-1 text-[34px] ${text ? "text-[var(--bt-ink)]" : "text-[var(--bt-ink-faint)]"}`}>
          {text || "ถาม Winyu เรื่องอะไรก็ได้ในงานของคุณ…"}
          {typing && caret ? <span className="ml-1 inline-block h-9 w-[3px] translate-y-1.5 bg-[var(--bt-ink)]" /> : null}
        </span>
        <span className={`grid size-[72px] place-items-center rounded-full text-[34px] text-white ${GRADIENT_TILE}`}>↑</span>
      </div>
    </Halo>
  );
}

function AskBeat({ t }: { t: number }) {
  const question = EXEC.question;
  const typeStart = 1.9;
  const typed = Math.min(question.length, Math.max(0, Math.floor((t - typeStart) / TYPE_CHAR_S)));
  const settle = easeInOut(t, 0, 1.3);
  const sent = easeInOut(t, 4.3, 0.9);
  const card = easeIn(t, 4.5, 0.9);
  const push = easeInOut(t, 6.0, 2.2);
  const cursor = cursorAlong(t, [
    { at: 0.6, x: 1560, y: 1000 },
    { at: 1.5, x: 760, y: 590 },
    { at: 3.4, x: 760, y: 590 },
    { at: 3.9, x: 1440, y: 588 },
    { at: 4.6, x: 1440, y: 588 },
    { at: 5.4, x: 1700, y: 1150 },
  ]);
  const press = t >= 1.6 && t < 2.1 ? (t - 1.6) / 0.5 : t >= 4.0 && t < 4.5 ? (t - 4.0) / 0.5 : 0;
  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--bt-stage)] text-[var(--bt-ink)]">
      <GridFloor />
      <Glow t={t} y="62%" />
      <div className="absolute inset-0" style={{ opacity: 1 - sent }}>
        <Heading eyebrow="02 · ถามเป็นภาษาคน" title="ถามเหมือนคุยกับเพื่อนร่วมงาน" t={t} />
      </div>
      <div className="absolute inset-0" style={{ perspective: 1800 }}>
        <div className="absolute left-1/2 top-[540px]" style={{ transform: `translate(-50%, -50%) translateY(${mix(0, -330, sent)}px) rotateX(${mix(26, 0, settle)}deg) scale(${mix(1, 0.78, sent)})`, opacity: mix(0, 1, settle) * (1 - push) }}>
          <Composer t={t} text={question.slice(0, typed)} typing={typed < question.length && t < 4.3} caret={Math.floor(t * 2.4) % 2 === 0} />
        </div>
        <div className="absolute left-1/2 top-[330px] origin-[20%_22%]" style={{ transform: `translateX(-50%) translateY(${(1 - card) * 160}px) scale(${mix(1, 1.5, push)})`, opacity: card }}>
          <Card role={EXEC} width={820} className="bt-reflect" />
        </div>
      </div>
      <div className="absolute bottom-[80px] left-1/2 -translate-x-1/2 bt-glass rounded-full px-8 py-4 text-[30px] font-medium" style={{ opacity: easeIn(t, 6.9, 0.6) }}>
        <span className="mr-3 inline-block size-3 rounded-full bg-success align-middle" />
        อ่านสดจาก SAP SD ณ วินาทีที่ถาม ไม่มีตัวเลขที่ AI แต่งเอง
      </div>
      <Cursor x={cursor.x} y={cursor.y} press={press} />
    </div>
  );
}

function ScopeBeat({ t }: { t: number }) {
  const code = 'scope: region = "north"';
  const codeTyped = Math.min(code.length, Math.max(0, Math.floor((t - 4.2) / 0.05)));
  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--bt-stage)] text-[var(--bt-ink)]">
      <GridFloor />
      <Glow t={t} y="58%" />
      <Heading eyebrow="06 · สิทธิ์อยู่ในโค้ด" title="คำถามเดียวกัน แต่ละคนเห็นเท่าที่ควรเห็น" t={t} />
      <div className="absolute inset-x-0 top-[330px] flex justify-center gap-10" style={{ perspective: 2000 }}>
        {FAN_ROLES.map((role, index) => {
          const enter = easeIn(t, 0.9 + index * 0.25, 0.9);
          const tilt = (index - 1) * -16;
          return (
            <div key={role.id} className="flex flex-col items-center gap-5" style={{ transform: `translateY(${(1 - enter) * 120}px) rotateY(${tilt}deg) translateZ(${index === 1 ? 40 : -60}px)`, opacity: enter }}>
              <div className="flex items-center gap-3">
                <span className="bt-solid rounded-full px-5 py-2 text-[26px] font-semibold">{role.tab}</span>
                <span className="bt-glass rounded-full px-5 py-2 text-[24px] font-medium text-[var(--bt-good)]">{scopeLabel(role)}</span>
              </div>
              <div className="h-[390px] w-[520px] overflow-hidden rounded-[20px]">
                <div className="origin-top-left scale-[0.65]">
                  <Card role={role} width={800} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="absolute bottom-[76px] left-1/2 flex -translate-x-1/2 items-center gap-6 rounded-2xl border border-white/10 bg-[#0d0e16]/92 px-8 py-5 font-mono text-[30px] text-white shadow-[0_30px_80px_-30px_rgb(15_23_42/55%)]" style={{ opacity: easeIn(t, 3.9, 0.4) }}>
        <span className="whitespace-nowrap text-white/85">
          {code.slice(0, codeTyped)}
          {codeTyped < code.length ? <span className="ml-1 inline-block h-7 w-[3px] translate-y-1 bg-white" /> : null}
        </span>
        <span className="whitespace-nowrap font-sans text-[26px] text-emerald-300" style={{ opacity: easeIn(t, 5.6, 0.5) }}>
          ใส่โดย Winyu ก่อน query ออกไป · AI ขยายขอบเขตเองไม่ได้
        </span>
      </div>
    </div>
  );
}

function RoleTag({ children }: { children: ReactNode }) {
  return <span className="bt-glass w-fit rounded-full px-4 py-1.5 text-[22px] font-medium text-[var(--bt-ink-soft)]">{children}</span>;
}

function InvestigateBeat({ t }: { t: number }) {
  const { investigation } = BOOTH;
  const traceDone = TRACE_START_S + investigation.trace.length * TRACE_STEP_S;
  const swap = easeInOut(t, 7.6, 0.9);
  const finding = easeIn(t, traceDone + 1.5, 0.7);
  const action = easeIn(t, traceDone + 2.6, 0.6);
  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--bt-stage)] text-[var(--bt-ink)]">
      <GridFloor />
      <Glow t={t} x="30%" y="60%" />
      <Heading eyebrow="01 · สืบให้ก่อนคุณถาม" title="ก่อนคุณตื่น Winyu สืบให้แล้ว" t={t} />
      <div className="absolute left-[120px] top-[330px] w-[860px]" style={{ opacity: 1 - swap, transform: `translateY(${swap * -40}px)` }}>
        <div className="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-[#0d0e16]/92 p-7 text-white shadow-[0_40px_90px_-40px_rgb(15_23_42/60%)] backdrop-blur" style={{ opacity: easeIn(t, 0.5, 0.5) }}>
          <div className="flex items-center gap-3">
            <span className="size-3 rounded-full bg-success shadow-[0_0_16px_rgb(5_150_105/80%)]" />
            <span className="text-[22px] text-white/80">{investigation.ranAt}</span>
          </div>
          <ol className="flex flex-col gap-2.5">
            {investigation.trace.map((call, index) => {
              const p = easeIn(t, TRACE_START_S + index * TRACE_STEP_S, 0.35);
              return (
                <li key={`${call.tool}-${index}`} className="flex items-baseline gap-4 text-[19px] leading-snug" style={{ opacity: p, transform: `translateX(${(1 - p) * 16}px)` }}>
                  <span className="w-[250px] shrink-0 font-medium text-indigo-300">{call.label}</span>
                  <span className="truncate text-white/60">{call.summary}</span>
                </li>
              );
            })}
          </ol>
          <span className="text-[22px] font-semibold text-white" style={{ opacity: easeIn(t, traceDone, 0.4) }}>
            {investigation.looked}
          </span>
        </div>
      </div>
      <div className="absolute left-[120px] top-[330px] origin-top-left" style={{ opacity: swap, transform: `translateY(${(1 - swap) * 60}px) scale(0.82)` }}>
        <PartsCard parts={investigation.card} width={1000} className="bt-reflect" />
      </div>
      <div className="absolute right-[120px] top-[420px] flex w-[760px] flex-col gap-3" style={{ opacity: easeIn(t, 0.8, 0.5) * (1 - easeIn(t, traceDone + 0.1, 0.4)) }}>
        <span className="font-display text-[200px] font-semibold leading-none tracking-[-0.05em] tabular-nums">
          {Math.round(investigation.checked * easeInOut(t, TRACE_START_S, traceDone - TRACE_START_S))}
        </span>
        <span className="text-[34px] font-medium text-[var(--bt-ink-soft)]">ครั้งที่ Winyu ดูข้อมูลให้ ก่อนสรุปหนึ่งเรื่อง</span>
      </div>
      <div className="absolute right-[120px] top-[330px] flex w-[760px] flex-col gap-7">
        <RoleTag>{investigation.role}</RoleTag>
        <div className="flex flex-col gap-3">
          <p className="text-[24px] text-[var(--bt-muted)]" style={{ opacity: easeIn(t, traceDone + 0.2, 0.4) }}>
            ตัดทิ้งแล้ว
          </p>
          {investigation.story.ruledOut.map((cause, index) => {
            const appear = easeIn(t, traceDone + 0.3 + index * 0.45, 0.4);
            const strike = easeIn(t, traceDone + 0.6 + index * 0.45, 0.4);
            return (
              <p key={cause} className="relative w-fit text-[30px] text-[var(--bt-ink-faint)]" style={{ opacity: appear }}>
                {cause}
                <span className="absolute left-0 top-1/2 h-[3px] bg-coral" style={{ width: `${strike * 100}%` }} />
              </p>
            );
          })}
        </div>
        <div style={{ opacity: finding, transform: `translateY(${(1 - finding) * 30}px)` }}>
          <Halo t={t} radius={28}>
            <div className={`flex flex-col gap-4 rounded-[28px] p-8 text-white ${GRADIENT_TILE} ${GLOW}`}>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-white px-4 py-1 text-[22px] font-semibold text-danger">{investigation.story.kind}</span>
                <span className="text-[22px] font-medium text-white/90">{investigation.story.scope}</span>
              </div>
              <p className="text-[38px] font-semibold leading-[1.35]">{investigation.story.finding}</p>
            </div>
          </Halo>
        </div>
        {investigation.story.action ? (
          <p className="text-[26px] leading-[1.5] text-[var(--bt-ink-soft)]" style={{ opacity: action }}>
            <span className="mr-2 font-semibold text-[var(--bt-accent)]">ขั้นต่อไป</span>
            {investigation.story.action}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function LearnBeat({ t }: { t: number }) {
  const { chips, memory } = BOOTH;
  const confirmAt = 6.6;
  const confirmed = t >= confirmAt + 0.3;
  const cursor = cursorAlong(t, [
    { at: 0.8, x: 1500, y: 1100 },
    { at: 2.0, x: 300, y: 530 },
    { at: 4.6, x: 300, y: 530 },
    { at: 6.4, x: 1130, y: 712 },
    { at: 7.6, x: 1130, y: 712 },
    { at: 8.6, x: 1700, y: 1150 },
  ]);
  const press = t >= confirmAt && t < confirmAt + 0.5 ? (t - confirmAt) / 0.5 : 0;
  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--bt-stage)] text-[var(--bt-ink)]">
      <GridFloor />
      <Glow t={t} x="45%" y="62%" />
      <Heading eyebrow="03 · เรียนรู้วิธีที่คุณทำงาน" title="ยิ่งใช้ ยิ่งรู้ใจ" t={t} />
      <div className="absolute left-[120px] top-[330px] flex w-[820px] flex-col gap-6">
        <RoleTag>{chips.role}</RoleTag>
        <p className="text-[26px] text-[var(--bt-muted)]" style={{ opacity: easeIn(t, 0.6, 0.5) }}>
          ปุ่มลัดใต้ช่องถาม เรียงจากสิ่งที่คุณถามบ่อย
        </p>
        <div className="grid grid-cols-2 gap-4">
          {chips.items.slice(0, SHOWN_CHIPS).map((chip, index) => {
            const p = easeIn(t, 0.9 + index * 0.25, 0.5);
            const focused = index === 0 && t >= 2.0 && t < 4.8;
            return (
              <div key={chip.label} className={`flex flex-col gap-2 rounded-[22px] p-5 ${focused ? "bt-panel ring-2 ring-[var(--bt-accent)] shadow-[0_0_40px_rgb(129_140_248/35%)]" : "bt-glass"}`} style={{ opacity: p, transform: `translateY(${(1 - p) * 20}px)` }}>
                <span className="text-[28px] font-semibold">{chip.label}</span>
                <span className="text-[20px] leading-snug text-[var(--bt-accent)]">{chip.reason}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="absolute right-[120px] top-[330px] flex w-[760px] flex-col gap-6" style={{ opacity: easeIn(t, 3.8, 0.7), transform: `translateY(${(1 - easeIn(t, 3.8, 0.7)) * 30}px)` }}>
        <RoleTag>{memory.role}</RoleTag>
        <div className="flex flex-col gap-5 bt-panel rounded-[28px] p-8">
          <p className="text-[30px] font-semibold">{confirmed ? memory.title : memory.learning}</p>
          {memory.facts.map((fact, index) => (
            <div key={fact.value} className="flex items-center gap-4 text-[26px]" style={{ opacity: easeIn(t, 4.3 + index * 0.35, 0.4) }}>
              <span className={`grid size-9 shrink-0 place-items-center rounded-full ${confirmed ? "bg-success text-white" : "border-2 border-[var(--bt-ink-faint)]"}`}>{confirmed ? <Check className="size-5" strokeWidth={3} aria-hidden /> : null}</span>
              <span className="text-[var(--bt-ink-soft)]">{fact.value}</span>
            </div>
          ))}
          <span className={`mt-2 w-fit rounded-full px-7 py-3 text-[26px] font-semibold ${confirmed ? "bt-glass text-[var(--bt-ink-faint)]" : "bt-solid"}`}>{memory.confirm}</span>
        </div>
      </div>
      <Cursor x={cursor.x} y={cursor.y} press={press} />
    </div>
  );
}

function SuggestBeat({ t }: { t: number }) {
  const { suggestion } = BOOTH;
  const clickAt = 4.0;
  const kept = t >= clickAt + 0.3;
  const enter = easeIn(t, 0.8, 0.9);
  const cursor = cursorAlong(t, [
    { at: 1.4, x: 1600, y: 1120 },
    { at: 3.4, x: 1030, y: 362 },
    { at: 5.0, x: 1030, y: 362 },
    { at: 6.4, x: 1750, y: 1150 },
  ]);
  const press = t >= clickAt && t < clickAt + 0.5 ? (t - clickAt) / 0.5 : 0;
  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--bt-stage)] text-[var(--bt-ink)]">
      <GridFloor />
      <Glow t={t} x="60%" y="60%" />
      <Heading eyebrow="04 · แนะนำการ์ดที่ใช่" title="ถามบ่อย Winyu ปักไว้ให้" t={t} />
      <div className="absolute left-[120px] top-[330px] flex w-[600px] flex-col gap-4">
        <RoleTag>{suggestion.role}</RoleTag>
        <p className="text-[24px] text-[var(--bt-muted)]">การ์ดที่ปักไว้</p>
        {[0, 1, 2].map((slot) => (
          <div key={slot} className="flex h-[118px] flex-col justify-center gap-3 bt-glass rounded-[22px] px-7">
            <span className="h-3 w-1/2 rounded-full bg-[var(--bt-skeleton)]" />
            <span className="h-7 w-1/3 rounded-lg bg-[var(--bt-skeleton)]" />
          </div>
        ))}
      </div>
      <div className="absolute left-[780px] top-[330px] flex w-[1020px] flex-col gap-5" style={{ opacity: enter, transform: `translateX(${(1 - enter) * 80}px)` }}>
        <div className="flex items-center gap-4">
          <span className={`rounded-full px-5 py-2 text-[24px] font-semibold ${kept ? "bg-success text-white" : `text-white ${GRADIENT_TILE}`}`}>{kept ? `✓ ${suggestion.keep}แล้ว` : suggestion.badge}</span>
          <span className={`rounded-full px-6 py-2 text-[24px] font-semibold ${kept ? "bt-glass text-[var(--bt-ink-faint)]" : "bt-solid"}`}>{suggestion.keep}</span>
          <span className="text-[22px] text-[var(--bt-accent)]">{suggestion.reason}</span>
        </div>
        <div className="origin-top-left scale-[0.8]">
          <PartsCard parts={suggestion.card} width={1260} className={`bt-reflect ${kept ? "rounded-[24px] ring-4 ring-success/70" : ""}`} />
        </div>
      </div>
      <Cursor x={cursor.x} y={cursor.y} press={press} />
    </div>
  );
}

function ForeseeBeat({ t }: { t: number }) {
  const { anomaly, forecast } = BOOTH;
  const alertIn = easeIn(t, 0.7, 0.7);
  const lesson = easeIn(t, 3.2, 0.7);
  const future = easeIn(t, 5.0, 0.9);
  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--bt-stage)] text-[var(--bt-ink)]">
      <GridFloor />
      <Glow t={t} x="30%" y="55%" hue="coral" />
      <Heading eyebrow="05 · เห็นก่อนเป็นปัญหา" title="Winyu เฝ้าตัวเลขให้ทุกวัน" t={t} />
      <div className="absolute left-[120px] top-[330px] flex w-[760px] flex-col gap-5" style={{ opacity: alertIn, transform: `translateY(${(1 - alertIn) * 30}px)` }}>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-danger px-4 py-1.5 text-[22px] font-bold text-white">{anomaly.severity}</span>
          <span className="text-[24px] font-medium text-[var(--bt-ink-soft)]">{anomaly.scope}</span>
        </div>
        <div className="flex items-baseline gap-5">
          <span className="font-display text-[84px] font-semibold leading-none tracking-[-0.03em]">{anomaly.observed}</span>
          <span className="rounded-full bg-danger/15 px-4 py-1.5 text-[30px] font-semibold text-[var(--bt-bad)]">−{anomaly.gap}</span>
          <span className="text-[26px] text-[var(--bt-muted)]">ปกติ {anomaly.expected}</span>
        </div>
        <p className="text-[26px] leading-[1.5] text-[var(--bt-ink-soft)]">{anomaly.hypothesis}</p>
        {anomaly.lesson ? (
          <div className="flex flex-col gap-2 bt-panel rounded-[22px] p-6" style={{ opacity: lesson, transform: `translateY(${(1 - lesson) * 20}px)` }}>
            <span className="text-[22px] font-semibold text-[var(--bt-accent)]">Winyu จำจากครั้งก่อน</span>
            <span className="text-[25px] leading-[1.5] text-[var(--bt-ink-soft)]">{anomaly.lesson}</span>
          </div>
        ) : null}
      </div>
      <div className="absolute right-[120px] top-[330px] flex w-[860px] flex-col gap-4" style={{ opacity: future, transform: `translateX(${(1 - future) * 60}px)` }}>
        <RoleTag>{forecast.role}</RoleTag>
        <PartsCard parts={forecast.card} width={860} className="bt-reflect" />
      </div>
    </div>
  );
}

function ActBeat({ t }: { t: number }) {
  const settle = easeInOut(t, 0, 1.4);
  const action = partsOf(REP).actions?.[0];
  const cursor = cursorAlong(t, [
    { at: 0.8, x: 1700, y: 1100 },
    { at: 2.6, x: 160, y: 690 },
    { at: 4.6, x: 160, y: 690 },
    { at: 5.6, x: 1720, y: 1150 },
  ]);
  const press = t >= 3.0 && t < 3.5 ? (t - 3.0) / 0.5 : 0;
  const followUp = easeIn(t, 3.6, 0.8);
  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--bt-stage)] text-[var(--bt-ink)]">
      <GridFloor />
      <Glow t={t} x="35%" y="60%" />
      <Heading eyebrow="07 · ทำต่อได้ทันที" title="คำตอบไม่จบที่ตัวเลข" t={t} />
      <div className="absolute left-[120px] top-[300px]" style={{ perspective: 1800 }}>
        <div style={{ transform: `rotateY(${mix(18, 6, settle)}deg) rotateX(${mix(10, 2, settle)}deg)`, opacity: settle }}>
          <Card role={REP} width={900} className="bt-reflect" />
        </div>
      </div>
      <div className="absolute right-[120px] top-[430px] flex w-[680px] flex-col gap-5" style={{ opacity: followUp, transform: `translateY(${(1 - followUp) * 30}px)` }}>
        <p className="text-[28px] font-medium text-[var(--bt-accent)]">Winyu ถามต่อให้</p>
        <div className={`rounded-[28px] rounded-br-lg px-8 py-6 text-[32px] leading-[1.45] text-white ${GLOW} ${GRADIENT_TILE}`}>{action?.prompt}</div>
        <p className="text-[26px] text-[var(--bt-muted)]">{action?.label} · ใช้ขอบเขตเดิมของคุณ ไม่ต้องพิมพ์ใหม่</p>
      </div>
      <Cursor x={cursor.x} y={cursor.y} press={press} />
    </div>
  );
}

function ProofBeat({ t }: { t: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--bt-stage)] text-[var(--bt-ink)]">
      <GridFloor />
      <Glow t={t} y="65%" />
      <Heading eyebrow="Enterprise ready" title="ปลอดภัยตั้งแต่ออกแบบ" t={t} />
      <div className="absolute inset-x-[120px] top-[340px] grid grid-cols-3 gap-6">
        {SAFEGUARDS.map((item, index) => {
          const p = easeIn(t, 0.8 + index * 0.22, 0.6);
          return (
            <div key={item.title} className="flex flex-col gap-4 bt-panel rounded-[28px] p-8" style={{ opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
              <span className={`grid size-14 place-items-center rounded-2xl text-white ${GRADIENT_TILE}`}>
                {index === 0 ? <ShieldCheck className="size-8" aria-hidden /> : <Check className="size-8" strokeWidth={3} aria-hidden />}
              </span>
              <p className="text-[32px] font-semibold leading-tight">{item.title}</p>
              <p className="text-[22px] leading-[1.5] text-[var(--bt-muted)]">{item.body}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EndBeat({ t }: { t: number }) {
  const fadeOut = easeInOut(t, 4.8, 1.2);
  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden bg-[var(--bt-bg)] text-[var(--bt-ink)]">
      <div className="absolute inset-0" style={{ opacity: 1 - fadeOut }}>
        <Glow t={t} y="45%" />
      </div>
      <div className="relative flex flex-col items-center gap-10" style={{ opacity: 1 - fadeOut }}>
        <span className="inline-flex items-center gap-6 font-display text-[132px] font-bold leading-none tracking-[-0.04em]">
          <span className={`grid size-[1.2em] place-items-center rounded-[0.3em] ${GRADIENT_TILE} ${GLOW}`}>
            <BrandMark className="size-[0.8em] text-white" />
          </span>
          Winyu
        </span>
        <p className="font-display text-[60px] font-medium tracking-[-0.03em]">
          <Words text="One question." t={t} start={0.6} /> <Words text="The right answer for every role." t={t} start={1.0} gradient />
        </p>
      </div>
    </div>
  );
}

function BeatView({ id, t }: { id: BeatId; t: number }) {
  if (id === "hook") return <HookBeat t={t} />;
  if (id === "problem") return <ProblemBeat t={t} />;
  if (id === "reveal") return <RevealBeat t={t} />;
  if (id === "ask") return <AskBeat t={t} />;
  if (id === "scope") return <ScopeBeat t={t} />;
  if (id === "investigate") return <InvestigateBeat t={t} />;
  if (id === "learn") return <LearnBeat t={t} />;
  if (id === "suggest") return <SuggestBeat t={t} />;
  if (id === "foresee") return <ForeseeBeat t={t} />;
  if (id === "act") return <ActBeat t={t} />;
  if (id === "proof") return <ProofBeat t={t} />;
  return <EndBeat t={t} />;
}

/** The SaaS cut at time t on a fixed 1920×1080 stage, scaled by `scale` to fit the screen; `theme` picks the dark stage or the light one. */
export function SaasStage({ t, scale, theme = "dark" }: { t: number; scale: number; theme?: "dark" | "light" }) {
  return (
    <ThemeContext.Provider value={theme}>
      <div className={`booth-${theme} relative origin-top-left overflow-hidden bg-[var(--bt-bg)]`} style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, transform: `scale(${scale})` }}>
        {SAAS_SEQUENCE.at(t).map((beat) => (
          <div key={beat.id} className="absolute inset-0" style={{ opacity: clamp01(beat.opacity) }}>
            <BeatView id={beat.id} t={beat.local} />
          </div>
        ))}
      </div>
    </ThemeContext.Provider>
  );
}

/** The SaaS cut on the light stage. */
export function SaasLightStage({ t, scale }: { t: number; scale: number }) {
  return <SaasStage t={t} scale={scale} theme="light" />;
}
