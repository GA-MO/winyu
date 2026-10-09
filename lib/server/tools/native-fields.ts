import type { RoleId } from "@/lib/contracts";
import type { Visibility } from "@/lib/access/role-overrides";
import type { ConnectorField } from "@/lib/server/connectors/types";

function fieldOf(connector: string, field: string, labelTh: string, full: readonly RoleId[], masked: readonly RoleId[]): ConnectorField {
  const defaultFor = (role: RoleId): Visibility => (full.includes(role) ? "full" : masked.includes(role) ? "masked" : "none");
  return { key: `${connector}.${field}`, connector, field, labelTh, ownerField: null, defaultFor };
}

/** A course's exam score in the LMS's training history: in full for the CEO and HR, masked for sales managers, hidden from everyone else unless the admin widens it. */
export const TRAINING_SCORE_FIELD = fieldOf("lms", "score", "คะแนนสอบของหลักสูตร", ["ceo", "hr_manager"], ["sales_director", "sales_rsm"]);

/** The order taken on a store visit in the CRM: in full for sales leadership, masked for reps, hidden from everyone else unless the admin widens it. */
export const ORDER_VALUE_FIELD = fieldOf("crm", "order_value", "ยอดสั่งซื้อจากการเยี่ยมร้าน", ["ceo", "sales_director", "sales_rsm"], ["sales_rep"]);

/** The fields of native tools that only some roles see in full, overridable per role in the admin like a connector's. */
export const NATIVE_FIELDS: readonly ConnectorField[] = [TRAINING_SCORE_FIELD, ORDER_VALUE_FIELD];
