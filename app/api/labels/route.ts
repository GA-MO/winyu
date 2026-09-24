import { badRequest, requireAccess, unauthenticated } from "../_guard";
import { DIMS, type Dim } from "@/lib/contracts";
import { loadDictionary } from "@/lib/server/master-data";

const MAX_VALUES = 24;
const SEPARATOR = ":";

function parse(value: string): { dim: Dim; id: string } | null {
  const at = value.indexOf(SEPARATOR);
  if (at <= 0) return null;
  const dim = value.slice(0, at) as Dim;
  const id = value.slice(at + 1);
  return DIMS.includes(dim) && id ? { dim, id } : null;
}

/** Thai names for dimension ids (`?v=region:northeast&v=agent:ag_ne_01`), so a client card never carries the master data itself. */
export async function GET(req: Request) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const values = new URL(req.url).searchParams.getAll("v").slice(0, MAX_VALUES);
  if (values.length === 0) return badRequest();
  const dictionary = await loadDictionary();
  const labels: Record<string, string> = {};
  for (const value of values) {
    const parsed = parse(value);
    if (parsed) labels[value] = dictionary.displayLabel(parsed.dim, parsed.id);
  }
  return Response.json({ labels });
}
