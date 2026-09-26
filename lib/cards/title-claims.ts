import type { MetricQuery, MetricRow } from "@/lib/contracts";

const TIME_DIMS: ReadonlySet<string> = new Set(["date", "week", "month"]);
const CLAUSE_BREAK = /ขณะที่|ในขณะ|แต่(?!ละ)|โดย|ยกเว้น|,|;/;
const UP_WORDS = /เพิ่มขึ้น|ขยับขึ้น|เติบโต|โตขึ้น|โต|ดีขึ้น|สูงขึ้น|ขยายตัว|ปรับขึ้น|ปรับตัวขึ้น|ฟื้นตัว|ฟื้น/;
const DOWN_WORDS = /ลดลง|ขยับลง|ตกลง|ยอดตก|ตก|หดตัว|หด|ชะลอ|แย่ลง|ปรับลด|ต่ำลง|หายไป|หาย/;
const MOST_HIGH = /มากที่สุด|มากสุด|สูงที่สุด|สูงสุด|แรงที่สุด|แรงสุด|ดีที่สุด|ดีสุด|หนักที่สุด|หนักสุด/;
const MOST_LOW = /น้อยที่สุด|น้อยสุด|ต่ำที่สุด|ต่ำสุด|แย่ที่สุด|แย่สุด/;
const CHANGE_MOST = /(เพิ่มขึ้น|เติบโต|โต|ดีขึ้น|สูงขึ้น|ขยับขึ้น|ปรับขึ้น|ลดลง|ตก|หดตัว|หด|ชะลอ|แย่ลง|ขยับลง|ปรับลด|หายไป|หาย)\s*(?:มาก|สูง|แรง|หนัก|น้อย|ต่ำ)(?:ที่)?สุด/;
const EVERY = /ทุก(?!วัน|สัปดาห์|เดือน|ปี)/;
const NEARLY_EVERY = /เกือบทุก/;
const NONE = /ไม่มี|ยังไม่มี/;
const STEADY = /ต่อเนื่อง/;
const THRESHOLD = /(น้อยกว่า|ต่ำกว่า|ไม่ถึง|มากกว่า|สูงกว่า|เกิน)\s*(\d+(?:\.\d+)?)/;
const BELOW_WORDS = new Set(["น้อยกว่า", "ต่ำกว่า", "ไม่ถึง"]);
const LABEL_MIN_CHARS = 4;
const NEGATED = /ไม่(?:ได้)?\s*(?:เพิ่มขึ้น|เติบโต|โต|ดีขึ้น|สูงขึ้น|ขยายตัว|ปรับขึ้น|ฟื้น|ลดลง|ตก|หด|ชะลอ|แย่ลง|ปรับลด|ต่ำลง|หาย)/;
const STEADY_SHARE = 0.75;
const NAMED_PERIOD = /ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|สัปดาห์ที่|W\d/;

type Direction = "up" | "down";
type Ranking = "value_desc" | "value_asc" | "delta_desc" | "delta_asc";

export type TitleClaimInput = { title: string; query: MetricQuery; rows: readonly MetricRow[] };

function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function labelDim(query: MetricQuery): string | null {
  return query.dims.find((dim) => !TIME_DIMS.has(dim)) ?? null;
}

function timeDim(query: MetricQuery): string | null {
  return query.dims.find((dim) => TIME_DIMS.has(dim)) ?? null;
}

function directionIn(clause: string): Direction | null {
  if (NEGATED.test(clause)) return null;
  const up = UP_WORDS.test(clause);
  const down = DOWN_WORDS.test(clause);
  if (up === down) return null;
  return up ? "up" : "down";
}

function moves(delta: number, direction: Direction): boolean {
  return direction === "up" ? delta > 0 : delta < 0;
}

function firstWord(label: string): string {
  return label.split(/\s+/)[0];
}

function namedIn(clause: string, label: string, sharedFirstWords: ReadonlySet<string>): boolean {
  if (label.length >= LABEL_MIN_CHARS && clause.includes(label)) return true;
  const first = firstWord(label);
  return first.length >= LABEL_MIN_CHARS && first !== label && !sharedFirstWords.has(first) && clause.includes(first);
}

function namedRows(clause: string, rows: readonly MetricRow[], dim: string): MetricRow[] {
  const labels = rows.map((row) => row[dim]).filter((label): label is string => typeof label === "string");
  const shared = new Set(labels.map(firstWord).filter((word) => labels.filter((label) => label.includes(word)).length > 1));
  const named = rows.filter((row) => typeof row[dim] === "string" && namedIn(clause, row[dim] as string, shared));
  const names = named.map((row) => row[dim] as string);
  return named.filter((row) => !names.some((other) => other !== row[dim] && other.includes(row[dim] as string)));
}

function rankingFor(clause: string): Ranking | null {
  const high = MOST_HIGH.test(clause);
  const low = MOST_LOW.test(clause);
  if (high === low) return null;
  const change = CHANGE_MOST.exec(clause);
  const direction = change ? directionIn(change[1]) : null;
  if (direction === "down") return high ? "delta_asc" : "delta_desc";
  if (direction === "up") return high ? "delta_desc" : "delta_asc";
  return high ? "value_desc" : "value_asc";
}

function rankKey(row: MetricRow, ranking: Ranking): number | null {
  const value = numberOf(ranking.startsWith("delta") ? row.delta_pct : row.value);
  if (value === null) return null;
  return ranking.endsWith("desc") ? -value : value;
}

function rankClaim(clause: string, rows: readonly MetricRow[], dim: string): string | null {
  const ranking = rankingFor(clause);
  if (!ranking) return null;
  const named = namedRows(clause, rows, dim);
  if (named.length === 0) return null;
  const keyed = rows.map((row) => rankKey(row, ranking)).filter((key): key is number => key !== null).sort((a, b) => a - b);
  const cutoff = keyed[named.length - 1];
  if (cutoff === undefined) return null;
  const outside = named.filter((row) => {
    const key = rankKey(row, ranking);
    return key !== null && key > cutoff;
  });
  if (outside.length === 0) return null;
  const place = (row: MetricRow) => keyed.indexOf(rankKey(row, ranking) as number) + 1;
  return `ชื่ออ้างว่า${outside.map((row) => ` ${row[dim]}`).join(",")} อยู่อันดับต้น แต่อยู่อันดับ ${outside.map(place).join(", ")} จาก ${keyed.length}`;
}

function statesCount(clause: string, count: number): boolean {
  return new RegExp(`(^|\\D)${count}\\s*(รายการ|ราย|ตัว|SKU|แห่ง|แถว|เอเย่นต์|ภาค|จังหวัด|ช่องทาง|แบรนด์|สินค้า)`).test(clause);
}

function directionClaim(clause: string, rows: readonly MetricRow[], dim: string, direction: Direction): string | null {
  const deltas = rows.map((row) => numberOf(row.delta_pct));
  const known = deltas.filter((delta): delta is number => delta !== null);
  if (known.length === 0) return null;
  const word = direction === "up" ? "เพิ่มขึ้น" : "ลดลง";
  const named = MOST_HIGH.test(clause) || MOST_LOW.test(clause) ? [] : namedRows(clause, rows, dim);
  if (named.length > 0) {
    const wrong = named.filter((row) => {
      const delta = numberOf(row.delta_pct);
      return delta !== null && !moves(delta, direction);
    });
    return wrong.length === 0 ? null : `ชื่อว่า${wrong.map((row) => ` ${row[dim]}`).join(",")}${word} แต่แถวไม่ได้${word}`;
  }
  const moving = known.filter((delta) => moves(delta, direction)).length;
  if (moving > 0 && statesCount(clause, moving)) return null;
  if (NONE.test(clause)) return moving === 0 ? null : `ชื่อว่าไม่มีแถวที่${word} แต่มี ${moving} จาก ${known.length} แถว`;
  if (EVERY.test(clause) && !NEARLY_EVERY.test(clause)) return moving === known.length ? null : `ชื่อว่าทุกแถว${word} แต่${word}แค่ ${moving} จาก ${known.length} แถว`;
  if (MOST_HIGH.test(clause) || MOST_LOW.test(clause)) return moving > 0 ? null : `ชื่อว่า${word}มากที่สุด แต่ไม่มีแถวที่${word}`;
  const against = known.filter((delta) => moves(delta, direction === "up" ? "down" : "up")).length;
  return moving >= against ? null : `ชื่อว่า${word} แต่${word}แค่ ${moving} จาก ${known.length} แถว`;
}

function thresholdClaim(clause: string, rows: readonly MetricRow[]): string | null {
  const match = THRESHOLD.exec(clause);
  if (!match) return null;
  const limit = Number(match[2]);
  const below = BELOW_WORDS.has(match[1]);
  const values = rows.map((row) => numberOf(row.value)).filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  const inside = values.filter((value) => (below ? value < limit : value > limit)).length;
  if (statesCount(clause, inside)) return null;
  if (NONE.test(clause)) return inside === 0 ? null : `ชื่อว่าไม่มีแถวที่${match[1]} ${match[2]} แต่มี ${inside} แถว`;
  return inside * 2 >= values.length ? null : `ชื่อว่า${match[1]} ${match[2]} แต่การ์ดแสดง ${values.length} แถวที่เข้าเกณฑ์แค่ ${inside} แถว`;
}

function trendClaim(clause: string, rows: readonly MetricRow[], direction: Direction): string | null {
  const values = rows.map((row) => numberOf(row.value)).filter((value): value is number => value !== null);
  if (values.length < 3) return null;
  const steps = values.slice(1).map((value, index) => value - values[index]);
  const first = values[0];
  const last = values[values.length - 1];
  const word = direction === "up" ? "เพิ่มขึ้น" : "ลดลง";
  const overall = direction === "up" ? last > first : last < first;
  const deltas = rows.map((row) => numberOf(row.delta_pct)).filter((delta): delta is number => delta !== null);
  const againstPrior = deltas.length > 0 && deltas.filter((delta) => moves(delta, direction)).length * 2 >= deltas.length;
  if (!overall && !againstPrior && !NAMED_PERIOD.test(clause)) return `ชื่อว่า${word} แต่ค่าล่าสุดไม่ได้${word}จากค่าแรก`;
  if (!STEADY.test(clause) || NAMED_PERIOD.test(clause)) return null;
  const along = steps.filter((step) => moves(step, direction)).length;
  return along >= steps.length * STEADY_SHARE ? null : `ชื่อว่า${word}ต่อเนื่อง แต่${word}แค่ ${along} จาก ${steps.length} ช่วง`;
}

function clauseClaim(clause: string, input: TitleClaimInput): string | null {
  const direction = directionIn(clause);
  const threshold = thresholdClaim(clause, input.rows);
  if (threshold) return threshold;
  const dim = labelDim(input.query);
  if (timeDim(input.query)) return !dim && direction ? trendClaim(clause, input.rows, direction) : null;
  if (!dim) return null;
  const rank = rankClaim(clause, input.rows, dim);
  if (rank) return rank;
  return direction ? directionClaim(clause, input.rows, dim, direction) : null;
}

/** Why a card's title says something its rows do not bear out (direction, "every", "most", a threshold, "steadily"); null when the rows agree or the title claims nothing checkable. */
export function titleContradiction(input: TitleClaimInput): string | null {
  if (input.rows.length === 0) return null;
  for (const clause of input.title.split(CLAUSE_BREAK)) {
    const found = clauseClaim(clause.trim(), input);
    if (found) return found;
  }
  return null;
}
