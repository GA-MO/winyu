import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { NATIVE_CONNECTORS, ROLE_IDS, toolRolesInclude, type AccessContext, type RoleId, type ToolSurfaceEntry } from "@/lib/contracts";
import { USERS } from "@/lib/data/entities/users";
import { auditLog } from "@/lib/server/audit";
import { runWithAccess } from "@/lib/server/request-context";
import { winyuTool, defaultToolsOf, toolSurface } from "@/lib/server/tools/registry";
import { registerConnectors, resetConnectors } from "@/lib/server/connectors";
import { stubConnector } from "@/lib/server/connectors/stub";
import { connectorEnabled, killTool, killedTools, liveAccessFor, reviveTool, setConnectorEnabled, toolsFor } from "./enforce";
import { isGrantable, overrideFor, permissionsFor, setRoleTool } from "./role-overrides";

const ADMIN = "u_ton";

const NATIVE_SURFACE_BEFORE_CONNECTORS = [
  ["query_metric", "warehouse", "read", "all"],
  ["list_metrics", "warehouse", "read", "all"],
  ["describe_entity", "warehouse", "read", "all"],
  ["get_alerts", "winyu", "read", "all"],
  ["get_forecast", "winyu", "read", "all"],
  ["explain_gap", "winyu", "read", "all"],
  ["get_calendar", "calendar", "read", "all"],
  ["recall_memory", "winyu", "read", "all"],
  ["find_people", "hris", "read", "all"],
  ["get_person", "hris", "read", "all"],
  ["get_site", "sites", "read", "all"],
  ["list_candidates", "hris", "read", "all"],
  ["list_courses", "lms", "read", "all"],
  ["get_policy", "leave", "read", "all"],
  ["request_leave", "leave", "write", "all"],
  ["enroll_course", "lms", "write", "all"],
  ["resolve_owner", "winyu", "read", "all"],
  ["create_handoff", "winyu", "write", "all_but_sales_rep"],
  ["send_email", "mail", "write", "all_but_sales_rep"],
  ["pin_widget", "winyu", "write", "all"],
  ["watch_metric", "winyu", "write", "all"],
  ["run_job", "winyu", "destructive", "it_admin"],
  ["set_permission", "winyu", "destructive", "it_admin"],
] as const;

const PROBE = new Proxy({}, {
  get(_target, key) {
    if (typeof key === "symbol" || key === "toJSON") return undefined;
    throw new Error("surface probe");
  },
});

beforeAll(() => registerConnectors([stubConnector()]));
afterAll(() => resetConnectors());

function isNative(entry: ToolSurfaceEntry): boolean {
  return (NATIVE_CONNECTORS as readonly string[]).includes(entry.connector);
}

const touched: { role: RoleId; tool: string }[] = [];
const killedHere: string[] = [];

afterEach(() => {
  for (const { role, tool } of touched.splice(0)) {
    if (overrideFor(role, "tool", tool)) setRoleTool(role, tool as ToolSurfaceEntry["name"], defaultToolsOf(role).includes(tool as ToolSurfaceEntry["name"]), ADMIN);
  }
  for (const tool of killedHere.splice(0)) reviveTool(tool as ToolSurfaceEntry["name"]);
});

function rolesLabel(entry: ToolSurfaceEntry): string {
  if (entry.roles === "all") return "all";
  if (entry.roles.length === 1) return entry.roles[0];
  return ROLE_IDS.every((role) => (role === "sales_rep") !== entry.roles.includes(role)) ? "all_but_sales_rep" : entry.roles.join(",");
}

function memberOf(role: RoleId) {
  const user = USERS.find((item) => item.role === role);
  if (!user) throw new Error(`no user in role ${role}`);
  return user;
}

function withoutOverride(role: RoleId, tool: ToolSurfaceEntry["name"]): boolean {
  return overrideFor(role, "tool", tool) === null && !killedTools().includes(tool);
}

describe("tool surface", () => {
  test("the native tools keep the names, connectors, tiers and roles they had before connectors", () => {
    const actual = toolSurface().filter(isNative).map((entry) => [entry.name, entry.connector, entry.tier, rolesLabel(entry)]);
    expect(actual).toEqual(NATIVE_SURFACE_BEFORE_CONNECTORS.map((row) => [...row]));
  });

  test("the surface carries connector tools next to the native ones", () => {
    expect(toolSurface().filter((entry) => !isNative(entry)).length).toBeGreaterThan(0);
  });

  test("every entry has a Thai label, a description and an executable", () => {
    for (const entry of toolSurface()) {
      expect(entry.labelTh.length).toBeGreaterThan(0);
      expect(entry.bodyTh.length).toBeGreaterThan(0);
      expect(winyuTool(entry.name)?.tool.execute).toBeDefined();
    }
  });

  test("every tool above read asks the user first, every read tool does not", () => {
    for (const entry of toolSurface()) {
      const needsApproval = Boolean(winyuTool(entry.name)?.tool.needsApproval);
      expect({ tool: entry.name, needsApproval }).toEqual({ tool: entry.name, needsApproval: entry.tier !== "read" });
    }
  });
});

describe("every tool × every role", () => {
  test("starts from the roles the tool declares", () => {
    for (const entry of toolSurface()) {
      for (const role of ROLE_IDS) {
        if (!withoutOverride(role, entry.name)) continue;
        expect({ tool: entry.name, role, on: toolsFor(liveAccessFor(memberOf(role))).includes(entry.name) }).toEqual({
          tool: entry.name,
          role,
          on: toolRolesInclude(entry, role),
        });
      }
    }
  });

  test("an admin can take any tool away and give back what the tier allows", () => {
    for (const entry of toolSurface()) {
      for (const role of ROLE_IDS) {
        if (!withoutOverride(role, entry.name)) continue;
        touched.push({ role, tool: entry.name });
        setRoleTool(role, entry.name, false, ADMIN);
        expect(toolsFor(liveAccessFor(memberOf(role)))).not.toContain(entry.name);
        const granted = setRoleTool(role, entry.name, true, ADMIN);
        expect({ tool: entry.name, role, granted }).toEqual({ tool: entry.name, role, granted: entry.tier !== "destructive" || toolRolesInclude(entry, role) });
        expect(permissionsFor(role).toolAllow.includes(entry.name)).toBe(granted);
        expect(isGrantable(role, entry.name)).toBe(granted);
        setRoleTool(role, entry.name, toolRolesInclude(entry, role), ADMIN);
      }
    }
  });

  test("the kill switch takes a tool away from every role", () => {
    for (const entry of toolSurface()) {
      if (killedTools().includes(entry.name)) continue;
      killedHere.push(entry.name);
      killTool(entry.name, ADMIN);
      for (const role of ROLE_IDS) expect(toolsFor(liveAccessFor(memberOf(role)))).not.toContain(entry.name);
      reviveTool(entry.name);
      killedHere.pop();
    }
  });

  test("switching its connector off takes it away from every role", () => {
    for (const entry of toolSurface()) {
      if (!connectorEnabled(entry.connector)) continue;
      setConnectorEnabled(entry.connector, false, ADMIN);
      const leaked = ROLE_IDS.filter((role) => toolsFor(liveAccessFor(memberOf(role))).includes(entry.name));
      setConnectorEnabled(entry.connector, true, ADMIN);
      expect({ tool: entry.name, leaked }).toEqual({ tool: entry.name, leaked: [] });
    }
  });

  test("every call leaves an audit row, even one that fails", async () => {
    const access: AccessContext = liveAccessFor(memberOf("it_admin"));
    for (const entry of toolSurface()) {
      const execute = winyuTool(entry.name)?.tool.execute as (input: unknown, options: unknown) => Promise<unknown>;
      const before = new Set(auditLog().all().map((row) => row.id));
      await expect(runWithAccess(access, () => execute(PROBE, {}))).rejects.toThrow("surface probe");
      const written = auditLog().all().filter((row) => !before.has(row.id));
      expect(written.map((row) => [row.tool, row.connector, row.decision])).toEqual([[entry.name, entry.connector, "deny"]]);
      for (const row of written) auditLog().remove(row.id);
    }
  });
});
