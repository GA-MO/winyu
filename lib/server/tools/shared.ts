import type { RoleId } from "@/lib/contracts";
import { ROLE_IDS } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";

export const ALL_BUT_SALES_REP: readonly RoleId[] = ROLE_IDS.filter((role) => role !== "sales_rep");

export function now(): string {
  return new Date().toISOString();
}

export function recipient(toUserId: string) {
  const user = findUser(toUserId);
  return user ? { ok: true as const, user } : { ok: false as const, error: `ไม่พบผู้ใช้ ${toUserId} ในระบบ` };
}
