import type { MockScript, MockStep } from "vexa/mock";
import type { Spec } from "vexa/protocol";

const GREETING_SPEC: Spec = {
  root: "card",
  elements: {
    card: { type: "Card", props: { title: "สรุปวันนี้", description: "ตัวอย่างการ์ดจาก mock model" }, children: ["grid"] },
    grid: { type: "Grid", props: { columns: "2", gap: "sm" }, children: ["volume", "target"] },
    volume: { type: "Metric", props: { label: "ยอดขายรวม (ลัง)", value: "12,480", detail: "+4% เทียบสัปดาห์ก่อน", trend: "up" }, children: [] },
    target: { type: "Metric", props: { label: "ความคืบหน้าเป้า", value: "92%", detail: "เหลืออีก 8 วัน", trend: "flat" }, children: [] },
  },
};

type PingOutput = { ok?: boolean; data?: { userId?: string; role?: string } };

function afterPing(output: unknown): MockStep[] {
  const ping = output as PingOutput;
  const userId = ping.data?.userId ?? "ไม่ทราบ";
  const role = ping.data?.role ?? "ไม่ทราบ";
  return [{ text: `pong จากฝั่งเซิร์ฟเวอร์: ผู้ใช้ ${userId} บทบาท ${role}` }];
}

export const COP_MOCK_PROMPTS = ["สวัสดี", "ping"];

/** The placeholder script of phase 0: a greeting with a card, and a ping that proves tools see the request context. */
export const COP_MOCK_SCRIPT: MockScript = {
  turns: [
    { match: /ping/i, steps: [{ tool: "ping", input: { note: null }, then: afterPing }] },
    { match: /สวัสดี|hello|hi/i, steps: [{ text: "สวัสดีครับ ผมคือ Cop ผู้ช่วยข้อมูลของคุณ นี่คือตัวอย่างการ์ดที่ผมแสดงได้" }, { spec: GREETING_SPEC }] },
  ],
  prompts: COP_MOCK_PROMPTS,
};
