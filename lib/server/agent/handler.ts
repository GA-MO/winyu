import { stepCountIs, tool } from "ai";
import { z } from "zod";
import { createVexaHandler, type PersonaContext } from "vexa/server";
import { findUser } from "@/lib/data/entities/users";
import { models } from "@/lib/server/models";
import { currentAccess } from "@/lib/server/request-context";

const MAX_STEPS = 4;
const BUDDHIST_YEAR_OFFSET = 543;

const ping = tool({
  description: "Health check that returns who is asking; use it when the user says ping.",
  inputSchema: z.object({ note: z.string().nullable() }),
  execute: async () => {
    const access = currentAccess();
    return { ok: true, summary: "pong", data: { userId: access.userId, role: access.role } };
  },
});

function buddhistDate(today: string) {
  const [year, month, day] = today.split("-");
  return `${day}/${month}/${Number(year) + BUDDHIST_YEAR_OFFSET}`;
}

function persona({ today }: PersonaContext): string[] {
  const access = currentAccess();
  const user = findUser(access.userId);
  const name = user?.nameTh ?? access.userId;
  const title = user?.title ?? access.role;
  return [
    `คุณคือ Cop ผู้ช่วยข้อมูลภายในของบริษัทเครื่องดื่ม กำลังคุยกับ ${name} (${title}, บทบาท ${access.role})`,
    `วันนี้คือ ${today} (${buddhistDate(today)} พ.ศ.)`,
    "ตอบเป็นภาษาไทย กระชับ 1–3 ประโยค แล้วให้ UI แสดงข้อมูล",
    "ทุกตัวเลขต้องมาจากผลลัพธ์ tool ในบทสนทนานี้ ถ้าไม่มีข้อมูล ให้บอกว่าไม่มี",
  ];
}

export const chatHandler = createVexaHandler({
  models,
  persona,
  tools: { ping },
  stopWhen: stepCountIs(MAX_STEPS),
});
