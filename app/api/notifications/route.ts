import { requireAccess, unauthenticated } from "../_guard";
import { notifications } from "@/lib/server/agent/collections";

const MAX_ITEMS = 20;

export async function GET() {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const items = notifications()
    .where((item) => item.userId === access.userId)
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, MAX_ITEMS);
  return Response.json({ notifications: items, unread: items.filter((item) => !item.read).length });
}

export async function POST() {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const store = notifications();
  for (const item of store.where((entry) => entry.userId === access.userId && !entry.read)) store.put({ ...item, read: true });
  return Response.json({ ok: true });
}
