export const LMS_DEMO_ID = "lms_demo";
export const LMS_DEMO_PORT = 3299;
export const LMS_DEMO_TOOL = "training_history";

/** Where the demo LMS listens and the secret Winyu signs identities with; both from env, with a local default for the demo only. */
export function lmsDemoEnv() {
  return {
    url: process.env.MASCOP_LMS_DEMO_URL ?? `http://127.0.0.1:${LMS_DEMO_PORT}/mcp`,
    secret: process.env.MASCOP_LMS_DEMO_SECRET ?? "mascop-lms-demo-local-only",
  };
}
