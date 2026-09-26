import type { MetricQuery, MetricRow } from "@/lib/contracts";
import { specOf } from "@/lib/eval/spec-of";
import { titleContradiction } from "@/lib/cards/title-claims";

const WALK_COLUMNS = ["role", "user", "thread", "turn", "question", "card", "correct", "fit", "readable", "sensible", "issues", "layer", "tag", "screen", "shouldBe"] as const;
const SCORE_KEYS = ["correct", "fit", "readable", "sensible"] as const;
const BOUND_CARDS = new Set(["DataCard", "AlertsCard", "ForecastCard"]);
const SCREEN_LINK = /\]\(([^)]+)\)/;
const NO_CARD = /^ไม่มี/;
const BOUND_PATH = /^\/tools\/([a-z_]+)(?:\.(\d+))?$/;
const TITLE_LAYER = "check title";
const REDO_LAYERS = /prompt|check title|masked|empty|Forecast|ความสด|เจ้าของ|วาดเอง/;

type WalkColumn = (typeof WALK_COLUMNS)[number];
type ScoreKey = (typeof SCORE_KEYS)[number];

export type CardScores = Record<ScoreKey, number | null>;

export type WalkLabel = {
  key: string;
  card: string;
  scores: CardScores;
  issues: string;
  layer: string;
  tags: string[];
  screen: string | null;
  shouldBe: string | null;
};

export type ReviewTurn = {
  run: string;
  session: number;
  userId: string;
  role: string;
  threadId: string;
  turn: number;
  sent: string | null;
  pressed: { kind: string; found: boolean } | null;
  status: string;
  error: string | null;
  text: string;
  tools: { name: string; state: string; input: unknown; output: unknown }[];
  messages: { role: string; parts: Record<string, unknown>[] }[];
};

export type CardElement = { id: string; type: string; props: unknown; children: string[] };

export type CardReviewRow = {
  key: string;
  run: string;
  session: number;
  threadId: string;
  turn: number;
  userId: string;
  role: string;
  question: string | null;
  pressed: string | null;
  reply: string;
  status: string;
  components: string[];
  bound: boolean;
  card: string;
  elements: CardElement[];
  tools: { name: string; state: string; input: unknown; output: unknown }[];
  scores: CardScores;
  issues: string;
  layer: string;
  tags: string[];
  shouldBe: string | null;
  reviewedBy: "browser" | "transcript";
  screen: string | null;
};

/** The short key a review uses for a turn: the thread id's first eight characters and the turn index. */
export function turnKey(threadId: string, turn: number): string {
  return `${threadId.slice(0, 8)}/${turn}`;
}

function scoreOf(cell: string): number | null {
  const value = Number(cell);
  return Number.isInteger(value) && value >= 1 && value <= 3 ? value : null;
}

function blankToNull(cell: string): string | null {
  return cell === "" || cell === "–" ? null : cell;
}

function cellsOf(line: string): string[] {
  return line.split("|").slice(1, -1).map((cell) => cell.trim());
}

/** Every scored turn in a card-walk table, keyed by `turnKey`. */
export function parseWalk(markdown: string): Map<string, WalkLabel> {
  const labels = new Map<string, WalkLabel>();
  for (const line of markdown.split("\n")) {
    const cells = cellsOf(line);
    if (cells.length !== WALK_COLUMNS.length || !/^[0-9a-f]{8}$/.test(cells[2])) continue;
    const row = Object.fromEntries(WALK_COLUMNS.map((column, index) => [column, cells[index]])) as Record<WalkColumn, string>;
    const key = `${row.thread}/${row.turn}`;
    labels.set(key, {
      key,
      card: row.card,
      scores: { correct: scoreOf(row.correct), fit: scoreOf(row.fit), readable: scoreOf(row.readable), sensible: scoreOf(row.sensible) },
      issues: row.issues,
      layer: row.layer === "–" ? "" : row.layer,
      tags: row.tag.split(/[\s,]+/).filter(Boolean),
      screen: row.screen.match(SCREEN_LINK)?.[1] ?? null,
      shouldBe: blankToNull(row.shouldBe),
    });
  }
  return labels;
}

/** The elements of the card a turn drew, in spec order; empty when it drew none. */
export function cardElements(turn: ReviewTurn): CardElement[] {
  const reply = turn.messages.filter((message) => message.role === "assistant").at(-1);
  const spec = reply ? (specOf(reply.parts) as { elements?: Record<string, { type: string; props?: unknown; children?: string[] }> } | null) : null;
  return Object.entries(spec?.elements ?? {}).map(([id, element]) => ({ id, type: element.type, props: element.props ?? {}, children: element.children ?? [] }));
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** A one-line description of a drawn card, the same shape the card-walk table uses. */
export function describeCard(elements: readonly CardElement[]): string {
  const types = distinct(elements.map((element) => element.type));
  const bound = elements.filter((element) => BOUND_CARDS.has(element.type));
  if (bound.length === 1 && types.length === 1) {
    const props = bound[0].props as { sortBy?: string | null };
    return props.sortBy ? `${bound[0].type} (${props.sortBy})` : bound[0].type;
  }
  return bound.length > 0 ? types.join("+") : `${types.join("+")} (วาดเอง)`;
}

function scoredHostCard(label: WalkLabel | undefined): boolean {
  return label !== undefined && !NO_CARD.test(label.card) && SCORE_KEYS.some((key) => label.scores[key] !== null);
}

/** One dataset row per turn that showed a card (drawn by the model or a scored host card), joined with its review label. */
export function buildReview(turns: readonly ReviewTurn[], labels: ReadonlyMap<string, WalkLabel>): CardReviewRow[] {
  const rows: CardReviewRow[] = [];
  for (const turn of turns) {
    const key = turnKey(turn.threadId, turn.turn);
    const elements = cardElements(turn);
    const label = labels.get(key);
    if (elements.length === 0 && !scoredHostCard(label)) continue;
    const components = distinct(elements.map((element) => element.type));
    rows.push({
      key,
      run: turn.run,
      session: turn.session,
      threadId: turn.threadId,
      turn: turn.turn,
      userId: turn.userId,
      role: turn.role,
      question: turn.sent,
      pressed: turn.pressed?.kind ?? null,
      reply: turn.text,
      status: turn.error ? `${turn.status}: ${turn.error}` : turn.status,
      components,
      bound: components.some((type) => BOUND_CARDS.has(type)),
      card: label?.card ?? describeCard(elements),
      elements,
      tools: turn.tools.map(({ name, state, input, output }) => ({ name, state, input, output })),
      scores: label?.scores ?? { correct: null, fit: null, readable: null, sensible: null },
      issues: label?.issues ?? "",
      layer: label?.layer ?? "",
      tags: label?.tags ?? [],
      shouldBe: label?.shouldBe ?? null,
      reviewedBy: label?.screen ? "browser" : "transcript",
      screen: label?.screen ?? null,
    });
  }
  return rows;
}

/** Rows that still lack a score on any rubric line, by key. */
export function unscored(rows: readonly CardReviewRow[]): string[] {
  return rows.filter((row) => row.elements.length > 0 && SCORE_KEYS.some((key) => row.scores[key] === null)).map((row) => row.key);
}

/** Mean of each rubric line over rows that carry that score, rounded to two places. */
export function meanScores(rows: readonly CardReviewRow[]): CardScores {
  const means = {} as CardScores;
  for (const key of SCORE_KEYS) {
    const values = rows.map((row) => row.scores[key]).filter((value): value is number => value !== null);
    means[key] = values.length === 0 ? null : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
  }
  return means;
}

export type TitleFlag = { key: string; title: string; reason: string };

function boundRows(row: CardReviewRow, source: unknown): { query: MetricQuery; rows: MetricRow[] } | null {
  const path = (source as { $state?: unknown } | null)?.$state;
  const match = typeof path === "string" ? BOUND_PATH.exec(path) : null;
  if (!match) return null;
  const calls = row.tools.filter((tool) => tool.name === match[1] && tool.state === "output-available");
  const output = (match[2] ? calls[Number(match[2]) - 1] : calls.at(-1))?.output as { query?: MetricQuery; rows?: MetricRow[] } | undefined;
  return output?.query && Array.isArray(output.rows) ? { query: output.query, rows: output.rows } : null;
}

/** Every bound DataCard whose title the rows contradict, with the reason. */
export function titleFlags(rows: readonly CardReviewRow[]): TitleFlag[] {
  const flags: TitleFlag[] = [];
  for (const row of rows) {
    for (const element of row.elements) {
      if (element.type !== "DataCard") continue;
      const props = element.props as { title?: unknown; source?: unknown };
      const bound = boundRows(row, props.source);
      if (!bound || typeof props.title !== "string") continue;
      const reason = titleContradiction({ title: props.title, query: bound.query, rows: bound.rows });
      if (reason) flags.push({ key: row.key, title: props.title, reason });
    }
  }
  return flags;
}

/** Keys a reviewer marked as a title the rows do not bear out. */
export function titleLabelled(rows: readonly CardReviewRow[]): string[] {
  return rows.filter((row) => row.layer.includes(TITLE_LAYER)).map((row) => row.key);
}

function belowFull(row: CardReviewRow): boolean {
  return Object.values(row.scores).some((score) => score !== null && score < 3);
}

/** Turns whose card scored below 3 for a reason this round can fix (prompt, title, masked, empty, forecast, freshness, invented owner). */
export function redoTurns(rows: readonly CardReviewRow[]): CardReviewRow[] {
  return rows.filter((row) => belowFull(row) && (REDO_LAYERS.test(row.layer) || REDO_LAYERS.test(row.card)));
}

function sessionTurn(row: CardReviewRow): string {
  return `${row.userId}#${row.session}/${row.turn}`;
}

export type RunComparison = { pairs: number; before: CardScores; after: CardScores; dropped: string[]; added: string[] };

function scored(row: CardReviewRow): boolean {
  return Object.values(row.scores).some((score) => score !== null);
}

/** Scores of the same planned turns (user, session, turn) in an earlier run and a redo, over the scored turns the redo ran; `dropped` are earlier scored cards whose redo drew none. */
export function compareRuns(before: readonly CardReviewRow[], after: readonly CardReviewRow[], redone: ReadonlySet<string>): RunComparison {
  const earlier = new Map(before.filter((row) => redone.has(sessionTurn(row)) && scored(row)).map((row) => [sessionTurn(row), row]));
  const later = new Map(after.filter(scored).map((row) => [sessionTurn(row), row]));
  const drawn = new Set(after.map(sessionTurn));
  const shared = [...later.keys()].filter((key) => earlier.has(key));
  return {
    pairs: shared.length,
    before: meanScores(shared.map((key) => earlier.get(key) as CardReviewRow)),
    after: meanScores(shared.map((key) => later.get(key) as CardReviewRow)),
    dropped: [...earlier.values()].filter((row) => !drawn.has(sessionTurn(row))).map((row) => row.key),
    added: [...later.keys()].filter((key) => !earlier.has(key)),
  };
}
