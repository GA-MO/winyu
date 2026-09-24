import { ArrowRight, Check } from "lucide-react";
import { CardPartsView } from "@/components/cards/card-parts";
import { SpecView } from "vexa/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { NAV } from "./content";
import { DEMO_ROLES, SYSTEMS, scopeText, stepsOf, type DemoRole } from "./hero-demo";
import { GlowBlobs, Logo } from "./ui";

export function TopNav() {
  return (
    <nav className="pointer-events-none sticky top-[calc(env(safe-area-inset-top,0px)+12px)] z-30 -mb-[76px] px-4 sm:px-8">
      <div className="pointer-events-auto mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 rounded-full border border-white/70 bg-white/80 pl-5 pr-2.5 text-foreground shadow-[0_10px_40px_-18px_rgb(17_18_24/35%)] backdrop-blur-xl">
        <a href="#top" aria-label="Cop หน้าแรก">
          <Logo />
        </a>
        <div className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="transition-colors hover:text-foreground">
              {item.label}
            </a>
          ))}
        </div>
        <a href="#start" className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5">
          คุยกับทีมเรา
        </a>
      </div>
    </nav>
  );
}


const TYPE_MS = 34;
const STEP_MS = 420;
const ROTATE_MS = 7500;


type DemoState = { index: number; typed: number; steps: number; card: boolean };

function restingState(index: number): DemoState {
  return { index, typed: DEMO_ROLES[index].question.length, steps: stepsOf(DEMO_ROLES[index]).length, card: true };
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useHeroDemo() {
  const [state, setState] = useState<DemoState>(() => restingState(0));
  const [auto, setAuto] = useState(true);
  const timers = useRef<number[]>([]);

  const clear = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);

  const play = useCallback(
    (index: number) => {
      clear();
      if (prefersReducedMotion()) {
        setState(restingState(index));
        return;
      }
      const role = DEMO_ROLES[index];
      const steps = stepsOf(role).length;
      setState({ index, typed: 0, steps: 0, card: false });
      const typingEnd = role.question.length * TYPE_MS;
      for (let char = 1; char <= role.question.length; char += 1) {
        timers.current.push(window.setTimeout(() => setState((prev) => ({ ...prev, typed: char })), char * TYPE_MS));
      }
      for (let step = 1; step <= steps; step += 1) {
        timers.current.push(window.setTimeout(() => setState((prev) => ({ ...prev, steps: step })), typingEnd + step * STEP_MS));
      }
      timers.current.push(window.setTimeout(() => setState((prev) => ({ ...prev, card: true })), typingEnd + (steps + 1) * STEP_MS));
    },
    [clear],
  );

  useEffect(() => {
    if (!auto || !state.card || prefersReducedMotion()) return;
    const id = window.setTimeout(() => play((state.index + 1) % DEMO_ROLES.length), ROTATE_MS);
    return () => window.clearTimeout(id);
  }, [auto, state.card, state.index, play]);

  useEffect(() => clear, [clear]);

  const choose = useCallback(
    (index: number) => {
      setAuto(false);
      play(index);
    },
    [play],
  );

  return { state, choose };
}

function RoleTabs({ active, onChoose }: { active: number; onChoose: (index: number) => void }) {
  return (
    <div role="tablist" aria-label="ดูในมุมของ" className="inline-flex rounded-full bg-white/15 p-1 ring-1 ring-white/30 backdrop-blur">
      {DEMO_ROLES.map((role, index) => (
        <button
          key={role.id}
          type="button"
          role="tab"
          aria-selected={index === active}
          onClick={() => onChoose(index)}
          className={`rounded-full px-3 py-2 text-[13px] font-medium transition-colors sm:px-5 sm:text-sm ${index === active ? "bg-white text-foreground shadow-[0_6px_20px_-8px_rgb(17_18_24/50%)]" : "text-white/85 hover:text-white"}`}
        >
          {role.tab}
        </button>
      ))}
    </div>
  );
}

function SystemPills({ role, reading }: { role: DemoRole; reading: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-medium text-white/80">Cop อ่านสดจาก</span>
      {SYSTEMS.map((system) => {
        const live = reading && system === role.card.source;
        return (
          <span
            key={system}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] ring-1 backdrop-blur transition-all duration-300 ${live ? "bg-white text-foreground ring-white shadow-[0_0_30px_rgb(255_255_255/60%)]" : "bg-white/10 text-white ring-white/25"}`}
          >
            <span className={`size-1.5 rounded-full ${live ? "animate-pulse bg-success" : "bg-white/60"}`} />
            {system}
          </span>
        );
      })}
    </div>
  );
}

function Conversation({ role, state }: { role: DemoRole; state: DemoState }) {
  const typing = state.typed < role.question.length;
  return (
    <div className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-[linear-gradient(135deg,var(--color-primary),var(--color-violet))] px-4 py-3 text-[15px] leading-6 text-white shadow-lift">
        {role.question.slice(0, state.typed)}
        {typing ? <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-white" /> : null}
      </div>
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <span className="grid size-5 place-items-center rounded-md bg-[linear-gradient(135deg,var(--color-primary),var(--color-violet)_55%,var(--color-coral))]">
            <span className="size-2 rounded-full border-2 border-white" />
          </span>
          Cop กำลังตรวจก่อนตอบ
        </p>
        <ol className="flex flex-col gap-2.5">
          {stepsOf(role).map((step, index) => {
            const done = index < state.steps;
            return (
              <li key={step} className={`flex items-center gap-2.5 text-sm transition-all duration-300 ${done ? "opacity-100" : "translate-x-1 opacity-25"}`}>
                <span className={`grid size-5 shrink-0 place-items-center rounded-full transition-colors ${done ? "bg-success text-white" : "bg-hairline text-transparent"}`}>
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                </span>
                {step}
              </li>
            );
          })}
        </ol>
      </div>
      <div className={`overflow-hidden rounded-xl bg-foreground p-4 font-mono text-[12px] leading-6 text-white/75 transition-all duration-500 ${state.steps >= 2 ? "opacity-100" : "opacity-0"}`}>
        <p className="mb-1 font-sans text-[11px] font-medium text-white/50">query ที่ Cop ส่งออกไป</p>
        {role.card.request.map((line) => (
          <p key={line.key}>{line.key}: <span className="text-white">{line.value}</span></p>
        ))}
        <p className="-mx-2 flex flex-wrap items-center justify-between gap-x-3 rounded-md bg-white/10 px-2">
          <span>scope: <span className="text-emerald-300">{scopeText(role)}</span></span>
          <span className="font-sans text-[11px] text-emerald-300">ใส่โดย Cop</span>
        </p>
      </div>
    </div>
  );
}

function AnswerCard({ role, shown }: { role: DemoRole; shown: boolean }) {
  return (
    <div className={`m-3 text-left transition-all duration-500 sm:m-4 [&>section]:shadow-[0_1px_2px_rgb(79_70_229/6%),0_30px_60px_-34px_rgb(79_70_229/45%)] ${shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}>
      {role.card.view.kind === "parts" ? <CardPartsView parts={role.card.view.parts} /> : <SpecView spec={role.card.view.spec} showDevtools={false} />}
    </div>
  );
}

function Stage({ state, onChoose }: { state: DemoState; onChoose: (index: number) => void }) {
  const role = DEMO_ROLES[state.index];
  const reading = state.steps >= 3 && !state.card;
  return (
    <div className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#4338ca_0%,#6d28d9_45%,#db2777_85%,#fb7185_100%)] p-3 shadow-[0_50px_100px_-40px_rgb(109_40_217/60%)] sm:rounded-[40px] sm:p-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(255_255_255/18%)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-32 size-[28rem] rounded-full bg-white/20 blur-[100px]" />
      <div className="relative flex flex-col gap-6">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-4 lg:justify-between">
          <RoleTabs active={state.index} onChoose={onChoose} />
          <div className="hidden sm:block">
            <SystemPills role={role} reading={reading} />
          </div>
        </div>
        <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-[22px] border border-white/60 bg-paper/95 text-left shadow-[0_30px_80px_-30px_rgb(17_18_24/55%)] backdrop-blur">
          <div className="flex items-center gap-3 border-b border-hairline bg-white/80 px-4 py-3">
            <span className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-[#ff5f57]" />
              <span className="size-2.5 rounded-full bg-[#febc2e]" />
              <span className="size-2.5 rounded-full bg-[#28c840]" />
            </span>
            <span className="font-mono text-xs text-muted-foreground">cop.app</span>
            <span className="ml-auto truncate rounded-full bg-primary/8 px-3 py-1 text-xs font-medium text-primary">{role.card.who}</span>
          </div>
          <div className="grid md:grid-cols-[0.9fr_1.1fr]">
            <Conversation role={role} state={state} />
            <div className="relative">
              <div aria-hidden className={`absolute inset-3 flex flex-col gap-4 rounded-[20px] border border-dashed border-primary/25 bg-white/50 p-6 transition-opacity duration-300 sm:inset-4 ${state.card ? "opacity-0" : "opacity-100"}`}>
                <span className="h-3 w-1/2 animate-pulse rounded-full bg-primary/10" />
                <span className="h-9 w-1/3 animate-pulse rounded-lg bg-primary/10" />
                {[88, 72, 64, 52, 40].map((width) => (
                  <span key={width} className="h-2 animate-pulse rounded-full bg-primary/10" style={{ width: `${width}%` }} />
                ))}
              </div>
              <AnswerCard role={role} shown={state.card} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function revealFully(element: HTMLElement | null) {
  if (!element) return;
  const box = element.getBoundingClientRect();
  if (box.top >= 0 && box.bottom <= window.innerHeight) return;
  element.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
}

export function Hero() {
  const { state, choose } = useHeroDemo();
  const stageRef = useRef<HTMLDivElement>(null);
  const chooseAndReveal = useCallback(
    (index: number) => {
      choose(index);
      revealFully(stageRef.current);
    },
    [choose],
  );
  return (
    <header id="top" className="relative overflow-hidden bg-paper px-4 pb-20 pt-28 text-foreground sm:px-8 sm:pb-28 sm:pt-32">
      <GlowBlobs />
      <div aria-hidden className="grid-fade absolute inset-0" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-6 text-center">
        <p className="rounded-full border border-primary/15 bg-white/70 px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-primary backdrop-blur">
          The AI copilot for your whole organization
        </p>
        <h1 className="font-display text-[2.9rem] font-medium leading-[1.02] tracking-[-0.045em] sm:text-[4.2rem] lg:text-[4.9rem]">
          <span className="inline-block">One question.</span>
          <br />
          <span className="gradient-text"><span className="inline-block">The right answer</span> <span className="inline-block">for every role.</span></span>
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
          ตั้งแต่ CEO ถึงพนักงานขาย Cop ตอบจากระบบเดิมขององค์กรตามขอบเขตที่แต่ละคนดูแล อ่านสด ณ วินาทีที่ถาม โดยไม่ย้ายข้อมูลออกมาเก็บเอง
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a href="#connect" className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3.5 text-sm font-semibold text-white shadow-lift transition-transform hover:-translate-y-0.5">
            ดูวิธีเชื่อมต่อ
            <ArrowRight className="size-4" aria-hidden />
          </a>
          <a href="#architecture" className="inline-flex items-center gap-2 rounded-full border border-hairline bg-white px-6 py-3.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/30">
            ดูสถาปัตยกรรม
          </a>
        </div>
        <div ref={stageRef} className="mt-6 w-full">
          <Stage state={state} onChoose={chooseAndReveal} />
          <p className="mt-4 text-xs text-muted-foreground">ตัวอย่างจากเดโม ข้อมูลสมมติ · สลับบทบาทบนแถบสีเพื่อดูว่าแต่ละคนเห็นอะไร</p>
        </div>
        <dl className="mt-6 grid w-full max-w-3xl grid-cols-1 divide-y divide-hairline rounded-2xl border border-hairline bg-white/70 backdrop-blur sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="px-6 py-5">
            <dt className="text-xs text-muted-foreground">ข้อมูลธุรกิจที่ Cop เก็บ</dt>
            <dd className="mt-1 font-display text-2xl font-medium">0 แถว</dd>
          </div>
          <div className="px-6 py-5">
            <dt className="text-xs text-muted-foreground">ทางเชื่อมต่อ</dt>
            <dd className="mt-1 whitespace-nowrap font-display text-2xl font-medium">SQL · REST · MCP</dd>
          </div>
          <div className="px-6 py-5">
            <dt className="text-xs text-muted-foreground">ตัวเลขที่ AI แต่งเอง</dt>
            <dd className="mt-1 font-display text-2xl font-medium">ไม่มี</dd>
          </div>
        </dl>
      </div>
    </header>
  );
}
