import BOOTH_DATA from "~/data/booth-data.json";
import { JOURNEY, LANDSCAPE, READS, SAFEGUARDS, STORES } from "../../../home/content";
import { DEMO_ROLES } from "../../../home/hero-demo";
import { FACTS, mark, shotInfo, type ShotId } from "../kit";
import { trimmed } from "./signal-data";

/** Loop length of the launch cut, in seconds. */
export const LAUNCH_LENGTH = 94.5;

/** When each of the twelve beats begins, in seconds. */
export const BEAT = {
  hook: 0,
  problem: 5.5,
  reveal: 11.4,
  investigate: 16,
  ask: 28,
  learn: 40,
  suggest: 48,
  foresee: 54,
  scope: 62.5,
  act: 72.5,
  proof: 82.5,
  end: 89.5,
} as const;

/** A section heading: the small numbered eyebrow and the big title lines, the second of which may carry the gradient. */
export type Heading = { eyebrow: string; lines: string[]; gradientLine?: number };

/** Every numbered heading of the film, verbatim from the saas-light cut and the site. */
export const HEADINGS = {
  investigate: { eyebrow: "01 · สืบให้ก่อนคุณถาม", lines: ["ก่อนคุณตื่น Winyu สืบให้แล้ว"] },
  ask: { eyebrow: "02 · ถามเป็นภาษาคน", lines: ["ถามเหมือนคุยกับเพื่อนร่วมงาน"] },
  learn: { eyebrow: "03 · เรียนรู้วิธีที่คุณทำงาน", lines: ["ยิ่งใช้ ยิ่งรู้ใจ"] },
  suggest: { eyebrow: "04 · แนะนำการ์ดที่ใช่", lines: ["ถามบ่อย Winyu ปักไว้ให้"] },
  foresee: { eyebrow: "05 · เห็นก่อนเป็นปัญหา", lines: ["Winyu เฝ้าตัวเลขให้ทุกวัน"] },
  architecture: { eyebrow: "06 · สิทธิ์อยู่ในโค้ด", lines: ["Between your people", "and the systems you already run."], gradientLine: 1 },
  scope: { eyebrow: "06 · สิทธิ์อยู่ในโค้ด", lines: ["คำถามเดียวกัน แต่ละคนเห็นเท่าที่ควรเห็น"] },
  act: { eyebrow: "07 · ทำต่อได้ทันที", lines: ["คำตอบไม่จบที่ตัวเลข"] },
  principle: { eyebrow: "Principle", lines: ["Winyu never keeps", "your business data."], gradientLine: 1 },
  proof: { eyebrow: "Enterprise ready", lines: ["ปลอดภัยตั้งแต่ออกแบบ"] },
} satisfies Record<string, Heading>;

/** The hook, problem, reveal and end statements. */
export const STATEMENTS = {
  hook: ["ทุกคนในองค์กร", "มีคำถามเรื่องตัวเลข"],
  problem: "แต่คำตอบ กระจายอยู่ในหลายระบบ",
  tagline: "ผู้ช่วยข้อมูลสำหรับทุกคนในองค์กร",
  end: ["One question.", "The right answer for every role."],
} as const;

const WORKS_WITH = ["SAP S/4HANA", "SAP BW", "Snowflake", "Databricks", "BigQuery", "SQL Server", "Power BI", "SuccessFactors", "Salesforce", "Microsoft Entra ID", "Microsoft 365", "MuleSoft"];
const THAI_LANDSCAPE = ["SFA ที่พัฒนาเอง", "HRM ไทย", "LMS ของ vendor", "ไฟล์ส่งทุกคืน"];

/** The systems the answer is scattered across: the site's works-with list plus the home-grown ones from the landscape table. */
export function systemTiles(): string[] {
  const landscape = LANDSCAPE.flatMap((row) => row.typical.split(/, | · /));
  for (const name of THAI_LANDSCAPE) if (!landscape.includes(name)) throw new Error(`${name} is not in LANDSCAPE`);
  return [...WORKS_WITH, ...THAI_LANDSCAPE];
}

/** The 26 role titles Winyu investigated for overnight. */
export function roleTitles(): string[] {
  return FACTS.roles.map((role) => role.role);
}

function afterPrefix(text: string, prefix: string): string {
  if (!text.startsWith(prefix)) throw new Error(`"${text}" does not start with "${prefix}"`);
  return text.slice(prefix.length);
}

function beforeSuffix(text: string, suffix: string): string {
  if (!text.endsWith(suffix)) throw new Error(`"${text}" does not end with "${suffix}"`);
  return text.slice(0, text.length - suffix.length);
}

function numberIn(text: string, pattern: RegExp): string {
  const found = text.match(pattern);
  if (!found) throw new Error(`No ${pattern} in "${text}"`);
  return found[1];
}

/** Beat 01: the Sales Director's overnight trace, its count, what it ruled out, what it found, and the next step. */
export function investigationCopy() {
  const header = mark("story", "header").text;
  const ruledOut = afterPrefix(mark("story", "ruledOut").text, "ตัดทิ้งแล้ว: ").split(" · ");
  const investigation = BOOTH_DATA.investigation;
  return {
    role: shotInfo("story").role,
    ranAt: trimmed(header, `Winyu สืบให้เมื่อ ${numberIn(header, /สืบให้เมื่อ (\d\d:\d\d)/u)}`),
    checks: Number(numberIn(header, /ดูข้อมูล (\d+) ครั้ง/u)),
    checksLines: ["ครั้งที่ Winyu ดูข้อมูลให้", "ก่อนสรุปหนึ่งเรื่อง"],
    trace: investigation.trace.map((step) => ({ label: step.label, summary: shortSummary(step.summary) })),
    ruledOutLabel: "ตัดทิ้งแล้ว",
    ruledOut,
    badge: mark("story", "badge").text,
    scope: investigation.story.scope,
    finding: mark("story", "finding").text,
    nextLabel: "ขั้นต่อไป",
    next: beforeSuffix(mark("story", "next").text, " ถามต่อ"),
  };
}

const DATE_RANGE_TAIL = / \d{1,2} \S+ \d{4} – \d{1,2} \S+ \d{4}$/u;

function shortSummary(summary: string): string {
  const head = summary.includes(":") ? summary.slice(0, summary.indexOf(":")) : summary;
  return trimmed(summary, head.replace(DATE_RANGE_TAIL, "").trim());
}

function checkSteps(who: string, scope: string, source: string): string[] {
  return [`รู้ว่าเป็น ${who}`, `ใส่ขอบเขต: ${scope}`, `อ่านจาก ${source} ผ่านคลังข้อมูล`, "ซ่อนกลุ่มเล็ก · บันทึก audit"];
}

/** Beat 02: the CEO's real question, the checks and the life of one number filled with that question's real values, and the answer. */
export function askCopy() {
  const who = shotInfo("chat-ceo").role;
  const scope = DEMO_ROLES.find((role) => role.id === "exec")?.openScope;
  if (!scope) throw new Error("No executive scope");
  const cardText = mark("chat-ceo", "card").text;
  const source = numberIn(cardText, /(SAP \w+) · รับรองแล้ว/u);
  const bars = mark("chat-ceo", "bars").text;
  const checks = checkSteps(who, scope, source);
  return {
    who,
    question: mark("chat-ceo", "question").text,
    checking: "Winyu กำลังตรวจก่อนตอบ",
    journey: JOURNEY.map((step) => step.title),
    values: [mark("chat-ceo", "question").text, checks[0], "metric: target_attainment · by: region", `scope: ${scope}`, checks[2], checks[3]],
    queryNote: "ใส่โดย Winyu",
    hero: numberIn(mark("chat-ceo", "hero").text, /^([\d.]+%)/u),
    lowest: { name: numberIn(bars, /^(\S+) /u), value: numberIn(bars, /^\S+ ([\d.]+%)/u) },
    footer: ["อ่านสดจาก SAP SD ณ วินาทีที่ถาม", "ไม่มีตัวเลขที่ AI แต่งเอง"],
  };
}

/** Beat 03: the sales rep's real quick-ask chips with the reasons Winyu has for them, and the memory Winyu asks to keep. */
export function learnCopy() {
  const reasons = new Map(BOOTH_DATA.chips.items.map((item) => [item.label, item.reason]));
  const chips = mark("landing-rep", "chips").text.split(" ").map((label) => ({ label, reason: reasons.get(label) ?? null }));
  return {
    repRole: shotInfo("landing-rep").role,
    chips,
    memoryRole: shotInfo("memory").role,
    learning: mark("memory", "learning").text,
    yes: mark("memory", "yes").text,
    known: mark("memory-yes", "known").text,
  };
}

/** Beat 04: the card Winyu suggests to the Northeast manager, and why. */
export function suggestCopy() {
  const card = mark("dashboard-suggest", "card").text;
  return {
    role: shotInfo("dashboard-suggest").role,
    badge: mark("dashboard-suggest", "badge").text,
    title: mark("dashboard-suggest", "title").text,
    value: numberIn(card, /รวมทุกเอเย่นต์ ([\d.,]+ ล้านบาท)/u),
    reason: mark("dashboard-suggest", "reason").text,
    keep: mark("dashboard-suggest", "keep").text,
  };
}

/** Beat 05: the top anomaly, the lesson from last time, and the forecast. */
export function foreseeCopy() {
  const anomaly = mark("dashboard-suggest", "topAnomaly").text;
  const agent = numberIn(anomaly, /^ต้องรีบดู (.+?) ภาคอีสาน/u);
  return {
    severity: numberIn(anomaly, /^(\S+) /u),
    agent,
    gap: numberIn(anomaly, /(−\d+%)/u),
    actualExpected: numberIn(anomaly, /(จริง [\d,]+ ลิตร · คาด [\d,]+ ลิตร)/u),
    lesson: [FACTS.lesson.outcome.split(" ")[0], FACTS.lesson.outcome.split(" ").slice(1).join(" ")],
    lessonDate: FACTS.lesson.date,
    forecastRole: shotInfo("chat-forecast").role,
    forecastValue: numberIn(mark("chat-forecast", "hero").text, /^([\d.]+ ล้านลิตร)/u),
    forecastWhat: trimmed(mark("chat-forecast", "cardTitle").text, "พยากรณ์ปริมาณขายเข้า 8 สัปดาห์ข้างหน้า"),
  };
}

/** The architecture of the site: who asks, Winyu's four layers, the three doors, and the systems behind them. */
export const ARCHITECTURE = {
  people: "คนในองค์กร",
  roles: ["ผู้บริหาร", "ผู้อำนวยการฝ่ายขาย", "ผู้จัดการภาค", "พนักงานขาย"],
  core: "Winyu",
  coreNote: "ไม่เก็บข้อมูลธุรกิจ อ่านสดทุกครั้ง",
  layers: ["ตัวตนและสิทธิ์", "Semantic layer", "บังคับขอบเขต", "Audit"],
  doors: [{ name: "ประตูตัวเลข", tech: "Metrics port" }, { name: "REST connector", tech: "kind: rest" }, { name: "MCP connector", tech: "Model Context Protocol" }],
  systems: ["คลังข้อมูล / BI", "API gateway", "MCP server"],
} as const;

/** One of the three real drawers of the scope beat: whose it is, its scope and its headline number. */
export type ScopeDrawer = { shot: ShotId; userId: string; role: string; scope: string; value: string };

/** Beat 06 payoff: the CEO, the Northeast manager and the Khon Kaen rep on the same story, each in their own scope. */
export function scopeDrawers(): ScopeDrawer[] {
  const entries: [ShotId, string][] = [["story-ceo", "u_thana"], ["story-rsm", "u_anucha"], ["story-rep", "u_krit"]];
  return entries.map(([shot, userId]) => {
    const role = FACTS.roles.find((candidate) => candidate.userId === userId);
    if (!role?.spine) throw new Error(`No spine for ${userId}`);
    return { shot, userId, role: role.role, scope: role.spine.scope, value: numberIn(mark(shot, "hero").text, /^([\d.,]+ ล้าน\S+)/u) };
  });
}

/** The first safeguard, which the scope beat ends on. */
export function scopeSafeguard(): { title: string; body: string[] } {
  const guard = SAFEGUARDS[0];
  return { title: guard.title, body: [trimmed(guard.body, "ขอบเขตถูกใส่ลงใน query ทุกครั้ง"), trimmed(guard.body, "AI ขยายขอบเขตเองไม่ได้ แม้จะถูกสั่งในแชท")] };
}

const ACT_CARDS: [string, string[]][] = [
  ["u_thana", ["ถามผู้อำนวยการฝ่ายขายว่า", "สองเอเย่นต์อีสานติดวงเงินจริงไหม"]],
  ["u_anucha", ["ขอฝ่ายสินเชื่อเช็กว่าอีสานรุ่งโรจน์", "กับอุบลศรีสุขติดวงเงินไหม"]],
  ["u_krit", ["ดูสต๊อกเบียร์ที่ร้าน", "ถามว่าติดวงเงินไหม"]],
];

/** Beat 07: three levels of the organisation, each with its own next step as two short lines that together are a contiguous piece of its real action. */
export function actCards(): { role: string; lines: string[] }[] {
  return ACT_CARDS.map(([userId, lines]) => {
    const role = FACTS.roles.find((candidate) => candidate.userId === userId);
    if (!role?.spine) throw new Error(`No spine for ${userId}`);
    const action = role.spine.action;
    if (!action.includes(lines.join("")) && !action.includes(lines.join(" "))) throw new Error(`Lines of ${userId} are not a trim of its action`);
    return { role: role.role, lines };
  });
}

/** Beat 07: the one-line context above the cards, and the closing line with its counts from the facts. */
export function actFrame(): { context: string; closingLead: string; closingTail: string } {
  const director = FACTS.roles.find((role) => role.userId === "u_prasit");
  if (!director?.spine) throw new Error("No director story");
  return {
    context: trimmed(director.spine.finding, "สองเอเย่นต์ใหญ่แทบหยุดสั่งเบียร์ตั้งแต่ 11 ก.ย. น่าจะติดวงเงิน"),
    closingLead: `${FACTS.totals.spineRoles} จาก ${FACTS.totals.roles} ตำแหน่งเจอเรื่องนี้`,
    closingTail: "แต่ละคนได้ขั้นต่อไปของตัวเอง",
  };
}

/** Beat 11 opening: what Winyu reads live and what it keeps, from the site's principle section. */
export function principleCopy() {
  return {
    readsLabel: "Read live from your systems",
    reads: READS.map((item) => ({ label: item.label, source: item.source })),
    hub: "0 rows stored",
    storesLabel: "Kept by Winyu · app state only",
    stores: STORES.map((item) => (item.startsWith("บันทึกการใช้งาน (audit)") ? trimmed(item, "บันทึกการใช้งาน (audit)") : item)),
  };
}

const SAFEGUARD_LINES: Record<string, string[]> = {
  "AI ไม่แต่งตัวเลข": ["ตัวเลขทุกตัวบนการ์ด", "มาจากผลของ query", "และแสดงแหล่งที่มา", "กับเวลาของข้อมูลเสมอ"],
  "ตัวตนไปถึงปลายทาง": ["ทุกคำขอส่งตัวตนผู้ถามไปด้วย", "ระบบต้นทางจึงบังคับสิทธิ์", "ของตัวเองซ้ำได้อีกชั้น"],
  "ทุกการเรียกมี audit": ["บันทึกว่าใครขออะไร", "ได้ ถูกปิดบัง หรือถูกปฏิเสธ", "และเพราะอะไร"],
};

/** Beat 11: three safeguards from the site, each body broken into short lines that together are the whole sentence. */
export function proofCards(): { title: string; lines: string[] }[] {
  return Object.entries(SAFEGUARD_LINES).map(([title, lines]) => {
    const guard = SAFEGUARDS.find((candidate) => candidate.title === title);
    if (!guard) throw new Error(`No safeguard ${title}`);
    if (lines.join("").replaceAll(" ", "") !== guard.body.replaceAll(" ", "")) throw new Error(`Lines of ${title} are not its body`);
    return { title, lines };
  });
}

/** Where the overnight trace card sits in beat 01, and the Winyu tile in its header that the revealed logo shrinks into. */
export const TRACE_CARD = { left: 120, top: 318, width: 1010, height: 666, icon: 64, pad: 40 } as const;
