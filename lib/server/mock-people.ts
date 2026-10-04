import type { MockStep } from "@/lib/harness/adapters/vexa/server";
import type { Spec, SpecElement } from "vexa/protocol";
import type { PeopleFlag, Region } from "@/lib/contracts";
import { USERS } from "@/lib/data/entities/users";
import { GENERATOR_DICTIONARY } from "@/lib/data/master";
import { addBadges, addPerson, element, type Elements } from "./mock-compose";

type Badge = { label: string; tone: string | null };
type PersonRow = { id: string; name: string; title: string; place: string; photo: string; tenure: string | null; badges: Badge[] };
type OpenPosition = { title: string; open_label: string };
type PeopleOutput = { summary?: string; data?: PersonRow[]; open_positions?: OpenPosition[] };
type Profile = {
  name: string; title: string; photo: string; badges: Badge[];
  facts: { label: string; value: string }[];
  history: { title: string; detail: string | null; time: string | null }[];
  certificates: { label: string; value: string }[];
  risk_reasons: string[];
  reports: { id: string; name: string; title: string; photo: string }[];
};

const FOOTNOTE = "แหล่งข้อมูล: HRIS";

const FLAG_WORDS: readonly [RegExp, PeopleFlag][] = [
  [/เสี่ยง.*ลาออก|จะลาออก/, "risk"],
  [/ใบอนุญาต|ใบรับรอง|ใบขับขี่|หมดอายุ/, "cert_expiring"],
  [/โอที|ทำงานล่วงเวลา/, "overtime"],
  [/เกษียณ/, "retiring"],
  [/คนใหม่|พนักงานใหม่|เพิ่งเข้า|ทดลองงาน/, "new"],
];

const FLAG_TITLES: Record<PeopleFlag, string> = {
  risk: "คนที่ควรคุยด้วยก่อนเสียไป",
  cert_expiring: "ใบอนุญาตและใบรับรองที่ต้องต่อ",
  overtime: "คนที่ทำโอทีหนัก 3 เดือนล่าสุด",
  retiring: "คนที่จะเกษียณใน 3 ปี",
  new: "พนักงานใหม่ที่ยังอยู่ช่วงเริ่มงาน",
};

function flagOf(prompt: string): PeopleFlag | null {
  return FLAG_WORDS.find(([pattern]) => pattern.test(prompt))?.[1] ?? null;
}

function leadOf(region: Region | null): string | null {
  if (!region) return null;
  return USERS.find((user) => user.role === "sales_rsm" && user.region === region)?.id ?? null;
}

function peopleOf(output: unknown): PeopleOutput {
  return (output ?? {}) as PeopleOutput;
}

function addHeader(elements: Elements, key: string, person: { name: string; title: string; photo: string | null; badges: Badge[] }): string {
  elements[`${key}_avatar`] = element("Avatar", { name: person.name, role: person.title, src: person.photo, size: "lg" });
  const badges = addBadges(elements, `${key}_badges`, person.badges);
  elements[key] = element("Stack", { direction: "vertical", gap: "sm" }, [`${key}_avatar`, ...(badges ? [badges] : [])]);
  return key;
}

function openCallout(positions: OpenPosition[]): SpecElement {
  const body = positions.map((position) => `${position.title} (${position.open_label})`).join(" · ");
  return { type: "Callout", props: { eyebrow: "ตำแหน่งว่าง", title: `ยังขาดอีก ${positions.length} ตำแหน่ง`, body, tone: "warning" }, children: [] } as SpecElement;
}

/** One way the model may compose a team from Vexa parts: the lead on top, a grid of people, then the open positions. */
export function teamSpec(output: unknown, title: string, withLead: boolean): Spec {
  const { summary = "", data = [], open_positions: open = [] } = peopleOf(output);
  const [lead, ...rest] = withLead ? data : [undefined, ...data];
  const members = rest.filter((row): row is PersonRow => Boolean(row));
  const elements: Elements = {};
  const children: string[] = [];
  if (lead) children.push(addHeader(elements, "lead", lead));
  members.forEach((row, index) => addPerson(elements, `p${index}`, row));
  elements.grid = { type: "Grid", props: { columns: "2", gap: "sm" }, children: members.map((_, index) => `p${index}`) } as SpecElement;
  children.push("grid");
  if (open.length > 0) {
    elements.open = openCallout(open);
    children.push("open");
  }
  elements.stack = { type: "Stack", props: { direction: "vertical", gap: "lg" }, children } as SpecElement;
  elements.card = { type: "Card", props: { title, description: null, meta: summary, footnote: FOOTNOTE }, children: ["stack"] } as SpecElement;
  return { root: "card", elements } as Spec;
}

function alarmsOf(row: PersonRow): number {
  return row.badges.filter((badge) => badge.tone === "danger" || badge.tone === "warning").length;
}

function teamLead(output: unknown, flag: PeopleFlag | null, withLead: boolean): string {
  const { data = [], open_positions: open = [] } = peopleOf(output);
  if (data.length === 0) return "ไม่พบพนักงานที่ตรงเงื่อนไขในขอบเขตของคุณครับ";
  const members = withLead ? data.slice(1) : data;
  const flagged = [...members].sort((left, right) => alarmsOf(right) - alarmsOf(left)).find((row) => alarmsOf(row) > 0);
  const note = flagged ? ` คนที่ควรดูก่อนคือ${flagged.name} (${flagged.badges.map((badge) => badge.label).join(", ")})` : "";
  const gap = open.length > 0 && !flag ? ` และยังมีตำแหน่งว่าง ${open.length} ตำแหน่ง` : "";
  return `${flag ? FLAG_TITLES[flag] : "รายชื่อทีม"} ${data.length} คน${note}${gap}ครับ`;
}

/** "ทีมขายภาคอีสานมีใครบ้าง", "ใบอนุญาตใครใกล้หมด": find_people, then the composed team card. */
export function peopleSteps(prompt: string): MockStep[] {
  const region = GENERATOR_DICTIONARY.resolveEntity("region", prompt);
  const regionId = (region?.id ?? null) as Region | null;
  const flag = flagOf(prompt);
  const manager = flag ? null : leadOf(regionId);
  const title = flag ? FLAG_TITLES[flag] : region ? `ทีมขาย${region.label}` : "ทีมของคุณ";
  return [
    {
      tool: "find_people",
      input: { region: manager ? null : regionId, department: manager || flag ? null : "dept_sales", manager, query: null, flag },
      then: (output) => [{ text: teamLead(output, flag, Boolean(manager)) }, { spec: teamSpec(output, title, Boolean(manager)) }],
      onError: (result) => [{ text: `อ่านรายชื่อพนักงานไม่ได้ครับ: ${(result as { error?: string }).error ?? "ไม่ทราบสาเหตุ"}` }],
    },
  ];
}

function profileOf(output: unknown): Profile | null {
  const data = (output as { data?: Profile }).data;
  return data ?? null;
}

/** One way the model may compose a profile from get_person with Vexa parts. */
export function profileSpec(output: unknown): Spec {
  const profile = profileOf(output);
  if (!profile) return { root: "card", elements: { card: { type: "Card", props: { title: "ไม่พบพนักงาน", description: null, meta: null, footnote: null }, children: [] } } } as Spec;
  const elements: Elements = { facts: element("KeyValue", { pairs: profile.facts, size: "sm" }) };
  const children = [addHeader(elements, "header", profile), "facts"];
  if (profile.risk_reasons.length > 0) {
    elements.risk = { type: "Callout", props: { eyebrow: "ความเสี่ยง", title: "เหตุผลที่ควรคุยด้วยเร็ว ๆ นี้", body: profile.risk_reasons.join(" · "), tone: "danger" }, children: [] } as SpecElement;
    children.push("risk");
  }
  if (profile.certificates.length > 0) {
    elements.certHeading = { type: "Heading", props: { text: "ใบอนุญาตและใบรับรอง", level: "3" }, children: [] } as SpecElement;
    elements.certs = { type: "KeyValue", props: { pairs: profile.certificates, size: "sm" }, children: [] } as SpecElement;
    children.push("certHeading", "certs");
  }
  if (profile.history.length > 0) {
    elements.history = { type: "Timeline", props: { items: profile.history }, children: [] } as SpecElement;
    children.push("history");
  }
  if (profile.reports.length > 0) {
    profile.reports.forEach((report, index) => {
      elements[`r${index}`] = { type: "Avatar", props: { name: report.name, role: report.title, src: report.photo, size: "sm" }, children: [] } as SpecElement;
    });
    elements.reports = { type: "Grid", props: { columns: "2", gap: "sm" }, children: profile.reports.map((_, index) => `r${index}`) } as SpecElement;
    children.push("reports");
  }
  elements.stack = { type: "Stack", props: { direction: "vertical", gap: "lg" }, children } as SpecElement;
  elements.card = { type: "Card", props: { title: `โปรไฟล์${profile.name}`, description: null, meta: null, footnote: FOOTNOTE }, children: ["stack"] } as SpecElement;
  return { root: "card", elements } as Spec;
}

function nameIn(prompt: string): string {
  const match = prompt.match(/คุณ\S+/);
  return match ? match[0] : prompt.replace(/ขอดู|โปรไฟล์|ประวัติ(ของ)?/g, "").trim();
}

/** "ขอดูโปรไฟล์คุณจอย": get_person, then the composed profile card. */
export function profileSteps(prompt: string): MockStep[] {
  return [
    {
      tool: "get_person",
      input: { id: null, name: nameIn(prompt) },
      then: (output) => [{ text: `${(output as { summary?: string }).summary ?? ""} ครับ` }, { spec: profileSpec(output) }],
      onError: (result) => [{ text: `${(result as { error?: string }).error ?? "ไม่พบพนักงาน"}ครับ` }],
    },
  ];
}
