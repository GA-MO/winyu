import { describe, expect, test } from "bun:test";
import type { OutboxEntry } from "@/lib/contracts";
import { mailboxOf } from "./folders";

function mail(id: string, kind: OutboxEntry["kind"], fromUserId: string, toUserId: string, at: string): OutboxEntry {
  return { id, at, kind, fromUserId, toUserId, toEmail: `${toUserId}@x`, subject: id, body: id, refId: null };
}

const SHARE = mail("share", "share", "u_thana", "u_krit", "2026-10-09T02:00:00.000Z");
const DIGEST = mail("digest", "digest", "u_krit", "u_krit", "2026-10-09T01:00:00.000Z");
const EMAIL = mail("email", "email", "u_siriporn", "u_krit", "2026-10-09T03:00:00.000Z");
const ENTRIES = [SHARE, DIGEST, EMAIL];

describe("the demo mailbox", () => {
  test("a share lands in the recipient's inbox and the sender's sent", () => {
    expect(mailboxOf(ENTRIES, "u_krit").inbox.map((entry) => entry.id)).toEqual(["email", "share", "digest"]);
    expect(mailboxOf(ENTRIES, "u_thana")).toEqual({ inbox: [], sent: [SHARE] });
  });

  test("a digest is in the recipient's inbox and in no one's sent", () => {
    for (const userId of ["u_krit", "u_thana", "u_siriporn"]) expect(mailboxOf(ENTRIES, userId).sent).not.toContain(DIGEST);
    expect(mailboxOf(ENTRIES, "u_krit").inbox).toContain(DIGEST);
  });
});
