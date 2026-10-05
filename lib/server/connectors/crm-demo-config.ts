export const CRM_DEMO_ID = "crm_demo";
export const CRM_DEMO_PORT = 3298;
export const CRM_DEMO_TOOL = "store_visits";

/** Where the demo CRM listens and the secret Winyu signs identities with; both from env, with a local default for the demo only. */
export function crmDemoEnv() {
  return {
    url: process.env.MASCOP_CRM_DEMO_URL ?? `http://127.0.0.1:${CRM_DEMO_PORT}/api`,
    secret: process.env.MASCOP_CRM_DEMO_SECRET ?? "mascop-crm-demo-local-only",
  };
}
