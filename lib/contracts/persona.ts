import type { User } from "./identity";

/** A persona as the client may see it: who they are and their portrait, nothing more from the HR record. */
export type Persona = Pick<User, "id" | "nameTh" | "title" | "role" | "region"> & { photo: string | null };
