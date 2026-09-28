import { Check, ShieldCheck } from "lucide-react";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { BrandMark } from "@/components/chrome/brand-mark";
import { CardPartsView } from "@/components/cards/card-parts";
import { JOURNEY, LANDSCAPE, SAFEGUARDS } from "../home/content";
import { DEMO_ROLES, scopeLabel, type DemoRole } from "../home/hero-demo";
import { STAGE_HEIGHT, STAGE_WIDTH, clamp01, createSequence, easeIn, easeInOut, mix } from "./sequence";

type BeatId = "hook" | "problem" | "reveal" | "ask" | "scope" | "trace" | "act" | "proof" | "end";

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
    { id: "ask", duration: 9 },
    { id: "scope", duration: 9 },
    { id: "trace", duration: 8 },
    { id: "act", duration: 8 },
    { id: "proof", duration: 6 },
    { id: "end", duration: 6 },
  ],
  CROSSFADE_S,
);

const ROLE_BY_ID = Object.fromEntries(DEMO_ROLES.map((role) => [role.id, role])) as Record<string, DemoRole>;
const EXEC = ROLE_BY_ID.exec;
const REP = ROLE_BY_ID.rep;
const FAN_ROLES = [ROLE_BY_ID.exec, ROLE_BY_ID.rsm, ROLE_BY_ID.rep];

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
  return (
    <span className={className}>
      {words.map((word, index) => {
        const p = easeIn(t, start + index * WORD_STAGGER_S, WORD_RISE_S);
        return (
          <Fragment key={`${word}-${index}`}>
            <span className="inline-block overflow-hidden pb-[0.12em] align-bottom">
              <span className={`inline-block ${gradient ? "gradient-text-night" : ""}`} style={{ transform: `translateY(${(1 - p) * 110}%)`, opacity: p }}>
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
    <p className="text-[28px] font-medium text-indigo-300" style={{ opacity: easeIn(t, 0.1, 0.5) }}>
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

function Glow({ t, x = "50%", y = "40%", hue = "violet" }: { t: number; x?: string; y?: string; hue?: "violet" | "coral" }) {
  const pulse = 0.85 + Math.sin(t * 1.3) * 0.15;
  const color = hue === "violet" ? "rgb(124 58 237 / 38%)" : "rgb(251 113 133 / 26%)";
  return <div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(40% 45% at ${x} ${y}, ${color}, transparent 70%)`, opacity: pulse }} />;
}

function GridFloor() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 [background-image:linear-gradient(to_right,rgb(255_255_255/5%)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/5%)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_50%_60%,black_20%,transparent_70%)]"
    />
  );
}

function Cursor({ x, y, press }: { x: number; y: number; press: number }) {
  const ripple = press > 0 && press < 1;
  return (
    <div className="pointer-events-none absolute left-0 top-0 z-50" style={{ transform: `translate(${x}px, ${y}px)` }}>
      {ripple ? <span className="absolute -left-10 -top-10 size-20 rounded-full border-2 border-white/70" style={{ transform: `scale(${0.3 + press})`, opacity: 1 - press }} /> : null}
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

function Card({ role, width, className = "", style }: { role: DemoRole; width: number; className?: string; style?: CSSProperties }) {
  return (
    <div className={`text-left text-foreground [&>section]:shadow-[0_50px_120px_-40px_rgb(124_58_237/70%)] ${className}`} style={{ width, ...style }}>
      <CardPartsView parts={partsOf(role)} />
    </div>
  );
}

function HookBeat({ t }: { t: number }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#07070c] text-white">
      <Glow t={t} y="55%" />
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
    <div className="absolute inset-0 overflow-hidden bg-[#07070c] text-white" style={{ perspective: 1600 }}>
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
              className="absolute whitespace-nowrap rounded-full border border-white/15 bg-white/[0.06] px-6 py-3 text-[26px] font-medium text-white/85 backdrop-blur"
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
    <div className="absolute inset-0 grid place-items-center overflow-hidden bg-[#07070c] text-white">
      <div aria-hidden className="absolute left-1/2 top-1/2 size-[1400px] rounded-full" style={{ transform: `translate(-50%, -50%) scale(${mix(0.1, 1, burst)})`, opacity: mix(0.9, 0.35, burst), background: "radial-gradient(circle, rgb(124 58 237 / 45%), rgb(251 113 133 / 12%) 40%, transparent 70%)" }} />
      <div className="relative flex flex-col items-center gap-8">
        <span className="inline-flex items-center gap-8 font-display text-[168px] font-bold leading-none tracking-[-0.04em]">
          <BrandMark draw={easeIn(t, 0.3, 1.2)} className="size-[1.25em] text-white" />
          <span style={{ opacity: easeIn(t, 1.0, 0.6), transform: `translateX(${(1 - easeIn(t, 1.0, 0.8)) * -24}px)` }}>Winyu</span>
        </span>
        <p className="text-[40px] font-medium text-white/75" style={{ opacity: easeIn(t, 1.8, 0.7) }}>
          ผู้ช่วยข้อมูลสำหรับทุกคนในองค์กร
        </p>
      </div>
    </div>
  );
}

function Composer({ text, typing, caret }: { text: string; typing: boolean; caret: boolean }) {
  return (
    <div className={`flex h-[104px] w-[1120px] items-center gap-5 rounded-[32px] border border-white/15 bg-white/[0.07] pl-10 pr-4 backdrop-blur-xl ${GLOW}`}>
      <span className={`flex-1 text-[34px] ${text ? "text-white" : "text-white/40"}`}>
        {text || "ถาม Winyu เรื่องอะไรก็ได้ในงานของคุณ…"}
        {typing && caret ? <span className="ml-1 inline-block h-9 w-[3px] translate-y-1.5 bg-white" /> : null}
      </span>
      <span className={`grid size-[72px] place-items-center rounded-full text-[34px] text-white ${GRADIENT_TILE}`}>↑</span>
    </div>
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
    <div className="absolute inset-0 overflow-hidden bg-night text-white">
      <GridFloor />
      <Glow t={t} y="62%" />
      <div className="absolute inset-0" style={{ opacity: 1 - sent }}>
        <Heading eyebrow="01 · ถามเป็นภาษาคน" title="ถามเหมือนคุยกับเพื่อนร่วมงาน" t={t} />
      </div>
      <div className="absolute inset-0" style={{ perspective: 1800 }}>
        <div className="absolute left-1/2 top-[540px]" style={{ transform: `translate(-50%, -50%) translateY(${mix(0, -330, sent)}px) rotateX(${mix(26, 0, settle)}deg) scale(${mix(1, 0.78, sent)})`, opacity: mix(0, 1, settle) * (1 - push) }}>
          <Composer text={question.slice(0, typed)} typing={typed < question.length && t < 4.3} caret={Math.floor(t * 2.4) % 2 === 0} />
        </div>
        <div className="absolute left-1/2 top-[330px] origin-[20%_22%]" style={{ transform: `translateX(-50%) translateY(${(1 - card) * 160}px) scale(${mix(1, 1.5, push)})`, opacity: card }}>
          <Card role={EXEC} width={820} />
        </div>
      </div>
      <div className="absolute bottom-[80px] left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-white/[0.08] px-8 py-4 text-[30px] font-medium backdrop-blur" style={{ opacity: easeIn(t, 6.9, 0.6) }}>
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
    <div className="absolute inset-0 overflow-hidden bg-night text-white">
      <GridFloor />
      <Glow t={t} y="58%" />
      <Heading eyebrow="02 · สิทธิ์อยู่ในโค้ด" title="คำถามเดียวกัน แต่ละคนเห็นเท่าที่ควรเห็น" t={t} />
      <div className="absolute inset-x-0 top-[330px] flex justify-center gap-10" style={{ perspective: 2000 }}>
        {FAN_ROLES.map((role, index) => {
          const enter = easeIn(t, 0.9 + index * 0.25, 0.9);
          const tilt = (index - 1) * -16;
          return (
            <div key={role.id} className="flex flex-col items-center gap-5" style={{ transform: `translateY(${(1 - enter) * 120}px) rotateY(${tilt}deg) translateZ(${index === 1 ? 40 : -60}px)`, opacity: enter }}>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-white px-5 py-2 text-[26px] font-semibold text-foreground">{role.tab}</span>
                <span className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-5 py-2 text-[24px] font-medium text-emerald-300">{scopeLabel(role)}</span>
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
      <div className="absolute bottom-[76px] left-1/2 flex -translate-x-1/2 items-center gap-6 rounded-2xl border border-white/10 bg-black/60 px-8 py-5 font-mono text-[30px]" style={{ opacity: easeIn(t, 3.9, 0.4) }}>
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

function TraceBeat({ t }: { t: number }) {
  const travel = easeInOut(t, 1.0, 4.6);
  const count = JOURNEY.length;
  const lineLeft = 230;
  const lineWidth = 1460;
  return (
    <div className="absolute inset-0 overflow-hidden bg-night text-white">
      <GridFloor />
      <Glow t={t} y="55%" hue="coral" />
      <Heading eyebrow="03 · ทุกตัวเลขมีที่มา" title="จากคำถาม ถึงการ์ด ผ่านระบบเดิมขององค์กร" t={t} />
      <div className="absolute top-[560px] h-[3px] rounded-full bg-white/10" style={{ left: lineLeft, width: lineWidth }}>
        <div className={`h-full rounded-full ${GRADIENT_TILE}`} style={{ width: `${travel * 100}%` }} />
        <span className="absolute -top-[11px] size-[25px] rounded-full bg-white shadow-[0_0_40px_10px_rgb(196_181_253/70%)]" style={{ left: `calc(${travel * 100}% - 12px)`, opacity: travel > 0 && travel < 1 ? 1 : 0 }} />
      </div>
      {JOURNEY.map((step, index) => {
        const at = index / (count - 1);
        const lit = clamp01((travel - at) * 12 + 1);
        const x = lineLeft + at * lineWidth;
        return (
          <div key={step.title} className="absolute top-[516px] flex w-[250px] -translate-x-1/2 flex-col items-center gap-5 text-center" style={{ left: x }}>
            <span
              className={`grid size-[88px] place-items-center rounded-full border text-[34px] font-semibold ${lit > 0.5 ? `border-transparent ${GRADIENT_TILE} shadow-[0_0_50px_rgb(124_58_237/60%)]` : "border-white/15 bg-night-raised text-white/50"}`}
            >
              {index + 1}
            </span>
            <p className="text-[28px] font-semibold leading-tight" style={{ opacity: mix(0.4, 1, lit) }}>
              {step.title}
            </p>
            <p className="text-[21px] leading-snug text-night-muted" style={{ opacity: mix(0.25, 1, lit) }}>
              {step.body}
            </p>
          </div>
        );
      })}
      <div className="absolute bottom-[90px] left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-white/[0.08] px-8 py-4 font-mono text-[26px] text-white/85" style={{ opacity: easeIn(t, 6.0, 0.6) }}>
        {partsOf(EXEC).footnote}
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
    <div className="absolute inset-0 overflow-hidden bg-night text-white">
      <GridFloor />
      <Glow t={t} x="35%" y="60%" />
      <Heading eyebrow="04 · ทำต่อได้ทันที" title="คำตอบไม่จบที่ตัวเลข" t={t} />
      <div className="absolute left-[120px] top-[300px]" style={{ perspective: 1800 }}>
        <div style={{ transform: `rotateY(${mix(18, 6, settle)}deg) rotateX(${mix(10, 2, settle)}deg)`, opacity: settle }}>
          <Card role={REP} width={900} />
        </div>
      </div>
      <div className="absolute right-[120px] top-[430px] flex w-[680px] flex-col gap-5" style={{ opacity: followUp, transform: `translateY(${(1 - followUp) * 30}px)` }}>
        <p className="text-[28px] font-medium text-indigo-300">Winyu ถามต่อให้</p>
        <div className={`rounded-[28px] rounded-br-lg px-8 py-6 text-[32px] leading-[1.45] ${GRADIENT_TILE}`}>{action?.prompt}</div>
        <p className="text-[26px] text-night-muted">{action?.label} · ใช้ขอบเขตเดิมของคุณ ไม่ต้องพิมพ์ใหม่</p>
      </div>
      <Cursor x={cursor.x} y={cursor.y} press={press} />
    </div>
  );
}

function ProofBeat({ t }: { t: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-night text-white">
      <GridFloor />
      <Glow t={t} y="65%" />
      <Heading eyebrow="Enterprise ready" title="ปลอดภัยตั้งแต่ออกแบบ" t={t} />
      <div className="absolute inset-x-[120px] top-[340px] grid grid-cols-3 gap-6">
        {SAFEGUARDS.map((item, index) => {
          const p = easeIn(t, 0.8 + index * 0.22, 0.6);
          return (
            <div key={item.title} className="flex flex-col gap-4 rounded-[28px] border border-night-line bg-night-raised/80 p-8" style={{ opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
              <span className={`grid size-14 place-items-center rounded-2xl ${GRADIENT_TILE}`}>
                {index === 0 ? <ShieldCheck className="size-8" aria-hidden /> : <Check className="size-8" strokeWidth={3} aria-hidden />}
              </span>
              <p className="text-[32px] font-semibold leading-tight">{item.title}</p>
              <p className="text-[22px] leading-[1.5] text-night-muted">{item.body}</p>
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
    <div className="absolute inset-0 grid place-items-center overflow-hidden bg-[#07070c] text-white">
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
  if (id === "trace") return <TraceBeat t={t} />;
  if (id === "act") return <ActBeat t={t} />;
  if (id === "proof") return <ProofBeat t={t} />;
  return <EndBeat t={t} />;
}

/** The SaaS cut at time t on a fixed 1920×1080 stage, scaled by `scale` to fit the screen. */
export function SaasStage({ t, scale }: { t: number; scale: number }) {
  return (
    <div className="relative origin-top-left overflow-hidden bg-[#07070c]" style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, transform: `scale(${scale})` }}>
      {SAAS_SEQUENCE.at(t).map((beat) => (
        <div key={beat.id} className="absolute inset-0" style={{ opacity: clamp01(beat.opacity) }}>
          <BeatView id={beat.id} t={beat.local} />
        </div>
      ))}
    </div>
  );
}
