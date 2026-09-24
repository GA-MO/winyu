import type { MockStep } from "vexa/mock";
import type { Spec, SpecElement } from "vexa/protocol";
import { addBadges, element, toolButton, type Elements } from "./mock-compose";

type Badge = { label: string; tone: string | null };
type Metric = { label: string; value: string; detail: string | null; tone: string };
type CandidateRow = {
  id: string; name: string; position: string; stage: string; step: number; steps: number; stage_percent: number; score: number | null;
  experience: string; strength: string; concern: string | null; badges: Badge[];
};
type PositionRow = { title: string; candidates: string; advanced: string; open_label: string };
type CandidatesData = { position: PositionRow | null; metrics: Metric[]; candidates: CandidateRow[]; positions: PositionRow[] };
type CourseRow = {
  id: string; title: string; cover: string; category: string; when: string; place: string;
  seats: { label: string; tone: string }; note: string | null; badges: Badge[]; can_enroll: boolean;
};
type PolicyData = {
  balances: Metric[];
  sections: { title: string; content: string }[];
  form: { kinds: { value: string; label: string }[]; approver: string | null; earliest: string; note: string } | null;
};

const ATS_FOOTNOTE = "แหล่งข้อมูล: ระบบสรรหา (ATS)";
const LMS_FOOTNOTE = "แหล่งข้อมูล: ระบบฝึกอบรม (LMS)";
const POLICY_FOOTNOTE = "แหล่งข้อมูล: ระเบียบบริษัทและ HRIS";
const CANDIDATE_POSITION = /ผู้สมัคร(?:ตำแหน่ง)?\s*(.+?)(?:มีใครบ้าง|บ้าง|$)/;
const THIS_MONTH = "2026-09";
const NEXT_MONTH = "2026-10";

function summaryOf(output: unknown): string {
  return String((output as { summary?: string }).summary ?? "");
}

function dataOf<T>(output: unknown): T | null {
  return ((output as { data?: T }).data ?? null) as T | null;
}

function metricElements(metrics: Metric[], elements: Record<string, SpecElement>): string {
  metrics.forEach((metric, index) => {
    elements[`m${index}`] = element("Metric", { label: metric.label, value: metric.value, detail: metric.detail, trend: null, tone: metric.tone, delta: null, note: null, size: "md" });
  });
  elements.metrics = element("Grid", { columns: "3", gap: "sm" }, metrics.map((_, index) => `m${index}`));
  return "metrics";
}

function addCandidate(elements: Elements, key: string, row: CandidateRow): string {
  const detail = [row.strength, row.concern].filter(Boolean).join(" · ");
  elements[key] = element("ListItem", { title: row.name, subtitle: `${row.stage} · ${row.experience}`, detail, src: null, media: "avatar", badges: row.badges, trailing: row.score === null ? null : String(row.score), trailingTone: null });
  return key;
}

function candidatesTitle(data: CandidatesData): string {
  const leader = data.candidates[0];
  if (!leader) return "ยังไม่มีผู้สมัคร";
  return `${leader.name}ไปไกลที่สุด · ${leader.stage}`;
}

/** One way the model may compose candidates from Vexa parts: three numbers, then every candidate side by side to compare. */
export function candidatesSpec(output: unknown): Spec {
  const data = dataOf<CandidatesData>(output);
  if (!data) return { root: "card", elements: { card: element("Card", { title: "ไม่พบข้อมูลผู้สมัคร", description: null, meta: null, footnote: null }) } } as Spec;
  const elements: Elements = {};
  const children = [metricElements(data.metrics, elements)];
  data.candidates.forEach((row, index) => addCandidate(elements, `c${index}`, row));
  elements.candidates = element("Grid", { columns: "2", gap: "sm" }, data.candidates.map((_, index) => `c${index}`));
  children.push("candidates");
  if (data.positions.length > 0) {
    elements.positions = element("KeyValue", { pairs: data.positions.map((position) => ({ label: position.title, value: `${position.candidates} · ${position.advanced} · ${position.open_label}` })), size: "sm" });
    children.push("positions");
  }
  elements.stack = element("Stack", { direction: "vertical", gap: "lg" }, children);
  elements.card = element("Card", { title: candidatesTitle(data), description: null, meta: summaryOf(output), footnote: ATS_FOOTNOTE }, ["stack"]);
  return { root: "card", elements } as Spec;
}

function candidatesLead(output: unknown): string {
  const data = dataOf<CandidatesData>(output);
  const leader = data?.candidates[0];
  if (!data || !leader) return "ยังไม่มีผู้สมัครในตำแหน่งนี้ครับ";
  const concern = leader.concern ? ` แต่ต้องคุยเรื่อง${leader.concern}` : "";
  return `${leader.name}ไปไกลที่สุด (${leader.stage} · ${leader.score ?? "-"} / 5)${concern} ครับ`;
}

function positionOf(prompt: string): string | null {
  const match = CANDIDATE_POSITION.exec(prompt);
  const position = match?.[1]?.trim() ?? "";
  return position.length > 0 ? position : null;
}

/** "ผู้สมัครพนักงานขายขอนแก่น" → the candidates for that opening, or why the viewer cannot see them. */
export function candidateSteps(prompt: string): MockStep[] {
  return [
    {
      tool: "list_candidates",
      input: { position: positionOf(prompt), stage: null },
      then: (output) => [{ text: candidatesLead(output) }, { spec: candidatesSpec(output) }],
      onError: (result) => [{ text: `${(result as { error?: string }).error ?? "อ่านข้อมูลผู้สมัครไม่ได้"} ครับ` }],
    },
  ];
}

function addCourse(elements: Elements, key: string, row: CourseRow): string {
  elements[`${key}_cover`] = element("Image", { src: row.cover, alt: row.title, caption: null, aspect: "wide" });
  elements[`${key}_title`] = element("Heading", { text: row.title, level: "3" });
  elements[`${key}_when`] = element("Text", { content: `${row.when} · ${row.place}`, muted: true });
  elements[`${key}_seats`] = element("Badge", { label: row.seats.label, tone: row.seats.tone === "bad" ? "warning" : "neutral" });
  const children = [`${key}_cover`, `${key}_title`, `${key}_when`, `${key}_seats`];
  if (row.note) {
    elements[`${key}_note`] = element("Text", { content: row.note, muted: false });
    children.push(`${key}_note`);
  }
  const badges = addBadges(elements, `${key}_badges`, row.badges);
  if (badges) children.push(badges);
  if (row.can_enroll) {
    elements[`${key}_enroll`] = toolButton("สมัคร", "enroll_course", { courseId: row.id }, "primary");
    children.push(`${key}_enroll`);
  }
  elements[key] = element("Stack", { direction: "vertical", gap: "sm" }, children);
  return key;
}

function urgentCourse(rows: CourseRow[]): CourseRow | null {
  return rows.find((row) => row.note !== null || row.badges.some((badge) => badge.tone === "danger" && row.can_enroll)) ?? null;
}

/** One way the model may compose courses from Vexa parts: covers to swipe, each with its own enrol button. */
export function coursesSpec(output: unknown): Spec {
  const rows = dataOf<CourseRow[]>(output) ?? [];
  const elements: Elements = {};
  rows.forEach((row, index) => addCourse(elements, `k${index}`, row));
  elements.carousel = element("Carousel", { variant: "card", items: [] }, rows.map((_, index) => `k${index}`));
  const urgent = urgentCourse(rows);
  const title = urgent ? `${urgent.title} ควรสมัครก่อน` : "หลักสูตรที่จะเปิด";
  elements.card = element("Card", { title, description: null, meta: summaryOf(output), footnote: LMS_FOOTNOTE }, ["carousel"]);
  return { root: "card", elements } as Spec;
}

function coursesLead(output: unknown): string {
  const rows = dataOf<CourseRow[]>(output) ?? [];
  if (rows.length === 0) return "ช่วงนั้นยังไม่มีหลักสูตรเปิดครับ";
  const urgent = urgentCourse(rows);
  if (!urgent) return `${summaryOf(output)} ครับ กดสมัครที่การ์ดได้เลย`;
  return `${urgent.title} ${urgent.when} ${urgent.seats.label}${urgent.note ? ` · ${urgent.note}` : ""} ครับ`;
}

function monthOf(prompt: string): string | null {
  if (/เดือนหน้า/.test(prompt)) return NEXT_MONTH;
  if (/เดือนนี้/.test(prompt)) return THIS_MONTH;
  return null;
}

/** "มีหลักสูตรอะไรเปิดเดือนนี้" → the courses of that month, or the next ones. */
export function courseSteps(prompt: string): MockStep[] {
  return [
    {
      tool: "list_courses",
      input: { month: monthOf(prompt), query: null },
      then: (output) => [{ text: coursesLead(output) }, { spec: coursesSpec(output) }],
      onError: (result) => [{ text: `อ่านหลักสูตรไม่ได้ครับ: ${(result as { error?: string }).error ?? "ไม่ทราบสาเหตุ"}` }],
    },
  ];
}

/** One way the model may compose the leave answer: balances, the rules to expand, then Cop's leave form. */
export function policySpec(output: unknown): Spec {
  const data = dataOf<PolicyData>(output);
  if (!data) return { root: "card", elements: { card: element("Card", { title: "ไม่พบระเบียบ", description: null, meta: null, footnote: null }) } } as Spec;
  const elements: Record<string, SpecElement> = {};
  const children: string[] = [];
  if (data.balances.length > 0) children.push(metricElements(data.balances, elements));
  elements.rules = element("Accordion", { items: data.sections });
  children.push("rules");
  if (data.form) {
    elements.form = element("LeaveForm", { kinds: data.form.kinds, earliest: data.form.earliest, approver: data.form.approver, note: data.form.note, kind: null, from: null, to: null, reason: null });
    children.push("form");
  }
  elements.stack = element("Stack", { direction: "vertical", gap: "lg" }, children);
  const annual = data.balances[0];
  const title = annual ? `${annual.label}${annual.value}` : "สวัสดิการของพนักงาน";
  elements.card = element("Card", { title, description: null, meta: summaryOf(output), footnote: POLICY_FOOTNOTE }, ["stack"]);
  return { root: "card", elements } as Spec;
}

function policyLead(output: unknown): string {
  const data = dataOf<PolicyData>(output);
  if (!data?.form) return "สวัสดิการหลักมีตามนี้ครับ กดหัวข้อเพื่อดูรายละเอียด";
  return `${summaryOf(output)} ครับ ${data.form.note} กรอกฟอร์มด้านล่างแล้วกดยื่นได้เลย`;
}

/** "ลาพักร้อนยังไง" → leave balances, rules and the form; "สวัสดิการมีอะไรบ้าง" → the benefit sections. */
export function policySteps(prompt: string): MockStep[] {
  const topic = /สวัสดิการ|ประกัน|กองทุน/.test(prompt) && !/ลา/.test(prompt) ? "benefits" : "leave";
  return [
    {
      tool: "get_policy",
      input: { topic },
      then: (output) => [{ text: policyLead(output) }, { spec: policySpec(output) }],
      onError: (result) => [{ text: `อ่านระเบียบไม่ได้ครับ: ${(result as { error?: string }).error ?? "ไม่ทราบสาเหตุ"}` }],
    },
  ];
}
