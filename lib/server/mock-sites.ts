import type { MockStep } from "@/lib/harness/adapters/vexa/server";
import type { Spec, SpecElement } from "vexa/protocol";
import { SITES } from "@/lib/data/entities/sites";
import { addPerson, askRow, element, type Elements } from "./mock-compose";

type Badge = { label: string; tone: string | null };
type Trailing = { text: string; tone: string };
type SiteRow = { id: string; name: string; kind: string; place: string; photo: string; status: string; trailing: Trailing; note: string; badges: Badge[] };
type PersonRow = { id: string; name: string; title: string; place: string; photo: string; tenure: string | null; badges: Badge[] };
type SiteDetail = {
  name: string; photo: string;
  metrics: { label: string; value: string; detail: string | null; tone: string }[];
  facts: { label: string; value: string }[];
  open_actions: { title: string; body: string; date: string }[];
  incidents: { title: string; detail: string | null; time: string | null }[];
  people: PersonRow[];
};

const FOOTNOTE = "แหล่งข้อมูล: ระบบรายงานความปลอดภัย (SHE)";

function rowsOf(output: unknown): SiteRow[] {
  const data = (output as { data?: unknown }).data;
  return Array.isArray(data) ? (data as SiteRow[]) : [];
}

function addSite(elements: Elements, key: string, row: SiteRow): string {
  const props = { title: row.name, subtitle: `${row.kind} · ${row.place}`, detail: row.note, src: row.photo, media: "thumb", badges: row.badges, trailing: row.trailing.text, trailingTone: row.trailing.tone };
  elements[key] = askRow(props, `ดูความปลอดภัยของ${row.name}`);
  return key;
}

/** One way the model may compose the overview from Vexa parts: every site as a pressable row, the ones to look at first. */
export function sitesSpec(output: unknown): Spec {
  const rows = rowsOf(output);
  const first = rows[0];
  const elements: Elements = {};
  rows.forEach((row, index) => addSite(elements, `s${index}`, row));
  elements.grid = element("Grid", { columns: "2", gap: "sm" }, rows.map((_, index) => `s${index}`));
  const title = first ? `${first.name}ต้องดูก่อน` : "ความปลอดภัยของทุกสถานที่";
  elements.card = element("Card", { title, description: null, meta: String((output as { summary?: string }).summary ?? ""), footnote: FOOTNOTE }, ["grid"]);
  return { root: "card", elements } as Spec;
}

function sitesLead(output: unknown): string {
  const first = rowsOf(output)[0];
  if (!first) return "ยังไม่มีข้อมูลความปลอดภัยครับ";
  return `${first.name}น่าห่วงที่สุด: ${first.trailing.text} และ${first.note} ครับ`;
}

function detailOf(output: unknown): SiteDetail | null {
  return ((output as { data?: SiteDetail }).data ?? null) as SiteDetail | null;
}

/** One way the model may compose one site's detail: photo, three numbers, what is still open, the timeline, the people. */
export function siteSpec(output: unknown): Spec {
  const site = detailOf(output);
  if (!site) return { root: "card", elements: { card: element("Card", { title: "ไม่พบสถานที่", description: null, meta: null, footnote: null }) } } as Spec;
  const elements: Record<string, SpecElement> = {
    photo: element("Image", { src: site.photo, alt: site.name, caption: null, aspect: "banner" }),
    metrics: element("Grid", { columns: "3", gap: "sm" }, site.metrics.map((_, index) => `m${index}`)),
    timeline: element("Timeline", { items: site.incidents }),
    facts: element("KeyValue", { pairs: site.facts, size: "sm" }),
  };
  site.metrics.forEach((metric, index) => {
    elements[`m${index}`] = element("Metric", { label: metric.label, value: metric.value, detail: metric.detail, trend: null, tone: metric.tone, delta: null, note: null, size: "md" });
  });
  const children = ["photo", "metrics"];
  site.open_actions.forEach((action, index) => {
    elements[`open${index}`] = element("Callout", { eyebrow: `ยังไม่ปิด · ${action.date}`, title: action.title, body: action.body, tone: "danger" });
    children.push(`open${index}`);
  });
  children.push("timeline", "facts");
  if (site.people.length > 0) {
    site.people.forEach((person, index) => addPerson(elements, `p${index}`, person));
    elements.peopleHeading = element("Heading", { text: "คนในพื้นที่", level: "3" });
    elements.people = element("Grid", { columns: "2", gap: "sm" }, site.people.map((_, index) => `p${index}`));
    children.push("peopleHeading", "people");
  }
  elements.stack = element("Stack", { direction: "vertical", gap: "lg" }, children);
  elements.card = element("Card", { title: `ความปลอดภัยของ${site.name}`, description: null, meta: String((output as { summary?: string }).summary ?? ""), footnote: FOOTNOTE }, ["stack"]);
  return { root: "card", elements } as Spec;
}

function isAlarm(badge: Badge): boolean {
  return badge.tone === "warning" || badge.tone === "danger";
}

function alarmsOf(person: PersonRow): number {
  return person.badges.filter(isAlarm).length;
}

function siteLead(output: unknown): string {
  const site = detailOf(output);
  if (!site) return "ไม่พบสถานที่นั้นครับ";
  const open = site.open_actions[0];
  const flagged = [...site.people].sort((left, right) => alarmsOf(right) - alarmsOf(left)).find((person) => alarmsOf(person) > 0);
  const expiring = flagged ? `${flagged.name} ${flagged.badges.filter(isAlarm).map((badge) => badge.label).join(" และ")}` : null;
  const parts = [`${site.name}: ${site.metrics[0]?.label ?? ""} ${site.metrics[0]?.value ?? ""}`];
  if (open) parts.push(`เรื่องที่ยังไม่ปิดคือ${open.title}`);
  if (expiring) parts.push(`และ${expiring}`);
  return `${parts.join(" · ")} ครับ`;
}

/** "โรงงานไหนเกิดอุบัติเหตุบ้าง" → every site; "ดูความปลอดภัยของโรงงานขอนแก่น" → that site's detail. */
export function siteSteps(prompt: string): MockStep[] {
  const site = SITES.find((candidate) => prompt.includes(candidate.nameTh));
  return [
    {
      tool: "get_site",
      input: { id: site?.id ?? null, name: null },
      then: (output) => (site ? [{ text: siteLead(output) }, { spec: siteSpec(output) }] : [{ text: sitesLead(output) }, { spec: sitesSpec(output) }]),
      onError: (result) => [{ text: `อ่านข้อมูลความปลอดภัยไม่ได้ครับ: ${(result as { error?: string }).error ?? "ไม่ทราบสาเหตุ"}` }],
    },
  ];
}
