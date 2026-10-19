import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { CardBody, ChartSeries } from "@/lib/cards/present";
import { CardBodyView } from "./card-body";
import { spacedTicks } from "./scatter";

const HEX_COLOR = /#[0-9a-f]{3,8}\b/i;

function render(body: CardBody): string {
  return renderToStaticMarkup(<CardBodyView body={body} />);
}

describe("strip rows named along two splits", () => {
  test("show the first part as the name and the second on its own line, so a phone never cuts the province off (AI-103)", () => {
    const row = { label: "อุบลศรีสุข เทรดดิ้ง · อุบลราชธานี", sub: null, second: null, measure: 60.5, fill: 0.6, text: "60.5%", change: null, tone: "bad" as const, exception: true, valued: true };
    const html = render({ kind: "strip", strip: { form: "line", baseline: 100, low: 50, high: 110, total: null, overall: null, rows: [row] } });
    expect(html).toContain(">อุบลศรีสุข เทรดดิ้ง</span>");
    expect(html).toContain(">อุบลราชธานี</span>");
  });

  test("a long name wraps onto a second line instead of being cut with an ellipsis, so กรุงเทพฯ และปริมณฑล reads whole on a phone (AI-254)", () => {
    const row = { label: "กรุงเทพฯ และปริมณฑล", sub: null, second: null, measure: 86.5, fill: 0.86, text: "86.5%", change: null, tone: "bad" as const, exception: true, valued: true };
    const html = render({ kind: "strip", strip: { form: "line", baseline: 86.7, low: 70, high: 90, total: null, overall: null, rows: [row] } });
    const name = html.match(/<span title="กรุงเทพฯ และปริมณฑล" class="([^"]*)">/)?.[1] ?? "";
    expect(name).toContain("line-clamp-2");
    expect(name).not.toContain("truncate");
  });
});

describe("stacked", () => {
  const labels = ["ม.ค.", "ก.พ.", "มี.ค."];
  const series: ChartSeries[] = [
    { name: "เบียร์", values: [10, 20, 15], style: null },
    { name: "โซดา", values: [5, 8, 6], style: null },
  ];

  test("shape area draws Winyu's own stacked area with a legend", () => {
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
  test("renders a cell's text and tooltip, and colours only the cell that stands apart", () => {
    const html = render({
      kind: "heatmap",
      rowLabels: ["ภาคอีสาน", "ภาคใต้"],
      columnLabels: ["ส.ค. 69"],
      cells: [[{ text: "-18.5", detail: "-18.5% · 1.2 ล้าน", intensity: 0.8, tone: "bad", exception: true }], [{ text: "-9.5", detail: "-9.5% · 2.0 ล้าน", intensity: 0.4, tone: "bad", exception: false }]],
      scale: "delta",
      unit: "%",
    });
    expect(html).toContain("ภาคอีสาน · ส.ค. 69: -18.5% · 1.2 ล้าน");
    expect(html).toContain(">-18.5</span>");
    expect(html).toContain("หน่วย: %");
    expect(html).not.toContain("truncate");
    expect(html.match(/text-danger/g)).toHaveLength(1);
    expect(html).not.toContain("min-w-max");
  });

  test("a null cell shows a muted dash", () => {
    const html = render({ kind: "heatmap", rowLabels: ["ภาคใต้"], columnLabels: ["ก.ย. 69"], cells: [[null]], scale: "value", unit: "ลิตร" });
    expect(html).toContain("—");
  });
});

describe("scatter", () => {
  test("names an outlier point without a median caption or a correlation number", () => {
    const html = render({
      kind: "scatter",
      points: [
        { label: "ตัวแทนขาย ก", x: 100, y: 80, xText: "100", yText: "80", named: true },
        { label: "ตัวแทนขาย ข", x: 50, y: 40, xText: "50", yText: "40", named: false },
      ],
      x: { label: "ขายเข้า", format: "number", median: 75, medianText: "75" },
      y: { label: "ขายออก", format: "number", median: 60, medianText: "60" },
      r: 0.58,
    });
    expect(html).toContain("ตัวแทนขาย ก");
    expect(html).not.toContain("มัธยฐาน");
    expect(html).not.toContain("0.58");
  });

  test("ends both axes at the next round value above the data, not twice the largest point, so the points spread over the plot (AI-330)", () => {
    const html = render({
      kind: "scatter",
      points: [
        { label: "กรุงเทพมหานคร", x: 205_000_000, y: 10_200_000, xText: "205.0 ล้านบาท", yText: "10.2 ล้านบาท", named: true },
        { label: "สงขลา", x: 73_700_000, y: 7_000_000, xText: "73.7 ล้านบาท", yText: "7.0 ล้านบาท", named: true },
        { label: "ตราด", x: 10_000_000, y: 1_000_000, xText: "10.0 ล้านบาท", yText: "1.0 ล้านบาท", named: false },
      ],
      x: { label: "มูลค่าขายเข้า", format: "currency", median: 73_700_000, medianText: "73.7 ล้านบาท" },
      y: { label: "ยอดค้างชำระ", format: "currency", median: 7_000_000, medianText: "7.0 ล้านบาท" },
      r: 0.9,
    });
    const ticks = [...html.matchAll(/<text[^>]*>([\d.,]+ ล้านบาท)<\/text>/g)].map((match) => Number(match[1].replace(/[^\d.]/g, "")));
    expect(Math.max(...ticks.filter((tick) => tick > 100))).toBe(250);
    expect(ticks).toContain(12);
    expect(ticks).not.toContain(400);
    expect(ticks).not.toContain(20);
  });
});


const ROW = { sub: null, second: null, fill: 0.5, change: null, valued: true } as const;

describe("strip (style B)", () => {
  test("a leaderboard shows every row's value and colours only the pill whose change stands out", () => {
    const html = render({
      kind: "strip",
      strip: {
        form: "board",
        baseline: 0,
        total: null,
        low: 0,
        high: 30,
        overall: { ...ROW, label: "ทั้งประเทศ", measure: null, text: "108.8 ล้านบาท", change: "-29.3%", tone: "good", exception: true },
        rows: [
          { ...ROW, label: "ภาคกลาง", measure: 24, text: "24.3 ล้านบาท", change: "+18.0%", tone: "bad", exception: true },
          { ...ROW, label: "ภาคใต้", measure: 20, text: "19.9 ล้านบาท", change: "-32.9%", tone: "neutral", exception: false },
          { ...ROW, label: "ภาคเหนือ", measure: 13, text: "13.2 ล้านบาท", change: "-32.8%", tone: "neutral", exception: false },
        ],
      },
    });
    expect(html).toContain("19.9 ล้านบาท");
    expect(html.match(/bg-danger\/10 text-danger/g)).toHaveLength(1);
    expect(html.match(/bg-muted text-muted-foreground/g)).toHaveLength(2);
  });

  test("a line strip draws the deciding line and writes values only for exceptions and the extreme", () => {
    const html = render({
      kind: "strip",
      strip: {
        form: "line",
        baseline: 100,
        total: null,
        low: 88,
        high: 103,
        overall: { ...ROW, label: "ทั้งประเทศ", sub: "ของเป้า", measure: 98.6, text: "98.6%", tone: "bad", exception: true },
        rows: [
          { ...ROW, label: "ภาคอีสาน", measure: 90, text: "90%", tone: "bad", exception: true },
          { ...ROW, label: "ภาคใต้", measure: 101, text: "101%", tone: "neutral", exception: false, valued: false },
          { ...ROW, label: "ภาคกลาง", measure: 101.6, text: "101.6%", tone: "neutral", exception: false },
        ],
      },
    });
    expect(html).toContain("ของเป้า");
    expect(html).toContain("90%");
    expect(html).not.toContain(">101%<");
    expect(html).toContain("101.6%");
  });
});

describe("exceptions (style A)", () => {
  test("draws only the exception rows and folds the rest into one line that expands", () => {
    const html = render({
      kind: "exceptions",
      strip: { form: "line", baseline: 100, low: 80, high: 104, total: null, overall: null, rows: [{ ...ROW, label: "อุบลราชธานี", measure: 81.7, text: "81.7%", tone: "bad", exception: true }] },
      fold: { line: "อีก 21 จังหวัดเกินเป้า 100.3–103.5%", rows: [{ ...ROW, label: "เลย", measure: 103.5, text: "103.5%", tone: "neutral", exception: false }] },
    });
    expect(html).toContain("อุบลราชธานี");
    expect(html).toContain("อีก 21 จังหวัดเกินเป้า");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("เลย");
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
    { kind: "heatmap", rowLabels: ["A"], columnLabels: ["B"], cells: [[{ text: "1", detail: null, intensity: 0.5, tone: "neutral", exception: true }]], scale: "value", unit: "ลิตร" },
    {
      kind: "scatter",
      points: [{ label: "A", x: 1, y: 1, xText: "1", yText: "1", named: true }],
      x: { label: "X", format: "number", median: 1, medianText: "1" },
      y: { label: "Y", format: "number", median: 1, medianText: "1" },
      r: 0,
    },
    { kind: "strip", strip: { form: "board", baseline: 0, low: 0, high: 1, total: null, overall: null, rows: [{ ...ROW, label: "A", measure: 1, text: "1", tone: "bad", exception: true }] } },
    { kind: "funnel", stages: [{ label: "A", value: 1, valueText: "1", width: 1, dropText: null, dropTone: "neutral" }] },
  ];
  for (const body of bodies) expect(render(body)).not.toMatch(HEX_COLOR);
});

test("a strip row draws its second line under its name: the base it moved from or a second comparison (AI-66, AI-68)", () => {
  const row = { ...ROW, label: "ภาคใต้", sub: "5.1 ล้านบาท · ปีก่อน 1.3 ล้านบาท", measure: 1, text: "+297.5%", tone: "bad" as const, exception: true };
  for (const form of ["line", "board"] as const) expect(render({ kind: "strip", strip: { form, baseline: 0, low: 0, high: 1, total: null, overall: null, rows: [row] } })).toContain("ปีก่อน 1.3 ล้านบาท");
  expect(render({ kind: "exceptions", strip: { form: "line", baseline: 0, low: 0, high: 1, total: null, overall: null, rows: [row] }, fold: null })).toContain("ปีก่อน 1.3 ล้านบาท");
});

test("scatter x ticks keep both ends and drop a middle label that would touch them (AI-70)", () => {
  const tick = (value: number, at: number, anchor: "start" | "middle" | "end") => ({ value, at, text: `${value} ล้าน`, anchor });
  const kept = spacedTicks([tick(0, 40, "start"), tick(20, 110, "middle"), tick(40, 180, "middle"), tick(60, 250, "middle"), tick(80, 280, "end")]);
  expect(kept.map((entry) => entry.value)).toEqual([0, 20, 40, 80]);
});

test("a paired reading shows under every row of a line strip, not only the exceptions, and is never cut", () => {
  const rows = [
    { ...ROW, label: "ภาคอีสาน", second: "28.2% · +1.8 จุด", measure: 77, text: "77.3%", tone: "bad" as const, exception: true },
    { ...ROW, label: "ภาคกลาง", second: "26.7% · -0.4 จุด", measure: 86, text: "86.0%", tone: "neutral" as const, exception: false },
  ];
  const html = render({ kind: "strip", strip: { form: "line", baseline: 100, low: 70, high: 100, total: null, overall: null, rows } });
  expect(html).toContain(">28.2% · +1.8 จุด</span>");
  expect(html).toContain(">26.7% · -0.4 จุด</span>");
  expect(html.match(/<span class="([^"]*)">26\.7%/)?.[1]).not.toContain("truncate");
});

test("a line strip's overall detail sits on its own full-width line instead of under the overall name", () => {
  const overall = { ...ROW, label: "ทั้งประเทศ", sub: "ของเป้าทั้งเดือน · ถึงวันนี้ควรได้ 86.7%", measure: 83.9, text: "83.9%", tone: "bad" as const, exception: true };
  const html = render({ kind: "strip", strip: { form: "line", baseline: 100, low: 70, high: 100, total: null, overall, rows: [] } });
  expect(html).toMatch(/grid-column:1 \/ -1;grid-row:2"><p>ของเป้าทั้งเดือน/);
});

test("a line strip exception's detail stays one line under its name, the full text kept in the name's tooltip", () => {
  const row = { ...ROW, label: "ภาคอีสาน", sub: "30.5 → 25.6 ล้านบาท", measure: -16, text: "-16.0%", tone: "bad" as const, exception: true };
  const html = render({ kind: "strip", strip: { form: "line", baseline: 0, low: -20, high: 5, total: null, overall: null, rows: [row] } });
  expect(html.match(/<span class="([^"]*)">30\.5 → 25\.6 ล้านบาท<\/span>/)?.[1]).toContain("truncate");
  expect(html).toContain('title="ภาคอีสาน\n30.5 → 25.6 ล้านบาท"');
});

test("a lead row on top of a line strip keeps its own detail under its name and the whole list's total on its own full-width line", () => {
  const overall = { ...ROW, label: "อีสานรุ่งโรจน์ ค้าส่ง", sub: "32.3 → 26.8 ล้านบาท", measure: -17, text: "-17.0%", tone: "bad" as const, exception: true };
  const html = render({ kind: "strip", strip: { form: "line", baseline: 0, low: -20, high: 40, overall, total: "รวม 4 เอเย่นต์ +16.1% เทียบช่วงก่อนหน้า", rows: [] } });
  expect(html).toMatch(/grid-column:1;grid-row:1">(?:(?!grid-row).)*>32\.3 → 26\.8 ล้านบาท<\/span>/);
  expect(html).toMatch(/grid-column:1 \/ -1;grid-row:2"><p>รวม 4 เอเย่นต์ \+16\.1% เทียบช่วงก่อนหน้า<\/p><\/div>/);
});
