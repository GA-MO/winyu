export const LOGISTICS_PARTNER_PORT = 3297;

const LOCAL_TOKEN = "logistics-partner-demo-local-only";

/** Where the logistics partner's A2A agent card is and the bearer token Winyu presents to it; both from env, with a local default for the demo only. */
export function logisticsPartnerEnv() {
  return {
    cardUrl: process.env.WINYU_A2A_PARTNER_URL ?? `http://127.0.0.1:${LOGISTICS_PARTNER_PORT}/.well-known/agent-card.json`,
    token: process.env.WINYU_A2A_PARTNER_TOKEN ?? LOCAL_TOKEN,
  };
}
