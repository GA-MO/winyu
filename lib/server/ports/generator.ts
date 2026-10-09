import { randomUUID } from "node:crypto";
import { readGeneratorFacts } from "@/lib/data/facts";
import { GENERATOR_MASTER } from "@/lib/data/master";
import { describeEntity, listMetrics } from "@/lib/data/query";
import { ALCOHOL_BAN_DATES, FESTIVAL_WINDOWS, THAI_HOLIDAYS } from "@/lib/data/entities/calendar";
import { EMPLOYEES, OPEN_POSITIONS } from "@/lib/data/entities/people";
import { CANDIDATES } from "@/lib/data/entities/recruiting";
import { INCIDENTS, SITES } from "@/lib/data/entities/sites";
import { outbox } from "@/lib/server/agent/collections";
import { GENERATOR_LEARNING } from "./generator-learning";
import { GENERATOR_LEAVE } from "./generator-leave";
import type { Ports } from "./index";

/** The demo tenant: every port answered from the deterministic generator, mail delivered to the in-app outbox. */
export const GENERATOR_PORTS: Ports = {
  metrics: {
    readFacts: async (requests) => requests.map(readGeneratorFacts),
    masterData: async () => GENERATOR_MASTER,
    listMetrics: async (search) => listMetrics(search),
    describeEntity: async (kind, query) => describeEntity(kind, query),
  },
  directory: { load: async () => ({ employees: EMPLOYEES, openPositions: OPEN_POSITIONS }) },
  recruiting: { candidates: async () => CANDIDATES },
  learning: GENERATOR_LEARNING,
  leave: GENERATOR_LEAVE,
  sites: { load: async () => ({ sites: SITES, incidents: INCIDENTS }) },
  calendar: { load: async () => ({ holidays: THAI_HOLIDAYS, alcoholBanDates: ALCOHOL_BAN_DATES, festivals: FESTIVAL_WINDOWS }) },
  mail: { send: async (message) => outbox().put({ ...message, id: randomUUID(), at: new Date().toISOString() }) },
};
