import type { Spec } from "vexa/protocol";

function applyPatch(spec: Record<string, unknown>, patch: { op?: string; path?: string; value?: unknown }) {
  if (patch.op !== "add" && patch.op !== "replace") return;
  const segments = String(patch.path ?? "").split("/").filter(Boolean);
  if (segments.length === 0) return;
  let cursor = spec;
  for (const segment of segments.slice(0, -1)) {
    if (typeof cursor[segment] !== "object" || cursor[segment] === null) cursor[segment] = {};
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = patch.value;
}

/** The spec a reply streamed, rebuilt from its `data-spec` patch parts; null when the reply drew no card. */
export function specOf(parts: readonly Record<string, unknown>[]): Spec | null {
  const spec: Record<string, unknown> = {};
  let seen = false;
  for (const part of parts) {
    if (part.type !== "data-spec") continue;
    const data = part.data as { type?: string; patch?: { op?: string; path?: string; value?: unknown } };
    if (data?.type !== "patch" || !data.patch) continue;
    applyPatch(spec, data.patch);
    seen = true;
  }
  return seen ? (spec as unknown as Spec) : null;
}
