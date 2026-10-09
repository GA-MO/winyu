"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { GRANT_DAYS, ROLE_IDS, type GrantDays, type RoleId } from "@/lib/contracts";
import { approveRequest, declineRequest, grantRequestPath, revokeGrant, setGrantAuthority } from "@/lib/server/grants";
import { readUser } from "@/lib/server/session";

const ADMIN_PATH = "/admin";

function daysIn(formData: FormData): GrantDays | null {
  const days = Number(formData.get("days"));
  return GRANT_DAYS.find((allowed) => allowed === days) ?? null;
}

function textIn(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

/** The approver grants the request for the days pressed; a refusal at decision time comes back on the page. */
export async function approveGrantAction(formData: FormData) {
  const user = readUser(await cookies());
  const id = textIn(formData, "request");
  const days = daysIn(formData);
  if (!user || !days) return;
  const outcome = await approveRequest(id, user, days);
  if (!outcome.ok && outcome.problem === "refused") redirect(`${grantRequestPath(id)}?refused=${outcome.refusal.code}`);
  revalidatePath(grantRequestPath(id));
}

export async function declineGrantAction(formData: FormData) {
  const user = readUser(await cookies());
  const id = textIn(formData, "request");
  if (!user) return;
  await declineRequest(id, user);
  revalidatePath(grantRequestPath(id));
}

/** Its grantor or IT ends a grant now. */
export async function revokeGrantAction(formData: FormData) {
  const user = readUser(await cookies());
  if (!user) return;
  revokeGrant(textIn(formData, "grant"), user);
  const back = textIn(formData, "back");
  revalidatePath(back.startsWith("/") ? back : ADMIN_PATH);
}

/** IT sets which domains a role may grant. */
export async function setGrantAuthorityAction(formData: FormData) {
  const user = readUser(await cookies());
  const role = textIn(formData, "role");
  if (!user || user.role !== "it_admin" || !ROLE_IDS.includes(role as RoleId)) return;
  setGrantAuthority(role as RoleId, formData.getAll("domain").map(String), user.id);
  revalidatePath(ADMIN_PATH);
}
