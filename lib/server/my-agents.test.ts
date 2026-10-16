import { describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { templateFor } from "@/lib/dashboard/templates";
import { AGENTS, agentsOwnedBy } from "@/lib/data/entities/agents";
import { USERS, findUser } from "@/lib/data/entities/users";
import { GENERATOR_CRM } from "./ports/generator-crm";
import { defaultActionsFor } from "./quick-actions";
import { storeVisitsFor } from "./store-visits";

const KRIT = accessFor(findUser("u_krit")!);
const NORTHEAST_RSM = findUser("u_anucha")!;
const KRIT_AGENT_IDS = ["ag_nea_01", "ag_nea_02", "ag_nea_03", "ag_nea_05"];
const KRIT_AGENT_NAMES = ["ขอนแก่นมหาชัย", "อีสานรุ่งโรจน์ ค้าส่ง", "โคราชสหภัณฑ์", "อุบลศรีสุข เทรดดิ้ง"];
const OTHER_NORTHEAST = ["วารินพาณิชย์", "ปากช่องเบเวอเรจ", "ส.รุ่งเรือง เทรดดิ้ง", "นางรองค้าส่ง"];

describe("CRM visits come from the agent's assigned rep", () => {
  test("every visit is by the owner or the region's sales manager, and the latest is always by the owner", async () => {
    const visits = await GENERATOR_CRM.visits({ agentId: null, regions: "all" });
    for (const agent of AGENTS) {
      const own = visits.filter((visit) => visit.agentId === agent.id).sort((left, right) => right.visitedOn.localeCompare(left.visitedOn));
      const owner = findUser(agent.ownerId)?.nameTh;
      const manager = USERS.find((user) => user.role === "sales_rsm" && user.region === agent.region)?.nameTh;
      expect(own[0]?.repName).toBe(owner as string);
      for (const visit of own) expect([owner, manager]).toContain(visit.repName);
    }
    const ubon = visits.filter((visit) => visit.agentId === "ag_nea_05").map((visit) => visit.repName);
    expect(ubon.every((name) => name === "คุณกฤต จันทร์เสน" || name === NORTHEAST_RSM.nameTh)).toBe(true);
  });

  test("store_visits rows name the agent's assigned rep", async () => {
    const result = await storeVisitsFor(KRIT, "ag_nea_05");
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(row.owner_id).toBe("u_krit");
      expect(String(row.owner_name)).toContain("คุณกฤต จันทร์เสน");
    }
  });
});

describe("'my agents' are the agents assigned to the signed-in rep", () => {
  test("the เอเย่นต์ที่ผมดูแล quick action names exactly the rep's agents", () => {
    const action = defaultActionsFor(KRIT).find((candidate) => candidate.id === "qa_my_agents");
    for (const name of KRIT_AGENT_NAMES) expect(action?.prompt).toContain(name);
    for (const name of OTHER_NORTHEAST) expect(action?.prompt).not.toContain(name);
  });

  test("the rep's tiles that split by agent read only the rep's agents; the region scope stays", () => {
    const seeds = templateFor(KRIT);
    expect(seeds.find((seed) => seed.key === "agents")?.query.filters).toEqual({ region: ["northeast"], agent: KRIT_AGENT_IDS });
    expect(seeds.find((seed) => seed.key === "attainment")?.query.filters).toEqual({ region: ["northeast"], agent: KRIT_AGENT_IDS });
    expect(seeds.find((seed) => seed.key === "stock")?.query.filters).toEqual({ region: ["northeast"] });
    expect(KRIT.regions).toEqual(["northeast"]);
  });

  test("another rep in the same region gets their own agents, and a manager's tiles are not narrowed", () => {
    const nok = templateFor(accessFor(findUser("u_nok")!));
    expect(nok.find((seed) => seed.key === "agents")?.query.filters.agent).toEqual(agentsOwnedBy("u_nok").map((agent) => agent.id));
    const rsm = templateFor(accessFor(NORTHEAST_RSM));
    expect(rsm.every((seed) => seed.query.filters.agent === undefined)).toBe(true);
  });
});
