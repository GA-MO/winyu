import { describe, expect, test } from "bun:test";
import { TH } from "@/lib/i18n/th";
import { defaultToolsOf, toolSurface } from "./registry";
import { setPermissionTool } from "./set-permission";

describe("set_permission's description", () => {
  test("names every tool on the surface with its Thai label, including tools the IT admin cannot call", () => {
    const description = setPermissionTool.description();
    expect(defaultToolsOf("it_admin")).not.toContain("store_visits");
    expect(description).toContain(`store_visits (${TH.admin.tools.store_visits.label})`);
    for (const entry of toolSurface()) expect(description).toContain(`${entry.name} (${entry.labelTh})`);
  });

  test("still names the connector fields, so a field is never mistaken for a tool", () => {
    expect(setPermissionTool.description()).toContain("Connector fields: ");
  });
});
