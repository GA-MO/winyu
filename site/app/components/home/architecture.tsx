import { DOORS, STATUS_LABEL, type Status } from "./content";

const ROLES = ["ผู้บริหาร", "ผู้อำนวยการฝ่ายขาย", "ผู้จัดการภาค", "พนักงานขาย"];

const LAYERS = [
  { title: "ตัวตนและสิทธิ์", sub: "รู้ว่าใครถาม และเห็นอะไรได้บ้าง" },
  { title: "Semantic layer", sub: "นิยาม metric ชุดเดียว ทั้งแชทและแดชบอร์ด" },
  { title: "บังคับขอบเขต", sub: "ใส่ขอบเขตใน query · กรองแถว · ปิดฟิลด์" },
  { title: "Audit", sub: "บันทึกทุกการเรียก พร้อมเหตุผล" },
];

const SYSTEMS = [
  { title: "คลังข้อมูล / BI", sub: "ERP อ่านผ่านที่นี่" },
  { title: "API gateway", sub: "HR · LMS · SFA · ระบบลา" },
  { title: "MCP server", sub: "ของ vendor หรือครอบ API" },
];

type Palette = {
  frame: string;
  node: string;
  nodeLine: string;
  doorLine: string;
  inset: string;
  insetLine: string;
  system: string;
  systemLine: string;
  core: string;
  coreGlow: number;
  edgeBase: string;
  title: string;
  body: string;
  role: string;
  tech: string;
  note: string;
  status: Record<Status, string>;
};

const PALETTES: Record<"light" | "dark", Palette> = {
  light: {
    frame: "border border-hairline bg-surface shadow-lift",
    node: "#ffffff",
    nodeLine: "#e3e6f0",
    doorLine: "#d9ddf0",
    inset: "#f7f8fc",
    insetLine: "#e6e9f2",
    system: "#fbfbfe",
    systemLine: "#c9cee0",
    core: "#ffffff",
    coreGlow: 0.1,
    edgeBase: "#e6e9f2",
    title: "#0b0c14",
    body: "#5b6178",
    role: "#1f2433",
    tech: "#4f46e5",
    note: "#7c3aed",
    status: { ready: "#059669", adapter: "#4f46e5", planned: "#d97706" },
  },
  dark: {
    frame: "border border-night-line bg-night-raised/70 backdrop-blur",
    node: "#1a1b24",
    nodeLine: "rgb(255 255 255 / 12%)",
    doorLine: "rgb(255 255 255 / 16%)",
    inset: "rgb(255 255 255 / 4%)",
    insetLine: "rgb(255 255 255 / 9%)",
    system: "rgb(255 255 255 / 3%)",
    systemLine: "rgb(255 255 255 / 18%)",
    core: "#15161f",
    coreGlow: 0.3,
    edgeBase: "rgb(255 255 255 / 10%)",
    title: "#ffffff",
    body: "#a1a4b8",
    role: "#e5e7f5",
    tech: "#a5b4fc",
    note: "#c4b5fd",
    status: { ready: "#34d399", adapter: "#a5b4fc", planned: "#fcd34d" },
  },
};

const DOOR_X = 800;
const SYSTEM_X = 1010;
const COLUMN_W = 170;
const ROW_H = 96;
const ROW_Y = [90, 252, 414];
const CORE_RIGHT = 720;
const CORE_MID = 300;
const LAYER_Y = [136, 228, 320, 412];

function centerOf(y: number) {
  return y + ROW_H / 2;
}

function Edge({ d, base }: { d: string; base: string }) {
  return (
    <>
      <path d={d} fill="none" stroke={base} strokeWidth={2} />
      <path d={d} fill="none" stroke="url(#cop-edge)" strokeWidth={2} strokeDasharray="6 6" className="animate-flow" />
    </>
  );
}

/** How Cop sits between people and the systems of record: identity in, three doors out, nothing stored. */
export function ArchitectureDiagram({ tone = "light" }: { tone?: "light" | "dark" }) {
  const p = PALETTES[tone];
  return (
    <figure className={`not-prose overflow-x-auto rounded-3xl p-3 sm:p-5 ${p.frame}`}>
      <svg viewBox="0 0 1200 600" role="img" aria-labelledby="cop-arch-title" className="w-full min-w-[720px] font-sans">
        <title id="cop-arch-title">สถาปัตยกรรม Cop: ผู้ใช้ถามผ่าน Cop ซึ่งตรวจสิทธิ์แล้วอ่านข้อมูลจากระบบเดิมผ่านสามทาง</title>
        <defs>
          <linearGradient id="cop-edge" x1="0" x2="1">
            <stop offset="0" stopColor="#818cf8" />
            <stop offset="0.6" stopColor="#c084fc" />
            <stop offset="1" stopColor="#fb7185" />
          </linearGradient>
          <linearGradient id="cop-core" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6366f1" />
            <stop offset="0.5" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#fb7185" />
          </linearGradient>
          <radialGradient id="cop-core-glow" cx="0.5" cy="0.45" r="0.6">
            <stop offset="0" stopColor="#7c3aed" stopOpacity={p.coreGlow} />
            <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
          </radialGradient>
        </defs>

        <Edge base={p.edgeBase} d={`M224 75 C 290 75, 290 ${LAYER_Y[0] + 38}, 344 ${LAYER_Y[0] + 38}`} />
        <Edge base={p.edgeBase} d="M224 310 C 272 310, 276 300, 320 300" />
        {ROW_Y.map((y) => (
          <Edge key={`core-${y}`} base={p.edgeBase} d={`M${CORE_RIGHT} ${CORE_MID} C 764 ${CORE_MID}, 756 ${centerOf(y)}, ${DOOR_X} ${centerOf(y)}`} />
        ))}
        {ROW_Y.map((y) => (
          <Edge key={`sys-${y}`} base={p.edgeBase} d={`M${DOOR_X + COLUMN_W} ${centerOf(y)} L${SYSTEM_X} ${centerOf(y)}`} />
        ))}

        <g>
          <rect x="24" y="40" width="200" height="70" rx="16" fill={p.node} stroke={p.nodeLine} />
          <text x="44" y="70" fill={p.title} fontSize="15" fontWeight="600">SSO · Entra ID / AD</text>
          <text x="44" y="92" fill={p.body} fontSize="12">บทบาท · ภาค · แบรนด์</text>
        </g>

        <g>
          <rect x="24" y="160" width="200" height="300" rx="20" fill={p.node} stroke={p.nodeLine} />
          <text x="44" y="192" fill={p.title} fontSize="15" fontWeight="600">คนในองค์กร</text>
          {ROLES.map((role, index) => (
            <g key={role}>
              <rect x="40" y={210 + index * 52} width="168" height="40" rx="12" fill={p.inset} stroke={p.insetLine} />
              <text x="56" y={235 + index * 52} fill={p.role} fontSize="13">{role}</text>
            </g>
          ))}
          <text x="44" y="442" fill={p.body} fontSize="12">เห็นเฉพาะขอบเขตของตัวเอง</text>
        </g>
        <text x="236" y="292" fill={p.body} fontSize="11">ถามเป็นภาษาไทย</text>

        <g>
          <rect x="300" y="20" width="440" height="560" rx="40" fill="url(#cop-core-glow)" />
          <rect x="320" y="40" width="400" height="520" rx="28" fill={p.core} stroke="url(#cop-core)" strokeWidth="1.5" />
          <text x="344" y="86" fill={p.title} fontSize="26" fontWeight="700" fontFamily="Inter, sans-serif">Cop</text>
          <text x="410" y="86" fill={p.body} fontSize="13">ไม่เก็บข้อมูลธุรกิจ อ่านสดทุกครั้ง</text>
          {LAYERS.map((layer, index) => (
            <g key={layer.title}>
              <rect x="344" y={LAYER_Y[index]} width="352" height="76" rx="16" fill={p.inset} stroke={p.insetLine} />
              <circle cx="368" cy={LAYER_Y[index] + 38} r="5" fill="url(#cop-core)" />
              <text x="386" y={LAYER_Y[index] + 33} fill={p.title} fontSize="15" fontWeight="600">{layer.title}</text>
              <text x="386" y={LAYER_Y[index] + 55} fill={p.body} fontSize="12">{layer.sub}</text>
            </g>
          ))}
          <text x="520" y="530" fill={p.note} fontSize="13" textAnchor="middle">AI เลือกคำถาม · Cop วาดตัวเลขจากผลจริง</text>
        </g>

        {DOORS.map((door, index) => (
          <g key={door.id}>
            <rect x={DOOR_X} y={ROW_Y[index]} width={COLUMN_W} height={ROW_H} rx="16" fill={p.node} stroke={p.doorLine} />
            <text x={DOOR_X + 18} y={ROW_Y[index] + 30} fill={p.title} fontSize="15" fontWeight="600">{door.name}</text>
            <text x={DOOR_X + 18} y={ROW_Y[index] + 51} fill={p.tech} fontSize="10.5" fontFamily="JetBrains Mono, monospace">{door.tech}</text>
            <circle cx={DOOR_X + 22} cy={ROW_Y[index] + 72} r="3.5" fill={p.status[door.status]} />
            <text x={DOOR_X + 32} y={ROW_Y[index] + 76} fill={p.body} fontSize="11">{STATUS_LABEL[door.status]}</text>
          </g>
        ))}

        {SYSTEMS.map((system, index) => (
          <g key={system.title}>
            <rect x={SYSTEM_X} y={ROW_Y[index]} width={COLUMN_W} height={ROW_H} rx="16" fill={p.system} stroke={p.systemLine} strokeDasharray="4 4" />
            <text x={SYSTEM_X + 18} y={ROW_Y[index] + 42} fill={p.title} fontSize="15" fontWeight="600">{system.title}</text>
            <text x={SYSTEM_X + 18} y={ROW_Y[index] + 64} fill={p.body} fontSize="12">{system.sub}</text>
          </g>
        ))}
        <text x="1095" y="560" fill={p.body} fontSize="12" textAnchor="middle">ระบบเดิมขององค์กร</text>
        <text x="885" y="560" fill={p.body} fontSize="12" textAnchor="middle">สามทางเชื่อมต่อ</text>
      </svg>
    </figure>
  );
}
