import { describe, expect, test } from "bun:test";
import { readRecordings } from "@/lib/eval/recording";
import { TH } from "@/lib/i18n/th";
import { toolLabelsByName, toolSurface, winyuTool } from "@/lib/server/tools/registry";
import { toolActionOf, type ToolAction } from "./tool-action";

const LABELS = { crm__visits: "ดูบันทึกการเยี่ยมร้าน" };
const SECRET = "ลับเฉพาะ-7731";
const BUDDHIST_OFFSET = 543;
const SHORT_YEAR = 100;
const DIGITS = /\d+/g;
const YEAR = /\b(\d{4})-\d{2}/g;

function line({ action, detail }: ToolAction): string {
  return TH.trail.now(action, detail);
}

function allowedNumbers(args: unknown): Set<string> {
  const json = JSON.stringify(args);
  const allowed = new Set((json.match(DIGITS) ?? []).flatMap((run) => [run, String(Number(run))]));
  for (const [, year] of json.matchAll(YEAR)) {
    const buddhist = Number(year) + BUDDHIST_OFFSET;
    allowed.add(String(buddhist));
    allowed.add(String(buddhist % SHORT_YEAR).padStart(2, "0"));
  }
  return allowed;
}

describe("toolActionOf", () => {
  test("a metric read names the certified metric, the split, the region and the month from its arguments", () => {
    const action = toolActionOf("query_metric", { metric: "net_sales_value", dims: ["region"], filters: { region: ["northeast"] }, range: { from: "2026-09-01", to: "2026-09-30" }, grain: "month", compare: "target", limit: null }, LABELS);
    expect(line(action)).toBe("กำลังดึงมูลค่าขายเข้า แยกตามภาค · ภาคอีสาน · ก.ย. 69");
    expect(TH.trail.done(action.action)).toBe("ดึงมูลค่าขายเข้าแล้ว");
    expect(action.kind).toBe("read");
  });

  test("people, alerts, the partner agent and a write each read as what they do", () => {
    expect(line(toolActionOf("get_person", { id: "u_oat", name: null }, LABELS))).toBe("กำลังดูข้อมูลคุณโอ๊ต พัฒนพงศ์");
    expect(line(toolActionOf("get_alerts", { status: "open", limit: 5 }, LABELS))).toBe("กำลังดูความผิดปกติ");
    expect(line(toolActionOf("ask_logistics_partner", { dc: "nope" }, LABELS))).toBe("กำลังถาม Siam Freight เรื่องรถที่กำลังไปศูนย์กระจายสินค้า");
    expect(toolActionOf("pin_widget", { title: "ยอดขายอีสาน" }, LABELS)).toEqual({ action: "เตรียมปักการ์ดบน Dashboard", detail: "“ยอดขายอีสาน”", kind: "write" });
  });

  test("arguments still streaming in (not yet JSON) name the tool without detail", () => {
    expect(line(toolActionOf("query_metric", '{"metric":"net_sa', LABELS))).toBe("กำลังดึงข้อมูล");
  });

  test("a connector tool reads as its Thai label and shows none of its arguments; an unknown tool falls back to a plain phrase", () => {
    expect(toolActionOf("crm__visits", { shop: SECRET }, LABELS)).toEqual({ action: "ดูบันทึกการเยี่ยมร้าน", detail: null, kind: "read" });
    expect(line(toolActionOf("other__thing", { note: SECRET }, LABELS))).toBe("กำลังใช้เครื่องมือ");
  });

  test("no argument a tool redacts ever reaches its line, while one it does not redact can", () => {
    const labels = toolLabelsByName();
    for (const entry of toolSurface()) {
      const redact = winyuTool(entry.name)?.capability.redact ?? [];
      const args = Object.fromEntries(redact.map((field) => [field, SECRET]));
      expect({ tool: entry.name, line: line(toolActionOf(entry.name, args, labels)) }).toEqual({ tool: entry.name, line: expect.not.stringContaining(SECRET) });
    }
    expect(line(toolActionOf("search_documents", { query: SECRET }, labels))).toBe("กำลังค้นเอกสารบริษัท");
    expect(line(toolActionOf("pin_widget", { title: SECRET }, labels))).toContain(SECRET);
  });

  test("across every recorded call, no number appears that its arguments do not hold", () => {
    const labels = toolLabelsByName();
    let checked = 0;
    for (const recording of readRecordings().values()) {
      for (const step of recording.steps) {
        if (step.kind !== "call") continue;
        const action = toolActionOf(step.tool, step.args, labels);
        const printed = `${line(action)} ${TH.trail.done(action.action)}`.match(DIGITS) ?? [];
        const allowed = allowedNumbers(step.args);
        expect({ tool: step.tool, stray: printed.filter((number) => !allowed.has(number)) }).toEqual({ tool: step.tool, stray: [] });
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
});
