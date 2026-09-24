import type { z } from "zod";
import { listCoursesInputSchema } from "@/lib/contracts";
import { listCourses } from "@/lib/server/courses";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

export const listCoursesTool = defineTool({
  name: "list_courses",
  connector: "lms",
  tier: "read",
  roles: "all",
  description: "List upcoming training courses: cover photo, date and length, place and format, seats left, which certificate a course renews and who in the viewer's team should go (note). month = YYYY-MM for \"เดือนนี้/เดือนหน้า\" (today is in the system prompt); null = the next ones. can_enroll says whether the viewer can still ask for a seat.",
  input: listCoursesInputSchema,
  execute: async ({ month, query }: z.infer<typeof listCoursesInputSchema>) => listCourses(currentAccess(), { month, query }),
});
