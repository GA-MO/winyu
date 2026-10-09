import { z } from "zod";
import type { Course } from "@/lib/contracts";
import { lmsDemoEnv } from "@/lib/server/connectors/lms-demo-config";
import { MCP_DEFAULT_TIMEOUT_MS, type McpEndpoint } from "./mcp-port";

export const courseSchema = z.object({
  id: z.string(),
  titleTh: z.string(),
  categoryTh: z.string(),
  cover: z.string(),
  format: z.enum(["classroom", "online", "field"]),
  placeTh: z.string(),
  starts: z.string(),
  days: z.number(),
  seats: z.number(),
  enrolled: z.number(),
  audienceTh: z.string(),
  renewsCertificate: z.string().nullable(),
  departmentIds: z.array(z.string()).readonly().nullable(),
}) satisfies z.ZodType<Course>;

/** The LMS's contract for Winyu's learning port, served beside its training history: the course catalogue with seats and dates. */
export const LEARNING_MCP_TOOLS = {
  list_courses: {
    description: "Every scheduled course in the catalogue with its dates, place, format, seats and how many have enrolled, and the certificate it renews.",
    input: z.object({}),
    output: z.object({ courses: z.array(courseSchema) }),
  },
} as const;

/** The LMS's endpoint: the same server and secret as its training history connector, and how long Winyu waits for the catalogue. */
export function learningMcpEnv(): McpEndpoint {
  return { ...lmsDemoEnv(), timeoutMs: Number(process.env.WINYU_LMS_MCP_TIMEOUT_MS ?? MCP_DEFAULT_TIMEOUT_MS) };
}
