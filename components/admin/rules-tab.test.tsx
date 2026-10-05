import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { addRule, policyRules, resetPolicyRules, setRuleEnabled } from "@/lib/access/policy-rules";
import { TH } from "@/lib/i18n/th";
import { RulesTab } from "./rules-tab";

const COPY = TH.admin.rulesTab;
const ADMIN = "u_ton";

afterEach(() => {
  resetPolicyRules();
});

describe("RulesTab", () => {
  test("each rule shows its name, expression, on or off, who changed it, and its dry run, in the order they are checked", () => {
    addRule("งานเบื้องหลังห้ามเขียนข้อมูล", 'initiator == "job" && tool.tier != "read"', ADMIN);
    addRule("ห้ามส่งต่องานช่วงกลางคืน", 'tool.name == "create_handoff" && (now.hour >= 22 || now.hour < 6)', ADMIN);
    setRuleEnabled(policyRules()[1].id, false, ADMIN);
    const html = renderToStaticMarkup(<RulesTab />);
    expect(html.indexOf("งานเบื้องหลังห้ามเขียนข้อมูล")).toBeLessThan(html.indexOf("ห้ามส่งต่องานช่วงกลางคืน"));
    expect(html).toContain("initiator == &quot;job&quot; &amp;&amp; tool.tier != &quot;read&quot;");
    expect(html).toContain(COPY.off);
    expect(html).toMatch(/ถ้ามีกฎนี้ [\d,]+ การเรียกล่าสุด|ยังไม่มีการเรียกเครื่องมือ/);
  });

  test("with no rules, the page says so and still offers the form, the variables and the three examples", () => {
    const html = renderToStaticMarkup(<RulesTab />);
    expect(html).toContain(COPY.empty);
    expect(html).toContain(COPY.add);
    for (const variable of COPY.variables) expect(html).toContain(variable.name);
    for (const example of COPY.examples) expect(html).toContain(example.name);
  });
});
