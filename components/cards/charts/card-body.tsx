"use client";

import { BarChart, LineChart, RankList, Table } from "vexa/react";
import type { CardBody } from "@/lib/cards/present";
import { SignalList } from "../signal-list";
import { ForecastBand } from "./forecast-band";
import { Funnel } from "./funnel";
import { GapBars } from "./gap-bars";
import { Heatmap } from "./heatmap";
import { Meter } from "./meter";
import { Scatter } from "./scatter";
import { ShareDonut } from "./share-donut";
import { StackedArea } from "./stacked-area";

/** Every body kind a `CardParts` can carry, rendered the same way on both surfaces: dumb components fed pre-decided props. */
export function CardBodyView({ body }: { body: CardBody }) {
  if (body.kind === "rank") return <RankList props={{ items: body.rows, showRank: body.showRank }} />;
  if (body.kind === "progress") return <Meter value={body.value} detail={body.detail} />;
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
  if (body.kind === "heatmap") return <Heatmap rowLabels={body.rowLabels} columnLabels={body.columnLabels} cells={body.cells} scale={body.scale} legend={body.legend} />;
  if (body.kind === "scatter") return <Scatter points={body.points} x={body.x} y={body.y} note={body.note} />;
  if (body.kind === "gap") return <GapBars rows={body.rows} ends={body.ends} caption={body.caption} shownOf={body.shownOf} />;
  if (body.kind === "funnel") return <Funnel stages={body.stages} />;
  if (body.kind === "table") return <Table props={{ columns: body.columns, rows: body.rows }} />;
  if (body.kind === "alerts") return <SignalList items={body.items} />;
  if (body.kind === "forecast") return <ForecastBand labels={body.labels} actual={body.actual} forecast={body.forecast} lo={body.lo} hi={body.hi} format={body.format} />;
  return null;
}
