import type { AccessContext, Employee, FeedItem, NextAction, RoleId } from "@/lib/contracts";
import { peopleViewOf, type PeopleView } from "@/lib/access/people-scope";
import { TODAY, toDayIndex } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { signalsOf, type PeopleSignals } from "@/lib/engine/people-signals";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { renewalRoundFor, type RenewalRound } from "@/lib/server/courses";
import { ports } from "@/lib/server/ports";
import { directoryOf, type Directory } from "@/lib/server/ports/directory";

const HR_TASK_ROLES: ReadonlySet<RoleId> = new Set<RoleId>(["hr_manager"]);
const CERT_DUE_DAYS = 30;
const CERT_URGENT_DAYS = 14;
const LONG_OPEN_DAYS = 60;
const WEIGHT = { certExpired: 100, certDue: 80, riskHigh: 50, overtime: 40 } as const;
const RANK = { personUrgent: 700, person: 400, opening: 400 } as const;
const RANK_SPAN = 99;
const RANK_OPENING_FLOOR = 50;

const T = TH.people;
const F = TH.feed;

type Issue = { kind: "cert" | "risk" | "overtime"; subject: string; certificate: string | null; daysLeft: number; label: string; weight: number; urgent: boolean };

async function enrolledToRenew(employee: Employee, certificate: string): Promise<boolean> {
  if (!findUser(employee.id)) return false;
  return (await renewalRoundFor(certificate, employee.id))?.enrolled ?? false;
}

/** What is at stake for one employee, heaviest first; a licence the holder has already booked a renewal round for is no longer at stake. */
async function issuesOf(employee: Employee, signals: PeopleSignals, view: PeopleView): Promise<Issue[]> {
  const issues: Issue[] = [];
  for (const state of signals.certificates) {
    if (state.status === "valid" || state.daysLeft > CERT_DUE_DAYS) continue;
    if (await enrolledToRenew(employee, state.certificate.nameTh)) continue;
    const name = T.certShort[state.certificate.nameTh] ?? state.certificate.nameTh;
    const expired = state.status === "expired";
    issues.push({
      kind: "cert",
      subject: name,
      certificate: state.certificate.nameTh,
      daysLeft: state.daysLeft,
      label: expired ? T.badge.certExpired(name) : T.badge.certExpiring(name, state.daysLeft),
      weight: expired ? WEIGHT.certExpired : WEIGHT.certDue - state.daysLeft,
      urgent: expired || state.daysLeft <= CERT_URGENT_DAYS,
    });
  }
  if (view === "hr" && signals.risk === "high") issues.push({ kind: "risk", subject: "risk", certificate: null, daysLeft: 0, label: T.badge.riskHigh, weight: WEIGHT.riskHigh, urgent: false });
  if (signals.highOvertime) issues.push({ kind: "overtime", subject: "overtime", certificate: null, daysLeft: 0, label: T.badge.overtime(employee.overtimeHours3m), weight: WEIGHT.overtime, urgent: false });
  return issues.sort((left, right) => right.weight - left.weight);
}

/** Who a matter about this employee goes to: their manager when the manager uses Cop and is not the viewer, else the employee when they use Cop. */
function recipientOf(access: AccessContext, employee: Employee, directory: Directory): Employee | null {
  const manager = employee.managerId ? directory.byId(employee.managerId) : null;
  if (manager && manager.id !== access.userId && findUser(manager.id)) return manager;
  return findUser(employee.id) ? employee : null;
}

function handoffOf(employee: Employee, issue: Issue, signals: PeopleSignals, to: Employee, round: RenewalRound | null): NextAction {
  const course = round ? F.roundOf(round.course.titleTh, formatDateTh(round.course.starts)) : null;
  const ask =
    issue.kind === "cert" ? F.certAsk(employee.nameTh, issue.subject, issue.daysLeft, course)
    : issue.kind === "risk" ? F.careerAsk(employee.nameTh, signals.riskReasons.join(", "))
    : F.overtimeAsk(employee.nameTh, employee.overtimeHours3m);
  const title = issue.kind === "cert" ? F.certTitle(employee.nameTh, issue.subject) : issue.kind === "risk" ? F.careerTitle(employee.nameTh) : F.overtimeTitle(employee.nameTh);
  return {
    id: `feed-handoff-${employee.id}-${issue.kind}`,
    kind: "handoff",
    label: to.id === employee.id ? F.notify(to.nameTh) : F.sendTo(to.nameTh),
    reason: F.sendReason,
    tool: "create_handoff",
    input: { toUserId: to.id, title, ask, urgency: issue.urgent ? "high" : "medium", evidence: [], alertIds: [] },
    prompt: null,
  };
}

async function personItem(access: AccessContext, employee: Employee, issues: Issue[], signals: PeopleSignals, directory: Directory): Promise<FeedItem> {
  const [first, ...rest] = issues;
  const urgent = issues.some((issue) => issue.urgent);
  const weight = issues.reduce((sum, issue) => sum + issue.weight, 0);
  const signature = issues.map((issue) => `${issue.kind}-${issue.subject}`).sort().join("+");
  const to = recipientOf(access, employee, directory);
  const round = first.certificate ? await renewalRoundFor(first.certificate, employee.id) : null;
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
    actions: to ? [handoffOf(employee, first, signals, to, round)] : [],
    because: null,
  };
}

/** The viewer's own licence about to lapse, with the renewal round to book when there is one with seats. */
async function ownItems(self: Employee): Promise<FeedItem[]> {
  const items: FeedItem[] = [];
  for (const state of signalsOf(self).certificates) {
    if (state.status === "valid" || state.daysLeft > CERT_DUE_DAYS) continue;
    const round = await renewalRoundFor(state.certificate.nameTh, self.id);
    if (round?.enrolled) continue;
    const name = T.certShort[state.certificate.nameTh] ?? state.certificate.nameTh;
    const urgent = state.status === "expired" || state.daysLeft <= CERT_URGENT_DAYS;
    const bookable = round && round.seatsLeft > 0 ? round : null;
    items.push({
      key: `own:${self.id}:cert-${name}`,
      source: "person",
      kind: "own:cert",
      story: null,
      rank: (urgent ? RANK.personUrgent : RANK.person) + RANK_SPAN,
      tone: urgent ? "danger" : "warning",
      label: F.yours(name),
      reason: state.status === "expired" ? F.expired : F.daysLeft(state.daysLeft),
      detail: round ? F.roundOf(round.course.titleTh, formatDateTh(round.course.starts)) : F.noRound,
      prompt: F.renewPrompt(name),
      alertId: null,
      packetId: null,
      canFinish: true,
      actions: bookable
        ? [{ id: `feed-enroll-${bookable.course.id}`, kind: "enroll", label: F.enroll, reason: F.enrollReason, tool: "enroll_course", input: { courseId: bookable.course.id }, prompt: null }]
        : [],
      because: null,
    });
  }
  return items;
}

/** HR answers for everyone; any other lead for the people who report to them directly. */
function isAccountableFor(access: AccessContext, employee: Employee, view: PeopleView): boolean {
  return view === "hr" || employee.managerId === access.userId;
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
      actions: [],
      because: null,
    }];
  });
}

/** The people matters a viewer is accountable for: their own licence, their people's licences and overtime (and for HR attrition risk), and openings left unfilled too long. */
export async function peopleFeedFor(access: AccessContext): Promise<FeedItem[]> {
  const directory = directoryOf(await ports().directory.load());
  const items: FeedItem[] = [];
  for (const employee of directory.employees) {
    if (employee.id === access.userId) {
      items.push(...(await ownItems(employee)));
      continue;
    }
    const view = peopleViewOf(access, employee, directory);
    if (!view || view === "directory" || !isAccountableFor(access, employee, view)) continue;
    const signals = signalsOf(employee);
    const issues = await issuesOf(employee, signals, view);
    if (issues.length > 0) items.push(await personItem(access, employee, issues, signals, directory));
  }
  return [...items, ...openingItems(access, directory)];
}
