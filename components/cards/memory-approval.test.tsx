import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TH } from "@/lib/i18n/th";
import { renderApproval } from "./approval-card";

function render(tool: string, input: unknown): string {
  return renderToStaticMarkup(renderApproval({ tool, input, approved: null, approve: () => undefined, reject: () => undefined }));
}

describe("approving a memory change", () => {
  test("remember shows the wording that will be kept, its kind and its last day", () => {
    const html = render("remember", { type: "responsibility", value: "นำเสนอผลไตรมาสสามต่อคณะกรรมการ", until: "2026-10-22" });
    expect(html).toContain("นำเสนอผลไตรมาสสามต่อคณะกรรมการ");
    expect(html).toContain(TH.account.memoryType.responsibility);
    expect(html).toContain(TH.approve.effectRemember);
    expect(html).toContain(TH.approve.confirmRemember);
    expect(html).not.toContain("remember");
  });

  test("forget shows the topic and that it will not be learned again", () => {
    const html = render("forget", { about: "ด้ามขวาน" });
    expect(html).toContain("ด้ามขวาน");
    expect(html).toContain(TH.approve.effectForget);
    expect(html).toContain(TH.approve.confirmForget);
  });
});
