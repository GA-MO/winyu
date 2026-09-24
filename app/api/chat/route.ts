import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { handlerFor } from "@/lib/server/agent/handler";
import { runWithAccess, runWithTurn, type TurnContext } from "@/lib/server/request-context";
import { readAccess } from "@/lib/server/session";

const UNAUTHENTICATED = { error: "กรุณาเข้าสู่ระบบก่อน" };

export const maxDuration = 60;

const QUESTION_MAX_CHARS = 300;

type MessagePart = { type?: unknown; text?: unknown };
type ChatBody = { context?: { threadId?: unknown; preloadPacketId?: unknown }; messages?: { role?: unknown; parts?: MessagePart[] }[] };

function questionOf(body: ChatBody | null): string | null {
  const lastUser = [...(body?.messages ?? [])].reverse().find((message) => message.role === "user");
  const text = (lastUser?.parts ?? []).flatMap((part) => (part.type === "text" && typeof part.text === "string" ? [part.text] : [])).join(" ").trim();
  return text ? text.slice(0, QUESTION_MAX_CHARS) : null;
}

function turnOf(body: ChatBody | null): TurnContext {
  const context = body?.context ?? {};
  return {
    turnId: randomUUID(),
    threadId: typeof context.threadId === "string" ? context.threadId : null,
    preloadPacketId: typeof context.preloadPacketId === "string" ? context.preloadPacketId : null,
    question: questionOf(body),
    queries: [],
  };
}

export async function GET() {
  const access = readAccess(await cookies());
  if (!access) return Response.json(UNAUTHENTICATED, { status: 401 });
  return handlerFor(access).GET();
}

export async function POST(req: Request) {
  const access = readAccess(await cookies());
  if (!access) return Response.json(UNAUTHENTICATED, { status: 401 });
  const raw = await req.text();
  const body = JSON.parse(raw) as ChatBody | null;
  const replayed = new Request(req.url, { method: "POST", headers: req.headers, body: raw });
  return runWithAccess(access, () => runWithTurn(turnOf(body), () => handlerFor(access).POST(replayed)));
}
