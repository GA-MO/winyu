import type { SpecElement } from "vexa/protocol";

export type Elements = Record<string, SpecElement>;
export type RowBadge = { label: string; tone: string | null };
export type PersonRowLike = { id: string; name: string; title: string; place: string; photo: string | null; tenure: string | null; badges: RowBadge[] };


export function element(type: string, props: Record<string, unknown>, children: string[] = []): SpecElement {
  return { type, props, children } as SpecElement;
}

/** A Vexa button that asks the chat to run one tool with this input (the model sees it as a button press). */
export function toolButton(label: string, name: string, input: Record<string, unknown>, variant: "primary" | "secondary" = "secondary"): SpecElement {
  return { type: "Button", props: { label, variant }, children: [], on: { press: { action: "runTool", params: { name, input } } } } as unknown as SpecElement;
}

/** A Vexa button that puts a follow-up question into the chat, as if the user typed it. */
export function askButton(label: string, prompt: string): SpecElement {
  return toolButton(label, "ask", { prompt });
}

/** Adds a horizontal row of Badges for a tool row's badges; returns its key, or null when there are none. */
export function addBadges(elements: Elements, key: string, badges: RowBadge[]): string | null {
  if (badges.length === 0) return null;
  badges.forEach((badge, index) => {
    elements[`${key}_${index}`] = element("Badge", { label: badge.label, tone: badge.tone ?? "neutral" });
  });
  elements[key] = element("Stack", { direction: "horizontal", gap: "sm" }, badges.map((_, index) => `${key}_${index}`));
  return key;
}

/** A Vexa ListItem whose whole row asks a follow-up question when pressed. */
export function askRow(props: Record<string, unknown>, prompt: string): SpecElement {
  return { type: "ListItem", props, children: [], on: { press: { action: "runTool", params: { name: "ask", input: { prompt } } } } } as unknown as SpecElement;
}

/** Adds one person as a pressable ListItem: portrait, title, place and tenure, their badges; pressing asks for the profile. */
export function addPerson(elements: Elements, key: string, row: PersonRowLike): string {
  const detail = [row.place, row.tenure].filter(Boolean).join(" · ");
  elements[key] = askRow({ title: row.name, subtitle: row.title, detail, src: row.photo, media: "avatar", badges: row.badges, trailing: null, trailingTone: null }, `ขอดูโปรไฟล์${row.name}`);
  return key;
}
