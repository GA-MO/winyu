import { describe, expect, test } from "bun:test";
import { reservedReasonOf } from "./reserved";

describe("a console connector cannot open a tool Winyu already has", () => {
  test("a remote tool named like a native tool is refused on any server, any other name may open", () => {
    expect(reservedReasonOf("list_courses")).toBe("native_tool");
    expect(reservedReasonOf("training_history")).toBe("native_tool");
    expect(reservedReasonOf("list_assets")).toBeNull();
  });
});
