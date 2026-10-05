import type { User } from "@/lib/contracts";
import type { Persona } from "@/lib/contracts/persona";
import { EMPLOYEES } from "@/lib/data/entities/people";

const PHOTO_BY_USER = new Map(EMPLOYEES.flatMap((employee) => (employee.userId ? [[employee.userId, employee.photo] as const] : [])));

/** The client-safe view of a user, with the portrait the HR record holds. */
export function personaOf(user: User): Persona {
  return { id: user.id, nameTh: user.nameTh, title: user.title, role: user.role, region: user.region, photo: PHOTO_BY_USER.get(user.id) ?? null };
}
