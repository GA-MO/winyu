import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SECRET_HINT_CHARS } from "@/lib/connectors/spec";
import { collection } from "@/lib/server/store/json-store";

export const CONNECTOR_KEY_ENV = "WINYU_CONNECTOR_KEY";
export const CONNECTOR_SECRETS_COLLECTION = "connector-secrets";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const CIPHER = "aes-256-gcm";
const HEX_KEY = /^[0-9a-f]{64}$/i;

/** One connector's secret as it rests on disk: AES-256-GCM under the server key, bound to the connector id, with its last characters for the admin. */
type SealedSecret = { id: string; iv: string; tag: string; data: string; hint: string; at: string; by: string };

function sealed() {
  return collection<SealedSecret>(CONNECTOR_SECRETS_COLLECTION);
}

/** The key secrets are sealed with, from server env (32 bytes as base64 or hex); null when unset or malformed, which makes the console read-only. */
export function connectorKey(): Buffer | null {
  const raw = process.env[CONNECTOR_KEY_ENV]?.trim();
  if (!raw) return null;
  const key = HEX_KEY.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return key.length === KEY_BYTES ? key : null;
}

export function hintOf(secret: string): string {
  return secret.slice(-SECRET_HINT_CHARS);
}

/** Seals and stores a connector's secret; refuses (null) without a valid key, so a secret is never written in plain text. */
export function sealSecret(connector: string, secret: string, by: string): { hint: string } | null {
  const key = connectorKey();
  if (!key) return null;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, key, iv).setAAD(Buffer.from(connector));
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const hint = hintOf(secret);
  sealed().put({ id: connector, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64"), hint, at: new Date().toISOString(), by });
  return { hint };
}

/** A connector's secret in plain text for the server's own use; null without the key, without a stored secret, or when it does not decrypt under this key. */
export function openSecret(connector: string): string | null {
  const key = connectorKey();
  const entry = sealed().get(connector);
  if (!key || !entry) return null;
  try {
    const decipher = createDecipheriv(CIPHER, key, Buffer.from(entry.iv, "base64")).setAAD(Buffer.from(connector));
    decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(entry.data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
