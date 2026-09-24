import { ArrowDownRight, ArrowRight, Inbox, Pin } from "lucide-react";
import type { ReactNode } from "react";
import { SectionHeader } from "./ui";

const SPARK = [42, 45, 44, 48, 47, 51, 50, 53, 52, 55, 54, 41];
const SPARK_W = 320;
const SPARK_H = 120;
const SPARK_MAX = 60;
const SPARK_MIN = 30;

function sparkPoint(value: number, index: number) {
  const x = (index / (SPARK.length - 1)) * (SPARK_W - 24) + 12;
  const y = SPARK_H - 14 - ((value - SPARK_MIN) / (SPARK_MAX - SPARK_MIN)) * (SPARK_H - 28);
  return { x, y };
}

function Tile({ title, body, children, className = "" }: { title: string; body: string; children: ReactNode; className?: string }) {
  return (
    <article className={`group flex flex-col gap-6 rounded-[28px] border border-hairline bg-surface p-3 shadow-lift transition-transform duration-300 hover:-translate-y-1 ${className}`}>
      <div className="relative flex min-h-56 flex-1 items-center justify-center overflow-hidden rounded-[22px] bg-[linear-gradient(160deg,#f3f2ff,#faf5ff_55%,#fff1f3)] p-6">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(rgb(79_70_229/9%)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        <div className="relative w-full">{children}</div>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4">
        <h3 className="font-display text-xl font-medium tracking-[-0.02em]">{title}</h3>
        <p className="leading-7 text-muted-foreground">{body}</p>
      </div>
    </article>
  );
}

function AnswerVisual() {
  const rows = [
    { label: "เชียงใหม่", width: 92, value: "−2.1%", bad: false },
    { label: "เชียงราย", width: 62, value: "−11.8%", bad: true },
    { label: "นครสวรรค์", width: 51, value: "−9.2%", bad: true },
  ];
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-hairline bg-white p-5 shadow-[0_24px_50px_-30px_rgb(79_70_229/50%)] transition-transform duration-500 group-hover:-rotate-1 group-hover:scale-[1.02]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">ยอดขายเข้า ภาคเหนือ</p>
          <p className="mt-1 font-display text-3xl font-semibold tracking-tight">4.82<span className="ml-1 text-sm font-medium text-muted-foreground">ล้านลิตร</span></p>
        </div>
        <span className="inline-flex items-center gap-0.5 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger"><ArrowDownRight className="size-3.5" aria-hidden />6.4%</span>
      </div>
      <ul className="mt-4 flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.label} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-2 text-xs">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="h-1.5 rounded-full bg-hairline"><span className={`block h-full rounded-full ${row.bad ? "bg-danger" : "bg-primary"}`} style={{ width: `${row.width}%` }} /></span>
            <span className={`text-right tabular-nums ${row.bad ? "text-danger" : "text-muted-foreground"}`}>{row.value}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        <span className="rounded-full bg-foreground px-3 py-1 text-[11px] font-medium text-white">ดูเอเย่นต์ในเชียงราย</span>
        <span className="rounded-full border border-hairline px-3 py-1 text-[11px] font-medium">ส่งต่อ</span>
      </div>
    </div>
  );
}

function DashboardVisual() {
  const tiles = [
    { label: "Sell-in", value: "4.82M", urgent: true },
    { label: "Stock cover", value: "18 วัน", urgent: false },
    { label: "เป้าเดือนนี้", value: "92.6%", urgent: false },
  ];
  return (
    <div className="mx-auto grid w-full max-w-xs grid-cols-2 gap-2.5">
      {tiles.map((tile) => (
        <div key={tile.label} className={`relative rounded-xl bg-white p-3 shadow-[0_10px_24px_-18px_rgb(79_70_229/60%)] ${tile.urgent ? "col-span-2 ring-2 ring-danger/40" : "ring-1 ring-hairline"}`}>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {tile.urgent ? <Pin className="size-3 text-primary" aria-hidden /> : null}
            {tile.label}
          </p>
          <p className="mt-0.5 font-display text-lg font-semibold tabular-nums">{tile.value}</p>
          {tile.urgent ? <span className="absolute right-3 top-3 rounded-full bg-danger px-2 py-0.5 text-[10px] font-semibold text-white">ต้องดูด่วน</span> : null}
        </div>
      ))}
    </div>
  );
}

function AnomalyVisual() {
  const points = SPARK.map(sparkPoint);
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const beforeLast = points[points.length - 2];
  const bandTop = sparkPoint(58, SPARK.length - 1).y;
  const bandBottom = sparkPoint(50, SPARK.length - 1).y;
  return (
    <div className="mx-auto w-full max-w-xs rounded-2xl bg-white p-4 shadow-[0_18px_40px_-28px_rgb(79_70_229/60%)] ring-1 ring-hairline">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">Sell-out · เชียงราย</span>
        <span className="rounded-full bg-danger/10 px-2 py-0.5 font-semibold text-danger">−18% จากแนวโน้ม</span>
      </div>
      <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} className="mt-2 w-full" role="img" aria-label="ยอดขายหลุดจากแนวโน้มในสัปดาห์ล่าสุด">
        <defs>
          <linearGradient id="bento-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4f46e5" stopOpacity="0.18" />
            <stop offset="1" stopColor="#4f46e5" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`${beforeLast.x},${sparkPoint(55, SPARK.length - 2).y} ${last.x},${bandTop} ${last.x},${bandBottom} ${beforeLast.x},${sparkPoint(53, SPARK.length - 2).y}`} fill="#7c3aed" fillOpacity="0.12" />
        <path d={`${line} L${last.x} ${SPARK_H} L${points[0].x} ${SPARK_H} Z`} fill="url(#bento-area)" />
        <path d={line} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <line x1={beforeLast.x} y1={beforeLast.y} x2={last.x} y2={(bandTop + bandBottom) / 2} stroke="#7c3aed" strokeWidth="2" strokeDasharray="4 4" />
        <circle cx={last.x} cy={last.y} r="10" fill="#e11d48" fillOpacity="0.15" className="animate-pulse" />
        <circle cx={last.x} cy={last.y} r="4.5" fill="#e11d48" />
      </svg>
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className="h-0.5 w-4 rounded bg-violet [background-image:linear-gradient(90deg,#7c3aed_50%,transparent_50%)] [background-size:6px_2px]" />พยากรณ์ · <span className="text-foreground">เจ้าของเรื่อง: ผู้จัดการภาคเหนือ</span></p>
    </div>
  );
}

function HandoffVisual() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-stretch gap-3 sm:flex-row sm:items-center">
      <div className="flex shrink-0 items-center gap-2 sm:flex-col">
        <span className="grid size-11 place-items-center rounded-full bg-[linear-gradient(135deg,#4f46e5,#7c3aed)] text-sm font-semibold text-white">ผจ</span>
        <span className="text-[11px] text-muted-foreground">ผู้จัดการภาค</span>
      </div>
      <ArrowRight className="hidden size-4 shrink-0 text-primary sm:block" aria-hidden />
      <div className="flex-1 rounded-2xl bg-white p-4 shadow-[0_18px_40px_-28px_rgb(79_70_229/60%)] ring-1 ring-hairline">
        <p className="text-[11px] font-semibold text-primary">ส่งต่อพร้อมบริบท</p>
        <p className="mt-1 text-sm font-medium leading-6">ยอดเชียงรายตก 11.8% ช่วยเยี่ยม 3 เอเย่นต์นี้ก่อนศุกร์</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-md bg-paper px-2 py-0.5 text-[10px] text-muted-foreground ring-1 ring-hairline">การ์ดยอดขาย</span>
          <span className="rounded-md bg-paper px-2 py-0.5 text-[10px] text-muted-foreground ring-1 ring-hairline">รายชื่อเอเย่นต์</span>
        </div>
      </div>
      <ArrowRight className="hidden size-4 shrink-0 text-primary sm:block" aria-hidden />
      <div className="flex shrink-0 items-center gap-2 sm:flex-col">
        <span className="relative grid size-11 place-items-center rounded-full bg-[linear-gradient(135deg,#db2777,#fb7185)] text-sm font-semibold text-white">
          ขย
          <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-foreground text-white ring-2 ring-white"><Inbox className="size-3" aria-hidden /></span>
        </span>
        <span className="text-[11px] text-muted-foreground">พนักงานขาย</span>
      </div>
    </div>
  );
}

export function CapabilitiesBento() {
  return (
    <div className="flex flex-col items-center gap-14">
      <div className="flex flex-col items-center text-center [&_header]:items-center">
        <SectionHeader
          eyebrow="What Cop does"
          title={<>Answers you can act on,<br /> <span className="gradient-text">not reports to read.</span></>}
          lead="ทุกคนตั้งแต่ CEO ถึงพนักงานขายเข้ามาด้วยบัญชีของตัวเอง เห็นข้อมูลเฉพาะขอบเขตที่ดูแล และได้คำตอบเป็นการ์ดที่บอกว่าควรทำอะไรต่อ"
        />
      </div>
      <div className="grid w-full gap-5 lg:grid-cols-5">
        <Tile className="lg:col-span-3" title="Answers, not reports" body="ตัวเลขหลัก ส่วนต่างที่มีสี และสิ่งที่ควรทำต่อ อยู่ในการ์ดใบเดียว ไม่ต้องอ่านย่อหน้ายาว">
          <AnswerVisual />
        </Tile>
        <Tile className="lg:col-span-2" title="A dashboard that arranges itself" body="เริ่มจากการ์ดตามบทบาท แล้วปรับตามสิ่งที่แต่ละคนถามบ่อย การ์ดที่ต้องดูด่วนขึ้นก่อนเสมอ">
          <DashboardVisual />
        </Tile>
        <Tile className="lg:col-span-2" title="See anomalies first" body="จับยอดที่หลุดจากแนวโน้ม พยากรณ์สัปดาห์ถัดไป และบอกว่าใครเป็นเจ้าของเรื่อง">
          <AnomalyVisual />
        </Tile>
        <Tile className="lg:col-span-3" title="Hand work to the right person" body="ส่งบริบททั้งหมดไปถึงคนถัดไปใน Inbox ของ Cop ไม่ต้องอธิบายซ้ำทางไลน์หรืออีเมล">
          <HandoffVisual />
        </Tile>
      </div>
    </div>
  );
}
