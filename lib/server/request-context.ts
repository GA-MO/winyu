import { AsyncLocalStorage } from "node:async_hooks";
import type { AccessContext } from "@/lib/contracts";

const NO_ACCESS = "currentAccess() called outside runWithAccess()";

const storage = new AsyncLocalStorage<AccessContext>();

export function runWithAccess<T>(access: AccessContext, fn: () => T): T {
  return storage.run(access, fn);
}

/** The access context of the request being served; tools read it here, never from their input. */
export function currentAccess(): AccessContext {
  const access = storage.getStore();
  if (!access) throw new Error(NO_ACCESS);
  return access;
}
