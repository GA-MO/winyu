import { z } from "zod";
import { badRequest, readBody, requireAccess, unauthenticated } from "../_guard";
import { inboxCountsFor } from "@/lib/server/inbox";
import { markAllRead, markHomeRead, markOneRead, markUpdatesRead } from "@/lib/server/notify";

const readSchema = z.union([z.object({ home: z.enum(["inbox", "shared"]) }), z.object({ id: z.string().min(1) }), z.object({ all: z.literal(true) }), z.object({ updates: z.literal(true) })]);

/** What the bell and the rail show: decisions waiting in the Inbox, and unread shares. */
export async function GET() {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  return Response.json(inboxCountsFor(access.userId));
}

/** Marks read the person's notifications in one home once they open it, the one they opened, the updates the bell showed them, or all of them. */
export async function POST(req: Request) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const parsed = readSchema.safeParse(await readBody<unknown>(req));
  if (!parsed.success) return badRequest();
  const read = parsed.data;
  if ("home" in read) markHomeRead(access.userId, read.home);
  else if ("id" in read) markOneRead(access.userId, read.id);
  else if ("updates" in read) markUpdatesRead(access.userId);
  else markAllRead(access.userId);
  return Response.json({ ok: true });
}
