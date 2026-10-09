import { afterEach, describe, expect, test } from "bun:test";
import { connectors } from "@/lib/server/tools/registry";
import { GENERATOR_PORTS } from "./generator";
import { mcpPortNames, ports, resetPorts, type Ports } from "./index";

const READ_OVER_MCP = ["metrics", "directory", "recruiting", "learning", "leave", "sites", "calendar"] as const;

function withPorts(setting: string | null): void {
  if (setting === null) delete process.env.WINYU_PORTS;
  else process.env.WINYU_PORTS = setting;
  resetPorts();
}

function swapped(): (keyof Ports)[] {
  const current = ports();
  return (Object.keys(GENERATOR_PORTS) as (keyof Ports)[]).filter((port) => current[port] !== GENERATOR_PORTS[port]);
}

function kindOf(id: string): string | undefined {
  return connectors().find((connector) => connector.id === id)?.kind;
}

afterEach(() => withPorts(null));

describe("WINYU_PORTS picks which ports read over MCP", () => {
  test("unset or generator keeps every port in-process and every native connector built in", () => {
    for (const setting of [null, "generator", ""]) {
      withPorts(setting);
      expect({ setting, swapped: swapped() }).toEqual({ setting, swapped: [] });
      expect(kindOf("hris")).toBe("native");
    }
  });

  test("mcp swaps every port but mail, and the admin shows each system behind them as an MCP connection", () => {
    withPorts("mcp");
    expect(swapped().sort()).toEqual([...READ_OVER_MCP].sort());
    for (const id of ["warehouse", "hris", "lms", "leave", "sites", "calendar"]) expect({ id, kind: kindOf(id) }).toEqual({ id, kind: "mcp" });
    expect(kindOf("mail")).toBe("native");
  });

  test("a comma list swaps only the ports it names and ignores names that are not ports", () => {
    withPorts("directory, calendar,mail,nonsense");
    expect(mcpPortNames().sort()).toEqual(["calendar", "directory"]);
    expect(swapped().sort()).toEqual(["calendar", "directory"]);
    expect(kindOf("hris")).toBe("mcp");
    expect(kindOf("leave")).toBe("native");
  });
});
