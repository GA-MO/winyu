import type { AccessContext, Employee } from "@/lib/contracts";
import type { Directory } from "@/lib/server/ports/directory";

/** How much of one employee's record a viewer may read: directory < team < hr. */
export type PeopleView = "directory" | "team" | "hr";

const HR_ROLES: ReadonlySet<string> = new Set(["hr_manager"]);
const LEADERSHIP_ROLES: ReadonlySet<string> = new Set(["ceo"]);

function inRegionScope(access: AccessContext, employee: Employee): boolean {
  if (access.regions === "all") return true;
  if (employee.region === null) return true;
  return access.regions.includes(employee.region);
}

/** The view a viewer gets of one employee, or null when the employee is outside their scope. */
export function peopleViewOf(access: AccessContext, employee: Employee, directory: Directory): PeopleView | null {
  if (HR_ROLES.has(access.role)) return "hr";
  if (!inRegionScope(access, employee)) return null;
  if (employee.id === access.userId) return "team";
  if (LEADERSHIP_ROLES.has(access.role)) return "team";
  if (directory.reportsTo(employee, access.userId)) return "team";
  return "directory";
}

/** Whether the viewer may read pay: the same switch as the `avg_salary` metric, so the admin console governs both. */
export function canSeeSalary(access: AccessContext): boolean {
  return access.metricAcl.avg_salary === "full";
}

/** Whether the viewer may read the candidates for an opening: HR, the CEO, the hiring manager and anyone above them. */
export function canSeeCandidates(access: AccessContext, hiringManagerId: string, directory: Directory): boolean {
  if (HR_ROLES.has(access.role) || LEADERSHIP_ROLES.has(access.role)) return true;
  if (hiringManagerId === access.userId) return true;
  const manager = directory.byId(hiringManagerId);
  return manager !== null && directory.reportsTo(manager, access.userId);
}
