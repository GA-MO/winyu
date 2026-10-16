import { TH } from "@/lib/i18n/th";

const OPENERS = TH.login.demoPath.openers;

/** The seats a presenter signs in as, in demo order, each with the first question to type. */
export const DEMO_PATH: readonly { userId: string; opener: string }[] = [
  { userId: "u_thana", opener: OPENERS.ceo },
  { userId: "u_anucha", opener: OPENERS.rsmNortheast },
  { userId: "u_krit", opener: OPENERS.repKhonKaen },
  { userId: "u_ton", opener: OPENERS.itAdmin },
];
