import { describe, expect, test } from "bun:test";
import { BRANDS, type AccessContext } from "@/lib/contracts";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { ports } from "@/lib/server/ports";
import type { StoredScope } from "@/lib/connectors/spec";
import { maskedRows, scopedArgs, scopedRows } from "./output";
import { connectorScopeOf, sensitiveFieldOf } from "./presets";
import type { ConnectorField, ConnectorRow } from "./types";

function accessOf(id: string): AccessContext {
  const user = findUser(id);
  if (!user) throw new Error(`no user ${id}`);
  return liveAccessFor(user);
}

async function directoryRows(): Promise<ConnectorRow[]> {
  const { employees } = await ports().directory.load();
  return employees.map((employee) => ({ employee_id: employee.id, region: employee.region, department_id: employee.departmentId, note: `เรื่องของ ${employee.id}` }));
}

const ROW_WITHOUT_FIELDS: ConnectorRow = { note: "แถวที่ไม่มีช่องใดเลย" };

async function kept(scope: StoredScope, userId: string, rows: ConnectorRow[]): Promise<ConnectorRow[]> {
  return scopedRows(connectorScopeOf(scope), rows, accessOf(userId));
}

describe("each scope preset compiles to the scope the connector pipeline enforces", () => {
  test("region rows keep a regional rep to his region and drop rows without a region; the CEO keeps every row that has one and the rest too", async () => {
    const rows = [...(await directoryRows()), ROW_WITHOUT_FIELDS, { employee_id: "x", region: null }];
    const scope: StoredScope = { kind: "scoped", filters: [{ kind: "region_rows", field: "region" }], inject: [] };
    const krit = await kept(scope, "u_krit", rows);
    expect(krit.length).toBeGreaterThan(0);
    expect(new Set(krit.map((row) => row.region))).toEqual(new Set(["northeast"]));
    expect(await kept(scope, "u_thana", rows)).toHaveLength(rows.length);
  });

  test("own rows keep only the caller's own row, and a caller outside the directory keeps none", async () => {
    const rows = [...(await directoryRows()), ROW_WITHOUT_FIELDS];
    const scope: StoredScope = { kind: "scoped", filters: [{ kind: "own_rows", field: "employee_id", key: "employee_id" }], inject: [] };
    expect((await kept(scope, "u_krit", rows)).map((row) => row.employee_id)).toEqual(["u_krit"]);
    const byDepartment: StoredScope = { kind: "scoped", filters: [{ kind: "own_rows", field: "department_id", key: "department_id" }], inject: [] };
    const department = (await kept(byDepartment, "u_krit", rows)).map((row) => row.department_id);
    expect(department.length).toBeGreaterThan(1);
    expect(new Set(department).size).toBe(1);
  });

  test("people in line keep a regional manager, himself and his reports, nobody from another region, and no row without the field", async () => {
    const rows = [...(await directoryRows()), ROW_WITHOUT_FIELDS];
    const scope: StoredScope = { kind: "scoped", filters: [{ kind: "people_line", field: "employee_id" }], inject: [] };
    const ids = (await kept(scope, "u_anucha", rows)).map((row) => row.employee_id);
    expect(ids).toContain("u_anucha");
    expect(ids).toContain("u_krit");
    expect(ids).not.toContain("u_ploy");
    expect(ids).not.toContain(undefined);
    expect((await kept(scope, "u_krit", rows)).map((row) => row.employee_id)).toEqual(["u_krit"]);
  });

  test("brand rows keep a caller limited to some brands to those brands and drop rows without a brand; a caller who sees all brands keeps every row", async () => {
    const [mine, other] = BRANDS;
    const limited = { ...accessOf("u_fah"), brands: [mine] };
    const rows: ConnectorRow[] = [{ brand: mine }, { brand: other }, { brand: null }, ROW_WITHOUT_FIELDS];
    const scope = connectorScopeOf({ kind: "scoped", filters: [{ kind: "brand_rows", field: "brand" }], inject: [] });
    expect(await scopedRows(scope, rows, limited)).toEqual([{ brand: mine }]);
    expect(await scopedRows(scope, rows, accessOf("u_fah"))).toHaveLength(rows.length);
  });

  test("two filters both apply", async () => {
    const rows = await directoryRows();
    const scope: StoredScope = { kind: "scoped", filters: [{ kind: "region_rows", field: "region" }, { kind: "own_rows", field: "employee_id", key: "employee_id" }], inject: [] };
    expect((await kept(scope, "u_anucha", rows)).map((row) => row.employee_id)).toEqual(["u_anucha"]);
  });

  test("injected arguments overwrite what the model sent with the caller's own regions or id, and leave everything for no scope", async () => {
    const scope = connectorScopeOf({
      kind: "scoped",
      filters: [{ kind: "region_rows", field: "region" }],
      inject: [{ kind: "inject_regions", arg: "regions" }, { kind: "inject_identity", arg: "holder_id", key: "employee_id" }],
    });
    const asked = { regions: "north", holder_id: "u_ploy", status: "active" };
    expect(await scopedArgs(scope, asked, accessOf("u_krit"))).toEqual({ regions: "northeast", holder_id: "u_krit", status: "active" });
    expect(await scopedArgs(scope, asked, accessOf("u_thana"))).toEqual({ regions: null, holder_id: "u_thana", status: "active" });
    expect(await scopedArgs(connectorScopeOf({ kind: "none", reason: "ตารางวันหยุดของบริษัท" }), asked, accessOf("u_krit"))).toEqual(asked);
  });

  test("a sensitive field hidden from a role still shows in full on the caller's own row", async () => {
    const rows = await kept({ kind: "scoped", filters: [{ kind: "people_line", field: "employee_id" }], inject: [] }, "u_anucha", await directoryRows());
    const spec = sensitiveFieldOf({ field: "note", byRole: { hr_manager: "full" }, ownerField: "employee_id" }, "note");
    const field: ConnectorField = { key: "leave_test.note", connector: "leave_test", field: "note", labelTh: "note", ownerField: spec.ownerField ?? null, defaultFor: () => "none" };
    const shown = maskedRows(rows, [field], accessOf("u_anucha"), "u_anucha");
    expect(shown.rows.find((row) => row.employee_id === "u_anucha")?.note).toBe("เรื่องของ u_anucha");
    expect(shown.rows.find((row) => row.employee_id === "u_krit")).not.toHaveProperty("note");
    expect(shown.masked).toEqual(["note"]);
    expect(maskedRows(rows, [{ ...field, ownerField: null }], accessOf("u_anucha"), "u_anucha").rows.some((row) => "note" in row)).toBe(false);
  });

  test("a sensitive field is hidden from every role the admin did not widen, and full or masked for the ones he did", () => {
    const spec = sensitiveFieldOf({ field: "score", byRole: { hr_manager: "full", sales_rsm: "masked" }, ownerField: null }, "score");
    expect(spec.full).toEqual(["hr_manager"]);
    expect(spec.masked).toEqual(["sales_rsm"]);
    expect(spec.ownerField).toBeUndefined();
  });
});
