import type { AccessContext, CareerEvent, Employee, PeopleFlag, Region } from "@/lib/contracts";
import { canSeeSalary, peopleViewOf, type PeopleView } from "@/lib/access/people-scope";
import { departmentById } from "@/lib/data/entities/hr";
import { provinceById, REGION_LABELS_TH } from "@/lib/data/entities/org";
import { PLANTS } from "@/lib/data/entities/supply";
import { TODAY, toDayIndex } from "@/lib/data/dates";
import { signalsOf, tenureLabel, type CertificateState, type PeopleSignals } from "@/lib/engine/people-signals";
import { formatCurrency, formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { ports } from "@/lib/server/ports";
import { directoryOf, type Directory } from "@/lib/server/ports/directory";

const MAX_PEOPLE_ROWS = 12;

type BadgeTone = "neutral" | "success" | "warning" | "danger";
export type PersonBadge = { label: string; tone: BadgeTone };
export type PersonRow = { is_you?: true; id: string; name: string; title: string; place: string; photo: string; department: string; manager: string | null; tenure: string | null; badges: PersonBadge[] };
export type PeopleQuery = { region: Region | null; departmentId: string | null; manager: string | null; query: string | null; flag: PeopleFlag | null };

const T = TH.people;

function placeOf(employee: Employee): string {
  const site = employee.siteId ? PLANTS.find((plant) => plant.id === employee.siteId)?.nameTh : null;
  if (site) return site;
  const province = employee.provinceId ? provinceById(employee.provinceId)?.nameTh : null;
  if (province) return province;
  return employee.region ? REGION_LABELS_TH[employee.region] : T.headOffice;
}

function departmentOf(employee: Employee): string {
  return departmentById(employee.departmentId)?.nameTh ?? employee.departmentId;
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

function rowOf(access: AccessContext, employee: Employee, view: PeopleView, directory: Directory): PersonRow {
  const signals = signalsOf(employee);
  return {
    ...(employee.id === access.userId ? { is_you: true } : {}),
    id: employee.id,
    name: employee.nameTh,
    title: employee.title,
    place: placeOf(employee),
    photo: employee.photo,
    department: departmentOf(employee),
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

function matchesText(employee: Employee, query: string): boolean {
  const needle = query.trim();
  return employee.nameTh.includes(needle) || employee.title.includes(needle) || placeOf(employee).includes(needle);
}

function matchesFlag(signals: PeopleSignals, flag: PeopleFlag, view: PeopleView): boolean {
  if (view === "directory") return false;
  if (flag === "new") return signals.newHire;
  if (flag === "overtime") return signals.highOvertime;
  if (flag === "retiring") return signals.yearsToRetirement !== null;
  if (flag === "cert_expiring") return signals.certificates.some((state) => state.status !== "valid");
  return view === "hr" && signals.risk !== null;
}

function matches(employee: Employee, query: PeopleQuery, view: PeopleView, directory: Directory): boolean {
  if (query.region && employee.region !== query.region) return false;
  if (query.departmentId && employee.departmentId !== query.departmentId) return false;
  if (query.manager && !matchesManager(employee, query.manager, directory)) return false;
  if (query.query && !matchesText(employee, query.query)) return false;
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

/** The people a viewer may see that match the query, lead first, shaped for their view. */
export async function findPeople(access: AccessContext, query: PeopleQuery) {
  const directory = directoryOf(await ports().directory.load());
  const visible = directory.employees.flatMap((employee) => {
    const view = peopleViewOf(access, employee, directory);
    return view && matches(employee, query, view, directory) ? [{ employee, view }] : [];
  });
  const byLead = leadFirst(directory);
  const rows = visible
    .sort((left, right) => byLead(left.employee, right.employee))
    .slice(0, MAX_PEOPLE_ROWS)
    .map(({ employee, view }) => rowOf(access, employee, view, directory));
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
export function peopleAtSite(access: AccessContext, siteId: string, directory: Directory): PersonRow[] {
  return directory.employees.filter((employee) => employee.siteId === siteId)
    .sort(leadFirst(directory))
    .flatMap((employee) => {
      const view = peopleViewOf(access, employee, directory);
      return view ? [rowOf(access, employee, view, directory)] : [];
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

function factsOf(access: AccessContext, employee: Employee, signals: PeopleSignals, view: PeopleView, directory: Directory) {
  const facts: { label: string; value: string }[] = [
    { label: T.fact.department, value: departmentOf(employee) },
    { label: T.fact.place, value: placeOf(employee) },
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
      facts: factsOf(access, employee, signals, view, directory),
      history: detailed ? timelineOf(employee.history) : [],
      certificates: detailed ? certificatePairs(signals.certificates) : [],
      risk_reasons: view === "hr" ? signals.riskReasons : [],
      reports: reports.map((report) => ({ id: report.id, name: report.nameTh, title: report.title, photo: report.photo })),
    },
  };
}
