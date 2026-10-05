import { describe, expect, test } from "bun:test";
import { routeOf } from "./serve";

const BASE = "/api/copilotkit";

describe("routeOf", () => {
  test("serves the agent's run, connect and stop and the runtime info", () => {
    expect(routeOf("GET", `${BASE}/info`)).toEqual({ kind: "info" });
    expect(routeOf("POST", `${BASE}/agent/winyu/run`)).toEqual({ kind: "run" });
    expect(routeOf("POST", `${BASE}/agent/winyu/connect`)).toEqual({ kind: "connect" });
    expect(routeOf("POST", `${BASE}/agent/winyu/stop/t%201`)).toEqual({ kind: "stop", threadId: "t 1" });
  });

  test("refuses every route that would run outside the harness run", () => {
    expect(routeOf("POST", BASE)).toBeNull();
    expect(routeOf("GET", `${BASE}/cpk-debug-events`)).toBeNull();
    expect(routeOf("POST", `${BASE}/threads/clear`)).toBeNull();
    expect(routeOf("GET", `${BASE}/threads`)).toBeNull();
    expect(routeOf("POST", `${BASE}/agent/other/run`)).toBeNull();
    expect(routeOf("POST", `${BASE}/agent/winyu/suggest`)).toBeNull();
    expect(routeOf("DELETE", `${BASE}/agent/winyu/run`)).toBeNull();
  });
});
