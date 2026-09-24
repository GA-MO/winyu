import type { z } from "zod";
import { enrollCourseInputSchema } from "@/lib/contracts";
import { enrollCourse } from "@/lib/server/courses";
import { currentAccess, currentTurn } from "@/lib/server/request-context";
import { defineTool } from "./define";

export const enrollCourseTool = defineTool({
  name: "enroll_course",
  connector: "lms",
  tier: "write",
  roles: "all",
  description: "Ask the user's manager to approve a seat on one course (courseId from list_courses) when the user presses สมัคร or asks to join. The user approves it first.",
  input: enrollCourseInputSchema,
  execute: async ({ courseId }: z.infer<typeof enrollCourseInputSchema>) => enrollCourse(currentAccess(), courseId, currentTurn().threadId),
});
