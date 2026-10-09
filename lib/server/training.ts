import type { AccessContext, Employee, TrainingRecord } from "@/lib/contracts";
import { peopleViewOf } from "@/lib/access/people-scope";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { fencedRows, maskedRows, MAX_CONNECTOR_ROWS } from "./connectors/output";
import type { ConnectorRow } from "./connectors/types";
import { ports } from "./ports";
import { directoryOf, type Directory } from "./ports/directory";
import { TRAINING_SCORE_FIELD } from "./tools/native-fields";

const T = TH.admin.tools.training_history;
const VIEWS_WITH_TRAINING = new Set(["team", "hr"]);

export type TrainingQuery = { employeeId: string | null; name: string | null };

function asked(query: TrainingQuery, viewerId: string, directory: Directory): Employee[] {
  return directory.employees.filter((employee) => {
    if (query.employeeId) return employee.id === query.employeeId;
    if (query.name) return employee.nameTh.includes(query.name);
    return employee.id === viewerId || employee.managerId === viewerId;
  });
}

function rowOf(record: TrainingRecord, employee: Employee): ConnectorRow {
  const course = record.kind === "course";
  return {
    employee_id: employee.id,
    employee_name: employee.nameTh,
    region: employee.region,
    kind_label: course ? "อบรม" : "ใบรับรอง",
    course: record.title,
    date: record.date,
    date_label: record.date ? formatDateTh(record.date) : null,
    expires_label: record.expires ? `หมดอายุ ${formatDateTh(record.expires)}` : null,
    score: record.score,
    score_label: record.score === null ? null : `${record.score} คะแนน`,
  };
}

/** The LMS's training rows of these people, in the shape the training card draws; unscoped, for the tool below and for tests that stand in for an LMS. */
export async function trainingRowsOf(employees: readonly Employee[]): Promise<ConnectorRow[]> {
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  const records = await ports().learning.trainingHistory([...byId.keys()]);
  return records.flatMap((record) => {
    const employee = byId.get(record.employeeId);
    return employee ? [rowOf(record, employee)] : [];
  });
}

/** Courses a person finished and certificates they hold, from the LMS: one person by id or name, or the viewer and the people reporting to them; only people the viewer sees as their own line or as HR, the exam score shown by role. */
export async function trainingHistoryFor(access: AccessContext, query: TrainingQuery) {
  const directory = directoryOf(await ports().directory.load());
  const wanted = asked(query, access.userId, directory);
  const visible = wanted.filter((employee) => VIEWS_WITH_TRAINING.has(peopleViewOf(access, employee, directory) ?? ""));
  if (wanted.length > 0 && visible.length === 0) return { ok: false as const, code: "PERMISSION_DENIED" as const, error: TH.admin.connectors.outOfScope(T.label) };
  const rows = await trainingRowsOf(visible);
  if (rows.length === 0) return { ok: true as const, summary: TH.admin.connectors.noneInScope(T.label), code: "NONE_IN_SCOPE" as const, rows: [], provenance: { sourceSystem: TH.cards.failed.systems.learning, asOf: new Date().toISOString(), masked: [] } };
  const shown = maskedRows(rows, [TRAINING_SCORE_FIELD], access);
  const summary = rows.length > MAX_CONNECTOR_ROWS ? TH.admin.connectors.rowsCapped(T.label, MAX_CONNECTOR_ROWS, rows.length) : TH.admin.connectors.rows(T.label, rows.length);
  return { ok: true as const, summary, rows: fencedRows(shown.rows.slice(0, MAX_CONNECTOR_ROWS)), provenance: { sourceSystem: TH.cards.failed.systems.learning, asOf: new Date().toISOString(), masked: shown.masked } };
}
