import { DEMO_ROLES, stepsOf, type DemoRole } from "../home/hero-demo";
import { createSequence, easeIn, type ActiveBeat } from "./sequence";

const INTRO_S = 6;
const ROLE_S = 15;
const GRID_S = 12;
const OUTRO_S = 8;
const CROSSFADE_S = 0.6;

const TYPE_START_S = 0.9;
const TYPE_CHAR_S = 0.055;
const STEP_GAP_S = 0.7;
const STEPS_LEAD_S = 0.5;
const CARD_RISE_S = 0.7;

export type SceneId = "intro" | "role" | "grid" | "outro";

export type ActiveScene = ActiveBeat<SceneId>;

/** The demo cut: intro, one scene per role, the 2×2 summary, outro. */
export const DEMO_SEQUENCE = createSequence<SceneId>(
  [
    { id: "intro", duration: INTRO_S },
    ...DEMO_ROLES.map((_, index) => ({ id: "role" as const, duration: ROLE_S, index })),
    { id: "grid", duration: GRID_S },
    { id: "outro", duration: OUTRO_S },
  ],
  CROSSFADE_S,
);

export type RolePhase = { typed: number; steps: number; query: number; card: number; caption: number; takeaway: number };

/** How far each part of a role scene has played at local time t. */
export function rolePhaseAt(role: DemoRole, t: number): RolePhase {
  const typeEnd = TYPE_START_S + role.question.length * TYPE_CHAR_S;
  const stepCount = stepsOf(role).length;
  const stepsStart = typeEnd + STEPS_LEAD_S;
  const steps = Math.min(stepCount, Math.max(0, Math.floor((t - stepsStart) / STEP_GAP_S) + 1));
  const cardAt = stepsStart + stepCount * STEP_GAP_S;
  return {
    typed: Math.min(role.question.length, Math.max(0, Math.floor((t - TYPE_START_S) / TYPE_CHAR_S))),
    steps: t < stepsStart ? 0 : steps,
    query: easeIn(t, stepsStart + STEP_GAP_S, 0.4),
    card: easeIn(t, cardAt, CARD_RISE_S),
    caption: easeIn(t, 0.2, 0.8),
    takeaway: easeIn(t, cardAt + 0.4, 0.8),
  };
}
