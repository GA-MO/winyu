import { cookies } from "next/headers";
import { chatHandler } from "@/lib/server/agent/handler";
import { runWithAccess } from "@/lib/server/request-context";
import { readAccess } from "@/lib/server/session";

const UNAUTHENTICATED = { error: "กรุณาเข้าสู่ระบบก่อน" };

export const maxDuration = 60;

export async function GET() {
  return chatHandler.GET();
}

export async function POST(req: Request) {
  const access = readAccess(await cookies());
  if (!access) return Response.json(UNAUTHENTICATED, { status: 401 });
  return runWithAccess(access, () => chatHandler.POST(req));
}
