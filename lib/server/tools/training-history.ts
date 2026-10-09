import type { z } from "zod";
import { trainingHistoryInputSchema } from "@/lib/contracts";
import { currentAccess } from "@/lib/server/request-context";
import { trainingHistoryFor } from "@/lib/server/training";
import { defineTool } from "./define";

export const trainingHistoryTool = defineTool({
  name: "training_history",
  connector: "lms",
  tier: "read",
  roles: "all",
  description:
    "Training history from the learning system: courses a person completed and certificates with expiry, one row per course or certificate with Thai labels. employeeId or name picks one person; both null means the viewer and the people they manage. Call it for ประวัติการอบรม / เคยอบรมอะไรมาแล้ว questions about named people or the viewer. Not for courses open to enroll (list_courses) and not for who has certificates expiring (find_people flag cert_expiring). People outside the viewer's line come back as out of scope.",
  input: trainingHistoryInputSchema,
  execute: async (input: z.infer<typeof trainingHistoryInputSchema>) => trainingHistoryFor(currentAccess(), input),
});
