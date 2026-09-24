import type { CardParts } from "@/lib/cards/present";
import type { Spec } from "vexa/protocol";
import HERO_CARDS from "~/data/hero-cards.json";

type CardView = { kind: "parts"; parts: CardParts } | { kind: "spec"; spec: Spec };

type HeroCard = {
  id: string;
  who: string;
  request: { key: string; value: string }[];
  scope: Record<string, string[]>;
  source: string;
  view: CardView;
};

export type DemoRole = {
  id: string;
  tab: string;
  question: string;
  openScope: string;
  card: HeroCard;
};

export const SYSTEMS = ["Entra ID", "SAP SD", "HRIS", "LMS · MCP"];

const WAREHOUSE_SOURCES: ReadonlySet<string> = new Set(["SAP SD", "WMS"]);

const CARDS = HERO_CARDS as unknown as HeroCard[];

function cardOf(id: string): HeroCard {
  const card = CARDS.find((entry) => entry.id === id);
  if (!card) throw new Error(`Missing hero card ${id}; run bun run site:cards`);
  return card;
}

export const DEMO_ROLES: DemoRole[] = [
  { id: "exec", tab: "ผู้บริหาร", question: "เดือนที่แล้วรายได้มาจากช่องทางไหนบ้าง", openScope: "ทั้งประเทศ", card: cardOf("exec") },
  { id: "rsm", tab: "ผู้จัดการภาค", question: "ยอดขายรายสัปดาห์เทียบปีที่แล้วเป็นยังไง", openScope: "ทั้งประเทศ", card: cardOf("rsm") },
  { id: "rep", tab: "พนักงานขาย", question: "เอเย่นต์ไหนยอดตกมากที่สุด ควรไปเยี่ยมก่อน", openScope: "ทั้งประเทศ", card: cardOf("rep") },
  { id: "hr", tab: "HR", question: "ในฝ่ายผลิตมีใครเสี่ยงลาออกบ้าง", openScope: "ทุกฝ่าย", card: cardOf("hr") },
];

export function scopeText(role: DemoRole): string {
  const entries = Object.entries(role.card.scope);
  if (entries.length === 0) return `ไม่จำกัด · ${role.openScope}`;
  return entries.map(([dim, values]) => `${dim} = ${values.map((value) => `"${value}"`).join(", ")}`).join(" · ");
}

export function scopeLabel(role: DemoRole): string {
  const regions = role.card.scope.region;
  if (!regions || regions.length === 0) return role.openScope;
  return regions.includes("north") ? "ภาคเหนือ" : regions.join(", ");
}

export function stepsOf(role: DemoRole): string[] {
  const source = role.card.source;
  const read = WAREHOUSE_SOURCES.has(source) ? `อ่านจาก ${source} ผ่านคลังข้อมูล` : `อ่านจาก ${source}`;
  return [`รู้ว่าเป็น ${role.card.who}`, `ใส่ขอบเขต: ${scopeLabel(role)}`, read, "ซ่อนกลุ่มเล็ก · บันทึก audit"];
}
