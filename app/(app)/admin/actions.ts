"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { METRIC_IDS, ROLE_IDS, type MetricId, type RoleId, type ToolName } from "@/lib/contracts";
import { connectorFields, connectors, isToolName } from "@/lib/server/tools/registry";
import { killTool, reviveTool, setConnectorEnabled, setHandoffEnabled } from "@/lib/access/enforce";
import {
  cycleFieldVisibility,
  cycleMetricVisibility,
  removeOverride,
  resetOverridesOf,
  resetRoleOverrides,
  setFieldVisibility,
  setMetricVisibility,
  setRoleTool,
  type Visibility,
} from "@/lib/access/role-overrides";
import { readUser } from "@/lib/server/session";

const ADMIN_PATH = "/admin";
const VISIBILITIES: readonly Visibility[] = ["full", "masked", "none"];

async function adminId(): Promise<string | null> {
  const user = readUser(await cookies());
  return user && user.role === "it_admin" ? user.id : null;
}

function roleIn(formData: FormData): RoleId | null {
  const role = String(formData.get("role"));
  return ROLE_IDS.includes(role as RoleId) ? (role as RoleId) : null;
}

function metricIn(formData: FormData): MetricId | null {
  const metric = String(formData.get("metric"));
  return METRIC_IDS.includes(metric as MetricId) ? (metric as MetricId) : null;
}

function toolIn(formData: FormData): ToolName | null {
  const tool = String(formData.get("tool"));
  return isToolName(tool) ? tool : null;
}

function fieldIn(formData: FormData): string | null {
  const key = String(formData.get("field"));
  return connectorFields().some((field) => field.key === key) ? key : null;
}

function connectorIn(formData: FormData): string | null {
  const id = String(formData.get("connector"));
  return connectors().some((connector) => connector.id === id) ? id : null;
}

export async function setMetricAction(formData: FormData) {
  const by = await adminId();
  const role = roleIn(formData);
  const metric = metricIn(formData);
  const visibility = String(formData.get("visibility")) as Visibility;
  if (!by || !role || !metric || !VISIBILITIES.includes(visibility)) return;
  setMetricVisibility(role, metric, visibility, by);
  revalidatePath(ADMIN_PATH);
}

export async function cycleMetricAction(formData: FormData) {
  const by = await adminId();
  const role = roleIn(formData);
  const metric = metricIn(formData);
  if (!by || !role || !metric) return;
  cycleMetricVisibility(role, metric, by);
  revalidatePath(ADMIN_PATH);
}

export async function setRoleToolAction(formData: FormData) {
  const by = await adminId();
  const role = roleIn(formData);
  const tool = toolIn(formData);
  if (!by || !role || !tool) return;
  setRoleTool(role, tool, String(formData.get("allowed")) === "true", by);
  revalidatePath(ADMIN_PATH);
}

export async function resetRoleAction(formData: FormData) {
  const role = roleIn(formData);
  if (!(await adminId()) || !role) return;
  resetOverridesOf(role);
  revalidatePath(ADMIN_PATH);
}

export async function resetAllAction() {
  if (!(await adminId())) return;
  resetRoleOverrides();
  revalidatePath(ADMIN_PATH);
}

export async function setToolKilledAction(formData: FormData) {
  const by = await adminId();
  const tool = toolIn(formData);
  if (!by || !tool) return;
  if (String(formData.get("killed")) === "true") killTool(tool, by);
  else reviveTool(tool);
  revalidatePath(ADMIN_PATH);
}

export async function setHandoffAction(formData: FormData) {
  const by = await adminId();
  if (!by) return;
  setHandoffEnabled(String(formData.get("enabled")) === "true", by);
  revalidatePath(ADMIN_PATH);
}

export async function setFieldAction(formData: FormData) {
  const by = await adminId();
  const role = roleIn(formData);
  const field = fieldIn(formData);
  const visibility = String(formData.get("visibility")) as Visibility;
  if (!by || !role || !field || !VISIBILITIES.includes(visibility)) return;
  setFieldVisibility(role, field, visibility, by);
  revalidatePath(ADMIN_PATH);
}

export async function cycleFieldAction(formData: FormData) {
  const by = await adminId();
  const role = roleIn(formData);
  const field = fieldIn(formData);
  if (!by || !role || !field) return;
  cycleFieldVisibility(role, field, by);
  revalidatePath(ADMIN_PATH);
}

export async function setConnectorAction(formData: FormData) {
  const by = await adminId();
  const connector = connectorIn(formData);
  if (!by || !connector) return;
  setConnectorEnabled(connector, String(formData.get("enabled")) === "true", by);
  revalidatePath(ADMIN_PATH);
}

export async function removeOverrideAction(formData: FormData) {
  const id = String(formData.get("override"));
  if (!(await adminId()) || !id) return;
  removeOverride(id);
  revalidatePath(ADMIN_PATH);
}
