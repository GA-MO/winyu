import type { AccessContext, CareerEvent, Employee, FeedItem, PeopleFlag, Region, RoleId } from "@/lib/contracts";
import { canSeeSalary, peopleViewOf, type PeopleView } from "@/lib/access/people-scope";
import { TODAY, toDayIndex } from "@/lib/data/dates";
import { signalsOf, tenureLabel, type CertificateState, type PeopleSignals } from "@/lib/engine/people-signals";
import { formatCurrency, formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import type { Dictionary } from "@/lib/semantic/dictionary";
import { loadDictionary } from "@/lib/server/master-data";
import { ports } from "@/lib/server/ports";
import { directoryOf, type Directory } from "@/lib/server/ports/directory";

const MAX_PEOPLE_ROWS = 12;
const HR_TASK_ROLES: ReadonlySet<RoleId> = new Set<RoleId>(["hr_manager"]);
const CERT_DUE_DAYS = 30;
const CERT_URGENT_DAYS = 14;
const LONG_OPEN_DAYS = 60;
const WEIGHT = { certExpired: 100, certDue: 80, riskHigh: 50, overtime: 40 } as const;
const RANK = { personUrgent: 700, person: 400, opening: 400 } as const;
const RANK_SPAN = 99;
const RANK_OPENING_FLOOR = 50;

type BadgeTone = "neutral" | "success" | "warning" | "danger";
export type PersonBadge = { label: string; tone: BadgeTone };
export type PersonRow = { is_you?: true; id: string; name: string; title: string; place: string; photo: string; department: string; manager: string | null; tenure: string | null; badges: PersonBadge[] };
export type PeopleQuery = { region: Region | null; departmentId: string | null; manager: string | null; query: string | null; flag: PeopleFlag | null };

const T = TH.people;

function placeOf(employee: Employee, dictionary: Dictionary): string {
  const site = employee.siteId ? dictionary.master.plants.find((plant) => plant.id === employee.siteId)?.nameTh : null;
  if (site) return site;
  const province = employee.provinceId ? dictionary.master.provinces.find((entry) => entry.id === employee.provinceId)?.nameTh : null;
  if (province) return province;
  return employee.region ? dictionary.entityLabel("region", employee.region) : T.headOffice;
}

function departmentOf(employee: Employee, dictionary: Dictionary): string {
  return dictionary.entityLabel("department", employee.departmentId);
}

function managerName(employee: Employee, directory: Directory): string | null {
  return employee.managerId ? directory.byId(employee.managerId)?.nameTh ?? null : null;
}

function certificateBadges(states: CertificateState[]): PersonBadge[] {
  return states.flatMap((state): PersonBadge[] => {
    const name = T.certShort[state.certificate.nameTh] ?? state.certificate.nameTh;
    if (state.status === "expired") return [{ label: T.badge.certExpired(name), tone: "danger" }];
    if (state.status === "expiring") return [{ label: T.badge.certExpiring(name, state.daysLeft), tone: "warning" }];
    return [];
  });
}

function factBadges(employee: Employee, signals: PeopleSignals): PersonBadge[] {
  const badges: PersonBadge[] = [];
  if (signals.onProbation) badges.push({ label: T.badge.probation, tone: "neutral" });
  else if (signals.newHire) badges.push({ label: T.badge.newHire, tone: "neutral" });
  if (signals.highOvertime) badges.push({ label: T.badge.overtime(employee.overtimeHours3m), tone: "warning" });
  badges.push(...certificateBadges(signals.certificates));
  if (signals.yearsToRetirement !== null) badges.push({ label: T.badge.retirement(signals.yearsToRetirement), tone: "neutral" });
  return badges;
}

function riskBadge(signals: PeopleSignals): PersonBadge[] {
  if (signals.risk === "high") return [{ label: T.badge.riskHigh, tone: "danger" }];
  if (signals.risk === "watch") return [{ label: T.badge.riskWatch, tone: "warning" }];
  return [];
}

function badgesFor(employee: Employee, signals: PeopleSignals, view: PeopleView): PersonBadge[] {
  if (view === "directory") return [];
  const facts = factBadges(employee, signals);
  return view === "hr" ? [...riskBadge(signals), ...facts] : facts;
}

function rowOf(access: AccessContext, employee: Employee, view: PeopleView, directory: Directory, dictionary: Dictionary): PersonRow {
  const signals = signalsOf(employee);
  return {
    ...(employee.id === access.userId ? { is_you: true } : {}),
    id: employee.id,
    name: employee.nameTh,
    title: employee.title,
    place: placeOf(employee, dictionary),
    photo: employee.photo,
    department: departmentOf(employee, dictionary),
    manager: managerName(employee, directory),
    tenure: view === "directory" ? null : tenureLabel(signals.tenureDays),
    badges: badgesFor(employee, signals, view),
  };
}

function matchesManager(employee: Employee, manager: string, directory: Directory): boolean {
  const lead = directory.byId(manager) ?? directory.employees.find((candidate) => candidate.nameTh.includes(manager));
  if (!lead) return false;
  return employee.id === lead.id || directory.reportsTo(employee, lead.id);
}

function matchesText(employee: Employee, query: string, dictionary: Dictionary): boolean {
  const needle = query.trim();
  return employee.nameTh.includes(needle) || employee.title.includes(needle) || placeOf(employee, dictionary).includes(needle);
}

function matchesFlag(signals: PeopleSignals, flag: PeopleFlag, view: PeopleView): boolean {
  if (view === "directory") return false;
  if (flag === "new") return signals.newHire;
  if (flag === "overtime") return signals.highOvertime;
  if (flag === "retiring") return signals.yearsToRetirement !== null;
  if (flag === "cert_expiring") return signals.certificates.some((state) => state.status !== "valid");
  return view === "hr" && signals.risk !== null;
}

function matches(employee: Employee, query: PeopleQuery, view: PeopleView, directory: Directory, dictionary: Dictionary): boolean {
  if (query.region && employee.region !== query.region) return false;
  if (query.departmentId && employee.departmentId !== query.departmentId) return false;
  if (query.manager && !matchesManager(employee, query.manager, directory)) return false;
  if (query.query && !matchesText(employee, query.query, dictionary)) return false;
  if (query.flag && !matchesFlag(signalsOf(employee), query.flag, view)) return false;
  return true;
}

function leadFirst(directory: Directory) {
  const reportCount = (lead: Employee) => directory.employees.filter((employee) => employee.managerId === lead.id).length;
  return (left: Employee, right: Employee) => reportCount(right) - reportCount(left) || left.hiredOn.localeCompare(right.hiredOn);
}

function openPositionsFor(access: AccessContext, query: PeopleQuery, directory: Directory) {
  return directory.openPositions.filter((position) => {
    if (access.regions !== "all" && position.region && !access.regions.includes(position.region)) return false;
    if (query.region && position.region !== query.region) return false;
    if (query.departmentId && position.departmentId !== query.departmentId) return false;
    const lead = directory.byId(position.managerId);
    if (query.manager && lead && !matchesManager(lead, query.manager, directory)) return false;
    return true;
  }).map((position) => ({
    id: position.id,
    title: position.title,
    manager: directory.byId(position.managerId)?.nameTh ?? null,
    open_label: T.openPosition(toDayIndex(TODAY) - toDayIndex(position.openedOn)),
  }));
}

type Issue = { kind: "cert" | "risk" | "overtime"; subject: string; label: string; weight: number; urgent: boolean };

function issuesOf(employee: Employee, signals: PeopleSignals, view: PeopleView): Issue[] {
  const issues: Issue[] = signals.certificates.flatMap((state): Issue[] => {
    const name = T.certShort[state.certificate.nameTh] ?? state.certificate.nameTh;
    if (state.status === "expired") return [{ kind: "cert", subject: name, label: T.badge.certExpired(name), weight: WEIGHT.certExpired, urgent: true }];
    if (state.daysLeft > CERT_DUE_DAYS) return [];
    return [{ kind: "cert", subject: name, label: T.badge.certExpiring(name, state.daysLeft), weight: WEIGHT.certDue - state.daysLeft, urgent: state.daysLeft <= CERT_URGENT_DAYS }];
  });
  if (view === "hr" && signals.risk === "high") issues.push({ kind: "risk", subject: "risk", label: T.badge.riskHigh, weight: WEIGHT.riskHigh, urgent: false });
  if (signals.highOvertime) issues.push({ kind: "overtime", subject: "overtime", label: T.badge.overtime(employee.overtimeHours3m), weight: WEIGHT.overtime, urgent: false });
  return issues.sort((left, right) => right.weight - left.weight);
}

function personItem(employee: Employee, issues: Issue[]): FeedItem {
  const [first, ...rest] = issues;
  const urgent = issues.some((issue) => issue.urgent);
  const weight = issues.reduce((sum, issue) => sum + issue.weight, 0);
  const signature = issues.map((issue) => `${issue.kind}-${issue.subject}`).sort().join("+");
  return {
    key: `person:${employee.id}:${signature}`,
    source: "person",
    kind: `person:${first.kind}`,
    story: null,
    rank: (urgent ? RANK.personUrgent : RANK.person) + Math.min(weight, RANK_SPAN),
    tone: urgent ? "danger" : "warning",
    label: employee.nameTh,
    reason: first.label,
    detail: rest.length > 0 ? rest.map((issue) => issue.label).join(" · ") : employee.title,
    prompt: TH.landing.personPrompt(employee.nameTh),
    alertId: null,
    packetId: null,
    canFinish: true,
  };
}

/** HR answers for everyone; any other lead for the people who report to them directly. */
function isAccountableFor(access: AccessContext, employee: Employee, view: PeopleView | null): boolean {
  if (view === "hr") return true;
  return employee.managerId === access.userId;
}

function ownsOpening(access: AccessContext, managerId: string, directory: Directory): boolean {
  if (HR_TASK_ROLES.has(access.role)) return true;
  return managerId === access.userId || directory.byId(managerId)?.managerId === access.userId;
}

function openingItems(access: AccessContext, directory: Directory): FeedItem[] {
  return directory.openPositions.flatMap((position): FeedItem[] => {
    if (!ownsOpening(access, position.managerId, directory)) return [];
    const days = toDayIndex(TODAY) - toDayIndex(position.openedOn);
    if (days < LONG_OPEN_DAYS) return [];
    const manager = directory.byId(position.managerId)?.nameTh ?? null;
    return [{
      key: `opening:${position.id}`,
      source: "opening",
      kind: "opening",
      story: null,
      rank: RANK.opening + Math.min(days - LONG_OPEN_DAYS + RANK_OPENING_FLOOR, RANK_SPAN),
      tone: "warning",
      label: position.title,
      reason: T.openPosition(days),
      detail: manager && position.managerId !== access.userId ? TH.landing.hiringManager(manager) : null,
      prompt: TH.landing.openingPrompt(position.title),
      alertId: null,
      packetId: null,
      canFinish: true,
    }];
  });
}

/** The people matters a viewer is accountable for: a licence about to lapse, heavy overtime and (for HR) a high attrition risk, plus openings left unfilled too long. */
export async function peopleFeedFor(access: AccessContext): Promise<FeedItem[]> {
  const directory = directoryOf(await ports().directory.load());
  const people = directory.employees.flatMap((employee): FeedItem[] => {
    if (employee.id === access.userId) return [];
    const view = peopleViewOf(access, employee, directory);
    if (!view || view === "directory" || !isAccountableFor(access, employee, view)) return [];
    const issues = issuesOf(employee, signalsOf(employee), view);
    return issues.length > 0 ? [personItem(employee, issues)] : [];
  });
  return [...people, ...openingItems(access, directory)];
}

/** The people a viewer may see that match the query, lead first, shaped for their view. */
export async function findPeople(access: AccessContext, query: PeopleQuery) {
  const directory = directoryOf(await ports().directory.load());
  const dictionary = await loadDictionary();
  const visible = directory.employees.flatMap((employee) => {
    const view = peopleViewOf(access, employee, directory);
    return view && matches(employee, query, view, directory, dictionary) ? [{ employee, view }] : [];
  });
  const byLead = leadFirst(directory);
  const rows = visible
    .sort((left, right) => byLead(left.employee, right.employee))
    .slice(0, MAX_PEOPLE_ROWS)
    .map(({ employee, view }) => rowOf(access, employee, view, directory, dictionary));
  const openPositions = openPositionsFor(access, query, directory);
  const partial = visible.some(({ view }) => view === "directory");
  if (rows.length === 0) return { ok: true as const, summary: T.none, data: [], open_positions: openPositions };
  return {
    ok: true as const,
    summary: `${T.summary(visible.length, openPositions.length)}${partial ? ` · ${T.hiddenFields}` : ""}`,
    data: rows,
    open_positions: openPositions,
  };
}

/** The people working at one site that the viewer may see, lead first. */
export function peopleAtSite(access: AccessContext, siteId: string, directory: Directory, dictionary: Dictionary): PersonRow[] {
  return directory.employees.filter((employee) => employee.siteId === siteId)
    .sort(leadFirst(directory))
    .flatMap((employee) => {
      const view = peopleViewOf(access, employee, directory);
      return view ? [rowOf(access, employee, view, directory, dictionary)] : [];
    })
    .slice(0, MAX_PEOPLE_ROWS);
}

function timelineOf(history: CareerEvent[]) {
  return [...history]
    .sort((left, right) => right.date.localeCompare(left.date))
    .map((event) => ({ title: event.labelTh, detail: null, time: formatDateTh(event.date) }));
}

function certificatePairs(states: CertificateState[]) {
  return states.map((state) => ({ label: state.certificate.nameTh, value: T.certDetail(formatDateTh(state.certificate.expires), state.daysLeft) }));
}

function factsOf(access: AccessContext, employee: Employee, signals: PeopleSignals, view: PeopleView, directory: Directory, dictionary: Dictionary) {
  const facts: { label: string; value: string }[] = [
    { label: T.fact.department, value: departmentOf(employee, dictionary) },
    { label: T.fact.place, value: placeOf(employee, dictionary) },
    { label: T.fact.manager, value: managerName(employee, directory) ?? "-" },
  ];
  if (view === "directory") return facts;
  facts.push(
    { label: T.fact.tenure, value: tenureLabel(signals.tenureDays) },
    { label: T.fact.hiredOn, value: formatDateTh(employee.hiredOn) },
    { label: T.fact.overtime, value: T.hours(employee.overtimeHours3m) },
  );
  if (view === "hr") facts.push({ label: T.fact.age, value: T.ageValue(signals.age) });
  if (canSeeSalary(access)) facts.push({ label: T.fact.salary, value: formatCurrency(employee.salaryThb) });
  return facts;
}

function resolvePerson(access: AccessContext, id: string | null, name: string | null, directory: Directory) {
  const byId = id ? directory.byId(id) : null;
  if (byId) return peopleViewOf(access, byId, directory) ? { ok: true as const, employee: byId } : { ok: false as const, error: T.notFound(id ?? "") };
  const needle = (name ?? id ?? "").trim();
  const found = directory.employees.filter((employee) => peopleViewOf(access, employee, directory) && needle.length > 0 && employee.nameTh.includes(needle));
  if (found.length === 1 && found[0]) return { ok: true as const, employee: found[0] };
  if (found.length === 0) return { ok: false as const, error: T.notFound(needle) };
  return { ok: false as const, error: T.ambiguous(needle, found.length), candidates: found.map((employee) => ({ id: employee.id, name: employee.nameTh, title: employee.title })) };
}

/** One employee's profile, shaped for the viewer: directory fields for everyone, career and certificates for the team, risk and pay for HR. */
export async function personProfile(access: AccessContext, id: string | null, name: string | null) {
  const directory = directoryOf(await ports().directory.load());
  const resolved = resolvePerson(access, id, name, directory);
  if (!resolved.ok) return resolved;
  const employee = resolved.employee;
  const view = peopleViewOf(access, employee, directory) ?? "directory";
  const signals = signalsOf(employee);
  const reports = directory.employees.filter((candidate) => candidate.managerId === employee.id && peopleViewOf(access, candidate, directory));
  const detailed = view !== "directory";
  return {
    ok: true as const,
    summary: `${employee.nameTh} — ${employee.title}${detailed ? "" : ` · ${T.hiddenFields}`}`,
    data: {
      id: employee.id,
      name: employee.nameTh,
      title: employee.title,
      photo: employee.photo,
      badges: badgesFor(employee, signals, view),
      facts: factsOf(access, employee, signals, view, directory, await loadDictionary()),
      history: detailed ? timelineOf(employee.history) : [],
      certificates: detailed ? certificatePairs(signals.certificates) : [],
      risk_reasons: view === "hr" ? signals.riskReasons : [],
      reports: reports.map((report) => ({ id: report.id, name: report.nameTh, title: report.title, photo: report.photo })),
    },
  };
}
