import { z } from "zod";
import type { AccessContext } from "@/lib/contracts";
import { peopleViewOf } from "@/lib/access/people-scope";
import { ports } from "@/lib/server/ports";
import { directoryOf } from "@/lib/server/ports/directory";
import { defineMcpConnector } from "./define";
import { LMS_DEMO_ID, LMS_DEMO_TOOL, lmsDemoEnv } from "./lms-demo-config";
import { signedIdentityHeaders } from "./signed-identity";
import type { ConnectorRow } from "./types";

const TIMEOUT_MS = 4000;
const VIEWS_WITH_TRAINING = new Set(["team", "hr"]);

async function onlyPeopleInView(rows: ConnectorRow[], access: AccessContext): Promise<ConnectorRow[]> {
  const directory = directoryOf(await ports().directory.load());
  return rows.filter((row) => {
    const employee = directory.byId(String(row.employee_id));
    const view = employee ? peopleViewOf(access, employee, directory) : null;
    return view !== null && VIEWS_WITH_TRAINING.has(view);
  });
}

/** The demo LMS behind MCP: training history per person, asked as the signed-in user, kept to the people Cop says they may see. */
export const lmsDemoConnector = defineMcpConnector({
  id: LMS_DEMO_ID,
  labelTh: "LMS (MCP)",
  sourceSystemTh: "LMS ภายนอกผ่าน MCP (เดโม)",
  transport: { type: "http", url: lmsDemoEnv().url },
  auth: (access) => signedIdentityHeaders(access, lmsDemoEnv().secret),
  timeoutMs: TIMEOUT_MS,
  tools: {
    [LMS_DEMO_TOOL]: {
      labelTh: "ดูประวัติการอบรม",
      bodyTh: "หลักสูตรที่เคยเรียนและใบรับรองของแต่ละคนจากระบบอบรม เห็นเฉพาะตัวเองและคนในสายบังคับบัญชา",
      description:
        "Training history from the learning system: courses a person completed and certificates with expiry, one row per course or certificate with Thai labels. employeeId or name picks one person; both null means the viewer and the people they manage. Call it for ประวัติการอบรม / เคยอบรมอะไรมาแล้ว questions about named people or the viewer. Not for courses open to enroll (list_courses) and not for who has certificates expiring (find_people flag cert_expiring). Rows outside the viewer's line come back as out of scope.",
      tier: "read",
      roles: "all",
      input: z.object({ employeeId: z.string().nullable(), name: z.string().nullable(), regions: z.string().nullable() }),
      scope: [
        { kind: "inject", args: (access) => (access.regions === "all" ? {} : { regions: access.regions.join(",") }) },
        { kind: "filter", rows: onlyPeopleInView },
      ],
      sensitive: [{ field: "score", labelTh: "คะแนนสอบของหลักสูตร", full: ["ceo", "hr_manager"], masked: ["sales_director", "sales_rsm"] }],
    },
  },
});
