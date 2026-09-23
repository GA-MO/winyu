import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { CardBody, ChartSeries } from "@/lib/cards/present";
import { CardBodyView } from "./card-body";

const HEX_COLOR = /#[0-9a-f]{3,8}\b/i;

function render(body: CardBody): string {
  return renderToStaticMarkup(<CardBodyView body={body} />);
}

describe("stacked", () => {
  const labels = ["ม.ค.", "ก.พ.", "มี.ค."];
  const series: ChartSeries[] = [
    { name: "เบียร์", values: [10, 20, 15], style: null },
    { name: "โซดา", values: [5, 8, 6], style: null },
  ];

  test("shape area draws Cop's own stacked area with a legend", () => {
    const html = render({ kind: "stacked", shape: "area", labels, series, format: "number" });
    expect(html).toContain("เบียร์");
    expect(html).toContain("โซดา");
    expect(html).toContain("<svg");
  });
});

describe("share", () => {
  test("shows the centre value and every slice", () => {
    const html = render({
      kind: "share",
      slices: [
        { label: "สิงห์", valueText: "42%", share: 0.42, shareText: "42.0%", isOther: false },
        { label: "อื่น ๆ", valueText: "10%", share: 0.1, shareText: "10.0%", isOther: true },
      ],
      centerValue: "42.0%",
      centerLabel: "สิงห์",
    });
    expect(html).toContain("42.0%");
    expect(html).toContain("สิงห์");
    expect(html).toContain("อื่น ๆ");
  });
});

describe("heatmap", () => {
  test("renders a cell's text and tooltip", () => {
    const html = render({
      kind: "heatmap",
      rowLabels: ["ภาคอีสาน"],
      columnLabels: ["ส.ค. 69"],
      cells: [[{ text: "1.2 ล้าน", detail: "+5%", intensity: 0.8, tone: "good" }]],
      scale: "value",
      legend: "สีเข้มคือค่าสูง",
    });
    expect(html).toContain("1.2 ล้าน");
    expect(html).toContain("ภาคอีสาน · ส.ค. 69: 1.2 ล้าน · +5%");
    expect(html).toContain("สีเข้มคือค่าสูง");
  });

  test("a null cell shows a muted dash", () => {
    const html = render({
      kind: "heatmap",
      rowLabels: ["ภาคใต้"],
      columnLabels: ["ก.ย. 69"],
      cells: [[null]],
      scale: "value",
      legend: "สีเข้มคือค่าสูง",
    });
    expect(html).toContain("—");
  });
});

describe("scatter", () => {
  test("names an outlier point and shows the median caption", () => {
    const html = render({
      kind: "scatter",
      points: [
        { label: "ตัวแทนขาย ก", x: 100, y: 80, xText: "100", yText: "80", named: true },
        { label: "ตัวแทนขาย ข", x: 50, y: 40, xText: "50", yText: "40", named: false },
      ],
      x: { label: "ขายเข้า", format: "number", median: 75, medianText: "75" },
      y: { label: "ขายออก", format: "number", median: 60, medianText: "60" },
      note: "ความสัมพันธ์ปานกลาง",
      diagonal: null,
    });
    expect(html).toContain("ตัวแทนขาย ก");
    expect(html).toContain("มัธยฐาน");
    expect(html).toContain("ความสัมพันธ์ปานกลาง");
  });

  test("shares one axis range and shows the diagonal caption when units match", () => {
    const html = render({
      kind: "scatter",
      points: [{ label: "อุบลศรีสุข", x: 100, y: 40, xText: "100", yText: "40", named: true }],
      x: { label: "ขายเข้า", format: "number", median: 100, medianText: "100" },
      y: { label: "ขายออก", format: "number", median: 40, medianText: "40" },
      note: null,
      diagonal: "เส้นประคือขายเข้าเท่าขายออก",
    });
    expect(html).toContain("เส้นประคือขายเข้าเท่าขายออก");
  });
});

describe("funnel", () => {
  test("shows a stage's value and the drop between stages", () => {
    const html = render({
      kind: "funnel",
      stages: [
        { label: "ผลิต", value: 100, valueText: "100 ลัง", width: 1, dropText: null, dropTone: "neutral" },
        { label: "ขายเข้า", value: 80, valueText: "80 ลัง", width: 0.8, dropText: "-20%", dropTone: "bad" },
      ],
    });
    expect(html).toContain("ผลิต");
    expect(html).toContain("80 ลัง");
    expect(html).toContain("-20%");
    expect(html).toContain("text-danger");
  });
});

test("none of the new chart bodies render a raw hex colour", () => {
  const bodies: CardBody[] = [
    { kind: "stacked", shape: "area", labels: ["A", "B"], series: [{ name: "s", values: [1, 2], style: null }], format: "number" },
    { kind: "share", slices: [{ label: "A", valueText: "1", share: 1, shareText: "100%", isOther: false }], centerValue: "100%", centerLabel: "A" },
    { kind: "heatmap", rowLabels: ["A"], columnLabels: ["B"], cells: [[{ text: "1", detail: null, intensity: 0.5, tone: "neutral" }]], scale: "value", legend: "L" },
    
    {
      kind: "scatter",
      points: [{ label: "A", x: 1, y: 1, xText: "1", yText: "1", named: true }],
      x: { label: "X", format: "number", median: 1, medianText: "1" },
      y: { label: "Y", format: "number", median: 1, medianText: "1" },
      note: null,
      diagonal: null,
    },
    { kind: "funnel", stages: [{ label: "A", value: 1, valueText: "1", width: 1, dropText: null, dropTone: "neutral" }] },
  ];
  for (const body of bodies) expect(render(body)).not.toMatch(HEX_COLOR);
});
