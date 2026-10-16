import { REGIONS, type Dim, type DimValues, type Region } from "@/lib/contracts";
import { geoValueOf } from "./geo";
import type { Dictionary, EntityKind } from "./dictionary";

const SET_ASIDE = /(?:นอกจาก|ยกเว้น|ไม่นับ|ไม่รวม)\s*(\S+)/g;
const JOINED = /และ|กับ|,/;
const LEAD_WORDS = /^(?:เรื่อง|ของ|ฝั่ง|ส่วน|ทาง)+/;
const PLACE_DIMS = ["agent", "province", "region"] as const satisfies readonly (Dim & EntityKind)[];

type PlaceDim = (typeof PLACE_DIMS)[number];

function placeIn(dictionary: Dictionary, words: string): { dim: PlaceDim; id: string } | null {
  const text = words.replace(LEAD_WORDS, "").trim();
  if (!text) return null;
  const found = PLACE_DIMS.flatMap((dim) => {
    const match = dictionary.resolveEntity(dim, text);
    return match ? [{ dim, id: match.id, score: match.score }] : [];
  });
  const best = found.reduce<(typeof found)[number] | null>((top, entry) => (!top || entry.score > top.score ? entry : top), null);
  return best ? { dim: best.dim, id: best.id } : null;
}

/** The places a question sets aside ("นอกจากเรื่องอีสาน", "ยกเว้นอีสานรุ่งโรจน์ ค้าส่ง", "ไม่นับภาคใต้กับภาคเหนือ"), by dimension, as ids; empty when it sets none aside. */
export function excludedIn(question: string | null, dictionary: Dictionary): DimValues {
  if (!question) return {};
  const excluded: DimValues = {};
  for (const [, clause] of question.matchAll(SET_ASIDE)) {
    for (const words of (clause ?? "").split(JOINED)) {
      const place = placeIn(dictionary, words);
      if (place && !excluded[place.dim]?.includes(place.id)) excluded[place.dim] = [...(excluded[place.dim] ?? []), place.id];
    }
  }
  return excluded;
}

/** Whether something scoped by `dims` (an alert) sits inside a place the question set aside: an agent sits inside its province and region. */
export function isExcluded(dictionary: Dictionary, excluded: DimValues, dims: Partial<Record<Dim, string>>): boolean {
  return (Object.entries(excluded) as [Dim, string[]][]).some(([dim, ids]) => {
    const value = geoValueOf(dictionary, dims, dim);
    return value !== null && ids.includes(value);
  });
}

function placesIn(dictionary: Dictionary, dim: PlaceDim, regions: readonly Region[]): string[] {
  if (dim === "region") return [...regions];
  const rows = dim === "province" ? dictionary.master.provinces : dictionary.master.agents;
  return rows.filter((row) => regions.includes(row.region)).map((row) => row.id);
}

function isPlaceDim(dim: Dim): dim is PlaceDim {
  return (PLACE_DIMS as readonly Dim[]).includes(dim);
}

/** Filters that keep a place the question set aside out of a query, as the places that remain within the asker's regions: a filter the query already has loses the excluded values, an unfiltered dimension the metric has gets every other place. Nothing changes where the exclusion would leave nothing (a manager setting aside his only region) or the metric lacks the dimension. */
export function filtersWithout(filters: DimValues, excluded: DimValues, metricDims: readonly Dim[], scope: readonly Region[] | "all", dictionary: Dictionary): DimValues {
  const regions = scope === "all" ? REGIONS : scope;
  let kept = filters;
  for (const [dim, ids] of Object.entries(excluded) as [Dim, string[]][]) {
    if (!isPlaceDim(dim) || !metricDims.includes(dim)) continue;
    const asked = filters[dim] ?? [];
    const from = asked.length > 0 ? asked : placesIn(dictionary, dim, regions);
    const remaining = from.filter((value) => !ids.includes(dictionary.resolveDimValue(dim, value) ?? value));
    if (remaining.length === 0 || remaining.length === from.length) continue;
    kept = { ...kept, [dim]: remaining };
  }
  return kept;
}
