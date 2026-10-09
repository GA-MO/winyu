import { z } from "zod";
import { badRequest, readBody, requireAccess, unauthenticated } from "../_guard";
import { inboxCountsFor } from "@/lib/server/inbox";
import { markHomeRead } from "@/lib/server/notify";

const readSchema = z.object({ home: z.enum(["inbox", "shared"]) });

/** What the bell and the rail show: decisions waiting in the Inbox, and unread shares. */
export async function GET() {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  return Response.json(inboxCountsFor(access.userId));
}

/** Marks read the person's notifications that live in one home, once they open it. */
export async function POST(req: Request) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const parsed = readSchema.safeParse(await readBody<unknown>(req));
  if (!parsed.success) return badRequest();
  markHomeRead(access.userId, parsed.data.home);
  return Response.json({ ok: true });
}
