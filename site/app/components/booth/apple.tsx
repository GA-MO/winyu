import { Check } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { BrandMark } from "@/components/chrome/brand-mark";
import { CardPartsView } from "@/components/cards/card-parts";
import type { CardParts } from "@/lib/cards/present";
import { DEMO_ROLES, roleTitleOf, scopeLabel, stepsOf, type DemoRole } from "../home/hero-demo";
import { BOOTH } from "./data";
import { STAGE_HEIGHT, STAGE_WIDTH, clamp01, createSequence, easeIn, easeInOut, mix } from "./sequence";

type BeatId = "ask-word" | "phone" | "number" | "know-word" | "laptop" | "checks" | "trio" | "act-word" | "bento" | "end";

const CROSSFADE_S = 0.5;
const TYPE_CHAR_S = 0.05;
const TRACE_LINES = 8;

/** The Apple-style cut: one idea per shot on white, the product inside devices, slow camera moves into single numbers. */
export const APPLE_SEQUENCE = createSequence<BeatId>(
  [
    { id: "ask-word", duration: 3.5 },
    { id: "phone", duration: 8 },
    { id: "number", duration: 3.5 },
    { id: "know-word", duration: 3 },
    { id: "laptop", duration: 9 },
    { id: "checks", duration: 3.5 },
    { id: "trio", duration: 9.5 },
    { id: "act-word", duration: 3 },
    { id: "bento", duration: 11 },
    { id: "end", duration: 6 },
  ],
  CROSSFADE_S,
);

const ROLE_BY_ID = Object.fromEntries(DEMO_ROLES.map((role) => [role.id, role])) as Record<string, DemoRole>;
const EXEC = ROLE_BY_ID.exec;
const RSM = ROLE_BY_ID.rsm;
const REP = ROLE_BY_ID.rep;

const GRADIENT_TILE = "bg-[linear-gradient(135deg,var(--color-primary),var(--color-violet)_55%,var(--color-coral))]";
const INK = "text-[var(--ap-ink)]";
const MUTED = "text-[var(--ap-muted)]";

function partsOf(role: DemoRole): CardParts {
  if (role.card.view.kind !== "parts") throw new Error(`Card ${role.id} has no parts`);
  return role.card.view.parts;
}

function focusIn(t: number, from: number, span: number): CSSProperties {
  const p = easeIn(t, from, span);
  return { opacity: p, filter: `blur(${(1 - p) * 18}px)`, transform: `translateY(${(1 - p) * 24}px) scale(${mix(0.97, 1, p)})` };
}

function ScaledCard({ parts, width, scale }: { parts: CardParts; width: number; scale: number }) {
  return (
    <div className="origin-top-left text-left text-foreground" style={{ width, transform: `scale(${scale})` }}>
      <CardPartsView parts={parts} />
    </div>
  );
}

function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[64px] bg-[var(--ap-device)] p-[14px] shadow-[var(--ap-shadow)] ring-1 ring-[var(--ap-device-edge)]">
      <div className="relative h-[860px] w-[400px] overflow-hidden rounded-[50px] bg-[var(--ap-bg)]">
        <span className="absolute left-1/2 top-4 z-10 size-4 -translate-x-1/2 rounded-full bg-[var(--ap-device)]" />
        {children}
      </div>
    </div>
  );
}

function Tablet({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[48px] bg-[var(--ap-device)] p-[22px] shadow-[var(--ap-shadow)] ring-1 ring-[var(--ap-device-edge)]">
      <div className="relative h-[660px] w-[900px] overflow-hidden rounded-[28px] bg-[var(--ap-bg)]">{children}</div>
    </div>
  );
}

function Laptop({ lid, children }: { lid: number; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center" style={{ perspective: 2600 }}>
      <div className="origin-bottom rounded-t-[26px] bg-[var(--ap-device)] p-[18px] pb-[26px] ring-1 ring-[var(--ap-device-edge)]" style={{ transform: `rotateX(${mix(-92, 0, lid)}deg)` }}>
        <div className="relative h-[760px] w-[1216px] overflow-hidden rounded-[10px] bg-[var(--ap-bg)]">{children}</div>
      </div>
      <div className="relative h-[26px] w-[1420px] rounded-b-[26px] bg-[linear-gradient(180deg,var(--ap-silver-top),var(--ap-silver-bottom))] shadow-[var(--ap-shadow)]">
        <span className="absolute left-1/2 top-0 h-[10px] w-[220px] -translate-x-1/2 rounded-b-[12px] bg-[var(--ap-silver-bottom)]" />
      </div>
      <div className="-mt-3 h-12 w-[1300px] rounded-[50%] bg-[var(--ap-ink)]/20 blur-2xl" />
    </div>
  );
}

function MiniLockup() {
  return (
    <span className={`inline-flex items-center gap-2 text-[20px] font-bold tracking-tight ${INK}`}>
      <span className={`grid size-8 place-items-center rounded-[10px] text-white ${GRADIENT_TILE}`}>
        <BrandMark className="size-5" />
      </span>
      Winyu
    </span>
  );
}

function WordBeat({ t, word }: { t: number; word: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[var(--ap-bg)]">
      <p className={`font-display text-[260px] font-semibold leading-none tracking-[-0.05em] ${INK}`} style={focusIn(t, 0.3, 0.9)}>
        {word}
      </p>
    </div>
  );
}

function PhoneScreen({ t }: { t: number }) {
  const question = EXEC.question;
  const typed = Math.min(question.length, Math.max(0, Math.floor((t - 1.4) / TYPE_CHAR_S)));
  const sent = t >= 3.6;
  const bloom = easeIn(t, 5.0, 0.8);
  const steps = stepsOf(EXEC, roleTitleOf(EXEC));
  const tap = t >= 3.35 && t < 3.85 ? (t - 3.35) / 0.5 : 0;
  return (
    <div className="flex h-full flex-col px-5 pb-6 pt-16">
      <div className="flex items-center justify-between">
        <MiniLockup />
        <span className={`text-[15px] ${MUTED}`}>{EXEC.tab}</span>
      </div>
      <div className="relative mt-6 flex flex-1 flex-col gap-4">
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 text-center" style={{ opacity: 1 - easeIn(t, 3.5, 0.4) }}>
          <span className={`grid size-16 place-items-center rounded-[20px] text-white ${GRADIENT_TILE}`}>
            <BrandMark className="size-10" />
          </span>
          <p className={`text-[26px] font-semibold ${INK}`}>มีอะไรให้ช่วยดูวันนี้</p>
          <p className={`text-[17px] ${MUTED}`}>ถามเรื่องตัวเลขได้ทุกเรื่อง ตามสิทธิ์ของคุณ</p>
        </div>
        {sent ? <div className={`ml-auto max-w-[88%] rounded-[22px] rounded-br-md px-4 py-3 text-[17px] leading-6 text-white ${GRADIENT_TILE}`}>{question}</div> : null}
        <ol className="flex flex-col gap-2 px-1">
          {steps.map((step, index) => (
            <li key={step} className={`flex items-center gap-2 text-[15px] ${INK}`} style={{ opacity: easeIn(t, 3.9 + index * 0.25, 0.3) }}>
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-success text-white">
                <Check className="size-3" strokeWidth={3} aria-hidden />
              </span>
              {step}
            </li>
          ))}
        </ol>
        <div className="origin-top" style={{ opacity: bloom, transform: `scale(${mix(0.92, 1, bloom)})` }}>
          <ScaledCard parts={partsOf(EXEC)} width={500} scale={0.72} />
        </div>
      </div>
      <div className="relative flex h-[58px] items-center gap-3 rounded-full bg-[var(--ap-tile)] pl-5 pr-2">
        <span className={`flex-1 truncate text-[17px] ${sent || typed === 0 ? "text-[var(--ap-faint)]" : INK}`}>{sent || typed === 0 ? "ถาม Winyu…" : question.slice(0, typed)}</span>
        <span className={`grid size-[44px] place-items-center rounded-full text-[22px] text-white ${GRADIENT_TILE}`}>↑</span>
        {tap > 0 ? <span className="absolute right-[-2px] top-[-2px] size-[62px] rounded-full bg-[var(--ap-ink)]/15" style={{ transform: `scale(${mix(0.4, 1.3, tap)})`, opacity: 1 - tap }} /> : null}
      </div>
    </div>
  );
}

function PhoneBeat({ t }: { t: number }) {
  const enter = easeInOut(t, 0, 1.8);
  const zoom = easeInOut(t, 5.8, 1.8);
  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--ap-bg)]">
      <div className="absolute inset-0 origin-[50%_52%]" style={{ transform: `scale(${mix(1, 2.7, zoom)}) translateY(${mix(0, 40, zoom)}px)` }}>
        <div className="absolute left-1/2 top-[70px]" style={{ perspective: 2200 }}>
          <div style={{ transform: `translateX(-50%) translateY(${(1 - enter) * 520}px) rotateY(${mix(-38, -6, enter)}deg) rotateX(${mix(20, 3, enter)}deg)`, opacity: clamp01(enter * 1.6) }}>
            <Phone>
              <PhoneScreen t={t} />
            </Phone>
          </div>
        </div>
      </div>
      <p className={`absolute inset-x-0 bottom-[36px] text-center text-[34px] font-medium ${MUTED}`} style={{ opacity: easeIn(t, 2.0, 0.8) * (1 - zoom) }}>
        ถามเป็นภาษาคน
      </p>
    </div>
  );
}

function NumberBeat({ t }: { t: number }) {
  const hero = partsOf(EXEC).hero;
  if (!hero) return null;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-[var(--ap-bg)] text-center">
      <p className={`text-[40px] font-medium ${MUTED}`} style={focusIn(t, 0.1, 0.7)}>
        {hero.label}
      </p>
      <p className={`font-display text-[190px] font-semibold leading-none tracking-[-0.045em] ${INK}`} style={focusIn(t, 0.3, 0.9)}>
        {hero.value}
      </p>
      <p className="text-[40px] font-semibold text-success" style={focusIn(t, 0.8, 0.7)}>
        {hero.delta} <span className={`font-medium ${MUTED}`}>{hero.detail}</span>
      </p>
      <p className={`text-[30px] ${MUTED}`} style={focusIn(t, 1.4, 0.7)}>
        อ่านสดจาก {EXEC.card.source} ณ วินาทีที่ถาม · ไม่มีตัวเลขที่ AI แต่งเอง
      </p>
    </div>
  );
}

function LaptopScreen({ t }: { t: number }) {
  const { investigation } = BOOTH;
  const lines = investigation.trace.slice(0, TRACE_LINES);
  const traceStart = 2.2;
  const traceDone = traceStart + lines.length * 0.32;
  const finding = easeIn(t, traceDone + 1.0, 0.7);
  return (
    <div className="flex h-full flex-col gap-6 p-10">
      <div className="flex items-center justify-between">
        <MiniLockup />
        <span className={`text-[18px] ${MUTED}`}>{investigation.role}</span>
      </div>
      <p className={`text-[20px] font-medium ${MUTED}`}>{investigation.ranAt}</p>
      <div className="grid flex-1 grid-cols-[1fr_1.05fr] gap-8">
        <ol className="flex flex-col gap-3">
          {lines.map((call, index) => {
            const p = easeIn(t, traceStart + index * 0.32, 0.3);
            return (
              <li key={`${call.tool}-${index}`} className="flex flex-col gap-0.5" style={{ opacity: p }}>
                <span className="text-[17px] font-semibold text-primary">{call.label}</span>
                <span className={`truncate text-[15px] ${MUTED}`}>{call.summary}</span>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-col gap-4">
          {investigation.story.ruledOut.map((cause, index) => {
            const strike = easeIn(t, traceDone + 0.2 + index * 0.35, 0.35);
            return (
              <p key={cause} className="relative w-fit text-[22px] text-[var(--ap-faint)]" style={{ opacity: easeIn(t, traceDone + index * 0.35, 0.3) }}>
                {cause}
                <span className="absolute left-0 top-1/2 h-[2px] bg-coral" style={{ width: `${strike * 100}%` }} />
              </p>
            );
          })}
          <div className={`mt-2 flex flex-col gap-3 rounded-[24px] p-7 text-white shadow-[0_30px_60px_-30px_rgb(124_58_237/60%)] ${GRADIENT_TILE}`} style={{ opacity: finding, transform: `translateY(${(1 - finding) * 20}px)` }}>
            <span className="w-fit rounded-full bg-white px-3 py-0.5 text-[16px] font-semibold text-danger">{investigation.story.kind}</span>
            <p className="text-[28px] font-semibold leading-[1.35]">{investigation.story.finding}</p>
          </div>
          {investigation.story.action ? (
            <p className={`text-[20px] leading-[1.55] ${INK}`} style={{ opacity: easeIn(t, traceDone + 1.8, 0.6) }}>
              <span className="mr-2 font-semibold text-primary">ขั้นต่อไป</span>
              {investigation.story.action}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LaptopBeat({ t }: { t: number }) {
  const rise = easeInOut(t, 0, 1.2);
  const lid = easeInOut(t, 0.5, 1.6);
  const push = easeInOut(t, 6.6, 2.2);
  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--ap-bg)]">
      <div className="absolute inset-0 origin-[72%_55%]" style={{ transform: `scale(${mix(1, 1.9, push)})` }}>
        <div className="absolute left-1/2 top-[70px]" style={{ transform: `translateX(-50%) translateY(${(1 - rise) * 300}px) scale(0.86)`, opacity: rise }}>
          <Laptop lid={lid}>
            <LaptopScreen t={t} />
          </Laptop>
        </div>
      </div>
    </div>
  );
}

function ChecksBeat({ t }: { t: number }) {
  const { investigation } = BOOTH;
  const shown = Math.round(investigation.checked * easeInOut(t, 0.2, 1.4));
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-[var(--ap-bg)] text-center">
      <p className={`font-display text-[300px] font-semibold leading-none tracking-[-0.05em] tabular-nums ${INK}`} style={focusIn(t, 0.1, 0.6)}>
        {shown}
      </p>
      <p className={`text-[44px] font-semibold ${INK}`} style={focusIn(t, 0.7, 0.7)}>
        ครั้งที่ Winyu ดูข้อมูลให้ ก่อนคุณตื่น
      </p>
      <p className={`text-[30px] ${MUTED}`} style={focusIn(t, 1.2, 0.7)}>
        {investigation.ranAt}
      </p>
    </div>
  );
}

function AnswerScreen({ role, width, scale, padding }: { role: DemoRole; width: number; scale: number; padding: string }) {
  return (
    <div className={`flex h-full flex-col gap-5 ${padding}`}>
      <div className="flex items-center justify-between">
        <MiniLockup />
        <span className={`text-[15px] ${MUTED}`}>{roleTitleOf(role)}</span>
      </div>
      <div className={`ml-auto max-w-[88%] rounded-[22px] rounded-br-md px-4 py-3 text-[17px] leading-6 text-white ${GRADIENT_TILE}`}>{role.question}</div>
      <ScaledCard parts={partsOf(role)} width={width} scale={scale} />
    </div>
  );
}

function DeviceCaption({ role }: { role: DemoRole }) {
  return (
    <div className="flex items-center justify-center gap-3">
      <span className={`text-[26px] font-semibold ${INK}`}>{role.tab}</span>
      <span className={`rounded-full bg-[var(--ap-tile)] px-4 py-1 text-[22px] ${MUTED}`}>{scopeLabel(role)}</span>
    </div>
  );
}

function TrioBeat({ t }: { t: number }) {
  const drift = mix(1, 1.04, t / 9.5);
  const laptop = easeIn(t, 0.5, 1.0);
  const tablet = easeIn(t, 1.0, 1.0);
  const phone = easeIn(t, 1.5, 1.0);
  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--ap-bg)]">
      <div className="absolute inset-x-0 top-[70px] flex flex-col items-center gap-3 text-center">
        <h2 className={`font-display text-[76px] font-semibold tracking-[-0.04em] ${INK}`} style={focusIn(t, 0.1, 0.8)}>
          หนึ่งคำถาม ทุกบทบาท
        </h2>
        <p className={`text-[32px] ${MUTED}`} style={focusIn(t, 0.5, 0.8)}>
          แต่ละคนเห็นเท่าที่ควรเห็น ตามสิทธิ์ที่ระบบบังคับในโค้ด
        </p>
      </div>
      <div className="absolute inset-0 origin-[50%_70%]" style={{ transform: `scale(${drift})` }}>
        <div className="absolute left-1/2 top-[300px] flex flex-col items-center gap-5" style={{ transform: `translateX(-50%) scale(0.52) translateY(${(1 - laptop) * 120}px)`, transformOrigin: "top center", opacity: laptop }}>
          <Laptop lid={1}>
            <AnswerScreen role={EXEC} width={820} scale={1.3} padding="p-10" />
          </Laptop>
        </div>
        <div className="absolute left-[120px] top-[500px] flex flex-col items-center gap-4" style={{ transform: `scale(0.56) translateY(${(1 - tablet) * 120}px)`, transformOrigin: "top left", opacity: tablet }}>
          <Tablet>
            <AnswerScreen role={RSM} width={700} scale={1.19} padding="p-8" />
          </Tablet>
          <div className="scale-[1.8]">
            <DeviceCaption role={RSM} />
          </div>
        </div>
        <div className="absolute right-[200px] top-[430px] flex flex-col items-center gap-4" style={{ transform: `scale(0.6) translateY(${(1 - phone) * 120}px)`, transformOrigin: "top right", opacity: phone }}>
          <Phone>
            <AnswerScreen role={REP} width={420} scale={0.876} padding="px-4 pt-16" />
          </Phone>
          <div className="scale-[1.6]">
            <DeviceCaption role={REP} />
          </div>
        </div>
        <div className="absolute left-1/2 top-[748px] -translate-x-1/2" style={{ opacity: laptop }}>
          <DeviceCaption role={EXEC} />
        </div>
      </div>
    </div>
  );
}

function BentoTile({ t, at, className = "", children }: { t: number; at: number; className?: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col justify-between overflow-hidden rounded-[40px] bg-[var(--ap-tile)] p-10 ${className}`} style={focusIn(t, at, 0.8)}>
      {children}
    </div>
  );
}

function TileLabel({ children }: { children: ReactNode }) {
  return <p className={`text-[26px] font-semibold ${MUTED}`}>{children}</p>;
}

function BentoBeat({ t }: { t: number }) {
  const { chips, memory, suggestion, anomaly, forecast } = BOOTH;
  const firstChip = chips.items[0];
  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--ap-bg)]">
      <h2 className={`absolute inset-x-0 top-[64px] text-center font-display text-[72px] font-semibold tracking-[-0.04em] ${INK}`} style={focusIn(t, 0.1, 0.8)}>
        ยิ่งใช้ ยิ่งรู้ใจ
      </h2>
      <div className="absolute inset-x-[100px] bottom-[70px] top-[210px] grid grid-cols-3 grid-rows-2 gap-6">
        <BentoTile t={t} at={0.7} className="col-span-2">
          <TileLabel>เรียนรู้สิ่งที่คุณถามบ่อย · {chips.role}</TileLabel>
          <div className="flex flex-wrap gap-3">
            {chips.items.slice(0, 3).map((chip, index) => (
              <span key={chip.label} className={`rounded-full px-6 py-3 text-[28px] font-semibold ${index === 0 ? `text-white ${GRADIENT_TILE}` : `bg-white ${INK}`}`}>
                {chip.label}
              </span>
            ))}
          </div>
          <p className={`font-display text-[56px] font-semibold leading-tight tracking-[-0.03em] ${INK}`}>{firstChip.reason}</p>
        </BentoTile>
        <BentoTile t={t} at={1.2}>
          <TileLabel>จำสิ่งที่คุณสนใจ</TileLabel>
          <p className={`font-display text-[110px] font-semibold leading-none tracking-[-0.04em] ${INK}`}>{memory.facts.length} เรื่อง</p>
          <div className="flex flex-col gap-2">
            {memory.facts.slice(0, 2).map((fact) => (
              <p key={fact.value} className={`flex items-center gap-2 text-[22px] ${INK}`}>
                <Check className="size-6 shrink-0 text-success" strokeWidth={3} aria-hidden />
                <span className="truncate">{fact.value}</span>
              </p>
            ))}
          </div>
        </BentoTile>
        <BentoTile t={t} at={1.7}>
          <TileLabel>{suggestion.badge}</TileLabel>
          <p className={`font-display text-[46px] font-semibold leading-tight tracking-[-0.03em] ${INK}`}>{suggestion.card.title}</p>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-5 py-2 text-[24px] font-semibold text-white ${GRADIENT_TILE}`}>{suggestion.keep}</span>
            <span className={`text-[20px] ${MUTED}`}>{suggestion.reason}</span>
          </div>
        </BentoTile>
        <BentoTile t={t} at={2.2}>
          <TileLabel>เห็นก่อนเป็นปัญหา · {anomaly.severity}</TileLabel>
          <p className="font-display text-[130px] font-semibold leading-none tracking-[-0.05em] text-danger">−{anomaly.gap}</p>
          <p className={`text-[24px] leading-snug ${INK}`}>{anomaly.scope}</p>
        </BentoTile>
        <BentoTile t={t} at={2.7}>
          <TileLabel>มองไปข้างหน้า</TileLabel>
          <p className={`font-display text-[88px] font-semibold leading-none tracking-[-0.04em] ${INK}`}>{forecast.card.hero?.value}</p>
          <p className={`text-[22px] leading-snug ${MUTED}`}>
            {forecast.card.title}
            <br />
            {forecast.card.hero?.detail}
          </p>
        </BentoTile>
      </div>
    </div>
  );
}

function EndBeat({ t }: { t: number }) {
  const fade = easeInOut(t, 4.6, 1.2);
  return (
    <div className="absolute inset-0 grid place-items-center bg-[var(--ap-bg)]">
      <div className="flex flex-col items-center gap-12" style={{ opacity: 1 - fade }}>
        <span className={`inline-flex items-center gap-[0.22em] font-display text-[150px] font-bold leading-none tracking-[-0.04em] ${INK}`} style={focusIn(t, 0.2, 1.0)}>
          <span className={`grid size-[1.2em] place-items-center rounded-[0.3em] text-white shadow-[0_40px_80px_-30px_rgb(124_58_237/60%)] ${GRADIENT_TILE}`}>
            <BrandMark draw={easeIn(t, 0.5, 1.1)} className="size-[0.8em]" />
          </span>
          Winyu
        </span>
        <p className={`text-[48px] font-semibold ${INK}`} style={focusIn(t, 1.2, 0.9)}>
          ผู้ช่วยที่รู้ใจ <span className="gradient-text">ทั้งองค์กร</span>
        </p>
      </div>
    </div>
  );
}

function BeatView({ id, t }: { id: BeatId; t: number }) {
  if (id === "ask-word") return <WordBeat t={t} word="ถาม." />;
  if (id === "phone") return <PhoneBeat t={t} />;
  if (id === "number") return <NumberBeat t={t} />;
  if (id === "know-word") return <WordBeat t={t} word="รู้." />;
  if (id === "laptop") return <LaptopBeat t={t} />;
  if (id === "checks") return <ChecksBeat t={t} />;
  if (id === "trio") return <TrioBeat t={t} />;
  if (id === "act-word") return <WordBeat t={t} word="ทำ." />;
  if (id === "bento") return <BentoBeat t={t} />;
  return <EndBeat t={t} />;
}

/** The Apple-style cut at time t on a fixed 1920×1080 stage, scaled by `scale` to fit the screen. */
export function AppleStage({ t, scale }: { t: number; scale: number }) {
  return (
    <div className="booth-apple relative origin-top-left overflow-hidden bg-[var(--ap-bg)]" style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, transform: `scale(${scale})` }}>
      {APPLE_SEQUENCE.at(t).map((beat) => (
        <div key={beat.id} className="absolute inset-0" style={{ opacity: clamp01(beat.opacity) }}>
          <BeatView id={beat.id} t={beat.local} />
        </div>
      ))}
    </div>
  );
}
