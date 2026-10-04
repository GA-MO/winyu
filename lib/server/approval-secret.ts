import { randomBytes } from "node:crypto";
import { collection } from "@/lib/server/store/json-store";

export const SECRETS_COLLECTION = "secrets";

const APPROVAL_SECRET_ENV = "WINYU_APPROVAL_SECRET";
const SECRET_ID = "tool-approval";
const SECRET_BYTES = 32;

type Secret = { id: string; value: string };

/** The key approvals are signed with: WINYU_APPROVAL_SECRET when set, else one random key kept in `.data` so a pending approval survives a restart. */
export function approvalSecret(): string {
  const fromEnv = process.env[APPROVAL_SECRET_ENV];
  if (fromEnv) return fromEnv;
  const secrets = collection<Secret>(SECRETS_COLLECTION);
  return secrets.get(SECRET_ID)?.value ?? secrets.put({ id: SECRET_ID, value: randomBytes(SECRET_BYTES).toString("hex") }).value;
}
