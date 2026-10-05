import { cookies } from "next/headers";
import type { AccessContext } from "@/lib/contracts";
import { readAccess } from "@/lib/server/session";

const UNAUTHENTICATED = { error: "กรุณาเข้าสู่ระบบก่อน" };
const NOT_FOUND = { error: "ไม่พบรายการนี้" };
const BAD_REQUEST = { error: "คำขอไม่ถูกต้อง" };

export async function requireAccess(): Promise<AccessContext | null> {
  return readAccess(await cookies());
}

export function unauthenticated() {
  return Response.json(UNAUTHENTICATED, { status: 401 });
}

export function notFound() {
  return Response.json(NOT_FOUND, { status: 404 });
}

export function badRequest() {
  return Response.json(BAD_REQUEST, { status: 400 });
}

export async function readBody<T>(req: Request): Promise<T | null> {
  return (await req.json().catch(() => null)) as T | null;
}
