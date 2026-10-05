"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { findUser } from "@/lib/data/entities/users";
import { configuredTenantId } from "@/lib/server/auth/entra";
import { dismissAttempt, identityLinks, linkIdentity, pendingAttempt, unlinkIdentity, type IdentityKey } from "@/lib/server/identity";
import { readUser } from "@/lib/server/session";

const ADMIN_PATH = "/admin";
const OBJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function adminId(): Promise<string | null> {
  const user = readUser(await cookies());
  return user && user.role === "it_admin" ? user.id : null;
}

function userIn(formData: FormData): string | null {
  return findUser(String(formData.get("user")))?.id ?? null;
}

function textIn(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value.length > 0 ? value : null;
}

function pendingKeyIn(formData: FormData): IdentityKey | null {
  return pendingAttempt(String(formData.get("identity")) as IdentityKey)?.id ?? null;
}

function linkedKeyIn(formData: FormData): IdentityKey | null {
  const key = String(formData.get("identity"));
  return identityLinks().find((link) => link.id === key)?.id ?? null;
}

export async function grantAttemptAction(formData: FormData) {
  const by = await adminId();
  const key = pendingKeyIn(formData);
  const userId = userIn(formData);
  const attempt = key ? pendingAttempt(key) : null;
  if (!by || !attempt || !userId) return;
  const { provider, tenant, subject, email, name } = attempt;
  linkIdentity({ provider, tenant, subject, email, name }, userId, by, new Date().toISOString());
  revalidatePath(ADMIN_PATH);
}

export async function dismissAttemptAction(formData: FormData) {
  const by = await adminId();
  const key = pendingKeyIn(formData);
  if (!by || !key) return;
  dismissAttempt(key);
  revalidatePath(ADMIN_PATH);
}

export async function unlinkIdentityAction(formData: FormData) {
  const by = await adminId();
  const key = linkedKeyIn(formData);
  if (!by || !key) return;
  unlinkIdentity(key);
  revalidatePath(ADMIN_PATH);
}

export async function linkObjectIdAction(formData: FormData) {
  const by = await adminId();
  const tenant = configuredTenantId();
  const objectId = textIn(formData, "objectId")?.toLowerCase() ?? "";
  const userId = userIn(formData);
  if (!by || !tenant || !OBJECT_ID.test(objectId) || !userId) return;
  linkIdentity({ provider: "entra", tenant, subject: objectId, email: textIn(formData, "email"), name: null }, userId, by, new Date().toISOString());
  revalidatePath(ADMIN_PATH);
}
