import { responsibleFor } from "@/lib/access/raci";
import type { DraftStory, Story } from "@/lib/contracts";

/** Who owns a story's subject in the RACI table, so a viewer who is not the owner sees who is on it; urgency stays the business's, not the viewer's. A national subject has an owner only when a national role holds it. */
export function withOwner(draft: DraftStory, viewerId: string, id: string): Story {
  const responsible = draft.subject.metric ? responsibleFor(draft.subject.metric, draft.subject.region) : null;
  const nationalWithoutNationalOwner = draft.subject.region === null && responsible?.user.region !== null;
  if (!responsible || responsible.userId === viewerId || nationalWithoutNationalOwner) return { ...draft, id, owner: null };
  const owner = { userId: responsible.userId, nameTh: responsible.user.nameTh, title: responsible.user.title };
  return { ...draft, id, owner };
}
