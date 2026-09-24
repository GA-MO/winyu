import type { z } from "zod";
import { findPeopleInputSchema } from "@/lib/contracts";
import { findPeople } from "@/lib/server/people";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

export const findPeopleTool = defineTool({
  name: "find_people",
  connector: "hris",
  tier: "read",
  roles: "all",
  description: "List employees with their photo, title, place and status badges: a team (manager = the lead's id or name), a region, a department (dept_sales, dept_production, dept_hr, ...) or a flag (new, risk, cert_expiring, overtime, retiring). Rows come lead first, at most 12, plus the open positions in scope. Call it when the user asks who is on a team, who is new, whose licence expires, who works too much overtime. It never returns numbers to chart; use query_metric for headcount and attrition.",
  input: findPeopleInputSchema,
  execute: async (input: z.infer<typeof findPeopleInputSchema>) =>
    findPeople(currentAccess(), { region: input.region, departmentId: input.department, manager: input.manager, query: input.query, flag: input.flag }),
});
