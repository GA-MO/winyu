import { randomUUID } from "node:crypto";
import { describeEntity, listMetrics, runMetric } from "@/lib/data/query";
import { ALCOHOL_BAN_DATES, FESTIVAL_WINDOWS, THAI_HOLIDAYS } from "@/lib/data/entities/calendar";
import { COURSES } from "@/lib/data/entities/courses";
import { EMPLOYEES, OPEN_POSITIONS } from "@/lib/data/entities/people";
import {
  ANNUAL_LEAVE_STEPS,
  ANNUAL_NOTICE_WORKDAYS,
  BENEFITS_POLICY,
  LEAVE_POLICY,
  PERSONAL_LEAVE_DAYS,
  SICK_LEAVE_DAYS,
  leaveUsedThisYear,
} from "@/lib/data/entities/policies";
import { CANDIDATES } from "@/lib/data/entities/recruiting";
import { INCIDENTS, SITES } from "@/lib/data/entities/sites";
import { outbox } from "@/lib/server/agent/collections";
import type { Ports } from "./index";

/** The demo tenant: every port answered from the deterministic generator, mail delivered to the in-app outbox. */
export const GENERATOR_PORTS: Ports = {
  metrics: {
    runMetric: async (query, access) => runMetric(query, access),
    listMetrics: async (search) => listMetrics(search),
    describeEntity: async (kind, query) => describeEntity(kind, query),
  },
  directory: { load: async () => ({ employees: EMPLOYEES, openPositions: OPEN_POSITIONS }) },
  recruiting: { candidates: async () => CANDIDATES },
  learning: { courses: async () => COURSES },
  leave: {
    policy: async () => ({
      leaveSections: LEAVE_POLICY,
      benefitSections: BENEFITS_POLICY,
      annualSteps: ANNUAL_LEAVE_STEPS,
      sickDays: SICK_LEAVE_DAYS,
      personalDays: PERSONAL_LEAVE_DAYS,
      annualNoticeWorkdays: ANNUAL_NOTICE_WORKDAYS,
    }),
    usedThisYear: async (employeeId) => leaveUsedThisYear(employeeId),
  },
  sites: { load: async () => ({ sites: SITES, incidents: INCIDENTS }) },
  calendar: { load: async () => ({ holidays: THAI_HOLIDAYS, alcoholBanDates: ALCOHOL_BAN_DATES, festivals: FESTIVAL_WINDOWS }) },
  mail: { send: async (message) => outbox().put({ ...message, id: randomUUID(), at: new Date().toISOString() }) },
};
