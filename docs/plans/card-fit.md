# Card fit: the card answers the question it was asked

The user (2026-10-16): "ไม่ใช่แสดง card หน้าตาเดิมๆ มันจะทำให้ระบบดูไม่ฉลาด คนจะไม่เชื่อ". A card-fit audit rendered all 63 recorded cases with today's code and read 75 simulated-user screenshots. The recordings hold 44 `query_metric` cards: 26 are rank or gap bars led by the total of all rows, and 7 are line charts, 3 of them with a single point. Scatter, funnel, parity gap and overlay are never drawn. Screenshots and the survey are in the session scratchpad (`cardfit/`).

## สถานะ (2026-10-16)
แก้แล้ว: ตารางตัดสินใจ `CARD_RULES` ใน `lib/cards/present.ts`, การ์ดคู่ (R10) ผ่าน `cardPlanOf`, เช็ก `answeredHero` และ `drewShape` ต่อเคสใน `lib/eval/cases.ts`

## Worst examples

- `shape-funnel`: "production, sell-in and sell-out in August" draws three line charts with one dot each.
- `ceo-attainment`, `ceo-by-region`, `finance-budget`: three different questions get the same zero-based rank bars, led by "1,110.2 ล้านบาท −1.4%" in grey.
- `rsm-own-region`: "3.9 ล้านลิตร −6.7%" with no region name on the card and no "93.3% ของเป้า".
- `planner-cover`, `line-cover-days`: asked which DC runs out first, the hero says "ไม่มี".
- `ceo-decline`, `rsm-agents`: the hero is the total; the answer (the agent that fell most) is the first bar.
- `title-share-loss`: the data card says "−10.4%" while the alert card says "−3.5 จุด" for the same fact.

## Root causes

1. Chat never pairs results: `components/cards/registry.tsx:21` passes only `title` and `source` to `DataCard`, so `with`, `view` and `sortBy` (`components/cards/data-card.tsx`) and the pairing forms in `lib/cards/present.ts:677-691` cannot be reached.
2. The form comes from the query's shape, not the question: `automaticView` (`present.ts:276-284`) ignores the comparison and the threshold; level lines are chosen by metric only (`present.ts:611-613`).
3. The hero is always the total of all rows (`heroOf`, `present.ts:378-389`); the functions that find the answering row feed only a note.
4. One-row results lose their name: a time dimension always gets a line chart (`present.ts:270-271`), one row gets a hero with no body and no label (`present.ts:280`, `546-555`), and the title is the metric name only (`lib/cards/tool-answers.ts:65-68`).
5. Changes ignore the unit: `formatDelta` and `toneOf` (`lib/dashboard/metric-display.ts:37-62`) always show a relative % with a ±2% neutral band.

## Rules

| # | When | Hero | Body | Proved by |
|---|---|---|---|---|
| R1 | one row, grouped or filtered | "metric · {row label}" | with a target, a Meter of value/target; otherwise none | `rsm-own-region`, `handoff-not-share` |
| R2 | time dimension with fewer than 3 buckets | as for no time | metric view | `shape-funnel` (until R10) |
| R3 | `compare=target`, 2+ rows | "{x}% ของเป้า", tone by the 100% line, note "n จาก N ต่ำกว่าเป้า · worst" | GapBars of value/target around 100% | `ceo-attainment`, `ceo-by-region`, `finance-budget` |
| R4 | sorted by change | first row's label and change; detail its level; total in the note | GapBars of change | `ceo-decline`, `rsm-agents`, `compare-top-decliners`, `title-ar-rising` |
| R5 | sorted by value with a limit | first row's label and value | rank or level bars | `marketing-campaign`, `planner-cover`, `hr-attrition` |
| R6 | metric with a level line and nothing under it | weakest row's value; detail "ไม่มีต่ำกว่า X" | GapBars | `planner-cover`, `line-cover-days` |
| R7 | `where` threshold met by few rows | "n จาก N" | the rows that meet it, named; meta counts them | `title-cover-threshold`, `line-cover-below`, `line-under-target` |
| R8 | metric shown as a percent and averaged | change as "±x.x จุด" | — | `title-share-loss`, `hr-attrition`, `shape-share-market` |
| R9 | time series of a summed metric, no grouping | latest full bucket vs the one before; range total in the note | line | `ceo-trend`, `compare-stock-weekly` |
| R10 | 2+ `query_metric` results in one turn with the same dimensions and range, of metrics that read together | the pairing | funnel, scatter, parity gap, or two lines on one chart | `shape-funnel`, `shape-scatter`, `shape-sell-through`, `landing-visit` |
| R11 | an `explain_gap` answer | where the month ends at the recent pace (a running month), the share of target (a closed month), or the actual with its change | the whole gap named by its base, the parts over 10% of it drawn, the rest and the offsetting parts folded | present.test.ts "a gap card" |

R10 also needs the exchange view to pass the turn's other results to `DataCard` as `with`. Two metrics read together only when one family in `READ_TOGETHER` (`lib/cards/present.ts`) holds both: the goods flow (production, sell-in, sell-out, stock, cover), the money of the same sales (sell-in, value, attainment, margin, trade spend, overdue), a campaign and what it moved, the workforce. Stock cover and overdue money asked side by side keep their own cards (AI-140).

R11's verdict opens with the hero's judgement ("คาดปิดเดือนไม่ถึงเป้า", "ต่ำกว่าปีก่อน 39.8 ล้านบาท") and names the part that pulled furthest ("ภาคอีสานฉุดมากสุด 78.1%"), so a month-end question and a "which region" question are both answered in the headline (AI-142).

## One base per card (AI-141, AI-156)

- A target card in a month still running leads with the share of the whole month's target. Its rows are on that base too, and the deciding line is where the month should be by now ("ถึงวันนี้ควรได้ 86.7%"): a row is red only when it is behind that line.
- Its scorecard (C) has two tiles beside the hero, what is left and where the month ends; the verdict says pace and month end in words ("ช้ากว่าเป้าตามเวลา คาดปิดเดือนไม่ถึงเป้า"), never a figure on the pace base.
- A one-row card with nothing to compare has no verdict, since it would only repeat the hero; one row of cover is judged against the low-cover line.
- A breakdown whose question named one group puts that group on top as the hero, the overall level on the line under it.
- A change ranking's verdict counts every row its words claim: "กว่าเท่าตัว" counts every row that more than doubled, and draws them all thick (AI-144).
- A landing tile of a series names the bucket its number is ("ต.ค. 69"), never the widget's range (AI-157).

## Check

Every rule is checked for $0: replay the listed cases at `/dev/replay?cases=…` at phone width, and add a hero-label or `expectShape` check per case in `lib/eval/cases.ts` so `bun test` scores it from the recordings. The simulated-user turns have no recordings; the next simulated round checks them by eye against the same table.

- [x] R1–R10 in `lib/cards/present.ts`, `lib/dashboard/metric-display.ts`, `components/cards/registry.tsx` and the exchange view
- [x] Checks per case, every listed case replayed and screenshot-reviewed

## Card style (user decision 2026-10-16)

The user compared three styles on real recorded results (prototype `app/dev/card-variants`, branch `worktree-agent-aec5e6183fd53c073`, commit `49f8388`) and chose: "ใช้ B เป็นแบบหลักของการ์ดที่แยกตามแถว (เทียบเป้า จัดอันดับ อะไรตกหรือขึ้นมากสุด) ถ้าเกิน 8 แถวให้สลับเป็น A อัตโนมัติ ส่วน C เก็บไว้ใช้กับการ์ดสรุปหลายตัวเลข".

- **B, picture first**, for breakdown cards (R3 target, R4 change, R5 ranking, R6 level line, R7 threshold): a verdict sentence as the headline, one strip of bars on a shared scale around the deciding line with the overall row on top as the hero, exceptions drawn thick in the danger or success colour with values, normal rows thin and muted without values except the extremes.
- **A, verdict and exceptions**, automatically when a breakdown has more than 8 rows: the verdict, the hero number with one coloured change, only the exception rows drawn, the normal rows folded into one muted line that expands.
- **C, scorecard**, for summary cards that carry several numbers about one scope (no breakdown): the verdict and 2 to 3 tiles.
- Every style: the headline is a verdict built in code from the result, one hero number with one coloured change, colour only for meaning, no axis or centre-line captions, no "ทำอะไรต่อ" label, one primary action with the rest behind a small menu, date and source as one footer line, about 20 to 25 words on the card excluding row labels.

- **Leaderboard** (inside B), for a plain level breakdown: sums that add up, no target, 3 to 8 rows, the question is who is how big. Every row is visible, bar length is the value from zero, and the change pill is coloured only on the rows whose change stands out. Not for target, change ranking, share of a whole with 5 or fewer parts, rates and averages, or time.
- Keep these bodies and give them only the shared anatomy: the share donut (no repeated value in its centre), the funnel, the anomaly list, approval and handoff cards, the matter path, entity cards. Fix the heatmap's overflow and colour only its exception cells; label only the outliers on a scatter and say the correlation in words; use Thai units on line-chart axes.

- [x] B, A and C in production, chosen by the decision table
- [x] Every recorded case replayed at phone width and reviewed
