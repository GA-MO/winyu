import type { Employee, OpenPosition } from "@/lib/contracts";

export type DirectoryRecords = { employees: readonly Employee[]; openPositions: readonly OpenPosition[] };

/** The HR system of record: everyone employed and the positions still open. */
export type DirectoryPort = { load(): Promise<DirectoryRecords> };

/** One loaded directory with the lookups every people question needs. */
export type Directory = DirectoryRecords & {
  byId(id: string): Employee | null;
  managersOf(employee: Employee): Employee[];
  reportsTo(employee: Employee, managerId: string): boolean;
};

export function directoryOf(records: DirectoryRecords): Directory {
  const index = new Map(records.employees.map((employee) => [employee.id, employee]));
  const byId = (id: string) => index.get(id) ?? null;
  const managersOf = (employee: Employee) => {
    const chain: Employee[] = [];
    let next = employee.managerId ? byId(employee.managerId) : null;
    while (next && !chain.includes(next)) {
      chain.push(next);
      next = next.managerId ? byId(next.managerId) : null;
    }
    return chain;
  };
  const reportsTo = (employee: Employee, managerId: string) => managersOf(employee).some((manager) => manager.id === managerId);
  return { ...records, byId, managersOf, reportsTo };
}
