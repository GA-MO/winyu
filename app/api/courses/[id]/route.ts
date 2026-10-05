import { notFound, requireAccess, unauthenticated } from "../../_guard";
import { findCourse } from "@/lib/server/courses";

type RouteContext = { params: Promise<{ id: string }> };

/** The title and dates of one course, for the card that asks the user to approve an enrolment. */
export async function GET(_req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const course = await findCourse((await context.params).id);
  if (!course) return notFound();
  return Response.json({ id: course.id, title: course.titleTh, starts: course.starts, days: course.days });
}
