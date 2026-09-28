import { createHmac, timingSafeEqual } from "node:crypto";
import type { AccessContext } from "@/lib/contracts";

export const IDENTITY_HEADERS = { user: "x-winyu-user", role: "x-winyu-role", regions: "x-winyu-regions", signature: "x-winyu-signature" } as const;

const WINYU_ITSELF = "winyu";
const ALL = "all";

export type SignedIdentity = { userId: string; role: string; regions: string };

function payloadOf(identity: SignedIdentity): string {
  return `${identity.userId}|${identity.role}|${identity.regions}`;
}

function signatureOf(identity: SignedIdentity, secret: string): string {
  return createHmac("sha256", secret).update(payloadOf(identity)).digest("hex");
}

/** Headers that tell a connector who is asking, signed with a secret only Winyu and that server hold; null access means Winyu itself. */
export function signedIdentityHeaders(access: AccessContext | null, secret: string): Record<string, string> {
  const identity: SignedIdentity = access
    ? { userId: access.userId, role: access.role, regions: access.regions === ALL ? ALL : access.regions.join(",") }
    : { userId: WINYU_ITSELF, role: WINYU_ITSELF, regions: ALL };
  return {
    [IDENTITY_HEADERS.user]: identity.userId,
    [IDENTITY_HEADERS.role]: identity.role,
    [IDENTITY_HEADERS.regions]: identity.regions,
    [IDENTITY_HEADERS.signature]: signatureOf(identity, secret),
  };
}

/** The identity on a request when its signature holds, else null. */
export function verifiedIdentity(headers: Headers, secret: string): SignedIdentity | null {
  const identity = { userId: headers.get(IDENTITY_HEADERS.user) ?? "", role: headers.get(IDENTITY_HEADERS.role) ?? "", regions: headers.get(IDENTITY_HEADERS.regions) ?? "" };
  const given = Buffer.from(headers.get(IDENTITY_HEADERS.signature) ?? "", "hex");
  const expected = Buffer.from(signatureOf(identity, secret), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected) ? identity : null;
}
