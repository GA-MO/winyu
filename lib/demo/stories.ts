import { TH } from "@/lib/i18n/th";

type StoryKey = keyof typeof TH.login.stories;

export type DemoStep = { userId: string; todo: string; destination: string };
export type DemoStory = { key: StoryKey; title: string; why: string; minutes: number; steps: DemoStep[] };

const CAST: Record<StoryKey, { minutes: number; userIds: string[]; landing?: string }> = {
  handoff: { minutes: 3, userIds: ["u_anucha", "u_krit"] },
  supply: { minutes: 4, userIds: ["u_ben", "u_wee"] },
  board: { minutes: 3, userIds: ["u_thana"] },
  governance: { minutes: 3, userIds: ["u_ton"], landing: "/admin" },
};

/** The user ids that appear in any demo story, in story order. */
export const STORY_CAST: readonly string[] = [...new Set(Object.values(CAST).flatMap((cast) => cast.userIds))];

function destinationFor(prompt: string | null, landing: string | undefined): string {
  if (prompt) return `/?draft=${encodeURIComponent(prompt)}`;
  return landing ?? "/";
}

/** The demo stories shown on the login page, each a short path through one or two personas. */
export const DEMO_STORIES: readonly DemoStory[] = (Object.keys(CAST) as StoryKey[]).map((key) => {
  const cast = CAST[key];
  const copy = TH.login.stories[key];
  return {
    key,
    title: copy.title,
    why: copy.why,
    minutes: cast.minutes,
    steps: copy.steps.map((step, index) => ({ userId: cast.userIds[index], todo: step.todo, destination: destinationFor(step.prompt, cast.landing) })),
  };
});
