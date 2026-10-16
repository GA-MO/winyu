"use client";

import { BarChart, LineChart } from "@/components/ui/charts";
import { Table } from "@/components/ui/primitives";
import type { CardBody } from "@/lib/cards/present";
import { SignalList } from "../signal-list";
import { ForecastBand } from "./forecast-band";
import { Funnel } from "./funnel";
import { GapBars } from "./gap-bars";
import { Heatmap } from "./heatmap";
import { LockedRank } from "./locked-rank";
import { Scatter } from "./scatter";
import { ShareDonut } from "./share-donut";
import { StackedArea } from "./stacked-area";
import { ExceptionsView, StripView } from "./strip";

/** Every body kind a `CardParts` can carry, rendered the same way on both surfaces: dumb components fed pre-decided props. */
export function CardBodyView({ body }: { body: CardBody }) {
  if (body.kind === "strip") return <StripView strip={body.strip} />;
  if (body.kind === "exceptions") return <ExceptionsView strip={body.strip} fold={body.fold} />;
  if (body.kind === "locked") return <LockedRank rows={body.rows} locked={body.locked} askHref={body.askHref} />;
  if (body.kind === "line") {
    return (
      <LineChart
        props={{ title: null, labels: body.labels, series: body.series, area: body.series.length === 1, showDots: false, format: body.format, height: "md" }}
      />
    );
  }
  if (body.kind === "stacked" && body.shape === "bar") {
    return <BarChart props={{ title: null, labels: body.labels, series: body.series, stacked: true, format: body.format, height: "md" }} />;
  }
  if (body.kind === "stacked") return <StackedArea labels={body.labels} series={body.series} format={body.format} />;
  if (body.kind === "share") return <ShareDonut slices={body.slices} centerValue={body.centerValue} centerLabel={body.centerLabel} />;
  if (body.kind === "heatmap") return <Heatmap rowLabels={body.rowLabels} columnLabels={body.columnLabels} cells={body.cells} />;
  if (body.kind === "scatter") return <Scatter points={body.points} x={body.x} y={body.y} />;
  if (body.kind === "gap") return <GapBars rows={body.rows} shownOf={body.shownOf} />;
  if (body.kind === "funnel") return <Funnel stages={body.stages} />;
  if (body.kind === "table") return <Table props={{ columns: body.columns, rows: body.rows }} />;
  if (body.kind === "alerts") return <SignalList items={body.items} more={body.more} />;
  if (body.kind === "forecast") return <ForecastBand labels={body.labels} actual={body.actual} forecast={body.forecast} lo={body.lo} hi={body.hi} format={body.format} />;
  return null;
}
