import { DIMS, REGIONS, ROLE_IDS, type Dim, type NativeToolName, type Region, type RoleId } from "@/lib/contracts";
import { agentById } from "@/lib/data/entities/agents";
import { dcById } from "@/lib/data/entities/supply";
import { findUser } from "@/lib/data/entities/users";
import { periodLabelTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { metricDef, TIME_DIMS } from "@/lib/semantic/metrics";
import { sharedWith } from "./describe-call";

const DETAIL_SEPARATOR = " · ";
const RANGE_SEPARATOR = "–";
const FIRST_OF_MONTH = "01";
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** What one tool call is doing in the person's words, built from the call's arguments alone: the short action ("ดึงมูลค่าขายเข้า"), what it is about, and whether it reads or prepares a write. */
export type ToolAction = { action: string; detail: string | null; kind: "read" | "write" };

type Args = Readonly<Record<string, unknown>>;
type Builder = (args: Args) => ToolAction;

function argsOf(input: unknown): Args {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Args) : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function detailOf(parts: ReadonlyArray<string | null>): string | null {
  const present = parts.filter((part): part is string => part !== null);
  return present.length > 0 ? present.join(DETAIL_SEPARATOR) : null;
}

function read(action: string, ...parts: Array<string | null>): ToolAction {
  return { action, detail: detailOf(parts), kind: "read" };
}

function write(action: string, ...parts: Array<string | null>): ToolAction {
  return { action, detail: detailOf(parts), kind: "write" };
}

function metricOf(value: unknown): string {
  return metricDef(String(value ?? ""))?.labelTh ?? TH.trail.someData;
}

function quoted(value: unknown): string | null {
  const said = text(value);
  return said ? TH.trail.quoted(said) : null;
}

function rangeLabel(value: unknown): string | null {
  const range = argsOf(value);
  const from = ISO_DATE.exec(String(range.from ?? ""));
  const to = ISO_DATE.exec(String(range.to ?? ""));
  if (!from || !to) return null;
  if (from[0] === to[0]) return periodLabelTh(from[0]);
  if (from[1] === to[1] && from[2] === to[2] && from[3] === FIRST_OF_MONTH) return periodLabelTh(`${from[1]}-${from[2]}`);
  return `${periodLabelTh(from[0])}${RANGE_SEPARATOR}${periodLabelTh(to[0])}`;
}

function isDim(value: unknown): value is Dim {
  return DIMS.some((dim) => dim === value);
}

function isRegion(value: unknown): value is Region {
  return REGIONS.some((region) => region === value);
}

function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function splitLabel(dims: unknown): string | null {
  const split = listOf(dims).filter(isDim).filter((dim) => !TIME_DIMS.includes(dim));
  return split.length > 0 ? TH.trail.by(split.map((dim) => TH.dim[dim]).join(TH.trail.and)) : null;
}

function regionsOf(value: unknown): string | null {
  const regions = listOf(value).filter(isRegion);
  return regions.length > 0 ? regions.map((region) => TH.region[region]).join(TH.trail.and) : null;
}

function regionFilter(filters: unknown): string | null {
  return regionsOf(argsOf(filters).region);
}

function personName(args: Args): string | null {
  const id = text(args.id) ?? text(args.toUserId);
  return text(args.name) ?? (id ? (findUser(id)?.nameTh ?? null) : null);
}

function agentName(id: unknown): string | null {
  return typeof id === "string" && id ? (agentById(id)?.nameTh ?? id) : null;
}

function isRole(value: unknown): value is RoleId {
  return ROLE_IDS.some((role) => role === value);
}

function roleLabel(role: unknown): string {
  return isRole(role) ? TH.role[role] : TH.trail.someone;
}

const BUILDERS: { [Name in NativeToolName]: Builder } = {
  query_metric: (args) => read(TH.trail.pullMetric(metricOf(args.metric)), splitLabel(args.dims), regionFilter(args.filters), rangeLabel(args.range)),
  list_metrics: () => read(TH.trail.listMetrics),
  describe_entity: (args) => read(TH.trail.findEntity(TH.trail.entity[String(args.kind)] ?? TH.trail.someData), quoted(args.query)),
  get_alerts: () => read(TH.trail.alerts),
  get_forecast: (args) => read(TH.trail.forecast(metricOf(args.metric)), regionsOf(argsOf(args.dims).region), typeof args.weeks === "number" ? TH.trail.weeksAhead(args.weeks) : null),
  explain_gap: (args) => read(TH.trail.gap(metricOf(args.metric)), splitLabel(args.split), regionFilter(args.filters), TH.trail.compare[String(args.compare)] ?? null, rangeLabel(args.range)),
  get_calendar: (args) => read(TH.trail.calendar, rangeLabel(args)),
  recall_memory: () => read(TH.trail.memory),
  find_people: (args) => read(TH.trail.findPeople, regionsOf(args.region), text(args.department), quoted(args.query)),
  get_person: (args) => read(TH.trail.person(personName(args) ?? TH.trail.someone)),
  get_site: (args) => read(TH.trail.site(text(args.name) ?? TH.trail.someSite)),
  list_candidates: (args) => read(TH.trail.candidates, text(args.position)),
  training_history: (args) => read(TH.admin.tools.training_history.label, personName({ id: args.employeeId, name: args.name })),
  store_visits: (args) => read(TH.admin.tools.store_visits.label, agentName(args.agentId)),
  list_courses: (args) => read(TH.trail.courses, typeof args.month === "string" ? periodLabelTh(args.month) : null, quoted(args.query)),
  get_policy: (args) => read(TH.trail.policy[String(args.topic)] ?? TH.trail.somePolicy),
  search_documents: () => read(TH.trail.documents),
  resolve_owner: (args) => read(TH.trail.owner(metricOf(args.metric)), regionsOf(argsOf(args.dims).region)),
  ask_logistics_partner: (args) => read(TH.trail.partner, TH.trail.partnerAbout(dcById(String(args.dc ?? ""))?.nameTh ?? TH.dim.dc)),
  request_leave: (args) => write(TH.trail.leave(TH.leave.kind[String(args.kind)] ?? TH.trail.someLeave), rangeLabel(args)),
  enroll_course: () => write(TH.trail.enroll),
  create_handoff: (args) => write(TH.trail.handoff(personName(args) ?? TH.trail.colleague), quoted(args.title)),
  send_email: (args) => write(TH.trail.email(personName(args) ?? TH.trail.colleague)),
  share_card: (args) => write(TH.trail.share(sharedWith(args.to) || TH.trail.colleague)),
  pin_widget: (args) => write(TH.trail.pin, quoted(args.title)),
  watch_metric: (args) => write(TH.trail.watch, quoted(args.title)),
  run_job: (args) => write(TH.trail.job(TH.approve.jobs[String(args.job)] ?? TH.trail.tool)),
  set_permission: (args) => write(TH.trail.permission(roleLabel(args.role))),
};

function isNative(name: string): name is NativeToolName {
  return Object.hasOwn(BUILDERS, name);
}

/** Names one tool call from its own arguments, never its result: a native tool by its builder, any other tool (a connector's) by its Thai label alone so none of its arguments show; `labels` are the surface's Thai tool labels. Arguments a tool redacts (personal text) are never read. */
export function toolActionOf(name: string, input: unknown, labels: Readonly<Record<string, string>>): ToolAction {
  if (isNative(name)) return BUILDERS[name](argsOf(input));
  return read(labels[name] ?? TH.trail.tool);
}

