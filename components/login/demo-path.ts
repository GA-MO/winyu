import { TH } from "@/lib/i18n/th";

const CUES = TH.login.demoPath.cues;

/** The seats a presenter signs in as, in demo order, each with what the presenter does there. */
export const DEMO_PATH: readonly { userId: string; cue: string }[] = [
  { userId: "u_thana", cue: CUES.ceo },
  { userId: "u_anucha", cue: CUES.rsmNortheast },
  { userId: "u_krit", cue: CUES.repKhonKaen },
  { userId: "u_ton", cue: CUES.itAdmin },
];
