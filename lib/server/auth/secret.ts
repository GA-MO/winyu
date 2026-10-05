import { randomBytes } from "node:crypto";
import { collection } from "@/lib/server/store/json-store";
import { SECRETS_COLLECTION } from "@/lib/server/approval-secret";

const SESSION_SECRET_ENV = "MASCOP_SESSION_SECRET";
const SECRET_ID = "session";
const SECRET_BYTES = 32;
const MIN_SECRET_LENGTH = 32;

type Secret = { id: string; value: string };

/** The key sessions are signed with: MASCOP_SESSION_SECRET when set (at least 32 characters), else one random key kept in `.data`. */
export function sessionSecret(): string {
  const fromEnv = process.env[SESSION_SECRET_ENV];
  if (fromEnv && fromEnv.length < MIN_SECRET_LENGTH) throw new Error(`${SESSION_SECRET_ENV} must be at least ${MIN_SECRET_LENGTH} characters`);
  if (fromEnv) return fromEnv;
  const secrets = collection<Secret>(SECRETS_COLLECTION);
  return secrets.get(SECRET_ID)?.value ?? secrets.put({ id: SECRET_ID, value: randomBytes(SECRET_BYTES).toString("hex") }).value;
}
